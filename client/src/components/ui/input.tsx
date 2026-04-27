import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { error?: boolean }>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[--radius-md] border bg-surface px-3 text-sm text-foreground transition-colors duration-[--duration-fast] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[--shadow-glow] disabled:cursor-not-allowed disabled:opacity-60",
        error
            ? "border-destructive focus-visible:border-destructive focus-visible:shadow-[--shadow-destructive-glow]"
            : "border-input",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
