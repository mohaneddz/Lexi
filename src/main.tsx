import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Titlebar from "./layout/Titlebar";

import "@/styles/globals.css";

const isQuickWindow = new URLSearchParams(window.location.search).has("quick");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {!isQuickWindow ? <Titlebar /> : null}
    <App />
  </React.StrictMode>,
);
