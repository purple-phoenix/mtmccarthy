// Exam Scheduling Max Flow — Step-Through + Build-Your-Own Visualizations
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ── Color palette (matches other viz) ───────────────────────────────────────
  const COLORS = {
    source:      { fill: '#dcfce7', stroke: '#16a34a', text: '#16a34a' },
    sink:        { fill: '#fce7f3', stroke: '#db2777', text: '#db2777' },
    exam:        { fill: '#e0e7ff', stroke: '#6366f1', text: '#6366f1' },
    room:        { fill: '#fef3c7', stroke: '#d97706', text: '#b45309' },
    proctor:     { fill: '#dbeafe', stroke: '#2563eb', text: '#1d4ed8' },
    highlight:   { fill: '#fff7ed', stroke: '#f97316', text: '#c2410c' },
    edgeDefault: '#9ca3af',
    edgeFlow:    '#3b82f6',
    edgePath:    '#f97316',
    edgeDone:    '#10b981',
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function arrowOffset(x1, y1, x2, y2, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: x2 - (dx / len) * r, y: y2 - (dy / len) * r };
  }

  function edgeKey(u, v) { return u + '->' + v; }

  // ── Generic Edmonds-Karp engine ─────────────────────────────────────────────
  function cloneGraph(g) {
    const c = {};
    for (const u of Object.keys(g)) {
      c[u] = {};
      for (const v of Object.keys(g[u])) c[u][v] = g[u][v];
    }
    return c;
  }

  function bfsPath(graph, nodes, source, sink) {
    const parent = {};
    const visited = new Set([source]);
    const queue = [source];
    while (queue.length > 0) {
      const u = queue.shift();
      for (const v of nodes) {
        if (!visited.has(v) && (graph[u]?.[v] || 0) > 0) {
          visited.add(v);
          parent[v] = u;
          if (v === sink) {
            const path = [];
            let cur = sink;
            while (cur !== source) { path.unshift(cur); cur = parent[cur]; }
            path.unshift(source);
            let bn = Infinity;
            for (let i = 0; i < path.length - 1; i++)
              bn = Math.min(bn, graph[path[i]][path[i + 1]]);
            return { path, bottleneck: bn };
          }
          queue.push(v);
        }
      }
    }
    return null;
  }

  function pushFlow(graph, path, bn) {
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i], v = path[i + 1];
      graph[u][v] -= bn;
      graph[v][u] = (graph[v][u] || 0) + bn;
    }
  }

  // ── Build network for exam scheduling ───────────────────────────────────────
  function buildNetwork(nExams, nRooms, nProctors, maxPerProctor) {
    maxPerProctor = maxPerProctor || 5;
    const S = 'S', T = 'T';
    const exams = []; for (let i = 1; i <= nExams; i++) exams.push('E' + i);
    const rooms = []; for (let i = 1; i <= nRooms; i++) rooms.push('R' + i);
    const proctors = []; for (let i = 1; i <= nProctors; i++) proctors.push('P' + i);
    const allNodes = [S, ...exams, ...rooms, ...proctors, T];

    const graph = {};
    for (const u of allNodes) { graph[u] = {}; for (const v of allNodes) graph[u][v] = 0; }

    const edgeDefs = []; // [from, to, cap]
    for (const e of exams) { graph[S][e] = 2; edgeDefs.push([S, e, 2]); }
    for (const e of exams) for (const r of rooms) { graph[e][r] = 1; edgeDefs.push([e, r, 1]); }
    for (const e of exams) for (const p of proctors) { graph[e][p] = 1; edgeDefs.push([e, p, 1]); }
    for (const r of rooms) { graph[r][T] = 1; edgeDefs.push([r, T, 1]); }
    for (const p of proctors) { graph[p][T] = maxPerProctor; edgeDefs.push([p, T, maxPerProctor]); }

    return { graph, edgeDefs, allNodes, exams, rooms, proctors, S, T, target: 2 * nExams, maxPerProctor };
  }

  // ── Layout positions for the layered graph ──────────────────────────────────
  function layoutNodes(exams, rooms, proctors, vbW, vbH) {
    const pos = {};
    const pad = 40;
    const layerX = [pad, vbW * 0.28, vbW * 0.62, vbW - pad]; // S, exams, rooms+proctors, T

    pos['S'] = { x: layerX[0], y: vbH / 2 };
    pos['T'] = { x: layerX[3], y: vbH / 2 };

    const spreadY = (items, col) => {
      const n = items.length;
      const gap = Math.min(52, (vbH - 2 * pad) / Math.max(n - 1, 1));
      const startY = vbH / 2 - ((n - 1) * gap) / 2;
      items.forEach((id, i) => { pos[id] = { x: layerX[col], y: startY + i * gap }; });
    };

    spreadY(exams, 1);
    // Rooms on top, proctors on bottom in layer 3
    const combined = [...rooms, ...proctors];
    spreadY(combined, 2);

    return pos;
  }

  function nodeColor(id, rooms, proctors) {
    if (id === 'S') return COLORS.source;
    if (id === 'T') return COLORS.sink;
    if (rooms.includes(id)) return COLORS.room;
    if (proctors.includes(id)) return COLORS.proctor;
    return COLORS.exam;
  }

  // ── SVG rendering ───────────────────────────────────────────────────────────
  function mkMarker(defs, id, color) {
    const m = document.createElementNS(SVG_NS, 'marker');
    m.setAttribute('id', id); m.setAttribute('markerWidth', '8'); m.setAttribute('markerHeight', '8');
    m.setAttribute('refX', '6'); m.setAttribute('refY', '3'); m.setAttribute('orient', 'auto');
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', '0 0, 8 3, 0 6'); poly.setAttribute('fill', color);
    m.appendChild(poly); defs.appendChild(m);
  }

  function renderGraph(container, net, residual, original, totalFlow, pathInfo, isDone, opts) {
    opts = opts || {};
    const vbW = opts.vbW || 700, vbH = opts.vbH || 380;
    const R = opts.nodeRadius || 18;

    const pos = layoutNodes(net.exams, net.rooms, net.proctors, vbW, vbH);
    const pathSet = new Set();
    if (pathInfo) {
      for (let i = 0; i < pathInfo.path.length - 1; i++)
        pathSet.add(edgeKey(pathInfo.path[i], pathInfo.path[i + 1]));
    }

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
    svg.setAttribute('width', '100%');
    svg.style.cssText = 'display:block;max-width:700px;margin:0 auto;';

    const defs = document.createElementNS(SVG_NS, 'defs');
    mkMarker(defs, 'arr-gray', COLORS.edgeDefault);
    mkMarker(defs, 'arr-blue', COLORS.edgeFlow);
    mkMarker(defs, 'arr-orange', COLORS.edgePath);
    mkMarker(defs, 'arr-green', COLORS.edgeDone);
    svg.appendChild(defs);

    // Draw edges (only forward edges from edgeDefs)
    for (const [u, v, cap] of net.edgeDefs) {
      if (!pos[u] || !pos[v]) continue;
      const n1 = pos[u], n2 = pos[v];
      const tip = arrowOffset(n1.x, n1.y, n2.x, n2.y, R + 2);
      const src = arrowOffset(n2.x, n2.y, n1.x, n1.y, R + 2);
      const highlighted = pathSet.has(edgeKey(u, v));

      const f = Math.max(0, (original[u]?.[v] || 0) - (residual[u]?.[v] || 0));
      let color = COLORS.edgeDefault, marker = 'arr-gray', sw = 1;
      if (f > 0) { color = COLORS.edgeFlow; marker = 'arr-blue'; sw = 1.5; }
      if (highlighted) { color = COLORS.edgePath; marker = 'arr-orange'; sw = 2.5; }
      if (isDone && f > 0) { color = COLORS.edgeDone; marker = 'arr-green'; sw = 2; }

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', src.x); line.setAttribute('y1', src.y);
      line.setAttribute('x2', tip.x); line.setAttribute('y2', tip.y);
      line.setAttribute('stroke', color); line.setAttribute('stroke-width', sw);
      line.setAttribute('marker-end', `url(#${marker})`);
      line.setAttribute('stroke-opacity', f === 0 && !highlighted ? '0.35' : '1');
      svg.appendChild(line);

      // Edge label (flow/cap) — skip for zero-flow non-highlighted edges with cap=1 to reduce clutter
      if (cap === 1 && f === 0 && !highlighted) continue;
      const mx = (n1.x + n2.x) / 2, my = (n1.y + n2.y) / 2;
      const dx = n2.x - n1.x, dy = n2.y - n1.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ox = -dy / len * 10, oy = dx / len * 10;

      const lblText = `${f}/${cap}`;
      const tw = lblText.length * 5.5 + 6;
      const bg = document.createElementNS(SVG_NS, 'rect');
      bg.setAttribute('x', mx + ox - tw / 2); bg.setAttribute('y', my + oy - 7);
      bg.setAttribute('width', tw); bg.setAttribute('height', 13); bg.setAttribute('rx', 3);
      bg.setAttribute('fill', highlighted ? '#fff7ed' : '#fff');
      bg.setAttribute('stroke', highlighted ? '#f97316' : '#e5e7eb');
      bg.setAttribute('stroke-width', highlighted ? 1 : 0.5);
      svg.appendChild(bg);

      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', mx + ox); lbl.setAttribute('y', my + oy + 1);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('dominant-baseline', 'middle');
      lbl.setAttribute('font-size', '9'); lbl.setAttribute('font-family', 'monospace');
      lbl.setAttribute('fill', highlighted ? '#ea580c' : f > 0 ? '#1d4ed8' : '#6b7280');
      lbl.textContent = lblText;
      svg.appendChild(lbl);
    }

    // Draw nodes
    for (const id of net.allNodes) {
      if (!pos[id]) continue;
      const p = pos[id];
      const inPath = pathInfo && pathInfo.path.includes(id);
      const col = inPath ? COLORS.highlight : nodeColor(id, net.rooms, net.proctors);

      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', R);
      c.setAttribute('fill', col.fill); c.setAttribute('stroke', col.stroke);
      c.setAttribute('stroke-width', inPath ? 2.5 : 1.5);
      svg.appendChild(c);

      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', p.x); t.setAttribute('y', p.y);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-size', id.length > 2 ? '10' : '12');
      t.setAttribute('font-weight', 'bold'); t.setAttribute('font-family', 'sans-serif');
      t.setAttribute('fill', inPath ? COLORS.highlight.text : col.text);
      t.textContent = id;
      svg.appendChild(t);
    }

    return svg;
  }

  // ── Extract assignments ─────────────────────────────────────────────────────
  function extractAssignments(net, residual, original) {
    const assignments = [];
    for (const e of net.exams) {
      let room = null, proctor = null;
      for (const r of net.rooms) {
        const f = (original[e]?.[r] || 0) - (residual[e]?.[r] || 0);
        if (f > 0) { room = r; break; }
      }
      for (const p of net.proctors) {
        const f = (original[e]?.[p] || 0) - (residual[e]?.[p] || 0);
        if (f > 0) { proctor = p; break; }
      }
      assignments.push({ exam: e, room, proctor });
    }
    return assignments;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIZ 1: Step-Through (4 exams, 4 rooms, 2 proctors)
  // ═══════════════════════════════════════════════════════════════════════════
  function initStepViz() {
    const container = document.getElementById('exam-scheduling-viz');
    if (!container) return;

    const net = buildNetwork(4, 4, 2);
    let residual, original, totalFlow, pendingPath, isDone, stepPhase;

    function reset() {
      residual = cloneGraph(net.graph);
      original = cloneGraph(net.graph);
      totalFlow = 0;
      pendingPath = null;
      isDone = false;
      stepPhase = 'find';
    }
    reset();

    function render() {
      container.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.cssText = 'background:#f8f7ff;border-radius:12px;padding:20px;font-family:sans-serif;';

      // SVG
      panel.appendChild(renderGraph(container, net, residual, original, totalFlow, pendingPath, isDone));

      // Counter + progress bar
      const counter = document.createElement('div');
      counter.style.cssText = 'text-align:center;margin:12px 0 8px;font-size:15px;font-weight:600;color:#374151;';
      counter.innerHTML = `Flow: <span style="color:#6366f1;font-size:18px;">${totalFlow}</span> / Target: <span style="color:#10b981;">${net.target}</span>`;
      panel.appendChild(counter);

      const pbar = document.createElement('div');
      pbar.style.cssText = 'max-width:400px;margin:0 auto 12px;background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;';
      const fill = document.createElement('div');
      const pct = Math.round((totalFlow / net.target) * 100);
      fill.style.cssText = `width:${pct}%;height:100%;background:linear-gradient(90deg,#6366f1,#10b981);border-radius:99px;transition:width 0.4s;`;
      pbar.appendChild(fill);
      panel.appendChild(pbar);

      // Message
      const msg = document.createElement('div');
      msg.style.cssText = 'min-height:44px;max-width:560px;margin:0 auto 14px;padding:10px 16px;border-radius:8px;font-size:14px;text-align:center;';

      if (isDone) {
        const assignments = extractAssignments(net, residual, original);
        const allAssigned = assignments.every(a => a.room && a.proctor);
        if (allAssigned) {
          msg.style.cssText += 'background:#dcfce7;border:1px solid #86efac;color:#15803d;font-weight:600;';
          let html = `✅ All ${net.exams.length} exams scheduled! Flow = ${totalFlow}`;
          html += '<div style="margin-top:8px;font-weight:normal;font-size:13px;text-align:left;display:inline-block;">';
          for (const a of assignments) {
            html += `<div style="margin:2px 0;">📋 <strong>${a.exam}</strong> → 🏫 ${a.room}, 👤 ${a.proctor}</div>`;
          }
          html += '</div>';
          msg.innerHTML = html;
        } else {
          msg.style.cssText += 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;font-weight:600;';
          msg.innerHTML = `❌ Infeasible — only ${totalFlow} of ${net.target} flow achieved. Not all exams can be assigned.`;
        }
      } else if (pendingPath && stepPhase === 'push') {
        msg.style.cssText += 'background:#fff7ed;border:1px solid #fdba74;color:#92400e;';
        const pathStr = pendingPath.path.join(' → ');
        msg.innerHTML = `<strong>Path:</strong> ${pathStr} &nbsp;|&nbsp; <strong>Bottleneck:</strong> ${pendingPath.bottleneck}<br><span style="font-size:12px;color:#b45309;">Click <em>Step</em> to push this flow</span>`;
      } else {
        msg.style.cssText += 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;';
        msg.textContent = totalFlow === 0
          ? 'Click Step to find the first BFS augmenting path.'
          : 'Click Step to find the next augmenting path.';
      }
      panel.appendChild(msg);

      // Buttons
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:8px;';

      function mkBtn(label, bg, hbg, disabled) {
        const b = document.createElement('button');
        b.textContent = label; b.disabled = disabled;
        b.style.cssText = `padding:8px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:${disabled ? 'not-allowed' : 'pointer'};background:${disabled ? '#d1d5db' : bg};color:${disabled ? '#9ca3af' : '#fff'};transition:background 0.2s;`;
        if (!disabled) {
          b.onmouseenter = () => { b.style.background = hbg; };
          b.onmouseleave = () => { b.style.background = bg; };
        }
        return b;
      }

      const stepBtn = mkBtn('▶ Step', '#6366f1', '#4f46e5', isDone);
      const runBtn = mkBtn('⚡ Run All', '#3b82f6', '#2563eb', isDone);
      const resetBtn = mkBtn('↺ Reset', '#6b7280', '#4b5563', false);

      stepBtn.onclick = () => {
        if (isDone) return;
        if (stepPhase === 'find') {
          const result = bfsPath(residual, net.allNodes, net.S, net.T);
          if (!result) { isDone = true; } else { pendingPath = result; stepPhase = 'push'; }
        } else {
          pushFlow(residual, pendingPath.path, pendingPath.bottleneck);
          totalFlow += pendingPath.bottleneck;
          pendingPath = null;
          stepPhase = 'find';
          if (totalFlow >= net.target) {
            // Check if there are more paths (there shouldn't be at target)
            const check = bfsPath(residual, net.allNodes, net.S, net.T);
            if (!check) isDone = true;
          }
        }
        render();
      };

      runBtn.onclick = () => {
        if (isDone) return;
        if (pendingPath && stepPhase === 'push') {
          pushFlow(residual, pendingPath.path, pendingPath.bottleneck);
          totalFlow += pendingPath.bottleneck;
          pendingPath = null;
        }
        let p;
        while ((p = bfsPath(residual, net.allNodes, net.S, net.T)) !== null) {
          pushFlow(residual, p.path, p.bottleneck);
          totalFlow += p.bottleneck;
        }
        isDone = true;
        render();
      };

      resetBtn.onclick = () => { reset(); render(); };

      btnRow.appendChild(stepBtn);
      btnRow.appendChild(runBtn);
      btnRow.appendChild(resetBtn);
      panel.appendChild(btnRow);

      // Legend
      const legend = document.createElement('div');
      legend.style.cssText = 'display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#6b7280;';
      const items = [
        [COLORS.source.stroke, '● Source'],
        [COLORS.exam.stroke, '● Exam'],
        [COLORS.room.stroke, '● Room'],
        [COLORS.proctor.stroke, '● Proctor'],
        [COLORS.sink.stroke, '● Sink'],
        [COLORS.edgePath, '— Active path'],
      ];
      for (const [color, label] of items) {
        const span = document.createElement('span');
        span.innerHTML = `<span style="color:${color};font-weight:bold;">${label.charAt(0)}</span>${label.slice(1)}`;
        legend.appendChild(span);
      }
      panel.appendChild(legend);

      container.appendChild(panel);
    }

    render();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIZ 2: Build Your Own
  // ═══════════════════════════════════════════════════════════════════════════
  function initBuilderViz() {
    const container = document.getElementById('exam-scheduling-builder');
    if (!container) return;

    let nExams = 4, nRooms = 4, nProctors = 2;
    let result = null; // { net, residual, original, totalFlow, isDone }

    function solve() {
      const net = buildNetwork(nExams, nRooms, nProctors);
      const residual = cloneGraph(net.graph);
      const original = cloneGraph(net.graph);
      let totalFlow = 0;
      let p;
      while ((p = bfsPath(residual, net.allNodes, net.S, net.T)) !== null) {
        pushFlow(residual, p.path, p.bottleneck);
        totalFlow += p.bottleneck;
      }
      result = { net, residual, original, totalFlow, feasible: totalFlow === net.target };
    }

    function render() {
      container.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.cssText = 'background:#f8f7ff;border-radius:12px;padding:20px;font-family:sans-serif;';

      // Controls
      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end;';

      function mkSlider(label, min, max, value, onChange) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:center;';
        const lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;';
        lbl.textContent = label;
        const valSpan = document.createElement('span');
        valSpan.style.cssText = 'display:inline-block;min-width:24px;font-size:20px;font-weight:bold;color:#6366f1;';
        valSpan.textContent = value;
        const input = document.createElement('input');
        input.type = 'range'; input.min = min; input.max = max; input.value = value;
        input.style.cssText = 'width:120px;display:block;margin:4px auto;accent-color:#6366f1;';
        input.oninput = () => { valSpan.textContent = input.value; onChange(parseInt(input.value)); };
        wrap.appendChild(lbl);
        wrap.appendChild(valSpan);
        wrap.appendChild(input);
        return wrap;
      }

      controls.appendChild(mkSlider('Exams', 1, 8, nExams, v => { nExams = v; }));
      controls.appendChild(mkSlider('Rooms', 1, 8, nRooms, v => { nRooms = v; }));
      controls.appendChild(mkSlider('Proctors', 1, 4, nProctors, v => { nProctors = v; }));

      const solveBtn = document.createElement('button');
      solveBtn.textContent = '🔍 Build & Solve';
      solveBtn.style.cssText = 'padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#6366f1;color:#fff;transition:background 0.2s;align-self:flex-end;';
      solveBtn.onmouseenter = () => { solveBtn.style.background = '#4f46e5'; };
      solveBtn.onmouseleave = () => { solveBtn.style.background = '#6366f1'; };
      solveBtn.onclick = () => { solve(); render(); };
      controls.appendChild(solveBtn);

      panel.appendChild(controls);

      // Capacity check
      const capCheck = document.createElement('div');
      capCheck.style.cssText = 'text-align:center;margin-bottom:12px;font-size:13px;color:#6b7280;';
      const roomCap = nRooms;
      const proctorCap = nProctors * 5;
      const examBottleneck = Math.min(roomCap, proctorCap);
      capCheck.innerHTML = `Room capacity: <strong>${roomCap}</strong> exams &nbsp;|&nbsp; Proctor capacity: <strong>${proctorCap}</strong> exams &nbsp;|&nbsp; Need: <strong>${nExams}</strong> exams`;
      if (nExams > examBottleneck) {
        capCheck.innerHTML += `<br><span style="color:#dc2626;font-weight:600;">⚠️ Upper bound is ${examBottleneck} — likely infeasible</span>`;
      }
      panel.appendChild(capCheck);

      // Result
      if (result) {
        // Graph (dynamic sizing)
        const totalNodes = result.net.allNodes.length;
        const vbH = Math.max(280, 50 * Math.max(nExams, nRooms + nProctors) + 40);
        panel.appendChild(renderGraph(container, result.net, result.residual, result.original, result.totalFlow, null, true, { vbH }));

        // Result message
        const msg = document.createElement('div');
        msg.style.cssText = 'max-width:560px;margin:12px auto;padding:12px 16px;border-radius:8px;font-size:14px;text-align:center;';

        if (result.feasible) {
          msg.style.cssText += 'background:#dcfce7;border:1px solid #86efac;color:#15803d;';
          const assignments = extractAssignments(result.net, result.residual, result.original);
          let html = `<strong>✅ Feasible!</strong> Max flow = ${result.totalFlow} = 2 × ${nExams}`;
          html += '<div style="margin-top:8px;font-size:13px;text-align:left;display:inline-block;">';

          // Group by proctor for summary
          const proctorMap = {};
          for (const a of assignments) {
            html += `<div style="margin:2px 0;">📋 <strong>${a.exam}</strong> → 🏫 ${a.room}, 👤 ${a.proctor}</div>`;
            if (a.proctor) {
              if (!proctorMap[a.proctor]) proctorMap[a.proctor] = 0;
              proctorMap[a.proctor]++;
            }
          }
          html += '</div>';
          html += '<div style="margin-top:8px;font-size:12px;color:#166534;">';
          for (const [p, count] of Object.entries(proctorMap)) {
            html += `${p}: ${count}/5 exams &nbsp; `;
          }
          html += '</div>';
          msg.innerHTML = html;
        } else {
          msg.style.cssText += 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;';
          const assigned = Math.floor(result.totalFlow / 2);
          let bottleneckMsg = '';
          if (nRooms < nExams && nProctors * 5 >= nExams) {
            bottleneckMsg = `Bottleneck: <strong>rooms</strong> (${nRooms} rooms for ${nExams} exams)`;
          } else if (nProctors * 5 < nExams && nRooms >= nExams) {
            bottleneckMsg = `Bottleneck: <strong>proctors</strong> (${nProctors} proctors × 5 = ${nProctors * 5} capacity for ${nExams} exams)`;
          } else {
            bottleneckMsg = `Bottleneck: <strong>both rooms and proctors</strong>`;
          }
          msg.innerHTML = `<strong>❌ Infeasible</strong> — Flow = ${result.totalFlow} / ${result.net.target}. Only ${assigned} of ${nExams} exams fully assigned.<br><span style="font-size:13px;">${bottleneckMsg}</span>`;
        }
        panel.appendChild(msg);
      } else {
        const hint = document.createElement('div');
        hint.style.cssText = 'text-align:center;color:#9ca3af;font-size:14px;padding:40px 0;';
        hint.textContent = 'Adjust the sliders and click Build & Solve to see the flow network.';
        panel.appendChild(hint);
      }

      container.appendChild(panel);
    }

    render();
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  function init() {
    initStepViz();
    initBuilderViz();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
