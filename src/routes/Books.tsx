import { useDeferredValue, useMemo, useState } from "react";
import { BookOpen, Check, Circle, CircleDot, Copy, Download, Languages, Search, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBooks } from "@/hooks/useBooks";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import type { MatchKind } from "@/utils/bookSearch";
import { cn } from "@/lib/utils";

type CatalogTypeFilter = "all" | "dictionary" | "translation";
type CatalogStatusFilter = "all" | "installed" | "available" | "selected";

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
    installedById,
    activeBookIds,
    loading,
    error,
    installingIds,
    installBook,
    uninstallBook,
    toggleBookActive,
    toggleBookEnabled,
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
  // "selected" and "all" are scopes; anything else is a single book id.
  const [searchScope, setSearchScope] = useState("selected");

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
        const isInstalled = installedById.has(book.id);
        if (catalogStatus === "installed" && !isInstalled) return false;
        if (catalogStatus === "available" && isInstalled) return false;
        if (catalogStatus === "selected" && !activeBookIds.includes(book.id)) return false;
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
  }, [activeBookIds, catalog, catalogLanguage, catalogQuery, catalogStatus, catalogTypeFilter, installedById]);

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

  // Searching scans every installed book, so let the input paint first and run
  // the scan against the settled value.
  const deferredQuery = useDeferredValue(searchQuery);

  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) {
      return [];
    }
    const singleBookId = searchScope === "selected" || searchScope === "all" ? null : searchScope;
    return lookup(deferredQuery, {
      // Picking one book means searching it whether or not it is selected.
      scope: searchScope === "selected" ? "selected" : "all",
      fuzzy: fuzzyEnabled,
      bookType: searchType,
      inputLanguage: inputLanguage === "all" ? undefined : inputLanguage,
      outputLanguage: outputLanguage === "all" ? undefined : outputLanguage,
      bookIds: singleBookId ? [singleBookId] : undefined,
    }).slice(0, 120);
  }, [deferredQuery, fuzzyEnabled, inputLanguage, lookup, outputLanguage, searchScope, searchType]);

  // Installed records keep the title they had at install time, so the catalog
  // is what the book picker should list. A disabled book can't produce
  // results, so leaving it in the picker would just be a dead end.
  const installedCatalogBooks = useMemo(
    () => catalog.filter((book) => installedById.get(book.id)?.enabled !== false),
    [catalog, installedById],
  );

  const searchableBookCount = useMemo(() => {
    const inScope = searchScope === "selected"
      ? installedCatalogBooks.filter((book) => activeBookIds.includes(book.id))
      : installedCatalogBooks;
    return inScope.filter((book) => {
      if (searchType !== "all" && book.type !== searchType) return false;
      if (searchScope !== "selected" && searchScope !== "all" && book.id !== searchScope) return false;
      return true;
    }).length;
  }, [activeBookIds, installedCatalogBooks, searchScope, searchType]);

  const emptyResultsMessage = !deferredQuery.trim()
    ? "Run a query to search your installed books."
    : searchableBookCount === 0
      ? "No installed book matches the current filters. Widen the type or book filter above."
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
              <option value="installed">Installed</option>
              <option value="available">Not installed</option>
              <option value="selected">Selected for search</option>
            </select>
          </div>

          {error ? <p className="subtle-caption text-destructive">{error}</p> : null}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((index) => <div key={index} className="h-36 rounded-lg bg-white/6" />)}</div>
          ) : filteredCatalog.length === 0 ? (
            <div className="flex min-h-[260px] items-center justify-center text-center">
              <p className="subtle-caption">
                {catalog.length === 0
                  ? "No books available yet. Add a real JSON source URL or import a book file."
                  : "No books match the current filters."}
              </p>
            </div>
          ) : (
            filteredCatalog.map((book) => {
              const installed = installedById.get(book.id);
              const isInstalling = installingIds.includes(book.id);
              const isActive = activeBookIds.includes(book.id);
              const hasUpdate = installed ? installed.version !== book.version : false;
              const isEnabled = installed?.enabled !== false;

              return (
                <article key={book.id} className="book-card frost-panel-soft">
                  <div className="book-cover-frame">
                    {/* The catalog ships with the app and is the live source of
                        cover art; an installed record only holds whatever path
                        was current when it was installed. */}
                    <BookCover title={book.title} coverUrl={book.coverUrl || installed?.coverUrl} />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="serif-display text-2xl leading-[0.95]">{book.title}</p>
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
                        <p className="subtle-caption mt-1">{book.description}</p>
                      </div>
                      <span className="status-pill">{book.type === "dictionary" ? "Dictionary" : "Translation"}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!installed || hasUpdate ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isInstalling}
                          className="border-white/15 bg-white/6 hover:bg-white/14"
                          onClick={() => void installBook(book)}
                        >
                          <Download className="mr-1.5 size-3.5" />
                          {isInstalling ? "Installing..." : hasUpdate ? "Update" : "Install"}
                        </Button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="lexi-toggle"
                            aria-pressed={isEnabled}
                            onClick={() => void toggleBookEnabled(book.id)}
                            title={isEnabled
                              ? "This book is downloaded and searchable. Click to disable it without deleting it."
                              : "This book is downloaded but excluded from all search. Click to enable it again."}
                          >
                            {isEnabled ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
                            {isEnabled ? "Enabled" : "Disabled"}
                          </button>
                          <button
                            type="button"
                            className="lexi-toggle"
                            aria-pressed={isActive}
                            disabled={!isEnabled}
                            onClick={() => void toggleBookActive(book.id)}
                            title={!isEnabled
                              ? "Enable this book first to search it."
                              : isActive
                                ? "This book is included in search. Click to exclude it."
                                : "This book is excluded from search. Click to include it."}
                          >
                            {isActive ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
                            {isActive ? "Searching this" : "Search this"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-900/25 hover:text-red-200"
                            onClick={() => void uninstallBook(book.id)}
                            title={`Delete the downloaded file for "${book.title}" (${formatSizeBytes(book.sizeBytes)})`}
                            aria-label={`Remove ${book.title}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}

                      {book.source === "Custom URL" || book.source === "Imported File" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => void removeCustomSource(book.id)}
                        >
                          Remove source
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill"><BookOpen className="size-3" />{catalog.length} books listed</span>
          <span className="sync-pill"><CircleDot className="size-3" />{activeBookIds.length} selected</span>
        </div>
      </section>

      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="border-b border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="search-field-wrap">
              <Search className="search-field-icon" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="frost-input search-field-input"
                placeholder="Search across installed books"
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
              <option value="selected">Selected books</option>
              <option value="all">All installed books</option>
              {installedCatalogBooks.map((book) => (
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
                      onClick={() => setSearchScope((current) => current === result.bookId ? "selected" : result.bookId)}
                      title={`${result.bookTitle} — click to search only this book`}
                    >
                      <BookOpen className="size-3.5" />
                      {result.bookTitle}
                    </button>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                    <p className="word-sub mt-1.5">{result.output}</p>
                  </div>
                  <span
                    className={cn("status-pill shrink-0", matchKindStatusClass(result.matchKind))}
                    title={`Match score ${result.score.toFixed(2)}`}
                  >
                    {matchKindLabel(result.matchKind)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-white/6 hover:bg-white/14"
                    onClick={() => void navigator.clipboard.writeText(`${result.input} -> ${result.output}`)}
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
              </article>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill"><Languages className="size-3" />{searchResults.length} matches</span>
          <span className="sync-pill"><CircleDot className="size-3" />Offline lookup</span>
        </div>
      </section>
    </div>
  );
}
