import { Outlet } from "react-router";

/**
 * FocusLayout — Minimal chrome for exam taking.
 * Full viewport, no sidebar, minimal header.
 */
export function FocusLayout() {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <span className="font-serif text-sm font-bold tracking-tight">
          R1
        </span>
        <div id="focus-header-portal" />
      </header>
      <main className="flex-1 overflow-hidden" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
