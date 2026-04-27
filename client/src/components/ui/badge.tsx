import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[--radius-sm] px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground border border-border",
        outline: "border border-border text-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        /* OJ 语义徽章 */
        ac: "bg-success text-success-foreground",
        wa: "bg-destructive text-destructive-foreground",
        tle: "bg-warning text-warning-foreground",
        mle: "border border-warning text-warning",
        re: "border border-destructive text-destructive",
        unanswered: "border border-muted text-muted",
        saved: "border border-info text-info",
        /* 试卷类型 */
        "csp-j": "border border-info text-info",
        "csp-s": "border border-chart-5 text-chart-5",
        "gesp-low": "border border-success text-success",
        "gesp-high": "border border-warning text-warning",
        /* 难度 */
        "diff-easy": "border border-muted text-muted-foreground",
        "diff-normal": "border border-success text-success",
        "diff-hard": "border border-info text-info",
        "diff-expert": "border border-primary text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
