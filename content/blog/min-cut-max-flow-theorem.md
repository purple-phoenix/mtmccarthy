---
title: "Min Cut and the Max-Flow Min-Cut Theorem"
date: "2026-04-01"
category: "Algorithms"
excerpt: "The minimum cut of a network equals its maximum flow — one of the most elegant duality results in computer science. Here's how it works and how to find it."
read_time: "13"
---

Here's a different question about the same water pipe network: instead of asking how much flow you can push through, ask how little you'd have to destroy to stop *any* flow from getting through at all. What's the cheapest set of pipes to cut that completely disconnects the source from the reservoir?

This is the **minimum s-t cut problem**, and it turns out to be inseparable from the max flow problem. The two quantities are always equal — a fact that's surprising when you first see it, and obvious once you understand why.

## Cuts and Their Capacity

A **cut** (S, T) in a flow network is a partition of the vertices into two sets S and T, where the source s ∈ S and the sink t ∈ T. The **capacity** of a cut is the total capacity of all edges going from S to T:

```
capacity(S, T) = sum of c(u, v) for all u in S, v in T
```

Notice that only edges going *from* S *to* T count — edges going the other direction are ignored. This is intentional: removing the forward edges severs all s-to-t paths (since every such path must cross from S to T at some point), while backward edges never carry flow toward t.

The minimum cut is the partition that minimizes this capacity. In a physical network it represents the bottleneck: the set of edges that, if removed, would halt all flow at minimum cost.

## The Theorem

The **Max-Flow Min-Cut theorem**, proven by Ford and Fulkerson in 1956, states:

> In any flow network, the maximum value of an s-t flow equals the minimum capacity of an s-t cut.

This is a strong statement. There's no obvious reason the maximum flow should have anything to do with the minimum cut — one is an optimization over flow assignments, the other over graph partitions. Yet they're always equal, in every network, with any capacities.

The "max flow ≤ min cut" direction is easy: for any valid flow f and any cut (S, T), the flow value is at most the capacity of the cut. Every unit of flow must cross from S to T, and the total crossing capacity bounds the flow. More formally, by flow conservation, the flow value equals the net flow across any cut, which is at most the sum of capacities of forward edges.

The "max flow ≥ min cut" direction is where the real content lies. The argument is constructive: given a completed max flow (one where no augmenting path exists in the residual graph), you can always exhibit a cut whose capacity exactly equals the flow value. Here's how.

## Finding the Min Cut from a Max Flow

After running any max flow algorithm to completion, the residual graph encodes exactly the information you need:

1. Do a BFS (or DFS) from s in the **residual graph**, using only edges with positive residual capacity.
2. Let S = the set of nodes reachable from s in this BFS.
3. Let T = all other nodes (including t, since if t were reachable, we'd have found another augmenting path).

The cut (S, T) is a minimum cut. Every original edge from S to T must be fully saturated (otherwise there would be residual capacity and the endpoint would be in S). Every original edge from T to S has no flow (otherwise the backward edge would have positive residual capacity, connecting T back into S via the reverse direction).

The capacity of this cut equals the net flow across it, which equals the flow value. And since the flow value ≤ any cut capacity, this cut must be minimum.

This is the proof of the theorem, hiding in plain sight: the BFS-reachable set after a max flow always defines a minimum cut.

## Python Implementation

Here's a self-contained implementation that runs Edmonds-Karp max flow and then finds the minimum cut:

```python
from collections import deque


def edmonds_karp(graph, source, sink):
    """
    Find maximum flow using Edmonds-Karp (Ford-Fulkerson with BFS).

    Modifies graph in place — graph[u][v] becomes the residual capacity
    after the algorithm finishes. This residual graph is used to find the
    minimum cut.

    Returns the maximum flow value.
    """
    max_flow = 0

    while True:
        parent = _bfs(graph, source, sink)
        if parent is None:
            break  # No augmenting path — max flow reached

        # Find bottleneck capacity along the augmenting path
        path_flow = float('inf')
        v = sink
        while v != source:
            u = parent[v]
            path_flow = min(path_flow, graph[u][v])
            v = u

        # Push flow along the path
        v = sink
        while v != source:
            u = parent[v]
            graph[u][v] -= path_flow  # use up forward capacity
            graph[v][u] += path_flow  # open up backward capacity
            v = u

        max_flow += path_flow

    return max_flow


def _bfs(graph, source, sink):
    """BFS on residual graph; returns parent dict or None if sink unreachable."""
    parent = {source: None}
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v, cap in graph[u].items():
            if v not in parent and cap > 0:
                parent[v] = u
                if v == sink:
                    return parent
                queue.append(v)
    return None


def find_min_cut(original_edges, nodes, source, sink):
    """
    Find the minimum s-t cut in a flow network.

    Args:
        original_edges: list of (u, v, capacity) tuples
        nodes:          list of all node labels
        source:         source node label
        sink:           sink node label

    Returns:
        (max_flow_value, cut_edges) where cut_edges is a list of
        (u, v, capacity) tuples crossing the min cut from S to T.
    """
    # Build the residual graph with all reverse edges initialized to 0
    graph = {u: {v: 0 for v in nodes} for u in nodes}
    for u, v, cap in original_edges:
        graph[u][v] += cap

    # Run max flow — graph is now the residual graph
    max_flow_val = edmonds_karp(graph, source, sink)

    # BFS on residual graph to find nodes reachable from source
    reachable = {source}
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v, cap in graph[u].items():
            if v not in reachable and cap > 0:
                reachable.add(v)
                queue.append(v)

    # The min cut consists of original edges crossing from S (reachable) to T
    cut_edges = [
        (u, v, cap)
        for u, v, cap in original_edges
        if u in reachable and v not in reachable
    ]

    return max_flow_val, cut_edges


# ── Example network ────────────────────────────────────────────────────────────
nodes = ['s', 'A', 'B', 'C', 'D', 't']
edges = [
    ('s', 'A', 10), ('s', 'B', 8),
    ('A', 'C', 6),  ('A', 'B', 4),
    ('B', 'D', 10),
    ('C', 't', 9),
    ('D', 'C', 3),  ('D', 't', 7),
]

flow, cut = find_min_cut(edges, nodes, 's', 't')

print(f"Maximum flow: {flow}")
print(f"Minimum cut edges:")
for u, v, cap in cut:
    print(f"  {u} -> {v}  (capacity {cap})")
print(f"Total cut capacity: {sum(cap for _, _, cap in cut)}")
```

Running this on our example network produces:

```
Maximum flow: 16
Minimum cut edges:
  A -> C  (capacity 6)
  B -> D  (capacity 10)
Total cut capacity: 16
```

The minimum cut partitions the network into S = {s, A, B} and T = {C, D, t}. The two edges crossing from S to T — A→C (capacity 6) and B→D (capacity 10) — together have capacity 16, exactly matching the max flow. If you removed these two edges from the network, no water could flow from s to t. No smaller set of edges can achieve this.

## Why This Makes Sense Intuitively

Look at the structure of the example. Every unit of flow leaving s must eventually pass through either A→C or B→D. There's simply no other way to reach t:

- Flow going s→A can reach t only via A→C (then C→t) or via A→B→D (which also crosses B→D).
- Flow going s→B can reach t only via B→D.

A→C and B→D are a "waist" of the network — a bottleneck that all flow must pass through. Their combined capacity, 16, is both the throughput limit and the minimum damage needed to disconnect the network. The theorem says this is always the case: the bottleneck for flow and the minimum cut are the same thing.

## Applications

The min cut has a rich set of applications beyond the max flow ones we discussed before.

**Network reliability**: Given a communication network where edges fail with certain probabilities, the minimum cut identifies the most vulnerable set of links — the ones whose simultaneous failure isolates part of the network. Hardening those edges gives the most reliability improvement per unit of cost.

**Image segmentation**: Graph-cut segmentation (used in algorithms like GrabCut) models the problem as a min cut. Pixels become nodes; edge weights encode how similar adjacent pixels are and how likely each pixel is to belong to foreground or background. The min cut separates foreground from background with minimum "cost" — maximum consistency with both smoothness and color priors. This application drove enormous interest in fast max flow algorithms in the 2000s.

**König's theorem and bipartite vertex cover**: In a bipartite graph, the minimum vertex cover (minimum number of vertices that touch every edge) equals the maximum matching. This is König's theorem, and it follows directly from the max-flow min-cut theorem. The reduction encodes the bipartite graph as a flow network; the max flow gives a maximum matching, and the min cut structure gives the minimum vertex cover.

**Gomory-Hu trees**: For undirected graphs, a Gomory-Hu tree compactly encodes all pairwise minimum cuts using only n−1 max flow computations. You can read off the min cut capacity between any pair of nodes from the minimum edge on the tree path between them.

## Global Min Cut: Stoer-Wagner

Everything so far is about *s-t* cuts — cuts that separate a specific source from a specific sink. Sometimes you want the *global* minimum cut: the partition that minimizes cut capacity over all possible (S, T) splits, without a fixed s and t.

The naive approach — run a max flow for every possible pair of source and sink — requires O(V²) max flow computations. The **Stoer-Wagner algorithm** (1997) solves global min cut in O(V³) time (or O(VE + V² log V) with a priority queue) using a beautiful phase-based approach that doesn't require running a full max flow at all.

The key insight is that in each phase, Stoer-Wagner identifies the best s-t cut for one particular pair (s, t) determined by the algorithm itself, then merges s and t into a single node and repeats. After V−1 phases you've found the global minimum cut. It's one of those algorithms that feels like it shouldn't work until you see the invariant.

Stoer-Wagner only applies to undirected graphs. For directed graphs, global min cut is harder — you're back to O(V) max flow computations in general.

## The Elegance of Duality

What I find most striking about the max-flow min-cut theorem is that it's a statement about two completely different-looking objects — flows and cuts — being numerically identical in every network.

This is an instance of **LP duality**. The max flow problem can be written as a linear program, and its dual LP turns out to be exactly the min cut problem. Strong duality of linear programming tells you their optimal values always match. The theorem isn't just a combinatorial curiosity; it's a special case of one of the deepest results in optimization.

The algorithmic consequence is just as striking. Running Edmonds-Karp doesn't just solve max flow — it simultaneously solves min cut, for free, in the residual graph it leaves behind. Two hard-looking problems collapse into one.

The residual graph after a max flow is a certificate of optimality. The unreachability of t from s proves there's no augmenting path (max flow is optimal). The partition of nodes by reachability gives the min cut (proving the flow value can't be exceeded by any flow). Both proofs come out of the same BFS.

That's the kind of structure that makes algorithms feel less like tricks and more like inevitabilities — things that could not have been otherwise.
