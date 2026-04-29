import { Outlet } from "react-router";

/**
 * FocusLayout — Minimal chrome for exam taking.
 * Full viewport, no sidebar, minimal header.
 */
export function FocusLayout() {
  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <a className="skip-to-content" href="#main-content">
        跳到主要内容
      </a>
      <header className="border-border bg-surface flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="font-serif text-sm font-bold tracking-tight">R1</span>
        <div id="focus-header-portal" />
      </header>
      <main className="flex-1 overflow-hidden" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
