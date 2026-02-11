import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { getSettings } from "@/utils/storage";

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
    "inline-flex h-[30px] w-[30px] items-center justify-center select-none z-[1000] [filter:invert(1)]";

  const btnHover = "hover:bg-gray-300";

  return (
    <div
      data-tauri-drag-region
      className={`fixed left-0 right-0 top-0 z-[1000] flex h-[30px] select-none justify-end border-b ${isFullscreen ? "pointer-events-none opacity-0" : ""}`}
    >
      {!isFullscreen && (
        <>
          <button
            onClick={() => appWindow.minimize()}
            className={`${btnBase} ${btnHover} z-[9999]`}
            id="titlebar-minimize"
            type="button"
          >
            <img
              src="https://api.iconify.design/mdi:window-minimize.svg"
              alt="minimize"
              className="h-4 w-4 pointer-events-none"
              draggable={false}
            />
          </button>

          <button
            onClick={async () => {
              await appWindow.toggleMaximize();
              setIsMaximized(await appWindow.isMaximized());
            }}
            className={`${btnBase} ${btnHover} z-[9999]`}
            id="titlebar-maximize"
            type="button"
          >
            {!isMaximized ? (
              <img
                src="https://api.iconify.design/mdi:window-maximize.svg"
                alt="maximize"
                className="h-4 w-4 pointer-events-none"
                draggable={false}
              />
            ) : (
              <img
                src="https://api.iconify.design/mdi:window-restore.svg"
                alt="restore"
                className="h-4 w-4 pointer-events-none"
                draggable={false}
              />
            )}
          </button>

          <button
            onClick={() => {
              if (hideToTray) {
                void invoke("hide_to_tray").catch(() => appWindow.hide());
                return;
              }
              void appWindow.close();
            }}
            className={`${btnBase} ${btnHover} z-[9999]`}
            id="titlebar-close"
            type="button"
          >
            <img
              src="https://api.iconify.design/mdi:close.svg"
              alt="close"
              className="h-4 w-4 pointer-events-none"
              draggable={false}
            />
          </button>
        </>
      )}
    </div>
  );
}
