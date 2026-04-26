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
          <div className="mx-auto w-full max-w-[--layout-content-max] px-[--layout-gutter] py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
