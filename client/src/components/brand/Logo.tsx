import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark";
}

const sizes = { sm: 24, md: 32, lg: 48 };

export function Logo({ className, size = "md", variant = "full" }: LogoProps) {
  const s = sizes[size];

  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <svg
        width={s}
        height={s}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Rounded square background */}
        <rect width="48" height="48" rx="12" fill="var(--color-primary)" />
        {/* R1 monogram */}
        <text
          x="50%"
          y="54%"
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="700"
          fontSize="22"
          fill="var(--color-primary-foreground)"
          letterSpacing="-0.02em"
        >
          R1
        </text>
      </svg>
      {variant === "full" && (
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          Round 1
        </span>
      )}
    </span>
  );
}
