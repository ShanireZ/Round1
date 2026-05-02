import { sql } from "drizzle-orm";

import { prebuiltPapers } from "./schema/prebuiltPapers.js";

export function realPaperMetadataPredicate() {
  return sql`(
    ${prebuiltPapers.metadataJson}->>'paperKind' = 'real_paper'
    OR ${prebuiltPapers.metadataJson}->>'sourceType' = 'real_paper'
    OR ${prebuiltPapers.metadataJson}->>'source' = 'real_paper'
    OR (${prebuiltPapers.metadataJson}->'tags') ? '\u771f\u9898'
  )`;
}

export function simulatedPrebuiltPaperPredicate() {
  return sql`NOT ${realPaperMetadataPredicate()}`;
}
