import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Copy, RefreshCcw, Search, Sparkles } from "lucide-react";

import { AddWordDialog } from "@/components/AddWordDialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export default function Definitions() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { words, loading, addWord } = useWords();
  const { translations } = useTranslations();

  const [query, setQuery] = useState("");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exampleVersion, setExampleVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [definitionSuggestions, setDefinitionSuggestions] = useState<DefinitionSuggestion[]>([]);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const todayKey = useMemo(() => dayKey(Date.now()), []);
  const suggestionScopeKey = groupFilterId === "none" ? "global" : `group:${groupFilterId}`;

  const filteredWords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...words]
      .filter((word) => groupFilterId === "none" || (word.groupIds || []).includes(groupFilterId))
      .filter((word) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          word.word.toLowerCase().includes(normalizedQuery) ||
          word.definition.toLowerCase().includes(normalizedQuery)
        );
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
    const onCapture = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path !== "/definitions") {
        return;
      }

      setAddDialogOpen(true);
    };

    const onSearchFocus = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path !== "/definitions") {
        return;
      }

      searchInputRef.current?.focus();
    };

    window.addEventListener("lexi:capture", onCapture);
    window.addEventListener("lexi:focus-search", onSearchFocus);
    return () => {
      window.removeEventListener("lexi:capture", onCapture);
      window.removeEventListener("lexi:focus-search", onSearchFocus);
    };
  }, []);

  useEffect(() => {
    const onGroupFilterChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ groupId?: string }>;
      if (typeof customEvent.detail?.groupId === "string") {
        setGroupFilterId(customEvent.detail.groupId);
      }
    };

    window.addEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    return () => window.removeEventListener("lexi:group-filter-changed", onGroupFilterChanged);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !selectedId) {
        return;
      }

      const currentIndex = filteredWords.findIndex((word) => word.id === selectedId);
      if (currentIndex === -1) {
        return;
      }

      if (event.key.toLowerCase() === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.min(filteredWords.length - 1, currentIndex + 1);
        setSelectedId(filteredWords[next].id);
        return;
      }

      if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = Math.max(0, currentIndex - 1);
        setSelectedId(filteredWords[next].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredWords, selectedId]);

  const selectedWord = useMemo(
    () => filteredWords.find((word) => word.id === selectedId) ?? null,
    [filteredWords, selectedId],
  );

  const selectedExample = useMemo(() => {
    if (!selectedWord) {
      return "";
    }

    if (selectedWord.examples && selectedWord.examples.length > 0) {
      return selectedWord.examples[exampleVersion % selectedWord.examples.length];
    }
    return "";
  }, [exampleVersion, selectedWord]);

  const copyDefinition = async () => {
    if (!selectedWord) {
      return;
    }

    await navigator.clipboard.writeText(`${selectedWord.word}: ${selectedWord.definition}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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

    for (const word of words) {
      addLanguageWeight(word.language, 1);
    }
    for (const translation of translations) {
      addLanguageWeight(translation.sourceLanguage, 1);
      addLanguageWeight(translation.targetLanguage, 1);
    }
    for (const word of scopedWords) {
      addLanguageWeight(word.language, 3);
    }
    for (const translation of scopedTranslations) {
      addLanguageWeight(translation.sourceLanguage, 3);
      addLanguageWeight(translation.targetLanguage, 3);
    }

    const knownLanguages = new Set(languageWeights.keys());
    if (knownLanguages.size === 0) {
      knownLanguages.add("English");
    }

    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)));
    const persisted = parseJsonArray(window.localStorage.getItem(generatedKey));

    if (persisted.length > 0) {
      const persistedSet = new Set(persisted);
      const nextPersisted = DEFINITION_SUGGESTION_BANK.filter((entry) => {
        if (!persistedSet.has(entry.id)) return false;
        if (dismissed.has(entry.id)) return false;
        if (!knownLanguages.has(entry.language)) return false;
        return !existingWordSet.has(wordFingerprint({ word: entry.word, language: entry.language }));
      });
      setDefinitionSuggestions(nextPersisted);
      return;
    }

    const nextFresh = shuffleArray(
      DEFINITION_SUGGESTION_BANK.filter((entry) => {
        if (dismissed.has(entry.id)) return false;
        if (!knownLanguages.has(entry.language)) return false;
        return !existingWordSet.has(wordFingerprint({ word: entry.word, language: entry.language }));
      }),
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

  return (
    <>
      <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.04fr_1fr]">
      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="border-b border-white/10 p-3">
          <div className="search-field-wrap">
            <Search className="search-field-icon" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="frost-input search-field-input"
              placeholder="Search definitions"
            />
          </div>
        </div>

        <div className="table-head grid-cols-[minmax(0,1fr)_88px]">
          <span>Definition Entry</span>
          <span>Status</span>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4].map((index) => (
                <div key={index} className="h-16 rounded-lg bg-white/6" />
              ))}
            </div>
          ) : filteredWords.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
              <p className="section-title">No entries</p>
              <p className="subtle-caption mt-2 max-w-sm px-4">
                Add words first to build your definitions handbook.
              </p>
            </div>
          ) : (
            filteredWords.map((word) => {
              const status = getReviewStatus(word);

              return (
                <div
                  key={word.id}
                  className={cn(
                    "word-row grid-cols-[minmax(0,1fr)_88px]",
                    selectedId === word.id && "word-row-active",
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(word.id);
                    setExampleVersion(0);
                  }}
                >
                  <div className="min-w-0">
                    <p className="serif-display truncate text-[1.6rem] leading-[0.95]">{word.word}</p>
                    <p className="word-sub mt-1.5 text-sm">{truncateText(word.definition, 95)}</p>
                  </div>
                  <span className={cn("status-pill", status === "Mastered" ? "status-mastered" : status === "Learning" ? "status-learning" : "status-new")}>
                    {status}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-white/10 p-2">
          <span className="sync-pill">
            <CircleDot className="size-3" />
            Synced, just now
          </span>
        </div>
      </section>

      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
          <div className="space-y-6">
            {selectedWord ? (
              <>
              <div>
                <h2 className="detail-title">{selectedWord.word}</h2>
                <p className="subtle-caption mt-2">Definition Workspace</p>
              </div>

              <div className="ghost-divider" />

              <p className="detail-text">{selectedWord.definition}</p>

                <div className="frost-panel-soft space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Usage Example</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!selectedWord.examples || selectedWord.examples.length <= 1}
                      className="border-white/15 bg-white/6 hover:bg-white/14"
                      onClick={() => setExampleVersion((current) => current + 1)}
                    >
                      <RefreshCcw className="mr-1.5 size-3.5" />
                      Rotate
                    </Button>
                  </div>
                {selectedExample ? (
                  <p className="serif-display text-2xl italic text-muted-foreground">{selectedExample}</p>
                ) : (
                  <p className="subtle-caption">No examples yet. Generate examples from the Words page.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/15 bg-white/6 hover:bg-white/14"
                  onClick={() => void copyDefinition()}
                >
                  <Copy className="mr-2 size-3.5" />
                  {copied ? "Copied" : "Copy Definition"}
                </Button>
                <span className="sync-pill">
                  <Sparkles className="size-3" />
                  {selectedWord.aiGenerated ? "AI generated" : "Manually curated"}
                </span>
              </div>
            </>
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                <p className="section-title">Pick an entry</p>
                <p className="subtle-caption mt-2 max-w-sm">
                  Compare definitions and examples in one place.
                </p>
              </div>
            )}

            <div className="ghost-divider" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Definition Suggestions</p>
                <Sparkles className="size-4 text-muted-foreground" />
              </div>
              {definitionSuggestions.length === 0 ? (
                <div className="frost-panel-soft p-3 text-sm text-muted-foreground">
                  No suggestions left for today.
                </div>
              ) : (
                <div className="space-y-2">
                  {definitionSuggestions.map((suggestion) => (
                    <div key={suggestion.id} className="frost-panel-soft space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="serif-display text-2xl leading-[0.95]">{suggestion.word}</p>
                          <p className="subtle-caption">{suggestion.language}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/6 hover:bg-white/14"
                            disabled={addingSuggestionId === suggestion.id}
                            onClick={() => void applySuggestion(suggestion)}
                          >
                            {addingSuggestionId === suggestion.id ? "Adding..." : "Add"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/6 hover:bg-white/14"
                            onClick={() => dismissSuggestion(suggestion.id)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                      <p className="word-sub">{suggestion.definition}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestion.tags.map((tag) => (
                          <span key={`${suggestion.id}-${tag}`} className="lexi-chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill">
            <Sparkles className="size-3" />
            Dynamic examples enabled
          </span>
          <span className="subtle-caption">`J/K` move through entries</span>
        </div>
      </section>
      </div>
      <AddWordDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={addWord} />
    </>
  );
}
