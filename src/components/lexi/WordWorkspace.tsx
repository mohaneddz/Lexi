import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleDot,
  Copy,
  FolderPlus,
  Grid2x2,
  Languages,
  LayoutGrid,
  List,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  ZoomIn,
} from "lucide-react";

import { AddWordDialog } from "@/components/AddWordDialog";
import { GroupBadge } from "@/components/lexi/GroupBadge";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAI } from "@/hooks/useAI";
import { useGroups } from "@/hooks/useGroups";
import { useSurfaceViewPreference } from "@/hooks/useSurfaceViewPreference";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cardMinWidthFor, nextSurfaceZoomStep } from "@/lib/surface-view";
import { cn } from "@/lib/utils";
import type { ViewMode, Word } from "@/types";
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
type ActionMenuState = {
  word: Word;
  x: number;
  y: number;
};
const ACTION_MENU_WIDTH = 272;
const ACTION_MENU_HEIGHT = 380;
const ACTION_MENU_GAP = 4;

type DailySuggestion = {
  word: string;
  definition: string;
  language: string;
  tags: string[];
};

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Recent", value: "recent" },
  { label: "Oldest", value: "oldest" },
  { label: "A-Z", value: "az" },
  { label: "Z-A", value: "za" },
  { label: "By Status", value: "status" },
  { label: "By Language", value: "language" },
];

const VIEW_OPTIONS: Array<{ label: string; value: ViewMode; icon: typeof List }> = [
  { label: "List", value: "list", icon: List },
  { label: "Grid", value: "grid", icon: LayoutGrid },
  { label: "Tiles", value: "tiles", icon: Grid2x2 },
];

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

  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
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
  return ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId];
}

export function WordWorkspace({ mode }: WordWorkspaceProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const capturePath = mode === "inbox" ? "/inbox" : "/words";

  const { words, addWord, deleteWord, updateWord, loading } = useWords();
  const { translations } = useTranslations();
  const { groups, addGroup } = useGroups();
  const { getExamples } = useAI();
  const { viewMode, setViewMode, zoom, setZoom, stepZoom, canZoom } = useSurfaceViewPreference(mode, "list", 100);

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
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [actionWordId, setActionWordId] = useState<string | null>(null);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [dailySuggestions, setDailySuggestions] = useState<DailySuggestion[]>([]);
  const [appliedDailyWords, setAppliedDailyWords] = useState<string[]>([]);
  const [dismissingSuggestionWord, setDismissingSuggestionWord] = useState<string | null>(null);
  const [suggestionsRevision, setSuggestionsRevision] = useState(0);

  const availableLanguages = useMemo(() => ["All", ...Array.from(new Set(words.map((w) => w.language))).sort((a, b) => a.localeCompare(b))], [words]);
  const availableTags = useMemo(() => Array.from(new Set(words.flatMap((w) => w.tags))).sort((a, b) => a.localeCompare(b)), [words]);
  const todayKey = useMemo(() => dayKey(Date.now()), []);
  const suggestionScopeKey = groupFilterId === "none" ? "global" : `group:${groupFilterId}`;

  useEffect(() => {
    if (mode !== "inbox") {
      return;
    }

    const appliedKey = `lexi:inbox:daily-applied:${todayKey}:${suggestionScopeKey}`;
    const dismissedKey = `lexi:inbox:daily-dismissed:${todayKey}:${suggestionScopeKey}`;
    const generatedKey = `lexi:inbox:daily-generated:${todayKey}:${suggestionScopeKey}`;

    const scopedWords = groupFilterId === "none" ? words : words.filter((word) => (word.groupIds || []).includes(groupFilterId));
    const scopedTranslations = groupFilterId === "none" ? translations : translations.filter((entry) => (entry.groupIds || []).includes(groupFilterId));
    const existingWords = new Set(words.map((word) => word.word.trim().toLowerCase()));

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
    if (knownLanguages.size === 0) {
      knownLanguages.add("English");
      languageWeights.set("English", 1);
    }

    const tagWeights = new Map<string, number>();
    const addTagWeight = (tag: string, weight: number) => {
      const key = tag.trim().toLowerCase();
      if (!key) return;
      tagWeights.set(key, (tagWeights.get(key) || 0) + weight);
    };

    for (const word of words) for (const tag of word.tags || []) addTagWeight(tag, 1);
    for (const word of scopedWords) for (const tag of word.tags || []) addTagWeight(tag, 2);

    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)).map((item) => item.toLowerCase()));
    const applied = parseJsonArray(window.localStorage.getItem(appliedKey));
    setAppliedDailyWords(applied);

    const persisted = suggestionsRevision === 0 ? parseJsonArray(window.localStorage.getItem(generatedKey)) : [];
    if (persisted.length > 0) {
      const persistedSet = new Set(persisted.map((item) => item.toLowerCase()));
      setDailySuggestions(
        DAILY_SUGGESTION_BANK.filter(
          (entry) =>
            persistedSet.has(entry.word.toLowerCase()) &&
            !existingWords.has(entry.word.toLowerCase()) &&
            !dismissed.has(entry.word.toLowerCase()) &&
            knownLanguages.has(entry.language),
        ),
      );
      return;
    }

    const rankedCandidates = DAILY_SUGGESTION_BANK
      .filter((entry) => !existingWords.has(entry.word.toLowerCase()) && !dismissed.has(entry.word.toLowerCase()) && knownLanguages.has(entry.language))
      .sort((a, b) => {
        const aLanguageScore = languageWeights.get(a.language) || 0;
        const bLanguageScore = languageWeights.get(b.language) || 0;
        const aTagScore = a.tags.reduce((score, tag) => score + (tagWeights.get(tag.toLowerCase()) || 0), 0);
        const bTagScore = b.tags.reduce((score, tag) => score + (tagWeights.get(tag.toLowerCase()) || 0), 0);
        return (bLanguageScore + bTagScore) - (aLanguageScore + aTagScore) || a.word.localeCompare(b.word);
      });

    const ranked = shuffleArray(rankedCandidates.slice(0, 8)).slice(0, 4);
    setDailySuggestions(ranked);
    window.localStorage.setItem(generatedKey, JSON.stringify(ranked.map((item) => item.word)));
  }, [groupFilterId, mode, suggestionScopeKey, suggestionsRevision, todayKey, translations, words]);

  useEffect(() => {
    void getSettings().then((settings) => setShowDeleteConfirmation(settings.showDeleteConfirmation));
    const onSettingsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ showDeleteConfirmation?: boolean }>;
      if (typeof custom.detail?.showDeleteConfirmation === "boolean") {
        setShowDeleteConfirmation(custom.detail.showDeleteConfirmation);
      }
    };
    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

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
    const map = new Map<string, Word[]>();
    for (const word of filteredWords) {
      const key = groupKey(word, groupMode);
      const arr = map.get(key) || [];
      arr.push(word);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }));
  }, [filteredWords, groupMode]);

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
      if (custom.detail?.path === capturePath) setAddDialogOpen(true);
    };

    const onSearchFocus = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string }>;
      if (custom.detail?.path === capturePath) searchInputRef.current?.focus();
    };

    const onGroupFilterChanged = (event: Event) => {
      const custom = event as CustomEvent<{ groupId?: string }>;
      if (custom.detail?.groupId !== undefined) setGroupFilterId(custom.detail.groupId);
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
        setSelectedWordId(filteredWords[Math.min(filteredWords.length - 1, currentIndex + 1)].id);
      }

      if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedWordId(filteredWords[Math.max(0, currentIndex - 1)].id);
      }

      if (["1", "2", "3"].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        const status = event.key === "1" ? "New" : event.key === "2" ? "Learning" : "Mastered";
        void updateWord(filteredWords[currentIndex].id, { tags: setReviewStatus(filteredWords[currentIndex].tags, status) });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredWords, selectedWordId, updateWord]);

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionMenu]);

  useEffect(() => {
    setSelectedWordIds((current) => current.filter((id) => words.some((word) => word.id === id)));
  }, [words]);

  useEffect(() => {
    if (bulkMode && selectedWordIds.length === 0) {
      setBulkMode(false);
    }
  }, [bulkMode, selectedWordIds.length]);

  const selectedWord = useMemo(() => filteredWords.find((word) => word.id === selectedWordId) ?? null, [filteredWords, selectedWordId]);
  const selectedWordGroups = useMemo(() => {
    if (!selectedWord) return [];
    const ids = selectedWord.groupIds || [];
    return groups.filter((group) => ids.includes(group.id));
  }, [groups, selectedWord]);
  const relatedTranslations = useMemo(() => {
    if (!selectedWord) return [];
    const normalized = selectedWord.word.toLowerCase();
    return translations.filter((t) => t.sourceWord.toLowerCase() === normalized || t.targetWord.toLowerCase() === normalized).slice(0, 6);
  }, [selectedWord, translations]);

  const openActionMenu = (word: Word, x: number, y: number) => {
    const nextX = Math.max(8, Math.min(x + ACTION_MENU_GAP, window.innerWidth - ACTION_MENU_WIDTH));
    const nextY = Math.max(8, Math.min(y + ACTION_MENU_GAP, window.innerHeight - ACTION_MENU_HEIGHT));
    setSelectedWordId(word.id);
    setActionMenu({ word, x: nextX, y: nextY });
  };

  const handleCopyWord = async (word: Word) => {
    setActionWordId(word.id);
    try {
      await navigator.clipboard.writeText(`${word.word}: ${word.definition}`);
    } finally {
      setActionWordId(null);
    }
  };

  const generateExamplesForWord = async (word: Word) => {
    setActionWordId(word.id);
    setExampleError(null);
    try {
      const response = await getExamples(word.word, word.language);
      await updateWord(word.id, { examples: response.data.slice(0, 4) });
    } catch (error) {
      setExampleError(error instanceof Error ? error.message : "Failed to generate examples.");
    } finally {
      setActionWordId(null);
    }
  };

  const handleSaveEdit = async (id: string, updates: Partial<Word>) => {
    await updateWord(id, updates);
    setEditDialogOpen(false);
    setEditingWord(null);
  };

  const toggleWordGroup = async (word: Word, groupId: string) => {
    await updateWord(word.id, { groupIds: toggleGroupMembership(word.groupIds || [], groupId) });
  };

  const createGroupAndAssign = async (word: Word) => {
    const name = window.prompt("New group name");
    if (!name || !name.trim()) return;
    const group = await addGroup({ name: name.trim(), iconName: "Folder" });
    const nextGroupIds = Array.from(new Set([...(word.groupIds || []), group.id]));
    await updateWord(word.id, { groupIds: nextGroupIds });
  };

  const enterBulkMode = (wordId: string) => {
    setBulkMode(true);
    setSelectedWordIds((current) => (current.includes(wordId) ? current : [wordId, ...current]));
  };

  const toggleBulkWord = (wordId: string) => {
    setSelectedWordIds((current) => (current.includes(wordId) ? current.filter((id) => id !== wordId) : [...current, wordId]));
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedWordIds([]);
  };

  const selectAllVisible = () => setSelectedWordIds(filteredWords.map((word) => word.id));

  const requestDelete = (word: Word) => {
    if (!showDeleteConfirmation) {
      void handleDeleteWord(word, false);
      return;
    }
    setDeletingWord(word);
    setDeleteDialogOpen(true);
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
      if (selectedWordId === word.id) setSelectedWordId(null);
    } finally {
      setActionWordId(null);
      setDeletingWord(null);
      setDeleteDialogOpen(false);
    }
  };

  const requestBulkDelete = () => {
    if (selectedWordIds.length === 0) return;
    if (!showDeleteConfirmation) {
      void handleBulkDelete(false);
      return;
    }
    setBulkDeletePending(true);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = async (disableConfirmation: boolean) => {
    if (selectedWordIds.length === 0) return;
    try {
      if (disableConfirmation) {
        await updateSettings({ showDeleteConfirmation: false });
        setShowDeleteConfirmation(false);
        window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { showDeleteConfirmation: false } }));
      }

      await Promise.all(selectedWordIds.map(async (id) => deleteWord(id)));
      setSelectedWordId(null);
      exitBulkMode();
    } finally {
      setBulkDeletePending(false);
      setDeleteDialogOpen(false);
    }
  };

  const bulkAssignGroup = async (groupId: string) => {
    const selectedMap = new Map(words.map((word) => [word.id, word]));
    await Promise.all(selectedWordIds.map(async (id) => {
      const word = selectedMap.get(id);
      if (!word) return;
      const next = Array.from(new Set([...(word.groupIds || []), groupId]));
      await updateWord(id, { groupIds: next });
    }));
  };

  const bulkClearGroups = async () => {
    await Promise.all(selectedWordIds.map(async (id) => updateWord(id, { groupIds: [] })));
  };

  const bulkSetStatus = async (status: ReviewStatus) => {
    const selectedMap = new Map(words.map((word) => [word.id, word]));
    await Promise.all(selectedWordIds.map(async (id) => {
      const word = selectedMap.get(id);
      if (!word) return;
      await updateWord(id, { tags: setReviewStatus(word.tags, status) });
    }));
  };

  const addDailySuggestion = async (suggestion: DailySuggestion) => {
    const appliedKey = `lexi:inbox:daily-applied:${todayKey}:${suggestionScopeKey}`;
    await addWord({
      word: suggestion.word,
      definition: suggestion.definition,
      language: suggestion.language,
      tags: suggestion.tags,
      aiGenerated: false,
      groupIds: groupFilterId !== "none" ? [groupFilterId] : [],
      examples: [],
    });
    const nextApplied = [...new Set([...appliedDailyWords, suggestion.word])];
    setAppliedDailyWords(nextApplied);
    window.localStorage.setItem(appliedKey, JSON.stringify(nextApplied));
    setDailySuggestions((current) => current.filter((entry) => entry.word !== suggestion.word));
  };

  const dismissDailySuggestion = (suggestion: DailySuggestion) => {
    const dismissedKey = `lexi:inbox:daily-dismissed:${todayKey}:${suggestionScopeKey}`;
    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)));
    dismissed.add(suggestion.word);
    window.localStorage.setItem(dismissedKey, JSON.stringify(Array.from(dismissed)));
    setDailySuggestions((current) => current.filter((entry) => entry.word !== suggestion.word));
    setDismissingSuggestionWord(null);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== (mode === "inbox" ? "New" : "All")) count += 1;
    if (languageFilter !== "All") count += 1;
    if (sourceFilter !== "All") count += 1;
    if (selectedTags.length > 0) count += 1;
    if (groupFilterId !== "none") count += 1;
    return count;
  }, [groupFilterId, languageFilter, mode, selectedTags.length, sourceFilter, statusFilter]);

  const clearAllFilters = () => {
    setQuery("");
    setStatusFilter(mode === "inbox" ? "New" : "All");
    setLanguageFilter("All");
    setSourceFilter("All");
    setSelectedTags([]);
    setGroupFilterId("none");
    setGroupMode("none");
  };

  const contentGridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidthFor(viewMode, zoom)}px, 1fr))`,
  };

  const renderListRow = (word: Word) => (
      <div
      key={word.id}
      className={cn(
        "word-row",
        bulkMode ? "grid-cols-[28px_minmax(0,1.35fr)_108px_26px]" : "grid-cols-[minmax(0,1.35fr)_108px_26px]",
        selectedWordId === word.id && "word-row-active",
      )}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (bulkMode) {
          toggleBulkWord(word.id);
          return;
        }
        setSelectedWordId(word.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openActionMenu(word, event.clientX, event.clientY);
      }}
    >
      {bulkMode ? (
        <div className="flex items-center">
          <input type="checkbox" checked={selectedWordIds.includes(word.id)} onChange={() => toggleBulkWord(word.id)} onClick={(event) => event.stopPropagation()} className="size-4 accent-white" />
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="serif-display truncate text-[1.6rem] leading-[0.95]">{word.word}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="lexi-chip">{word.language}</span>
        </div>
        <p className="word-sub mt-1.5 text-sm">{truncateText(word.definition, 95)}</p>
      </div>
      <span className={cn("status-pill", getReviewStatus(word) === "Mastered" ? "status-mastered" : getReviewStatus(word) === "Learning" ? "status-learning" : "status-new")}>{getReviewStatus(word)}</span>
      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={(event) => { event.stopPropagation(); openActionMenu(word, event.clientX, event.clientY); }}>
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );

  const renderCard = (word: Word) => (
    <article
      key={word.id}
      className={cn("lexi-browser-card", viewMode === "tiles" && "tile", selectedWordId === word.id && "active")}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (bulkMode) {
          toggleBulkWord(word.id);
          return;
        }
        setSelectedWordId(word.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openActionMenu(word, event.clientX, event.clientY);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="serif-display text-[2rem] leading-[0.92]">{word.word}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="lexi-chip">{word.language}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bulkMode ? <input type="checkbox" checked={selectedWordIds.includes(word.id)} onChange={() => toggleBulkWord(word.id)} onClick={(event) => event.stopPropagation()} className="size-4 accent-white" /> : null}
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={(event) => { event.stopPropagation(); openActionMenu(word, event.clientX, event.clientY); }}>
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>
      <p className={cn("word-sub mt-3", viewMode === "tiles" ? "line-clamp-5" : "line-clamp-4")}>{word.definition}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        <div className="flex flex-wrap gap-2">
          {(word.groupIds || []).slice(0, 2).map((groupId) => {
            const group = groups.find((entry) => entry.id === groupId);
            return group ? <GroupBadge key={group.id} group={group} className="max-w-full" /> : null;
          })}
        </div>
        <span className={cn("status-pill ml-auto", getReviewStatus(word) === "Mastered" ? "status-mastered" : getReviewStatus(word) === "Learning" ? "status-learning" : "status-new")}>{getReviewStatus(word)}</span>
      </div>
    </article>
  );

  return (
    <>
      <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.18fr_1fr]">
        <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
            <div className="search-field-wrap min-w-[170px] flex-[1_1_250px] sm:min-w-[220px] sm:flex-[1_1_340px]">
              <Search className="search-field-icon" />
              <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} className="frost-input search-field-input" placeholder={mode === "inbox" ? "Search inbox words" : "Search words"} />
            </div>

            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="frost-input toolbar-select max-[520px]:max-w-none max-[520px]:flex-1">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            <div className="flex items-center rounded-lg border border-white/12 bg-white/6 p-1">
              {VIEW_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button key={option.value} type="button" className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm", viewMode === option.value && "bg-white/14")} onClick={() => void setViewMode(option.value)}>
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <DropdownMenu open={filtersOpen} onOpenChange={setFiltersOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14">
                  <SlidersHorizontal className="mr-2 size-4" />
                  <span className="hidden min-[520px]:inline">Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenudiv>Status</DropdownMenudiv>
                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  {(["All", "New", "Learning", "Mastered"] as StatusFilter[]).map((status) => <DropdownMenuRadioItem key={status} value={status}>{status}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Language</DropdownMenudiv>
                <DropdownMenuRadioGroup value={languageFilter} onValueChange={setLanguageFilter}>
                  {availableLanguages.map((language) => <DropdownMenuRadioItem key={language} value={language}>{language}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Source</DropdownMenudiv>
                <DropdownMenuRadioGroup value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
                  {(["All", "AI", "Manual"] as SourceFilter[]).map((source) => <DropdownMenuRadioItem key={source} value={source}>{source}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                {availableTags.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenudiv>Tags</DropdownMenudiv>
                    {availableTags.map((tag) => (
                      <DropdownMenuCheckboxItem key={tag} checked={selectedTags.includes(tag)} onCheckedChange={() => setSelectedTags((current) => current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag])}>
                        {tag}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenudiv>Grouping</DropdownMenudiv>
                <DropdownMenuRadioGroup value={groupMode} onValueChange={(value) => setGroupMode(value as GroupMode)}>
                  <DropdownMenuRadioItem value="none">No Grouping</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="status">By Status</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="language">By Language</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="alphabet">A-Z</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>Clear filters</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {bulkMode ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
              <span className="sync-pill">{selectedWordIds.length} selected</span>
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={selectAllVisible}>Select visible</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14">Groups</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {groups.map((group) => <DropdownMenuItem key={group.id} onSelect={() => void bulkAssignGroup(group.id)}>{group.name}</DropdownMenuItem>)}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void bulkClearGroups()}>Remove from all groups</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14">Status</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {(["New", "Learning", "Mastered"] as ReviewStatus[]).map((status) => (
                    <DropdownMenuItem key={status} onSelect={() => void bulkSetStatus(status)}>Set {status}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={exitBulkMode}>Exit</Button>
              <Button type="button" size="sm" variant="destructive" onClick={requestBulkDelete}>Delete</Button>
            </div>
          ) : null}

          {viewMode === "list" ? (
            <div className={cn("table-head", bulkMode ? "grid-cols-[28px_minmax(0,1.35fr)_108px_26px]" : "grid-cols-[minmax(0,1.35fr)_108px_26px]")}>
              <span>Word</span>
              <span>Status</span>
              <span />
            </div>
          ) : null}

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => {
            if (!(event.ctrlKey || event.metaKey) || !canZoom) return;
            event.preventDefault();
            void setZoom(nextSurfaceZoomStep(zoom, event.deltaY < 0 ? "in" : "out"));
          }}>
            {loading ? (
              <div className="space-y-2 p-3">{[1, 2, 3, 4].map((index) => <div key={index} className="h-16 rounded-lg bg-white/6" />)}</div>
            ) : filteredWords.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                <p className="section-title">No entries</p>
                <p className="subtle-caption mt-2 max-w-sm px-4">{mode === "inbox" ? "No inbox entries match the current filters." : "Capture words first to build your collection."}</p>
              </div>
            ) : viewMode === "list" ? (
              groupedWords.map((group) => (
                <div key={group.key}>
                  {groupMode !== "none" ? <div className="sticky top-0 z-10 flex items-center justify-between border-y border-white/8 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md"><span>{group.key}</span><span>{group.items.length}</span></div> : null}
                  {group.items.map(renderListRow)}
                </div>
              ))
            ) : (
              <div className="space-y-4 p-3">
                {groupedWords.map((group) => (
                  <div key={group.key} className="space-y-3">
                    {groupMode !== "none" ? <div className="flex items-center justify-between px-1"><p className="font-medium">{group.key}</p><span className="subtle-caption">{group.items.length}</span></div> : null}
                    <div className="grid gap-3" style={contentGridStyle}>{group.items.map(renderCard)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/10 p-2">
            <span className="sync-pill"><CircleDot className="size-3" />Synced, just now</span>
            {canZoom ? (
              <div className="flex items-center gap-2">
                <ZoomIn className="size-4 text-muted-foreground" />
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => void stepZoom("out")} aria-label="Zoom out">
                  <Minus className="size-4" />
                </button>
                <span className="sync-pill min-w-[4.25rem] justify-center">{zoom}%</span>
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => void stepZoom("in")} aria-label="Zoom in">
                  <Plus className="size-4" />
                </button>
              </div>
            ) : (
              <span className="subtle-caption">Shortcuts: `J/K` move, `1-3` status</span>
            )}
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
                      <Button type="button" variant="outline" size="sm" disabled={actionWordId === selectedWord.id} className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => void generateExamplesForWord(selectedWord)}>
                        <RefreshCcw className="mr-1.5 size-3.5" />
                        Generate
                      </Button>
                    </div>
                    {selectedWord.examples && selectedWord.examples.length > 0 ? (
                      <div className="space-y-1.5">
                        {selectedWord.examples.map((example, index) => <p key={`${example}-${index}`} className="word-sub text-base leading-relaxed text-muted-foreground/95">{example}</p>)}
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
                          <Button type="button" variant="outline" size="sm" className="border-white/14 bg-white/7 hover:bg-white/14" onClick={() => setSuggestionsRevision((prev) => prev + 1)}>New Suggestions</Button>
                        </div>
                      </div>
                      <p className="subtle-caption">Daily suggestions based on your current vocabulary trends.</p>
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
                                  <Button type="button" size="sm" variant="outline" className="border-white/14 bg-white/7 hover:bg-white/14" onClick={() => void addDailySuggestion(suggestion)}>Add to Words</Button>
                                  <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => { setDismissingSuggestionWord(suggestion.word); dismissDailySuggestion(suggestion); }}>
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
                    <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No group assigned yet. Open the action menu to manage groups.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">{selectedWordGroups.map((group) => <GroupBadge key={group.id} group={group} />)}</div>
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
                <p className="section-title">{mode === "inbox" ? "Inbox" : "Choose a word"}</p>
                <p className="subtle-caption mt-2 max-w-sm">Select an entry to inspect definitions, examples, and translation links.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><Sparkles className="size-3" />Context-aware definitions</span>
            <span className="sync-pill"><CircleDot className="size-3" />Synced, just now</span>
          </div>
        </section>
      </div>

      {actionMenu ? (
        <div className="fixed inset-0 z-[70]" onClick={() => setActionMenu(null)} onContextMenu={(event) => { event.preventDefault(); setActionMenu(null); }}>
          <div
            className="absolute w-64 rounded-md border border-white/15 bg-black/85 p-1 shadow-xl backdrop-blur-md"
            style={{ left: actionMenu.x, top: actionMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="menu-action" onClick={() => { setSelectedWordId(actionMenu.word.id); setActionMenu(null); }}><Search className="size-4" />Open details</button>
            <button type="button" className="menu-action" onClick={() => { setEditingWord(actionMenu.word); setEditDialogOpen(true); setActionMenu(null); }}><Pencil className="size-4" />Edit word</button>
            <button type="button" className="menu-action" onClick={() => { void handleCopyWord(actionMenu.word); setActionMenu(null); }}><Copy className="size-4" />Copy word</button>
            <button type="button" className="menu-action" onClick={() => { enterBulkMode(actionMenu.word.id); setActionMenu(null); }}><Check className="size-4" />Start multi-select</button>
            <div className="my-1 h-px bg-white/10" />
            <p className="menu-section-label">Status</p>
            {(["New", "Learning", "Mastered"] as ReviewStatus[]).map((status) => (
              <button key={status} type="button" className="menu-action" onClick={() => { void updateWord(actionMenu.word.id, { tags: setReviewStatus(actionMenu.word.tags, status) }); setActionMenu(null); }}>
                <Check className={cn("size-4", getReviewStatus(actionMenu.word) !== status && "opacity-0")} />
                {status}
              </button>
            ))}
            <div className="my-1 h-px bg-white/10" />
            <p className="menu-section-label">Groups</p>
            {groups.length === 0 ? (
              <button type="button" className="menu-action" onClick={() => { void createGroupAndAssign(actionMenu.word); setActionMenu(null); }}><FolderPlus className="size-4" />Create first group</button>
            ) : (
              groups.map((group) => {
                const assigned = (actionMenu.word.groupIds || []).includes(group.id);
                return (
                  <button key={group.id} type="button" className="menu-action" onClick={() => { void toggleWordGroup(actionMenu.word, group.id); setActionMenu(null); }}>
                    <Check className={cn("size-4", !assigned && "opacity-0")} />
                    <GroupBadge group={group} />
                  </button>
                );
              })
            )}
            <button type="button" className="menu-action" onClick={() => { void createGroupAndAssign(actionMenu.word); setActionMenu(null); }}><FolderPlus className="size-4" />Create group and add</button>
            {(actionMenu.word.groupIds || []).length > 0 ? <button type="button" className="menu-action" onClick={() => { void updateWord(actionMenu.word.id, { groupIds: [] }); setActionMenu(null); }}><Trash2 className="size-4" />Remove from all groups</button> : null}
            <div className="my-1 h-px bg-white/10" />
            <button type="button" className="menu-action" onClick={() => { void generateExamplesForWord(actionMenu.word); setActionMenu(null); }}><RefreshCcw className="size-4" />Generate examples</button>
            <button type="button" className="menu-action destructive" onClick={() => { requestDelete(actionMenu.word); setActionMenu(null); }}><Trash2 className="size-4" />Delete word</button>
          </div>
        </div>
      ) : null}

      <AddWordDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={addWord} />
      <EditWordDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} word={editingWord} onSave={handleSaveEdit} />
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) { setDeletingWord(null); setBulkDeletePending(false); } }}
        title="Delete Word?"
        description={bulkDeletePending ? `Delete ${selectedWordIds.length} selected words? This cannot be undone.` : deletingWord ? `Delete "${deletingWord.word}"? This cannot be undone.` : "Delete this word?"}
        onConfirm={(skipNextTime) => {
          if (bulkDeletePending) {
            void handleBulkDelete(skipNextTime);
            return;
          }
          if (deletingWord) {
            void handleDeleteWord(deletingWord, skipNextTime);
          }
        }}
      />
    </>
  );
}
