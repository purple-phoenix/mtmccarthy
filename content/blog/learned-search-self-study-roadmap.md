---
title: "My Learned Search Roadmap: From A* to Reinforcement Learning and Back"
date: "2026-07-01"
category: "AI & Machine Learning"
excerpt: "The optimal value function in reinforcement learning is literally the optimal heuristic for A* search. That one observation collapsed classical AI and deep RL into a single subject for me — and produced this multi-year study plan."
read_time: "10"
---

Here is the observation that produced this entire plan: the optimal value function `V*(s)` from reinforcement learning is *literally* the optimal heuristic `h*(n)` for A\* search. Not analogous to it — the same mathematical object, studied by two communities that mostly don't talk to each other. Once you see that, classical heuristic search and modern deep RL stop being two subjects and become one subject viewed from two sides: how do machines learn to make good sequential decisions?

I'm a CS grad student with a strong classical-algorithms foundation and essentially zero formal exposure to RL or graph neural networks. This post is my multi-year roadmap for closing that gap — classical heuristic search, then reinforcement learning, then GNNs, then the research frontier where they meet: neural combinatorial optimization and neural algorithmic reasoning. As with my [math self-study roadmap](/blog/math-self-study-roadmap), the point of publishing it is the reasoning, not just the book list. The two plans are siblings: that one supplies the math (probability, analysis, convex optimization), and this one spends it.

## Where I'm starting from

- A proof-based Advanced Algorithms course: graph algorithms, max-flow/min-cut, LP, NP-hardness, randomized and approximation algorithms
- Coursework covering classical search — uninformed and informed search, A\*, admissibility, consistency
- In-progress coursework in machine learning and neural network fundamentals
- Applied linear algebra (Strang)

The gaps: reinforcement learning (nothing formal), GNNs (nothing at all), and the measure-theoretic probability and analysis rigor that the theory eventually demands — which is exactly what the [math plan](/blog/math-self-study-roadmap) exists to backfill. The classical foundation means no phase zero: I can start directly with the canonical RL text.

## How this plan differs from the math one

Same operating principles — one anchor book plus one lecture series per topic, a sustainable 5–10 hours a week, Anki for definitions, quarterly write-up memos, move on at ~80% rather than perfect-finishing, and AI as a Socratic TA for derivations and problem sets rather than an answer machine.

But there's one key difference: **this track is implementation-heavy.** The proofs matter, but the bigger payoff is being able to build and benchmark these systems. So the time split shifts to roughly 50% implementation, and the output discipline is stricter: every algorithm I study, I implement; every implementation gets a writeup. PyTorch for the RL and GNN work, and everything lands in a public repo.

## Phase 1 — active now (3–6 months)

The goal of this phase is mastering foundations before touching anything deep.

**Reinforcement learning foundations** is the primary track. The anchor is Sutton and Barto's *Reinforcement Learning: An Introduction*, 2nd edition — [the full book is free from the authors](http://incompleteideas.net/book/the-book-2nd.html). This is THE book; every modern paper assumes you've read it, and skipping straight to deep RL without it is the standard mistake in this field. I'm pairing it with [David Silver's ten-lecture RL course](https://www.davidsilver.uk/teaching/), the canonical free lecture series. Plan: one chapter every week or two, chapters 1–8 minimum and ideally through 13, implementing every major algorithm from scratch in NumPy along the way — policy iteration, value iteration, TD(0), Q-learning, SARSA, REINFORCE.

**Classical search, the depth pass** is the secondary track. I have the textbook understanding of A\* from coursework; this is the pass where I implement A\*, IDA\*, and RBFS from scratch, then build my first *learned* heuristic: the bootstrapping approach from [Arfaee, Zilles, and Holte's 2011 paper on learning heuristic functions](https://doi.org/10.1016/j.artint.2011.08.001), applied to the 15-puzzle. It's concrete, self-contained, and uses classical ML rather than deep learning — the ideal first contact with the learned-search idea before any neural networks get involved.

**Background:** skimming chapters 6–9 of Goodfellow, Bengio, and Courville's [*Deep Learning*](https://www.deeplearningbook.org/) (free online) to shore up neural-net fundamentals wherever coursework hasn't reached yet.

## Phase 2 — the next 12–18 months

Three tracks, and this is where the plan gets exciting.

**Deep RL.** [Berkeley's CS285](https://rail.eecs.berkeley.edu/deeprlcourse/) (Sergey Levine) replaces Silver as the primary lecture series — it's the modern, research-oriented deep RL course. For theory, [Szepesvári's *Algorithms for Reinforcement Learning*](https://sites.ualberta.ca/~szepesva/rlbook.html) (free) plus selected chapters of [Bertsekas's *Reinforcement Learning and Optimal Control*](https://www.mit.edu/~dimitrib/RLbook.html). Topics: the DQN family, policy gradients (PPO, A2C), actor-critic methods, AlphaZero-style MCTS-plus-network, and model-based RL. Implementations: DQN (CartPole first, then Atari), PPO on continuous control, and a minimal AlphaZero on Connect Four.

**Graph neural networks.** Anchor: Hamilton's [*Graph Representation Learning*](https://www.cs.mcgill.ca/~wlh/grl_book/) (free), with [Stanford's CS224W](https://web.stanford.edu/class/cs224w/) (Jure Leskovec) as the lecture series and Bronstein et al.'s [*Geometric Deep Learning*](https://arxiv.org/abs/2104.13478) proto-book for the symmetries-and-groups framing. Topics: GCN, GAT, the message-passing framework, GraphSAGE, and the Weisfeiler–Lehman expressiveness limits. Implementations build from node classification on Cora up to the project I'm most excited about in the whole plan: **a learned heuristic on a random-graph shortest-path benchmark** — the direct bridge from the `V* = h*` observation to running code.

**Neural algorithmic reasoning** is the bridge track, and it's a paper sequence rather than a book: [Khalil et al., "Learning Combinatorial Optimization Algorithms over Graphs"](https://arxiv.org/abs/1704.01665) (NeurIPS 2017), [Veličković et al., "Pointer Graph Networks"](https://arxiv.org/abs/2006.06380) (NeurIPS 2020), [Yonetani et al., "Path Planning Using Neural A\* Search"](https://arxiv.org/abs/2009.07476) (ICML 2021), and the [CLRS algorithmic reasoning benchmark](https://arxiv.org/abs/2205.15659) — a GNN attempting to imitate every algorithm in the CLRS textbook. The capstone project for this track: reproduce Neural A\* on a maze dataset and write up exactly where it differs from classical A\*.

## Phase 3 — the long horizon (18+ months)

**Theory consolidation:** Bertsekas's *Dynamic Programming and Optimal Control* for the rigorous foundations underneath Sutton and Barto, Edelkamp and Schrödl's *Heuristic Search* as the encyclopedic classical reference, and Korte and Vygen's *Combinatorial Optimization* — the classical theory of exactly what neural combinatorial optimization is trying to learn.

**Frontier areas I'll be following:** neural algorithmic reasoning (Veličković's research program and the CLRS benchmark's progress), the "differentiable everything" direction — differentiable sorting, differentiable physics, differentiable A\* — where the algorithm becomes part of the gradient graph, world models in the MuZero lineage, and LLM-as-planner work like Tree-of-Thoughts, which intersects directly with my day-job interest in agents.

The habit that holds this phase together: one paper a week from the learned-search and NAR literature, each logged with a three-sentence summary.

## Open questions I'm carrying

Part of keeping a roadmap honest is writing down what you don't understand yet. Three questions I want answers to by the end of Phase 2:

- How exactly does Neural A\* preserve — or fail to preserve — admissibility?
- Is there a clean characterization of which problems benefit from learned heuristics versus hand-designed ones?
- How does MCTS in AlphaZero relate to A\*? Is it strictly more general, or a different family entirely?

## What I'll write along the way

Like the [math roadmap](/blog/math-self-study-roadmap), this plan is biased toward topics where the writeup is half-done when the project is: why RL and A\* are the same algorithm ([the `V* = h*` post](/blog/v-star-perfect-astar-heuristic) — arguably this one's real sequel, now written), building a learned heuristic on the 15-puzzle in a couple hundred lines of Python, from Q-learning to AlphaZero in five algorithms, whether GNN heuristics generalize across graph size and distribution shift, and reproducing Neural A\* from scratch.

This is a living roadmap. Plans like this always change on contact with the material — anchors get swapped, phases stretch, projects mutate. I'll keep this post updated as that happens and link the follow-up posts here as they land.
