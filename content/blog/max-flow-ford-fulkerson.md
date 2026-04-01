---
title: "Max Flow: Finding the Maximum Through a Network"
date: "2026-04-01"
category: "Algorithms"
excerpt: "How do you find the maximum flow through a network? Explore Ford-Fulkerson, Edmonds-Karp, and how to build intuition with working Python code."
read_time: "14"
image_url: "/static/images/max-flow-ford-fulkerson.png"
---

Imagine a city's water distribution system: a pumping station connects through a tangle of pipes to a reservoir on the other side of town. Each pipe has a maximum capacity — some can handle 10 gallons per second, others only 3. You want to push as much water as possible from the station to the reservoir. How much can you actually move?

This is the maximum flow problem. It sounds like a plumbing question, but the same structure appears everywhere in computer science: scheduling jobs on machines, routing packets through a network, matching workers to tasks, even segmenting images. Getting comfortable with max flow means getting comfortable with a surprisingly broad class of problems.

## The Formal Setup

A flow network is a directed graph G = (V, E) with two special nodes: a **source** s (where flow originates) and a **sink** t (where flow is consumed). Each edge (u, v) has a non-negative capacity c(u, v) — the maximum amount of flow it can carry.

A valid flow assigns a value f(u, v) to each edge satisfying two constraints:

1. **Capacity constraint**: 0 ≤ f(u, v) ≤ c(u, v) for every edge
2. **Flow conservation**: for every node except s and t, the total flow in equals the total flow out

The value of the flow is the total amount leaving the source (equivalently, arriving at the sink). We want to maximize this value.

## The Residual Graph

The key insight that makes max flow algorithms work is the **residual graph**. After you route some flow through a network, you want to know: can you push more? The residual graph answers this by tracking two things for every pair of nodes u and v:

- **Forward residual**: how much more flow can you push from u to v on the original edge? This is the remaining capacity: c(u, v) − f(u, v).
- **Backward residual**: how much flow can you "undo" by rerouting? If you've pushed f(u, v) units along (u, v), you can conceptually push up to f(u, v) units in the reverse direction (v → u), effectively canceling some of that flow.

The backward edge is the subtle part. It's not a real pipe — it's an accounting trick that lets the algorithm correct earlier decisions. If you greedily routed flow through a suboptimal path, the algorithm can use a backward edge to reroute it.

Formally, the residual capacity is:

```
r(u, v) = c(u, v) − f(u, v)   (for original edges)
r(v, u) = f(u, v)              (for reverse edges)
```

An **augmenting path** is any path from s to t in the residual graph where every edge has positive residual capacity. Finding and saturating augmenting paths is the core loop of every max flow algorithm.

## Ford-Fulkerson and Why DFS Falls Short

The Ford-Fulkerson method (1956) is beautifully simple: repeatedly find any augmenting path from s to t in the residual graph, push as much flow as possible along it, and update the residual graph. Stop when no augmenting path exists.

```
while augmenting path P from s to t exists in residual graph:
    bottleneck = min capacity along P
    push bottleneck units along P
    update residual graph
```

The maximum flow equals the total flow pushed. This is provably correct — we'll touch on *why* in the companion article on the Min-Cut theorem.

The problem is the word "any." If you use DFS to find augmenting paths, you might get unlucky. Consider a network with an edge in the middle with capacity 1, flanked by edges with capacity 1,000,000. DFS might find a path that crosses that middle edge forward, push 1 unit, then find a path that crosses it backward, push 1 unit, then repeat — 2,000,000 times — before finding the two obvious direct paths. This is the classic adversarial case for Ford-Fulkerson with DFS, and with irrational capacities it can even fail to terminate.

## Edmonds-Karp: BFS to the Rescue

The fix is elegant: use BFS instead of DFS. This is the **Edmonds-Karp algorithm** (1972), and it changes everything about the worst-case behavior.

BFS finds the *shortest* augmenting path (fewest edges). This seemingly small change guarantees termination in O(VE) augmentations regardless of capacity values, giving an overall time complexity of **O(VE²)**. Here's why:

- BFS ensures we always pick a shortest path in terms of hop count
- A key monotonicity property holds: the BFS distance from s to each node never decreases across augmentations
- After at most O(E) augmentations, at least one edge becomes saturated and never becomes a bottleneck again at that distance level
- Combined: at most O(VE) total augmentations, each requiring O(E) BFS work → O(VE²)

For dense graphs this is outperformed by algorithms like Dinic's (O(V²E)) or push-relabel (O(V²√E)), but Edmonds-Karp is simple to implement correctly and fast enough for most practical graphs.

## Python Implementation

Here's a complete, self-contained implementation. The graph is represented as an adjacency matrix of residual capacities, which makes updating forward and backward edges symmetric.

```python
from collections import deque


def edmonds_karp(graph, source, sink):
    """
    Find maximum flow from source to sink using the Edmonds-Karp algorithm
    (Ford-Fulkerson with BFS augmenting paths).

    Args:
        graph: dict of dicts, graph[u][v] = residual capacity from u to v.
               Modify this in place — it becomes the residual graph after the
               algorithm finishes. Both forward and reverse edges must exist
               (initialize reverse edges to 0).
        source: source node label
        sink:   sink node label

    Returns:
        The value of the maximum flow.
    """
    max_flow = 0

    while True:
        # BFS to find the shortest augmenting path
        parent = _bfs(graph, source, sink)
        if parent is None:
            # No augmenting path exists — we're done
            break

        # Trace back from sink to find the bottleneck capacity
        path_flow = float('inf')
        v = sink
        while v != source:
            u = parent[v]
            path_flow = min(path_flow, graph[u][v])
            v = u

        # Push path_flow units along the path, updating residual capacities
        v = sink
        while v != source:
            u = parent[v]
            graph[u][v] -= path_flow   # reduce forward capacity
            graph[v][u] += path_flow   # increase backward capacity (undo option)
            v = u

        max_flow += path_flow

    return max_flow


def _bfs(graph, source, sink):
    """
    BFS on the residual graph from source to sink.

    Returns a parent dict mapping each visited node to its predecessor on the
    shortest path, or None if sink is unreachable.
    """
    parent = {source: None}
    queue = deque([source])

    while queue:
        u = queue.popleft()
        for v, capacity in graph[u].items():
            if v not in parent and capacity > 0:
                # v is unvisited and the edge u->v has residual capacity
                parent[v] = u
                if v == sink:
                    return parent   # found the sink — stop early
                queue.append(v)

    return None   # sink not reachable
```

A few things worth noting about this implementation:

**The graph is modified in place.** After `edmonds_karp` returns, `graph[u][v]` holds the *remaining* residual capacity, not the original capacity. This is intentional — the residual graph after completion is exactly what you need to find the minimum cut (more on that shortly).

**Reverse edges start at zero.** When you build the graph, initialize `graph[v][u] = 0` for every edge (u, v). This is the slot where backward flow will accumulate. If the original graph has no edge v→u, this is fine; if it does, their capacities simply add.

**BFS stops early.** Once we reach the sink, we return immediately. We only need one path per iteration.

## A Concrete Example

Let's trace through a small network with 6 nodes: **s**, **A**, **B**, **C**, **D**, and **t**.

```
         s
        / \
      10   8
      /     \
     A       B
    / \       \
   6   4      10
  /     \       \
 C       B       D
  \     /       / \
   9   (3)    3   7
    \  /    /     \
     t     C       t
```

More precisely, here are the edges and capacities:

| Edge | Capacity |
|------|----------|
| s → A | 10 |
| s → B | 8 |
| A → C | 6 |
| A → B | 4 |
| B → D | 10 |
| C → t | 9 |
| D → C | 3 |
| D → t | 7 |

To run this, build the graph dictionary with all reverse edges initialized to zero:

```python
nodes = ['s', 'A', 'B', 'C', 'D', 't']

# Start with all capacities at zero (handles reverse edges automatically)
graph = {u: {v: 0 for v in nodes} for u in nodes}

# Add original edges
edges = [
    ('s', 'A', 10), ('s', 'B', 8),
    ('A', 'C', 6),  ('A', 'B', 4),
    ('B', 'D', 10),
    ('C', 't', 9),
    ('D', 'C', 3),  ('D', 't', 7),
]
for u, v, cap in edges:
    graph[u][v] = cap

result = edmonds_karp(graph, 's', 't')
print(f"Max flow: {result}")  # Max flow: 16
```

Let's trace the four augmenting paths BFS discovers:

**Path 1: s → A → C → t**  
BFS finds this 3-hop path first. Bottleneck: min(10, 6, 9) = **6**. After pushing 6 units, A→C is saturated.

**Path 2: s → B → D → t**  
BFS finds this 3-hop path. Bottleneck: min(8, 10, 7) = **7**. After pushing 7 units, D→t is saturated.

**Path 3: s → B → D → C → t**  
D→t is full, but there's residual capacity on D→C and C→t (9 − 6 = 3 remaining). Bottleneck: min(1, 3, 3) = **1**. (s→B has only 1 remaining after path 2.)

**Path 4: s → A → B → D → C → t**  
A→C is saturated, but A→B still has capacity 4. D→t is full, but D→C was only partially used. Bottleneck: min(4, 4, 3, 2, 2) = **2**.

Total: 6 + 7 + 1 + 2 = **16**. That's the maximum flow.

After the algorithm completes, the residual graph shows s→A has 2 units of remaining capacity but both A→C and B→D are fully saturated — there's simply no path from s to t with positive residual capacity left to exploit.

## Time Complexity

Edmonds-Karp runs in **O(VE²)** time, where V is the number of vertices and E is the number of edges.

The argument goes in two parts. First, across all augmentations, the BFS distance from s to each node never decreases (this follows from the monotonicity of shortest augmenting paths under BFS). Second, every time an edge (u, v) becomes a bottleneck (its residual capacity drops to zero), the distance from s to u must increase by at least 2 before (u, v) can become a bottleneck again. Since distances are bounded by V, each edge can be a bottleneck at most O(V) times. With E edges, that's O(VE) total augmentations, each costing O(E) for the BFS. Hence O(VE²).

In practice the algorithm is much faster — the worst case requires carefully constructed adversarial graphs. For typical sparse graphs with a few hundred nodes, it's plenty fast.

## Real-World Applications

Max flow shows up in more places than you might expect:

**Network routing**: Finding maximum data throughput between two nodes in a communication network, or planning bandwidth allocation.

**Bipartite matching**: Given a set of workers and tasks, with edges indicating who can do what, the maximum number of worker-task assignments is exactly a max flow problem. This is the classic reduction from matching to flow.

**Image segmentation**: The graph-cut approach to segmentation (used in GrabCut and similar algorithms) models pixels as nodes and similarity as edge capacities, then finds a minimum cut to separate foreground from background. Max flow is the engine.

**Sports elimination**: Determining whether a team has been mathematically eliminated from playoff contention reduces to a max flow problem on a game-remaining network.

**Project scheduling**: The "maximum weight closure" problem — choosing a subset of tasks to maximize profit subject to dependencies — reduces to min cut, which is equivalent to max flow.

## What's Next

We computed a max flow of 16 for our example network. But there's a dual question lurking: what's the *minimum* set of edges you could remove to completely disconnect s from t? And why does the answer turn out to be exactly 16?

That's the **Max-Flow Min-Cut theorem** — one of the most elegant duality results in computer science. It says the maximum flow through a network equals the capacity of the minimum cut, and the proof falls right out of the structure of the residual graph. Once you understand it, you also get a simple algorithm for finding the min cut directly from the completed flow.

We dig into all of this in [Min Cut and the Max-Flow Min-Cut Theorem](/blog/min-cut-max-flow-theorem).
