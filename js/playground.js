/* ============================================================
   Adjacency — playground.js
   Random-graph laboratory: generators, live stats, heatmap.
   ============================================================ */
(function () {
  'use strict';

  const MODELS = {
    er: {
      name: 'Erdős–Rényi  G(n, p)',
      blurb: 'Every possible edge appears independently with probability p. The baseline “pure randomness” model.',
      params: [
        { id: 'n', label: 'nodes n', type: 'range', min: 4, max: 60, step: 1, value: 16 },
        { id: 'p', label: 'edge prob. p', type: 'range', min: 0.02, max: 1, step: 0.02, value: 0.14 }
      ],
      build: p => Gen.er(p.n, p.p)
    },
    ba: {
      name: 'Barabási–Albert',
      blurb: 'Preferential attachment: new nodes link to well-connected nodes. Produces hubs and heavy-tailed degrees.',
      params: [
        { id: 'n', label: 'nodes n', type: 'range', min: 5, max: 60, step: 1, value: 30 },
        { id: 'm', label: 'links per new node', type: 'range', min: 1, max: 4, step: 1, value: 2 }
      ],
      build: p => Gen.ba(p.n, p.m)
    },
    ws: {
      name: 'Watts–Strogatz',
      blurb: 'A ring lattice with rewired shortcuts: high clustering, short paths — the “small world”.',
      params: [
        { id: 'n', label: 'nodes n', type: 'range', min: 8, max: 60, step: 1, value: 24 },
        { id: 'k', label: 'ring degree k', type: 'range', min: 2, max: 8, step: 2, value: 4 },
        { id: 'beta', label: 'rewire β', type: 'range', min: 0, max: 1, step: 0.05, value: 0.15 }
      ],
      build: p => Gen.ws(p.n, p.k, p.beta)
    },
    tree: {
      name: 'Random tree',
      blurb: 'Each new node attaches to a uniformly random earlier node. Always connected, no cycles.',
      params: [{ id: 'n', label: 'nodes n', type: 'range', min: 4, max: 60, step: 1, value: 24 }],
      build: p => Gen.tree(p.n)
    },
    complete: {
      name: 'Complete Kₙ',
      blurb: 'Every pair connected. Adjacency = J − I. Spectrum: n−1 once, −1 repeated.',
      params: [{ id: 'n', label: 'nodes n', type: 'range', min: 3, max: 14, step: 1, value: 8 }],
      build: p => Gen.complete(p.n)
    },
    cycle: {
      name: 'Cycle Cₙ',
      blurb: 'A ring. Directed version is a permutation matrix — its eigenvalues are the n-th roots of unity.',
      params: [
        { id: 'n', label: 'nodes n', type: 'range', min: 3, max: 40, step: 1, value: 12 },
        { id: 'directed', label: 'directed', type: 'check', value: false }
      ],
      build: p => Gen.cycle(p.n, { directed: !!p.directed })
    },
    grid: {
      name: 'Grid lattice',
      blurb: 'Nodes on a rows × cols lattice. The discrete Laplacian lives here.',
      params: [
        { id: 'rows', label: 'rows', type: 'range', min: 2, max: 8, step: 1, value: 4 },
        { id: 'cols', label: 'cols', type: 'range', min: 2, max: 8, step: 1, value: 6 }
      ],
      build: p => Gen.grid(p.rows, p.cols)
    },
    bipartite: {
      name: 'Random bipartite',
      blurb: 'Two groups, edges only across. Adjacency spectrum is symmetric: λ and −λ come in pairs.',
      params: [
        { id: 'a', label: 'left size', type: 'range', min: 2, max: 12, step: 1, value: 5 },
        { id: 'b', label: 'right size', type: 'range', min: 2, max: 12, step: 1, value: 7 },
        { id: 'p', label: 'edge prob. p', type: 'range', min: 0.05, max: 1, step: 0.05, value: 0.4 }
      ],
      build: p => Gen.bipartite(p.a, p.b, p.p)
    },
    star: {
      name: 'Star',
      blurb: 'One hub, n−1 leaves. Eigenvalues ±√(n−1) and 0.',
      params: [{ id: 'n', label: 'nodes n', type: 'range', min: 4, max: 40, step: 1, value: 14 }],
      build: p => Gen.star(p.n)
    },
    petersen: {
      name: 'Petersen graph',
      blurb: 'The famous 3-regular counterexample machine. Spectrum: 3, 1 (×5), −2 (×4).',
      params: [],
      build: () => Gen.petersen()
    },
    hypercube: {
      name: 'Hypercube Q_d',
      blurb: 'Binary strings, edges between strings differing in one bit.',
      params: [{ id: 'd', label: 'dimension d', type: 'range', min: 2, max: 6, step: 1, value: 3 }],
      build: p => Gen.hypercube(p.d)
    },
    stochastic: {
      name: 'Random Markov chain',
      blurb: 'A weighted directed graph whose adjacency matrix is row-stochastic — a random walker’s world.',
      params: [{ id: 'n', label: 'states n', type: 'range', min: 3, max: 15, step: 1, value: 6 }],
      build: p => Gen.randomStochastic(p.n)
    }
  };

  const P = {
    board: null,
    graph: null,
    model: 'er',
    values: {},

    init() {
      const root = document.getElementById('tab-playground');
      root.innerHTML = '';
      const wrap = U.el('div', 'play-layout');

      /* ----- controls card ----- */
      const ctl = U.el('div', 'card play-controls');
      ctl.appendChild(U.el('div', 'card-title', 'Random graph lab'));
      this.modelSelect = U.select(
        Object.entries(MODELS).map(([k, m]) => [k, m.name]),
        this.model,
        v => { this.model = v; this._renderParams(); this.generate(); }
      );
      ctl.appendChild(U.field('model', this.modelSelect));
      this.blurbEl = U.el('p', 'play-blurb');
      ctl.appendChild(this.blurbEl);
      this.paramsEl = U.el('div', 'play-params');
      ctl.appendChild(this.paramsEl);

      const row = U.el('div', 'btn-row');
      row.appendChild(U.btn('⟳ Generate', 'btn btn-primary', () => this.generate()));
      this.sendBtn = U.btn('Open in Studio →', 'btn', () => this._send());
      row.appendChild(this.sendBtn);
      ctl.appendChild(row);
      const row2 = U.el('div', 'btn-row');
      row2.appendChild(U.btn('View spectrum', 'btn btn-ghost', () => {
        if (!this.graph) return;
        Spectrum.setSource('playground');
        App.showTab('spectrum');
      }));
      this.physBtn = U.btn('physics: on', 'btn btn-ghost', () => {
        this.board.physics = !this.board.physics;
        this.physBtn.textContent = 'physics: ' + (this.board.physics ? 'on' : 'off');
      });
      row2.appendChild(this.physBtn);
      this.flowBtn = U.btn('flow: on', 'btn btn-ghost', () => {
        this.board.flow = !this.board.flow;
        this.flowBtn.textContent = 'flow: ' + (this.board.flow ? 'on' : 'off');
      });
      row2.appendChild(this.flowBtn);
      ctl.appendChild(row2);

      /* ----- canvas ----- */
      const mid = U.el('div', 'card play-canvas');
      const boardBox = U.el('div', 'play-board');
      mid.appendChild(boardBox);

      /* ----- stats card ----- */
      const side = U.el('div', 'card play-stats');
      side.appendChild(U.el('div', 'card-title', 'Adjacency heatmap'));
      this.heatCanvas = U.el('canvas', 'play-heat');
      side.appendChild(this.heatCanvas);
      side.appendChild(U.el('div', 'card-title', 'Structure'));
      this.statsEl = U.el('div', 'stat-list');
      side.appendChild(this.statsEl);
      side.appendChild(U.el('div', 'card-title', 'Degree distribution'));
      this.histEl = U.el('div', 'hist');
      side.appendChild(this.histEl);

      wrap.appendChild(ctl); wrap.appendChild(mid); wrap.appendChild(side);
      root.appendChild(wrap);

      this.board = new Board(boardBox, { mode: 'view' });
      this.board.physics = true;
      this._renderParams();
      this.generate();
    },

    _renderParams() {
      const m = MODELS[this.model];
      this.blurbEl.textContent = m.blurb;
      this.paramsEl.innerHTML = '';
      this.values = {};
      m.params.forEach(p => {
        this.values[p.id] = p.value;
        if (p.type === 'check') {
          const c = U.el('input'); c.type = 'checkbox'; c.checked = !!p.value;
          c.addEventListener('change', () => { this.values[p.id] = c.checked; this.generate(); });
          const f = U.field(p.label, c); f.classList.add('field-check');
          this.paramsEl.appendChild(f);
        } else {
          const out = U.el('span', 'field-val', String(p.value));
          const r = U.range(p.min, p.max, p.step, p.value, v => {
            this.values[p.id] = v;
            out.textContent = p.step < 1 ? v.toFixed(2) : String(v);
            this._regenSoon();
          });
          const f = U.field(p.label, r);
          f.querySelector('.field-label').appendChild(out);
          this.paramsEl.appendChild(f);
        }
      });
    },
    _regenSoon() {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.generate(), 160);
    },

    generate() {
      const m = MODELS[this.model];
      this.graph = m.build(this.values);
      Layouts.auto(this.graph);
      this.board.setGraph(this.graph);
      this._refreshStats();
      this.sendBtn.disabled = this.graph.n > 20;
      this.sendBtn.title = this.graph.n > 20 ? 'Studio holds up to 20 nodes (keeps the matrix readable)' : '';
    },

    _refreshStats() {
      const g = this.graph, s = g.stats();
      MatrixUI.heatmap(this.heatCanvas, g.matrix());
      const rows = [
        ['nodes', s.n], ['edges', s.m + (s.loops ? ` (+${s.loops} loops)` : '')],
        ['density', s.density.toFixed(3)], ['avg degree', s.avgDeg.toFixed(2)],
        ['components', s.components],
        ['diameter', s.diameter == null ? '—' : s.diameter],
        ['clustering', s.clustering.toFixed(3)],
        ['type', (g.directed ? 'directed' : 'undirected') + (g.weighted ? ', weighted' : '')]
      ];
      this.statsEl.innerHTML = rows.map(([k, v]) =>
        `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
      // degree histogram
      const degs = s.degs, maxD = Math.max(1, ...degs);
      const counts = new Array(maxD + 1).fill(0);
      degs.forEach(d => counts[d]++);
      const maxC = Math.max(1, ...counts);
      this.histEl.innerHTML = counts.map((c, d) =>
        `<div class="hist-col" title="degree ${d}: ${c} node${c === 1 ? '' : 's'}">
           <div class="hist-bar" style="height:${Math.round(c / maxC * 64)}px"></div>
           <span>${d}</span>
         </div>`).join('');
    },

    _send() {
      if (!this.graph || this.graph.n > 20) return;
      App.adoptGraph(this.graph.clone(), MODELS[this.model].name);
    },

    onShow() {
      if (this.board) this.board.needsFit = true;
      if (this.graph) this._refreshStats();
    }
  };

  window.Playground = P;
})();
