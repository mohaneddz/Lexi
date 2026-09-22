import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { CaptureForm, type CaptureMode } from "@/components/CaptureForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * The one capture surface for the whole app. Opened by the topbar Capture
 * button and the keyboard shortcuts, which pass the tab to start on.
 */
export function CaptureDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("define");

  useEffect(() => {
    const onCapture = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: CaptureMode }>).detail;
      if (detail?.mode === "define" || detail?.mode === "translate") {
        setMode(detail.mode);
      }
      setOpen(true);
    };

    window.addEventListener("lexi:capture", onCapture);
    return () => window.removeEventListener("lexi:capture", onCapture);
  }, []);

  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The form's own frost-panel is the frame, so the dialog shell stays
          transparent rather than drawing a second border around it, and the
          built-in close is hidden in favour of the form's own header button
          so this looks identical to the quick capture window. */}
      <DialogContent className="max-w-2xl border-none bg-transparent p-0 shadow-none [&>button]:hidden">
        <CaptureForm
          key={open ? "open" : "closed"}
          mode={mode}
          onModeChange={setMode}
          onClose={close}
          headerAction={(
            <button
              type="button"
              onClick={close}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
