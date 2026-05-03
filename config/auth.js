/**
 * Validate and sanitize return-to URLs to prevent open redirect.
 * Only accepts site-relative paths (starts with / but not //).
 */
export function safeReturnTo(input) {
    if (!input)
        return "/";
    try {
        const decoded = decodeURIComponent(input);
        // Must start with / but not //
        if (!decoded.startsWith("/") || decoded.startsWith("//"))
            return "/";
        // Block dangerous protocols
        const lower = decoded.toLowerCase();
        if (lower.startsWith("javascript:") || lower.startsWith("data:"))
            return "/";
        // Use URL constructor to verify it resolves to same origin
        const url = new URL(decoded, "https://placeholder.local");
        if (url.origin !== "https://placeholder.local")
            return "/";
        return decoded;
    }
    catch {
        return "/";
    }
}
