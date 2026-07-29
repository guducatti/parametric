import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface Column<T> {
  key: keyof T & string;
  header: string;
  numeric?: boolean;
  format?: (v: T[keyof T & string], row: T) => string;
  width?: string;
}

export function DataTable<T extends object>({
  rows,
  columns,
  pageSize = 15,
  searchable = true,
  height = "auto",
}: {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  searchable?: boolean;
  height?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) =>
      columns.some((c) =>
        String((r as Record<string, unknown>)[c.key] ?? "")
          .toLowerCase()
          .includes(s),
      ),
    );
  }, [rows, q, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="rounded-md border border-border bg-card">
      {searchable && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Filter…"
            className="h-7 w-56 rounded border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {sorted.length.toLocaleString()} rows
          </div>
        </div>
      )}
      <div className="overflow-auto" style={{ maxHeight: height }}>
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => {
                      if (sortKey === c.key)
                        setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else {
                        setSortKey(c.key);
                        setSortDir("asc");
                      }
                    }}
                    className={`cursor-pointer select-none px-3 py-2 font-medium ${
                      c.numeric ? "text-right" : "text-left"
                    }`}
                    style={{ width: c.width }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.header}
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-40" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr
                key={i}
                className="border-t border-border hover:bg-muted/40"
              >
                {columns.map((c) => {
                  const raw = (r as Record<string, unknown>)[c.key];
                  const display = c.format
                    ? c.format(raw as T[keyof T & string], r)
                    : typeof raw === "number"
                      ? raw.toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })
                      : String(raw ?? "");
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-1.5 tabular-nums ${
                        c.numeric ? "text-right" : "text-left"
                      }`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px]">
          <div className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              className="rounded border border-border bg-background px-2 py-1 hover:bg-muted disabled:opacity-40"
              disabled={page === 0}
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              className="rounded border border-border bg-background px-2 py-1 hover:bg-muted disabled:opacity-40"
              disabled={page >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
