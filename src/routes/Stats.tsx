import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BookOpenText, Globe2, Languages, Loader2, Tags } from "lucide-react";

import { useAI } from "@/hooks/useAI";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import type { Translation, Word } from "@/types";
import { formatDate } from "@/utils/formatters";
import { descriptiveTags, tagVocabulary } from "@/utils/tags";

/** Entries per AI request. Tagging is light work, so batches can be bigger than Organize's. */
const AUTO_TAG_BATCH_SIZE = 20;

export default function Stats() {
  const { words, updateWords } = useWords();
  const { translations, updateTranslations } = useTranslations();
  const { suggestTagsBatch } = useAI();

  const [tagging, setTagging] = useState(false);
  const [tagProgress, setTagProgress] = useState<{ done: number; total: number } | null>(null);
  const [tagSummary, setTagSummary] = useState<string | null>(null);

  const untaggedCount = useMemo(
    () => words.filter((word) => descriptiveTags(word.tags).length === 0).length
      + translations.filter((translation) => descriptiveTags(translation.tags).length === 0).length,
    [translations, words],
  );

  /**
   * Tags every word and translation that has no descriptive tags yet, in
   * batches, reusing the tags already in use so the vocabulary stays tidy.
   * Each batch is saved as it lands, so stopping halfway keeps the work done.
   */
  const runAutoTag = useCallback(async () => {
    if (tagging) return;

    type PendingItem =
      | { kind: "word"; entry: Word; label: string; definition: string }
      | { kind: "translation"; entry: Translation; label: string; definition: string };

    const pending: PendingItem[] = [
      ...words
        .filter((word) => descriptiveTags(word.tags).length === 0)
        .map((word) => ({ kind: "word" as const, entry: word, label: word.word, definition: word.definition })),
      ...translations
        .filter((translation) => descriptiveTags(translation.tags).length === 0)
        .map((translation) => ({
          kind: "translation" as const,
          entry: translation,
          label: `${translation.sourceWord} (${translation.sourceLanguage}) -> ${translation.targetWord} (${translation.targetLanguage})`,
          definition: translation.context?.trim() || "",
        })),
    ];

    if (pending.length === 0) {
      setTagSummary("Every word and translation already has tags.");
      return;
    }

    setTagging(true);
    setTagSummary(null);
    setTagProgress({ done: 0, total: pending.length });

    const knownTags = tagVocabulary([...words, ...translations]);
    let tagged = 0;
    let lastError: string | undefined;

    for (let start = 0; start < pending.length; start += AUTO_TAG_BATCH_SIZE) {
      const batch = pending.slice(start, start + AUTO_TAG_BATCH_SIZE);
      const result = await suggestTagsBatch(batch.map(({ label, definition }) => ({ label, definition })), knownTags);

      if (!result.success) {
        lastError = result.error;
      } else {
        const wordChanges: Record<string, Partial<Word>> = {};
        const translationChanges: Record<string, Partial<Translation>> = {};

        batch.forEach((item, index) => {
          const tags = result.data[index] ?? [];
          if (tags.length === 0) return;
          // Existing tags (review status, "suggested") are kept alongside the new ones.
          const merged = Array.from(new Set([...(item.entry.tags ?? []), ...tags]));
          if (item.kind === "word") wordChanges[item.entry.id] = { tags: merged };
          else translationChanges[item.entry.id] = { tags: merged };
          tagged += 1;
          for (const tag of tags) if (!knownTags.includes(tag)) knownTags.push(tag);
        });

        if (Object.keys(wordChanges).length > 0) await updateWords(wordChanges);
        if (Object.keys(translationChanges).length > 0) await updateTranslations(translationChanges);
      }

      setTagProgress({ done: Math.min(start + batch.length, pending.length), total: pending.length });
    }

    setTagging(false);
    setTagProgress(null);
    setTagSummary(
      lastError && tagged < pending.length
        ? `Tagged ${tagged} of ${pending.length}. Some batches failed: ${lastError}`
        : `Tagged ${tagged} of ${pending.length} entries.`,
    );
  }, [suggestTagsBatch, tagging, translations, updateTranslations, updateWords, words]);

  useEffect(() => {
    const onAutoTag = () => {
      void runAutoTag();
    };
    window.addEventListener("lexi:autotag", onAutoTag);
    return () => window.removeEventListener("lexi:autotag", onAutoTag);
  }, [runAutoTag]);

  const totalLanguages = useMemo(() => new Set(words.map((word) => word.language)).size, [words]);

  const wordsThisWeek = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return words.filter((word) => word.dateAdded >= sevenDaysAgo).length;
  }, [words]);

  const languageBreakdown = useMemo(() => {
    const totals = new Map<string, { words: number; translations: number }>();

    for (const word of words) {
      const existing = totals.get(word.language) ?? { words: 0, translations: 0 };
      existing.words += 1;
      totals.set(word.language, existing);
    }

    for (const translation of translations) {
      const source = totals.get(translation.sourceLanguage) ?? { words: 0, translations: 0 };
      source.translations += 1;
      totals.set(translation.sourceLanguage, source);

      const target = totals.get(translation.targetLanguage) ?? { words: 0, translations: 0 };
      target.translations += 1;
      totals.set(translation.targetLanguage, target);
    }

    const rows = Array.from(totals.entries()).map(([language, data]) => ({
      language,
      score: data.words + data.translations,
      words: data.words,
      translations: data.translations,
    }));

    rows.sort((a, b) => b.score - a.score);
    return rows;
  }, [translations, words]);

  const weeklyTrend = useMemo(() => {
    const now = new Date();
    const points = [] as Array<{ div: string; count: number }>;

    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(now.getDate() - i);

      const dayStart = day.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const count = words.filter((word) => word.dateAdded >= dayStart && word.dateAdded < dayEnd).length;

      points.push({
        div: day.toLocaleDateString("en-US", { weekday: "short" }),
        count,
      });
    }

    return points;
  }, [words]);

  const maxTrend = Math.max(1, ...weeklyTrend.map((point) => point.count));

  const recentEntries = useMemo(() => {
    return [...words].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 6);
  }, [words]);

  const statusDistribution = useMemo(() => {
    const totals = { New: 0, Learning: 0, Mastered: 0 };

    for (const word of words) {
      const tags = word.tags.map((tag) => tag.toLowerCase());
      if (tags.includes("mastered")) {
        totals.Mastered += 1;
      } else if (tags.includes("learning") || tags.includes("review")) {
        totals.Learning += 1;
      } else {
        totals.New += 1;
      }
    }

    return totals;
  }, [words]);

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();

    for (const entry of [...words, ...translations]) {
      for (const tag of descriptiveTags(entry.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [translations, words]);

  return (
    <div className="grid min-h-full grid-cols-1 gap-3 xl:h-full xl:grid-cols-[1.25fr_0.95fr]">
      <section className="frost-panel custom-scrollbar min-h-[22rem] xl:min-h-0 overflow-y-auto p-5 md:p-6 animate-slide-in-up">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="metric-card">
            <p className="subtle-caption">Words</p>
            <p className="metric-value mt-2">{words.length}</p>
            <p className="subtle-caption mt-2">Tracked vocabulary entries.</p>
          </article>

          <article className="metric-card">
            <p className="subtle-caption">Translations</p>
            <p className="metric-value mt-2">{translations.length}</p>
            <p className="subtle-caption mt-2">Cross-language mappings saved.</p>
          </article>

          <article className="metric-card">
            <p className="subtle-caption">Languages</p>
            <p className="metric-value mt-2">{totalLanguages}</p>
            <p className="subtle-caption mt-2">Active language collections.</p>
          </article>

          <article className="metric-card">
            <p className="subtle-caption">Added This Week</p>
            <p className="metric-value mt-2">{wordsThisWeek}</p>
            <p className="subtle-caption mt-2">Momentum from the last 7 days.</p>
          </article>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Language Coverage</h2>
            <Globe2 className="size-4 text-muted-foreground" />
          </div>

          <div className="space-y-3">
            {languageBreakdown.length === 0 ? (
              <div className="frost-panel-soft p-4 text-sm text-muted-foreground">
                Add words to generate language analytics.
              </div>
            ) : (
              languageBreakdown.map((row) => {
                const width = `${Math.max(8, (row.score / languageBreakdown[0].score) * 100)}%`;

                return (
                  <div key={row.language} className="frost-panel-soft stats-surface p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-medium">{row.language}</p>
                      <p className="subtle-caption">
                        {row.words} words, {row.translations} translation links
                      </p>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Weekly Trend</h2>
            <Activity className="size-4 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weeklyTrend.map((point) => (
              <div key={point.div} className="frost-panel-soft stats-surface flex flex-col items-center gap-2 p-3">
                <div className="flex h-20 items-end">
                  <div
                    className="w-4 rounded-full bg-white/70"
                    style={{ height: `${Math.max(8, (point.count / maxTrend) * 100)}%` }}
                  />
                </div>
                <p className="subtle-caption text-center">{point.div}</p>
                <p className="text-sm font-medium">{point.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Status Distribution</h2>
            <Languages className="size-4 text-muted-foreground" />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <article className="frost-panel-soft stats-surface p-3">
              <p className="subtle-caption">New</p>
              <p className="serif-display text-3xl">{statusDistribution.New}</p>
            </article>
            <article className="frost-panel-soft stats-surface p-3">
              <p className="subtle-caption">Learning</p>
              <p className="serif-display text-3xl">{statusDistribution.Learning}</p>
            </article>
            <article className="frost-panel-soft stats-surface p-3">
              <p className="subtle-caption">Mastered</p>
              <p className="serif-display text-3xl">{statusDistribution.Mastered}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="border-b border-white/10 p-5">
          <h2 className="section-title">Recent Activity</h2>
          <p className="subtle-caption mt-2">Most recently captured vocabulary entries.</p>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          {recentEntries.length === 0 ? (
            <div className="frost-panel-soft stats-surface p-4 text-sm text-muted-foreground">
              No recent entries available yet.
            </div>
          ) : (
            recentEntries.map((word) => (
              <article key={word.id} className="frost-panel-soft stats-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="serif-display text-3xl leading-[0.95]">{word.word}</p>
                    <p className="subtle-caption mt-1">{word.language}</p>
                  </div>
                  <BookOpenText className="size-4 text-muted-foreground" />
                </div>
                <p className="word-sub mt-3 text-sm">{word.definition}</p>
                <p className="subtle-caption mt-3">Added {formatDate(word.dateAdded)}</p>
              </article>
            ))
          )}

          <div className="frost-panel-soft stats-surface p-3">
            <p className="subtle-caption mb-2">Top Tags</p>
            {topTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {topTags.map(([tag, count]) => (
                  <span key={tag} className="lexi-chip">
                    {tag} ({count})
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 p-2">
          <span className="subtle-caption flex min-w-0 items-center gap-1.5 px-1">
            {tagging ? <Loader2 className="size-3 shrink-0 animate-spin" /> : <Tags className="size-3 shrink-0" />}
            <span className="truncate">
              {tagging && tagProgress
                ? `Tagging ${tagProgress.done}/${tagProgress.total}...`
                : tagSummary ?? (untaggedCount > 0 ? `${untaggedCount} entries without tags` : "Everything is tagged")}
            </span>
          </span>
          <span className="sync-pill shrink-0">
            <Languages className="size-3" />
            {totalLanguages} active languages
          </span>
        </div>
      </section>
    </div>
  );
}
