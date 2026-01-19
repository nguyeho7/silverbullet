/**
 * Org-mode headline indexer
 *
 * Extracts headlines as queryable objects with:
 * - Hierarchical paths (Page/Heading/Subheading)
 * - Property drawer values
 * - TODO states
 * - Tags
 * - Logbook entries (for time tracking)
 */

import type {
  CompleteEvent,
  IndexTreeEvent,
  ObjectValue,
} from "../../plug-api/types.ts";
import { indexObjects, queryObjects } from "./api.ts";
import { parseRef } from "@silverbulletmd/silverbullet/lib/page_ref";
import { space } from "@silverbulletmd/silverbullet/syscalls";
import {
  buildTree,
  type HeadlineNode,
  OrgEngine,
  parseLines,
} from "$common/org_parser/engine.ts";

export type OrgHeadlineObject = ObjectValue<{
  // Core identity
  name: string;           // Headline title
  page: string;           // Page name
  path: string;           // Hierarchical path: Heading/Subheading
  level: number;          // Nesting level (1-8+)
  pos: number;            // Line number (0-indexed)
  endPos: number;         // End line number

  // Org-specific
  todoState?: string;     // TODO, DONE, NEXT, WAITING, CANCELLED
  priority?: string;      // A, B, C from property drawer
  scheduled?: string;     // SCHEDULED timestamp
  deadline?: string;      // DEADLINE timestamp

  // Content summary
  hasContent: boolean;    // Has body text
  hasChildren: boolean;   // Has sub-headlines
  childCount: number;     // Number of direct children

  // Time tracking from logbook
  totalClocked?: number;  // Total minutes clocked

  // All property drawer values merged in
} & Record<string, any>>;

/**
 * Index org headlines from a page
 */
export async function indexOrgHeadlines({ name: pageName, tree }: IndexTreeEvent) {
  // For org mode, we parse directly from page content
  // The tree parameter is the markdown AST which we don't use
  let text: string;
  try {
    const pageData = await space.readPage(pageName);
    text = pageData.text;
  } catch {
    // Page might not exist yet during indexing
    return;
  }

  const lines = parseLines(text);
  const doc = buildTree(lines);
  const headlines: OrgHeadlineObject[] = [];

  function extractHeadlines(nodes: HeadlineNode[], parentPath: string[] = []) {
    for (const node of nodes) {
      const path = [...parentPath, node.line.title];
      const pathStr = path.join("/");

      // Calculate total clocked time from logbook
      let totalClocked = 0;
      if (node.logbook) {
        for (const entry of node.logbook.entries) {
          if (entry.entryType === "clock") {
            // Parse duration from "=> H:MM" at end of clock entry
            const durationMatch = entry.content.match(/=>\s*(\d+):(\d+)/);
            if (durationMatch) {
              totalClocked += parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
            }
          }
        }
      }

      // Build the headline object
      const headline: OrgHeadlineObject = {
        ref: `${pageName}#${pathStr}@${node.startLine}`,
        tag: "org-headline",
        tags: node.line.tags || [],
        name: node.line.title,
        page: pageName,
        path: pathStr,
        level: node.line.level,
        pos: node.startLine,
        endPos: node.endLine,
        todoState: node.line.todoState,
        hasContent: node.content.length > 0,
        hasChildren: node.children.length > 0,
        childCount: node.children.length,
      };

      // Merge property drawer values
      if (node.propertyDrawer) {
        for (const [key, value] of node.propertyDrawer.properties) {
          const lowerKey = key.toLowerCase();
          if (lowerKey === "priority") {
            headline.priority = value;
          } else if (lowerKey === "scheduled") {
            headline.scheduled = value;
          } else if (lowerKey === "deadline") {
            headline.deadline = value;
          } else {
            // Add custom properties with org_ prefix to avoid conflicts
            headline[`prop_${lowerKey}`] = value;
          }
        }
      }

      // Add logbook summary
      if (totalClocked > 0) {
        headline.totalClocked = totalClocked;
      }

      headlines.push(headline);

      // Recurse into children
      extractHeadlines(node.children, path);
    }
  }

  extractHeadlines(doc.headlines);

  if (headlines.length > 0) {
    await indexObjects(pageName, headlines);
  }
}

/**
 * Auto-complete for headline references
 * Supports: [[Page#Headline]] and [[Page/Headline/Subheading]]
 */
export async function orgHeadlineComplete(completeEvent: CompleteEvent) {
  // Match [[Page#... or [[Page/...
  const match = /(?:\[\[)([^\]#/]*[#/][^\]\)]*)$/.exec(
    completeEvent.linePrefix,
  );
  if (!match) {
    return null;
  }

  const input = match[1];
  const isHashRef = input.includes("#");
  const separator = isHashRef ? "#" : "/";
  const [pageRef, headlinePart] = input.split(separator);

  const targetPage = pageRef || completeEvent.pageName;

  // Query headlines from the target page
  const allHeadlines = await queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["=", ["attr", "page"], ["string", targetPage]],
  }, 5);

  // Filter by partial match if user has started typing
  const filtered = headlinePart
    ? allHeadlines.filter(h =>
        h.path.toLowerCase().includes(headlinePart.toLowerCase()) ||
        h.name.toLowerCase().includes(headlinePart.toLowerCase())
      )
    : allHeadlines;

  return {
    from: completeEvent.pos - match[1].length,
    options: filtered.map((h) => ({
      label: pageRef
        ? `${pageRef}${separator}${h.path}`
        : `${separator}${h.path}`,
      detail: h.todoState ? `[${h.todoState}]` : undefined,
      type: "org-headline",
    })),
  };
}

/**
 * Get a specific headline by reference
 */
export async function getHeadlineByRef(
  page: string,
  path: string,
): Promise<OrgHeadlineObject | undefined> {
  const headlines = await queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["and",
      ["=", ["attr", "page"], ["string", page]],
      ["=", ["attr", "path"], ["string", path]],
    ],
  });
  return headlines[0];
}

/**
 * Get all headlines with a specific TODO state
 */
export async function getHeadlinesByTodoState(
  state: string,
): Promise<OrgHeadlineObject[]> {
  return queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["=", ["attr", "todoState"], ["string", state]],
  });
}

/**
 * Get headlines by tag
 */
export async function getHeadlinesByTag(
  tag: string,
): Promise<OrgHeadlineObject[]> {
  return queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["call", "contains", [["attr", "tags"], ["string", tag]]],
  });
}
