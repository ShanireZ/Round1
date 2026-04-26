import { z } from "zod";
import { registry } from "../../openapi/registry.js";

// Domain format: lowercase, contains at least one dot
const DomainSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "无效的域名格式")
  .transform((v) => v.toLowerCase());

export const BlocklistAddBody = registry.register(
  "BlocklistAddBody",
  z.object({
    domain: DomainSchema,
  }),
);

export const BlocklistRenameBody = registry.register(
  "BlocklistRenameBody",
  z.object({
    newDomain: DomainSchema,
  }),
);

export const BlocklistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  search: z.string().max(255).optional(),
  source: z.enum(["github", "manual"]).optional(),
});
