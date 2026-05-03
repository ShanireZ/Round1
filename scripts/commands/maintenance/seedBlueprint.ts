/**
 * 蓝图初始化 — 将 config/blueprint.ts 中的蓝图定义写入 blueprints 表
 *
 * 用法：npx tsx scripts/maintenance.ts seed-blueprint [--force]
 *
 * --force: 即使当前版本已存在也重新写入
 */
import { db, pool } from "../../../server/db.js";
import { blueprints } from "../../../server/db/schema/blueprints.js";
import { blueprintSpecs, BLUEPRINT_VERSION } from "../../../config/blueprint.js";
import { and, eq } from "drizzle-orm";
import { EXAM_TYPES } from "../../../server/db/schema/_enums.js";

const force = process.argv.includes("--force");

async function main() {
  console.log(`🏗  Seeding blueprints (version=${BLUEPRINT_VERSION})...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const examType of EXAM_TYPES) {
    const spec = blueprintSpecs[examType];
    if (!spec) {
      console.log(`  ⚠  No blueprint defined for ${examType}, skipping`);
      continue;
    }

    // Check if this version already exists
    const existing = await db
      .select({ examType: blueprints.examType })
      .from(blueprints)
      .where(and(eq(blueprints.examType, examType), eq(blueprints.version, BLUEPRINT_VERSION)))
      .limit(1);

    if (existing.length > 0 && !force) {
      console.log(`  ⏭  ${examType} v${BLUEPRINT_VERSION} already exists`);
      skipped++;
      continue;
    }

    if (existing.length > 0 && force) {
      await db
        .delete(blueprints)
        .where(and(eq(blueprints.examType, examType), eq(blueprints.version, BLUEPRINT_VERSION)));
    }

    await db.insert(blueprints).values({
      examType,
      version: BLUEPRINT_VERSION,
      specJson: spec,
    });

    console.log(
      `  ✅ ${examType} v${BLUEPRINT_VERSION} — ${spec.durationMinutes}min, ${spec.sections.length} sections`,
    );
    inserted++;
  }

  console.log(`\n✅ Seed complete: ${inserted} inserted, ${skipped} skipped`);
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
