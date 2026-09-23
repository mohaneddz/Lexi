import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Check, Circle, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";

import { BookCover } from "@/components/lexi/BookCover";
import { Button } from "@/components/ui/button";
import type { BookCatalogItem } from "@/types";

interface BookDetailPanelProps {
  book: BookCatalogItem;
  /** Every language edition of the same book, the book itself included. */
  editions: BookCatalogItem[];
  title: string;
  editionLabel: (edition: BookCatalogItem) => string;
  isEnabled: boolean;
  isToggling: boolean;
  isImported: boolean;
  formatSize: (bytes: number) => string;
  onToggle: () => void;
  onSelectEdition: (edition: BookCatalogItem) => void;
  onSearchThisBook: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** What the Books sidebar shows while a book is selected: its cover, who made it, what's in it. */
export function BookDetailPanel({
  book,
  editions,
  title,
  editionLabel,
  isEnabled,
  isToggling,
  isImported,
  formatSize,
  onToggle,
  onSelectEdition,
  onSearchThisBook,
  onRemove,
  onClose,
}: BookDetailPanelProps) {
  const paragraphs = (book.about ?? book.description).split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const isDictionary = book.type === "dictionary";

  const details: Array<{ label: string; value: string }> = [
    { label: "Source", value: book.source },
    ...(book.license ? [{ label: "License", value: book.license }] : []),
    { label: "Version", value: book.version },
    { label: "Size", value: formatSize(book.sizeBytes) },
    { label: "Type", value: isDictionary ? "Dictionary" : "Translation" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3">
        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={onClose}>
          <ArrowLeft className="mr-1.5 size-3.5" />
          Back to search
        </Button>
        <span className="status-pill">{isDictionary ? "Dictionary" : "Translation"}</span>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto p-5 md:p-6">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
          <div className="book-cover-frame mx-auto aspect-[3/4] w-44 shadow-lg sm:mx-0 sm:w-full">
            <BookCover title={title} coverUrl={book.coverUrl} />
          </div>

          <div className="min-w-0 space-y-3">
            <h2 className="serif-display text-[2.1rem] leading-[1.15]">{title}</h2>
            {book.authors && book.authors.length > 0 ? (
              <p className="word-sub">by {book.authors.join(", ")}</p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {isDictionary
                ? book.inputLanguages.map((language) => <span key={`in-${language}`} className="lexi-chip">{language}</span>)
                : (
                  <>
                    {book.inputLanguages.map((language) => <span key={`in-${language}`} className="lexi-chip">From {language}</span>)}
                    {book.outputLanguages.map((language) => <span key={`out-${language}`} className="lexi-chip">To {language}</span>)}
                  </>
                )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="lexi-toggle"
                aria-pressed={isEnabled}
                disabled={isToggling}
                onClick={onToggle}
                title={isEnabled ? "Included in search. Click to disable." : "Excluded from search. Click to enable."}
              >
                {isToggling
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : isEnabled ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
                {isToggling ? "Loading..." : isEnabled ? "Enabled" : "Disabled"}
              </button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/15 bg-white/6 hover:bg-white/14"
                disabled={!isEnabled}
                onClick={onSearchThisBook}
                title={isEnabled ? "Search only this book" : "Enable the book to search it"}
              >
                <Search className="mr-1.5 size-3.5" />
                Search this book
              </Button>
              {isImported ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-white/15 bg-white/6 hover:bg-red-900/25 hover:text-red-200"
                  onClick={onRemove}
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {editions.length > 1 ? (
          <section className="space-y-2">
            <p className="font-medium">Editions</p>
            <div className="flex flex-wrap gap-1.5">
              {editions.map((edition) => (
                <button
                  key={edition.id}
                  type="button"
                  className="lexi-toggle"
                  aria-pressed={edition.id === book.id}
                  onClick={() => onSelectEdition(edition)}
                >
                  {editionLabel(edition)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <p className="font-medium">About this book</p>
          {paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="word-sub text-[0.92rem] leading-relaxed">{paragraph}</p>
          ))}
        </section>

        {book.tags && book.tags.length > 0 ? (
          <section className="space-y-2">
            <p className="font-medium">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {book.tags.map((tag) => <span key={tag} className="lexi-chip">{tag}</span>)}
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <p className="font-medium">Details</p>
          <dl className="frost-panel-soft divide-y divide-white/8">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="subtle-caption">{detail.label}</dt>
                <dd className="min-w-0 text-right text-sm">{detail.value}</dd>
              </div>
            ))}
            {book.homepage ? (
              <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="subtle-caption">Homepage</dt>
                <dd className="min-w-0 text-right text-sm">
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 truncate underline-offset-2 hover:underline"
                    onClick={() => void openUrl(book.homepage!)}
                    title={book.homepage}
                  >
                    <span className="truncate">{book.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                    <ExternalLink className="size-3.5 shrink-0" />
                  </button>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}
