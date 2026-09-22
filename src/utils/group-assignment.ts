// Shared logic for AI-assisted group assignment, used by both the per-item
// "Auto-assign" action and the bulk Organize sweep on the Groups page.

const NO_MATCH_OPTION_ID = "__lexi_no_group_match__";

type GroupOption = { id: string; name: string; description?: string };

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
  const match = groups.find((group) => group.name.trim().toLowerCase() === "others");
  return match ? match.id : null;
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
  if (groups.length === 0) {
    return null;
  }

  const options: GroupOption[] = [
    ...groups.map((group) => ({ id: group.id, name: group.name, description: group.description })),
    {
      id: NO_MATCH_OPTION_ID,
      name: "None of the above",
      description: "Use only if the word or phrase does not clearly fit any of the other groups.",
    },
  ];

  const result = await suggestGroup(word, definition, options);
  const matchedRealGroup = result.success && groups.some((group) => group.id === result.data);

  if (matchedRealGroup) {
    return result.data;
  }

  return useOthersFallback ? findOthersGroupId(groups) : null;
}
