/**
 * Org-mode autocompletion
 *
 * All completions are discovered from indexed data - no preset values.
 */

import type { CompleteEvent } from "../../plug-api/types.ts";

// Cache for discovered data
let discoveredTags: string[] = [];
let discoveredProperties: string[] = [];
let lastScan = 0;

/**
 * Update discovered tags and properties from index
 */
async function updateDiscoveredData() {
  // Update at most every 10 seconds
  if (Date.now() < lastScan + 10000) return;
  lastScan = Date.now();

  try {
    const { queryObjects } = await import("../index/api.ts");

    // Get all headlines to extract tags and properties
    const headlines = await queryObjects<Record<string, any>>("org-headline", {}, 5);

    const tagSet = new Set<string>();
    const propSet = new Set<string>();

    for (const h of headlines) {
      // Collect tags
      if (h.tags && Array.isArray(h.tags)) {
        for (const tag of h.tags) {
          tagSet.add(tag);
        }
      }

      // Collect property names (keys starting with prop_)
      for (const key of Object.keys(h)) {
        if (key.startsWith("prop_")) {
          propSet.add(key.substring(5).toUpperCase());
        }
      }

      // Also add standard properties if they exist
      if (h.priority) propSet.add("PRIORITY");
      if (h.scheduled) propSet.add("SCHEDULED");
      if (h.deadline) propSet.add("DEADLINE");
    }

    discoveredTags = [...tagSet].sort();
    discoveredProperties = [...propSet].sort();
  } catch {
    // Ignore errors
  }
}

/**
 * Complete property names inside property drawers
 * Only suggests properties that exist in the index
 */
export async function orgPropertyComplete({ linePrefix, pos }: CompleteEvent) {
  const match = /^(\s*):([A-Z_]*)$/i.exec(linePrefix);
  if (!match) {
    return null;
  }

  const [fullMatch, indent, partialName] = match;

  await updateDiscoveredData();

  if (discoveredProperties.length === 0) {
    return null;
  }

  const searchTerm = partialName.toUpperCase();
  const filtered = discoveredProperties.filter(
    (prop) => prop.startsWith(searchTerm),
  );

  if (filtered.length === 0) {
    return null;
  }

  return {
    from: pos - partialName.length,
    options: filtered.map((prop) => ({
      label: prop + ":",
      type: "property",
    })),
  };
}

/**
 * Complete tags - only from indexed headlines
 */
export async function orgTagComplete({ linePrefix, pos }: CompleteEvent) {
  const match = /:([a-zA-Z0-9_]*)$/.exec(linePrefix);
  if (!match) {
    return null;
  }

  const [fullMatch, partialTag] = match;

  await updateDiscoveredData();

  if (discoveredTags.length === 0) {
    return null;
  }

  const searchTerm = partialTag.toLowerCase();
  const filtered = searchTerm
    ? discoveredTags.filter((tag) => tag.toLowerCase().includes(searchTerm))
    : discoveredTags;

  if (filtered.length === 0) {
    return null;
  }

  return {
    from: pos - fullMatch.length,
    options: filtered.slice(0, 20).map((tag) => ({
      label: `:${tag}:`,
      type: "tag",
    })),
  };
}

/**
 * Complete timestamps when typing < or [
 */
export function orgTimestampComplete({ linePrefix, pos }: CompleteEvent) {
  const activeMatch = /<$/.exec(linePrefix);
  const inactiveMatch = /\[$/.exec(linePrefix);

  if (!activeMatch && !inactiveMatch) {
    return null;
  }

  const isActive = !!activeMatch;
  const bracket = isActive ? ["<", ">"] : ["[", "]"];
  const now = new Date();

  const options = [];

  // Today
  options.push({
    label: `${bracket[0]}${formatDate(now)}${bracket[1]}`,
    detail: "Today",
    type: "timestamp",
  });

  // Tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  options.push({
    label: `${bracket[0]}${formatDate(tomorrow)}${bracket[1]}`,
    detail: "Tomorrow",
    type: "timestamp",
  });

  // +7 days
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  options.push({
    label: `${bracket[0]}${formatDate(nextWeek)}${bracket[1]}`,
    detail: "+7 days",
    type: "timestamp",
  });

  // With time
  options.push({
    label: `${bracket[0]}${formatDate(now)} ${formatTime(now)}${bracket[1]}`,
    detail: "Now with time",
    type: "timestamp",
  });

  return {
    from: pos - 1,
    options,
  };
}

function formatDate(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} ${days[date.getDay()]}`;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
