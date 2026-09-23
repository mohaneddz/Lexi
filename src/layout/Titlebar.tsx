import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Minus, X, Square } from "lucide-react";
import { getSettings } from "@/utils/storage";

/** Two overlapping squares: the "restore down" glyph Windows shows on a maximized window. */
function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className={className} aria-hidden="true">
      <rect x="2.5" y="5" width="8.5" height="8.5" rx="1" />
      <path d="M5 5V3.5a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H11" />
    </svg>
  );
}

export default function Titlebar() {
  const appWindow = getCurrentWindow();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [hideToTray, setHideToTray] = useState(false);

  const toggleFullscreen = async () => {
    const fullscreen = await appWindow.isFullscreen();
    const maximized = await appWindow.isMaximized();

    if (!fullscreen && maximized) {
      await appWindow.unmaximize();
      setTimeout(() => appWindow.setFullscreen(true), 50);
    } else {
      await appWindow.setFullscreen(!fullscreen);
    }
  };

  useEffect(() => {
    let unlisteners: Array<() => void | Promise<void>> = [];

    (async () => {
      const settings = await getSettings();
      setHideToTray(settings.hideToTray);

      setIsFullscreen(await appWindow.isFullscreen());
      setIsMaximized(await appWindow.isMaximized());

      const u1 = await listen("tauri://fullscreen", () => setIsFullscreen(true));
      unlisteners.push(() => u1());

      const u2 = await listen("tauri://enter-fullscreen", () => setIsFullscreen(true));
      unlisteners.push(() => u2());

      const u3 = await listen("tauri://exit-fullscreen", () => setIsFullscreen(false));
      unlisteners.push(() => u3());

      const u4 = await listen("tauri://maximize", () => setIsMaximized(true));
      unlisteners.push(() => u4());

      const u5 = await listen("tauri://unmaximize", () => setIsMaximized(false));
      unlisteners.push(() => u5());

      const u6 = await listen("tauri://minimize", () => console.log("Window minimized"));
      unlisteners.push(() => u6());

      const u7 = await listen("tauri://resize", async () => {
        setIsMaximized(await appWindow.isMaximized());
        setIsFullscreen(await appWindow.isFullscreen());
      });
      unlisteners.push(() => u7());
    })();

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", keydownHandler);

    const onSettingsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ hideToTray?: boolean }>;
      if (typeof custom.detail?.hideToTray === "boolean") {
        setHideToTray(custom.detail.hideToTray);
      }
    };

    window.addEventListener("lexi:settings-updated", onSettingsUpdated);

    return () => {
      unlisteners.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
      window.removeEventListener("keydown", keydownHandler);
      window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btnBase =
    "inline-flex h-[30px] w-[30px] items-center justify-center select-none text-foreground group";

  const btnHover = "hover:bg-gray-300";

  return (
    <div
      data-tauri-drag-region
      className={`fixed left-0 right-0 top-0 z-[45] flex h-[30px] select-none justify-end border-b ${isFullscreen ? "pointer-events-none opacity-0" : ""}`}
    >
      {!isFullscreen && (
        <>
          <button
            onClick={() => appWindow.minimize()}
            className={`${btnBase} ${btnHover}`}
            id="titlebar-minimize"
            aria-label="Minimize"
            title="Minimize"
            type="button"
          >
            <Minus className="h-4 w-4 pointer-events-none group-hover:text-black" aria-hidden="true" />
          </button>

          <button
            onClick={async () => {
              await appWindow.toggleMaximize();
              setIsMaximized(await appWindow.isMaximized());
            }}
            className={`${btnBase} ${btnHover}`}
            id="titlebar-maximize"
            type="button"
            aria-label={isMaximized ? "Restore down" : "Maximize"}
            title={isMaximized ? "Restore down" : "Maximize"}
          >
            {isMaximized ? (
              <RestoreIcon className="h-4 w-4 pointer-events-none group-hover:text-black" />
            ) : (
              <Square className="h-3.5 w-3.5 pointer-events-none group-hover:text-black" aria-hidden="true" />
            )}
          </button>

          <button
            onClick={() => {
              if (hideToTray) {
                void invoke("hide_to_tray").catch(() => appWindow.close());
                return;
              }
              void appWindow.close();
            }}
            className={`${btnBase} hover:bg-red-600`}
            id="titlebar-close"
            aria-label="Close"
            title="Close"
            type="button"
          >
            <X className="h-4 w-4 pointer-events-none group-hover:text-white" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
