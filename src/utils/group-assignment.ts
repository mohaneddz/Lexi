// Shared logic for AI-assisted group assignment, used by both the per-item
// "Auto-assign" action and the bulk Organize sweep on the Groups page.

const NO_MATCH_OPTION_ID = "__lexi_no_group_match__";

type GroupOption = { id: string; name: string; description?: string; isOthers?: boolean };

type SuggestGroupResult = {
  success: boolean;
  data: string;
  error?: string;
};

type SuggestGroupFn = (
  word: string,
  definition: string,
  availableGroups: GroupOption[],
) => Promise<SuggestGroupResult>;

export function findOthersGroupId(groups: GroupOption[]): string | null {
  return groups.find((group) => group.isOthers)?.id ?? null;
}

/**
 * Asks the AI to pick a group, giving it an explicit "none of these" option so an
 * unclear match can fall back to the Others group instead of being forced into
 * whichever group happens to be first in the list.
 */
export async function resolveGroupAssignment(
  word: string,
  definition: string,
  groups: GroupOption[],
  suggestGroup: SuggestGroupFn,
  useOthersFallback: boolean,
): Promise<string | null> {
  // Others is the fallback, never a candidate, or the AI would reach for it
  // whenever a match is only slightly unclear.
  const candidates = groups.filter((group) => !group.isOthers);
  const othersId = useOthersFallback ? findOthersGroupId(groups) : null;
  if (candidates.length === 0) {
    return othersId;
  }

  const options: GroupOption[] = [
    ...candidates.map((group) => ({ id: group.id, name: group.name, description: group.description })),
    {
      id: NO_MATCH_OPTION_ID,
      name: "None of the above",
      description: "Use only if the word or phrase does not clearly fit any of the other groups.",
    },
  ];

  const result = await suggestGroup(word, definition, options);
  const matchedRealGroup = result.success && candidates.some((group) => group.id === result.data);

  return matchedRealGroup ? result.data : othersId;
}

/** Items per AI request. Large enough to save quota, small enough that the model doesn't lose track of numbering. */
export const ORGANIZE_BATCH_SIZE = 15;

type SuggestGroupsBatchFn = (
  items: Array<{ label: string; definition: string }>,
  availableGroups: GroupOption[],
) => Promise<{ success: boolean; data: Array<string | null>; error?: string }>;

/**
 * Batch version of {@link resolveGroupAssignment} for one chunk of items.
 * An item the AI couldn't place goes to Others when the fallback is on. If
 * the whole request fails, nothing is assigned, so a retry can pick those
 * items up again instead of them all landing in Others.
 */
export async function resolveGroupAssignmentsBatch(
  items: Array<{ label: string; definition: string }>,
  groups: GroupOption[],
  suggestGroupsBatch: SuggestGroupsBatchFn,
  useOthersFallback: boolean,
): Promise<{ groupIds: Array<string | null>; error?: string }> {
  const candidates = groups.filter((group) => !group.isOthers);
  const othersId = useOthersFallback ? findOthersGroupId(groups) : null;
  if (candidates.length === 0) {
    return { groupIds: items.map(() => othersId) };
  }

  const result = await suggestGroupsBatch(items, candidates);
  if (!result.success) {
    return { groupIds: items.map(() => null), error: result.error };
  }

  return { groupIds: items.map((_, index) => result.data[index] ?? othersId) };
}
