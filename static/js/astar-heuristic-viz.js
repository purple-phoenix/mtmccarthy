// A* Heuristic Ladder Visualizer
// One maze, one A* implementation, three heuristics:
//   h = 0          -> Dijkstra's flood fill
//   h = Manhattan  -> admissible but blind to walls
//   h = V*         -> exact cost-to-go (computed by solving the maze backwards
//                     from the goal), the perfect heuristic: A* expands only
//                     the nodes on an optimal path.
// Faithful to the algorithm: expansion = pop of the min-f node (ties broken
// toward larger g), search stops when the goal is popped.
(function () {
  // ── Maze ─────────────────────────────────────────────────────────────────────
  const W = 15, H = 9;
  const START = { x: 2, y: 4 };
  const GOAL = { x: 12, y: 4 };

  function buildWalls() {
    const walls = new Set();
    // U-shaped pocket opening toward the start: the beeline to the goal leads
    // straight into it.
    for (let y = 2; y <= 6; y++) walls.add(key(9, y)); // back wall
    for (let x = 6; x <= 9; x++) walls.add(key(x, 2)); // top arm
    for (let x = 6; x <= 9; x++) walls.add(key(x, 6)); // bottom arm
    return walls;
  }

  function key(x, y) { return y * W + x; }
  function inBounds(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }

  const WALLS = buildWalls();
  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function freeNeighbors(x, y) {
    const out = [];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && !WALLS.has(key(nx, ny))) out.push({ x: nx, y: ny });
    }
    return out;
  }

  // ── V*: exact cost-to-go, via BFS from the goal (unit edge costs) ────────────
  function computeVStar() {
    const dist = new Array(W * H).fill(Infinity);
    dist[key(GOAL.x, GOAL.y)] = 0;
    const queue = [GOAL];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of freeNeighbors(cur.x, cur.y)) {
        const k = key(nb.x, nb.y);
        if (dist[k] === Infinity) {
          dist[k] = dist[key(cur.x, cur.y)] + 1;
          queue.push(nb);
        }
      }
    }
    return dist;
  }
  const VSTAR = computeVStar();

  const HEURISTICS = {
    zero: {
      label: 'h = 0 (Dijkstra)',
      color: '#6b7280', hover: '#4b5563',
      fn: () => 0,
      blurb: (expanded, pathLen) =>
        `<strong>h = 0 is admissible but maximally uninformed</strong> — this is Dijkstra's algorithm. ` +
        `The search flooded outward uniformly, expanding <strong>${expanded}</strong> nodes to find the ${pathLen}-step path.`,
    },
    manhattan: {
      label: 'h = Manhattan',
      color: '#3b82f6', hover: '#2563eb',
      fn: (x, y) => Math.abs(x - GOAL.x) + Math.abs(y - GOAL.y),
      blurb: (expanded, pathLen) =>
        `<strong>Manhattan distance is admissible but blind to walls.</strong> ` +
        `The beeline lured A* into the pocket before it backtracked around the arm — ` +
        `<strong>${expanded}</strong> nodes expanded for the ${pathLen}-step path. Still optimal, just wasteful.`,
    },
    vstar: {
      label: 'h = V* (perfect)',
      color: '#6366f1', hover: '#4f46e5',
      fn: (x, y) => VSTAR[key(x, y)],
      blurb: (expanded, pathLen) =>
        `<strong>V* is the perfect heuristic: zero search.</strong> ` +
        `Every node on the optimal path has f = g + V* = ${VSTAR[key(START.x, START.y)]}, and every node off it scores worse, ` +
        `so A* expanded only <strong>${expanded}</strong> nodes — the ${pathLen}-step optimal path itself, and nothing else.`,
    },
  };

  // ── A* (records expansion order; ties broken toward larger g) ────────────────
  function runAStar(h) {
    const g = new Array(W * H).fill(Infinity);
    const parent = new Array(W * H).fill(-1);
    const closed = new Array(W * H).fill(false);
    const open = [];
    const startK = key(START.x, START.y);
    g[startK] = 0;
    open.push({ k: startK, x: START.x, y: START.y });
    const order = [];

    while (open.length) {
      // Tiny grid: a linear scan stands in for a priority queue.
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        const fi = g[open[i].k] + h(open[i].x, open[i].y);
        const fb = g[open[best].k] + h(open[best].x, open[best].y);
        if (fi < fb || (fi === fb && g[open[i].k] > g[open[best].k])) best = i;
      }
      const cur = open.splice(best, 1)[0];
      if (closed[cur.k]) continue;
      closed[cur.k] = true;
      order.push(cur);
      if (cur.k === key(GOAL.x, GOAL.y)) break;
      for (const nb of freeNeighbors(cur.x, cur.y)) {
        const nk = key(nb.x, nb.y);
        if (closed[nk]) continue;
        const tentative = g[cur.k] + 1;
        if (tentative < g[nk]) {
          g[nk] = tentative;
          parent[nk] = cur.k;
          open.push({ k: nk, x: nb.x, y: nb.y });
        }
      }
    }

    const path = [];
    let k = key(GOAL.x, GOAL.y);
    if (parent[k] !== -1 || k === startK) {
      while (k !== -1) {
        path.push(k);
        k = k === startK ? -1 : parent[k];
      }
      path.reverse();
    }
    return { order, path };
  }

  // ── State ────────────────────────────────────────────────────────────────────
  let mode = null;          // current heuristic id
  let run = null;           // { order, path } of current run
  let revealed = 0;         // expansions shown so far
  let pathShown = false;
  let results = {};         // mode -> expanded count (for the comparison row)
  let timer = null;

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(container) {
    container.innerHTML = '';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#f8f7ff;border-radius:12px;padding:20px;font-family:sans-serif;';

    // Heuristic buttons
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;';
    for (const [id, spec] of Object.entries(HEURISTICS)) {
      const b = document.createElement('button');
      b.textContent = spec.label;
      const active = mode === id;
      b.style.cssText = `padding:8px 16px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#fff;background:${spec.color};transition:background 0.2s;${active ? 'box-shadow:0 0 0 3px rgba(99,102,241,0.35);' : ''}`;
      b.onmouseenter = () => { b.style.background = spec.hover; };
      b.onmouseleave = () => { b.style.background = spec.color; };
      b.onclick = () => startRun(container, id);
      controls.appendChild(b);
    }
    panel.appendChild(controls);

    // Result banner
    if (mode && pathShown) {
      const spec = HEURISTICS[mode];
      const banner = document.createElement('div');
      banner.style.cssText = 'max-width:560px;margin:0 auto 16px;padding:12px 16px;background:#eef2ff;border:1px solid #6366f1;border-radius:10px;font-size:13.5px;line-height:1.5;color:#3730a3;text-align:center;';
      banner.innerHTML = spec.blurb(run.order.length, run.path.length - 1);
      panel.appendChild(banner);
    } else if (!mode) {
      const hint = document.createElement('div');
      hint.style.cssText = 'text-align:center;font-size:13px;color:#6b7280;margin-bottom:14px;';
      hint.textContent = 'Pick a heuristic to run A* on the maze. Cell numbers show h(n); S is the start, G the goal.';
      panel.appendChild(hint);
    }

    // Grid
    const expandedSet = new Map(); // key -> expansion index
    if (run) for (let i = 0; i < revealed; i++) expandedSet.set(run.order[i].k, i);
    const pathSet = new Set(pathShown && run ? run.path : []);
    const hFn = mode ? HEURISTICS[mode].fn : null;

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${W}, 1fr);gap:3px;max-width:600px;margin:0 auto 16px;`;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = key(x, y);
        const cell = document.createElement('div');
        let bg = '#ffffff', color = '#9ca3af', text = '', weight = 400, border = '1px solid #e5e7eb';
        if (WALLS.has(k)) {
          bg = '#374151'; border = '1px solid #374151';
        } else {
          if (hFn) text = String(hFn(x, y));
          if (expandedSet.has(k)) { bg = '#dbeafe'; color = '#1e40af'; }
          if (pathSet.has(k)) { bg = '#6366f1'; color = '#e0e7ff'; border = '1px solid #4f46e5'; }
          if (k === key(START.x, START.y)) { bg = '#22c55e'; color = '#fff'; text = 'S'; weight = 700; border = '1px solid #15803d'; }
          if (k === key(GOAL.x, GOAL.y)) { bg = '#f59e0b'; color = '#fff'; text = 'G'; weight = 700; border = '1px solid #d97706'; }
        }
        cell.style.cssText = `aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;border-radius:4px;background:${bg};color:${color};border:${border};font-family:monospace;font-size:11px;font-weight:${weight};transition:background 0.15s;`;
        cell.textContent = text;
        grid.appendChild(cell);
      }
    }
    panel.appendChild(grid);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:12px;color:#6b7280;margin-bottom:14px;';
    const item = (bg, label) =>
      `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:12px;height:12px;border-radius:3px;background:${bg};display:inline-block;"></span>${label}</span>`;
    legend.innerHTML =
      item('#dbeafe', 'expanded') + item('#6366f1', 'optimal path') +
      item('#22c55e', 'start') + item('#f59e0b', 'goal') + item('#374151', 'wall');
    panel.appendChild(legend);

    // Comparison row: expansions per heuristic so far
    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:13px;color:#374151;';
    for (const [id, spec] of Object.entries(HEURISTICS)) {
      const val = id in results ? `${results[id]} expanded` : '—';
      stats.innerHTML +=
        `<span style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;"><strong style="color:${spec.color};">${spec.label}</strong> <span style="color:#6b7280;">${val}</span></span>`;
    }
    panel.appendChild(stats);

    container.appendChild(panel);
  }

  function startRun(container, id) {
    if (timer) { clearInterval(timer); timer = null; }
    mode = id;
    run = runAStar(HEURISTICS[id].fn);
    revealed = 0;
    pathShown = false;
    render(container);
    timer = setInterval(() => {
      revealed++;
      if (revealed >= run.order.length) {
        revealed = run.order.length;
        pathShown = true;
        results[id] = run.order.length;
        clearInterval(timer);
        timer = null;
      }
      render(container);
    }, 35);
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  function init() {
    const container = document.getElementById('astar-heuristic-viz');
    if (!container) return;
    render(container);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
