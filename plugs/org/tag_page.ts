/**
 * Virtual page for org-mode tags
 *
 * Navigating to "🏷 tagname" shows all headlines with that tag
 */

import type { FileMeta } from "../../plug-api/types.ts";
import { queryObjects } from "../index/api.ts";
import type { OrgHeadlineObject } from "../index/org_headline.ts";

export const tagPrefix = "🏷 ";

/**
 * Read a virtual tag page - generates content showing all headlines with the tag
 */
export async function readFileOrgTag(
  name: string,
): Promise<{ data: Uint8Array; meta: FileMeta }> {
  const tagName = name.substring(
    tagPrefix.length,
    name.length - ".org".length,
  );

  // Query all headlines with this tag
  const headlines = await queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["call", "contains", [["attr", "tags"], ["string", tagName]]],
  });

  // Group by page
  const byPage: Record<string, OrgHeadlineObject[]> = {};
  for (const h of headlines) {
    if (!byPage[h.page]) byPage[h.page] = [];
    byPage[h.page].push(h);
  }

  // Build org content
  let content = `* Headlines tagged :${tagName}:\n\n`;
  content += `/${headlines.length} headline(s) found/\n\n`;

  for (const [page, pageHeadlines] of Object.entries(byPage).sort()) {
    content += `** ${page}\n`;
    for (const h of pageHeadlines) {
      const todoState = h.todoState ? `${h.todoState} ` : "";
      const tags = h.tags && h.tags.length > 0 ? ` :${h.tags.join(":")}:` : "";
      const scheduled = h.scheduled ? `\n   SCHEDULED: ${h.scheduled}` : "";
      const deadline = h.deadline ? `\n   DEADLINE: ${h.deadline}` : "";

      // Create a link to the headline
      content += `*** ${todoState}[[${page}#${h.path}][${h.name}]]${tags}${scheduled}${deadline}\n`;
    }
    content += "\n";
  }

  if (headlines.length === 0) {
    content += `/No headlines found with this tag./\n`;
  }

  return {
    data: new TextEncoder().encode(content),
    meta: {
      name,
      contentType: "text/org",
      size: content.length,
      created: 0,
      lastModified: 0,
      perm: "ro",
    },
  };
}

export function writeFileOrgTag(name: string): FileMeta {
  return getFileMetaOrgTag(name);
}

export function getFileMetaOrgTag(name: string): FileMeta {
  return {
    name,
    contentType: "text/org",
    size: -1,
    created: 0,
    lastModified: 0,
    perm: "ro",
  };
}
