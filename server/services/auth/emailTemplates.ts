import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "../../lib/errors.js";

export type ChallengeFlow = "register" | "reset_password" | "change_email";

const TEMPLATE_DIR = resolve(import.meta.dirname, "templates");

const FLOW_TEMPLATE_META: Record<ChallengeFlow, { file: string; title: string }> = {
  register: {
    file: "register-code.html",
    title: "Round1 — 注册验证",
  },
  reset_password: {
    file: "reset-password.html",
    title: "Round1 — 重置密码",
  },
  change_email: {
    file: "change-email.html",
    title: "Round1 — 更换邮箱",
  },
};

const EMAIL_DOCUMENT_STYLES = `
      body {
        font-family: sans-serif;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }

      .verification-code {
        font-size: 32px;
        font-weight: bold;
        letter-spacing: 8px;
        text-align: center;
        padding: 20px;
        background: #f5f5f5;
        border-radius: 8px;
      }

      .email-note {
        color: #888;
        font-size: 12px;
      }
    `;

function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  let rendered = template;

  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered;
}

export function renderChallengeEmailHtml(
  flow: ChallengeFlow,
  vars: Record<string, string>,
): string {
  const meta = FLOW_TEMPLATE_META[flow];

  if (!meta) {
    throw new AppError("INVALID_FLOW", `Unknown flow: ${flow}`);
  }

  const bodyHtml = replaceTemplateVars(
    readFileSync(resolve(TEMPLATE_DIR, meta.file), "utf-8").trim(),
    vars,
  );

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${meta.title}</title>
    <style>
${EMAIL_DOCUMENT_STYLES}
    </style>
  </head>
  <body>
    ${bodyHtml.replace(/\n/g, "\n    ")}
  </body>
</html>
`;
}
