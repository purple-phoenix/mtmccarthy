---
title: "A Review System That Proves What Shipped"
date: "2026-07-29"
category: "AstroAI"
excerpt: "Exact-head previews, step-by-step browser evidence, focused feature reports, and CI turned AI-assisted delivery from a plausible diff into a reviewable claim."
read_time: "8"
---

The hardest part of AI-assisted development is no longer producing a plausible diff. It is proving that the diff became the product you meant to ship.

AstroAI pushed me toward a stricter review system because the cost of being almost right is high. A privacy promise can be beautifully written and linked from the wrong page. A consent checkbox can exist but fail under keyboard navigation. A feature can pass unit tests while the deployed layout hides its primary action on a narrow screen.

My answer was to make every meaningful shipping claim traceable to three things: a specific revision, a reproducible check, and evidence from the rendered product.

## Start With the Exact Head

“It worked locally” is weak evidence when several changes are moving at once. The useful question is: **did this exact commit produce this exact behavior?**

For important review passes, I build and launch the revision that is actually under review. I record the commit identity with the evidence. If the branch changes, the old evidence does not silently carry forward; the affected checks run again.

That sounds fussy until you have compared the wrong server, reviewed an image from a previous attempt, or watched a late rebase change the code beneath an otherwise green report. Exact-head verification removes that ambiguity. A reviewer can connect what they see to what will ship.

## Evidence Should Follow the User's Path

A screenshot of a landing page proves that a landing page rendered. It does not prove that chart creation, consent, sharing, or deletion works.

For multi-step features, I capture evidence in sequence:

1. the starting state and the action available to the user;
2. the data entered or choice made, with private information replaced by safe test data;
3. the immediate validation or loading state;
4. the completed result; and
5. the important follow-up action, such as revisiting, sharing, or reversing a choice.

The sequence matters because bugs often live between the polished endpoints. A disabled button never enables. A loading state never clears. A success message appears even though the data was not saved. Step-by-step evidence makes those transitions reviewable.

It also keeps screenshots honest. The purpose is not to create a glossy launch collage. It is to show enough context that another person can tell what was exercised and what remains unproven.

## Write a Feature-Testing Report, Not a Victory Note

The report that accompanies a feature should be small enough to read and specific enough to challenge. Mine now answers five questions:

- What user outcome was tested?
- Which revision and environment produced the result?
- Which paths passed?
- Which paths were not tested or remain experimental?
- Where is the visual or automated evidence?

This format forces useful distinctions. “The privacy page shipped” is different from “every third-party disclosure has been independently audited.” “The social studio can prepare an approved post” is different from “the publishing pipeline is ready for unattended volume.” The first statement in each pair may be true while the second is still open work.

I would rather publish a smaller, precise claim than a sweeping claim nobody can reproduce.

## Automation Covers the Repeatable Floor

Automated checks are the floor of the system, not the whole system. They are excellent for things that should remain true on every change:

- routes return the expected status;
- metadata and canonical links are present;
- privacy-sensitive strings do not leak into public output;
- core calculations remain deterministic for known fixtures;
- navigation targets exist;
- critical controls have accessible names; and
- the browser does not emit unexpected runtime errors.

Continuous integration runs those checks away from my development machine. That catches hidden dependencies, missing assets, stale generated files, and tests that only pass because of local state.

Browser checks then cover the rendered contract. I look at both a desktop viewport and a narrow viewport, use the keyboard for the primary path, and inspect page titles, headings, link destinations, and overflow. Those checks are intentionally boring. Boring checks are the ones I can repeat.

## AI Changes the Review Burden

AI can draft code, tests, documentation, and content quickly. That changes the economics of implementation, but it does not transfer responsibility for the result.

In practice, faster generation increases the need for disciplined review. A large diff can contain consistent-looking mistakes across code, tests, and documentation. If the same model wrote all three, agreement between them is not independent confirmation.

The counterweight is evidence from different layers:

- a static review checks the implementation and public-safety boundary;
- automated tests exercise repeatable behavior;
- a real browser checks the integrated interface;
- visual evidence makes the path inspectable by someone else; and
- CI repeats the suite in a clean environment.

No single layer is sufficient. Together they make a claim much harder to fake accidentally.

## What I Learned

First, acceptance criteria should be written as observable outcomes. “Improve onboarding” is hard to test. “A first-time user can identify the required birth data, understand why it is needed, consent, and recover from a validation error using only the keyboard” is testable.

Second, evidence should be produced during the work, not reconstructed at the end. Retrospective screenshots encourage selective memory. Capturing each state while the feature is being exercised turns evidence into a debugging tool.

Third, reports need an explicit “not proven” section. That is where experiments, deferred device coverage, and unmeasured business outcomes belong. It prevents green tests from being mistaken for product-market fit.

Finally, the review system has to be lightweight enough to survive ordinary work. The ideal process is not the one with the most artifacts. It is the smallest process that reliably ties intent, code, behavior, and publication together.

AstroAI is better because I can show what a change did, not merely say that it shipped. That is the standard I want for AI-assisted delivery: speed where generation helps, skepticism where claims are made, and a clean chain of evidence between the two.

**Previous:** [Building AstroAI for Trust, Not AI Slop](/blog/building-astroai-for-trust-not-ai-slop)

**Next:** [Building a Private Social Content Studio](/blog/building-a-private-social-content-studio)
