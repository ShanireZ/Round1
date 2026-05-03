/**
 * 去重服务 — content_hash 精确去重 + Jaccard 近似去重
 */
import crypto from "node:crypto";
import { db } from "../db.js";
import { questions } from "../db/schema/questions.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";
/** Jaccard 相似度阈值 — ≥0.85 视为重复 */
const JACCARD_THRESHOLD = 0.85;
const SALIENT_JACCARD_THRESHOLD = 0.65;
/**
 * content_hash 规范化规则：
 * 1. 去除所有空白字符
 * 2. 全部转小写
 * 3. 去除标点符号
 * 4. sha256 哈希
 */
export function computeContentHash(stem, codeOrOptions) {
    const raw = `${stem}${codeOrOptions}`;
    const normalized = raw
        .replace(/\s+/g, "")
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]/g, "");
    return crypto.createHash("sha256").update(normalized, "utf-8").digest("hex");
}
/**
 * 检查 content_hash 精确重复
 */
export async function isDuplicateByHash(contentHash) {
    const existing = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.contentHash, contentHash))
        .limit(1);
    return existing.length > 0;
}
/**
 * Jaccard 相似度 — 基于 n-gram (n=3) 集合交并比
 */
export function jaccardSimilarity(a, b) {
    const ngramsA = toNGrams(a, 3);
    const ngramsB = toNGrams(b, 3);
    if (ngramsA.size === 0 && ngramsB.size === 0)
        return 1;
    if (ngramsA.size === 0 || ngramsB.size === 0)
        return 0;
    let intersection = 0;
    for (const gram of ngramsA) {
        if (ngramsB.has(gram))
            intersection++;
    }
    const union = ngramsA.size + ngramsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
function toNGrams(text, n) {
    const cleaned = text.replace(/\s+/g, "").toLowerCase();
    const grams = new Set();
    for (let i = 0; i <= cleaned.length - n; i++) {
        grams.add(cleaned.slice(i, i + n));
    }
    return grams;
}
function asRecord(value) {
    return typeof value === "object" && value !== null ? value : {};
}
function readString(record, key) {
    const value = record[key];
    return typeof value === "string" ? value : "";
}
function readStringArray(record, key) {
    const value = record[key];
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
function readRecordArray(record, key) {
    const value = record[key];
    return Array.isArray(value)
        ? value
            .filter((entry) => typeof entry === "object" && entry !== null)
            .map((entry) => entry)
        : [];
}
export function buildQuestionSimilarityText(questionType, contentJson) {
    const content = asRecord(contentJson);
    if (questionType === "single_choice") {
        return [readString(content, "stem"), ...readStringArray(content, "options")].join("\n");
    }
    if (questionType === "reading_program") {
        return [
            readString(content, "cppCode"),
            ...readRecordArray(content, "subQuestions").flatMap((subQuestion) => [
                readString(subQuestion, "stem"),
                ...readStringArray(subQuestion, "options"),
            ]),
            ...readStringArray(content, "sampleInputs"),
            ...readStringArray(content, "expectedOutputs"),
        ].join("\n");
    }
    return [
        readString(content, "cppCode"),
        readString(content, "fullCode"),
        ...readRecordArray(content, "blanks").flatMap((blank) => [
            readString(blank, "id"),
            ...readStringArray(blank, "options"),
        ]),
        ...readStringArray(content, "sampleInputs"),
        ...readStringArray(content, "expectedOutputs"),
    ].join("\n");
}
const COMMON_SIMILARITY_PATTERNS = [
    /#include\s*<[^>]+>/gi,
    /\busing\s+namespace\s+std\s*;?/gi,
    /\bint\s+main\s*\(\s*\)\s*\{?/gi,
    /\breturn\s+0\s*;?/gi,
    /\b(?:int|long|long long|double|float|char|bool|string|void|auto|const)\b/gi,
    /\b(?:cin|cout|endl|std|vector|stack|queue|priority_queue|map|set|pair)\b/gi,
    /\b(?:for|while|if|else|switch|case|break|continue)\b/gi,
    /\b(?:ans|sum|cnt|res|tmp|temp|flag|num|arr|a|b|c|d|i|j|k|n|m|x|y|z)\b/gi,
    /阅读|下面|以下|程序|代码|回答|问题|下列|选项|正确|错误|输入|输出|结果/g,
    /循环|执行|次数|变量|影响|复杂度|时间复杂度|空间复杂度/g,
    /入栈|出栈|栈|入队|出队|队列|计算机|理论|知识/g,
    /BLANK\d+/gi,
    /[{}()[\];,.:+\-*/%<>=!&|^~"'`\\]/g,
];
export function buildQuestionSalientText(similarityText) {
    let result = similarityText;
    for (const pattern of COMMON_SIMILARITY_PATTERNS) {
        result = result.replace(pattern, " ");
    }
    return result.replace(/\s+/g, " ").trim();
}
const PARAMETERIZED_CODE_TEMPLATE_PATTERNS = [
    {
        questionTypes: ["reading_program", "completion_program"],
        patterns: [/\bqueue\s*</i, /\.push\s*\(/i, /\.pop\s*\(/i, /\.front\s*\(/i, /\.size\s*\(/i],
        minMatches: 3,
    },
    {
        questionTypes: ["reading_program", "completion_program"],
        patterns: [/\bstack\s*</i, /\.push\s*\(/i, /\.pop\s*\(/i, /\.top\s*\(/i, /\(\s*'\('\s*\)|\(\s*'\)'\s*\)/i],
        minMatches: 3,
    },
    {
        questionTypes: ["reading_program", "completion_program"],
        patterns: [/\bans\s*=\s*0\b/i, /\bfor\s*\(/i, /%\s*(?:\d+|[a-z_][a-z0-9_]*)/i],
        minMatches: 3,
    },
    {
        questionTypes: ["reading_program", "completion_program"],
        patterns: [/\bmid\b/i, /\bl\s*<=\s*r\b/i, /\bmid\s*-\s*1\b/i, /\bmid\s*\+\s*1\b/i],
        minMatches: 3,
    },
    {
        questionTypes: ["single_choice"],
        patterns: [/二分|有序数组|binary/i, /比较|comparison/i, /长度|length/i],
        minMatches: 2,
    },
    {
        questionTypes: ["single_choice"],
        patterns: [/排序|sort/i, /复杂度|complexity|O\s*\(/i, /log/i],
        minMatches: 2,
    },
];
function templatePatternMatches(text, patterns) {
    return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}
export function isLikelyParameterizedTemplateSimilarity(questionType, leftText, rightText) {
    for (const template of PARAMETERIZED_CODE_TEMPLATE_PATTERNS) {
        if (!template.questionTypes.includes(questionType)) {
            continue;
        }
        const leftMatches = templatePatternMatches(leftText, template.patterns);
        const rightMatches = templatePatternMatches(rightText, template.patterns);
        if (leftMatches >= template.minMatches && rightMatches >= template.minMatches) {
            return true;
        }
    }
    return false;
}
/**
 * Jaccard 近似去重 — 与同类型同知识点的已有题目比较
 *
 * @returns 如果发现近似重复，返回重复题目的 ID；否则返回 null
 */
export async function findJaccardDuplicate(params) {
    // 获取同类型同知识点的已有题目
    const candidates = await db
        .select({
        id: questions.id,
        contentJson: questions.contentJson,
    })
        .from(questions)
        .where(and(eq(questions.type, params.questionType), eq(questions.primaryKpId, params.primaryKpId)));
    const candidateText = buildQuestionSimilarityText(params.questionType, params.contentJson);
    const candidateSalientText = buildQuestionSalientText(candidateText);
    for (const candidate of candidates) {
        const existingText = buildQuestionSimilarityText(params.questionType, candidate.contentJson);
        const existingSalientText = buildQuestionSalientText(existingText);
        const similarity = jaccardSimilarity(candidateText, existingText);
        const salientSimilarity = jaccardSimilarity(candidateSalientText, existingSalientText);
        if (similarity >= JACCARD_THRESHOLD &&
            salientSimilarity >= SALIENT_JACCARD_THRESHOLD &&
            !isLikelyParameterizedTemplateSimilarity(params.questionType, candidateText, existingText)) {
            logger.info({
                newText: candidateText.slice(0, 50),
                existingId: candidate.id,
                similarity,
                salientSimilarity,
            }, "Jaccard duplicate detected");
            return candidate.id;
        }
    }
    return null;
}
