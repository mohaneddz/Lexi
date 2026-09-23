import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Loader2, Plus, RefreshCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useBooks } from "@/hooks/useBooks";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { getGroupIcon } from "@/lib/group-icons";
import type { AppSettings, LexiGroup } from "@/types";
import { getSettings, readAiCache, writeAiCache } from "@/utils/storage";
import { getReviewStatus } from "@/utils/review";
import {
  buildFallbackDefinitionSuggestions,
  buildFallbackTranslationSuggestions,
  knownTerms,
  type Suggestion,
  type SuggestionKind,
} from "@/utils/wordSuggestions";

const DISMISSED_KEY_PREFIX = "lexi:home:dismissed";
const DEFAULT_PER_SECTION = 4;

type SectionKey = string;

type SectionState = {
  suggestions: Suggestion[];
  loading: boolean;
  /** False once a fallback (or empty AI result) means this section stopped trying the AI. */
  usedAi: boolean;
  error: string | null;
  /** How many suggestions this section was asked for, so raising the setting regenerates it. */
  requested: number;
};

/** What's saved to the AI cache, so a section survives restarts without regenerating. */
type CachedSection = { suggestions: Suggestion[]; usedAi: boolean; requested?: number };

type LanguagePrefs = { definition: string; source: string; target: string };

// Translation sections are keyed by language pair too, so changing the
// defaults in Settings brings up fresh ones instead of stale pairs.
function sectionKey(kind: SuggestionKind, group: LexiGroup, languages: LanguagePrefs): SectionKey {
  return kind === "definition"
    ? `definition:${group.id}:${languages.definition}`
    : `translation:${group.id}:${languages.source}>${languages.target}`;
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
  const { translations, addTranslation, loading: translationsLoading } = useTranslations();
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
  const [languages, setLanguages] = useState<LanguagePrefs | null>(null);
  const [cache, setCache] = useState<Record<SectionKey, CachedSection> | null>(null);
  const [perSection, setPerSection] = useState(DEFAULT_PER_SECTION);

  // Tracks every term shown anywhere this session, so a refresh on one
  // section — or generating a later group — doesn't repeat a word another
  // section already offered.
  const shownTermsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void getSettings().then((settings) => {
      setPerSection(settings.homeSuggestionCount);
      setLanguages({
        definition: settings.defaultDefinitionLanguage,
        source: settings.defaultTranslationSourceLanguage,
        target: settings.defaultTranslationTargetLanguage,
      });
    });
    const onSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AppSettings>>).detail;
      if (typeof detail?.homeSuggestionCount === "number") setPerSection(detail.homeSuggestionCount);
      setLanguages((current) => current && ({
        definition: detail?.defaultDefinitionLanguage ?? current.definition,
        source: detail?.defaultTranslationSourceLanguage ?? current.source,
        target: detail?.defaultTranslationTargetLanguage ?? current.target,
      }));
    };
    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  useEffect(() => {
    void readAiCache<CachedSection>("homeSuggestions").then((entries) => {
      for (const entry of Object.values(entries)) {
        for (const suggestion of entry.suggestions) shownTermsRef.current.add(suggestion.term.toLowerCase());
      }
      setCache(entries);
    });
  }, []);

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

  // Others also collects anything that isn't in a visible group, so words
  // saved without a group still feed a section.
  const scopeWords = useCallback((group: LexiGroup) => {
    if (!group.isOthers) return words.filter((word) => (word.groupIds || []).includes(group.id));
    const regularIds = new Set(groups.filter((entry) => !entry.isOthers).map((entry) => entry.id));
    return words.filter((word) => {
      const ids = word.groupIds || [];
      return ids.includes(group.id) || !ids.some((id) => regularIds.has(id));
    });
  }, [groups, words]);

  const findDefinition = useCallback((term: string) => {
    const [best] = lookup(term, { bookType: "dictionary", fuzzy: false });
    if (!best) return null;
    return { definition: best.output, bookTitle: best.bookTitle };
  }, [lookup]);

  const findTranslation = useCallback((term: string, source: string, target: string) => {
    const normalized = term.trim().toLowerCase();
    // The books are searchable from either side, so a pair stored as
    // target -> source still answers a source -> target lookup.
    for (const result of lookup(term, { bookType: "translation", fuzzy: false })) {
      if (result.inputLanguage === source && result.outputLanguage === target && result.input.trim().toLowerCase() === normalized) {
        return { targetWord: result.output, targetLanguage: target, bookTitle: result.bookTitle };
      }
      if (result.inputLanguage === target && result.outputLanguage === source && result.output.trim().toLowerCase() === normalized) {
        return { targetWord: result.input, targetLanguage: target, bookTitle: result.bookTitle };
      }
    }
    return null;
  }, [lookup]);

  /**
   * Generates one section: tries the AI first, few-shotted with the group's
   * own words, grounding each returned term in an enabled book when one has
   * it. Falls back to the offline term-mining approach — same one used
   * before AI suggestions existed — whenever the AI is unavailable, errors,
   * or returns nothing usable, so the page still works with no API key.
   * Results are saved, so a section only costs AI quota once until it's
   * refreshed by hand.
   */
  const generateSection = useCallback(async (
    generateKind: SuggestionKind,
    group: LexiGroup,
    options: { force?: boolean } = {},
  ) => {
    if (!languages) return;
    const key = sectionKey(generateKind, group, languages);
    const currentDismissed = generateKind === "definition" ? dismissedDefinitions : dismissedTranslations;
    const language = generateKind === "definition" ? languages.definition : languages.source;
    const targetLanguage = languages.target;

    setSections((current) => ({
      ...current,
      [key]: {
        suggestions: current[key]?.suggestions ?? [],
        loading: true,
        usedAi: current[key]?.usedAi ?? true,
        error: null,
        requested: perSection,
      },
    }));

    const previouslyShown = options.force ? new Set(sections[key]?.suggestions.map((s) => s.term.toLowerCase()) ?? []) : new Set<string>();
    const exclude = new Set<string>([...shownTermsRef.current, ...previouslyShown]);

    const groupWords = scopeWords(group);
    const groupTranslations = translations.filter((translation) => (translation.groupIds || []).includes(group.id));

    const runFallback = (): Suggestion[] => {
      // Others with nothing of its own mines the whole vocabulary instead,
      // which is what the old catch-all section did.
      const scopedWords = group.isOthers && groupWords.length === 0 ? words : groupWords;
      if (generateKind === "definition") {
        return buildFallbackDefinitionSuggestions({
          words, scopedWords, dismissed: currentDismissed, findDefinition, exclude, limit: perSection,
        });
      }
      return buildFallbackTranslationSuggestions({
        words,
        translations,
        scopedWords,
        sourceLanguage: language,
        targetLanguage,
        dismissed: currentDismissed,
        findTranslation: (term) => findTranslation(term, language, targetLanguage),
        exclude,
        limit: perSection,
      });
    };

    let picked: Suggestion[] = [];
    let usedAi = false;
    let error: string | null = null;

    const exampleWords = Array.from(new Set([
      ...groupWords.filter((word) => word.language === language).map((word) => word.word),
      ...groupTranslations.filter((translation) => translation.sourceLanguage === language).map((translation) => translation.sourceWord),
      ...groupWords.map((word) => word.word),
    ])).slice(0, 6);

    // Others has no theme of its own, so the AI only gets a go once it holds
    // some words to few-shot on; a regular group can be judged by its name.
    if (!group.isOthers || exampleWords.length > 0) {
      const known = knownTerms(words);
      for (const translation of translations) {
        if (translation.sourceLanguage === language) known.add(translation.sourceWord.trim().toLowerCase());
      }

      const result = await suggestGroupWords({
        groupName: group.name,
        groupDescription: group.description,
        language,
        exampleWords,
        excludeWords: [...known, ...exclude, ...currentDismissed],
        count: perSection + 2,
      });

      if (result.success && result.data.length > 0) {
        usedAi = true;
        for (const term of result.data) {
          if (picked.length >= perSection) break;
          const normalized = term.toLowerCase();
          // Checks the live ref, not the snapshot taken before the AI call,
          // so a sibling group that claimed this term while this one was
          // waiting on the network is still caught.
          if (known.has(normalized) || shownTermsRef.current.has(normalized) || currentDismissed.has(normalized)) continue;

          // Claimed immediately, not after the pick, so a sibling group
          // generating at the same time can't land on the same term while
          // this one is still mid-lookup.
          shownTermsRef.current.add(normalized);

          if (generateKind === "definition") {
            const found = findDefinition(term);
            if (found) {
              picked.push({ term, detail: found.definition, bookTitle: found.bookTitle, language, seenIn: [] });
              continue;
            }
            // No enabled book has this term, so the AI defines just this
            // one word rather than dropping it; it chose it for this group.
            const defined = await defineWord(term, language);
            if (defined.success && defined.data) {
              picked.push({ term, detail: defined.data, language, seenIn: [] });
            }
            continue;
          }

          const found = findTranslation(term, language, targetLanguage);
          if (found) {
            picked.push({ term, detail: found.targetWord, bookTitle: found.bookTitle, language, targetLanguage, seenIn: [] });
            continue;
          }
          const translated = await translate(term, language, targetLanguage);
          if (translated.success && translated.data) {
            picked.push({ term, detail: translated.data, language, targetLanguage, seenIn: [] });
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

    const finalError = picked.length === 0 ? error : null;
    setSections((current) => ({
      ...current,
      [key]: { suggestions: picked, loading: false, usedAi, error: finalError, requested: perSection },
    }));

    // A failed AI call isn't saved, so the section tries again next visit.
    if (!finalError) {
      const entry: CachedSection = { suggestions: picked, usedAi, requested: perSection };
      setCache((current) => ({ ...(current ?? {}), [key]: entry }));
      void writeAiCache("homeSuggestions", key, entry);
    }
  }, [
    defineWord, dismissedDefinitions, dismissedTranslations, findDefinition, findTranslation, languages,
    perSection, scopeWords, sections, suggestGroupWords, translate, translations, words,
  ]);

  const generateSectionRef = useRef(generateSection);
  generateSectionRef.current = generateSection;

  // Every group gets a section, empty ones included, since the AI can work
  // from a group's name and description alone. Others is already last.
  const visibleGroups = useMemo(
    () => (groupFilterId === "none" ? groups : groups.filter((group) => group.id === groupFilterId)),
    [groupFilterId, groups],
  );

  const sameTranslationLanguages = kind === "translation" && languages !== null && languages.source === languages.target;
  const ready = !wordsLoading && !translationsLoading && !groupsLoading && !booksLoading && languages !== null && cache !== null;

  useEffect(() => {
    if (!ready || !languages || !cache || enabledBookIds.length === 0 || sameTranslationLanguages) return;

    for (const group of visibleGroups) {
      const key = sectionKey(kind, group, languages);
      // Lowering the count just shows fewer of what's already there; only
      // raising it past what a section was generated with asks the AI again.
      if (sections[key] && sections[key].requested >= perSection) continue;
      const cached = cache[key];
      const cachedRequested = cached?.requested ?? DEFAULT_PER_SECTION;
      if (cached && cachedRequested >= perSection && !sections[key]) {
        setSections((current) => ({ ...current, [key]: { ...cached, loading: false, error: null, requested: cachedRequested } }));
        continue;
      }
      if (sections[key]?.loading) continue;
      void generateSectionRef.current(kind, group);
    }
    // Only re-run when the set of sections that should exist changes, not on
    // every generateSection identity change (it closes over `sections`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visibleGroups, languages, ready, enabledBookIds.length, sameTranslationLanguages, perSection]);

  const dueCount = useMemo(
    () => words.filter((word) => getReviewStatus(word) !== "Mastered").length,
    [words],
  );

  const activeGroup = groups.find((group) => group.id === groupFilterId) ?? null;

  // Suggestions saved from another page (or a previous session) drop out of
  // their section rather than lingering, except the ones added right here,
  // which stay put with an "Added" badge.
  const savedTerms = useMemo(() => {
    const saved = new Set<string>();
    if (kind === "definition") {
      for (const word of words) saved.add(word.word.trim().toLowerCase());
    } else if (languages) {
      for (const translation of translations) {
        if (translation.sourceLanguage === languages.source && translation.targetLanguage === languages.target) {
          saved.add(translation.sourceWord.trim().toLowerCase());
        }
      }
    }
    return saved;
  }, [kind, languages, translations, words]);

  const visibleSuggestions = (state: SectionState | undefined) => {
    const dismissed = kind === "definition" ? dismissedDefinitions : dismissedTranslations;
    return (state?.suggestions ?? []).filter((suggestion) => {
      const normalized = suggestion.term.trim().toLowerCase();
      if (addedTerms.has(suggestion.term)) return true;
      return !dismissed.has(normalized) && !savedTerms.has(normalized);
    }).slice(0, perSection);
  };

  const handleAdd = async (suggestion: Suggestion, group: LexiGroup) => {
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
          groupIds: [group.id],
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
          groupIds: [group.id],
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

  const loading = !ready;
  const sectionList = languages
    ? visibleGroups.map((group) => ({ group, key: sectionKey(kind, group, languages) }))
    : [];
  const anySectionHasSuggestions = sectionList.some((entry) => visibleSuggestions(sections[entry.key]).length > 0);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto">
      <div className="home-stage animate-slide-in-up">
        <header className="home-masthead">
          <div className="min-w-0">
            <h1 className="home-greeting">{greetingFor(new Date())}</h1>
            <p className="subtle-caption mt-2">
              {kind === "definition"
                ? "Words drawn from your groups, suggested by AI and grounded in your books."
                : languages
                  ? `Words for your groups, translated from ${languages.source} to ${languages.target}.`
                  : "Words for your groups, with their translations."}
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
        ) : sameTranslationLanguages ? (
          <EmptyNote
            title={`Both translation defaults are ${languages?.source}`}
            body="Translation suggestions go from your source default to your target default, so pick two different languages first."
            actionLabel="Open Settings"
            onAction={() => navigate("/settings")}
          />
        ) : sectionList.length === 0 ? (
          <EmptyNote
            title="Create a group first"
            body="Suggestions are made per group, so there is nothing to suggest for until at least one exists."
            actionLabel="Open Groups"
            onAction={() => navigate("/groups")}
          />
        ) : (
          <>
            {!anySectionHasSuggestions && sectionList.every((entry) => sections[entry.key] && !sections[entry.key].loading) ? (
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
              const suggestions = visibleSuggestions(state);
              const RailIcon = getGroupIcon(group.iconName);
              const title = group.name;
              const reason = state?.usedAi
                ? (group.isOthers ? "AI suggestions matched to words outside your other groups" : `AI suggestions matched to your ${group.name} words`)
                : group.isOthers
                  ? (kind === "definition"
                    ? "Showing up again and again in words you have already saved"
                    : "Saved words still waiting for a translation")
                  : (kind === "definition"
                    ? `Turning up in the definitions of your ${group.name} words`
                    : `${group.name} words still waiting for a translation`);

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
                    {state?.loading && suggestions.length === 0 ? (
                      <p className="subtle-caption py-2">Thinking of words for {title}...</p>
                    ) : suggestions.length === 0 ? (
                      <p className="subtle-caption py-2">
                        {state?.error
                          ? `Could not reach the AI (${state.error}), and no offline match was found either.`
                          : "Nothing new here yet. Everything is already saved or dismissed."}
                      </p>
                    ) : (
                      suggestions.map((suggestion) => {
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
                                    onClick={() => void handleAdd(suggestion, group)}
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
