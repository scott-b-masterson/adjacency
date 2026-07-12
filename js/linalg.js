/* ============================================================
   Adjacency — linalg.js
   Pure linear-algebra engine. No DOM. Node-testable.
   Created for Adjacency by Scott Masterson · scott-masterson.com
   ============================================================ */
(function () {
  'use strict';
  const EPS = 1e-11;

  /* ---------------- complex numbers ---------------- */
  const C = (re, im = 0) => ({ re, im });
  const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
  const csub = (a, b) => C(a.re - b.re, a.im - b.im);
  const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  };
  const cabs = a => Math.hypot(a.re, a.im);
  const conj = a => C(a.re, -a.im);
  const cscale = (a, s) => C(a.re * s, a.im * s);
  const csqrt = a => {
    const r = cabs(a);
    if (r === 0) return C(0, 0);
    let re = Math.sqrt((r + a.re) / 2);
    let im = Math.sqrt(Math.max(0, (r - a.re) / 2));
    if (a.im < 0) im = -im;
    return C(re, im);
  };

  /* ---------------- real matrix basics ---------------- */
  const zeros = (r, c = r) => Array.from({ length: r }, () => new Array(c).fill(0));
  const identity = n => { const M = zeros(n); for (let i = 0; i < n; i++) M[i][i] = 1; return M; };
  const clone = M => M.map(row => row.slice());
  const transpose = M => {
    const r = M.length, c = M[0].length, T = zeros(c, r);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = M[i][j];
    return T;
  };
  const matMul = (A, B) => {
    const n = A.length, m = B[0].length, k = B.length, R = zeros(n, m);
    for (let i = 0; i < n; i++) {
      const Ai = A[i], Ri = R[i];
      for (let p = 0; p < k; p++) {
        const a = Ai[p];
        if (a === 0) continue;
        const Bp = B[p];
        for (let j = 0; j < m; j++) Ri[j] += a * Bp[j];
      }
    }
    return R;
  };
  const matVec = (A, v) => A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
  const vecMat = (v, A) => {
    const n = A.length, m = A[0].length, r = new Array(m).fill(0);
    for (let i = 0; i < n; i++) { const vi = v[i]; if (vi === 0) continue; for (let j = 0; j < m; j++) r[j] += vi * A[i][j]; }
    return r;
  };
  const matAdd = (A, B) => A.map((row, i) => row.map((a, j) => a + B[i][j]));
  const matScale = (A, s) => A.map(row => row.map(a => a * s));
  const trace = M => M.reduce((s, row, i) => s + row[i], 0);
  const maxAbs = M => M.reduce((m, row) => row.reduce((m2, v) => Math.max(m2, Math.abs(v)), m), 0);
  const froNorm = M => Math.sqrt(M.reduce((s, row) => s + row.reduce((s2, v) => s2 + v * v, 0), 0));
  const isSymmetric = (M, tol = 1e-9) => {
    const n = M.length;
    if (!n || M[0].length !== n) return false;
    const scale = maxAbs(M) || 1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      if (Math.abs(M[i][j] - M[j][i]) > tol * scale) return false;
    return true;
  };
  const isSquare = M => Array.isArray(M) && M.length > 0 && M.every(r => Array.isArray(r) && r.length === M.length && r.every(Number.isFinite));

  /* exponentiation by squaring — O(n^3 log k) */
  const matPow = (A, k) => {
    const n = A.length;
    if (k === 0) return identity(n);
    let base = clone(A), result = null, e = Math.floor(k);
    while (e > 0) {
      if (e & 1) result = result ? matMul(result, base) : clone(base);
      e >>= 1;
      if (e > 0) base = matMul(base, base);
    }
    return result;
  };

  /* ---------------- LU with partial pivoting ---------------- */
  function lu(A) {
    const n = A.length, M = clone(A), piv = new Array(n);
    let sign = 1, singular = false;
    for (let i = 0; i < n; i++) piv[i] = i;
    for (let k = 0; k < n; k++) {
      let p = k, best = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > best) { best = Math.abs(M[i][k]); p = i; }
      if (best < EPS) { singular = true; continue; }
      if (p !== k) { [M[p], M[k]] = [M[k], M[p]]; [piv[p], piv[k]] = [piv[k], piv[p]]; sign = -sign; }
      for (let i = k + 1; i < n; i++) {
        M[i][k] /= M[k][k];
        const f = M[i][k];
        if (f === 0) continue;
        for (let j = k + 1; j < n; j++) M[i][j] -= f * M[k][j];
      }
    }
    return { LU: M, piv, sign, singular };
  }
  function luSolve(fac, b) {
    const { LU, piv } = fac, n = LU.length;
    const x = piv.map(p => b[p]);
    for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) x[i] -= LU[i][j] * x[j];
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) x[i] -= LU[i][j] * x[j];
      x[i] /= LU[i][i];
    }
    return x;
  }
  const det = A => {
    const f = lu(A);
    if (f.singular) return 0;
    let d = f.sign;
    for (let i = 0; i < A.length; i++) d *= f.LU[i][i];
    return d;
  };
  function inverse(A) {
    const n = A.length, f = lu(A);
    if (f.singular) return null;
    const inv = zeros(n);
    for (let j = 0; j < n; j++) {
      const e = new Array(n).fill(0); e[j] = 1;
      const col = luSolve(f, e);
      for (let i = 0; i < n; i++) inv[i][j] = col[i];
    }
    return inv;
  }

  /* ---------------- RREF + rank ---------------- */
  function rref(A) {
    const M = clone(A), rows = M.length, cols = M[0].length;
    const tol = 1e-10 * Math.max(1, maxAbs(M));
    let lead = 0; const pivots = [];
    for (let r = 0; r < rows && lead < cols; r++) {
      let p = r;
      for (let i = r; i < rows; i++) if (Math.abs(M[i][lead]) > Math.abs(M[p][lead])) p = i;
      if (Math.abs(M[p][lead]) < tol) { lead++; r--; continue; }
      [M[p], M[r]] = [M[r], M[p]];
      const d = M[r][lead];
      for (let j = 0; j < cols; j++) M[r][j] /= d;
      for (let i = 0; i < rows; i++) {
        if (i === r) continue;
        const f = M[i][lead];
        if (f === 0) continue;
        for (let j = 0; j < cols; j++) M[i][j] -= f * M[r][j];
      }
      pivots.push(lead); lead++;
    }
    // clean tiny noise
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (Math.abs(M[i][j]) < 1e-10) M[i][j] = 0;
    return { R: M, rank: pivots.length, pivots };
  }
  const rank = A => rref(A).rank;

  /* ---------------- eigenvalues ----------------
     symmetric  → cyclic Jacobi (real, robust)
     general    → Hessenberg + shifted complex QR  */
  function eigSym(A) {
    const n = A.length, M = clone(A);
    const fro = froNorm(M) || 1;
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] * M[i][j];
      if (Math.sqrt(off) < 1e-12 * fro) break;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(M[p][q]) < 1e-14 * fro) continue;
        const tau = (M[q][q] - M[p][p]) / (2 * M[p][q]);
        const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t), s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = M[k][p], mkq = M[k][q];
          M[k][p] = c * mkp - s * mkq;
          M[k][q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = M[p][k], mqk = M[q][k];
          M[p][k] = c * mpk - s * mqk;
          M[q][k] = s * mpk + c * mqk;
        }
      }
    }
    const vals = [];
    for (let i = 0; i < n; i++) vals.push(C(M[i][i], 0));
    return vals;
  }

  function hessenberg(A) {
    const n = A.length, H = clone(A);
    for (let k = 0; k < n - 2; k++) {
      let norm = 0;
      for (let i = k + 1; i < n; i++) norm = Math.hypot(norm, H[i][k]);
      if (norm < EPS) continue;
      const alpha = H[k + 1][k] >= 0 ? -norm : norm;
      const v = new Array(n).fill(0);
      v[k + 1] = H[k + 1][k] - alpha;
      for (let i = k + 2; i < n; i++) v[i] = H[i][k];
      let vv = 0;
      for (let i = k + 1; i < n; i++) vv += v[i] * v[i];
      if (vv < EPS) continue;
      // H = P H P,  P = I - 2 v vᵀ / vᵀv
      for (let j = 0; j < n; j++) {           // left: rows
        let dot = 0;
        for (let i = k + 1; i < n; i++) dot += v[i] * H[i][j];
        const f = 2 * dot / vv;
        for (let i = k + 1; i < n; i++) H[i][j] -= f * v[i];
      }
      for (let i = 0; i < n; i++) {           // right: cols
        let dot = 0;
        for (let j = k + 1; j < n; j++) dot += H[i][j] * v[j];
        const f = 2 * dot / vv;
        for (let j = k + 1; j < n; j++) H[i][j] -= f * v[j];
      }
    }
    return H;
  }

  function eig2x2(a, b, c, d) { // complex entries → two complex eigenvalues
    const tr = cadd(a, d);
    const half = cscale(tr, 0.5);
    const detv = csub(cmul(a, d), cmul(b, c));
    const disc = csqrt(csub(cmul(half, half), detv));
    return [cadd(half, disc), csub(half, disc)];
  }

  function eigGeneral(A) {
    const n = A.length;
    if (n === 1) return [C(A[0][0], 0)];
    const Hr = hessenberg(A);
    const H = Hr.map(row => row.map(v => C(v, 0)));
    const eigs = [];
    const scale = maxAbs(A) || 1;
    const tol = 1e-12 * scale;
    let hi = n - 1, iter = 0, totalIter = 0, maxTotal = 500 * n;

    const subdiagSmall = k =>
      cabs(H[k][k - 1]) <= 1e-13 * (cabs(H[k - 1][k - 1]) + cabs(H[k][k]) + tol);

    while (hi >= 0 && totalIter < maxTotal) {
      if (hi === 0) { eigs.push(H[0][0]); hi--; continue; }
      if (subdiagSmall(hi)) { eigs.push(H[hi][hi]); hi--; iter = 0; continue; }
      // find lo of the active unreduced block
      let lo = hi;
      while (lo > 0 && !subdiagSmall(lo)) lo--;
      if (hi - lo === 1) { // 2×2 block: solve directly
        const [l1, l2] = eig2x2(H[lo][lo], H[lo][hi], H[hi][lo], H[hi][hi]);
        eigs.push(l1, l2);
        hi = lo - 1; iter = 0; continue;
      }
      // Wilkinson shift from trailing 2×2 (exceptional shift on stagnation)
      let mu;
      if (iter > 0 && iter % 12 === 0) {
        mu = C(H[hi][hi].re + 1.2 * cabs(H[hi][hi - 1]), H[hi][hi].im);
      } else {
        const [l1, l2] = eig2x2(H[hi - 1][hi - 1], H[hi - 1][hi], H[hi][hi - 1], H[hi][hi]);
        mu = (cabs(csub(l1, H[hi][hi])) < cabs(csub(l2, H[hi][hi]))) ? l1 : l2;
      }
      // explicit single-shift QR on block lo..hi via Givens
      for (let i = lo; i <= hi; i++) H[i][i] = csub(H[i][i], mu);
      const rots = [];
      for (let k = lo; k < hi; k++) {
        const a = H[k][k], b = H[k + 1][k];
        const r = Math.hypot(cabs(a), cabs(b));
        if (r < 1e-300) { rots.push(null); continue; }
        const ca = cscale(conj(a), 1 / r), cb = cscale(conj(b), 1 / r);
        rots.push({ ca, cb, a: cscale(a, 1 / r), b: cscale(b, 1 / r) });
        for (let j = k; j <= hi; j++) { // G · rows k,k+1
          const x = H[k][j], y = H[k + 1][j];
          H[k][j] = cadd(cmul(ca, x), cmul(cb, y));
          H[k + 1][j] = csub(cmul(rots[rots.length - 1].a, y), cmul(rots[rots.length - 1].b, x));
        }
      }
      for (let k = lo; k < hi; k++) { // · Gᴴ on cols k,k+1
        const g = rots[k - lo];
        if (!g) continue;
        const top = Math.min(k + 2, hi);
        for (let i = lo; i <= top; i++) {
          const x = H[i][k], y = H[i][k + 1];
          H[i][k] = cadd(cmul(x, conj(g.ca)), cmul(y, conj(g.cb)));
          H[i][k + 1] = csub(cmul(y, g.ca), cmul(x, g.cb));
        }
      }
      for (let i = lo; i <= hi; i++) H[i][i] = cadd(H[i][i], mu);
      iter++; totalIter++;
    }
    // bail-out: append remaining diagonal (rare)
    while (hi >= 0) { eigs.push(H[hi][hi]); hi--; }
    return eigs.map(z => C(Math.abs(z.re) < 1e-10 * (scale || 1) ? 0 : z.re,
                           Math.abs(z.im) < 1e-10 * (scale || 1) ? 0 : z.im));
  }

  function eigenvalues(A) {
    if (!isSquare(A)) return [];
    const vals = isSymmetric(A) ? eigSym(A) : eigGeneral(A);
    return vals.sort((x, y) => cabs(y) - cabs(x));
  }

  /* ---------------- stochastic helpers ---------------- */
  function rowStochastic(A) {
    const n = A.length, P = zeros(n), zeroRows = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += A[i][j];
      if (s <= EPS) { zeroRows.push(i); continue; }
      for (let j = 0; j < n; j++) P[i][j] = A[i][j] / s;
    }
    return { P, zeroRows };
  }
  const isRowStochastic = (M, tol = 1e-7) => {
    const n = M.length;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) { if (M[i][j] < -tol) return false; s += M[i][j]; }
      if (Math.abs(s - 1) > tol) return false;
    }
    return true;
  };
  const isDoublyStochastic = (M, tol = 1e-7) => isRowStochastic(M, tol) && isRowStochastic(transpose(M), tol);

  /* stationary distribution: least-squares solve of [Pᵀ−I; 1ᵀ] π = [0;1] */
  function stationary(P) {
    const n = P.length;
    const M = zeros(n + 1, n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = P[j][i] - (i === j ? 1 : 0);
    for (let j = 0; j < n; j++) M[n][j] = 1;
    const b = new Array(n + 1).fill(0); b[n] = 1;
    const Mt = transpose(M);
    const MtM = matMul(Mt, M);
    const Mtb = matVec(Mt, b);
    const f = lu(MtM);
    if (f.singular) return null;
    let pi = luSolve(f, Mtb);
    pi = pi.map(x => Math.max(0, x));
    const s = pi.reduce((a, x) => a + x, 0);
    if (s <= EPS) return null;
    pi = pi.map(x => x / s);
    const piP = vecMat(pi, P);
    const residual = Math.sqrt(pi.reduce((acc, x, i) => acc + (piP[i] - x) ** 2, 0));
    return { pi, residual };
  }

  /* random doubly-stochastic via Sinkhorn–Knopp */
  function sinkhornDS(n, rand = Math.random) {
    const M = zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = 0.1 + rand();
    for (let it = 0; it < 400; it++) {
      for (let i = 0; i < n; i++) {
        let s = 0; for (let j = 0; j < n; j++) s += M[i][j];
        for (let j = 0; j < n; j++) M[i][j] /= s;
      }
      for (let j = 0; j < n; j++) {
        let s = 0; for (let i = 0; i < n; i++) s += M[i][j];
        for (let i = 0; i < n; i++) M[i][j] /= s;
      }
    }
    return M;
  }

  /* ---------------- formatting ---------------- */
  function fmt(x, digits = 4) {
    if (!Number.isFinite(x)) return String(x);
    if (Math.abs(x) < 5e-11) return '0';
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-9 && Math.abs(r) < 1e15) return String(r);
    if (Math.abs(x) >= 1e6 || Math.abs(x) < 1e-4) return x.toExponential(2);
    return parseFloat(x.toFixed(digits)).toString();
  }
  function fmtC(z, digits = 4) {
    const re = fmt(z.re, digits), im = fmt(Math.abs(z.im), digits);
    if (im === '0') return re;
    const imPart = (im === '1' ? '' : im) + 'i';
    if (re === '0') return (z.im < 0 ? '−' : '') + imPart;
    return re + (z.im < 0 ? ' − ' : ' + ') + imPart;
  }

  /* ---------------- matrix text I/O ---------------- */
  function parseMatrix(text) {
    const rows = text.trim().split(/[\n;]+/).map(r => r.trim()).filter(Boolean)
      .map(r => r.replace(/[\[\]]/g, '').trim().split(/[,\s]+/).filter(Boolean).map(Number));
    if (!rows.length) return { error: 'No rows found.' };
    const c = rows[0].length;
    if (rows.some(r => r.length !== c)) return { error: 'Rows have different lengths.' };
    if (rows.some(r => r.some(v => !Number.isFinite(v)))) return { error: 'Non-numeric entry found.' };
    return { M: rows };
  }
  const toLatex = M =>
    '\\begin{bmatrix}\n' + M.map(r => r.map(v => fmt(v)).join(' & ')).join(' \\\\\n') + '\n\\end{bmatrix}';
  const toCSV = M => M.map(r => r.map(v => fmt(v)).join(',')).join('\n');

  const LA = {
    C, cadd, csub, cmul, cdiv, cabs, conj, csqrt,
    zeros, identity, clone, transpose, matMul, matVec, vecMat, matAdd, matScale,
    trace, maxAbs, froNorm, isSymmetric, isSquare, matPow,
    lu, luSolve, det, inverse, rref, rank,
    eigenvalues, eigSym, eigGeneral, hessenberg,
    rowStochastic, isRowStochastic, isDoublyStochastic, stationary, sinkhornDS,
    fmt, fmtC, parseMatrix, toLatex, toCSV, EPS
  };

  if (typeof window !== 'undefined') window.LA = LA;
  if (typeof module !== 'undefined' && module.exports) module.exports = LA;
})();
