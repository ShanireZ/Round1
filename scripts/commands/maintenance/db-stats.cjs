const { Pool } = require("pg");
const p = new Pool({ connectionString: "postgres://round1:round1_dev@127.0.0.1:4397/round1" });

async function main() {
  const r1 = await p.query(
    `SELECT qet.exam_type, COUNT(*) as cnt FROM questions q JOIN question_exam_types qet ON q.id=qet.question_id WHERE q.source='real_paper' GROUP BY qet.exam_type ORDER BY qet.exam_type`,
  );
  console.log("By exam type:");
  r1.rows.forEach((r) => console.log("  " + r.exam_type + ": " + r.cnt));

  const r2 = await p.query(
    `SELECT content_json->>'questionType' as qt, COUNT(*) as cnt FROM questions WHERE source='real_paper' GROUP BY qt ORDER BY qt`,
  );
  console.log("\nBy question type:");
  r2.rows.forEach((r) => console.log("  " + r.qt + ": " + r.cnt));

  const r3 = await p.query(`SELECT COUNT(*) as total FROM questions WHERE source='real_paper'`);
  console.log("\nTotal:", r3.rows[0].total);

  await p.end();
}
main();
