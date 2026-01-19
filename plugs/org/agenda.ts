/**
 * Org-mode agenda view
 *
 * Provides:
 * - Daily agenda view (items scheduled for specific dates)
 * - Deadline warnings
 * - TODO list filtering
 */

import { editor } from "@silverbulletmd/silverbullet/syscalls";
import { queryObjects } from "../index/api.ts";
import type { OrgHeadlineObject } from "../index/org_headline.ts";

// Types for agenda items
interface AgendaItem {
  headline: OrgHeadlineObject;
  type: "scheduled" | "deadline" | "todo";
  date?: Date;
  daysUntil?: number;
}

/**
 * Parse org timestamp string into Date
 * Handles: <2024-01-15 Mon>, <2024-01-15 Mon 10:00>, [2024-01-15 Mon]
 */
function parseOrgTimestamp(timestamp: string): Date | undefined {
  const match = timestamp.match(/[\[<](\d{4})-(\d{2})-(\d{2})(?:\s+[A-Za-z]{3})?(?:\s+(\d{1,2}):(\d{2}))?[\]>]/);
  if (!match) return undefined;

  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1; // JS months are 0-indexed
  const day = parseInt(match[3]);
  const hour = match[4] ? parseInt(match[4]) : 0;
  const minute = match[5] ? parseInt(match[5]) : 0;

  return new Date(year, month, day, hour, minute);
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Get days difference between two dates (ignoring time)
 */
function daysDiff(from: Date, to: Date): number {
  const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const diff = toDate.getTime() - fromDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Build agenda items from indexed headlines
 */
async function buildAgendaItems(
  daysAhead: number = 7,
  includeOverdue: boolean = true,
): Promise<AgendaItem[]> {
  const items: AgendaItem[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Query all headlines with scheduled or deadline
  const headlines = await queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["or",
      ["!=", ["attr", "scheduled"], ["null"]],
      ["!=", ["attr", "deadline"], ["null"]],
    ],
  });

  for (const headline of headlines) {
    // Process scheduled items
    if (headline.scheduled) {
      const date = parseOrgTimestamp(headline.scheduled);
      if (date) {
        const daysUntil = daysDiff(today, date);

        // Include if within range or overdue
        if ((daysUntil >= 0 && daysUntil <= daysAhead) ||
            (includeOverdue && daysUntil < 0)) {
          items.push({
            headline,
            type: "scheduled",
            date,
            daysUntil,
          });
        }
      }
    }

    // Process deadline items
    if (headline.deadline) {
      const date = parseOrgTimestamp(headline.deadline);
      if (date) {
        const daysUntil = daysDiff(today, date);

        // Include if within range or overdue
        if ((daysUntil >= 0 && daysUntil <= daysAhead) ||
            (includeOverdue && daysUntil < 0)) {
          items.push({
            headline,
            type: "deadline",
            date,
            daysUntil,
          });
        }
      }
    }
  }

  // Sort by date (overdue first, then by date)
  items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.getTime() - b.date.getTime();
  });

  return items;
}

/**
 * Render agenda as markdown
 */
function renderAgendaMarkdown(items: AgendaItem[]): string {
  if (items.length === 0) {
    return "_No scheduled items or deadlines in the next week._";
  }

  const lines: string[] = [];
  let currentDate: string | null = null;

  for (const item of items) {
    // Group by date
    const dateStr = item.date ? formatDate(item.date) : "No date";

    if (dateStr !== currentDate) {
      currentDate = dateStr;
      lines.push("");
      lines.push(`### ${dateStr}`);

      // Add relative indicator
      if (item.daysUntil !== undefined) {
        if (item.daysUntil < 0) {
          lines.push(`_${Math.abs(item.daysUntil)} day(s) overdue_`);
        } else if (item.daysUntil === 0) {
          lines.push(`_Today_`);
        } else if (item.daysUntil === 1) {
          lines.push(`_Tomorrow_`);
        }
      }
    }

    // Format the item
    const typeIcon = item.type === "deadline" ? "📅" : "📆";
    const typeLabel = item.type === "deadline" ? "DEADLINE" : "Scheduled";
    const todoState = item.headline.todoState ? `**${item.headline.todoState}** ` : "";

    // Build link to the headline
    const link = `[[${item.headline.page}#${item.headline.path}]]`;

    lines.push(`- ${typeIcon} ${typeLabel}: ${todoState}${item.headline.name} ${link}`);
  }

  return lines.join("\n");
}

/**
 * Show agenda in a panel/buffer
 */
export async function showAgenda() {
  const items = await buildAgendaItems(7, true);
  const markdown = renderAgendaMarkdown(items);

  // Navigate to or create the agenda page
  await editor.navigate("Org Agenda");
  await editor.setText(generateAgendaPage(items));
}

/**
 * Generate full agenda page content
 */
function generateAgendaPage(items: AgendaItem[]): string {
  const now = new Date();
  const header = `# Org Agenda

_Generated: ${formatDate(now)} ${now.toLocaleTimeString()}_

Use \`{org-agenda}\` widget in any page to embed a live agenda view.

---

`;

  return header + renderAgendaMarkdown(items);
}

/**
 * Code widget to render agenda inline
 */
export async function agendaWidget(
  code: string,
): Promise<{ markdown: string }> {
  // Parse options from code block
  // Format: days=14, overdue=true
  let daysAhead = 7;
  let includeOverdue = true;

  const daysMatch = code.match(/days\s*=\s*(\d+)/);
  if (daysMatch) {
    daysAhead = parseInt(daysMatch[1]);
  }

  const overdueMatch = code.match(/overdue\s*=\s*(true|false)/i);
  if (overdueMatch) {
    includeOverdue = overdueMatch[1].toLowerCase() === "true";
  }

  const items = await buildAgendaItems(daysAhead, includeOverdue);
  const markdown = renderAgendaMarkdown(items);

  return { markdown };
}

/**
 * Query helper: Get all open TODO items
 */
export async function getTodoItems(): Promise<OrgHeadlineObject[]> {
  const openStates = ["TODO", "NEXT", "WAITING"];

  return queryObjects<OrgHeadlineObject>("org-headline", {
    filter: ["call", "contains", [["array", ...openStates.map(s => ["string", s])], ["attr", "todoState"]]],
  });
}

/**
 * Show TODO list
 */
export async function showTodoList() {
  const items = await getTodoItems();

  if (items.length === 0) {
    await editor.flashNotification("No open TODO items", "info");
    return;
  }

  const lines: string[] = [
    "# Open TODO Items",
    "",
    `_${items.length} items_`,
    "",
  ];

  // Group by state
  const byState: Record<string, OrgHeadlineObject[]> = {};
  for (const item of items) {
    const state = item.todoState || "NONE";
    if (!byState[state]) byState[state] = [];
    byState[state].push(item);
  }

  for (const state of Object.keys(byState).sort()) {
    lines.push(`## ${state}`);
    lines.push("");
    for (const item of byState[state]) {
      const tags = item.tags && item.tags.length > 0 ? ` :${item.tags.join(":")}:` : "";
      lines.push(`- [[${item.page}#${item.path}|${item.name}]]${tags}`);
    }
    lines.push("");
  }

  await editor.navigate("Org TODOs");
  await editor.setText(lines.join("\n"));
}
