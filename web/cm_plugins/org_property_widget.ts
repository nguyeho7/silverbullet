/**
 * Property drawer widget for org-mode
 *
 * Renders :PROPERTIES:...:END: blocks as an interactive table
 * Shows raw text when cursor is inside, table when outside
 */

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import type { Client } from "../client.ts";
import { decoratorStateField, isCursorInRange, invisibleDecoration } from "./util.ts";

interface Property {
  key: string;
  value: string;
  lineNum: number;
}

interface PropertyDrawer {
  startLine: number;
  endLine: number;
  startPos: number;
  endPos: number;
  properties: Property[];
}

/**
 * Parse property drawers from document text
 */
function findPropertyDrawers(state: EditorState): PropertyDrawer[] {
  const drawers: PropertyDrawer[] = [];
  const doc = state.doc;
  let inDrawer = false;
  let currentDrawer: PropertyDrawer | null = null;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text.trim();

    if (text === ":PROPERTIES:") {
      inDrawer = true;
      currentDrawer = {
        startLine: i,
        endLine: -1,
        startPos: line.from,
        endPos: -1,
        properties: [],
      };
    } else if (text === ":END:" && inDrawer && currentDrawer) {
      currentDrawer.endLine = i;
      currentDrawer.endPos = line.to;
      drawers.push(currentDrawer);
      inDrawer = false;
      currentDrawer = null;
    } else if (inDrawer && currentDrawer) {
      // Parse property line: :KEY: value
      const match = text.match(/^:([^:]+):\s*(.*)$/);
      if (match) {
        currentDrawer.properties.push({
          key: match[1],
          value: match[2],
          lineNum: i,
        });
      }
    }
  }

  return drawers;
}

/**
 * Widget that renders a property drawer as a table
 */
class PropertyTableWidget extends WidgetType {
  constructor(
    readonly drawer: PropertyDrawer,
    readonly client: Client,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "sb-org-property-drawer-widget";

    // Header
    const header = document.createElement("div");
    header.className = "sb-org-property-header";
    header.innerHTML = `<span class="sb-org-property-icon">⚙</span> Properties`;
    container.appendChild(header);

    // Table
    const table = document.createElement("table");
    table.className = "sb-org-property-table";

    for (const prop of this.drawer.properties) {
      const row = document.createElement("tr");
      row.className = "sb-org-property-row";

      const keyCell = document.createElement("td");
      keyCell.className = "sb-org-property-key";
      keyCell.textContent = prop.key;

      const valueCell = document.createElement("td");
      valueCell.className = "sb-org-property-value";
      valueCell.textContent = prop.value || "—";

      row.appendChild(keyCell);
      row.appendChild(valueCell);

      // Click to edit
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Navigate to the property line
        const line = this.client.editorView.state.doc.line(prop.lineNum);
        this.client.editorView.dispatch({
          selection: { anchor: line.from + line.text.indexOf(prop.value) },
        });
        this.client.focus();
      });

      table.appendChild(row);
    }

    if (this.drawer.properties.length === 0) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 2;
      emptyCell.className = "sb-org-property-empty";
      emptyCell.textContent = "No properties";
      emptyRow.appendChild(emptyCell);
      table.appendChild(emptyRow);
    }

    container.appendChild(table);

    // Click anywhere to expand/edit
    container.addEventListener("click", (e) => {
      if (e.target === container || e.target === header) {
        // Move cursor to inside the drawer to expand it
        this.client.editorView.dispatch({
          selection: { anchor: this.drawer.startPos + 12 }, // After :PROPERTIES:
        });
        this.client.focus();
      }
    });

    return container;
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof PropertyTableWidget)) return false;
    return this.drawer.startPos === other.drawer.startPos &&
      this.drawer.properties.length === other.drawer.properties.length &&
      this.drawer.properties.every((p, i) =>
        p.key === other.drawer.properties[i]?.key &&
        p.value === other.drawer.properties[i]?.value
      );
  }
}

/**
 * Create the property drawer plugin
 */
export function orgPropertyDrawerPlugin(client: Client) {
  return decoratorStateField((state) => {
    const widgets: Range<Decoration>[] = [];
    const drawers = findPropertyDrawers(state);

    for (const drawer of drawers) {
      const range: [number, number] = [drawer.startPos, drawer.endPos];

      // If cursor is inside, show raw text
      if (isCursorInRange(state, range)) {
        continue;
      }

      // Hide the entire drawer block
      widgets.push(
        invisibleDecoration.range(drawer.startPos, drawer.endPos),
      );

      // Add the widget at the start position
      widgets.push(
        Decoration.widget({
          widget: new PropertyTableWidget(drawer, client),
          block: true,
        }).range(drawer.startPos),
      );
    }

    return Decoration.set(widgets, true);
  });
}

// CSS styles for the widget (added via theme)
export const orgPropertyDrawerTheme = EditorView.baseTheme({
  ".sb-org-property-drawer-widget": {
    margin: "4px 0",
    border: "1px solid var(--org-drawer-border, #ddd)",
    borderRadius: "6px",
    backgroundColor: "var(--org-drawer-bg, rgba(0, 0, 0, 0.02))",
    overflow: "hidden",
    fontSize: "0.9em",
    cursor: "pointer",
  },
  ".sb-org-property-header": {
    padding: "6px 10px",
    backgroundColor: "var(--org-drawer-header-bg, rgba(0, 0, 0, 0.04))",
    borderBottom: "1px solid var(--org-drawer-border, #ddd)",
    fontWeight: "bold",
    color: "var(--org-drawer-header-color, #666)",
    fontSize: "0.85em",
  },
  ".sb-org-property-icon": {
    marginRight: "6px",
  },
  ".sb-org-property-table": {
    width: "100%",
    borderCollapse: "collapse",
  },
  ".sb-org-property-row": {
    borderBottom: "1px solid var(--org-drawer-border, #eee)",
    "&:last-child": {
      borderBottom: "none",
    },
    "&:hover": {
      backgroundColor: "var(--org-drawer-hover-bg, rgba(0, 0, 0, 0.03))",
    },
  },
  ".sb-org-property-key": {
    padding: "4px 10px",
    fontWeight: "500",
    color: "var(--org-property-key-color, #2980b9)",
    width: "30%",
    verticalAlign: "top",
  },
  ".sb-org-property-value": {
    padding: "4px 10px",
    color: "var(--org-property-value-color, #333)",
  },
  ".sb-org-property-empty": {
    padding: "8px 10px",
    color: "var(--org-property-empty-color, #999)",
    fontStyle: "italic",
    textAlign: "center",
  },
});
