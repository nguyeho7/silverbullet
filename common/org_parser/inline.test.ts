import { assertEquals } from "@std/assert/equals";
import { parseInline, type InlineElement, type LinkElement, type TimestampElement } from "./inline.ts";

Deno.test("parseInline - bold", () => {
  const result = parseInline("This is *bold* text");
  const bold = result.find(e => e.type === "bold");
  assertEquals(bold?.content, "bold");
  assertEquals(bold?.raw, "*bold*");
});

Deno.test("parseInline - italic", () => {
  const result = parseInline("This is /italic/ text");
  const italic = result.find(e => e.type === "italic");
  assertEquals(italic?.content, "italic");
  assertEquals(italic?.raw, "/italic/");
});

Deno.test("parseInline - underline", () => {
  const result = parseInline("This is _underlined_ text");
  const underline = result.find(e => e.type === "underline");
  assertEquals(underline?.content, "underlined");
});

Deno.test("parseInline - strikethrough", () => {
  const result = parseInline("This is +strikethrough+ text");
  const strike = result.find(e => e.type === "strikethrough");
  assertEquals(strike?.content, "strikethrough");
});

Deno.test("parseInline - code", () => {
  const result = parseInline("This is ~code~ text");
  const code = result.find(e => e.type === "code");
  assertEquals(code?.content, "code");
});

Deno.test("parseInline - verbatim", () => {
  const result = parseInline("This is =verbatim= text");
  const verbatim = result.find(e => e.type === "verbatim");
  assertEquals(verbatim?.content, "verbatim");
});

Deno.test("parseInline - link without description", () => {
  const result = parseInline("Check [[https://example.com]] for more");
  const link = result.find(e => e.type === "link") as LinkElement;
  assertEquals(link?.target, "https://example.com");
  assertEquals(link?.description, undefined);
});

Deno.test("parseInline - link with description", () => {
  const result = parseInline("Check [[https://example.com][Example]] for more");
  const link = result.find(e => e.type === "link") as LinkElement;
  assertEquals(link?.target, "https://example.com");
  assertEquals(link?.description, "Example");
});

Deno.test("parseInline - internal link", () => {
  const result = parseInline("See [[Other Page]] for details");
  const link = result.find(e => e.type === "link") as LinkElement;
  assertEquals(link?.target, "Other Page");
});

Deno.test("parseInline - active timestamp", () => {
  const result = parseInline("Meeting <2024-01-15 Mon>");
  const ts = result.find(e => e.type === "timestamp-active") as TimestampElement;
  assertEquals(ts?.date, "2024-01-15");
});

Deno.test("parseInline - active timestamp with time", () => {
  const result = parseInline("Meeting <2024-01-15 Mon 10:00>");
  const ts = result.find(e => e.type === "timestamp-active") as TimestampElement;
  assertEquals(ts?.date, "2024-01-15");
  assertEquals(ts?.time, "10:00");
});

Deno.test("parseInline - inactive timestamp", () => {
  const result = parseInline("Created [2024-01-15 Mon]");
  const ts = result.find(e => e.type === "timestamp-inactive") as TimestampElement;
  assertEquals(ts?.date, "2024-01-15");
});

Deno.test("parseInline - multiple elements", () => {
  const result = parseInline("This has *bold* and /italic/ and [[link]]");
  assertEquals(result.length, 3);
  assertEquals(result[0].type, "bold");
  assertEquals(result[1].type, "italic");
  assertEquals(result[2].type, "link");
});

Deno.test("parseInline - no false positives for paths", () => {
  // /path/to/file should not be parsed as italic
  const result = parseInline("The path is /home/user/file");
  const italic = result.find(e => e.type === "italic");
  assertEquals(italic, undefined);
});

Deno.test("parseInline - emphasis must not start/end with whitespace", () => {
  // * bold* is not valid (space at start)
  const result1 = parseInline("This is * not bold*");
  assertEquals(result1.find(e => e.type === "bold"), undefined);

  // *bold * is not valid (space at end)
  const result2 = parseInline("This is *not bold *");
  assertEquals(result2.find(e => e.type === "bold"), undefined);
});

Deno.test("parseInline - nested markup is raw", () => {
  // Nested markup is not supported, inner markup is literal
  const result = parseInline("This is *bold /and italic/*");
  const bold = result.find(e => e.type === "bold");
  assertEquals(bold?.content, "bold /and italic/");
});
