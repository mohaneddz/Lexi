import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleDot,
  Flame,
  Gamepad2,
  Keyboard,
  Search,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import { buildExample, getReviewStatus, setReviewStatus, type ReviewStatus } from "@/utils/review";
import { getSettings } from "@/utils/storage";
import type { RevisionMode } from "@/types";

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

const MODES: Array<{ value: RevisionMode; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "flashcard", label: "Flashcards", icon: Gamepad2 },
  { value: "multiple-choice", label: "Multiple Choice", icon: Check },
  { value: "typing", label: "Typing", icon: Keyboard },
];

export default function Review() {
  const { words, updateWord, loading } = useWords();
  const { suggestDistractorDefinitions } = useAI();

  const [query, setQuery] = useState("");
  const [groupFilterId, setGroupFilterId] = useState("none");
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<RevisionMode>("flashcard");
  const [dailyGoal, setDailyGoal] = useState(20);

  const [showAnswer, setShowAnswer] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [mcOptionsByWordId, setMcOptionsByWordId] = useState<Record<string, string[]>>({});
  const [mcLoading, setMcLoading] = useState(false);

  const [lightningMode, setLightningMode] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    getSettings().then((settings) => {
      setMode(settings.defaultRevisionMode);
      setDailyGoal(settings.dailyReviewGoal);
    });
  }, []);

  const queue = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return words
      .filter((word) => getReviewStatus(word) !== "Mastered")
      .filter((word) => groupFilterId === "none" || (word.groupIds || []).includes(groupFilterId))
      .filter((word) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          word.word.toLowerCase().includes(normalizedQuery) ||
          word.definition.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => a.dateAdded - b.dateAdded);
  }, [groupFilterId, query, words]);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedWordId(null);
      return;
    }

    if (!selectedWordId || !queue.some((word) => word.id === selectedWordId)) {
      setSelectedWordId(queue[0].id);
      setShowAnswer(false);
      setTypedAnswer("");
      setFeedback("idle");
    }
  }, [queue, selectedWordId]);

  const selectedWord = useMemo(() => {
    if (!selectedWordId) {
      return null;
    }

    return queue.find((word) => word.id === selectedWordId) ?? null;
  }, [queue, selectedWordId]);

  const options = useMemo(() => {
    if (!selectedWord) {
      return [] as string[];
    }

    const distractors = mcOptionsByWordId[selectedWord.id] ?? [];
    const values = [selectedWord.definition, ...distractors];
    return values.sort(() => Math.random() - 0.5);
  }, [mcOptionsByWordId, selectedWord]);

  useEffect(() => {
    if (!selectedWord || mode !== "multiple-choice") {
      return;
    }

    if ((mcOptionsByWordId[selectedWord.id] || []).length === 3) {
      return;
    }

    let cancelled = false;

    const createFallbackDistractors = () => {
      const base = selectedWord.definition.trim();
      return [
        `A minor variation of "${selectedWord.word}" used only in formal legal writing.`,
        `A broader concept often confused with "${selectedWord.word}", but with weaker intensity.`,
        `A contextual meaning of "${selectedWord.word}" tied only to historical documents.`,
      ].filter((item) => item.toLowerCase() !== base.toLowerCase()).slice(0, 3);
    };

    const generate = async () => {
      setMcLoading(true);
      try {
        const result = await suggestDistractorDefinitions(
          selectedWord.word,
          selectedWord.definition,
          selectedWord.language,
        );

        if (cancelled) {
          return;
        }

        const distractors =
          result.success && result.data.length === 3
            ? result.data
            : createFallbackDistractors();

        setMcOptionsByWordId((prev) => ({
          ...prev,
          [selectedWord.id]: distractors,
        }));
      } finally {
        if (!cancelled) {
          setMcLoading(false);
        }
      }
    };

    void generate();

    return () => {
      cancelled = true;
    };
  }, [mcOptionsByWordId, mode, selectedWord, suggestDistractorDefinitions]);

  const totalMastered = useMemo(
    () => words.filter((word) => getReviewStatus(word) === "Mastered").length,
    [words],
  );

  const goalProgress = dailyGoal <= 0 ? 0 : Math.min(100, Math.round((attempts / dailyGoal) * 100));

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

  const moveToNextWord = () => {
    if (!selectedWord || queue.length === 0) {
      return;
    }

    const currentIndex = queue.findIndex((word) => word.id === selectedWord.id);
    const nextIndex = currentIndex >= queue.length - 1 ? 0 : currentIndex + 1;
    setSelectedWordId(queue[nextIndex].id);
    setShowAnswer(false);
    setTypedAnswer("");
    setFeedback("idle");
  };

  const markStatus = async (status: ReviewStatus) => {
    if (!selectedWord) {
      return;
    }

    setIsSaving(true);
    try {
      await updateWord(selectedWord.id, {
        tags: setReviewStatus(selectedWord.tags, status),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const recordResult = async (isCorrect: boolean) => {
    setAttempts((prev) => prev + 1);

    if (isCorrect) {
      setCorrect((prev) => prev + 1);
      setStreak((prev) => {
        const next = prev + 1;
        setBestStreak((current) => Math.max(current, next));
        return next;
      });
      setFeedback("correct");

      if (selectedWord) {
        const nextStatus: ReviewStatus = getReviewStatus(selectedWord) === "Learning" ? "Mastered" : "Learning";
        await markStatus(nextStatus);
      }
    } else {
      setStreak(0);
      setFeedback("wrong");

      if (selectedWord) {
        await markStatus("New");
      }
    }
  };

  const handleFlashcardKnown = async (known: boolean) => {
    await recordResult(known);
    setTimeout(() => moveToNextWord(), 220);
  };

  const handleChoice = async (choice: string) => {
    if (!selectedWord) {
      return;
    }

    const isCorrect = choice === selectedWord.definition;
    await recordResult(isCorrect);
    setTimeout(() => moveToNextWord(), 220);
  };

  const handleTypingSubmit = async () => {
    if (!selectedWord) {
      return;
    }

    const isCorrect = normalizeAnswer(typedAnswer) === normalizeAnswer(selectedWord.word);
    await recordResult(isCorrect);
    setTimeout(() => moveToNextWord(), 260);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedWord || queue.length === 0) {
        return;
      }

      if (event.key.toLowerCase() === "n" && !isTypingTarget(event.target)) {
        event.preventDefault();
        moveToNextWord();
        return;
      }

      if (mode === "flashcard") {
        if (event.code === "Space" && !isTypingTarget(event.target)) {
          event.preventDefault();
          if (!showAnswer) {
            setShowAnswer(true);
          } else {
            void handleFlashcardKnown(true);
          }
        }
      }

      if (mode === "multiple-choice" && !isTypingTarget(event.target)) {
        const idx = Number(event.key);
        if (!Number.isNaN(idx) && idx >= 1 && idx <= options.length) {
          event.preventDefault();
          void handleChoice(options[idx - 1]);
        }
      }

      if (mode === "typing" && event.key === "Enter" && isTypingTarget(event.target)) {
        event.preventDefault();
        void handleTypingSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, options, queue.length, selectedWord, showAnswer, typedAnswer]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-[1.04fr_1fr]">
      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="space-y-3 border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Revision Queue</h2>
            <span className="status-pill status-learning">{queue.length} due</span>
          </div>

          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${goalProgress}%` }} />
          </div>

          <p className="subtle-caption">{attempts}/{dailyGoal} toward daily revision goal. Mastered: {totalMastered}</p>

          <div className="search-field-wrap">
            <Search className="search-field-icon" />
            <input
              type="search"
              className="frost-input search-field-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter revision items"
            />
          </div>
        </div>

        <div className="table-head grid-cols-[minmax(0,1fr)_110px_26px]">
          <span>Word</span>
          <span>Status</span>
          <span />
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4].map((index) => (
                <div key={index} className="h-14 rounded-lg bg-white/6" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-5 text-center">
              <p className="section-title">Queue clear</p>
              <p className="subtle-caption max-w-sm">
                Every tracked word is mastered, or your filters are hiding results.
              </p>
            </div>
          ) : (
            queue.map((word) => {
              const status = getReviewStatus(word);

              return (
                <div
                  key={word.id}
                  className={cn(
                    "word-row grid-cols-[minmax(0,1fr)_110px_26px]",
                    selectedWordId === word.id && "word-row-active",
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedWordId(word.id);
                    setShowAnswer(false);
                    setTypedAnswer("");
                    setFeedback("idle");
                  }}
                >
                  <div className="min-w-0">
                    <p className="serif-display truncate text-[1.65rem] leading-[0.9]">{word.word}</p>
                    <p className="word-sub mt-1.5 truncate text-sm">{word.definition}</p>
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
          <span className="subtle-caption">`Space` reveal, `N` skip, `1-4` choose</span>
        </div>
      </section>

      <section className="frost-panel flex min-h-0 flex-col overflow-hidden animate-slide-in-up">
        {selectedWord ? (
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
                        className={cn(
                          "lexi-chip transition-colors",
                          mode === entry.value && "border-white/28 bg-white/16 text-foreground",
                        )}
                        onClick={() => {
                          setMode(entry.value);
                          setShowAnswer(false);
                          setTypedAnswer("");
                          setFeedback("idle");
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
                  className={cn(
                    "lexi-chip transition-colors",
                    lightningMode && "border-white/28 bg-white/16 text-foreground",
                  )}
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

              <div className="flex items-center gap-2 text-sm">
                <span className={cn("status-pill", feedback === "correct" ? "status-mastered" : feedback === "wrong" ? "status-new" : "status-learning")}>
                  {feedback === "correct" ? "Correct" : feedback === "wrong" ? "Missed" : "In progress"}
                </span>
                <span className="subtle-caption">Accuracy: {attempts === 0 ? 0 : Math.round((correct / attempts) * 100)}%</span>
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
              {mode === "flashcard" ? (
                <div className="space-y-6">
                  <h2 className="detail-title">{selectedWord.word}</h2>

                  {showAnswer ? (
                    <>
                      <p className="detail-text">{selectedWord.definition}</p>
                      {buildExample(selectedWord) ? (
                        <p className="serif-display text-2xl italic text-muted-foreground">{buildExample(selectedWord)}</p>
                      ) : (
                        <p className="subtle-caption">No examples yet for this word.</p>
                      )}
                    </>
                  ) : (
                    <p className="serif-display text-3xl text-muted-foreground">Press Space or Reveal to show definition.</p>
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
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSaving}
                          className="border-white/15 bg-white/6 hover:bg-white/14"
                          onClick={() => void handleFlashcardKnown(false)}
                        >
                          Again
                        </Button>
                        <Button
                          type="button"
                          disabled={isSaving}
                          className="border border-white/20 bg-white/16 hover:bg-white/22"
                          onClick={() => void handleFlashcardKnown(true)}
                        >
                          <Check className="mr-2 size-4" />
                          I Knew It
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {mode === "multiple-choice" ? (
                <div className="space-y-6">
                  <h2 className="detail-title">{selectedWord.word}</h2>
                  <p className="subtle-caption">Choose the matching definition:</p>

                  {mcLoading && options.length < 4 ? (
                    <p className="subtle-caption">Generating close distractors with AI...</p>
                  ) : (
                    <div className="space-y-2">
                      {options.map((option, index) => (
                        <button
                          key={`${selectedWord.id}-${index}`}
                          type="button"
                          className="frost-panel-soft w-full p-3 text-left transition-colors hover:bg-white/10"
                          onClick={() => void handleChoice(option)}
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
                  <h2 className="detail-title">Type The Word</h2>
                  <p className="serif-display text-3xl text-muted-foreground">{selectedWord.definition}</p>

                  <input
                    className="frost-input"
                    value={typedAnswer}
                    onChange={(event) => setTypedAnswer(event.target.value)}
                    placeholder="Type the matching word"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 bg-white/6 hover:bg-white/14"
                      onClick={() => setTypedAnswer(selectedWord.word)}
                    >
                      Show answer
                    </Button>
                    <Button
                      type="button"
                      className="border border-white/20 bg-white/16 hover:bg-white/22"
                      onClick={() => void handleTypingSubmit()}
                    >
                      Submit
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 p-2">
              <span className="sync-pill">
                <CircleDot className="size-3" />
                Revision synced
              </span>
              <span className="sync-pill">
                <Flame className="size-3" />
                {correct}/{attempts} correct
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <h2 className="section-title">Nothing to review</h2>
            <p className="subtle-caption mt-2 max-w-sm">
              Add words and mark them as New/Learning to start revision modes and minigames.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
