---
title: "Building AI-Powered Web Apps Without Getting Lost in the Hype"
date: "2025-09-15"
category: "AI & Machine Learning"
excerpt: "Practical lessons from building Astrology Insights — what actually matters when shipping AI features, and when to put the model down."
read_time: "6"
image_url: "/static/images/astrology-insights-feature.png"
---

I built [Astrology Insights](https://myastrologyinsights.com) — a full-stack web app that generates birth charts and uses AI to interpret them — and the most useful thing I can tell you is this: most of the hard problems had nothing to do with AI.

That's not a knock on the technology. The AI parts work great. But when you're in the middle of shipping something real, the model is usually the least of your problems. Handling auth, wiring up Stripe, keeping costs under control, making sure prompts don't go off the rails for edge-case inputs — that's where you actually spend your time.

## What Worked

**Fast iteration beats perfect prompts.** I spent maybe two days agonizing over my initial system prompt, trying to get the tone just right. Wasted time. The real signal came from actually using the thing — what did the output feel like after 20 uses? 50? What patterns kept coming up where the response felt generic or off? I iterated based on real usage, not theoretical optimization.

**Structured outputs are your friend.** Once I started asking the model to return JSON with specific fields, life got a lot easier. Less parsing, less "did it say what I think it said", more predictable downstream handling. If you're building something where you need to do anything programmatic with the response, get structured outputs in from the start.

**Cache aggressively.** Birth chart interpretations don't need to be regenerated every time the same user loads the page. Store the outputs. Your API bill will thank you, and response times go from 4 seconds to instant. This sounds obvious but I see a lot of people treat AI calls like they're free.

## What Didn't Work

**Trying to use AI for everything.** There was a phase where I was AI-ing things that had no business being AI'd. Date formatting. Input validation. Stuff that a five-line function handles better, faster, and cheaper. The model is a power tool. You don't use a table saw to tighten a screw.

**Chasing the latest model.** Every few weeks there's a new release and the benchmarks look incredible. I wasted a couple of afternoons swapping models and running evaluations when the version I had was already good enough. Unless you're at a scale where model quality is actually the bottleneck, ship the thing.

**Not building evals early.** I had no systematic way to check if a prompt change made things better or worse. I'd tweak something, eyeball a few outputs, and call it good. That's fine when you're moving fast, but eventually you need some kind of ground truth. I built a small evaluation harness later than I should have.

## The Actual Lesson

AI features are product features. They have the same constraints as everything else: users need to trust them, they need to be fast enough, they need to handle failure gracefully, and they need to be worth the cost.

The hype around AI makes people treat it like magic that changes the rules. It doesn't. Good software fundamentals — clean interfaces, error handling, thoughtful UX, knowing what you're actually trying to accomplish — those matter just as much as they ever did. The AI is the interesting new ingredient, but it's still cooking.

Start with the simplest version that could work. Ship it. Learn from people actually using it. Then iterate.

That's it. That's the whole playbook.
