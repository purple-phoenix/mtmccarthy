---
title: "My Math Self-Study Roadmap: Pure Math, Applied Math, and Statistics"
date: "2026-07-01"
category: "Mathematics"
excerpt: "The multi-year plan I'm using to fill the math gaps a CS degree leaves behind — real analysis, abstract algebra, probability — built mostly on free textbooks and weighted toward what I can actually use."
read_time: "10"
---

I have a BS in computer science and I'm partway through an MS. That means I've done a lot of math-adjacent work — proof-based algorithms, applied linear algebra, calculus — without ever building the foundation that mathematicians consider table stakes: rigorous real analysis, abstract algebra, topology, and a real treatment of probability. This post is the roadmap I'm using to fix that, and the reasoning behind each choice.

Two things shaped the plan. The first is a [video by Aleph 0](https://www.youtube.com/watch?v=byNaO_zn2fI) laying out a self-study path through pure math using mostly free materials. It's a great skeleton, but it only covers pure math, so I extended it with applied math and statistics tracks — because for someone doing ML and CS work, those are where the leverage is. The second is a bias I'm applying throughout: **weight the plan toward what's leverageable**. Every topic here should eventually pay off in a blog post, a side project, or a better grasp of the ML and algorithms work I already do.

This is a living roadmap. I'll update it as I go, and the plan explicitly includes writing follow-up posts as topics land — more on that at the end. It also has a sibling: a [learned search and reinforcement learning roadmap](/blog/learned-search-self-study-roadmap) that consumes the math this plan produces. That plan applies the probability, analysis, and optimization; this one supplies them.

## Where I'm starting from

An honest inventory matters, because it determines where you enter the curriculum. Mine looks like this:

- AP Calc BC, plus multivariable calculus and ODEs at the intro level (I TA'd both)
- Graduate linear algebra taught from Strang — computational and applied in flavor
- A proof-based Advanced Algorithms course: divide and conquer, DP, greedy, hashing, MST, min-cut, max-flow, NP-hardness, linear programming, matroids, approximation and randomized algorithms

That last one is the important entry ticket. If you've written and been graded on real proofs — even algorithmic ones — you can skip the "introduction to proofs" phase entirely. No Hammack, no Velleman, no Spivak warm-up. I'm jumping straight into analysis and abstract linear algebra.

The biggest gaps, in rough order of embarrassment: rigorous real analysis, abstract algebra, topology, complex analysis, and probability/statistics. That gap list is basically the table of contents for the rest of this post.

## How I actually work through this

A multi-year plan lives or dies on its operating principles, not its book list. Mine:

- **Sustainable cadence.** 5–15 hours a week, indefinitely. Consistency beats intensity — this is a years-long project and sprinting at it is how self-study plans die.
- **Problems over reading.** Per chapter: read once for shape, read again with a pen, then spend the remaining time — roughly 70% of the total — on problems. Math you haven't done problems on is math you don't know.
- **One anchor book per topic.** Supplement only when stuck. Book-hopping feels productive and isn't.
- **AI as a Socratic TA, not a solver.** I work problems and proofs myself; I use Claude for hints, leading questions, and pointers at the right definition or technique — never for solutions. For meta-questions (which book, what order, what to skip) I take direct answers. This division has been the single biggest quality-of-life improvement over past self-study attempts.
- **Move on at ~80%.** Anki for definitions and theorem statements, LaTeX for written-up solutions, and a hard rule against perfect-finishing a chapter. Done-enough and moving is worth more than complete and stalled.
- **Write as I go.** Every quarter I write a short "what I learned" memo, and the best ones become blog posts here.

## Phase 1 — active now (3–6 months)

Three concurrent tracks: two that need sit-down focus, one that runs in the background.

**Real analysis** is the primary pure track. The anchor is Abbott's *Understanding Analysis*, which is the consensus pick for a first rigorous analysis course — it's genuinely readable without being watered down. I'm pairing it with [Francis Su's real analysis lectures](https://www.youtube.com/playlist?list=PL0E754696F72137EC), which are free and excellent. Plan: chapters 1 through 8, one chapter every 2–3 weeks, star-marked problems at minimum. After Abbott, the options are baby Rudin for a hardening pass or rolling straight into measure theory.

**Linear algebra, upgraded.** I already have Strang's computational view of linear algebra; the anchor here is Axler's *Linear Algebra Done Right* (the 4th edition is [free and open access](https://linear.axler.net/)), supported by [Axler's own lecture playlist](https://www.youtube.com/playlist?list=PLGAnmvB9m7zOBVCZBUUmSinFV0wEir2Vw). The point isn't relearning linear algebra — it's acquiring the coordinate-free, determinant-free view of finite-dimensional spectral theory that Strang deliberately avoids. Having the computational side already means this track moves fast.

**Probability** is the background track, and it's my single biggest gap. The anchor is Blitzstein and Hwang's *Introduction to Probability*, and the whole of [Harvard's Stat 110 lecture series](https://www.youtube.com/playlist?list=PL2SOU6wwxB0uwwH80KTQ6ht66KWxbzTIo) is free online, including [William Chen's excellent probability cheatsheet](https://www.wzchen.com/probability-cheatsheet). Because it's lecture-driven, this track fits into commutes and cooking, with key problems worked on weekends.

## Phase 2 — the next 12–18 months

Once Abbott and the probability foundation land, the plan branches into three parallel tracks.

**Pure track** (this is the Aleph 0 path): point-set topology via the [University of Toronto MAT327 course notes](https://www.math.toronto.edu/ivan/mat327/) — nineteen chapters, problem-heavy, and free; group theory via Pinter's *A Book of Abstract Algebra* (a gentle Dover paperback), escalating to Herstein if I want depth, with [Benedict Gross's Harvard lectures](https://www.youtube.com/playlist?list=PLelIK3uylPMGzHBuR3hLMHrYfMqWWsmx5) alongside; and complex analysis starting from Wegert's *Visual Complex Functions* before a proper pass through Stein and Shakarchi.

**Applied track:** the headline item is convex optimization via Boyd and Vandenberghe's *Convex Optimization* — the [full book is free from Stanford](https://web.stanford.edu/~boyd/cvxbook/), along with the lectures. I've marked this high priority because it's the natural continuation of the LP, max-flow, and approximation material from Advanced Algorithms, and because it feeds directly into the optimization theory my [learned search roadmap](/blog/learned-search-self-study-roadmap) leans on. The rest of the applied track: a multivariable-and-differential-forms upgrade via Hubbard and Hubbard, dynamical systems via Strogatz's *Nonlinear Dynamics and Chaos*, and numerical linear algebra via Trefethen and Bau.

**Stats track:** Wasserman's *All of Statistics* for breadth in mathematical statistics, then statistical learning via [*An Introduction to Statistical Learning*](https://www.statlearning.com/) (gentle, free) followed by [*The Elements of Statistical Learning*](https://hastie.su.domains/ElemStatLearn/) (depth, also free).

## Phase 3 — the long horizon (18+ months)

This far out, the plan is a direction rather than a schedule. On the pure side: Galois theory via [Tom Leinster's free lecture notes](https://arxiv.org/abs/2408.07499), differential geometry via Lee's *Introduction to Smooth Manifolds*, algebraic topology via [Hatcher's free textbook](https://pi.math.cornell.edu/~hatcher/AT/ATpage.html) paired with [Pierre Albin's lectures](https://www.youtube.com/playlist?list=PL41FDABC6AA085E78), and measure theory via Folland. Applied: PDEs via Strauss. Stats: Casella and Berger for depth, Gelman et al.'s *Bayesian Data Analysis* (the PDF is free via [Aki Vehtari's course page](https://avehtari.github.io/BDA_course_Aalto/)), and eventually Durrett's [*Probability: Theory and Examples*](https://services.math.duke.edu/~rtd/PTE/pte.html) — the rigorous, measure-theoretic treatment that everything earlier builds toward.

## A note on the free bookshelf

A striking amount of this curriculum costs nothing. Axler, Boyd and Vandenberghe, ISLR, ESL, Hatcher, Leinster's Galois notes, BDA3, Durrett, the MAT327 notes, and the Stat 110 materials are all legitimately free from their authors or publishers. The books that aren't free — Rudin, Strogatz, Trefethen and Bau, Wasserman, Casella and Berger, Stein and Shakarchi — are mostly Phase 2+ concerns, and university library access covers most of them. Pinter is a $15 Dover paperback. The real cost of this plan is time, which is exactly how it should be.

## What I'll write along the way

Part of the "leverageable" bias is picking topics where the blog post is half-written by the time the chapter is done. Some of what's coming as this roadmap unfolds: the spectral theorem without determinants (Axler's way versus Strang's), LP duality as the gateway drug to convex optimization, bloom filters as applied probability, what ε–δ reasoning buys you when thinking about floating-point, and "what is a topology, really?" for software engineers.

This post is the anchor for all of that. As phases complete and the plan inevitably changes on contact with reality, I'll update it here and link the follow-ups. If you're a CS person staring at the same gaps, I hope the reasoning above — not just the book list — is the useful part.
