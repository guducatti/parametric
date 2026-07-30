import { useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Loader2, Minus, Search, X } from "lucide-react";
import type { Municipality } from "@/types";

const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia",
  RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe",
  TO: "Tocantins",
};

const ROW_H = 26;
const VIEWPORT_H = 320;
const OVERSCAN = 8;

type Row =
  | { type: "uf"; uf: string; name: string; count: number }
  | { type: "mun"; uf: string; cd: string; name: string };

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function Box({ state }: { state: "on" | "off" | "partial" }) {
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
        state === "off"
          ? "border-input bg-background"
          : "border-primary bg-primary text-primary-foreground"
      }`}
    >
      {state === "on" && <Check size={10} strokeWidth={3} />}
      {state === "partial" && <Minus size={10} strokeWidth={3} />}
    </span>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = norm(text).indexOf(norm(q));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function MunicipalityTree({
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
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selSet = useMemo(() => new Set(selected), [selected]);

  // Group by UF
  const groups = useMemo(() => {
    const map = new Map<string, Municipality[]>();
    for (const m of munis) {
      let a = map.get(m.uf);
      if (!a) {
        a = [];
        map.set(m.uf, a);
      }
      a.push(m);
    }
    for (const arr of map.values())
      arr.sort((a, b) => a.nm_mun.localeCompare(b.nm_mun, "pt-BR"));
    return [...map.entries()]
      .map(([uf, list]) => ({ uf, name: UF_NAMES[uf] ?? uf, list }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [munis]);

  // Filter
  const filtered = useMemo(() => {
    if (!q.trim()) return groups;
    const s = norm(q.trim());
    const out: typeof groups = [];
    for (const g of groups) {
      const ufMatch = norm(g.name).includes(s) || norm(g.uf) === s || norm(g.uf).includes(s);
      if (ufMatch) {
        out.push(g);
        continue;
      }
      const list = g.list.filter((m) => norm(m.nm_mun).includes(s));
      if (list.length) out.push({ ...g, list });
    }
    return out;
  }, [groups, q]);

  const searching = q.trim().length > 0;

  const rows = useMemo(() => {
    const r: Row[] = [];
    for (const g of filtered) {
      r.push({ type: "uf", uf: g.uf, name: g.name, count: g.list.length });
      if (searching || expanded.has(g.uf)) {
        for (const m of g.list)
          r.push({ type: "mun", uf: g.uf, cd: m.cd_mun, name: m.nm_mun });
      }
    }
    return r;
  }, [filtered, expanded, searching]);

  const ufState = useMemo(() => {
    const map = new Map<string, "on" | "off" | "partial">();
    for (const g of groups) {
      let n = 0;
      for (const m of g.list) if (selSet.has(m.cd_mun)) n++;
      map.set(g.uf, n === 0 ? "off" : n === g.list.length ? "on" : "partial");
    }
    return map;
  }, [groups, selSet]);

  const statesSelected = useMemo(
    () => groups.filter((g) => (ufState.get(g.uf) ?? "off") !== "off").length,
    [groups, ufState],
  );

  function toggleMun(cd: string) {
    const next = new Set(selSet);
    if (next.has(cd)) next.delete(cd);
    else next.add(cd);
    setSelected([...next]);
  }

  function toggleUf(uf: string) {
    const g = groups.find((x) => x.uf === uf);
    if (!g) return;
    const next = new Set(selSet);
    if ((ufState.get(uf) ?? "off") === "on") g.list.forEach((m) => next.delete(m.cd_mun));
    else g.list.forEach((m) => next.add(m.cd_mun));
    setSelected([...next]);
  }

  const total = rows.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN);
  const visible = rows.slice(start, end);

  const btn =
    "rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted";

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <Search size={12} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setScrollTop(0);
            scrollRef.current?.scrollTo({ top: 0 });
          }}
          placeholder="Search municipalities or states…"
          className="h-6 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex items-baseline gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground">Selected:</span>
        <span className="font-semibold tabular-nums">{statesSelected} States</span>
        <span className="text-muted-foreground">•</span>
        <span className="font-semibold tabular-nums">
          {selected.length.toLocaleString()} Municipalities
        </span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
        <button
          className={btn}
          onClick={() => setSelected(munis.map((m) => m.cd_mun))}
        >
          Select All Municipalities
        </button>
        <button className={btn} onClick={() => setSelected(munis.map((m) => m.cd_mun))}>
          Select All States
        </button>
        <button className={btn} onClick={() => setSelected([])}>
          Clear Selection
        </button>
        <button className={btn} onClick={() => setExpanded(new Set(groups.map((g) => g.uf)))}>
          Expand All
        </button>
        <button className={btn} onClick={() => setExpanded(new Set())}>
          Collapse All
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Loading municipalities…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-6 text-xs text-muted-foreground">No matches.</div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          className="overflow-auto"
          style={{ height: VIEWPORT_H }}
        >
          <div style={{ height: total * ROW_H, position: "relative" }}>
            <div style={{ transform: `translateY(${start * ROW_H}px)` }}>
              {visible.map((row) => {
                if (row.type === "uf") {
                  const st = ufState.get(row.uf) ?? "off";
                  const isOpen = searching || expanded.has(row.uf);
                  return (
                    <div
                      key={`uf-${row.uf}`}
                      style={{ height: ROW_H }}
                      className="flex items-center gap-1.5 px-2 text-xs hover:bg-muted/60"
                    >
                      <button
                        onClick={() =>
                          setExpanded((prev) => {
                            const n = new Set(prev);
                            if (n.has(row.uf)) n.delete(row.uf);
                            else n.add(row.uf);
                            return n;
                          })
                        }
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        <ChevronRight
                          size={12}
                          className={isOpen ? "rotate-90 transition-transform" : "transition-transform"}
                        />
                      </button>
                      <button
                        onClick={() => toggleUf(row.uf)}
                        className="flex flex-1 items-center gap-2 overflow-hidden text-left"
                      >
                        <Box state={st} />
                        <span className="truncate font-medium">
                          <Highlight text={row.name} q={q.trim()} />
                          <span className="ml-1 text-muted-foreground">({row.uf})</span>
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {row.count.toLocaleString()}
                        </span>
                      </button>
                    </div>
                  );
                }
                const checked = selSet.has(row.cd);
                return (
                  <button
                    key={`m-${row.cd}`}
                    onClick={() => toggleMun(row.cd)}
                    style={{ height: ROW_H }}
                    className="flex w-full items-center gap-2 pl-9 pr-3 text-left text-xs hover:bg-muted/60"
                  >
                    <Box state={checked ? "on" : "off"} />
                    <span className="truncate">
                      <Highlight text={row.name} q={q.trim()} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
