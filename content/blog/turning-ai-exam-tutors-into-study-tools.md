---
title: Turning AI-Generated Exam Tutors into Public Study Tools
date: 2026-07-11
category: Artificial Intelligence
excerpt: How four one-off exam tutors became private-by-design, offline-capable interactive study pages with instant browser-based feedback.
read_time: 7 min read
---

Studying with an AI tutor can be useful, but the first version of a tool is often tied to the conversation that created it. Answers may be sent back to an agent, diagrams may depend on a JavaScript CDN, and the page may contain clues about the local environment where it was built. That is fine for a private session. It is the wrong shape for a durable public resource.

I recently adapted four AI-generated tutors into standalone study tools:

- [Constraint Satisfaction](/study/constraint-satisfaction) covers AC-3, minimum remaining values, least-constraining values, and cycle-cutset conditioning.
- [Bayesian Networks](/study/bayesian-networks) covers parameter counting, d-separation, and query factorization.
- [Bayes–Nash Equilibrium](/study/bayes-nash-equilibrium) turns an incomplete-information game into a normal form and checks the equilibrium under two priors.
- [First-Order Logic](/study/first-order-logic) practices translation to FOL and CNF before walking through a resolution proof.

## From conversation interface to study interface

The original tutors treated each answer as the beginning of another AI conversation. A button gathered the learner's work and queued a prompt for an agent to review. That interaction is flexible, but it also makes the page dependent on a particular runtime and leaves the learner waiting for an external response.

The public versions use a narrower contract: every exercise has a known answer and an explanation that can be evaluated entirely in the browser. Multiple-choice questions work well for conceptual distinctions. Numeric fields work for parameter counts. Short normalized fields preserve the useful experience of filling in a game matrix without requiring a server.

The important design choice was not to turn everything into trivia. The feedback explains the reasoning: which arcs wake up after a domain shrinks, why observing a collider's descendant opens a path, or how a resolution sequence reaches a contradiction. A correct/incorrect badge is only the start of the learning loop.

## Making each page self-contained

Portable study tools should keep working when the network does not. Each tutor therefore includes its own styling, diagrams, answer data, grading logic, and explanations in the rendered page. There are no font requests, diagram libraries, analytics calls, API requests, or answer submissions.

That constraint led to simpler visuals. Small semantic HTML diagrams replaced a full graph-rendering dependency. Tables and labeled nodes are easier to inspect, faster to render, and more accessible than a decorative graph that disappears when a CDN is unavailable.

The adaptation also included a privacy pass. Private labels, local context, and named scenarios that were unnecessary to the concepts were removed or generalized. The browser receives only what a learner needs to work the problem.

## Deterministic feedback has limits—and advantages

A client-side checker cannot judge every creative proof or diagnose every misconception. It works best when the interaction is deliberately structured around the concept being tested. The first-order logic tutor, for example, uses carefully chosen alternatives for each transformation and key resolution step instead of pretending that a tiny script can reliably grade arbitrary symbolic logic.

That narrower scope brings real advantages:

- Feedback is immediate and consistent.
- Answers never leave the learner's device.
- The page has no service cost or availability dependency.
- Exercises are easy to test in an automated browser.
- The tools remain useful long after the original AI conversation is gone.

AI was valuable for rapidly shaping the explanations and interactions. The lasting product came from treating that output as a prototype: removing hidden dependencies, constraining the grading problem, checking the math, and integrating the result into the same navigation and visual language as the rest of the site.

You can browse all four from the [interactive study tools index](/study).
