import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleDot,
  Copy,
  FolderPlus,
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
  DropdownMenudiv,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAI } from "@/hooks/useAI";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { Word } from "@/types";
import { formatDate, truncateText } from "@/utils/formatters";
import { buildPhonetic, getReviewStatus, setReviewStatus, type ReviewStatus } from "@/utils/review";
import { getSettings, updateSettings } from "@/utils/storage";

interface WordWorkspaceProps {
  mode: "inbox" | "words";
}

type SortMode = "recent" | "oldest" | "az" | "za" | "status" | "language";
type GroupMode = "none" | "status" | "language" | "alphabet";
type StatusFilter = "All" | ReviewStatus;
type SourceFilter = "All" | "AI" | "Manual";

type ContextMenuState = {
  word: Word;
  x: number;
  y: number;
};

const SORT_OPTIONS: Array<{ div: string; value: SortMode }> = [
  { div: "Recent", value: "recent" },
  { div: "Oldest", value: "oldest" },
  { div: "A-Z", value: "az" },
  { div: "Z-A", value: "za" },
  { div: "By Status", value: "status" },
  { div: "By Language", value: "language" },
];

type DailySuggestion = {
  word: string;
  definition: string;
  language: string;
  tags: string[];
};

const DAILY_SUGGESTION_BANK: DailySuggestion[] = [
  { word: "scrutinize", definition: "to examine closely and critically", language: "English", tags: ["analysis", "precision"] },
  { word: "concise", definition: "expressing much in few words", language: "English", tags: ["communication", "writing"] },
  { word: "resilient", definition: "able to recover quickly from setbacks", language: "English", tags: ["mindset", "growth"] },
  { word: "nuance", definition: "a subtle difference in meaning or expression", language: "English", tags: ["language", "thinking"] },
  { word: "mettre en oeuvre", definition: "to put into effect or implement", language: "French", tags: ["action", "execution"] },
  { word: "sostenible", definition: "able to continue over time without harm", language: "Spanish", tags: ["planning", "strategy"] },
  { word: "zielstrebig", definition: "determined and focused toward goals", language: "German", tags: ["focus", "progress"] },
  { word: "seamless", definition: "smooth and without noticeable transitions", language: "English", tags: ["design", "quality"] },
  { word: "equitable", definition: "fair and impartial", language: "English", tags: ["ethics", "policy"] },
  { word: "iterate", definition: "to repeat a process to improve results", language: "English", tags: ["process", "engineering"] },
];

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseJsonArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

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

function toggleGroupMembership(ids: string[], groupId: string): string[] {
  if (ids.includes(groupId)) {
    return ids.filter((id) => id !== groupId);
  }

  return [...ids, groupId];
}

export function WordWorkspace({ mode }: WordWorkspaceProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const capturePath = mode === "inbox" ? "/inbox" : "/words";

  const { words, addWord, deleteWord, updateWord, loading } = useWords();
  const { translations } = useTranslations();
  const { groups, addGroup } = useGroups();
  const { getExamples } = useAI();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(mode === "inbox" ? "New" : "All");
  const [languageFilter, setLanguageFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("All");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>(mode === "words" ? "az" : "recent");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingWord, setDeletingWord] = useState<Word | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [actionWordId, setActionWordId] = useState<string | null>(null);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [dailySuggestions, setDailySuggestions] = useState<DailySuggestion[]>([]);
  const [appliedDailyWords, setAppliedDailyWords] = useState<string[]>([]);
  const [dismissingSuggestionWord, setDismissingSuggestionWord] = useState<string | null>(null);
  const [suggestionsRevision, setSuggestionsRevision] = useState(0);

  const availableLanguages = useMemo(() => ["All", ...Array.from(new Set(words.map((w) => w.language))).sort((a, b) => a.localeCompare(b))], [words]);
  const availableTags = useMemo(() => Array.from(new Set(words.flatMap((w) => w.tags))).sort((a, b) => a.localeCompare(b)), [words]);
  const todayKey = useMemo(() => dayKey(Date.now()), []);

  useEffect(() => {
    if (mode !== "inbox") {
      return;
    }

    const appliedKey = `lexi:inbox:daily-applied:${todayKey}`;
    const dismissedKey = `lexi:inbox:daily-dismissed:${todayKey}`;
    const generatedKey = `lexi:inbox:daily-generated:${todayKey}`;

    const scopedWords = groupFilterId === "none" ? words : words.filter((word) => (word.groupIds || []).includes(groupFilterId));
    const existingWords = new Set(scopedWords.map((word) => word.word.trim().toLowerCase()));
    const preferredLanguage =
      scopedWords.length > 0
        ? scopedWords.reduce<Record<string, number>>((acc, word) => {
            acc[word.language] = (acc[word.language] || 0) + 1;
            return acc;
          }, {})
        : {};
    const topLanguage = Object.entries(preferredLanguage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "English";

    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)).map((item) => item.toLowerCase()));
    const applied = parseJsonArray(window.localStorage.getItem(appliedKey));
    setAppliedDailyWords(applied);

    const persisted = suggestionsRevision === 0 ? parseJsonArray(window.localStorage.getItem(generatedKey)) : [];
    if (persisted.length > 0) {
      const persistedSet = new Set(persisted.map((item) => item.toLowerCase()));
      const suggestions = DAILY_SUGGESTION_BANK.filter(
        (entry) => persistedSet.has(entry.word.toLowerCase()) && !existingWords.has(entry.word.toLowerCase()) && !dismissed.has(entry.word.toLowerCase()),
      );
      setDailySuggestions(suggestions);
      return;
    }

    const ranked = shuffleArray(
      DAILY_SUGGESTION_BANK
      .filter((entry) => !existingWords.has(entry.word.toLowerCase()) && !dismissed.has(entry.word.toLowerCase()))
      .sort((a, b) => {
        const aLanguageScore = a.language === topLanguage ? 1 : 0;
        const bLanguageScore = b.language === topLanguage ? 1 : 0;
        return bLanguageScore - aLanguageScore || a.word.localeCompare(b.word);
      })
      .slice(0, 8),
    ).slice(0, 4);

    setDailySuggestions(ranked);
    window.localStorage.setItem(generatedKey, JSON.stringify(ranked.map((item) => item.word)));
  }, [groupFilterId, mode, suggestionsRevision, todayKey, words]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== (mode === "inbox" ? "New" : "All")) count += 1;
    if (languageFilter !== "All") count += 1;
    if (sourceFilter !== "All") count += 1;
    if (selectedTags.length > 0) count += 1;
    if (groupFilterId !== "none") count += 1;
    return count;
  }, [groupFilterId, languageFilter, mode, selectedTags.length, sourceFilter, statusFilter]);

  const filteredWords = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = mode === "inbox" ? words.filter((w) => getReviewStatus(w) === "New") : words;
    base = base.filter((word) => {
      if (statusFilter !== "All" && getReviewStatus(word) !== statusFilter) return false;
      if (languageFilter !== "All" && word.language !== languageFilter) return false;
      if (sourceFilter === "AI" && !word.aiGenerated) return false;
      if (sourceFilter === "Manual" && word.aiGenerated) return false;
      if (selectedTags.length > 0 && !selectedTags.every((tag) => word.tags.includes(tag))) return false;
      if (groupFilterId !== "none" && !(word.groupIds || []).includes(groupFilterId)) return false;
      if (!q) return true;
      return word.word.toLowerCase().includes(q) || word.definition.toLowerCase().includes(q) || word.tags.some((tag) => tag.toLowerCase().includes(q));
    });
    return sortWords(base, sortMode);
  }, [groupFilterId, languageFilter, mode, query, selectedTags, sortMode, sourceFilter, statusFilter, words]);

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

    const onGroupFilterChanged = (event: Event) => {
      const custom = event as CustomEvent<{ groupId?: string }>;
      if (custom.detail?.groupId !== undefined) {
        setGroupFilterId(custom.detail.groupId);
      }
    };

    window.addEventListener("lexi:capture", onCapture);
    window.addEventListener("lexi:focus-search", onSearchFocus);
    window.addEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    return () => {
      window.removeEventListener("lexi:capture", onCapture);
      window.removeEventListener("lexi:focus-search", onSearchFocus);
      window.removeEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    };
  }, [capturePath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !selectedWordId || filteredWords.length === 0) {
        return;
      }

      const currentIndex = filteredWords.findIndex((entry) => entry.id === selectedWordId);
      if (currentIndex < 0) {
        return;
      }

      if (event.key.toLowerCase() === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(filteredWords.length - 1, currentIndex + 1);
        setSelectedWordId(filteredWords[nextIndex].id);
      }

      if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(0, currentIndex - 1);
        setSelectedWordId(filteredWords[nextIndex].id);
      }

      if (event.key === "1" || event.code === "Numpad1") {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        const selected = filteredWords[currentIndex];
        void updateWord(selected.id, { tags: setReviewStatus(selected.tags, "New") });
      }

      if (event.key === "2" || event.code === "Numpad2") {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        const selected = filteredWords[currentIndex];
        void updateWord(selected.id, { tags: setReviewStatus(selected.tags, "Learning") });
      }

      if (event.key === "3" || event.code === "Numpad3") {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        const selected = filteredWords[currentIndex];
        void updateWord(selected.id, { tags: setReviewStatus(selected.tags, "Mastered") });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredWords, selectedWordId, updateWord]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const selectedWord = useMemo(() => filteredWords.find((w) => w.id === selectedWordId) ?? null, [filteredWords, selectedWordId]);
  const relatedTranslations = useMemo(() => {
    if (!selectedWord) return [];
    const normalized = selectedWord.word.toLowerCase();
    return translations.filter((t) => t.sourceWord.toLowerCase() === normalized || t.targetWord.toLowerCase() === normalized).slice(0, 6);
  }, [selectedWord, translations]);

  const selectedWordGroups = useMemo(() => {
    if (!selectedWord) {
      return [];
    }
    const ids = selectedWord.groupIds || [];
    return groups.filter((group) => ids.includes(group.id));
  }, [groups, selectedWord]);

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
    } finally {
      setActionWordId(null);
    }
  };

  const toggleWordGroup = async (word: Word, groupId: string) => {
    const nextGroupIds = toggleGroupMembership(word.groupIds || [], groupId);
    await updateWord(word.id, { groupIds: nextGroupIds });
  };

  const createGroupAndAssign = async (word: Word) => {
    const name = window.prompt("New group name");
    if (!name || !name.trim()) {
      return;
    }

    try {
      const group = await addGroup({ name: name.trim() });
      const nextGroupIds = Array.from(new Set([...(word.groupIds || []), group.id]));
      await updateWord(word.id, { groupIds: nextGroupIds });
    } catch (error) {
      setExampleError(error instanceof Error ? error.message : "Could not create group.");
    }
  };

  const clearAllFilters = () => {
    setQuery("");
    setStatusFilter(mode === "inbox" ? "New" : "All");
    setLanguageFilter("All");
    setSourceFilter("All");
    setSelectedTags([]);
    setGroupFilterId("none");
    setGroupMode("none");
  };

  const addDailySuggestion = async (suggestion: DailySuggestion) => {
    const normalizedWord = suggestion.word.trim().toLowerCase();
    if (words.some((entry) => entry.word.trim().toLowerCase() === normalizedWord)) {
      return;
    }

    await addWord({
      word: suggestion.word,
      definition: suggestion.definition,
      language: suggestion.language,
      tags: Array.from(new Set([...suggestion.tags, "new", "daily-suggestion"])),
      aiGenerated: false,
      examples: [],
      groupIds: groupFilterId !== "none" ? [groupFilterId] : [],
    });
    const nextApplied = Array.from(new Set([...appliedDailyWords, suggestion.word]));
    setAppliedDailyWords(nextApplied);
    window.localStorage.setItem(`lexi:inbox:daily-applied:${todayKey}`, JSON.stringify(nextApplied));
    setDailySuggestions((prev) => prev.filter((entry) => entry.word !== suggestion.word));
  };

  const dismissDailySuggestion = (suggestion: DailySuggestion) => {
    const key = `lexi:inbox:daily-dismissed:${todayKey}`;
    const existing = new Set(parseJsonArray(window.localStorage.getItem(key)).map((item) => item.toLowerCase()));
    existing.add(suggestion.word.toLowerCase());
    window.localStorage.setItem(key, JSON.stringify(Array.from(existing)));
    setDailySuggestions((prev) => prev.filter((entry) => entry.word !== suggestion.word));
    setDismissingSuggestionWord(null);
  };

  return (
    <>
      <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.18fr_1fr]">
        <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
            <div className="search-field-wrap min-w-[220px] flex-[1_1_340px]">
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={activeFilterCount === 0}
              onClick={clearAllFilters}
              className="h-[2.36rem] w-[2.36rem] border-white/15 bg-white/5 text-muted-foreground disabled:opacity-45"
              title={activeFilterCount > 0 ? "Clear all filters" : "No active filters"}
            >
              <Check className="size-4" />
            </Button>

            <DropdownMenu open={filtersOpen} onOpenChange={setFiltersOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative h-[2.36rem] w-[2.36rem] border-white/15 bg-white/5 text-muted-foreground"
                  title="Filters"
                >
                  <SlidersHorizontal className="size-4" />
                  {activeFilterCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-white/90 text-[10px] font-semibold text-black">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenudiv>Status</DropdownMenudiv>
                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  {["All", "New", "Learning", "Mastered"].map((status) => (
                    <DropdownMenuRadioItem key={status} value={status}>{status}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />

                <DropdownMenudiv>Language</DropdownMenudiv>
                <DropdownMenuRadioGroup value={languageFilter} onValueChange={setLanguageFilter}>
                  {availableLanguages.map((language) => (
                    <DropdownMenuRadioItem key={language} value={language}>{language}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />

                <DropdownMenudiv>Source</DropdownMenudiv>
                <DropdownMenuRadioGroup value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
                  {["All", "AI", "Manual"].map((source) => (
                    <DropdownMenuRadioItem key={source} value={source}>{source}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>

                {availableTags.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenudiv>Tags</DropdownMenudiv>
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
                <DropdownMenudiv>List Grouping</DropdownMenudiv>
                <DropdownMenuRadioGroup value={groupMode} onValueChange={(value) => setGroupMode(value as GroupMode)}>
                  <DropdownMenuRadioItem value="none">No Grouping</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="status">By Status</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="language">By Language</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="alphabet">A-Z</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>
                  Clear Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <select className="frost-input toolbar-select h-[2.36rem] py-0" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.div}</option>)}
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
                          setExampleError(null);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setSelectedWordId(word.id);
                          setContextMenu({
                            word,
                            x: event.clientX,
                            y: event.clientY,
                          });
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

                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <FolderPlus className="size-4" />
                                Groups
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-56">
                                {groups.length === 0 ? (
                                  <DropdownMenuItem onSelect={() => void createGroupAndAssign(word)}>
                                    Create first group
                                  </DropdownMenuItem>
                                ) : (
                                  groups.map((groupEntry) => {
                                    const assigned = (word.groupIds || []).includes(groupEntry.id);
                                    return (
                                      <DropdownMenuItem key={groupEntry.id} onSelect={() => void toggleWordGroup(word, groupEntry.id)}>
                                        <Check className={cn("size-4", !assigned && "opacity-0")} />
                                        {groupEntry.name}
                                      </DropdownMenuItem>
                                    );
                                  })
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => void createGroupAndAssign(word)}>
                                  Create group and add
                                </DropdownMenuItem>
                                {(word.groupIds || []).length > 0 ? (
                                  <DropdownMenuItem onSelect={() => void updateWord(word.id, { groupIds: [] })}>
                                    Remove from all groups
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>

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

                <div className="space-y-4">
                  <p className="detail-text">{selectedWord.definition}</p>

                  <div className="space-y-3 p-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Examples</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actionWordId === selectedWord.id}
                        className="border-white/15 bg-white/6 hover:bg-white/14"
                        onClick={() => void generateExamplesForWord(selectedWord)}
                      >
                        <RefreshCcw className="mr-1.5 size-3.5" />
                        Generate
                      </Button>
                    </div>

                    {selectedWord.examples && selectedWord.examples.length > 0 ? (
                      <div className="space-y-1.5">
                        {selectedWord.examples.map((example, index) => (
                          <p key={`${example}-${index}`} className="word-sub text-base leading-relaxed text-muted-foreground/95">
                            {example}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="subtle-caption">No examples yet. Generate examples for this word.</p>
                    )}
                  </div>

                  <p className="detail-note">Added {formatDate(selectedWord.dateAdded)} from {selectedWord.language} collection.</p>
                  {exampleError ? <p className="subtle-caption text-destructive">{exampleError}</p> : null}
                </div>

                {mode === "inbox" ? (
                  <>
                    <div className="ghost-divider" />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="serif-display text-4xl">Inbox Suggestions</h3>
                        <div className="flex items-center gap-2">
                          <span className="subtle-caption">{todayKey}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/14 bg-white/7 hover:bg-white/14"
                            onClick={() => setSuggestionsRevision((prev) => prev + 1)}
                          >
                            New Suggestions
                          </Button>
                        </div>
                      </div>
                      <p className="subtle-caption">
                        Daily suggestions based on your current vocabulary trends.
                      </p>
                      {dailySuggestions.length === 0 ? (
                        <div className="frost-panel-soft p-3 text-sm text-muted-foreground">
                          No remaining suggestions for today.
                          {appliedDailyWords.length > 0 ? ` Added today: ${appliedDailyWords.join(", ")}.` : ""}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dailySuggestions.map((suggestion) => (
                            <div key={suggestion.word} className="frost-panel-soft space-y-2 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="serif-display text-3xl leading-[0.95]">{suggestion.word}</p>
                                  <p className="subtle-caption">{suggestion.language}</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-white/14 bg-white/7 hover:bg-white/14"
                                    onClick={() => void addDailySuggestion(suggestion)}
                                  >
                                    Add to Words
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setDismissingSuggestionWord(suggestion.word);
                                      dismissDailySuggestion(suggestion);
                                    }}
                                  >
                                    {dismissingSuggestionWord === suggestion.word ? "..." : "Dismiss"}
                                  </Button>
                                </div>
                              </div>
                              <p className="word-sub">{suggestion.definition}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {suggestion.tags.map((tag) => <span key={`${suggestion.word}-${tag}`} className="lexi-chip">{tag}</span>)}
                              </div>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/14 bg-white/7 hover:bg-white/14"
                            onClick={() => void Promise.all(dailySuggestions.map(async (suggestion) => addDailySuggestion(suggestion)))}
                          >
                            Add All Suggestions
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                ) : null}

                <div className="ghost-divider" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="serif-display text-4xl">Groups</h3>
                    <FolderPlus className="size-4 text-muted-foreground" />
                  </div>

                  {selectedWordGroups.length === 0 ? (
                    <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No group assigned yet. Right-click the word to manage groups.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedWordGroups.map((group) => <span key={group.id} className="lexi-chip">{group.name}</span>)}
                    </div>
                  )}
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
                {mode === "inbox" ? (
                  <div className="w-full max-w-xl space-y-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="section-title text-center">Inbox Suggestions</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-white/14 bg-white/7 hover:bg-white/14"
                        onClick={() => setSuggestionsRevision((prev) => prev + 1)}
                      >
                        New Suggestions
                      </Button>
                    </div>
                    <p className="subtle-caption text-center">Daily suggestions based on your current vocabulary history.</p>
                    {dailySuggestions.length === 0 ? (
                      <div className="frost-panel-soft p-3 text-sm text-muted-foreground">
                        No remaining suggestions for today.
                        {appliedDailyWords.length > 0 ? ` Added today: ${appliedDailyWords.join(", ")}.` : ""}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dailySuggestions.map((suggestion) => (
                          <div key={suggestion.word} className="frost-panel-soft space-y-2 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="serif-display text-3xl leading-[0.95]">{suggestion.word}</p>
                                <p className="subtle-caption">{suggestion.language}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-white/14 bg-white/7 hover:bg-white/14"
                                onClick={() => void addDailySuggestion(suggestion)}
                              >
                                Add to Words
                              </Button>
                            </div>
                            <p className="word-sub">{suggestion.definition}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="section-title">Choose a word</p>
                    <p className="subtle-caption mt-2 max-w-sm">Select an entry to inspect definitions, context examples, and translation links.</p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><Sparkles className="size-3" />Context-aware definitions</span>
            <span className="sync-pill"><CircleDot className="size-3" />Synced, just now</span>
          </div>
        </section>
      </div>

      {contextMenu ? (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="absolute w-64 rounded-md border border-white/15 bg-black/85 p-1 shadow-xl backdrop-blur-md"
            style={{
              left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 272)),
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 360)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
              onClick={() => {
                setSelectedWordId(contextMenu.word.id);
                setContextMenu(null);
              }}
            >
              <Search className="size-4" />
              Open details
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
              onClick={() => {
                void generateExamplesForWord(contextMenu.word);
                setContextMenu(null);
              }}
            >
              <RefreshCcw className="size-4" />
              Generate examples
            </button>

            <div className="my-1 h-px bg-white/10" />
            <p className="px-2 py-1 text-xs text-muted-foreground">Status</p>
            {(["New", "Learning", "Mastered"] as ReviewStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
                onClick={() => {
                  void updateWord(contextMenu.word.id, { tags: setReviewStatus(contextMenu.word.tags, status) });
                  setContextMenu(null);
                }}
              >
                <Check className={cn("size-4", getReviewStatus(contextMenu.word) !== status && "opacity-0")} />
                {status}
              </button>
            ))}

            <div className="my-1 h-px bg-white/10" />
            <p className="px-2 py-1 text-xs text-muted-foreground">Groups</p>
            {groups.length === 0 ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
                onClick={() => {
                  void createGroupAndAssign(contextMenu.word);
                  setContextMenu(null);
                }}
              >
                <FolderPlus className="size-4" />
                Create first group
              </button>
            ) : (
              groups.map((group) => {
                const assigned = (contextMenu.word.groupIds || []).includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
                    onClick={() => {
                      void toggleWordGroup(contextMenu.word, group.id);
                      setContextMenu(null);
                    }}
                  >
                    <Check className={cn("size-4", !assigned && "opacity-0")} />
                    {group.name}
                  </button>
                );
              })
            )}
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
              onClick={() => {
                void createGroupAndAssign(contextMenu.word);
                setContextMenu(null);
              }}
            >
              <FolderPlus className="size-4" />
              Create group and add
            </button>

            <div className="my-1 h-px bg-white/10" />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-200 hover:bg-red-400/10"
              onClick={() => {
                requestDelete(contextMenu.word);
                setContextMenu(null);
              }}
            >
              <Trash2 className="size-4" />
              Delete word
            </button>
          </div>
        </div>
      ) : null}

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
