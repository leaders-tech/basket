/*
This file starts the React app and wraps it with the router and auth provider.
Edit this file when app-wide providers or startup behavior changes.
Do not copy this file. Change it when the whole frontend app bootstrap changes.
*/

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { AuthProvider } from "./app/auth";
import "./index.css";

if ("serviceWorker" in navigator) {
  // Check for a new version every minute, so an open tab picks up a fresh deploy without a manual reload.
  void import("virtual:pwa-register").then(({ registerSW }) =>
    registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (registration) setInterval(() => void registration.update(), 60_000);
      },
    }),
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
