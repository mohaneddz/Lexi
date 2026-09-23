import { Tags } from "lucide-react";

import { descriptiveTags } from "@/utils/tags";

/** The tags block in the Definitions and Translations side panels. Review-status tags are left out; the status pill covers those. */
export function TagList({ tags }: { tags: string[] | undefined }) {
  const visible = descriptiveTags(tags);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-medium">Tags</p>
        <Tags className="size-4 text-muted-foreground" />
      </div>
      {visible.length === 0 ? (
        <p className="subtle-caption">No tags yet. Add them when capturing, or run Auto tag from the Stats page.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((tag) => <span key={tag} className="lexi-chip">{tag}</span>)}
        </div>
      )}
    </div>
  );
}
