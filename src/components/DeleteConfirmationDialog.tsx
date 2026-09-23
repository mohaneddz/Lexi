import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteConfirmationDialogProps {
  open: boolean;
  title?: string;
  description: string;
  confirmLabel?: string;
  /** Offers "Don't show this again". Off for confirmations that must always be asked. */
  allowSkip?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (skipNextTime: boolean) => void;
}

export function DeleteConfirmationDialog({
  open,
  title = "Delete item?",
  description,
  confirmLabel = "Delete",
  allowSkip = true,
  onOpenChange,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const [skipNextTime, setSkipNextTime] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="glass-strong">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {allowSkip ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={skipNextTime}
              onChange={(event) => setSkipNextTime(event.target.checked)}
              className="size-4 accent-white"
            />
            Don't show this again
          </label>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setSkipNextTime(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm(skipNextTime);
              setSkipNextTime(false);
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
