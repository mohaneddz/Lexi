import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Grid2x2, LayoutGrid, List, Loader2, Minus, PanelRightClose, PanelRightOpen, Plus, RefreshCcw, Search, Sparkles, WandSparkles, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useSurfaceViewPreference } from "@/hooks/useSurfaceViewPreference";
import { cardMinWidthFor } from "@/lib/surface-view";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types";
import { getReviewStatus } from "@/utils/review";
import { truncateText } from "@/utils/formatters";
import {
  DEFINITION_SUGGESTION_BANK,
  dayKey,
  parseJsonArray,
  shuffleArray,
  wordFingerprint,
  type DefinitionSuggestion,
} from "@/utils/suggestions";

const GRID_CONTENT_PADDING_PX = 24;

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
  const { translations } = useTranslations();
  const { getExamples } = useAI();
  const { viewMode, setViewMode, zoom, stepZoom, canZoom, detailPanelOpen, toggleDetailPanel } = useSurfaceViewPreference("definitions", "list", 100);

  const [query, setQuery] = useState("");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exampleVersion, setExampleVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [generatingExamples, setGeneratingExamples] = useState(false);
  const [definitionSuggestions, setDefinitionSuggestions] = useState<DefinitionSuggestion[]>([]);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const todayKey = useMemo(() => dayKey(Date.now()), []);
  const suggestionScopeKey = groupFilterId === "none" ? "global" : `group:${groupFilterId}`;

  const filteredWords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...words]
      .filter((word) => groupFilterId === "none" || (word.groupIds || []).includes(groupFilterId))
      .filter((word) => {
        if (!normalizedQuery) return true;
        return word.word.toLowerCase().includes(normalizedQuery) || word.definition.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => a.word.localeCompare(b.word));
  }, [groupFilterId, query, words]);

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
    const existingWordSet = new Set(words.map((word) => wordFingerprint(word)));
    const dismissedKey = `lexi:definitions:daily-dismissed:${todayKey}:${suggestionScopeKey}`;
    const generatedKey = `lexi:definitions:daily-generated:${todayKey}:${suggestionScopeKey}`;
    const scopedWords = groupFilterId === "none" ? words : words.filter((word) => (word.groupIds || []).includes(groupFilterId));
    const scopedTranslations = groupFilterId === "none" ? translations : translations.filter((entry) => (entry.groupIds || []).includes(groupFilterId));

    const languageWeights = new Map<string, number>();
    const addLanguageWeight = (language: string, weight: number) => {
      languageWeights.set(language, (languageWeights.get(language) || 0) + weight);
    };

    for (const word of words) addLanguageWeight(word.language, 1);
    for (const translation of translations) {
      addLanguageWeight(translation.sourceLanguage, 1);
      addLanguageWeight(translation.targetLanguage, 1);
    }
    for (const word of scopedWords) addLanguageWeight(word.language, 3);
    for (const translation of scopedTranslations) {
      addLanguageWeight(translation.sourceLanguage, 3);
      addLanguageWeight(translation.targetLanguage, 3);
    }

    const knownLanguages = new Set(languageWeights.keys());
    if (knownLanguages.size === 0) knownLanguages.add("English");

    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)));
    const persisted = parseJsonArray(window.localStorage.getItem(generatedKey));

    if (persisted.length > 0) {
      const persistedSet = new Set(persisted);
      setDefinitionSuggestions(DEFINITION_SUGGESTION_BANK.filter((entry) => persistedSet.has(entry.id) && !dismissed.has(entry.id) && knownLanguages.has(entry.language) && !existingWordSet.has(wordFingerprint({ word: entry.word, language: entry.language }))));
      return;
    }

    const nextFresh = shuffleArray(
      DEFINITION_SUGGESTION_BANK.filter((entry) => !dismissed.has(entry.id) && knownLanguages.has(entry.language) && !existingWordSet.has(wordFingerprint({ word: entry.word, language: entry.language }))),
    ).slice(0, 4);
    setDefinitionSuggestions(nextFresh);
    window.localStorage.setItem(generatedKey, JSON.stringify(nextFresh.map((entry) => entry.id)));
  }, [groupFilterId, suggestionScopeKey, todayKey, translations, words]);

  const dismissSuggestion = (id: string) => {
    const dismissedKey = `lexi:definitions:daily-dismissed:${todayKey}:${suggestionScopeKey}`;
    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)));
    dismissed.add(id);
    window.localStorage.setItem(dismissedKey, JSON.stringify(Array.from(dismissed)));
    setDefinitionSuggestions((current) => current.filter((entry) => entry.id !== id));
  };

  const applySuggestion = async (suggestion: DefinitionSuggestion) => {
    setAddingSuggestionId(suggestion.id);
    try {
      await addWord({
        word: suggestion.word,
        definition: suggestion.definition,
        language: suggestion.language,
        tags: Array.from(new Set([...(suggestion.tags || []), "suggested"])),
        aiGenerated: false,
        groupIds: groupFilterId !== "none" ? [groupFilterId] : [],
      });
      setDefinitionSuggestions((current) => current.filter((entry) => entry.id !== suggestion.id));
    } finally {
      setAddingSuggestionId(null);
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
              <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} className="frost-input search-field-input" placeholder="Search definitions" />
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
          </div>

          {viewMode === "list" ? <div className="table-head grid-cols-[minmax(0,1fr)_88px]"><span>Definition Entry</span><span>Status</span></div> : null}

          <div ref={gridScrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => { if (!(event.ctrlKey || event.metaKey) || !canZoom) return; event.preventDefault(); void stepZoom(event.deltaY < 0 ? "in" : "out", event.currentTarget.clientWidth - GRID_CONTENT_PADDING_PX); }}>
            {loading ? (
              <div className="space-y-2 p-3">{[1, 2, 3, 4].map((index) => <div key={index} className="h-16 rounded-lg bg-white/6" />)}</div>
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
                    {selectedExample ? <p className="serif-display text-2xl italic text-muted-foreground">{selectedExample}</p> : <p className="subtle-caption">No examples yet. Click Generate to create some.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => void copyDefinition()}><Copy className="mr-2 size-3.5" />{copied ? "Copied" : "Copy Definition"}</Button><span className="sync-pill"><Sparkles className="size-3" />{selectedWord.aiGenerated ? "AI generated" : "Manually curated"}</span></div>
                </>
              ) : (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center"><p className="section-title">Pick an entry</p><p className="subtle-caption mt-2 max-w-sm">Compare definitions and examples in one place.</p></div>
              )}
              <div className="ghost-divider" />
              <div className="space-y-3">
                <div className="flex items-center justify-between"><p className="font-medium">Definition Suggestions</p><Sparkles className="size-4 text-muted-foreground" /></div>
                {definitionSuggestions.length === 0 ? <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No suggestions left for today.</div> : <div className="space-y-2">{definitionSuggestions.map((suggestion) => <div key={suggestion.id} className="frost-panel-soft space-y-2 p-3"><div className="flex items-start justify-between gap-2"><div><p className="serif-display text-2xl leading-[0.95]">{suggestion.word}</p><p className="subtle-caption">{suggestion.language}</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={addingSuggestionId === suggestion.id} onClick={() => void applySuggestion(suggestion)}>{addingSuggestionId === suggestion.id ? "Adding..." : "Add"}</Button><Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => dismissSuggestion(suggestion.id)}>Dismiss</Button></div></div><p className="word-sub">{suggestion.definition}</p><div className="flex flex-wrap gap-1.5">{suggestion.tags.map((tag) => <span key={`${suggestion.id}-${tag}`} className="lexi-chip">{tag}</span>)}</div></div>)}</div>}
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
