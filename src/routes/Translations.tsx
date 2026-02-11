import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleDot,
  Copy,
  FolderPlus,
  Languages,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AddTranslationDialog } from "@/components/AddTranslationDialog";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { EditTranslationDialog } from "@/components/EditTranslationDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { Translation } from "@/types";
import { formatDate } from "@/utils/formatters";
import { getSettings, updateSettings } from "@/utils/storage";

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

type SortMode = "recent" | "oldest" | "source" | "target" | "sourceLang" | "targetLang";
type GroupMode = "none" | "sourceLang" | "targetLang" | "pair";
type SourceFilter = "All" | "AI" | "Manual";

type ContextMenuState = {
  translation: Translation;
  x: number;
  y: number;
};

export default function Translations() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
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
  const [actionTranslationId, setActionTranslationId] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { translations, addTranslation, updateTranslation, deleteTranslation, loading } = useTranslations();
  const { words } = useWords();
  const { groups, addGroup } = useGroups();

  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();
    for (const translation of translations) {
      languages.add(translation.sourceLanguage);
      languages.add(translation.targetLanguage);
    }

    return ["All", ...Array.from(languages).sort((a, b) => a.localeCompare(b))];
  }, [translations]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (languageFilter !== "All") count += 1;
    if (sourceFilter !== "All") count += 1;
    if (groupFilterId !== "none") count += 1;
    return count;
  }, [groupFilterId, languageFilter, sourceFilter]);

  const filteredTranslations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const scoped = translations.filter((translation) => {
      const matchesLanguage =
        languageFilter === "All" ||
        translation.sourceLanguage === languageFilter ||
        translation.targetLanguage === languageFilter;

      const matchesSource =
        sourceFilter === "All" ||
        (sourceFilter === "AI" && translation.aiGenerated) ||
        (sourceFilter === "Manual" && !translation.aiGenerated);

      const matchesGroup =
        groupFilterId === "none" ||
        (translation.groupIds || []).includes(groupFilterId);

      if (!matchesLanguage || !matchesSource || !matchesGroup) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        translation.sourceWord.toLowerCase().includes(normalizedQuery) ||
        translation.targetWord.toLowerCase().includes(normalizedQuery) ||
        translation.sourceLanguage.toLowerCase().includes(normalizedQuery) ||
        translation.targetLanguage.toLowerCase().includes(normalizedQuery) ||
        (translation.context ?? "").toLowerCase().includes(normalizedQuery)
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
      case "recent":
      default:
        return next.sort((a, b) => b.dateAdded - a.dateAdded);
    }
  }, [groupFilterId, languageFilter, query, sortMode, sourceFilter, translations]);

  const groupedTranslations = useMemo(() => {
    const groups = new Map<string, Translation[]>();
    for (const translation of filteredTranslations) {
      const key =
        groupMode === "sourceLang"
          ? translation.sourceLanguage
          : groupMode === "targetLang"
            ? translation.targetLanguage
            : groupMode === "pair"
              ? `${translation.sourceLanguage} -> ${translation.targetLanguage}`
              : "All Translations";
      const arr = groups.get(key) || [];
      arr.push(translation);
      groups.set(key, arr);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
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
    const onCapture = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path !== "/translations") {
        return;
      }

      setAddDialogOpen(true);
    };

    const onSearchFocus = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path !== "/translations") {
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || !selectedId || filteredTranslations.length === 0) {
        return;
      }

      const currentIndex = filteredTranslations.findIndex((translation) => translation.id === selectedId);
      if (currentIndex < 0) {
        return;
      }

      if (event.key.toLowerCase() === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(filteredTranslations.length - 1, currentIndex + 1);
        setSelectedId(filteredTranslations[nextIndex].id);
      }

      if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(0, currentIndex - 1);
        setSelectedId(filteredTranslations[nextIndex].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredTranslations, selectedId]);

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

  const selectedTranslation = useMemo(
    () => filteredTranslations.find((translation) => translation.id === selectedId) ?? null,
    [filteredTranslations, selectedId],
  );

  const selectedTranslationGroups = useMemo(() => {
    if (!selectedTranslation) {
      return [];
    }
    const ids = selectedTranslation.groupIds || [];
    return groups.filter((group) => ids.includes(group.id));
  }, [groups, selectedTranslation]);

  const linkedWords = useMemo(() => {
    if (!selectedTranslation) {
      return [];
    }

    const linked = words.filter((word) => {
      const normalizedWord = word.word.toLowerCase();
      return (
        normalizedWord === selectedTranslation.sourceWord.toLowerCase() ||
        normalizedWord === selectedTranslation.targetWord.toLowerCase()
      );
    });

    return linked.slice(0, 4);
  }, [selectedTranslation, words]);

  const requestDeleteTranslation = (translation: Translation) => {
    if (!showDeleteConfirmation) {
      void handleDeleteTranslation(translation, false);
      return;
    }

    setDeletingTranslation(translation);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTranslation = async (translation: Translation, disableConfirmation: boolean) => {
    setActionTranslationId(translation.id);
    try {
      if (disableConfirmation) {
        await updateSettings({ showDeleteConfirmation: false });
        setShowDeleteConfirmation(false);
        window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { showDeleteConfirmation: false } }));
      }

      await deleteTranslation(translation.id);
      if (selectedId === translation.id) {
        setSelectedId(null);
      }
    } finally {
      setActionTranslationId(null);
      setDeletingTranslation(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleCopyTranslation = async (translation: Translation) => {
    setActionTranslationId(translation.id);
    try {
      await navigator.clipboard.writeText(`${translation.sourceWord} -> ${translation.targetWord}`);
    } finally {
      setActionTranslationId(null);
    }
  };

  const toggleTranslationGroup = async (translation: Translation, groupId: string) => {
    const current = translation.groupIds || [];
    const next = current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId];
    await updateTranslation(translation.id, { groupIds: next });
  };

  const createGroupAndAssign = async (translation: Translation) => {
    const name = window.prompt("New group name");
    if (!name || !name.trim()) {
      return;
    }

    const group = await addGroup({ name: name.trim() });
    const nextGroupIds = Array.from(new Set([...(translation.groupIds || []), group.id]));
    await updateTranslation(translation.id, { groupIds: nextGroupIds });
  };

  const clearAllFilters = () => {
    setLanguageFilter("All");
    setSourceFilter("All");
    setQuery("");
    setGroupFilterId("none");
    setGroupMode("none");
  };

  return (
    <>
      <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.12fr_1fr]">
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
                placeholder="Search translation pairs"
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
                >
                  <SlidersHorizontal className="size-4" />
                  {activeFilterCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-white/90 text-[10px] font-semibold text-black">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Source</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
                  {["All", "AI", "Manual"].map((entry) => (
                    <DropdownMenuRadioItem key={entry} value={entry}>{entry}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>List Grouping</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={groupMode} onValueChange={(value) => setGroupMode(value as GroupMode)}>
                  <DropdownMenuRadioItem value="none">No Grouping</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="sourceLang">By Source Language</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="targetLang">By Target Language</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pair">By Language Pair</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>
                  Clear Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <select className="frost-input toolbar-select h-[2.36rem] py-0" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="source">Source</option>
              <option value="target">Target</option>
              <option value="sourceLang">Source Lang</option>
              <option value="targetLang">Target Lang</option>
            </select>

            <select className="frost-input toolbar-select toolbar-select-wide h-[2.36rem] py-0" value={groupFilterId} onChange={(event) => setGroupFilterId(event.target.value)}>
              <option value="none">No Group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-white/8 px-3 py-2">
            {availableLanguages.map((language) => (
              <button
                key={language}
                type="button"
                className={cn("lexi-chip transition-colors", languageFilter === language && "border-white/25 bg-white/16 text-foreground")}
                onClick={() => setLanguageFilter(language)}
              >
                {language}
              </button>
            ))}
          </div>

          <div className="table-head grid-cols-[minmax(0,1fr)_110px_26px]">
            <span>Pair</span>
            <span>Source</span>
            <span />
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">{[1, 2, 3, 4].map((index) => <div key={index} className="h-16 rounded-lg bg-white/6" />)}</div>
            ) : filteredTranslations.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center">
                <p className="section-title">No translations yet</p>
                <Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => setAddDialogOpen(true)}>
                  Add Translation
                </Button>
              </div>
            ) : (
              groupedTranslations.map((group) => (
                <div key={group.key}>
                  {groupMode !== "none" ? (
                    <div className="sticky top-0 z-10 flex items-center justify-between border-y border-white/8 bg-black/20 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md">
                      <span>{group.key}</span>
                      <span>{group.items.length}</span>
                    </div>
                  ) : null}

                  {group.items.map((translation) => (
                    <div
                      key={translation.id}
                      className={cn("word-row grid-cols-[minmax(0,1fr)_110px_26px]", selectedId === translation.id && "word-row-active")}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(translation.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedId(translation.id);
                        setContextMenu({
                          translation,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    >
                      <div className="min-w-0">
                        <p className="serif-display truncate text-[1.6rem] leading-[0.95]">
                          {translation.sourceWord}
                          <span className="mx-2 inline-flex items-center align-middle text-muted-foreground/80">
                            <ArrowRight className="size-4" />
                          </span>
                          {translation.targetWord}
                        </p>
                        <p className="word-sub mt-1.5 text-sm">{translation.targetLanguage} • added {formatDate(translation.dateAdded)}</p>
                      </div>

                      <span className="truncate text-sm text-muted-foreground">{translation.sourceLanguage}</span>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10" onClick={(event) => event.stopPropagation()}>
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenuItem onSelect={() => void handleCopyTranslation(translation)} disabled={actionTranslationId === translation.id}>
                            <Copy className="size-4" />
                            Copy pair
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setEditingTranslation(translation); setEditDialogOpen(true); }}>
                            <Pencil className="size-4" />
                            Edit pair
                          </DropdownMenuItem>

                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <FolderPlus className="size-4" />
                              Groups
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-56">
                              {groups.length === 0 ? (
                                <DropdownMenuItem onSelect={() => void createGroupAndAssign(translation)}>
                                  Create first group
                                </DropdownMenuItem>
                              ) : (
                                groups.map((groupEntry) => {
                                  const assigned = (translation.groupIds || []).includes(groupEntry.id);
                                  return (
                                    <DropdownMenuItem key={groupEntry.id} onSelect={() => void toggleTranslationGroup(translation, groupEntry.id)}>
                                      <Check className={cn("size-4", !assigned && "opacity-0")} />
                                      {groupEntry.name}
                                    </DropdownMenuItem>
                                  );
                                })
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => void createGroupAndAssign(translation)}>
                                Create group and add
                              </DropdownMenuItem>
                              {(translation.groupIds || []).length > 0 ? (
                                <DropdownMenuItem onSelect={() => void updateTranslation(translation.id, { groupIds: [] })}>
                                  Remove from all groups
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>

                          <DropdownMenuItem variant="destructive" onSelect={() => requestDeleteTranslation(translation)}>
                            <Trash2 className="size-4" />
                            Delete pair
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><CircleDot className="size-3" />Synced, just now</span>
            <span className="subtle-caption">`Ctrl+Shift+T` open + capture translation</span>
          </div>
        </section>

        <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
            {selectedTranslation ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="detail-title">{selectedTranslation.sourceWord}</h2>
                    <p className="detail-phonetic mt-1">
                      {selectedTranslation.sourceLanguage}
                      <span className="mx-2 inline-flex items-center align-middle text-muted-foreground/80">
                        <ArrowRight className="size-3.5" />
                      </span>
                      {selectedTranslation.targetLanguage}
                    </p>
                  </div>
                  <span className={cn("status-pill", selectedTranslation.aiGenerated ? "status-learning" : "status-new")}>{selectedTranslation.aiGenerated ? "AI" : "Manual"}</span>
                </div>

                <div className="ghost-divider" />

                <div className="space-y-2">
                  <p className="detail-text">{selectedTranslation.targetWord}</p>
                  <p className="subtle-caption">Primary translation target</p>
                </div>

                {selectedTranslation.context ? (
                  <div className="frost-panel-soft space-y-2 p-4">
                    <p className="subtle-caption">Context</p>
                    <p className="word-sub">{selectedTranslation.context}</p>
                  </div>
                ) : null}

                <div className="ghost-divider" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Groups</p>
                    <FolderPlus className="size-4 text-muted-foreground" />
                  </div>

                  {selectedTranslationGroups.length === 0 ? (
                    <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No group assigned yet. Right-click the row to manage groups.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTranslationGroups.map((group) => <span key={group.id} className="lexi-chip">{group.name}</span>)}
                    </div>
                  )}
                </div>

                <div className="ghost-divider" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Linked Vocabulary</p>
                    <Sparkles className="size-4 text-muted-foreground" />
                  </div>

                  {linkedWords.length === 0 ? (
                    <div className="frost-panel-soft p-3 text-sm text-muted-foreground">No linked word entries yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">{linkedWords.map((word) => <span key={word.id} className="lexi-chip">{word.word}</span>)}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                <p className="section-title">Choose a translation</p>
                <p className="subtle-caption mt-2 max-w-sm">Explore context, linked words, and language flow for each pair.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 p-2">
            <span className="sync-pill"><Languages className="size-3" />{translations.length} translation pairs</span>
            <span className="sync-pill"><Sparkles className="size-3" />AI assisted translation</span>
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
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 320)),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
              onClick={() => {
                setSelectedId(contextMenu.translation.id);
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
                void handleCopyTranslation(contextMenu.translation);
                setContextMenu(null);
              }}
            >
              <Copy className="size-4" />
              Copy pair
            </button>

            <div className="my-1 h-px bg-white/10" />
            <p className="px-2 py-1 text-xs text-muted-foreground">Groups</p>
            {groups.length === 0 ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
                onClick={() => {
                  void createGroupAndAssign(contextMenu.translation);
                  setContextMenu(null);
                }}
              >
                <FolderPlus className="size-4" />
                Create first group
              </button>
            ) : (
              groups.map((group) => {
                const assigned = (contextMenu.translation.groupIds || []).includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/10"
                    onClick={() => {
                      void toggleTranslationGroup(contextMenu.translation, group.id);
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
                void createGroupAndAssign(contextMenu.translation);
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
                requestDeleteTranslation(contextMenu.translation);
                setContextMenu(null);
              }}
            >
              <Trash2 className="size-4" />
              Delete pair
            </button>
          </div>
        </div>
      ) : null}

      <AddTranslationDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={addTranslation} />
      <EditTranslationDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        translation={editingTranslation}
        onSave={updateTranslation}
      />
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Translation?"
        description={deletingTranslation ? `Delete "${deletingTranslation.sourceWord} -> ${deletingTranslation.targetWord}"? This cannot be undone.` : "Delete this translation?"}
        onConfirm={(skipNextTime) => {
          if (deletingTranslation) {
            void handleDeleteTranslation(deletingTranslation, skipNextTime);
          }
        }}
      />
    </>
  );
}
