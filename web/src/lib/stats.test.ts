import { describe, expect, it } from "vitest";
import {
  incBeta, lnGamma, logistic, multiOls, normCdf, normInv, ols, productDecomposition, riskRatio, tCrit, tPValue, welch,
} from "./stats";

// Reference values from R 4.x: lgamma, pbeta, pt, qt, pnorm, qnorm, lm, t.test.
describe("special functions", () => {
  it("lnGamma", () => expect(lnGamma(10)).toBeCloseTo(Math.log(362880), 10));
  it("incomplete beta = pbeta(0.3, 2, 5)", () => expect(incBeta(0.3, 2, 5)).toBeCloseTo(0.579825, 6));
  it("t p-value = 2*pt(-2, 10)", () => expect(tPValue(2, 10)).toBeCloseTo(0.07338803, 6));
  it("t critical = qt(.975, 10) and qt(.975, 120)", () => {
    expect(tCrit(10)).toBeCloseTo(2.228139, 5);
    expect(tCrit(120)).toBeCloseTo(1.97993, 5);
  });
  it("normal CDF and quantile", () => {
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 6);
    expect(normInv(0.001)).toBeCloseTo(-3.090232, 5);
  });
});

describe("OLS", () => {
  it("matches lm(y ~ x) on a textbook set", () => {
    const f = ols([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!;
    expect(f.slope).toBeCloseTo(0.6, 10);
    expect(f.intercept).toBeCloseTo(2.2, 10);
    expect(f.r2).toBeCloseTo(0.6, 10);
    expect(f.seSlope).toBeCloseTo(0.2828427, 6);
    expect(f.p).toBeCloseTo(0.1240, 3);
    expect(f.elasticity).toBeCloseTo((0.6 * 3) / 4, 10);
  });
  it("skips missing pairs", () => {
    expect(ols([1, 2, null, 4, 5, 6], [2, 4, 9, 8, 10, null])!.n).toBe(4);
  });
});

describe("two-group tests", () => {
  it("Welch t-test matches scipy ttest_ind(equal_var=False)", () => {
    const w = welch([1, 2, 3, 4], [2, 4, 6, 8, 10])!;
    expect(w.t).toBeCloseTo(-2.2514363, 6);
    expect(w.df).toBeCloseTo(5.5207877, 6);
    expect(w.p).toBeCloseTo(0.0691336, 6);
  });
  it("risk ratio with log-method CI", () => {
    const r = riskRatio(20, 100, 10, 100)!;
    expect(r.rr).toBeCloseTo(2, 10);
    expect(r.ci[0]).toBeCloseTo(0.98656, 4);
    expect(r.ci[1]).toBeCloseTo(4.05448, 4);
  });
});

describe("logistic regression", () => {
  it("recovers known coefficients from simulated data", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i < 40000; i++) {
      const xi = rnd() * 100;
      x.push(xi);
      y.push(rnd() < 1 / (1 + Math.exp(-(-3 + 0.05 * xi))) ? 1 : 0);
    }
    const f = logistic(x, y)!;
    expect(f.converged).toBe(true);
    expect(f.b1).toBeCloseTo(0.05, 2);
    expect(f.b0).toBeCloseTo(-3, 0);
    expect(f.ci[0]).toBeLessThan(Math.exp(0.05));
    expect(f.ci[1]).toBeGreaterThan(Math.exp(0.05));
  });
});

describe("decomposition", () => {
  it("LMDI contributions sum exactly to the change in a product", () => {
    const d = productDecomposition([0.6, 30], [0.5, 34]);
    const sum = d.contributions.reduce((s, a) => s + a, 0);
    expect(sum).toBeCloseTo(0.5 * 34 - 0.6 * 30, 10);
  });
});

describe("multiple regression", () => {
  it("recovers exact coefficients and agrees with simple OLS for one predictor", () => {
    const x1 = [1, 2, 3, 4, 5, 6, 7, 8], x2 = [2, 1, 4, 3, 6, 5, 8, 9];
    const y = x1.map((v, i) => 1 + 2 * v + 3 * x2[i]);
    const f = multiOls([x1, x2], y)!;
    expect(f.coef[0]).toBeCloseTo(1, 8);
    expect(f.coef[1]).toBeCloseTo(2, 8);
    expect(f.coef[2]).toBeCloseTo(3, 8);
    const one = multiOls([[1, 2, 3, 4, 5]], [2, 4, 5, 4, 5])!;
    const simple = ols([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!;
    expect(one.coef[1]).toBeCloseTo(simple.slope, 10);
    expect(one.se[1]).toBeCloseTo(simple.seSlope, 10);
    expect(one.p[1]).toBeCloseTo(simple.p, 10);
  });
});

describe("Welch from summary statistics", () => {
  it("equals the raw-data version", async () => {
    const { welchSummary } = await import("./stats");
    const a = [1, 2, 3, 4], b = [2, 4, 6, 8, 10];
    const raw = welch(a, b)!;
    const sum = welchSummary(2.5, 5 / 3, 4, 6, 10, 5)!;
    expect(sum.t).toBeCloseTo(raw.t, 12);
    expect(sum.p).toBeCloseTo(raw.p, 12);
  });
});

describe("logistic regression on skewed data", () => {
  it("converges where plain Newton overshoots (long right tail, rare events)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const xi = 5 + 30 * -Math.log(1 - rnd());          // exponential, mean 35 h, tail to ~300 h
      x.push(xi);
      y.push(rnd() < 1 / (1 + Math.exp(-(-5 + 0.06 * xi))) ? 1 : 0);
    }
    const f = logistic(x, y)!;
    expect(f.converged).toBe(true);
    expect(f.b1).toBeCloseTo(0.06, 2);
    expect(Number.isFinite(f.se1)).toBe(true);
  });
});



it("does not report regression statistics for a constant response", () => {
  expect(multiOls([[1, 2, 3, 4, 5, 6, 7, 8]], Array(8).fill(10))).toBeNull();
});
