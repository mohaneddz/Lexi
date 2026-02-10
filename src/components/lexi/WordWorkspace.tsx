import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Copy,
  Languages,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AddWordDialog } from "@/components/AddWordDialog";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { EditWordDialog } from "@/components/EditWordDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAI } from "@/hooks/useAI";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { Word } from "@/types";
import { formatDate, truncateText } from "@/utils/formatters";
import { buildExample, buildPhonetic, getReviewStatus, setReviewStatus, type ReviewStatus } from "@/utils/review";
import { getSettings, updateSettings } from "@/utils/storage";

interface WordWorkspaceProps {
  mode: "inbox" | "words";
}

type SortMode = "recent" | "oldest" | "az" | "za" | "status" | "language";
type GroupMode = "none" | "status" | "language" | "alphabet";
type StatusFilter = "All" | ReviewStatus;
type SourceFilter = "All" | "AI" | "Manual";

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Recent", value: "recent" },
  { label: "Oldest", value: "oldest" },
  { label: "A-Z", value: "az" },
  { label: "Z-A", value: "za" },
  { label: "By Status", value: "status" },
  { label: "By Language", value: "language" },
];

const GROUP_OPTIONS: Array<{ label: string; value: GroupMode }> = [
  { label: "No Group", value: "none" },
  { label: "Group by Status", value: "status" },
  { label: "Group by Language", value: "language" },
  { label: "Group A-Z", value: "alphabet" },
];

function sortWords(words: Word[], mode: SortMode): Word[] {
  const sorted = [...words];
  if (mode === "oldest") return sorted.sort((a, b) => a.dateAdded - b.dateAdded);
  if (mode === "az") return sorted.sort((a, b) => a.word.localeCompare(b.word));
  if (mode === "za") return sorted.sort((a, b) => b.word.localeCompare(a.word));
  if (mode === "language") return sorted.sort((a, b) => a.language.localeCompare(b.language) || a.word.localeCompare(b.word));
  if (mode === "status") {
    const order: Record<ReviewStatus, number> = { New: 0, Learning: 1, Mastered: 2 };
    return sorted.sort((a, b) => order[getReviewStatus(a)] - order[getReviewStatus(b)] || b.dateAdded - a.dateAdded);
  }
  return sorted.sort((a, b) => b.dateAdded - a.dateAdded);
}

function groupKey(word: Word, mode: GroupMode): string {
  if (mode === "status") return getReviewStatus(word);
  if (mode === "language") return word.language;
  if (mode === "alphabet") {
    const ch = word.word.trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(ch) ? ch : "#";
  }
  return "All Words";
}

export function WordWorkspace({ mode }: WordWorkspaceProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const capturePath = mode === "inbox" ? "/inbox" : "/words";

  const { words, addWord, deleteWord, updateWord, loading } = useWords();
  const { translations } = useTranslations();
  const { getExamples } = useAI();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(mode === "inbox" ? "New" : "All");
  const [languageFilter, setLanguageFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("All");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>(mode === "words" ? "az" : "recent");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");

  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingWord, setDeletingWord] = useState<Word | null>(null);

  const [actionWordId, setActionWordId] = useState<string | null>(null);
  const [exampleVersion, setExampleVersion] = useState(0);
  const [exampleError, setExampleError] = useState<string | null>(null);

  const availableLanguages = useMemo(() => ["All", ...Array.from(new Set(words.map((w) => w.language))).sort((a, b) => a.localeCompare(b))], [words]);
  const availableTags = useMemo(() => Array.from(new Set(words.flatMap((w) => w.tags))).sort((a, b) => a.localeCompare(b)), [words]);

  const filteredWords = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = mode === "inbox" ? words.filter((w) => getReviewStatus(w) === "New") : words;
    base = base.filter((word) => {
      if (statusFilter !== "All" && getReviewStatus(word) !== statusFilter) return false;
      if (languageFilter !== "All" && word.language !== languageFilter) return false;
      if (sourceFilter === "AI" && !word.aiGenerated) return false;
      if (sourceFilter === "Manual" && word.aiGenerated) return false;
      if (selectedTags.length > 0 && !selectedTags.every((tag) => word.tags.includes(tag))) return false;
      if (!q) return true;
      return word.word.toLowerCase().includes(q) || word.definition.toLowerCase().includes(q) || word.tags.some((tag) => tag.toLowerCase().includes(q));
    });
    return sortWords(base, sortMode);
  }, [languageFilter, mode, query, selectedTags, sortMode, sourceFilter, statusFilter, words]);

  const groupedWords = useMemo(() => {
    const groups = new Map<string, Word[]>();
    for (const word of filteredWords) {
      const key = groupKey(word, groupMode);
      const arr = groups.get(key) || [];
      arr.push(word);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  }, [filteredWords, groupMode]);

  useEffect(() => {
    getSettings().then((settings) => setShowDeleteConfirmation(settings.showDeleteConfirmation));

    const onSettingsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ showDeleteConfirmation?: boolean }>;
      if (typeof custom.detail?.showDeleteConfirmation === "boolean") {
        setShowDeleteConfirmation(custom.detail.showDeleteConfirmation);
      }
    };

    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  useEffect(() => {
    if (filteredWords.length === 0) {
      setSelectedWordId(null);
      return;
    }

    if (!selectedWordId || !filteredWords.some((w) => w.id === selectedWordId)) {
      setSelectedWordId(filteredWords[0].id);
    }
  }, [filteredWords, selectedWordId]);

  useEffect(() => {
    const onCapture = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === capturePath) {
        setAddDialogOpen(true);
      }
    };

    const onSearchFocus = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === capturePath) {
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("lexi:capture", onCapture);
    window.addEventListener("lexi:focus-search", onSearchFocus);
    return () => {
      window.removeEventListener("lexi:capture", onCapture);
      window.removeEventListener("lexi:focus-search", onSearchFocus);
    };
  }, [capturePath]);

  const selectedWord = useMemo(() => filteredWords.find((w) => w.id === selectedWordId) ?? null, [filteredWords, selectedWordId]);
  const relatedTranslations = useMemo(() => {
    if (!selectedWord) return [];
    const normalized = selectedWord.word.toLowerCase();
    return translations.filter((t) => t.sourceWord.toLowerCase() === normalized || t.targetWord.toLowerCase() === normalized).slice(0, 6);
  }, [selectedWord, translations]);

  const exampleText = useMemo(() => {
    if (!selectedWord) return "";
    if (selectedWord.examples && selectedWord.examples.length > 0) {
      return selectedWord.examples[exampleVersion % selectedWord.examples.length];
    }
    return buildExample(selectedWord);
  }, [exampleVersion, selectedWord]);

  const handleCopyWord = async (word: Word) => {
    setActionWordId(word.id);
    try {
      await navigator.clipboard.writeText(word.word);
    } finally {
      setActionWordId(null);
    }
  };

  const handleSaveEdit = async (id: string, updates: Partial<Word>) => {
    await updateWord(id, updates);
  };

  const handleDeleteWord = async (word: Word, disableConfirmation: boolean) => {
    setActionWordId(word.id);
    try {
      if (disableConfirmation) {
        await updateSettings({ showDeleteConfirmation: false });
        setShowDeleteConfirmation(false);
        window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { showDeleteConfirmation: false } }));
      }

      await deleteWord(word.id);
      if (selectedWordId === word.id) {
        setSelectedWordId(null);
      }
    } finally {
      setActionWordId(null);
      setDeleteDialogOpen(false);
      setDeletingWord(null);
    }
  };

  const requestDelete = (word: Word) => {
    if (!showDeleteConfirmation) {
      void handleDeleteWord(word, false);
      return;
    }

    setDeletingWord(word);
    setDeleteDialogOpen(true);
  };

  const generateExamplesForWord = async (word: Word) => {
    setActionWordId(word.id);
    setExampleError(null);

    try {
      const response = await getExamples(word.word, word.language);
      if (!response.success || response.data.length === 0) {
        setExampleError(response.error ?? "Could not generate examples right now.");
        return;
      }

      const nextExamples = Array.from(new Set(response.data.map((item) => item.trim()).filter(Boolean))).slice(0, 5);
      await updateWord(word.id, { examples: nextExamples });
      setExampleVersion(0);
    } finally {
      setActionWordId(null);
    }
  };

  return (
    <>
      <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.18fr_1fr]">
        <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="flex items-center gap-2 border-b border-white/10 p-3">
            <div className="search-field-wrap flex-1">
              <Search className="search-field-icon" />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="frost-input search-field-input"
                placeholder={mode === "inbox" ? "Search incoming words" : "Search your vocabulary"}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-[2.36rem] w-[2.36rem] border-white/15 bg-white/5 text-muted-foreground"
                  title="Filters"
                >
                  <SlidersHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                {["All", "New", "Learning", "Mastered"].map((status) => (
                  <DropdownMenuCheckboxItem key={status} checked={statusFilter === status} onCheckedChange={() => setStatusFilter(status as StatusFilter)}>
                    {status}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Language</DropdownMenuLabel>
                {availableLanguages.map((language) => (
                  <DropdownMenuCheckboxItem key={language} checked={languageFilter === language} onCheckedChange={() => setLanguageFilter(language)}>
                    {language}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Source</DropdownMenuLabel>
                {["All", "AI", "Manual"].map((source) => (
                  <DropdownMenuCheckboxItem key={source} checked={sourceFilter === source} onCheckedChange={() => setSourceFilter(source as SourceFilter)}>
                    {source}
                  </DropdownMenuCheckboxItem>
                ))}
                {availableTags.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Tags</DropdownMenuLabel>
                    {availableTags.slice(0, 20).map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag}
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={() => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                      >
                        {tag}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => {
                  setQuery("");
                  setStatusFilter(mode === "inbox" ? "New" : "All");
                  setLanguageFilter("All");
                  setSourceFilter("All");
                  setSelectedTags([]);
                }}>
                  Clear Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <select className="frost-input h-[2.36rem] w-[126px] py-0" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            <select className="frost-input h-[2.36rem] w-[136px] py-0" value={groupMode} onChange={(event) => setGroupMode(event.target.value as GroupMode)}>
              {GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="table-head grid-cols-[minmax(0,1.35fr)_120px_108px_26px]">
            <span>{mode === "inbox" ? "Captured" : "Word"}</span>
            <span>Language</span>
            <span>Status</span>
            <span />
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-lg bg-white/6" />)}</div>
            ) : filteredWords.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-5 text-center">
                <p className="serif-display text-2xl">No words found</p>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(true)} className="border-white/18 bg-white/6 text-foreground hover:bg-white/14">
                  Add Word
                </Button>
              </div>
            ) : (
              groupedWords.map((group) => (
                <div key={group.key}>
                  {groupMode !== "none" ? (
                    <div className="sticky top-0 z-10 flex items-center justify-between border-y border-white/8 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md">
                      <span>{group.key}</span>
                      <span>{group.items.length}</span>
                    </div>
                  ) : null}

                  {group.items.map((word) => {
                    const status = getReviewStatus(word);
                    return (
                      <div
                        key={word.id}
                        className={cn("word-row grid-cols-[minmax(0,1.35fr)_120px_108px_26px]", selectedWordId === word.id && "word-row-active")}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedWordId(word.id);
                          setExampleVersion(0);
                          setExampleError(null);
                        }}
                      >
                        <div className="min-w-0">
                          <p className="serif-display truncate text-[1.8rem] leading-[0.92]">{word.word}</p>
                          <p className="word-sub mt-2 truncate text-sm">{truncateText(word.definition, 88)}</p>
                        </div>

                        <span className="truncate text-sm text-muted-foreground">{word.language}</span>
                        <span className={cn("status-pill", status === "Mastered" ? "status-mastered" : status === "Learning" ? "status-learning" : "status-new")}>{status}</span>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={(event) => event.stopPropagation()}>
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => { setEditingWord(word); setEditDialogOpen(true); }}>
                              <Pencil className="size-4" />
                              Edit word
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void handleCopyWord(word)} disabled={actionWordId === word.id}>
                              <Copy className="size-4" />
                              Copy word
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {(["New", "Learning", "Mastered"] as ReviewStatus[]).map((value) => (
                              <DropdownMenuItem key={value} onSelect={() => void updateWord(word.id, { tags: setReviewStatus(word.tags, value) })}>
                                Set {value}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => void generateExamplesForWord(word)}>
                              <RefreshCcw className="size-4" />
                              Generate AI examples
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => requestDelete(word)}>
                              <Trash2 className="size-4" />
                              Delete word
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><CircleDot className="size-3" />Synced, just now</span>
            <span className="subtle-caption">Shortcuts: `J/K` move, `1-3` status</span>
          </div>
        </section>

        <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
            {selectedWord ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="detail-title">{selectedWord.word}</h2>
                    <p className="detail-phonetic mt-1">\ {buildPhonetic(selectedWord.word)} \</p>
                  </div>
                  <span className={cn("status-pill", getReviewStatus(selectedWord) === "Mastered" ? "status-mastered" : getReviewStatus(selectedWord) === "Learning" ? "status-learning" : "status-new")}>{getReviewStatus(selectedWord)}</span>
                </div>

                <div className="ghost-divider" />

                <div className="space-y-3">
                  <p className="detail-text">{selectedWord.definition}</p>
                  <p className="serif-display text-2xl italic text-muted-foreground">{exampleText}</p>
                  <p className="detail-note">Added {formatDate(selectedWord.dateAdded)} from {selectedWord.language} collection.</p>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionWordId === selectedWord.id}
                      className="border-white/15 bg-white/6 hover:bg-white/14"
                      onClick={() => void generateExamplesForWord(selectedWord)}
                    >
                      <RefreshCcw className="mr-1.5 size-3.5" />
                      New Example
                    </Button>
                    {exampleError ? <span className="subtle-caption text-destructive">{exampleError}</span> : <span className="subtle-caption">AI examples</span>}
                  </div>
                </div>

                <div className="ghost-divider" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="serif-display text-4xl">Translations</h3>
                    <Languages className="size-4 text-muted-foreground" />
                  </div>

                  {relatedTranslations.length === 0 ? (
                    <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No direct translation pair yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {relatedTranslations.map((translation) => (
                        <div key={translation.id} className="frost-panel-soft space-y-1.5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="serif-display text-3xl leading-[0.96]">{translation.targetWord}</p>
                            <span className="subtle-caption">{translation.targetLanguage}</span>
                          </div>
                          <p className="subtle-caption">{translation.sourceLanguage}: {translation.sourceWord}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[380px] flex-col items-center justify-center text-center">
                <p className="section-title">Choose a word</p>
                <p className="subtle-caption mt-2 max-w-sm">Select an entry to inspect definitions, context examples, and translation links.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><Sparkles className="size-3" />Context-aware definitions</span>
            <span className="sync-pill"><CircleDot className="size-3" />Synced, just now</span>
          </div>
        </section>
      </div>

      <AddWordDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={addWord} />
      <EditWordDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} word={editingWord} onSave={handleSaveEdit} />
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Word?"
        description={deletingWord ? `Delete "${deletingWord.word}"? This cannot be undone.` : "Delete this word?"}
        onConfirm={(skipNextTime) => {
          if (deletingWord) {
            void handleDeleteWord(deletingWord, skipNextTime);
          }
        }}
      />
    </>
  );
}
