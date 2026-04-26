import { Link } from "react-router";
import { adminNavItems } from "@/lib/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <Card variant="hero" className="overflow-hidden bg-[linear-gradient(135deg,var(--color-surface),var(--color-card),color-mix(in_oklab,var(--color-primary)_8%,white))]">
        <CardHeader>
          <CardTitle>内容运营中枢</CardTitle>
          <CardDescription>
            新的 Admin 主线围绕题库、预制卷库和导入中心展开，替代旧的 Worker 任务面板与手动出题页。
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminNavItems.map((item) => (
          <Link key={item.to} to={item.to} className="block">
            <Card variant="interactive" className="h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{item.label}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">打开 {item.label} 页面，继续内容库管理流程。</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}