import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, Loader2, Play, Search, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader, StatCard, SectionTitle } from "@/components/PageHeader";
import { Field, SelectInput } from "@/components/Field";
import { DataTable, type Column } from "@/components/DataTable";
import { loadHistoricalData, loadMunicipalities } from "@/lib/data-loader";
import { buildDataset } from "@/utils/builder/aggregation";
import { exportBuilderDataset } from "@/lib/export";
import { useAppStore } from "@/lib/store";
import type {
  BuilderConfig,
  BuilderRow,
  CoverageAggregation,
  CoverageYearMode,
  Municipality,
  RawObservation,
  RollingStat,
} from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Parametric Builder · Parametric Quoter" },
      {
        name: "description",
        content:
          "Transform raw historical climate data into a parametric insurance pricing dataset.",
      },
      { property: "og:title", content: "Parametric Builder · Parametric Quoter" },
      {
        property: "og:description",
        content:
          "Transform raw historical climate data into a parametric insurance pricing dataset.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuilderPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const WINDOW_PRESETS = [1, 3, 5, 7, 10, 15, 20, 30, 60, 90];

function SectionCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MunicipalityPicker({
  munis,
  selected,
  setSelected,
  loading,
}: {
  munis: Municipality[];
  selected: string[];
  setSelected: (v: string[]) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    if (!q) return munis;
    const s = q.toLowerCase();
    return munis.filter(
      (m) =>
        m.nm_mun.toLowerCase().includes(s) || m.uf.toLowerCase().includes(s),
    );
  }, [munis, q]);

  const selSet = useMemo(() => new Set(selected), [selected]);
  const visibleAllSelected =
    filtered.length > 0 && filtered.every((m) => selSet.has(m.cd_mun));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded border border-input bg-background px-3 text-xs hover:border-ring"
      >
        <span className="flex items-center gap-2">
          <Search size={12} className="text-muted-foreground" />
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Select municipalities…</span>
          ) : (
            <span className="tabular-nums">
              {selected.length} selected
            </span>
          )}
        </span>
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search size={12} className="text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search municipality or UF…"
              className="h-7 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-[11px]">
            <button
              onClick={() => {
                const next = new Set(selSet);
                if (visibleAllSelected) {
                  filtered.forEach((m) => next.delete(m.cd_mun));
                } else {
                  filtered.forEach((m) => next.add(m.cd_mun));
                }
                setSelected([...next]);
              }}
              className="font-medium text-primary hover:underline"
            >
              {visibleAllSelected ? "Deselect all (filtered)" : "Select all (filtered)"}
            </button>
            <button
              onClick={() => setSelected([])}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          </div>

          <div className="max-h-64 overflow-auto py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matches.
              </div>
            ) : (
              filtered.slice(0, 400).map((m) => {
                const checked = selSet.has(m.cd_mun);
                return (
                  <button
                    key={m.cd_mun}
                    onClick={() => {
                      const next = new Set(selSet);
                      if (checked) next.delete(m.cd_mun);
                      else next.add(m.cd_mun);
                      setSelected([...next]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-muted"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      }`}
                    >
                      {checked && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{m.nm_mun}</span>
                    <span className="text-[10px] text-muted-foreground">{m.uf}</span>
                  </button>
                );
              })
            )}
            {filtered.length > 400 && (
              <div className="px-3 py-1 text-[10px] text-muted-foreground">
                Showing 400 of {filtered.length.toLocaleString()} — refine search.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>{selected.length.toLocaleString()} selected</span>
            <button
              onClick={() => setOpen(false)}
              className="font-medium text-foreground hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BuilderPage() {
  const [raw, setRaw] = useState<RawObservation[] | null>(null);
  const [munis, setMunis] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);

  const [climateVar, setClimateVar] = useState("Precipitation");
  const [covAgg, setCovAgg] = useState<CoverageAggregation>("Yearly");
  const [windowPreset, setWindowPreset] = useState<string>("30");
  const [windowCustom, setWindowCustom] = useState<number>(37);
  const [rollingStat, setRollingStat] = useState<RollingStat>("Sum");
  const [aggStat, setAggStat] = useState<RollingStat>("Sum");

  const [covStart, setCovStart] = useState(9);
  const [covEnd, setCovEnd] = useState(2);
  const [coverageYearMode, setCoverageYearMode] = useState<CoverageYearMode>("Crop");

  const [locationType, setLocationType] = useState("Municipalities");
  const [selectedMunis, setSelectedMunis] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const dataset = useAppStore((s) => s.dataset);
  const setDataset = useAppStore((s) => s.setDataset);

  useEffect(() => {
    (async () => {
      try {
        const [data, m] = await Promise.all([
          loadHistoricalData(),
          loadMunicipalities(),
        ]);
        setRaw(data);
        setMunis(m);
        if (m.length > 0) {
          setSelectedMunis(m.slice(0, 5).map((x) => x.cd_mun));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Historical dataset info (derived from raw)
  const historicalInfo = useMemo(() => {
    if (!raw || raw.length === 0) return null;
    let minY = Infinity, maxY = -Infinity;
    const muniSet = new Set<string>();
    for (const r of raw) {
      const y = r.date.getUTCFullYear();
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      muniSet.add(r.cd_mun);
    }
    return {
      minYear: minY,
      maxYear: maxY,
      years: maxY - minY + 1,
      munis: muniSet.size,
    };
  }, [raw]);

  const windowDays = useMemo(() => {
    if (windowPreset === "custom") return Math.max(1, Math.floor(windowCustom));
    return Number(windowPreset);
  }, [windowPreset, windowCustom]);

  const needsWindow = covAgg === "Fixed" || covAgg === "Rolling";
  const isRolling = covAgg === "Rolling";
  const showAggStat = covAgg !== "Rolling";

  const coveragePeriodLabel = `${MONTHS[covStart - 1]} → ${MONTHS[covEnd - 1]}`;
  const spansTwoYears = covStart > covEnd;

  const expectedRows = useMemo(() => {
    if (!historicalInfo) return 0;
    const munis = selectedMunis.length;
    if (munis === 0) return 0;
    const years = historicalInfo.years;
    // approximate days in coverage period
    const daysInCov = spansTwoYears
      ? (12 - covStart + 1 + covEnd) * 30
      : (covEnd - covStart + 1) * 30;
    switch (covAgg) {
      case "Daily":
        return munis * years * daysInCov;
      case "Monthly":
        return munis * years * (spansTwoYears ? 12 - covStart + 1 + covEnd : covEnd - covStart + 1);
      case "Yearly":
        return munis * years;
      case "Fixed":
        return munis * years * Math.max(1, Math.floor(daysInCov / windowDays));
      case "Rolling":
        return munis * years * Math.max(1, daysInCov - windowDays + 1);
    }
  }, [historicalInfo, selectedMunis.length, covAgg, covStart, covEnd, spansTwoYears, windowDays]);

  const rollingLabel = isRolling ? `${windowDays}-day Rolling ${rollingStat}` : null;

  const handleGenerate = () => {
    if (!raw || selectedMunis.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      const label = new Map(
        munis.map((m) => [m.cd_mun, `${m.nm_mun} (${m.uf})`]),
      );
      const config: BuilderConfig = {
        climateVariable: "Precipitation",
        coverageAggregation: covAgg,
        windowDays: needsWindow ? windowDays : undefined,
        rollingStat: isRolling ? rollingStat : undefined,
        aggregationStat: showAggStat ? aggStat : undefined,
        covStartMonth: covStart,
        covEndMonth: covEnd,
        coverageYearMode,
        municipalities: selectedMunis,
      };
      const rows = buildDataset(raw, config, label);
      setDataset(rows, config);
      setGenerating(false);
    }, 0);
  };

  const summary = useMemo(() => {
    if (!dataset || dataset.length === 0) return null;
    const risks = new Set(dataset.map((r) => r.risk));
    const coverages = new Set(dataset.map((r) => r.coverage));
    const sorted = [...coverages].sort();
    const vals = dataset.map((r) => r.variable);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      obs: dataset.length,
      risks: risks.size,
      coverages: coverages.size,
      range: `${sorted[0]} – ${sorted[sorted.length - 1]}`,
      avg,
    };
  }, [dataset]);

  const columns: Column<BuilderRow>[] = [
    { key: "risk", header: "Risk" },
    { key: "coverage", header: "Coverage" },
    {
      key: "variable",
      header: "Variable",
      numeric: true,
      format: (v) => Number(v).toFixed(2),
    },
  ];

  const monthOpts = MONTHS_SHORT.map((m, i) => ({ value: String(i + 1), label: m }));
  const windowOpts = [
    ...WINDOW_PRESETS.map((n) => ({ value: String(n), label: `${n} day${n > 1 ? "s" : ""}` })),
    { value: "custom", label: "Custom…" },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Parametric Builder"
        subtitle="Design the underwriting dataset — coverage aggregation, window logic and crop-year alignment"
      />

      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left column: configuration */}
          <div className="space-y-4 lg:col-span-8">
            {/* Climate */}
            <SectionCard title="① Climate">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Climate Variable">
                  <SelectInput
                    value={climateVar}
                    onChange={setClimateVar}
                    options={[{ value: "Precipitation", label: "Precipitation" }]}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* Coverage Definition */}
            <SectionCard title="② Coverage Definition">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Coverage Aggregation">
                  <SelectInput
                    value={covAgg}
                    onChange={(v) => setCovAgg(v as CoverageAggregation)}
                    options={[
                      { value: "Daily", label: "Daily" },
                      { value: "Monthly", label: "Monthly" },
                      { value: "Yearly", label: "Yearly" },
                      { value: "Fixed", label: "Fixed Window" },
                      { value: "Rolling", label: "Rolling Window" },
                    ]}
                  />
                </Field>
                {needsWindow && (
                  <>
                    <Field label="Window Length">
                      <SelectInput
                        value={windowPreset}
                        onChange={setWindowPreset}
                        options={windowOpts}
                      />
                    </Field>
                    {windowPreset === "custom" && (
                      <Field label="Number of Days">
                        <input
                          type="number"
                          min={1}
                          value={windowCustom}
                          onChange={(e) => setWindowCustom(Number(e.target.value))}
                          className="h-8 rounded border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                        />
                      </Field>
                    )}
                  </>
                )}
                {showAggStat && (
                  <Field label="Aggregation Statistic">
                    <SelectInput
                      value={aggStat}
                      onChange={(v) => setAggStat(v as RollingStat)}
                      options={[
                        { value: "Sum", label: "Sum (Accumulated)" },
                        { value: "Mean", label: "Mean (Average)" },
                        { value: "Minimum", label: "Minimum" },
                        { value: "Maximum", label: "Maximum" },
                      ]}
                    />
                  </Field>
                )}
                {isRolling && (
                  <Field label="Rolling Statistic">
                    <SelectInput
                      value={rollingStat}
                      onChange={(v) => setRollingStat(v as RollingStat)}
                      options={[
                        { value: "Sum", label: "Sum" },
                        { value: "Mean", label: "Mean" },
                        { value: "Minimum", label: "Minimum" },
                        { value: "Maximum", label: "Maximum" },
                      ]}
                    />
                  </Field>
                )}
              </div>
              {rollingLabel && (
                <div className="mt-3 inline-flex items-center rounded bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
                  {rollingLabel}
                </div>
              )}
            </SectionCard>

            {/* Coverage Period */}
            <SectionCard title="③ Coverage Period">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Start Month">
                  <SelectInput
                    value={String(covStart)}
                    onChange={(v) => setCovStart(Number(v))}
                    options={monthOpts}
                  />
                </Field>
                <Field label="End Month">
                  <SelectInput
                    value={String(covEnd)}
                    onChange={(v) => setCovEnd(Number(v))}
                    options={monthOpts}
                  />
                </Field>
                <Field label="Coverage Year">
                  <SelectInput
                    value={coverageYearMode}
                    onChange={(v) => setCoverageYearMode(v as CoverageYearMode)}
                    options={[
                      { value: "Calendar", label: "Calendar Year" },
                      { value: "Crop", label: "Crop Year" },
                    ]}
                  />
                </Field>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {spansTwoYears
                  ? coverageYearMode === "Crop"
                    ? `Coverage spans two calendar years — Sep 2020 → Feb 2021 is labelled Crop Year 2021.`
                    : `Coverage spans two calendar years — each observation keeps its own calendar year.`
                  : `Coverage stays within a single calendar year (${MONTHS_SHORT[covStart - 1]}–${MONTHS_SHORT[covEnd - 1]}).`}
              </p>
            </SectionCard>

            {/* Insured Locations */}
            <SectionCard title="④ Insured Locations">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr]">
                <Field label="Location Type">
                  <SelectInput
                    value={locationType}
                    onChange={setLocationType}
                    options={["Municipalities", "Points", "Areas"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                </Field>
                <Field label="Municipalities">
                  <MunicipalityPicker
                    munis={munis}
                    selected={selectedMunis}
                    setSelected={setSelectedMunis}
                    loading={loading}
                  />
                </Field>
              </div>
              {selectedMunis.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {selectedMunis.slice(0, 12).map((cd) => {
                    const m = munis.find((x) => x.cd_mun === cd);
                    if (!m) return null;
                    return (
                      <span
                        key={cd}
                        className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]"
                      >
                        {m.nm_mun} <span className="text-muted-foreground">{m.uf}</span>
                        <button
                          onClick={() =>
                            setSelectedMunis(selectedMunis.filter((x) => x !== cd))
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    );
                  })}
                  {selectedMunis.length > 12 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{selectedMunis.length - 12} more
                    </span>
                  )}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right column: summary */}
          <div className="space-y-4 lg:col-span-4">
            <SectionCard title="Historical Dataset">
              {loading || !historicalInfo ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </div>
              ) : (
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-border/50 pb-1.5">
                    <dt className="text-muted-foreground">Available period</dt>
                    <dd className="font-medium tabular-nums">
                      {historicalInfo.minYear}–{historicalInfo.maxYear}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-border/50 pb-1.5">
                    <dt className="text-muted-foreground">Crop years</dt>
                    <dd className="font-medium tabular-nums">{historicalInfo.years}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Municipalities</dt>
                    <dd className="font-medium tabular-nums">
                      {historicalInfo.munis.toLocaleString()}
                    </dd>
                  </div>
                </dl>
              )}
            </SectionCard>

            <SectionCard title="Dataset Preview">
              <dl className="space-y-1.5 text-xs">
                <Row k="Selected municipalities" v={selectedMunis.length.toString()} />
                <Row k="Coverage" v={coveragePeriodLabel} />
                <Row
                  k="Coverage Year"
                  v={coverageYearMode === "Crop" ? "Crop Year" : "Calendar Year"}
                />
                <Row
                  k="Coverage Aggregation"
                  v={
                    covAgg === "Fixed"
                      ? "Fixed Window"
                      : covAgg === "Rolling"
                        ? "Rolling Window"
                        : covAgg
                  }
                />
                {needsWindow && <Row k="Window Length" v={`${windowDays} days`} />}
                {isRolling ? (
                  <Row k="Statistic" v={`Rolling ${rollingStat}`} />
                ) : (
                  <Row k="Statistic" v={aggStat} />
                )}
                <Row
                  k="Historical periods"
                  v={historicalInfo ? historicalInfo.years.toString() : "—"}
                />
                <Row
                  k="Expected output rows"
                  v={expectedRows.toLocaleString()}
                  emphasize
                />
              </dl>
              <button
                onClick={handleGenerate}
                disabled={loading || generating || selectedMunis.length === 0}
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                Generate Dataset
              </button>
            </SectionCard>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Observations" value={summary.obs.toLocaleString()} />
            <StatCard label="Risks" value={summary.risks} />
            <StatCard label="Coverages" value={summary.coverages} />
            <StatCard label="Coverage Range" value={summary.range} />
            <StatCard
              label="Avg Variable"
              value={summary.avg.toFixed(2)}
              hint={covAgg}
            />
          </div>
        )}

        {/* Dataset */}
        {dataset && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionTitle>Generated Dataset</SectionTitle>
              <button
                onClick={() => exportBuilderDataset(dataset)}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
              >
                <Download size={12} /> Export XLSX
              </button>
            </div>
            <DataTable rows={dataset} columns={columns} pageSize={20} />
          </div>
        )}

        {!dataset && !loading && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            Configure the coverage and click <strong>Generate Dataset</strong> to build
            the pricing input.
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Row({ k, v, emphasize }: { k: string; v: string; emphasize?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 pb-1 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd
        className={`tabular-nums text-right ${
          emphasize ? "font-semibold text-primary" : "font-medium"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}
