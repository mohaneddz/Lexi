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
