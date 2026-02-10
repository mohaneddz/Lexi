import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { useTheme } from "@/hooks/useTheme";
import { AppShell } from "@/layout/AppShell";
import Definitions from "@/routes/Definitions";
import Groups from "@/routes/Groups";
import Inbox from "@/routes/Inbox";
import Review from "@/routes/Review";
import Settings from "@/routes/Settings";
import Stats from "@/routes/Stats";
import Translations from "@/routes/Translations";
import Words from "@/routes/Words";

function App() {
  useTheme();

  return (
    <BrowserRouter>
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
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
