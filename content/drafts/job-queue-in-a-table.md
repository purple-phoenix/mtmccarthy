---
title: "A Job Queue in a Table, and the Job Nobody Picked Up"
date: "2026-10-31"
category: "Software Engineering"
excerpt: "How I moved slow LLM generation out of the request path using nothing but a database table and a supervised worker process, and what I learned when that worker silently never started in production."
read_time: "8"
---

[Astrology Insights](https://myastrologyinsights.com), my astrology app, has a compatibility reading feature: you pick two people, the app computes both charts, finds the aspects between them, and asks an LLM to write a long reading about the pair. It is the slowest thing the app does: up to two chart computations plus a long model call.

For a long time that whole pipeline ran **inside the POST request**, then redirected to the finished report. That works until it doesn't: the web server has a 120 second request timeout, people click away, and a recycled web worker takes the in-flight reading down with it.

This post covers how I moved that work into a durable background job with no new infrastructure, and the incident about ten weeks later that exposed the failure mode I hadn't designed for.

## The Constraints

I wanted the POST to return immediately and the reading to finish no matter what the browser did, with these constraints:

- **No new services.** No Redis, no broker, no second hosted service. The app runs as one web service with one Postgres database.
- **No duplicate work.** Two browser tabs submitting the same pair, or two web worker processes handling those submissions, must produce exactly one generation, one quota charge, and one notification.
- **Crash safety.** If the process dies mid-generation, the job should be retried, and eventually reach a visible final state.
- **Never persist a blank reading.** A failed model call must not get cached as a "completed" report.

That rules out a daemon thread or an in-process queue: both lose the job if the process goes away.

## The Design: The Report Row Is the Job

Instead of a separate jobs table, the report row itself carries the job state. A pending report has a handful of extra columns:

```python
active_claim_key = db.Column(db.String(320), unique=True, nullable=True)
generation_payload = db.Column(db.Text, nullable=True)
generation_attempts = db.Column(db.Integer, nullable=False, default=0)
generation_next_attempt_at = db.Column(db.DateTime, nullable=True)
generation_lease_token = db.Column(db.String(36), nullable=True)
generation_lease_expires_at = db.Column(db.DateTime, nullable=True)
generation_last_error = db.Column(db.String(100), nullable=True)
# ... generation_completed_at, refresh_of_report_id ...
```

`generation_payload` is a JSON snapshot of every input the worker needs. The interesting column is `active_claim_key`.

### A unique, nullable claim key

The claim key is the user's id plus a hash of the request's identity: both people's normalized names and birth details, the relationship label, and the enrichment recipe version. It is **unique but nullable**. While a report is in flight it holds the key; when the report reaches ready or failed, the key is set back to `NULL`.

That gives me two properties at once. The database itself refuses a second in-flight job for the same request, no matter how many processes race. And because `NULL` values don't collide, a finished report releases the key so a later refresh can create a new historical report instead of overwriting the old one.

The enqueue path leans on that constraint directly:

```python
report = SynastryReport(
    user_id=db_user.id,
    status='pending',
    pair_key=pair_key,
    active_claim_key=active_claim_key,
    generation_payload=_synastry_job_payload(person1_chart, p2),
    generation_next_attempt_at=now,
    # ... names, chart ids, birth-detail snapshots, label ...
)
db.session.add(report)
try:
    db.session.commit()
    return report
except IntegrityError:
    # Another database worker won the unique active-claim insert. Its
    # commit is visible before our unique violation is raised; reuse
    # that report instead of creating a second generation.
    db.session.rollback()
    winner = SynastryReport.query.filter_by(
        active_claim_key=active_claim_key, status='pending').first()
    if winner is not None:
        return winner
    raise
```

Before that insert, the function also looks for a recent pending or ready report for the same pair and reuses it: a fresh pending row always wins, and a ready one is reused for 30 minutes unless the user explicitly asked for a fresh one. The unique key is the backstop for when two requests both pass that check at the same moment.

### Claiming with a conditional update

The worker is a Flask CLI command, `run-synastry-worker`, that sleeps two seconds between polls when the queue is empty. Claiming a job is a **compare-and-set**: an `UPDATE` whose `WHERE` clause repeats every eligibility condition, so only one claimer can win.

```python
claimed = SynastryReport.query.filter(
    SynastryReport.id == candidate_id,
    SynastryReport.status == 'pending',
    SynastryReport.active_claim_key.isnot(None),
    SynastryReport.generation_attempts < SYNASTRY_JOB_MAX_ATTEMPTS,
    or_(SynastryReport.generation_next_attempt_at.is_(None),
        SynastryReport.generation_next_attempt_at <= now),
    or_(SynastryReport.generation_lease_expires_at.is_(None),
        SynastryReport.generation_lease_expires_at <= now),
).update({
    SynastryReport.generation_attempts:
        SynastryReport.generation_attempts + 1,
    SynastryReport.generation_lease_token: token,
    SynastryReport.generation_lease_expires_at:
        now + timedelta(seconds=SYNASTRY_JOB_LEASE_SECONDS),
    SynastryReport.generation_next_attempt_at: None,
    SynastryReport.generation_last_error: None,
}, synchronize_session=False)
db.session.commit()
if claimed == 1:
    return candidate_id, token
```

A few details matter here:

- **Attempts are counted at claim time.** If a worker dies without cleaning up, that attempt still counts. Three claims and the job is done, one way or another.
- **Waiting in the queue costs nothing.** Only a claim increments the counter.
- **The lease is a fresh UUID.** Every later write checks it, so a worker that lost its lease can't finalize the job.

### Running the job in a killable child

The worker doesn't run the generation itself. It shells out to a second CLI command, `process-synastry-job`, with a 180 second timeout. A hung model call becomes a `TimeoutExpired`, which reschedules the job instead of wedging the worker. The lease is 240 seconds, longer than that timeout, so in the normal case a lease shouldn't lapse while its child is still running.

Failures go back in the queue with a short backoff (5 seconds, then 30), and the third failure dead-letters the row. Errors the code knows retrying can't fix, like the source chart having been deleted, go straight to failed.

On success, the final write happens under a row lock and re-checks that the lease token still matches. The report text, the quota charge, the LLM response log, the "your reading is ready" notification, and the release of the claim key all go in **one commit**. Nothing is half-done.

Here is the whole lifecycle:

```
POST /synastry
    |
    v
enqueue_synastry_report ---- same pair pending/ready? ----> reuse that row
    |
    | insert: status=pending, active_claim_key set
    v
[pending, claimable] ---- claim: attempts+1, 240s lease ----> [pending, leased]
    ^                                                              |
    |                                                  child process, 180s timeout
    |                                                              |
    +------ failure, attempts < 3: retry in 5s / 30s --------------+
                                                                   |
           success: report + quota + log + notification, one commit
                                                                   v
                                                       [ready], claim key released

[failed], claim key released:  3rd failure, permanent error,
                               or no sign of a worker for 10 minutes
```

### Deploying it as one service

To keep it to one service, the start command became a small bash supervisor, `scripts/start-production.sh`. It launches the worker, launches Gunicorn, and loops every two seconds: if the worker has exited, restart it; if Gunicorn exits, shut everything down. The two roles are separate OS processes, so a web worker hitting its timeout can't kill a reading.

The tests cover a dead worker's job being reclaimed, a stale worker being refused at finalize time, a hung child releasing its lease, and a two-tab race that asserts one report and one notification. There was even a test asserting the `Procfile` and `render.yaml` both pointed at the supervisor script.

## The Job Nobody Picked Up

In October I found that compatibility reports in production had been sitting in **pending for eight days**. The report page was doing what it was told, reloading itself every six seconds and promising the reading would appear.

The cause was simple. The production service had been created by hand in the hosting dashboard, not from the blueprint file. Its start command was a dashboard setting that still said `gunicorn app:app ...`. The supervisor script never ran, so **no worker ever existed**. My deployment test had checked the config files carefully, and those files didn't control the live service.

The more interesting question was why the app had no way to notice. Here is the freshness rule the UI used to decide whether a pending row was still legitimately in progress, before the fix:

```python
if report.active_claim_key:
    attempts = report.generation_attempts or 0
    if (attempts >= SYNASTRY_JOB_MAX_ATTEMPTS
            and (report.generation_lease_expires_at is None
                 or report.generation_lease_expires_at <= now)):
        return False
    return True
```

Every failure path for a durable job went through a worker. Attempts are counted at claim time, so the rule "fail after three attempts" quietly assumed something was claiming. With no worker, attempts stayed at zero forever, and a durable row was "fresh" forever.

It also blocked retries in a subtle way. A user re-submitting the same pair didn't match the 30 minute reuse lookup, because the stuck row was days old. So the enqueue tried to insert a new row, hit the unique `active_claim_key`, and landed in the `IntegrityError` branch: "already claimed; reusing." The constraint that prevents duplicate work was faithfully handing back the stuck job.

### The fix: judge by signs of life

The fix lets the rule fail without a worker. A claimable row (no live lease) is stale if its **last sign of worker life** is more than 10 minutes old. That sign is the newest of `created_at`, `generation_next_attempt_at`, and `generation_lease_expires_at`:

```python
SYNASTRY_UNCLAIMED_STALE_MINUTES = 10
SYNASTRY_STALE_UNCLAIMED_ERROR = 'no_worker_claimed'

def _synastry_last_worker_sign(report):
    candidates = [report.created_at, report.generation_next_attempt_at,
                  report.generation_lease_expires_at]
    return max(c for c in candidates if c is not None)

# inside synastry_pending_is_fresh:
if report.active_claim_key:
    # ... exhausted-attempts rule unchanged ...
    if lease_live:
        return True
    return _synastry_last_worker_sign(report) >= now - timedelta(
        minutes=SYNASTRY_UNCLAIMED_STALE_MINUTES)
```

The same predicate is mirrored in the dead-letter sweep, which runs before every claim, and for the requested pair before every enqueue. Stale rows flip to failed with `generation_last_error='no_worker_claimed'` and release their claim key, so a re-submit creates a fresh job instead of getting the stuck one back. A test reproduces exactly that production shape and asserts the "already claimed" log line never appears.

The 10 minute window was picked against the healthy cadence, and a test pins it: it must be under 15 minutes and longer than a full lease plus the longest retry delay. A worker that is merely slow or retrying never trips it.

The UI got more honest too. After two minutes the waiting copy says "taking longer than usual" and when it will time out. A row that fails without ever being attempted says the reading service didn't pick it up, that nothing was counted against the user's plan, and offers a retry.

The deployment docs now say plainly that the start command is a dashboard setting the blueprint file doesn't govern, and how to check it.

## What I'd Do Differently

- **Give the worker its own liveness signal.** The stale rule infers worker death from job age, which means the first symptom is still a user waiting up to 10 minutes. I drafted a boot-time check during the fix that logged an error if a due job sat unclaimed after startup, but it came out during review. A worker heartbeat row would let the app tell "no worker" from "slow worker" directly.
- **Test the thing that actually deploys.** My deployment test asserted on two files that turned out not to be the source of truth. A post-deploy check against the live service's real start command would have caught this at deploy time instead of after users had been waiting for days.
- **Test on the production database.** The suite runs on SQLite, including the two-tab race test. The Postgres advisory locks that coordinate with chart deletion never run in the test suite.
- **Expect to outgrow one worker.** It runs one job at a time. That's fine at current volume, but it is the next bottleneck.

## Conclusion

A job queue in a table can be surprisingly solid: a unique nullable claim key for deduplication, a conditional `UPDATE` for claiming, a lease token to fence stale workers, and one commit for the result and its side effects.

What it can't do is tell you when nobody is consuming the queue. The lesson I took away is that **"eventually reaches a final state" has to hold even when the worker isn't there**, and the deployment check has to look at the system that's actually running, not the file that describes it.
