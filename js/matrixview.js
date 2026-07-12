/* ============================================================
   Adjacency — matrixview.js
   Live editable matrix grid + heatmap renderer.
   ============================================================ */
(function () {
  'use strict';

  class MatrixGrid {
    constructor(container, { onEdit = null, onHover = null } = {}) {
      this.container = container;
      this.onEdit = onEdit;     // (i, j, value) — only for view 'A'
      this.onHover = onHover;   // ({i,j}|null)
      this.graph = null;
      this.view = 'A';
      this.cells = [];          // cells[i][j] → element
      this.highlight = null;
      container.classList.add('mx-scroll');
      container.addEventListener('mouseleave', () => {
        this._clearHover();
        if (this.onHover) this.onHover(null);
      });
    }

    update(graph, view = this.view) {
      this.graph = graph;
      this.view = view;
      const n = graph.n;
      const M = graph.view(view);
      const zeroRows = view === 'P' ? graph.transition().zeroRows : [];
      const editable = view === 'A';
      const el = this.container;
      el.innerHTML = '';
      this.cells = [];
      if (!n) {
        el.innerHTML = '<div class="mx-empty">No nodes yet — double-click the canvas to add one.</div>';
        return;
      }
      const cell = n <= 8 ? 44 : n <= 12 ? 36 : n <= 16 ? 30 : 26;
      const grid = document.createElement('div');
      grid.className = 'mx-grid';
      grid.style.setProperty('--cell', cell + 'px');
      grid.style.gridTemplateColumns = `${Math.max(30, cell * 0.82)}px repeat(${n}, var(--cell))`;

      // corner
      const corner = document.createElement('div');
      corner.className = 'mx-corner';
      corner.textContent = view;
      grid.appendChild(corner);
      // column headers
      this.colHeads = [];
      for (let j = 0; j < n; j++) {
        const h = document.createElement('div');
        h.className = 'mx-head mx-col';
        h.textContent = this._short(graph.nodes[j].label);
        h.title = graph.nodes[j].label;
        h.addEventListener('mouseenter', () => this.onHover && this.onHover({ i: j, j }));
        grid.appendChild(h);
        this.colHeads.push(h);
      }
      const maxAbs = Math.max(1e-12, ...M.flat().map(Math.abs));
      this.rowHeads = [];
      for (let i = 0; i < n; i++) {
        const rh = document.createElement('div');
        rh.className = 'mx-head mx-row' + (zeroRows.includes(i) ? ' mx-warn' : '');
        rh.textContent = this._short(graph.nodes[i].label);
        rh.title = graph.nodes[i].label + (zeroRows.includes(i) ? ' — no outgoing edges: row is all zeros, P is not stochastic here' : '');
        rh.addEventListener('mouseenter', () => this.onHover && this.onHover({ i, j: i }));
        grid.appendChild(rh);
        this.rowHeads.push(rh);
        const rowCells = [];
        for (let j = 0; j < n; j++) {
          const c = document.createElement('div');
          const v = M[i][j];
          c.className = 'mx-cell' + (i === j ? ' mx-diag' : '') + (editable ? ' mx-edit' : '');
          c.textContent = LA.fmt(v, view === 'P' ? 3 : 4);
          this._paint(c, v, maxAbs);
          c.addEventListener('mouseenter', () => {
            this._setHover(i, j);
            if (this.onHover) this.onHover({ i, j });
          });
          if (editable) {
            c.addEventListener('click', () => this._editCell(i, j, c));
          }
          grid.appendChild(c);
          rowCells.push(c);
        }
        this.cells.push(rowCells);
      }
      el.appendChild(grid);
      if (this.highlight) this.setHighlight(this.highlight.i, this.highlight.j);
    }

    _short(s) { return s.length > 4 ? s.slice(0, 3) + '…' : s; }

    _paint(c, v, maxAbs) {
      if (v === 0) { c.style.background = ''; c.classList.add('mx-zero'); return; }
      c.classList.remove('mx-zero');
      const t = Math.min(1, Math.abs(v) / maxAbs);
      c.style.background = v > 0
        ? `rgba(100, 210, 255, ${0.07 + 0.30 * t})`
        : `rgba(255, 107, 107, ${0.10 + 0.30 * t})`;
    }

    _editCell(i, j, c) {
      const g = this.graph;
      if (!g.weighted) {
        const cur = g.getW(i, j);
        this.onEdit && this.onEdit(i, j, cur ? 0 : 1);
        return;
      }
      if (c.querySelector('input')) return;
      const cur = g.getW(i, j);
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.className = 'mx-input';
      inp.value = cur === 0 ? '' : String(cur);
      c.textContent = '';
      c.appendChild(inp);
      inp.focus(); inp.select();
      let done = false;
      const commit = save => {
        if (done) return;
        done = true;
        const raw = inp.value.trim();
        const w = raw === '' ? 0 : parseFloat(raw);
        if (save && Number.isFinite(w)) this.onEdit && this.onEdit(i, j, w);
        else this.update(this.graph, this.view);
      };
      inp.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') commit(true);
        if (ev.key === 'Escape') commit(false);
      });
      inp.addEventListener('blur', () => commit(true));
    }

    _setHover(i, j) {
      this._clearHover();
      this._hovered = [];
      const mark = (el, cls) => { el.classList.add(cls); this._hovered.push([el, cls]); };
      if (this.cells[i] && this.cells[i][j]) mark(this.cells[i][j], 'mx-hover');
      if (!this.graph.directed && this.cells[j] && this.cells[j][i]) mark(this.cells[j][i], 'mx-hover-soft');
      if (this.rowHeads[i]) mark(this.rowHeads[i], 'mx-head-hot');
      if (this.colHeads[j]) mark(this.colHeads[j], 'mx-head-hot');
    }
    _clearHover() {
      (this._hovered || []).forEach(([el, cls]) => el.classList.remove(cls));
      this._hovered = [];
    }

    /* highlight driven by graph-side hover */
    setHighlight(i, j) {
      this.clearHighlight();
      this.highlight = { i, j };
      this._hl = [];
      const mark = (el, cls) => { if (el) { el.classList.add(cls); this._hl.push([el, cls]); } };
      if (i === j || j == null) { // node
        mark(this.rowHeads[i], 'mx-head-hot');
        mark(this.colHeads[i], 'mx-head-hot');
        (this.cells[i] || []).forEach(c => mark(c, 'mx-row-glow'));
        this.cells.forEach(row => mark(row[i], 'mx-row-glow'));
      } else {
        mark(this.cells[i] && this.cells[i][j], 'mx-hover');
        if (!this.graph.directed) mark(this.cells[j] && this.cells[j][i], 'mx-hover');
        mark(this.rowHeads[i], 'mx-head-hot');
        mark(this.colHeads[j], 'mx-head-hot');
      }
      const target = this.cells[i] && this.cells[i][Math.min(j ?? i, this.cells[i].length - 1)];
      if (target && typeof target.scrollIntoView === 'function')
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    clearHighlight() {
      (this._hl || []).forEach(([el, cls]) => el.classList.remove(cls));
      this._hl = [];
      this.highlight = null;
    }
  }

  /* ---------- static result-matrix renderer (solver output etc.) ---------- */
  function renderStatic(container, M, { digits = 4, maxCell = 999 } = {}) {
    container.innerHTML = '';
    if (!M || !M.length) return;
    const n = M.length, m = M[0].length;
    const cellPx = m <= 8 ? 46 : m <= 12 ? 38 : m <= 16 ? 32 : 27;
    const grid = document.createElement('div');
    grid.className = 'mx-grid mx-static';
    grid.style.setProperty('--cell', cellPx + 'px');
    grid.style.gridTemplateColumns = `repeat(${m}, minmax(var(--cell), auto))`;
    const maxAbs = Math.max(1e-12, ...M.flat().map(Math.abs));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const c = document.createElement('div');
      c.className = 'mx-cell' + (i === j ? ' mx-diag' : '');
      const v = M[i][j];
      c.textContent = LA.fmt(v, digits);
      if (v !== 0) {
        const t = Math.min(1, Math.abs(v) / maxAbs);
        c.style.background = v > 0
          ? `rgba(100,210,255,${0.06 + 0.26 * t})`
          : `rgba(255,107,107,${0.08 + 0.26 * t})`;
      } else c.classList.add('mx-zero');
      grid.appendChild(c);
    }
    container.appendChild(grid);
    void maxCell;
  }

  /* ---------- heatmap (playground, gallery previews) ---------- */
  function heatmap(canvas, M, { pad = 0 } = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const wCss = canvas.clientWidth || parseInt(canvas.getAttribute('width')) || 160;
    const hCss = canvas.clientHeight || wCss;
    canvas.width = wCss * dpr; canvas.height = hCss * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    const n = M.length;
    if (!n) return;
    // fill the whole canvas — cells stretch to the container's shape
    const cw = (wCss - 2 * pad) / n, ch = (hCss - 2 * pad) / n;
    const gap = Math.min(1, cw * 0.12, ch * 0.12);
    const maxAbs = Math.max(1e-12, ...M.flat().map(Math.abs));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = M[i][j];
      if (v === 0) { ctx.fillStyle = 'rgba(226,234,255,0.045)'; }
      else {
        const t = Math.min(1, Math.abs(v) / maxAbs);
        ctx.fillStyle = v > 0
          ? `rgba(${Math.round(100 + 91 * t)}, ${Math.round(210 - 80 * t)}, ${Math.round(255 - 13 * t)}, ${0.25 + 0.75 * t})`
          : `rgba(255,107,107,${0.25 + 0.7 * t})`;
      }
      ctx.fillRect(pad + j * cw + gap / 2, pad + i * ch + gap / 2,
                   Math.max(0.5, cw - gap), Math.max(0.5, ch - gap));
    }
  }

  window.MatrixGrid = MatrixGrid;
  window.MatrixUI = { renderStatic, heatmap };
})();
