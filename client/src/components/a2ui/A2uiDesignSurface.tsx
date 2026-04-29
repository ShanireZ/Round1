import { useEffect, useState } from "react";
import { renderMarkdown } from "@a2ui/markdown-it";
import { A2uiSurface, MarkdownContext, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { type SurfaceModel } from "@a2ui/web_core/v0_9";

import {
  ROUND1_A2UI_SURFACE_ID,
  createRound1A2uiMessages,
  createRound1A2uiProcessor,
  formatRound1A2uiActionSummary,
} from "@/lib/a2ui-design-surface";
import { useTheme } from "@/lib/theme";
import { round1A2uiCatalog } from "./round1A2uiCatalog";

type Round1A2uiSurfaceModel = SurfaceModel<ReactComponentImplementation>;

export function A2uiDesignSurface() {
  const { resolvedTheme } = useTheme();
  const [lastAction, setLastAction] = useState("等待交互");
  const [surface, setSurface] = useState<Round1A2uiSurfaceModel | null>(null);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [processor] = useState(() =>
    createRound1A2uiProcessor((action) => {
      setLastAction(formatRound1A2uiActionSummary(action));
    }, round1A2uiCatalog),
  );

  useEffect(() => {
    try {
      setSurface(null);
      setSurfaceError(null);
      processor.processMessages([
        {
          version: "v0.9",
          deleteSurface: { surfaceId: ROUND1_A2UI_SURFACE_ID },
        },
      ]);
      processor.processMessages(
        createRound1A2uiMessages({
          catalog: round1A2uiCatalog,
          includeRound1Snapshot: true,
        }),
      );
      setSurface(processor.model.getSurface(ROUND1_A2UI_SURFACE_ID) ?? null);
    } catch (error) {
      setSurface(null);
      setSurfaceError(error instanceof Error ? error.message : "A2UI surface 初始化失败。");
    }
  }, [processor]);

  return (
    <div
      className={`round1-a2ui-surface ${resolvedTheme === "dark" ? "a2ui-dark" : "a2ui-light"}`}
      data-testid="round1-a2ui-surface"
    >
      <div className="border-border/70 mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <div className="text-muted-foreground font-mono text-[10px] tracking-[0.24em] uppercase">
            A2UI v0.9 package schema
          </div>
          <div className="text-foreground mt-1 text-sm font-medium">
            {surface ? "Surface ready" : "Preparing surface"}
          </div>
        </div>
        <div className="border-border/80 bg-subtle text-muted-foreground rounded-[var(--radius-md)] border px-3 py-1.5 font-mono text-[11px]">
          {lastAction}
        </div>
      </div>

      {surfaceError ? (
        <div
          role="alert"
          className="border-destructive/60 bg-subtle text-destructive rounded-[var(--radius-md)] border p-4 text-sm"
        >
          {surfaceError}
        </div>
      ) : surface ? (
        <MarkdownContext.Provider value={renderMarkdown}>
          <A2uiSurface surface={surface} />
        </MarkdownContext.Provider>
      ) : (
        <div className="border-border/70 bg-subtle text-muted-foreground rounded-[var(--radius-md)] border p-4 text-sm">
          A2UI surface 初始化中。
        </div>
      )}
    </div>
  );
}
