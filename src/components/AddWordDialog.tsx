import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAI } from "@/hooks/useAI";
import { getSettings, updateSettings } from "@/utils/storage";
import { sanitizeInput, validateDefinition, validateWord } from "@/utils/validators";

interface AddWordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (word: {
    word: string;
    definition: string;
    language: string;
    tags: string[];
    aiGenerated: boolean;
    examples?: string[];
    groupIds?: string[];
  }) => Promise<unknown>;
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

export function AddWordDialog({ open, onOpenChange, onAdd }: AddWordDialogProps) {
  const { defineWord, loading: aiLoading } = useAI();

  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [language, setLanguage] = useState("English");
  const [defaultLanguage, setDefaultLanguage] = useState("English");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ word?: string; definition?: string }>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    void getSettings().then((settings) => {
      const fallbackLanguage = settings.defaultDefinitionLanguage || settings.defaultLanguage || "English";
      setDefaultLanguage(fallbackLanguage);
      setLanguage(fallbackLanguage);
    });
  }, [open]);

  const handleRun = async () => {
    const trimmed = word.trim();
    if (!trimmed) {
      setErrors((current) => ({ ...current, word: "This field cannot be empty." }));
      return;
    }

    setMessage(null);
    setErrors((current) => ({ ...current, word: undefined }));
    const result = await defineWord(trimmed, language || defaultLanguage || "English");
    if (result.success) {
      setDefinition(result.data);
      setAiGenerated(true);
      setErrors((current) => ({ ...current, definition: undefined }));
      return;
    }

    setMessage(result.error ?? "Unable to define this term.");
  };

  const resetAndClose = () => {
    setWord("");
    setDefinition("");
    setLanguage(defaultLanguage || "English");
    setAiGenerated(false);
    setSaving(false);
    setMessage(null);
    setErrors({});
    onOpenChange(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const sourceValidation = validateWord(word);
      const outputValidation = validateDefinition(definition);

      if (!sourceValidation.valid || !outputValidation.valid) {
        setErrors({
          word: sourceValidation.error,
          definition: outputValidation.error,
        });
        return;
      }

      await onAdd({
        word: sanitizeInput(word),
        definition: sanitizeInput(definition),
        language: language || defaultLanguage || "English",
        tags: [],
        aiGenerated,
        groupIds: [],
      });
      await updateSettings({ defaultDefinitionLanguage: language || defaultLanguage || "English" });
      resetAndClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-2xl">
        <div className="frost-panel flex max-h-[78vh] min-h-[32rem] flex-col overflow-hidden">
          <div className="border-b border-white/10 p-3">
            <div className="space-y-1">
              <h1 className="serif-display text-2xl">Add New Definition</h1>
              <p className="subtle-caption">Capture a new word definition quickly.</p>
            </div>
          </div>

          <div className="custom-scrollbar space-y-4 overflow-y-auto p-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Word</div>
              <Input
                className="frost-input"
                value={word}
                onChange={(event) => {
                  setWord(event.target.value);
                  setErrors((current) => ({ ...current, word: undefined }));
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
              {errors.word ? <p className="text-xs text-destructive">{errors.word}</p> : null}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Language</div>
              <Select
                value={language}
                onValueChange={(value) => {
                  setLanguage(value);
                  setAiGenerated(false);
                }}
              >
                <SelectTrigger className="frost-select form-select w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong">
                  {LANGUAGES.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
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
                  disabled={!word.trim() || aiLoading}
                  className="gap-2 glass border-glass-border"
                >
                  {aiLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  AI Define
                </Button>
              </div>
              <textarea
                className="frost-input form-textarea"
                value={definition}
                onChange={(event) => {
                  setDefinition(event.target.value);
                  setAiGenerated(false);
                  setErrors((current) => ({ ...current, definition: undefined }));
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
              {errors.definition ? <p className="text-xs text-destructive">{errors.definition}</p> : null}
            </div>

            {message ? <p className="subtle-caption">{message}</p> : null}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-white/10 p-3">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              className="border-white/15 bg-white/6 hover:bg-white/14"
              onClick={() => resetAndClose()}
            >
              Close
            </Button>

            <Button
              type="button"
              disabled={saving || !word.trim() || !definition.trim()}
              className="lexi-btn-primary"
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
              Add Definition
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
