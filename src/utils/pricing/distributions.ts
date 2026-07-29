import type { DistributionName, FitResult } from "@/types";

// ---------- Numerical helpers ----------
function mean(x: number[]): number {
  return x.reduce((a, b) => a + b, 0) / x.length;
}
function variance(x: number[]): number {
  const m = mean(x);
  return x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length;
}

// Lanczos approx of ln Gamma
export function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Lower regularized incomplete gamma P(a,x) via series/continued fraction
function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  } else {
    // continued fraction for Q, then P = 1-Q
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
}

// Normal CDF via erf approximation
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
export function normalCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return x >= mu ? 1 : 0;
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}
// Inverse normal via Beasley-Springer/Moro
export function normalInv(p: number, mu: number, sigma: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number, x: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return mu + sigma * x;
}

export function gammaCdf(x: number, shape: number, scale: number): number {
  if (x <= 0) return 0;
  return gammaP(shape, x / scale);
}
export function gammaInv(p: number, shape: number, scale: number): number {
  // Bisection on gammaCdf
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0;
  let hi = Math.max(shape * scale * 10, 1);
  while (gammaCdf(hi, shape, scale) < p) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (gammaCdf(mid, shape, scale) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Beta CDF via regularized incomplete beta (continued fraction)
function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lbeta,
  ) / a;
  // Lentz
  let f = 1,
    c = 1,
    d = 0;
  for (let i = 0; i <= 200; i++) {
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) {
      const m = i / 2;
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    } else {
      const m = (i - 1) / 2;
      numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    }
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    if (Math.abs(d * c - 1) < 1e-12) break;
  }
  return front * (f - 1);
}
export function betaCdf(x: number, a: number, b: number): number {
  return betaI(a, b, x);
}
export function betaInv(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- Fitters (Method of Moments) ----------
function fitNormal(x: number[]) {
  const mu = mean(x);
  const sigma = Math.sqrt(Math.max(variance(x), 1e-12));
  return { mu, sigma };
}
function fitGamma(x: number[]) {
  const m = mean(x);
  const v = Math.max(variance(x), 1e-12);
  const shape = Math.max((m * m) / v, 1e-3);
  const scale = Math.max(v / Math.max(m, 1e-9), 1e-9);
  return { shape, scale };
}
function fitBeta(x: number[], scale: number) {
  const s = scale || 1;
  const scaled = x.map((v) => Math.min(0.9999, Math.max(0.0001, v / s)));
  const m = mean(scaled);
  const v = Math.max(variance(scaled), 1e-8);
  const common = (m * (1 - m)) / v - 1;
  const a = Math.max(m * common, 1e-3);
  const b = Math.max((1 - m) * common, 1e-3);
  return { a, b, scale: s };
}

// Log-likelihoods and KS
function normalPdf(x: number, mu: number, sigma: number): number {
  return (
    Math.exp(-0.5 * ((x - mu) / sigma) ** 2) /
    (sigma * Math.sqrt(2 * Math.PI))
  );
}
function gammaPdf(x: number, shape: number, scale: number): number {
  if (x <= 0) return 0;
  return Math.exp(
    (shape - 1) * Math.log(x) - x / scale - shape * Math.log(scale) - lnGamma(shape),
  );
}
function betaPdfScaled(x: number, a: number, b: number, min: number, max: number) {
  const range = max - min || 1;
  const z = (x - min) / range;
  if (z <= 0 || z >= 1) return 0;
  const logPdf =
    (a - 1) * Math.log(z) +
    (b - 1) * Math.log(1 - z) -
    (lnGamma(a) + lnGamma(b) - lnGamma(a + b));
  return Math.exp(logPdf) / range;
}

function ksStat(sorted: number[], cdf: (v: number) => number): number {
  const n = sorted.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const F = cdf(sorted[i]);
    d = Math.max(d, Math.abs((i + 1) / n - F), Math.abs(F - i / n));
  }
  return d;
}

function aicFrom(logLik: number, k: number): number {
  return 2 * k - 2 * logLik;
}
function bicFrom(logLik: number, k: number, n: number): number {
  return k * Math.log(Math.max(n, 1)) - 2 * logLik;
}

export interface Fitter {
  name: DistributionName;
  fit(x: number[]): FitResult;
  cdf(v: number, params: Record<string, number>): number;
  inv(p: number, params: Record<string, number>): number;
}

export const fitters: Fitter[] = [
  {
    name: "Normal",
    fit(x) {
      const sorted = [...x].sort((a, b) => a - b);
      const { mu, sigma } = fitNormal(x);
      const logLik = x.reduce(
        (a, v) => a + Math.log(Math.max(normalPdf(v, mu, sigma), 1e-300)),
        0,
      );
      const ks = ksStat(sorted, (v) => normalCdf(v, mu, sigma));
      const k = 2;
      return {
        distribution: "Normal",
        params: { mu, sigma },
        logLik,
        aic: aicFrom(logLik, k),
        bic: bicFrom(logLik, k, x.length),
        ks,
        n: x.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
    },
    cdf: (v, p) => normalCdf(v, p.mu, p.sigma),
    inv: (p, prm) => normalInv(p, prm.mu, prm.sigma),
  },
  {
    name: "Gamma",
    fit(x) {
      const sorted = [...x].sort((a, b) => a - b);
      const pos = x.map((v) => Math.max(v, 1e-6));
      const { shape, scale } = fitGamma(pos);
      const logLik = pos.reduce(
        (a, v) => a + Math.log(Math.max(gammaPdf(v, shape, scale), 1e-300)),
        0,
      );
      const ks = ksStat(sorted, (v) => gammaCdf(Math.max(v, 0), shape, scale));
      const k = 2; // loc fixed at 0
      return {
        distribution: "Gamma",
        params: { shape, scale, loc: 0 },
        fixed: { loc: true },
        logLik,
        aic: aicFrom(logLik, k),
        bic: bicFrom(logLik, k, x.length),
        ks,
        n: x.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
    },
    cdf: (v, p) => gammaCdf(Math.max(v, 0), p.shape, p.scale),
    inv: (p, prm) => gammaInv(p, prm.shape, prm.scale),
  },
  {
    name: "Beta",
    fit(x) {
      const sorted = [...x].sort((a, b) => a - b);
      const dataMax = sorted[sorted.length - 1];
      const scale = Math.max(dataMax * (1 + 1e-6), 1e-6);
      const min = 0;
      const max = scale;
      const { a, b } = fitBeta(x, scale);
      const logLik = x.reduce(
        (acc, v) =>
          acc + Math.log(Math.max(betaPdfScaled(v, a, b, min, max), 1e-300)),
        0,
      );
      const ks = ksStat(sorted, (v) => {
        return betaCdf(Math.min(0.9999999, Math.max(0, v / scale)), a, b);
      });
      const k = 2; // loc fixed at 0, scale data-derived
      return {
        distribution: "Beta",
        params: { a, b, min, max, loc: 0, scale },
        fixed: { loc: true },
        logLik,
        aic: aicFrom(logLik, k),
        bic: bicFrom(logLik, k, x.length),
        ks,
        n: x.length,
        min,
        max,
      };
    },
    cdf: (v, p) => {
      const range = p.max - p.min;
      if (range <= 0) return 0;
      return betaCdf(Math.min(0.9999999, Math.max(0, (v - p.min) / range)), p.a, p.b);
    },
    inv: (p, prm) => {
      const range = prm.max - prm.min;
      return prm.min + range * betaInv(p, prm.a, prm.b);
    },
  },
];

function fallbackFit(x: number[]): FitResult {
  return {
    distribution: "Normal",
    params: { mu: mean(x) || 0, sigma: 1 },
    logLik: 0,
    aic: 0,
    bic: 0,
    ks: 1,
    n: x.length,
    min: 0,
    max: 1,
  };
}

export function fitOne(name: DistributionName, x: number[]): FitResult {
  const clean = x.filter((v) => Number.isFinite(v));
  if (clean.length < 3) return fallbackFit(clean);
  const f = fitters.find((f) => f.name === name)!;
  try {
    return f.fit(clean);
  } catch {
    return fallbackFit(clean);
  }
}

export function fitBest(x: number[]): FitResult {
  const clean = x.filter((v) => Number.isFinite(v));
  if (clean.length < 3) return fallbackFit(clean);
  const results = fitters.map((f) => {
    try {
      return f.fit(clean);
    } catch {
      return null;
    }
  });
  const valid = results.filter((r): r is FitResult => r !== null && Number.isFinite(r.aic));
  if (valid.length === 0) return fitters[0].fit(clean);
  return valid.reduce((best, r) => (r.aic < best.aic ? r : best));
}

export function distCdf(fit: FitResult, v: number): number {
  const f = fitters.find((x) => x.name === fit.distribution)!;
  return f.cdf(v, fit.params);
}
export function distInv(fit: FitResult, p: number): number {
  const f = fitters.find((x) => x.name === fit.distribution)!;
  return f.inv(p, fit.params);
}
export function distPdf(fit: FitResult, v: number): number {
  const p = fit.params;
  if (fit.distribution === "Normal") return normalPdf(v, p.mu, p.sigma);
  if (fit.distribution === "Gamma") return gammaPdf(Math.max(v, 1e-9), p.shape, p.scale);
  return betaPdfScaled(v, p.a, p.b, p.min, p.max);
}
export function distMean(fit: FitResult): number {
  const p = fit.params;
  if (fit.distribution === "Normal") return p.mu;
  if (fit.distribution === "Gamma") return p.shape * p.scale;
  const range = p.max - p.min;
  return p.min + (p.a / (p.a + p.b)) * range;
}
export function distStd(fit: FitResult): number {
  const p = fit.params;
  if (fit.distribution === "Normal") return p.sigma;
  if (fit.distribution === "Gamma") return Math.sqrt(p.shape) * p.scale;
  const range = p.max - p.min;
  const varBeta = (p.a * p.b) / ((p.a + p.b) ** 2 * (p.a + p.b + 1));
  return Math.sqrt(varBeta) * range;
}
