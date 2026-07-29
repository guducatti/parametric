import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Play, Eraser, Wand2 } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { PageHeader, SectionTitle, StatCard } from "@/components/PageHeader";
import { Field, SelectInput } from "@/components/Field";
import { DataTable, type Column } from "@/components/DataTable";
import { useAppStore } from "@/lib/store";
import {
  burningCostByRisk,
  runPricing,
  type PricingOutput,
} from "@/utils/pricing/pricing";
import { distPdf } from "@/utils/pricing/distributions";
import { exportPricing } from "@/lib/export";
import type {
  DistributionChoice,
  DistributionName,
  HistoricalPayout,
  Trigger,
  TriggerType,
} from "@/types";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Parametric Pricing · Parametric Quoter" },
      {
        name: "description",
        content:
          "Distribution fitting, thresholds, pure rate and backtest for parametric insurance products.",
      },
      { property: "og:title", content: "Parametric Pricing" },
      {
        property: "og:description",
        content:
          "Transparent actuarial workflow for parametric pricing: distribution fitting, thresholds and backtest.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

function pct(v: number, d = 2) {
  if (!Number.isFinite(v)) return "–";
  return (v * 100).toFixed(d) + "%";
}
function num(v: number, d = 2) {
  if (!Number.isFinite(v)) return "–";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

const CHART_BLUE = "#3B82F6";
const CHART_GREEN = "#16a34a";
const CHART_YELLOW = "#eab308";
const CHART_RED = "#dc2626";
const CHART_PRIMARY = "#173F35";
const CHART_ACCENT = "#B8CC5F";

function median(arr: number[]): number {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function skewness(arr: number[], mean: number, std: number): number {
  if (arr.length < 2 || std === 0) return 0;
  const n = arr.length;
  return arr.reduce((a, v) => a + ((v - mean) / std) ** 3, 0) / n;
}
function kurtosis(arr: number[], mean: number, std: number): number {
  if (arr.length < 2 || std === 0) return 0;
  const n = arr.length;
  return arr.reduce((a, v) => a + ((v - mean) / std) ** 4, 0) / n - 3; // excess
}

// Fitted-parameter rows for a distribution
function paramRows(
  dist: DistributionName,
  p: Record<string, number>,
  fixed?: Record<string, boolean>,
): Array<{ label: string; value: string; fixed?: boolean }> {
  const fmt = (n: number, d = 4) => num(n, d);
  if (dist === "Normal") {
    return [
      { label: "Mean (μ)", value: fmt(p.mu) },
      { label: "Std. Deviation (σ)", value: fmt(p.sigma) },
    ];
  }
  if (dist === "Gamma") {
    return [
      { label: "Shape (k)", value: fmt(p.shape) },
      { label: "Scale (θ)", value: fmt(p.scale) },
      { label: "Location (loc)", value: "0", fixed: fixed?.loc ?? true },
    ];
  }
  // Beta
  const loc = p.loc ?? 0;
  const scale =
    p.scale ?? (p.max !== undefined && p.min !== undefined ? p.max - p.min : 1);
  return [
    { label: "Alpha (α)", value: fmt(p.a) },
    { label: "Beta (β)", value: fmt(p.b) },
    { label: "Scale", value: fmt(scale) },
    { label: "Location (loc)", value: fmt(loc), fixed: fixed?.loc ?? true },
  ];
}

function PricingPage() {
  const dataset = useAppStore((s) => s.dataset);
  const [mode, setMode] = useState<"targetRate" | "thresholds">("targetRate");
  const [targetRate, setTargetRate] = useState(0.05);
  const [lossRatio, setLossRatio] = useState(1);
  const [distChoice, setDistChoice] = useState<DistributionChoice>("auto");
  const [triggerType, setTriggerType] = useState<TriggerType>("excess");
  const [thresholdRows, setThresholdRows] = useState<
    { risk: string; entry: string; exit: string }[]
  >([]);
  const [thresholdSearch, setThresholdSearch] = useState("");
  const [selectedRisks, setSelectedRisks] = useState<Set<string>>(new Set());
  const [fillEntry, setFillEntry] = useState("");
  const [fillExit, setFillExit] = useState("");
  const [result, setResult] = useState<PricingOutput | null>(null);
  const [analysisRisk, setAnalysisRisk] = useState<string>("");

  // Auto-populate rows from dataset risks
  const datasetRisks = useMemo(() => {
    if (!dataset) return [] as string[];
    const s = new Set<string>();
    for (const r of dataset) s.add(r.risk);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [dataset]);

  useEffect(() => {
    setThresholdRows((prev) => {
      const byRisk = new Map(prev.map((r) => [r.risk, r]));
      return datasetRisks.map((r) => byRisk.get(r) ?? { risk: r, entry: "", exit: "" });
    });
  }, [datasetRisks]);

  const filteredRows = useMemo(() => {
    const q = thresholdSearch.trim().toLowerCase();
    if (!q) return thresholdRows;
    return thresholdRows.filter((r) => r.risk.toLowerCase().includes(q));
  }, [thresholdRows, thresholdSearch]);

  const validThresholdCount = thresholdRows.filter(
    (r) => r.entry !== "" && r.exit !== "" && Number.isFinite(Number(r.entry)) && Number.isFinite(Number(r.exit)),
  ).length;

  const updateThreshold = (risk: string, field: "entry" | "exit", value: string) => {
    setThresholdRows((prev) => prev.map((r) => (r.risk === risk ? { ...r, [field]: value } : r)));
  };

  const clearAllThresholds = () => {
    setThresholdRows((prev) => prev.map((r) => ({ ...r, entry: "", exit: "" })));
    setSelectedRisks(new Set());
  };

  const toggleSelected = (risk: string) => {
    setSelectedRisks((prev) => {
      const n = new Set(prev);
      if (n.has(risk)) n.delete(risk);
      else n.add(risk);
      return n;
    });
  };

  const toggleSelectAllVisible = () => {
    const visible = filteredRows.map((r) => r.risk);
    const allSelected = visible.every((r) => selectedRisks.has(r));
    setSelectedRisks((prev) => {
      const n = new Set(prev);
      if (allSelected) visible.forEach((r) => n.delete(r));
      else visible.forEach((r) => n.add(r));
      return n;
    });
  };

  const applyFillSelected = () => {
    const eOk = fillEntry !== "" && Number.isFinite(Number(fillEntry));
    const xOk = fillExit !== "" && Number.isFinite(Number(fillExit));
    if (!eOk && !xOk) return;
    setThresholdRows((prev) =>
      prev.map((r) =>
        selectedRisks.has(r.risk)
          ? { ...r, ...(eOk ? { entry: fillEntry } : {}), ...(xOk ? { exit: fillExit } : {}) }
          : r,
      ),
    );
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRisk: string,
    startField: "entry" | "exit",
  ) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/[\n\t]/.test(text)) return; // fall back to normal single-cell paste
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
    const startIdx = filteredRows.findIndex((r) => r.risk === startRisk);
    if (startIdx < 0) return;
    setThresholdRows((prev) => {
      const map = new Map(prev.map((r) => [r.risk, { ...r }]));
      for (let i = 0; i < lines.length; i++) {
        const target = filteredRows[startIdx + i];
        if (!target) break;
        const row = map.get(target.risk);
        if (!row) continue;
        const cols = lines[i].split("\t");
        if (startField === "entry") {
          if (cols[0] !== undefined && cols[0] !== "") row.entry = cols[0].trim();
          if (cols[1] !== undefined && cols[1] !== "") row.exit = cols[1].trim();
        } else {
          if (cols[0] !== undefined && cols[0] !== "") row.exit = cols[0].trim();
        }
      }
      return Array.from(map.values()).sort(
        (a, b) => datasetRisks.indexOf(a.risk) - datasetRisks.indexOf(b.risk),
      );
    });
  };

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const focusNext = (currentRisk: string, field: "entry" | "exit") => {
    const idx = filteredRows.findIndex((r) => r.risk === currentRisk);
    const next = filteredRows[idx + 1];
    if (!next) return;
    inputRefs.current.get(`${next.risk}:${field}`)?.focus();
  };

  const thresholdsMap = useMemo(() => {
    const m = new Map<string, { entry: number; exit: number }>();
    for (const r of thresholdRows) {
      const e = Number(r.entry);
      const x = Number(r.exit);
      if (r.entry !== "" && r.exit !== "" && Number.isFinite(e) && Number.isFinite(x)) {
        m.set(r.risk, { entry: e, exit: x });
      }
    }
    return m;
  }, [thresholdRows]);

  const handleRun = () => {
    if (!dataset) return;
    const out = runPricing(dataset, {
      mode,
      targetNetRate: targetRate,
      expectedLossRatio: lossRatio,
      thresholds: thresholdsMap,
      distributionChoice: distChoice,
      triggerType,
    });
    setResult(out);
    if (out.triggers.length && !out.triggers.find((t) => t.risk === analysisRisk)) {
      setAnalysisRisk(out.triggers[0].risk);
    }
  };


  const summary = useMemo(() => {
    if (!result || result.triggers.length === 0) return null;
    const t = result.triggers;
    const avg = (arr: number[]) =>
      arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const avgPure = avg(t.map((x) => x.riskRate));
    const avgBC = avg(t.map((x) => x.historicalBurningCost));
    return {
      nRisks: t.length,
      avgEntry: avg(t.map((x) => x.entry)),
      avgExit: avg(t.map((x) => x.exit)),
      avgPure,
      avgBC,
      diff: avgBC - avgPure,
    };
  }, [result]);

  const riskData = useMemo(() => {
    if (!result) return [];
    return result.triggers.map((t) => ({
      risk: t.risk,
      burningCost: t.historicalBurningCost,
      pureRate: t.riskRate,
    }));
  }, [result]);

  // Distribution analysis for selected risk
  const analysis = useMemo(() => {
    if (!result || !analysisRisk) return null;
    const trigger = result.triggers.find((t) => t.risk === analysisRisk);
    const fit = result.fits.get(analysisRisk);
    if (!trigger || !fit) return null;
    const values = result.historical
      .filter((h) => h.risk === analysisRisk)
      .map((h) => h.variable);
    if (!values.length) return null;

    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const varS =
      values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length || 1);
    const std = Math.sqrt(varS);
    const med = median(values);
    const skew = skewness(values, avg, std);
    const kurt = kurtosis(values, avg, std);

    // Histogram
    const nBins = Math.max(8, Math.min(24, Math.ceil(Math.sqrt(values.length))));
    const lo = Math.min(mn, trigger.entry, trigger.exit);
    const hi = Math.max(mx, trigger.entry, trigger.exit);
    const pad = (hi - lo) * 0.05 || 1;
    const start = lo - pad;
    const end = hi + pad;
    const binWidth = (end - start) / nBins;
    const bins = Array.from({ length: nBins }, (_, i) => ({
      x: start + (i + 0.5) * binWidth,
      count: 0,
      density: 0,
      pdf: 0,
    }));
    for (const v of values) {
      let idx = Math.floor((v - start) / binWidth);
      if (idx < 0) idx = 0;
      if (idx >= nBins) idx = nBins - 1;
      bins[idx].count += 1;
    }
    for (const b of bins) {
      b.density = b.count / (values.length * binWidth);
      b.pdf = Math.max(0, distPdf(fit, b.x));
    }

    return {
      trigger,
      fit,
      values,
      bins,
      stats: {
        n: values.length,
        mean: avg,
        median: med,
        std,
        variance: varS,
        cv: avg !== 0 ? std / Math.abs(avg) : 0,
        min: mn,
        max: mx,
        skew,
        kurt,
      },
    };
  }, [result, analysisRisk]);

  const triggerCols: Column<Trigger>[] = [
    { key: "risk", header: "Risk" },
    { key: "distribution", header: "Dist." },
    {
      key: "entryPercentile",
      header: "Entry %",
      numeric: true,
      format: (v) => pct(Number(v), 2),
    },
    {
      key: "exitPercentile",
      header: "Exit %",
      numeric: true,
      format: (v) => pct(Number(v), 2),
    },
    { key: "entry", header: "Entry", numeric: true, format: (v) => num(Number(v)) },
    { key: "exit", header: "Exit", numeric: true, format: (v) => num(Number(v)) },
    {
      key: "pAboveEntry",
      header: "P@Entry",
      numeric: true,
      format: (v) => pct(Number(v)),
    },
    {
      key: "pAboveExit",
      header: "P@Exit",
      numeric: true,
      format: (v) => pct(Number(v)),
    },
    {
      key: "riskRate",
      header: "Pure Rate",
      numeric: true,
      format: (v) => pct(Number(v)),
    },
    {
      key: "historicalBurningCost",
      header: "Burning Cost",
      numeric: true,
      format: (v) => pct(Number(v)),
    },
  ];

  const histCols: Column<HistoricalPayout>[] = [
    { key: "risk", header: "Risk" },
    { key: "coverage", header: "Coverage" },
    {
      key: "variable",
      header: "Variable",
      numeric: true,
      format: (v) => num(Number(v)),
    },
    {
      key: "payout",
      header: "Payout",
      numeric: true,
      format: (v) => pct(Number(v)),
    },
  ];

  if (!dataset) {
    return (
      <AppLayout>
        <PageHeader
          title="Parametric Pricing"
          subtitle="Actuarial workspace · distributions, thresholds, backtest"
        />
        <div className="p-6">
          <div className="rounded-md border border-dashed border-border p-10 text-center">
            <p className="text-sm text-foreground">No dataset available</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate one in the{" "}
              <Link
                to="/"
                className="underline underline-offset-2 text-primary"
              >
                Parametric Builder
              </Link>{" "}
              first.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const riskOptions = result
    ? result.triggers.map((t) => ({ value: t.risk, label: t.risk }))
    : [];

  return (
    <AppLayout>
      <PageHeader
        title="Parametric Pricing"
        subtitle="Distribution fitting · threshold calibration · backtest"
        right={
          result && (
            <button
              onClick={() => exportPricing(result.historical, result.triggers)}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
            >
              <Download size={12} /> Export XLSX
            </button>
          )
        }
      />

      <div className="px-6 py-4 space-y-4">
        {mode === "thresholds" && (
          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <SectionTitle>Thresholds · Editable</SectionTitle>
                <div className="text-[11px] text-muted-foreground">
                  Enter Entry &amp; Exit per Risk. Press Enter to advance, paste Excel columns directly.
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{validThresholdCount}</span>{" "}
                / {thresholdRows.length} risks ready ·{" "}
                <span className="font-semibold text-foreground">{selectedRisks.size}</span> selected
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={thresholdSearch}
                onChange={(e) => setThresholdSearch(e.target.value)}
                placeholder="Search Risk…"
                className="h-8 w-56 rounded border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  value={fillEntry}
                  onChange={(e) => setFillEntry(e.target.value)}
                  placeholder="Entry"
                  className="h-8 w-24 rounded border border-input bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  type="number"
                  step="any"
                  value={fillExit}
                  onChange={(e) => setFillExit(e.target.value)}
                  placeholder="Exit"
                  className="h-8 w-24 rounded border border-input bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={applyFillSelected}
                  disabled={selectedRisks.size === 0}
                  className="inline-flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] hover:bg-muted disabled:opacity-50"
                >
                  <Wand2 size={12} /> Fill Selected
                </button>
              </div>
              <button
                onClick={clearAllThresholds}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] hover:bg-muted"
              >
                <Eraser size={12} /> Clear All
              </button>
            </div>

            <div className="max-h-[420px] overflow-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="text-left">
                    <th className="w-8 px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all visible"
                        checked={
                          filteredRows.length > 0 &&
                          filteredRows.every((r) => selectedRisks.has(r.risk))
                        }
                        onChange={toggleSelectAllVisible}
                      />
                    </th>
                    <th className="px-2 py-2 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                      Risk
                    </th>
                    <th className="px-2 py-2 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                      Entry
                    </th>
                    <th className="px-2 py-2 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                      Exit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => {
                    const ready =
                      r.entry !== "" &&
                      r.exit !== "" &&
                      Number.isFinite(Number(r.entry)) &&
                      Number.isFinite(Number(r.exit));
                    return (
                      <tr
                        key={r.risk}
                        className={
                          i % 2 === 0 ? "bg-background" : "bg-muted/40"
                        }
                      >
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={selectedRisks.has(r.risk)}
                            onChange={() => toggleSelected(r.risk)}
                          />
                        </td>
                        <td className="px-2 py-1 font-medium text-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`inline-block h-1.5 w-1.5 rounded-full ${
                                ready ? "bg-primary" : "bg-muted-foreground/40"
                              }`}
                            />
                            {r.risk}
                          </span>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            ref={(el) => {
                              if (el) inputRefs.current.set(`${r.risk}:entry`, el);
                              else inputRefs.current.delete(`${r.risk}:entry`);
                            }}
                            type="number"
                            step="any"
                            value={r.entry}
                            onChange={(e) =>
                              updateThreshold(r.risk, "entry", e.target.value)
                            }
                            onPaste={(e) => handlePaste(e, r.risk, "entry")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusNext(r.risk, "entry");
                              }
                            }}
                            className="h-7 w-full rounded border border-input bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            ref={(el) => {
                              if (el) inputRefs.current.set(`${r.risk}:exit`, el);
                              else inputRefs.current.delete(`${r.risk}:exit`);
                            }}
                            type="number"
                            step="any"
                            value={r.exit}
                            onChange={(e) =>
                              updateThreshold(r.risk, "exit", e.target.value)
                            }
                            onPaste={(e) => handlePaste(e, r.risk, "exit")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusNext(r.risk, "exit");
                              }
                            }}
                            className="h-7 w-full rounded border border-input bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                        No risks match “{thresholdSearch}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}


        {/* Main 3-column workspace */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          {/* Left: Pricing Inputs */}
          <aside className="rounded-md border border-border bg-card p-4 space-y-4 h-fit">
            <div>
              <SectionTitle>Pricing Method</SectionTitle>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
                {(
                  [
                    ["targetRate", "Target Rate"],
                    ["thresholds", "Thresholds"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setMode(v)}
                    className={`rounded px-2 py-1.5 text-[11px] font-medium transition ${
                      mode === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "targetRate" ? (
              <>
                <Field label={`Target Net Rate — ${pct(targetRate)}`}>
                  <input
                    type="range"
                    min={0}
                    max={0.2}
                    step={0.0025}
                    value={targetRate}
                    onChange={(e) => setTargetRate(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
                <Field label={`Expected Loss Ratio — ${pct(lossRatio, 0)}`}>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.01}
                    value={lossRatio}
                    onChange={(e) => setLossRatio(Number(e.target.value))}
                    className="accent-primary"
                  />
                </Field>
                <Field label="Adjusted Pricing Rate">
                  <div className="h-8 flex items-center rounded border border-primary/40 bg-secondary/40 px-2 text-xs tabular-nums font-semibold text-primary">
                    {pct(targetRate * lossRatio)}
                  </div>
                </Field>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Enter Entry &amp; Exit values per Risk in the table below.
                Empty rows are excluded until both values are provided.
                <div className="mt-1 font-semibold text-foreground">
                  {validThresholdCount} / {thresholdRows.length} risks ready
                </div>
              </div>
            )}


            <div>
              <SectionTitle>Distribution</SectionTitle>
              <div className="grid grid-cols-2 gap-1">
                {(["auto", "Normal", "Gamma", "Beta"] as DistributionChoice[]).map(
                  (d) => (
                    <button
                      key={d}
                      onClick={() => setDistChoice(d)}
                      className={`rounded border px-2 py-1.5 text-[11px] font-medium transition ${
                        distChoice === d
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d === "auto" ? "Auto (AIC)" : d}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div>
              <SectionTitle>Trigger Type</SectionTitle>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
                {(
                  [
                    ["excess", "Excess"],
                    ["deficit", "Deficit"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setTriggerType(v)}
                    className={`rounded px-2 py-1.5 text-[11px] font-medium transition ${
                      triggerType === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleRun}
              disabled={mode === "thresholds" && validThresholdCount === 0}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Play size={14} /> Generate Pricing
            </button>
          </aside>

          {/* Center: Distribution Analysis */}
          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <SectionTitle>Distribution Analysis</SectionTitle>
                <div className="text-[11px] text-muted-foreground">
                  Historical histogram vs fitted PDF · Entry & Exit thresholds
                </div>
              </div>
              <Field label="Risk">
                <SelectInput
                  value={analysisRisk}
                  onChange={setAnalysisRisk}
                  options={
                    riskOptions.length
                      ? riskOptions
                      : [{ value: "", label: "—" }]
                  }
                />
              </Field>
            </div>

            {!analysis ? (
              <div className="rounded border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
                Run pricing to see the distribution analysis.
              </div>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-primary font-semibold">
                    {analysis.fit.distribution}
                  </span>
                  <LegendSwatch color={CHART_BLUE} label="Historical" />
                  <LegendSwatch color={CHART_GREEN} label="Fitted PDF" />
                  <LegendSwatch color={CHART_YELLOW} label="Entry" />
                  <LegendSwatch color={CHART_RED} label="Exit" />
                </div>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={analysis.bins}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        fontSize={10}
                        tickFormatter={(v: number) => v.toFixed(0)}
                      />
                      <YAxis
                        fontSize={10}
                        tickFormatter={(v: number) => v.toExponential(1)}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          typeof v === "number" ? v.toExponential(3) : v,
                          name,
                        ]}
                        labelFormatter={(l: number) =>
                          `Variable ≈ ${Number(l).toFixed(2)}`
                        }
                      />
                      <Bar
                        dataKey="density"
                        name="Historical"
                        fill={CHART_BLUE}
                        fillOpacity={0.7}
                      />
                      <Line
                        type="monotone"
                        dataKey="pdf"
                        name="Fitted PDF"
                        stroke={CHART_GREEN}
                        strokeWidth={2}
                        dot={false}
                      />
                      <ReferenceLine
                        x={analysis.trigger.entry}
                        stroke={CHART_YELLOW}
                        strokeWidth={2}
                        label={{
                          value: "Entry",
                          fill: CHART_YELLOW,
                          fontSize: 10,
                          position: "top",
                        }}
                      />
                      <ReferenceLine
                        x={analysis.trigger.exit}
                        stroke={CHART_RED}
                        strokeWidth={2}
                        label={{
                          value: "Exit",
                          fill: CHART_RED,
                          fontSize: 10,
                          position: "top",
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Fitted params + thresholds side-by-side beneath the chart */}
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoCard title="Fitted Distribution">
                    <StatRow k="Distribution" v={analysis.fit.distribution} />
                    {paramRows(
                      analysis.fit.distribution,
                      analysis.fit.params,
                      analysis.fit.fixed,
                    ).map((p) => (
                      <StatRow
                        key={p.label}
                        k={p.fixed ? `${p.label} (fixed)` : p.label}
                        v={p.value}
                        muted={p.fixed}
                      />
                    ))}
                    <StatRow k="Log-Likelihood" v={num(analysis.fit.logLik, 4)} />
                    <StatRow k="AIC" v={num(analysis.fit.aic, 4)} />
                    <StatRow k="BIC" v={num(analysis.fit.bic, 4)} />
                    <StatRow k="KS Statistic" v={num(analysis.fit.ks, 4)} />
                  </InfoCard>

                  <InfoCard title="Thresholds & Pricing">
                    <StatRow k="Trigger Type" v={analysis.trigger.triggerType} />
                    <StatRow
                      k="Entry Percentile"
                      v={pct(analysis.trigger.entryPercentile, 2)}
                    />
                    <StatRow
                      k="Exit Percentile"
                      v={pct(analysis.trigger.exitPercentile, 2)}
                    />
                    <StatRow k="Entry Value" v={num(analysis.trigger.entry)} />
                    <StatRow k="Exit Value" v={num(analysis.trigger.exit)} />
                    <StatRow
                      k="Probability at Entry"
                      v={pct(analysis.trigger.pAboveEntry)}
                    />
                    <StatRow
                      k="Probability at Exit"
                      v={pct(analysis.trigger.pAboveExit)}
                    />
                    <StatRow
                      k="Pure Rate"
                      v={pct(analysis.trigger.riskRate)}
                      highlight
                    />
                    <StatRow
                      k="Historical Burning Cost"
                      v={pct(analysis.trigger.historicalBurningCost)}
                      highlight
                    />
                  </InfoCard>
                </div>
              </>
            )}
          </section>

          {/* Right: Statistical Summary */}
          <aside className="rounded-md border border-border bg-card p-4 h-fit">
            <SectionTitle>Statistical Summary</SectionTitle>
            {!analysis ? (
              <div className="text-xs text-muted-foreground">
                Descriptive stats appear here after pricing.
              </div>
            ) : (
              <div className="space-y-1">
                <StatRow k="Sample Size" v={num(analysis.stats.n, 0)} />
                <StatRow k="Mean" v={num(analysis.stats.mean)} />
                <StatRow k="Median" v={num(analysis.stats.median)} />
                <StatRow k="Std. Deviation" v={num(analysis.stats.std)} />
                <StatRow k="Variance" v={num(analysis.stats.variance)} />
                <StatRow
                  k="Coeff. of Variation"
                  v={num(analysis.stats.cv * 100) + "%"}
                />
                <StatRow k="Minimum" v={num(analysis.stats.min)} />
                <StatRow k="Maximum" v={num(analysis.stats.max)} />
                <StatRow k="Skewness" v={num(analysis.stats.skew, 3)} />
                <StatRow k="Excess Kurtosis" v={num(analysis.stats.kurt, 3)} />
              </div>
            )}
          </aside>
        </div>

        {result && summary && (
          <>
            {/* Summary strip */}
            <section>
              <SectionTitle>Portfolio Summary</SectionTitle>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Risks" value={summary.nRisks} />
                <StatCard label="Avg Entry" value={num(summary.avgEntry)} />
                <StatCard label="Avg Exit" value={num(summary.avgExit)} />
                <StatCard label="Avg Pure Rate" value={pct(summary.avgPure)} />
                <StatCard label="Avg Burning Cost" value={pct(summary.avgBC)} />
                <StatCard
                  label="BC − Pure Rate"
                  value={pct(summary.diff)}
                  hint="Backtest gap"
                />
              </div>
            </section>

            {/* Triggers table */}
            <section>
              <SectionTitle>Triggers · All Risks</SectionTitle>
              <DataTable rows={result.triggers} columns={triggerCols} pageSize={12} />
            </section>

            {/* Charts */}
            <section>
              <SectionTitle>Backtest · Burning Cost vs Pure Rate</SectionTitle>
              <div className="rounded-md border border-border bg-card p-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis
                        dataKey="risk"
                        fontSize={10}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        fontSize={10}
                        tickFormatter={(v: number) =>
                          (v * 100).toFixed(1) + "%"
                        }
                      />
                      <Tooltip
                        formatter={(v: number) => (v * 100).toFixed(2) + "%"}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="burningCost"
                        name="Historical Burning Cost"
                        fill={CHART_PRIMARY}
                      />
                      <Bar
                        dataKey="pureRate"
                        name="Pure Rate"
                        fill={CHART_ACCENT}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Historical backtest table */}
            <section>
              <SectionTitle>Historical Backtest</SectionTitle>
              <DataTable rows={result.historical} columns={histCols} pageSize={12} />
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </div>
  );
}

function StatRow({
  k,
  v,
  muted,
  highlight,
}: {
  k: string;
  v: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt
        className={`text-[11px] ${
          muted ? "text-muted-foreground/70 italic" : "text-muted-foreground"
        }`}
      >
        {k}
      </dt>
      <dd
        className={`text-xs tabular-nums text-right ${
          highlight
            ? "font-semibold text-primary"
            : muted
              ? "text-muted-foreground italic"
              : "font-medium text-foreground"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}
