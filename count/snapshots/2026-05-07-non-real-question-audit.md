# 2026-05-07-non-real-question-audit

## Scope

- Scope: non-real-paper question bundles under `papers/2026`.
- Unit: exam-tagged rows. One question tagged for multiple exam types is counted once per exam type.
- Canonical folder: `count/`.
- Evidence reports are source inputs, not the canonical counting surface.

## Sources

- Inventory: `count/state/question-inventory.json`
- Diversity audit: `count/audits/2026-05-07-non-real-files-all-v01/papers-2026__diversity-audit.json`
- Rewrite queue: `count/audits/2026-05-07-non-real-files-all-v01/papers-2026__rewrite-queue.csv`
- Archive suggestions: `count/audits/2026-05-07-non-real-files-all-v01/papers-2026__archive-suggestions.csv`

## Overview

- Generated at: 2026-05-07T05:34:54.039Z
- Inventory generated at: 2026-05-07T05:34:04.929Z
- Diversity audit generated at: 2026-05-07T05:34:26.999Z
- Bundle files found: 3049
- Counted inventory rows: 13660
- Diversity items: 13660
- Policy-tagged items: 3
- Total required rows: 20000
- Raw inventory deficit: 7494
- Quality-adjusted deficit: 12527
- Low-quality candidates: 3789
- Rewrite candidates: 6048
- Template clusters: 285
- Validation errors: 0

## Situation Definitions

- `compliant`: current total minus rewrite queue. This is an audit estimate, not a publish guarantee.
- `abandon`: archive suggestion; these should be replaced or manually reviewed before any reuse.
- `salvage`: rewrite queue minus archive suggestion; these can be repaired/regenerated.
- `lowQuality`: `qualityScore_below_0.65`; this overlaps with rewrite/archive and must not be summed as another category.
- `qualityAdjustedDeficit`: required minus compliant, capped at zero per bucket.

## By Exam Type

| examType | total | required | rawDeficit | compliant | abandon | salvage | lowQuality | qualityAdjustedDeficit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CSP-J | 2005 | 2000 | 80 | 1175 | 40 | 790 | 486 | 854 |
| CSP-S | 2017 | 2000 | 87 | 1086 | 31 | 900 | 611 | 926 |
| GESP-1 | 1734 | 2000 | 282 | 1174 | 43 | 517 | 382 | 828 |
| GESP-2 | 1786 | 2000 | 239 | 1351 | 34 | 401 | 355 | 660 |
| GESP-3 | 182 | 2000 | 1818 | 90 | 21 | 71 | 55 | 1910 |
| GESP-4 | 188 | 2000 | 1812 | 108 | 16 | 64 | 47 | 1892 |
| GESP-5 | 360 | 2000 | 1640 | 247 | 17 | 96 | 71 | 1753 |
| GESP-6 | 473 | 2000 | 1527 | 231 | 17 | 225 | 109 | 1769 |
| GESP-7 | 2577 | 2000 | 4 | 858 | 359 | 1360 | 926 | 1143 |
| GESP-8 | 2338 | 2000 | 5 | 1292 | 34 | 1012 | 747 | 792 |

## By Exam Type And Question Type

| examType | questionType | required | available | rawDeficit | compliant | abandon | salvage | lowQuality | qualityAdjustedDeficit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CSP-J | completion_program | 200 | 184 | 25 | 96 | 0 | 88 | 2 | 104 |
| CSP-J | reading_program | 300 | 365 | 2 | 235 | 0 | 130 | 9 | 94 |
| CSP-J | single_choice | 1500 | 1456 | 53 | 844 | 40 | 572 | 475 | 656 |
| CSP-S | completion_program | 200 | 188 | 12 | 110 | 0 | 78 | 4 | 90 |
| CSP-S | reading_program | 300 | 341 | 0 | 229 | 0 | 112 | 5 | 83 |
| CSP-S | single_choice | 1500 | 1488 | 75 | 747 | 31 | 710 | 602 | 753 |
| GESP-1 | completion_program | 200 | 152 | 48 | 120 | 0 | 32 | 8 | 80 |
| GESP-1 | reading_program | 300 | 315 | 0 | 297 | 0 | 18 | 8 | 5 |
| GESP-1 | single_choice | 1500 | 1267 | 234 | 757 | 43 | 467 | 366 | 743 |
| GESP-2 | completion_program | 200 | 152 | 48 | 142 | 0 | 10 | 10 | 58 |
| GESP-2 | reading_program | 300 | 325 | 0 | 306 | 0 | 19 | 4 | 5 |
| GESP-2 | single_choice | 1500 | 1309 | 191 | 903 | 34 | 372 | 341 | 597 |
| GESP-3 | completion_program | 200 | 16 | 184 | 15 | 0 | 1 | 1 | 185 |
| GESP-3 | reading_program | 300 | 15 | 285 | 15 | 0 | 0 | 0 | 285 |
| GESP-3 | single_choice | 1500 | 151 | 1349 | 60 | 21 | 70 | 54 | 1440 |
| GESP-4 | completion_program | 200 | 9 | 191 | 9 | 0 | 0 | 0 | 191 |
| GESP-4 | reading_program | 300 | 23 | 277 | 21 | 0 | 2 | 0 | 279 |
| GESP-4 | single_choice | 1500 | 156 | 1344 | 78 | 16 | 62 | 47 | 1422 |
| GESP-5 | completion_program | 200 | 11 | 189 | 11 | 0 | 0 | 0 | 189 |
| GESP-5 | reading_program | 300 | 20 | 280 | 13 | 0 | 7 | 1 | 287 |
| GESP-5 | single_choice | 1500 | 329 | 1171 | 223 | 17 | 89 | 70 | 1277 |
| GESP-6 | completion_program | 200 | 11 | 189 | 7 | 0 | 4 | 1 | 193 |
| GESP-6 | reading_program | 300 | 20 | 280 | 16 | 0 | 4 | 0 | 284 |
| GESP-6 | single_choice | 1500 | 442 | 1058 | 208 | 17 | 217 | 108 | 1292 |
| GESP-7 | completion_program | 200 | 265 | 0 | 33 | 17 | 215 | 19 | 167 |
| GESP-7 | reading_program | 300 | 406 | 0 | 140 | 21 | 245 | 24 | 160 |
| GESP-7 | single_choice | 1500 | 1906 | 4 | 685 | 321 | 900 | 883 | 816 |
| GESP-8 | completion_program | 200 | 239 | 0 | 214 | 0 | 25 | 25 | 10 |
| GESP-8 | reading_program | 300 | 346 | 4 | 230 | 0 | 116 | 8 | 91 |
| GESP-8 | single_choice | 1500 | 1753 | 1 | 848 | 34 | 871 | 714 | 691 |

## Top Bucket Details

| examType | questionType | difficulty | kpGroup | required | available | rawDeficit | compliant | rewrite | abandon | salvage | lowQuality | qualityAdjustedDeficit | situation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GESP-4 | single_choice | medium | CPP | 200 | 7 | 193 | 0 | 7 | 7 | 0 | 7 | 200 | quantity_and_quality_deficit |
| GESP-3 | single_choice | medium | CPP | 200 | 20 | 180 | 7 | 13 | 10 | 3 | 13 | 193 | quantity_and_quality_deficit |
| GESP-3 | single_choice | easy | CPP | 200 | 16 | 184 | 10 | 6 | 0 | 6 | 0 | 190 | quantity_and_quality_deficit |
| GESP-4 | single_choice | easy | CPP | 200 | 25 | 175 | 13 | 12 | 0 | 12 | 0 | 187 | quantity_and_quality_deficit |
| GESP-4 | single_choice | easy | ALG | 200 | 25 | 175 | 15 | 10 | 0 | 10 | 0 | 185 | quantity_and_quality_deficit |
| GESP-4 | single_choice | medium | ALG | 200 | 19 | 181 | 17 | 2 | 0 | 2 | 0 | 183 | quantity_and_quality_deficit |
| GESP-7 | single_choice | hard | DS | 175 | 212 | 0 | 7 | 205 | 22 | 183 | 197 | 168 | quality_deficit |
| GESP-6 | single_choice | medium | ALG | 225 | 102 | 123 | 65 | 37 | 0 | 37 | 20 | 160 | quantity_and_quality_deficit |
| GESP-3 | single_choice | medium | ALG | 160 | 5 | 155 | 1 | 4 | 0 | 4 | 0 | 159 | quantity_and_quality_deficit |
| GESP-3 | single_choice | medium | BAS | 160 | 22 | 138 | 2 | 20 | 6 | 14 | 20 | 158 | quantity_and_quality_deficit |
| GESP-2 | single_choice | medium | CPP | 320 | 257 | 63 | 163 | 94 | 17 | 77 | 86 | 157 | quantity_and_quality_deficit |
| GESP-1 | single_choice | easy | CPP | 400 | 324 | 76 | 247 | 77 | 0 | 77 | 0 | 153 | quantity_and_quality_deficit |
| GESP-3 | single_choice | easy | BAS | 160 | 19 | 141 | 8 | 11 | 0 | 11 | 0 | 152 | quantity_and_quality_deficit |
| GESP-1 | single_choice | medium | CPP | 320 | 272 | 48 | 176 | 96 | 13 | 83 | 90 | 144 | quantity_and_quality_deficit |
| GESP-3 | single_choice | easy | ALG | 160 | 29 | 131 | 18 | 11 | 0 | 11 | 0 | 142 | quantity_and_quality_deficit |
| GESP-7 | single_choice | hard | ALG | 175 | 230 | 0 | 33 | 197 | 83 | 114 | 196 | 142 | quality_deficit |
| GESP-6 | single_choice | easy | DS | 150 | 25 | 125 | 14 | 11 | 0 | 11 | 0 | 136 | quantity_and_quality_deficit |
| GESP-5 | single_choice | medium | CPP | 135 | 2 | 133 | 0 | 2 | 2 | 0 | 2 | 135 | quantity_and_quality_deficit |
| GESP-6 | single_choice | easy | ALG | 150 | 20 | 130 | 15 | 5 | 0 | 5 | 0 | 135 | quantity_and_quality_deficit |
| GESP-1 | single_choice | medium | BAS | 200 | 190 | 10 | 68 | 122 | 27 | 95 | 115 | 132 | quantity_and_quality_deficit |
| GESP-5 | single_choice | medium | MATH | 135 | 15 | 120 | 5 | 10 | 3 | 7 | 9 | 130 | quantity_and_quality_deficit |
| GESP-6 | single_choice | medium | CPP | 135 | 10 | 125 | 6 | 4 | 3 | 1 | 4 | 129 | quantity_and_quality_deficit |
| GESP-6 | single_choice | medium | DS | 225 | 209 | 16 | 97 | 112 | 0 | 112 | 26 | 128 | quantity_and_quality_deficit |
| GESP-8 | single_choice | hard | DS | 140 | 185 | 0 | 13 | 172 | 1 | 171 | 166 | 127 | quality_deficit |
| GESP-8 | single_choice | hard | MATH | 140 | 145 | 0 | 15 | 130 | 1 | 129 | 130 | 125 | quality_deficit |
| GESP-6 | single_choice | hard | ALG | 125 | 10 | 115 | 2 | 8 | 3 | 5 | 8 | 123 | quantity_and_quality_deficit |
| GESP-6 | single_choice | hard | DS | 125 | 20 | 105 | 2 | 18 | 5 | 13 | 18 | 123 | quantity_and_quality_deficit |
| GESP-5 | single_choice | hard | ALG | 125 | 5 | 120 | 3 | 2 | 0 | 2 | 2 | 122 | quantity_and_quality_deficit |
| GESP-4 | single_choice | medium | BAS | 120 | 8 | 112 | 3 | 5 | 3 | 2 | 5 | 117 | quantity_and_quality_deficit |
| GESP-5 | single_choice | easy | ALG | 150 | 44 | 106 | 34 | 10 | 0 | 10 | 0 | 116 | quantity_and_quality_deficit |
| GESP-7 | single_choice | medium | DS | 225 | 221 | 4 | 110 | 111 | 0 | 111 | 30 | 115 | quantity_and_quality_deficit |
| GESP-1 | single_choice | easy | BAS | 250 | 182 | 68 | 138 | 44 | 0 | 44 | 0 | 112 | quantity_and_quality_deficit |
| GESP-2 | single_choice | easy | CPP | 400 | 318 | 82 | 289 | 29 | 0 | 29 | 0 | 111 | quantity_and_quality_deficit |
| GESP-4 | single_choice | easy | BAS | 120 | 19 | 101 | 17 | 2 | 0 | 2 | 0 | 103 | quantity_and_quality_deficit |
| CSP-S | single_choice | hard | DS | 120 | 140 | 0 | 18 | 122 | 5 | 117 | 115 | 102 | quality_deficit |
| GESP-5 | reading_program | medium | ALG | 99 | 0 | 99 | 0 | 0 | 0 | 0 | 0 | 99 | quantity_and_quality_deficit |
| GESP-3 | single_choice | hard | CPP | 100 | 5 | 95 | 1 | 4 | 0 | 4 | 4 | 99 | quantity_and_quality_deficit |
| GESP-4 | single_choice | hard | CPP | 100 | 10 | 90 | 1 | 9 | 0 | 9 | 9 | 99 | quantity_and_quality_deficit |
| GESP-4 | single_choice | hard | ALG | 100 | 14 | 86 | 2 | 12 | 0 | 12 | 12 | 98 | quantity_and_quality_deficit |
| GESP-2 | single_choice | medium | BAS | 160 | 153 | 7 | 62 | 91 | 13 | 78 | 90 | 98 | quantity_and_quality_deficit |
| CSP-J | single_choice | medium | BAS | 160 | 154 | 6 | 62 | 92 | 13 | 79 | 85 | 98 | quantity_and_quality_deficit |
| GESP-8 | single_choice | hard | ALG | 140 | 165 | 0 | 44 | 121 | 3 | 118 | 119 | 96 | quality_deficit |
| GESP-6 | reading_program | medium | ALG | 99 | 5 | 94 | 5 | 0 | 0 | 0 | 0 | 94 | quantity_and_quality_deficit |
| GESP-5 | single_choice | medium | DS | 90 | 5 | 85 | 0 | 5 | 0 | 5 | 0 | 90 | quantity_and_quality_deficit |
| GESP-7 | single_choice | hard | CPP | 105 | 162 | 0 | 15 | 147 | 37 | 110 | 147 | 90 | quality_deficit |
| GESP-3 | reading_program | medium | ALG | 94 | 5 | 89 | 5 | 0 | 0 | 0 | 0 | 89 | quantity_and_quality_deficit |
| GESP-6 | single_choice | medium | MATH | 90 | 11 | 79 | 1 | 10 | 1 | 9 | 9 | 89 | quantity_and_quality_deficit |
| GESP-5 | single_choice | medium | BAS | 90 | 9 | 81 | 2 | 7 | 4 | 3 | 7 | 88 | quantity_and_quality_deficit |
| GESP-4 | reading_program | medium | ALG | 94 | 9 | 85 | 7 | 2 | 0 | 2 | 0 | 87 | quantity_and_quality_deficit |
| CSP-S | single_choice | medium | DS | 200 | 215 | 0 | 113 | 102 | 0 | 102 | 21 | 87 | quality_deficit |
| GESP-6 | single_choice | easy | CPP | 90 | 10 | 80 | 4 | 6 | 0 | 6 | 0 | 86 | quantity_and_quality_deficit |
| GESP-8 | single_choice | medium | DS | 180 | 227 | 0 | 94 | 133 | 0 | 133 | 27 | 86 | quality_deficit |
| GESP-5 | single_choice | easy | MATH | 90 | 5 | 85 | 5 | 0 | 0 | 0 | 0 | 85 | quantity_and_quality_deficit |
| GESP-5 | single_choice | easy | CPP | 90 | 15 | 75 | 5 | 10 | 0 | 10 | 0 | 85 | quantity_and_quality_deficit |
| CSP-S | single_choice | hard | ALG | 120 | 130 | 0 | 35 | 95 | 7 | 88 | 94 | 85 | quality_deficit |
| GESP-3 | completion_program | medium | ALG | 89 | 5 | 84 | 5 | 0 | 0 | 0 | 0 | 84 | quantity_and_quality_deficit |
| GESP-4 | completion_program | medium | ALG | 89 | 5 | 84 | 5 | 0 | 0 | 0 | 0 | 84 | quantity_and_quality_deficit |
| GESP-3 | single_choice | medium | MATH | 80 | 0 | 80 | 0 | 0 | 0 | 0 | 0 | 80 | quantity_and_quality_deficit |
| GESP-4 | single_choice | medium | MATH | 80 | 5 | 75 | 0 | 5 | 2 | 3 | 5 | 80 | quantity_and_quality_deficit |
| GESP-8 | single_choice | hard | CPP | 105 | 130 | 0 | 25 | 105 | 10 | 95 | 104 | 80 | quality_deficit |
| GESP-3 | single_choice | hard | BAS | 80 | 5 | 75 | 1 | 4 | 0 | 4 | 4 | 79 | quantity_and_quality_deficit |
| CSP-S | single_choice | hard | CPP | 90 | 91 | 0 | 11 | 80 | 0 | 80 | 80 | 79 | quality_deficit |
| GESP-7 | single_choice | medium | MATH | 90 | 113 | 0 | 11 | 102 | 65 | 37 | 101 | 79 | quality_deficit |
| GESP-3 | single_choice | hard | ALG | 80 | 10 | 70 | 2 | 8 | 0 | 8 | 8 | 78 | quantity_and_quality_deficit |
| CSP-J | single_choice | hard | BAS | 80 | 80 | 0 | 3 | 77 | 2 | 75 | 77 | 77 | quality_deficit |
| GESP-8 | single_choice | medium | MATH | 180 | 200 | 0 | 103 | 97 | 14 | 83 | 93 | 77 | quality_deficit |
| GESP-5 | single_choice | hard | MATH | 75 | 5 | 70 | 0 | 5 | 5 | 0 | 5 | 75 | quantity_and_quality_deficit |
| GESP-5 | single_choice | hard | CPP | 75 | 10 | 65 | 1 | 9 | 0 | 9 | 9 | 74 | quantity_and_quality_deficit |
| GESP-6 | single_choice | hard | CPP | 75 | 15 | 60 | 1 | 14 | 5 | 9 | 14 | 74 | quantity_and_quality_deficit |
| GESP-4 | single_choice | easy | MATH | 80 | 14 | 66 | 9 | 5 | 0 | 5 | 0 | 71 | quantity_and_quality_deficit |
| CSP-J | single_choice | hard | CPP | 80 | 62 | 18 | 9 | 53 | 0 | 53 | 53 | 71 | quantity_and_quality_deficit |
| GESP-3 | single_choice | easy | MATH | 80 | 15 | 65 | 10 | 5 | 0 | 5 | 0 | 70 | quantity_and_quality_deficit |
| GESP-1 | single_choice | hard | CPP | 80 | 63 | 17 | 11 | 52 | 0 | 52 | 51 | 69 | quantity_and_quality_deficit |
| GESP-7 | single_choice | hard | MATH | 70 | 87 | 0 | 2 | 85 | 48 | 37 | 85 | 68 | quality_deficit |
| GESP-4 | completion_program | hard | ALG | 67 | 0 | 67 | 0 | 0 | 0 | 0 | 0 | 67 | quantity_and_quality_deficit |
| GESP-2 | single_choice | hard | CPP | 80 | 62 | 18 | 13 | 49 | 0 | 49 | 49 | 67 | quantity_and_quality_deficit |
| GESP-7 | single_choice | medium | ALG | 225 | 275 | 0 | 158 | 117 | 20 | 97 | 41 | 67 | quality_deficit |
| GESP-5 | reading_program | hard | ALG | 65 | 0 | 65 | 0 | 0 | 0 | 0 | 0 | 65 | quantity_and_quality_deficit |
| GESP-3 | completion_program | hard | ALG | 67 | 5 | 62 | 4 | 1 | 0 | 1 | 1 | 63 | quantity_and_quality_deficit |
| CSP-J | single_choice | medium | CPP | 160 | 160 | 0 | 97 | 63 | 17 | 46 | 58 | 63 | quality_deficit |

Full bucket details live in the sibling CSV and JSON files.

