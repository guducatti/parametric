import * as XLSX from "xlsx";
import type { BuilderRow, HistoricalPayout, Trigger } from "@/types";

export function exportBuilderDataset(rows: BuilderRow[], filename = "dataset.xlsx") {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => ({ Risk: r.risk, Coverage: r.coverage, Variable: r.variable })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dataset");
  XLSX.writeFile(wb, filename);
}

function num(v: number | undefined, d = 6): number | string {
  if (v === undefined || !Number.isFinite(v)) return "";
  return Number(v.toFixed(d));
}

function triggerRow(t: Trigger) {
  const p = t.params;
  return {
    Risk: t.risk,
    "Trigger Type": t.triggerType,
    Distribution: t.distribution,
    "Normal μ": num(p.mu),
    "Normal σ": num(p.sigma),
    "Gamma Shape": num(p.shape),
    "Gamma Scale": num(p.scale),
    "Gamma Loc (fixed)": t.distribution === "Gamma" ? 0 : "",
    "Beta α": num(p.a),
    "Beta β": num(p.b),
    "Beta Loc": num(p.loc ?? p.min),
    "Beta Scale":
      p.scale !== undefined
        ? num(p.scale)
        : p.max !== undefined && p.min !== undefined
          ? num(p.max - p.min)
          : "",
    LogLikelihood: num(t.logLik, 4),
    AIC: num(t.aic, 4),
    BIC: num(t.bic, 4),
    "Entry Percentile": num(t.entryPercentile, 6),
    "Exit Percentile": num(t.exitPercentile, 6),
    Entry: num(t.entry, 4),
    Exit: num(t.exit, 4),
    "P(Payout at Entry)": num(t.pAboveEntry, 6),
    "P(Payout at Exit)": num(t.pAboveExit, 6),
    "Pure Rate": num(t.riskRate, 6),
    "Historical Burning Cost": num(t.historicalBurningCost, 6),
  };
}

export function exportPricing(
  historical: HistoricalPayout[],
  triggers: Trigger[],
  filename = "pricing.xlsx",
) {
  const ws1 = XLSX.utils.json_to_sheet(
    historical.map((r) => ({
      Risk: r.risk,
      Coverage: r.coverage,
      Variable: r.variable,
      "Historical Trigger": r.payout,
    })),
  );
  const ws2 = XLSX.utils.json_to_sheet(triggers.map(triggerRow));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Historical");
  XLSX.utils.book_append_sheet(wb, ws2, "Triggers");
  XLSX.writeFile(wb, filename);
}
