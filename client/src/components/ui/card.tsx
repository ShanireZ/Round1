import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Card 容器 ── */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "flat" | "hero" | "stat" | "interactive";
  }
>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default:
      "bg-card text-card-foreground border border-border rounded-[--radius-lg] p-[--space-6] transition-all duration-[--duration-fast] hover:-translate-y-[1px] hover:border-foreground-secondary/20 hover:shadow-sm",
    flat: "bg-card text-card-foreground border border-border rounded-[--radius-lg] p-[--space-6]",
    hero: "bg-card text-card-foreground rounded-[--radius-xl] p-[--space-8] shadow-hero",
    stat: "bg-card text-card-foreground border border-border rounded-[--radius-lg] p-[--space-6] tabular-nums",
    interactive:
      "bg-card text-card-foreground border border-border rounded-[--radius-lg] p-[--space-6] cursor-pointer transition-all duration-[--duration-fast] hover:-translate-y-[1px] hover:border-primary/50 hover:shadow-sm active:translate-y-0",
  };

  return (
    <div
      ref={ref}
      className={cn(variants[variant], className)}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 pb-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center pt-4", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
