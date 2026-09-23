// src/utils/sanitize.js
// Defense-in-depth sanitizer for user-generated plain-text content (Day 41 §8).
// We store comments / contact messages as PLAIN TEXT and the FE renders them as
// React text nodes (auto-escaped), so this is a second layer, not the only one.
// Strategy: strip anything that looks like HTML markup and neutralise the
// javascript:/data: URL schemes, then collapse leftover angle brackets. We never
// try to "allow some tags" — this content is never rendered as raw HTML.

const SCRIPTISH = /<\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const ANY_TAG = /<\/?[a-z][\s\S]*?>/gi;
const DANGEROUS_SCHEME = /(javascript|data|vbscript)\s*:/gi;

/**
 * Strip HTML/script markup from a plain-text field. Returns a trimmed string.
 * Non-string input yields an empty string.
 * @param {unknown} value
 * @returns {string}
 */
export const sanitizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(SCRIPTISH, '')
    .replace(ANY_TAG, '')
    .replace(DANGEROUS_SCHEME, '')
    .replace(/[<>]/g, '')
    .trim();
};

export default sanitizeText;
