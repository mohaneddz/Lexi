import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleDot, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { LexiGroup } from "@/types";
import { formatDate } from "@/utils/formatters";

export default function Groups() {
  const { groups, loading, addGroup, updateGroup, deleteGroup, moveGroup } = useGroups();
  const { words } = useWords();
  const { translations } = useTranslations();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [editingGroup, setEditingGroup] = useState<LexiGroup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const groupUsage = useMemo(() => {
    const counts = new Map<string, { words: number; translations: number }>();
    for (const group of groups) {
      counts.set(group.id, { words: 0, translations: 0 });
    }

    for (const word of words) {
      for (const groupId of word.groupIds || []) {
        const current = counts.get(groupId);
        if (current) {
          current.words += 1;
        }
      }
    }

    for (const translation of translations) {
      for (const groupId of translation.groupIds || []) {
        const current = counts.get(groupId);
        if (current) {
          current.translations += 1;
        }
      }
    }

    return counts;
  }, [groups, translations, words]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const startCreate = () => {
    setEditingGroup(null);
    setDraftName("");
    setDraftDescription("");
    setFormError(null);
  };

  const startEdit = (group: LexiGroup) => {
    setEditingGroup(group);
    setDraftName(group.name);
    setDraftDescription(group.description ?? "");
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!draftName.trim()) {
      setFormError("Group name is required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, {
          name: draftName,
          description: draftDescription || undefined,
        });
      } else {
        await addGroup({
          name: draftName,
          description: draftDescription || undefined,
        });
      }
      startCreate();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save group.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (group: LexiGroup) => {
    const confirmed = window.confirm(
      `Delete "${group.name}"? It will be removed from all words and translations.`,
    );
    if (!confirmed) {
      return;
    }

    await deleteGroup(group.id);
    if (selectedGroupId === group.id) {
      setSelectedGroupId(null);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1fr_0.92fr]">
      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h2 className="section-title">Groups</h2>
            <p className="subtle-caption mt-2">Organize words and translations into custom buckets.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white/15 bg-white/6 hover:bg-white/14"
            onClick={startCreate}
          >
            <Plus className="mr-2 size-4" />
            New Group
          </Button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">{[1, 2, 3, 4].map((index) => <div key={index} className="h-16 rounded-lg bg-white/6" />)}</div>
          ) : groups.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center">
              <FolderTree className="size-7 text-muted-foreground" />
              <p className="section-title">No groups yet</p>
              <p className="subtle-caption max-w-sm">Create your first group to start organizing entries.</p>
            </div>
          ) : (
            groups.map((group) => {
              const usage = groupUsage.get(group.id) || { words: 0, translations: 0 };
              return (
                <div
                  key={group.id}
                  className={cn("word-row grid-cols-[minmax(0,1fr)_auto]", selectedGroupId === group.id && "word-row-active")}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <div className="min-w-0">
                    <p className="serif-display truncate text-[1.7rem] leading-[0.95]">{group.name}</p>
                    <p className="word-sub mt-1.5 truncate text-sm">{group.description || "No description yet."}</p>
                    <p className="subtle-caption mt-2">{usage.words} words • {usage.translations} translations</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 disabled:opacity-35"
                      disabled={groups.findIndex((entry) => entry.id === group.id) === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveGroup(group.id, "up");
                      }}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 disabled:opacity-35"
                      disabled={groups.findIndex((entry) => entry.id === group.id) === groups.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveGroup(group.id, "down");
                      }}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEdit(group);
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(group);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
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
            
            <div>
              <h3 className="detail-title">{editingGroup ? "Edit Group" : "Create Group"}</h3>
              <p className="subtle-caption mt-2">Use groups in filters and right-click context actions.</p>
            </div>

            <div className="mb-6">
              <span className="text-sm font-medium">Group name</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className="frost-input"
                placeholder="e.g. Reading, Work, Travel"
              />
            </div>

            <div>
              <span className="text-sm font-medium">Description (optional)</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-glass-border bg-transparent px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="What this group is for"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={submitting || !draftName.trim()}
                onClick={() => void handleSubmit()}
              >
                {editingGroup ? "Save Group" : "Create Group"}
              </Button>
              {editingGroup ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/15 bg-white/6 hover:bg-white/14"
                  onClick={startCreate}
                >
                  Cancel Edit
                </Button>
              ) : null}
            </div>

            {formError ? <p className="subtle-caption text-destructive">{formError}</p> : null}

            {selectedGroup ? (
              <>
                <div className="ghost-divider" />
                <div className="frost-panel-soft space-y-2 p-4">
                  <p className="font-medium">Selected Group</p>
                  <p className="serif-display text-3xl leading-[0.95]">{selectedGroup.name}</p>
                  <p className="subtle-caption">Created {formatDate(selectedGroup.dateAdded)}</p>
                  <p className="word-sub">{selectedGroup.description || "No description."}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill">
            <FolderTree className="size-3" />
            {groups.length} groups
          </span>
          <span className="subtle-caption">Group deletions unassign linked items automatically.</span>
        </div>
      </section>
    </div>
  );
}
