/**
 * Org-mode commands
 *
 * Provides commands for:
 * - TODO state cycling
 * - Headline manipulation (promote/demote)
 * - Priority cycling
 * - Timestamp insertion
 */

import { editor, space } from "@silverbulletmd/silverbullet/syscalls";
import {
  buildTree,
  type HeadlineLine,
  type ListItemLine,
  OrgEngine,
  parseLine,
  parseLines,
} from "$common/org_parser/engine.ts";

// Default TODO states cycle
const TODO_STATES = ["TODO", "NEXT", "WAITING", "DONE", "CANCELLED"];

// Priority cycle
const PRIORITIES = ["A", "B", "C", undefined];

/**
 * Get the current line text and position info
 */
async function getCurrentLineInfo(): Promise<{
  lineText: string;
  lineStart: number;
  lineEnd: number;
  lineNumber: number;
}> {
  const cursor = await editor.getCursor();
  const text = await editor.getText();
  const lines = text.split("\n");

  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = pos;
    const lineEnd = pos + lines[i].length;

    if (cursor >= lineStart && cursor <= lineEnd) {
      return {
        lineText: lines[i],
        lineStart,
        lineEnd,
        lineNumber: i,
      };
    }
    pos = lineEnd + 1; // +1 for newline
  }

  // Fallback to last line
  const lastIdx = lines.length - 1;
  return {
    lineText: lines[lastIdx],
    lineStart: text.length - lines[lastIdx].length,
    lineEnd: text.length,
    lineNumber: lastIdx,
  };
}

/**
 * Cycle TODO state forward: TODO -> NEXT -> WAITING -> DONE -> CANCELLED -> (none) -> TODO
 */
export async function cycleTodoForward() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "headline") {
    await editor.flashNotification("Not on a headline", "error");
    return;
  }

  const headline = parsed as HeadlineLine;
  const currentState = headline.todoState;

  // Find next state
  let nextState: string | undefined;
  if (!currentState) {
    nextState = TODO_STATES[0];
  } else {
    const idx = TODO_STATES.indexOf(currentState);
    if (idx === -1 || idx === TODO_STATES.length - 1) {
      nextState = undefined; // Remove state
    } else {
      nextState = TODO_STATES[idx + 1];
    }
  }

  // Build new headline line
  const newLine = buildHeadlineLine(headline.level, nextState, headline.title, headline.tags);

  // Replace the line
  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Cycle TODO state backward
 */
export async function cycleTodoBackward() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "headline") {
    await editor.flashNotification("Not on a headline", "error");
    return;
  }

  const headline = parsed as HeadlineLine;
  const currentState = headline.todoState;

  // Find previous state
  let nextState: string | undefined;
  if (!currentState) {
    nextState = TODO_STATES[TODO_STATES.length - 1];
  } else {
    const idx = TODO_STATES.indexOf(currentState);
    if (idx <= 0) {
      nextState = undefined; // Remove state
    } else {
      nextState = TODO_STATES[idx - 1];
    }
  }

  const newLine = buildHeadlineLine(headline.level, nextState, headline.title, headline.tags);

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Set a specific TODO state
 */
export async function setTodoState(state: string | undefined) {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "headline") {
    await editor.flashNotification("Not on a headline", "error");
    return;
  }

  const headline = parsed as HeadlineLine;
  const newLine = buildHeadlineLine(headline.level, state, headline.title, headline.tags);

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Mark headline as TODO
 */
export async function markTodo() {
  await setTodoState("TODO");
}

/**
 * Mark headline as DONE
 */
export async function markDone() {
  await setTodoState("DONE");
}

/**
 * Clear TODO state
 */
export async function clearTodoState() {
  await setTodoState(undefined);
}

/**
 * Promote headline (decrease level, * -> **)
 */
export async function promoteHeadline() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "headline") {
    await editor.flashNotification("Not on a headline", "error");
    return;
  }

  const headline = parsed as HeadlineLine;
  if (headline.level <= 1) {
    await editor.flashNotification("Cannot promote top-level headline", "error");
    return;
  }

  const newLine = buildHeadlineLine(headline.level - 1, headline.todoState, headline.title, headline.tags);

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Demote headline (increase level, ** -> ***)
 */
export async function demoteHeadline() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "headline") {
    await editor.flashNotification("Not on a headline", "error");
    return;
  }

  const headline = parsed as HeadlineLine;
  const newLine = buildHeadlineLine(headline.level + 1, headline.todoState, headline.title, headline.tags);

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Insert a new headline at current level
 */
export async function insertHeadline() {
  const { lineText, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  let level = 1;
  if (parsed.type === "headline") {
    level = (parsed as HeadlineLine).level;
  }

  const newHeadline = "\n" + "*".repeat(level) + " ";

  const text = await editor.getText();
  const newText = text.substring(0, lineEnd) + newHeadline + text.substring(lineEnd);
  await editor.setText(newText);

  // Move cursor to end of new headline
  await editor.setSelection(lineEnd + newHeadline.length, lineEnd + newHeadline.length);
}

/**
 * Insert a new subheadline (one level deeper)
 */
export async function insertSubheadline() {
  const { lineText, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  let level = 2;
  if (parsed.type === "headline") {
    level = (parsed as HeadlineLine).level + 1;
  }

  const newHeadline = "\n" + "*".repeat(level) + " ";

  const text = await editor.getText();
  const newText = text.substring(0, lineEnd) + newHeadline + text.substring(lineEnd);
  await editor.setText(newText);

  await editor.setSelection(lineEnd + newHeadline.length, lineEnd + newHeadline.length);
}

/**
 * Add or toggle a tag on the current headline
 */
export async function toggleTag(tag?: string) {
  if (!tag) {
    tag = await editor.prompt("Tag to toggle:");
    if (!tag) return;
  }

  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "headline") {
    await editor.flashNotification("Not on a headline", "error");
    return;
  }

  const headline = parsed as HeadlineLine;
  let tags = headline.tags ? [...headline.tags] : [];

  const tagIdx = tags.indexOf(tag);
  if (tagIdx >= 0) {
    tags.splice(tagIdx, 1);
  } else {
    tags.push(tag);
  }

  const newLine = buildHeadlineLine(
    headline.level,
    headline.todoState,
    headline.title,
    tags.length > 0 ? tags : undefined
  );

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Insert a property drawer or add property to existing drawer
 */
export async function setProperty(key?: string, value?: string) {
  if (!key) {
    key = await editor.prompt("Property name:");
    if (!key) return;
  }
  if (!value) {
    value = await editor.prompt(`Value for ${key}:`);
    if (value === undefined) return;
  }

  const text = await editor.getText();
  const cursor = await editor.getCursor();
  const lines = text.split("\n");

  // Find which line we're on
  let pos = 0;
  let lineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (cursor <= pos + lines[i].length) {
      lineIdx = i;
      break;
    }
    pos += lines[i].length + 1;
  }

  // Find the headline above us
  let headlineIdx = -1;
  for (let i = lineIdx; i >= 0; i--) {
    const parsed = parseLine(lines[i], i);
    if (parsed.type === "headline") {
      headlineIdx = i;
      break;
    }
  }

  if (headlineIdx === -1) {
    await editor.flashNotification("No headline found above cursor", "error");
    return;
  }

  // Check if there's already a property drawer
  let drawerStartIdx = -1;
  let drawerEndIdx = -1;
  let existingPropertyIdx = -1;

  for (let i = headlineIdx + 1; i < lines.length; i++) {
    const parsed = parseLine(lines[i], i);
    if (parsed.type === "property-drawer-start") {
      drawerStartIdx = i;
    } else if (parsed.type === "property-drawer-end" && drawerStartIdx !== -1) {
      drawerEndIdx = i;
      break;
    } else if (parsed.type === "property" && drawerStartIdx !== -1) {
      const propLine = parsed as import("$common/org_parser/engine.ts").PropertyLine;
      if (propLine.key.toUpperCase() === key.toUpperCase()) {
        existingPropertyIdx = i;
      }
    } else if (parsed.type === "headline") {
      break; // Hit next headline, no drawer
    } else if (parsed.type !== "blank" && drawerStartIdx === -1) {
      break; // Content before drawer, can't have drawer here
    }
  }

  if (drawerStartIdx !== -1 && drawerEndIdx !== -1) {
    // Drawer exists
    if (existingPropertyIdx !== -1) {
      // Update existing property
      lines[existingPropertyIdx] = `:${key}: ${value}`;
    } else {
      // Add new property before :END:
      lines.splice(drawerEndIdx, 0, `:${key}: ${value}`);
    }
  } else {
    // Create new drawer right after headline
    const drawerLines = [":PROPERTIES:", `:${key}: ${value}`, ":END:"];
    lines.splice(headlineIdx + 1, 0, ...drawerLines);
  }

  await editor.setText(lines.join("\n"));
}

/**
 * Insert timestamp at cursor
 */
export async function insertTimestamp(active = true) {
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dayStr = days[now.getDay()];

  const timestamp = active
    ? `<${dateStr} ${dayStr}>`
    : `[${dateStr} ${dayStr}]`;

  await editor.insertAtCursor(timestamp);
}

/**
 * Insert active timestamp
 */
export async function insertActiveTimestamp() {
  await insertTimestamp(true);
}

/**
 * Insert inactive timestamp
 */
export async function insertInactiveTimestamp() {
  await insertTimestamp(false);
}

/**
 * Clock in to current headline
 */
export async function clockIn() {
  const now = new Date();
  const timestamp = formatOrgTimestamp(now);

  const text = await editor.getText();
  const cursor = await editor.getCursor();
  const lines = text.split("\n");

  // Find headline
  let pos = 0;
  let lineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (cursor <= pos + lines[i].length) {
      lineIdx = i;
      break;
    }
    pos += lines[i].length + 1;
  }

  let headlineIdx = -1;
  for (let i = lineIdx; i >= 0; i--) {
    const parsed = parseLine(lines[i], i);
    if (parsed.type === "headline") {
      headlineIdx = i;
      break;
    }
  }

  if (headlineIdx === -1) {
    await editor.flashNotification("No headline found", "error");
    return;
  }

  // Find or create logbook
  let logbookStartIdx = -1;
  let logbookEndIdx = -1;

  for (let i = headlineIdx + 1; i < lines.length; i++) {
    const parsed = parseLine(lines[i], i);
    if (parsed.type === "logbook-start") {
      logbookStartIdx = i;
    } else if (parsed.type === "property-drawer-end" && logbookStartIdx !== -1) {
      // :END: after :LOGBOOK:
      logbookEndIdx = i;
      break;
    } else if (parsed.type === "headline") {
      break;
    }
  }

  const clockLine = `CLOCK: [${timestamp}]`;

  if (logbookStartIdx !== -1 && logbookEndIdx !== -1) {
    // Add to existing logbook
    lines.splice(logbookStartIdx + 1, 0, clockLine);
  } else {
    // Find where to insert logbook (after property drawer if exists, or after headline)
    let insertIdx = headlineIdx + 1;

    // Skip property drawer if present
    for (let i = headlineIdx + 1; i < lines.length; i++) {
      const parsed = parseLine(lines[i], i);
      if (parsed.type === "property-drawer-end") {
        insertIdx = i + 1;
        break;
      } else if (parsed.type === "headline" || (parsed.type !== "property-drawer-start" && parsed.type !== "property" && parsed.type !== "blank")) {
        break;
      }
    }

    lines.splice(insertIdx, 0, ":LOGBOOK:", clockLine, ":END:");
  }

  await editor.setText(lines.join("\n"));
  await editor.flashNotification("Clocked in");
}

// Helper function to format org timestamp
function formatOrgTimestamp(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const dayStr = days[date.getDay()];
  return `${dateStr} ${dayStr} ${timeStr}`;
}

// Helper to build a headline line
function buildHeadlineLine(
  level: number,
  todoState: string | undefined,
  title: string,
  tags: string[] | undefined
): string {
  let line = "*".repeat(level);
  if (todoState) {
    line += ` ${todoState}`;
  }
  line += ` ${title}`;
  if (tags && tags.length > 0) {
    line += ` :${tags.join(":")}:`;
  }
  return line;
}

/**
 * Toggle checkbox state on list item: unchecked -> checked -> unchecked
 * If not on a list item with checkbox, adds a checkbox
 */
export async function toggleCheckbox() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "list-item") {
    await editor.flashNotification("Not on a list item", "error");
    return;
  }

  const listItem = parsed as ListItemLine;
  let newLine: string;

  if (listItem.checkbox === undefined) {
    // Add checkbox (unchecked)
    newLine = buildListItemLine(listItem.indent, listItem.marker, listItem.markerValue, "unchecked", listItem.content);
  } else if (listItem.checkbox === "unchecked") {
    // Toggle to checked
    newLine = buildListItemLine(listItem.indent, listItem.marker, listItem.markerValue, "checked", listItem.content);
  } else if (listItem.checkbox === "checked") {
    // Toggle to unchecked
    newLine = buildListItemLine(listItem.indent, listItem.marker, listItem.markerValue, "unchecked", listItem.content);
  } else if (listItem.checkbox === "partial") {
    // Toggle partial to checked
    newLine = buildListItemLine(listItem.indent, listItem.marker, listItem.markerValue, "checked", listItem.content);
  } else {
    return;
  }

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Insert a new list item at current level
 */
export async function insertListItem() {
  const { lineText, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  let indent = 0;
  let marker: "-" | "+" | "*" | "number" = "-";
  let markerValue: string | undefined;
  let hasCheckbox = false;

  if (parsed.type === "list-item") {
    const listItem = parsed as ListItemLine;
    indent = listItem.indent;
    marker = listItem.marker;
    markerValue = listItem.markerValue;
    hasCheckbox = listItem.checkbox !== undefined;

    // Increment number for numbered lists
    if (marker === "number" && markerValue) {
      const num = parseInt(markerValue);
      if (!isNaN(num)) {
        const suffix = markerValue.endsWith(")") ? ")" : ".";
        markerValue = `${num + 1}${suffix}`;
      }
    }
  }

  const newListItem = "\n" + buildListItemLine(indent, marker, markerValue, hasCheckbox ? "unchecked" : undefined, "");

  const text = await editor.getText();
  const newText = text.substring(0, lineEnd) + newListItem + text.substring(lineEnd);
  await editor.setText(newText);

  // Move cursor to end of new list item
  await editor.setSelection(lineEnd + newListItem.length, lineEnd + newListItem.length);
}

/**
 * Indent list item (increase indent)
 */
export async function indentListItem() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "list-item") {
    await editor.flashNotification("Not on a list item", "error");
    return;
  }

  const listItem = parsed as ListItemLine;
  const newLine = buildListItemLine(listItem.indent + 2, listItem.marker, listItem.markerValue, listItem.checkbox, listItem.content);

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

/**
 * Outdent list item (decrease indent)
 */
export async function outdentListItem() {
  const { lineText, lineStart, lineEnd, lineNumber } = await getCurrentLineInfo();
  const parsed = parseLine(lineText, lineNumber);

  if (parsed.type !== "list-item") {
    await editor.flashNotification("Not on a list item", "error");
    return;
  }

  const listItem = parsed as ListItemLine;
  if (listItem.indent < 2) {
    await editor.flashNotification("Cannot outdent further", "error");
    return;
  }

  const newLine = buildListItemLine(listItem.indent - 2, listItem.marker, listItem.markerValue, listItem.checkbox, listItem.content);

  const text = await editor.getText();
  const newText = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
  await editor.setText(newText);
}

// Helper to build a list item line
function buildListItemLine(
  indent: number,
  marker: "-" | "+" | "*" | "number",
  markerValue: string | undefined,
  checkbox: "checked" | "unchecked" | "partial" | undefined,
  content: string
): string {
  let line = " ".repeat(indent);
  line += marker === "number" ? (markerValue || "1.") : marker;
  line += " ";

  if (checkbox !== undefined) {
    if (checkbox === "checked") {
      line += "[X] ";
    } else if (checkbox === "unchecked") {
      line += "[ ] ";
    } else if (checkbox === "partial") {
      line += "[-] ";
    }
  }

  line += content;
  return line;
}
