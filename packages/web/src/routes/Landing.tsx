import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTransitionNavigate } from "../useViewTransition.js";
import { LocationPicker } from "../components/LocationPicker";
import { isCompleteCode, sessionCodeFrom } from "@wherever/shared";
import type { SessionFilters } from "@wherever/shared";
import { TeaserStack } from "../components/TeaserStack.js";
import { Modal } from "../components/Modal.js";
import { ScanQr } from "../components/ScanQr.js";
import { qrScanSupported } from "../qrScan.js";
import { createSession, getLocation, rememberName, recallName, DEFAULT_FILTERS } from "../api.js";

const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";

function CreateForm() {
  const go = useTransitionNavigate();
  const [name, setName] = useState(recallName());
  const [filters, setFilters] = useState<SessionFilters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locOff, setLocOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Resolve location up front so we know whether to offer the NYC neighborhood shortcuts, and
  // reuse it at submit. If it's unavailable (denied/timeout), flag it so we can tell the user their
  // results will use a default area instead of silently serving the wrong city.
  useEffect(() => {
    getLocation().then((l) => {
      if (!alive.current) return;
      setLoc(l);
      setLocOff(l === null);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      rememberName(name.trim());
      // Apply browser geolocation only in the pure "near me" case. If the host picked a neighborhood
      // (area) or searched a zip/town (lat/lng already in filters), that explicit center wins and we
      // must NOT overlay the device location on top of it. Don't re-invoke geolocation here either.
      const usingExplicitCenter = Boolean(filters.area) || (filters.lat != null && filters.lng != null);
      const code = await createSession(name.trim(), {
        ...filters,
        ...(usingExplicitCenter ? {} : (loc ?? {})),
      });
      if (alive.current) go(`/s/${code}`);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : "Something broke. Probably not you.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        className={inputClass}
        aria-label="Your name"
        placeholder="Your name"
        value={name}
        maxLength={24}
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      {/* Location only. Everything else is set in the lobby, where the group can see it and where
          somebody is waiting for people to join anyway. */}
      <LocationPicker filters={filters} onChange={setFilters} />
      {error && (
        <p role="alert" className="text-sm text-flare">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition"
      >
        {busy ? "Shuffling the deck..." : "Deal the cards"}
      </button>
      {locOff && (
        <p className="text-center text-sm text-muted">
          location's off. search a zip or town above, or you'll get a default area.
        </p>
      )}
    </form>
  );
}

function JoinForm() {
  const go = useTransitionNavigate();
  const [name, setName] = useState(recallName());
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  /* Asked once, on mount. The answer needs a promise, and a button that appears three seconds late is
     worse than one that was never offered. */
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    let alive = true;
    void qrScanSupported().then((ok) => {
      if (alive) setCanScan(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !isCompleteCode(code)) return;
    rememberName(name.trim());
    go(`/s/${code}`);
  }

  /* The name still has to be filled in, so a scan fills the code and stops rather than jumping into
     the room. Scanning is the tedious half; typing your own name is not. */
  function scanned(raw: string) {
    setScanning(false);
    setCode(sessionCodeFrom(raw));
  }

  if (scanning) return <ScanQr onCode={scanned} onClose={() => setScanning(false)} />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        className={inputClass}
        aria-label="Your name"
        placeholder="Your name"
        value={name}
        maxLength={24}
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      {/* No maxLength: a pasted invite link has to arrive whole for the parser to find the code in it. */}
      <input
        className={`${inputClass} tracking-[0.4em] uppercase`}
        aria-label="Session code"
        placeholder="CODE"
        // Not a field any password manager or address book has a value for.
        autoComplete="off"
        value={code}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setCode(sessionCodeFrom(e.target.value))}
      />
      <button
        type="submit"
        disabled={!name.trim() || !isCompleteCode(code)}
        className="rounded-2xl border border-white/15 px-6 py-3 text-lg font-semibold disabled:opacity-50 hover:bg-white/5 transition"
      >
        Join
      </button>
      {canScan ? (
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="text-sm text-muted transition hover:text-cream"
        >
          Or point your camera at their code
        </button>
      ) : null}
    </form>
  );
}

export default function Landing() {
  /*
   * The manifest's two home-screen shortcuts land here with `?new=1` or `?join=1`, so a long-press on
   * the installed icon opens the dialog rather than the page behind it. Read once, on mount: they are
   * an entry point, not state, and leaving them in the address bar would reopen the dialog on every
   * back-navigation.
   */
  const [modal, setModal] = useState<"create" | "join" | null>(() => {
    const asked = new URLSearchParams(window.location.search);
    if (asked.has("new")) return "create";
    if (asked.has("join")) return "join";
    return null;
  });
  useEffect(() => {
    if (!window.location.search) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <main className="landing">
      <div className="landing-hero">
        <section className="landing-intro">
          <p className="landing-eyebrow">
            <span aria-hidden>↗</span> Dinner plans. Finally.
          </p>
          <h1>
            Big appetites.
            <br />
            Tiny{" "}
            <span className="hero-opinions">
              opinions.
              <svg viewBox="0 0 380 18" aria-hidden>
                <path d="M4 12 Q180 -2 376 10 M30 16 Q205 6 343 15" />
              </svg>
            </span>
          </h1>
          <p className="landing-description">
            Pick somewhere to eat. Together. Swipe on nearby restaurants and let the group decide.
          </p>
          <p className="landing-aside">“Anything is fine” has entered the chat. Again.</p>
          <div className="landing-actions">
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                setModal("create");
              }}
              className="landing-start"
            >
              Start a session <span aria-hidden>↗</span>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                setModal("join");
              }}
              className="landing-join"
            >
              Join with a code <span aria-hidden>→</span>
            </button>
          </div>
          <p className="landing-footnote">No accounts. Just names and questionable taste.</p>
        </section>
        <section className="dinner-board" aria-label="Interactive example of restaurant voting">
          <div className="board-heading">
            <span>THE DINNER DILEMMA</span>
            <span className="example-label">EXAMPLE</span>
          </div>
          <div className="board-doodle" aria-hidden>
            <svg viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="30" />
              <circle cx="40" cy="40" r="23" />
              <path d="M30 37v3m20-3v3m-18 8q8 9 16 0M8 10v16m-5-16v10q5 10 10 0V10M8 28v38m64-55v55m0-55q-10 12 0 25" />
            </svg>
          </div>
          <div className="board-note">
            Everyone has an opinion.
            <br />
            <span>Some of them are useful.</span>
          </div>
          <div className="board-deck">
            <TeaserStack />
          </div>
          <p className="board-caption">
            <span aria-hidden>↑</span> Try a vote. Very low stakes.
          </p>
          <div className="board-bottom">
            <span>ONE GROUP. ONE PLACE.</span>
            <span aria-hidden>✳</span>
          </div>
        </section>
      </div>
      <section className="landing-how" aria-label="How it works">
        <div className="how-intro">
          <span className="landing-eyebrow">THE PLAN</span>
          <p>
            Less debating.
            <br />
            More eating.
          </p>
        </div>
        <div className="how-step">
          <span className="step-number">01</span>
          <h2>Gather the hungry.</h2>
          <p>Start a session and share the code. Everyone gets the same deck.</p>
        </div>
        <div className="how-step">
          <span className="step-number">02</span>
          <h2>Have a tiny opinion.</h2>
          <p>Swipe yes or nope. One veto each, for your personal food nemesis.</p>
        </div>
        <div className="how-step">
          <span className="step-number">03</span>
          <h2>Go eat something.</h2>
          <p>The most-liked place wins. The group chat can take the night off.</p>
        </div>
      </section>

      {modal === "create" && (
        <Modal title="Start a session" onClose={() => setModal(null)}>
          <CreateForm />
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Got a code?" onClose={() => setModal(null)}>
          <JoinForm />
        </Modal>
      )}
    </main>
  );
}
