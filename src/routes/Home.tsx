import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Loader2, Plus, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBooks } from "@/hooks/useBooks";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { getGroupIcon } from "@/lib/group-icons";
import { getReviewStatus } from "@/utils/review";
import {
  buildDefinitionSuggestions,
  buildTranslationSuggestions,
  type Suggestion,
  type SuggestionKind,
} from "@/utils/wordSuggestions";

const DISMISSED_KEY_PREFIX = "lexi:home:dismissed";

function readDismissed(kind: SuggestionKind): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${DISMISSED_KEY_PREFIX}:${kind}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(kind: SuggestionKind, terms: Set<string>): void {
  try {
    window.localStorage.setItem(`${DISMISSED_KEY_PREFIX}:${kind}`, JSON.stringify(Array.from(terms)));
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
  const { translations, addTranslation } = useTranslations();
  const { groups } = useGroups();
  const { lookup, enabledBookIds, loading: booksLoading } = useBooks();

  const [kind, setKind] = useState<SuggestionKind>("definition");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [dismissedDefinitions, setDismissedDefinitions] = useState(() => readDismissed("definition"));
  const [dismissedTranslations, setDismissedTranslations] = useState(() => readDismissed("translation"));
  const [pendingTerm, setPendingTerm] = useState<string | null>(null);
  const [addedTerms, setAddedTerms] = useState<Set<string>>(() => new Set());

  // The group tabs in the topbar drive which sections are shown, so they do
  // something here instead of sitting inert like they do on Books or Stats.
  useEffect(() => {
    const onGroupFilterChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ groupId?: string }>).detail;
      if (typeof detail?.groupId === "string") setGroupFilterId(detail.groupId);
    };
    window.addEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    return () => window.removeEventListener("lexi:group-filter-changed", onGroupFilterChanged);
  }, []);

  useEffect(() => {
    persistDismissed("definition", dismissedDefinitions);
  }, [dismissedDefinitions]);

  useEffect(() => {
    persistDismissed("translation", dismissedTranslations);
  }, [dismissedTranslations]);

  const findDefinition = useCallback((term: string) => {
    const [best] = lookup(term, { bookType: "dictionary", fuzzy: false });
    if (!best) return null;
    return { definition: best.output, bookTitle: best.bookTitle };
  }, [lookup]);

  const findTranslation = useCallback((term: string) => {
    const [best] = lookup(term, { bookType: "translation", fuzzy: false });
    if (!best) return null;
    // The books are searchable from either side, so a hit can come back with
    // the query already sitting in `output`.
    const isReversed = best.output.trim().toLowerCase() === term.trim().toLowerCase();
    return {
      targetWord: isReversed ? best.input : best.output,
      targetLanguage: isReversed ? best.inputLanguage : best.outputLanguage,
      bookTitle: best.bookTitle,
    };
  }, [lookup]);

  const sections = useMemo(() => {
    if (enabledBookIds.length === 0) return [];

    const all = kind === "definition"
      ? buildDefinitionSuggestions({ words, groups, dismissed: dismissedDefinitions, findDefinition })
      : buildTranslationSuggestions({ words, translations, groups, dismissed: dismissedTranslations, findTranslation });

    if (groupFilterId === "none") return all;
    return all.filter((section) => section.group?.id === groupFilterId);
  }, [
    dismissedDefinitions, dismissedTranslations, enabledBookIds.length, findDefinition,
    findTranslation, groupFilterId, groups, kind, translations, words,
  ]);

  const dueCount = useMemo(
    () => words.filter((word) => getReviewStatus(word) !== "Mastered").length,
    [words],
  );

  const activeGroup = groups.find((group) => group.id === groupFilterId) ?? null;
  const hasAnySuggestion = sections.some((section) => section.suggestions.length > 0);

  const handleAdd = async (suggestion: Suggestion) => {
    setPendingTerm(suggestion.term);
    try {
      if (kind === "definition") {
        await addWord({
          word: suggestion.term,
          definition: suggestion.detail,
          language: suggestion.language,
          tags: ["suggested"],
          aiGenerated: false,
          favorite: false,
          groupIds: activeGroup ? [activeGroup.id] : [],
          examples: [],
        });
      } else {
        await addTranslation({
          sourceWord: suggestion.term,
          sourceLanguage: suggestion.language,
          targetWord: suggestion.detail,
          targetLanguage: suggestion.targetLanguage ?? suggestion.language,
          aiGenerated: false,
          favorite: false,
          groupIds: activeGroup ? [activeGroup.id] : [],
        });
      }
      setAddedTerms((current) => new Set(current).add(suggestion.term));
    } finally {
      setPendingTerm(null);
    }
  };

  const handleDismiss = (term: string) => {
    const key = kind === "definition" ? term : term.trim().toLowerCase();
    const setter = kind === "definition" ? setDismissedDefinitions : setDismissedTranslations;
    setter((current) => new Set(current).add(key));
  };

  const loading = wordsLoading || booksLoading;

  return (
    <div className="custom-scrollbar h-full overflow-y-auto">
      <div className="home-stage animate-slide-in-up">
        <header className="home-masthead">
          <div className="min-w-0">
            <h1 className="home-greeting">{greetingFor(new Date())}</h1>
            <p className="subtle-caption mt-2">
              {kind === "definition"
                ? "Words drawn from the definitions you have already collected."
                : "Saved words that still have no translation."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="lexi-toggle"
                aria-pressed={kind === "definition"}
                onClick={() => setKind("definition")}
              >
                Definitions
              </button>
              <button
                type="button"
                className="lexi-toggle"
                aria-pressed={kind === "translation"}
                onClick={() => setKind("translation")}
              >
                Translations
              </button>

              {activeGroup ? (
                <span className="lexi-chip compact ml-1">
                  Filtered to {activeGroup.name}
                </span>
              ) : null}
            </div>
          </div>

          <div className="home-pulse">
            <div>
              <div className="home-pulse-figure">{words.length}</div>
              <div className="home-pulse-label">Words</div>
            </div>
            <div>
              <div className="home-pulse-figure">{translations.length}</div>
              <div className="home-pulse-label">Pairs</div>
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
            body="Every suggestion comes out of the vocabulary you have already saved, so there is nothing to draw from yet."
            actionLabel="Open Definitions"
            onAction={() => navigate("/definitions")}
          />
        ) : sections.length === 0 ? (
          <EmptyNote
            title={activeGroup ? `Nothing to suggest for ${activeGroup.name}` : "Nothing new to suggest"}
            body={
              activeGroup
                ? "This group has no words yet, so there is nothing to draw suggestions from. Pick All in the group tabs to see the rest."
                : "Everything worth surfacing is already saved or dismissed. Add more words and check back."
            }
            actionLabel="Open Definitions"
            onAction={() => navigate("/definitions")}
          />
        ) : (
          <>
            {!hasAnySuggestion && kind === "translation" ? (
              <EmptyNote
                title="No translation book covers these words"
                body="Translation suggestions come from your enabled translation books. Enable one that covers your languages to see pairs here."
                actionLabel="Open Books"
                onAction={() => navigate("/books")}
              />
            ) : null}

            {sections.map((section) => {
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
                    {section.suggestions.length === 0 ? (
                      <p className="subtle-caption py-2">{section.emptyNote}</p>
                    ) : (
                      section.suggestions.map((suggestion) => {
                        const isPending = pendingTerm === suggestion.term;
                        const isAdded = addedTerms.has(suggestion.term);

                        return (
                          <article key={`${section.key}:${suggestion.term}`} className="home-entry">
                            <div className="min-w-0">
                              <h2 className="home-entry-term">
                                {suggestion.term}
                                {kind === "translation" ? (
                                  <span className="home-entry-target">
                                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                                    {suggestion.detail}
                                  </span>
                                ) : null}
                              </h2>

                              {kind === "definition" ? (
                                <p className="word-sub mt-1.5 line-clamp-3">{suggestion.detail}</p>
                              ) : null}

                              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                <span className="lexi-chip compact">
                                  <BookOpen className="size-3" />
                                  {suggestion.bookTitle}
                                </span>
                                {suggestion.seenIn.length > 0 ? (
                                  <span className="subtle-caption">
                                    seen in {suggestion.seenIn.map((entry) => `"${entry}"`).join(", ")}
                                  </span>
                                ) : (
                                  <span className="subtle-caption">
                                    {suggestion.language} to {suggestion.targetLanguage}
                                  </span>
                                )}
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
                                    disabled={isPending}
                                    onClick={() => void handleAdd(suggestion)}
                                  >
                                    {isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Plus className="mr-1.5 size-3.5" />}
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
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </>
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
      <p className="section-title">{title}</p>
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
