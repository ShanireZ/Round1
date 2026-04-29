import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { error?: boolean }
>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "bg-surface text-foreground placeholder:text-muted-foreground focus-visible:border-primary flex min-h-[120px] w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)] focus-visible:shadow-[var(--shadow-glow)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        error ? "border-destructive focus-visible:border-destructive" : "border-input",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
