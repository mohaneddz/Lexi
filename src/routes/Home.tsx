import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Check, Loader2, Plus, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBooks } from "@/hooks/useBooks";
import { useGroups } from "@/hooks/useGroups";
import { useWords } from "@/hooks/useWords";
import { getGroupIcon } from "@/lib/group-icons";
import { getReviewStatus } from "@/utils/review";
import { buildSuggestions, type Suggestion } from "@/utils/wordSuggestions";

const DISMISSED_KEY = "lexi:home:dismissed-suggestions";

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(terms: Set<string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(terms)));
  } catch {
    // A full or blocked store just means dismissals last for this session.
  }
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const navigate = useNavigate();
  const { words, addWord, loading: wordsLoading } = useWords();
  const { groups } = useGroups();
  const { lookup, enabledBookIds, loading: booksLoading } = useBooks();

  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const [addingTerm, setAddingTerm] = useState<string | null>(null);
  const [addedTerms, setAddedTerms] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    persistDismissed(dismissed);
  }, [dismissed]);

  const findDefinition = useCallback((term: string) => {
    const [best] = lookup(term, { bookType: "dictionary", fuzzy: false });
    if (!best) return null;
    return { definition: best.output, bookTitle: best.bookTitle };
  }, [lookup]);

  const sections = useMemo(() => {
    if (enabledBookIds.length === 0) return [];
    return buildSuggestions({ words, groups, dismissed, findDefinition });
  }, [dismissed, enabledBookIds.length, findDefinition, groups, words]);

  const dueCount = useMemo(
    () => words.filter((word) => getReviewStatus(word) !== "Mastered").length,
    [words],
  );

  const handleAdd = async (suggestion: Suggestion) => {
    setAddingTerm(suggestion.term);
    try {
      await addWord({
        word: suggestion.term,
        definition: suggestion.definition ?? "",
        language: suggestion.language,
        tags: ["suggested"],
        aiGenerated: false,
        favorite: false,
        groupIds: [],
        examples: [],
      });
      setAddedTerms((current) => new Set(current).add(suggestion.term));
    } finally {
      setAddingTerm(null);
    }
  };

  const handleDismiss = (term: string) => {
    setDismissed((current) => new Set(current).add(term));
  };

  const loading = wordsLoading || booksLoading;

  return (
    <div className="custom-scrollbar h-full overflow-y-auto">
      <div className="home-stage animate-slide-in-up">
        <header className="home-masthead">
          <div>
            <h1 className="home-greeting">{greetingFor(new Date())}</h1>
            <p className="subtle-caption mt-2">
              Words drawn from the definitions you have already collected.
            </p>
          </div>

          <div className="home-pulse">
            <div>
              <div className="home-pulse-figure">{words.length}</div>
              <div className="home-pulse-label">Words</div>
            </div>
            <div>
              <div className="home-pulse-figure">{groups.length}</div>
              <div className="home-pulse-label">Groups</div>
            </div>
            <div>
              <div className="home-pulse-figure">{dueCount}</div>
              <div className="home-pulse-label">To review</div>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((index) => <div key={index} className="h-24 rounded-lg bg-white/6" />)}
          </div>
        ) : enabledBookIds.length === 0 ? (
          <EmptyNote
            title="Enable a book to get suggestions"
            body="Suggestions are looked up in your offline books, so at least one has to be enabled before there is anything to show."
            actionLabel="Open Books"
            onAction={() => navigate("/books")}
          />
        ) : words.length === 0 ? (
          <EmptyNote
            title="Save a word first"
            body="Every suggestion comes out of the definitions you have saved, so there is nothing to draw from yet."
            actionLabel="Open Definitions"
            onAction={() => navigate("/definitions")}
          />
        ) : sections.length === 0 ? (
          <EmptyNote
            title="Nothing new to suggest"
            body="Every term worth surfacing from your definitions is either saved already or dismissed. Add more words and check back."
            actionLabel="Open Definitions"
            onAction={() => navigate("/definitions")}
          />
        ) : (
          sections.map((section) => {
            const RailIcon = section.group ? getGroupIcon(section.group.iconName) : Sparkles;

            return (
              <section key={section.key} className="home-thread">
                <div className="home-rail">
                  <div className="home-rail-title">
                    <RailIcon className="size-5 shrink-0 text-muted-foreground" />
                    {section.title}
                  </div>
                  <p className="subtle-caption">{section.reason}</p>
                </div>

                <div className="home-entries">
                  {section.suggestions.map((suggestion) => {
                    const isAdding = addingTerm === suggestion.term;
                    const isAdded = addedTerms.has(suggestion.term);

                    return (
                      <article key={suggestion.term} className="home-entry">
                        <div className="min-w-0">
                          <h2 className="home-entry-term">{suggestion.term}</h2>
                          <p className="word-sub mt-1.5 line-clamp-3">{suggestion.definition}</p>

                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="lexi-chip compact">
                              <BookOpen className="size-3" />
                              {suggestion.bookTitle}
                            </span>
                            <span className="subtle-caption">
                              seen in {suggestion.seenIn.map((entry) => `"${entry}"`).join(", ")}
                            </span>
                          </div>
                        </div>

                        <div className="home-entry-actions">
                          {isAdded ? (
                            <span className="status-pill status-mastered">Added</span>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="lexi-btn-primary"
                                disabled={isAdding}
                                onClick={() => void handleAdd(suggestion)}
                              >
                                {isAdding ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Plus className="mr-1.5 size-3.5" />}
                                Add
                              </Button>
                              <button
                                type="button"
                                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                                onClick={() => handleDismiss(suggestion.term)}
                                title={`Dismiss "${suggestion.term}"`}
                                aria-label={`Dismiss ${suggestion.term}`}
                              >
                                <X className="size-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyNote({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="frost-panel-soft max-w-2xl space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Check className="size-4 text-muted-foreground" />
        <p className="section-title">{title}</p>
      </div>
      <p className="subtle-caption">{body}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-white/15 bg-white/6 hover:bg-white/14"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
