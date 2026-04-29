import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { error?: boolean }
>(({ className, type, error, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "bg-surface text-foreground placeholder:text-muted-foreground focus-visible:border-primary flex h-10 w-full rounded-[var(--radius-md)] border px-3 text-sm transition-colors duration-[var(--duration-fast)] file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:shadow-[var(--shadow-glow)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        error
          ? "border-destructive focus-visible:border-destructive focus-visible:shadow-[var(--shadow-destructive-glow)]"
          : "border-input",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
