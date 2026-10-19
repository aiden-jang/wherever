import { usePageAnalytics } from "./usePageAnalytics.js";
import { pageForPath } from "../../../analytics/schema.js";
import { AppUpdate } from "./AppUpdate.js";
import type { CSSProperties } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./routes/Landing.js";
import Share from "./routes/Share.js";
import Lobby from "./routes/Lobby.js";
import NotFound from "./routes/NotFound.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { SoundToggle } from "./components/SoundToggle.js";
import { useHourMood } from "./useHourMood.js";

export default function App() {
  const mood = useHourMood();
  return (
    <MotionConfig reducedMotion="user">
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
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/s/:code" element={<Lobby />} />
              {/* Registered in the manifest as the app's `share_target`. */}
              <Route path="/share" element={<Share />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>

          <LandingUpdate />
          <footer className="site-footer">
            <p>Place data powered by Google</p>
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
    </MotionConfig>
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
