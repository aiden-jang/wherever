import { usePageAnalytics } from "./usePageAnalytics.js";
import { pageForPath } from "../../../analytics/schema.js";
import { AppUpdate } from "./AppUpdate.js";
import { lazy, Suspense, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./routes/Landing.js";
import Share from "./routes/Share.js";
import NotFound from "./routes/NotFound.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { PlateState } from "./components/PlateState.js";
import { SoundToggle } from "./components/SoundToggle.js";
import { useHourMood } from "./useHourMood.js";

// An offline document only describes its initial navigation, even after the user goes Home.
const offlineInviteKey = document.documentElement.hasAttribute("data-offline-invite")
  ? (window.history.state?.key ?? "default")
  : null;
let roomLoadFailed = false;
const needsRoomReload = () => roomLoadFailed;
const Lobby = lazy(() =>
  import("./routes/Lobby.js").catch(() => {
    roomLoadFailed = true;
    return { default: InviteUnavailable };
  }),
);

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
              <Route path="/" element={<Landing needsRoomReload={needsRoomReload} />} />
              <Route
                path="/s/:code"
                element={
                  <InviteEntry>
                    <Lobby />
                  </InviteEntry>
                }
              />
              {/* Registered in the manifest as the app's `share_target`. */}
              <Route
                path="/share"
                element={
                  <InviteEntry>
                    <Share />
                  </InviteEntry>
                }
              />
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
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  return <AppUpdate safe={pathname === "/" && !params.has("new") && !params.has("join")} />;
}

function AnalyticsPage() {
  const { pathname } = useLocation();
  usePageAnalytics(pageForPath(pathname), pathname);
  return null;
}

function InviteEntry({ children }: { children: ReactNode }) {
  return useLocation().key === offlineInviteKey ? <InviteUnavailable /> : children;
}

function InviteUnavailable() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <main id="main-content" tabIndex={-1} className="table-room grid place-items-center text-center">
      <div className="table-panel w-full max-w-sm">
        <PlateState />
        <h1 ref={heading} tabIndex={-1} className="mt-4 font-display text-state font-bold">
          Can’t open this invite
        </h1>
        <p className="mt-3 text-muted">Reconnect to the internet, then try again to join the room.</p>
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => location.reload()}
            className="min-h-11 rounded-xl bg-ember px-4 py-3 font-semibold text-ink hover:brightness-110 transition"
          >
            Try again
          </button>
          <Link
            to="/"
            reloadDocument
            className="grid min-h-11 place-items-center rounded-xl border border-white/15 px-4 py-3 font-semibold hover:bg-white/5 transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
