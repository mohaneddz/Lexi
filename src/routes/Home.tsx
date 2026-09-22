import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Loader2, Plus, RefreshCcw, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useBooks } from "@/hooks/useBooks";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { getGroupIcon } from "@/lib/group-icons";
import type { LexiGroup } from "@/types";
import { getReviewStatus } from "@/utils/review";
import {
  buildFallbackDefinitionSuggestions,
  buildFallbackTranslationSuggestions,
  knownTerms,
  type Suggestion,
  type SuggestionKind,
} from "@/utils/wordSuggestions";

const DISMISSED_KEY_PREFIX = "lexi:home:dismissed";
const PER_SECTION = 4;

type SectionKey = string; // `${kind}:${groupId | "vocabulary"}`

type SectionState = {
  suggestions: Suggestion[];
  loading: boolean;
  /** False once a fallback (or empty AI result) means this section stopped trying the AI. */
  usedAi: boolean;
  error: string | null;
};

function sectionKey(kind: SuggestionKind, group: LexiGroup | null): SectionKey {
  return `${kind}:${group?.id ?? "vocabulary"}`;
}

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
  const { groups, loading: groupsLoading } = useGroups();
  const { lookup, enabledBookIds, loading: booksLoading } = useBooks();
  const { suggestGroupWords, defineWord, translate } = useAI();

  const [kind, setKind] = useState<SuggestionKind>("definition");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [dismissedDefinitions, setDismissedDefinitions] = useState(() => readDismissed("definition"));
  const [dismissedTranslations, setDismissedTranslations] = useState(() => readDismissed("translation"));
  const [pendingTerm, setPendingTerm] = useState<string | null>(null);
  const [addedTerms, setAddedTerms] = useState<Set<string>>(() => new Set());
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({});

  // Tracks every term shown anywhere this session, so a refresh on one
  // section — or generating a later group — doesn't repeat a word another
  // section already offered.
  const shownTermsRef = useRef<Set<string>>(new Set());

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

  /**
   * Generates one section: tries the AI first, few-shotted with the group's
   * own words, grounding each returned term in an enabled book when one has
   * it. Falls back to the offline term-mining approach — same one used
   * before AI suggestions existed — whenever the AI is unavailable, errors,
   * or returns nothing usable, so the page still works with no API key.
   */
  const generateSection = useCallback(async (
    generateKind: SuggestionKind,
    group: LexiGroup | null,
    options: { force?: boolean } = {},
  ) => {
    const key = sectionKey(generateKind, group);
    const currentDismissed = generateKind === "definition" ? dismissedDefinitions : dismissedTranslations;

    setSections((current) => ({
      ...current,
      [key]: { suggestions: current[key]?.suggestions ?? [], loading: true, usedAi: current[key]?.usedAi ?? true, error: null },
    }));

    const previouslyShown = options.force ? new Set(sections[key]?.suggestions.map((s) => s.term.toLowerCase()) ?? []) : new Set<string>();
    const exclude = new Set<string>([...shownTermsRef.current, ...previouslyShown]);

    const runFallback = (): Suggestion[] => {
      if (generateKind === "definition") {
        return buildFallbackDefinitionSuggestions({
          words, group: group ?? undefined, dismissed: currentDismissed, findDefinition, exclude, limit: PER_SECTION,
        });
      }
      return buildFallbackTranslationSuggestions({
        words, translations, group: group ?? undefined, dismissed: currentDismissed, findTranslation, exclude, limit: PER_SECTION,
      });
    };

    let picked: Suggestion[] = [];
    let usedAi = false;
    let error: string | null = null;

    // The whole-vocabulary catch-all has no single theme to few-shot on, so
    // it always uses the offline miner rather than asking the AI to guess.
    if (group) {
      const groupWords = words.filter((word) => (word.groupIds || []).includes(group.id));
      const exampleWords = groupWords.slice(0, 6).map((word) => word.word);
      const language = groupWords[0]?.language ?? "English";
      const known = knownTerms(words);

      const result = await suggestGroupWords({
        groupName: group.name,
        groupDescription: group.description,
        language,
        exampleWords,
        excludeWords: [...known, ...exclude, ...currentDismissed],
        count: PER_SECTION + 2,
      });

      if (result.success && result.data.length > 0) {
        usedAi = true;
        for (const term of result.data) {
          if (picked.length >= PER_SECTION) break;
          const normalized = term.toLowerCase();
          // Checks the live ref, not the snapshot taken before the AI call,
          // so a sibling group that claimed this term while this one was
          // waiting on the network is still caught.
          if (known.has(normalized) || shownTermsRef.current.has(normalized) || currentDismissed.has(normalized)) continue;

          const lookupFn = generateKind === "definition" ? findDefinition : findTranslation;
          const found = lookupFn(term);

          // Claimed immediately, not after the pick, so a sibling group
          // generating at the same time can't land on the same term while
          // this one is still mid-lookup.
          shownTermsRef.current.add(normalized);

          if (found) {
            picked.push(generateKind === "definition"
              ? { term, detail: (found as { definition: string }).definition, bookTitle: found.bookTitle, language, seenIn: [] }
              : {
                term,
                detail: (found as { targetWord: string }).targetWord,
                bookTitle: found.bookTitle,
                language,
                targetLanguage: (found as { targetLanguage: string }).targetLanguage,
                seenIn: [],
              });
            continue;
          }

          // No enabled book has this term — ask the AI to define or
          // translate just this one word rather than dropping it, since the
          // AI already chose it specifically for this group.
          if (generateKind === "definition") {
            const defined = await defineWord(term, language);
            if (defined.success && defined.data) {
              picked.push({ term, detail: defined.data, language, seenIn: [] });
            }
          } else {
            const targetLanguage = groupWords.find((word) => word.language !== language)?.language
              ?? words.find((word) => word.language !== language)?.language
              ?? "English";
            const translated = await translate(term, language, targetLanguage);
            if (translated.success && translated.data) {
              picked.push({ term, detail: translated.data, language, targetLanguage, seenIn: [] });
            }
          }
        }
      } else if (!result.success) {
        error = result.error ?? null;
      }
    }

    if (picked.length === 0) {
      picked = runFallback();
      usedAi = false;
    }

    for (const suggestion of picked) shownTermsRef.current.add(suggestion.term.toLowerCase());

    setSections((current) => ({
      ...current,
      [key]: { suggestions: picked, loading: false, usedAi, error: picked.length === 0 ? error : null },
    }));
  }, [
    defineWord, dismissedDefinitions, dismissedTranslations, findDefinition, findTranslation,
    sections, suggestGroupWords, translate, translations, words,
  ]);

  const generateSectionRef = useRef(generateSection);
  generateSectionRef.current = generateSection;

  // The groups that should have a section right now: every group with words
  // when nothing is filtered, or just the selected one.
  const visibleGroups = useMemo(() => {
    const withWords = groups.filter((group) => words.some((word) => (word.groupIds || []).includes(group.id)));
    if (groupFilterId === "none") return withWords;
    return withWords.filter((group) => group.id === groupFilterId);
  }, [groupFilterId, groups, words]);

  const showVocabularySection = groupFilterId === "none";

  useEffect(() => {
    if (wordsLoading || groupsLoading || booksLoading || enabledBookIds.length === 0 || words.length === 0) return;

    for (const group of visibleGroups) {
      const key = sectionKey(kind, group);
      if (sections[key]) continue;
      void generateSectionRef.current(kind, group);
    }

    if (showVocabularySection) {
      const key = sectionKey(kind, null);
      if (!sections[key]) void generateSectionRef.current(kind, null);
    }
    // Only re-run when the set of sections that should exist changes, not on
    // every generateSection identity change (it closes over `sections`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visibleGroups, showVocabularySection, wordsLoading, groupsLoading, booksLoading, enabledBookIds.length, words.length]);

  const dueCount = useMemo(
    () => words.filter((word) => getReviewStatus(word) !== "Mastered").length,
    [words],
  );

  const activeGroup = groups.find((group) => group.id === groupFilterId) ?? null;

  const handleAdd = async (suggestion: Suggestion) => {
    setPendingTerm(suggestion.term);
    try {
      if (kind === "definition") {
        await addWord({
          word: suggestion.term,
          definition: suggestion.detail,
          language: suggestion.language,
          tags: ["suggested"],
          aiGenerated: !suggestion.bookTitle,
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
          aiGenerated: !suggestion.bookTitle,
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
    const key = term.trim().toLowerCase();
    const setter = kind === "definition" ? setDismissedDefinitions : setDismissedTranslations;
    setter((current) => new Set(current).add(key));
  };

  const loading = wordsLoading || booksLoading || groupsLoading;
  const sectionList = [
    ...visibleGroups.map((group) => ({ group, key: sectionKey(kind, group) })),
    ...(showVocabularySection ? [{ group: null as LexiGroup | null, key: sectionKey(kind, null) }] : []),
  ];
  const anySectionHasSuggestions = sectionList.some((entry) => (sections[entry.key]?.suggestions.length ?? 0) > 0);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto">
      <div className="home-stage animate-slide-in-up">
        <header className="home-masthead">
          <div className="min-w-0">
            <h1 className="home-greeting">{greetingFor(new Date())}</h1>
            <p className="subtle-caption mt-2">
              {kind === "definition"
                ? "Words drawn from your groups, suggested by AI and grounded in your books."
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
            body="Suggestions are grounded in your offline books, so at least one has to be enabled before there is anything to show."
            actionLabel="Open Books"
            onAction={() => navigate("/books")}
          />
        ) : words.length === 0 ? (
          <EmptyNote
            title="Save a word first"
            body="Every suggestion is built around the vocabulary you have already saved, so there is nothing to draw from yet."
            actionLabel="Open Definitions"
            onAction={() => navigate("/definitions")}
          />
        ) : sectionList.length === 0 ? (
          <EmptyNote
            title={activeGroup ? `${activeGroup.name} has no words yet` : "No groups have words yet"}
            body="Add a word to this group first, so there is something for the suggestions to match against."
            actionLabel="Open Definitions"
            onAction={() => navigate("/definitions")}
          />
        ) : (
          <>
            {!anySectionHasSuggestions && sectionList.every((entry) => !sections[entry.key]?.loading) ? (
              <EmptyNote
                title="Nothing new to suggest right now"
                body={kind === "translation"
                  ? "Either everything is already paired, or no enabled translation book covers these languages."
                  : "Everything worth surfacing is already saved or dismissed."}
                actionLabel="Open Books"
                onAction={() => navigate("/books")}
              />
            ) : null}

            {sectionList.map(({ group, key }) => {
              const state = sections[key];
              const RailIcon = group ? getGroupIcon(group.iconName) : Sparkles;
              const title = group ? group.name : "Across your vocabulary";
              const reason = group
                ? (state?.usedAi
                  ? `AI suggestions matched to your ${group.name} words`
                  : `Turning up in the definitions of your ${group.name} words`)
                : (kind === "definition"
                  ? "Showing up again and again in words you have already saved"
                  : "Saved words still waiting for a translation");

              return (
                <section key={key} className="home-thread">
                  <div className="home-rail">
                    <div className="home-rail-title">
                      <button
                        type="button"
                        className="home-refresh-button"
                        onClick={() => void generateSectionRef.current(kind, group, { force: true })}
                        disabled={state?.loading}
                        title={`Swap in new suggestions for ${title}`}
                        aria-label={`Refresh suggestions for ${title}`}
                      >
                        {state?.loading
                          ? <Loader2 className="size-4 animate-spin" />
                          : <RefreshCcw className="size-4" />}
                      </button>
                      <RailIcon className="size-5 shrink-0 text-muted-foreground" />
                      {title}
                    </div>
                    <p className="subtle-caption">{reason}</p>
                  </div>

                  <div className="home-entries">
                    {state?.loading && (state?.suggestions.length ?? 0) === 0 ? (
                      <p className="subtle-caption py-2">Thinking of words for {title}...</p>
                    ) : (state?.suggestions.length ?? 0) === 0 ? (
                      <p className="subtle-caption py-2">
                        {state?.error
                          ? `Could not reach the AI (${state.error}), and no offline match was found either.`
                          : "Nothing new here yet. Everything is already saved or dismissed."}
                      </p>
                    ) : (
                      state!.suggestions.map((suggestion) => {
                        const isPending = pendingTerm === suggestion.term;
                        const isAdded = addedTerms.has(suggestion.term);

                        return (
                          <article key={`${key}:${suggestion.term}`} className="home-entry">
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
                                  {suggestion.bookTitle ?? "AI generated"}
                                </span>
                                {suggestion.seenIn.length > 0 ? (
                                  <span className="subtle-caption">
                                    seen in {suggestion.seenIn.map((entry) => `"${entry}"`).join(", ")}
                                  </span>
                                ) : suggestion.targetLanguage ? (
                                  <span className="subtle-caption">
                                    {suggestion.language} to {suggestion.targetLanguage}
                                  </span>
                                ) : null}
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
