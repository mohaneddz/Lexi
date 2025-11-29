import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "@/styles/globals.css"
import "@/styles/misc.css"
import "@/styles/theme.css"
import "@/styles/utils.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
