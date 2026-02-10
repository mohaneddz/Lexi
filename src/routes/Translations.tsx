import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Copy,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionTranslationId, setActionTranslationId] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);

  const { translations, addTranslation, updateTranslation, deleteTranslation, loading } = useTranslations();
  const { words } = useWords();

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
      const matchesLanguage =
        languageFilter === "All" ||
        translation.sourceLanguage === languageFilter ||
        translation.targetLanguage === languageFilter;

      const matchesSource =
        sourceFilter === "All" ||
        (sourceFilter === "AI" && translation.aiGenerated) ||
        (sourceFilter === "Manual" && !translation.aiGenerated);

      if (!matchesLanguage || !matchesSource) {
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
  }, [languageFilter, query, sortMode, sourceFilter, translations]);

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

  const selectedTranslation = useMemo(
    () => filteredTranslations.find((translation) => translation.id === selectedId) ?? null,
    [filteredTranslations, selectedId],
  );

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

  return (
    <>
      <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.12fr_1fr]">
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
                placeholder="Search translation pairs"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-[2.36rem] w-[2.36rem] border-white/15 bg-white/5 text-muted-foreground">
                  <SlidersHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Source</DropdownMenuLabel>
                {["All", "AI", "Manual"].map((entry) => (
                  <DropdownMenuCheckboxItem key={entry} checked={sourceFilter === entry} onCheckedChange={() => setSourceFilter(entry as SourceFilter)}>
                    {entry}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setLanguageFilter("All"); setSourceFilter("All"); setQuery(""); }}>
                  Clear Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <select className="frost-input h-[2.36rem] w-[124px] py-0" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="source">Source</option>
              <option value="target">Target</option>
              <option value="sourceLang">Source Lang</option>
              <option value="targetLang">Target Lang</option>
            </select>

            <select className="frost-input h-[2.36rem] w-[122px] py-0" value={groupMode} onChange={(event) => setGroupMode(event.target.value as GroupMode)}>
              <option value="none">No Group</option>
              <option value="sourceLang">Source Lang</option>
              <option value="targetLang">Target Lang</option>
              <option value="pair">By Pair</option>
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
                    >
                      <div className="min-w-0">
                        <p className="serif-display truncate text-[1.6rem] leading-[0.95]">
                          {translation.sourceWord} <span className="text-muted-foreground">{"->"}</span> {translation.targetWord}
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
                      {selectedTranslation.sourceLanguage} {"->"} {selectedTranslation.targetLanguage}
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
