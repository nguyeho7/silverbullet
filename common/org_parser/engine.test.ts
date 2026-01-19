import { assertEquals } from "@std/assert/equals";
import {
  buildTree,
  OrgEngine,
  parseLine,
  parseLines,
} from "./engine.ts";

Deno.test("parseLine - headline", () => {
  const line = parseLine("* TODO My headline :tag1:tag2:", 0);
  assertEquals(line.type, "headline");
  if (line.type === "headline") {
    assertEquals(line.level, 1);
    assertEquals(line.todoState, "TODO");
    assertEquals(line.title, "My headline");
    assertEquals(line.tags, ["tag1", "tag2"]);
  }
});

Deno.test("parseLine - headline level 3", () => {
  const line = parseLine("*** DONE Another task", 0);
  assertEquals(line.type, "headline");
  if (line.type === "headline") {
    assertEquals(line.level, 3);
    assertEquals(line.todoState, "DONE");
    assertEquals(line.title, "Another task");
  }
});

Deno.test("parseLine - property drawer", () => {
  assertEquals(parseLine(":PROPERTIES:", 0).type, "property-drawer-start");
  assertEquals(parseLine(":END:", 0).type, "property-drawer-end");
});

Deno.test("parseLine - property", () => {
  const line = parseLine(":CREATED: 2024-01-15", 0);
  assertEquals(line.type, "property");
  if (line.type === "property") {
    assertEquals(line.key, "CREATED");
    assertEquals(line.value, "2024-01-15");
  }
});

Deno.test("parseLine - logbook", () => {
  assertEquals(parseLine(":LOGBOOK:", 0).type, "logbook-start");
});

Deno.test("parseLine - clock entry", () => {
  const line = parseLine("CLOCK: [2024-01-15 Mon 10:00]--[2024-01-15 Mon 11:00] =>  1:00", 0);
  assertEquals(line.type, "logbook-entry");
  if (line.type === "logbook-entry") {
    assertEquals(line.entryType, "clock");
  }
});

Deno.test("parseLine - text", () => {
  const line = parseLine("Some regular text", 0);
  assertEquals(line.type, "text");
});

Deno.test("parseLine - blank", () => {
  const line = parseLine("", 0);
  assertEquals(line.type, "blank");
});

Deno.test("buildTree - nested headlines", () => {
  const text = `* Heading 1
Some content
** Heading 1.1
More content
** Heading 1.2
*** Heading 1.2.1
* Heading 2`;

  const lines = parseLines(text);
  const tree = buildTree(lines);

  assertEquals(tree.headlines.length, 2);
  assertEquals(tree.headlines[0].line.title, "Heading 1");
  assertEquals(tree.headlines[0].children.length, 2);
  assertEquals(tree.headlines[0].children[0].line.title, "Heading 1.1");
  assertEquals(tree.headlines[0].children[1].line.title, "Heading 1.2");
  assertEquals(tree.headlines[0].children[1].children.length, 1);
  assertEquals(tree.headlines[0].children[1].children[0].line.title, "Heading 1.2.1");
  assertEquals(tree.headlines[1].line.title, "Heading 2");
});

Deno.test("buildTree - property drawer attached to headline", () => {
  const text = `* TODO My task
:PROPERTIES:
:CREATED: 2024-01-15
:PRIORITY: A
:END:
Task description here`;

  const lines = parseLines(text);
  const tree = buildTree(lines);

  assertEquals(tree.headlines.length, 1);
  const headline = tree.headlines[0];
  assertEquals(headline.line.todoState, "TODO");
  assertEquals(headline.propertyDrawer?.properties.get("CREATED"), "2024-01-15");
  assertEquals(headline.propertyDrawer?.properties.get("PRIORITY"), "A");
});

Deno.test("buildTree - logbook attached to headline", () => {
  const text = `* TODO My task
:LOGBOOK:
CLOCK: [2024-01-15 Mon 10:00]--[2024-01-15 Mon 11:00] =>  1:00
CLOCK: [2024-01-14 Sun 09:00]--[2024-01-14 Sun 10:30] =>  1:30
:END:`;

  const lines = parseLines(text);
  const tree = buildTree(lines);

  assertEquals(tree.headlines.length, 1);
  const headline = tree.headlines[0];
  assertEquals(headline.logbook?.entries.length, 2);
});

Deno.test("OrgEngine - incremental update", () => {
  const engine = new OrgEngine(`* Heading 1
Content`);

  assertEquals(engine.tree.headlines.length, 1);
  assertEquals(engine.tree.headlines[0].line.title, "Heading 1");

  // Update title
  engine.update(0, 0, "* Updated Heading");
  assertEquals(engine.tree.headlines[0].line.title, "Updated Heading");
});

Deno.test("OrgEngine - getHeadlineAt", () => {
  const engine = new OrgEngine(`* Heading 1
Some content
** Heading 1.1
More content
* Heading 2`);

  const h1 = engine.getHeadlineAt(0);
  assertEquals(h1?.line.title, "Heading 1");

  const h11 = engine.getHeadlineAt(2);
  assertEquals(h11?.line.title, "Heading 1.1");

  const h2 = engine.getHeadlineAt(4);
  assertEquals(h2?.line.title, "Heading 2");
});

Deno.test("buildTree - preamble before headlines", () => {
  const text = `Some preamble text
Another line
* First headline`;

  const lines = parseLines(text);
  const tree = buildTree(lines);

  assertEquals(tree.preamble.length, 2);
  assertEquals(tree.headlines.length, 1);
});

Deno.test("deeply nested headlines", () => {
  const text = `* Level 1
** Level 2
*** Level 3
**** Level 4
***** Level 5
****** Level 6
******* Level 7
******** Level 8`;

  const lines = parseLines(text);
  const tree = buildTree(lines);

  assertEquals(tree.headlines.length, 1);
  let current = tree.headlines[0];
  for (let level = 1; level <= 8; level++) {
    assertEquals(current.line.level, level);
    if (level < 8) {
      assertEquals(current.children.length, 1);
      current = current.children[0];
    }
  }
});
