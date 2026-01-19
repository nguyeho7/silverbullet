/**
 * Click event handling for org-mode
 *
 * Makes tags clickable - clicking navigates to the virtual tag page
 */

import type { ClickEvent } from "../../plug-api/types.ts";
import { editor } from "@silverbulletmd/silverbullet/syscalls";

/**
 * Handle clicks in org pages
 * Detects clicks on tags and navigates to the tag page
 */
export async function handleOrgClick(event: ClickEvent & { parentNodes: string[] }) {
  const text = await editor.getText();
  const pos = event.pos;

  // Find the line containing the click
  const lines = text.split("\n");
  let currentPos = 0;
  let clickedLine = "";
  let lineStartPos = 0;

  for (const line of lines) {
    if (currentPos + line.length >= pos) {
      clickedLine = line;
      lineStartPos = currentPos;
      break;
    }
    currentPos += line.length + 1; // +1 for newline
  }

  // Check if click is on a tag
  // Tags are :tagname: patterns, often at end of headline
  const posInLine = pos - lineStartPos;
  const tagMatches = [...clickedLine.matchAll(/:([a-zA-Z0-9_]+):/g)];

  for (const match of tagMatches) {
    const tagStart = match.index!;
    const tagEnd = tagStart + match[0].length;

    if (posInLine >= tagStart && posInLine <= tagEnd) {
      // Clicked on a tag!
      const tagName = match[1];
      await editor.navigate(`🏷 ${tagName}`);
      return true; // Handled
    }
  }

  return false; // Not handled
}
