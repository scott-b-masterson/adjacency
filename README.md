# Adjacency

**Every graph is a matrix. Every matrix is a graph.**

An interactive playground connecting network structure and linear algebra — draw a graph and watch its matrix rewrite itself live, edit the matrix and watch the graph redraw, then push the same object through powers, inverses, eigenvalues, and random walks.

Created by [Scott Masterson](https://scott-masterson.com/). Built for studying stochastic processes; shared as a public good.

---

## The five tabs

**Studio** — the main canvas. Lands on a random G(10, 0.28) graph with its 10×10 adjacency matrix beside it.
- Draw: double-click to add nodes, drag node→node to connect (tools: **V** select, **N** node, **E** edge, **X** erase), right-click deletes, double-click a node/edge to rename / set weight.
- The matrix panel is fully editable: click cells to toggle edges (or type weights). Hovering a cell lights up the corresponding edge, and vice versa.
- Toggle **directed** (arrowheads + flowing particles, asymmetric A) and **weighted** (numbers on edges).
- Matrix views: **A** adjacency · **L** Laplacian · **D** degree · **P** random-walk transition.
- **● walk** releases a random walker driven by the matrix — node glow tracks visit frequency, converging to the stationary distribution π.
- Undo/redo, pan/zoom, force layout, presets (including a ready-made weather Markov chain), paste-a-matrix, LaTeX/CSV/PNG/JSON export. Your graph autosaves locally.

**Playground** — a random-graph lab: Erdős–Rényi, Barabási–Albert, Watts–Strogatz, trees, lattices, bipartite, Petersen, hypercubes, and random Markov chains, up to 60 nodes with live physics, an adjacency heatmap, degree histograms, and one-click handoff to the Studio or Spectrum.

**Solver** — matrix bench for A, L, P, or any pasted matrix: **Mᵏ** (exponentiation by squaring; on a 0/1 adjacency, entry (i,j) counts length-k walks), **M⁻¹**, det, rank, trace (with triangle counts via tr A³/6), transpose, RREF, row-normalization, and the **stationary distribution π** (least-squares solve of πP = π). Results copy as LaTeX/CSV or open straight back into the Studio as a graph.

**Spectrum** — eigenvalues plotted on the complex plane against the unit circle (symmetric matrices via cyclic Jacobi; general matrices via Hessenberg reduction + shifted QR). Optional Gershgorin discs, spectral radius, spectral gap and mixing commentary for stochastic matrices, algebraic connectivity for Laplacians. Try a directed cycle: the eigenvalues are exactly the roots of unity.

**Gallery** — thirteen special matrices (identity, all-ones, permutation, cyclic shift, circulant, Toeplitz, tridiagonal, row-stochastic, doubly stochastic via Sinkhorn, symmetric, upper triangular, Petersen, hypercube), each explained as a *graph condition*, each loadable into the Studio, Solver, or Spectrum.

Everything runs client-side — no build step, no dependencies, no data leaves the page.

---

## Run it locally

Just open `index.html` in a browser. (Optionally: `python3 -m http.server` in this folder, then visit `http://localhost:8000`.)

## Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g. `adjacency`). Keep it public.
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Adjacency — interactive graph ↔ matrix visualizer"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/adjacency.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
4. After ~a minute, the site is live at `https://YOUR-USERNAME.github.io/adjacency/`.

### Custom domain

1. Buy the domain, then in the repo create a file named `CNAME` containing exactly the domain (e.g. `adjacency.app`).
2. At your DNS provider:
   - Apex domain (`adjacency.app`): four **A records** → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` subdomain: **CNAME record** → `YOUR-USERNAME.github.io`
3. In **Settings → Pages**, enter the custom domain and check **Enforce HTTPS** once the certificate is issued (can take up to a day).

---

## Project structure

```
adjacency/
├── index.html          shell, nav, tab sections
├── css/style.css       full design system (dark, glassy, gradient accents)
└── js/
    ├── linalg.js       math engine: complex arithmetic, LU, RREF, matrix powers,
    │                   Jacobi + Hessenberg/shifted-QR eigenvalues, stationary π, Sinkhorn
    ├── graphcore.js    Graph model, matrix bridges (A/L/D/P), generators, force layout
    ├── util.js         tiny DOM helpers
    ├── board.js        canvas editor: drag, connect, pan/zoom, arrows, particles, random walk
    ├── matrixview.js   live editable matrix grid + heatmaps
    ├── playground.js   random-graph lab
    ├── solver.js       matrix operations bench
    ├── spectrum.js     eigenvalue plane
    ├── special.js      special-matrix gallery
    └── app.js          boot, tabs, undo/redo, export, modals
```

`linalg.js` and `graphcore.js` are dependency-free and Node-testable (`module.exports`), so the math can be unit-tested outside the browser.

## License

MIT © 2026 Scott Masterson — see `LICENSE`.
