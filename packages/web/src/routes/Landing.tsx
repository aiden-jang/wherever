import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal.js";
import {
  createSession,
  getLocation,
  rememberName,
  recallName,
  DEFAULT_FILTERS,
} from "../api.js";

const DEADPAN_LINES = [
  "Pretending to think about it...",
  "Nobody has typed 'idk, you pick' yet. A first.",
  "Three people. Three opinions. This'll go great.",
  "The group chat is shaking.",
  "Democracy, but for tacos.",
];

interface TeaserCard {
  name: string;
  category: string;
  emoji: string;
  price: string;
  rating: string;
  distance: string;
  gradient: string;
  rotation: string;
  offset: string;
}

const CARDS: TeaserCard[] = [
  { name: "Late Night Pizza Decisions", category: "Pizza", emoji: "🍕", price: "$", rating: "4.4", distance: "0.9 mi", gradient: "linear-gradient(135deg, #ff5e2c, #ff2d78)", rotation: "-8deg", offset: "translate(-38px, 26px)" },
  { name: "Noodle Situation", category: "Ramen", emoji: "🍜", price: "$$", rating: "4.1", distance: "1.1 mi", gradient: "linear-gradient(135deg, #7c3aed, #ff2d78)", rotation: "5deg", offset: "translate(30px, 12px)" },
  { name: "Probably Fine Tacos", category: "Tacos", emoji: "🌮", price: "$", rating: "4.6", distance: "0.5 mi", gradient: "linear-gradient(135deg, #ff8a3d, #ff5e2c)", rotation: "-1deg", offset: "translate(0, 0)" },
];

function StatusLine() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % DEADPAN_LINES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return <p className="mt-8 text-sm text-muted">{DEADPAN_LINES[i]}</p>;
}

function Card({ card, isFront }: { card: TeaserCard; isFront: boolean }) {
  return (
    <div
      className="absolute w-64 sm:w-72 rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/50 overflow-hidden"
      style={{ transform: `${card.offset} rotate(${card.rotation})` }}
    >
      <div className="h-36 flex items-center justify-center text-6xl" style={{ background: card.gradient }}>
        <span className="drop-shadow-lg">{card.emoji}</span>
      </div>
      <div className="p-4">
        <div className="font-display text-lg font-semibold leading-tight">{card.name}</div>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted">
          <span>{card.category}</span>
          <span className="text-white/20">|</span>
          <span className="text-acid">★ {card.rating}</span>
          <span className="text-white/20">|</span>
          <span>{card.price}</span>
          <span className="text-white/20">|</span>
          <span>{card.distance}</span>
        </div>
      </div>
      {isFront && (
        <>
          <span className="absolute top-4 left-4 rotate-[-12deg] rounded-lg border-2 border-acid px-3 py-1 text-xs font-bold tracking-widest text-acid">
            LET&apos;S EAT
          </span>
          <div className="flex gap-3 px-4 pb-4">
            <button type="button" aria-label="Nope" className="flex-1 rounded-2xl border border-white/10 py-2 text-lg hover:border-flare hover:text-flare transition-colors">✕</button>
            <button type="button" aria-label="Yes" className="flex-1 rounded-2xl bg-acid py-2 text-lg text-ink font-bold hover:brightness-110 transition">♥</button>
          </div>
        </>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";

function CreateForm({ onError }: { onError: (m: string) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(recallName());
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      rememberName(name.trim());
      const loc = await getLocation();
      const code = await createSession(name.trim(), {
        ...DEFAULT_FILTERS,
        ...(loc ?? {}),
      });
      navigate(`/s/${code}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something broke.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input className={inputClass} placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoFocus />
      <button type="submit" disabled={!name.trim() || busy} className="rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition">
        {busy ? "Spinning it up..." : "Create the session"}
      </button>
    </form>
  );
}

function JoinForm() {
  const navigate = useNavigate();
  const [name, setName] = useState(recallName());
  const [code, setCode] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || code.trim().length !== 6) return;
    rememberName(name.trim());
    navigate(`/s/${code.trim().toUpperCase()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input className={inputClass} placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className={`${inputClass} tracking-[0.4em] uppercase`} placeholder="CODE" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <button type="submit" disabled={!name.trim() || code.trim().length !== 6} className="rounded-2xl border border-white/15 px-6 py-3 text-lg font-semibold disabled:opacity-50 hover:bg-white/5 transition">
        Join
      </button>
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
          swipe. match. eat.
        </span>

        <h1 className="mt-6 font-display font-extrabold tracking-tight text-6xl sm:text-7xl leading-[0.95]">
          Wherever<span className="text-ember">,</span>
          <span className="block bg-gradient-to-r from-ember via-flare to-grape bg-clip-text text-transparent">Honestly</span>
        </h1>

        <p className="mt-5 text-lg text-muted max-w-md mx-auto lg:mx-0">
          Everyone swipes. Majority wins. Dinner is decided before the group chat even starts typing.
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
          {CARDS.map((card, idx) => (
            <Card key={card.name} card={card} isFront={idx === CARDS.length - 1} />
          ))}
        </div>
      </section>

      {modal === "create" && (
        <Modal title="Start a session" onClose={() => setModal(null)}>
          <CreateForm onError={setError} />
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Join with a code" onClose={() => setModal(null)}>
          <JoinForm />
        </Modal>
      )}
      {error && (
        <Modal title="Well, that didn't work" onClose={() => setError(null)}>
          <p className="text-muted">{error}</p>
        </Modal>
      )}
    </main>
  );
}
