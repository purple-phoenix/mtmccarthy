---
title: "V* Is the Perfect A* Heuristic"
date: "2026-07-06"
category: "AI & Machine Learning"
excerpt: "The optimal value function from reinforcement learning is the perfect heuristic for A* — not a metaphor, the same mathematical object. That one identity explains what learned heuristics are actually approximating, and why admissibility is the thing they risk losing."
read_time: "9"
---

In my [learned search roadmap](/blog/learned-search-self-study-roadmap) I claimed that the optimal value function `V*` from reinforcement learning is *literally* the optimal heuristic `h*` for A\* search — the same mathematical object studied by two communities that mostly don't talk to each other. That post spent the observation on a study plan. This one is the promised sequel: what the identity actually says, why it makes `V*` the *perfect* heuristic in a precise technical sense, and how it turns "learn a heuristic" and "learn a value function" into the same problem.

## What a heuristic buys you

When a human looks at a 2D map, they get a bird's-eye view: without tracing any roads, they can spot the rough direction of the goal. That intuition is exactly what the straight-line-distance heuristic gives A\*. It's worth being precise about what's happening there, because it's commonly misdescribed. Dijkstra's algorithm and BFS aren't *blind* — they have the entire graph in hand, every node and every edge. What they lack is a heuristic, so they expand outward uniformly in every direction, like a flood fill. The bird's-eye advantage isn't extra information about the graph. It's a *heuristic*: a cheap estimate of remaining cost that lets the search order its work.

A\* formalizes this. It expands nodes in order of `f(n) = g(n) + h(n)`, where `g(n)` is the known cost from the start to `n` and `h(n)` estimates the cost from `n` to the goal. Two properties of `h` do all the work in the classical theory:

- **Admissibility**: `h(n) ≤ h*(n)` for every node, where `h*(n)` is the *true* optimal cost-to-go. An admissible heuristic never overestimates, and it's the hypothesis of the classical theorem: A\* with an admissible heuristic returns an optimal path.
- **Consistency**: `h(n) ≤ c(n, n') + h(n')` for every edge — a triangle inequality. Consistency implies admissibility and guarantees A\* never needs to re-expand a node.

And there's a third idea that gets less airtime than it deserves: **informedness**. Among admissible heuristics, bigger is better. If `h₁(n) ≥ h₂(n)` everywhere (both admissible), then A\* with `h₁` expands no more nodes than A\* with `h₂`. The heuristic `h = 0` is admissible — that's just Dijkstra — but it's maximally uninformed. The entire game of heuristic design is pushing `h` up toward `h*` without crossing it.

So what's at the top of that ladder?

## The perfect heuristic already has a name

The ceiling is `h*` itself: the true optimal cost-to-go from each node. Plug it in and look at what happens. `h*` is admissible — with equality, the only heuristic that touches the ceiling everywhere. It's consistent, because true optimal costs satisfy the triangle inequality by definition: the optimal cost from `n` can't beat "one step to `n'`, then optimal from there." And it's maximally informed: every other admissible heuristic sits at or below it.

With `h = h*`, every node on an optimal path has `f(n) = g(n) + h*(n) = C*`, the optimal solution cost, and every node off every optimal path has `f(n) > C*`. A\* never expands a node with `f` above `C*`, so it expands *only* nodes on optimal paths — with decent tie-breaking, it walks straight from start to goal, expanding one node per step. Zero search. The heuristic already did all the work.

Here's the punchline. Reinforcement learning has a name for "the true optimal cost-to-go from each state": it's the **optimal value function**,

```
V*(s) = expected cost-to-go from state s under the optimal policy
```

In a deterministic shortest-path problem the expectation collapses and this is exactly `h*`:

```
h*(n) = V*(n)
```

Not analogous. Not "related in spirit." The same function, wearing different notation in different textbooks. The AI-search literature calls it the perfect heuristic and treats it as an unreachable ideal to approximate by hand — relax the problem, take a max over pattern databases, and so on. The RL literature calls it the optimal value function and treats it as the thing to *learn* — that's what value iteration, TD-learning, and Q-learning are all converging toward.

Which means **learning a heuristic and learning a value function are the same problem viewed from two angles.** A hand-designed heuristic like Manhattan distance is a closed-form lower bound on `V*`. A learned heuristic is a function approximator `ĥ_θ(n) ≈ V*(n)`. Once you see this, a lot of otherwise-separate literature snaps into one picture — AlphaZero's value network, for instance, is doing for game-tree search exactly what a learned heuristic does for A\*.

## Watch the identity work

The interactive grid below makes the informedness ladder concrete. Same maze, same A\* implementation, three heuristics: `h = 0` (Dijkstra — the flood fill), Manhattan distance (admissible, but blind to walls — it gets lured into the pocket), and `h = V*` (the exact cost-to-go, computed by solving the maze from the goal backwards). With `V*`, watch A\* expand only the nodes on the optimal path — the "zero search" behavior the theory promises.

The `V*` demo is admittedly a party trick: computing exact cost-to-go for every cell means solving the whole problem backwards first, which is precisely why nobody hands A\* the perfect heuristic in practice. The point is what it shows — search effort is exactly the gap between your `h` and `V*`. Every improvement in the heuristic is a refund on search.

## When there's no geometry to lean on

Straight-line and Manhattan distance work because those graphs are embedded in a geometric space where spatial distance is a meaningful proxy for path cost. That's a luxury. Abstract graphs — dependency DAGs, puzzle state spaces, classical planning problems, combinatorial search spaces — have no coordinates to measure between. No bird's-eye view exists to borrow from geometry. This is the gap **learned heuristics** fill, and the `V* = h*` identity organizes the approaches into three families by *where the training signal comes from*:

**1. Supervised learning.** Run a classical solver (Dijkstra, A\*) on many small instances to generate ground-truth `h*` labels, then train a network `ĥ_θ(n) ≈ h*(n)` from node features. Simplest option, works well when optimal labels are cheap to generate. The catch: nothing about regression preserves admissibility, so the optimality guarantee is gone the moment you swap in the learned function.

**2. Reinforcement learning.** Frame the search as an MDP and learn `V_θ(s)` directly via TD-learning, Q-learning, or policy gradients — the learned value function *is* the heuristic, no relabeling needed. This is the right tool when the state space is too large to solve exactly, because it needs no labeled optima — just a reward signal and exploration. AlphaZero's value network is this idea applied to game trees.

**3. Self-supervised / end-to-end.** Differentiate through the search algorithm itself and train `ĥ_θ` to minimize *search-tree size* directly, using the search outcome as the supervisory signal. [Neural A\*](https://arxiv.org/abs/2009.07476) (Yonetani et al., ICML 2021) is the canonical example. This family optimizes the thing you actually care about — total search effort — rather than prediction accuracy as a proxy for it.

Choosing between them comes down to three questions:

| Question | If yes, use |
|---|---|
| Can you cheaply generate optimal labels? | Supervised |
| Is the state space too big to solve exactly? | RL |
| Do you care about minimizing the search itself, not just predicting distance? | End-to-end |

## What learning breaks

The classical guarantees don't survive the trip for free, and the failure modes are worth naming:

- **Admissibility is not preserved by learning.** A regression model fit to `h*` will overestimate on roughly half its errors, and a single overestimate can break A\*'s optimality guarantee — the proof requires `h(n) ≤ h*(n)` pointwise, not on average. Some papers add explicit admissibility constraints or one-sided losses; many just accept suboptimal solutions and report how close they get. Know which trade you're making.
- **Distribution shift.** A heuristic trained on one distribution of graphs can fail quietly on another — the network learned statistics of the training mazes, not the concept of distance. Generalization across instance sizes and distributions is an open research area.
- **Architecture matters for abstract graphs.** For non-geometric state spaces, graph neural networks are the dominant choice, because they're permutation-equivariant and compute from local neighborhood structure — the same invariances the true `V*` has.

## Where to go deeper

The two anchors are the two sides of the identity: [Sutton & Barto](http://incompleteideas.net/book/the-book-2nd.html) chapters 3–6 for value functions and TD-learning, and Russell & Norvig chapters 3–4 for heuristic search — read side by side, the connection is hard to miss. For learned heuristics specifically: [Arfaee, Zilles & Holte (2011)](https://doi.org/10.1016/j.artint.2011.08.001) is the idea in its simplest pre-deep-learning form (bootstrap a weak heuristic by solving easy problems and retraining on the solutions), [Neural A\*](https://arxiv.org/abs/2009.07476) is the modern differentiable version, and the [Cappart et al. JMLR survey](https://arxiv.org/abs/2102.09544) maps the whole GNN-for-combinatorial-optimization landscape.

This post is the theory checkpoint for the [learned search roadmap](/blog/learned-search-self-study-roadmap) — the identity that makes classical search and RL one subject. The next installment in the sequence is the build: a learned heuristic on the 15-puzzle, where the admissibility question stops being theoretical.
