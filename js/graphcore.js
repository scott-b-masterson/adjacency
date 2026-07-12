/* ============================================================
   Adjacency — graphcore.js
   Graph model, generators, layouts. No DOM. Node-testable.
   ============================================================ */
(function () {
  'use strict';
  const LA = (typeof window !== 'undefined' ? window.LA : require('./linalg.js'));

  class Graph {
    constructor(n = 0, { directed = false, weighted = false } = {}) {
      this.directed = directed;
      this.weighted = weighted;
      this.nodes = [];
      this.adj = new Map();          // "i,j" → weight
      for (let i = 0; i < n; i++) this.addNode();
    }
    get n() { return this.nodes.length; }
    key(i, j) { return this.directed || i <= j ? i + ',' + j : j + ',' + i; }

    addNode(x = 0, y = 0, label = null) {
      this.nodes.push({ x, y, vx: 0, vy: 0, label: label ?? String(this.nodes.length + 1) });
      return this.nodes.length - 1;
    }
    removeNode(idx) {
      this.nodes.splice(idx, 1);
      const next = new Map();
      for (const [k, w] of this.adj) {
        let [i, j] = k.split(',').map(Number);
        if (i === idx || j === idx) continue;
        if (i > idx) i--;
        if (j > idx) j--;
        next.set(this.key(i, j), w);
      }
      this.adj = next;
      // re-label default numeric labels
      this.nodes.forEach((nd, i) => { if (/^\d+$/.test(nd.label)) nd.label = String(i + 1); });
    }
    setEdge(i, j, w = 1) {
      if (i < 0 || j < 0 || i >= this.n || j >= this.n) return;
      if (w === 0) { this.adj.delete(this.key(i, j)); return; }
      this.adj.set(this.key(i, j), this.weighted ? w : 1);
    }
    removeEdge(i, j) { this.adj.delete(this.key(i, j)); }
    getW(i, j) { return this.adj.get(this.key(i, j)) || 0; }
    hasEdge(i, j) { return this.adj.has(this.key(i, j)); }
    edgeCount() { return this.adj.size; }
    forEachEdge(fn) {
      for (const [k, w] of this.adj) {
        const [i, j] = k.split(',').map(Number);
        fn(i, j, w);
      }
    }

    /* ---- matrix bridges ---- */
    matrix() {
      const M = LA.zeros(this.n);
      this.forEachEdge((i, j, w) => {
        M[i][j] = w;
        if (!this.directed) M[j][i] = w;
      });
      return M;
    }
    fromMatrix(M, { directed = null, weighted = null, keepPositions = true } = {}) {
      const n = M.length;
      const inferDirected = directed ?? !LA.isSymmetric(M);
      const inferWeighted = weighted ?? M.some(r => r.some(v => v !== 0 && v !== 1));
      const old = this.nodes;
      this.directed = inferDirected;
      this.weighted = inferWeighted;
      this.nodes = [];
      this.adj = new Map();
      for (let i = 0; i < n; i++) {
        const p = keepPositions && old[i] ? old[i] : { x: 0, y: 0 };
        this.addNode(p.x, p.y, old[i] && !/^\d+$/.test(old[i].label) ? old[i].label : null);
      }
      for (let i = 0; i < n; i++)
        for (let j = (this.directed ? 0 : i); j < n; j++)
          if (M[i][j] !== 0) this.setEdge(i, j, M[i][j]);
      if (!keepPositions || old.length !== n) Layouts.circle(this);
      return this;
    }
    degreeMatrix() {
      const M = this.matrix(), D = LA.zeros(this.n);
      for (let i = 0; i < this.n; i++) D[i][i] = M[i].reduce((s, v) => s + v, 0);
      return D;
    }
    laplacian() {
      const A = this.matrix(), D = this.degreeMatrix(), L = LA.zeros(this.n);
      for (let i = 0; i < this.n; i++) for (let j = 0; j < this.n; j++)
        L[i][j] = (i === j ? D[i][i] : 0) - A[i][j];
      return L;
    }
    transition() { return LA.rowStochastic(this.matrix()); }
    view(kind) { // 'A' | 'L' | 'D' | 'P'
      if (kind === 'L') return this.laplacian();
      if (kind === 'D') return this.degreeMatrix();
      if (kind === 'P') return this.transition().P;
      return this.matrix();
    }

    /* ---- mode conversions ---- */
    setDirected(on) {
      if (on === this.directed) return;
      const M = this.matrix();
      if (on) {
        this.directed = true;
        this.adj = new Map();
        for (let i = 0; i < this.n; i++) for (let j = 0; j < this.n; j++)
          if (M[i][j] !== 0) this.setEdge(i, j, M[i][j]);
      } else {
        this.directed = false;
        this.adj = new Map();
        for (let i = 0; i < this.n; i++) for (let j = i; j < this.n; j++) {
          const w = Math.max(M[i][j], M[j][i]);
          if (w !== 0) this.setEdge(i, j, w);
        }
      }
    }
    setWeighted(on) {
      this.weighted = on;
      if (!on) for (const k of this.adj.keys()) this.adj.set(k, 1);
    }

    /* ---- analysis ---- */
    neighborsUndirected() {
      const nb = Array.from({ length: this.n }, () => new Set());
      this.forEachEdge((i, j) => { if (i !== j) { nb[i].add(j); nb[j].add(i); } });
      return nb;
    }
    components() {
      const nb = this.neighborsUndirected(), seen = new Array(this.n).fill(-1);
      let c = 0;
      for (let s = 0; s < this.n; s++) {
        if (seen[s] >= 0) continue;
        const q = [s]; seen[s] = c;
        while (q.length) {
          const u = q.pop();
          for (const v of nb[u]) if (seen[v] < 0) { seen[v] = c; q.push(v); }
        }
        c++;
      }
      return { count: c, labels: seen };
    }
    isConnected() { return this.n === 0 || this.components().count === 1; }
    stats() {
      const n = this.n, m = this.edgeCount();
      const nb = this.neighborsUndirected();
      const degs = nb.map(s => s.size);
      const maxPairs = this.directed ? n * (n - 1) : n * (n - 1) / 2;
      let loops = 0; this.forEachEdge((i, j) => { if (i === j) loops++; });
      // clustering coefficient (undirected simple)
      let cc = 0, ccn = 0;
      for (let i = 0; i < n; i++) {
        const s = [...nb[i]];
        if (s.length < 2) continue;
        let tri = 0;
        for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++)
          if (nb[s[a]].has(s[b])) tri++;
        cc += 2 * tri / (s.length * (s.length - 1)); ccn++;
      }
      // diameter via BFS (only if connected & small)
      let diameter = null;
      const comp = this.components();
      if (comp.count === 1 && n > 1 && n <= 120) {
        diameter = 0;
        for (let s = 0; s < n; s++) {
          const dist = new Array(n).fill(-1); dist[s] = 0;
          const q = [s]; let head = 0;
          while (head < q.length) {
            const u = q[head++];
            for (const v of nb[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); }
          }
          diameter = Math.max(diameter, ...dist);
        }
      }
      return {
        n, m: m - loops, loops,
        density: maxPairs ? (m - loops) / maxPairs : 0,
        avgDeg: n ? degs.reduce((a, b) => a + b, 0) / n : 0,
        degs, components: comp.count, diameter,
        clustering: ccn ? cc / ccn : 0
      };
    }

    /* ---- (de)serialization ---- */
    toJSON() {
      return {
        v: 1, directed: this.directed, weighted: this.weighted,
        nodes: this.nodes.map(nd => ({ x: Math.round(nd.x * 10) / 10, y: Math.round(nd.y * 10) / 10, label: nd.label })),
        edges: [...this.adj].map(([k, w]) => { const [i, j] = k.split(',').map(Number); return [i, j, w]; })
      };
    }
    static fromJSON(o) {
      const g = new Graph(0, { directed: !!o.directed, weighted: !!o.weighted });
      (o.nodes || []).forEach(nd => g.addNode(nd.x, nd.y, nd.label));
      (o.edges || []).forEach(([i, j, w]) => g.setEdge(i, j, w ?? 1));
      return g;
    }
    clone() { return Graph.fromJSON(this.toJSON()); }
  }

  /* ================= generators ================= */
  const rnd = () => Math.random();
  const randint = n => Math.floor(rnd() * n);

  const Gen = {
    empty: n => new Graph(n),
    er(n, p, { directed = false } = {}) {
      const g = new Graph(n, { directed });
      for (let i = 0; i < n; i++)
        for (let j = directed ? 0 : i + 1; j < n; j++)
          if (i !== j && rnd() < p) g.setEdge(i, j, 1);
      return g;
    },
    erConnected(n, p, tries = 60) {
      for (let t = 0; t < tries; t++) {
        const g = Gen.er(n, p);
        if (g.isConnected()) return g;
      }
      const g = Gen.er(n, p);           // fallback: stitch components
      const comp = g.components();
      const reps = [];
      for (let c = 0; c < comp.count; c++) reps.push(comp.labels.indexOf(c));
      for (let c = 1; c < reps.length; c++) g.setEdge(reps[c - 1], reps[c], 1);
      return g;
    },
    ba(n, m = 2) { // Barabási–Albert preferential attachment
      const g = new Graph(n);
      const targets = [];
      const m0 = Math.max(m, 2);
      for (let i = 0; i < Math.min(m0, n); i++)
        for (let j = i + 1; j < Math.min(m0, n); j++) { g.setEdge(i, j, 1); targets.push(i, j); }
      for (let v = m0; v < n; v++) {
        const chosen = new Set();
        while (chosen.size < Math.min(m, v)) {
          const pick = targets.length && rnd() < 0.9 ? targets[randint(targets.length)] : randint(v);
          if (pick !== v) chosen.add(pick);
        }
        for (const u of chosen) { g.setEdge(v, u, 1); targets.push(v, u); }
      }
      return g;
    },
    ws(n, k = 4, beta = 0.2) { // Watts–Strogatz
      const g = new Graph(n);
      const half = Math.max(1, Math.floor(k / 2));
      for (let i = 0; i < n; i++)
        for (let d = 1; d <= half; d++) g.setEdge(i, (i + d) % n, 1);
      const edges = [];
      g.forEachEdge((i, j) => edges.push([i, j]));
      for (const [i, j] of edges) {
        if (rnd() < beta) {
          let t = randint(n), guard = 0;
          while ((t === i || g.hasEdge(i, t)) && guard++ < 50) t = randint(n);
          if (guard < 50) { g.removeEdge(i, j); g.setEdge(i, t, 1); }
        }
      }
      return g;
    },
    complete(n) {
      const g = new Graph(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) g.setEdge(i, j, 1);
      return g;
    },
    cycle(n, { directed = false } = {}) {
      const g = new Graph(n, { directed });
      for (let i = 0; i < n; i++) g.setEdge(i, (i + 1) % n, 1);
      return g;
    },
    path(n) {
      const g = new Graph(n);
      for (let i = 0; i < n - 1; i++) g.setEdge(i, i + 1, 1);
      return g;
    },
    star(n) {
      const g = new Graph(n);
      for (let i = 1; i < n; i++) g.setEdge(0, i, 1);
      return g;
    },
    grid(rows, cols) {
      const g = new Graph(rows * cols);
      const id = (r, c) => r * cols + c;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) g.setEdge(id(r, c), id(r, c + 1), 1);
        if (r + 1 < rows) g.setEdge(id(r, c), id(r + 1, c), 1);
      }
      g._grid = { rows, cols };
      return g;
    },
    tree(n) { // random recursive tree
      const g = new Graph(n);
      for (let i = 1; i < n; i++) g.setEdge(i, randint(i), 1);
      return g;
    },
    bipartite(a, b, p = 0.4) {
      const g = new Graph(a + b);
      for (let i = 0; i < a; i++) for (let j = 0; j < b; j++)
        if (rnd() < p) g.setEdge(i, a + j, 1);
      g._bipartite = { a, b };
      return g;
    },
    petersen() {
      const g = new Graph(10);
      for (let i = 0; i < 5; i++) {
        g.setEdge(i, (i + 1) % 5, 1);           // outer C5
        g.setEdge(5 + i, 5 + (i + 2) % 5, 1);   // inner pentagram
        g.setEdge(i, 5 + i, 1);                 // spokes
      }
      return g;
    },
    hypercube(d = 3) {
      const n = 1 << d, g = new Graph(n);
      for (let i = 0; i < n; i++) for (let b = 0; b < d; b++) {
        const j = i ^ (1 << b);
        if (j > i) g.setEdge(i, j, 1);
      }
      return g;
    },
    randomStochastic(n) { // weighted directed graph whose A is row-stochastic
      const g = new Graph(n, { directed: true, weighted: true });
      for (let i = 0; i < n; i++) {
        const k = 1 + randint(Math.min(3, n - 1) + 1);
        const outs = new Set();
        while (outs.size < k) outs.add(randint(n));
        let ws = [...outs].map(() => 0.05 + rnd());
        const s = ws.reduce((a, x) => a + x, 0);
        ws = ws.map(w => Math.round(w / s * 100) / 100);
        const drift = 1 - ws.reduce((a, x) => a + x, 0);
        ws[0] = Math.round((ws[0] + drift) * 100) / 100;
        [...outs].forEach((j, idx) => g.setEdge(i, j, ws[idx]));
      }
      return g;
    }
  };

  /* ================= layouts ================= */
  const Layouts = {
    circle(g, cx = 0, cy = 0, r = null) {
      const n = g.n;
      const R = r ?? Math.max(120, n * 22);
      g.nodes.forEach((nd, i) => {
        const a = -Math.PI / 2 + 2 * Math.PI * i / Math.max(1, n);
        nd.x = cx + R * Math.cos(a);
        nd.y = cy + R * Math.sin(a);
        nd.vx = nd.vy = 0;
      });
    },
    scatter(g, w = 600, h = 420) {
      g.nodes.forEach(nd => {
        nd.x = (Math.random() - 0.5) * w;
        nd.y = (Math.random() - 0.5) * h;
        nd.vx = nd.vy = 0;
      });
    },
    grid(g, rows, cols, gap = 90) {
      g.nodes.forEach((nd, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        nd.x = (c - (cols - 1) / 2) * gap;
        nd.y = (r - (rows - 1) / 2) * gap;
        nd.vx = nd.vy = 0;
      });
    },
    bipartiteCols(g, a, b, gap = 70) {
      g.nodes.forEach((nd, i) => {
        if (i < a) { nd.x = -160; nd.y = (i - (a - 1) / 2) * gap; }
        else { nd.x = 160; nd.y = ((i - a) - (b - 1) / 2) * gap; }
        nd.vx = nd.vy = 0;
      });
    },
    /* one tick of force simulation; returns kinetic energy */
    forceTick(g, { repulsion = 26000, spring = 0.06, springLen = 130, gravity = 0.015, damping = 0.85, dt = 1, pinned = -1 } = {}) {
      const n = g.n, nodes = g.nodes;
      const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (Math.random() - .5); dy = (Math.random() - .5); d2 = 1; }
          const f = repulsion / d2, d = Math.sqrt(d2);
          fx[i] += f * dx / d; fy[i] += f * dy / d;
          fx[j] -= f * dx / d; fy[j] -= f * dy / d;
        }
        fx[i] -= gravity * nodes[i].x; fy[i] -= gravity * nodes[i].y;
      }
      g.forEachEdge((i, j) => {
        if (i === j) return;
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = spring * (d - springLen);
        fx[i] += f * dx / d; fy[i] += f * dy / d;
        fx[j] -= f * dx / d; fy[j] -= f * dy / d;
      });
      let energy = 0;
      for (let i = 0; i < n; i++) {
        if (i === pinned) { nodes[i].vx = nodes[i].vy = 0; continue; }
        nodes[i].vx = (nodes[i].vx + fx[i] * dt * 0.01) * damping;
        nodes[i].vy = (nodes[i].vy + fy[i] * dt * 0.01) * damping;
        const vmax = 18;
        nodes[i].vx = Math.max(-vmax, Math.min(vmax, nodes[i].vx));
        nodes[i].vy = Math.max(-vmax, Math.min(vmax, nodes[i].vy));
        nodes[i].x += nodes[i].vx * dt;
        nodes[i].y += nodes[i].vy * dt;
        energy += nodes[i].vx ** 2 + nodes[i].vy ** 2;
      }
      return energy;
    },
    settle(g, ticks = 260) {
      if (g.n === 0) return;
      const anyPos = g.nodes.some(nd => nd.x !== 0 || nd.y !== 0);
      if (!anyPos) Layouts.circle(g);
      for (let t = 0; t < ticks; t++) {
        const e = Layouts.forceTick(g, { damping: 0.82 });
        if (e < 0.02 * g.n && t > 40) break;
      }
    },
    auto(g) {
      if (g._grid) Layouts.grid(g, g._grid.rows, g._grid.cols);
      else if (g._bipartite) Layouts.bipartiteCols(g, g._bipartite.a, g._bipartite.b);
      else { Layouts.circle(g); Layouts.settle(g, 220); }
    }
  };

  const GraphCore = { Graph, Gen, Layouts };
  if (typeof window !== 'undefined') Object.assign(window, GraphCore, { GraphCore });
  if (typeof module !== 'undefined' && module.exports) module.exports = GraphCore;
})();
