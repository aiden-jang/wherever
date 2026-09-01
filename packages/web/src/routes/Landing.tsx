import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { buzz } from "../components/haptics.js";
import { LocationPicker } from "../components/FilterFields";
import { play } from "../components/sound.js";
import { useLine } from "../useLine.js";
import { isCompleteCode, sessionCodeFrom } from "@wherever/shared";
import type { SessionFilters } from "@wherever/shared";
import {
} from "@wherever/shared";
import { Modal } from "../components/Modal.js";
import { ScanQr, qrScanSupported } from "../components/ScanQr.js";
import {
  createSession,
  getLocation,
  rememberName,
  recallName,
  DEFAULT_FILTERS,
} from "../api.js";


interface TeaserCard {
  name: string;
  category: string;
  emoji: string;
  image: string;
  price: string;
  rating: string;
  distance: string;
  gradient: string;
  rotation: string;
  offset: string;
}

const CARDS: TeaserCard[] = [
  { name: "Late Night Pizza Decisions", category: "Pizza", emoji: "🍕", image: "/teaser-pizza.jpg", price: "$", rating: "4.4", distance: "0.9 mi", gradient: "linear-gradient(135deg, var(--color-ember), var(--color-flare))", rotation: "-8deg", offset: "translate(-38px, 26px)" },
  { name: "Noodle Situation", category: "Ramen", emoji: "🍜", image: "/teaser-ramen.jpg", price: "$$", rating: "4.1", distance: "1.1 mi", gradient: "linear-gradient(135deg, var(--color-grape), var(--color-flare))", rotation: "5deg", offset: "translate(30px, 12px)" },
  { name: "Probably Fine Tacos", category: "Tacos", emoji: "🌮", image: "/teaser-tacos.jpg", price: "$", rating: "4.6", distance: "0.5 mi", gradient: "linear-gradient(135deg, var(--color-flame), var(--color-ember))", rotation: "-1deg", offset: "translate(0, 0)" },
];

function StatusLine() {
  return <p className="mt-8 text-sm text-muted">{useLine("landing", 2800)}</p>;
}

/** The visual body of a teaser card. The front card also shows the working Nope/Yes controls. */
function TeaserCardFace({
  card,
  front = false,
  onVote,
}: {
  card: TeaserCard;
  front?: boolean;
  onVote?: (dir: "left" | "right") => void;
}) {
  return (
    <div className="rounded-card bg-ink-soft border border-white/10 shadow-raised overflow-hidden">
      {/* Real (CC0) food photo over the gradient. If the image fails to load, it hides itself and
          the gradient + emoji underneath show through. */}
      <div className="relative h-36" style={{ background: card.gradient }}>
        <span className="absolute inset-0 flex items-center justify-center text-glyph">
          <span className="drop-shadow-lg">{card.emoji}</span>
        </span>
        <img
          src={card.image}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="relative h-full w-full object-cover"
        />
      </div>
      <div className="p-4">
        <div className="font-display text-lg font-semibold leading-tight">{card.name}</div>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted">
          <span>{card.category}</span>
          <span className="text-white/20">·</span>
          <span className="text-acid">★ {card.rating}</span>
          <span className="text-white/20">·</span>
          <span>{card.price}</span>
          <span className="text-white/20">·</span>
          <span>{card.distance}</span>
        </div>
      </div>
      {front && (
        <>
          {/* Backed, not bare. Acid green on a bright pizza photo at 12px reads as a scribble across
              the crust rather than as a stamp — the one bit of the hero card that says what the app
              does. The swipe stamps get the same treatment for the same reason. */}
          <span className="absolute top-4 left-4 rotate-[-12deg] rounded-lg border-2 border-acid bg-ink/70 px-3 py-1 text-xs font-bold tracking-widest text-acid backdrop-blur-[2px]">
            LET&apos;S EAT
          </span>
          <div className="flex gap-3 px-4 pb-4">
            <button
              type="button"
              aria-label="Nope"
              onClick={() => onVote?.("left")}
              className="flex-1 rounded-2xl border border-white/10 py-2 text-lg hover:border-flare hover:text-flare active:scale-95 transition duration-300 ease-spring"
            >
              ✕
            </button>
            <button
              type="button"
              aria-label="Yes"
              onClick={() => onVote?.("right")}
              className="flex-1 rounded-2xl bg-acid py-2 text-lg text-ink font-bold hover:brightness-110 active:scale-95 transition duration-300 ease-spring"
            >
              ♥
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Fixed slots the three cards sit in (front → back), so cycling swaps content, not positions.
const TEASER_SLOTS = [
  "translate(0px, 0px) rotate(-1deg)",
  "translate(30px, 12px) rotate(5deg) scale(0.95)",
  "translate(-38px, 26px) rotate(-8deg) scale(0.9)",
];

/**
 * A tiny, working swipe demo on the landing page: tap ♥/✕ on the front card and it flies off, the
 * next slides up. Shows the actual mechanic instead of faking it with dead buttons.
 */
function TeaserStack() {
  const [idx, setIdx] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right">("right");
  const reduce = useReducedMotion();

  // The teaser is the only thing on this page you can actually swipe, so it's also where the app
  // gets to show that swiping makes a noise. Same cues as the real deck.
  const vote = (dir: "left" | "right") => {
    buzz(dir === "right" ? 12 : [8, 20]);
    play(dir === "right" ? "like" : "pass");
    setExitDir(dir);
    setIdx((i) => (i + 1) % CARDS.length);
  };

  const front = CARDS[idx]!;

  return (
    <div className="relative h-full w-full flex items-center justify-center">
      {/* Background cards, peeking behind the front one. */}
      {[2, 1].map((depth) => {
        const card = CARDS[(idx + depth) % CARDS.length]!;
        return (
          <div
            key={`slot-${depth}`}
            className="absolute w-64 sm:w-72"
            style={{ transform: TEASER_SLOTS[depth], zIndex: 3 - depth }}
            aria-hidden
          >
            <TeaserCardFace card={card} />
          </div>
        );
      })}

      <AnimatePresence initial={false}>
        <motion.div
          key={front.name}
          className="absolute w-64 sm:w-72"
          style={{ zIndex: 3 }}
          initial={reduce ? { opacity: 0 } : { scale: 0.92, y: 24, opacity: 0 }}
          animate={{ x: 0, y: 0, scale: 1, rotate: -1, opacity: 1 }}
          exit={
            reduce
              ? { opacity: 0, transition: { duration: 0.12 } }
              : {
                  x: exitDir === "right" ? 380 : -380,
                  rotate: exitDir === "right" ? 16 : -16,
                  opacity: 0,
                  transition: { duration: 0.32 },
                }
          }
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <TeaserCardFace card={front} front onVote={vote} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";






function CreateForm({ onError }: { onError: (m: string) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(recallName());
  const [filters, setFilters] = useState<SessionFilters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locOff, setLocOff] = useState(false);
  const [busy, setBusy] = useState(false);

  // Resolve location up front so we know whether to offer the NYC neighborhood shortcuts, and
  // reuse it at submit. If it's unavailable (denied/timeout), flag it so we can tell the user their
  // results will use a default area instead of silently serving the wrong city.
  useEffect(() => {
    getLocation().then((l) => {
      setLoc(l);
      setLocOff(l === null);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      rememberName(name.trim());
      // Apply browser geolocation only in the pure "near me" case. If the host picked a neighborhood
      // (area) or searched a zip/town (lat/lng already in filters), that explicit center wins and we
      // must NOT overlay the device location on top of it. Don't re-invoke geolocation here either.
      const usingExplicitCenter =
        Boolean(filters.area) || (filters.lat != null && filters.lng != null);
      const code = await createSession(name.trim(), {
        ...filters,
        ...(usingExplicitCenter ? {} : (loc ?? {})),
      });
      navigate(`/s/${code}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something broke. Probably not you.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input className={inputClass} placeholder="Your name" value={name} maxLength={24} autoComplete="name" onChange={(e) => setName(e.target.value)} autoFocus />
      {/* Location only. Everything else is set in the lobby, where the group can see it and where
          somebody is waiting for people to join anyway. */}
      <LocationPicker filters={filters} onChange={setFilters} />
      <button type="submit" disabled={!name.trim() || busy} className="rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition">
        {busy ? "Shuffling the deck..." : "Deal the cards"}
      </button>
      {locOff && (
        <p className="text-center text-sm text-ink/60">
          location's off. search a zip or town above, or you'll get a default area.
        </p>
      )}
    </form>
  );
}

function JoinForm() {
  const navigate = useNavigate();
  const [name, setName] = useState(recallName());
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  /* Asked once, on mount. The answer needs a promise, and a button that appears three seconds late is
     worse than one that was never offered. */
  const [canScan, setCanScan] = useState(false);
  useEffect(() => {
    let alive = true;
    void qrScanSupported().then((ok) => { if (alive) setCanScan(ok); });
    return () => { alive = false; };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !isCompleteCode(code)) return;
    rememberName(name.trim());
    navigate(`/s/${code}`);
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
      <input className={inputClass} placeholder="Your name" value={name} maxLength={24} autoComplete="name" onChange={(e) => setName(e.target.value)} autoFocus />
      {/* No maxLength: a pasted invite link has to arrive whole for the parser to find the code in it. */}
      <input
        className={`${inputClass} tracking-[0.4em] uppercase`}
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
      <button type="submit" disabled={!name.trim() || !isCompleteCode(code)} className="rounded-2xl border border-white/15 px-6 py-3 text-lg font-semibold disabled:opacity-50 hover:bg-white/5 transition">
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
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex-1 grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto w-full px-6 pb-16">
      <section className="text-center lg:text-left">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-acid animate-pulse" />
          you're not fine with whatever
        </span>

        <h1 className="mt-6 font-display font-extrabold tracking-tight text-6xl sm:text-7xl leading-[0.95]">
          Wherever<span className="text-ember">,</span>
          <span className="block bg-gradient-to-r from-ember via-flare to-grape bg-clip-text text-transparent">Honestly</span>
        </h1>

        <p className="mt-5 text-lg text-muted max-w-md mx-auto lg:mx-0">
          Nobody's actually "fine with whatever." Swipe on it. Majority wins, the group chat loses.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
          <button type="button" onClick={() => setModal("create")} className="rounded-full bg-ember px-8 py-4 text-lg font-semibold text-ink shadow-lg shadow-ember/30 hover:scale-[1.03] hover:shadow-ember/50 transition-transform">
            Start a session
          </button>
          <button type="button" onClick={() => setModal("join")} className="rounded-full border border-white/15 px-8 py-4 text-lg font-semibold hover:border-white/40 hover:bg-white/5 transition-colors">
            Join with a code
          </button>
        </div>

        <StatusLine />
      </section>

      <section className="relative h-[420px] flex items-center justify-center">
        <div className="float relative h-full w-full flex items-center justify-center" style={{ animation: "float-soft 6s ease-in-out infinite" }}>
          <TeaserStack />
        </div>
      </section>

      {modal === "create" && (
        <Modal title="Start a session" onClose={() => setModal(null)}>
          <CreateForm onError={setError} />
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Got a code?" onClose={() => setModal(null)}>
          <JoinForm />
        </Modal>
      )}
      {error && (
        <Modal title="That went poorly" onClose={() => setError(null)}>
          <p className="text-muted">{error}</p>
        </Modal>
      )}
    </main>
  );
}
