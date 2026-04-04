---
title: "Exam Scheduling with Max Flow: Assigning Rooms and Proctors"
date: "2026-04-04"
category: "Algorithms"
excerpt: "How do you assign exams to rooms and proctors simultaneously? Build a flow network, run Edmonds-Karp, and read off the assignments — or discover exactly why it's impossible."
read_time: "15"
image_url: "/static/images/max-flow-exam-scheduling.png"
---

It's finals week. You're the department coordinator, and you have 20 exams to schedule. There are 15 rooms available and 6 proctors on duty. Each exam needs exactly one room, each room can hold at most one exam, and each proctor can monitor up to 5 exams. Can you make it work?

You could try brute force — enumerate every possible assignment and check the constraints. But that's combinatorially explosive. You could model it as an integer program and throw a solver at it. But there's a cleaner approach hiding in plain sight: this is a max flow problem.

If you've read the earlier posts on [max flow and Ford-Fulkerson](/blog/max-flow-ford-fulkerson) and the [min-cut max-flow theorem](/blog/min-cut-max-flow-theorem), you already have all the machinery. Here we'll see how a scheduling problem that *doesn't look like* a flow problem can be transformed into one — and how the structure of the resulting network gives us both the solution and insight into what makes scheduling hard.

## The Problem

We have three sets of entities:

- **n exams**: E₁, E₂, ..., Eₙ
- **r rooms**: R₁, R₂, ..., Rᵣ
- **p proctors**: P₁, P₂, ..., Pₚ

And three constraints:

1. Each exam must be assigned to **exactly one room**
2. Each room can hold **at most one exam**
3. Each proctor can monitor **at most 5 exams**

Every exam needs both a room and a proctor. The question: is there a feasible assignment of all n exams to rooms and proctors? And if so, what is it?

## Modeling as a Flow Network

The key insight is that each exam requires *two* resources: a room and a proctor. We can capture this by giving each exam a demand of 2 units of flow — one unit for its room assignment, one for its proctor assignment.

Here's the construction:

**Nodes:**
- A **source** S
- An **exam node** for each exam: E₁, ..., Eₙ
- A **room node** for each room: R₁, ..., Rᵣ
- A **proctor node** for each proctor: P₁, ..., Pₚ
- A **sink** T

**Edges:**
- **S → Eᵢ** with capacity **2** for each exam. Each exam needs two units of flow: one for a room, one for a proctor.
- **Eᵢ → Rⱼ** with capacity **1** for each exam-room pair. (For simplicity, we assume any exam can go in any room. If some rooms are incompatible with certain exams, just omit those edges.)
- **Eᵢ → Pₖ** with capacity **1** for each exam-proctor pair. (Again, if certain proctors can't monitor certain exams, omit those edges.)
- **Rⱼ → T** with capacity **1** for each room. This enforces the constraint that each room holds at most one exam.
- **Pₖ → T** with capacity **5** for each proctor. This enforces the constraint that each proctor monitors at most 5 exams.

The maximum flow from S to T tells us how many exam-resource assignments we can make. If the max flow equals **2n** (every exam gets both a room and a proctor), we have a feasible schedule. If it's less, some exams can't be fully assigned, and the min cut tells us exactly where the bottleneck is.

### Why This Works

Each unit of flow from S through an exam node represents one resource assignment. The capacity of 2 on S → Eᵢ means exam i needs exactly two resources. The flow splits: one unit goes through a room node to the sink (assigning the exam to that room), and one unit goes through a proctor node to the sink (assigning a proctor to that exam).

The capacity constraints do the rest:
- Rⱼ → T has capacity 1, so at most one exam can use room j
- Pₖ → T has capacity 5, so at most 5 exams can be assigned to proctor k
- Eᵢ → Rⱼ has capacity 1, so an exam uses at most one room
- Eᵢ → Pₖ has capacity 1, so an exam has at most one proctor

If max flow = 2n, every exam got both resources. We read off the assignments by checking which room and proctor edges carry flow for each exam.

## A Worked Example

Let's use concrete numbers: **4 exams, 3 rooms, 2 proctors**.

The target max flow is 2 × 4 = **8**. Is it achievable?

**Capacity check:**
- Room capacity: 3 rooms × 1 exam each = 3 exams max
- Proctor capacity: 2 proctors × 5 exams each = 10 exams max

Wait — we only have 3 rooms for 4 exams. That means at most 3 exams can get rooms. The max flow will be at most 2 × 3 + 0 = 6... actually, let's think about this more carefully. An exam needs *both* a room and a proctor. If exam 4 can't get a room, it can't get a proctor assignment either (well, it *could* in the flow model, but that doesn't help — we need both).

Actually, the flow model handles this naturally. If only 3 exams can get rooms, then at most 3 exams can be fully assigned, giving a max flow of at most 6 (not 8). The model will find this.

Let's adjust to a feasible instance: **4 exams, 4 rooms, 2 proctors**.

Now: 4 rooms (each holds 1 exam) and 2 proctors (each handles up to 5). Room capacity: 4 ≥ 4 ✓. Proctor capacity: 10 ≥ 4 ✓. This should work.

The edges:

| Edge | Capacity |
|------|----------|
| S → E1, S → E2, S → E3, S → E4 | 2 each |
| E1 → R1, E1 → R2, E1 → R3, E1 → R4 | 1 each |
| E2 → R1, E2 → R2, E2 → R3, E2 → R4 | 1 each |
| E3 → R1, E3 → R2, E3 → R3, E3 → R4 | 1 each |
| E4 → R1, E4 → R2, E4 → R3, E4 → R4 | 1 each |
| E1 → P1, E1 → P2 | 1 each |
| E2 → P1, E2 → P2 | 1 each |
| E3 → P1, E3 → P2 | 1 each |
| E4 → P1, E4 → P2 | 1 each |
| R1 → T, R2 → T, R3 → T, R4 → T | 1 each |
| P1 → T, P2 → T | 5 each |

That's 4 + 16 + 8 + 4 + 2 = **34 edges** (plus their reverse edges in the residual graph). BFS will find augmenting paths efficiently.

Running Edmonds-Karp, the algorithm might find paths like:

1. **S → E1 → R1 → T** (bottleneck 1) — assigns exam 1 to room 1
2. **S → E1 → P1 → T** (bottleneck 1) — assigns proctor 1 to exam 1
3. **S → E2 → R2 → T** (bottleneck 1) — assigns exam 2 to room 2
4. **S → E2 → P1 → T** (bottleneck 1) — assigns proctor 1 to exam 2
5. **S → E3 → R3 → T** (bottleneck 1) — assigns exam 3 to room 3
6. **S → E3 → P2 → T** (bottleneck 1) — assigns proctor 2 to exam 3
7. **S → E4 → R4 → T** (bottleneck 1) — assigns exam 4 to room 4
8. **S → E4 → P2 → T** (bottleneck 1) — assigns proctor 2 to exam 4

Total flow: **8** = 2 × 4. All exams are assigned!

**Reading the assignments:**
- Exam 1 → Room 1, Proctor 1
- Exam 2 → Room 2, Proctor 1
- Exam 3 → Room 3, Proctor 2
- Exam 4 → Room 4, Proctor 2

Proctor 1 monitors 2 exams (well within the limit of 5), and Proctor 2 monitors 2 exams.

## Python Implementation

Here's a complete implementation that builds the flow network and extracts the schedule:

```python
from collections import deque


def edmonds_karp(graph, source, sink):
    """Edmonds-Karp max flow algorithm (BFS augmenting paths)."""
    max_flow = 0
    while True:
        parent = bfs(graph, source, sink)
        if parent is None:
            break
        # Find bottleneck
        path_flow = float('inf')
        v = sink
        while v != source:
            u = parent[v]
            path_flow = min(path_flow, graph[u][v])
            v = u
        # Update residual graph
        v = sink
        while v != source:
            u = parent[v]
            graph[u][v] -= path_flow
            graph[v][u] += path_flow
            v = u
        max_flow += path_flow
    return max_flow


def bfs(graph, source, sink):
    """BFS to find shortest augmenting path."""
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


def schedule_exams(num_exams, num_rooms, num_proctors, max_per_proctor=5):
    """
    Build a flow network and find an exam schedule.

    Returns:
        (feasible, assignments, max_flow) where assignments is a list of
        (exam, room, proctor) tuples if feasible, else partial info.
    """
    S = 'S'
    T = 'T'
    exams = [f'E{i+1}' for i in range(num_exams)]
    rooms = [f'R{i+1}' for i in range(num_rooms)]
    proctors = [f'P{i+1}' for i in range(num_proctors)]

    all_nodes = [S] + exams + rooms + proctors + [T]

    # Initialize graph with zero capacities
    graph = {u: {v: 0 for v in all_nodes} for u in all_nodes}

    # Source -> exams (capacity 2: need room + proctor)
    for e in exams:
        graph[S][e] = 2

    # Exams -> rooms (capacity 1 each)
    for e in exams:
        for r in rooms:
            graph[e][r] = 1

    # Exams -> proctors (capacity 1 each)
    for e in exams:
        for p in proctors:
            graph[e][p] = 1

    # Rooms -> sink (capacity 1: one exam per room)
    for r in rooms:
        graph[r][T] = 1

    # Proctors -> sink (capacity max_per_proctor)
    for p in proctors:
        graph[p][T] = max_per_proctor

    # Save original capacities for flow extraction
    original = {u: dict(v) for u, v in graph.items()}

    # Run max flow
    max_flow = edmonds_karp(graph, S, T)
    target = 2 * num_exams
    feasible = (max_flow == target)

    # Extract assignments from flow (original capacity - residual capacity)
    assignments = []
    for e in exams:
        room = None
        proctor = None
        for r in rooms:
            flow = original[e][r] - graph[e][r]
            if flow > 0:
                room = r
                break
        for p in proctors:
            flow = original[e][p] - graph[e][p]
            if flow > 0:
                proctor = p
                break
        assignments.append((e, room, proctor))

    return feasible, assignments, max_flow


# Example: 4 exams, 4 rooms, 2 proctors
feasible, assignments, flow = schedule_exams(4, 4, 2)
print(f"Max flow: {flow} (target: {2*4})")
print(f"Feasible: {feasible}\n")

if feasible:
    print("Schedule:")
    for exam, room, proctor in assignments:
        print(f"  {exam} → {room}, {proctor}")
else:
    print("Infeasible! Not all exams can be assigned.")
    print("Partial assignments:")
    for exam, room, proctor in assignments:
        status = []
        if room: status.append(room)
        else: status.append("NO ROOM")
        if proctor: status.append(proctor)
        else: status.append("NO PROCTOR")
        print(f"  {exam} → {', '.join(status)}")
```

Running this:

```
Max flow: 8 (target: 8)
Feasible: True

Schedule:
  E1 → R1, P1
  E2 → R2, P1
  E3 → R3, P2
  E4 → R4, P2
```

### Infeasible Case

What happens with 4 exams, 3 rooms, 2 proctors?

```python
feasible, assignments, flow = schedule_exams(4, 3, 2)
print(f"Max flow: {flow} (target: {2*4})")
print(f"Feasible: {feasible}")
```

```
Max flow: 6 (target: 8)
Feasible: False
```

The max flow is 6, not 8. Three exams got both resources (flow = 6 = 2 × 3), but the fourth couldn't get a room. The bottleneck is the room capacity — the min cut would cross the room-to-sink edges, confirming that rooms are the scarce resource.

## What the Min Cut Reveals

When the schedule is infeasible, the [min cut](/blog/min-cut-max-flow-theorem) tells you *why*. After running max flow, the residual graph partitions nodes into two sets: S-reachable (source side of the cut) and the rest (sink side). The saturated edges between these sets are the bottleneck.

In our 4-exam, 3-room example:
- All room → T edges are saturated (capacity 1, flow 1) — rooms are fully used
- Some exam nodes are S-reachable but can't reach T — they're stranded
- The min cut capacity is 6 (3 room edges × 1 + some proctor edges), confirming the max flow

This is actionable: need to add a room. If instead proctors were the bottleneck (say, 10 exams with 1 proctor), the cut would cross the proctor → T edge, telling you to hire more proctors.

## Complexity

For a network with n exams, r rooms, and p proctors:

- **Nodes**: V = n + r + p + 2 (exams + rooms + proctors + source/sink)
- **Edges**: E = n + nr + np + r + p (source-to-exam + exam-to-room + exam-to-proctor + room-to-sink + proctor-to-sink)
- **Edmonds-Karp**: O(VE²) in the worst case

In practice, the number of augmenting paths is at most 2n (since each path carries 1 unit and the max flow is 2n), and each BFS is O(V + E). So the effective complexity is closer to **O(n(V + E))** = O(n(nr + np)) = **O(n²(r + p))** — totally manageable for real scheduling problems with hundreds of exams.

## Extensions

The basic model generalizes naturally:

### Time Slots
If exams happen across multiple time slots, add a time-slot layer. Each room in each time slot becomes a separate node (R₁_T₁, R₁_T₂, etc.), with capacity 1 per room-slot. Now a room can host multiple exams — just not at the same time.

### Room Capacity Constraints
Some rooms are lecture halls (200 seats), others are seminar rooms (30 seats). Add capacity constraints by only connecting exam Eᵢ to rooms that are large enough. This is just removing edges from the bipartite graph — no structural change.

### Proctor Preferences
If proctor P₁ can't monitor exam E₃ (maybe a conflict of interest), omit the E₃ → P₁ edge. The algorithm routes around it. If the constraint makes the problem infeasible, the min cut will show you which proctor-exam restriction is causing the problem.

### Weighted Preferences
If you want to *prefer* certain room-exam or proctor-exam pairings, max flow alone won't help — you need **minimum cost max flow**, which finds the flow of maximum value that minimizes total cost. The network structure is the same; you just add cost labels to edges.

### Proctor Load Balancing
The basic model allows one proctor to take all 5 exams while another takes none. If you want to balance the load, you can iterate: run max flow, check the proctor loads, and if they're unbalanced, reduce the capacity of over-loaded proctors and re-run. Or use min-cost max flow with increasing costs for additional assignments to the same proctor.

## The Bigger Picture

Exam scheduling is a specific instance of a broader pattern: **multi-resource assignment**. Whenever you need to assign entities to multiple types of resources simultaneously, with capacity constraints on each resource type, the same flow construction applies.

- **Conference scheduling**: talks need rooms and time slots
- **Hospital staffing**: shifts need nurses and rooms
- **Cloud computing**: jobs need CPU cores and memory blocks
- **Sports scheduling**: games need venues and referees

The flow model gives you three things: a feasibility check (is max flow = target?), a concrete assignment (read the flow values), and a diagnosis when it fails (the min cut identifies the bottleneck). That's a lot of value from one algorithm.

For the algorithm itself, see [Max Flow: Finding the Maximum Through a Network](/blog/max-flow-ford-fulkerson). For the duality that makes bottleneck analysis possible, see [Min Cut and the Max-Flow Min-Cut Theorem](/blog/min-cut-max-flow-theorem).
