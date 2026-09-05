import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/*
 * The two faces, self-hosted rather than linked from Google.
 *
 * A stylesheet from fonts.googleapis.com is a render-blocking request to a third party on the
 * critical path, and this app tells people it has no accounts and asks for nothing. Sending every
 * first paint to Google is a quiet contradiction of that.
 *
 * Each package ships one @font-face per subset with a `unicode-range`, so the browser still fetches
 * only the Latin file it actually renders.
 *
 * Bricolage takes the `opsz` cut, not the smaller `wght` one. Both span weights 200-800; only this
 * one carries the optical-size axis, and the browser applies it by default, so dropping it made the
 * 60px wordmark 9% wider than it has always been. 35kB to keep the masthead the shape it is.
 */
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
