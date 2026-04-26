import * as React from "react";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  HTMLProgressElement,
  React.ComponentPropsWithoutRef<"progress"> & {
    variant?: "default" | "thin" | "exam";
  }
>(({ className, value, variant = "default", ...props }, ref) => {
  const heights = {
    default: "h-1.5",
    thin: "h-0.5",
    exam: "h-0.5",
  };
  
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);
  const clampedValue = Number.isFinite(numericValue)
    ? Math.max(0, Math.min(numericValue, 100))
    : 0;

  return (
    <progress
      ref={ref}
      className={cn("ui-progress relative block w-full overflow-hidden rounded-full bg-subtle", heights[variant], className)}
      max={100}
      value={clampedValue}
      {...props}
    />
  );
});
Progress.displayName = "Progress";

export { Progress };
