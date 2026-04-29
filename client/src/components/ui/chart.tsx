import * as React from "react";
import {
  ResponsiveContainer,
  type DefaultLegendContentProps,
  type TooltipContentProps,
} from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label: string;
    indicatorClassName?: string;
  }
>;

const indicatorClasses = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
] as const;

function getIndicatorClass(config: ChartConfig | undefined, key: string, index: number): string {
  return (
    config?.[key]?.indicatorClassName ??
    indicatorClasses[index % indicatorClasses.length] ??
    indicatorClasses[0]
  );
}

function getPayloadKey(item: { dataKey?: unknown; name?: unknown }, fallback: string): string {
  if (typeof item.dataKey === "string" || typeof item.dataKey === "number") {
    return String(item.dataKey);
  }
  if (typeof item.name === "string" || typeof item.name === "number") {
    return String(item.name);
  }
  return fallback;
}

export interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  summary: string;
  children: React.ReactElement;
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ title, summary, className, children, ...props }, ref) => (
    <figure className="w-full" aria-label={title}>
      <div
        ref={ref}
        className={cn("text-muted-foreground min-h-56 w-full text-xs", className)}
        {...props}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={{ width: 640, height: 240 }}
        >
          {children}
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  ),
);
ChartContainer.displayName = "ChartContainer";

type ChartTooltipContentProps = Partial<TooltipContentProps<number | string, string | number>> & {
  config?: ChartConfig;
  className?: string;
};

function ChartTooltipContent({
  active,
  payload = [],
  label,
  config,
  className,
}: ChartTooltipContentProps) {
  if (!active || payload.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-border bg-popover text-popover-foreground min-w-36 rounded-[--radius-md] border px-3 py-2 shadow-md",
        className,
      )}
    >
      {label !== undefined ? (
        <div className="text-muted-foreground mb-1.5 text-xs font-medium">{label}</div>
      ) : null}
      <div className="space-y-1.5">
        {payload.map((item, index) => {
          const key = getPayloadKey(item, String(index));
          const labelText = config?.[key]?.label ?? item.name ?? key;
          const value = Array.isArray(item.value) ? item.value.join(" - ") : item.value;

          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-[--radius-full]",
                    getIndicatorClass(config, key, index),
                  )}
                  aria-hidden
                />
                <span className="text-muted-foreground truncate text-xs">{labelText}</span>
              </div>
              <span className="text-foreground font-mono text-xs tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartLegendContent({
  payload,
  config,
  className,
}: DefaultLegendContentProps & {
  config?: ChartConfig;
  className?: string;
}) {
  if (!payload || payload.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      {payload.map((item, index) => {
        const key = getPayloadKey(item, String(index));
        const labelText = config?.[key]?.label ?? item.value ?? key;

        return (
          <div
            key={`${key}-${index}`}
            className="text-muted-foreground flex items-center gap-2 text-xs"
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-[--radius-full]",
                getIndicatorClass(config, key, index),
              )}
              aria-hidden
            />
            <span>{labelText}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegendContent, ChartTooltipContent };
