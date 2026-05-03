// ── 通用 Section 模板 ────────────────────────────────────────
function cspJSections(kpQuotas) {
    return [
        {
            questionType: "single_choice",
            questionCount: 15,
            pointsPerQuestion: 2,
            maxScore: 30,
            difficultyDistribution: kpQuotas.diffSc ?? { easy: 0.4, medium: 0.4, hard: 0.2 },
            primaryKpQuota: kpQuotas.sc,
        },
        {
            questionType: "reading_program",
            questionCount: 3,
            groupCount: 3,
            subQuestionsPerGroup: 5,
            pointsPerQuestion: 8,
            maxScore: 40,
            difficultyDistribution: kpQuotas.diffRp ?? { easy: 0.2, medium: 0.5, hard: 0.3 },
            primaryKpQuota: kpQuotas.rp,
        },
        {
            questionType: "completion_program",
            questionCount: 2,
            groupCount: 2,
            subQuestionsPerGroup: 5,
            pointsPerQuestion: 3,
            maxScore: 30,
            difficultyDistribution: kpQuotas.diffCp ?? { easy: 0.2, medium: 0.4, hard: 0.4 },
            primaryKpQuota: kpQuotas.cp,
        },
    ];
}
// 对 GESP 试卷类型，复用 CSP 三段式结构，但知识范围和难度不同
function gespSections(kpQuotas) {
    return [
        {
            questionType: "single_choice",
            questionCount: 15,
            pointsPerQuestion: 2,
            maxScore: 30,
            difficultyDistribution: kpQuotas.diff,
            primaryKpQuota: kpQuotas.sc,
        },
        {
            questionType: "reading_program",
            questionCount: 3,
            groupCount: 3,
            subQuestionsPerGroup: 5,
            pointsPerQuestion: 8,
            maxScore: 40,
            difficultyDistribution: {
                easy: kpQuotas.diff.easy * 0.6,
                medium: kpQuotas.diff.medium * 1.1,
                hard: kpQuotas.diff.hard * 1.3,
            },
            primaryKpQuota: kpQuotas.rp,
        },
        {
            questionType: "completion_program",
            questionCount: 2,
            groupCount: 2,
            subQuestionsPerGroup: 5,
            pointsPerQuestion: 3,
            maxScore: 30,
            difficultyDistribution: {
                easy: kpQuotas.diff.easy * 0.5,
                medium: kpQuotas.diff.medium,
                hard: kpQuotas.diff.hard * 1.5,
            },
            primaryKpQuota: kpQuotas.cp,
        },
    ];
}
// ── 各试卷类型蓝图 ──────────────────────────────────────────
export const blueprintSpecs = {
    "CSP-J": {
        examType: "CSP-J",
        durationMinutes: 120,
        sections: cspJSections({
            sc: [
                { kpCode: "BAS", count: 4 },
                { kpCode: "CPP", count: 4 },
                { kpCode: "ALG", count: 3 },
                { kpCode: "DS", count: 2 },
                { kpCode: "MATH", count: 1 },
                { kpCode: "CS", count: 1 },
            ],
            rp: [
                { kpCode: "CPP", count: 1 },
                { kpCode: "ALG", count: 1 },
                { kpCode: "DS", count: 1 },
            ],
            cp: [
                { kpCode: "ALG", count: 1 },
                { kpCode: "DS", count: 1 },
            ],
        }),
    },
    "CSP-S": {
        examType: "CSP-S",
        durationMinutes: 120,
        sections: cspJSections({
            sc: [
                { kpCode: "ALG", count: 4 },
                { kpCode: "DS", count: 4 },
                { kpCode: "CPP", count: 3 },
                { kpCode: "MATH", count: 2 },
                { kpCode: "BAS", count: 1 },
                { kpCode: "CS", count: 1 },
            ],
            rp: [
                { kpCode: "ALG", count: 2 },
                { kpCode: "DS", count: 1 },
            ],
            cp: [
                { kpCode: "ALG", count: 1 },
                { kpCode: "DS", count: 1 },
            ],
            diffSc: { easy: 0.2, medium: 0.5, hard: 0.3 },
            diffRp: { easy: 0.1, medium: 0.5, hard: 0.4 },
            diffCp: { easy: 0.1, medium: 0.4, hard: 0.5 },
        }),
    },
    "GESP-1": {
        examType: "GESP-1",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "BAS", count: 5 },
                { kpCode: "CPP", count: 8 },
                { kpCode: "CS", count: 2 },
            ],
            rp: [{ kpCode: "CPP", count: 3 }],
            cp: [{ kpCode: "CPP", count: 2 }],
            diff: { easy: 0.5, medium: 0.4, hard: 0.1 },
        }),
    },
    "GESP-2": {
        examType: "GESP-2",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "BAS", count: 4 },
                { kpCode: "CPP", count: 8 },
                { kpCode: "CS", count: 3 },
            ],
            rp: [{ kpCode: "CPP", count: 3 }],
            cp: [{ kpCode: "CPP", count: 2 }],
            diff: { easy: 0.5, medium: 0.4, hard: 0.1 },
        }),
    },
    "GESP-3": {
        examType: "GESP-3",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "BAS", count: 4 },
                { kpCode: "CPP", count: 5 },
                { kpCode: "ALG", count: 4 },
                { kpCode: "MATH", count: 2 },
            ],
            rp: [
                { kpCode: "CPP", count: 1 },
                { kpCode: "ALG", count: 2 },
            ],
            cp: [{ kpCode: "ALG", count: 2 }],
            diff: { easy: 0.4, medium: 0.4, hard: 0.2 },
        }),
    },
    "GESP-4": {
        examType: "GESP-4",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "CPP", count: 5 },
                { kpCode: "ALG", count: 5 },
                { kpCode: "BAS", count: 3 },
                { kpCode: "MATH", count: 2 },
            ],
            rp: [
                { kpCode: "CPP", count: 1 },
                { kpCode: "ALG", count: 2 },
            ],
            cp: [{ kpCode: "ALG", count: 2 }],
            diff: { easy: 0.4, medium: 0.4, hard: 0.2 },
        }),
    },
    "GESP-5": {
        examType: "GESP-5",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "ALG", count: 5 },
                { kpCode: "CPP", count: 3 },
                { kpCode: "MATH", count: 3 },
                { kpCode: "DS", count: 2 },
                { kpCode: "BAS", count: 2 },
            ],
            rp: [
                { kpCode: "ALG", count: 2 },
                { kpCode: "DS", count: 1 },
            ],
            cp: [
                { kpCode: "ALG", count: 1 },
                { kpCode: "MATH", count: 1 },
            ],
            diff: { easy: 0.3, medium: 0.45, hard: 0.25 },
        }),
    },
    "GESP-6": {
        examType: "GESP-6",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "DS", count: 5 },
                { kpCode: "ALG", count: 5 },
                { kpCode: "CPP", count: 3 },
                { kpCode: "MATH", count: 2 },
            ],
            rp: [
                { kpCode: "ALG", count: 2 },
                { kpCode: "DS", count: 1 },
            ],
            cp: [
                { kpCode: "ALG", count: 1 },
                { kpCode: "DS", count: 1 },
            ],
            diff: { easy: 0.3, medium: 0.45, hard: 0.25 },
        }),
    },
    "GESP-7": {
        examType: "GESP-7",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "ALG", count: 5 },
                { kpCode: "DS", count: 5 },
                { kpCode: "CPP", count: 3 },
                { kpCode: "MATH", count: 2 },
            ],
            rp: [
                { kpCode: "ALG", count: 2 },
                { kpCode: "DS", count: 1 },
            ],
            cp: [
                { kpCode: "ALG", count: 1 },
                { kpCode: "DS", count: 1 },
            ],
            diff: { easy: 0.2, medium: 0.45, hard: 0.35 },
        }),
    },
    "GESP-8": {
        examType: "GESP-8",
        durationMinutes: 60,
        sections: gespSections({
            sc: [
                { kpCode: "ALG", count: 4 },
                { kpCode: "DS", count: 4 },
                { kpCode: "MATH", count: 4 },
                { kpCode: "CPP", count: 3 },
            ],
            rp: [
                { kpCode: "ALG", count: 2 },
                { kpCode: "DS", count: 1 },
            ],
            cp: [
                { kpCode: "ALG", count: 1 },
                { kpCode: "MATH", count: 1 },
            ],
            diff: { easy: 0.2, medium: 0.45, hard: 0.35 },
        }),
    },
};
/** 当前蓝图版本 — 修改蓝图参数后递增 */
export const BLUEPRINT_VERSION = 1;
