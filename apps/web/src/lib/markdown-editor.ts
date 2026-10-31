export type MarkdownFormat = "heading" | "bold" | "italic" | "bullet-list" | "numbered-list" | "quote" | "code" | "link";

/** Formats the selection, or its containing lines, and returns the selection to restore in the editor. */
export function formatMarkdown(value: string, start: number, end: number, format: MarkdownFormat) {
  if (["heading", "bullet-list", "numbered-list", "quote"].includes(format)) {
    const from = value.slice(0, start).lastIndexOf("\n") + 1;
    const selectedEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const nextBreak = value.indexOf("\n", selectedEnd);
    const to = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(from, to).split("\n");
    const markers = { heading: /^#{1,6} /, "bullet-list": /^[-*+] /, "numbered-list": /^\d+\. /, quote: /^> / };
    const marker = format === "heading" ? markers.heading : format === "bullet-list" ? markers["bullet-list"] : format === "numbered-list" ? markers["numbered-list"] : markers.quote;
    const remove = lines.every((line) => marker.test(line));
    const replacement = lines.map((line, index) => {
      const clean = line.replace(marker, "");
      if (remove) return clean;
      const prefix = format === "heading" ? "## " : format === "bullet-list" ? "- " : format === "numbered-list" ? `${index + 1}. ` : "> ";
      return prefix + clean;
    }).join("\n");
    return { text: value.slice(0, from) + replacement + value.slice(to), start: from, end: from + replacement.length };
  }

  const selected = value.slice(start, end) || (format === "link" ? "Linktext" : "Text");
  if (format === "link") {
    const replacement = `[${selected}](https://)`;
    const urlStart = start + selected.length + 3;
    return { text: value.slice(0, start) + replacement + value.slice(end), start: urlStart, end: urlStart + 8 };
  }
  const marker = format === "bold" ? "**" : format === "italic" ? "*" : "`";
  // A single italic marker can sit inside bold, but bold alone must not toggle off as italic.
  const italicCanToggle = format !== "italic" || (
    (value.slice(0, start).match(/\*+$/)?.[0].length ?? 0) % 2 === 1 &&
    (value.slice(end).match(/^\*+/)?.[0].length ?? 0) % 2 === 1
  );
  if (italicCanToggle && end > start && start >= marker.length && value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker) {
    return { text: value.slice(0, start - marker.length) + selected + value.slice(end + marker.length), start: start - marker.length, end: end - marker.length };
  }
  return { text: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + marker.length, end: start + marker.length + selected.length };
}
