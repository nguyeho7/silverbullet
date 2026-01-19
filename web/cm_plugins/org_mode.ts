/**
 * CodeMirror plugin for org-mode support
 *
 * Provides:
 * - Syntax highlighting for org-mode
 * - Folding for headlines and drawers
 * - Line decorations
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  type EditorState,
  type Extension,
  Facet,
  type Range,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  type AnyLine,
  type HeadlineNode,
  OrgEngine,
} from "$common/org_parser/engine.ts";
import { parseInlineCached, type InlineElement } from "$common/org_parser/inline.ts";
import { foldService, codeFolding } from "@codemirror/language";
import type { Client } from "../client.ts";
import { orgPropertyDrawerPlugin, orgPropertyDrawerTheme } from "./org_property_widget.ts";

// Facet to provide the OrgEngine to other extensions
export const orgEngineFacet = Facet.define<OrgEngine, OrgEngine>({
  combine: (values) => values[0] ?? new OrgEngine(),
});

// State field that maintains the OrgEngine and updates it on document changes
export const orgEngineField = StateField.define<OrgEngine>({
  create(state) {
    const engine = new OrgEngine(state.doc.toString());
    return engine;
  },

  update(engine, tr) {
    if (tr.docChanged) {
      // For simplicity, just reset the entire engine
      // A more optimized version would use incremental updates
      engine.reset(tr.newDoc.toString());
    }
    return engine;
  },

  provide: (field) => orgEngineFacet.from(field),
});

// CSS classes for different headline levels
const headlineClasses = [
  "sb-line-org-h1",
  "sb-line-org-h2",
  "sb-line-org-h3",
  "sb-line-org-h4",
  "sb-line-org-h5",
  "sb-line-org-h6",
  "sb-line-org-h7",
  "sb-line-org-h8",
];

// Line decoration classes
const lineDecorations = {
  headline: (level: number) =>
    Decoration.line({
      class: headlineClasses[Math.min(level - 1, headlineClasses.length - 1)],
    }),
  propertyDrawer: Decoration.line({ class: "sb-line-org-property-drawer" }),
  logbook: Decoration.line({ class: "sb-line-org-logbook" }),
  property: Decoration.line({ class: "sb-line-org-property" }),
  text: Decoration.line({ class: "sb-line-org-text" }),
  listItem: Decoration.line({ class: "sb-line-org-list-item" }),
  planning: Decoration.line({ class: "sb-line-org-planning" }),
};

// Mark decorations for inline elements
const markDecorations = {
  stars: Decoration.mark({ class: "sb-org-stars" }),
  todoState: (state: string) =>
    Decoration.mark({
      class: `sb-org-todo sb-org-todo-${state.toLowerCase()}`,
    }),
  tags: Decoration.mark({ class: "sb-org-tags" }),
  propertyKey: Decoration.mark({ class: "sb-org-property-key" }),
  propertyValue: Decoration.mark({ class: "sb-org-property-value" }),
  drawerDelimiter: Decoration.mark({ class: "sb-org-drawer-delimiter" }),
  timestamp: Decoration.mark({ class: "sb-org-timestamp" }),
  // List items
  listMarker: Decoration.mark({ class: "sb-org-list-marker" }),
  checkboxUnchecked: Decoration.mark({ class: "sb-org-checkbox sb-org-checkbox-unchecked" }),
  checkboxChecked: Decoration.mark({ class: "sb-org-checkbox sb-org-checkbox-checked" }),
  checkboxPartial: Decoration.mark({ class: "sb-org-checkbox sb-org-checkbox-partial" }),
  // Planning
  planningKeyword: Decoration.mark({ class: "sb-org-planning-keyword" }),
  planningTimestamp: Decoration.mark({ class: "sb-org-planning-timestamp" }),
  // Inline markup
  bold: Decoration.mark({ class: "sb-org-bold" }),
  italic: Decoration.mark({ class: "sb-org-italic" }),
  underline: Decoration.mark({ class: "sb-org-underline" }),
  strikethrough: Decoration.mark({ class: "sb-org-strikethrough" }),
  code: Decoration.mark({ class: "sb-org-code" }),
  verbatim: Decoration.mark({ class: "sb-org-verbatim" }),
  link: Decoration.mark({ class: "sb-org-link" }),
  "timestamp-active": Decoration.mark({ class: "sb-org-timestamp-active" }),
  "timestamp-inactive": Decoration.mark({ class: "sb-org-timestamp-inactive" }),
};

// Fold marker widget
class FoldMarkerWidget extends WidgetType {
  constructor(readonly content: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "sb-org-fold-marker";
    span.textContent = this.content;
    return span;
  }

  eq(other: FoldMarkerWidget) {
    return this.content === other.content;
  }
}

// Compute line decorations from org engine state
function computeDecorations(state: EditorState): DecorationSet {
  const engine = state.field(orgEngineField);
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;

  for (const line of engine.lines) {
    if (line.lineNumber >= doc.lines) continue;

    const docLine = doc.line(line.lineNumber + 1); // doc lines are 1-indexed
    const lineStart = docLine.from;

    switch (line.type) {
      case "headline": {
        const headlineLine = line as import("$common/org_parser/engine.ts").HeadlineLine;
        builder.add(lineStart, lineStart, lineDecorations.headline(headlineLine.level));

        // Add mark decorations for stars, todo state, and tags
        const starsEnd = lineStart + headlineLine.level;
        builder.add(lineStart, starsEnd, markDecorations.stars);

        if (headlineLine.todoState) {
          const todoStart = starsEnd + 1; // space after stars
          const todoEnd = todoStart + headlineLine.todoState.length;
          builder.add(todoStart, todoEnd, markDecorations.todoState(headlineLine.todoState));
        }

        if (headlineLine.tags && headlineLine.tags.length > 0) {
          // Tags are at the end of the line
          const tagsStr = `:${headlineLine.tags.join(":")}:`;
          const tagsStart = docLine.to - tagsStr.length;
          builder.add(tagsStart, docLine.to, markDecorations.tags);
        }
        break;
      }

      case "property-drawer-start":
      case "property-drawer-end":
      case "logbook-start":
      case "logbook-end":
        builder.add(lineStart, lineStart, lineDecorations.propertyDrawer);
        builder.add(lineStart, docLine.to, markDecorations.drawerDelimiter);
        break;

      case "property": {
        const propLine = line as import("$common/org_parser/engine.ts").PropertyLine;
        builder.add(lineStart, lineStart, lineDecorations.property);

        // Mark the key and value separately
        const colonPos = docLine.text.indexOf(":");
        if (colonPos !== -1) {
          const secondColonPos = docLine.text.indexOf(":", colonPos + 1);
          if (secondColonPos !== -1) {
            builder.add(
              lineStart,
              lineStart + secondColonPos + 1,
              markDecorations.propertyKey
            );
            if (propLine.value) {
              builder.add(
                lineStart + secondColonPos + 1,
                docLine.to,
                markDecorations.propertyValue
              );
            }
          }
        }
        break;
      }

      case "logbook-entry":
        builder.add(lineStart, lineStart, lineDecorations.logbook);
        // Highlight timestamps in CLOCK entries
        const clockText = docLine.text;
        const timestampRegex = /\[[\d-]+ [A-Za-z]+ [\d:]+\]/g;
        let match;
        while ((match = timestampRegex.exec(clockText)) !== null) {
          builder.add(
            lineStart + match.index,
            lineStart + match.index + match[0].length,
            markDecorations.timestamp
          );
        }
        break;

      case "text": {
        builder.add(lineStart, lineStart, lineDecorations.text);
        // Parse inline markup for text lines
        const textLine = line as import("$common/org_parser/engine.ts").TextLine;
        addInlineDecorations(builder, docLine.text, lineStart);
        break;
      }

      case "list-item": {
        const listLine = line as import("$common/org_parser/engine.ts").ListItemLine;
        builder.add(lineStart, lineStart, lineDecorations.listItem);

        // Mark the list marker (-, +, *, or number)
        const markerStart = lineStart + listLine.indent;
        const markerText = listLine.markerValue || listLine.marker;
        const markerEnd = markerStart + markerText.length;
        builder.add(markerStart, markerEnd, markDecorations.listMarker);

        // Mark checkbox if present
        if (listLine.checkbox) {
          // Checkbox comes after marker and space: "- [ ] " or "- [X] "
          const checkboxStart = markerEnd + 1; // space after marker
          const checkboxEnd = checkboxStart + 3; // "[ ]" or "[X]" or "[-]"

          if (listLine.checkbox === "checked") {
            builder.add(checkboxStart, checkboxEnd, markDecorations.checkboxChecked);
          } else if (listLine.checkbox === "unchecked") {
            builder.add(checkboxStart, checkboxEnd, markDecorations.checkboxUnchecked);
          } else if (listLine.checkbox === "partial") {
            builder.add(checkboxStart, checkboxEnd, markDecorations.checkboxPartial);
          }
        }

        // Parse inline markup in list item content
        addInlineDecorations(builder, listLine.content, lineStart + docLine.text.indexOf(listLine.content));
        break;
      }

      case "planning": {
        const planningLine = line as import("$common/org_parser/engine.ts").PlanningLine;
        builder.add(lineStart, lineStart, lineDecorations.planning);

        // Highlight SCHEDULED, DEADLINE, CLOSED keywords and their timestamps
        const text = docLine.text;
        const keywordRegex = /(SCHEDULED|DEADLINE|CLOSED):\s*(<[^>]+>|\[[^\]]+\])/g;
        let match;
        while ((match = keywordRegex.exec(text)) !== null) {
          const keywordStart = lineStart + match.index;
          const keywordEnd = keywordStart + match[1].length + 1; // include colon
          builder.add(keywordStart, keywordEnd, markDecorations.planningKeyword);

          const timestampStart = keywordStart + match[0].indexOf(match[2]);
          const timestampEnd = timestampStart + match[2].length;
          builder.add(timestampStart, timestampEnd, markDecorations.planningTimestamp);
        }
        break;
      }
    }
  }

  return builder.finish();
}

// Helper to add inline markup decorations
function addInlineDecorations(
  builder: RangeSetBuilder<Decoration>,
  text: string,
  lineStart: number
) {
  const inlineElements = parseInlineCached(text);

  for (const elem of inlineElements) {
    const decoration = markDecorations[elem.type as keyof typeof markDecorations];
    if (decoration && typeof decoration !== "function") {
      builder.add(lineStart + elem.from, lineStart + elem.to, decoration);
    }
  }
}

// State field for decorations
export const orgDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return computeDecorations(state);
  },

  update(decorations, tr) {
    if (tr.docChanged) {
      return computeDecorations(tr.state);
    }
    return decorations;
  },

  provide: (field) => EditorView.decorations.from(field),
});

// Fold service for org-mode
const orgFoldService = foldService.of((state, lineStart, lineEnd) => {
  const engine = state.field(orgEngineField);
  const doc = state.doc;
  const lineNum = doc.lineAt(lineStart).number - 1; // Convert to 0-indexed

  // Check if this line is a headline
  const line = engine.lines[lineNum];
  if (!line || line.type !== "headline") {
    // Check for drawer start
    if (line?.type === "property-drawer-start" || line?.type === "logbook-start") {
      // Find the matching :END:
      for (let i = lineNum + 1; i < engine.lines.length; i++) {
        const nextLine = engine.lines[i];
        if (nextLine.type === "property-drawer-end") {
          const endDocLine = doc.line(i + 1);
          return { from: lineEnd, to: endDocLine.to };
        }
      }
    }
    return null;
  }

  // Find the headline node
  const headline = engine.getHeadlineAt(lineNum);
  if (!headline) return null;

  // Fold from end of headline line to end of section
  const headlineDocLine = doc.line(headline.startLine + 1);
  const endDocLine = doc.line(Math.min(headline.endLine + 1, doc.lines));

  if (headlineDocLine.to >= endDocLine.to) {
    return null; // Nothing to fold
  }

  return {
    from: headlineDocLine.to,
    to: endDocLine.to,
  };
});

// Theme for org-mode
export const orgModeTheme = EditorView.baseTheme({
  // Headline levels
  ".sb-line-org-h1": {
    fontSize: "1.6em",
    fontWeight: "bold",
  },
  ".sb-line-org-h2": {
    fontSize: "1.4em",
    fontWeight: "bold",
  },
  ".sb-line-org-h3": {
    fontSize: "1.2em",
    fontWeight: "bold",
  },
  ".sb-line-org-h4": {
    fontSize: "1.1em",
    fontWeight: "bold",
  },
  ".sb-line-org-h5, .sb-line-org-h6, .sb-line-org-h7, .sb-line-org-h8": {
    fontWeight: "bold",
  },

  // Stars (headline markers)
  ".sb-org-stars": {
    color: "var(--editor-headline-color, #888)",
    fontWeight: "normal",
  },

  // TODO states
  ".sb-org-todo": {
    fontWeight: "bold",
    padding: "0 4px",
    borderRadius: "3px",
  },
  ".sb-org-todo-todo": {
    color: "var(--org-todo-color, #e74c3c)",
    backgroundColor: "var(--org-todo-bg, rgba(231, 76, 60, 0.1))",
  },
  ".sb-org-todo-done": {
    color: "var(--org-done-color, #27ae60)",
    backgroundColor: "var(--org-done-bg, rgba(39, 174, 96, 0.1))",
  },
  ".sb-org-todo-next": {
    color: "var(--org-next-color, #3498db)",
    backgroundColor: "var(--org-next-bg, rgba(52, 152, 219, 0.1))",
  },
  ".sb-org-todo-waiting": {
    color: "var(--org-waiting-color, #f39c12)",
    backgroundColor: "var(--org-waiting-bg, rgba(243, 156, 18, 0.1))",
  },
  ".sb-org-todo-cancelled": {
    color: "var(--org-cancelled-color, #95a5a6)",
    backgroundColor: "var(--org-cancelled-bg, rgba(149, 165, 166, 0.1))",
    textDecoration: "line-through",
  },

  // Tags
  ".sb-org-tags": {
    color: "var(--org-tag-color, #9b59b6)",
    fontSize: "0.9em",
  },

  // Property drawer
  ".sb-line-org-property-drawer, .sb-line-org-property": {
    backgroundColor: "var(--org-drawer-bg, rgba(0, 0, 0, 0.03))",
    fontSize: "0.9em",
  },
  ".sb-org-drawer-delimiter": {
    color: "var(--org-drawer-delimiter-color, #7f8c8d)",
  },
  ".sb-org-property-key": {
    color: "var(--org-property-key-color, #2980b9)",
  },
  ".sb-org-property-value": {
    color: "var(--org-property-value-color, #16a085)",
  },

  // Logbook
  ".sb-line-org-logbook": {
    backgroundColor: "var(--org-logbook-bg, rgba(0, 0, 0, 0.02))",
    fontSize: "0.85em",
  },
  ".sb-org-timestamp": {
    color: "var(--org-timestamp-color, #8e44ad)",
    fontFamily: "monospace",
  },

  // Fold marker
  ".sb-org-fold-marker": {
    color: "var(--org-fold-marker-color, #bdc3c7)",
    backgroundColor: "var(--org-fold-marker-bg, rgba(0, 0, 0, 0.05))",
    padding: "0 4px",
    borderRadius: "3px",
    fontSize: "0.8em",
  },

  // Inline markup
  ".sb-org-bold": {
    fontWeight: "bold",
  },
  ".sb-org-italic": {
    fontStyle: "italic",
  },
  ".sb-org-underline": {
    textDecoration: "underline",
  },
  ".sb-org-strikethrough": {
    textDecoration: "line-through",
    opacity: "0.7",
  },
  ".sb-org-code": {
    fontFamily: "monospace",
    backgroundColor: "var(--org-code-bg, rgba(0, 0, 0, 0.05))",
    padding: "1px 4px",
    borderRadius: "3px",
    color: "var(--org-code-color, #c7254e)",
  },
  ".sb-org-verbatim": {
    fontFamily: "monospace",
    color: "var(--org-verbatim-color, #666)",
  },
  ".sb-org-link": {
    color: "var(--org-link-color, #3498db)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  ".sb-org-timestamp-active": {
    color: "var(--org-timestamp-active-color, #8e44ad)",
    backgroundColor: "var(--org-timestamp-active-bg, rgba(142, 68, 173, 0.1))",
    padding: "1px 4px",
    borderRadius: "3px",
  },
  ".sb-org-timestamp-inactive": {
    color: "var(--org-timestamp-inactive-color, #7f8c8d)",
    backgroundColor: "var(--org-timestamp-inactive-bg, rgba(127, 140, 141, 0.1))",
    padding: "1px 4px",
    borderRadius: "3px",
  },

  // List items
  ".sb-line-org-list-item": {
    // List items have normal styling, decoration comes from marker/checkbox
  },
  ".sb-org-list-marker": {
    color: "var(--org-list-marker-color, #7f8c8d)",
    fontWeight: "bold",
  },

  // Checkboxes
  ".sb-org-checkbox": {
    fontFamily: "monospace",
    fontWeight: "bold",
  },
  ".sb-org-checkbox-unchecked": {
    color: "var(--org-checkbox-unchecked-color, #e74c3c)",
  },
  ".sb-org-checkbox-checked": {
    color: "var(--org-checkbox-checked-color, #27ae60)",
  },
  ".sb-org-checkbox-partial": {
    color: "var(--org-checkbox-partial-color, #f39c12)",
  },

  // Planning (SCHEDULED, DEADLINE, CLOSED)
  ".sb-line-org-planning": {
    fontSize: "0.9em",
  },
  ".sb-org-planning-keyword": {
    fontWeight: "bold",
  },
  ".sb-org-planning-keyword:has(+ .sb-org-planning-timestamp)": {
    // Note: :has selector may not work in all browsers
  },
  ".sb-org-planning-timestamp": {
    color: "var(--org-planning-timestamp-color, #8e44ad)",
    backgroundColor: "var(--org-planning-timestamp-bg, rgba(142, 68, 173, 0.1))",
    padding: "1px 4px",
    borderRadius: "3px",
  },
});

// Main extension bundle
export function orgModePlugin(client?: Client): Extension {
  const extensions: Extension[] = [
    orgEngineField,
    orgDecorationField,
    orgFoldService,
    codeFolding({
      placeholderText: "...",
    }),
    orgModeTheme,
  ];

  // Add property drawer widget if client is available
  if (client) {
    extensions.push(orgPropertyDrawerPlugin(client));
    extensions.push(orgPropertyDrawerTheme);
  }

  return extensions;
}

// Export for testing
export { OrgEngine };
