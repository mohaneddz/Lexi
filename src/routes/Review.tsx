import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleDot,
  Flame,
  Gamepad2,
  Loader2,
  MessageSquareText,
  Search,
  SlidersHorizontal,
  Timer,
} from "lucide-react";

import { ChoicesSkeleton, ListRowsSkeleton } from "@/components/lexi/Skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenudiv,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAI } from "@/hooks/useAI";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import type { ReviewState, RevisionMode, Translation, Word } from "@/types";
import type { AnswerGrade } from "@/utils/ai-service";
import {
  buildExample,
  describeDueIn,
  getReviewStatus,
  isDue,
  nextIntervalDays,
  reviewStateOf,
  scheduleReview,
  type ReviewStatus,
} from "@/utils/review";
import { getSettings, readAiCacheEntry, writeAiCache } from "@/utils/storage";

type KindFilter = "all" | "word" | "translation";
type StatusFilter = "All" | ReviewStatus;
type SortMode = "priority" | "overdue" | "newest" | "oldest" | "alpha";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "priority", label: "Least known first" },
  { value: "overdue", label: "Most overdue" },
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "alpha", label: "A to Z" },
];

/** A word or translation pair, seen the same way by every review mode. */
type ReviewItem = {
  kind: "word" | "translation";
  id: string;
  /** What's shown: the word, or the source side of a pair. */
  prompt: string;
  /** What has to be recalled: the definition, or the translation. */
  answer: string;
  promptLanguage: string;
  answerLanguage: string;
  /** An example sentence (words) or the saved context (translations), shown with the answer. */
  extra: string;
  groupIds: string[];
  dateAdded: number;
  review: ReviewState;
};

type DailyProgress = { attempts: number; correct: number };

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "word", label: "Definitions" },
  { value: "translation", label: "Translations" },
];

const MODES: Array<{ value: RevisionMode; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "flashcard", label: "Flashcards", icon: Gamepad2 },
  { value: "multiple-choice", label: "Multiple Choice", icon: Check },
  { value: "typing", label: "Explain", icon: MessageSquareText },
];

function statusClass(status: ReviewStatus): string {
  switch (status) {
    case "Mastered":
      return "status-mastered";
    case "Learning":
      return "status-learning";
    case "New":
    default:
      return "status-new";
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function wordToItem(word: Word): ReviewItem {
  return {
    kind: "word",
    id: word.id,
    prompt: word.word,
    answer: word.definition,
    promptLanguage: word.language,
    answerLanguage: word.language,
    extra: buildExample(word),
    groupIds: word.groupIds ?? [],
    dateAdded: word.dateAdded,
    review: reviewStateOf(word),
  };
}

function translationToItem(translation: Translation): ReviewItem {
  return {
    kind: "translation",
    id: translation.id,
    prompt: translation.sourceWord,
    answer: translation.targetWord,
    promptLanguage: translation.sourceLanguage,
    answerLanguage: translation.targetLanguage,
    extra: translation.context?.trim() || translation.sourceExamples?.[0] || "",
    groupIds: translation.groupIds ?? [],
    dateAdded: translation.dateAdded,
    review: reviewStateOf(translation),
  };
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

const PROGRESS_KEY_PREFIX = "lexi:review:progress";

function todayKey(): string {
  const now = new Date();
  return `${PROGRESS_KEY_PREFIX}:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function readDailyProgress(): DailyProgress {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(todayKey()) ?? "null") as Partial<DailyProgress> | null;
    return { attempts: parsed?.attempts ?? 0, correct: parsed?.correct ?? 0 };
  } catch {
    return { attempts: 0, correct: 0 };
  }
}

function writeDailyProgress(progress: DailyProgress): void {
  try {
    window.localStorage.setItem(todayKey(), JSON.stringify(progress));
  } catch {
    // A full or blocked store only means today's count resets on reload.
  }
}

export default function Review() {
  const { words, updateWord, loading: wordsLoading } = useWords();
  const { translations, updateTranslation, loading: translationsLoading } = useTranslations();
  const { suggestDistractorDefinitions, gradeAnswer } = useAI();

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [grading, setGrading] = useState(false);
  // The verdict on an Explain answer, held on screen until you move on.
  // `null` feedback with `selfGrade` means the AI couldn't grade it (or you
  // asked to see the answer), so you mark it yourself.
  const [grade, setGrade] = useState<(AnswerGrade & { selfGrade?: boolean }) | null>(null);
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<RevisionMode>("flashcard");
  const [dailyGoal, setDailyGoal] = useState(20);
  const [now, setNow] = useState(() => Date.now());

  const [showAnswer, setShowAnswer] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [progress, setProgress] = useState<DailyProgress>(() => readDailyProgress());
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [distractorsById, setDistractorsById] = useState<Record<string, string[]>>({});
  const [mcLoading, setMcLoading] = useState(false);

  const [lightningMode, setLightningMode] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const loading = wordsLoading || translationsLoading;

  useEffect(() => {
    void getSettings().then((settings) => {
      setMode(settings.defaultRevisionMode);
      setDailyGoal(settings.dailyReviewGoal);
    });
  }, []);

  // Keeps "due" honest while the page stays open, e.g. across midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const allItems = useMemo(
    () => [...words.map(wordToItem), ...translations.map(translationToItem)],
    [translations, words],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allItems
      .filter((item) => kindFilter === "all" || item.kind === kindFilter)
      .filter((item) => statusFilter === "All" || getReviewStatus(item) === statusFilter)
      .filter((item) => groupFilterId === "none" || item.groupIds.includes(groupFilterId))
      .filter((item) => !normalizedQuery
        || item.prompt.toLowerCase().includes(normalizedQuery)
        || item.answer.toLowerCase().includes(normalizedQuery));
  }, [allItems, groupFilterId, kindFilter, query, statusFilter]);

  // By default the least-known entries come first (new, then the lowest
  // stages), newest first within each, so fresh words get attention before
  // ones that are nearly mastered.
  const queue = useMemo(() => {
    const due = filteredItems.filter((item) => isDue(item, now));
    switch (sortMode) {
      case "overdue":
        return due.sort((a, b) => a.review.dueAt - b.review.dueAt || b.dateAdded - a.dateAdded);
      case "newest":
        return due.sort((a, b) => b.dateAdded - a.dateAdded);
      case "oldest":
        return due.sort((a, b) => a.dateAdded - b.dateAdded);
      case "alpha":
        return due.sort((a, b) => a.prompt.localeCompare(b.prompt));
      default:
        return due.sort((a, b) => a.review.stage - b.review.stage || b.dateAdded - a.dateAdded);
    }
  }, [filteredItems, now, sortMode]);

  const clearAllFilters = () => {
    setQuery("");
    setKindFilter("all");
    setStatusFilter("All");
    setSortMode("priority");
  };

  const nextUpcoming = useMemo(() => {
    const upcoming = filteredItems.filter((item) => !isDue(item, now)).map((item) => item.review.dueAt);
    return upcoming.length > 0 ? Math.min(...upcoming) : null;
  }, [filteredItems, now]);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !queue.some((item) => item.id === selectedId)) {
      setSelectedId(queue[0].id);
      setShowAnswer(false);
      setTypedAnswer("");
      setGrade(null);
    }
  }, [queue, selectedId]);

  const selected = useMemo(
    () => (selectedId ? queue.find((item) => item.id === selectedId) ?? null : null),
    [queue, selectedId],
  );

  /**
   * Wrong answers for multiple choice. Translations borrow other saved
   * translations into the same language, which needs no AI. Words get
   * AI-written near-misses, saved per word, and fall back to other saved
   * definitions when the AI isn't available.
   */
  useEffect(() => {
    if (!selected || mode !== "multiple-choice" || distractorsById[selected.id]) {
      return;
    }

    const otherAnswers = shuffle(Array.from(new Set(
      allItems
        .filter((item) => item.kind === selected.kind && item.id !== selected.id && item.answerLanguage === selected.answerLanguage)
        .map((item) => item.answer)
        .filter((answer) => normalizeAnswer(answer) !== normalizeAnswer(selected.answer)),
    ))).slice(0, 3);

    if (selected.kind === "translation") {
      setDistractorsById((prev) => ({ ...prev, [selected.id]: otherAnswers }));
      return;
    }

    let cancelled = false;
    const generate = async () => {
      setMcLoading(true);
      try {
        // Only reused while the definition they were written against is unchanged.
        const cached = await readAiCacheEntry<{ definition: string; distractors: string[] }>("distractors", selected.id);
        if (cancelled) return;
        if (cached?.definition === selected.answer && cached.distractors.length === 3) {
          setDistractorsById((prev) => ({ ...prev, [selected.id]: cached.distractors }));
          return;
        }

        const result = await suggestDistractorDefinitions(selected.prompt, selected.answer, selected.answerLanguage);
        if (cancelled) return;

        const aiWorked = result.success && result.data.length === 3;
        if (aiWorked) {
          void writeAiCache("distractors", selected.id, { definition: selected.answer, distractors: result.data });
        }
        setDistractorsById((prev) => ({ ...prev, [selected.id]: aiWorked ? result.data : otherAnswers }));
      } finally {
        if (!cancelled) setMcLoading(false);
      }
    };

    void generate();
    return () => {
      cancelled = true;
    };
  }, [allItems, distractorsById, mode, selected, suggestDistractorDefinitions]);

  const options = useMemo(() => {
    if (!selected) return [] as string[];
    const distractors = distractorsById[selected.id];
    if (!distractors) return [] as string[];
    return shuffle([selected.answer, ...distractors]);
    // Shuffled once per entry, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.answer, distractorsById]);

  const mastered = useMemo(
    () => allItems.filter((item) => getReviewStatus(item) === "Mastered").length,
    [allItems],
  );

  const goalProgress = dailyGoal <= 0 ? 0 : Math.min(100, Math.round((progress.attempts / dailyGoal) * 100));

  useEffect(() => {
    if (!lightningMode) {
      return;
    }

    if (secondsLeft <= 0) {
      setLightningMode(false);
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lightningMode, secondsLeft]);

  useEffect(() => {
    const onGroupFilterChanged = (event: Event) => {
      const custom = event as CustomEvent<{ groupId?: string }>;
      if (typeof custom.detail?.groupId === "string") {
        setGroupFilterId(custom.detail.groupId);
      }
    };

    window.addEventListener("lexi:group-filter-changed", onGroupFilterChanged);
    return () => window.removeEventListener("lexi:group-filter-changed", onGroupFilterChanged);
  }, []);

  const selectItem = useCallback((id: string | null) => {
    setSelectedId(id);
    setShowAnswer(false);
    setTypedAnswer("");
    setGrade(null);
  }, []);

  const moveToNext = useCallback(() => {
    if (!selected || queue.length === 0) return;
    const currentIndex = queue.findIndex((item) => item.id === selected.id);
    const next = queue[(currentIndex + 1) % queue.length];
    selectItem(next && next.id !== selected.id ? next.id : null);
  }, [queue, selectItem, selected]);

  /** Grades the current entry, schedules its next review, and moves on. */
  const recordResult = useCallback(async (isCorrect: boolean) => {
    if (!selected) return;

    setProgress((current) => {
      const next = { attempts: current.attempts + 1, correct: current.correct + (isCorrect ? 1 : 0) };
      writeDailyProgress(next);
      return next;
    });
    setFeedback(isCorrect ? "correct" : "wrong");
    if (isCorrect) {
      setStreak((prev) => {
        const next = prev + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    } else {
      setStreak(0);
    }

    // Answered entries stop being due, so the next one is picked before
    // this one drops out of the queue.
    const answered = selected;
    moveToNext();

    setIsSaving(true);
    try {
      const review = scheduleReview(answered, isCorrect);
      if (answered.kind === "word") await updateWord(answered.id, { review });
      else await updateTranslation(answered.id, { review });
    } finally {
      setIsSaving(false);
    }
  }, [moveToNext, selected, updateTranslation, updateWord]);

  const handleChoice = (choice: string) => {
    if (!selected) return;
    void recordResult(choice === selected.answer);
  };

  /**
   * Explain mode: the AI judges your own-words answer, leniently. An exact
   * match skips the call. If grading fails you see the saved answer and
   * mark yourself, so a flaky connection never blocks a review.
   */
  const handleExplainSubmit = async () => {
    if (!selected || grading || grade) return;
    if (normalizeAnswer(typedAnswer) === normalizeAnswer(selected.answer)) {
      setGrade({ correct: true, feedback: "Spot on." });
      return;
    }

    setGrading(true);
    try {
      const result = await gradeAnswer({
        kind: selected.kind === "word" ? "definition" : "translation",
        prompt: selected.prompt,
        expected: selected.answer,
        answer: typedAnswer,
        promptLanguage: selected.promptLanguage,
        answerLanguage: selected.answerLanguage,
      });
      setGrade(result.success
        ? result.data
        : { correct: false, feedback: "Couldn't reach the AI to grade this, so compare it yourself.", selfGrade: true });
    } finally {
      setGrading(false);
    }
  };

  const revealExplainAnswer = () => {
    if (!selected || grade) return;
    setGrade({ correct: false, feedback: "", selfGrade: true });
  };

  /** Moves on from a shown verdict, recording it (or your own call, when self-grading). */
  const finishExplain = (correct: boolean) => {
    void recordResult(correct);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selected || queue.length === 0) {
        return;
      }

      if (event.key.toLowerCase() === "n" && !isTypingTarget(event.target)) {
        event.preventDefault();
        moveToNext();
        return;
      }

      // Space reveals; once revealed, 1 is Again and 2 (or Space) is I Knew It.
      if (mode === "flashcard" && !isTypingTarget(event.target) && !isSaving) {
        if (!showAnswer) {
          if (event.code === "Space") {
            event.preventDefault();
            setShowAnswer(true);
          }
        } else if (event.key === "1") {
          event.preventDefault();
          void recordResult(false);
        } else if (event.key === "2" || event.code === "Space") {
          event.preventDefault();
          void recordResult(true);
        }
      }

      if (mode === "multiple-choice" && !isTypingTarget(event.target)) {
        const idx = Number(event.key);
        if (!Number.isNaN(idx) && idx >= 1 && idx <= options.length) {
          event.preventDefault();
          handleChoice(options[idx - 1]);
        }
      }

      if (mode === "typing" && event.key === "Enter" && !event.shiftKey) {
        if (grade && !grade.selfGrade) {
          event.preventDefault();
          finishExplain(grade.correct);
        } else if (!grade && isTypingTarget(event.target)) {
          event.preventDefault();
          void handleExplainSubmit();
        }
      }
      if (mode === "typing" && grade?.selfGrade && !isTypingTarget(event.target)) {
        if (event.key === "1") {
          event.preventDefault();
          finishExplain(false);
        } else if (event.key === "2") {
          event.preventDefault();
          finishExplain(true);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const promptLabel = selected?.kind === "translation"
    ? `${selected.promptLanguage} to ${selected.answerLanguage}`
    : selected?.promptLanguage;

  return (
    <div className="grid min-h-full grid-cols-1 gap-3 xl:h-full xl:grid-cols-[1.04fr_1fr]">
      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="space-y-3 border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Revision Queue</h2>
            <span className="status-pill status-learning">{queue.length} due</span>
          </div>

          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${goalProgress}%` }} />
          </div>

          <p className="subtle-caption">
            {progress.attempts}/{dailyGoal} reviewed today. Mastered: {mastered}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="search-field-wrap min-w-[180px] flex-1">
              <Search className="search-field-icon" />
              <input
                type="search"
                className="frost-input search-field-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter revision items"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="border-white/15 bg-white/6 hover:bg-white/14" aria-label="Filters" title="Filters"><SlidersHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="custom-scrollbar max-h-[70vh] w-60 overflow-y-auto">
                <DropdownMenudiv>Sort</DropdownMenudiv>
                <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                  {SORT_OPTIONS.map((entry) => <DropdownMenuRadioItem key={entry.value} value={entry.value}>{entry.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Show</DropdownMenudiv>
                <DropdownMenuRadioGroup value={kindFilter} onValueChange={(value) => setKindFilter(value as KindFilter)}>
                  {KIND_FILTERS.map((entry) => <DropdownMenuRadioItem key={entry.value} value={entry.value}>{entry.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenudiv>Status</DropdownMenudiv>
                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  {(["All", "New", "Learning", "Mastered"] as StatusFilter[]).map((entry) => <DropdownMenuRadioItem key={entry} value={entry}>{entry}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={clearAllFilters}>Clear filters</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="table-head grid-cols-[minmax(0,1fr)_110px_26px]">
          <span>Entry</span>
          <span>Status</span>
          <span />
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <ListRowsSkeleton />
          ) : queue.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-5 text-center">
              <p className="section-title">Nothing due</p>
              <p className="subtle-caption max-w-sm">
                {nextUpcoming !== null
                  ? `You're caught up. The next review is due ${describeDueIn(nextUpcoming, now)}.`
                  : "Add words or translations and they'll show up here to review."}
              </p>
            </div>
          ) : (
            queue.map((item) => {
              const status = getReviewStatus(item);

              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  className={cn(
                    "word-row grid-cols-[minmax(0,1fr)_110px_26px]",
                    selectedId === item.id && "word-row-active",
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectItem(item.id)}
                >
                  <div className="min-w-0">
                    <p className="serif-display truncate text-[1.65rem] leading-[1.2]">{item.prompt}</p>
                    <p className="word-sub mt-1.5 flex min-w-0 items-center gap-1.5 truncate text-sm">
                      {item.kind === "translation" ? <ArrowRight className="size-3 shrink-0" /> : null}
                      <span className="truncate">{item.answer}</span>
                    </p>
                  </div>

                  <span className={cn("status-pill", statusClass(status))}>{status}</span>
                  <CircleDot className="size-4 text-muted-foreground" />
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 p-2">
          <span className="sync-pill">
            <Flame className="size-3" />
            Streak {streak} (Best {bestStreak})
          </span>
          <span className="shortcut-hint subtle-caption inline-flex items-center gap-1.5">
            {mode === "flashcard" ? (
              showAnswer ? (
                <>
                  <kbd className="key-cap">1</kbd> again
                  <kbd className="key-cap ml-1.5">2</kbd> knew it
                </>
              ) : (
                <>
                  <kbd className="key-cap">Space</kbd> reveal
                </>
              )
            ) : mode === "multiple-choice" ? (
              <>
                <kbd className="key-cap">1</kbd>-<kbd className="key-cap">4</kbd> choose
              </>
            ) : (
              <>
                <kbd className="key-cap">Enter</kbd> {grade ? "next" : "check"}
              </>
            )}
            <kbd className="key-cap ml-1.5">N</kbd> skip
          </span>
        </div>
      </section>

      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        {selected ? (
          <>
            <div className="space-y-3 border-b border-white/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {MODES.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.value}
                        type="button"
                        className="lexi-toggle"
                        aria-pressed={mode === entry.value}
                        onClick={() => {
                          setMode(entry.value);
                          setShowAnswer(false);
                          setTypedAnswer("");
                          setGrade(null);
                        }}
                      >
                        <Icon className="size-3.5" />
                        {entry.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="lexi-toggle"
                  aria-pressed={lightningMode}
                  onClick={() => {
                    if (lightningMode) {
                      setLightningMode(false);
                    } else {
                      setSecondsLeft(60);
                      setLightningMode(true);
                    }
                  }}
                >
                  <Timer className="size-3.5" />
                  {lightningMode ? `${secondsLeft}s` : "Lightning 60s"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={cn("status-pill", feedback === "correct" ? "status-mastered" : feedback === "wrong" ? "status-new" : "status-learning")}>
                  {feedback === "correct" ? "Correct" : feedback === "wrong" ? "Missed" : "In progress"}
                </span>
                <span className="subtle-caption">
                  Accuracy today: {progress.attempts === 0 ? 0 : Math.round((progress.correct / progress.attempts) * 100)}%
                </span>
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <span className="lexi-chip compact">{selected.kind === "word" ? "Definition" : "Translation"}</span>
                <span className="lexi-chip compact">{promptLabel}</span>
              </div>

              {mode === "flashcard" ? (
                <div className="space-y-6">
                  <h2 className="detail-title">{selected.prompt}</h2>

                  {showAnswer ? (
                    <>
                      <p className="detail-text">{selected.answer}</p>
                      {selected.extra ? (
                        <p className="serif-display text-2xl italic text-muted-foreground">{selected.extra}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="serif-display text-3xl text-muted-foreground">
                      {selected.kind === "word" ? "Recall the meaning, then reveal it." : `Recall it in ${selected.answerLanguage}, then reveal it.`}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!showAnswer ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 bg-white/6 hover:bg-white/14"
                        onClick={() => setShowAnswer(true)}
                      >
                        Reveal
                        <kbd className="key-cap ml-2">Space</kbd>
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSaving}
                          className="border-white/15 bg-white/6 hover:bg-white/14"
                          onClick={() => void recordResult(false)}
                        >
                          Again
                          <kbd className="key-cap ml-2">1</kbd>
                        </Button>
                        <Button
                          type="button"
                          disabled={isSaving}
                          className="lexi-btn-primary"
                          onClick={() => void recordResult(true)}
                        >
                          <Check className="mr-2 size-4" />
                          I Knew It
                          <kbd className="key-cap ml-2">2</kbd>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {mode === "multiple-choice" ? (
                <div className="space-y-6">
                  <h2 className="detail-title">{selected.prompt}</h2>
                  <p className="subtle-caption">
                    {selected.kind === "word" ? "Choose the matching definition:" : `Choose the ${selected.answerLanguage} translation:`}
                  </p>

                  {mcLoading || options.length === 0 ? (
                    <ChoicesSkeleton />
                  ) : options.length < 2 ? (
                    <p className="subtle-caption">
                      Not enough other {selected.kind === "word" ? "definitions" : `${selected.answerLanguage} translations`} to build choices from yet. Try flashcards for this one.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {options.map((option, index) => (
                        <button
                          key={`${selected.id}-${index}`}
                          type="button"
                          className="frost-panel-soft w-full p-3 text-left transition-colors hover:bg-white/10"
                          onClick={() => handleChoice(option)}
                        >
                          <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {mode === "typing" ? (
                <div className="space-y-6">
                  <h2 className="detail-title">{selected.prompt}</h2>
                  <p className="subtle-caption">
                    {selected.kind === "word"
                      ? "Explain what it means in your own words. The gist is enough."
                      : `Translate it into ${selected.answerLanguage}. Close variants count.`}
                  </p>

                  {selected.kind === "word" ? (
                    <textarea
                      className="frost-input form-textarea"
                      value={typedAnswer}
                      onChange={(event) => setTypedAnswer(event.target.value)}
                      placeholder="It means..."
                      rows={3}
                      disabled={grading || grade !== null}
                      autoFocus
                    />
                  ) : (
                    <input
                      className="frost-input"
                      value={typedAnswer}
                      onChange={(event) => setTypedAnswer(event.target.value)}
                      placeholder={`The ${selected.answerLanguage} translation`}
                      disabled={grading || grade !== null}
                      autoFocus
                    />
                  )}

                  {grading ? (
                    <div className="frost-panel-soft space-y-2.5 p-4" aria-busy>
                      <Skeleton className="h-5 w-24 rounded-full bg-white/8" />
                      <Skeleton className="h-4 w-full bg-white/8" />
                      <Skeleton className="h-4 w-2/3 bg-white/8" />
                    </div>
                  ) : grade ? (
                    <div className="frost-panel-soft space-y-3 p-4">
                      {grade.selfGrade ? null : (
                        <span className={cn("status-pill w-fit", grade.correct ? "status-mastered" : "status-new")}>
                          {grade.correct ? "Got it" : "Not quite"}
                        </span>
                      )}
                      {grade.feedback ? <p className="word-sub">{grade.feedback}</p> : null}
                      <div className="space-y-1">
                        <p className="subtle-caption">Saved answer</p>
                        <p className="serif-display text-2xl italic text-muted-foreground">{selected.answer}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {grade?.selfGrade ? (
                      <>
                        <Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => finishExplain(false)}>
                          I missed it
                          <kbd className="key-cap ml-2">1</kbd>
                        </Button>
                        <Button type="button" className="lexi-btn-primary" onClick={() => finishExplain(true)}>
                          <Check className="mr-2 size-4" />
                          I had it
                          <kbd className="key-cap ml-2">2</kbd>
                        </Button>
                      </>
                    ) : grade ? (
                      <Button type="button" className="lexi-btn-primary" onClick={() => finishExplain(grade.correct)}>
                        Next
                        <kbd className="key-cap ml-2">Enter</kbd>
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/15 bg-white/6 hover:bg-white/14"
                          disabled={grading}
                          onClick={revealExplainAnswer}
                        >
                          Show answer
                        </Button>
                        <Button
                          type="button"
                          className="lexi-btn-primary"
                          disabled={grading || !typedAnswer.trim()}
                          onClick={() => void handleExplainSubmit()}
                        >
                          {grading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                          Check
                          <kbd className="key-cap ml-2">Enter</kbd>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 p-2">
              <span className="subtle-caption px-1">
                {selected.review.stage === 0
                  ? "First review"
                  : `Stage ${selected.review.stage}, missed ${selected.review.lapses ?? 0} times`}
                {` · a right answer brings it back in ${nextIntervalDays(selected)} ${nextIntervalDays(selected) === 1 ? "day" : "days"}`}
              </span>
              <span className="sync-pill">
                <Flame className="size-3" />
                {progress.correct}/{progress.attempts} correct today
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <h2 className="section-title">Nothing to review</h2>
            <p className="subtle-caption mt-2 max-w-sm">
              {nextUpcoming !== null
                ? `Everything is reviewed for now. Come back ${describeDueIn(nextUpcoming, now)}.`
                : "Save a word or translation and it'll be ready to review straight away."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
