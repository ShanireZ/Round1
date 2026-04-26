import { cn } from "@/lib/utils";

interface NoiseTextureProps {
  className?: string;
  opacity?: number;
}

/**
 * Dark mode SVG feTurbulence noise overlay.
 * Rendered via inline SVG data URI for zero network requests.
 */
export function NoiseTexture({ className, opacity = 0.03 }: NoiseTextureProps) {
  const opacityClass = opacity >= 0.05 ? "opacity-[0.05]" : opacity >= 0.04 ? "opacity-[0.04]" : opacity >= 0.02 ? "opacity-[0.03]" : "opacity-[0.01]";

  return (
    <div
      className={cn("noise-texture-bg pointer-events-none absolute inset-0 hidden select-none dark:block", opacityClass, className)}
      aria-hidden="true"
    />
  );
}
