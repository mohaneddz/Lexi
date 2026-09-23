import type { Translation, Word } from "@/types";
import { classifyEntries } from "@/utils/ai-service";
import { announceDataChanged } from "@/utils/dataEvents";
import * as storage from "@/utils/storage";
import { descriptiveTags, tagVocabulary } from "@/utils/tags";

type NewEntry = { kind: "word"; entry: Word } | { kind: "translation"; entry: Translation };

/**
 * Tags a freshly saved word or translation, and puts it in a group, when it
 * was saved without them: added from a Home suggestion, a related-words
 * panel or a book, or typed in by hand. Runs in the background after the
 * save, so adding never waits on the AI; if the AI is off or fails, the
 * entry simply stays as it was saved.
 */
export async function enrichNewEntry(newEntry: NewEntry): Promise<void> {
  const { kind, entry } = newEntry;
  const needsTags = descriptiveTags(entry.tags).length === 0;
  const needsGroup = (entry.groupIds ?? []).length === 0;
  if (!needsTags && !needsGroup) return;

  try {
    const settings = await storage.getSettings();
    if (!settings.aiEnabled) return;

    const [groups, words, translations] = await Promise.all([
      storage.getGroups(),
      storage.getWords(),
      storage.getTranslations(),
    ]);
    // Others is the fallback when nothing fits, never a choice the AI makes.
    const candidates = needsGroup ? groups.filter((group) => !group.isOthers) : [];
    const othersId = settings.othersGroupEnabled ? groups.find((group) => group.isOthers)?.id ?? null : null;

    const item = kind === "word"
      ? { label: entry.word, definition: entry.definition }
      : {
        label: `${entry.sourceWord} (${entry.sourceLanguage}) -> ${entry.targetWord} (${entry.targetLanguage})`,
        definition: entry.context ?? "",
      };

    const result = await classifyEntries([item], candidates, tagVocabulary([...words, ...translations]));
    if (!result.success || !result.data[0]) return;
    const { tags, groupId } = result.data[0];

    const updates: { tags?: string[]; groupIds?: string[] } = {};
    if (needsTags && tags.length > 0) {
      // Keeps bookkeeping tags such as "suggested" alongside the new ones.
      updates.tags = Array.from(new Set([...(entry.tags ?? []), ...tags]));
    }
    const chosenGroup = groupId ?? othersId;
    if (needsGroup && chosenGroup) {
      updates.groupIds = [chosenGroup];
    }
    if (!updates.tags && !updates.groupIds) return;

    if (kind === "word") {
      await storage.updateWord(entry.id, updates);
      announceDataChanged("words");
    } else {
      await storage.updateTranslation(entry.id, updates);
      announceDataChanged("translations");
    }
  } catch (error) {
    console.error("Failed to tag new entry", error);
  }
}
