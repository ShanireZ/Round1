/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { adminNavItems, getNavigationSections, primaryNavItems } from "./navigation";

const routerSource = readFileSync(new URL("../router.tsx", import.meta.url), "utf8");

describe("admin information architecture", () => {
  it("exposes the new admin content library routes", () => {
    const adminRoutes = adminNavItems.map((item) => item.to);

    expect(adminRoutes).toContain("/admin/questions");
    expect(adminRoutes).toContain("/admin/papers");
    expect(adminRoutes).toContain("/admin/imports");
    expect(adminRoutes).toContain("/admin/review");
    expect(adminRoutes).toContain("/admin/users");
    expect(adminRoutes).toContain("/admin/settings");
  });

  it("drops worker job pages from the admin navigation", () => {
    const adminRoutes = adminNavItems.map((item) => item.to);

    expect(adminRoutes).not.toContain("/admin/jobs");
    expect(adminRoutes).not.toContain("/admin/manual-gen");
  });

  it("removes legacy admin worker/manual generation compatibility routes", () => {
    expect(routerSource).not.toContain('path="/admin/jobs"');
    expect(routerSource).not.toContain('path="/admin/manual-gen"');
  });

  it("keeps the student primary navigation aligned with the UI/UX contract", () => {
    const primaryRoutes = primaryNavItems.map((item) => item.to);

    expect(primaryRoutes).toEqual([
      "/dashboard",
      "/exams/new",
      "/account/class",
      "/account/security",
    ]);
  });

  it("keeps role-aware navigation from exposing higher-privilege sections", () => {
    expect(getNavigationSections("student").map((section) => section.title)).toEqual(["主导航"]);
    expect(getNavigationSections("coach").map((section) => section.title)).toEqual([
      "主导航",
      "教练",
    ]);
    expect(getNavigationSections("admin").map((section) => section.title)).toEqual([
      "主导航",
      "教练",
      "管理",
    ]);
  });

  it("keeps the dev gallery behind the explicit dev section flag", () => {
    expect(getNavigationSections("admin").map((section) => section.title)).not.toContain(
      "开发验收",
    );
    expect(getNavigationSections("admin", true).map((section) => section.title)).toContain(
      "开发验收",
    );
  });
});
