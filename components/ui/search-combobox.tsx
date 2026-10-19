"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiGet, ApiClientError } from "@/lib/client/api-client";

export interface ComboItem {
  id: string;
  primary: string;
  secondary?: string;
}

interface Props<T> {
  label: string;
  placeholder: string;
  endpoint: "/api/trains/search" | "/api/stations/search";
  toItem: (raw: T) => ComboItem;
  onSelect: (item: ComboItem) => void;
  /** Text shown initially (e.g. a pre-selected station). */
  defaultValue?: string;
  /** Allow submitting free text that matches the id pattern without picking a suggestion. */
  acceptRaw?: (text: string) => ComboItem | null;
  name?: string;
  required?: boolean;
}

/**
 * Accessible autocomplete (WAI-ARIA combobox pattern): arrow keys move,
 * Enter selects, Escape closes. Suggestions come from the backend search API.
 */
export function SearchCombobox<T>({ label, placeholder, endpoint, toItem, onSelect, defaultValue = "", acceptRaw, name, required }: Props<T>) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(defaultValue);
  // What the user actually typed. Pre-filled or chosen values never trigger a search.
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ComboItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus("loading");
      apiGet<T[]>(`${endpoint}?q=${encodeURIComponent(q)}`, ctrl.signal)
        .then((r) => {
          const mapped = r.data.map(toItem);
          setItems(mapped);
          setActive(mapped.length ? 0 : -1);
          setStatus(mapped.length ? "idle" : "empty");
          setOpen(true);
        })
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          setStatus("error");
          setErrorMsg(e instanceof ApiClientError ? e.message : "Search failed.");
          setOpen(true);
        });
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // toItem is expected to be stable in behaviour; re-running on identity change would refetch needlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, endpoint]);

  // Below two characters there is nothing to search; derive that instead of resetting state.
  const searchable = query.trim().length >= 2;
  const shownItems = searchable ? items : [];
  const shownStatus = searchable ? status : "idle";

  function choose(item: ComboItem) {
    setText(item.secondary ? `${item.primary} — ${item.secondary}` : item.primary);
    setQuery("");
    setOpen(false);
    onSelect(item);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(shownItems.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && shownItems[active]) {
        e.preventDefault();
        choose(shownItems[active]);
      } else if (acceptRaw) {
        const raw = acceptRaw(text.trim());
        if (raw) {
          e.preventDefault();
          choose(raw);
        }
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => shownItems.length && setOpen(true)}
        ref={inputRef}
        enterKeyHint="search"
        className="w-full rounded-xl border border-border bg-surface py-3 pr-10 pl-3 text-base placeholder:text-muted"
      />
      {text && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => {
            setText("");
            setQuery("");
            setOpen(false);
            inputRef.current?.focus();
          }}
          className="absolute right-2 bottom-2 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2"
        >
          <span aria-hidden>×</span>
        </button>
      )}
      <div aria-live="polite" className="sr-only">
        {shownStatus === "loading" ? "Searching" : shownStatus === "empty" ? "No matches" : open && shownItems.length ? `${shownItems.length} suggestions` : ""}
      </div>
      {open && (shownItems.length > 0 || shownStatus === "empty" || shownStatus === "error") && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          {shownStatus === "error" && <li className="px-3 py-2 text-sm text-bad">{errorMsg}</li>}
          {shownStatus === "empty" && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
          {shownItems.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="font-mono font-semibold">{item.primary}</span>
              {item.secondary && <span className="ml-2 text-sm text-muted">{item.secondary}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
