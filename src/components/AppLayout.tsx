import { Link, useRouterState } from "@tanstack/react-router";
import { Database, LineChart, Feather } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Parametric Builder", icon: Database },
  { to: "/pricing", label: "Parametric Pricing", icon: LineChart },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="flex w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border/60">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-sidebar-primary text-sidebar-primary-foreground">
            <Feather size={16} />
          </div>
          <div className="text-sm font-semibold tracking-wide">
            PARAMETRIC QUOTER
          </div>
        </div>
        <nav className="flex-1 py-3">
          {nav.map((n) => {
            const active = path === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 px-4 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "hover:bg-sidebar-accent/60"
                }`}
              >
                <Icon size={15} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 text-[10px] text-sidebar-foreground/60 border-t border-sidebar-border/60">
          Demo · v1.0
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
