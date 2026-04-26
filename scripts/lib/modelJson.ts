function extractBalancedJsonObject(text: string): string | undefined {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth++;
      continue;
    }

    if (char !== "}" || depth === 0) {
      continue;
    }

    depth--;
    if (depth === 0 && start >= 0) {
      return text.slice(start, index + 1);
    }
  }

  return undefined;
}

export function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const extracted = extractBalancedJsonObject(fenced[1].trim());
    if (extracted) {
      return extracted;
    }
    return fenced[1].trim();
  }

  const extracted = extractBalancedJsonObject(trimmed);
  if (extracted) {
    return extracted;
  }

  throw new Error("Model output does not contain a JSON object");
}
