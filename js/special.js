/* ============================================================
   Adjacency — special.js
   Gallery of special matrices and the graphs they encode.
   ============================================================ */
(function () {
  'use strict';

  const ri = n => Math.floor(Math.random() * n);

  const SPECIALS = [
    {
      id: 'identity', name: 'Identity Iₙ', n: [2, 12, 6],
      desc: 'Ones on the diagonal, zeros elsewhere. The do-nothing linear map.',
      graph: 'As a graph: n isolated nodes, each with a single self-loop.',
      build: n => LA.identity(n)
    },
    {
      id: 'allones', name: 'All-ones J', n: [2, 12, 5],
      desc: 'Every entry is 1. Rank 1; spectrum {n, 0, …, 0}. J/n is the “teleport anywhere” walk.',
      graph: 'As a graph: the complete graph with self-loops — everything touches everything.',
      build: n => LA.zeros(n).map(r => r.fill(1))
    },
    {
      id: 'permutation', name: 'Permutation', n: [3, 12, 7], random: true,
      desc: 'Exactly one 1 in each row and column. Doubly stochastic, orthogonal, and all eigenvalues sit ON the unit circle.',
      graph: 'As a graph: a union of disjoint directed cycles — each node has exactly one arrow out and one in.',
      build: n => {
        const perm = [...Array(n).keys()];
        for (let i = n - 1; i > 0; i--) { const j = ri(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
        const M = LA.zeros(n);
        perm.forEach((p, i) => M[i][p] = 1);
        return M;
      }
    },
    {
      id: 'shift', name: 'Cyclic shift S', n: [3, 12, 8],
      desc: 'The permutation that sends i → i+1 (mod n). Its eigenvalues are exactly the n-th roots of unity.',
      graph: 'As a graph: a single directed cycle Cₙ.',
      build: n => { const M = LA.zeros(n); for (let i = 0; i < n; i++) M[i][(i + 1) % n] = 1; return M; }
    },
    {
      id: 'circulant', name: 'Circulant', n: [4, 12, 8], random: true,
      desc: 'Each row is the previous row shifted right: a polynomial in the shift matrix S. Diagonalized by the Fourier basis.',
      graph: 'As a graph: a circulant graph — node i connects to i+k (mod n) for a fixed set of jumps k.',
      build: n => {
        const first = new Array(n).fill(0);
        const jumps = new Set();
        while (jumps.size < Math.min(2 + ri(2), n - 1)) jumps.add(1 + ri(n - 1));
        jumps.forEach(k => first[k] = 1);
        const M = LA.zeros(n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = first[(j - i + n) % n];
        return M;
      }
    },
    {
      id: 'toeplitz', name: 'Toeplitz (banded)', n: [4, 12, 8], random: true,
      desc: 'Constant along every diagonal. The matrix of a system that treats all positions the same way.',
      graph: 'As a graph: edges depend only on the distance j − i — a “translation-invariant” network on a line.',
      build: n => {
        const diag = {};
        [-2, -1, 1, 2].forEach(d => { if (Math.random() < 0.8) diag[d] = Math.round((0.2 + Math.random()) * 10) / 10; });
        diag[0] = Math.random() < 0.4 ? Math.round(Math.random() * 10) / 10 : 0;
        const M = LA.zeros(n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = diag[j - i] || 0;
        return M;
      }
    },
    {
      id: 'tridiag', name: 'Tridiagonal (path)', n: [3, 14, 8],
      desc: 'Nonzeros only on the three central diagonals. Eigenvalues 2·cos(kπ/(n+1)) — computable in closed form.',
      graph: 'As a graph: exactly the path graph P·—·—·… Nearest-neighbor structure, nothing else.',
      build: n => { const M = LA.zeros(n); for (let i = 0; i + 1 < n; i++) { M[i][i + 1] = 1; M[i + 1][i] = 1; } return M; }
    },
    {
      id: 'stochastic', name: 'Row-stochastic', n: [3, 12, 6], random: true,
      desc: 'Nonnegative rows summing to 1: a Markov transition matrix. λ₁ = 1 always; everything else inside the unit disk.',
      graph: 'As a graph: a weighted directed network where each node’s out-weights are its next-step probabilities.',
      build: n => {
        const M = LA.zeros(n);
        for (let i = 0; i < n; i++) {
          let s = 0;
          for (let j = 0; j < n; j++) { M[i][j] = Math.random() < 0.5 ? 0 : Math.random(); s += M[i][j]; }
          if (s === 0) { M[i][ri(n)] = 1; s = 1; }
          for (let j = 0; j < n; j++) M[i][j] = Math.round(M[i][j] / s * 1000) / 1000;
          let drift = 1 - M[i].reduce((a, b) => a + b, 0);
          const jmax = M[i].indexOf(Math.max(...M[i]));
          M[i][jmax] = Math.round((M[i][jmax] + drift) * 1000) / 1000;
        }
        return M;
      }
    },
    {
      id: 'doubly', name: 'Doubly stochastic', n: [3, 12, 6], random: true,
      desc: 'Rows AND columns sum to 1 (built by Sinkhorn iteration). Birkhoff: every such matrix is a blend of permutations. The uniform distribution is always stationary.',
      graph: 'As a graph: a weighted directed network whose random walk conserves the uniform distribution — flow in = flow out at every node.',
      build: n => LA.sinkhornDS(n).map(r => r.map(v => Math.round(v * 1000) / 1000))
    },
    {
      id: 'symmetric', name: 'Symmetric random', n: [3, 12, 7], random: true,
      desc: 'M = Mᵀ. The spectral theorem guarantees real eigenvalues and orthogonal eigenvectors.',
      graph: 'As a graph: an undirected weighted network — symmetry of the matrix IS undirectedness of the graph.',
      build: n => {
        const M = LA.zeros(n);
        for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
          if (i !== j && Math.random() < 0.45) { const w = Math.round((Math.random() * 2 - 0.5) * 10) / 10; M[i][j] = w; M[j][i] = w; }
        }
        return M;
      }
    },
    {
      id: 'triangular', name: 'Upper triangular', n: [3, 12, 7], random: true,
      desc: 'Zeros below the diagonal. Eigenvalues are just the diagonal entries, read off for free.',
      graph: 'As a graph: a DAG — all edges point “forward” in some ordering, so no cycles can form.',
      build: n => {
        const M = LA.zeros(n);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.random() < 0.45) M[i][j] = 1;
        return M;
      }
    },
    {
      id: 'petersen', name: 'Petersen adjacency', n: null,
      desc: 'The adjacency matrix of the Petersen graph: 3-regular, vertex-transitive, spectrum {3, 1⁵, (−2)⁴}. Integer eigenvalues!',
      graph: 'As a graph: the legendary counterexample to almost everything in graph theory.',
      build: () => Gen.petersen().matrix()
    },
    {
      id: 'hypercube', name: 'Hypercube Q₃', n: null,
      desc: 'Adjacency of the 3-cube: bipartite, so the spectrum is symmetric — {±3, ±1³}.',
      graph: 'As a graph: corners of a cube, edges along the edges of the cube. Node i ↔ j when they differ in one bit.',
      build: () => Gen.hypercube(3).matrix()
    }
  ];

  const G = {
    cards: new Map(),

    init() {
      const root = document.getElementById('tab-gallery');
      root.innerHTML = '';
      const head = U.el('div', 'gallery-head');
      head.appendChild(U.el('h2', '', 'Special matrices'));
      head.appendChild(U.el('p', '', 'Every structural condition on a matrix is a structural condition on a graph. Load any of these into the Studio, Solver, or Spectrum and see what the condition <em>looks like</em>.'));
      root.appendChild(head);
      const grid = U.el('div', 'gallery-grid');
      SPECIALS.forEach(sp => grid.appendChild(this._card(sp)));
      root.appendChild(grid);
    },

    _card(sp) {
      const card = U.el('div', 'card g-card');
      const state = { n: sp.n ? sp.n[2] : 0, M: null };
      const cv = U.el('canvas', 'g-heat');
      const title = U.el('div', 'g-title', sp.name);
      card.appendChild(title);
      card.appendChild(cv);
      card.appendChild(U.el('p', 'g-desc', sp.desc));
      card.appendChild(U.el('p', 'g-graph', sp.graph));

      const controls = U.el('div', 'g-controls');
      if (sp.n) {
        const nOut = U.el('b', '', 'n = ' + state.n);
        const slider = U.range(sp.n[0], sp.n[1], 1, state.n, v => {
          state.n = v; nOut.textContent = 'n = ' + v; rebuild();
        });
        controls.appendChild(slider);
        controls.appendChild(nOut);
      }
      if (sp.random) controls.appendChild(U.btn('🎲', 'btn btn-mini', () => rebuild(), 'randomize'));
      card.appendChild(controls);

      const row = U.el('div', 'btn-row g-actions');
      row.appendChild(U.btn('Studio', 'btn btn-mini', () => {
        App.adoptMatrix(state.M, sp.name);
      }, 'open as an editable graph'));
      row.appendChild(U.btn('Solver', 'btn btn-mini', () => {
        Solver.setMatrix(LA.clone(state.M), sp.name);
        App.showTab('solver');
      }, 'load into the matrix solver'));
      row.appendChild(U.btn('Spectrum', 'btn btn-mini', () => {
        Spectrum.setMatrix(LA.clone(state.M), sp.name);
        App.showTab('spectrum');
      }, 'plot the eigenvalues'));
      card.appendChild(row);

      const redraw = () => { if (state.M) MatrixUI.heatmap(cv, state.M); };
      const rebuild = () => {
        state.M = sp.build(state.n);
        redraw();
      };
      this.cards.set(sp.id, redraw);
      rebuild();
      return card;
    },

    onShow() { this.cards.forEach(fn => fn()); }
  };

  window.Gallery = G;
})();
