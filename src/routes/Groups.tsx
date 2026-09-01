import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FolderTree, Loader2, Pencil, Plus, Search, Trash2, WandSparkles } from "lucide-react";

import { GroupBadge } from "@/components/lexi/GroupBadge";
import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { getGroupIcon, GROUP_ICON_LOAD_ERROR, GROUP_ICON_NAMES, GROUP_ICON_SOURCE, iconLabelFromName } from "@/lib/group-icons";
import { cn } from "@/lib/utils";
import type { LexiGroup } from "@/types";
import { formatDate } from "@/utils/formatters";

export default function Groups() {
  const { groups, loading, addGroup, updateGroup, deleteGroup, moveGroup } = useGroups();
  const { suggestGroupIcon, loading: aiLoading } = useAI();
  const { words } = useWords();
  const { translations } = useTranslations();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftIconName, setDraftIconName] = useState("Folder");
  const [iconQuery, setIconQuery] = useState("");
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

  const filteredIcons = useMemo(() => {
    const normalizedQuery = iconQuery.trim().toLowerCase();
    if (GROUP_ICON_NAMES.length === 0) {
      return [];
    }

    if (!normalizedQuery) {
      return GROUP_ICON_NAMES.slice(0, 420);
    }

    return GROUP_ICON_NAMES.filter((iconName) => iconLabelFromName(iconName).toLowerCase().includes(normalizedQuery)).slice(0, 420);
  }, [iconQuery]);

  const DraftIcon = getGroupIcon(draftIconName);

  const startCreate = () => {
    setEditingGroup(null);
    setDraftName("");
    setDraftDescription("");
    setDraftIconName("Folder");
    setIconQuery("");
    setFormError(null);
  };

  const startEdit = (group: LexiGroup) => {
    setEditingGroup(group);
    setDraftName(group.name);
    setDraftDescription(group.description ?? "");
    setDraftIconName(group.iconName || "Folder");
    setIconQuery("");
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
          name: draftName.trim(),
          iconName: draftIconName,
          description: draftDescription.trim() || undefined,
        });
      } else {
        await addGroup({
          name: draftName.trim(),
          iconName: draftIconName,
          description: draftDescription.trim() || undefined,
        });
      }
      startCreate();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save group.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoIcon = async () => {
    if (!draftName.trim()) {
      setFormError("Enter a group name first so AI can pick an icon.");
      return;
    }

    setFormError(null);
    const result = await suggestGroupIcon(draftName, draftDescription || undefined, GROUP_ICON_NAMES);
    if (!result.success || !result.data) {
      setFormError(result.error ?? "Could not auto-select an icon.");
      return;
    }

    setDraftIconName(result.data);
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
    <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1fr_0.96fr]">
      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h2 className="section-title">Groups</h2>
            <p className="subtle-caption mt-2">Organize words and translations into custom buckets with icon labels.</p>
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
                  <div className="min-w-0 space-y-2">
                    <GroupBadge group={group} className="w-fit" />
                    <p className="word-sub truncate text-sm">{group.description || "No description yet."}</p>
                    <p className="subtle-caption">{usage.words} words • {usage.translations} translations</p>
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
      </section>

      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
          <div className="space-y-6">
            <div>
              <h3 className="detail-title">{editingGroup ? "Edit Group" : "Create Group"}</h3>
              <p className="subtle-caption mt-2">Groups appear in filters, chips, and action menus across the app.</p>
            </div>

            <div className="frost-panel-soft flex items-center gap-3 p-4">
              <div className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <DraftIcon className="size-6" />
              </div>
              <div>
                <p className="font-medium">{draftName.trim() || "Group Preview"}</p>
                <p className="subtle-caption">{iconLabelFromName(draftIconName)}</p>
              </div>
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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Group icon</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-white/6 hover:bg-white/14"
                    disabled={aiLoading || !draftName.trim() || GROUP_ICON_NAMES.length === 0}
                    onClick={() => void handleAutoIcon()}
                  >
                    {aiLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <WandSparkles className="mr-1.5 size-3.5" />}
                    Auto
                  </Button>
                  <div className="search-field-wrap max-w-[260px]">
                    <Search className="search-field-icon" />
                    <input
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      className="frost-input search-field-input"
                      placeholder={`Search icons (${GROUP_ICON_NAMES.length})`}
                    />
                  </div>
                </div>
              </div>

              <div className="grid max-h-[320px] grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-white/4 p-1.5 sm:grid-cols-5 md:grid-cols-6">
                {filteredIcons.length === 0 ? (
                  <div className="col-span-full rounded-md border border-dashed border-white/20 bg-white/4 px-3 py-5 text-center text-xs text-muted-foreground">
                    {GROUP_ICON_NAMES.length === 0 ? "Icons could not be loaded." : "No icons match this search."}
                  </div>
                ) : (
                  filteredIcons.map((iconName) => {
                    const Icon = getGroupIcon(iconName);
                    const active = draftIconName === iconName;

                    return (
                      <button
                        key={iconName}
                        type="button"
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center transition hover:bg-white/8",
                          active ? "border-white/30 bg-white/12" : "border-white/8 bg-white/4",
                        )}
                        onClick={() => setDraftIconName(iconName)}
                        title={iconLabelFromName(iconName)}
                      >
                        <Icon className="size-[18px]" />
                        <span className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">{iconLabelFromName(iconName)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className={cn("subtle-caption", GROUP_ICON_LOAD_ERROR ? "text-amber-300/90" : undefined)}>
                {GROUP_ICON_LOAD_ERROR ?? `Loaded ${GROUP_ICON_NAMES.length} icons (${GROUP_ICON_SOURCE}).`}
              </p>
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
                <div className="frost-panel-soft space-y-3 p-4">
                  <p className="font-medium">Selected Group</p>
                  <GroupBadge group={selectedGroup} className="w-fit text-base" />
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
