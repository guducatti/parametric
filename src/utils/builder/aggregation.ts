import type {
  BuilderConfig,
  BuilderRow,
  CoverageYearMode,
  RawObservation,
  RollingStat,
} from "@/types";

function inCoverageMonths(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

function coverageYearOf(
  y: number,
  m: number,
  startMonth: number,
  endMonth: number,
  mode: CoverageYearMode,
): number {
  if (mode === "Calendar") return y;
  if (startMonth <= endMonth) return y;
  return m >= startMonth ? y + 1 : y;
}

function applyStat(values: number[], stat: RollingStat): number {
  if (values.length === 0) return 0;
  switch (stat) {
    case "Sum":
      return values.reduce((a, b) => a + b, 0);
    case "Mean":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "Maximum":
      return Math.max(...values);
    case "Minimum":
      return Math.min(...values);
  }
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildDataset(
  raw: RawObservation[],
  config: BuilderConfig,
  muniLabel: Map<string, string>,
): BuilderRow[] {
  const munSet = new Set(config.municipalities);
  const { covStartMonth, covEndMonth, coverageYearMode, coverageAggregation } =
    config;
  const N = Math.max(1, Math.floor(config.windowDays ?? 30));
  const stat: RollingStat = config.rollingStat ?? "Sum";
  const aggStat: RollingStat = config.aggregationStat ?? "Sum";

  // Group observations by municipality → coverage-year, keeping only obs
  // whose month falls inside the coverage period.
  const byMuni = new Map<string, Map<number, RawObservation[]>>();
  for (const obs of raw) {
    if (!munSet.has(obs.cd_mun)) continue;
    const m = obs.date.getUTCMonth() + 1;
    if (!inCoverageMonths(m, covStartMonth, covEndMonth)) continue;
    const y = obs.date.getUTCFullYear();
    const cy = coverageYearOf(y, m, covStartMonth, covEndMonth, coverageYearMode);
    let byYear = byMuni.get(obs.cd_mun);
    if (!byYear) {
      byYear = new Map();
      byMuni.set(obs.cd_mun, byYear);
    }
    let arr = byYear.get(cy);
    if (!arr) {
      arr = [];
      byYear.set(cy, arr);
    }
    arr.push(obs);
  }

  const rows: BuilderRow[] = [];
  for (const [cd, byYear] of byMuni) {
    const label = muniLabel.get(cd) ?? cd;
    for (const [cy, obsList] of byYear) {
      obsList.sort((a, b) => a.date.getTime() - b.date.getTime());
      const values = obsList.map((o) => o.value);

      switch (coverageAggregation) {
        case "Daily": {
          for (const o of obsList) {
            rows.push({ risk: label, coverage: iso(o.date), variable: o.value });
          }
          break;
        }
        case "Monthly": {
          const byMonth = new Map<string, number[]>();
          for (const o of obsList) {
            const key = `${cy}-${String(o.date.getUTCMonth() + 1).padStart(2, "0")}`;
            let a = byMonth.get(key);
            if (!a) {
              a = [];
              byMonth.set(key, a);
            }
            a.push(o.value);
          }
          for (const [key, vals] of byMonth) {
            rows.push({
              risk: label,
              coverage: key,
              variable: applyStat(vals, aggStat),
            });
          }
          break;
        }
        case "Yearly": {
          rows.push({
            risk: label,
            coverage: String(cy),
            variable: applyStat(values, aggStat),
          });
          break;
        }
        case "Fixed": {
          for (let i = 0; i + N <= values.length; i += N) {
            const window = values.slice(i, i + N);
            rows.push({
              risk: label,
              coverage: `${cy}·${iso(obsList[i].date)}`,
              variable: applyStat(window, aggStat),
            });
          }
          break;
        }
        case "Rolling": {
          for (let i = 0; i + N <= values.length; i++) {
            const window = values.slice(i, i + N);
            rows.push({
              risk: label,
              coverage: `${cy}·${iso(obsList[i].date)}`,
              variable: applyStat(window, stat),
            });
          }
          break;
        }
      }
    }
  }

  rows.sort(
    (a, b) => a.risk.localeCompare(b.risk) || a.coverage.localeCompare(b.coverage),
  );
  return rows;
}
