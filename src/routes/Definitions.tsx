import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Grid2x2, LayoutGrid, List, Loader2, Minus, PanelRightClose, PanelRightOpen, Plus, RefreshCcw, Search, SlidersHorizontal, Sparkles, WandSparkles, ZoomIn } from "lucide-react";

import { TagList } from "@/components/lexi/TagList";
import { ExampleSkeleton, ListRowsSkeleton, SuggestionCardsSkeleton } from "@/components/lexi/Skeletons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenudiv,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAI } from "@/hooks/useAI";
import { useSurfaceViewPreference } from "@/hooks/useSurfaceViewPreference";
import { cardMinWidthFor } from "@/lib/surface-view";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { ViewMode, Word } from "@/types";
import { getReviewStatus, type ReviewStatus } from "@/utils/review";
import { truncateText } from "@/utils/formatters";
import type { RelatedWordSuggestion } from "@/utils/ai-service";
import { getSettings, readAiCacheEntry, writeAiCache } from "@/utils/storage";
import { parseJsonArray } from "@/utils/suggestions";
import { SUGGESTED_TAG } from "@/utils/tags";

const GRID_CONTENT_PADDING_PX = 24;

type SortMode = "alpha" | "alphaDesc" | "recent" | "oldest" | "language" | "status";
type SourceFilter = "All" | "AI" | "Manual";
type StatusFilter = "All" | ReviewStatus;

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "alpha", label: "A to Z" },
  { value: "alphaDesc", label: "Z to A" },
  { value: "recent", label: "Recent" },
  { value: "oldest", label: "Oldest" },
  { value: "language", label: "Language" },
  { value: "status", label: "Review status" },
];

const STATUS_ORDER: Record<ReviewStatus, number> = { New: 0, Learning: 1, Mastered: 2 };

const VIEW_OPTIONS: Array<{ label: string; value: ViewMode; icon: typeof List }> = [
  { label: "List", value: "list", icon: List },
  { label: "Grid", value: "grid", icon: LayoutGrid },
  { label: "Tiles", value: "tiles", icon: Grid2x2 },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

export default function Definitions() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const { words, loading, addWord, updateWord } = useWords();
  const { getExamples, suggestRelatedWords } = useAI();
  const { viewMode, setViewMode, zoom, stepZoom, canZoom, detailPanelOpen, toggleDetailPanel } = useSurfaceViewPreference("definitions", "list", 100);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [languageFilter, setLanguageFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("All");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exampleVersion, setExampleVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [generatingExamples, setGeneratingExamples] = useState(false);
  const [definitionSuggestions, setDefinitionSuggestions] = useState<RelatedWordSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [addingSuggestionWord, setAddingSuggestionWord] = useState<string | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(4);

  const filteredWords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const scoped = words
      .filter((word) => groupFilterId === "none" || (word.groupIds || []).includes(groupFilterId))
      .filter((word) => languageFilter === "All" || word.language === languageFilter)
      .filter((word) => sourceFilter === "All" || (sourceFilter === "AI") === word.aiGenerated)
      .filter((word) => statusFilter === "All" || getReviewStatus(word) === statusFilter)
      .filter((word) => {
        if (!normalizedQuery) return true;
        return word.word.toLowerCase().includes(normalizedQuery)
          || word.definition.toLowerCase().includes(normalizedQuery)
          || word.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      });

    const byWord = (a: Word, b: Word) => a.word.localeCompare(b.word);
    switch (sortMode) {
      case "alphaDesc":
        return scoped.sort((a, b) => byWord(b, a));
      case "recent":
        return scoped.sort((a, b) => b.dateAdded - a.dateAdded);
      case "oldest":
        return scoped.sort((a, b) => a.dateAdded - b.dateAdded);
      case "language":
        return scoped.sort((a, b) => a.language.localeCompare(b.language) || byWord(a, b));
      case "status":
        return scoped.sort((a, b) => STATUS_ORDER[getReviewStatus(a)] - STATUS_ORDER[getReviewStatus(b)] || byWord(a, b));
      default:
        return scoped.sort(byWord);
    }
  }, [groupFilterId, languageFilter, query, sortMode, sourceFilter, statusFilter, words]);

  const availableLanguages = useMemo(
    () => ["All", ...Array.from(new Set(words.map((word) => word.language))).sort()],
    [words],
  );

  const clearAllFilters = () => {
    setSortMode("alpha");
    setStatusFilter("All");
    setLanguageFilter("All");
    setSourceFilter("All");
    setQuery("");
  };

  useEffect(() => {
    if (filteredWords.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredWords.some((word) => word.id === selectedId)) {
      setSelectedId(filteredWords[0].id);
    }
  }, [filteredWords, selectedId]);

  useEffect(() => {
    const onSearchFocus = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path === "/definitions") searchInputRef.current?.focus();
    };
    window.addEventListener("lexi:focus-search", onSearchFocus);
    return () => {
      window.removeEventListener("lexi:focus-search", onSearchFocus);
    };
  }, []);

  useEffect(() => {
    const onGroupFilterChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ groupId?: string }>;
      if (typeof customEvent.detail?.groupId === "string") setGroupFilterId(customEvent.detail.groupId);
    };
    window.addEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    return () => window.removeEventListener("lexi:group-filter-changed", onGroupFilterChanged);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !selectedId) return;
      const currentIndex = filteredWords.findIndex((word) => word.id === selectedId);
      if (currentIndex === -1) return;
      if (event.key.toLowerCase() === "k" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedId(filteredWords[Math.min(filteredWords.length - 1, currentIndex + 1)].id);
      }
      if (event.key.toLowerCase() === "j" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedId(filteredWords[Math.max(0, currentIndex - 1)].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredWords, selectedId]);

  const selectedWord = useMemo(() => filteredWords.find((word) => word.id === selectedId) ?? null, [filteredWords, selectedId]);
  const selectedExample = useMemo(() => {
    if (!selectedWord) return "";
    if (selectedWord.examples && selectedWord.examples.length > 0) {
      return selectedWord.examples[exampleVersion % selectedWord.examples.length];
    }
    return "";
  }, [exampleVersion, selectedWord]);

  const copyDefinition = async () => {
    if (!selectedWord) return;
    await navigator.clipboard.writeText(`${selectedWord.word}: ${selectedWord.definition}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const generateExamples = async () => {
    if (!selectedWord) return;
    setGeneratingExamples(true);
    try {
      const result = await getExamples(selectedWord.word, selectedWord.language);
      if (result.success && result.data.length > 0) {
        await updateWord(selectedWord.id, { examples: result.data });
        setExampleVersion(0);
      }
    } finally {
      setGeneratingExamples(false);
    }
  };

  useEffect(() => {
    void getSettings().then((settings) => setSuggestionCount(settings.definitionSuggestionCount));
    const onSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ definitionSuggestionCount?: number }>).detail;
      if (typeof detail?.definitionSuggestionCount === "number") setSuggestionCount(detail.definitionSuggestionCount);
    };
    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  // Related words are saved per word, so reopening one doesn't call the AI
  // again. Editing the word or its language, or raising the count, fetches
  // a fresh set.
  useEffect(() => {
    if (!selectedWord) {
      setDefinitionSuggestions([]);
      setSuggestionsError(null);
      setSuggestionsLoading(false);
      return;
    }

    const { id: wordId, word, language, definition } = selectedWord;
    const cacheSignature = `${word.toLowerCase()}|${language}`;
    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(`lexi:definitions:dismissed:${wordId}`)));
    const knownWords = words.filter((entry) => entry.language === language).map((entry) => entry.word.toLowerCase());
    let cancelled = false;
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    const load = async () => {
      const cached = await readAiCacheEntry<{ signature: string; suggestions: RelatedWordSuggestion[]; requested: number }>("relatedWords", wordId);
      if (cancelled) return;

      let suggestions = cached?.signature === cacheSignature && cached.requested >= suggestionCount ? cached.suggestions : null;
      if (!suggestions) {
        const result = await suggestRelatedWords(word, language, definition, knownWords, suggestionCount);
        if (cancelled) return;
        if (!result.success) {
          setDefinitionSuggestions([]);
          setSuggestionsError(result.error ?? "Could not load suggestions.");
          return;
        }
        suggestions = result.data;
        void writeAiCache("relatedWords", wordId, { signature: cacheSignature, suggestions, requested: suggestionCount });
      }

      const known = new Set(knownWords);
      setDefinitionSuggestions(
        suggestions
          .filter((suggestion) => !dismissed.has(suggestion.word.toLowerCase()) && !known.has(suggestion.word.toLowerCase()))
          .slice(0, suggestionCount),
      );
    };

    void load().finally(() => {
      if (!cancelled) setSuggestionsLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWord?.id, selectedWord?.word, selectedWord?.language, suggestionCount]);

  const dismissSuggestion = (suggestion: RelatedWordSuggestion) => {
    if (!selectedWord) return;
    const key = `lexi:definitions:dismissed:${selectedWord.id}`;
    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(key)));
    dismissed.add(suggestion.word.toLowerCase());
    try {
      window.localStorage.setItem(key, JSON.stringify(Array.from(dismissed)));
    } catch {
      // A full or blocked store just means the dismissal lasts for this session.
    }
    setDefinitionSuggestions((current) => current.filter((entry) => entry.word !== suggestion.word));
  };

  const applySuggestion = async (suggestion: RelatedWordSuggestion) => {
    if (!selectedWord) return;
    setAddingSuggestionWord(suggestion.word);
    try {
      await addWord({
        word: suggestion.word,
        definition: suggestion.definition,
        language: selectedWord.language,
        tags: [SUGGESTED_TAG],
        aiGenerated: true,
        groupIds: selectedWord.groupIds ?? [],
      });
      setDefinitionSuggestions((current) => current.filter((entry) => entry.word !== suggestion.word));
    } finally {
      setAddingSuggestionWord(null);
    }
  };

  const contentGridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidthFor(viewMode, zoom)}px, 1fr))`,
  };

  return (
    <>
      <div className={cn("grid min-h-full grid-cols-1 gap-3 xl:h-full", detailPanelOpen && "xl:grid-cols-[1.04fr_1fr]")}>
        <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
            <div className="search-field-wrap min-w-[170px] flex-[1_1_250px] sm:min-w-[220px] sm:flex-[1_1_340px]">
              <Search className="search-field-icon" />
              <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} className="frost-input search-field-input" placeholder="Search definitions or tags" />
            </div>
            <div className="flex items-center rounded-lg border border-white/12 bg-white/6 p-1">
              {VIEW_OPTIONS.map((option) => {
                const Icon = option.icon;
                return <button key={option.value} type="button" className={cn("inline-flex items-center justify-center rounded-md p-2", viewMode === option.value && "bg-white/14")} onClick={() => void setViewMode(option.value)} aria-label={option.label} title={option.label}><Icon className="size-4" /></button>;
              })}
            </div>
            <button
              type="button"
              className="ml-auto inline-flex size-9 items-center justify-center rounded-lg border border-white/12 bg-white/6 text-muted-foreground transition hover:bg-white/14 hover:text-foreground"
              onClick={() => void toggleDetailPanel()}
              aria-label={detailPanelOpen ? "Hide detail panel" : "Show detail panel"}
              title={detailPanelOpen ? "Hide detail panel" : "Show detail panel"}
            >
              {detailPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="border-white/15 bg-white/6 hover:bg-white/14" aria-label="Filters" title="Filters"><SlidersHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="custom-scrollbar max-h-[70vh] w-64 overflow-y-auto">
                <DropdownMenudiv>Sort</DropdownMenudiv>
                <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                  {SORT_OPTIONS.map((entry) => <DropdownMenuRadioItem key={entry.value} value={entry.value}>{entry.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Status</DropdownMenudiv>
                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  {(["All", "New", "Learning", "Mastered"] as StatusFilter[]).map((entry) => <DropdownMenuRadioItem key={entry} value={entry}>{entry}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Source</DropdownMenudiv>
                <DropdownMenuRadioGroup value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
                  {(["All", "AI", "Manual"] as SourceFilter[]).map((entry) => <DropdownMenuRadioItem key={entry} value={entry}>{entry}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Language</DropdownMenudiv>
                <DropdownMenuRadioGroup value={languageFilter} onValueChange={setLanguageFilter}>
                  {availableLanguages.map((entry) => <DropdownMenuRadioItem key={entry} value={entry}>{entry}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>Clear filters</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {viewMode === "list" ? <div className="table-head grid-cols-[minmax(0,1fr)_88px]"><span>Definition Entry</span><span>Status</span></div> : null}

          <div ref={gridScrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => { if (!(event.ctrlKey || event.metaKey) || !canZoom) return; event.preventDefault(); void stepZoom(event.deltaY < 0 ? "in" : "out", event.currentTarget.clientWidth - GRID_CONTENT_PADDING_PX); }}>
            {loading ? (
              <ListRowsSkeleton />
            ) : filteredWords.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center"><p className="section-title">No entries</p><p className="subtle-caption mt-2 max-w-sm px-4">Add words first to build your definitions handbook.</p></div>
            ) : viewMode === "list" ? (
              filteredWords.map((word) => {
                const status = getReviewStatus(word);
                return (
                  <div key={word.id} className={cn("word-row grid-cols-[minmax(0,1fr)_88px]", selectedId === word.id && "word-row-active")} role="button" tabIndex={0} onClick={() => { setSelectedId(word.id); setExampleVersion(0); }}>
                    <div className="min-w-0"><p className="serif-display truncate text-[1.6rem] leading-[0.95]">{word.word}</p><div className="mt-1.5 flex flex-wrap gap-1.5"><span className="lexi-chip">{word.language}</span></div><p className="word-sub mt-1.5 text-sm">{truncateText(word.definition, 95)}</p></div>
                    <span className={cn("status-pill", status === "Mastered" ? "status-mastered" : status === "Learning" ? "status-learning" : "status-new")}>{status}</span>
                  </div>
                );
              })
            ) : viewMode === "tiles" ? (
              <div className="grid gap-3 p-3" style={contentGridStyle}>
                {filteredWords.map((word) => (
                  <article key={word.id} className={cn("lexi-browser-card tile", selectedId === word.id && "active")} role="button" tabIndex={0} onClick={() => { setSelectedId(word.id); setExampleVersion(0); }}>
                    <p className="serif-display truncate text-xl leading-[0.95]">{word.word}</p>
                    <span className="lexi-chip compact w-fit">{word.language}</span>
                    <span className={cn("status-pill mt-auto w-fit", getReviewStatus(word) === "Mastered" ? "status-mastered" : getReviewStatus(word) === "Learning" ? "status-learning" : "status-new")}>{getReviewStatus(word)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 p-3" style={contentGridStyle}>
                {filteredWords.map((word) => (
                  <article key={word.id} className={cn("lexi-browser-card", selectedId === word.id && "active")} role="button" tabIndex={0} onClick={() => { setSelectedId(word.id); setExampleVersion(0); }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="serif-display break-words text-[2rem] leading-[0.92]">{word.word}</p><div className="mt-1.5 flex flex-wrap gap-1.5"><span className="lexi-chip">{word.language}</span></div></div>
                    </div>
                    <p className="word-sub mt-3 line-clamp-5">{word.definition}</p>
                    <div className="mt-auto flex justify-end pt-4">
                      <span className={cn("status-pill", getReviewStatus(word) === "Mastered" ? "status-mastered" : getReviewStatus(word) === "Learning" ? "status-learning" : "status-new")}>{getReviewStatus(word)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/10 p-2">
            {canZoom ? (
              <div className="flex items-center gap-2">
                <ZoomIn className="size-4 text-muted-foreground" />
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => void stepZoom("out", (gridScrollRef.current?.clientWidth ?? 0) - GRID_CONTENT_PADDING_PX)} aria-label="Zoom out">
                  <Minus className="size-4" />
                </button>
                <span className="sync-pill min-w-[4.25rem] justify-center">{zoom}%</span>
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => void stepZoom("in", (gridScrollRef.current?.clientWidth ?? 0) - GRID_CONTENT_PADDING_PX)} aria-label="Zoom in">
                  <Plus className="size-4" />
                </button>
              </div>
            ) : (
              <span className="subtle-caption inline-flex items-center gap-1.5"><kbd className="key-cap">Ctrl</kbd>/<kbd className="key-cap">Cmd</kbd> + wheel zooms cards</span>
            )}
          </div>
        </section>

        {detailPanelOpen ? (
        <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
            <div className="space-y-6">
              {selectedWord ? (
                <>
                  <div><h2 className="detail-title">{selectedWord.word}</h2><p className="subtle-caption mt-2">Definition Workspace</p></div>
                  <div className="ghost-divider" />
                  <p className="detail-text">{selectedWord.definition}</p>
                  <TagList tags={selectedWord.tags} />
                  <div className="frost-panel-soft space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Usage Example</p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={generatingExamples} className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => void generateExamples()}>
                          {generatingExamples ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <WandSparkles className="mr-1.5 size-3.5" />}
                          Generate
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={!selectedWord.examples || selectedWord.examples.length <= 1} className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => setExampleVersion((current) => current + 1)}><RefreshCcw className="mr-1.5 size-3.5" />Rotate</Button>
                      </div>
                    </div>
                    {generatingExamples ? <ExampleSkeleton /> : selectedExample ? <p className="serif-display text-2xl italic text-muted-foreground">{selectedExample}</p> : <p className="subtle-caption">No examples yet. Click Generate to create some.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => void copyDefinition()}><Copy className="mr-2 size-3.5" />{copied ? "Copied" : "Copy Definition"}</Button><span className="sync-pill"><Sparkles className="size-3" />{selectedWord.aiGenerated ? "AI generated" : "Manually curated"}</span></div>
                </>
              ) : (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center"><p className="section-title">Pick an entry</p><p className="subtle-caption mt-2 max-w-sm">Compare definitions and examples in one place.</p></div>
              )}
              <div className="ghost-divider" />
              <div className="space-y-3">
                <div className="flex items-center justify-between"><p className="font-medium">Related Words</p><Sparkles className="size-4 text-muted-foreground" /></div>
                {!selectedWord ? (
                  <div className="frost-panel-soft p-3 text-sm text-muted-foreground">Pick a word to see related ones.</div>
                ) : suggestionsLoading ? (
                  <SuggestionCardsSkeleton count={Math.min(suggestionCount, 4)} />
                ) : suggestionsError ? (
                  <div className="frost-panel-soft p-3 text-sm text-muted-foreground">{suggestionsError}</div>
                ) : definitionSuggestions.length === 0 ? (
                  <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No suggestions right now.</div>
                ) : (
                  <div className="space-y-2">
                    {definitionSuggestions.map((suggestion) => (
                      <div key={suggestion.word} className="frost-panel-soft space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="serif-display text-2xl leading-[0.95]">{suggestion.word}</p>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={addingSuggestionWord === suggestion.word} onClick={() => void applySuggestion(suggestion)}>{addingSuggestionWord === suggestion.word ? "Adding..." : "Add"}</Button>
                            <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => dismissSuggestion(suggestion)}>Dismiss</Button>
                          </div>
                        </div>
                        <p className="word-sub">{suggestion.definition}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><Sparkles className="size-3" />Dynamic examples enabled</span>
            <span className="subtle-caption inline-flex items-center gap-1"><kbd className="key-cap">J</kbd>/<kbd className="key-cap">K</kbd> move through entries</span>
          </div>
        </section>
        ) : null}
      </div>
    </>
  );
}
