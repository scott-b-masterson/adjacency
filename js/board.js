/* ============================================================
   Adjacency — board.js
   Interactive canvas graph editor: drag, draw, pan/zoom,
   directed arrows, flow particles, random-walk animation.
   ============================================================ */
(function () {
  'use strict';

  const PAL = {
    accent: '#64d2ff', accent2: '#bf5af2', blue: '#2997ff', gold: '#f5b942',
    edge: 'rgba(226,234,255,0.30)', edgeDim: 'rgba(226,234,255,0.14)',
    label: '#f5f5f7', dot: 'rgba(226,234,255,0.05)',
    danger: '#ff6b6b'
  };
  const NODE_R = 15;

  class Board {
    constructor(container, opts = {}) {
      this.container = container;
      this.mode = opts.mode || 'edit';
      this.onChange = opts.onChange || (() => {});
      this.onHover = opts.onHover || (() => {});
      this.onSelect = opts.onSelect || (() => {});
      this.onStatus = opts.onStatus || (() => {});

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'board-canvas';
      container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.graph = null;
      this.s = 1; this.ox = 0; this.oy = 0;
      this.tool = 'select';
      this.physics = false;
      this.flow = true;
      this.hover = null;            // {type:'node'|'edge', i, j?}
      this.selection = null;
      this.extHighlight = null;     // from matrix hover
      this.drag = null;             // {kind:'node'|'pan', ...}
      this.edgeDraft = null;        // {from, x, y}
      this.pendingFrom = null;      // click-click edge building
      this.needsFit = true;
      this.walk = null;             // random walk state
      this._time = 0;

      this._bind();
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(container);
      this._resize();
    }

    setGraph(g, { fit = true } = {}) {
      this.graph = g;
      this.selection = null; this.hover = null; this.edgeDraft = null;
      this.pendingFrom = null;
      this.stopWalk();
      if (fit) this.needsFit = true;
    }

    /* ---------------- coords ---------------- */
    toScreen(x, y) { return [x * this.s + this.ox, y * this.s + this.oy]; }
    toWorld(px, py) { return [(px - this.ox) / this.s, (py - this.oy) / this.s]; }
    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (!w || !h) return;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h;
    }
    fit() {
      const g = this.graph;
      if (!g || !g.n) { this.s = 1; this.ox = this.w / 2; this.oy = this.h / 2; return; }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      g.nodes.forEach(nd => {
        x0 = Math.min(x0, nd.x); y0 = Math.min(y0, nd.y);
        x1 = Math.max(x1, nd.x); y1 = Math.max(y1, nd.y);
      });
      const pad = 70;
      const sw = (this.w - 2 * pad) / Math.max(60, x1 - x0);
      const sh = (this.h - 2 * pad) / Math.max(60, y1 - y0);
      this.s = Math.min(1.6, Math.max(0.25, Math.min(sw, sh)));
      this.ox = this.w / 2 - (x0 + x1) / 2 * this.s;
      this.oy = this.h / 2 - (y0 + y1) / 2 * this.s;
    }
    zoom(factor, cx = this.w / 2, cy = this.h / 2) {
      const ns = Math.min(3, Math.max(0.2, this.s * factor));
      const [wx, wy] = this.toWorld(cx, cy);
      this.s = ns;
      this.ox = cx - wx * ns; this.oy = cy - wy * ns;
    }

    /* ---------------- geometry ---------------- */
    edgePath(i, j) {
      const g = this.graph, a = g.nodes[i], b = g.nodes[j];
      if (i === j) return { type: 'loop', cx: a.x, cy: a.y - NODE_R - 17, r: 15, nx: a.x, ny: a.y };
      const reciprocal = g.directed && g.hasEdge(j, i);
      if (reciprocal) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(1, Math.hypot(dx, dy));
        return { type: 'quad', x0: a.x, y0: a.y, cx: mx - dy / d * 30, cy: my + dx / d * 30, x1: b.x, y1: b.y };
      }
      return { type: 'line', x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    }
    pointAt(path, t) {
      if (path.type === 'line') return [path.x0 + (path.x1 - path.x0) * t, path.y0 + (path.y1 - path.y0) * t];
      if (path.type === 'quad') {
        const u = 1 - t;
        return [u * u * path.x0 + 2 * u * t * path.cx + t * t * path.x1,
                u * u * path.y0 + 2 * u * t * path.cy + t * t * path.y1];
      }
      const a = -Math.PI / 2 + t * 2 * Math.PI; // loop
      return [path.cx + path.r * Math.cos(a), path.cy + path.r * Math.sin(a)];
    }
    hitNode(wx, wy) {
      const g = this.graph;
      if (!g) return -1;
      for (let i = g.n - 1; i >= 0; i--) {
        const nd = g.nodes[i];
        if (Math.hypot(nd.x - wx, nd.y - wy) <= NODE_R + 4) return i;
      }
      return -1;
    }
    hitEdge(wx, wy) {
      const g = this.graph;
      if (!g) return null;
      const thr = 8 / this.s + 2;
      let best = null, bestD = thr;
      g.forEachEdge((i, j) => {
        const p = this.edgePath(i, j);
        for (let k = 0; k <= 24; k++) {
          const [x, y] = this.pointAt(p, k / 24);
          const d = Math.hypot(x - wx, y - wy);
          if (d < bestD) { bestD = d; best = { type: 'edge', i, j }; }
        }
      });
      return best;
    }

    /* ---------------- input ---------------- */
    _bind() {
      const cv = this.canvas;
      cv.addEventListener('pointerdown', e => this._down(e));
      cv.addEventListener('pointermove', e => this._move(e));
      cv.addEventListener('pointerup', e => this._up(e));
      cv.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); });
      cv.addEventListener('dblclick', e => this._dbl(e));
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        this.zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      cv.addEventListener('contextmenu', e => e.preventDefault());
    }
    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    _down(e) {
      if (!this.graph) return;
      this.canvas.setPointerCapture(e.pointerId);
      this._closeFloatingInput();
      const [px, py] = this._pos(e);
      const [wx, wy] = this.toWorld(px, py);
      const ni = this.hitNode(wx, wy);
      const edit = this.mode === 'edit';
      const rightBtn = e.button === 2;

      if (rightBtn && edit) {           // right-click = quick erase
        if (ni >= 0) { this._deleteNode(ni); }
        else { const he = this.hitEdge(wx, wy); if (he) this._deleteEdge(he.i, he.j); }
        return;
      }
      if (edit && this.tool === 'node') {
        if (ni < 0) { this._addNode(wx, wy); }
        return;
      }
      if (edit && this.tool === 'edge') {
        if (ni >= 0) {
          this.edgeDraft = { from: ni, x: wx, y: wy, moved: false };
        }
        return;
      }
      if (edit && this.tool === 'erase') {
        if (ni >= 0) { this._deleteNode(ni); return; }
        const he = this.hitEdge(wx, wy);
        if (he) this._deleteEdge(he.i, he.j);
        return;
      }
      // select / view tool
      if (ni >= 0) {
        const nd = this.graph.nodes[ni];
        this.drag = { kind: 'node', i: ni, dx: nd.x - wx, dy: nd.y - wy, moved: false };
        this.selection = { type: 'node', i: ni };
        this.onSelect(this.selection);
      } else {
        const he = this.mode === 'edit' ? this.hitEdge(wx, wy) : null;
        if (he) {
          this.selection = he;
          this.onSelect(this.selection);
        } else {
          this.drag = { kind: 'pan', px, py, ox: this.ox, oy: this.oy };
          this.selection = null;
          this.onSelect(null);
        }
      }
    }
    _move(e) {
      if (!this.graph) return;
      const [px, py] = this._pos(e);
      const [wx, wy] = this.toWorld(px, py);
      if (this.edgeDraft) {
        this.edgeDraft.x = wx; this.edgeDraft.y = wy; this.edgeDraft.moved = true;
        const t = this.hitNode(wx, wy);
        this.edgeDraft.snap = t;
        return;
      }
      if (this.drag) {
        if (this.drag.kind === 'node') {
          const nd = this.graph.nodes[this.drag.i];
          nd.x = wx + this.drag.dx; nd.y = wy + this.drag.dy;
          nd.vx = nd.vy = 0;
          this.drag.moved = true;
        } else {
          this.ox = this.drag.ox + (px - this.drag.px);
          this.oy = this.drag.oy + (py - this.drag.py);
        }
        return;
      }
      // hover
      const ni = this.hitNode(wx, wy);
      let nh = null;
      if (ni >= 0) nh = { type: 'node', i: ni };
      else nh = this.hitEdge(wx, wy);
      const changed = JSON.stringify(nh) !== JSON.stringify(this.hover);
      this.hover = nh;
      if (changed) this.onHover(nh);
      this._cursor(ni >= 0 || (nh && nh.type === 'edge'));
    }
    _up(e) {
      if (!this.graph) return;
      const [px, py] = this._pos(e);
      const [wx, wy] = this.toWorld(px, py);
      if (this.edgeDraft) {
        const from = this.edgeDraft.from;
        const target = this.hitNode(wx, wy);
        const dist = this.edgeDraft.moved ? Math.hypot(
          wx - this.graph.nodes[from].x, wy - this.graph.nodes[from].y) : 0;
        if (target >= 0 && (target !== from || dist < NODE_R)) {
          if (target === from && dist < NODE_R && !this._wasDragToSelf) {
            // click on start node: begin click-click mode, or complete self-loop
            if (this.pendingFrom === from) { this._addEdge(from, from); this.pendingFrom = null; }
            else if (this.pendingFrom == null) { this.pendingFrom = from; this.onStatus('Now click a target node (same node again = self-loop)'); }
            else { this._addEdge(this.pendingFrom, from); this.pendingFrom = null; }
          } else if (target !== from) {
            this._addEdge(this.pendingFrom != null ? this.pendingFrom : from, target);
            this.pendingFrom = null;
          }
        } else if (this.pendingFrom != null && target >= 0) {
          this._addEdge(this.pendingFrom, target);
          this.pendingFrom = null;
        } else if (target < 0) {
          this.pendingFrom = null;
        }
        this.edgeDraft = null;
        return;
      }
      if (this.drag) {
        if (this.drag.kind === 'node' && this.drag.moved) this.onChange('move');
        this.drag = null;
      }
    }
    _dbl(e) {
      if (!this.graph || this.mode !== 'edit') return;
      const [px, py] = this._pos(e);
      const [wx, wy] = this.toWorld(px, py);
      const ni = this.hitNode(wx, wy);
      if (ni >= 0) { this._renameNode(ni, px, py); return; }
      const he = this.hitEdge(wx, wy);
      if (he) {
        if (this.graph.weighted) this._editWeight(he.i, he.j, px, py);
        return;
      }
      this._addNode(wx, wy);
    }
    _cursor(overThing) {
      const c = this.mode !== 'edit' ? (overThing ? 'grab' : 'default')
        : this.tool === 'node' ? 'crosshair'
        : this.tool === 'edge' ? 'crosshair'
        : this.tool === 'erase' ? 'pointer'
        : overThing ? 'grab' : 'default';
      this.canvas.style.cursor = c;
    }

    /* ---------------- mutations ---------------- */
    _addNode(wx, wy) {
      if (this.graph.n >= 20) { this.onStatus('Editor capped at 20 nodes — matrices stay readable.'); return; }
      const i = this.graph.addNode(wx, wy);
      this.selection = { type: 'node', i };
      this.onChange('node');
    }
    _deleteNode(i) {
      this.stopWalk();
      this.graph.removeNode(i);
      this.selection = null; this.hover = null;
      this.onChange('node');
    }
    _addEdge(i, j) {
      if (this.graph.hasEdge(i, j)) { this.onStatus('Edge already exists — right-click it to remove.'); return; }
      this.graph.setEdge(i, j, 1);
      this.onChange('edge');
    }
    _deleteEdge(i, j) {
      this.graph.removeEdge(i, j);
      this.selection = null; this.hover = null;
      this.onChange('edge');
    }
    deleteSelection() {
      if (!this.selection) return;
      if (this.selection.type === 'node') this._deleteNode(this.selection.i);
      else this._deleteEdge(this.selection.i, this.selection.j);
    }
    _renameNode(i, px, py) {
      this._floatingInput(px, py - 34, this.graph.nodes[i].label, v => {
        const t = v.trim();
        if (t) { this.graph.nodes[i].label = t.slice(0, 12); this.onChange('label'); }
      });
    }
    _editWeight(i, j, px, py) {
      this._floatingInput(px, py - 34, String(this.graph.getW(i, j)), v => {
        const w = parseFloat(v);
        if (Number.isFinite(w)) {
          this.graph.setEdge(i, j, w);
          this.onChange('weight');
        }
      }, 'number');
    }
    _floatingInput(px, py, value, commit, type = 'text') {
      this._closeFloatingInput();
      const inp = document.createElement('input');
      inp.type = type; inp.step = 'any';
      inp.className = 'floating-input';
      inp.value = value;
      inp.style.left = Math.max(4, Math.min(this.w - 90, px - 40)) + 'px';
      inp.style.top = Math.max(4, py) + 'px';
      this.container.appendChild(inp);
      this._input = inp;
      inp.focus(); inp.select();
      const done = save => { if (save) commit(inp.value); this._closeFloatingInput(); };
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') done(true);
        if (ev.key === 'Escape') done(false);
        ev.stopPropagation();
      });
      inp.addEventListener('blur', () => done(true));
    }
    _closeFloatingInput() {
      if (this._input) { const i = this._input; this._input = null; i.remove(); }
    }

    /* ---------------- random walk ---------------- */
    startWalk(start = null) {
      const g = this.graph;
      if (!g || !g.n) return false;
      const s = start ?? (this.selection && this.selection.type === 'node' ? this.selection.i : 0);
      this.walk = {
        node: s, steps: 0, visits: new Array(g.n).fill(0),
        moving: null, nextAt: performance.now() + 450
      };
      this.walk.visits[s] = 1;
      return true;
    }
    stopWalk() { this.walk = null; }
    _walkTick(now) {
      const w = this.walk, g = this.graph;
      if (!w) return;
      if (w.visits.length !== g.n) { this.stopWalk(); return; }
      if (w.moving) {
        w.moving.t = Math.min(1, (now - w.moving.t0) / 420);
        if (w.moving.t >= 1) {
          w.node = w.moving.to;
          w.visits[w.node]++;
          w.steps++;
          w.moving = null;
          w.nextAt = now + 320;
        }
        return;
      }
      if (now < w.nextAt) return;
      const M = g.matrix();
      const row = M[w.node];
      let total = 0;
      for (let j = 0; j < g.n; j++) total += Math.max(0, row[j]);
      if (total <= 0) { this.onStatus(`Walker absorbed at ${g.nodes[w.node].label} (no outgoing edges) after ${w.steps} steps.`); this.stopWalk(); return; }
      let r = Math.random() * total, to = w.node;
      for (let j = 0; j < g.n; j++) { r -= Math.max(0, row[j]); if (r <= 0) { to = j; break; } }
      w.moving = { from: w.node, to, t: 0, t0: now };
    }

    /* ---------------- frame ---------------- */
    frame(now) {
      this._time = now;
      if (this.needsFit && this.w) { this.fit(); this.needsFit = false; }
      if (this.physics && this.graph && this.graph.n) {
        const pinned = this.drag && this.drag.kind === 'node' ? this.drag.i : -1;
        Layouts.forceTick(this.graph, { pinned });
      }
      this._walkTick(now);
      this.draw();
    }

    /* ---------------- drawing ---------------- */
    draw() {
      const ctx = this.ctx, g = this.graph;
      if (!ctx || !this.w) return;
      ctx.clearRect(0, 0, this.w, this.h);
      this._drawGrid(ctx);
      if (!g) return;

      const hovE = this.hover && this.hover.type === 'edge' ? this.hover : null;
      const selE = this.selection && this.selection.type === 'edge' ? this.selection : null;
      const extE = this.extHighlight;

      g.forEachEdge((i, j, w) => {
        const isHov = hovE && hovE.i === i && hovE.j === j;
        const isSel = selE && selE.i === i && selE.j === j;
        const isExt = extE && ((extE.i === i && extE.j === j) || (!g.directed && extE.i === j && extE.j === i));
        this._drawEdge(i, j, w, { hot: isHov || isSel || isExt, sel: isSel });
      });
      if (this.flow && g.directed) this._drawParticles();
      this._drawEdgeDraft(ctx);

      const maxVisit = this.walk ? Math.max(1, ...this.walk.visits) : 1;
      for (let i = 0; i < g.n; i++) {
        const hot = (this.hover && this.hover.type === 'node' && this.hover.i === i) ||
          (extE && (extE.i === i || extE.j === i)) ||
          (this.pendingFrom === i) ||
          (this.edgeDraft && (this.edgeDraft.from === i || this.edgeDraft.snap === i));
        const sel = this.selection && this.selection.type === 'node' && this.selection.i === i;
        const visit = this.walk ? this.walk.visits[i] / maxVisit : 0;
        this._drawNode(i, { hot, sel, visit });
      }
      this._drawWalker();
    }
    _drawGrid(ctx) {
      const sp = 44 * this.s;
      if (sp < 11) return;
      const alpha = Math.min(1, (sp - 11) / 26);
      ctx.fillStyle = `rgba(226,234,255,${0.055 * alpha})`;
      const x0 = ((this.ox % sp) + sp) % sp, y0 = ((this.oy % sp) + sp) % sp;
      for (let x = x0; x < this.w; x += sp)
        for (let y = y0; y < this.h; y += sp) {
          ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill();
        }
    }
    _edgeScreenPath(path) {
      const ctx = this.ctx;
      ctx.beginPath();
      if (path.type === 'line') {
        const [x0, y0] = this.toScreen(path.x0, path.y0);
        const [x1, y1] = this.toScreen(path.x1, path.y1);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      } else if (path.type === 'quad') {
        const [x0, y0] = this.toScreen(path.x0, path.y0);
        const [cx, cy] = this.toScreen(path.cx, path.cy);
        const [x1, y1] = this.toScreen(path.x1, path.y1);
        ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
      } else {
        const [cx, cy] = this.toScreen(path.cx, path.cy);
        ctx.arc(cx, cy, path.r * this.s, 0, 2 * Math.PI);
      }
    }
    _drawEdge(i, j, w, { hot, sel }) {
      const ctx = this.ctx, g = this.graph;
      const path = this.edgePath(i, j);
      const maxW = g.weighted ? Math.max(1, ...[...g.adj.values()].map(Math.abs)) : 1;
      const thick = g.weighted ? 1 + 2.6 * Math.min(1, Math.abs(w) / maxW) : 1.6;

      if (hot) {
        ctx.save();
        ctx.shadowColor = PAL.accent; ctx.shadowBlur = 14;
        ctx.strokeStyle = sel ? PAL.accent : 'rgba(100,210,255,0.9)';
        ctx.lineWidth = Math.max(1.4, (thick + 0.8) * this.s);
        this._edgeScreenPath(path); ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = w < 0 ? 'rgba(255,107,107,0.55)' : PAL.edge;
        ctx.lineWidth = Math.max(0.9, thick * this.s);
        this._edgeScreenPath(path); ctx.stroke();
      }
      if (g.directed) this._drawArrow(path, i, j, hot);
      if (g.weighted) this._drawWeight(path, w, hot);
    }
    _drawArrow(path, i, j, hot) {
      const ctx = this.ctx;
      let tip, ang;
      if (path.type === 'loop') {
        const a = -Math.PI / 2 + 0.86 * 2 * Math.PI;
        tip = [path.cx + path.r * Math.cos(a), path.cy + path.r * Math.sin(a)];
        ang = a + Math.PI / 2 + 0.35;
      } else {
        let t = 1, prev = this.pointAt(path, 0.9);
        const target = this.graph.nodes[j];
        for (let k = 40; k >= 0; k--) {
          const p = this.pointAt(path, k / 40);
          if (Math.hypot(p[0] - target.x, p[1] - target.y) >= NODE_R + 3) { tip = p; t = k / 40; break; }
        }
        if (!tip) return;
        prev = this.pointAt(path, Math.max(0, t - 0.06));
        ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
      }
      const [sx, sy] = this.toScreen(tip[0], tip[1]);
      const L = 8.5 * this.s, W = 5 * this.s;
      ctx.fillStyle = hot ? PAL.accent : 'rgba(226,234,255,0.62)';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - L * Math.cos(ang - 0.44), sy - L * Math.sin(ang - 0.44));
      ctx.lineTo(sx - L * Math.cos(ang + 0.44), sy - L * Math.sin(ang + 0.44));
      ctx.closePath(); ctx.fill();
      void W;
    }
    _drawWeight(path, w, hot) {
      const ctx = this.ctx;
      const mid = path.type === 'loop'
        ? [path.cx, path.cy - path.r]
        : this.pointAt(path, 0.5);
      const [sx, sy] = this.toScreen(mid[0], mid[1]);
      const label = window.LA ? LA.fmt(w) : String(w);
      const fs = Math.max(9, 11 * this.s);
      ctx.font = `600 ${fs}px ui-sans-serif, system-ui, -apple-system`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8,10,22,0.88)';
      const r = fs * 0.72, padX = fs * 0.45;
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2 - padX, sy - r, tw + 2 * padX, 2 * r, r);
      ctx.fill();
      ctx.strokeStyle = hot ? PAL.accent : 'rgba(226,234,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = hot ? PAL.accent : 'rgba(240,244,255,0.9)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, sx, sy + 0.5);
    }
    _drawParticles() {
      const ctx = this.ctx, g = this.graph, now = this._time;
      ctx.save();
      g.forEachEdge((i, j) => {
        if (i === j) return;
        const path = this.edgePath(i, j);
        const phase = ((i * 37 + j * 101) % 97) / 97;
        for (let p = 0; p < 2; p++) {
          const t = ((now / 8400) + phase + p * 0.5) % 1;
          const [x, y] = this.pointAt(path, t);
          const target = g.nodes[j], src = g.nodes[i];
          if (Math.hypot(x - target.x, y - target.y) < NODE_R + 4) continue;
          if (Math.hypot(x - src.x, y - src.y) < NODE_R + 2) continue;
          const [sx, sy] = this.toScreen(x, y);
          const fade = Math.sin(Math.PI * t);
          ctx.fillStyle = `rgba(100,210,255,${0.38 * fade})`;
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.2, 2 * this.s), 0, 7); ctx.fill();
        }
      });
      ctx.restore();
    }
    _drawEdgeDraft(ctx) {
      const d = this.edgeDraft;
      if (!d || !d.moved) {
        if (this.pendingFrom != null) this._pulseRing(this.pendingFrom);
        return;
      }
      const from = this.graph.nodes[d.from];
      const [x0, y0] = this.toScreen(from.x, from.y);
      let [x1, y1] = this.toScreen(d.x, d.y);
      if (d.snap >= 0 && d.snap !== d.from) {
        const t = this.graph.nodes[d.snap];
        [x1, y1] = this.toScreen(t.x, t.y);
      }
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = PAL.accent;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = PAL.accent; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.restore();
    }
    _pulseRing(i) {
      const ctx = this.ctx, nd = this.graph.nodes[i];
      const [sx, sy] = this.toScreen(nd.x, nd.y);
      const p = (this._time / 900) % 1;
      ctx.strokeStyle = `rgba(100,210,255,${0.7 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, (NODE_R + 4 + p * 10) * this.s, 0, 7); ctx.stroke();
    }
    _drawNode(i, { hot, sel, visit }) {
      const ctx = this.ctx, nd = this.graph.nodes[i];
      const [sx, sy] = this.toScreen(nd.x, nd.y);
      const r = NODE_R * this.s;

      ctx.save();
      ctx.shadowColor = visit > 0 ? PAL.gold : PAL.accent2;
      ctx.shadowBlur = hot || sel ? 26 : 12 + visit * 18;
      const grad = ctx.createLinearGradient(sx, sy - r, sx, sy + r);
      if (visit > 0) {
        grad.addColorStop(0, this._mix('#64d2ff', '#f5b942', visit));
        grad.addColorStop(1, this._mix('#bf5af2', '#f5b942', visit * 0.9));
      } else {
        grad.addColorStop(0, hot ? '#8fdfff' : PAL.accent);
        grad.addColorStop(1, hot ? '#d18bff' : PAL.accent2);
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
      ctx.restore();

      if (sel || hot) {
        ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = sel ? 2.2 : 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, 7); ctx.stroke();
      }
      const label = nd.label.length > 3 ? nd.label.slice(0, 3) : nd.label;
      const fs = Math.max(8, (nd.label.length > 2 ? 10 : 12) * this.s);
      ctx.font = `700 ${fs}px ui-sans-serif, system-ui, -apple-system`;
      ctx.fillStyle = 'rgba(6,9,26,0.92)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, sx, sy + 0.5);
    }
    _drawWalker() {
      const w = this.walk;
      if (!w) return;
      const ctx = this.ctx, g = this.graph;
      let x, y;
      if (w.moving) {
        const path = this.edgePath(w.moving.from, w.moving.to);
        const t = w.moving.t;
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        [x, y] = this.pointAt(path, ease);
      } else {
        const nd = g.nodes[w.node];
        x = nd.x; y = nd.y;
      }
      const [sx, sy] = this.toScreen(x, y);
      const pulse = 1 + 0.14 * Math.sin(this._time / 160);
      ctx.save();
      ctx.shadowColor = PAL.gold; ctx.shadowBlur = 22;
      ctx.fillStyle = PAL.gold;
      ctx.beginPath(); ctx.arc(sx, sy, 6.5 * this.s * pulse, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, 9.5 * this.s * pulse, 0, 7); ctx.stroke();
      ctx.restore();
    }
    _mix(c1, c2, t) {
      const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const a = p(c1), b = p(c2);
      const m = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, t)));
      return `rgb(${m[0]},${m[1]},${m[2]})`;
    }
    destroy() {
      this._ro.disconnect();
      this.canvas.remove();
    }
  }

  window.Board = Board;
})();
