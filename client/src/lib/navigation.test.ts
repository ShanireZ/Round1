import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { adminNavItems, primaryNavItems } from "./navigation";

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

  it("keeps the admin hub reachable from the primary navigation", () => {
    const primaryRoutes = primaryNavItems.map((item) => item.to);

    expect(primaryRoutes).toContain("/admin");
  });
});
