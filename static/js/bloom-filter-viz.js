// Bloom Filter Visualizer
// Interactive 32-bit / 3-hash Bloom filter: insert items, query membership,
// and manufacture a false positive. Faithful to the algorithm:
//   - insert sets all k bits
//   - query passes only if ALL k bits are set
//   - false positives possible, false negatives impossible
(function () {
  // ── Parameters ───────────────────────────────────────────────────────────────
  const M = 32; // number of bits in the array
  const K = 3;  // number of hash functions

  // ── State ────────────────────────────────────────────────────────────────────
  let bits;            // Array(M) of 0/1
  let inserted;        // Set of strings actually inserted (ground truth)
  let last;            // { type, item, positions:[{idx,wasSet}], present, falsePositive } | null

  function initState() {
    bits = new Array(M).fill(0);
    inserted = new Set();
    last = null;
  }

  // ── Hash functions (three independent, deterministic string hashes) ──────────
  function hashDJB2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  function hashSDBM(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (str.charCodeAt(i) + (h << 6) + (h << 16) - h) >>> 0;
    return h >>> 0;
  }
  function hashFNV1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  const HASHES = [hashDJB2, hashSDBM, hashFNV1a];

  function positionsFor(item) {
    // Deduplicate: two hashes can land on the same bit; report distinct positions.
    const seen = [];
    for (const fn of HASHES) {
      const idx = fn(item) % M;
      if (!seen.includes(idx)) seen.push(idx);
    }
    return seen;
  }

  // ── Operations ───────────────────────────────────────────────────────────────
  function normalize(raw) {
    return (raw || '').trim().toLowerCase();
  }

  function insertItem(item) {
    const positions = positionsFor(item).map((idx) => ({ idx, wasSet: bits[idx] === 1 }));
    for (const p of positions) bits[p.idx] = 1;
    inserted.add(item);
    last = { type: 'insert', item, positions, present: true, falsePositive: false };
  }

  function queryItem(item) {
    const positions = positionsFor(item).map((idx) => ({ idx, wasSet: bits[idx] === 1 }));
    const present = positions.every((p) => p.wasSet); // all k bits set
    const falsePositive = present && !inserted.has(item);
    last = { type: 'query', item, positions, present, falsePositive };
  }

  // Search for a string that the filter reports as present but was never inserted.
  function findFalsePositive() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    // Try short deterministic candidates: single letters, then pairs, then triples.
    const tryCandidate = (c) => {
      if (inserted.has(c)) return false;
      const positions = positionsFor(c);
      return positions.every((idx) => bits[idx] === 1);
    };
    for (let a = 0; a < 26; a++) {
      const c = alphabet[a];
      if (tryCandidate(c)) return c;
    }
    for (let a = 0; a < 26; a++) {
      for (let b = 0; b < 26; b++) {
        const c = alphabet[a] + alphabet[b];
        if (tryCandidate(c)) return c;
      }
    }
    for (let a = 0; a < 26; a++) {
      for (let b = 0; b < 26; b++) {
        for (let d = 0; d < 26; d++) {
          const c = alphabet[a] + alphabet[b] + alphabet[d];
          if (tryCandidate(c)) return c;
        }
      }
    }
    return null;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function highlightFor(idx) {
    // Returns 'set' | 'clear' | null for the bit involved in the last op.
    if (!last) return null;
    const p = last.positions.find((q) => q.idx === idx);
    if (!p) return null;
    if (last.type === 'insert') return 'insert';
    return p.wasSet ? 'hit' : 'miss'; // query: green if set, red if zero
  }

  function render(container) {
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#f8f7ff;border-radius:12px;padding:20px;font-family:sans-serif;';

    // ── Controls ────────────────────────────────────────────────────────────────
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'type a word…';
    input.setAttribute('aria-label', 'Item to insert or query');
    input.style.cssText = 'padding:8px 12px;border:1px solid #c7c3e8;border-radius:8px;font-size:14px;min-width:160px;font-family:monospace;';

    const mkBtn = (label, bg, hbg) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `padding:8px 16px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:${bg};color:#fff;transition:background 0.2s;`;
      b.onmouseenter = () => { b.style.background = hbg; };
      b.onmouseleave = () => { b.style.background = bg; };
      return b;
    };

    const insertBtn = mkBtn('+ Insert', '#6366f1', '#4f46e5');
    const queryBtn  = mkBtn('? Query', '#3b82f6', '#2563eb');

    const doInsert = () => {
      const v = normalize(input.value);
      if (!v) return;
      insertItem(v);
      input.value = '';
      render(container);
    };
    const doQuery = () => {
      const v = normalize(input.value);
      if (!v) return;
      queryItem(v);
      render(container);
    };

    insertBtn.onclick = doInsert;
    queryBtn.onclick = doQuery;
    input.onkeydown = (e) => { if (e.key === 'Enter') doInsert(); };

    controls.appendChild(input);
    controls.appendChild(insertBtn);
    controls.appendChild(queryBtn);
    panel.appendChild(controls);

    // ── Result banner ─────────────────────────────────────────────────────────
    if (last) {
      const banner = document.createElement('div');
      const posList = last.positions.map((p) => p.idx).join(', ');
      let bg, border, textColor, html;
      if (last.type === 'insert') {
        bg = '#eef2ff'; border = '#6366f1'; textColor = '#3730a3';
        html = `<strong>Inserted “${last.item}”</strong> — set bit${last.positions.length > 1 ? 's' : ''} <code style="font-family:monospace;">${posList}</code>. Its ${K} hashes turn those positions to 1.`;
      } else if (!last.present) {
        bg = '#fef2f2'; border = '#ef4444'; textColor = '#b91c1c';
        const zero = last.positions.find((p) => !p.wasSet);
        html = `<strong>“${last.item}” is definitely NOT in the set.</strong> Bit <code style="font-family:monospace;">${zero.idx}</code> is 0 — if it had ever been inserted, all ${K} bits would be 1. (No false negatives, ever.)`;
      } else if (last.falsePositive) {
        bg = '#fffbeb'; border = '#f59e0b'; textColor = '#92400e';
        html = `<strong>⚠️ False positive.</strong> “${last.item}” reports <em>possibly present</em> — all its bits (<code style="font-family:monospace;">${posList}</code>) are 1 — but it was never inserted. Other items set those bits.`;
      } else {
        bg = '#f0fdf4'; border = '#22c55e'; textColor = '#15803d';
        html = `<strong>“${last.item}” is possibly in the set.</strong> All ${K} bits (<code style="font-family:monospace;">${posList}</code>) are 1. It was inserted, so this is a true positive.`;
      }
      banner.style.cssText = `max-width:560px;margin:0 auto 16px;padding:12px 16px;background:${bg};border:1px solid ${border};border-radius:10px;font-size:13.5px;line-height:1.5;color:${textColor};text-align:center;`;
      banner.innerHTML = html;
      panel.appendChild(banner);
    }

    // ── Bit array grid ──────────────────────────────────────────────────────────
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8, 1fr);gap:6px;max-width:420px;margin:0 auto 16px;';

    for (let i = 0; i < M; i++) {
      const cell = document.createElement('div');
      const on = bits[i] === 1;
      const hl = highlightFor(i);

      let bg = on ? '#6366f1' : '#e5e7eb';
      let color = on ? '#ffffff' : '#9ca3af';
      let border = '2px solid transparent';
      let shadow = 'none';
      if (hl === 'insert') { border = '2px solid #4338ca'; shadow = '0 0 0 3px rgba(99,102,241,0.25)'; }
      else if (hl === 'hit') { bg = '#22c55e'; color = '#fff'; border = '2px solid #15803d'; shadow = '0 0 0 3px rgba(34,197,94,0.25)'; }
      else if (hl === 'miss') { bg = '#fca5a5'; color = '#7f1d1d'; border = '2px solid #ef4444'; shadow = '0 0 0 3px rgba(239,68,68,0.25)'; }

      cell.style.cssText = `position:relative;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;border-radius:8px;background:${bg};color:${color};border:${border};box-shadow:${shadow};font-family:monospace;font-weight:700;font-size:15px;transition:all 0.15s;`;
      cell.textContent = on ? '1' : '0';

      const idxLabel = document.createElement('span');
      idxLabel.textContent = i;
      idxLabel.style.cssText = 'position:absolute;top:1px;right:3px;font-size:8px;font-weight:400;opacity:0.6;';
      cell.appendChild(idxLabel);

      grid.appendChild(cell);
    }
    panel.appendChild(grid);

    // ── Stats row ───────────────────────────────────────────────────────────────
    const n = inserted.size;
    const set = bits.reduce((a, b) => a + b, 0);
    // Estimated false-positive probability: (1 - e^(-kn/m))^k
    const fp = n === 0 ? 0 : Math.pow(1 - Math.exp((-K * n) / M), K);
    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:13px;color:#374151;margin-bottom:14px;';
    const stat = (label, value) =>
      `<span style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;"><strong style="color:#6366f1;">${value}</strong> <span style="color:#6b7280;">${label}</span></span>`;
    stats.innerHTML =
      stat('items (n)', n) +
      stat('bits set', `${set}/${M}`) +
      stat('est. false-positive rate', `${(fp * 100).toFixed(1)}%`) +
      stat('hashes (k)', K);
    panel.appendChild(stats);

    // ── Inserted items ──────────────────────────────────────────────────────────
    const itemsWrap = document.createElement('div');
    itemsWrap.style.cssText = 'max-width:520px;margin:0 auto 14px;text-align:center;';
    if (n === 0) {
      itemsWrap.innerHTML = '<div style="font-size:13px;color:#9ca3af;">No items yet — insert a few words to start filling the array.</div>';
    } else {
      const label = document.createElement('div');
      label.style.cssText = 'font-size:12px;color:#6b7280;margin-bottom:6px;';
      label.textContent = 'In the set:';
      itemsWrap.appendChild(label);
      const chips = document.createElement('div');
      chips.style.cssText = 'display:flex;gap:6px;justify-content:center;flex-wrap:wrap;';
      for (const it of inserted) {
        const chip = document.createElement('span');
        chip.textContent = it;
        chip.style.cssText = 'background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:99px;padding:3px 10px;font-size:12px;font-family:monospace;';
        chips.appendChild(chip);
      }
      itemsWrap.appendChild(chips);
    }
    panel.appendChild(itemsWrap);

    // ── Secondary buttons ───────────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';

    const seedBtn = mkBtn('Seed example words', '#8b5cf6', '#7c3aed');
    const fpBtn   = mkBtn('Find a false positive', '#f59e0b', '#d97706');
    const resetBtn = mkBtn('↺ Reset', '#6b7280', '#4b5563');

    seedBtn.onclick = () => {
      ['cat', 'dog', 'bird', 'fish', 'mouse', 'horse', 'sheep'].forEach(insertItem);
      last = null;
      render(container);
    };
    fpBtn.onclick = () => {
      const fpItem = findFalsePositive();
      if (fpItem) {
        queryItem(fpItem);
      } else {
        last = {
          type: 'query', item: '(none found)', positions: [], present: false, falsePositive: false,
          note: 'no-fp',
        };
      }
      render(container);
    };
    resetBtn.onclick = () => { initState(); render(container); };

    btnRow.appendChild(seedBtn);
    btnRow.appendChild(fpBtn);
    btnRow.appendChild(resetBtn);
    panel.appendChild(btnRow);

    // No-false-positive hint
    if (last && last.note === 'no-fp') {
      const hint = document.createElement('div');
      hint.style.cssText = 'text-align:center;font-size:12px;color:#9ca3af;margin-top:10px;';
      hint.textContent = 'No false positive among short candidates yet — insert more items to crowd the array, then try again.';
      panel.appendChild(hint);
    }

    container.appendChild(panel);
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  function init() {
    const container = document.getElementById('bloom-filter-viz');
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
