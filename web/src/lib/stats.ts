/**
 * Statistics used by the metric network, written from first principles so every number on
 * screen traces to a formula. Unit-tested against reference values in stats.test.ts.
 */

// ---------------------------------------------------------------- special functions
/** ln Γ(x), Lanczos approximation (g = 7, n = 9); |error| < 1e-13 for x > 0. */
export function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised incomplete beta I_x(a, b) by Lentz's continued fraction. */
export function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - incBeta(1 - x, b, a);
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)) / a;
  const tiny = 1e-300;
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 400; i++) {
    const m = Math.floor(i / 2);
    let num: number;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    d = Math.abs(d) < tiny ? tiny : d;
    d = 1 / d;
    c = 1 + num / c;
    c = Math.abs(c) < tiny ? tiny : c;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-14) break;
  }
  return front * (f - 1);
}

/** Student-t CDF with ν degrees of freedom. */
export function tCdf(t: number, nu: number): number {
  const x = nu / (nu + t * t);
  const tail = 0.5 * incBeta(x, nu / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** Two-sided p-value for a t statistic. */
export const tPValue = (t: number, nu: number) => (Number.isFinite(t) ? 2 * (1 - tCdf(Math.abs(t), nu)) : 0);

/** Standard normal CDF via the Chebyshev erfc approximation (Numerical Recipes), abs error < 1.2e-7. */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(z / Math.SQRT2));
  const y =
    t *
    Math.exp(
      -(z * z) / 2 - 1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 +
        t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return z >= 0 ? 1 - y / 2 : y / 2;
}

/** Standard normal quantile (Acklam's algorithm, refined by one Halley step). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let x: number;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - lo) {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Two-sided critical t value: P(|T| < t) = level. Bisection on the CDF. */
export function tCrit(nu: number, level = 0.95): number {
  const target = 1 - (1 - level) / 2;
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, nu) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- descriptive
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function pairs(x: (number | null)[], y: (number | null)[]): [number[], number[]] {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (finite(x[i]) && finite(y[i])) {
      xs.push(x[i] as number);
      ys.push(y[i] as number);
    }
  }
  return [xs, ys];
}

export const mean = (v: number[]) => v.reduce((s, a) => s + a, 0) / v.length;
export function variance(v: number[]): number {
  const m = mean(v);
  return v.reduce((s, a) => s + (a - m) ** 2, 0) / (v.length - 1);
}

// ---------------------------------------------------------------- correlation & OLS
export interface Ols {
  n: number;
  slope: number;
  intercept: number;
  seSlope: number;
  t: number;
  p: number;
  ci: [number, number];        // 95% CI of the slope
  r: number;
  r2: number;
  rCi: [number, number];       // 95% CI of r (Fisher z)
  elasticity: number;          // d ln y / d ln x at the means = slope * x̄ / ȳ
  xMean: number;
  yMean: number;
}

/** Simple OLS y = a + b x with classical standard errors. */
export function ols(xIn: (number | null)[], yIn: (number | null)[]): Ols | null {
  const [x, y] = pairs(xIn, yIn);
  const n = x.length;
  if (n < 4) return null;
  const xm = mean(x), ym = mean(y);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - xm) ** 2;
    sxy += (x[i] - xm) * (y[i] - ym);
    syy += (y[i] - ym) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  const intercept = ym - slope * xm;
  const sse = Math.max(syy - slope * sxy, 0);
  const s2 = sse / (n - 2);
  const seSlope = Math.sqrt(s2 / sxx);
  const t = seSlope === 0 ? Infinity : slope / seSlope;
  const tc = tCrit(n - 2);
  const r = sxy / Math.sqrt(sxx * syy);
  const z = Math.atanh(Math.max(Math.min(r, 0.999999), -0.999999));
  const zs = normInv(0.975) / Math.sqrt(n - 3);
  return {
    n, slope, intercept, seSlope, t, p: tPValue(t, n - 2),
    ci: [slope - tc * seSlope, slope + tc * seSlope],
    r, r2: r * r, rCi: [Math.tanh(z - zs), Math.tanh(z + zs)],
    elasticity: ym === 0 ? NaN : (slope * xm) / ym, xMean: xm, yMean: ym,
  };
}

// ---------------------------------------------------------------- logistic regression
export interface Logit {
  n: number;
  b0: number;
  b1: number;
  se1: number;
  z: number;
  p: number;
  oddsRatio: number;            // per unit of x
  ci: [number, number];         // 95% CI of the odds ratio per unit
  converged: boolean;
}

/** One-predictor logistic regression: maximum likelihood by damped Newton–Raphson (IRLS with step-halving). */
export function logistic(xIn: (number | null)[], yIn: (number | boolean | null)[]): Logit | null {
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < Math.min(xIn.length, yIn.length); i++) {
    const yi = yIn[i];
    if (finite(xIn[i]) && yi !== null && yi !== undefined) {
      x.push(xIn[i] as number);
      y.push(yi === true || yi === 1 ? 1 : 0);
    }
  }
  const n = x.length;
  if (n < 10) return null;
  const pos = y.reduce((s, a) => s + a, 0);
  if (pos === 0 || pos === n) return null;
  // Standardise x for conditioning; coefficients are mapped back at the end.
  const xm = mean(x);
  const sd = Math.sqrt(variance(x)) || 1;
  const xs = x.map((v) => (v - xm) / sd);
  const loglik = (a: number, b: number) => {
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const eta = a + b * xs[i];
      // log(1 + e^eta), computed stably
      const sp = eta > 0 ? eta + Math.log1p(Math.exp(-eta)) : Math.log1p(Math.exp(eta));
      ll += y[i] * eta - sp;
    }
    return ll;
  };
  let a = Math.log(pos / (n - pos)), b = 0;
  let ll = loglik(a, b);
  let h00 = 0, h01 = 0, h11 = 0, converged = false;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0;
    h00 = h01 = h11 = 0;
    for (let i = 0; i < n; i++) {
      const p = 1 / (1 + Math.exp(-(a + b * xs[i])));
      const w = p * (1 - p);
      g0 += y[i] - p;
      g1 += (y[i] - p) * xs[i];
      h00 += w;
      h01 += w * xs[i];
      h11 += w * xs[i] * xs[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 0)) break;
    const d0 = (h11 * g0 - h01 * g1) / det;
    const d1 = (-h01 * g0 + h00 * g1) / det;
    // Damped Newton: halve the step until the log-likelihood does not fall.
    let step = 1, na = a + d0, nb = b + d1, nll = loglik(na, nb);
    while (nll < ll - 1e-12 && step > 1e-8) {
      step /= 2;
      na = a + step * d0;
      nb = b + step * d1;
      nll = loglik(na, nb);
    }
    a = na;
    b = nb;
    const gain = nll - ll;
    ll = nll;
    if (Math.abs(step * d0) + Math.abs(step * d1) < 1e-10 || Math.abs(gain) < 1e-12) {
      converged = true;
      break;
    }
  }
  const det = h00 * h11 - h01 * h01;
  // Back to the original scale: b1 = b/sd, b0 = a − b1·x̄; Var(b1) = Var(b)/sd².
  const b1 = b / sd, b0 = a - b1 * xm;
  const se1 = Math.sqrt(h00 / det) / sd;
  const z = b1 / se1;
  const zc = normInv(0.975);
  return {
    n, b0, b1, se1, z, p: 2 * (1 - normCdf(Math.abs(z))),
    oddsRatio: Math.exp(b1), ci: [Math.exp(b1 - zc * se1), Math.exp(b1 + zc * se1)], converged,
  };
}

// ---------------------------------------------------------------- two-group comparisons
export interface RiskRatio {
  rr: number;
  ci: [number, number];
  p: number;            // two-proportion z-test, pooled
  p1: number;
  p0: number;
  n1: number;
  n0: number;
}

/** Risk ratio of an event in exposed (a of n1) vs unexposed (c of n0), log-method CI. */
export function riskRatio(a: number, n1: number, c: number, n0: number): RiskRatio | null {
  const count = (x: number) => Number.isFinite(x) && x >= 0;
  if (![a, n1, c, n0].every(count) || a > n1 || c > n0) return null;   // impossible counts: no result, not NaN
  if (n1 === 0 || n0 === 0 || a === 0 || c === 0) return null;
  const p1 = a / n1, p0 = c / n0;
  const rr = p1 / p0;
  const se = Math.sqrt(Math.max(0, 1 / a - 1 / n1 + 1 / c - 1 / n0));
  const zc = normInv(0.975);
  const pp = (a + c) / (n1 + n0);
  const variance = pp * (1 - pp) * (1 / n1 + 1 / n0);
  // Every observation in both groups had the event: the rates are identical, so there is no evidence of a difference.
  const p = variance > 0 ? 2 * (1 - normCdf(Math.abs((p1 - p0) / Math.sqrt(variance)))) : 1;
  return { rr, ci: [rr * Math.exp(-zc * se), rr * Math.exp(zc * se)], p, p1, p0, n1, n0 };
}

export interface Welch {
  diff: number;
  t: number;
  df: number;
  p: number;
  ci: [number, number];
  m1: number;
  m0: number;
}

/** Welch's unequal-variance t-test for mean(x1) − mean(x0). */
export function welch(x1: number[], x0: number[]): Welch | null {
  if (x1.length < 2 || x0.length < 2) return null;
  return welchSummary(mean(x1), variance(x1), x1.length, mean(x0), variance(x0), x0.length);
}

/** Welch's test from summary statistics (means, sample variances, counts), e.g. computed in SQL. */
export function welchSummary(m1: number, var1: number, n1: number, m0: number, var0: number, n0: number): Welch | null {
  if (n1 < 2 || n0 < 2 || ![m1, m0, var1, var0, n1, n0].every(Number.isFinite) || var1 < 0 || var0 < 0 || var1 + var0 === 0) return null;
  const v1 = var1 / n1, v0 = var0 / n0;
  const x1 = { length: n1 }, x0 = { length: n0 };
  const se = Math.sqrt(v1 + v0);
  const df = (v1 + v0) ** 2 / (v1 ** 2 / (x1.length - 1) + v0 ** 2 / (x0.length - 1));
  const t = (m1 - m0) / se;
  const tc = tCrit(df);
  return { diff: m1 - m0, t, df, p: tPValue(t, df), ci: [m1 - m0 - tc * se, m1 - m0 + tc * se], m1, m0 };
}

// ---------------------------------------------------------------- change decomposition
/**
 * Exact decomposition of the change in a product Y = Π Xᵢ between two periods:
 * Δln Y = Σ Δln Xᵢ, so each factor's share of the change is Δln Xᵢ / Δln Y (log-mean Divisia, exact).
 */
export function productDecomposition(before: number[], after: number[]) {
  const dl = before.map((b, i) => Math.log(after[i] / b));
  const total = dl.reduce((s, a) => s + a, 0);
  const yb = before.reduce((s, a) => s * a, 1), ya = after.reduce((s, a) => s * a, 1);
  // LMDI-I: contribution in Y units = L(ya, yb) * Δln Xᵢ, with L the logarithmic mean; sums exactly to ya − yb.
  const L = ya === yb ? ya : (ya - yb) / Math.log(ya / yb);
  return { contributions: dl.map((d) => L * d), totalChange: ya - yb, logChange: total };
}

/** Exact decomposition of a change in a sum: each term's change. */
export const sumDecomposition = (before: number[], after: number[]) => before.map((b, i) => after[i] - b);

/** Significance stars and a plain-language strength label. */
export function strength(p: number, r: number) {
  const a = Math.abs(r);
  const label = p >= 0.05 ? "not significant" : a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : "weak";
  const stars = p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "";
  return { label, stars };
}

// ---------------------------------------------------------------- multiple regression
export interface MultiOls {
  n: number;
  k: number;                     // predictors (excluding intercept)
  coef: number[];                // [intercept, b1..bk]
  se: number[];
  t: number[];
  p: number[];
  ci: [number, number][];
  r2: number;
  adjR2: number;
  f: number;                     // overall F statistic
}

/** Invert a small symmetric positive-definite matrix by Gauss–Jordan elimination with partial pivoting. */
export function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    for (let j = 0; j < 2 * n; j++) m[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row.slice(n));
}

/** OLS with several predictors: β = (XᵀX)⁻¹Xᵀy, Var(β) = s²(XᵀX)⁻¹. Rows with any missing value are dropped. */
export function multiOls(xs: (number | null)[][], yIn: (number | null)[]): MultiOls | null {
  const k = xs.length;
  const rows: number[][] = [], y: number[] = [];
  for (let i = 0; i < yIn.length; i++) {
    const row = [1, ...xs.map((x) => x[i])];
    if (row.every(finite) && finite(yIn[i])) {
      rows.push(row as number[]);
      y.push(yIn[i] as number);
    }
  }
  const n = rows.length, p = k + 1;
  if (n <= p + 2) return null;
  const xtx = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => rows.reduce((s, r) => s + r[a] * r[b], 0)));
  const xty = Array.from({ length: p }, (_, a) => rows.reduce((s, r, i) => s + r[a] * y[i], 0));
  const inv = invert(xtx);
  if (!inv) return null;
  const coef = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  const ym = mean(y);
  let sse = 0, sst = 0;
  rows.forEach((r, i) => {
    const fit = r.reduce((s, v, j) => s + v * coef[j], 0);
    sse += (y[i] - fit) ** 2;
    sst += (y[i] - ym) ** 2;
  });
  const df = n - p;
  if (!Number.isFinite(sst) || sst <= 1e-12) return null;
  const s2 = sse / df;
  const se = inv.map((row, j) => Math.sqrt(s2 * row[j]));
  const t = coef.map((b, j) => b / se[j]);
  const tc = tCrit(df);
  const r2 = 1 - sse / sst;
  return {
    n, k, coef, se, t, p: t.map((v) => tPValue(v, df)),
    ci: coef.map((b, j) => [b - tc * se[j], b + tc * se[j]] as [number, number]),
    r2, adjR2: 1 - (1 - r2) * (n - 1) / df, f: ((sst - sse) / k) / s2,
  };
}

