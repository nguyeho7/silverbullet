/**
 * Org-mode inline markup parser
 *
 * Handles:
 * - *bold*
 * - /italic/
 * - _underline_
 * - +strikethrough+
 * - ~code~
 * - =verbatim=
 * - [[link]] and [[link][description]]
 * - <active timestamp> and [inactive timestamp]
 */

export type InlineElementType =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "verbatim"
  | "link"
  | "timestamp-active"
  | "timestamp-inactive"
  | "text";

export interface InlineElement {
  type: InlineElementType;
  from: number; // Start position in the line
  to: number;   // End position in the line
  content: string; // The text content (without markup)
  raw: string;  // The raw text including markup
}

export interface LinkElement extends InlineElement {
  type: "link";
  target: string;
  description?: string;
}

export interface TimestampElement extends InlineElement {
  type: "timestamp-active" | "timestamp-inactive";
  date: string;
  time?: string;
  repeater?: string;
}

/**
 * Pre/post characters that allow markup to be recognized
 * Markup is only valid if preceded/followed by these
 */
const PRE_CHARS = /^|[\s\-({'"]/;
const POST_CHARS = /$|[\s\-.,:!?;'")}\]]/;

/**
 * Check if a character at position is a valid pre-marker character
 */
function isValidPre(text: string, pos: number): boolean {
  if (pos === 0) return true;
  return PRE_CHARS.test(text[pos - 1]);
}

/**
 * Check if a character at position is a valid post-marker character
 */
function isValidPost(text: string, pos: number): boolean {
  if (pos >= text.length) return true;
  return POST_CHARS.test(text[pos]);
}

/**
 * Find matching closing marker for emphasis markup
 */
function findClosingMarker(
  text: string,
  marker: string,
  startPos: number,
): number {
  let pos = startPos;
  while (pos < text.length) {
    const idx = text.indexOf(marker, pos);
    if (idx === -1) return -1;

    // Check if it's a valid closing marker
    // Must not be preceded by whitespace and must be followed by valid post char
    if (
      idx > startPos &&
      !/\s/.test(text[idx - 1]) &&
      isValidPost(text, idx + marker.length)
    ) {
      return idx;
    }
    pos = idx + 1;
  }
  return -1;
}

/**
 * Parse a single emphasis element (bold, italic, etc.)
 */
function parseEmphasis(
  text: string,
  pos: number,
  marker: string,
  type: InlineElementType,
): InlineElement | null {
  if (text[pos] !== marker) return null;
  if (!isValidPre(text, pos)) return null;

  // Check character after marker is not whitespace
  if (pos + 1 >= text.length || /\s/.test(text[pos + 1])) {
    return null;
  }

  const endPos = findClosingMarker(text, marker, pos + 1);
  if (endPos === -1) return null;

  const content = text.substring(pos + 1, endPos);
  // Content must not be empty and must not contain newlines
  if (!content || content.includes("\n")) return null;

  return {
    type,
    from: pos,
    to: endPos + 1,
    content,
    raw: text.substring(pos, endPos + 1),
  };
}

/**
 * Parse an org-mode link: [[target]] or [[target][description]]
 */
function parseLink(text: string, pos: number): LinkElement | null {
  if (text.substring(pos, pos + 2) !== "[[") return null;

  // Find the closing ]]
  let depth = 0;
  let targetEnd = -1;
  let descStart = -1;
  let descEnd = -1;

  for (let i = pos + 2; i < text.length; i++) {
    if (text.substring(i, i + 2) === "[[") {
      depth++;
    } else if (text.substring(i, i + 2) === "]]") {
      if (depth === 0) {
        if (descStart === -1) {
          targetEnd = i;
        } else {
          descEnd = i;
        }
        break;
      }
      depth--;
    } else if (text.substring(i, i + 2) === "][" && depth === 0 && targetEnd === -1) {
      targetEnd = i;
      descStart = i + 2;
    }
  }

  if (targetEnd === -1) return null;

  const target = text.substring(pos + 2, targetEnd);
  const endPos = descEnd !== -1 ? descEnd + 2 : targetEnd + 2;
  const description = descStart !== -1 && descEnd !== -1
    ? text.substring(descStart, descEnd)
    : undefined;

  return {
    type: "link",
    from: pos,
    to: endPos,
    content: description || target,
    raw: text.substring(pos, endPos),
    target,
    description,
  };
}

/**
 * Parse an org-mode timestamp
 * Active: <2024-01-15 Mon> or <2024-01-15 Mon 10:00>
 * Inactive: [2024-01-15 Mon] or [2024-01-15 Mon 10:00]
 */
function parseTimestamp(text: string, pos: number): TimestampElement | null {
  const activeMatch = text.substring(pos).match(
    /^<(\d{4}-\d{2}-\d{2})(?:\s+[A-Za-z]{3})?(?:\s+(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?(?:\s+(\+\d+[dwmy]))?>/
  );
  const inactiveMatch = text.substring(pos).match(
    /^\[(\d{4}-\d{2}-\d{2})(?:\s+[A-Za-z]{3})?(?:\s+(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?(?:\s+(\+\d+[dwmy]))?\]/
  );

  const match = activeMatch || inactiveMatch;
  if (!match) return null;

  const isActive = !!activeMatch;
  const raw = match[0];

  return {
    type: isActive ? "timestamp-active" : "timestamp-inactive",
    from: pos,
    to: pos + raw.length,
    content: raw,
    raw,
    date: match[1],
    time: match[2],
    repeater: match[4],
  };
}

/**
 * Parse all inline elements in a line of text
 */
export function parseInline(text: string): InlineElement[] {
  const elements: InlineElement[] = [];
  let pos = 0;

  while (pos < text.length) {
    let element: InlineElement | null = null;

    // Try to parse each type of markup
    switch (text[pos]) {
      case "*":
        element = parseEmphasis(text, pos, "*", "bold");
        break;
      case "/":
        element = parseEmphasis(text, pos, "/", "italic");
        break;
      case "_":
        element = parseEmphasis(text, pos, "_", "underline");
        break;
      case "+":
        element = parseEmphasis(text, pos, "+", "strikethrough");
        break;
      case "~":
        element = parseEmphasis(text, pos, "~", "code");
        break;
      case "=":
        element = parseEmphasis(text, pos, "=", "verbatim");
        break;
      case "[":
        if (text[pos + 1] === "[") {
          element = parseLink(text, pos);
        } else {
          element = parseTimestamp(text, pos);
        }
        break;
      case "<":
        element = parseTimestamp(text, pos);
        break;
    }

    if (element) {
      elements.push(element);
      pos = element.to;
    } else {
      pos++;
    }
  }

  return elements;
}

/**
 * Cache for parsed inline content
 * Maps line text -> parsed elements
 */
const inlineCache = new Map<string, InlineElement[]>();
const CACHE_MAX_SIZE = 1000;

/**
 * Parse inline with caching
 */
export function parseInlineCached(text: string): InlineElement[] {
  const cached = inlineCache.get(text);
  if (cached) return cached;

  // Evict old entries if cache is too large
  if (inlineCache.size >= CACHE_MAX_SIZE) {
    const keysToDelete = [...inlineCache.keys()].slice(0, 100);
    keysToDelete.forEach((k) => inlineCache.delete(k));
  }

  const result = parseInline(text);
  inlineCache.set(text, result);
  return result;
}

/**
 * Clear the inline cache (call when document changes significantly)
 */
export function clearInlineCache() {
  inlineCache.clear();
}
