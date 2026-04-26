import { z } from "zod";

// ── 题目查询 ────────────────────────────────────────────────

export const QuestionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  examType: z.string().optional(),
  questionType: z.enum(["single_choice", "reading_program", "completion_program"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: z.enum(["draft", "reviewed", "published", "archived"]).optional(),
  source: z.enum(["ai", "manual", "real_paper"]).optional(),
});
