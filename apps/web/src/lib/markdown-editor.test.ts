import { describe, expect, it } from "vitest";
import { formatMarkdown } from "./markdown-editor";

describe("Markdown formatting", () => {
  it("wraps selected text and keeps it selected for toggling", () => {
    const formatted = formatMarkdown("Keep this clear", 5, 9, "bold");
    expect(formatted).toEqual({ text: "Keep **this** clear", start: 7, end: 11 });
    expect(formatMarkdown(formatted.text, formatted.start, formatted.end, "bold"))
      .toEqual({ text: "Keep this clear", start: 5, end: 9 });
  });

  it("adds italic inside bold and removes it without losing bold", () => {
    const result = formatMarkdown("**Clear**", 2, 7, "italic");
    expect(result).toEqual({ text: "***Clear***", start: 3, end: 8 });
    expect(formatMarkdown(result.text, result.start, result.end, "italic"))
      .toEqual({ text: "**Clear**", start: 2, end: 7 });
  });

  it("inserts a selected placeholder at an empty cursor", () => {
    expect(formatMarkdown("", 0, 0, "italic")).toEqual({ text: "*Text*", start: 1, end: 5 });
    expect(formatMarkdown("****", 2, 2, "bold")).toEqual({ text: "****Text****", start: 4, end: 8 });
  });

  it("formats whole selected lines without swallowing the next line", () => {
    const value = "First\nSecond\nThird";
    const result = formatMarkdown(value, 2, 13, "bullet-list");
    expect(result).toEqual({ text: "- First\n- Second\nThird", start: 0, end: 16 });
    expect(formatMarkdown(result.text, result.start, result.end, "bullet-list").text).toBe(value);
  });

  it("formats the containing line when the cursor is at the end", () => {
    expect(formatMarkdown("First\nSecond", 12, 12, "heading"))
      .toEqual({ text: "First\n## Second", start: 6, end: 15 });
  });

  it("normalizes partially formatted numbered lists and toggles them off", () => {
    const formatted = formatMarkdown("7. First\nSecond", 0, 15, "numbered-list");
    expect(formatted.text).toBe("1. First\n2. Second");
    expect(formatMarkdown(formatted.text, formatted.start, formatted.end, "numbered-list").text)
      .toBe("First\nSecond");
  });

  it("selects the link destination for immediate replacement", () => {
    const result = formatMarkdown("See references", 4, 14, "link");
    expect(result.text).toBe("See [references](https://)");
    expect(result.text.slice(result.start, result.end)).toBe("https://");
  });

  it("formats an empty final line without changing the previous one", () => {
    expect(formatMarkdown("First\n", 6, 6, "quote"))
      .toEqual({ text: "First\n> ", start: 6, end: 8 });
  });
});
