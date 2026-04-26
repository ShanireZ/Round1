import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea"> & { error?: boolean }>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-[--radius-md] border bg-surface px-3 py-2 text-sm text-foreground transition-colors duration-[--duration-fast] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[--shadow-glow] disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-destructive focus-visible:border-destructive"
            : "border-input",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
