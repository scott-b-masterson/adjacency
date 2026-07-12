/* ============================================================
   Adjacency — solver.js
   Matrix operations bench: powers, inverse, det, rank, RREF,
   transpose, row-normalization, stationary distribution.
   ============================================================ */
(function () {
  'use strict';

  const S = {
    source: 'studio-A',
    customM: null,
    customLabel: 'custom matrix',
    k: 2,
    lastOp: null,

    init() {
      const root = document.getElementById('tab-solver');
      root.innerHTML = '';
      const wrap = U.el('div', 'solver-layout');

      /* ---- left: source ---- */
      const src = U.el('div', 'card solver-src');
      src.appendChild(U.el('div', 'card-title', 'Input matrix'));
      this.srcSeg = U.seg([
        ['studio-A', 'A', 'Adjacency matrix of your Studio graph'],
        ['studio-L', 'L', 'Laplacian L = D − A of your Studio graph'],
        ['studio-P', 'P', 'Random-walk matrix P = D⁻¹A of your Studio graph'],
        ['custom', '✎', 'Type or paste any matrix']
      ], this.source, v => { this.source = v; this.refresh(); });
      src.appendChild(this.srcSeg);
      this.srcInfo = U.el('div', 'solver-srcinfo');
      src.appendChild(this.srcInfo);
      this.preview = U.el('div', 'solver-preview');
      src.appendChild(this.preview);
      this.customBox = U.el('div', 'solver-custom');
      this.customArea = U.el('textarea', 'mono-area');
      this.customArea.placeholder = 'One row per line, e.g.\n0 1 0\n0 0 1\n1 0 0';
      this.customArea.rows = 6;
      this.customBox.appendChild(this.customArea);
      const crow = U.el('div', 'btn-row');
      crow.appendChild(U.btn('Use matrix', 'btn btn-primary', () => this._useCustom()));
      crow.appendChild(U.btn('Copy from Studio', 'btn btn-ghost', () => {
        this.customArea.value = App.studioGraph.matrix().map(r => r.map(v => LA.fmt(v)).join(' ')).join('\n');
      }));
      this.customBox.appendChild(crow);
      this.customErr = U.el('div', 'form-err');
      this.customBox.appendChild(this.customErr);
      src.appendChild(this.customBox);

      /* ---- right: operations + result ---- */
      const right = U.el('div', 'solver-right');
      const opsCard = U.el('div', 'card');
      opsCard.appendChild(U.el('div', 'card-title', 'Operations'));
      const ops = U.el('div', 'ops-grid');
      const defs = [
        ['power', 'Mᵏ', 'matrix power — exponentiation by squaring, O(n³ log k)'],
        ['inverse', 'M⁻¹', 'inverse via LU with partial pivoting'],
        ['det', 'det M', 'determinant from LU factorization'],
        ['rank', 'rank M', 'rank from row-reduction'],
        ['trace', 'tr M', 'sum of diagonal entries'],
        ['transpose', 'Mᵀ', 'transpose (reverses every edge)'],
        ['rref', 'RREF', 'reduced row-echelon form'],
        ['normalize', '→ P', 'row-normalize into a stochastic matrix'],
        ['stationary', 'π', 'stationary distribution of the chain'],
        ['spectrum', 'eig', 'send to the Spectrum tab']
      ];
      defs.forEach(([id, label, tip]) => {
        ops.appendChild(U.btn(label, 'btn op-btn', () => this.run(id), tip));
      });
      opsCard.appendChild(ops);
      const krow = U.el('div', 'k-row');
      krow.appendChild(U.el('span', 'field-label', 'power k'));
      this.kOut = U.el('b', 'k-out', String(this.k));
      this.kSlider = U.range(0, 12, 1, this.k, v => {
        this.k = v;
        this.kOut.textContent = String(v);
        if (this.lastOp === 'power') this.run('power');
      });
      krow.appendChild(this.kSlider);
      krow.appendChild(this.kOut);
      opsCard.appendChild(krow);

      this.resultCard = U.el('div', 'card solver-result');
      this.resultCard.innerHTML = '<div class="card-title">Result</div><div class="solver-hint">Pick an operation above. Everything runs instantly, right in your browser.</div>';

      right.appendChild(opsCard);
      right.appendChild(this.resultCard);
      wrap.appendChild(src);
      wrap.appendChild(right);
      root.appendChild(wrap);
    },

    _useCustom() {
      const r = LA.parseMatrix(this.customArea.value);
      if (r.error) { this.customErr.textContent = r.error; return; }
      if (r.M.length > 30 || r.M[0].length > 30) { this.customErr.textContent = 'Capped at 30×30.'; return; }
      this.customErr.textContent = '';
      this.customM = r.M;
      this.customLabel = `custom ${r.M.length}×${r.M[0].length}`;
      this.source = 'custom';
      this.srcSeg.set('custom');
      this.refresh();
      App.toast('Custom matrix loaded.');
    },

    setMatrix(M, label) {          // called from Gallery
      this.customM = M;
      this.customLabel = label;
      this.source = 'custom';
      if (this.srcSeg) this.srcSeg.set('custom');
      this.refresh();
    },

    matrix() {
      const g = App.studioGraph;
      if (this.source === 'studio-A') return { M: g.matrix(), label: 'A — Studio adjacency' };
      if (this.source === 'studio-L') return { M: g.laplacian(), label: 'L — Studio Laplacian' };
      if (this.source === 'studio-P') {
        const { P, zeroRows } = g.transition();
        return { M: P, label: 'P — Studio random-walk matrix', zeroRows };
      }
      return { M: this.customM, label: this.customLabel };
    },

    refresh() {
      if (!this.preview) return;
      this.customBox.style.display = this.source === 'custom' ? '' : 'none';
      const { M, label, zeroRows } = this.matrix();
      if (!M || !M.length) {
        this.srcInfo.innerHTML = `<b>${label ?? 'no matrix'}</b> — empty`;
        this.preview.innerHTML = '';
        return;
      }
      const square = M.length === M[0].length;
      const bits = [`<b>${label}</b>`, `${M.length}×${M[0].length}`];
      if (square) {
        if (LA.isSymmetric(M)) bits.push('symmetric');
        if (LA.isRowStochastic(M)) bits.push(LA.isDoublyStochastic(M) ? 'doubly stochastic' : 'row-stochastic');
        if (zeroRows && zeroRows.length) bits.push(`⚠ ${zeroRows.length} zero row${zeroRows.length > 1 ? 's' : ''}`);
      }
      this.srcInfo.innerHTML = bits.join(' · ');
      MatrixUI.renderStatic(this.preview, M);
    },

    run(op) {
      const { M } = this.matrix();
      if (!M || !M.length) { App.toast('No matrix to work with yet.'); return; }
      const square = M.length === M[0].length;
      const needSquare = ['power', 'inverse', 'det', 'trace', 'stationary', 'spectrum', 'normalize'];
      if (!square && needSquare.includes(op)) { App.toast('That operation needs a square matrix.'); return; }
      this.lastOp = op;

      if (op === 'spectrum') {
        Spectrum.setMatrix(M, this.matrix().label);
        App.showTab('spectrum');
        return;
      }

      let out;
      switch (op) {
        case 'power': {
          const R = LA.matPow(M, this.k);
          const isP = LA.isRowStochastic(M);
          const is01 = M.every(r => r.every(v => v === 0 || v === 1));
          out = {
            title: `M<sup>${this.k}</sup>`, M: R,
            note: isP
              ? `Row i of P<sup>${this.k}</sup> is the distribution of the walker after ${this.k} step${this.k === 1 ? '' : 's'}, starting from state i. Watch the rows flatten toward the stationary distribution as k grows.`
              : is01
                ? `For a 0/1 adjacency matrix, entry (i, j) of A<sup>${this.k}</sup> counts the walks of length ${this.k} from node i to node j.`
                : 'Repeated application of the linear map. Computed by exponentiation-by-squaring.'
          };
          break;
        }
        case 'inverse': {
          const R = LA.inverse(M);
          out = R
            ? { title: 'M<sup>−1</sup>', M: R, note: 'M·M⁻¹ = I. Exists because det M ≠ 0.' }
            : { title: 'M<sup>−1</sup>', text: 'Singular — no inverse exists (det M = 0).', note: 'The columns are linearly dependent.' };
          break;
        }
        case 'det': {
          const d = LA.det(M);
          out = { title: 'det M', text: LA.fmt(d, 6), note: 'Product of the eigenvalues. det = 0 ⇔ singular. Computed from the LU factorization.' };
          break;
        }
        case 'rank': {
          out = { title: 'rank M', text: String(LA.rank(M)), note: 'Dimension of the column space — how many independent directions the matrix preserves.' };
          break;
        }
        case 'trace': {
          const t = LA.trace(M);
          const is01 = square && M.every(r => r.every(v => v === 0 || v === 1));
          let extra = 'Sum of diagonal entries = sum of the eigenvalues.';
          if (is01 && LA.isSymmetric(M)) {
            const A3 = LA.matPow(M, 3);
            extra += ` For this undirected graph, tr(A³)/6 = ${LA.fmt(LA.trace(A3) / 6)} — the number of triangles.`;
          }
          out = { title: 'tr M', text: LA.fmt(t, 6), note: extra };
          break;
        }
        case 'transpose': {
          out = { title: 'Mᵀ', M: LA.transpose(M), note: 'For a directed graph, transposing the adjacency matrix reverses every edge.' };
          break;
        }
        case 'rref': {
          const { R, rank } = LA.rref(M);
          out = { title: 'RREF(M)', M: R, note: `Reduced row-echelon form via Gauss–Jordan. Rank = ${rank}.` };
          break;
        }
        case 'normalize': {
          const { P, zeroRows } = LA.rowStochastic(M);
          out = {
            title: 'P = D⁻¹M', M: P,
            note: zeroRows.length
              ? `⚠ Row${zeroRows.length > 1 ? 's' : ''} ${zeroRows.map(i => i + 1).join(', ')} sum to zero and were left as zeros — the walk is absorbed there.`
              : 'Each row rescaled to sum to 1: the transition matrix of the random walk on this graph.'
          };
          break;
        }
        case 'stationary': {
          const P = LA.isRowStochastic(M) ? M : LA.rowStochastic(M).P;
          const st = LA.stationary(P);
          if (!st) { out = { title: 'π', text: 'Could not compute — the chain has no valid stationary vector.', note: '' }; break; }
          out = {
            title: 'stationary π',
            M: [st.pi],
            note: `Solves πP = π with Σπᵢ = 1 (least squares). Residual ‖πP − π‖ = ${st.residual.toExponential(1)}. ` +
              (LA.isRowStochastic(M) ? '' : 'Your matrix was row-normalized first. ') +
              'If the chain is reducible, π may not be unique; if periodic, the walk oscillates but π still balances the flow.',
            vector: true
          };
          break;
        }
      }
      this._render(out);
    },

    _render(out) {
      const rc = this.resultCard;
      rc.innerHTML = '';
      rc.appendChild(U.el('div', 'card-title', 'Result — ' + out.title));
      if (out.text != null) {
        rc.appendChild(U.el('div', 'big-scalar', out.text));
      }
      if (out.M) {
        const box = U.el('div', 'solver-preview result-mx');
        MatrixUI.renderStatic(box, out.M);
        rc.appendChild(box);
        const row = U.el('div', 'btn-row');
        row.appendChild(U.btn('Copy LaTeX', 'btn btn-ghost', async () => {
          await U.copy(LA.toLatex(out.M)); App.toast('LaTeX copied.');
        }));
        row.appendChild(U.btn('Copy CSV', 'btn btn-ghost', async () => {
          await U.copy(LA.toCSV(out.M)); App.toast('CSV copied.');
        }));
        const sq = out.M.length === out.M[0].length;
        if (sq && out.M.length <= 20 && !out.vector) {
          row.appendChild(U.btn('Open as graph →', 'btn btn-ghost', () => {
            App.adoptMatrix(out.M, out.title.replace(/<[^>]+>/g, ''));
          }));
        }
        rc.appendChild(row);
      }
      if (out.note) rc.appendChild(U.el('p', 'op-note', out.note));
    },

    onShow() { this.refresh(); }
  };

  window.Solver = S;
})();
