import { create } from "zustand";
import type { BuilderConfig, BuilderRow } from "@/types";

interface AppState {
  dataset: BuilderRow[] | null;
  config: BuilderConfig | null;
  setDataset: (rows: BuilderRow[], config: BuilderConfig) => void;
  clearDataset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  dataset: null,
  config: null,
  setDataset: (rows, config) => set({ dataset: rows, config }),
  clearDataset: () => set({ dataset: null, config: null }),
}));
