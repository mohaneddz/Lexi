import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAI } from "@/hooks/useAI";
import { useTranslations } from "@/hooks/useTranslations";
import { useWords } from "@/hooks/useWords";
import { getSettings } from "@/utils/storage";

type QuickActionMode = "define" | "translate";

interface QuickActionProps {
  mode: QuickActionMode;
}

const LANGUAGES = [
  "English",
  "Arabic",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Korean",
  "Chinese",
];

export default function QuickAction({ mode }: QuickActionProps) {
  const windowRef = useMemo(() => getCurrentWindow(), []);

  const { detectLanguage, defineWord, translate, loading: aiLoading } = useAI();
  const { addWord } = useWords();
  const { addTranslation } = useTranslations();

  const [sourceText, setSourceText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("Arabic");
  const [outputText, setOutputText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((settings) => {
      setSourceLanguage(settings.defaultLanguage || "English");
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
      return;
    }

    setMessage(null);
    if (mode === "define") {
      const detected = await detectLanguage(trimmed);
      const detectedLanguage = detected.success ? detected.data : sourceLanguage;
      const languageToUse = LANGUAGES.includes(detectedLanguage) ? detectedLanguage : sourceLanguage;
      if (detected.success && LANGUAGES.includes(detected.data)) {
        setSourceLanguage(detected.data);
      }

      const result = await defineWord(trimmed, languageToUse);
      if (result.success) {
        setOutputText(result.data);
      } else {
        setMessage(result.error ?? "Unable to define this term.");
      }
      return;
    }

    const result = await translate(trimmed, sourceLanguage, targetLanguage);
    if (result.success) {
      setOutputText(result.data);
    } else {
      setMessage(result.error ?? "Unable to translate this text.");
    }
  };

  const handleSave = async () => {
    if (!sourceText.trim() || !outputText.trim()) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (mode === "define") {
        await addWord({
          word: sourceText.trim(),
          definition: outputText.trim(),
          language: sourceLanguage,
          tags: ["new", "quick-capture"],
          aiGenerated: true,
          examples: [],
          groupIds: [],
        });
      } else {
        await addTranslation({
          sourceWord: sourceText.trim(),
          sourceLanguage,
          targetWord: outputText.trim(),
          targetLanguage,
          aiGenerated: true,
          context: "Quick global shortcut",
          groupIds: [],
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
          <h1 className="serif-display text-2xl">{mode === "define" ? "Define New Term" : "Translate New Term"}</h1>
          <button
            type="button"
            onClick={() => void windowRef.close()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-3">
          <label className="space-y-1">
            <span className="subtle-caption">{mode === "define" ? "Term" : "Text"}</span>
            <input
              className="frost-input"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder={mode === "define" ? "Enter term..." : "Enter text to translate..."}
              autoFocus
            />
          </label>

          <div className={mode === "translate" ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
            <label className="space-y-1">
              <span className="subtle-caption">Source language</span>
              <select
                className="frost-input form-select"
                value={sourceLanguage}
                onChange={(event) => setSourceLanguage(event.target.value)}
                disabled={mode === "define"}
              >
                {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
              </select>
              {mode === "define" ? <p className="subtle-caption">Auto-detected when generating.</p> : null}
            </label>

            {mode === "translate" ? (
              <label className="space-y-1">
                <span className="subtle-caption">Target language</span>
                <select className="frost-input form-select" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                  {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          <div className="space-y-1">
            <span className="subtle-caption">{mode === "define" ? "Definition" : "Translation"}</span>
            <textarea
              className="frost-input form-textarea"
              value={outputText}
              onChange={(event) => setOutputText(event.target.value)}
              placeholder={mode === "define" ? "Definition will appear here..." : "Translation will appear here..."}
            />
          </div>
          {message ? <p className="subtle-caption">{message}</p> : null}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/10 p-3">
          <Button
            type="button"
            variant="outline"
            disabled={aiLoading || !sourceText.trim()}
            className="border-white/15 bg-white/6 hover:bg-white/14"
            onClick={() => void handleRun()}
          >
            {aiLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {mode === "define" ? "Generate Definition" : "Generate Translation"}
          </Button>

          <Button
            type="button"
            disabled={saving || !sourceText.trim() || !outputText.trim()}
            className="border border-white/20 bg-white/16 hover:bg-white/22"
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
