/**
 * 知识点树 Bootstrap — 从 taxonomy.json 导入知识点到 knowledge_points 表
 *
 * 用法：npx tsx scripts/bootstrapKnowledgePoints.ts [--dry-run]
 *
 * 数据来源：prompts/taxonomy.json（基于 NOI 大纲 2025 + GESP C++ 大纲 + 初赛讲义 综合归纳）
 */
import fs from "node:fs";
import path from "node:path";
import { db, pool } from "../server/db.js";
import { knowledgePoints } from "../server/db/schema/knowledgePoints.js";
import { eq } from "drizzle-orm";

interface TaxonomyNode {
  code: string;
  name: string;
  category: string;
  children?: TaxonomyNode[];
}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const taxonomyPath = path.resolve(import.meta.dirname, "..", "prompts", "taxonomy.json");
  const rawData = fs.readFileSync(taxonomyPath, "utf-8");
  const taxonomy: TaxonomyNode[] = JSON.parse(rawData);

  console.log(`📚 Loading taxonomy from ${taxonomyPath}`);
  console.log(`   Found ${taxonomy.length} top-level categories`);

  if (dryRun) {
    console.log("\n🔍 DRY RUN — no changes will be made\n");
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const category of taxonomy) {
    // Insert or find parent
    const parentId = await upsertKnowledgePoint({
      code: category.code,
      name: category.name,
      category: category.category,
      parentId: null,
    });

    if (parentId !== null) {
      totalInserted++;
    } else {
      totalSkipped++;
    }

    if (category.children) {
      for (const child of category.children) {
        const childId = await upsertKnowledgePoint({
          code: child.code,
          name: child.name,
          category: child.category,
          parentId: parentId ?? (await findKpId(category.code)),
        });

        if (childId !== null) {
          totalInserted++;
        } else {
          totalSkipped++;
        }
      }
    }
  }

  console.log(
    `\n✅ Bootstrap complete: ${totalInserted} inserted, ${totalSkipped} already existed`,
  );
  await pool.end();
}

async function findKpId(code: string): Promise<number> {
  const rows = await db
    .select({ id: knowledgePoints.id })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.code, code))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Knowledge point not found: ${code}`);
  }
  return rows[0]!.id;
}

async function upsertKnowledgePoint(kp: {
  code: string;
  name: string;
  category: string;
  parentId: number | null;
}): Promise<number | null> {
  // Check if already exists
  const existing = await db
    .select({ id: knowledgePoints.id })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.code, kp.code))
    .limit(1);

  if (existing.length > 0) {
    console.log(`  ⏭  ${kp.code} — ${kp.name} (already exists, id=${existing[0]!.id})`);
    return null;
  }

  if (dryRun) {
    console.log(`  📝 ${kp.code} — ${kp.name} (would insert, parent=${kp.parentId})`);
    return null;
  }

  const [inserted] = await db
    .insert(knowledgePoints)
    .values({
      code: kp.code,
      name: kp.name,
      category: kp.category,
      parentId: kp.parentId,
    })
    .returning({ id: knowledgePoints.id });

  console.log(`  ✅ ${kp.code} — ${kp.name} (id=${inserted!.id})`);
  return inserted!.id;
}

main().catch((err) => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});
