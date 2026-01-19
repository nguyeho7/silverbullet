/**
 * Org-mode autocompletion
 *
 * Provides completions for:
 * - Property names in property drawers
 * - Timestamps (active and inactive)
 * - Planning keywords (SCHEDULED, DEADLINE, CLOSED)
 */

import type { CompleteEvent } from "../../plug-api/types.ts";
import { editor } from "@silverbulletmd/silverbullet/syscalls";

// Common org-mode property names
const COMMON_PROPERTIES = [
  { name: "CATEGORY", description: "Category for agenda" },
  { name: "PRIORITY", description: "Priority level (A, B, C)" },
  { name: "CUSTOM_ID", description: "Custom identifier for linking" },
  { name: "ID", description: "Unique identifier" },
  { name: "CREATED", description: "Creation timestamp" },
  { name: "LAST_MODIFIED", description: "Last modification timestamp" },
  { name: "EFFORT", description: "Estimated effort (e.g., 1:30)" },
  { name: "STYLE", description: "Habit style" },
  { name: "REPEAT_TO_STATE", description: "State after repeat" },
  { name: "LOG_INTO_DRAWER", description: "Log state changes to drawer" },
  { name: "ARCHIVE", description: "Archive location" },
  { name: "COOKIE_DATA", description: "Statistics cookie data" },
  { name: "LOGGING", description: "Logging configuration" },
  { name: "BLOCKED", description: "Blocked by" },
  { name: "BLOCKER", description: "Blocks" },
  { name: "TRIGGER", description: "Trigger on completion" },
  { name: "ORDERED", description: "Subtasks must be done in order" },
  { name: "NOBLOCKING", description: "Don't block parent" },
  { name: "VISIBILITY", description: "Visibility state" },
  { name: "COLUMNS", description: "Column view format" },
];

// Planning keywords
const PLANNING_KEYWORDS = [
  { keyword: "SCHEDULED:", description: "Schedule this item" },
  { keyword: "DEADLINE:", description: "Set a deadline" },
  { keyword: "CLOSED:", description: "Mark as closed" },
];

/**
 * Complete property names inside property drawers
 * Triggered when typing ":" at the start of a line inside a drawer
 */
export function orgPropertyComplete({ linePrefix, pos }: CompleteEvent) {
  // Match ":PropertyName" pattern at start of line (with optional whitespace)
  const match = /^(\s*):([A-Z_]*)$/i.exec(linePrefix);
  if (!match) {
    return null;
  }

  const [fullMatch, indent, partialName] = match;
  const searchTerm = partialName.toUpperCase();

  const filtered = COMMON_PROPERTIES.filter(
    (prop) => prop.name.startsWith(searchTerm),
  );

  if (filtered.length === 0) {
    return null;
  }

  return {
    from: pos - partialName.length,
    options: filtered.map((prop) => ({
      label: prop.name + ":",
      detail: prop.description,
      type: "property",
    })),
  };
}

/**
 * Complete planning keywords at start of line (after headline)
 * Triggered when typing uppercase letters at start of line
 */
export function orgPlanningComplete({ linePrefix, pos }: CompleteEvent) {
  // Match start of planning keyword
  const match = /^(\s*)(SCHEDULED|DEADLINE|CLOSED|S|SC|SCH|SCHE|SCHED|SCHEDU|SCHEDUL|SCHEDULE|D|DE|DEA|DEAD|DEADL|DEADLI|DEADLIN|C|CL|CLO|CLOS|CLOSE)?$/i.exec(
    linePrefix,
  );
  if (!match) {
    return null;
  }

  const [fullMatch, indent, partialKeyword] = match;
  if (!partialKeyword) {
    return null;
  }

  const searchTerm = partialKeyword.toUpperCase();

  const filtered = PLANNING_KEYWORDS.filter(
    (pk) => pk.keyword.startsWith(searchTerm),
  );

  if (filtered.length === 0) {
    return null;
  }

  return {
    from: pos - partialKeyword.length,
    options: filtered.map((pk) => ({
      label: pk.keyword,
      detail: pk.description,
      type: "keyword",
      apply: pk.keyword + " ",
    })),
  };
}

/**
 * Complete timestamps when typing < or [
 * Offers quick date options
 */
export function orgTimestampComplete({ linePrefix, pos }: CompleteEvent) {
  // Match start of timestamp: < or [
  const activeMatch = /<$/.exec(linePrefix);
  const inactiveMatch = /\[$/.exec(linePrefix);

  if (!activeMatch && !inactiveMatch) {
    return null;
  }

  const isActive = !!activeMatch;
  const bracket = isActive ? ["<", ">"] : ["[", "]"];

  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Generate date options
  const options = [];

  // Today
  const today = formatDateForTimestamp(now);
  options.push({
    label: `${bracket[0]}${today}${bracket[1]}`,
    detail: "Today",
    type: "timestamp",
  });

  // Tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  options.push({
    label: `${bracket[0]}${formatDateForTimestamp(tomorrow)}${bracket[1]}`,
    detail: "Tomorrow",
    type: "timestamp",
  });

  // Next week (same day)
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  options.push({
    label: `${bracket[0]}${formatDateForTimestamp(nextWeek)}${bracket[1]}`,
    detail: "Next week",
    type: "timestamp",
  });

  // End of week (Friday)
  const endOfWeek = new Date(now);
  const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilFriday);
  options.push({
    label: `${bracket[0]}${formatDateForTimestamp(endOfWeek)}${bracket[1]}`,
    detail: "Friday",
    type: "timestamp",
  });

  // Next Monday
  const nextMonday = new Date(now);
  const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  options.push({
    label: `${bracket[0]}${formatDateForTimestamp(nextMonday)}${bracket[1]}`,
    detail: "Monday",
    type: "timestamp",
  });

  // With time (now)
  options.push({
    label: `${bracket[0]}${formatDateForTimestamp(now)} ${formatTime(now)}${bracket[1]}`,
    detail: "Today with time",
    type: "timestamp",
  });

  return {
    from: pos - 1, // Replace the opening bracket
    options,
  };
}

/**
 * Format date as YYYY-MM-DD Day
 */
function formatDateForTimestamp(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dayName = days[date.getDay()];
  return `${year}-${month}-${day} ${dayName}`;
}

/**
 * Format time as HH:MM
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Common tags for org-mode
const COMMON_TAGS = [
  "work",
  "home",
  "personal",
  "project",
  "meeting",
  "call",
  "email",
  "errand",
  "urgent",
  "important",
  "waiting",
  "someday",
  "review",
  "followup",
  "research",
  "reading",
  "writing",
  "coding",
  "design",
  "planning",
  "admin",
  "finance",
  "health",
  "learning",
];

// Cache for discovered tags from the space
let discoveredTags: string[] = [];
let lastTagScan = 0;

/**
 * Complete tags when typing :tagname: at end of headline
 * Also works anywhere with :tag: pattern
 */
export async function orgTagComplete({ linePrefix, pos }: CompleteEvent) {
  // Match :partial at the end (could be in headline or anywhere)
  const match = /:([a-zA-Z0-9_]*)$/.exec(linePrefix);
  if (!match) {
    return null;
  }

  const [fullMatch, partialTag] = match;

  // Update discovered tags periodically
  await updateDiscoveredTags();

  // Combine common and discovered tags, deduplicate
  const allTags = [...new Set([...COMMON_TAGS, ...discoveredTags])];

  const searchTerm = partialTag.toLowerCase();
  const filtered = allTags.filter(
    (tag) => tag.toLowerCase().includes(searchTerm),
  );

  if (filtered.length === 0 && partialTag.length < 2) {
    // Show all tags if just typed ":"
    return {
      from: pos - fullMatch.length,
      options: allTags.slice(0, 20).map((tag) => ({
        label: `:${tag}:`,
        detail: "tag",
        type: "tag",
      })),
    };
  }

  if (filtered.length === 0) {
    return null;
  }

  return {
    from: pos - fullMatch.length,
    options: filtered.map((tag) => ({
      label: `:${tag}:`,
      detail: "tag",
      type: "tag",
    })),
  };
}

/**
 * Scan pages for existing tags (cached)
 */
async function updateDiscoveredTags() {
  // Update at most every 30 seconds
  if (Date.now() < lastTagScan + 30000) return;
  lastTagScan = Date.now();

  try {
    // Import queryObjects dynamically to avoid circular deps
    const { queryObjects } = await import("../index/api.ts");
    const headlines = await queryObjects<{ tags?: string[] }>("org-headline", {
      select: [{ name: "tags" }],
    }, 5);

    const tagSet = new Set<string>();
    for (const h of headlines) {
      if (h.tags) {
        for (const tag of h.tags) {
          tagSet.add(tag);
        }
      }
    }
    discoveredTags = [...tagSet];
  } catch {
    // Ignore errors, just use common tags
  }
}
