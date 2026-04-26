import type { ComponentType } from "react";
import { BarChart3, BookOpen, ClipboardList, Home, Settings, Users } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
}

export const primaryNavItems: NavItem[] = [
  { to: "/", label: "首页", description: "返回主入口与管理总览", icon: Home },
  { to: "/questions", label: "题库", description: "学生侧题目浏览", icon: BookOpen },
  { to: "/exams", label: "考试", description: "考试与结果历史", icon: ClipboardList },
  { to: "/analytics", label: "数据", description: "学习统计与趋势", icon: BarChart3 },
  { to: "/admin", label: "管理", description: "内容库与导入中枢", icon: Users },
  { to: "/settings", label: "设置", description: "个人与系统设置入口", icon: Settings },
];

export const coachNavItems: NavItem[] = [
  { to: "/coach/classes", label: "班级", description: "班级与成员管理", icon: Users },
  { to: "/coach/assignments", label: "任务", description: "固定预制卷任务", icon: ClipboardList },
  { to: "/coach/report", label: "报告", description: "班级表现与热力图", icon: BarChart3 },
];

export const adminNavItems: NavItem[] = [
  {
    to: "/admin/questions",
    label: "题库管理",
    description: "题目列表、发布与归档",
    icon: BookOpen,
  },
  {
    to: "/admin/papers",
    label: "预制卷库",
    description: "预制卷详情、发布与归档",
    icon: ClipboardList,
  },
  {
    to: "/admin/imports",
    label: "导入中心",
    description: "bundle dry-run 与 apply",
    icon: BarChart3,
  },
  { to: "/admin/review", label: "审核队列", description: "真题 AI 审核流", icon: BookOpen },
  { to: "/admin/users", label: "用户管理", description: "账号与角色调整", icon: Users },
  { to: "/admin/settings", label: "系统设置", description: "运行时参数与热更新", icon: Settings },
];
