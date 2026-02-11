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
import type { Word } from "@/types";
import { sanitizeInput, validateDefinition, validateWord } from "@/utils/validators";

const LANGUAGE_OPTIONS = [
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Arabic",
  "Japanese",
  "Korean",
  "Chinese",
];

interface EditWordDialogProps {
  open: boolean;
  word: Word | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<Word>) => Promise<void>;
}

export function EditWordDialog({ open, word, onOpenChange, onSave }: EditWordDialogProps) {
  const [value, setValue] = useState("");
  const [definition, setDefinition] = useState("");
  const [language, setLanguage] = useState("English");
  const [tagsText, setTagsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ word?: string; definition?: string }>({});

  useEffect(() => {
    if (!word) {
      return;
    }

    setValue(word.word);
    setDefinition(word.definition);
    setLanguage(word.language || "English");
    setTagsText(word.tags.join(", "));
    setErrors({});
  }, [word]);

  const handleSave = async () => {
    if (!word) {
      return;
    }

    const wordValidation = validateWord(value);
    const definitionValidation = validateDefinition(definition);

    if (!wordValidation.valid || !definitionValidation.valid) {
      setErrors({
        word: wordValidation.error,
        definition: definitionValidation.error,
      });
      return;
    }

    const tags = Array.from(
      new Set(
        tagsText
          .split(",")
          .map((tag) => sanitizeInput(tag))
          .filter(Boolean),
      ),
    );

    setSubmitting(true);
    try {
      await onSave(word.id, {
        word: sanitizeInput(value),
        definition: sanitizeInput(definition),
        language: sanitizeInput(language),
        tags,
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
          <DialogTitle>Edit Word</DialogTitle>
          <DialogDescription>Update word details, language, and tags.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-1">
            <span className="text-sm font-medium">Word</span>
            <Input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setErrors((current) => ({ ...current, word: undefined }));
              }}
              className="frost-input"
            />
            {errors.word ? <p className="text-xs text-destructive">{errors.word}</p> : null}
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium">Definition</span>
            <textarea
              value={definition}
              onChange={(event) => {
                setDefinition(event.target.value);
                setErrors((current) => ({ ...current, definition: undefined }));
              }}
              rows={4}
              className="frost-input form-textarea"
            />
            {errors.definition ? <p className="text-xs text-destructive">{errors.definition}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-sm font-medium">Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="frost-input form-select"
              >
                {LANGUAGE_OPTIONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-sm font-medium">Tags (comma-separated)</span>
              <Input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                className="frost-input"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={submitting}>
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



