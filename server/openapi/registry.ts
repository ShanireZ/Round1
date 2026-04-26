import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with .openapi() method — must be called before any schema registration
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();
