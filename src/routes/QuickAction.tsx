import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";

import { CaptureForm, type CaptureMode } from "@/components/CaptureForm";

interface QuickActionProps {
  /** Tab to start on before the first show event arrives. */
  initialMode?: CaptureMode;
}

export default function QuickAction({ initialMode = "define" }: QuickActionProps) {
  const windowRef = useMemo(() => getCurrentWindow(), []);

  const [mode, setMode] = useState<CaptureMode>(initialMode);
  // Bumped every time the window is shown so the form remounts clean rather
  // than holding whatever was typed the last time it was open.
  const [session, setSession] = useState(0);

  const hide = useMemo(() => () => { void windowRef.hide(); }, [windowRef]);

  useEffect(() => {
    // The window is never destroyed, only hidden, so each show has to reset
    // the form and set the tab the shortcut asked for.
    const unlisten = windowRef.listen<string>("lexi:quick-open", (event) => {
      if (event.payload === "define" || event.payload === "translate") {
        setMode(event.payload);
      }
      setSession((current) => current + 1);
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [windowRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hide();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hide]);

  return (
    <div className="h-full w-full p-3">
      <CaptureForm
        key={session}
        mode={mode}
        onModeChange={setMode}
        onClose={hide}
        dragRegion
        headerAction={(
          <button
            type="button"
            onClick={hide}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        )}
      />
    </div>
  );
}
