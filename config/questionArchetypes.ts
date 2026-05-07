import { blueprintSpecs } from "./blueprint.js";
import type { ExamType } from "./examTypes.js";

export const DIVERSITY_POLICY_VERSION = "round1-question-diversity/2026-05-07.1";

export type KpGroup = "BAS" | "CPP" | "ALG" | "DS" | "MATH" | "CS";
export type QuestionType = "single_choice" | "reading_program" | "completion_program";
export type Difficulty = "easy" | "medium" | "hard";
export type NoiTier = "entry" | "advanced" | "noi";

export interface DifficultyProfile {
  conceptCount: number;
  stateVariables: number;
  traceSteps: [number, number];
  requiredFeature: string;
  trapType?: string;
}

export interface QuestionArchetype {
  id: string;
  kpGroup: KpGroup;
  minGespLevel: number;
  noiTier: NoiTier;
  questionTypes: QuestionType[];
  difficulties: Difficulty[];
  examCoverage: ExamType[];
  taskFlavor: string;
  codeStructureTags: string[];
  containerTags: string[];
  difficultyProfile: Record<Difficulty, DifficultyProfile>;
  promptDirective: string;
  rejectRules: string[];
}

export interface ArchetypePlanItem {
  itemIndex: number;
  archetypeId: string;
  kpGroup: KpGroup;
  taskFlavor: string;
  codeStructureTags: string[];
  containerTags: string[];
  promptDirective: string;
  rejectRules: string[];
  difficultyProfile: DifficultyProfile;
}

const ALL_QUESTION_TYPES: QuestionType[] = [
  "single_choice",
  "reading_program",
  "completion_program",
];
const ALL_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const GESP_EXAM_TYPES: ExamType[] = [
  "GESP-1",
  "GESP-2",
  "GESP-3",
  "GESP-4",
  "GESP-5",
  "GESP-6",
  "GESP-7",
  "GESP-8",
];

function examCoverage(minGespLevel: number, noiTier: NoiTier): ExamType[] {
  const gesp = GESP_EXAM_TYPES.filter((examType) => {
    const level = Number(examType.replace("GESP-", ""));
    return Number.isFinite(level) && level >= minGespLevel;
  });
  const csp: ExamType[] = noiTier === "noi" ? ["CSP-S"] : ["CSP-J", "CSP-S"];
  return [...gesp, ...csp];
}

function groupMinGespLevel(kpGroup: KpGroup): number {
  switch (kpGroup) {
    case "BAS":
    case "CPP":
    case "CS":
      return 1;
    case "ALG":
    case "MATH":
      return 3;
    case "DS":
      return 5;
  }
}

function profile(
  conceptCount: number,
  stateVariables: number,
  traceMin: number,
  traceMax: number,
  requiredFeature: string,
  trapType?: string,
): DifficultyProfile {
  return {
    conceptCount,
    stateVariables,
    traceSteps: [traceMin, traceMax],
    requiredFeature,
    trapType,
  };
}

function profiles(feature: string, trapType: string): Record<Difficulty, DifficultyProfile> {
  return {
    easy: profile(1, 1, 3, 5, `直接追踪 ${feature}`),
    medium: profile(2, 2, 5, 8, `${feature} 结合边界或分支`, "boundary_or_branch"),
    hard: profile(3, 3, 8, 14, `${feature} 结合不变量或反例排除`, trapType),
  };
}

interface ArchetypeSeed {
  suffix: string;
  minGespLevel: number;
  noiTier: NoiTier;
  taskFlavor: string;
  codeStructureTags: string[];
  containerTags?: string[];
  promptDirective: string;
  rejectRules?: string[];
  feature: string;
  trapType: string;
}

function buildGroup(kpGroup: KpGroup, seeds: ArchetypeSeed[]): QuestionArchetype[] {
  return seeds.map((seed) => ({
    id: `${kpGroup.toLowerCase()}-${seed.suffix}`,
    kpGroup,
    minGespLevel: seed.minGespLevel,
    noiTier: seed.noiTier,
    questionTypes: ALL_QUESTION_TYPES,
    difficulties: ALL_DIFFICULTIES,
    examCoverage: examCoverage(groupMinGespLevel(kpGroup), seed.noiTier),
    taskFlavor: seed.taskFlavor,
    codeStructureTags: seed.codeStructureTags,
    containerTags: seed.containerTags ?? [],
    difficultyProfile: profiles(seed.feature, seed.trapType),
    promptDirective: seed.promptDirective,
    rejectRules: [
      "不得只改数字、变量名或数组长度来生成近邻题。",
      "不得把 hard 题降成单步循环次数或最终变量值追踪。",
      ...(seed.rejectRules ?? []),
    ],
  }));
}

export const questionArchetypes: QuestionArchetype[] = [
  ...buildGroup("DS", [
    {
      suffix: "stack-balance-trace",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "stack_state_trace",
      codeStructureTags: ["container-simulation", "branch"],
      containerTags: ["stack"],
      feature: "栈状态变化",
      trapType: "empty_or_unmatched_stack",
      promptDirective: "围绕 stack push/pop/top 的状态变化设计题；必须考察至少一次空栈或括号匹配边界。",
    },
    {
      suffix: "queue-window-simulation",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "queue_state_trace",
      codeStructureTags: ["container-simulation", "loop"],
      containerTags: ["queue"],
      feature: "队列 front/pop/push 顺序",
      trapType: "fifo_order_misread",
      promptDirective: "围绕 queue front/pop/push 的 FIFO 顺序设计题；必须让错误选项体现把队列误当栈的常见误解。",
    },
    {
      suffix: "deque-two-end-ops",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "deque_two_end_trace",
      codeStructureTags: ["container-simulation", "branch"],
      containerTags: ["deque"],
      feature: "deque 两端操作",
      trapType: "front_back_confusion",
      promptDirective: "围绕 deque push_front/push_back/pop_front/pop_back 的两端状态变化设计题。",
    },
    {
      suffix: "priority-queue-order",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "priority_queue_order",
      codeStructureTags: ["container-simulation", "heap"],
      containerTags: ["priority_queue", "heap"],
      feature: "priority_queue top/pop 序列",
      trapType: "min_heap_max_heap_confusion",
      promptDirective: "必须考 priority_queue top/pop 后的序列；要明确默认大根堆或自定义比较器。",
    },
    {
      suffix: "map-count-query",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "map_count_lookup",
      codeStructureTags: ["container-simulation", "branch"],
      containerTags: ["map"],
      feature: "map 计数后查询",
      trapType: "missing_key_default_value",
      promptDirective: "必须考 map 计数、下标访问默认值或 find/count 查询后的结果。",
    },
    {
      suffix: "set-unique-order",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "set_order_unique",
      codeStructureTags: ["container-simulation", "ordered-set"],
      containerTags: ["set"],
      feature: "set 去重与有序遍历",
      trapType: "insertion_order_confusion",
      promptDirective: "必须考 set 去重和有序遍历，不得只问 set 的概念定义。",
    },
    {
      suffix: "vector-erase-index",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "vector_index_mutation",
      codeStructureTags: ["array", "loop", "mutation"],
      containerTags: ["vector"],
      feature: "vector 下标与删除后位移",
      trapType: "index_shift_after_erase",
      promptDirective: "围绕 vector erase/insert 后的下标变化设计小规模可追踪题。",
    },
    {
      suffix: "binary-tree-traversal",
      minGespLevel: 6,
      noiTier: "entry",
      taskFlavor: "binary_tree_traversal",
      codeStructureTags: ["tree", "recursion"],
      containerTags: ["tree"],
      feature: "二叉树遍历序列",
      trapType: "pre_in_post_order_confusion",
      promptDirective: "必须考二叉树前序/中序/后序或层序遍历结果，节点数控制在 7 个以内。",
    },
    {
      suffix: "heap-array-index",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "heap_array_index",
      codeStructureTags: ["heap", "array-index"],
      containerTags: ["heap"],
      feature: "二叉堆数组下标关系",
      trapType: "zero_one_based_index",
      promptDirective: "必须考堆的父子下标、上滤/下滤一步后的数组状态。",
    },
    {
      suffix: "adjacency-list-bfs",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "bfs_adjacency_queue",
      codeStructureTags: ["graph", "bfs", "queue"],
      containerTags: ["graph", "queue"],
      feature: "邻接表 BFS 队列变化",
      trapType: "visited_timing_confusion",
      promptDirective: "必须考邻接表 BFS 队列变化和 visited 标记时机；图不超过 6 个点。",
    },
    {
      suffix: "adjacency-matrix-degree",
      minGespLevel: 6,
      noiTier: "entry",
      taskFlavor: "graph_matrix_degree",
      codeStructureTags: ["graph", "matrix"],
      containerTags: ["graph"],
      feature: "邻接矩阵度数/边数统计",
      trapType: "directed_undirected_confusion",
      promptDirective: "必须考邻接矩阵中有向/无向边计数或点度数，不得只问定义。",
    },
    {
      suffix: "union-find-small-merge",
      minGespLevel: 7,
      noiTier: "advanced",
      taskFlavor: "union_find_merge_query",
      codeStructureTags: ["disjoint-set", "path-compression"],
      containerTags: ["union_find"],
      feature: "并查集合并与查询",
      trapType: "parent_root_confusion",
      promptDirective: "必须考并查集小规模 union/find 后的连通性或 parent/root 关系。",
    },
  ]),
  ...buildGroup("ALG", [
    {
      suffix: "prefix-sum-query",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "prefix_sum_query",
      codeStructureTags: ["array", "prefix-sum"],
      feature: "前缀和区间查询",
      trapType: "inclusive_exclusive_boundary",
      promptDirective: "必须考前缀和下标边界，区间端点要明确是闭区间。",
    },
    {
      suffix: "difference-update",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "difference_array_update",
      codeStructureTags: ["array", "difference"],
      feature: "差分数组更新后还原",
      trapType: "right_boundary_plus_one",
      promptDirective: "必须考差分数组区间更新和还原，包含 r+1 边界。",
    },
    {
      suffix: "binary-search-boundary",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "binary_search_boundary",
      codeStructureTags: ["binary-search", "loop-invariant"],
      feature: "二分边界移动",
      trapType: "off_by_one_boundary",
      promptDirective: "必须考二分查找 l/r/mid 的边界移动，说明查找第一个满足条件的位置或最后一个满足条件的位置。",
    },
    {
      suffix: "greedy-local-choice",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "greedy_selection_trace",
      codeStructureTags: ["greedy", "sorting"],
      feature: "贪心选择序列",
      trapType: "local_choice_tie_break",
      promptDirective: "必须考贪心排序或选择顺序，给出可手算的小数组和明确 tie-break。",
    },
    {
      suffix: "dfs-order-trace",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "dfs_order_trace",
      codeStructureTags: ["graph", "dfs", "recursion"],
      containerTags: ["graph"],
      feature: "DFS 访问序",
      trapType: "recursion_return_order",
      promptDirective: "必须考 DFS 递归访问序或回溯顺序，邻接表顺序要固定。",
    },
    {
      suffix: "bfs-distance-trace",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "bfs_distance_trace",
      codeStructureTags: ["graph", "bfs", "queue"],
      containerTags: ["queue", "graph"],
      feature: "BFS 距离层次",
      trapType: "enqueue_vs_dequeue_marking",
      promptDirective: "必须考 BFS 距离或层次扩展，明确入队时标记 visited。",
    },
    {
      suffix: "one-dp-transition",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "dp_state_transition",
      codeStructureTags: ["dp", "array"],
      feature: "一维 DP 状态转移",
      trapType: "initial_state_confusion",
      promptDirective: "必须考一维 DP 的初始化和转移后的某个 dp 值，状态数不超过 8。",
    },
    {
      suffix: "knapsack-small-table",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "knapsack_table_trace",
      codeStructureTags: ["dp", "knapsack"],
      feature: "小背包 DP 表",
      trapType: "loop_direction_confusion",
      promptDirective: "必须考 0/1 背包或完全背包的小表格状态，突出循环方向差异。",
    },
    {
      suffix: "recurrence-sequence",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "recurrence_sequence_trace",
      codeStructureTags: ["recurrence", "loop"],
      feature: "递推序列",
      trapType: "base_case_confusion",
      promptDirective: "必须考递推初值和第 k 项，不能只问公式名称。",
    },
    {
      suffix: "sorting-swap-count",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "sorting_trace",
      codeStructureTags: ["sorting", "nested-loop"],
      feature: "排序过程状态",
      trapType: "stable_or_swap_count_confusion",
      promptDirective: "必须考冒泡/选择/插入/归并/快排之一的中间状态或交换次数。",
    },
    {
      suffix: "flood-fill-count",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "flood_fill_region_count",
      codeStructureTags: ["grid", "dfs", "bfs"],
      feature: "Flood Fill 连通块",
      trapType: "diagonal_adjacency_confusion",
      promptDirective: "必须考网格 Flood Fill 连通块大小或访问顺序，明确四连通/八连通。",
    },
    {
      suffix: "complexity-nested-bound",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "complexity_bound_reasoning",
      codeStructureTags: ["complexity", "nested-loop"],
      feature: "复杂度边界分析",
      trapType: "dependent_loop_bound",
      promptDirective: "必须考依赖循环边界的复杂度推理，不得只问单层循环次数。",
    },
  ]),
  ...buildGroup("CPP", [
    {
      suffix: "reference-alias",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "reference_alias_trace",
      codeStructureTags: ["reference", "mutation"],
      feature: "引用别名修改",
      trapType: "copy_vs_reference",
      promptDirective: "必须考引用形参或引用变量修改后原变量的值。",
    },
    {
      suffix: "pointer-array-access",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "pointer_array_trace",
      codeStructureTags: ["pointer", "array"],
      feature: "指针与数组访问",
      trapType: "offset_boundary",
      promptDirective: "必须考指针偏移访问数组元素，避免未定义行为。",
    },
    {
      suffix: "scope-shadowing",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "scope_shadowing_trace",
      codeStructureTags: ["scope", "branch"],
      feature: "变量作用域遮蔽",
      trapType: "inner_outer_variable",
      promptDirective: "必须考局部变量遮蔽外层变量后的输出或最终值。",
    },
    {
      suffix: "function-parameter-copy",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "function_parameter_trace",
      codeStructureTags: ["function", "parameter"],
      feature: "函数形参与实参",
      trapType: "pass_by_value_confusion",
      promptDirective: "必须考传值、传引用或 const 引用的行为差异。",
    },
    {
      suffix: "struct-field-sort",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "struct_sort_trace",
      codeStructureTags: ["struct", "sorting"],
      feature: "结构体字段排序",
      trapType: "tie_break_order",
      promptDirective: "必须考结构体排序比较器和 tie-break 后的顺序。",
    },
    {
      suffix: "string-mutation",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "string_mutation_trace",
      codeStructureTags: ["string", "loop"],
      feature: "string 下标修改",
      trapType: "char_vs_digit",
      promptDirective: "必须考 string 字符访问、修改或 find/substr 后的结果。",
    },
    {
      suffix: "char-ascii-conversion",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "char_ascii_trace",
      codeStructureTags: ["char", "conversion"],
      feature: "字符 ASCII 转换",
      trapType: "char_digit_value",
      promptDirective: "必须考字符与整数转换，明确输出的是字符还是整数。",
    },
    {
      suffix: "operator-precedence",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "operator_precedence_trace",
      codeStructureTags: ["expression", "operator"],
      feature: "运算符优先级",
      trapType: "precedence_associativity",
      promptDirective: "必须考复合表达式求值，避免未指定求值顺序。",
    },
    {
      suffix: "class-member-state",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "class_member_state",
      codeStructureTags: ["class", "method"],
      feature: "类成员状态变化",
      trapType: "static_vs_instance",
      promptDirective: "必须考简单类对象方法调用后的成员状态。",
    },
    {
      suffix: "iterator-loop",
      minGespLevel: 5,
      noiTier: "advanced",
      taskFlavor: "iterator_loop_trace",
      codeStructureTags: ["iterator", "container"],
      containerTags: ["vector"],
      feature: "迭代器遍历与修改",
      trapType: "iterator_position_after_increment",
      promptDirective: "必须考迭代器遍历或 erase 返回值，代码必须安全。",
    },
    {
      suffix: "bool-cout-conversion",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "bool_output_trace",
      codeStructureTags: ["expression", "bool"],
      feature: "布尔表达式输出",
      trapType: "bool_text_vs_integer",
      promptDirective: "必须明确 cout 输出 bool 的 0/1 语义，不得混用 true/false 文本选项。",
    },
    {
      suffix: "file-stream-state",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "stream_state_reasoning",
      codeStructureTags: ["stream", "io"],
      feature: "流状态与读写顺序",
      trapType: "read_order_confusion",
      promptDirective: "可用字符串流模拟文件读写顺序，避免依赖真实文件系统。",
    },
  ]),
  ...buildGroup("MATH", [
    {
      suffix: "gcd-lcm-trace",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "gcd_lcm_trace",
      codeStructureTags: ["number-theory", "loop"],
      feature: "gcd/lcm 计算",
      trapType: "division_order",
      promptDirective: "必须考辗转相除法或 lcm 公式中的中间值。",
    },
    {
      suffix: "modular-counting",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "modular_counting",
      codeStructureTags: ["modulo", "loop"],
      feature: "模运算计数",
      trapType: "negative_or_boundary_mod",
      promptDirective: "必须考模运算分类或计数，边界条件要明确。",
    },
    {
      suffix: "prime-sieve",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "prime_sieve_trace",
      codeStructureTags: ["sieve", "array"],
      feature: "素数筛标记",
      trapType: "start_from_square",
      promptDirective: "必须考埃氏筛/线性筛的标记过程或某一位是否为素数。",
    },
    {
      suffix: "factorization",
      minGespLevel: 5,
      noiTier: "entry",
      taskFlavor: "factorization_trace",
      codeStructureTags: ["number-theory", "loop"],
      feature: "质因数分解",
      trapType: "remaining_prime_factor",
      promptDirective: "必须考唯一分解或循环结束后剩余质因子处理。",
    },
    {
      suffix: "base-conversion",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "base_conversion_trace",
      codeStructureTags: ["base-conversion", "loop"],
      feature: "进制转换",
      trapType: "digit_order_reversal",
      promptDirective: "必须考二/八/十/十六进制转换或短程序输出。",
    },
    {
      suffix: "bitwise-mask",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "bitwise_mask_trace",
      codeStructureTags: ["bitwise", "expression"],
      feature: "位运算掩码",
      trapType: "shift_precedence",
      promptDirective: "必须考 &, |, ^, <<, >> 的确定性小数值结果。",
    },
    {
      suffix: "combinatorics-product",
      minGespLevel: 8,
      noiTier: "advanced",
      taskFlavor: "combinatorics_counting",
      codeStructureTags: ["combinatorics", "formula"],
      feature: "排列组合计数",
      trapType: "order_matters_confusion",
      promptDirective: "必须考加法/乘法原理、排列或组合的区别。",
    },
    {
      suffix: "pascal-triangle",
      minGespLevel: 8,
      noiTier: "advanced",
      taskFlavor: "pascal_triangle_trace",
      codeStructureTags: ["dp", "math"],
      feature: "杨辉三角状态",
      trapType: "row_column_index",
      promptDirective: "必须考杨辉三角的行列下标或组合数含义。",
    },
    {
      suffix: "gray-code",
      minGespLevel: 6,
      noiTier: "advanced",
      taskFlavor: "gray_code_transform",
      codeStructureTags: ["bitwise", "gray-code"],
      feature: "格雷编码转换",
      trapType: "binary_gray_direction",
      promptDirective: "必须考二进制与格雷码的转换方向和异或关系。",
    },
    {
      suffix: "arithmetic-progression",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "arithmetic_progression",
      codeStructureTags: ["formula", "loop"],
      feature: "等差数列求和",
      trapType: "inclusive_count",
      promptDirective: "必须考等差数列项数或求和边界。",
    },
    {
      suffix: "geometry-grid",
      minGespLevel: 8,
      noiTier: "advanced",
      taskFlavor: "geometry_grid_count",
      codeStructureTags: ["geometry", "formula"],
      feature: "平面几何或网格计数",
      trapType: "coordinate_boundary",
      promptDirective: "必须考坐标、面积、周长或网格点计数的小规模推理。",
    },
    {
      suffix: "probability-counting",
      minGespLevel: 8,
      noiTier: "advanced",
      taskFlavor: "probability_counting",
      codeStructureTags: ["counting", "fraction"],
      feature: "古典概型计数",
      trapType: "sample_space_confusion",
      promptDirective: "必须考样本空间与有利情况计数，结果可用分数表示。",
    },
  ]),
  ...buildGroup("BAS", [
    {
      suffix: "base-unit-conversion",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "storage_unit_conversion",
      codeStructureTags: ["concept", "calculation"],
      feature: "存储单位换算",
      trapType: "binary_decimal_unit",
      promptDirective: "必须考 B/KB/MB/GB 换算，明确 1024 进制。",
    },
    {
      suffix: "os-file-path",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "os_file_path_reasoning",
      codeStructureTags: ["concept", "environment"],
      feature: "操作系统与路径概念",
      trapType: "absolute_relative_path",
      promptDirective: "必须考操作系统、路径或文件概念中的可判定场景。",
    },
    {
      suffix: "network-ip-mask",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "network_ip_mask",
      codeStructureTags: ["network", "bitwise"],
      feature: "IP/网络基础",
      trapType: "host_network_part",
      promptDirective: "必须考 IP、协议或拓扑基础中的确定性判断。",
    },
    {
      suffix: "flowchart-branch",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "flowchart_branch_trace",
      codeStructureTags: ["flowchart", "branch"],
      feature: "流程图分支执行",
      trapType: "branch_condition_direction",
      promptDirective: "必须考流程图或伪代码中的分支路径和最终结果。",
    },
    {
      suffix: "data-representation",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "data_representation",
      codeStructureTags: ["encoding", "binary"],
      feature: "原码反码补码",
      trapType: "signed_representation",
      promptDirective: "必须考整数编码、补码或位级表示，不得只问定义。",
    },
    {
      suffix: "ascii-order",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "ascii_order_reasoning",
      codeStructureTags: ["encoding", "char"],
      feature: "ASCII 编码顺序",
      trapType: "digit_char_value",
      promptDirective: "必须考 ASCII 字符顺序或字符与数值差。",
    },
    {
      suffix: "complexity-concept",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "complexity_concept",
      codeStructureTags: ["complexity", "concept"],
      feature: "复杂度概念",
      trapType: "dominant_term",
      promptDirective: "必须考复杂度主项或增长比较，给出具体代码或函数。",
    },
    {
      suffix: "debug-trace",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "debug_trace_reasoning",
      codeStructureTags: ["debug", "trace"],
      feature: "调试与变量跟踪",
      trapType: "breakpoint_position",
      promptDirective: "必须考断点位置、变量值或调试输出的可追踪结果。",
    },
    {
      suffix: "compiler-error-class",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "compile_runtime_error",
      codeStructureTags: ["compile", "runtime"],
      feature: "编译/运行错误分类",
      trapType: "compile_vs_runtime",
      promptDirective: "必须考编译错误、运行错误、逻辑错误的区分。",
    },
    {
      suffix: "logic-truth-table",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "logic_truth_table",
      codeStructureTags: ["logic", "expression"],
      feature: "逻辑表达式真值",
      trapType: "short_circuit",
      promptDirective: "必须考 &&、||、! 的真值或短路求值。",
    },
    {
      suffix: "memory-layout-basic",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "memory_layout_basic",
      codeStructureTags: ["memory", "concept"],
      feature: "内存与变量存储",
      trapType: "address_vs_value",
      promptDirective: "必须考 CPU/内存/I/O 或变量地址和值的基础概念。",
    },
    {
      suffix: "algorithm-description",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "algorithm_description_match",
      codeStructureTags: ["pseudocode", "algorithm"],
      feature: "算法描述与伪代码",
      trapType: "input_output_contract",
      promptDirective: "必须考自然语言/伪代码与程序行为的匹配。",
    },
  ]),
  ...buildGroup("CS", [
    {
      suffix: "computer-history",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "computer_history_fact",
      codeStructureTags: ["concept"],
      feature: "计算机历史常识",
      trapType: "timeline_confusion",
      promptDirective: "必须考计算机发展或人物事件的基础常识，避免争议性表述。",
    },
    {
      suffix: "hardware-component",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "hardware_component_role",
      codeStructureTags: ["concept", "hardware"],
      feature: "硬件部件职责",
      trapType: "cpu_memory_io_confusion",
      promptDirective: "必须考 CPU、内存、外设的职责区分。",
    },
    {
      suffix: "software-layer",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "software_layer_role",
      codeStructureTags: ["concept", "os"],
      feature: "软件层次职责",
      trapType: "os_application_confusion",
      promptDirective: "必须考操作系统、应用软件、编译器的职责。",
    },
    {
      suffix: "network-protocol",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "network_protocol_role",
      codeStructureTags: ["network", "protocol"],
      feature: "网络协议用途",
      trapType: "protocol_layer_confusion",
      promptDirective: "必须考常见协议或网络结构的职责，不涉及用户隐私数据。",
    },
    {
      suffix: "file-system",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "file_system_operation",
      codeStructureTags: ["file", "os"],
      feature: "文件系统操作",
      trapType: "path_permission_confusion",
      promptDirective: "必须考文件名、扩展名、路径或权限基础。",
    },
    {
      suffix: "encoding-text",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "text_encoding_fact",
      codeStructureTags: ["encoding"],
      feature: "文本编码常识",
      trapType: "byte_char_confusion",
      promptDirective: "必须考 ASCII/Unicode/字符编码的基础区别。",
    },
    {
      suffix: "security-basic",
      minGespLevel: 2,
      noiTier: "entry",
      taskFlavor: "security_basic_practice",
      codeStructureTags: ["security"],
      feature: "信息安全基础",
      trapType: "authentication_authorization",
      promptDirective: "必须考密码、权限、备份或网络安全基础实践。",
    },
    {
      suffix: "database-basic",
      minGespLevel: 3,
      noiTier: "entry",
      taskFlavor: "database_basic_concept",
      codeStructureTags: ["data", "table"],
      feature: "表格数据概念",
      trapType: "row_column_confusion",
      promptDirective: "必须考表格、记录、字段等基础数据组织概念。",
    },
    {
      suffix: "linux-command",
      minGespLevel: 5,
      noiTier: "advanced",
      taskFlavor: "linux_command_effect",
      codeStructureTags: ["linux", "command"],
      feature: "Linux 命令作用",
      trapType: "command_option_confusion",
      promptDirective: "必须考常见 Linux 命令或编译命令的作用，不执行真实命令。",
    },
    {
      suffix: "compiler-option",
      minGespLevel: 5,
      noiTier: "advanced",
      taskFlavor: "compiler_option_effect",
      codeStructureTags: ["compiler", "g++"],
      feature: "g++ 编译选项",
      trapType: "compile_link_run_confusion",
      promptDirective: "必须考 g++ 编译选项、标准版本或输出文件名。",
    },
    {
      suffix: "time-memory-limit",
      minGespLevel: 4,
      noiTier: "entry",
      taskFlavor: "resource_limit_reasoning",
      codeStructureTags: ["complexity", "resource"],
      feature: "时间/空间限制",
      trapType: "time_memory_tradeoff",
      promptDirective: "必须考时间限制、空间限制与算法复杂度的对应关系。",
    },
    {
      suffix: "contest-rule",
      minGespLevel: 1,
      noiTier: "entry",
      taskFlavor: "contest_rule_practice",
      codeStructureTags: ["contest", "practice"],
      feature: "竞赛/认证规范常识",
      trapType: "allowed_tool_confusion",
      promptDirective: "必须考认证或机考环境中的基础规范，不伪造官方来源。",
    },
  ]),
];

export function kpGroupFromCode(kpCode: string): KpGroup | string {
  return kpCode.split("-")[0]?.toUpperCase() ?? kpCode;
}

export function listArchetypesForCombo(params: {
  examType: ExamType;
  questionType: QuestionType;
  kpGroup: string;
  difficulty: Difficulty;
}): QuestionArchetype[] {
  const kpGroup = kpGroupFromCode(params.kpGroup);
  return questionArchetypes
    .filter(
      (archetype) =>
        archetype.kpGroup === kpGroup &&
        archetype.questionTypes.includes(params.questionType) &&
        archetype.difficulties.includes(params.difficulty) &&
        archetype.examCoverage.includes(params.examType),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffled<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((left, right) => {
    const leftHash = hashText(`${seed}:${left.id}`);
    const rightHash = hashText(`${seed}:${right.id}`);
    return leftHash - rightHash || left.id.localeCompare(right.id);
  });
}

export function buildArchetypePlanForBundle(params: {
  examType: ExamType;
  questionType: QuestionType;
  kpGroup: string;
  difficulty: Difficulty;
  bundleNo: number;
  questionsPerBundle: number;
  seed: string;
}): ArchetypePlanItem[] {
  const archetypes = shuffled(
    listArchetypesForCombo(params),
    `${params.seed}:${params.examType}:${params.questionType}:${params.kpGroup}:${params.difficulty}`,
  );
  if (archetypes.length < 12) {
    throw new Error(
      `archetype coverage below 12 for ${params.examType}|${params.questionType}|${params.difficulty}|${params.kpGroup}: ${archetypes.length}`,
    );
  }
  if (params.questionsPerBundle > archetypes.length) {
    throw new Error(
      `questionsPerBundle ${params.questionsPerBundle} exceeds archetype coverage ${archetypes.length}`,
    );
  }

  const start = ((params.bundleNo - 1) * params.questionsPerBundle) % archetypes.length;
  return Array.from({ length: params.questionsPerBundle }, (_entry, itemIndex) => {
    const archetype = archetypes[(start + itemIndex) % archetypes.length]!;
    return {
      itemIndex,
      archetypeId: archetype.id,
      kpGroup: archetype.kpGroup,
      taskFlavor: archetype.taskFlavor,
      codeStructureTags: archetype.codeStructureTags,
      containerTags: archetype.containerTags,
      promptDirective: archetype.promptDirective,
      rejectRules: archetype.rejectRules,
      difficultyProfile: archetype.difficultyProfile[params.difficulty],
    };
  });
}

export function archetypeCoverageGrid() {
  return Object.values(blueprintSpecs).flatMap((spec) =>
    spec.sections.flatMap((section) =>
      section.primaryKpQuota.flatMap((quota) =>
        Object.keys(section.difficultyDistribution).map((difficulty) => ({
          examType: spec.examType,
          questionType: section.questionType,
          kpGroup: quota.kpCode,
          difficulty: difficulty as Difficulty,
          availableArchetypes: listArchetypesForCombo({
            examType: spec.examType,
            questionType: section.questionType,
            kpGroup: quota.kpCode,
            difficulty: difficulty as Difficulty,
          }).length,
        })),
      ),
    ),
  );
}
