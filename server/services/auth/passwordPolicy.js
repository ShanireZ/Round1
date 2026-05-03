import zxcvbn from "zxcvbn";
function compactUserInputs(input) {
    return [input.username, input.displayName, input.email]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
export function getPasswordPolicy(role) {
    const isAdmin = role === "admin";
    return {
        minScore: isAdmin ? 4 : 3,
        minLength: isAdmin ? 14 : 8,
    };
}
export function validatePasswordStrength(input) {
    const policy = getPasswordPolicy(input.role);
    const strength = zxcvbn(input.password, compactUserInputs(input));
    if (input.password.length < policy.minLength) {
        return {
            ok: false,
            score: strength.score,
            minScore: policy.minScore,
            minLength: policy.minLength,
            code: "ROUND1_WEAK_PASSWORD",
            message: input.role === "admin"
                ? "管理员密码至少 14 位，并且需要达到管理员强度要求"
                : "密码强度不足，请使用更复杂的密码",
        };
    }
    if (strength.score < policy.minScore) {
        return {
            ok: false,
            score: strength.score,
            minScore: policy.minScore,
            minLength: policy.minLength,
            code: "ROUND1_WEAK_PASSWORD",
            message: input.role === "admin"
                ? "管理员密码强度不足，请使用更长的随机密码或短语"
                : "密码强度不足，请使用更复杂的密码",
        };
    }
    return {
        ok: true,
        score: strength.score,
        minScore: policy.minScore,
        minLength: policy.minLength,
    };
}
