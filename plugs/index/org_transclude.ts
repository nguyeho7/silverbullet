/**
 * Org-mode transclusion
 *
 * Allows embedding headline content from other pages or sections.
 * Syntax: ${transclude [[Page#Headline]]}
 * Or: ${transclude [[Page/Headline/Subheading]]}
 */

import { space } from "@silverbulletmd/silverbullet/syscalls";
import {
  buildTree,
  type HeadlineNode,
  parseLines,
} from "$common/org_parser/engine.ts";
import { parseRef } from "@silverbulletmd/silverbullet/lib/page_ref";
import type { WidgetContent } from "../../plug-api/types.ts";
import { queryObjects } from "./api.ts";
import type { OrgHeadlineObject } from "./org_headline.ts";

interface TranscludeOptions {
  // Include the headline itself
  includeHeadline?: boolean;
  // Include child headlines
  includeChildren?: boolean;
  // Maximum depth of children to include
  maxDepth?: number;
  // Adjust headline levels (e.g., +1 to demote all headlines)
  levelAdjust?: number;
}

/**
 * Parse a transclude reference
 * Formats:
 * - [[Page#Headline]]
 * - [[Page/Headline/Subheading]]
 * - [[#Headline]] (current page)
 * - [[/Headline/Subheading]] (current page)
 */
function parseTranscludeRef(ref: string, currentPage: string): { page: string; path: string } | null {
  // Remove [[ and ]] if present
  ref = ref.replace(/^\[\[|\]\]$/g, "").trim();

  if (ref.startsWith("#")) {
    // [[#Headline]] - current page, hash reference
    return { page: currentPage, path: ref.substring(1) };
  } else if (ref.startsWith("/")) {
    // [[/Headline/Sub]] - current page, path reference
    return { page: currentPage, path: ref.substring(1) };
  } else if (ref.includes("#")) {
    // [[Page#Headline]]
    const [page, path] = ref.split("#", 2);
    return { page: page || currentPage, path };
  } else if (ref.includes("/")) {
    // Could be [[Page/Headline]] or just [[Headline/Sub]]
    // Check if first part is a page name
    const parts = ref.split("/");
    // For now, assume first part is page if it doesn't look like a headline
    // This is a heuristic - could be improved
    return { page: parts[0], path: parts.slice(1).join("/") };
  }

  return null;
}

/**
 * Find a headline node by path in the document tree
 */
function findHeadlineByPath(
  nodes: HeadlineNode[],
  pathParts: string[],
): HeadlineNode | null {
  if (pathParts.length === 0) return null;

  const [current, ...rest] = pathParts;

  for (const node of nodes) {
    // Match by title (case-insensitive)
    if (node.line.title.toLowerCase() === current.toLowerCase()) {
      if (rest.length === 0) {
        return node;
      }
      // Continue searching in children
      return findHeadlineByPath(node.children, rest);
    }
  }

  return null;
}

/**
 * Render a headline node back to org-mode text
 */
function renderHeadlineToOrg(
  node: HeadlineNode,
  lines: string[],
  options: TranscludeOptions = {},
  currentDepth: number = 0,
): string {
  const output: string[] = [];
  const levelAdjust = options.levelAdjust || 0;

  if (options.includeHeadline !== false) {
    // Render the headline line with adjusted level
    const adjustedLevel = Math.max(1, node.line.level + levelAdjust);
    const stars = "*".repeat(adjustedLevel);
    let headline = `${stars}`;
    if (node.line.todoState) {
      headline += ` ${node.line.todoState}`;
    }
    headline += ` ${node.line.title}`;
    if (node.line.tags && node.line.tags.length > 0) {
      headline += ` :${node.line.tags.join(":")}:`;
    }
    output.push(headline);

    // Render property drawer
    if (node.propertyDrawer) {
      output.push(":PROPERTIES:");
      for (const [key, value] of node.propertyDrawer.properties) {
        output.push(`:${key}: ${value}`);
      }
      output.push(":END:");
    }

    // Render logbook
    if (node.logbook) {
      output.push(":LOGBOOK:");
      for (const entry of node.logbook.entries) {
        output.push(entry.raw);
      }
      output.push(":END:");
    }
  }

  // Render body content
  for (const contentLine of node.content) {
    output.push(contentLine.raw);
  }

  // Render children if requested
  const maxDepth = options.maxDepth ?? Infinity;
  if (options.includeChildren !== false && currentDepth < maxDepth) {
    for (const child of node.children) {
      output.push(renderHeadlineToOrg(child, lines, options, currentDepth + 1));
    }
  }

  return output.join("\n");
}

/**
 * Transclude widget - embeds headline content
 *
 * Usage in org file:
 * ${transclude [[Page#Headline]]}
 * ${transclude [[Page/Headline/Subheading]] {includeChildren: false}}
 */
export async function transcludeWidget(
  bodyText: string,
  pageName: string,
): Promise<WidgetContent> {
  try {
    // Parse the body text to extract reference and options
    // Format: [[ref]] or [[ref]] {options}
    const refMatch = bodyText.match(/\[\[([^\]]+)\]\]/);
    if (!refMatch) {
      return {
        markdown: `> **Error:** Invalid transclude syntax. Use \`\${transclude [[Page#Headline]]}\``,
      };
    }

    const ref = refMatch[1];
    const parsed = parseTranscludeRef(ref, pageName);

    if (!parsed) {
      return {
        markdown: `> **Error:** Could not parse reference: ${ref}`,
      };
    }

    // Parse options if present
    let options: TranscludeOptions = {};
    const optionsMatch = bodyText.match(/\{([^}]+)\}/);
    if (optionsMatch) {
      try {
        // Simple JSON-like parsing
        options = JSON.parse(`{${optionsMatch[1].replace(/(\w+):/g, '"$1":')}}`);
      } catch {
        // Ignore parse errors, use defaults
      }
    }

    // Read the source page
    let pageText: string;
    try {
      const pageData = await space.readPage(parsed.page);
      pageText = pageData.text;
    } catch {
      return {
        markdown: `> **Error:** Page not found: ${parsed.page}`,
      };
    }

    // Parse the page
    const lines = parseLines(pageText);
    const doc = buildTree(lines);

    // Find the headline
    const pathParts = parsed.path.split("/").filter(p => p);
    const headline = findHeadlineByPath(doc.headlines, pathParts);

    if (!headline) {
      return {
        markdown: `> **Error:** Headline not found: ${parsed.path} in ${parsed.page}`,
      };
    }

    // Render the transcluded content
    const content = renderHeadlineToOrg(
      headline,
      pageText.split("\n"),
      options,
    );

    return {
      markdown: content,
    };
  } catch (e: any) {
    return {
      markdown: `> **Error:** ${e.message}`,
    };
  }
}

/**
 * Query provider for transcluded headlines
 * Allows: ${query [[org-headline]] where todoState = "TODO"}
 */
export async function orgHeadlineQueryProvider(
  { query, variables }: { query: any; variables?: Record<string, any> },
): Promise<OrgHeadlineObject[]> {
  // This is called by the query system
  // The actual filtering is done by queryObjects
  return queryObjects<OrgHeadlineObject>("org-headline", query);
}
