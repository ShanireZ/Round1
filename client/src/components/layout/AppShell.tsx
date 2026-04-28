import { Outlet } from "react-router";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto" id="main-content">
          <div className="mx-auto w-full max-w-[--content-max-width] px-4 py-6 md:px-8 md:py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
