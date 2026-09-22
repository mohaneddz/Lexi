import { useDeferredValue, useMemo, useState } from "react";
import { BookOpen, Check, CircleDot, Copy, Download, Languages, Search, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBooks } from "@/hooks/useBooks";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";

type CatalogTypeFilter = "all" | "dictionary" | "translation";

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
    addCustomSourceFromUrl,
    importCustomSourceFromFile,
    removeCustomSource,
    lookup,
  } = useBooks();
  const { addWord } = useWords();
  const { addTranslation } = useTranslations();

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<CatalogTypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<CatalogTypeFilter>("all");
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [fuzzyEnabled, setFuzzyEnabled] = useState(true);
  const [inputLanguage, setInputLanguage] = useState("all");
  const [outputLanguage, setOutputLanguage] = useState("all");
  const [bookScopeId, setBookScopeId] = useState("all");
  const [customUrl, setCustomUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  const handleAddCustomUrl = async () => {
    if (!customUrl.trim()) return;
    try {
      setUrlError("");
      await addCustomSourceFromUrl(customUrl);
      setCustomUrl("");
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : "Failed to add from URL");
    }
  };

  const filteredCatalog = useMemo(() => {
    const normalized = catalogQuery.trim().toLowerCase();
    return catalog.filter((book) => {
      if (catalogTypeFilter !== "all" && book.type !== catalogTypeFilter) {
        return false;
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
  }, [catalog, catalogQuery, catalogTypeFilter]);

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

  // Searching scans every installed book, so let the input paint first and run
  // the scan against the settled value.
  const deferredQuery = useDeferredValue(searchQuery);

  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) {
      return [];
    }
    return lookup(deferredQuery, {
      scope,
      fuzzy: fuzzyEnabled,
      bookType: searchType,
      inputLanguage: inputLanguage === "all" ? undefined : inputLanguage,
      outputLanguage: outputLanguage === "all" ? undefined : outputLanguage,
      bookIds: bookScopeId === "all" ? undefined : [bookScopeId],
    }).slice(0, 120);
  }, [bookScopeId, deferredQuery, fuzzyEnabled, inputLanguage, lookup, outputLanguage, scope, searchType]);

  const searchableBookCount = useMemo(() => {
    const installed = Array.from(installedById.values());
    const inScope = scope === "selected" ? installed.filter((book) => activeBookIds.includes(book.id)) : installed;
    return inScope.filter((book) => {
      if (searchType !== "all" && book.type !== searchType) return false;
      if (bookScopeId !== "all" && book.id !== bookScopeId) return false;
      return true;
    }).length;
  }, [activeBookIds, bookScopeId, installedById, scope, searchType]);

  const emptyResultsMessage = !deferredQuery.trim()
    ? "Run a query to search your installed books."
    : searchableBookCount === 0
      ? "No installed book matches the current filters. Widen the type, book, or scope filter above."
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

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              className="frost-input h-10"
              placeholder="Add custom HTTPS JSON URL"
            />
            <Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => void handleAddCustomUrl()}>
              Add URL
            </Button>
            <Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => void importCustomSourceFromFile()}>
              Import File
            </Button>
          </div>
          {urlError ? <p className="subtle-caption text-destructive">{urlError}</p> : null}

          <div className="flex flex-wrap gap-2">
            {(["all", "dictionary", "translation"] as CatalogTypeFilter[]).map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={catalogTypeFilter === entry}
                className="lexi-toggle"
                onClick={() => setCatalogTypeFilter(entry)}
              >
                {entry === "all" ? "All" : entry === "dictionary" ? "Dictionary" : "Translation"}
              </button>
            ))}
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
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/6 hover:bg-white/14"
                            onClick={() => void toggleBookActive(book.id)}
                          >
                            <Check className="mr-1.5 size-3.5" />
                            {isActive ? "Selected" : "Select"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/6 hover:bg-white/14"
                            onClick={() => void uninstallBook(book.id)}
                          >
                            <Trash2 className="mr-1.5 size-3.5" />
                            Remove
                          </Button>
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
          <div className="search-field-wrap">
            <Search className="search-field-icon" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="frost-input search-field-input"
              placeholder="Search across installed books"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={scope === "selected"}
              className="lexi-toggle"
              onClick={() => setScope("selected")}
            >
              Selected books
            </button>
            <button
              type="button"
              aria-pressed={scope === "all"}
              className="lexi-toggle"
              onClick={() => setScope("all")}
            >
              All installed
            </button>
            <button
              type="button"
              aria-pressed={fuzzyEnabled}
              className="lexi-toggle"
              onClick={() => setFuzzyEnabled((value) => !value)}
            >
              Fuzzy {fuzzyEnabled ? "On" : "Off"}
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
            <select className="frost-input h-10 py-0" value={bookScopeId} onChange={(event) => setBookScopeId(event.target.value)}>
              <option value="all">All books</option>
              {Array.from(installedById.values()).map((book) => (
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
                  <div>
                    <p className="serif-display text-2xl leading-[0.95]">{result.input}</p>
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
                    <p className="word-sub mt-1">{result.output}</p>
                  </div>
                  <span className="subtle-caption">score {result.score.toFixed(2)}</span>
                </div>
                <p className="subtle-caption">{result.bookTitle}</p>

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
