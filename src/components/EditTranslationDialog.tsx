import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Translation } from "@/types";
import { sanitizeInput } from "@/utils/validators";

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

interface EditTranslationDialogProps {
  open: boolean;
  translation: Translation | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<Translation>) => Promise<void>;
}

export function EditTranslationDialog({
  open,
  translation,
  onOpenChange,
  onSave,
}: EditTranslationDialogProps) {
  const [sourceWord, setSourceWord] = useState("");
  const [targetWord, setTargetWord] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("French");
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!translation) {
      return;
    }

    setSourceWord(translation.sourceWord);
    setTargetWord(translation.targetWord);
    setSourceLanguage(translation.sourceLanguage || "English");
    setTargetLanguage(translation.targetLanguage || "French");
    setContext(translation.context || "");
  }, [translation]);

  const handleSave = async () => {
    if (!translation || !sourceWord.trim() || !targetWord.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSave(translation.id, {
        sourceWord: sanitizeInput(sourceWord),
        targetWord: sanitizeInput(targetWord),
        sourceLanguage,
        targetLanguage,
        context: context.trim() ? sanitizeInput(context) : undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Translation</DialogTitle>
          <DialogDescription>Update translation pair and optional context.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <select
              value={sourceLanguage}
              onChange={(event) => setSourceLanguage(event.target.value)}
              className="frost-input"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <Input
              value={sourceWord}
              onChange={(event) => setSourceWord(event.target.value)}
              className="glass border-glass-border"
              placeholder="Source word"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <select
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
              className="frost-input"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <Input
              value={targetWord}
              onChange={(event) => setTargetWord(event.target.value)}
              className="glass border-glass-border"
              placeholder="Target word"
            />
          </div>

          <label className="space-y-1">
            <span className="text-sm font-medium">Context (optional)</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-glass-border bg-transparent px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || !sourceWord.trim() || !targetWord.trim()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
