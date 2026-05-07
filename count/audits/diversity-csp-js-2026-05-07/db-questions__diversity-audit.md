# Question Diversity Audit 2026

- Source: db:questions
- Generated at: 2026-05-07T03:26:34.347Z
- Policy version: round1-question-diversity/2026-05-07.1
- Items: 13900
- Policy-tagged items: 0
- Low-quality candidates: 3913
- Rewrite candidates: 6256
- Template clusters: 295
- Validation enforced: false
- Validation errors: 0

## Largest Grid Buckets

| grid | count | top task flavors | top archetypes |
| --- | ---: | --- | --- |
| CSP-J|single_choice|medium|CPP | 1320 | generic_concept:1078, final_scalar_value:177, sorting_trace:37, loop_iteration_count:17, complexity_bound_reasoning:6 | inferred-generic_concept:1078, inferred-final_scalar_value:177, inferred-sorting_trace:37, inferred-loop_iteration_count:17, inferred-complexity_bound_reasoning:6 |
| CSP-S|single_choice|medium|CPP | 1320 | generic_concept:1078, final_scalar_value:177, sorting_trace:37, loop_iteration_count:17, complexity_bound_reasoning:6 | inferred-generic_concept:1078, inferred-final_scalar_value:177, inferred-sorting_trace:37, inferred-loop_iteration_count:17, inferred-complexity_bound_reasoning:6 |
| CSP-J|single_choice|easy|CPP | 1251 | generic_concept:1006, final_scalar_value:192, loop_iteration_count:27, sorting_trace:22, complexity_bound_reasoning:2 | inferred-generic_concept:1006, inferred-final_scalar_value:192, inferred-loop_iteration_count:27, inferred-sorting_trace:22, inferred-complexity_bound_reasoning:2 |
| CSP-S|single_choice|easy|CPP | 1251 | generic_concept:1006, final_scalar_value:192, loop_iteration_count:27, sorting_trace:22, complexity_bound_reasoning:2 | inferred-generic_concept:1006, inferred-final_scalar_value:192, inferred-loop_iteration_count:27, inferred-sorting_trace:22, inferred-complexity_bound_reasoning:2 |
| CSP-J|single_choice|medium|ALG | 1128 | generic_concept:461, sorting_trace:244, binary_search_boundary:140, stack_state_trace:81, prefix_sum_query:46 | inferred-generic_concept:461, inferred-sorting_trace:244, inferred-binary_search_boundary:140, inferred-stack_state_trace:81, inferred-prefix_sum_query:46 |
| CSP-S|single_choice|medium|ALG | 1128 | generic_concept:461, sorting_trace:244, binary_search_boundary:140, stack_state_trace:81, prefix_sum_query:46 | inferred-generic_concept:461, inferred-sorting_trace:244, inferred-binary_search_boundary:140, inferred-stack_state_trace:81, inferred-prefix_sum_query:46 |
| CSP-J|single_choice|medium|DS | 972 | generic_concept:414, stack_state_trace:249, queue_state_trace:136, sorting_trace:60, priority_queue_order:27 | inferred-generic_concept:414, inferred-stack_state_trace:249, inferred-queue_state_trace:136, inferred-sorting_trace:60, inferred-priority_queue_order:27 |
| CSP-S|single_choice|medium|DS | 972 | generic_concept:414, stack_state_trace:249, queue_state_trace:136, sorting_trace:60, priority_queue_order:27 | inferred-generic_concept:414, inferred-stack_state_trace:249, inferred-queue_state_trace:136, inferred-sorting_trace:60, inferred-priority_queue_order:27 |
| CSP-J|single_choice|easy|BAS | 677 | generic_concept:628, final_scalar_value:21, stack_state_trace:17, sorting_trace:4, queue_state_trace:3 | inferred-generic_concept:628, inferred-final_scalar_value:21, inferred-stack_state_trace:17, inferred-sorting_trace:4, inferred-queue_state_trace:3 |
| CSP-S|single_choice|easy|BAS | 677 | generic_concept:628, final_scalar_value:21, stack_state_trace:17, sorting_trace:4, queue_state_trace:3 | inferred-generic_concept:628, inferred-final_scalar_value:21, inferred-stack_state_trace:17, inferred-sorting_trace:4, inferred-queue_state_trace:3 |
| CSP-J|single_choice|hard|CPP | 667 | generic_concept:533, final_scalar_value:83, sorting_trace:33, complexity_bound_reasoning:7, stack_state_trace:3 | inferred-generic_concept:533, inferred-final_scalar_value:83, inferred-sorting_trace:33, inferred-complexity_bound_reasoning:7, inferred-stack_state_trace:3 |
| CSP-S|single_choice|hard|CPP | 667 | generic_concept:533, final_scalar_value:83, sorting_trace:33, complexity_bound_reasoning:7, stack_state_trace:3 | inferred-generic_concept:533, inferred-final_scalar_value:83, inferred-sorting_trace:33, inferred-complexity_bound_reasoning:7, inferred-stack_state_trace:3 |
| CSP-J|single_choice|hard|ALG | 628 | generic_concept:225, sorting_trace:117, binary_search_boundary:94, dp_state_transition:36, stack_state_trace:34 | inferred-generic_concept:225, inferred-sorting_trace:117, inferred-binary_search_boundary:94, inferred-dp_state_transition:36, inferred-stack_state_trace:34 |
| CSP-S|single_choice|hard|ALG | 628 | generic_concept:225, sorting_trace:117, binary_search_boundary:94, dp_state_transition:36, stack_state_trace:34 | inferred-generic_concept:225, inferred-sorting_trace:117, inferred-binary_search_boundary:94, inferred-dp_state_transition:36, inferred-stack_state_trace:34 |
| CSP-J|single_choice|medium|BAS | 609 | generic_concept:519, stack_state_trace:52, final_scalar_value:15, sorting_trace:8, binary_search_boundary:6 | inferred-generic_concept:519, inferred-stack_state_trace:52, inferred-final_scalar_value:15, inferred-sorting_trace:8, inferred-binary_search_boundary:6 |
| CSP-S|single_choice|medium|BAS | 609 | generic_concept:519, stack_state_trace:52, final_scalar_value:15, sorting_trace:8, binary_search_boundary:6 | inferred-generic_concept:519, inferred-stack_state_trace:52, inferred-final_scalar_value:15, inferred-sorting_trace:8, inferred-binary_search_boundary:6 |
| CSP-J|single_choice|hard|DS | 600 | generic_concept:234, stack_state_trace:117, queue_state_trace:71, priority_queue_order:42, sorting_trace:34 | inferred-generic_concept:234, inferred-stack_state_trace:117, inferred-queue_state_trace:71, inferred-priority_queue_order:42, inferred-sorting_trace:34 |
| CSP-S|single_choice|hard|DS | 600 | generic_concept:234, stack_state_trace:117, queue_state_trace:71, priority_queue_order:42, sorting_trace:34 | inferred-generic_concept:234, inferred-stack_state_trace:117, inferred-queue_state_trace:71, inferred-priority_queue_order:42, inferred-sorting_trace:34 |
| CSP-J|single_choice|easy|ALG | 572 | generic_concept:216, sorting_trace:120, binary_search_boundary:101, stack_state_trace:36, complexity_bound_reasoning:31 | inferred-generic_concept:216, inferred-sorting_trace:120, inferred-binary_search_boundary:101, inferred-stack_state_trace:36, inferred-complexity_bound_reasoning:31 |
| CSP-S|single_choice|easy|ALG | 572 | generic_concept:216, sorting_trace:120, binary_search_boundary:101, stack_state_trace:36, complexity_bound_reasoning:31 | inferred-generic_concept:216, inferred-sorting_trace:120, inferred-binary_search_boundary:101, inferred-stack_state_trace:36, inferred-complexity_bound_reasoning:31 |
| CSP-J|single_choice|medium|MATH | 490 | generic_concept:380, final_scalar_value:48, stack_state_trace:22, set_order_unique:9, sorting_trace:9 | inferred-generic_concept:380, inferred-final_scalar_value:48, inferred-stack_state_trace:22, inferred-set_order_unique:9, inferred-sorting_trace:9 |
| CSP-S|single_choice|medium|MATH | 490 | generic_concept:380, final_scalar_value:48, stack_state_trace:22, set_order_unique:9, sorting_trace:9 | inferred-generic_concept:380, inferred-final_scalar_value:48, inferred-stack_state_trace:22, inferred-set_order_unique:9, inferred-sorting_trace:9 |
| CSP-J|single_choice|easy|DS | 431 | generic_concept:154, stack_state_trace:109, queue_state_trace:59, priority_queue_order:27, sorting_trace:22 | inferred-generic_concept:154, inferred-stack_state_trace:109, inferred-queue_state_trace:59, inferred-priority_queue_order:27, inferred-sorting_trace:22 |
| CSP-S|single_choice|easy|DS | 431 | generic_concept:154, stack_state_trace:109, queue_state_trace:59, priority_queue_order:27, sorting_trace:22 | inferred-generic_concept:154, inferred-stack_state_trace:109, inferred-queue_state_trace:59, inferred-priority_queue_order:27, inferred-sorting_trace:22 |
| CSP-J|reading_program|medium|ALG | 407 | complexity_bound_reasoning:92, generic_concept:64, loop_iteration_count:63, final_scalar_value:60, sorting_trace:50 | inferred-complexity_bound_reasoning:92, inferred-generic_concept:64, inferred-loop_iteration_count:63, inferred-final_scalar_value:60, inferred-sorting_trace:50 |
| CSP-S|reading_program|medium|ALG | 407 | complexity_bound_reasoning:92, generic_concept:64, loop_iteration_count:63, final_scalar_value:60, sorting_trace:50 | inferred-complexity_bound_reasoning:92, inferred-generic_concept:64, inferred-loop_iteration_count:63, inferred-final_scalar_value:60, inferred-sorting_trace:50 |
| CSP-J|reading_program|medium|CPP | 379 | generic_concept:117, final_scalar_value:108, loop_iteration_count:85, complexity_bound_reasoning:31, sorting_trace:23 | inferred-generic_concept:117, inferred-final_scalar_value:108, inferred-loop_iteration_count:85, inferred-complexity_bound_reasoning:31, inferred-sorting_trace:23 |
| CSP-J|reading_program|hard|ALG | 361 | complexity_bound_reasoning:68, sorting_trace:64, prefix_sum_query:48, dp_state_transition:38, generic_concept:37 | inferred-complexity_bound_reasoning:68, inferred-sorting_trace:64, inferred-prefix_sum_query:48, inferred-dp_state_transition:38, inferred-generic_concept:37 |
| CSP-S|reading_program|hard|ALG | 361 | complexity_bound_reasoning:68, sorting_trace:64, prefix_sum_query:48, dp_state_transition:38, generic_concept:37 | inferred-complexity_bound_reasoning:68, inferred-sorting_trace:64, inferred-prefix_sum_query:48, inferred-dp_state_transition:38, inferred-generic_concept:37 |
| CSP-J|single_choice|hard|MATH | 337 | generic_concept:239, final_scalar_value:36, stack_state_trace:14, sorting_trace:13, complexity_bound_reasoning:11 | inferred-generic_concept:239, inferred-final_scalar_value:36, inferred-stack_state_trace:14, inferred-sorting_trace:13, inferred-complexity_bound_reasoning:11 |

## Knowledge Point Template Distribution

| knowledge point / type / difficulty | count | top task flavors | top stem patterns |
| --- | ---: | --- | --- |
| CPP|single_choice|medium | 1320 | generic_concept:1078, final_scalar_value:177, sorting_trace:37, loop_iteration_count:17, complexity_bound_reasoning:6, stack_state_trace:2 | final_value:707, short_trace:463, concept_choice:126, loop_count:17, complexity:7 |
| CPP|single_choice|easy | 1251 | generic_concept:1006, final_scalar_value:192, loop_iteration_count:27, sorting_trace:22, complexity_bound_reasoning:2, prefix_sum_query:1 | final_value:647, short_trace:448, concept_choice:127, loop_count:27, complexity:2 |
| ALG|single_choice|medium | 1128 | generic_concept:461, sorting_trace:244, binary_search_boundary:140, stack_state_trace:81, prefix_sum_query:46, complexity_bound_reasoning:45 | short_trace:523, final_value:304, complexity:152, loop_count:109, concept_choice:40 |
| DS|single_choice|medium | 972 | generic_concept:414, stack_state_trace:249, queue_state_trace:136, sorting_trace:60, priority_queue_order:27, complexity_bound_reasoning:24 | short_trace:577, final_value:163, loop_count:118, concept_choice:72, complexity:42 |
| BAS|single_choice|easy | 677 | generic_concept:628, final_scalar_value:21, stack_state_trace:17, sorting_trace:4, queue_state_trace:3, complexity_bound_reasoning:2 | short_trace:418, final_value:165, concept_choice:82, complexity:8, loop_count:4 |
| CPP|single_choice|hard | 667 | generic_concept:533, final_scalar_value:83, sorting_trace:33, complexity_bound_reasoning:7, loop_iteration_count:3, stack_state_trace:3 | final_value:404, short_trace:207, concept_choice:45, complexity:8, loop_count:3 |
| ALG|single_choice|hard | 628 | generic_concept:225, sorting_trace:117, binary_search_boundary:94, dp_state_transition:36, prefix_sum_query:34, stack_state_trace:34 | short_trace:263, final_value:178, loop_count:88, complexity:75, concept_choice:24 |
| BAS|single_choice|medium | 609 | generic_concept:519, stack_state_trace:52, final_scalar_value:15, sorting_trace:8, binary_search_boundary:6, complexity_bound_reasoning:4 | short_trace:366, final_value:142, concept_choice:80, complexity:13, loop_count:8 |
| DS|single_choice|hard | 600 | generic_concept:234, stack_state_trace:117, queue_state_trace:71, priority_queue_order:42, set_order_unique:34, sorting_trace:34 | short_trace:361, final_value:116, loop_count:73, complexity:32, concept_choice:18 |
| ALG|single_choice|easy | 572 | generic_concept:216, sorting_trace:120, binary_search_boundary:101, stack_state_trace:36, complexity_bound_reasoning:31, prefix_sum_query:22 | short_trace:248, final_value:147, complexity:81, loop_count:75, concept_choice:21 |
| MATH|single_choice|medium | 490 | generic_concept:380, final_scalar_value:48, stack_state_trace:22, set_order_unique:9, sorting_trace:9, complexity_bound_reasoning:8 | short_trace:322, final_value:131, concept_choice:18, complexity:13, loop_count:6 |
| DS|single_choice|easy | 431 | generic_concept:154, stack_state_trace:109, queue_state_trace:59, priority_queue_order:27, set_order_unique:22, sorting_trace:22 | short_trace:268, final_value:61, loop_count:43, concept_choice:38, complexity:21 |
| ALG|reading_program|medium | 407 | complexity_bound_reasoning:92, generic_concept:64, loop_iteration_count:63, final_scalar_value:60, sorting_trace:50, prefix_sum_query:41 | program_trace:407 |
| CPP|reading_program|medium | 379 | generic_concept:117, final_scalar_value:108, loop_iteration_count:85, complexity_bound_reasoning:31, sorting_trace:23, stack_state_trace:10 | program_trace:379 |
| ALG|reading_program|hard | 361 | complexity_bound_reasoning:68, sorting_trace:64, prefix_sum_query:48, dp_state_transition:38, generic_concept:37, final_scalar_value:34 | program_trace:361 |
| MATH|single_choice|hard | 337 | generic_concept:239, final_scalar_value:36, stack_state_trace:14, sorting_trace:13, complexity_bound_reasoning:11, set_order_unique:8 | short_trace:212, final_value:96, complexity:16, concept_choice:8, loop_count:5 |
| CS|single_choice|easy | 310 | generic_concept:287, stack_state_trace:13, sorting_trace:4, final_scalar_value:3, binary_search_boundary:1, complexity_bound_reasoning:1 | short_trace:185, final_value:62, concept_choice:56, complexity:7 |
| CS|single_choice|medium | 290 | generic_concept:225, stack_state_trace:27, sorting_trace:13, complexity_bound_reasoning:8, queue_state_trace:7, binary_search_boundary:4 | short_trace:144, final_value:80, concept_choice:35, complexity:22, loop_count:9 |
| DS|reading_program|medium | 266 | stack_state_trace:225, priority_queue_order:18, queue_state_trace:16, complexity_bound_reasoning:2, generic_concept:2, sorting_trace:2 | program_trace:266 |
| MATH|single_choice|easy | 253 | generic_concept:213, final_scalar_value:24, sorting_trace:5, stack_state_trace:4, binary_search_boundary:3, prefix_sum_query:2 | short_trace:178, final_value:68, concept_choice:3, complexity:2, loop_count:2 |
| CPP|reading_program|easy | 236 | generic_concept:106, final_scalar_value:71, loop_iteration_count:39, complexity_bound_reasoning:17, prefix_sum_query:1, sorting_trace:1 | program_trace:236 |
| BAS|single_choice|hard | 220 | generic_concept:181, stack_state_trace:15, final_scalar_value:9, complexity_bound_reasoning:6, queue_state_trace:4, sorting_trace:3 | short_trace:105, final_value:75, concept_choice:31, complexity:8, loop_count:1 |
| ALG|completion_program|hard | 219 | blank_completion:99, sorting_trace:26, prefix_sum_query:22, binary_search_boundary:21, dp_state_transition:17, bfs_adjacency_queue:9 | blank_completion:219 |
| DS|reading_program|hard | 209 | stack_state_trace:156, queue_state_trace:27, priority_queue_order:19, deque_two_end_trace:6, loop_iteration_count:1 | program_trace:209 |
| ALG|completion_program|medium | 189 | blank_completion:111, prefix_sum_query:30, sorting_trace:18, binary_search_boundary:14, dp_state_transition:9, stack_state_trace:4 | blank_completion:189 |
| DS|completion_program|medium | 166 | stack_state_trace:123, queue_state_trace:32, blank_completion:4, sorting_trace:3, priority_queue_order:2, bfs_adjacency_queue:1 | blank_completion:166 |
| DS|completion_program|hard | 164 | stack_state_trace:99, queue_state_trace:41, blank_completion:10, priority_queue_order:6, bfs_adjacency_queue:2, sorting_trace:2 | blank_completion:164 |
| CPP|reading_program|hard | 146 | final_scalar_value:41, generic_concept:32, sorting_trace:28, loop_iteration_count:26, stack_state_trace:10, complexity_bound_reasoning:5 | program_trace:146 |
| ALG|reading_program|easy | 126 | generic_concept:30, loop_iteration_count:28, final_scalar_value:23, complexity_bound_reasoning:20, prefix_sum_query:12, sorting_trace:10 | program_trace:126 |
| CS|single_choice|hard | 101 | generic_concept:79, sorting_trace:8, stack_state_trace:5, complexity_bound_reasoning:3, bfs_adjacency_queue:2, binary_search_boundary:2 | short_trace:50, final_value:31, concept_choice:11, complexity:9 |
| DS|reading_program|easy | 73 | stack_state_trace:57, queue_state_trace:11, generic_concept:3, map_count_lookup:1, priority_queue_order:1 | program_trace:73 |
| ALG|completion_program|easy | 58 | blank_completion:45, sorting_trace:5, prefix_sum_query:4, binary_search_boundary:3, stack_state_trace:1 | blank_completion:58 |
| DS|completion_program|easy | 45 | stack_state_trace:30, queue_state_trace:12, blank_completion:2, bfs_adjacency_queue:1 | blank_completion:45 |

## Rewrite Queue Preview

| id | score | reasons |
| --- | ---: | --- |
| db:088b2955-5230-4e69-9a09-6f68fdd5d38b | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:1c782d79-b219-4440-9987-d5187837fc87 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:2798c83e-43cd-4431-9bb0-fde99f5d2296 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:35151adb-4176-4b75-907b-0f6347d090cf | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:390da97a-7548-4b52-b649-75f03670ca95 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:5ba2e92a-4b02-44f4-8611-ae422ab20fb7 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:628f17c0-12c7-40ac-ae81-830792af3f89 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:674a80a7-ad9c-49d9-a98a-80033716b419 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:687e5021-174f-4d14-82bf-bd4a3e2d75fa | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:6cc7f8e2-7de6-4439-a5b0-95610beefcc9 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:71f7c5fa-f525-4c21-ac0f-00167b0b2a27 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:8623ee9e-c4cf-4fd5-9a2f-1dedfc0d97e7 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:999a9321-1f11-4f48-8868-4104f7ec198f | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:b2619a8d-b189-40d1-95c6-55081f1f9584 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:b6fde542-438b-4fff-851a-6c733b9fb8db | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:d9a04a4b-9d5b-4e3a-b7e3-0bd29ba3b8d7 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:da23bba2-e2f9-415a-8c09-3b6424ec2e8e | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:dff9ed9c-d2fd-490c-a72d-11283bf0fd47 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:ef58e654-92a0-43c7-b6b8-2a5ea5caeaf1 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:f841ca7b-d012-435c-8489-5ff5fbc99461 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster, ds_stack_queue_overused_candidate |
| db:0009d14b-c178-4edc-8b94-b58a926e948e | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0141b314-9026-4d1c-87a9-36747600b5b4 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:0271d065-1ecb-4d47-a2cd-f3e8e7557936 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:02dc2ae0-4ce9-4e92-9c26-0758d640b3d8 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:02e1355b-8e6c-4c2d-a1b7-71c144911650 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:02ed28c3-2923-4c16-9502-5b09d5db2685 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:06232ec7-f792-4eb9-9099-8e5c30649168 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:06dc8b76-8e55-42a0-824f-488b26b8ebe8 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:07f6acad-f013-4a5f-a789-2b8d13fb5b5e | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:080a9252-5a60-45f4-a13f-fdf014e97829 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0a0f1008-21d9-4dbf-82c8-006ede2255f3 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0a4de010-1c78-46d8-90ee-aa40d339868f | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:0bc6b8de-8725-4a72-819c-0fbaade3ed62 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0bf85cc9-646c-4b8e-9758-316360c09e21 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0c255276-8b51-4cc8-83a0-97f069ecbf9b | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0d559dd1-fe0f-4a3e-b60e-2db6e7499d75 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0db5e11d-cb02-469d-a8cb-5ebcc0d1bd1d | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0e924e7b-4d10-45e9-9863-21104105fac6 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:0eeab9db-d794-4b7d-8e0e-0dee30b6a8ad | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:103d7d50-a4e0-40bb-b26e-4b40e1779f3d | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:10873d6d-0e55-472f-a71e-92228e461f74 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:10f7ae7d-05b7-48f1-a186-13bc47ae9ef8 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:11ea1b8e-8e35-4716-a8a5-886f9870302c | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:127285d4-ed30-4120-9ca5-8ef8afc23269 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:148b20ff-5bd3-4731-98d8-7f46f96904b2 | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:14d0b5d7-aee5-4263-a238-c207fd097e4f | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:157a76fc-77f1-47a5-acee-af793df5daef | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:15ac1d4c-21e4-445d-8157-c3a42e2d550a | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |
| db:15f333c1-3a47-405f-b092-9bb50f59dc0e | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, parameterized_template_cluster |
| db:1623f5e4-df98-4bd8-8a6f-7c5ba01b0fdf | 0.42 | qualityScore_below_0.65, hard_difficulty_rubric_failed, ds_stack_queue_overused_candidate |

