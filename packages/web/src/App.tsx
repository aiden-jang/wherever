import { usePageAnalytics } from "./usePageAnalytics.js";
import { pageForPath } from "../../../analytics/schema.js";
import { AppUpdate } from "./AppUpdate.js";
import { lazy, Suspense, type CSSProperties } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./routes/Landing.js";
import Share from "./routes/Share.js";
import NotFound from "./routes/NotFound.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { SoundToggle } from "./components/SoundToggle.js";
import { useHourMood } from "./useHourMood.js";

const Lobby = lazy(() => import("./routes/Lobby.js"));

export default function App() {
  const mood = useHourMood();
  return (
    <BrowserRouter>
      <AnalyticsPage />
      <div className="grain min-h-full flex flex-col">
        <div
          className="aurora"
          aria-hidden
          data-mood={mood.id}
          style={
            {
              "--aurora-from": mood.from,
              "--aurora-via": mood.via,
              "--aurora-to": mood.to,
              "--aurora-opacity": mood.opacity,
            } as CSSProperties
          }
        />

        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <Link to="/" className="site-wordmark">
            <span className="brand-plate" aria-hidden>
              <img src="/icon.svg" alt="" width="34" height="34" />
            </span>{" "}
            <span>
              Wherever<span className="text-ember">,</span> Honestly
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <SoundToggle />
          </div>
        </header>

        <ErrorBoundary>
          <Suspense
            fallback={
              <main id="main-content" className="table-room">
                <p role="status">Loading room…</p>
              </main>
            }
          >
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/s/:code" element={<Lobby />} />
              {/* Registered in the manifest as the app's `share_target`. */}
              <Route path="/share" element={<Share />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>

        <LandingUpdate />
        <footer className="site-footer">
          <p className="flex justify-center gap-4">
            <a className="underline" href="/privacy.html">
              Privacy
            </a>
            <a className="underline" href="/terms.html">
              Terms
            </a>
          </p>
          <p className="mt-1">
            Made by{" "}
            <a
              href="https://aidenjang.com"
              target="_blank"
              aria-describedby="external-link-hint"
              rel="noopener"
              className="underline underline-offset-2 hover:text-cream transition-colors"
            >
              Aiden Jang
            </a>
          </p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

function LandingUpdate() {
  const { pathname } = useLocation();
  return <AppUpdate safe={pathname === "/"} />;
}

function AnalyticsPage() {
  const { pathname } = useLocation();
  usePageAnalytics(pageForPath(pathname), pathname);
  return null;
}
