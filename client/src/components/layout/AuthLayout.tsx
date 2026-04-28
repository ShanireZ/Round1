import { Outlet } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { MeshGradient } from "@/components/brand/MeshGradient";
import { NoiseTexture } from "@/components/brand/NoiseTexture";
import { CPPLEARN_BANNER_SRC } from "@/lib/brand-assets";

export function AuthLayout() {
  return (
    <div className="bg-background relative isolate min-h-dvh overflow-hidden">
      <MeshGradient variant="hero" />
      <NoiseTexture />
      <div className="relative mx-auto grid min-h-dvh w-full max-w-7xl gap-8 px-4 py-6 md:grid-cols-[1.05fr_0.95fr] md:px-8 md:py-10">
        <section className="border-border flex min-h-48 flex-col justify-between border-b pb-6 md:min-h-0 md:border-r md:border-b-0 md:pr-10 md:pb-0">
          <div className="flex items-center justify-between gap-4">
            <Logo size="lg" />
            <div className="text-muted-foreground font-mono text-[10px] tracking-[0.24em] uppercase">
              Contest Ceremony
            </div>
          </div>
          <div className="max-w-2xl py-8 md:py-0">
            <div className="text-muted-foreground font-mono text-[11px] tracking-[0.26em] uppercase">
              Round1
            </div>
            <h1 className="font-display text-foreground mt-4 text-5xl leading-none font-semibold md:text-7xl">
              一次模拟，
              <br />
              一次复盘。
            </h1>
            <p className="text-foreground-secondary mt-6 max-w-xl text-base leading-8">
              面向 CSP-J/S 与 GESP 的训练入口，保留考试专注感，也保留每次成绩揭晓的仪式感。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-border bg-surface/70 flex h-10 w-36 items-center justify-center overflow-hidden rounded-[--radius-md] border p-1.5">
              <img
                src={CPPLEARN_BANNER_SRC}
                alt="CppLearn"
                className="max-h-full max-w-full object-contain"
                decoding="async"
              />
            </div>
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.22em] uppercase">
              OIDC ready
            </span>
          </div>
        </section>

        <div className="flex items-center justify-center md:justify-end">
          <div className="border-border bg-surface w-full max-w-md rounded-[--radius-xl] border p-6 shadow-[--shadow-md] sm:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
