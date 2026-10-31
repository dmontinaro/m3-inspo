import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { disallowedTagCharacters, maxTagLength, maxTags, normalizeTag } from "#/lib/tags";
import { listTags } from "#/server/library.functions";

type TagInputProps = {
  /** The text field's id, for the field's `<label htmlFor>`. */
  id: string;
  defaultTags?: string[];
  /** Id of an error message below, for screen readers. */
  errorId?: string;
  autoFocus?: boolean;
};

const maxSuggestions = 8;

/**
 * The owner's tags as chips plus a text field, inside a form. Enter or a
 * comma turns the text into a tag, Backspace in the empty field removes the
 * last one, leaving the field does the same as Enter. While the field has
 * focus, tags used before show below, most used first; ↑/↓ and Enter pick
 * one. Each tag goes with the form as one `tags` entry; the server checks
 * them again (lib/tags.ts).
 */
export function TagInput({ id, defaultTags = [], errorId, autoFocus }: TagInputProps) {
  const [tags, setTags] = useState(defaultTags);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [known, setKnown] = useState<string[]>([]);
  const listId = useId();

  useEffect(() => {
    let current = true;
    // Without suggestions the input still works, so a failed request stays silent.
    listTags().then(
      (all) => current && setKnown(all),
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);

  const typed = normalizeTag(draft);
  const suggestions = known
    .filter((tag) => !tags.includes(tag) && tag.includes(typed) && tag !== typed)
    .slice(0, maxSuggestions);
  const full = tags.length >= maxTags;
  const open = focused && !full && suggestions.length > 0;

  function add(values: string[]) {
    const fresh = values.map(normalizeTag).filter((tag) => tag && !tags.includes(tag));
    setTags([...new Set([...tags, ...fresh])].slice(0, maxTags));
    setDraft("");
    setActive(-1);
  }

  function change(value: string) {
    // Commas split, so a pasted "hotel, tos" becomes two tags. Other characters a tag may not hold ("#") just drop.
    const parts = value.split(",").map((part) => part.replace(disallowedTagCharacters, ""));
    const rest = parts.pop() ?? "";
    if (parts.length > 0) add(parts);
    setDraft(rest.slice(0, maxTagLength));
    setActive(-1);
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    const modified = event.metaKey || event.ctrlKey;
    if (event.key === "Enter" && !modified) {
      // Enter adds a tag here and never submits the form; Ctrl/⌘+Enter still saves.
      event.preventDefault();
      const picked = suggestions[active];
      if (open && picked) add([picked]);
      else if (typed) add([typed]);
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    } else if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      // Cycles through the suggestions and back to "none" (-1).
      const step = event.key === "ArrowDown" ? 1 : -1;
      const slots = suggestions.length + 1;
      setActive((index) => ((index + 1 + step + slots) % slots) - 1);
    } else if (event.key === "Escape" && active >= 0) {
      // Leaves the dialog or the edit mode open; only the highlight goes.
      event.preventDefault();
      event.stopPropagation();
      setActive(-1);
    }
  }

  return (
    <div className="mt-1.5">
      <div className="flex min-h-[2.625rem] flex-wrap items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1.5 focus-within:border-neutral-900 focus-within:ring-1 focus-within:ring-neutral-900">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 py-0.5 pr-0.5 pl-2.5 text-sm text-neutral-800 ring-1 ring-neutral-200 ring-inset"
          >
            {tag}
            <input type="hidden" name="tags" value={tag} />
            <button
              type="button"
              onClick={() => setTags(tags.filter((current) => current !== tag))}
              aria-label={`Tag „${tag}“ entfernen`}
              className="grid size-5 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="size-3 fill-none stroke-current stroke-2">
                <path d="m4.5 4.5 7 7m0-7-7 7" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          id={id}
          autoFocus={autoFocus}
          // Text not yet turned into a tag is sent too, e.g. on Ctrl/⌘+Enter while typing.
          name="tags"
          value={draft}
          onChange={(event) => change(event.target.value)}
          onKeyDown={handleKeys}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (typed) add([typed]);
          }}
          // Full: no more typing, but Backspace still removes the last tag.
          readOnly={full}
          placeholder={full ? `Höchstens ${maxTags} Tags` : tags.length === 0 ? "z. B. Projekt oder Thema" : ""}
          autoComplete="off"
          enterKeyHint="enter"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Vorschläge"
        hidden={!open}
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        {suggestions.map((tag, index) => (
          <li
            key={tag}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Keeps the focus in the text field, so the list stays open for the next pick.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => add([tag])}
            className="cursor-pointer rounded-full px-2.5 py-0.5 text-sm text-neutral-500 ring-1 ring-neutral-200 ring-inset hover:bg-neutral-100 hover:text-neutral-900 aria-selected:bg-neutral-900 aria-selected:text-white aria-selected:ring-neutral-900"
          >
            <span aria-hidden className="mr-0.5 opacity-60">
              +
            </span>
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}
