import { useDeferredValue, useMemo, useState } from "react";
import { BookOpen, Check, Circle, CircleDot, Copy, Languages, Loader2, Minus, Search, Sparkles, Trash2 } from "lucide-react";

import { BookCardsSkeleton } from "@/components/lexi/Skeletons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenudiv,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBooks } from "@/hooks/useBooks";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import type { MatchKind } from "@/utils/bookSearch";
import type { BookCatalogItem, BookType } from "@/types";
import { cn } from "@/lib/utils";

type CatalogTypeFilter = "all" | "dictionary" | "translation";
type CatalogStatusFilter = "all" | "enabled" | "disabled";

type CatalogRow =
  | { kind: "single"; book: BookCatalogItem }
  | { kind: "group"; baseTitle: string; type: BookType; variants: BookCatalogItem[] };

// "Country Names (English to French)" and "... (English to Spanish)" are the
// same book in different target languages — the From/To chips already say
// that, so the parenthetical is just repeating itself in the title.
function stripVariantSuffix(title: string): string {
  return title.replace(/\s*\([^()]*\bto\b[^()]*\)\s*$/i, "").trim();
}

/**
 * How a variant is named in its group: just the target language when every
 * variant starts from the same one ("French"), otherwise the full pair
 * ("German to Arabic"), since a list of identical targets says nothing.
 */
function variantLabel(variant: BookCatalogItem, variants: BookCatalogItem[]): string {
  const sameSource = variants.every((entry) => entry.inputLanguages.join("/") === variants[0].inputLanguages.join("/"));
  const target = variant.outputLanguages.join("/");
  return sameSource ? target : `${variant.inputLanguages.join("/")} to ${target}`;
}

function displayTitle(book: BookCatalogItem): string {
  return book.type === "translation" ? stripVariantSuffix(book.title) : book.title;
}

// How closely a result matched, in plain terms rather than the raw 0-1
// score, grouped into the same "new/learning/mastered" pill styles used
// elsewhere so higher confidence reads as more settled at a glance.
function matchKindLabel(kind: MatchKind): string {
  switch (kind) {
    case "exact": return "Exact match";
    case "prefix": return "Starts with";
    case "word": return "Word match";
    case "substring": return "Contains";
    case "typo": return "Close match";
  }
}

function matchKindStatusClass(kind: MatchKind): string {
  switch (kind) {
    case "exact": return "status-mastered";
    case "prefix": return "status-learning";
    case "word":
    case "substring": return "status-learning";
    case "typo": return "status-new";
  }
}

function formatSizeBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

function BookCover({ title, coverUrl }: { title: string; coverUrl?: string }) {
  // Remember which url failed rather than that one did, so a card that fell
  // back once still retries when the catalog points somewhere new.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!coverUrl || failedUrl === coverUrl) {
    return (
      <div className="book-cover-fallback">
        <BookOpen className="size-8" />
        <span>{title}</span>
      </div>
    );
  }

  return (
    <img
      src={coverUrl}
      alt={`${title} cover`}
      className="book-cover-image"
      loading="lazy"
      onError={() => setFailedUrl(coverUrl)}
    />
  );
}

export default function Books() {
  const {
    catalog,
    importedById,
    enabledBookIds,
    loading,
    error,
    loadingBookIds,
    toggleBookEnabled,
    setBooksEnabled,
    removeCustomSource,
    lookup,
  } = useBooks();
  const { addWord } = useWords();
  const { addTranslation } = useTranslations();

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<CatalogTypeFilter>("all");
  const [catalogLanguage, setCatalogLanguage] = useState("all");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<CatalogTypeFilter>("all");
  const [fuzzyEnabled, setFuzzyEnabled] = useState(true);
  const [inputLanguage, setInputLanguage] = useState("all");
  const [outputLanguage, setOutputLanguage] = useState("all");
  // "all" searches every enabled book; anything else is a single book id.
  const [searchScope, setSearchScope] = useState("all");

  const filteredCatalog = useMemo(() => {
    const normalized = catalogQuery.trim().toLowerCase();
    return catalog.filter((book) => {
      if (catalogTypeFilter !== "all" && book.type !== catalogTypeFilter) {
        return false;
      }
      if (catalogLanguage !== "all"
        && !book.inputLanguages.includes(catalogLanguage)
        && !book.outputLanguages.includes(catalogLanguage)) {
        return false;
      }
      if (catalogStatus !== "all") {
        const isEnabled = enabledBookIds.includes(book.id);
        if (catalogStatus === "enabled" && !isEnabled) return false;
        if (catalogStatus === "disabled" && isEnabled) return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        book.title.toLowerCase().includes(normalized) ||
        book.description.toLowerCase().includes(normalized) ||
        book.inputLanguages.some((language) => language.toLowerCase().includes(normalized)) ||
        book.outputLanguages.some((language) => language.toLowerCase().includes(normalized))
      );
    });
  }, [catalog, catalogLanguage, catalogQuery, catalogStatus, catalogTypeFilter, enabledBookIds]);

  // Books that only differ by target language collapse into one card with a
  // language picker, instead of one card per language that all say the same
  // thing except for a single word in the title.
  const groupedCatalog = useMemo<CatalogRow[]>(() => {
    const groups = new Map<string, BookCatalogItem[]>();
    for (const book of filteredCatalog) {
      const key = `${book.type}::${displayTitle(book)}`;
      const list = groups.get(key);
      if (list) list.push(book);
      else groups.set(key, [book]);
    }

    const rows: CatalogRow[] = [];
    for (const variants of groups.values()) {
      if (variants.length === 1) {
        rows.push({ kind: "single", book: variants[0] });
      } else {
        rows.push({
          kind: "group",
          baseTitle: displayTitle(variants[0]),
          type: variants[0].type,
          variants: [...variants].sort((a, b) => a.title.localeCompare(b.title)),
        });
      }
    }

    rows.sort((a, b) => {
      const titleA = a.kind === "single" ? displayTitle(a.book) : a.baseTitle;
      const titleB = b.kind === "single" ? displayTitle(b.book) : b.baseTitle;
      return titleA.localeCompare(titleB);
    });
    return rows;
  }, [filteredCatalog]);

  const languages = useMemo(() => {
    const inputs = new Set<string>();
    const outputs = new Set<string>();
    for (const book of catalog) {
      for (const language of book.inputLanguages) {
        inputs.add(language);
      }
      for (const language of book.outputLanguages) {
        outputs.add(language);
      }
    }

    return {
      inputs: ["all", ...Array.from(inputs).sort((a, b) => a.localeCompare(b))],
      outputs: ["all", ...Array.from(outputs).sort((a, b) => a.localeCompare(b))],
    };
  }, [catalog]);

  const catalogLanguages = useMemo(() => {
    const all = new Set<string>();
    for (const book of catalog) {
      for (const language of [...book.inputLanguages, ...book.outputLanguages]) {
        all.add(language);
      }
    }
    return ["all", ...Array.from(all).sort((a, b) => a.localeCompare(b))];
  }, [catalog]);

  // Searching scans every enabled book, so let the input paint first and run
  // the scan against the settled value.
  const deferredQuery = useDeferredValue(searchQuery);

  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) {
      return [];
    }
    const singleBookId = searchScope === "all" ? null : searchScope;
    return lookup(deferredQuery, {
      fuzzy: fuzzyEnabled,
      bookType: searchType,
      inputLanguage: inputLanguage === "all" ? undefined : inputLanguage,
      outputLanguage: outputLanguage === "all" ? undefined : outputLanguage,
      bookIds: singleBookId ? [singleBookId] : undefined,
    }).slice(0, 120);
  }, [deferredQuery, fuzzyEnabled, inputLanguage, lookup, outputLanguage, searchScope, searchType]);

  // A disabled book has no payload loaded, so it can't produce results —
  // leaving it in the picker would just be a dead end.
  const enabledCatalogBooks = useMemo(
    () => catalog.filter((book) => enabledBookIds.includes(book.id)),
    [catalog, enabledBookIds],
  );

  const searchableBookCount = useMemo(() => {
    const inScope = searchScope === "all" ? enabledCatalogBooks : enabledCatalogBooks.filter((book) => book.id === searchScope);
    return inScope.filter((book) => searchType === "all" || book.type === searchType).length;
  }, [enabledCatalogBooks, searchScope, searchType]);

  const emptyResultsMessage = !deferredQuery.trim()
    ? "Run a query to search your enabled books."
    : searchableBookCount === 0
      ? "No enabled book matches the current filters. Enable a book in the catalog, or widen the type or book filter above."
      : `No matches for "${deferredQuery.trim()}"${fuzzyEnabled ? "" : ". Turn Fuzzy on to allow near misses"}.`;

  const handleApplyResult = async (result: (typeof searchResults)[number]) => {
    if (result.bookType === "dictionary") {
      await addWord({
        word: result.input,
        definition: result.output,
        language: result.inputLanguage,
        tags: ["book-import"],
        aiGenerated: false,
        favorite: false,
        groupIds: [],
        examples: [],
      });
      return;
    }

    await addTranslation({
      sourceWord: result.input,
      targetWord: result.output,
      sourceLanguage: result.inputLanguage,
      targetLanguage: result.outputLanguage,
      aiGenerated: false,
      favorite: false,
      context: `Imported from ${result.bookTitle}`,
      groupIds: [],
    });
  };

  const applyInputLanguageFilter = (language: string) => {
    setInputLanguage(language);
  };

  const applyOutputLanguageFilter = (language: string) => {
    setOutputLanguage(language);
  };

  return (
    <div className="grid min-h-full grid-cols-1 gap-3 xl:h-full xl:grid-cols-[1.12fr_1fr]">
      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="border-b border-white/10 p-3 space-y-2">
          <div className="search-field-wrap">
            <Search className="search-field-icon" />
            <input
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              className="frost-input search-field-input"
              placeholder="Search books catalog"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <select className="frost-input h-10 py-0" value={catalogTypeFilter} onChange={(event) => setCatalogTypeFilter(event.target.value as CatalogTypeFilter)}>
              <option value="all">All types</option>
              <option value="dictionary">Dictionary</option>
              <option value="translation">Translation</option>
            </select>
            <select className="frost-input h-10 py-0" value={catalogLanguage} onChange={(event) => setCatalogLanguage(event.target.value)}>
              {catalogLanguages.map((language) => (
                <option key={language} value={language}>{language === "all" ? "Any language" : language}</option>
              ))}
            </select>
            <select className="frost-input h-10 py-0" value={catalogStatus} onChange={(event) => setCatalogStatus(event.target.value as CatalogStatusFilter)}>
              <option value="all">All books</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {error ? <p className="subtle-caption text-destructive">{error}</p> : null}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
          {loading ? (
            <BookCardsSkeleton />
          ) : groupedCatalog.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center text-center">
              <p className="subtle-caption">
                {catalog.length === 0
                  ? "No books available yet. Import a book file from Settings."
                  : "No books match the current filters."}
              </p>
            </div>
          ) : (
            groupedCatalog.map((row) => row.kind === "single"
              ? renderBookCard(row.book)
              : renderVariantGroupCard(row))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill"><BookOpen className="size-3" />{catalog.length} books listed</span>
          <span className="sync-pill"><CircleDot className="size-3" />{enabledBookIds.length} enabled</span>
        </div>
      </section>

      {renderSearchPanel()}
    </div>
  );

  function renderBookCard(book: BookCatalogItem) {
    const isEnabled = enabledBookIds.includes(book.id);
    const isToggling = loadingBookIds.includes(book.id);
    const isImported = importedById.has(book.id);
    const title = displayTitle(book);

    return (
      <article key={book.id} className="book-card frost-panel-soft">
        <div className="book-cover-frame">
          <BookCover title={title} coverUrl={book.coverUrl} />
        </div>

        <div className="flex min-w-0 flex-col space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="serif-display text-2xl leading-[0.95]">{title}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {book.inputLanguages.map((language) => (
                  <button
                    key={`${book.id}-in-${language}`}
                    type="button"
                    className="lexi-toggle"
                    aria-pressed={inputLanguage === language}
                    onClick={() => applyInputLanguageFilter(language)}
                    title={`Filter input: ${language}`}
                  >
                    {book.type === "dictionary" ? `Language: ${language}` : `From: ${language}`}
                  </button>
                ))}
                {book.type === "translation"
                  ? book.outputLanguages.map((language) => (
                    <button
                      key={`${book.id}-out-${language}`}
                      type="button"
                      className="lexi-toggle"
                      aria-pressed={outputLanguage === language}
                      onClick={() => applyOutputLanguageFilter(language)}
                      title={`Filter output: ${language}`}
                    >
                      {`To: ${language}`}
                    </button>
                  ))
                  : null}
              </div>
              {/* Clamped so every card's description takes the same height —
                  otherwise the buttons below land at a different height on
                  every card. */}
              <p className="subtle-caption mt-1 line-clamp-2" title={book.description}>{book.description}</p>
            </div>
            <span className="status-pill shrink-0">{book.type === "dictionary" ? "Dictionary" : "Translation"}</span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="lexi-toggle"
              aria-pressed={isEnabled}
              disabled={isToggling}
              onClick={() => void toggleBookEnabled(book.id)}
              title={isEnabled
                ? "This book is included in search. Click to disable it."
                : "This book is excluded from search. Click to enable it."}
            >
              {isToggling
                ? <Loader2 className="size-3.5 animate-spin" />
                : isEnabled ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
              {isToggling ? "Loading..." : isEnabled ? "Enabled" : "Disabled"}
            </button>

            {isImported ? (
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-900/25 hover:text-red-200"
                onClick={() => void removeCustomSource(book.id)}
                title={`Remove this imported book (${formatSizeBytes(book.sizeBytes)})`}
                aria-label={`Remove ${book.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderVariantGroupCard(row: Extract<CatalogRow, { kind: "group" }>) {
    const { baseTitle, type, variants } = row;
    const enabledCount = variants.filter((variant) => enabledBookIds.includes(variant.id)).length;
    const isAllEnabled = enabledCount === variants.length;
    const isAnyEnabled = enabledCount > 0;
    const isToggling = variants.some((variant) => loadingBookIds.includes(variant.id));
    const primary = variants[0];
    const sharedInputLanguages = Array.from(new Set(variants.flatMap((variant) => variant.inputLanguages)));
    const variantSummary = variants.map((variant) => variantLabel(variant, variants)).join(", ");

    return (
      <article key={`group:${type}:${baseTitle}`} className="book-card frost-panel-soft">
        <div className="book-cover-frame">
          <BookCover title={baseTitle} coverUrl={primary.coverUrl} />
        </div>

        <div className="flex min-w-0 flex-col space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="serif-display text-2xl leading-[0.95]">{baseTitle}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sharedInputLanguages.map((language) => (
                  <button
                    key={`group-${baseTitle}-in-${language}`}
                    type="button"
                    className="lexi-toggle"
                    aria-pressed={inputLanguage === language}
                    onClick={() => applyInputLanguageFilter(language)}
                    title={`Filter input: ${language}`}
                  >
                    {type === "dictionary" ? `Language: ${language}` : `From: ${language}`}
                  </button>
                ))}
              </div>
              <p className="subtle-caption mt-1 line-clamp-2" title={`${variants.length} language variants: ${variantSummary}.`}>
                {variants.length} language variants: {variantSummary}.
              </p>
            </div>
            <span className="status-pill shrink-0">{type === "dictionary" ? "Dictionary" : "Translation"}</span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="lexi-toggle"
              aria-pressed={isAllEnabled}
              disabled={isToggling}
              onClick={() => void setBooksEnabled(variants.map((variant) => variant.id), !isAllEnabled)}
              title={isAllEnabled
                ? "All language variants are included in search. Click to disable them all."
                : isAnyEnabled
                  ? "Some language variants are enabled. Click to enable the rest."
                  : "No language variants are enabled. Click to enable them all."}
            >
              {isToggling
                ? <Loader2 className="size-3.5 animate-spin" />
                : isAllEnabled ? <Check className="size-3.5" /> : isAnyEnabled ? <Minus className="size-3.5" /> : <Circle className="size-3.5" />}
              {isToggling ? "Loading..." : isAllEnabled ? "Enabled" : isAnyEnabled ? `${enabledCount}/${variants.length} enabled` : "Disabled"}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="lexi-toggle"
                  title="Choose which language variants to enable individually"
                >
                  <Languages className="size-3.5" />
                  {variants.length} languages
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenudiv>Language variants</DropdownMenudiv>
                {variants.map((variant) => {
                  const variantEnabled = enabledBookIds.includes(variant.id);
                  const variantLoading = loadingBookIds.includes(variant.id);
                  const label = type === "translation" ? variantLabel(variant, variants) : variant.title;
                  return (
                    <DropdownMenuCheckboxItem
                      key={variant.id}
                      checked={variantEnabled}
                      disabled={variantLoading}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() => void toggleBookEnabled(variant.id)}
                    >
                      {label}
                      {variantLoading ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : null}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </article>
    );
  }

  function renderSearchPanel() {
    return (
      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="border-b border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="search-field-wrap">
              <Search className="search-field-icon" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="frost-input search-field-input"
                placeholder="Search across enabled books"
              />
            </div>
            <button
              type="button"
              aria-pressed={fuzzyEnabled}
              className="lexi-toggle h-10 shrink-0"
              onClick={() => setFuzzyEnabled((value) => !value)}
              title={fuzzyEnabled ? "Also matching near misses and typos" : "Matching the exact text only"}
            >
              <Sparkles className="size-3.5" />
              Fuzzy
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <select className="frost-input h-10 py-0" value={searchType} onChange={(event) => setSearchType(event.target.value as CatalogTypeFilter)}>
              <option value="all">All types</option>
              <option value="dictionary">Dictionary</option>
              <option value="translation">Translation</option>
            </select>
            <select className="frost-input h-10 py-0" value={inputLanguage} onChange={(event) => setInputLanguage(event.target.value)}>
              {languages.inputs.map((language) => (
                <option key={language} value={language}>{language === "all" ? "Any input" : language}</option>
              ))}
            </select>
            <select className="frost-input h-10 py-0" value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value)}>
              {languages.outputs.map((language) => (
                <option key={language} value={language}>{language === "all" ? "Any output" : language}</option>
              ))}
            </select>
            <select className="frost-input h-10 py-0" value={searchScope} onChange={(event) => setSearchScope(event.target.value)}>
              <option value="all">All enabled books</option>
              {enabledCatalogBooks.map((book) => (
                <option key={book.id} value={book.id}>{book.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
          {searchResults.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center px-6 text-center">
              <p className="subtle-caption">{emptyResultsMessage}</p>
            </div>
          ) : (
            searchResults.map((result) => (
              <article key={result.id} className="frost-panel-soft space-y-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="serif-display text-2xl leading-[0.95]">{result.input}</p>
                    <button
                      type="button"
                      className="lexi-toggle mt-2"
                      aria-pressed={searchScope === result.bookId}
                      onClick={() => setSearchScope((current) => current === result.bookId ? "all" : result.bookId)}
                      title={`${result.bookTitle} — click to search only this book`}
                    >
                      <BookOpen className="size-3.5" />
                      {result.bookTitle}
                    </button>
                    <p className="word-sub mt-1.5">{result.output}</p>
                  </div>
                  <span
                    className={cn("status-pill shrink-0", matchKindStatusClass(result.matchKind))}
                    title={`Match score ${result.score.toFixed(2)}`}
                  >
                    {matchKindLabel(result.matchKind)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-white/15 bg-white/6 hover:bg-white/14"
                      onClick={() => void navigator.clipboard.writeText(result.output)}
                    >
                      <Copy className="mr-1.5 size-3.5" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-white/15 bg-white/6 hover:bg-white/14"
                      onClick={() => void handleApplyResult(result)}
                    >
                      <Sparkles className="mr-1.5 size-3.5" />
                      {result.bookType === "dictionary" ? "Add to Words" : "Add to Translations"}
                    </Button>
                  </div>

                  {/* A dictionary's input and output language are always the
                      same, so From/To would just repeat itself; only a
                      translation has two distinct sides worth filtering. */}
                  {result.bookType === "translation" ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="lexi-toggle"
                        aria-pressed={inputLanguage === result.inputLanguage}
                        onClick={() => applyInputLanguageFilter(result.inputLanguage)}
                        title={`Filter input: ${result.inputLanguage}`}
                      >
                        {`From: ${result.inputLanguage}`}
                      </button>
                      <button
                        type="button"
                        className="lexi-toggle"
                        aria-pressed={outputLanguage === result.outputLanguage}
                        onClick={() => applyOutputLanguageFilter(result.outputLanguage)}
                        title={`Filter output: ${result.outputLanguage}`}
                      >
                        {`To: ${result.outputLanguage}`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill"><Languages className="size-3" />{searchResults.length} matches</span>
        </div>
      </section>
    );
  }
}
