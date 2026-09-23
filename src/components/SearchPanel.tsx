import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import { searchEntries, type EntryKind, type EntrySearchResult } from "@/utils/entrySearch";

type KindFilter = EntryKind | "all";

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "word", label: "Definitions" },
  { value: "translation", label: "Translations" },
];

interface SearchPanelProps {
  /** Esc, or after an entry is opened. */
  onClose: () => void;
  /** Shows an "Open" action; left out in the quick window, which has no pages to open. */
  onOpen?: (result: EntrySearchResult) => void;
  /** Rendered in the header's top-right, e.g. the quick window's close button. */
  headerAction?: React.ReactNode;
  /** Set so the quick window can be dragged by the header. */
  dragRegion?: boolean;
}

/**
 * One search box over every saved definition and translation, matching the
 * word, its meaning, context and tags, forgiving typos and accents.
 * Keyboard first: arrows move, Enter copies the meaning.
 */
export function SearchPanel({ onClose, onOpen, headerAction, dragRegion }: SearchPanelProps) {
  const { words } = useWords();
  const { translations } = useTranslations();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchEntries(query, words, translations, { kind }),
    [kind, query, translations, words],
  );
  const active = results[Math.min(activeIndex, results.length - 1)] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [kind, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied((current) => (current === what ? null : current)), 1400);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      if ((event.ctrlKey || event.metaKey) && onOpen) {
        onOpen(active);
      } else if (event.shiftKey) {
        void copy(active.term, `term:${active.id}`);
      } else {
        void copy(active.meaning, `meaning:${active.id}`);
      }
    }
  };

  return (
    <div className="frost-panel flex h-full min-h-0 flex-col overflow-hidden" onKeyDown={onKeyDown}>
      <div
        {...(dragRegion ? { "data-tauri-drag-region": true } : {})}
        className="space-y-2.5 border-b border-white/10 p-3"
      >
        <div className="flex items-center gap-2">
          <div className="search-field-wrap flex-1">
            <Search className="search-field-icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="frost-input search-field-input"
              placeholder="Search your definitions and translations"
              aria-label="Search your definitions and translations"
              autoFocus
            />
          </div>
          {headerAction}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {KIND_FILTERS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className="lexi-toggle"
                aria-pressed={kind === entry.value}
                onClick={() => setKind(entry.value)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <span className="subtle-caption">
            {query.trim() ? `${results.length}${results.length === 60 ? "+" : ""} matches` : "Recently added"}
          </span>
        </div>
      </div>

      <div ref={listRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label="Search results">
        {results.length === 0 ? (
          <p className="subtle-caption p-4 text-center">
            {query.trim() ? `Nothing saved matches "${query.trim()}".` : "Nothing saved yet."}
          </p>
        ) : results.map((result, index) => {
          const isActive = active?.id === result.id && active.kind === result.kind;
          return (
            <div
              key={`${result.kind}:${result.id}`}
              data-index={index}
              role="option"
              aria-selected={isActive}
              className={cn("cursor-pointer rounded-lg px-3 py-2.5 transition-colors", isActive ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]")}
              onMouseMove={() => { if (activeIndex !== index) setActiveIndex(index); }}
              onClick={() => setActiveIndex(index)}
              onDoubleClick={() => void copy(result.meaning, `meaning:${result.id}`)}
            >
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <p className="serif-display flex min-w-0 items-center gap-2 truncate text-xl leading-[1.2]">
                  <span className="truncate">{result.term}</span>
                  {result.kind === "translation" ? (
                    <>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{result.meaning}</span>
                    </>
                  ) : null}
                </p>
                <span className="lexi-chip compact shrink-0">{result.languages}</span>
              </div>

              {result.kind === "word" ? (
                <p className={cn("word-sub mt-1 text-sm", !isActive && "line-clamp-1")}>{result.meaning}</p>
              ) : null}

              {isActive ? (
                <div className="mt-2 space-y-2">
                  {result.note ? <p className="serif-display text-lg italic text-muted-foreground">{result.note}</p> : null}
                  {result.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {result.tags.map((tag) => <span key={tag} className="lexi-chip compact">{tag}</span>)}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" className="lexi-btn-primary" onClick={(event) => { event.stopPropagation(); void copy(result.meaning, `meaning:${result.id}`); }}>
                      {copied === `meaning:${result.id}` ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
                      {copied === `meaning:${result.id}` ? "Copied" : result.kind === "word" ? "Copy definition" : "Copy translation"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={(event) => { event.stopPropagation(); void copy(result.term, `term:${result.id}`); }}>
                      {copied === `term:${result.id}` ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
                      {copied === `term:${result.id}` ? "Copied" : "Copy word"}
                    </Button>
                    {onOpen ? (
                      <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={(event) => { event.stopPropagation(); onOpen(result); }}>
                        <ExternalLink className="mr-1.5 size-3.5" />
                        Open
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 px-3 py-2 subtle-caption">
        <span><kbd className="key-cap">↑</kbd> <kbd className="key-cap">↓</kbd> move</span>
        <span><kbd className="key-cap">Enter</kbd> copy meaning</span>
        <span><kbd className="key-cap">Shift</kbd>+<kbd className="key-cap">Enter</kbd> copy word</span>
        {onOpen ? <span><kbd className="key-cap">Ctrl</kbd>+<kbd className="key-cap">Enter</kbd> open</span> : null}
        <span className="ml-auto"><kbd className="key-cap">Esc</kbd> close</span>
      </div>
    </div>
  );
}
