// Max Flow (Edmonds-Karp) Step-by-Step Visualization
(function () {
  // ── Graph definition ────────────────────────────────────────────────────────
  const NODES = {
    s: { x: 60,  y: 160, label: 's' },
    A: { x: 200, y: 60,  label: 'A' },
    B: { x: 200, y: 260, label: 'B' },
    C: { x: 380, y: 60,  label: 'C' },
    D: { x: 380, y: 260, label: 'D' },
    t: { x: 540, y: 160, label: 't' },
  };

  // Each edge: [from, to, capacity]
  const EDGE_DEFS = [
    ['s', 'A', 10],
    ['s', 'B', 8],
    ['A', 'C', 6],
    ['A', 'B', 4],
    ['B', 'D', 10],
    ['C', 't', 9],
    ['D', 'C', 3],
    ['D', 't', 7],
  ];

  const MAX_FLOW_ANSWER = 16;

  // ── State ────────────────────────────────────────────────────────────────────
  let flow = {};      // flow[u][v]
  let residual = {};  // residual[u][v]
  let totalFlow = 0;
  let pendingPath = null;   // { path, bottleneck } waiting to be pushed
  let done = false;
  let stepPhase = 'find'; // 'find' | 'push'

  function initState() {
    flow = {};
    residual = {};
    totalFlow = 0;
    pendingPath = null;
    done = false;
    stepPhase = 'find';

    for (const n of Object.keys(NODES)) {
      flow[n] = {};
      residual[n] = {};
      for (const m of Object.keys(NODES)) {
        flow[n][m] = 0;
        residual[n][m] = 0;
      }
    }
    for (const [u, v, cap] of EDGE_DEFS) {
      residual[u][v] = cap;
    }
  }

  // BFS to find shortest augmenting path (Edmonds-Karp)
  function bfsPath() {
    const parent = {};
    const visited = new Set(['s']);
    const queue = ['s'];
    while (queue.length > 0) {
      const u = queue.shift();
      for (const v of Object.keys(NODES)) {
        if (!visited.has(v) && residual[u][v] > 0) {
          visited.add(v);
          parent[v] = u;
          if (v === 't') {
            // reconstruct path
            const path = [];
            let cur = 't';
            while (cur !== 's') {
              path.unshift(cur);
              cur = parent[cur];
            }
            path.unshift('s');
            // bottleneck
            let bn = Infinity;
            for (let i = 0; i < path.length - 1; i++) {
              bn = Math.min(bn, residual[path[i]][path[i + 1]]);
            }
            return { path, bottleneck: bn };
          }
          queue.push(v);
        }
      }
    }
    return null;
  }

  function pushFlow(path, bottleneck) {
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i], v = path[i + 1];
      flow[u][v] += bottleneck;
      flow[v][u] -= bottleneck;
      residual[u][v] -= bottleneck;
      residual[v][u] += bottleneck;
    }
    totalFlow += bottleneck;
  }

  // ── SVG helpers ──────────────────────────────────────────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VB_W = 600, VB_H = 320;
  const R = 22; // node radius

  function arrowOffset(x1, y1, x2, y2, radius) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    return { x: x2 - (dx / len) * radius, y: y2 - (dy / len) * radius };
  }

  function edgeKey(u, v) { return u + '->' + v; }

  // Check if an edge is in EDGE_DEFS
  function isForwardEdge(u, v) {
    return EDGE_DEFS.some(([a, b]) => a === u && b === v);
  }

  function getCapacity(u, v) {
    const def = EDGE_DEFS.find(([a, b]) => a === u && b === v);
    return def ? def[2] : 0;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(container) {
    container.innerHTML = '';

    // Wrapper panel
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#f8f7ff;border-radius:12px;padding:20px;font-family:sans-serif;';

    // ── SVG ──────────────────────────────────────────────────────────────────
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute('width', '100%');
    svg.style.cssText = 'display:block;max-width:600px;margin:0 auto;';

    // Defs: arrowhead marker
    const defs = document.createElementNS(SVG_NS, 'defs');
    const mkMarker = (id, color) => {
      const marker = document.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('refX', '6');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', '0 0, 8 3, 0 6');
      poly.setAttribute('fill', color);
      marker.appendChild(poly);
      return marker;
    };
    defs.appendChild(mkMarker('arrow-gray',   '#9ca3af'));
    defs.appendChild(mkMarker('arrow-blue',   '#3b82f6'));
    defs.appendChild(mkMarker('arrow-orange', '#f97316'));
    defs.appendChild(mkMarker('arrow-green',  '#10b981'));
    svg.appendChild(defs);

    const pathSet = new Set(
      pendingPath ? pendingPath.path.flatMap((n, i, arr) =>
        i < arr.length - 1 ? [edgeKey(n, arr[i + 1])] : []) : []
    );

    // Draw forward edges
    for (const [u, v, cap] of EDGE_DEFS) {
      const n1 = NODES[u], n2 = NODES[v];
      const tip = arrowOffset(n1.x, n1.y, n2.x, n2.y, R + 2);
      const src = arrowOffset(n2.x, n2.y, n1.x, n1.y, R + 2);
      const highlighted = pathSet.has(edgeKey(u, v));

      let color = '#9ca3af';
      let markerRef = 'arrow-gray';
      let strokeWidth = 1.5;

      const f = Math.max(0, flow[u]?.[v] || 0);
      if (f > 0) { color = '#3b82f6'; markerRef = 'arrow-blue'; strokeWidth = 2; }
      if (highlighted) { color = '#f97316'; markerRef = 'arrow-orange'; strokeWidth = 3; }

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', src.x);
      line.setAttribute('y1', src.y);
      line.setAttribute('x2', tip.x);
      line.setAttribute('y2', tip.y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', strokeWidth);
      line.setAttribute('marker-end', `url(#${markerRef})`);
      svg.appendChild(line);

      // Label: flow/capacity
      const mx = (n1.x + n2.x) / 2;
      const my = (n1.y + n2.y) / 2;
      const dx = n2.x - n1.x, dy = n2.y - n1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ox = -dy / len * 12, oy = dx / len * 12;

      const lblBg = document.createElementNS(SVG_NS, 'rect');
      const lblText = `${f}/${cap}`;
      const tw = lblText.length * 6 + 6;
      lblBg.setAttribute('x', mx + ox - tw / 2);
      lblBg.setAttribute('y', my + oy - 9);
      lblBg.setAttribute('width', tw);
      lblBg.setAttribute('height', 14);
      lblBg.setAttribute('rx', 3);
      lblBg.setAttribute('fill', highlighted ? '#fff7ed' : '#ffffff');
      lblBg.setAttribute('stroke', highlighted ? '#f97316' : '#e5e7eb');
      lblBg.setAttribute('stroke-width', highlighted ? 1.5 : 0.5);
      svg.appendChild(lblBg);

      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', mx + ox);
      lbl.setAttribute('y', my + oy + 1);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('dominant-baseline', 'middle');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('font-family', 'monospace');
      lbl.setAttribute('fill', highlighted ? '#ea580c' : f > 0 ? '#1d4ed8' : '#6b7280');
      lbl.setAttribute('font-weight', highlighted ? 'bold' : 'normal');
      lbl.textContent = lblText;
      svg.appendChild(lbl);
    }

    // Draw nodes
    for (const [id, node] of Object.entries(NODES)) {
      const isSource = id === 's';
      const isSink = id === 't';
      const inPath = pendingPath && pendingPath.path.includes(id);

      let fill = '#e0e7ff';
      let stroke = '#6366f1';
      if (isSource) { fill = '#dcfce7'; stroke = '#16a34a'; }
      if (isSink) { fill = '#fce7f3'; stroke = '#db2777'; }
      if (inPath) { fill = '#fff7ed'; stroke = '#f97316'; }

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', R);
      circle.setAttribute('fill', fill);
      circle.setAttribute('stroke', stroke);
      circle.setAttribute('stroke-width', inPath ? 3 : 2);
      svg.appendChild(circle);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', node.x);
      text.setAttribute('y', node.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('fill', inPath ? '#c2410c' : stroke);
      text.textContent = node.label;
      svg.appendChild(text);
    }

    panel.appendChild(svg);

    // ── Counter ───────────────────────────────────────────────────────────────
    const counter = document.createElement('div');
    counter.style.cssText = 'text-align:center;margin:12px 0 8px;font-size:15px;font-weight:600;color:#374151;';
    const pct = Math.round((totalFlow / MAX_FLOW_ANSWER) * 100);
    counter.innerHTML = `Current Total Flow: <span style="color:#6366f1;font-size:18px;">${totalFlow}</span> / Max Flow: <span style="color:#10b981;">${MAX_FLOW_ANSWER}</span>`;
    panel.appendChild(counter);

    // Progress bar
    const pbar = document.createElement('div');
    pbar.style.cssText = 'max-width:400px;margin:0 auto 12px;background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;';
    const fill_ = document.createElement('div');
    fill_.style.cssText = `width:${pct}%;height:100%;background:linear-gradient(90deg,#6366f1,#10b981);border-radius:99px;transition:width 0.4s;`;
    pbar.appendChild(fill_);
    panel.appendChild(pbar);

    // ── Message area ──────────────────────────────────────────────────────────
    const msgBox = document.createElement('div');
    msgBox.style.cssText = 'min-height:44px;max-width:520px;margin:0 auto 14px;padding:10px 16px;border-radius:8px;font-size:14px;text-align:center;';

    if (done) {
      msgBox.style.cssText += 'background:#dcfce7;border:1px solid #86efac;color:#15803d;font-weight:600;font-size:15px;';
      msgBox.textContent = `✅ Maximum flow of ${MAX_FLOW_ANSWER} reached! No more augmenting paths exist.`;
    } else if (pendingPath && stepPhase === 'push') {
      msgBox.style.cssText += 'background:#fff7ed;border:1px solid #fdba74;color:#92400e;';
      const pathStr = pendingPath.path.join(' → ');
      msgBox.innerHTML = `<strong>Path:</strong> ${pathStr} &nbsp;|&nbsp; <strong>Bottleneck:</strong> ${pendingPath.bottleneck} units<br><span style="font-size:12px;color:#b45309;">Click <em>Step</em> again to push this flow</span>`;
    } else {
      msgBox.style.cssText += 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;';
      msgBox.textContent = totalFlow === 0
        ? 'Click Step to find the first BFS augmenting path.'
        : 'Click Step to find the next augmenting path.';
    }
    panel.appendChild(msgBox);

    // ── Buttons ────────────────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:4px;';

    const mkBtn = (label, bg, hbg, disabled) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.style.cssText = `padding:8px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:${disabled ? 'not-allowed' : 'pointer'};background:${disabled ? '#d1d5db' : bg};color:${disabled ? '#9ca3af' : '#fff'};transition:background 0.2s;`;
      if (!disabled) {
        b.onmouseenter = () => { b.style.background = hbg; };
        b.onmouseleave = () => { b.style.background = bg; };
      }
      return b;
    };

    const stepBtn  = mkBtn('▶ Step',   '#6366f1', '#4f46e5', done);
    const runBtn   = mkBtn('⚡ Run All', '#3b82f6', '#2563eb', done);
    const resetBtn = mkBtn('↺ Reset',  '#6b7280', '#4b5563', false);

    stepBtn.onclick = () => {
      if (done) return;
      if (stepPhase === 'find') {
        const result = bfsPath();
        if (!result) { done = true; }
        else { pendingPath = result; stepPhase = 'push'; }
      } else {
        pushFlow(pendingPath.path, pendingPath.bottleneck);
        pendingPath = null;
        stepPhase = 'find';
        if (totalFlow >= MAX_FLOW_ANSWER) done = true;
      }
      render(container);
    };

    runBtn.onclick = () => {
      if (done) return;
      // Flush pending
      if (pendingPath && stepPhase === 'push') {
        pushFlow(pendingPath.path, pendingPath.bottleneck);
        pendingPath = null;
        stepPhase = 'find';
      }
      // Run remaining
      let p;
      while ((p = bfsPath()) !== null) {
        pushFlow(p.path, p.bottleneck);
      }
      done = true;
      render(container);
    };

    resetBtn.onclick = () => {
      initState();
      render(container);
    };

    btnRow.appendChild(stepBtn);
    btnRow.appendChild(runBtn);
    btnRow.appendChild(resetBtn);
    panel.appendChild(btnRow);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-top:10px;font-size:12px;color:#6b7280;';
    const legendItems = [
      ['#9ca3af', 'No flow'],
      ['#3b82f6', 'Has flow'],
      ['#f97316', 'Active path'],
    ];
    for (const [color, label] of legendItems) {
      const item = document.createElement('span');
      item.innerHTML = `<span style="display:inline-block;width:24px;height:3px;background:${color};vertical-align:middle;margin-right:4px;border-radius:2px;"></span>${label}`;
      legend.appendChild(item);
    }
    panel.appendChild(legend);

    container.appendChild(panel);
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  function init() {
    const container = document.getElementById('max-flow-viz');
    if (!container) return;
    initState();
    render(container);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
