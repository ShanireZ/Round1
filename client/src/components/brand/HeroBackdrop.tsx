import { cn } from "@/lib/utils";

interface HeroBackdropProps {
  className?: string;
  text?: string;
}

export function HeroBackdrop({ className, text = "Round 1" }: HeroBackdropProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 select-none overflow-hidden", className)} aria-hidden="true">
      <span
        className="font-display text-stroke-current-2 text-fill-transparent absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(6rem,20vw,16rem)] font-bold uppercase tracking-tighter opacity-[0.03]"
      >
        {text}
      </span>
    </div>
  );
}
