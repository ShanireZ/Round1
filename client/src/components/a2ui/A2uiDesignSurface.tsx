import { useEffect, useState } from "react";
import { renderMarkdown } from "@a2ui/markdown-it";
import { A2uiSurface, MarkdownContext, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { type SurfaceModel } from "@a2ui/web_core/v0_9";

import {
  ROUND1_A2UI_MESSAGES,
  ROUND1_A2UI_SURFACE_ID,
  createRound1A2uiProcessor,
} from "@/lib/a2ui-design-surface";
import { useTheme } from "@/lib/theme";

type Round1A2uiSurfaceModel = SurfaceModel<ReactComponentImplementation>;

export function A2uiDesignSurface() {
  const { resolvedTheme } = useTheme();
  const [lastAction, setLastAction] = useState("等待交互");
  const [surface, setSurface] = useState<Round1A2uiSurfaceModel | null>(null);
  const [processor] = useState(() =>
    createRound1A2uiProcessor((action) => {
      const density =
        typeof action.context.density === "number" ? `${action.context.density}%` : "未设置";
      setLastAction(`${action.name} · ${density}`);
    }),
  );

  useEffect(() => {
    setSurface(null);
    processor.processMessages([
      {
        version: "v0.9",
        deleteSurface: { surfaceId: ROUND1_A2UI_SURFACE_ID },
      },
    ]);
    processor.processMessages(ROUND1_A2UI_MESSAGES);
    setSurface(processor.model.getSurface(ROUND1_A2UI_SURFACE_ID) ?? null);
  }, [processor]);

  return (
    <div
      className={`round1-a2ui-surface ${resolvedTheme === "dark" ? "a2ui-dark" : "a2ui-light"}`}
      data-testid="round1-a2ui-surface"
    >
      <div className="border-border/70 mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <div className="text-muted-foreground font-mono text-[10px] tracking-[0.24em] uppercase">
            A2UI v0.9
          </div>
          <div className="text-foreground mt-1 text-sm font-medium">
            {surface ? "Surface ready" : "Preparing surface"}
          </div>
        </div>
        <div className="border-border/80 bg-subtle text-muted-foreground rounded-[--radius-md] border px-3 py-1.5 font-mono text-[11px]">
          {lastAction}
        </div>
      </div>

      {surface ? (
        <MarkdownContext.Provider value={renderMarkdown}>
          <A2uiSurface surface={surface} />
        </MarkdownContext.Provider>
      ) : (
        <div className="border-border/70 bg-subtle text-muted-foreground rounded-[--radius-md] border p-4 text-sm">
          A2UI surface 初始化中。
        </div>
      )}
    </div>
  );
}
