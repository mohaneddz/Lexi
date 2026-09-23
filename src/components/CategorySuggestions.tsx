import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RefreshCcw } from "lucide-react";

import { SuggestionCardsSkeleton } from "@/components/lexi/Skeletons";
import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useBooks } from "@/hooks/useBooks";
import { useGroups } from "@/hooks/useGroups";
import { getGroupIcon } from "@/lib/group-icons";
import type { LexiGroup, Translation, Word } from "@/types";
import { capitalizeTerm } from "@/utils/formatters";
import { getSettings, readAiCacheEntry, writeAiCache } from "@/utils/storage";
import {
  buildFallbackDefinitionSuggestions,
  buildFallbackTranslationSuggestions,
  type Suggestion,
  type SuggestionKind,
} from "@/utils/wordSuggestions";

type CachedSection = { suggestions: Suggestion[]; usedAi: boolean; requested?: number };

function CategorySection({ kind, group, words, translations, onAdd, language, targetLanguage, count, suggestGroupWords, lookup, enabledBookIds, booksLoading }: {
  kind: SuggestionKind;
  group: LexiGroup;
  words: Word[];
  translations: Translation[];
  onAdd: (suggestion: Suggestion, group: LexiGroup) => Promise<void>;
  language: string;
  targetLanguage: string;
  count: number;
  suggestGroupWords: ReturnType<typeof useAI>["suggestGroupWords"];
  lookup: ReturnType<typeof useBooks>["lookup"];
  enabledBookIds: string[];
  booksLoading: boolean;
}) {
  const key = kind === "definition"
    ? `definition:${group.id}:${language}`
    : `translation:${group.id}:${language}>${targetLanguage}`;
  const dismissedKey = `lexi:home:dismissed:${kind}`;
  const [entry, setEntry] = useState<CachedSection | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem(dismissedKey) ?? "[]") as string[]); }
    catch { return new Set(); }
  });

  const known = useMemo(() => new Set(kind === "definition"
    ? words.map((word) => word.word.trim().toLowerCase())
    : translations.filter((pair) => pair.sourceLanguage === language && pair.targetLanguage === targetLanguage)
      .map((pair) => pair.sourceWord.trim().toLowerCase())), [kind, language, targetLanguage, translations, words]);
  const visible = (entry?.suggestions ?? []).filter((suggestion) => {
    const term = suggestion.term.trim().toLowerCase();
    return !known.has(term) && !dismissed.has(term);
  }).slice(0, count);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void readAiCacheEntry<CachedSection>("homeSuggestions", key).then((cached) => {
      if (cancelled) return;
      setEntry(cached ?? null);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  const renew = async () => {
    if (loading || booksLoading || enabledBookIds.length === 0) return;
    setLoading(true);
    try {
      const scopedWords = words.filter((word) => (word.groupIds ?? []).includes(group.id));
      const scopedPairs = translations.filter((pair) => (pair.groupIds ?? []).includes(group.id));
      const examples = Array.from(new Set([
        ...scopedWords.filter((word) => word.language === language).map((word) => word.word),
        ...scopedPairs.filter((pair) => pair.sourceLanguage === language).map((pair) => pair.sourceWord),
      ])).slice(0, 6);
      const excluded = new Set([...known, ...dismissed, ...(entry?.suggestions ?? []).map((item) => item.term.toLowerCase())]);
      const picked: Suggestion[] = [];
      let usedAi = false;
      if (!group.isOthers || examples.length > 0) {
        const response = await suggestGroupWords({
          groupName: group.name, groupDescription: group.description, language,
          exampleWords: examples, excludeWords: [...excluded], count: count + 3,
          targetLanguage: kind === "translation" ? targetLanguage : undefined,
        });
        if (response.success) {
          for (const suggestion of response.data) {
            const term = suggestion.term.trim().toLowerCase();
            if (excluded.has(term) || picked.some((item) => item.term.toLowerCase() === term)) continue;
            if (kind === "definition") {
              const book = lookup(suggestion.term, { bookType: "dictionary", fuzzy: false })[0];
              picked.push({ term: suggestion.term, detail: book?.output ?? suggestion.detail, bookTitle: book?.bookTitle, language, seenIn: [] });
            } else {
              const book = lookup(suggestion.term, { bookType: "translation", fuzzy: false }).find((item) => item.inputLanguage === language && item.outputLanguage === targetLanguage && item.input.toLowerCase() === term);
              picked.push({ term: suggestion.term, detail: book?.output ?? suggestion.detail, bookTitle: book?.bookTitle, language, targetLanguage, seenIn: [] });
            }
          }
          usedAi = picked.length > 0;
        }
      }
      if (picked.length < count) {
        const exclude = new Set([...excluded, ...picked.map((item) => item.term.toLowerCase())]);
        const fallbackWords = group.isOthers && scopedWords.length === 0 ? words : scopedWords;
        const extra = kind === "definition"
          ? buildFallbackDefinitionSuggestions({
            words, scopedWords: fallbackWords, dismissed, exclude, limit: count + 3 - picked.length,
            findDefinition: (term) => { const book = lookup(term, { bookType: "dictionary", fuzzy: false })[0]; return book ? { definition: book.output, bookTitle: book.bookTitle } : null; },
          })
          : buildFallbackTranslationSuggestions({
            words, translations, scopedWords: fallbackWords, sourceLanguage: language, targetLanguage,
            dismissed, exclude, limit: count + 3 - picked.length,
            findTranslation: (term) => { const book = lookup(term, { bookType: "translation", fuzzy: false }).find((item) => item.inputLanguage === language && item.outputLanguage === targetLanguage && item.input.toLowerCase() === term.toLowerCase()); return book ? { targetWord: book.output, targetLanguage, bookTitle: book.bookTitle } : null; },
          });
        picked.push(...extra);
      }
      const next = { suggestions: picked, usedAi, requested: count };
      setEntry(next);
      await writeAiCache("homeSuggestions", key, next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || entry || booksLoading || enabledBookIds.length === 0) return;
    void renew();
    // A section generates once when the cache is absent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, booksLoading, enabledBookIds.length]);

  const dismiss = (term: string) => {
    const next = new Set(dismissed).add(term.toLowerCase());
    setDismissed(next);
    try { window.localStorage.setItem(dismissedKey, JSON.stringify([...next])); } catch { /* Keep the session dismissal. */ }
  };

  const GroupIcon = getGroupIcon(group.iconName);

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-foreground/85">
          <GroupIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="serif-display truncate text-[1.7rem] leading-[1.2]">{group.name}</p>
          <p className="subtle-caption truncate">{group.description || "Suggested for this group"}</p>
        </div>
      </div>
      <Button type="button" size="icon" variant="outline" className="shrink-0 border-white/15 bg-white/6 hover:bg-white/14" aria-label={`Refresh suggestions for ${group.name}`} title={`Refresh suggestions for ${group.name}`} disabled={loading || booksLoading || enabledBookIds.length === 0} onClick={() => void renew()}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
      </Button>
    </div>
    {loading && !entry ? <SuggestionCardsSkeleton count={Math.min(count, 3)} /> : visible.length === 0 ? <p className="subtle-caption">No new suggestions. Try refresh.</p> : visible.map((suggestion) => <div key={suggestion.term} className="frost-panel-soft space-y-2 p-3">
      <p className="serif-display text-2xl leading-[1.2]">{capitalizeTerm(suggestion.term)}{kind === "translation" ? <><ArrowRight className="mx-2 inline size-4 text-muted-foreground" />{capitalizeTerm(suggestion.detail)}</> : null}</p>
      {kind === "definition" ? <p className="word-sub">{suggestion.detail}</p> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" disabled={pending === suggestion.term} onClick={() => { setPending(suggestion.term); void onAdd(suggestion, group).finally(() => setPending(null)); }}>{pending === suggestion.term ? "Adding..." : "Add"}</Button>
        <Button type="button" size="sm" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => dismiss(suggestion.term)}>Dismiss</Button>
      </div>
    </div>)}
  </div>;
}

export function CategorySuggestions({ kind, groupFilterId, words, translations, onAdd }: {
  kind: SuggestionKind;
  groupFilterId: string;
  words: Word[];
  translations: Translation[];
  onAdd: (suggestion: Suggestion, group: LexiGroup) => Promise<void>;
}) {
  const { groups } = useGroups();
  const { suggestGroupWords } = useAI();
  const { lookup, enabledBookIds, loading: booksLoading } = useBooks();
  const [languages, setLanguages] = useState<{ definition: string; source: string; target: string } | null>(null);
  const [count, setCount] = useState(4);
  useEffect(() => {
    void getSettings().then((settings) => {
      setLanguages({ definition: settings.defaultDefinitionLanguage, source: settings.defaultTranslationSourceLanguage, target: settings.defaultTranslationTargetLanguage });
      setCount(settings.homeSuggestionCount);
    });
  }, []);
  const visibleGroups = groupFilterId === "none" ? groups : groups.filter((group) => group.id === groupFilterId);
  if (!languages) return <p className="subtle-caption">Loading suggestions...</p>;
  if (kind === "translation" && languages.source === languages.target) return <p className="subtle-caption">Choose different default translation languages in Settings to see suggestions.</p>;
  if (visibleGroups.length === 0) return <p className="subtle-caption">Create a group to see suggestions.</p>;
  if (!booksLoading && enabledBookIds.length === 0) return <p className="subtle-caption">Enable a book in Books to get suggestions.</p>;
  return <div className="space-y-8">
    <p className="subtle-caption">Suggestions for your {groupFilterId === "none" ? "groups" : "selected group"}. Refresh a group for new ideas.</p>
    {visibleGroups.map((group) => <CategorySection key={`${kind}:${group.id}:${languages.definition}:${languages.source}:${languages.target}`} kind={kind} group={group} words={words} translations={translations} onAdd={onAdd} language={kind === "definition" ? languages.definition : languages.source} targetLanguage={languages.target} count={count} suggestGroupWords={suggestGroupWords} lookup={lookup} enabledBookIds={enabledBookIds} booksLoading={booksLoading} />)}
  </div>;
}
