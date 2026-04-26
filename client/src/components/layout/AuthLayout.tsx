import { Outlet } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { MeshGradient } from "@/components/brand/MeshGradient";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4">
      <MeshGradient variant="subtle" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="rounded-[--radius-xl] border border-border bg-surface p-8 shadow-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
