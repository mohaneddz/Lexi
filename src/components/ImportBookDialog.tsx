import { useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DICTIONARY_EXAMPLE = `{
  "id": "my-botany-terms",
  "title": "Botany Terms",
  "version": "1.0.0",
  "type": "dictionary",
  "description": "Terms I keep forgetting.",
  "inputLanguages": ["English"],
  "outputLanguages": ["English"],
  "entries": [
    {
      "term": "petiole",
      "language": "English",
      "definition": "The stalk that joins a leaf to a stem.",
      "aliases": ["leafstalk"]
    }
  ]
}`;

const TRANSLATION_EXAMPLE = `{
  "id": "my-kitchen-fr",
  "title": "Kitchen Words (English to French)",
  "version": "1.0.0",
  "type": "translation",
  "description": "Cooking vocabulary.",
  "inputLanguages": ["English"],
  "outputLanguages": ["French"],
  "entries": [
    {
      "source": "whisk",
      "target": "fouet",
      "sourceLanguage": "English",
      "targetLanguage": "French"
    }
  ]
}`;

interface ImportBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: () => Promise<void>;
}

export function ImportBookDialog({ open, onOpenChange, onImport }: ImportBookDialogProps) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      await onImport();
      onOpenChange(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import that file.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a book file</DialogTitle>
          <DialogDescription>
            A book is a single JSON file. Pick whichever shape matches what you are adding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Every book needs</p>
            <ul className="space-y-1 text-muted-foreground">
              <li><code className="key-cap">id</code> a unique id. Reusing an existing id replaces that book.</li>
              <li><code className="key-cap">title</code>, <code className="key-cap">description</code> what shows on the card.</li>
              <li><code className="key-cap">version</code> bump it to offer an update for a book already installed.</li>
              <li><code className="key-cap">type</code> either <code className="key-cap">dictionary</code> or <code className="key-cap">translation</code>.</li>
              <li><code className="key-cap">inputLanguages</code>, <code className="key-cap">outputLanguages</code> drive the language filters.</li>
              <li><code className="key-cap">entries</code> the words themselves, shaped by the type.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium">A dictionary defines words in one language</p>
            <p className="text-muted-foreground">
              Each entry needs <code className="key-cap">term</code>, <code className="key-cap">language</code> and{" "}
              <code className="key-cap">definition</code>. <code className="key-cap">aliases</code> is optional and is searched too.
            </p>
            <pre className="frost-panel-soft custom-scrollbar overflow-x-auto p-3 text-xs leading-relaxed">
              {DICTIONARY_EXAMPLE}
            </pre>
          </div>

          <div className="space-y-2">
            <p className="font-medium">A translation pairs two languages</p>
            <p className="text-muted-foreground">
              Each entry needs <code className="key-cap">source</code>, <code className="key-cap">target</code>,{" "}
              <code className="key-cap">sourceLanguage</code> and <code className="key-cap">targetLanguage</code>. Both sides are
              searchable, so you can look a word up in either language.
            </p>
            <pre className="frost-panel-soft custom-scrollbar overflow-x-auto p-3 text-xs leading-relaxed">
              {TRANSLATION_EXAMPLE}
            </pre>
          </div>

          <p className="subtle-caption">
            The file is copied into Lexi on import, so it keeps working if you move or delete the original.
          </p>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={importing} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="lexi-btn-primary" disabled={importing} onClick={() => void handleImport()}>
            {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            Choose file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
