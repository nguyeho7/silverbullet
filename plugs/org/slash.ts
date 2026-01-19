/**
 * Org-mode slash commands
 */

import type { CompleteEvent, SlashCompletions } from "../../plug-api/types.ts";
import { editor } from "@silverbulletmd/silverbullet/syscalls";

/**
 * Slash command completions for org-mode
 */
export function orgSlashComplete(
  completeEvent: CompleteEvent,
): SlashCompletions {
  return {
    options: [
      {
        label: "code",
        detail: "Insert code block",
        invoke: "org.insertCodeBlock",
      },
      {
        label: "src",
        detail: "Insert source block",
        invoke: "org.insertCodeBlock",
      },
      {
        label: "quote",
        detail: "Insert quote block",
        invoke: "org.insertQuoteBlock",
      },
      {
        label: "example",
        detail: "Insert example block",
        invoke: "org.insertExampleBlock",
      },
      {
        label: "headline",
        detail: "Insert headline",
        invoke: "org.insertHeadline",
      },
      {
        label: "todo",
        detail: "Insert TODO headline",
        invoke: "org.insertTodoHeadline",
      },
      {
        label: "checkbox",
        detail: "Insert checkbox list item",
        invoke: "org.insertCheckboxItem",
      },
      {
        label: "properties",
        detail: "Insert property drawer",
        invoke: "org.insertPropertyDrawer",
      },
      {
        label: "scheduled",
        detail: "Insert SCHEDULED timestamp",
        invoke: "org.insertScheduled",
      },
      {
        label: "deadline",
        detail: "Insert DEADLINE timestamp",
        invoke: "org.insertDeadline",
      },
    ],
  };
}

/**
 * Insert a code block
 */
export async function insertCodeBlock() {
  const lang = await editor.prompt("Language:", "");
  const block = `#+BEGIN_SRC ${lang || ""}\n\n#+END_SRC`;
  await editor.insertAtCursor(block);
  // Move cursor inside the block
  const pos = await editor.getCursor();
  await editor.setSelection(pos - 10 - (lang?.length || 0), pos - 10 - (lang?.length || 0));
}

/**
 * Insert a quote block
 */
export async function insertQuoteBlock() {
  const block = `#+BEGIN_QUOTE\n\n#+END_QUOTE`;
  await editor.insertAtCursor(block);
  const pos = await editor.getCursor();
  await editor.setSelection(pos - 12, pos - 12);
}

/**
 * Insert an example block
 */
export async function insertExampleBlock() {
  const block = `#+BEGIN_EXAMPLE\n\n#+END_EXAMPLE`;
  await editor.insertAtCursor(block);
  const pos = await editor.getCursor();
  await editor.setSelection(pos - 14, pos - 14);
}

/**
 * Insert a TODO headline
 */
export async function insertTodoHeadline() {
  await editor.insertAtCursor("* TODO ");
}

/**
 * Insert a checkbox list item
 */
export async function insertCheckboxItem() {
  await editor.insertAtCursor("- [ ] ");
}

/**
 * Insert a property drawer template
 */
export async function insertPropertyDrawer() {
  const drawer = `:PROPERTIES:\n:END:`;
  await editor.insertAtCursor(drawer);
  const pos = await editor.getCursor();
  // Position cursor after :PROPERTIES:\n
  await editor.setSelection(pos - 5, pos - 5);
}
