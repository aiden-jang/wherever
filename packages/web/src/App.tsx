import type { CSSProperties } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
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

          <header className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
            <Link to="/" className="font-display text-lg font-extrabold tracking-tight">
              Wherever<span className="text-ember">,</span> Honestly
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

          <footer className="mt-auto px-6 py-6 max-w-6xl mx-auto w-full text-center text-xs text-muted">
            <p>Place data powered by Google</p>
            <p className="mt-1">
              Made by{" "}
              <a
                href="https://aidenjang.com"
                target="_blank"
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
