/* ============================================================
   Adjacency — spectrum.js
   Eigenvalue visualizer: complex plane, unit circle,
   Gershgorin discs, spectral facts.
   ============================================================ */
(function () {
  'use strict';

  const Sp = {
    source: 'studio',       // 'studio' | 'playground' | 'custom'
    kind: 'A',              // 'A' | 'L' | 'P'
    gershgorin: false,
    customM: null,
    customLabel: '',
    eigs: [],
    groups: [],
    hot: -1,
    _M: null,

    init() {
      const root = document.getElementById('tab-spectrum');
      root.innerHTML = '';
      const wrap = U.el('div', 'spec-layout');

      /* controls + facts */
      const side = U.el('div', 'card spec-side');
      side.appendChild(U.el('div', 'card-title', 'Spectrum'));
      this.srcSeg = U.seg([
        ['studio', 'Studio', 'The graph you built in Studio'],
        ['playground', 'Playground', 'The current random graph'],
        ['custom', 'Loaded', 'A matrix sent from the Solver or Gallery']
      ], this.source, v => { this.source = v; this.compute(); });
      side.appendChild(this.srcSeg);
      this.kindSeg = U.seg([
        ['A', 'A', 'adjacency matrix'],
        ['L', 'L', 'Laplacian D − A'],
        ['P', 'P', 'random-walk matrix D⁻¹A']
      ], this.kind, v => { this.kind = v; this.compute(); });
      this.kindSeg.classList.add('spec-kind');
      side.appendChild(this.kindSeg);

      const gRow = U.el('label', 'field field-check');
      const gChk = U.el('input'); gChk.type = 'checkbox';
      gChk.addEventListener('change', () => { this.gershgorin = gChk.checked; });
      gRow.appendChild(U.el('span', 'field-label', 'Gershgorin discs'));
      gRow.appendChild(gChk);
      side.appendChild(gRow);

      this.srcLabel = U.el('div', 'spec-srclabel');
      side.appendChild(this.srcLabel);
      side.appendChild(U.el('div', 'card-title', 'Facts'));
      this.factsEl = U.el('div', 'stat-list');
      side.appendChild(this.factsEl);
      side.appendChild(U.el('div', 'card-title', 'Eigenvalues'));
      this.listEl = U.el('div', 'eig-list');
      side.appendChild(this.listEl);

      /* plot */
      const plotCard = U.el('div', 'card spec-plot-card');
      this.plotBox = U.el('div', 'spec-plot');
      this.canvas = U.el('canvas');
      this.plotBox.appendChild(this.canvas);
      this.tip = U.el('div', 'spec-tip');
      this.tip.style.display = 'none';
      this.plotBox.appendChild(this.tip);
      plotCard.appendChild(this.plotBox);

      wrap.appendChild(side);
      wrap.appendChild(plotCard);
      root.appendChild(wrap);

      new ResizeObserver(() => this._resize()).observe(this.plotBox);
      this.canvas.addEventListener('mousemove', e => this._hover(e));
      this.canvas.addEventListener('mouseleave', () => { this.hot = -1; this.tip.style.display = 'none'; });
      this._resize();
    },

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.plotBox.clientWidth, h = this.plotBox.clientHeight;
      if (!w || !h) return;
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h;
    },

    setSource(src) { this.source = src; if (this.srcSeg) this.srcSeg.set(src); },
    setMatrix(M, label) {
      this.customM = M; this.customLabel = label;
      this.source = 'custom';
      if (this.srcSeg) this.srcSeg.set('custom');
    },

    baseMatrix() {
      if (this.source === 'custom') {
        return { M: this.customM, label: this.customLabel || 'loaded matrix', raw: true };
      }
      const g = this.source === 'playground' ? (Playground.graph || App.studioGraph) : App.studioGraph;
      const name = this.source === 'playground' ? 'Playground' : 'Studio';
      if (this.kind === 'L') return { M: g.laplacian(), label: `L — ${name} Laplacian`, g };
      if (this.kind === 'P') return { M: g.transition().P, label: `P — ${name} random walk`, g };
      return { M: g.matrix(), label: `A — ${name} adjacency`, g };
    },

    compute() {
      const { M, label, raw } = this.baseMatrix();
      this.kindSeg.style.display = raw ? 'none' : '';
      if (!M || !M.length || M.length !== M[0].length) {
        this._M = null; this.eigs = []; this.groups = [];
        this.srcLabel.textContent = 'No square matrix available.';
        this.factsEl.innerHTML = ''; this.listEl.innerHTML = '';
        return;
      }
      this._M = M;
      this.srcLabel.textContent = label + ` · ${M.length}×${M.length}`;
      this.eigs = LA.eigenvalues(M);
      // group duplicates
      const groups = [];
      this.eigs.forEach(z => {
        const g = groups.find(G => Math.abs(G.z.re - z.re) < 1e-6 && Math.abs(G.z.im - z.im) < 1e-6);
        if (g) g.count++;
        else groups.push({ z, count: 1 });
      });
      this.groups = groups;
      this._facts(M);
      this._list();
    },

    _facts(M) {
      const n = M.length;
      const rho = this.eigs.length ? LA.cabs(this.eigs[0]) : 0;
      const rows = [['size', `${n}×${n}`], ['spectral radius ρ', LA.fmt(rho)]];
      const sym = LA.isSymmetric(M);
      rows.push(['symmetric', sym ? 'yes — spectrum is real' : 'no']);
      const stoch = LA.isRowStochastic(M);
      if (stoch) {
        const l2 = this.eigs.length > 1 ? LA.cabs(this.eigs[1]) : 0;
        rows.push(['stochastic', 'yes — λ₁ = 1']);
        rows.push(['|λ₂|', LA.fmt(l2)]);
        rows.push(['spectral gap', LA.fmt(1 - l2) + ' — larger gap ⇒ faster mixing']);
      }
      if (this.kind === 'L' && this.source !== 'custom' && sym) {
        const sorted = this.eigs.slice().sort((a, b) => a.re - b.re);
        const a2 = sorted.length > 1 ? sorted[1].re : 0;
        rows.push(['algebraic connectivity λ₂(L)', LA.fmt(a2) + (Math.abs(a2) < 1e-9 ? ' — disconnected!' : '')]);
      }
      const tr = LA.trace(M);
      const sum = this.eigs.reduce((s, z) => s + z.re, 0);
      rows.push(['Σλ = tr', `${LA.fmt(sum)} = ${LA.fmt(tr)}`]);
      this.factsEl.innerHTML = rows.map(([k, v]) =>
        `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    },

    _list() {
      this.listEl.innerHTML = '';
      this.groups.forEach((G, idx) => {
        const chip = U.el('span', 'eig-chip',
          LA.fmtC(G.z) + (G.count > 1 ? ` <i>×${G.count}</i>` : ''));
        chip.addEventListener('mouseenter', () => { this.hot = idx; });
        chip.addEventListener('mouseleave', () => { this.hot = -1; });
        this.listEl.appendChild(chip);
      });
    },

    _geom() {
      let R = 1.15;
      this.groups.forEach(G => { R = Math.max(R, LA.cabs(G.z) * 1.18); });
      if (this.gershgorin && this._M) {
        const M = this._M;
        for (let i = 0; i < M.length; i++) {
          let r = 0;
          for (let j = 0; j < M.length; j++) if (j !== i) r += Math.abs(M[i][j]);
          R = Math.max(R, (Math.abs(M[i][i]) + r) * 1.12);
        }
      }
      const ppu = Math.min(this.w, this.h) / (2 * R) * 0.92;
      return { R, ppu, cx: this.w / 2, cy: this.h / 2 };
    },
    _toPx(z, g) { return [g.cx + z.re * g.ppu, g.cy - z.im * g.ppu]; },

    _hover(e) {
      if (!this.groups.length) return;
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const g = this._geom();
      let best = -1, bd = 14;
      this.groups.forEach((G, i) => {
        const [x, y] = this._toPx(G.z, g);
        const d = Math.hypot(x - mx, y - my);
        if (d < bd) { bd = d; best = i; }
      });
      this.hot = best;
      if (best >= 0) {
        const G = this.groups[best];
        this.tip.innerHTML = `λ = ${LA.fmtC(G.z)}${G.count > 1 ? ` (×${G.count})` : ''} · |λ| = ${LA.fmt(LA.cabs(G.z))}`;
        this.tip.style.display = '';
        const [x, y] = this._toPx(G.z, g);
        this.tip.style.left = Math.min(this.w - 170, x + 14) + 'px';
        this.tip.style.top = Math.max(6, y - 34) + 'px';
      } else this.tip.style.display = 'none';
    },

    frame(now) {
      const ctx = this.canvas && this.canvas.getContext('2d');
      if (!ctx || !this.w) return;
      ctx.clearRect(0, 0, this.w, this.h);
      const g = this._geom();

      /* axes + integer ticks */
      ctx.strokeStyle = 'rgba(226,234,255,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, g.cy); ctx.lineTo(this.w, g.cy);
      ctx.moveTo(g.cx, 0); ctx.lineTo(g.cx, this.h);
      ctx.stroke();
      ctx.fillStyle = 'rgba(226,234,255,0.4)';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      for (let t = -Math.floor(g.R); t <= Math.floor(g.R); t++) {
        if (!t) continue;
        const x = g.cx + t * g.ppu;
        ctx.fillRect(x - 0.5, g.cy - 3, 1, 6);
        ctx.fillText(String(t), x, g.cy + 16);
        const y = g.cy - t * g.ppu;
        ctx.fillRect(g.cx - 3, y - 0.5, 6, 1);
        if (Math.abs(y - g.cy) > 8) ctx.fillText(t + 'i', g.cx + 14, y + 3);
      }
      ctx.fillText('Re', this.w - 14, g.cy - 8);
      ctx.fillText('Im', g.cx + 16, 12);

      /* Gershgorin discs */
      if (this.gershgorin && this._M) {
        const M = this._M;
        for (let i = 0; i < M.length; i++) {
          let rad = 0;
          for (let j = 0; j < M.length; j++) if (j !== i) rad += Math.abs(M[i][j]);
          const [x, y] = this._toPx(LA.C(M[i][i], 0), g);
          ctx.fillStyle = 'rgba(41,151,255,0.06)';
          ctx.strokeStyle = 'rgba(41,151,255,0.30)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, rad * g.ppu, 0, 7);
          ctx.fill(); ctx.stroke();
        }
      }

      /* unit circle */
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(100,210,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, g.ppu, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(100,210,255,0.5)';
      ctx.fillText('|z| = 1', g.cx + g.ppu * 0.72, g.cy - g.ppu * 0.72);

      /* spectral radius ring */
      const rho = this.groups.length ? LA.cabs(this.groups[0].z) : 0;
      if (rho > 0.02 && Math.abs(rho - 1) > 0.02) {
        ctx.strokeStyle = 'rgba(191,90,242,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(g.cx, g.cy, rho * g.ppu, 0, 7); ctx.stroke();
      }

      /* eigenvalue points */
      const pulse = 0.6 + 0.4 * Math.sin(now / 500);
      this.groups.forEach((G, i) => {
        const [x, y] = this._toPx(G.z, g);
        const isHot = i === this.hot;
        const onUnit = Math.abs(LA.cabs(G.z) - 1) < 1e-6;
        ctx.save();
        ctx.shadowColor = onUnit ? '#f5b942' : '#64d2ff';
        ctx.shadowBlur = isHot ? 26 : 13 + 5 * pulse;
        ctx.fillStyle = onUnit ? '#f5b942' : (isHot ? '#a9e6ff' : '#64d2ff');
        ctx.beginPath(); ctx.arc(x, y, isHot ? 7 : 5, 0, 7); ctx.fill();
        ctx.restore();
        if (G.count > 1) {
          ctx.fillStyle = 'rgba(245,245,247,0.85)';
          ctx.font = '600 10px ui-sans-serif, system-ui';
          ctx.fillText('×' + G.count, x + 12, y - 8);
        }
        if (isHot) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.stroke();
        }
      });
    },

    onShow() { this._resize(); this.compute(); }
  };

  window.Spectrum = Sp;
})();
