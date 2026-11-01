---
title: "Proving a Chart-Engine Swap with Evidence"
date: "2026-10-31"
category: "Testing & Quality"
excerpt: "How I replaced a hosted astrology chart API with local Swiss Ephemeris computation, and the fidelity harness I built to show the new engine was right before letting it near users."
read_time: "8"
---

Every natal chart in [Astrology Insights](https://myastrologyinsights.com), my astrology app, used to come from a hosted API. Each chart cost one paid API credit and a network round trip that could take anywhere from 1 to 30 seconds, with retry loops for rate limiting. The same computation could run locally in a few milliseconds.

The swap itself was small. Proving it was safe was the real work. A birth chart is a list of numbers, and if one of them is quietly wrong the app still renders a beautiful, confident, wrong reading. Nobody files a bug for that. So I treated the migration as a question of evidence: **what would I need to see to believe the new engine is right?**

## Why the swap looked easy

The hosted service is the official HTTP API for **kerykeion**, an open-source Python astrology library built on Swiss Ephemeris. The app already shipped kerykeion locally for transit math. So "go local" mostly meant calling a library I already depended on instead of paying someone to call it for me.

That is exactly the kind of change that feels too easy. The hosted API runs the kerykeion **v4** line. My local copy is **v5** (5.12.9). Same author and same lineage, but different major versions, different defaults, and different names for things.

## What could silently go wrong

Before writing any comparison code I listed the ways a chart could come out wrong without anything crashing:

1. **Settings drift.** Zodiac type, house system and perspective all have defaults. If v5 changed one, every chart would shift. The app uses the tropical zodiac, Placidus houses and an apparent geocentric perspective, and doesn't support sidereal zodiacs or ayanamsa selection at all.
2. **Spelling drift.** v4 calls the tropical zodiac `"Tropic"` and v5 calls it `"Tropical"`. v5 also renamed the lunar nodes.
3. **Timezone and DST handling.** A chart depends on the exact UT instant. Getting the local-to-UT conversion wrong by an hour moves the Ascendant and every house cusp.
4. **Polar latitudes.** Placidus houses are undefined near the poles, so every engine has to do *something* there.
5. **Historical dates.** Before time zones were standardised, cities ran on local mean time, and tz databases model that differently.
6. **Aspect composition.** Which pairs of points are checked for aspects, and with what orbs.

That last one turned out to be a real trap. kerykeion v5 still ships a legacy `NatalAspects` compatibility shim, and it **silently drops** active points that aren't in v5's own default list. Those include the mean lunar nodes that production computes aspects for. Nothing errors. You just get fewer aspect rows. The fix was to call the v5-native `AspectsFactory` directly with the exact v4 active-point set, then map the node names back to their v4 spellings so aspect rows read the same as before.

For settings, I moved the three values onto one frozen config object and pass them explicitly to both engines, even though they match kerykeion's current defaults:

```python
CALCULATION_METHOD = CalculationMethodConfig(
    zodiac_name="Tropical",
    kerykeion_zodiac_type="Tropical",
    rapidapi_zodiac_type="Tropic",
    house_system_name="Placidus",
    house_system_identifier="P",
    perspective_type="Apparent Geocentric",
    # ...
)
```

Pinning values that equal the defaults looks redundant, but it means a future library release can't change a default and silently fork the two engines.

## Designing the evidence

The obvious test is a parity check: send the same birth data to the old engine and the new one and diff the output. I built that. It's the harness's `live` mode. But there was a catch: no production API key was reachable from the build environment, so that run never happened.

So the evidence leans on a different idea. Instead of asking "does local match hosted?", ask **"does local match an independent reference?"** If local matches something that shares none of its code paths, and the hosted engine is the same library, then parity follows from both being right.

```
          birth data (date, time, lat, lng, tz name)
                          |
       +------------------+-------------------+
       |                  |                   |
       v                  v                   v
  local engine      zoneinfo -> UT       NASA JPL Horizons
  (kerykeion v5,    -> Julian day ->     (pinned longitudes,
   pytz tz path)    swisseph calc/houses  2 baseline charts)
       |                  |                   |
       +--------+---------+-------------------+
                |
                v
   compare_positions()  (per element, arc-seconds, 1' bar)
   internal_consistency()  (shape + geometry invariants)
                |
                v
   CHART_ENGINE_FIDELITY_EVIDENCE.md  +  CI test over all charts
```

There are three references, each checking something different:

- **NASA JPL Horizons** longitudes, pinned as constants, for two baseline charts. This is the only check that uses a completely different ephemeris from Swiss Ephemeris.
- **A hand-rolled Swiss Ephemeris call** for every chart. The Julian day is derived from the birth instant with Python's `zoneinfo`, not kerykeion's own timezone code (which uses `pytz`). Planets come from `swe.calc_ut`, and the Ascendant, MC and all twelve cusps come from `swe.houses(jd, lat, lng, b'P')`. The doc's argument for cusp parity is that both kerykeion versions call that same `houses()` routine.
- **Internal invariants** that any valid chart must satisfy, whichever engine produced it: `abs_pos == sign_num * 30 + position` for every point, Ascendant and Descendant exactly 180° apart (likewise MC and IC), and every point present.

The comparison itself is deliberately boring. The one subtle part is the wrap at 0°/360°:

```python
PLANET_TOLERANCE_DEG = 1.0 / 60.0          # 1 arc-minute — the accuracy bar
ANGLE_TOLERANCE_DEG = 1.0 / 60.0           # Asc/MC/cusps, same bar
INTERNAL_TOLERANCE_DEG = 1e-6              # abs_pos vs sign*30+position

def angular_diff(a, b):
    """Smallest absolute separation between two ecliptic longitudes, degrees.

    Handles the 0/360 wrap, so 359.9 and 0.1 are 0.2 apart, not 359.8.
    """
    d = abs(float(a) - float(b)) % 360.0
    return min(d, 360.0 - d)
```

`compare_positions` then reports a delta in arc-seconds for every point, the worst point, anything over tolerance, and any point present on only one side. The accuracy requirement is one arc-minute (1′ ≈ 0.0167°), which is far finer than anything a reading depends on.

### Choosing the fixtures

The chart set is 15 synthetic charts, each tagged with the edge case it targets: polar north and south, deep southern latitudes, southern hemisphere, a historical date before and after time-zone standardisation, a date in 2075, a leap day at the equator and prime meridian, the date line, local midnight, and both kinds of DST transition. A fixture is just a tuple plus tags:

```python
{
    'id': 'leap-day-2000', 'label': 'Leap day 2000-02-29 (equator/prime meridian)',
    'tags': ['leap-day', 'equator'],
    'birth': (2000, 2, 29, 12, 0, 0.0, 0.0, 'UTC'),
},
# ...
```

The tags matter because the CI test asserts coverage as well as correctness: it fails if the set ever stops including polar, southern, historical, future, DST, date-line, leap-day and midnight cases.

Two of the charts are **expected to fail**. A 02:30 local time on a spring-forward night doesn't exist, and a 01:30 on a fall-back night happens twice. For those, the harness checks that the engine refuses the input rather than producing a chart.

### Recording the results

The harness writes its own evidence. `python -m experiments.chart_fidelity --report` renders a markdown table into the repo, and a pytest class runs the same offline pass in CI and fails if any chart doesn't pass. The narrative doc explains the numbers. The numbers themselves come from code.

## What the evidence showed

From the generated appendix:

| Result | Charts |
|---|---|
| 0.00″ worst delta on planets, angles and all cusps vs the Swiss Ephemeris reference | 12 |
| Small historical divergence (12.53″ planets, 291.23″ angles) | 1 (Paris 1900) |
| Engine correctly rejects the input | 2 (DST gap, DST ambiguous) |

Against Horizons, the two baseline charts were worst at **0.33″** and **1.88″**, the Moon in both cases since it's the fastest mover. That's about 0.0005°, roughly 30 times inside the arc-minute bar.

The polar charts were the ones I worried about most. kerykeion caps latitude at 66.0° for house math, and the reference mirrors that cap, so the comparison is like for like. Because the hosted engine is the same library, that cap is production behaviour too, not something the migration introduced.

The Paris 1900 chart is the interesting one. Its Ascendant is off by about 291″ (roughly 0.08°) from the independent reference. That's the only number in the table above the bar. It traces back to how pre-1911 local mean time is modelled by `zoneinfo` versus kerykeion's `pytz` path. Local and hosted kerykeion share the `pytz` path, so this is a disagreement with my cross-check, not with production. The harness knows this and doesn't fail the chart on it:

```python
pre_1912 = 'pre-1912' in chart.get('tags', [])
planets_ok = planet_cmp['within_tolerance']
# Pre-1912 charts diverge on time-sensitive angles because historical
# tz offsets (LMT) differ between zoneinfo and kerykeion's own tz
# handling — a local-vs-independent artefact, NOT a local-vs-production
# gap (both are kerykeion). Do not fail the pass on it; annotate.
angles_ok = angle_cmp['within_tolerance'] or pre_1912
```

## Making the cutover safe to reverse

Evidence lowers the risk. It doesn't remove it. So the cutover shipped with three guards:

- **A validation contract at every engine boundary.** Before any engine's output can be formatted or saved, `validate_chart_engine_output()` requires all ten planets, all four angles and all twelve cusps, each with finite numeric values and coherent sign-relative and absolute longitudes. A schema error from the hosted API can't become a blank, shareable chart.
- **A one-line rollback.** Setting `CHART_ENGINE=rapidapi` puts a deploy back on the hosted engine.
- **A runtime fallback that knows what not to catch.** If local computation genuinely fails and a key is present, the app falls back to the hosted engine and logs it loudly. But a DST rejection is a problem with the *birth data*, not the engine, so it is re-raised before the fallback can see it:

```python
try:
    return _real_chart_data(name, year, month, day, hour, minute,
                            city, nation, lat, lng, tz_str)
except KerykeionException:
    # Input-validation errors (an ambiguous or non-existent local time
    # around a DST transition) ... are re-raised, never masked by the
    # RapidAPI fallback: the hosted engine would guess a DST offset
    raise
except Exception as real_error:
    if os.environ.get('RAPIDAPI_KEY'):
        logger.error("Chart engine REAL failed (%s) — falling back to the "
                     "RapidAPI engine.", type(real_error).__name__)
        return _rapidapi_chart_data(...)
    raise
```

Without that first `except`, the fallback would quietly route ambiguous times to an engine that might guess, and a guessed DST offset puts the Ascendant and houses an hour off. The user gets a friendly "re-enter a valid time" prompt instead.

## Trade-offs I accepted

- **Independent reference over live parity.** An independent reference is arguably stronger, because it can catch bugs both engines share. But it doesn't directly observe the old engine. Every parity claim rests on "same library, same inputs, same C routine".
- **One known behavioural difference.** The local engine rejects ambiguous and non-existent DST times. What the hosted v4 service does with those inputs is unverified. It may resolve them silently. I chose failing safe over matching unknown behaviour.
- **Aspect composition at the margins is argued, not observed.** Positions match, but v4's internal filtering of borderline aspects could differ from v5's. The chart summary the app builds for readings keeps only the 15 tightest aspects, which limits the impact.

## What I'd do differently

Re-reading the harness against the docs, a few gaps stand out:

1. **Capture one real hosted response and commit it.** The live diff was the original plan and is still the missing piece. A single recorded v4 response would have turned "argued from source" into "observed" for both the DST behaviour and aspect composition.
2. **Actually compare aspects offline.** The narrative doc says the offline pass compares aspect relationships, but `run_offline` only compares positions and invariants. `compare_aspects` runs only in live mode, which never ran.
3. **Make "error parity" mean parity.** Offline, it only checks that the local engine raises, and it accepts *any* exception. I'd assert on `KerykeionException` and on which DST case it was.
4. **Let live mode fail the build.** In live mode, a chart's status looks only at positions, and the process exit code looks only at the offline results.
5. **Make waivers visible.** Paris 1900 shows as `pass` in the table while sitting at 291″ against a 60″ bar. A distinct `waived` status would be more honest than an annotation.
6. **Pin Horizons values for the edge cases.** The Swiss Ephemeris planet reference shares its ephemeris with the engine, so it really tests time handling, not astronomy. Only the two baseline charts get a truly independent ephemeris check.
7. **Generate the headline numbers too.** The hand-written summary drifted from the generated table (it says 13 of 15 charts are exact; the table shows 12). If the summary came from the harness, it couldn't drift.

## The broader lesson

The useful move was reframing "does the new thing match the old thing?" as **"what independent facts would both have to agree with?"** That turned a blocked parity check into evidence I could gather offline, at zero cost, in CI.

The other lesson is that evidence has edges, and they deserve to be written down as plainly as the results. The fidelity doc closes with a numbered list of residual gaps, and that's the part I trust most, because it says exactly what the green table doesn't prove.
