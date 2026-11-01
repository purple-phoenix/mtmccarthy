---
title: "At-Most-Once Delivery for a Social Publisher"
date: "2026-10-31"
category: "Software Engineering"
excerpt: "How I rebuilt a social media publisher so that an unknown outcome produces zero extra posts instead of a duplicate, using outcome classification, a write-ahead ledger, and a human reconciliation step."
read_time: "8"
---

[Astrology Insights](https://myastrologyinsights.com), my birth-chart app, has a small pipeline that turns approved captions and images into scheduled social posts. A cron job drains a local JSON queue and sends each row to Buffer, a third-party scheduling service, through its GraphQL `createPost` mutation. For a long time the sender had a simple retry loop. That loop was wrong, and fixing it taught me more about delivery guarantees than anything I had read about them.

## Why a Duplicate Is Worse Than a Miss

Most retry advice assumes the operation is safe to repeat, or that a missed operation is the worst outcome. For a public post, both assumptions fail. **A missed post is a quiet gap in a schedule. A duplicate post is a public mistake** that followers see, that has to be noticed and cleaned up by hand, and that makes an automated account look broken.

So I made the publisher **at most once**: when the outcome of a request cannot be proven, the correct number of additional sends is zero, not one.

## The Bug in the Old Loop

The original sender wrapped `requests.post` in `for attempt in range(4)` and retried any `Exception` after a five-second sleep. That looks reasonable until you ask what each exception actually means.

- **A DNS failure or refused connection** means the request never left the machine. Retrying is safe.
- **A connection reset or read timeout** can arrive *after* the request body was sent. Buffer may already have created the post, and a retry creates it again.
- **A 5xx or an unparseable body** says nothing reliable about whether the post exists.

There is also the case no exception handler can see: **the process dies after the API call but before it records the result.** On the next run, the queue still says `pending`, and a naive drain sends the row again.

## The Design

The new design has three parts: a classifier that decides what each failure *proves*, a write-ahead ledger that records every attempt before it happens, and an operator command that is the only way to resolve an unproven outcome.

### Outcome classification

Every observed attempt ends in exactly one of four outcomes:

- `not_sent`: the request provably never left the process.
- `delivered`: the provider explicitly returned `PostActionSuccess`.
- `refused`: the provider definitively did not create a post.
- `ambiguous`: delivery may have occurred and cannot be disproved.

The important rule is that **ambiguous is the default**. Anything the classifier does not recognize falls through to it. Here is a trimmed version of the transport classifier:

```python
def classify_transport_exception(exc: BaseException) -> TransportClassification:
    """Decide what an exception proves - never what it merely suggests."""
    if isinstance(exc, _NEVER_ISSUED_ERRORS):
        # MissingSchema, InvalidURL, InvalidHeader, ...
        return TransportClassification(NOT_SENT, False, ...)
    if isinstance(exc, requests.exceptions.ConnectTimeout):
        return TransportClassification(NOT_SENT, True, ...)
    if isinstance(exc, requests.exceptions.SSLError):
        if any(
            isinstance(item, ssl.SSLCertVerificationError)
            for item in _exception_chain(exc)
        ) or _is_pre_connect_failure(exc):
            return TransportClassification(NOT_SENT, True, ...)
        return TransportClassification(AMBIGUOUS, False, ...)
    if isinstance(exc, requests.exceptions.ConnectionError):
        if _is_pre_connect_failure(exc):
            return TransportClassification(NOT_SENT, True, ...)
        return TransportClassification(AMBIGUOUS, False, ...)
    if isinstance(exc, requests.exceptions.Timeout):
        return TransportClassification(AMBIGUOUS, False, ...)
    return TransportClassification(AMBIGUOUS, False, ...)
```

Two details matter here. First, `requests` raises the same `ConnectionError` type for a DNS failure, a refused connection, and a reset after the request was sent, so the type alone proves nothing. `_exception_chain` walks `__cause__`, `__context__`, `args`, and `reason` looking for `socket.gaierror`, `ConnectionRefusedError`, or urllib3's `NewConnectionError` / `NameResolutionError`. Only those prove the connection was never established. Second, there are two kinds of `not_sent`. Request-construction errors like `InvalidURL` are `not_sent` but **not** retry-safe, because rebuilding the identical request cannot help. A connect timeout is both.

TLS was the subtle one. A certificate verification failure happens before any request bytes go out, so it is safe. A generic TLS alert could happen while reading the response, so it stays ambiguous.

The response classifier follows the same philosophy. **Success is only read from an explicit `__typename`**, never from a 200, an empty body, or silence:

```python
def classify_buffer_response(response: Any) -> DeliveryOutcome:
    status = getattr(response, "status_code", None)
    if status == 429:
        return DeliveryOutcome(REFUSED, ..., rate_limited=True,
                               retry_after=_retry_after_seconds(response, 90))
    if isinstance(status, int) and status >= 500:
        return DeliveryOutcome(AMBIGUOUS, f"provider returned HTTP {status}; ...")
    # ... unparseable body: REFUSED if 4xx, otherwise AMBIGUOUS
    created = payload.get("createPost") if isinstance(payload, dict) else None
    if isinstance(created, dict) and created.get("__typename") == "PostActionSuccess":
        # ...
        return DeliveryOutcome(DELIVERED, "provider reported success", str(post_id))
    # ... GraphQL errors, InvalidInputError, UnauthorizedError, other 4xx: REFUSED
    return DeliveryOutcome(
        AMBIGUOUS,
        "the provider response was not recognized; delivery is unproven",
    )
```

### The write-ahead ledger

Classification handles failures the process can observe. The crash case needs durable state. The `DeliveryLedger` is a JSON file guarded by `fcntl.flock` and written atomically (temp file, `fsync`, `os.replace`). **Every attempt is recorded as `in_flight` before the request is issued**, and resolved after the outcome is known. If the process is killed mid-request, the `in_flight` record survives.

The ledger also enforces the rule itself, under its lock, so callers cannot forget to check:

```python
def open_attempt(self, identity: str, **context: Any) -> str:
    with self._locked():
        document = self._read()
        attempts = document["attempts"]
        for attempt in attempts:
            if attempt.get("identity") != identity:
                continue
            if attempt.get("state") in UNRESOLVED_STATES:   # in_flight, ambiguous
                raise DeliveryHeldError(describe_held(attempt))
            if attempt.get("state") in DELIVERED_STATES:    # delivered, reconciled_delivered
                raise DeliveryAlreadyDeliveredError(describe_already_delivered(attempt))
        # ... append {"state": IN_FLIGHT, ...} and atomically write
```

The identity is the row's immutable `approval_ref` when one exists, or a SHA-256 over platform, account, slot, and caption otherwise. That keeps the ledger and the queue in agreement across restarts and queue rebuilds.

### The send loop

The sender ties these together. Only a retry-safe `not_sent` loops, bounded by `MAX_PRE_REQUEST_ATTEMPTS = 4` with a five-second pause. Everything else either returns a definite answer or raises `AmbiguousDeliveryError`:

```python
for attempt_number in range(1, MAX_PRE_REQUEST_ATTEMPTS + 1):
    attempt_id = ledger.open_attempt(identity, ...)
    try:
        response = requests.post(BUFFER_API_URL, data=body.encode("utf-8"),
                                 headers=headers, timeout=30)
    except Exception as exc:
        classification = classify_transport_exception(exc)
        ledger.resolve_attempt(attempt_id, classification.outcome, classification.reason)
        if classification.outcome == NOT_SENT:
            if classification.retry_safe and attempt_number < MAX_PRE_REQUEST_ATTEMPTS:
                sleeper(PRE_REQUEST_RETRY_SECONDS)
                continue
            return False, f"not delivered: {classification.reason}"
        raise AmbiguousDeliveryError(classification.reason) from exc
    except BaseException as exc:  # interrupted mid-request: outcome unknown
        ledger.resolve_attempt(attempt_id, AMBIGUOUS, ...)
        raise
    # ... classify_buffer_response, resolve_attempt, then
    # RATE_LIMITED exit, (True, post_id), AmbiguousDeliveryError, or (False, detail)
```

The `BaseException` branch catches things like `KeyboardInterrupt`: the request may be on the wire, so the attempt is marked ambiguous before re-raising. The JSON body is serialized *before* the attempt is opened, so a payload bug cannot masquerade as an ambiguous send.

Here is the attempt lifecycle:

```
           open_attempt()  -- written BEFORE requests.post
                 |
                 v
           +-----------+   process killed here:
           | in_flight |   record stays in_flight (held)
           +-----------+
                 |
   +-------------+--------------+----------------+
   |             |              |                |
   v             v              v                v
not_sent     delivered       refused         ambiguous
retry only   row -> ok       row -> fail:    row -> ambiguous:
if transient blocks every    (429 leaves     no automatic
(max 4)      later attempt   row pending)    send, ever
                                                 |
                       in_flight or ambiguous    |
                       +-------------------------+
                       |   delivery_outcome.py reconcile
             +---------+-----------+
             v                     v
   reconciled_delivered   reconciled_not_delivered
   row -> ok, blocked     row -> pending, next drain
   forever                sends it exactly once more
```

### Two guards, and making ambiguity loud

When an attempt becomes ambiguous, the drain writes `ambiguous:<reason>` into the queue row and stops the chunk rather than sending more requests over a transport that just misbehaved. The queue materializer treats `ambiguous:` as a known status and carries it forward, so rebuilding the queue cannot reset a held row to `pending`. That gives **two durable guards: the ledger record and the queue status.**

They are not always both present. After a hard crash, the queue row still reads `pending` and only the ledger knows a request went out. On the next run, `schedule_queue_post` checks the ledger before doing any work (before even staging the image), raises `DeliveryHeldError`, and the drain mirrors the hold into the queue row. There is a test for exactly this sequence.

There is also a mirror-image repair. If the ledger says `delivered` but the process died before writing `ok` to the queue, the next drain sees `DeliveryAlreadyDeliveredError` and fixes the queue status without issuing a request.

Finally, a held row is never quiet. The drain prints a `HELD` line with the reconcile command for every held row on every run, and the cron entry point exits non-zero while any row is held or newly ambiguous.

## The Operator Script

Only a person resolves an ambiguous outcome, after checking Buffer to see if the post exists:

```bash
python scripts/delivery_outcome.py list
python scripts/delivery_outcome.py reconcile <identity> \
    --outcome delivered|not-delivered --operator <name> [--note "..."]
```

`--outcome` and `--operator` are both required, with no default. `delivered` sets the row to `ok`, and the `reconciled_delivered` ledger state blocks any future attempt. `not-delivered` sets the row back to `pending`, so the next ordinary drain sends it exactly once more.

The ordering inside the command took some care. It updates the queue row first, while the ledger record is still held, and only writes the ledger after the queue write succeeds. If the queue row is missing or duplicated, or a write fails, the command exits non-zero and the ledger stays held, so the same command can simply be rerun. Rerunning an identical reconciliation after it already succeeded re-applies the queue status and reports a repair, which recovers from a stale queue write landing afterwards. Asking for the opposite answer is refused as a conflict.

## Trade-offs

- **Some posts will be missed.** A hard crash after Buffer accepted a post but before the ledger was resolved leaves an `in_flight` record. That post is live, but the system cannot know it, so it waits for a human. I accepted that cost on purpose.
- **A human is in the loop.** Reconciliation means opening Buffer and looking. That is fine at the volume this pipeline runs, but it would not scale.
- **Some classifications are judgment calls.** The single-post path treats a GraphQL `errors` response as a definite refusal. That is a reasonable reading of the API, but it is an assumption, not a proof.
- **Fewer retries means more visible failures.** A flaky network that resets connections mid-request now produces held rows instead of eventual success.

## Testing It

The tests use an in-memory `FakeTransport` that stands in for `requests.post` and counts calls, since **the call count is the number a duplicate post would show up in**. When a scenario runs out of scripted responses, the fake raises `UnexpectedRequest`, which is deliberately a `BaseException` so the publisher cannot absorb it as an ordinary ambiguous outcome. Each ambiguous case scripts a success response second, so a regression that retried would quietly "succeed" and fail the call-count assertion. No test opens a socket or reads a credential.

## What I'd Do Differently

- **Use one classifier for both send paths.** Multi-image packages have their own sender and their own response classifier, and they disagree with the single-post path. The package path treats a GraphQL error as ambiguous, marks a 429 as a failure instead of leaving the row pending, and returns its ambiguous result as a string, so the drain does not stop the chunk and does not count it as newly ambiguous until the next run. Each choice is defensible, but two classifiers for one provider is how gaps appear.
- **Stop relying only on local state.** The `createPost` input I send carries no idempotency key or client reference, so the ledger is the only dedupe mechanism. I would check whether the provider offers a dedupe field or a way to look up scheduled posts by channel and time, and use it to narrow what a human has to verify.
- **Give the ledger a real store.** It is one JSON file, read in full on every check and never compacted, and `flock` only coordinates processes on one machine. That is fine for a single cron host, but it is the first thing that would break if the publisher moved.

## Conclusion

The fix was less about retries and more about being honest with what the code knows. **Absence of a response is not proof of non-delivery.** Once I made every outcome say what it actually proves, the rest followed: retry only what provably never left, record intent before acting, and when the answer is unknown, stop and ask a person instead of guessing.
