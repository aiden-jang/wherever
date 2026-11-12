import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTransitionNavigate } from "../useViewTransition.js";
import { FieldLabel } from "../components/FilterControls.js";
import { LocationPicker, type LocationStatus } from "../components/LocationPicker";
import { isCompleteCode, sessionCodeFrom } from "@wherever/shared";
import type { SessionFilters } from "@wherever/shared";
import { LandingPreview } from "../components/LandingPreview.js";
import { Modal } from "../components/Modal.js";
import { ScanQr } from "../components/ScanQr.js";
import { qrScanSupported } from "../qrScan.js";
import { createSession, getLocation, rememberName, recallName, DEFAULT_FILTERS } from "../api.js";

const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";

function CreateForm({ openRoom }: { openRoom: (code: string) => void }) {
  const [name, setName] = useState(recallName);
  const [filters, setFilters] = useState<SessionFilters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locPending, setLocPending] = useState(true);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const createRequest = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      createRequest.current?.abort();
    };
  }, []);

  // Resolve the device location once and show the fallback area if permission is unavailable.
  useEffect(() => {
    getLocation().then((l) => {
      if (!alive.current) return;
      setLoc(l);
      setLocPending(false);
    });
  }, []);

  const usingExplicitCenter = Boolean(filters.area) || (filters.lat != null && filters.lng != null);
  const waitingForLocation = !usingExplicitCenter && locPending;
  const canCreate = Boolean(name.trim()) && !busy && locationStatus === "idle" && !waitingForLocation;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || createRequest.current) return;
    setBusy(true);
    setError(null);
    try {
      rememberName(name.trim());
      const controller = new AbortController();
      createRequest.current = controller;
      const code = await createSession(
        name.trim(),
        {
          ...filters,
          ...(usingExplicitCenter ? {} : (loc ?? { locationLabel: "New York City" })),
        },
        controller.signal,
      );
      if (alive.current) openRoom(code);
    } catch (err) {
      if (!alive.current) return;
      createRequest.current = null;
      setError(err instanceof Error ? err.message : "Something broke. Probably not you.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <FieldLabel>Your name</FieldLabel>
        <input
          className={inputClass}
          aria-label="Your name"
          name="displayName"
          placeholder="e.g. Alex…"
          value={name}
          maxLength={24}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          autoFocus={window.matchMedia("(pointer: fine)").matches}
        />
      </label>
      {/* Location only. Everything else is set in the lobby, where the group can see it and where
          somebody is waiting for people to join anyway. */}
      <fieldset disabled={busy} className="min-w-0">
        <LocationPicker
          filters={filters}
          onChange={setFilters}
          onLocationStatusChange={setLocationStatus}
          deviceLocation={loc}
          deferDeviceLocation={locPending}
        />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-flare">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canCreate}
        className="rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition"
      >
        {busy
          ? "Creating room…"
          : locationStatus === "searching" || waitingForLocation
            ? "Finding your location…"
            : "Create room"}
      </button>
      {!usingExplicitCenter && !locPending && !loc && (
        <p className="text-center text-sm text-muted" role="status">
          Your location is unavailable. Search for a ZIP code or town, or use New York City.
        </p>
      )}
    </form>
  );
}

function JoinForm({ openRoom, initialCode }: { openRoom: (code: string) => void; initialCode: string }) {
  const [name, setName] = useState(recallName);
  const [code, setCode] = useState(initialCode);
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
    openRoom(code);
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
      <label className="flex flex-col gap-2">
        <FieldLabel>Your name</FieldLabel>
        <input
          className={inputClass}
          aria-label="Your name"
          name="displayName"
          placeholder="e.g. Alex…"
          value={name}
          maxLength={24}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
          autoFocus={(!initialCode || !name.trim()) && window.matchMedia("(pointer: fine)").matches}
        />
      </label>
      {/* No maxLength: a pasted invite link has to arrive whole for the parser to find the code in it. */}
      <label className="flex flex-col gap-2">
        <FieldLabel>Session code</FieldLabel>
        <input
          className={`${inputClass} tracking-[0.4em] uppercase`}
          aria-label="Session code"
          name="code"
          placeholder="e.g. ABCDEF…"
          // Not a field any password manager or address book has a value for.
          autoComplete="off"
          value={code}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={Boolean(initialCode && name.trim()) && window.matchMedia("(pointer: fine)").matches}
          onChange={(e) => setCode(sessionCodeFrom(e.target.value))}
        />
      </label>
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

export default function Landing({ needsRoomReload }: { needsRoomReload: () => boolean }) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const go = useTransitionNavigate();
  const modal = params.has("new") ? "create" : params.has("join") ? "join" : null;
  const initialCode = typeof state?.inviteCode === "string" ? sessionCodeFrom(state.inviteCode) : "";
  function openRoom(code: string) {
    const invite = `/s/${code}`;
    // A browser can remember a failed module download until the next document load.
    if (needsRoomReload()) window.location.assign(invite);
    else go(invite);
  }

  function setModal(next: "create" | "join" | null) {
    if (next === null && state?.landingDialog === true) {
      navigate(-1);
      return;
    }
    const updated = new URLSearchParams(params);
    updated.delete("new");
    updated.delete("join");
    if (next) updated.set(next === "create" ? "new" : "join", "1");
    setParams(updated, {
      replace: next === null,
      preventScrollReset: true,
      state: { landingDialog: next !== null },
    });
  }

  return (
    <main id="main-content" tabIndex={-1} className="landing">
      <div className="landing-hero">
        <section className="landing-intro">
          <h1>
            Big appetites.
            <br />
            <span className="text-ember">Tiny opinions.</span>
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
        <section aria-label="Interactive example of restaurant voting">
          <LandingPreview suspended={modal !== null} />
        </section>
      </div>
      <section className="landing-how" aria-label="How it works">
        <div className="how-intro">
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
          <p>
            Yes votes earn 1 point, super-likes earn 2, and a veto takes a place out. The highest score wins.
          </p>
        </div>
      </section>

      {modal === "create" && (
        <Modal title="Start a session" onClose={() => setModal(null)}>
          <CreateForm openRoom={openRoom} />
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Got a code?" onClose={() => setModal(null)}>
          <JoinForm openRoom={openRoom} initialCode={initialCode} />
        </Modal>
      )}
    </main>
  );
}
