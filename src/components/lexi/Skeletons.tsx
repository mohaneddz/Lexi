import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Placeholders shaped like the content they stand in for, so the layout
// doesn't jump when the real thing arrives.

const BLOCK = "bg-white/8";

/** Rows in a list view (Definitions, Translations, Review, Groups). */
export function ListRowsSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-1 p-3", className)} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-3 rounded-lg px-3 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn(BLOCK, "h-6 w-2/5")} />
            <Skeleton className={cn(BLOCK, "h-3.5 w-4/5")} />
          </div>
          <Skeleton className={cn(BLOCK, "h-6 w-20 rounded-full")} />
        </div>
      ))}
    </div>
  );
}

/** A suggestion card in the Definitions or Translations side panel. */
export function SuggestionCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="frost-panel-soft space-y-2.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className={cn(BLOCK, "h-7 w-1/3")} />
            <div className="flex gap-2">
              <Skeleton className={cn(BLOCK, "h-8 w-14")} />
              <Skeleton className={cn(BLOCK, "h-8 w-20")} />
            </div>
          </div>
          <Skeleton className={cn(BLOCK, "h-3.5 w-11/12")} />
          <Skeleton className={cn(BLOCK, "h-3.5 w-3/5")} />
        </div>
      ))}
    </div>
  );
}

/** Usage example text while examples are generated. */
export function ExampleSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn(BLOCK, "h-6", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Multiple-choice answers in Review, same size as the real buttons. */
export function ChoicesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="frost-panel-soft flex items-center gap-3 p-3">
          <Skeleton className={cn(BLOCK, "h-4 w-4 shrink-0")} />
          <div className="flex-1 space-y-2">
            <Skeleton className={cn(BLOCK, "h-4", index % 2 === 0 ? "w-11/12" : "w-3/4")} />
            {index % 2 === 0 ? <Skeleton className={cn(BLOCK, "h-4 w-1/2")} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A Home suggestion entry. */
export function HomeEntriesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="home-entry" aria-hidden>
          <div className="min-w-0 space-y-2.5">
            <Skeleton className={cn(BLOCK, "h-7 w-40")} />
            <Skeleton className={cn(BLOCK, "h-3.5 w-full max-w-md")} />
            <Skeleton className={cn(BLOCK, "h-3.5 w-3/5 max-w-xs")} />
            <Skeleton className={cn(BLOCK, "mt-1 h-5 w-28 rounded-full")} />
          </div>
          <div className="home-entry-actions">
            <Skeleton className={cn(BLOCK, "h-8 w-16")} />
          </div>
        </div>
      ))}
    </>
  );
}

/** A book card on the Books page. */
export function BookCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="frost-panel-soft flex gap-3 p-3">
          <Skeleton className={cn(BLOCK, "h-28 w-20 shrink-0")} />
          <div className="flex-1 space-y-2.5 pt-1">
            <Skeleton className={cn(BLOCK, "h-5 w-1/2")} />
            <Skeleton className={cn(BLOCK, "h-3.5 w-11/12")} />
            <Skeleton className={cn(BLOCK, "h-3.5 w-2/3")} />
          </div>
        </div>
      ))}
    </div>
  );
}
