import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  History,
  Home,
  Palette,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

export type NavigationRole = "student" | "coach" | "admin" | null;

export interface NavItem {
  to: string;
  label: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const primaryNavItems: NavItem[] = [
  { to: "/dashboard", label: "首页", description: "最近考试与能力摘要", icon: Home },
  { to: "/exams/new", label: "出卷考试", description: "选择预制卷并开始模拟", icon: ClipboardList },
  {
    to: "/exams/real-papers",
    label: "历届真题",
    description: "按考试类型重做真题卷",
    icon: History,
  },
  { to: "/account/class", label: "我的班级", description: "班级邀请与任务入口", icon: Users },
  {
    to: "/account/security",
    label: "账号安全",
    description: "密码、通行密钥与外部身份",
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
    description: "内容包预演与入库",
    icon: BarChart3,
  },
  { to: "/admin/review", label: "审核队列", description: "真题差异复核", icon: BookOpen },
  { to: "/admin/users", label: "用户管理", description: "账号与角色调整", icon: Users },
  { to: "/admin/settings", label: "系统设置", description: "运行时参数与热更新", icon: Settings },
];

export const devNavItems: NavItem[] = [
  {
    to: "/dev/ui-gallery",
    label: "UI Gallery",
    description: "Token、A2UI 与组件验收面板",
    icon: Palette,
  },
];

export function canSeeCoachNav(role: NavigationRole) {
  return role === "coach" || role === "admin";
}

export function canSeeAdminNav(role: NavigationRole) {
  return role === "admin";
}

export function canAccessRole(role: NavigationRole, minimumRole: Exclude<NavigationRole, null>) {
  const rank: Record<Exclude<NavigationRole, null>, number> = {
    student: 0,
    coach: 1,
    admin: 2,
  };

  return role !== null && rank[role] >= rank[minimumRole];
}

export function getNavigationSections(role: NavigationRole, includeDev = false): NavSection[] {
  const sections: NavSection[] = [{ title: "主导航", items: primaryNavItems }];

  if (canSeeCoachNav(role)) {
    sections.push({ title: "教练", items: coachNavItems });
  }

  if (canSeeAdminNav(role)) {
    sections.push({ title: "管理", items: adminNavItems });
  }

  if (includeDev) {
    sections.push({ title: "开发验收", items: devNavItems });
  }

  return sections;
}
