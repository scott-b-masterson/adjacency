/* ============================================================
   Adjacency — app.js
   Boot, Studio wiring, tabs, undo/redo, export, modals.
   ============================================================ */
(function () {
  'use strict';

  const LS_GRAPH = 'adjacency.graph.v1';
  const LS_WELCOME = 'adjacency.welcomed.v1';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  const App = {
    active: 'studio',
    studioGraph: null,
    board: null,
    grid: null,
    matrixKind: 'A',
    history: [],
    hIndex: -1,

    /* ================= boot ================= */
    boot() {
      this._restoreOrRandom();
      this._buildStudio();
      this._buildTabs();
      this._buildTopbarActions();
      this._keyboard();
      Playground.init();
      Solver.init();
      Spectrum.init();
      Gallery.init();
      this._pushHistory();
      this.renderStudio();
      this.showTab(location.hash.replace('#', '') || 'studio', { push: false });
      if (!store.get(LS_WELCOME)) this._welcome();
      requestAnimationFrame(t => this._tick(t));
    },

    _restoreOrRandom() {
      try {
        const raw = store.get(LS_GRAPH);
        if (raw) {
          const g = Graph.fromJSON(JSON.parse(raw));
          if (g.n > 0 && g.n <= 20) { this.studioGraph = g; return; }
        }
      } catch {}
      this.newRandom(false);
    },
    newRandom(commit = true) {
      const g = Gen.erConnected(10, 0.28);
      Layouts.circle(g);
      Layouts.settle(g, 240);
      this.studioGraph = g;
      if (this.board) this.board.setGraph(g);
      if (commit) { this.commit('random'); this.renderStudio(true); }
    },

    /* ================= studio UI ================= */
    _buildStudio() {
      const root = document.getElementById('tab-studio');

      /* ---------- toolbar ---------- */
      const bar = U.el('div', 'studio-toolbar');
      this.toolSeg = U.seg([
        ['select', icon('cursor'), 'Select / move — V\ndrag nodes · drag space to pan · double-click empty space to add a node'],
        ['node', icon('node'), 'Add node — N\nclick anywhere to place a node'],
        ['edge', icon('edge'), 'Connect — E\ndrag from node to node · click a node twice for a self-loop'],
        ['erase', icon('erase'), 'Erase — X\nclick a node or edge to delete it']
      ], 'select', v => { this.board.tool = v; this._status(); }, 'tool-seg');
      bar.appendChild(this.toolSeg);

      const undoBox = U.el('div', 'seg');
      this.undoBtn = U.btn(icon('undo'), 'seg-btn', () => this.undo(), 'Undo — ⌘Z');
      this.redoBtn = U.btn(icon('redo'), 'seg-btn', () => this.redo(), 'Redo — ⇧⌘Z');
      undoBox.appendChild(this.undoBtn); undoBox.appendChild(this.redoBtn);
      bar.appendChild(undoBox);

      const toggles = U.el('div', 'toggle-row');
      this.dirToggle = this._toggle('directed', 'arrows on edges · A can be asymmetric', v => {
        this.studioGraph.setDirected(v);
        if (!v) this.toast('Symmetrized: kept the larger of each weight pair.');
        this.commit('mode'); this.renderStudio();
      });
      this.wToggle = this._toggle('weighted', 'edges carry numbers · click matrix cells or double-click edges to set weights', v => {
        this.studioGraph.setWeighted(v);
        if (!v) this.toast('All edge weights reset to 1.');
        this.commit('mode'); this.renderStudio();
      });
      this.phToggle = this._toggle('physics', 'live force layout — drag nodes and feel it', v => { this.board.physics = v; });
      this.flowToggle = this._toggle('flow', 'drift dots along directed edges to show direction of travel', v => {
        this.board.flow = v;
        store.set('adjacency.flow', v ? '1' : '0');
      });
      toggles.appendChild(this.dirToggle.el);
      toggles.appendChild(this.wToggle.el);
      toggles.appendChild(this.phToggle.el);
      toggles.appendChild(this.flowToggle.el);
      this.walkBtn = U.btn('● walk', 'btn btn-walk', () => this.toggleWalk(),
        'Random walk — drop a walker on the selected node and let the matrix drive it');
      toggles.appendChild(this.walkBtn);
      bar.appendChild(toggles);

      const right = U.el('div', 'toolbar-right');
      this.presetSel = U.select([
        ['', 'examples…'],
        ['triangle', 'Triangle K₃'],
        ['c6', 'Directed cycle C₆'],
        ['k5', 'Complete K₅'],
        ['star', 'Star S₈'],
        ['comm', 'Two communities'],
        ['weather', 'Weather Markov chain'],
        ['petersen', 'Petersen graph']
      ], '', v => { if (v) { this._preset(v); this.presetSel.value = ''; } });
      right.appendChild(this.presetSel);
      right.appendChild(U.btn(icon('dice'), 'btn btn-icon', () => this.newRandom(), 'New random graph — G(10, 0.28)'));
      right.appendChild(U.btn(icon('tidy'), 'btn btn-icon', () => {
        Layouts.settle(this.studioGraph, 300); this.board.needsFit = true; this.commit('layout');
      }, 'Tidy — force-directed layout'));
      right.appendChild(U.btn(icon('circle'), 'btn btn-icon', () => {
        Layouts.circle(this.studioGraph); this.board.needsFit = true; this.commit('layout');
      }, 'Circle layout'));
      right.appendChild(U.btn(icon('trash'), 'btn btn-icon', () => {
        this.studioGraph = new Graph(0, { directed: this.studioGraph.directed, weighted: this.studioGraph.weighted });
        this.board.setGraph(this.studioGraph);
        this.commit('clear'); this.renderStudio();
      }, 'Clear canvas'));
      bar.appendChild(right);
      root.appendChild(bar);

      /* ---------- split panes ---------- */
      const split = U.el('div', 'studio-split');
      this.splitEl = split;

      const paneL = U.el('div', 'pane pane-graph');
      const headL = U.el('div', 'pane-head');
      headL.appendChild(U.el('span', 'pane-title', 'Graph'));
      headL.appendChild(U.el('span', 'pane-sub', 'double-click to add · drag between nodes to connect'));
      paneL.appendChild(headL);
      const boardBox = U.el('div', 'pane-body board-box');
      paneL.appendChild(boardBox);

      const zoom = U.el('div', 'zoom-cluster');
      zoom.appendChild(U.btn('+', 'zbtn', () => this.board.zoom(1.25)));
      zoom.appendChild(U.btn('−', 'zbtn', () => this.board.zoom(0.8)));
      zoom.appendChild(U.btn(icon('fit'), 'zbtn', () => { this.board.fit(); }, 'Fit to view — F'));
      boardBox.appendChild(zoom);

      this.statusEl = U.el('div', 'status-bar');
      paneL.appendChild(this.statusEl);

      const divider = U.el('div', 'divider');
      const swapBtn = U.btn('⇄', 'swap-btn', () => split.classList.toggle('swapped'), 'Swap sides');
      divider.appendChild(swapBtn);

      const paneR = U.el('div', 'pane pane-matrix');
      const headR = U.el('div', 'pane-head');
      headR.appendChild(U.el('span', 'pane-title', 'Matrix'));
      this.kindSeg = U.seg([
        ['A', 'A', 'adjacency — editable'],
        ['L', 'L', 'Laplacian D − A (derived)'],
        ['D', 'D', 'degree matrix (derived)'],
        ['P', 'P', 'random-walk / transition D⁻¹A (derived)']
      ], 'A', v => { this.matrixKind = v; this.renderStudio(); }, 'kind-seg');
      headR.appendChild(this.kindSeg);
      const mxActions = U.el('div', 'mx-actions');
      const stepper = U.el('div', 'stepper');
      stepper.appendChild(U.btn('−', 'zbtn', () => this._resize(-1), 'remove last node'));
      this.nLabel = U.el('span', 'n-label', 'n');
      stepper.appendChild(this.nLabel);
      stepper.appendChild(U.btn('+', 'zbtn', () => this._resize(1), 'add a node'));
      mxActions.appendChild(stepper);
      mxActions.appendChild(U.btn(icon('paste'), 'btn btn-icon', () => this._pasteModal(), 'Paste a matrix'));
      mxActions.appendChild(U.btn(icon('copy'), 'btn btn-icon', () => this._copyMenu(), 'Copy matrix (LaTeX / CSV)'));
      headR.appendChild(mxActions);
      paneR.appendChild(headR);
      const gridBox = U.el('div', 'pane-body matrix-box');
      paneR.appendChild(gridBox);
      this.mxNote = U.el('div', 'pane-foot');
      paneR.appendChild(this.mxNote);

      split.appendChild(paneL);
      split.appendChild(divider);
      split.appendChild(paneR);
      root.appendChild(split);

      /* layout seg (both / graph / matrix) */
      const laySeg = U.seg([
        ['both', icon('cols'), 'side by side'],
        ['graph', 'G', 'graph only'],
        ['matrix', 'M', 'matrix only']
      ], 'both', v => {
        split.classList.toggle('solo-graph', v === 'graph');
        split.classList.toggle('solo-matrix', v === 'matrix');
        this.board.needsFit = true;
      }, 'layout-seg');
      right.insertBefore(laySeg, right.firstChild);

      /* ---------- board + grid ---------- */
      this.board = new Board(boardBox, {
        mode: 'edit',
        onChange: kind => { this.commit(kind); this.renderStudio(); },
        onHover: h => {
          if (!h) this.grid.clearHighlight();
          else if (h.type === 'node') this.grid.setHighlight(h.i, null);
          else this.grid.setHighlight(h.i, h.j);
        },
        onStatus: msg => this.toast(msg),
        onSelect: () => this._status()
      });
      this.board.setGraph(this.studioGraph);
      const flowPref = store.get('adjacency.flow') !== '0';
      this.board.flow = flowPref;
      this.flowToggle.set(flowPref);

      this.grid = new MatrixGrid(gridBox, {
        onEdit: (i, j, v) => {
          this.studioGraph.setEdge(i, j, v);
          this.commit('matrix');
          this.renderStudio();
        },
        onHover: h => { this.board.extHighlight = h; }
      });
    },

    _toggle(label, tip, onChange) {
      const el = U.el('button', 'toggle');
      el.type = 'button';
      el.title = tip;
      el.innerHTML = `<span class="knob"></span>${label}`;
      let on = false;
      el.addEventListener('click', () => { set(!on); onChange(on); });
      function set(v) { on = v; el.classList.toggle('on', v); }
      return { el, set, get on() { return on; } };
    },

    _resize(d) {
      const g = this.studioGraph;
      if (d > 0) {
        if (g.n >= 20) { this.toast('Studio holds up to 20 nodes.'); return; }
        const a = Math.random() * Math.PI * 2;
        g.addNode(240 * Math.cos(a), 240 * Math.sin(a));
      } else {
        if (!g.n) return;
        g.removeNode(g.n - 1);
      }
      this.commit('node');
      this.renderStudio();
    },

    _preset(id) {
      let g;
      if (id === 'triangle') g = Gen.complete(3);
      else if (id === 'c6') g = Gen.cycle(6, { directed: true });
      else if (id === 'k5') g = Gen.complete(5);
      else if (id === 'star') g = Gen.star(8);
      else if (id === 'petersen') g = Gen.petersen();
      else if (id === 'comm') {
        g = new Graph(8);
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) g.setEdge(i, j, 1);
        for (let i = 4; i < 8; i++) for (let j = i + 1; j < 8; j++) g.setEdge(i, j, 1);
        g.setEdge(3, 4, 1);
      } else if (id === 'weather') {
        g = new Graph(3, { directed: true, weighted: true });
        ['Sun', 'Rain', 'Fog'].forEach((s, i) => g.nodes[i].label = s);
        const P = [[0.6, 0.3, 0.1], [0.4, 0.4, 0.2], [0.3, 0.4, 0.3]];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (P[i][j]) g.setEdge(i, j, P[i][j]);
        this.toast('A is already row-stochastic — check the P view, then press walk.');
      }
      Layouts.auto(g);
      this.adoptGraph(g, null);
    },

    /* ================= shared actions ================= */
    adoptGraph(g, name) {
      if (g.n > 20) { this.toast('Studio holds up to 20 nodes.'); return; }
      this.studioGraph = g;
      if (!g.nodes.some(nd => nd.x || nd.y)) Layouts.auto(g);
      this.board.setGraph(g);
      this.commit('adopt');
      this.renderStudio(true);
      this.showTab('studio');
      if (name) this.toast(`${name} → Studio`);
    },
    adoptMatrix(M, name) {
      if (!M || M.length > 20) { this.toast('Studio holds up to 20 nodes.'); return; }
      const g = new Graph(0);
      g.fromMatrix(M.map(r => r.slice()), { keepPositions: false });
      Layouts.auto(g);
      this.adoptGraph(g, name);
    },
    matrixOfKind() { return this.studioGraph.view(this.matrixKind); },

    /* ================= rendering ================= */
    renderStudio(fit = false) {
      const g = this.studioGraph;
      this.grid.update(g, this.matrixKind);
      this.nLabel.textContent = 'n = ' + g.n;
      this.dirToggle.set(g.directed);
      this.wToggle.set(g.weighted);
      if (fit) this.board.needsFit = true;
      if (!this.board.walk && this.walkBtn.classList.contains('on')) {
        this.walkBtn.classList.remove('on');
        this.walkBtn.innerHTML = '● walk';
      }
      const notes = {
        A: g.weighted ? 'A — adjacency. Click a cell to type a weight; the graph updates instantly.'
                      : 'A — adjacency. Click cells to toggle edges; the graph updates instantly.',
        L: 'L = D − A. Row sums are 0; its spectrum knows the graph’s connectivity. Derived — edit A.',
        D: 'D — degree matrix: total edge weight at each node. Derived — edit A.',
        P: 'P = D⁻¹A — each row is the random walker’s next-step distribution. Derived — edit A.'
      };
      let note = notes[this.matrixKind];
      if (this.matrixKind === 'P') {
        const zr = g.transition().zeroRows;
        if (zr.length) note += ` ⚠ ${zr.map(i => g.nodes[i].label).join(', ')} ha${zr.length > 1 ? 've' : 's'} no outgoing edges.`;
      }
      if (!g.directed) note += this.matrixKind === 'A' ? ' Undirected ⇒ A stays symmetric.' : '';
      this.mxNote.textContent = note;
      this._status();
      this._saveSoon();
      this.undoBtn.disabled = this.hIndex <= 0;
      this.redoBtn.disabled = this.hIndex >= this.history.length - 1;
    },

    _status() {
      const g = this.studioGraph;
      if (!this.statusEl) return;
      const comp = g.n ? g.components().count : 0;
      let loops = 0; g.forEachEdge((i, j) => { if (i === j) loops++; });
      const parts = [
        `${g.n} node${g.n === 1 ? '' : 's'}`,
        `${g.edgeCount() - loops} edge${g.edgeCount() - loops === 1 ? '' : 's'}` + (loops ? ` + ${loops} loop${loops > 1 ? 's' : ''}` : ''),
        g.n ? (comp === 1 ? 'connected' : `${comp} components`) : '',
        g.directed ? 'directed' : 'undirected',
        g.weighted ? 'weighted' : ''
      ].filter(Boolean);
      const hints = {
        select: 'drag nodes · double-click space adds · right-click deletes',
        node: 'click anywhere to place a node',
        edge: 'drag node → node · click one node twice = self-loop',
        erase: 'click a node or edge to delete'
      };
      this.statusEl.innerHTML =
        `<span>${parts.join(' · ')}</span><span class="status-hint">${hints[this.board ? this.board.tool : 'select']}</span>`;
    },

    /* ================= history ================= */
    _pushHistory() {
      const snap = JSON.stringify(this.studioGraph.toJSON());
      if (this.history[this.hIndex] === snap) return;
      this.history = this.history.slice(0, this.hIndex + 1);
      this.history.push(snap);
      if (this.history.length > 100) this.history.shift();
      this.hIndex = this.history.length - 1;
    },
    commit() { this._pushHistory(); this._saveSoon(); },
    undo() {
      if (this.hIndex <= 0) return;
      this.hIndex--;
      this._restoreIndex();
    },
    redo() {
      if (this.hIndex >= this.history.length - 1) return;
      this.hIndex++;
      this._restoreIndex();
    },
    _restoreIndex() {
      this.studioGraph = Graph.fromJSON(JSON.parse(this.history[this.hIndex]));
      this.board.setGraph(this.studioGraph, { fit: false });
      this.renderStudio();
    },
    _saveSoon() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => {
        store.set(LS_GRAPH, JSON.stringify(this.studioGraph.toJSON()));
      }, 400);
    },

    /* ================= walk ================= */
    toggleWalk() {
      if (this.board.walk) {
        this.board.stopWalk();
        this.walkBtn.classList.remove('on');
        this.walkBtn.innerHTML = '● walk';
        return;
      }
      if (!this.studioGraph.n) { this.toast('Add some nodes first.'); return; }
      if (this.board.startWalk()) {
        this.walkBtn.classList.add('on');
        this.walkBtn.innerHTML = '■ stop';
        this.toast('Walker released — node glow tracks visit frequency. Compare with π in the Solver.');
      }
    },

    /* ================= tabs ================= */
    _buildTabs() {
      const tabs = document.querySelectorAll('.tabs button');
      tabs.forEach(b => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
      window.addEventListener('hashchange', () => {
        const id = location.hash.replace('#', '');
        if (id && id !== this.active) this.showTab(id, { push: false });
      });
    },
    showTab(id, { push = true } = {}) {
      const valid = ['studio', 'playground', 'solver', 'spectrum', 'gallery'];
      if (!valid.includes(id)) id = 'studio';
      this.active = id;
      document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + id));
      document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
      if (push) { try { history.replaceState(null, '', '#' + id); } catch {} }
      const mod = { playground: Playground, solver: Solver, spectrum: Spectrum, gallery: Gallery }[id];
      if (mod && mod.onShow) mod.onShow();
      if (id === 'studio' && this.board) this.board._resize();
    },

    /* ================= topbar actions ================= */
    _buildTopbarActions() {
      const box = document.querySelector('.topbar-actions');
      const exp = U.btn(icon('download') + ' export', 'btn btn-ghost btn-export', () => menu());
      const help = U.btn('?', 'btn btn-icon btn-help', () => this._helpModal(), 'Shortcuts & about');
      box.appendChild(exp); box.appendChild(help);
      const menu = () => {
        this._popover(exp, [
          ['PNG image of the graph', () => this._exportPNG()],
          ['Graph as JSON', () => {
            U.download('adjacency-graph.json', JSON.stringify(this.studioGraph.toJSON(), null, 2), 'application/json');
          }],
          ['Matrix as LaTeX', async () => {
            await U.copy(LA.toLatex(this.matrixOfKind())); this.toast('LaTeX copied to clipboard.');
          }],
          ['Matrix as CSV', () => {
            U.download('adjacency-matrix.csv', LA.toCSV(this.matrixOfKind()), 'text/csv');
          }],
          ['Import graph JSON…', () => this._importJSON()]
        ]);
      };
    },
    _exportPNG() {
      const src = this.board.canvas;
      const out = document.createElement('canvas');
      out.width = src.width; out.height = src.height;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#06091a';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(src, 0, 0);
      out.toBlob(b => U.download('adjacency-graph.png', b, 'image/png'));
    },
    _importJSON() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.addEventListener('change', () => {
        const f = inp.files[0];
        if (!f) return;
        f.text().then(t => {
          try {
            const g = Graph.fromJSON(JSON.parse(t));
            if (!g.n) throw new Error();
            this.adoptGraph(g, 'Imported graph');
          } catch { this.toast('Could not read that file as a graph.'); }
        });
      });
      inp.click();
    },
    _popover(anchor, items) {
      document.querySelectorAll('.popover').forEach(p => p.remove());
      const pop = U.el('div', 'popover');
      items.forEach(([label, fn]) => {
        pop.appendChild(U.btn(label, 'popover-item', () => { pop.remove(); fn(); }));
      });
      document.body.appendChild(pop);
      const r = anchor.getBoundingClientRect();
      pop.style.top = (r.bottom + 8) + 'px';
      pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      setTimeout(() => {
        const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close); } };
        document.addEventListener('pointerdown', close);
      }, 0);
    },
    _copyMenu() {
      const btn = document.querySelector('.mx-actions .btn-icon:last-child');
      this._popover(btn, [
        ['Copy as LaTeX bmatrix', async () => { await U.copy(LA.toLatex(this.matrixOfKind())); this.toast('LaTeX copied.'); }],
        ['Copy as CSV', async () => { await U.copy(LA.toCSV(this.matrixOfKind())); this.toast('CSV copied.'); }],
        ['Copy as plain rows', async () => {
          await U.copy(this.matrixOfKind().map(r => r.map(v => LA.fmt(v)).join(' ')).join('\n'));
          this.toast('Copied.');
        }]
      ]);
    },
    _pasteModal() {
      const { modal, body } = this._modal('Paste a matrix',
        'One row per line — spaces or commas between entries. Square, up to 20×20. Symmetry ⇒ undirected; 0/1 entries ⇒ unweighted.');
      const ta = U.el('textarea', 'mono-area');
      ta.rows = 8;
      ta.placeholder = '0 1 1\n1 0 0\n1 0 0';
      body.appendChild(ta);
      const err = U.el('div', 'form-err');
      body.appendChild(err);
      const row = U.el('div', 'btn-row');
      row.appendChild(U.btn('Build graph', 'btn btn-primary', () => {
        const r = LA.parseMatrix(ta.value);
        if (r.error) { err.textContent = r.error; return; }
        if (r.M.length !== r.M[0].length) { err.textContent = 'Matrix must be square to be a graph.'; return; }
        if (r.M.length > 20) { err.textContent = 'Studio holds up to 20 nodes.'; return; }
        modal.remove();
        this.adoptMatrix(r.M, 'Pasted matrix');
      }));
      body.appendChild(row);
      ta.focus();
    },

    /* ================= modals / toasts ================= */
    _modal(title, sub = '') {
      document.querySelectorAll('.modal-back').forEach(m => m.remove());
      const back = U.el('div', 'modal-back');
      const modal = U.el('div', 'modal');
      const head = U.el('div', 'modal-head');
      head.appendChild(U.el('h3', '', title));
      head.appendChild(U.btn('✕', 'btn btn-icon modal-x', () => back.remove()));
      modal.appendChild(head);
      if (sub) modal.appendChild(U.el('p', 'modal-sub', sub));
      const body = U.el('div', 'modal-body');
      modal.appendChild(body);
      back.appendChild(modal);
      back.addEventListener('pointerdown', e => { if (e.target === back) back.remove(); });
      document.body.appendChild(back);
      return { modal: back, body };
    },
    _welcome() {
      const { modal, body } = this._modal('', '');
      modal.querySelector('.modal-head').remove();
      body.innerHTML = `
        <div class="welcome">
          <div class="welcome-logo">${icon('logo')}</div>
          <h1 class="welcome-title">Adjacency</h1>
          <p class="welcome-tag">Every graph is a matrix.<br>Every matrix is a graph.</p>
          <div class="welcome-tips">
            <div class="tip"><b>Draw</b><span>Double-click to drop nodes, drag between them to connect. Right-click deletes.</span></div>
            <div class="tip"><b>Sync</b><span>The matrix rewrites itself as you draw — and editing the matrix redraws the graph.</span></div>
            <div class="tip"><b>Explore</b><span>Powers, inverses, eigenvalues on the unit circle, random walks, special matrices.</span></div>
          </div>
          <button class="btn btn-primary welcome-go">Start exploring</button>
          <p class="welcome-credit">Created by <a href="https://scott-masterson.com/" target="_blank" rel="noopener">Scott Masterson</a></p>
        </div>`;
      body.querySelector('.welcome-go').addEventListener('click', () => {
        store.set(LS_WELCOME, '1');
        modal.remove();
      });
    },
    _helpModal() {
      const { body } = this._modal('Shortcuts & tips');
      body.innerHTML = `
        <div class="help-grid">
          <div><b>V N E X</b><span>select · add node · connect · erase</span></div>
          <div><b>double-click space</b><span>add a node (any tool)</span></div>
          <div><b>drag node → node</b><span>connect (edge tool)</span></div>
          <div><b>click node twice</b><span>self-loop (edge tool)</span></div>
          <div><b>double-click node / edge</b><span>rename / set weight</span></div>
          <div><b>right-click</b><span>delete node or edge</span></div>
          <div><b>⌫ / delete</b><span>delete selection</span></div>
          <div><b>⌘Z · ⇧⌘Z</b><span>undo · redo</span></div>
          <div><b>F</b><span>fit graph to view</span></div>
          <div><b>scroll · drag space</b><span>zoom · pan</span></div>
        </div>
        <p class="modal-sub">
        Created by <a href="https://scott-masterson.com/" target="_blank" rel="noopener">Scott Masterson</a>.</p>`;
    },
    toast(msg) {
      const box = document.getElementById('toasts');
      const t = U.el('div', 'toast', msg);
      box.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3200);
    },

    /* ================= keyboard ================= */
    _keyboard() {
      document.addEventListener('keydown', e => {
        const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
        if (typing) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? this.redo() : this.undo();
          return;
        }
        if (this.active !== 'studio') return;
        const k = e.key.toLowerCase();
        if (k === 'v') this._setTool('select');
        else if (k === 'n') this._setTool('node');
        else if (k === 'e') this._setTool('edge');
        else if (k === 'x') this._setTool('erase');
        else if (k === 'f') this.board.fit();
        else if (k === 'delete' || k === 'backspace') {
          e.preventDefault();
          this.board.deleteSelection();
        } else if (k === 'escape') {
          this.board.pendingFrom = null;
          this.board.selection = null;
        }
      });
    },
    _setTool(t) {
      this.board.tool = t;
      this.toolSeg.set(t);
      this._status();
    },

    /* ================= animation loop ================= */
    _tick(now) {
      requestAnimationFrame(t => this._tick(t));
      if (document.hidden) return;
      if (this.active === 'studio' && this.board) {
        this.board.frame(now);
        if (!this.board.walk && this._walkWas) { this._walkWas = false; this.renderStudio(); }
        if (this.board.walk) this._walkWas = true;
        if (this.board.walk && now - (this._walkStatusAt || 0) > 400) {
          this._walkStatusAt = now;
          const w = this.board.walk;
          this.statusEl.innerHTML =
            `<span>random walk · step ${w.steps} · at <b>${this.studioGraph.nodes[w.node] ? this.studioGraph.nodes[w.node].label : '?'}</b></span>` +
            `<span class="status-hint">glow = visit frequency → converges to π</span>`;
        }
      } else if (this.active === 'playground' && Playground.board) {
        Playground.board.frame(now);
      } else if (this.active === 'spectrum') {
        Spectrum.frame(now);
      }
    }
  };

  /* ================= inline SVG icons ================= */
  function icon(name) {
    const s = {
      cursor: '<path d="M4 2l12 11-5.2.9 3 5.6-2.6 1.4-3-5.7L4 19z"/>',
      node: '<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke-width="2" stroke-linecap="round"/>',
      edge: '<circle cx="5" cy="19" r="3"/><circle cx="19" cy="5" r="3"/><path d="M7.5 16.5l9-9" stroke-width="2" stroke-linecap="round"/>',
      erase: '<path d="M4 14L14 4l6 6-10 10H6z"/><path d="M9 20h11" stroke-width="2" stroke-linecap="round"/>',
      undo: '<path d="M8 5L3 10l5 5" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 10H14a6 6 0 010 12h-3" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
      redo: '<path d="M16 5l5 5-5 5" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.5 10H10a6 6 0 000 12h3" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
      dice: '<rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/><circle cx="15.5" cy="8.5" r="1.6"/><circle cx="8.5" cy="15.5" r="1.6"/>',
      tidy: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5L6 16M12 7.5L18 16M7.5 18h9" fill="none" stroke-width="1.8"/>',
      circle: '<circle cx="12" cy="12" r="9" fill="none" stroke-width="2" stroke-dasharray="3 3"/><circle cx="12" cy="3" r="2"/><circle cx="21" cy="12" r="2"/><circle cx="12" cy="21" r="2"/><circle cx="3" cy="12" r="2"/>',
      trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
      fit: '<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
      download: '<path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
      paste: '<rect x="6" y="4" width="12" height="17" rx="2" fill="none" stroke-width="2"/><path d="M9 4a3 3 0 016 0" fill="none" stroke-width="2"/><path d="M9 11h6M9 15h6" stroke-width="1.8" stroke-linecap="round"/>',
      copy: '<rect x="8" y="8" width="12" height="13" rx="2" fill="none" stroke-width="2"/><path d="M5 16V5a2 2 0 012-2h9" fill="none" stroke-width="2" stroke-linecap="round"/>',
      cols: '<rect x="3" y="4" width="8" height="16" rx="2" fill="none" stroke-width="2"/><rect x="13" y="4" width="8" height="16" rx="2" fill="none" stroke-width="2"/>',
      logo: '<circle cx="12" cy="4.5" r="3"/><circle cx="4.5" cy="19" r="3"/><circle cx="19.5" cy="19" r="3"/><path d="M10.7 7.2L5.8 16.3M13.3 7.2l4.9 9.1M7.5 19h9" stroke-width="1.6" fill="none"/>'
    }[name] || '';
    return `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="currentColor" stroke-width="0" aria-hidden="true">${s}</svg>`;
  }

  window.App = App;
  window.AdjacencyIcon = icon;
  document.addEventListener('DOMContentLoaded', () => App.boot());
})();
