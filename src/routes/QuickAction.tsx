import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";

import { CaptureForm, type CaptureMode } from "@/components/CaptureForm";

/** The p-3 around the form, top and bottom. */
const WINDOW_PADDING_PX = 24;

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

  // If hiding is ever refused, closing still works: the Rust side turns a
  // close request on this window into a hide, so it stays warm for next time.
  const hide = useMemo(() => () => {
    windowRef.hide().catch((error) => {
      console.error("Failed to hide quick capture window, closing instead", error);
      void windowRef.close();
    });
  }, [windowRef]);
  const lastHeightRef = useRef(0);

  // The window sizes itself to the form, so nothing is cut off and there's
  // no empty band under it. It stays inside the screen; past that the form
  // body scrolls as a last resort.
  const fitToContent = useCallback((formHeight: number) => {
    const height = Math.min(formHeight + WINDOW_PADDING_PX, Math.floor(window.screen.availHeight * 0.92));
    if (Math.abs(height - lastHeightRef.current) < 2) return;
    lastHeightRef.current = height;
    void windowRef.setSize(new LogicalSize(window.innerWidth, height)).catch((error) => {
      console.error("Failed to resize quick capture window", error);
    });
  }, [windowRef]);

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
        onNaturalHeightChange={fitToContent}
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
