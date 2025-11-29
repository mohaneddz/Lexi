import{ useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

export default function Titlebar() {
  const appWindow = getCurrentWindow();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const toggleFullscreen = async () => {
    const fullscreen = await appWindow.isFullscreen();
    const maximized = await appWindow.isMaximized();

    if (!fullscreen && maximized) {
      await appWindow.unmaximize();
      setTimeout(() => appWindow.setFullscreen(true), 50);
    } else {
      appWindow.setFullscreen(!fullscreen);
    }
  };

  useEffect(() => {
    let unlisteners: Array<() => void | Promise<void>> = [];

    (async () => {
      setIsFullscreen(await appWindow.isFullscreen());
      setIsMaximized(await appWindow.isMaximized());

      // register listeners and store unlisten functions
      const u1 = await listen('tauri://fullscreen', () => setIsFullscreen(true));
      unlisteners.push(() => u1());

      const u2 = await listen('tauri://enter-fullscreen', () => setIsFullscreen(true));
      unlisteners.push(() => u2());

      const u3 = await listen('tauri://exit-fullscreen', () => setIsFullscreen(false));
      unlisteners.push(() => u3());

      const u4 = await listen('tauri://maximize', () => setIsMaximized(true));
      unlisteners.push(() => u4());

      const u5 = await listen('tauri://unmaximize', () => setIsMaximized(false));
      unlisteners.push(() => u5());

      const u6 = await listen('tauri://minimize', () => console.log('Window minimized'));
      unlisteners.push(() => u6());

      const u7 = await listen('tauri://resize', async () => {
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
      });
      unlisteners.push(() => u7());
    })();

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', keydownHandler);

    return () => {
      // cleanup listeners
      unlisteners.forEach((u) => {
        try {
          u();
        } catch { /* ignore */ }
      });
      window.removeEventListener('keydown', keydownHandler);
    };
  }, []); // run once on mount

  return (
    <div data-tauri-drag-region className="titlebar">
      {!isFullscreen && (
        <>
          <button onClick={() => appWindow.minimize()} className="titlebar-button z-9999" id="titlebar-minimize">
            <img src="https://api.iconify.design/mdi:window-minimize.svg" alt="minimize" />
          </button>

          <button
            onClick={async () => {
              await appWindow.toggleMaximize();
              const max = await appWindow.isMaximized();
              setIsMaximized(max);
            }}
            className="titlebar-button z-9999"
            id="titlebar-maximize"
          >
            {!isMaximized ? (
              <img src="https://api.iconify.design/mdi:window-maximize.svg" alt="maximize" />
            ) : (
              <img src="https://api.iconify.design/mdi:window-restore.svg" alt="restore" />
            )}
          </button>

          <button onClick={() => appWindow.close()} className="titlebar-button z-9999" id="titlebar-close">
            <img src="https://api.iconify.design/mdi:close.svg" alt="close" />
          </button>
        </>
      )}
    </div>
  );
}
