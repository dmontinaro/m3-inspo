import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
import { useRef, useState } from "react";
import { Bold, Code2, Heading2, Italic, Link, List, ListOrdered, Quote } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatMarkdown } from "#/lib/markdown-editor";
import type { MarkdownFormat } from "#/lib/markdown-editor";

const formats = [
  { format: "heading", get label() { return m.font_role_heading(); }, icon: Heading2 },
  { format: "bold", get label() { return m.markdown_bold(); }, icon: Bold },
  { format: "italic", get label() { return m.markdown_italic(); }, icon: Italic },
  { format: "bullet-list", get label() { return m.markdown_bullet_list(); }, icon: List },
  { format: "numbered-list", get label() { return m.markdown_ordered_list(); }, icon: ListOrdered },
  { format: "quote", get label() { return m.markdown_quote(); }, icon: Quote },
  { format: "code", get label() { return m.markdown_code(); }, icon: Code2 },
  { format: "link", get label() { return m.markdown_link(); }, icon: Link },
] satisfies { format: MarkdownFormat; label: string; icon: typeof Bold }[];

/** Markdown source with selection-aware formatting and a preview of the current unsaved text. */
export function MarkdownEditor({ value, onChange, disabled, maxLength, labelledBy, describedBy, placeholder }: {
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
  maxLength: number;
  labelledBy: string;
  describedBy: string;
  placeholder: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [limitReached, setLimitReached] = useState(false);

  function format(action: MarkdownFormat) {
    const field = textarea.current;
    if (!field || disabled) return;
    const changed = formatMarkdown(value, field.selectionStart, field.selectionEnd, action);
    if (changed.text.length > maxLength) {
      setLimitReached(true);
      return;
    }
    setLimitReached(false);
    onChange(changed.text);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(changed.start, changed.end);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5">
        <div className="flex flex-wrap items-center" role="group" aria-label={m.markdown_format()}>
          {formats.map(({ format: action, label, icon: Icon }) => (
            <button
              key={action}
              type="button"
              aria-label={label}
              title={label}
              disabled={disabled || mode === "preview"}
              onClick={() => format(action)}
              className="flex size-10 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900 disabled:opacity-40"
            >
              <Icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
        <div role="group" aria-label={m.markdown_view()} className="flex rounded-md bg-neutral-200/70 p-0.5 text-sm">
          {([{ value: "edit", label: m.action_edit() }, { value: "preview", label: m.preview_title() }] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
              className={`min-h-9 rounded px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900 ${mode === option.value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {mode === "edit" ? (
        <textarea
          ref={textarea}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => { setLimitReached(false); onChange(event.target.value); }}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            const key = event.key.toLowerCase();
            const shortcut = key === "b" ? "bold" : key === "i" ? "italic" : key === "k" ? "link" : null;
            if (!shortcut) return;
            event.preventDefault();
            format(shortcut);
          }}
          disabled={disabled}
          maxLength={maxLength}
          rows={16}
          spellCheck={false}
          placeholder={placeholder}
          className="block min-h-80 w-full resize-y bg-white p-4 font-mono text-sm leading-relaxed text-neutral-900 caret-neutral-900 placeholder:text-neutral-500 focus:outline-2 focus:-outline-offset-2 focus:outline-neutral-900 selection:bg-neutral-200 disabled:opacity-60"
        />
      ) : (
        <div role="region" aria-label={m.markdown_preview()} className="min-h-80 p-4 sm:p-6">
          {value.trim() ? (
            <div className="max-w-prose break-words text-sm leading-7 text-neutral-800 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-5 [&_h4]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-4 [&_blockquote]:border-l [&_blockquote]:border-neutral-300 [&_blockquote]:pl-4 [&_blockquote]:text-neutral-600 [&_a]:underline [&_a]:underline-offset-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-neutral-100 [&_pre]:p-3 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_img]:max-w-full [&_hr]:my-6 [&_hr]:border-neutral-200 [&_th]:border-b [&_th]:border-neutral-300 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border-b [&_td]:border-neutral-200 [&_td]:px-3 [&_td]:py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
                table: ({ children }) => <div className="overflow-x-auto"><table className="w-full">{children}</table></div>,
                a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
              }}>{value}</ReactMarkdown>
            </div>
          ) : <p className="text-sm text-neutral-500">{m.markdown_empty()}</p>}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-neutral-200 px-3 py-2 text-xs text-neutral-600">
        <span role="status">{limitReached ? m.markdown_limit() : mode === "preview" ? m.markdown_preview_help() : m.markdown_shortcuts()}</span>
        <span>{m.markdown_character_count({ count: value.length, formattedCount: formatNumber(value.length), max: formatNumber(maxLength) })}</span>
      </div>
    </div>
  );
}
