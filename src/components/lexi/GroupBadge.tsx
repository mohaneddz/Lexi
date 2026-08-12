import { cn } from "@/lib/utils";
import { getGroupIcon } from "@/lib/group-icons";
import type { LexiGroup } from "@/types";

type GroupBadgeProps = {
  group: LexiGroup;
  iconOnly?: boolean;
  className?: string;
};

export function GroupBadge({ group, iconOnly = false, className }: GroupBadgeProps) {
  const Icon = getGroupIcon(group.iconName);

  return (
    <span
      className={cn("lexi-chip", iconOnly && "justify-center px-2.5", className)}
      title={group.name}
      aria-label={group.name}
    >
      <Icon className="size-3.5 shrink-0" />
      {iconOnly ? null : <span className="truncate">{group.name}</span>}
    </span>
  );
}
