import type {
  BuilderRow,
  DistributionChoice,
  FitResult,
  HistoricalPayout,
  Trigger,
  TriggerType,
} from "@/types";
import { distCdf, distInv, fitBest, fitOne } from "./distributions";

export interface PricingInputs {
  mode: "targetRate" | "thresholds";
  targetNetRate?: number;
  expectedLossRatio?: number;
  thresholds?: Map<string, { entry: number; exit: number }>;
  distributionChoice?: DistributionChoice;
  triggerType?: TriggerType;
}

export interface PricingOutput {
  triggers: Trigger[];
  historical: HistoricalPayout[];
  fits: Map<string, FitResult>;
}

export function linearPayout(
  value: number,
  entry: number,
  exit: number,
  triggerType: TriggerType = "excess",
): number {
  if (triggerType === "excess") {
    // Payout when value rises: 0 at/below entry, 1 at/above exit (exit > entry)
    const lo = Math.min(entry, exit);
    const hi = Math.max(entry, exit);
    if (hi === lo) return value >= hi ? 1 : 0;
    if (value <= lo) return 0;
    if (value >= hi) return 1;
    return (value - lo) / (hi - lo);
  }
  // Deficit: payout when value falls: 0 at/above entry, 1 at/below exit (exit < entry)
  const hi = Math.max(entry, exit);
  const lo = Math.min(entry, exit);
  if (hi === lo) return value <= lo ? 1 : 0;
  if (value >= hi) return 0;
  if (value <= lo) return 1;
  return (hi - value) / (hi - lo);
}

function groupByRisk(rows: BuilderRow[]): Map<string, BuilderRow[]> {
  const m = new Map<string, BuilderRow[]>();
  for (const r of rows) {
    let arr = m.get(r.risk);
    if (!arr) {
      arr = [];
      m.set(r.risk, arr);
    }
    arr.push(r);
  }
  return m;
}

export function runPricing(
  dataset: BuilderRow[],
  input: PricingInputs,
): PricingOutput {
  const groups = groupByRisk(dataset);
  const triggers: Trigger[] = [];
  const historical: HistoricalPayout[] = [];
  const fits = new Map<string, FitResult>();
  const triggerType: TriggerType = input.triggerType ?? "excess";
  const distChoice: DistributionChoice = input.distributionChoice ?? "auto";

  for (const [risk, rows] of groups) {
    const values = rows.map((r) => r.variable);
    const fit =
      distChoice === "auto" ? fitBest(values) : fitOne(distChoice, values);
    fits.set(risk, fit);

    let entry: number;
    let exit: number;
    let pEntry: number;
    let pExit: number;

    if (input.mode === "targetRate") {
      const target = input.targetNetRate ?? 0.05;
      const lr = input.expectedLossRatio ?? 1;
      const adjusted = target * lr;
      const rPct = adjusted * 100;

      if (triggerType === "excess") {
        // Upper tail
        pEntry = (100 - 1.5 * rPct) / 100;
        pExit = (100 - 0.5 * rPct) / 100;
      } else {
        // Lower tail (deficit): entry sits at 1.5r percentile, exit deeper at 0.5r
        pEntry = (1.5 * rPct) / 100;
        pExit = (0.5 * rPct) / 100;
      }
      entry = distInv(fit, Math.min(0.9999, Math.max(0.0001, pEntry)));
      exit = distInv(fit, Math.min(0.9999, Math.max(0.0001, pExit)));
    } else {
      const t = input.thresholds?.get(risk);
      if (!t) continue;
      entry = t.entry;
      exit = t.exit;
      pEntry = distCdf(fit, entry);
      pExit = distCdf(fit, exit);
    }

    // Probability of being in the payout zone at each threshold
    const cdfEntry = distCdf(fit, entry);
    const cdfExit = distCdf(fit, exit);
    const pPayoutAtEntry =
      triggerType === "excess" ? 1 - cdfEntry : cdfEntry;
    const pPayoutAtExit =
      triggerType === "excess" ? 1 - cdfExit : cdfExit;
    const pureRate = (pPayoutAtEntry + pPayoutAtExit) / 2;

    // Historical burning cost for this risk
    let sumPayout = 0;
    for (const row of rows) {
      const p = linearPayout(row.variable, entry, exit, triggerType);
      sumPayout += p;
      historical.push({
        risk,
        coverage: row.coverage,
        variable: row.variable,
        payout: p,
      });
    }
    const bc = rows.length ? sumPayout / rows.length : 0;

    triggers.push({
      risk,
      distribution: fit.distribution,
      params: fit.params,
      fixed: fit.fixed,
      triggerType,
      entryPercentile: pEntry,
      exitPercentile: pExit,
      entry,
      exit,
      pAboveEntry: pPayoutAtEntry,
      pAboveExit: pPayoutAtExit,
      riskRate: pureRate,
      historicalBurningCost: bc,
      logLik: fit.logLik,
      aic: fit.aic,
      bic: fit.bic,
    });
  }

  triggers.sort((a, b) => a.risk.localeCompare(b.risk));
  historical.sort(
    (a, b) => a.risk.localeCompare(b.risk) || a.coverage.localeCompare(b.coverage),
  );
  return { triggers, historical, fits };
}

export function burningCostByRisk(hist: HistoricalPayout[]): Map<string, number> {
  const m = new Map<string, { sum: number; n: number }>();
  for (const h of hist) {
    const cur = m.get(h.risk) ?? { sum: 0, n: 0 };
    cur.sum += h.payout;
    cur.n += 1;
    m.set(h.risk, cur);
  }
  const out = new Map<string, number>();
  for (const [k, v] of m) out.set(k, v.n ? v.sum / v.n : 0);
  return out;
}

export function payoutByCoverage(hist: HistoricalPayout[]): Array<{
  coverage: string;
  payout: number;
}> {
  const m = new Map<string, { sum: number; n: number }>();
  for (const h of hist) {
    const cur = m.get(h.coverage) ?? { sum: 0, n: 0 };
    cur.sum += h.payout;
    cur.n += 1;
    m.set(h.coverage, cur);
  }
  return [...m.entries()]
    .map(([coverage, v]) => ({ coverage, payout: v.n ? v.sum / v.n : 0 }))
    .sort((a, b) => a.coverage.localeCompare(b.coverage));
}
