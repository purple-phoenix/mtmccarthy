---
title: "Teaching an AI Your Visual Brand: A Feedback Loop That Actually Works"
date: "2026-04-04"
category: "AI & Machine Learning"
excerpt: "How I built a custom review app that lets me train an AI image generator to match my brand aesthetic through rapid approve/reject cycles — and why the human-in-the-loop matters more than the model."
read_time: "8"
image_url: "/static/images/openai-api-feature.png"
---

When I started building [Astrology Insights](https://myastrologyinsights.com), I needed a lot of images. Dozens of social media graphics across Instagram, Facebook, TikTok, and Pinterest — sign cards for all 12 zodiac signs, transit event graphics, educational posts, viral hooks. Multiply by 4 posts per day and you quickly realize that manually sourcing or designing images isn't sustainable.

AI image generation seemed like the obvious answer. But there's a gap between "AI can generate images" and "AI generates images that look like *your* brand." That gap is the interesting problem.

## The Problem With Generic Prompting

If you've used image generators much, you've hit this wall. You describe what you want — "mystical astrology graphic with a zodiac wheel, purple tones, elegant" — and you get something that's technically correct but feels generic. It looks like a stock photo with a vibe filter. It doesn't feel cohesive with the last thing you generated.

The real issue is that *brand* isn't a single prompt. It's an accumulation of preferences: this shade of purple yes, that one no. Stars as texture fine, stars as clip art bad. Overlaid text with a specific font weight works, but not when it's centered in that particular way. These are hard to articulate upfront. You only know them when you see them.

What I actually needed was a way to *show* an AI what I liked rather than *tell* it.

## The Feedback Loop System

The system I built has three parts:

1. **A local web app** for reviewing generated images
2. **A feedback store** (a JSON file) that accumulates my preferences over time
3. **Karl** — my AI assistant — who reads that feedback before generating each new batch

### The Review App

The review app runs locally at `192.168.1.178:8766`. It's a minimal Python HTTP server serving a single-page app that shows me images one at a time. For each image, I can do one of three things:

- **Approve** — this works, generate more like this
- **Needs Improvement** — close but has a specific problem (I add a note explaining what)
- **Disapprove** — don't do this at all

The keyboard shortcuts are what make it fast: `A` to approve, `S` for needs improvement, `D` to disapprove, arrow keys to navigate. Reviewing 20 images takes maybe 3-4 minutes.

Every verdict gets saved to `feedback.json` alongside any notes I wrote. When the unreviewed queue drops below 10 images, Karl automatically generates a new batch.

### The Generate More Button

There's a "✦ Generate More" button in the app header. When I click it, the app calls a local API endpoint that writes a status file and fires a system event to Karl via the OpenClaw CLI. Karl picks it up, reads the full feedback history, and generates a new batch of images — incorporating what I approved, avoiding what I rejected, and fixing the specific issues I flagged.

The status file gives the app something to poll: it goes from `requested` → `generating` → `done`, and the UI updates in real time. When the batch is ready, the images appear automatically in the queue.

### What Karl Reads Before Generating

Before generating a single image, Karl reads two things:

**The feedback JSON:** Every review I've given, in order, with verdicts and notes. After a few rounds this starts to tell a story. Capricorn sign card — approved. Jupiter Leo v2 — approved (after v1 failed because the date was wrong). Rising sign card — needs improvement, "Moon is not labeled silver." That last note is specific enough that the next rising sign image will get the moon right.

**Brand notes:** A free-form text field in the app where I can write higher-level direction — color palettes, moods, things that are hard to capture in per-image feedback. Think of it like the creative brief you'd give a designer.

## What Makes This Work

A few things I learned building this:

**The loop has to be fast.** If reviewing images takes 20 minutes, you'll stop doing it. The keyboard shortcuts and auto-advance make it close to zero friction. Fast feedback → more feedback → better calibration.

**Specificity in notes compounds.** "I like this" teaches much less than "I like the blue wavy background and chart but the text placement is wrong." The latter gives Karl something actionable for the next batch. Vague approval just confirms a data point; specific criticism changes behavior.

**Three verdicts are better than two.** Approve/reject is a coin flip — it doesn't capture the "this is close, fix one thing" case, which is the most common case early in the process. "Needs Improvement" with a note is where most of the learning happens. It's the equivalent of a designer redline rather than a yes/no.

**The model (mostly) doesn't matter.** I've used Google Gemini (via nanobanana), OpenAI's image model, Fal Flux, and a few others. The feedback loop is the same regardless. What matters is that the generator can incorporate detailed prompts — which they all can — and that the feedback is specific enough to drive those prompts.

## The Feedback Data After One Night

After a single evening of reviews, the feedback file has 36 entries. Here's roughly what the data says:

- ~27 approved, ~5 needs improvement, ~1 rejected
- Approved patterns: deep purples and golds, realistic celestial photography style, sign cards with clean typography
- Improvement notes: wrong dates on transit events, missing astrological labels, simple compositions that need more visual weight
- Rejected: launch-style marketing imagery (too generic, not mystical enough)

That's enough signal to generate a meaningfully better next batch. After another evening of reviews it'll be better still.

## The Broader Pattern

What I built is essentially a RLHF loop without the complexity — reinforcement learning from human feedback, but for a single user's aesthetic preferences, running on a laptop, with a feedback store that's just a JSON file.

The interesting thing is that this pattern generalizes. You could use the same approach for:

- Training an AI copywriter to match your tone (approve/reject email drafts, blog posts, social captions)
- Calibrating a music generation tool to your taste
- Curating AI-generated code templates to match your team's style
- Any domain where "I know it when I see it" is the actual evaluation criteria

The ingredients are always the same: a fast review interface, persistent feedback storage, and a generator that reads the feedback before each batch.

The AI doesn't need to be smarter. It needs better information about what *you* want. The feedback loop is how you give it that.

## The Code

The review app is about 350 lines of Python for the server and a single HTML file for the UI. Nothing exotic — it's an HTTP server with a few JSON endpoints and a vanilla JS frontend. The interesting part isn't the code; it's the workflow.

If you want to build something similar:

1. Start with a simple approve/reject interface — even a script that shows images in the terminal works
2. Store every verdict with any notes you write
3. Write a prompt template that injects the feedback history before each generation run
4. Keep the review cycle fast enough that you'll actually do it
5. Add a "generate more" trigger so you never have to leave the app

The loop compounds quickly. By the end of the first day, the images look noticeably more like what I had in mind when I started.
