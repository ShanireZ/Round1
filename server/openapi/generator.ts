import type { OpenAPIObject } from "openapi3-ts/oas31";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry.js";

let cachedDoc: OpenAPIObject | null = null;

export function generateOpenAPIDocument(): OpenAPIObject {
  if (cachedDoc) return cachedDoc;

  const generator = new OpenApiGeneratorV31(registry.definitions);

  cachedDoc = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Round1 API",
      version: "1.0.0",
      description: "算法竞赛测试平台 API",
    },
    servers: [{ url: "/api/v1" }],
  });

  return cachedDoc;
}
