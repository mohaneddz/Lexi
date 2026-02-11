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
  confirmdiv?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (skipNextTime: boolean) => void;
}

export function DeleteConfirmationDialog({
  open,
  title = "Delete item?",
  description,
  confirmdiv = "Delete",
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

        <div className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={skipNextTime}
            onChange={(event) => setSkipNextTime(event.target.checked)}
            className="size-4 accent-white"
          />
          Don't show this again
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setSkipNextTime(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm(skipNextTime);
              setSkipNextTime(false);
            }}
            className="bg-destructive hover:bg-destructive/90"
          >
            {confirmdiv}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
