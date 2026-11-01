---
title: "Tests That Don't Expire: Removing Clock Dependence from Safety Suites"
date: "2026-10-31"
category: "Testing & Quality"
excerpt: "A hardcoded date in a publish-approval test fixture turned two safety suites red with no code change, and fixing it properly meant deriving every slot from the clock and then proving the suites survive any clock."
read_time: "7"
---

In [Astrology Insights](https://myastrologyinsights.com), my birth-chart app, nothing gets posted to social media unless a person has approved that exact post. The approval is an immutable record that pins the caption text, the image bytes, the destination account, and the publish slot. Before anything is sent to Buffer (the scheduling service), the code checks that record again. Two test suites guard this path: one for the approval gate itself and one for **at-most-once delivery**.

On 2026-08-05, both suites went red. Nobody had changed any code. The calendar had simply moved past a date that was hardcoded in the test fixture.

This post covers why that happened, how I fixed it, and why I think a safety suite needs proof that it doesn't depend on the clock, not just a later date.

## The Rule That Made the Tests a Timer

The approval gate refuses any slot that is not strictly in the future. The final check in `authorize_buffer_schedule` looks like this:

```python
# scripts/final_publish_approval.py
def authorize_buffer_schedule(binding, *, caption_text, image_bytes, ...):
    # ... validate_final_binding(...) checks every bound component first
    scheduled_at = datetime.fromisoformat(
        binding["slot"]["utc"].replace("Z", "+00:00")
    )
    # ...
    if scheduled_at <= datetime.now(timezone.utc):
        raise FinalApprovalError("Approved publish slot has expired")
```

That rule is correct, and I didn't change it. An approval for a moment that has already passed should never reach Buffer. The problem was how the test fixture built its approvals. When I first wrote the suite (commit `f73cc70`, on 2026-08-02), the default slot was a fixed date:

```python
# tests/test_final_publish_approval.py, before (f73cc70)
def build_binding(self, *, publish_date="2026-08-05", approved_minute=30):
    # ...
        publish_time="09:15",
        publish_timezone="America/New_York",
```

09:15 in New York on that date is 13:15 UTC. That gave the fixture **three days of runway**. Once the real clock passed 13:15 UTC on August 5th, every test that built a "valid" approval was building an expired one.

```
        f73cc70 written            hardcoded slot
             |                          |
  -----------+--------------------------+------------------------->  wall clock
          2026-08-02              2026-08-05 13:15Z
             |<------ suite green ----->|<------ suite red ------->
                                        (no code change)
```

According to the fix commit (`9fd39fe`), this caused 6 failures in the approval suite and 17 more in `tests/test_publisher_at_most_once.py`. The second group was pure cascade, because the delivery suite imports `SyntheticPublishState` from the approval suite. One stale constant took down both safety suites together.

## Why Red Wasn't the Worst Case

A red suite is annoying, but at least it's loud. The bigger worry with a clock-dependent safety suite is that it **keeps passing while it stops testing what it says it tests**.

Consider what a negative test in this suite looks like. A refusal test passes when the gate raises `FinalApprovalError`. Expiry raises `FinalApprovalError` too. Once every fixture slot has expired, every refusal test has a second, accidental way to pass. The only thing separating "refused for the right reason" from "refused because the date is stale" is how specific the assertion is.

Most of the suite was already protected here. The mutation tests go through a helper that matches the error message with `assertRaisesRegex`, and `validate_final_binding` runs before the expiry check, so "Caption changed" or "Publish slot changed" still shows up even when the slot is stale. The legacy-row test was weaker. It used a bare `assertRaises(FinalApprovalError)` and a fixed `scheduled_at` of `"2026-08-05T13:15:00Z"`. In the current code that row gets refused earlier, because it has no approval record at all, so the stale date wasn't actually masking anything. But nothing in the test would have told you if that changed. The fix gave it a live future slot and a comment explaining why:

```python
# A live future slot, so the row is refused for being unbound
# rather than incidentally for having expired.
"scheduled_at": f"{future_slot_date()}T13:15:00Z",
```

The same issue showed up in the expiry test. Its "expired" slot was `"2026-07-31"`, which stays in the past forever, so on its own it was fine. But after August 5th, the "valid" fixture and the "expired" fixture were both expired. The suite could no longer tell the two cases apart.

## The Design

The fix in `9fd39fe` has three parts.

### 1. Every slot is relative to the run's own clock

The fixture now computes slots from `datetime.now` instead of storing dates:

```python
FUTURE_SLOT_DAYS = 30
LATER_SLOT_DAYS = FUTURE_SLOT_DAYS + 1
EXPIRED_SLOT_DAYS = 5

def slot_date(*, days_from_now):
    """Return an ISO publish date offset from the current UTC day."""
    moment = datetime.now(timezone.utc) + timedelta(days=days_from_now)
    return moment.date().isoformat()

def future_slot_date():
    return slot_date(days_from_now=FUTURE_SLOT_DAYS)

def later_slot_date():
    return slot_date(days_from_now=LATER_SLOT_DAYS)

def expired_slot_date():
    return slot_date(days_from_now=-EXPIRED_SLOT_DAYS)
```

Wherever the old fixture said `"2026-08-06"` (used as "a different future slot"), it now says `later_slot_date()`. The `"2026-07-31"` expiry case became `expired_slot_date()`. One detail is easy to miss: `build_binding` now defaults `publish_date` to `None` and resolves it inside the function body. A default argument like `publish_date=future_slot_date()` would be evaluated **once at import**, which would freeze the slot for the whole session and quietly bring back the same bug.

```
        expired          now            future    later
  ---------+--------------+---------------+---------+------->
        now - 5d                      now + 30d  now + 31d
```

The ordering is what the tests actually depend on, and it now holds no matter when the suite runs.

### 2. A test that proves clock independence

Relative dates fix today's failure. They don't prove the suite has no other clock dependency. For that I added `ClockIndependenceTestCase`, which re-runs the real approval and delivery path with the clock shifted across a wide range, from `"a decade ago"` through `"right now"` and `"tomorrow"` to `"a century on"`:

```python
def _shifted_clock(self, shift):
    """Patch every ``now`` the slot path consults, by the same offset."""
    real_now = datetime.now

    class ShiftedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return real_now(tz) + shift

    return tuple(
        patch.object(module, "datetime", ShiftedDatetime)
        for module in (
            final_publish_approval,
            brand_review_server,
            sys.modules[__name__],
        )
    )
```

The test module itself is on that list, so the fixture's slot helpers and the production expiry check see **the same shifted "now"**. Under each shift, one test builds a binding, materializes the queue, authorizes the post, hands it to a fake Buffer boundary, and asserts the slot is still ahead of the shifted clock. A second test confirms that an expired slot is still refused under every shift, with no staged image and no HTTP call. Each shift runs as a `subTest`, so a failure tells you which clock broke it.

### 3. A static guard against winding the timer back up

The last part is a regex over the test module's own source. It flags a slot field (`publish_date`, `scheduled_at`) that holds a literal `YYYY-MM-DD`, or any date literal inside one of the slot helper bodies. The pattern is built from parts so it can't match its own definition, and it ignores prose, so the comment that mentions 2026-08-05 doesn't trip it. The shift tests only cover the paths they actually exercise. The static guard catches a hardcoded literal anywhere in the file before the calendar has a chance to.

### The rule in CLAUDE.md

The same commit added the rule to the repo's agent instructions (`CLAUDE.md` is a symlink to `AGENTS.md`), right next to the publishing-safety notes: **every synthetic publish slot must be clock-relative**. It names the three helpers and says why: "A hardcoded calendar date is a timer that turns both safety suites red the day it passes; pushing it further out only rewinds the timer." That last clause matters most to me. When a date-based test fails, the obvious fix is to change `2026` to `2030`. That fix works, so it's tempting, and it leaves exactly the same bug for whoever runs the suite in 2030.

## Trade-offs

- **Inputs change from run to run.** Every run uses a different calendar date. The outcomes are deterministic, but the data isn't. A bug that only shows up for, say, a slot in daylight time versus standard time would appear on some runs and not others.
- **The clock is patched, not injected.** Production calls `datetime.now(timezone.utc)` directly, so the shift test has to replace the `datetime` name in each module that makes a time-based decision. That list is maintained by hand.
- **The delivery suite stays fixed on purpose.** `tests/test_publisher_at_most_once.py` still has a literal `scheduled_at`. Those strings never reach the expiry check. They're opaque identity keys passed straight to the fake transport, and keeping them constant keeps the identity assertions deterministic. The static guard only covers the approval module for that reason.
- **Margins are arbitrary.** Thirty days ahead and five days back are generous, not principled. Any positive margin would work, as long as the ordering holds.

## What I'd Do Differently

**Write it relative from the first commit.** The original file already did this in one place: the HTTP approval request built its date as `datetime.now(timezone.utc) + timedelta(days=5)`. The shared fixture right next to it used a literal. The right pattern was already in the file. It just wasn't applied consistently.

**Inject a clock into the gate.** The expiry decision reads the wall clock in `authorize_buffer_schedule` and `authorize_package_schedule`, and `brand_review/server.py` checks for a future slot in two more places. Passing in a `now` callable would let tests pin time directly instead of patching module globals. The list of places that consult the clock would then show up in function signatures, instead of being something I have to remember.

**Finish the job on `approved_at`.** The fixture still records the approval time as `datetime(2026, 8, 1, 16, approved_minute, tzinfo=timezone.utc)`. Right now that's harmless, because nothing compares `approved_at` to the clock or to the slot. But under the "a decade ago" shift, the fixture records an approval that happens years after the slot it approves. If I ever add a rule like "approval must come before the slot", this is the next timer, and I'd rather defuse it now than find it in a red build.

## Closing Thoughts

A test that depends on the wall clock isn't really testing your code. It's testing the code plus today's date. For most suites that just means an occasional flaky afternoon. For a suite whose job is to prove that nothing reaches the public without a valid, current approval, it's a real gap. The fix wasn't to make the date later. It was to **make the date irrelevant, and then write a test that proves it is**.
