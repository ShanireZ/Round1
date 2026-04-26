import { cn } from "@/lib/utils";

interface MeshGradientProps {
  className?: string;
  variant?: "hero" | "card" | "subtle";
}

export function MeshGradient({ className, variant = "hero" }: MeshGradientProps) {
  const gradients: Record<string, string> = {
    hero: "mesh-gradient-hero",
    card: "mesh-gradient-card",
    subtle: "mesh-gradient-subtle",
  };

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 select-none", gradients[variant], className)}
      aria-hidden="true"
    />
  );
}
