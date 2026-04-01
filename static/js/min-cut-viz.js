// Min Cut Visualizer (same network as max-flow-viz.js)
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
  // The actual min-cut edges (from s-side to t-side in residual after max flow)
  const MIN_CUT_EDGES = [['A', 'C'], ['B', 'D']];
  const S_NODES = new Set(['s', 'A', 'B']);
  const T_NODES = new Set(['C', 'D', 't']);

  // ── State ────────────────────────────────────────────────────────────────────
  let flow = {};
  let residual = {};
  let totalFlow = 0;
  let phase = 'initial'; // 'initial' | 'maxflow' | 'mincut'

  function initState() {
    flow = {};
    residual = {};
    totalFlow = 0;
    phase = 'initial';

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
            const path = [];
            let cur = 't';
            while (cur !== 's') { path.unshift(cur); cur = parent[cur]; }
            path.unshift('s');
            let bn = Infinity;
            for (let i = 0; i < path.length - 1; i++) bn = Math.min(bn, residual[path[i]][path[i+1]]);
            return { path, bottleneck: bn };
          }
          queue.push(v);
        }
      }
    }
    return null;
  }

  function runMaxFlow() {
    let p;
    while ((p = bfsPath()) !== null) {
      for (let i = 0; i < p.path.length - 1; i++) {
        const u = p.path[i], v = p.path[i+1];
        flow[u][v] += p.bottleneck;
        flow[v][u] -= p.bottleneck;
        residual[u][v] -= p.bottleneck;
        residual[v][u] += p.bottleneck;
      }
      totalFlow += p.bottleneck;
    }
  }

  // ── SVG helpers ──────────────────────────────────────────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VB_W = 600, VB_H = 320;
  const R = 22;

  function arrowOffset(x1, y1, x2, y2, radius) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    return { x: x2 - (dx/len)*radius, y: y2 - (dy/len)*radius };
  }

  function isCutEdge(u, v) {
    return MIN_CUT_EDGES.some(([a, b]) => a === u && b === v);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function render(container) {
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#f8f7ff;border-radius:12px;padding:20px;font-family:sans-serif;';

    // ── SVG ────────────────────────────────────────────────────────────────────
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute('width', '100%');
    svg.style.cssText = 'display:block;max-width:600px;margin:0 auto;';

    // Defs
    const defs = document.createElementNS(SVG_NS, 'defs');
    const mkMarker = (id, color) => {
      const marker = document.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', `mc-${id}`);
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
    defs.appendChild(mkMarker('gray',   '#9ca3af'));
    defs.appendChild(mkMarker('blue',   '#3b82f6'));
    defs.appendChild(mkMarker('red',    '#ef4444'));
    svg.appendChild(defs);

    // S / T partition background (only in mincut phase)
    if (phase === 'mincut') {
      const sRect = document.createElementNS(SVG_NS, 'rect');
      sRect.setAttribute('x', '10'); sRect.setAttribute('y', '10');
      sRect.setAttribute('width', '290'); sRect.setAttribute('height', '300');
      sRect.setAttribute('rx', '12');
      sRect.setAttribute('fill', '#eff6ff');
      sRect.setAttribute('stroke', '#93c5fd');
      sRect.setAttribute('stroke-width', '1.5');
      sRect.setAttribute('stroke-dasharray', '6,3');
      svg.appendChild(sRect);

      const tRect = document.createElementNS(SVG_NS, 'rect');
      tRect.setAttribute('x', '300'); tRect.setAttribute('y', '10');
      tRect.setAttribute('width', '290'); tRect.setAttribute('height', '300');
      tRect.setAttribute('rx', '12');
      tRect.setAttribute('fill', '#fff7ed');
      tRect.setAttribute('stroke', '#fdba74');
      tRect.setAttribute('stroke-width', '1.5');
      tRect.setAttribute('stroke-dasharray', '6,3');
      svg.appendChild(tRect);

      // S / T labels
      const sLbl = document.createElementNS(SVG_NS, 'text');
      sLbl.setAttribute('x', '30'); sLbl.setAttribute('y', '30');
      sLbl.setAttribute('font-size', '13'); sLbl.setAttribute('font-weight', 'bold');
      sLbl.setAttribute('fill', '#1d4ed8'); sLbl.textContent = 'Set S';
      svg.appendChild(sLbl);

      const tLbl = document.createElementNS(SVG_NS, 'text');
      tLbl.setAttribute('x', '320'); tLbl.setAttribute('y', '30');
      tLbl.setAttribute('font-size', '13'); tLbl.setAttribute('font-weight', 'bold');
      tLbl.setAttribute('fill', '#c2410c'); tLbl.textContent = 'Set T';
      svg.appendChild(tLbl);
    }

    // Draw forward edges
    for (const [u, v, cap] of EDGE_DEFS) {
      const n1 = NODES[u], n2 = NODES[v];
      const tip = arrowOffset(n1.x, n1.y, n2.x, n2.y, R + 2);
      const src = arrowOffset(n2.x, n2.y, n1.x, n1.y, R + 2);
      const cut = phase === 'mincut' && isCutEdge(u, v);
      const f = Math.max(0, flow[u]?.[v] || 0);

      let color = '#9ca3af', markerRef = 'mc-gray', strokeWidth = 1.5, dashArray = 'none';
      if (phase !== 'initial' && f > 0) { color = '#3b82f6'; markerRef = 'mc-blue'; strokeWidth = 2; }
      if (cut) { color = '#ef4444'; markerRef = 'mc-red'; strokeWidth = 3.5; dashArray = '6,3'; }

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', src.x); line.setAttribute('y1', src.y);
      line.setAttribute('x2', tip.x); line.setAttribute('y2', tip.y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', strokeWidth);
      line.setAttribute('stroke-dasharray', dashArray);
      line.setAttribute('marker-end', `url(#${markerRef})`);
      svg.appendChild(line);

      // Label
      const mx = (n1.x + n2.x) / 2, my = (n1.y + n2.y) / 2;
      const dx = n2.x - n1.x, dy = n2.y - n1.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      const ox = -dy/len * 12, oy = dx/len * 12;

      const showFlow = phase !== 'initial';
      const lblText = showFlow ? `${f}/${cap}` : `0/${cap}`;
      const tw = lblText.length * 6 + 6;

      const lblBg = document.createElementNS(SVG_NS, 'rect');
      lblBg.setAttribute('x', mx + ox - tw/2);
      lblBg.setAttribute('y', my + oy - 9);
      lblBg.setAttribute('width', tw);
      lblBg.setAttribute('height', 14);
      lblBg.setAttribute('rx', 3);
      lblBg.setAttribute('fill', cut ? '#fee2e2' : '#ffffff');
      lblBg.setAttribute('stroke', cut ? '#f87171' : '#e5e7eb');
      lblBg.setAttribute('stroke-width', cut ? 1.5 : 0.5);
      svg.appendChild(lblBg);

      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', mx + ox); lbl.setAttribute('y', my + oy + 1);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('dominant-baseline', 'middle');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('font-family', 'monospace');
      lbl.setAttribute('fill', cut ? '#dc2626' : f > 0 && showFlow ? '#1d4ed8' : '#6b7280');
      lbl.setAttribute('font-weight', cut ? 'bold' : 'normal');
      lbl.textContent = lblText;
      svg.appendChild(lbl);
    }

    // Draw nodes
    for (const [id, node] of Object.entries(NODES)) {
      const isSource = id === 's', isSink = id === 't';
      const inS = phase === 'mincut' && S_NODES.has(id);
      const inT = phase === 'mincut' && T_NODES.has(id);

      let fill = '#e0e7ff', stroke = '#6366f1';
      if (isSource) { fill = '#dcfce7'; stroke = '#16a34a'; }
      if (isSink)   { fill = '#fce7f3'; stroke = '#db2777'; }
      if (inS)      { fill = '#dbeafe'; stroke = '#2563eb'; }
      if (inT)      { fill = '#ffedd5'; stroke = '#ea580c'; }

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', node.x); circle.setAttribute('cy', node.y);
      circle.setAttribute('r', R);
      circle.setAttribute('fill', fill);
      circle.setAttribute('stroke', stroke);
      circle.setAttribute('stroke-width', (inS || inT) ? 3 : 2);
      svg.appendChild(circle);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', node.x); text.setAttribute('y', node.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('fill', inT ? '#c2410c' : inS ? '#1e40af' : stroke);
      text.textContent = node.label;
      svg.appendChild(text);
    }

    panel.appendChild(svg);

    // ── Flow counter ───────────────────────────────────────────────────────────
    if (phase !== 'initial') {
      const counter = document.createElement('div');
      counter.style.cssText = 'text-align:center;margin:10px 0 6px;font-size:15px;font-weight:600;color:#374151;';
      counter.innerHTML = `Total Flow: <span style="color:#6366f1;font-size:18px;">${totalFlow}</span> / Max Flow: <span style="color:#10b981;">${MAX_FLOW_ANSWER}</span>`;
      panel.appendChild(counter);

      const pct = Math.round((totalFlow / MAX_FLOW_ANSWER) * 100);
      const pbar = document.createElement('div');
      pbar.style.cssText = 'max-width:400px;margin:0 auto 10px;background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;';
      const fill_ = document.createElement('div');
      fill_.style.cssText = `width:${pct}%;height:100%;background:linear-gradient(90deg,#6366f1,#10b981);border-radius:99px;`;
      pbar.appendChild(fill_);
      panel.appendChild(pbar);
    }

    // ── Min cut result box ─────────────────────────────────────────────────────
    if (phase === 'mincut') {
      const box = document.createElement('div');
      box.style.cssText = 'max-width:480px;margin:0 auto 14px;padding:14px 20px;background:#fef2f2;border:2px solid #f87171;border-radius:10px;text-align:center;';
      box.innerHTML = `
        <div style="font-weight:700;font-size:15px;color:#b91c1c;margin-bottom:6px;">✂️ Min Cut Found</div>
        <div style="font-size:14px;color:#374151;margin-bottom:6px;">
          <strong>A → C</strong> (cap 6) &nbsp;+&nbsp; <strong>B → D</strong> (cap 10) &nbsp;= &nbsp;<strong>16 = Max Flow ✓</strong>
        </div>
        <div style="font-size:13px;color:#6b7280;">
          Set S = {s, A, B} &nbsp;|&nbsp; Set T = {C, D, t}
        </div>
      `;
      panel.appendChild(box);
    }

    // ── Buttons ────────────────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:8px;';

    const mkBtn = (label, bg, hbg, disabled) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.style.cssText = `padding:8px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:${disabled?'not-allowed':'pointer'};background:${disabled?'#d1d5db':bg};color:${disabled?'#9ca3af':'#fff'};transition:background 0.2s;`;
      if (!disabled) {
        b.onmouseenter = () => { b.style.background = hbg; };
        b.onmouseleave = () => { b.style.background = bg; };
      }
      return b;
    };

    const runMFBtn  = mkBtn('⚡ Run Max Flow', '#3b82f6', '#2563eb', phase !== 'initial');
    const findCutBtn = mkBtn('✂️ Find Min Cut', '#ef4444', '#dc2626', phase !== 'maxflow');
    const resetBtn  = mkBtn('↺ Reset', '#6b7280', '#4b5563', false);

    runMFBtn.onclick = () => {
      runMaxFlow();
      phase = 'maxflow';
      render(container);
    };

    findCutBtn.onclick = () => {
      phase = 'mincut';
      render(container);
    };

    resetBtn.onclick = () => {
      initState();
      render(container);
    };

    btnRow.appendChild(runMFBtn);
    btnRow.appendChild(findCutBtn);
    btnRow.appendChild(resetBtn);
    panel.appendChild(btnRow);

    // Status hint
    const hint = document.createElement('div');
    hint.style.cssText = 'text-align:center;font-size:12px;color:#9ca3af;margin-top:4px;';
    if (phase === 'initial') hint.textContent = 'Run max flow first, then find the min cut.';
    else if (phase === 'maxflow') hint.textContent = 'Max flow complete — click Find Min Cut to see the partition.';
    else hint.textContent = 'The red dashed edges form the minimum cut separating S (blue) from T (orange).';
    panel.appendChild(hint);

    container.appendChild(panel);
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  function init() {
    const container = document.getElementById('min-cut-viz');
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
