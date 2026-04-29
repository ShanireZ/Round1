import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Home,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
}

export const primaryNavItems: NavItem[] = [
  { to: "/dashboard", label: "首页", description: "最近考试与能力摘要", icon: Home },
  { to: "/exams/new", label: "出卷考试", description: "选择预制卷并开始模拟", icon: ClipboardList },
  { to: "/account/class", label: "我的班级", description: "班级邀请与任务入口", icon: Users },
  {
    to: "/account/security",
    label: "账号安全",
    description: "密码、Passkey 与 OIDC 绑定",
    icon: ShieldCheck,
  },
];

export const coachNavItems: NavItem[] = [
  { to: "/coach/classes", label: "班级", description: "班级与成员管理", icon: Users },
  { to: "/coach/assignments", label: "任务", description: "固定预制卷任务", icon: ClipboardList },
  { to: "/coach/report", label: "报告", description: "班级表现与热力图", icon: BarChart3 },
];

export const adminNavItems: NavItem[] = [
  {
    to: "/admin",
    label: "管理看板",
    description: "内容运营、导入与系统健康概览",
    icon: BarChart3,
  },
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
