export interface RawObservation {
  cd_mun: string;
  nm_mun: string;
  uf: string;
  date: Date;
  value: number;
}

export interface Municipality {
  cd_mun: string;
  nm_mun: string;
  uf: string;
}

export type CoverageType = "Daily" | "Weekly" | "Monthly" | "Annual";
export type Aggregation = "Accumulated" | "Average" | "Maximum" | "Minimum";
export type TriggerType = "excess" | "deficit";
export type DistributionChoice = "auto" | "Normal" | "Gamma" | "Beta";

export type CoverageAggregation =
  | "Daily"
  | "Monthly"
  | "Yearly"
  | "Fixed"
  | "Rolling";
export type RollingStat = "Sum" | "Mean" | "Minimum" | "Maximum";
export type CoverageYearMode = "Calendar" | "Crop";

export interface BuilderConfig {
  climateVariable: "Precipitation";
  coverageAggregation: CoverageAggregation;
  windowDays?: number;
  rollingStat?: RollingStat;
  aggregationStat?: RollingStat;
  covStartMonth: number;
  covEndMonth: number;
  coverageYearMode: CoverageYearMode;
  municipalities: string[];
}

export interface BuilderRow {
  risk: string;
  coverage: string;
  variable: number;
}

export type DistributionName = "Normal" | "Gamma" | "Beta";

export interface FitResult {
  distribution: DistributionName;
  params: Record<string, number>;
  fixed?: Record<string, boolean>;
  aic: number;
  bic: number;
  ks: number;
  logLik: number;
  n: number;
  min: number;
  max: number;
}

export interface Trigger {
  risk: string;
  distribution: DistributionName;
  params: Record<string, number>;
  fixed?: Record<string, boolean>;
  triggerType: TriggerType;
  entryPercentile: number;
  exitPercentile: number;
  entry: number;
  exit: number;
  pAboveEntry: number; // Probability of payout at Entry (excess: P(X>=entry), deficit: P(X<=entry))
  pAboveExit: number;  // Probability of payout at Exit
  riskRate: number;
  historicalBurningCost: number;
  logLik: number;
  aic: number;
  bic: number;
}

export interface HistoricalPayout {
  risk: string;
  coverage: string;
  variable: number;
  payout: number;
}
