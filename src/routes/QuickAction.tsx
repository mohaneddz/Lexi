import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAI } from "@/hooks/useAI";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { getSettings, updateSettings } from "@/utils/storage";
import { sanitizeInput, validateDefinition, validateWord } from "@/utils/validators";

type QuickActionMode = "define" | "translate";

interface QuickActionProps {
  mode: QuickActionMode;
}

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

export default function QuickAction({ mode }: QuickActionProps) {
  const windowRef = useMemo(() => getCurrentWindow(), []);

  const { defineWord, translate, loading: aiLoading } = useAI();
  const { addWord } = useWords();
  const { addTranslation } = useTranslations();

  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [outputText, setOutputText] = useState("");
  const [definitionLanguage, setDefinitionLanguage] = useState("English");
  const [defaultLanguage, setDefaultLanguage] = useState("English");
  const [context, setContext] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [errors, setErrors] = useState<{ sourceText?: string; outputText?: string }>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((settings) => {
      const fallbackLanguage = settings.defaultLanguage || "English";
      const fallbackDefinitionLanguage = settings.defaultDefinitionLanguage || fallbackLanguage;
      const fallbackSourceLanguage = settings.defaultTranslationSourceLanguage || fallbackLanguage;
      const fallbackTargetLanguage = settings.defaultTranslationTargetLanguage || fallbackLanguage;
      setDefaultLanguage(fallbackLanguage);
      setSourceLanguage(fallbackSourceLanguage);
      setTargetLanguage(fallbackTargetLanguage);
      setDefinitionLanguage(fallbackDefinitionLanguage);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void windowRef.close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [windowRef]);

  const handleRun = async () => {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      setErrors((current) => ({ ...current, sourceText: "This field cannot be empty." }));
      return;
    }

    setMessage(null);
    setErrors((current) => ({ ...current, sourceText: undefined }));
    if (mode === "define") {
      const result = await defineWord(trimmed, definitionLanguage || defaultLanguage || "English");
      if (result.success) {
        setOutputText(result.data);
        setAiGenerated(true);
        setErrors((current) => ({ ...current, outputText: undefined }));
      } else {
        setMessage(result.error ?? "Unable to define this term.");
      }
      return;
    }

    const result = await translate(trimmed, sourceLanguage, targetLanguage);
    if (result.success) {
      setOutputText(result.data);
      setAiGenerated(true);
      setErrors((current) => ({ ...current, outputText: undefined }));
      await updateSettings({
        defaultTranslationSourceLanguage: sourceLanguage,
        defaultTranslationTargetLanguage: targetLanguage,
      });
    } else {
      setMessage(result.error ?? "Unable to translate this text.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (mode === "define") {
        const sourceValidation = validateWord(sourceText);
        const outputValidation = validateDefinition(outputText);

        if (!sourceValidation.valid || !outputValidation.valid) {
          setErrors({
            sourceText: sourceValidation.error,
            outputText: outputValidation.error,
          });
          return;
        }

        await addWord({
          word: sanitizeInput(sourceText),
          definition: sanitizeInput(outputText),
          language: definitionLanguage || defaultLanguage || "English",
          tags: [],
          aiGenerated,
          groupIds: [],
        });
        await updateSettings({ defaultDefinitionLanguage: definitionLanguage || defaultLanguage || "English" });
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
          groupIds: [],
        });
        await updateSettings({
          defaultTranslationSourceLanguage: sourceLanguage,
          defaultTranslationTargetLanguage: targetLanguage,
        });
      }

      setMessage("Saved successfully.");
      window.setTimeout(() => {
        void windowRef.close();
      }, 250);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full p-3">
      <div className="frost-panel flex h-full flex-col overflow-hidden">
        <div data-tauri-drag-region className="flex items-center justify-between border-b border-white/10 p-3">
          <div className="space-y-1">
            <h1 className="serif-display text-2xl">{mode === "define" ? "Add New Definition" : "Add New Translation"}</h1>
            <p className="subtle-caption">
              {mode === "define" ? "Capture a new word definition quickly." : "Add a translation pair with optional AI assistance."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void windowRef.close()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-3">
          {mode === "translate" ? (
            <>
              <div className="space-y-2">
                <div className="text-sm font-medium">Source Word</div>
                <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3">
                  <Select
                    value={sourceLanguage}
                    onValueChange={(value) => {
                      setSourceLanguage(value);
                      setAiGenerated(false);
                    }}
                  >
                    <SelectTrigger className="frost-select form-select w-44 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong">
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="frost-input flex-1 min-w-0"
                    value={sourceText}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      setErrors((current) => ({ ...current, sourceText: undefined }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleRun();
                      }
                    }}
                    placeholder="Enter source word..."
                    autoFocus
                  />
                </div>
                {errors.sourceText ? <p className="text-xs text-destructive">{errors.sourceText}</p> : null}
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={aiLoading || !sourceText.trim()}
                  className="gap-2 glass border-glass-border"
                  onClick={() => void handleRun()}
                >
                  {aiLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                  AI Translate
                </Button>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Target Word</div>
                <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3">
                  <Select
                    value={targetLanguage}
                    onValueChange={(value) => {
                      setTargetLanguage(value);
                      setAiGenerated(false);
                    }}
                  >
                    <SelectTrigger className="frost-select form-select w-44 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong">
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language} value={language}>
                          {language}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="frost-input flex-1 min-w-0"
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
                </div>
                {errors.outputText ? <p className="text-xs text-destructive">{errors.outputText}</p> : null}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Context (Optional)</div>
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
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-sm font-medium">Word</div>
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
                      void handleRun();
                    }
                  }}
                  placeholder="Enter word..."
                  autoFocus
                />
                {errors.sourceText ? <p className="text-xs text-destructive">{errors.sourceText}</p> : null}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Language</div>
                <Select
                  value={definitionLanguage}
                  onValueChange={(value) => {
                    setDefinitionLanguage(value);
                    setAiGenerated(false);
                  }}
                >
                  <SelectTrigger className="frost-select form-select w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-strong">
                    {LANGUAGES.map((language) => (
                      <SelectItem key={language} value={language}>
                        {language}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Definition</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRun()}
                    disabled={!sourceText.trim() || aiLoading}
                    className="gap-2 glass border-glass-border"
                  >
                    {aiLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    AI Define
                  </Button>
                </div>
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
                {errors.outputText ? <p className="text-xs text-destructive">{errors.outputText}</p> : null}
              </div>
            </>
          )}

          {message ? <p className="subtle-caption">{message}</p> : null}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/10 p-3">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            className="border-white/15 bg-white/6 hover:bg-white/14"
            onClick={() => void windowRef.close()}
          >
            Close
          </Button>

          <Button
            type="button"
            disabled={saving || !sourceText.trim() || !outputText.trim()}
            className="lexi-btn-primary"
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
            {mode === "define" ? "Add Definition" : "Add Translation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
