import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  FolderPlus,
  Grid2x2,
  Languages,
  LayoutGrid,
  List,
  Loader2,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  WandSparkles,
  ZoomIn,
} from "lucide-react";

import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { EditTranslationDialog } from "@/components/EditTranslationDialog";
import { TextPromptDialog } from "@/components/TextPromptDialog";
import { GroupBadge } from "@/components/lexi/GroupBadge";
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
import { useGroups } from "@/hooks/useGroups";
import { useSurfaceViewPreference } from "@/hooks/useSurfaceViewPreference";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cardMinWidthFor } from "@/lib/surface-view";
import { cn } from "@/lib/utils";
import type { Translation, ViewMode } from "@/types";
import type { RelatedTranslationSuggestion } from "@/utils/ai-service";
import { formatDate } from "@/utils/formatters";
import { resolveGroupAssignment } from "@/utils/group-assignment";
import { getSettings, readAiCacheEntry, updateSettings, writeAiCache } from "@/utils/storage";
import { parseJsonArray, translationFingerprint } from "@/utils/suggestions";

function suggestionKey(suggestion: RelatedTranslationSuggestion): string {
  return `${suggestion.sourceWord.trim().toLowerCase()}::${suggestion.targetWord.trim().toLowerCase()}`;
}

type SortMode = "recent" | "oldest" | "source" | "target" | "sourceLang" | "targetLang";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "oldest", label: "Oldest" },
  { value: "source", label: "Source A to Z" },
  { value: "target", label: "Target A to Z" },
  { value: "sourceLang", label: "Source language" },
  { value: "targetLang", label: "Target language" },
];
type GroupMode = "none" | "sourceLang" | "targetLang" | "pair";
type SourceFilter = "All" | "AI" | "Manual";
type ActionMenuState = {
  translation: Translation;
  x: number;
  y: number;
};
const ACTION_MENU_WIDTH = 272;
const ACTION_MENU_HEIGHT = 340;
const ACTION_MENU_GAP = 4;
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

export default function Translations() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTranslation, setEditingTranslation] = useState<Translation | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTranslation, setDeletingTranslation] = useState<Translation | null>(null);

  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);
  const [newGroupTarget, setNewGroupTarget] = useState<Translation | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(4);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [translationSuggestions, setTranslationSuggestions] = useState<RelatedTranslationSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [addingSuggestionKey, setAddingSuggestionKey] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedTranslationIds, setSelectedTranslationIds] = useState<string[]>([]);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [sourceExampleVersion, setSourceExampleVersion] = useState(0);
  const [targetExampleVersion, setTargetExampleVersion] = useState(0);
  const [generatingExamples, setGeneratingExamples] = useState(false);
  const [copiedExample, setCopiedExample] = useState(false);
  const [othersGroupEnabled, setOthersGroupEnabled] = useState(true);
  const [autoGroupingId, setAutoGroupingId] = useState<string | null>(null);
  const [autoGroupError, setAutoGroupError] = useState<string | null>(null);

  const { viewMode, setViewMode, zoom, stepZoom, canZoom, detailPanelOpen, toggleDetailPanel } = useSurfaceViewPreference("translations", "list", 100);
  const { translations, addTranslation, updateTranslation, deleteTranslation, loading } = useTranslations();
  const { words } = useWords();
  const { groups, addGroup } = useGroups();
  const { suggestRelatedTranslations, getExamples, suggestGroup } = useAI();

  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();
    for (const translation of translations) {
      languages.add(translation.sourceLanguage);
      languages.add(translation.targetLanguage);
    }
    return ["All", ...Array.from(languages).sort((a, b) => a.localeCompare(b))];
  }, [translations]);

  const filteredTranslations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const scoped = translations.filter((translation) => {
      const matchesLanguage = languageFilter === "All" || translation.sourceLanguage === languageFilter || translation.targetLanguage === languageFilter;
      const matchesSource = sourceFilter === "All" || (sourceFilter === "AI" && translation.aiGenerated) || (sourceFilter === "Manual" && !translation.aiGenerated);
      const matchesGroup = groupFilterId === "none" || (translation.groupIds || []).includes(groupFilterId);
      if (!matchesLanguage || !matchesSource || !matchesGroup) return false;
      if (!normalizedQuery) return true;
      return (
        translation.sourceWord.toLowerCase().includes(normalizedQuery) ||
        translation.targetWord.toLowerCase().includes(normalizedQuery) ||
        translation.sourceLanguage.toLowerCase().includes(normalizedQuery) ||
        translation.targetLanguage.toLowerCase().includes(normalizedQuery) ||
        (translation.context ?? "").toLowerCase().includes(normalizedQuery) ||
        (translation.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedQuery))
      );
    });

    const next = [...scoped];
    switch (sortMode) {
      case "oldest":
        return next.sort((a, b) => a.dateAdded - b.dateAdded);
      case "source":
        return next.sort((a, b) => a.sourceWord.localeCompare(b.sourceWord));
      case "target":
        return next.sort((a, b) => a.targetWord.localeCompare(b.targetWord));
      case "sourceLang":
        return next.sort((a, b) => a.sourceLanguage.localeCompare(b.sourceLanguage) || a.sourceWord.localeCompare(b.sourceWord));
      case "targetLang":
        return next.sort((a, b) => a.targetLanguage.localeCompare(b.targetLanguage) || a.targetWord.localeCompare(b.targetWord));
      default:
        return next.sort((a, b) => b.dateAdded - a.dateAdded);
    }
  }, [groupFilterId, languageFilter, query, sortMode, sourceFilter, translations]);

  const groupedTranslations = useMemo(() => {
    const map = new Map<string, Translation[]>();
    for (const translation of filteredTranslations) {
      const key = groupMode === "sourceLang"
        ? translation.sourceLanguage
        : groupMode === "targetLang"
          ? translation.targetLanguage
          : groupMode === "pair"
            ? `${translation.sourceLanguage} -> ${translation.targetLanguage}`
            : "All Translations";
      const arr = map.get(key) || [];
      arr.push(translation);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }));
  }, [filteredTranslations, groupMode]);

  useEffect(() => {
    if (filteredTranslations.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredTranslations.some((translation) => translation.id === selectedId)) {
      setSelectedId(filteredTranslations[0].id);
    }
  }, [filteredTranslations, selectedId]);

  useEffect(() => {
    void getSettings().then((settings) => {
      setShowDeleteConfirmation(settings.showDeleteConfirmation);
      setOthersGroupEnabled(settings.othersGroupEnabled);
      setSuggestionCount(settings.translationSuggestionCount);
    });
    const onSettingsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ showDeleteConfirmation?: boolean; othersGroupEnabled?: boolean; translationSuggestionCount?: number }>;
      if (typeof custom.detail?.translationSuggestionCount === "number") {
        setSuggestionCount(custom.detail.translationSuggestionCount);
      }
      if (typeof custom.detail?.showDeleteConfirmation === "boolean") {
        setShowDeleteConfirmation(custom.detail.showDeleteConfirmation);
      }
      if (typeof custom.detail?.othersGroupEnabled === "boolean") {
        setOthersGroupEnabled(custom.detail.othersGroupEnabled);
      }
    };
    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  useEffect(() => {
    const onGroupFilterChanged = (event: Event) => {
      const custom = event as CustomEvent<{ groupId?: string }>;
      if (typeof custom.detail?.groupId === "string") {
        setGroupFilterId(custom.detail.groupId);
      }
    };
    window.addEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    return () => window.removeEventListener("lexi:group-filter-changed", onGroupFilterChanged);
  }, []);

  useEffect(() => {
    const onSearchFocus = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path === "/translations") searchInputRef.current?.focus();
    };
    window.addEventListener("lexi:focus-search", onSearchFocus);
    return () => {
      window.removeEventListener("lexi:focus-search", onSearchFocus);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !selectedId || filteredTranslations.length === 0) return;
      const currentIndex = filteredTranslations.findIndex((translation) => translation.id === selectedId);
      if (currentIndex < 0) return;
      if (event.key.toLowerCase() === "k" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedId(filteredTranslations[Math.min(filteredTranslations.length - 1, currentIndex + 1)].id);
      }
      if (event.key.toLowerCase() === "j" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedId(filteredTranslations[Math.max(0, currentIndex - 1)].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredTranslations, selectedId]);

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

  const selectedTranslation = useMemo(() => filteredTranslations.find((translation) => translation.id === selectedId) ?? null, [filteredTranslations, selectedId]);
  const selectedTranslationGroups = useMemo(() => {
    if (!selectedTranslation) return [];
    const ids = selectedTranslation.groupIds || [];
    return groups.filter((group) => ids.includes(group.id));
  }, [groups, selectedTranslation]);
  const linkedWords = useMemo(() => {
    if (!selectedTranslation) return [];
    return words.filter((word) => {
      const normalizedWord = word.word.toLowerCase();
      return normalizedWord === selectedTranslation.sourceWord.toLowerCase() || normalizedWord === selectedTranslation.targetWord.toLowerCase();
    }).slice(0, 4);
  }, [selectedTranslation, words]);

  const selectedSourceExample = useMemo(() => {
    const examples = selectedTranslation?.sourceExamples;
    if (!examples || examples.length === 0) return "";
    return examples[sourceExampleVersion % examples.length];
  }, [selectedTranslation, sourceExampleVersion]);

  const selectedTargetExample = useMemo(() => {
    const examples = selectedTranslation?.targetExamples;
    if (!examples || examples.length === 0) return "";
    return examples[targetExampleVersion % examples.length];
  }, [selectedTranslation, targetExampleVersion]);

  useEffect(() => {
    setSourceExampleVersion(0);
    setTargetExampleVersion(0);
    setAutoGroupError(null);
  }, [selectedId]);

  const generateTranslationExamples = async () => {
    if (!selectedTranslation) return;
    setGeneratingExamples(true);
    try {
      const [sourceResult, targetResult] = await Promise.all([
        getExamples(selectedTranslation.sourceWord, selectedTranslation.sourceLanguage),
        getExamples(selectedTranslation.targetWord, selectedTranslation.targetLanguage),
      ]);

      const updates: Partial<Translation> = {};
      if (sourceResult.success && sourceResult.data.length > 0) updates.sourceExamples = sourceResult.data;
      if (targetResult.success && targetResult.data.length > 0) updates.targetExamples = targetResult.data;

      if (Object.keys(updates).length > 0) {
        await updateTranslation(selectedTranslation.id, updates);
        setSourceExampleVersion(0);
        setTargetExampleVersion(0);
      }
    } finally {
      setGeneratingExamples(false);
    }
  };

  const copyExamples = async () => {
    if (!selectedTranslation) return;
    const lines = [
      selectedSourceExample ? `${selectedTranslation.sourceLanguage}: ${selectedSourceExample}` : null,
      selectedTargetExample ? `${selectedTranslation.targetLanguage}: ${selectedTargetExample}` : null,
    ].filter((line): line is string => Boolean(line));

    if (lines.length === 0) return;
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 1800);
  };

  const autoAssignGroup = async (translation: Translation) => {
    if (groups.length === 0) return;
    setAutoGroupError(null);
    setAutoGroupingId(translation.id);
    try {
      const label = `${translation.sourceWord} -> ${translation.targetWord}`;
      const definition = translation.context?.trim() || `Translation from ${translation.sourceLanguage} to ${translation.targetLanguage}.`;
      const groupId = await resolveGroupAssignment(label, definition, groups, suggestGroup, othersGroupEnabled);

      if (!groupId) {
        setAutoGroupError("No matching group found.");
        return;
      }

      const nextGroupIds = Array.from(new Set([...(translation.groupIds || []), groupId]));
      await updateTranslation(translation.id, { groupIds: nextGroupIds });
    } finally {
      setAutoGroupingId(null);
    }
  };

  const openActionMenu = (translation: Translation, x: number, y: number) => {
    const nextX = Math.max(8, Math.min(x + ACTION_MENU_GAP, window.innerWidth - ACTION_MENU_WIDTH));
    const nextY = Math.max(8, Math.min(y + ACTION_MENU_GAP, window.innerHeight - ACTION_MENU_HEIGHT));
    setSelectedId(translation.id);
    setActionMenu({ translation, x: nextX, y: nextY });
  };

  const handleCopyTranslation = async (translation: Translation) => {
    await navigator.clipboard.writeText(`${translation.sourceWord} -> ${translation.targetWord}`);
  };

  const toggleTranslationGroup = async (translation: Translation, groupId: string) => {
    const current = translation.groupIds || [];
    const next = current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId];
    await updateTranslation(translation.id, { groupIds: next });
  };

  const createGroupAndAssign = (translation: Translation) => {
    setNewGroupTarget(translation);
  };

  const submitNewGroup = async (name: string) => {
    if (!newGroupTarget) return;
    const group = await addGroup({ name, iconName: "Folder" });
    const nextGroupIds = Array.from(new Set([...(newGroupTarget.groupIds || []), group.id]));
    await updateTranslation(newGroupTarget.id, { groupIds: nextGroupIds });
  };

  const requestDeleteTranslation = (translation: Translation) => {
    if (!showDeleteConfirmation) {
      void handleDeleteTranslation(translation, false);
      return;
    }
    setDeletingTranslation(translation);
    setDeleteDialogOpen(true);
  };

  const enterBulkMode = (translationId: string) => {
    setBulkMode(true);
    setSelectedTranslationIds((current) => (current.includes(translationId) ? current : [translationId, ...current]));
  };

  const toggleBulkTranslation = (translationId: string) => {
    setSelectedTranslationIds((current) => current.includes(translationId) ? current.filter((id) => id !== translationId) : [...current, translationId]);
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedTranslationIds([]);
  };

  const requestBulkDelete = () => {
    if (selectedTranslationIds.length === 0) return;
    if (!showDeleteConfirmation) {
      void handleBulkDelete(false);
      return;
    }
    setBulkDeletePending(true);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTranslation = async (translation: Translation, disableConfirmation: boolean) => {
    try {
      if (disableConfirmation) {
        await updateSettings({ showDeleteConfirmation: false });
        setShowDeleteConfirmation(false);
        window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { showDeleteConfirmation: false } }));
      }
      await deleteTranslation(translation.id);
    } finally {
      setDeletingTranslation(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleBulkDelete = async (disableConfirmation: boolean) => {
    if (selectedTranslationIds.length === 0) return;
    try {
      if (disableConfirmation) {
        await updateSettings({ showDeleteConfirmation: false });
        setShowDeleteConfirmation(false);
        window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { showDeleteConfirmation: false } }));
      }
      await Promise.all(selectedTranslationIds.map(async (id) => deleteTranslation(id)));
      exitBulkMode();
      setSelectedId(null);
    } finally {
      setBulkDeletePending(false);
      setDeleteDialogOpen(false);
    }
  };

  const bulkAssignGroup = async (groupId: string) => {
    const selectedMap = new Map(translations.map((translation) => [translation.id, translation]));
    await Promise.all(selectedTranslationIds.map(async (id) => {
      const translation = selectedMap.get(id);
      if (!translation) return;
      const next = Array.from(new Set([...(translation.groupIds || []), groupId]));
      await updateTranslation(id, { groupIds: next });
    }));
  };

  const clearAllFilters = () => {
    setSortMode("recent");
    setLanguageFilter("All");
    setSourceFilter("All");
    setQuery("");
    setGroupFilterId("none");
    setGroupMode("none");
  };

  useEffect(() => {
    if (!selectedTranslation) {
      setTranslationSuggestions([]);
      setSuggestionsError(null);
      setSuggestionsLoading(false);
      return;
    }

    const { id: translationId, sourceWord, sourceLanguage, targetLanguage, context } = selectedTranslation;
    let cancelled = false;
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    const dismissedKey = `lexi:translations:dismissed:${translationId}`;
    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)));

    const knownWords = new Set<string>();
    for (const entry of translations) {
      if (entry.sourceLanguage === sourceLanguage) knownWords.add(entry.sourceWord.toLowerCase());
      if (entry.targetLanguage === targetLanguage) knownWords.add(entry.targetWord.toLowerCase());
    }
    for (const word of words) {
      if (word.language === sourceLanguage) knownWords.add(word.word.toLowerCase());
    }

    // Suggestions are saved per pair, so reopening one doesn't call the AI
    // again. Editing the pair's source word or languages invalidates them.
    const cacheSignature = `${sourceWord.toLowerCase()}|${sourceLanguage}|${targetLanguage}`;

    const load = async () => {
      const cached = await readAiCacheEntry<{ signature: string; suggestions: RelatedTranslationSuggestion[]; requested?: number }>(
        "relatedTranslations",
        translationId,
      );
      if (cancelled) return;

      // Lowering the count reuses what's saved; raising it asks for a fresh set.
      const cachedRequested = cached?.requested ?? cached?.suggestions.length ?? 0;
      let suggestions = cached?.signature === cacheSignature && cachedRequested >= suggestionCount ? cached.suggestions : null;
      if (!suggestions) {
        const result = await suggestRelatedTranslations(sourceWord, sourceLanguage, targetLanguage, context, Array.from(knownWords), suggestionCount);
        if (cancelled) return;
        if (!result.success) {
          setTranslationSuggestions([]);
          setSuggestionsError(result.error ?? "Could not load suggestions.");
          return;
        }
        suggestions = result.data;
        void writeAiCache("relatedTranslations", translationId, { signature: cacheSignature, suggestions, requested: suggestionCount });
      }

      const existingPairs = new Set(translations.map((entry) => translationFingerprint(entry)));
      const filtered = suggestions.filter((suggestion) => {
        if (dismissed.has(suggestionKey(suggestion))) return false;
        const fingerprint = translationFingerprint({ sourceWord: suggestion.sourceWord, sourceLanguage, targetWord: suggestion.targetWord, targetLanguage });
        return !existingPairs.has(fingerprint);
      });
      setTranslationSuggestions(filtered.slice(0, suggestionCount));
    };

    void load().finally(() => {
      if (!cancelled) setSuggestionsLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTranslation?.id, suggestionCount]);

  const dismissSuggestion = (suggestion: RelatedTranslationSuggestion) => {
    if (!selectedTranslation) return;
    const key = suggestionKey(suggestion);
    const dismissedKey = `lexi:translations:dismissed:${selectedTranslation.id}`;
    const dismissed = new Set(parseJsonArray(window.localStorage.getItem(dismissedKey)));
    dismissed.add(key);
    window.localStorage.setItem(dismissedKey, JSON.stringify(Array.from(dismissed)));
    setTranslationSuggestions((current) => current.filter((entry) => suggestionKey(entry) !== key));
  };

  const applySuggestion = async (suggestion: RelatedTranslationSuggestion) => {
    if (!selectedTranslation) return;
    const key = suggestionKey(suggestion);
    setAddingSuggestionKey(key);
    try {
      await addTranslation({
        sourceWord: suggestion.sourceWord,
        sourceLanguage: selectedTranslation.sourceLanguage,
        targetWord: suggestion.targetWord,
        targetLanguage: selectedTranslation.targetLanguage,
        context: suggestion.context,
        aiGenerated: true,
        groupIds: [],
      });
      setTranslationSuggestions((current) => current.filter((entry) => suggestionKey(entry) !== key));
    } finally {
      setAddingSuggestionKey(null);
    }
  };

  const contentGridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidthFor(viewMode, zoom)}px, 1fr))`,
  };

  const renderListRow = (translation: Translation) => (
    <div
      key={translation.id}
      className={cn("word-row", bulkMode ? "grid-cols-[28px_minmax(0,1fr)_26px]" : "grid-cols-[minmax(0,1fr)_26px]", selectedId === translation.id && "word-row-active")}
      role="button"
      tabIndex={0}
      onClick={() => bulkMode ? toggleBulkTranslation(translation.id) : setSelectedId(translation.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        openActionMenu(translation, event.clientX, event.clientY);
      }}
    >
      {bulkMode ? <div className="flex items-center"><input type="checkbox" checked={selectedTranslationIds.includes(translation.id)} onChange={() => toggleBulkTranslation(translation.id)} onClick={(event) => event.stopPropagation()} className="size-4 accent-white" /></div> : null}
      <div className="min-w-0">
        <p className="serif-display truncate text-[1.6rem] leading-[0.95]">{translation.sourceWord}<span className="mx-2 inline-flex items-center align-middle text-muted-foreground/80"><ArrowRight className="size-4" /></span>{translation.targetWord}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="lexi-chip">{translation.sourceLanguage}</span>
          <span className="lexi-chip">{translation.targetLanguage}</span>
        </div>
        <p className="word-sub mt-1.5 text-sm">Added {formatDate(translation.dateAdded)}</p>
      </div>
      <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={(event) => { event.stopPropagation(); openActionMenu(translation, event.clientX, event.clientY); }}>
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );

  const renderTile = (translation: Translation) => (
    <article
      key={translation.id}
      className={cn("lexi-browser-card tile", selectedId === translation.id && "active")}
      role="button"
      tabIndex={0}
      onClick={() => bulkMode ? toggleBulkTranslation(translation.id) : setSelectedId(translation.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        openActionMenu(translation, event.clientX, event.clientY);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Source and target each get their own line, so a tile too narrow for
            the pair shows both truncated rather than hiding the target. */}
        <div className="min-w-0 flex-1">
          <p className="serif-display truncate text-lg leading-tight">{translation.sourceWord}</p>
          <p className="serif-display flex items-center gap-1.5 truncate text-lg leading-tight text-muted-foreground">
            <ArrowRight className="size-3.5 shrink-0" />
            <span className="truncate">{translation.targetWord}</span>
          </p>
        </div>
        {bulkMode ? <input type="checkbox" checked={selectedTranslationIds.includes(translation.id)} onChange={() => toggleBulkTranslation(translation.id)} onClick={(event) => event.stopPropagation()} className="size-4 shrink-0 accent-white" /> : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        <span className="lexi-chip compact">{translation.sourceLanguage}</span>
        <span className="lexi-chip compact">{translation.targetLanguage}</span>
      </div>
    </article>
  );

  const renderCard = (translation: Translation) => (
    <article
      key={translation.id}
      className={cn("lexi-browser-card", selectedId === translation.id && "active")}
      role="button"
      tabIndex={0}
      onClick={() => bulkMode ? toggleBulkTranslation(translation.id) : setSelectedId(translation.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        openActionMenu(translation, event.clientX, event.clientY);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="serif-display break-words text-[2rem] leading-[0.92]">{translation.sourceWord}</p>
        </div>
        <div className="flex items-center gap-2">
          {bulkMode ? <input type="checkbox" checked={selectedTranslationIds.includes(translation.id)} onChange={() => toggleBulkTranslation(translation.id)} onClick={(event) => event.stopPropagation()} className="size-4 accent-white" /> : null}
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={(event) => { event.stopPropagation(); openActionMenu(translation, event.clientX, event.clientY); }}>
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>
      <p className="serif-display break-words mt-3 border-t border-white/10 pt-3 text-[1.7rem] leading-[0.95]">{translation.targetWord}</p>
      {translation.context ? <p className="word-sub mt-3 line-clamp-4">{translation.context}</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="lexi-chip">{translation.sourceLanguage}</span>
          <span className="lexi-chip">{translation.targetLanguage}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(translation.groupIds || []).slice(0, 2).map((groupId) => {
            const group = groups.find((entry) => entry.id === groupId);
            return group ? <GroupBadge key={group.id} group={group} /> : null;
          })}
        </div>
      </div>
    </article>
  );

  const renderCardOrTile = (translation: Translation) => (viewMode === "tiles" ? renderTile(translation) : renderCard(translation));

  return (
    <>
      <div className={cn("grid min-h-full grid-cols-1 gap-3 xl:h-full", detailPanelOpen && "xl:grid-cols-[1.12fr_1fr]")}>
        <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
            <div className="search-field-wrap min-w-[170px] flex-[1_1_250px] sm:min-w-[220px] sm:flex-[1_1_340px]">
              <Search className="search-field-icon" />
              <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} className="frost-input search-field-input" placeholder="Search translations or tags" />
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
            <DropdownMenu open={filtersOpen} onOpenChange={setFiltersOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="border-white/15 bg-white/6 hover:bg-white/14" aria-label="Filters" title="Filters"><SlidersHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="custom-scrollbar max-h-[70vh] w-64 overflow-y-auto">
                <DropdownMenudiv>Sort</DropdownMenudiv>
                <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                  {SORT_OPTIONS.map((entry) => <DropdownMenuRadioItem key={entry.value} value={entry.value}>{entry.label}</DropdownMenuRadioItem>)}
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
                <DropdownMenudiv>Grouping</DropdownMenudiv>
                <DropdownMenuRadioGroup value={groupMode} onValueChange={(value) => setGroupMode(value as GroupMode)}>
                  <DropdownMenuRadioItem value="none">No Grouping</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="sourceLang">By Source Language</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="targetLang">By Target Language</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pair">By Language Pair</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>Clear filters</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {bulkMode ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
              <span className="sync-pill">{selectedTranslationIds.length} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14">Groups</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">{groups.map((group) => <DropdownMenuItem key={group.id} onSelect={() => void bulkAssignGroup(group.id)}>{group.name}</DropdownMenuItem>)}</DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={exitBulkMode}>Exit</Button>
              <Button type="button" size="sm" variant="destructive" onClick={requestBulkDelete}>Delete</Button>
            </div>
          ) : null}
          {viewMode === "list" ? <div className={cn("table-head", bulkMode ? "grid-cols-[28px_minmax(0,1fr)_26px]" : "grid-cols-[minmax(0,1fr)_26px]")}><span>Translation</span><span /></div> : null}
          <div ref={gridScrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" onWheel={(event) => { if (!(event.ctrlKey || event.metaKey) || !canZoom) return; event.preventDefault(); void stepZoom(event.deltaY < 0 ? "in" : "out", event.currentTarget.clientWidth - GRID_CONTENT_PADDING_PX); }}>
            {loading ? <ListRowsSkeleton /> : filteredTranslations.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center"><p className="section-title">No translations</p><p className="subtle-caption mt-2 max-w-sm px-4">Add translation pairs first to build your language map.</p></div>
            ) : viewMode === "list" ? (
              groupedTranslations.map((group) => <div key={group.key}>{groupMode !== "none" ? <div className="sticky top-0 z-10 flex items-center justify-between border-y border-white/8 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md"><span>{group.key}</span><span>{group.items.length}</span></div> : null}{group.items.map(renderListRow)}</div>)
            ) : (
              <div className="space-y-4 p-3">{groupedTranslations.map((group) => <div key={group.key} className="space-y-3">{groupMode !== "none" ? <div className="flex items-center justify-between px-1"><p className="font-medium">{group.key}</p><span className="subtle-caption">{group.items.length}</span></div> : null}<div className="grid gap-3" style={contentGridStyle}>{group.items.map(renderCardOrTile)}</div></div>)}</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-white/10 p-2">{canZoom ? <div className="flex items-center gap-2"><ZoomIn className="size-4 text-muted-foreground" /><button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => void stepZoom("out", (gridScrollRef.current?.clientWidth ?? 0) - GRID_CONTENT_PADDING_PX)} aria-label="Zoom out"><Minus className="size-4" /></button><span className="sync-pill min-w-[4.25rem] justify-center">{zoom}%</span><button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-white/12 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground" onClick={() => void stepZoom("in", (gridScrollRef.current?.clientWidth ?? 0) - GRID_CONTENT_PADDING_PX)} aria-label="Zoom in"><Plus className="size-4" /></button></div> : <span className="subtle-caption inline-flex items-center gap-1.5"><kbd className="key-cap">Ctrl</kbd>/<kbd className="key-cap">Cmd</kbd> + wheel zooms cards</span>}</div>
        </section>
        {detailPanelOpen ? (
        <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
            <div className="space-y-6">
              {selectedTranslation ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="detail-title">{selectedTranslation.sourceWord}</h2>
                      <p className="detail-phonetic mt-1">{selectedTranslation.sourceLanguage}<span className="mx-2 inline-flex items-center align-middle text-muted-foreground/80"><ArrowRight className="size-3.5" /></span>{selectedTranslation.targetLanguage}</p>
                    </div>
                    <span className={cn("status-pill", selectedTranslation.aiGenerated ? "status-learning" : "status-new")}>{selectedTranslation.aiGenerated ? "AI" : "Manual"}</span>
                  </div>
                  <div className="ghost-divider" />
                  <div className="space-y-2"><p className="detail-text">{selectedTranslation.targetWord}</p><p className="subtle-caption">Primary translation target</p></div>
                  <TagList tags={selectedTranslation.tags} />
                  {selectedTranslation.context ? (
                    <div className="frost-panel-soft space-y-3 p-4">
                      <p className="font-medium">Context</p>
                      <p className="serif-display text-2xl italic text-muted-foreground">{selectedTranslation.context}</p>
                    </div>
                  ) : null}
                  <div className="ghost-divider" />
                  <div className="frost-panel-soft space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Usage Example</p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={generatingExamples} onClick={() => void generateTranslationExamples()}>
                          {generatingExamples ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <WandSparkles className="mr-1.5 size-3.5" />}
                          Generate
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={(selectedTranslation.sourceExamples?.length ?? 0) <= 1 && (selectedTranslation.targetExamples?.length ?? 0) <= 1} onClick={() => { setSourceExampleVersion((current) => current + 1); setTargetExampleVersion((current) => current + 1); }}>
                          <RefreshCcw className="mr-1.5 size-3.5" />
                          Rotate
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={!selectedSourceExample && !selectedTargetExample} onClick={() => void copyExamples()} title="Copy both examples" aria-label="Copy both examples">
                          <Copy className="size-3.5" />
                          {copiedExample ? "Copied" : null}
                        </Button>
                      </div>
                    </div>
                    {generatingExamples ? (
                      <div className="space-y-3">
                        <ExampleSkeleton lines={1} />
                        <div className="ghost-divider" />
                        <ExampleSkeleton lines={1} />
                      </div>
                    ) : selectedSourceExample || selectedTargetExample ? (
                      <div className="space-y-3">
                        {selectedSourceExample ? <p className="serif-display text-2xl italic text-muted-foreground">{selectedSourceExample}</p> : null}
                        {selectedSourceExample && selectedTargetExample ? <div className="ghost-divider" /> : null}
                        {selectedTargetExample ? <p className="serif-display text-2xl italic text-muted-foreground">{selectedTargetExample}</p> : null}
                      </div>
                    ) : (
                      <p className="subtle-caption">No examples yet. Click Generate to see this pair used in both languages.</p>
                    )}
                  </div>
                  <div className="ghost-divider" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Groups</p>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={groups.length === 0 || autoGroupingId === selectedTranslation.id} onClick={() => void autoAssignGroup(selectedTranslation)}>
                          {autoGroupingId === selectedTranslation.id ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <WandSparkles className="mr-1.5 size-3.5" />}
                          Auto-assign
                        </Button>
                        <FolderPlus className="size-4 text-muted-foreground" />
                      </div>
                    </div>
                    {selectedTranslationGroups.length === 0 ? <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No group assigned yet. Open the action menu to manage groups.</div> : <div className="flex flex-wrap gap-1.5">{selectedTranslationGroups.map((group) => <GroupBadge key={group.id} group={group} />)}</div>}
                    {autoGroupError ? <p className="subtle-caption text-red-300">{autoGroupError}</p> : null}
                  </div>
                  <div className="ghost-divider" />
                  <div className="space-y-2"><div className="flex items-center justify-between"><p className="font-medium">Linked Vocabulary</p><Sparkles className="size-4 text-muted-foreground" /></div>{linkedWords.length === 0 ? <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No linked word entries yet.</div> : <div className="flex flex-wrap gap-1.5">{linkedWords.map((word) => <span key={word.id} className="lexi-chip">{word.word}</span>)}</div>}</div>
                </>
              ) : (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center"><p className="section-title">Choose a translation</p><p className="subtle-caption mt-2 max-w-sm">Explore context, linked words, and language flow for each pair.</p></div>
              )}
              {selectedTranslation ? (
                <>
                  <div className="ghost-divider" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><p className="font-medium">Translation Suggestions</p><Sparkles className="size-4 text-muted-foreground" /></div>
                    {suggestionsLoading ? (
                      <SuggestionCardsSkeleton count={Math.min(suggestionCount, 4)} />
                    ) : suggestionsError ? (
                      <div className="frost-panel-soft p-3 text-sm text-muted-foreground">{suggestionsError}</div>
                    ) : translationSuggestions.length === 0 ? (
                      <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No suggestions right now.</div>
                    ) : (
                      <div className="space-y-2">
                        {translationSuggestions.map((suggestion) => {
                          const key = suggestionKey(suggestion);
                          return (
                            <div key={key} className="frost-panel-soft space-y-2 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="serif-display text-2xl leading-[0.95]">{suggestion.sourceWord}<span className="mx-2 inline-flex items-center align-middle text-muted-foreground/80"><ArrowRight className="size-4" /></span>{suggestion.targetWord}</p>
                                  <p className="subtle-caption">{selectedTranslation.sourceLanguage} {"->"} {selectedTranslation.targetLanguage}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={addingSuggestionKey === key} onClick={() => void applySuggestion(suggestion)}>{addingSuggestionKey === key ? "Adding..." : "Add"}</Button>
                                  <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => dismissSuggestion(suggestion)}>Dismiss</Button>
                                </div>
                              </div>
                              {suggestion.context ? <p className="word-sub">{suggestion.context}</p> : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 p-2"><span className="sync-pill"><Languages className="size-3" />{translations.length} translation pairs</span><span className="sync-pill"><Sparkles className="size-3" />AI assisted translation</span></div>
        </section>
        ) : null}
      </div>

      {actionMenu ? (
        <div className="fixed inset-0 z-[70]" onClick={() => setActionMenu(null)} onContextMenu={(event) => { event.preventDefault(); setActionMenu(null); }}>
          <div className="absolute w-64 rounded-md border border-white/15 bg-black/85 p-1 shadow-xl backdrop-blur-md" style={{ left: actionMenu.x, top: actionMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="menu-action" onClick={() => { setSelectedId(actionMenu.translation.id); setActionMenu(null); }}><Search className="size-4" />Open details</button>
            <button type="button" className="menu-action" onClick={() => { setEditingTranslation(actionMenu.translation); setEditDialogOpen(true); setActionMenu(null); }}><Pencil className="size-4" />Edit pair</button>
            <button type="button" className="menu-action" onClick={() => { void handleCopyTranslation(actionMenu.translation); setActionMenu(null); }}><Copy className="size-4" />Copy pair</button>
            <button type="button" className="menu-action" onClick={() => { enterBulkMode(actionMenu.translation.id); setActionMenu(null); }}><Check className="size-4" />Start multi-select</button>
            <div className="my-1 h-px bg-white/10" />
            <p className="menu-section-label">Groups</p>
            {groups.length === 0 ? <button type="button" className="menu-action" onClick={() => { createGroupAndAssign(actionMenu.translation); setActionMenu(null); }}><FolderPlus className="size-4" />Create first group</button> : groups.map((group) => {
              const assigned = (actionMenu.translation.groupIds || []).includes(group.id);
              return <button key={group.id} type="button" className="menu-action" onClick={() => { void toggleTranslationGroup(actionMenu.translation, group.id); setActionMenu(null); }}><Check className={cn("size-4", !assigned && "opacity-0")} /><GroupBadge group={group} /></button>;
            })}
            <button type="button" className="menu-action" onClick={() => { createGroupAndAssign(actionMenu.translation); setActionMenu(null); }}><FolderPlus className="size-4" />Create group and add</button>
            {(actionMenu.translation.groupIds || []).length > 0 ? <button type="button" className="menu-action" onClick={() => { void updateTranslation(actionMenu.translation.id, { groupIds: [] }); setActionMenu(null); }}><Trash2 className="size-4" />Remove from all groups</button> : null}
            <div className="my-1 h-px bg-white/10" />
            <button type="button" className="menu-action destructive" onClick={() => { requestDeleteTranslation(actionMenu.translation); setActionMenu(null); }}><Trash2 className="size-4" />Delete pair</button>
          </div>
        </div>
      ) : null}

      <TextPromptDialog
        open={newGroupTarget !== null}
        onOpenChange={(open) => { if (!open) setNewGroupTarget(null); }}
        title="New group"
        description={newGroupTarget ? `Create a group and add "${newGroupTarget.sourceWord}" to it.` : undefined}
        placeholder="e.g. Travel"
        submitLabel="Create"
        onSubmit={submitNewGroup}
      />
      <EditTranslationDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} translation={editingTranslation} onSave={updateTranslation} />
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) { setDeletingTranslation(null); setBulkDeletePending(false); } }}
        title="Delete Translation?"
        description={bulkDeletePending ? `Delete ${selectedTranslationIds.length} selected translations? This cannot be undone.` : deletingTranslation ? `Delete "${deletingTranslation.sourceWord} -> ${deletingTranslation.targetWord}"? This cannot be undone.` : "Delete this translation?"}
        onConfirm={(skipNextTime) => {
          if (bulkDeletePending) {
            void handleBulkDelete(skipNextTime);
            return;
          }
          if (deletingTranslation) {
            void handleDeleteTranslation(deletingTranslation, skipNextTime);
          }
        }}
      />
    </>
  );
}
