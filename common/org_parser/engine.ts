/**
 * Line-based Org-mode parser engine
 *
 * Architecture:
 * - Lines are the atom of incremental updates
 * - Structure (tree) is derived from line types and levels
 * - Inline parsing is separate and lazy
 */

// Line types
export type LineType =
  | "headline"
  | "property-drawer-start"
  | "property-drawer-end"
  | "property"
  | "logbook-start"
  | "logbook-end"
  | "logbook-entry"
  | "list-item"
  | "planning"
  | "text"
  | "blank";

export interface ParsedLine {
  type: LineType;
  raw: string;
  lineNumber: number;
}

export interface HeadlineLine extends ParsedLine {
  type: "headline";
  level: number;
  todoState?: string;
  title: string;
  tags?: string[];
}

export interface PropertyLine extends ParsedLine {
  type: "property";
  key: string;
  value: string;
}

export interface LogbookEntryLine extends ParsedLine {
  type: "logbook-entry";
  entryType: "clock" | "state" | "note";
  content: string;
}

export interface TextLine extends ParsedLine {
  type: "text";
  indent: number;
  text: string;
}

// List item types
export type ListMarker = "-" | "+" | "*" | "number";
export type CheckboxState = "checked" | "unchecked" | "partial" | undefined;

export interface ListItemLine extends ParsedLine {
  type: "list-item";
  indent: number;
  marker: ListMarker;
  markerValue?: string; // For numbered lists: "1.", "2)", etc.
  checkbox?: CheckboxState;
  content: string;
}

// Planning line (SCHEDULED, DEADLINE, CLOSED)
export interface PlanningLine extends ParsedLine {
  type: "planning";
  scheduled?: string;
  deadline?: string;
  closed?: string;
}

export interface BlankLine extends ParsedLine {
  type: "blank";
}

export interface DrawerStartLine extends ParsedLine {
  type: "property-drawer-start" | "logbook-start";
}

export interface DrawerEndLine extends ParsedLine {
  type: "property-drawer-end" | "logbook-end";
}

export type AnyLine =
  | HeadlineLine
  | PropertyLine
  | LogbookEntryLine
  | ListItemLine
  | PlanningLine
  | TextLine
  | BlankLine
  | DrawerStartLine
  | DrawerEndLine;

// Tree node types
export interface PropertyDrawer {
  properties: Map<string, string>;
  startLine: number;
  endLine: number;
}

export interface Logbook {
  entries: LogbookEntryLine[];
  startLine: number;
  endLine: number;
}

export interface Planning {
  scheduled?: string;
  deadline?: string;
  closed?: string;
}

export interface HeadlineNode {
  line: HeadlineLine;
  planning?: Planning;
  propertyDrawer?: PropertyDrawer;
  logbook?: Logbook;
  content: AnyLine[];
  children: HeadlineNode[];
  parent?: HeadlineNode;
  startLine: number;
  endLine: number;
}

export interface OrgDocument {
  preamble: AnyLine[]; // Content before first headline
  headlines: HeadlineNode[];
  lines: AnyLine[];
}

// Patterns for line classification
const HEADLINE_PATTERN = /^(\*+)\s+(?:(TODO|DONE|NEXT|WAITING|CANCELLED)\s+)?(.+?)(?:\s+:([\w:]+):)?$/;
const PROPERTY_DRAWER_START = /^:PROPERTIES:\s*$/;
const PROPERTY_DRAWER_END = /^:END:\s*$/;
const PROPERTY_PATTERN = /^:([^:]+):\s*(.*)$/;
const LOGBOOK_START = /^:LOGBOOK:\s*$/;
const LOGBOOK_END = /^:END:\s*$/;
const CLOCK_PATTERN = /^CLOCK:\s*(.+)$/;
const STATE_PATTERN = /^-\s+State\s+"([^"]+)"\s+from\s+"([^"]+)"\s+(.+)$/;
const BLANK_PATTERN = /^\s*$/;

// List item patterns
// Matches: "  - item", "  + item", "  1. item", "  1) item", with optional checkbox
const LIST_ITEM_PATTERN = /^(\s*)([-+]|\d+[.)])\s+(?:\[([ X-])\]\s+)?(.*)$/;

// Planning line pattern (SCHEDULED, DEADLINE, CLOSED)
const PLANNING_PATTERN = /^(SCHEDULED|DEADLINE|CLOSED):\s*(<[^>]+>|\[[^\]]+\])/g;
const PLANNING_LINE_PATTERN = /^\s*((?:SCHEDULED|DEADLINE|CLOSED):\s*(?:<[^>]+>|\[[^\]]+\])\s*)+$/;

/**
 * Parse a single line and determine its type
 */
export function parseLine(text: string, lineNumber: number): AnyLine {
  // Check for headline
  const headlineMatch = text.match(HEADLINE_PATTERN);
  if (headlineMatch) {
    const tags = headlineMatch[4]?.split(":").filter((t) => t) || undefined;
    return {
      type: "headline",
      raw: text,
      lineNumber,
      level: headlineMatch[1].length,
      todoState: headlineMatch[2],
      title: headlineMatch[3],
      tags,
    };
  }

  // Check for property drawer boundaries
  if (PROPERTY_DRAWER_START.test(text)) {
    return { type: "property-drawer-start", raw: text, lineNumber };
  }

  // Check for logbook boundaries
  if (LOGBOOK_START.test(text)) {
    return { type: "logbook-start", raw: text, lineNumber };
  }

  // Check for drawer end (could be property or logbook)
  if (PROPERTY_DRAWER_END.test(text) || LOGBOOK_END.test(text)) {
    // We'll determine which type based on context during tree building
    return { type: "property-drawer-end", raw: text, lineNumber };
  }

  // Check for property line
  const propertyMatch = text.match(PROPERTY_PATTERN);
  if (propertyMatch && propertyMatch[1] !== "PROPERTIES" && propertyMatch[1] !== "LOGBOOK" && propertyMatch[1] !== "END") {
    return {
      type: "property",
      raw: text,
      lineNumber,
      key: propertyMatch[1],
      value: propertyMatch[2],
    };
  }

  // Check for logbook entries
  const clockMatch = text.trim().match(CLOCK_PATTERN);
  if (clockMatch) {
    return {
      type: "logbook-entry",
      raw: text,
      lineNumber,
      entryType: "clock",
      content: clockMatch[1],
    };
  }

  const stateMatch = text.trim().match(STATE_PATTERN);
  if (stateMatch) {
    return {
      type: "logbook-entry",
      raw: text,
      lineNumber,
      entryType: "state",
      content: text.trim(),
    };
  }

  // Check for planning line (SCHEDULED, DEADLINE, CLOSED)
  if (PLANNING_LINE_PATTERN.test(text.trim())) {
    const planningLine: PlanningLine = {
      type: "planning",
      raw: text,
      lineNumber,
    };

    // Extract each planning keyword
    const planningText = text.trim();
    let match;
    const regex = /(?:SCHEDULED|DEADLINE|CLOSED):\s*(<[^>]+>|\[[^\]]+\])/g;
    while ((match = regex.exec(planningText)) !== null) {
      const fullMatch = match[0];
      const timestamp = match[1];
      if (fullMatch.startsWith("SCHEDULED")) {
        planningLine.scheduled = timestamp;
      } else if (fullMatch.startsWith("DEADLINE")) {
        planningLine.deadline = timestamp;
      } else if (fullMatch.startsWith("CLOSED")) {
        planningLine.closed = timestamp;
      }
    }

    return planningLine;
  }

  // Check for list item
  const listMatch = text.match(LIST_ITEM_PATTERN);
  if (listMatch) {
    const indent = listMatch[1].length;
    const markerStr = listMatch[2];
    const checkboxChar = listMatch[3];
    const content = listMatch[4];

    let marker: ListMarker;
    let markerValue: string | undefined;

    if (markerStr === "-") {
      marker = "-";
    } else if (markerStr === "+") {
      marker = "+";
    } else if (markerStr === "*") {
      marker = "*";
    } else {
      marker = "number";
      markerValue = markerStr;
    }

    let checkbox: CheckboxState;
    if (checkboxChar !== undefined) {
      if (checkboxChar === "X") {
        checkbox = "checked";
      } else if (checkboxChar === " ") {
        checkbox = "unchecked";
      } else if (checkboxChar === "-") {
        checkbox = "partial";
      }
    }

    return {
      type: "list-item",
      raw: text,
      lineNumber,
      indent,
      marker,
      markerValue,
      checkbox,
      content,
    };
  }

  // Check for blank line
  if (BLANK_PATTERN.test(text)) {
    return { type: "blank", raw: text, lineNumber };
  }

  // Default to text
  const indent = text.match(/^(\s*)/)?.[1].length || 0;
  return {
    type: "text",
    raw: text,
    lineNumber,
    indent,
    text: text.trimStart(),
  };
}

/**
 * Parse all lines in a document
 */
export function parseLines(text: string): AnyLine[] {
  return text.split("\n").map((line, i) => parseLine(line, i));
}

/**
 * Build tree structure from parsed lines
 * Headlines own everything until the next same-or-higher-level headline
 */
export function buildTree(lines: AnyLine[]): OrgDocument {
  const doc: OrgDocument = {
    preamble: [],
    headlines: [],
    lines,
  };

  const stack: HeadlineNode[] = [];
  let currentHeadline: HeadlineNode | null = null;
  let inPropertyDrawer = false;
  let inLogbook = false;
  let currentDrawerStart = -1;

  for (const line of lines) {
    if (line.type === "headline") {
      // Close any open headline
      if (currentHeadline) {
        currentHeadline.endLine = line.lineNumber - 1;
      }

      // Create new headline node
      const node: HeadlineNode = {
        line: line as HeadlineLine,
        content: [],
        children: [],
        startLine: line.lineNumber,
        endLine: line.lineNumber, // Will be updated
      };

      // Find parent by popping stack until we find lower level
      while (stack.length && stack[stack.length - 1].line.level >= line.level) {
        const popped = stack.pop()!;
        popped.endLine = line.lineNumber - 1;
      }

      // Attach to parent or root
      if (stack.length) {
        const parent = stack[stack.length - 1];
        node.parent = parent;
        parent.children.push(node);
      } else {
        doc.headlines.push(node);
      }

      stack.push(node);
      currentHeadline = node;
      inPropertyDrawer = false;
      inLogbook = false;
    } else if (currentHeadline === null) {
      // Before any headline - goes to preamble
      doc.preamble.push(line);
    } else {
      // Content belongs to current headline
      if (line.type === "property-drawer-start") {
        inPropertyDrawer = true;
        inLogbook = false;
        currentDrawerStart = line.lineNumber;
        currentHeadline.propertyDrawer = {
          properties: new Map(),
          startLine: line.lineNumber,
          endLine: -1,
        };
      } else if (line.type === "logbook-start") {
        inLogbook = true;
        inPropertyDrawer = false;
        currentDrawerStart = line.lineNumber;
        currentHeadline.logbook = {
          entries: [],
          startLine: line.lineNumber,
          endLine: -1,
        };
      } else if (line.type === "property-drawer-end") {
        if (inPropertyDrawer && currentHeadline.propertyDrawer) {
          currentHeadline.propertyDrawer.endLine = line.lineNumber;
          inPropertyDrawer = false;
        } else if (inLogbook && currentHeadline.logbook) {
          currentHeadline.logbook.endLine = line.lineNumber;
          inLogbook = false;
        }
      } else if (line.type === "property" && inPropertyDrawer && currentHeadline.propertyDrawer) {
        const propLine = line as PropertyLine;
        currentHeadline.propertyDrawer.properties.set(propLine.key, propLine.value);
      } else if (line.type === "logbook-entry" && inLogbook && currentHeadline.logbook) {
        currentHeadline.logbook.entries.push(line as LogbookEntryLine);
      } else if (line.type === "planning") {
        // Planning lines (SCHEDULED, DEADLINE, CLOSED) attach to headline
        const planningLine = line as PlanningLine;
        if (!currentHeadline.planning) {
          currentHeadline.planning = {};
        }
        if (planningLine.scheduled) {
          currentHeadline.planning.scheduled = planningLine.scheduled;
        }
        if (planningLine.deadline) {
          currentHeadline.planning.deadline = planningLine.deadline;
        }
        if (planningLine.closed) {
          currentHeadline.planning.closed = planningLine.closed;
        }
      } else {
        currentHeadline.content.push(line);
      }
    }
  }

  // Close remaining headlines
  const lastLine = lines.length - 1;
  for (const node of stack) {
    node.endLine = lastLine;
  }

  return doc;
}

/**
 * Main Org Engine class - manages incremental updates
 */
export class OrgEngine {
  private _lines: AnyLine[] = [];
  private _tree: OrgDocument | null = null;
  private _dirty = true;

  constructor(text: string = "") {
    if (text) {
      this._lines = parseLines(text);
      this._dirty = true;
    }
  }

  /**
   * Get all parsed lines
   */
  get lines(): AnyLine[] {
    return this._lines;
  }

  /**
   * Get the document tree (built lazily)
   */
  get tree(): OrgDocument {
    if (this._dirty || !this._tree) {
      this._tree = buildTree(this._lines);
      this._dirty = false;
    }
    return this._tree;
  }

  /**
   * Update lines when document changes
   * This is the incremental update entry point
   */
  update(fromLine: number, toLine: number, newText: string): void {
    const newLines = newText.split("\n").map((text, i) =>
      parseLine(text, fromLine + i)
    );

    // Splice in new lines
    this._lines.splice(fromLine, toLine - fromLine + 1, ...newLines);

    // Renumber lines after the change
    for (let i = fromLine + newLines.length; i < this._lines.length; i++) {
      this._lines[i].lineNumber = i;
    }

    this._dirty = true;
  }

  /**
   * Replace entire document
   */
  reset(text: string): void {
    this._lines = parseLines(text);
    this._dirty = true;
  }

  /**
   * Get headline at a specific line number
   */
  getHeadlineAt(lineNumber: number): HeadlineNode | null {
    const findInNodes = (nodes: HeadlineNode[]): HeadlineNode | null => {
      for (const node of nodes) {
        if (lineNumber >= node.startLine && lineNumber <= node.endLine) {
          // Check children first (more specific match)
          const childMatch = findInNodes(node.children);
          if (childMatch) return childMatch;
          return node;
        }
      }
      return null;
    };

    return findInNodes(this.tree.headlines);
  }

  /**
   * Get fold range for a headline (from end of headline line to end of section)
   */
  getFoldRange(headline: HeadlineNode): { from: number; to: number } | null {
    if (headline.startLine === headline.endLine && headline.children.length === 0) {
      return null; // Nothing to fold
    }

    return {
      from: headline.startLine,
      to: headline.endLine,
    };
  }

  /**
   * Get all headlines as flat list
   */
  getAllHeadlines(): HeadlineNode[] {
    const result: HeadlineNode[] = [];

    const collect = (nodes: HeadlineNode[]) => {
      for (const node of nodes) {
        result.push(node);
        collect(node.children);
      }
    };

    collect(this.tree.headlines);
    return result;
  }
}
