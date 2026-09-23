import { useEffect, useState } from "react";
import { ArrowRight, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";

import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { EditTranslationDialog } from "@/components/EditTranslationDialog";
import { EditWordDialog } from "@/components/EditWordDialog";
import { GroupBadge } from "@/components/lexi/GroupBadge";
import { Button } from "@/components/ui/button";
import type { LexiGroup, Translation, Word } from "@/types";
import { formatDate, truncateText } from "@/utils/formatters";
import { getSettings, updateSettings } from "@/utils/storage";

type Tab = "words" | "translations";

type PendingDelete = { kind: "word"; item: Word } | { kind: "translation"; item: Translation };

interface GroupContentsPanelProps {
  group: LexiGroup;
  words: Word[];
  translations: Translation[];
  onClose: () => void;
  onEditGroup: () => void;
  updateWord: (id: string, updates: Partial<Word>) => Promise<void>;
  deleteWord: (id: string) => Promise<void>;
  deleteWords: (ids: string[]) => Promise<void>;
  updateTranslation: (id: string, updates: Partial<Translation>) => Promise<void>;
  deleteTranslation: (id: string) => Promise<void>;
  deleteTranslations: (ids: string[]) => Promise<void>;
}

/** The Groups page side panel while a group is selected: what's in it, with quick edit, delete and capture. */
export function GroupContentsPanel({
  group,
  words,
  translations,
  onClose,
  onEditGroup,
  updateWord,
  deleteWord,
  deleteWords,
  updateTranslation,
  deleteTranslation,
  deleteTranslations,
}: GroupContentsPanelProps) {
  const [tab, setTab] = useState<Tab>("words");
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editingTranslation, setEditingTranslation] = useState<Translation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  useEffect(() => {
    void getSettings().then((settings) => setShowDeleteConfirmation(settings.showDeleteConfirmation));
    const onSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ showDeleteConfirmation?: boolean }>).detail;
      if (typeof detail?.showDeleteConfirmation === "boolean") setShowDeleteConfirmation(detail.showDeleteConfirmation);
    };
    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  const groupWords = words.filter((word) => (word.groupIds || []).includes(group.id));
  const groupTranslations = translations.filter((translation) => (translation.groupIds || []).includes(group.id));

  const capture = () => {
    window.dispatchEvent(new CustomEvent("lexi:capture", {
      detail: { mode: tab === "words" ? "define" : "translate", group: { id: group.id, name: group.name } },
    }));
  };

  const runDelete = async (target: PendingDelete, disableConfirmation: boolean) => {
    if (disableConfirmation) {
      await updateSettings({ showDeleteConfirmation: false });
      setShowDeleteConfirmation(false);
      window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: { showDeleteConfirmation: false } }));
    }
    if (target.kind === "word") await deleteWord(target.item.id);
    else await deleteTranslation(target.item.id);
  };

  const requestDelete = (target: PendingDelete) => {
    if (showDeleteConfirmation) setPendingDelete(target);
    else void runDelete(target, false);
  };

  const rowActions = (onEdit: () => void, onDelete: () => void, label: string) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
        onClick={onEdit}
        title={`Edit ${label}`}
        aria-label={`Edit ${label}`}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-destructive"
        onClick={onDelete}
        title={`Delete ${label}`}
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <GroupBadge group={group} className="w-fit text-base" />
          <p className="word-sub">{group.description || "No description."}</p>
          <p className="subtle-caption">Created {formatDate(group.dateAdded)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
            onClick={onEditGroup}
            title="Edit group"
            aria-label="Edit group"
          >
            <Settings2 className="size-4" />
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
            onClick={onClose}
            title="Back to Create Group"
            aria-label="Deselect group"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button type="button" className="lexi-toggle" aria-pressed={tab === "words"} onClick={() => setTab("words")}>
            Words ({groupWords.length})
          </button>
          <button type="button" className="lexi-toggle" aria-pressed={tab === "translations"} onClick={() => setTab("translations")}>
            Translations ({groupTranslations.length})
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/15 bg-white/6 hover:bg-destructive/20 hover:text-destructive"
            disabled={(tab === "words" ? groupWords.length : groupTranslations.length) === 0}
            onClick={() => setConfirmDeleteAll(true)}
            title={tab === "words" ? `Delete every word in ${group.name}` : `Delete every translation in ${group.name}`}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Delete all
          </Button>
          <Button type="button" size="sm" className="lexi-btn-primary" onClick={capture}>
            <Plus className="mr-1.5 size-3.5" />
            {tab === "words" ? "Capture word" : "Capture translation"}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {tab === "words" ? (
          groupWords.length === 0 ? (
            <p className="subtle-caption py-4">No words in {group.name} yet.</p>
          ) : groupWords.map((word) => (
            <div key={word.id} className="word-row grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="serif-display truncate text-xl leading-tight">{word.word}</p>
                <p className="word-sub mt-1 text-sm">{truncateText(word.definition, 110)}</p>
              </div>
              {rowActions(() => setEditingWord(word), () => requestDelete({ kind: "word", item: word }), word.word)}
            </div>
          ))
        ) : groupTranslations.length === 0 ? (
          <p className="subtle-caption py-4">No translations in {group.name} yet.</p>
        ) : groupTranslations.map((translation) => (
          <div key={translation.id} className="word-row grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="serif-display flex min-w-0 items-center gap-2 text-xl leading-tight">
                <span className="truncate">{translation.sourceWord}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{translation.targetWord}</span>
              </p>
              <p className="subtle-caption mt-1">{translation.sourceLanguage} to {translation.targetLanguage}</p>
            </div>
            {rowActions(
              () => setEditingTranslation(translation),
              () => requestDelete({ kind: "translation", item: translation }),
              translation.sourceWord,
            )}
          </div>
        ))}
      </div>

      <EditWordDialog
        open={editingWord !== null}
        word={editingWord}
        onOpenChange={(open) => { if (!open) setEditingWord(null); }}
        onSave={updateWord}
      />
      <EditTranslationDialog
        open={editingTranslation !== null}
        translation={editingTranslation}
        onOpenChange={(open) => { if (!open) setEditingTranslation(null); }}
        onSave={updateTranslation}
      />
      {/* Wiping a whole group is always confirmed, whatever the setting. */}
      <DeleteConfirmationDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        title={tab === "words" ? "Delete all words?" : "Delete all translations?"}
        description={tab === "words"
          ? `Delete all ${groupWords.length} words in ${group.name}? They are removed everywhere, not just from this group. This cannot be undone.`
          : `Delete all ${groupTranslations.length} translations in ${group.name}? They are removed everywhere, not just from this group. This cannot be undone.`}
        confirmLabel="Delete all"
        allowSkip={false}
        onConfirm={() => {
          setConfirmDeleteAll(false);
          if (tab === "words") void deleteWords(groupWords.map((word) => word.id));
          else void deleteTranslations(groupTranslations.map((translation) => translation.id));
        }}
      />
      <DeleteConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={pendingDelete?.kind === "translation" ? "Delete Translation?" : "Delete Word?"}
        description={pendingDelete
          ? pendingDelete.kind === "word"
            ? `Delete "${pendingDelete.item.word}"? This cannot be undone.`
            : `Delete "${pendingDelete.item.sourceWord} -> ${pendingDelete.item.targetWord}"? This cannot be undone.`
          : ""}
        onConfirm={(skipNextTime) => {
          if (pendingDelete) void runDelete(pendingDelete, skipNextTime);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
