import { useEffect, useState } from "react";

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

interface TextPromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void | Promise<void>;
}

/** In-app stand-in for window.prompt, which Tauri shows as a native popup that doesn't match the app. */
export function TextPromptDialog({
  open,
  title,
  description,
  placeholder,
  submitLabel = "Save",
  onOpenChange,
  onSubmit,
}: TextPromptDialogProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" className="border-white/15 bg-white/6 hover:bg-white/14" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting || !value.trim()} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
