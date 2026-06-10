/**
 * Word-boundary keyword matching for bank-statement narrations.
 *
 * Plain `String.includes` matches inside other words — "CURRENT" contains
 * "RENT", "PAYEE" contains "PAYE", "CITIBANK" contains "CIT" — which silently
 * misclassifies transactions. Boundaries are only asserted where the keyword
 * edge is a word character, so prefix keywords like "INV-" still match
 * "INV-1001". Plural/variant forms must be listed explicitly by callers.
 */

const patternCache = new Map<string, RegExp>();

function keywordPattern(keyword: string): RegExp {
  let pattern = patternCache.get(keyword);

  if (!pattern) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lead = /^\w/.test(keyword) ? "\\b" : "";
    const trail = /\w$/.test(keyword) ? "\\b" : "";
    pattern = new RegExp(`${lead}${escaped}${trail}`);
    patternCache.set(keyword, pattern);
  }

  return pattern;
}

export function includesKeyword(text: string, keyword: string): boolean {
  return keywordPattern(keyword).test(text);
}

export function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => includesKeyword(text, keyword));
}
