import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { AppShell } from "@/layout/AppShell";
import Definitions from "@/routes/Definitions";
import Groups from "@/routes/Groups";
import Inbox from "@/routes/Inbox";
import QuickAction from "@/routes/QuickAction";
import Review from "@/routes/Review";
import Settings from "@/routes/Settings";
import Stats from "@/routes/Stats";
import Translations from "@/routes/Translations";
import Words from "@/routes/Words";
import { getSettings } from "@/utils/storage";

function AppRoutes() {
  const location = useLocation();
  const quickFromQuery = new URLSearchParams(location.search).get("quick");
  const quickMode =
    location.pathname === "/quick-define" || quickFromQuery === "define"
      ? "define"
      : location.pathname === "/quick-translate" || quickFromQuery === "translate"
        ? "translate"
        : null;

  if (quickMode) {
    return (
      <QuickAction mode={quickMode} />
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/words" element={<Words />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/translations" element={<Translations />} />
        <Route path="/definitions" element={<Definitions />} />
        <Route path="/review" element={<Review />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/quick-define" element={<Navigate to="/inbox" replace />} />
        <Route path="/quick-translate" element={<Navigate to="/inbox" replace />} />
        <Route path="*" element={<Navigate to="/inbox" replace />} />
      </Routes>
    </AppShell>
  );
}

function App() {
  useTheme();

  useEffect(() => {
    getSettings().then((settings) => {
      return invoke("set_hide_to_tray", { enabled: settings.hideToTray });
    }).catch(() => {
      // Ignore backend sync failures in web-only contexts.
    });

    const onSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ hideToTray?: boolean }>;
      if (typeof customEvent.detail?.hideToTray === "boolean") {
        void invoke("set_hide_to_tray", { enabled: customEvent.detail.hideToTray }).catch(() => {
          // Ignore backend sync failures in web-only contexts.
        });
      }
    };

    window.addEventListener("lexi:settings-updated", onSettingsUpdated);
    return () => window.removeEventListener("lexi:settings-updated", onSettingsUpdated);
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
