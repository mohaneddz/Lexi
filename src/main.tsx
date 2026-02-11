import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Titlebar from "./layout/Titlebar";

import "@/styles/globals.css";

const isQuickWindow =
  window.location.pathname === "/quick-define" ||
  window.location.pathname === "/quick-translate" ||
  new URLSearchParams(window.location.search).get("quick") === "define" ||
  new URLSearchParams(window.location.search).get("quick") === "translate";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {!isQuickWindow ? <Titlebar /> : null}
    <App />
  </React.StrictMode>,
);
