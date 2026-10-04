import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-primary sm:grid sm:place-items-center sm:p-4">
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col overflow-hidden bg-background text-foreground sm:min-h-[860px] sm:rounded-[28px] sm:ring-1 sm:ring-border">
        {children}
      </div>
    </div>
  );
}

export function StatusBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onMenu = pathname === "/menu";
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-2 font-body text-[13px] font-bold">
      <Link to={onMenu ? "/" : "/menu"} aria-label={onMenu ? "Fermer le menu" : "Menu"} className="flex items-center gap-2.5 active:opacity-60">
        <span className="flex h-11 w-11 flex-col items-center justify-center gap-[4px] rounded-md bg-primary" aria-hidden="true">
          {onMenu ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-primary-foreground">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <>
              <span className="block h-[2px] w-4 rounded-full bg-primary-foreground" />
              <span className="block h-[2px] w-4 rounded-full bg-primary-foreground" />
              <span className="block h-[2px] w-4 rounded-full bg-primary-foreground" />
            </>
          )}
        </span>
        <span className="font-display text-lg">Smart Caddie</span>
      </Link>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-3.5 rounded-[2px] bg-ink/80" />
        <span className="inline-block size-1.5 rounded-full bg-ink/80" />
        <span className="inline-block size-1.5 rounded-full bg-ink/40" />
      </span>
    </div>
  );
}
