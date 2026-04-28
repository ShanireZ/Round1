import { Link } from "react-router";
import { ArrowRight, Home, SearchX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="space-y-6" data-testid="not-found-page">
      <div className="space-y-3">
        <Badge variant="outline">404</Badge>
        <div className="space-y-2">
          <div className="font-display text-primary text-7xl leading-none font-semibold tabular-nums">
            404
          </div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">页面不存在</h1>
          <p className="text-muted-foreground text-sm leading-6">
            这个入口可能已经归档、移动，或者链接里少了一段路径。
          </p>
        </div>
      </div>

      <div className="border-border bg-subtle/40 flex items-start gap-3 rounded-[--radius-lg] border p-4 text-sm">
        <SearchX className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <div className="text-foreground font-medium">可以继续回到 Round1</div>
          <p className="text-muted-foreground leading-6">
            如果你正在考试或刚完成提交，系统会优先恢复可继续的考试入口。
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="secondary">
          <Link to="/login">
            <Home />
            登录页
          </Link>
        </Button>
        <Button asChild>
          <Link to="/dashboard">
            回到首页
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
