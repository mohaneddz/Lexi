import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAI } from "@/hooks/useAI";
import { useBooks } from "@/hooks/useBooks";
import { useGroups } from "@/hooks/useGroups";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { cn } from "@/lib/utils";
import { getSettings, updateSettings } from "@/utils/storage";
import { parseTagInput, tagVocabulary } from "@/utils/tags";
import { sanitizeInput, validateDefinition, validateWord } from "@/utils/validators";

const NO_GROUP = "none";

export type CaptureMode = "define" | "translate";

const LANGUAGES = [
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Russian",
  "Japanese",
  "Korean",
  "Chinese",
  "Arabic",
  "Hindi",
];

interface CaptureFormProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  /** Called after a successful save, and when the close action is used. */
  onClose: () => void;
  /** Rendered in the header's top-right, e.g. the quick window's close button. */
  headerAction?: React.ReactNode;
  /** Set on the outer element so the quick window can be dragged by its header. */
  dragRegion?: boolean;
  /** Saves the new entry straight into this group, e.g. when capturing from the Groups page. */
  group?: { id: string; name: string };
  className?: string;
  /**
   * Reports the height the whole form needs to show without scrolling, so
   * the quick-capture window can resize itself to fit.
   */
  onNaturalHeightChange?: (height: number) => void;
}

export function CaptureForm({ mode, onModeChange, onClose, headerAction, dragRegion, group, className, onNaturalHeightChange }: CaptureFormProps) {
  const { defineWord, translate, captureWithMeta, loading: aiLoading } = useAI();
  const { words, addWord } = useWords();
  const { translations, addTranslation } = useTranslations();
  const { groups } = useGroups();
  const { lookup, enabledBookIds, loading: booksLoading } = useBooks();

  // The Input wrapper is a plain function component, so it can't take a ref
  // on React 18 — reach the field through the container instead.
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const [sourceText, setSourceText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [context, setContext] = useState("");
  const [definitionLanguage, setDefinitionLanguage] = useState("English");
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [defaultLanguage, setDefaultLanguage] = useState("English");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ sourceText?: string; outputText?: string }>({});
  const [tagsText, setTagsText] = useState("");
  const [groupId, setGroupId] = useState(group?.id ?? NO_GROUP);
  // The AI only fills tags or the group while you haven't set them yourself,
  // and a group handed in by the Groups page counts as already chosen.
  const [tagsTouched, setTagsTouched] = useState(false);
  const [groupTouched, setGroupTouched] = useState(Boolean(group));

  useEffect(() => {
    void getSettings().then((settings) => {
      const fallback = settings.defaultLanguage || "English";
      setDefaultLanguage(fallback);
      setDefinitionLanguage(settings.defaultDefinitionLanguage || fallback);
      setSourceLanguage(settings.defaultTranslationSourceLanguage || fallback);
      setTargetLanguage(settings.defaultTranslationTargetLanguage || fallback);
    });
  }, []);

  // The body scrolls, so its own height says nothing about how tall its
  // contents are; the inner wrapper does, and grows as messages or the
  // translation-only fields appear.
  useLayoutEffect(() => {
    if (!onNaturalHeightChange) return;
    const measure = () => {
      const header = headerRef.current?.offsetHeight ?? 0;
      const footer = footerRef.current?.offsetHeight ?? 0;
      const content = bodyContentRef.current?.offsetHeight ?? 0;
      const body = bodyRef.current;
      const bodyPadding = body ? parseFloat(getComputedStyle(body).paddingTop) + parseFloat(getComputedStyle(body).paddingBottom) : 0;
      // The panel's 1px border on each side.
      onNaturalHeightChange(Math.ceil(header + content + bodyPadding + footer + 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [headerRef.current, bodyContentRef.current, footerRef.current]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [onNaturalHeightChange]);

  const focusSource = () => {
    containerRef.current?.querySelector<HTMLInputElement>("input[data-capture-source]")?.focus();
  };

  const handleAiRun = async () => {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setErrors((current) => ({ ...current, sourceText: "This field cannot be empty." }));
      return;
    }

    setMessage(null);
    setErrors((current) => ({ ...current, sourceText: undefined }));

    // One request fills the definition or translation, the tags and the
    // group together; the plain define/translate call is only a fallback.
    const withMeta = await captureWithMeta({
      text: trimmed,
      language: mode === "define" ? definitionLanguage || defaultLanguage : sourceLanguage,
      targetLanguage: mode === "define" ? undefined : targetLanguage,
      context: mode === "translate" ? context : undefined,
      groups: groups.filter((entry) => !entry.isOthers).map(({ id, name, description }) => ({ id, name, description })),
      knownTags: tagVocabulary([...words, ...translations]),
    });

    if (withMeta.success) {
      setOutputText(withMeta.data.output);
      setAiGenerated(true);
      setErrors((current) => ({ ...current, outputText: undefined }));
      if (!tagsTouched && withMeta.data.tags.length > 0) setTagsText(withMeta.data.tags.join(", "));
      // Only fills context you left empty, never replaces what you wrote.
      if (mode === "translate" && withMeta.data.context && !context.trim()) setContext(withMeta.data.context);
      if (!groupTouched) {
        const fallbackId = groups.find((entry) => entry.isOthers)?.id;
        setGroupId(withMeta.data.groupId ?? fallbackId ?? NO_GROUP);
      }
      return;
    }

    if (mode === "define") {
      const result = await defineWord(trimmed, definitionLanguage || defaultLanguage);
      if (result.success) {
        setOutputText(result.data);
        setAiGenerated(true);
        setErrors((current) => ({ ...current, outputText: undefined }));
        return;
      }
      setMessage(result.error ?? "Unable to define this term.");
      return;
    }

    const result = await translate(trimmed, sourceLanguage, targetLanguage);
    if (result.success) {
      setOutputText(result.data);
      setAiGenerated(true);
      setErrors((current) => ({ ...current, outputText: undefined }));
      return;
    }
    setMessage(result.error ?? "Unable to translate this text.");
  };

  /** Fills the result from the enabled offline books instead of the AI. */
  const handleBookLookup = () => {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setErrors((current) => ({ ...current, sourceText: "This field cannot be empty." }));
      return;
    }

    setMessage(null);
    setErrors((current) => ({ ...current, sourceText: undefined }));

    if (enabledBookIds.length === 0) {
      setMessage("No books are enabled. Enable one on the Books page to look words up offline.");
      return;
    }

    const results = mode === "define"
      ? lookup(trimmed, { bookType: "dictionary", inputLanguage: definitionLanguage || defaultLanguage })
      : lookup(trimmed, { bookType: "translation", inputLanguage: sourceLanguage, outputLanguage: targetLanguage });

    const best = results[0];
    if (!best) {
      setMessage(`No match for "${trimmed}" in your enabled books.`);
      return;
    }

    // A translation book is searchable from either side, so a hit can come
    // back with the query sitting in `output` — take the other side then.
    const filled = best.output.trim().toLowerCase() === trimmed.toLowerCase() ? best.input : best.output;

    setOutputText(filled);
    setAiGenerated(false);
    setErrors((current) => ({ ...current, outputText: undefined }));
    setMessage(`Filled from ${best.bookTitle}.`);
  };

  const resetFields = () => {
    setSourceText("");
    setOutputText("");
    setContext("");
    setAiGenerated(false);
    setMessage(null);
    setErrors({});
    setTagsText("");
    setTagsTouched(false);
    setGroupId(group?.id ?? NO_GROUP);
    setGroupTouched(Boolean(group));
  };

  const selectedGroupIds = groupId !== NO_GROUP && groups.some((entry) => entry.id === groupId) ? [groupId] : [];

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (mode === "define") {
        const sourceValidation = validateWord(sourceText);
        const outputValidation = validateDefinition(outputText);
        if (!sourceValidation.valid || !outputValidation.valid) {
          setErrors({ sourceText: sourceValidation.error, outputText: outputValidation.error });
          return;
        }

        const language = definitionLanguage || defaultLanguage;
        await addWord({
          word: sanitizeInput(sourceText),
          definition: sanitizeInput(outputText),
          language,
          tags: parseTagInput(tagsText),
          aiGenerated,
          groupIds: selectedGroupIds,
        });
        await updateSettings({ defaultDefinitionLanguage: language });
      } else {
        if (!sourceText.trim() || !outputText.trim()) {
          setErrors({
            sourceText: sourceText.trim() ? undefined : "Source text is required.",
            outputText: outputText.trim() ? undefined : "Target text is required.",
          });
          return;
        }

        await addTranslation({
          sourceWord: sanitizeInput(sourceText),
          sourceLanguage,
          targetWord: sanitizeInput(outputText),
          targetLanguage,
          aiGenerated,
          context: context.trim() ? sanitizeInput(context) : undefined,
          tags: parseTagInput(tagsText),
          groupIds: selectedGroupIds,
        });
        await updateSettings({
          defaultTranslationSourceLanguage: sourceLanguage,
          defaultTranslationTargetLanguage: targetLanguage,
        });
      }

      resetFields();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const switchMode = (next: CaptureMode) => {
    if (next === mode) return;
    setErrors({});
    setMessage(null);
    onModeChange(next);
    window.setTimeout(focusSource, 0);
  };

  const canSave = !saving && sourceText.trim().length > 0 && outputText.trim().length > 0;
  const assistDisabled = !sourceText.trim();

  return (
    <div ref={containerRef} className={cn("frost-panel flex h-full flex-col overflow-hidden", className)}>
      <div
        ref={headerRef}
        {...(dragRegion ? { "data-tauri-drag-region": true } : {})}
        className="flex items-start justify-between gap-3 border-b border-white/10 p-3"
      >
        <div className="min-w-0 space-y-2">
          <div className="space-y-1">
            <h1 className="serif-display text-2xl leading-tight">
              {mode === "define" ? "Add New Definition" : "Add New Translation"}
            </h1>
            <p className="subtle-caption">
              {mode === "define"
                ? "Capture a word and what it means."
                : "Capture a word and its translation."}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="lexi-toggle"
              aria-pressed={mode === "define"}
              onClick={() => switchMode("define")}
            >
              Definition
            </button>
            <button
              type="button"
              className="lexi-toggle"
              aria-pressed={mode === "translate"}
              onClick={() => switchMode("translate")}
            >
              Translation
            </button>
          </div>
        </div>

        {headerAction}
      </div>

      <div ref={bodyRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <div ref={bodyContentRef} className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">{mode === "define" ? "Word" : "Source Word"}</div>
          {mode === "define" ? (
            <Input
              className="frost-input"
              value={sourceText}
              onChange={(event) => {
                setSourceText(event.target.value);
                setErrors((current) => ({ ...current, sourceText: undefined }));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleAiRun();
                }
              }}
              placeholder="Enter word..."
              data-capture-source
              autoFocus
            />
          ) : (
            <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3">
              <Select value={sourceLanguage} onValueChange={(value) => { setSourceLanguage(value); setAiGenerated(false); }}>
                <SelectTrigger className="frost-select form-select w-44 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong">
                  {LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>{language}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="frost-input min-w-0 flex-1"
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                  setErrors((current) => ({ ...current, sourceText: undefined }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleAiRun();
                  }
                }}
                placeholder="Enter source word..."
                data-capture-source
                autoFocus
              />
            </div>
          )}
          {errors.sourceText ? <p className="text-xs text-destructive">{errors.sourceText}</p> : null}
        </div>

        {mode === "define" ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Language</div>
            <Select value={definitionLanguage} onValueChange={(value) => { setDefinitionLanguage(value); setAiGenerated(false); }}>
              <SelectTrigger className="frost-select form-select w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                {LANGUAGES.map((language) => (
                  <SelectItem key={language} value={language}>{language}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {mode === "define" ? "Definition" : "Target Word"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 border-white/15 bg-white/6 hover:bg-white/14"
                disabled={assistDisabled || booksLoading}
                onClick={handleBookLookup}
                title="Fill from your enabled offline books"
              >
                {booksLoading ? <Loader2 className="size-3 animate-spin" /> : <BookOpen className="size-3" />}
                Search books
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 border-white/15 bg-white/6 hover:bg-white/14"
                disabled={assistDisabled || aiLoading}
                onClick={() => void handleAiRun()}
                title="Generate with AI"
              >
                {aiLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                {mode === "define" ? "AI Define" : "AI Translate"}
              </Button>
            </div>
          </div>

          {mode === "define" && aiLoading ? (
            <div className="frost-input form-textarea flex min-h-[7.5rem] flex-col gap-2.5 py-3" aria-busy>
              <Skeleton className="h-4 w-full bg-white/8" />
              <Skeleton className="h-4 w-11/12 bg-white/8" />
              <Skeleton className="h-4 w-3/5 bg-white/8" />
            </div>
          ) : mode === "define" ? (
            <textarea
              className="frost-input form-textarea"
              value={outputText}
              onChange={(event) => {
                setOutputText(event.target.value);
                setAiGenerated(false);
                setErrors((current) => ({ ...current, outputText: undefined }));
              }}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.key === "Enter") {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              placeholder="Enter or generate definition..."
              rows={4}
            />
          ) : (
            <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3">
              <Select value={targetLanguage} onValueChange={(value) => { setTargetLanguage(value); setAiGenerated(false); }}>
                <SelectTrigger className="frost-select form-select w-44 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong">
                  {LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>{language}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aiLoading ? (
                <div className="frost-input flex min-w-0 flex-1 items-center" aria-busy>
                  <Skeleton className="h-4 w-1/2 bg-white/8" />
                </div>
              ) : (
              <Input
                className="frost-input min-w-0 flex-1"
                value={outputText}
                onChange={(event) => {
                  setOutputText(event.target.value);
                  setAiGenerated(false);
                  setErrors((current) => ({ ...current, outputText: undefined }));
                }}
                onKeyDown={(event) => {
                  if (event.ctrlKey && event.key === "Enter") {
                    event.preventDefault();
                    void handleSave();
                  }
                }}
                placeholder="Enter or generate translation..."
              />
              )}
            </div>
          )}
          {errors.outputText ? <p className="text-xs text-destructive">{errors.outputText}</p> : null}
        </div>

        {mode === "translate" ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Context (Optional)</div>
            {aiLoading && !context.trim() ? (
              <div className="frost-input form-textarea flex min-h-[5.75rem] flex-col gap-2.5 py-3" aria-busy>
                <Skeleton className="h-4 w-full bg-white/8" />
                <Skeleton className="h-4 w-2/3 bg-white/8" />
              </div>
            ) : (
            <textarea
              className="frost-input form-textarea"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.key === "Enter") {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              placeholder="Add context or example usage..."
              rows={3}
            />
            )}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="space-y-2">
            <div className="text-sm font-medium">Tags</div>
            {aiLoading && !tagsTouched ? (
              <div className="frost-input flex items-center gap-2" aria-busy>
                <Skeleton className="h-5 w-16 rounded-full bg-white/8" />
                <Skeleton className="h-5 w-20 rounded-full bg-white/8" />
                <Skeleton className="h-5 w-12 rounded-full bg-white/8" />
              </div>
            ) : (
            <Input
              className="frost-input"
              value={tagsText}
              onChange={(event) => {
                setTagsText(event.target.value);
                setTagsTouched(true);
              }}
              placeholder="e.g. travel, formal, verb"
            />
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Group</div>
            <Select value={groupId} onValueChange={(value) => { setGroupId(value); setGroupTouched(true); }}>
              <SelectTrigger className="frost-select form-select w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong">
                <SelectItem value={NO_GROUP}>No group</SelectItem>
                {groups.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {message ? <p className="subtle-caption">{message}</p> : null}
        </div>
      </div>

      <div ref={footerRef} className="mt-auto flex items-center justify-between border-t border-white/10 p-3">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          className="border-white/15 bg-white/6 hover:bg-white/14"
          onClick={() => {
            resetFields();
            onClose();
          }}
        >
          Close
        </Button>

        <Button
          type="button"
          disabled={!canSave}
          className="lexi-btn-primary"
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
          {mode === "define" ? "Add Definition" : "Add Translation"}
        </Button>
      </div>
    </div>
  );
}
