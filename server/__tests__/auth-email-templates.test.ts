import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderChallengeEmailHtml, type ChallengeFlow } from "../services/auth/emailTemplates.js";

const templateDir = resolve(import.meta.dirname, "../services/auth/templates");
const templateFiles = ["change-email.html", "register-code.html", "reset-password.html"] as const;
const renderCases: Array<{
  flow: ChallengeFlow;
  title: string;
  linkText: string;
}> = [
  { flow: "change_email", title: "Round1 — 更换邮箱", linkText: "点击验证新邮箱" },
  { flow: "register", title: "Round1 — 注册验证", linkText: "点击验证" },
  { flow: "reset_password", title: "Round1 — 重置密码", linkText: "点击重置密码" },
];

describe("auth email templates", () => {
  for (const templateFile of templateFiles) {
    it(`${templateFile} keeps only fragment content without shared document styles`, () => {
      const html = readFileSync(resolve(templateDir, templateFile), "utf8");

      expect(html).not.toMatch(/<!doctype html/i);
      expect(html).not.toMatch(/<html\b/i);
      expect(html).not.toMatch(/<head\b/i);
      expect(html).not.toMatch(/<body\b/i);
      expect(html).not.toMatch(/<style\b/i);
      expect(html).not.toMatch(/\sstyle=/i);
      expect(html).toContain("{{CODE}}");
      expect(html).toContain("{{LINK}}");
      expect(html).toContain("{{EXPIRES_MINUTES}}");
    });
  }

  for (const renderCase of renderCases) {
    it(`${renderCase.flow} renders inside the shared email document shell`, () => {
      const html = renderChallengeEmailHtml(renderCase.flow, {
        CODE: "123456",
        LINK: "https://example.com/auth/callback",
        EXPIRES_MINUTES: "15",
      });

      expect(html).toMatch(/<!doctype html/i);
      expect(html).toMatch(/<html[^>]*\slang="zh-CN"/i);
      expect(html).toContain(`<title>${renderCase.title}</title>`);
      expect(html).toContain(renderCase.linkText);
      expect(html).toContain("123456");
      expect(html).not.toMatch(/\sstyle=/i);
    });
  }
});
