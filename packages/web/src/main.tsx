import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-host font subsets; Bricolage uses the optical-size cut to preserve the wordmark geometry.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/inter";

import App from "./App.js";
import "./index.css";
import { primeOnFirstGesture } from "./components/sound.js";

primeOnFirstGesture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker for installability + offline shell — production only. In dev a
// cache-first worker serves stale bundles, so instead we unregister any that's lingering.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app works fine without it.
      });
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
  }
}
