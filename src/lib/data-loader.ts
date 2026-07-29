import { parquetReadObjects } from "hyparquet";
import type { RawObservation, Municipality } from "@/types";
import chuvaAsset from "@/assets/chuva.parquet.asset.json";

let cache: RawObservation[] | null = null;
let loading: Promise<RawObservation[]> | null = null;

export async function loadHistoricalData(): Promise<RawObservation[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    const res = await fetch(chuvaAsset.url);
    const buf = await res.arrayBuffer();
    const rows = (await parquetReadObjects({ file: buf })) as Array<{
      CD_MUN: string;
      NM_MUN: string;
      UF: string;
      DATA: string;
      PRECIP: number;
    }>;
    cache = rows.map((r) => ({
      cd_mun: r.CD_MUN,
      nm_mun: r.NM_MUN,
      uf: r.UF,
      date: new Date(r.DATA),
      value: r.PRECIP,
    }));
    return cache;
  })();
  return loading;
}

export async function loadMunicipalities(): Promise<Municipality[]> {
  const data = await loadHistoricalData();
  const map = new Map<string, Municipality>();
  for (const r of data) {
    if (!map.has(r.cd_mun)) {
      map.set(r.cd_mun, { cd_mun: r.cd_mun, nm_mun: r.nm_mun, uf: r.uf });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.nm_mun.localeCompare(b.nm_mun, "pt-BR"),
  );
}
