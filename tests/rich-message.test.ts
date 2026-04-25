import { describe, expect, it } from "vitest";
import {
  isHtmlLanguage,
  isMarkdownLanguage,
  normalizeLanguage,
  parseMarkdownParts
} from "@/components/rich-message";

describe("rich message markdown parsing", () => {
  it("splits text and fenced code blocks", () => {
    const parts = parseMarkdownParts("Antes\n```ts\nconst ok = true;\n```\nDepois");

    expect(parts).toEqual([
      { type: "text", content: "Antes\n" },
      { type: "code", language: "ts", code: "const ok = true;\n" },
      { type: "text", content: "\nDepois" }
    ]);
  });

  it("treats unfinished fences as code while streaming", () => {
    const parts = parseMarkdownParts("Antes\n```html\n<div>streaming");

    expect(parts).toEqual([
      { type: "text", content: "Antes\n" },
      { type: "code", language: "html", code: "<div>streaming" }
    ]);
  });

  it("normalizes common language aliases", () => {
    expect(normalizeLanguage("typescript")).toBe("ts");
    expect(normalizeLanguage("javascript")).toBe("js");
    expect(normalizeLanguage("markdown")).toBe("md");
    expect(normalizeLanguage("language-html")).toBe("html");
  });

  it("detects previewable markdown and html blocks", () => {
    expect(isMarkdownLanguage("md")).toBe(true);
    expect(isMarkdownLanguage("markdown")).toBe(true);
    expect(isHtmlLanguage("html")).toBe(true);
    expect(isHtmlLanguage("ts")).toBe(false);
  });
});
