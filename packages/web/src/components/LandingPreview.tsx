import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";

interface TeaserCard {
  name: string;
  category: string;
  emoji: string;
  image: string;
  price: string;
  rating: string;
  distance: string;
  gradient: string;
}

const CARDS: TeaserCard[] = [
  {
    name: "Late Night Pizza Decisions",
    category: "Pizza",
    emoji: "🍕",
    image: "/teaser-pizza.jpg",
    price: "$",
    rating: "4.4",
    distance: "0.9 mi",
    gradient: "linear-gradient(135deg, var(--color-ember), var(--color-flare))",
  },
  {
    name: "Noodle Situation",
    category: "Ramen",
    emoji: "🍜",
    image: "/teaser-ramen.jpg",
    price: "$$",
    rating: "4.1",
    distance: "1.1 mi",
    gradient: "linear-gradient(135deg, var(--color-grape), var(--color-flare))",
  },
  {
    name: "Probably Fine Tacos",
    category: "Tacos",
    emoji: "🌮",
    image: "/teaser-tacos.jpg",
    price: "$",
    rating: "4.6",
    distance: "0.5 mi",
    gradient: "linear-gradient(135deg, var(--color-flame), var(--color-ember))",
  },
];

export function LandingPreview({ suspended = false }: { suspended?: boolean }) {
  const reduce = useReducedMotion();
  const [frame, setFrame] = useState({ index: 0, direction: -1, manual: false });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (reduce !== false || paused || hovered || focused || !visible || suspended) return;
    const timer = setTimeout(
      () =>
        setFrame((current) => ({
          index: (current.index + 1) % CARDS.length,
          direction: -1,
          manual: false,
        })),
      6500,
    );
    return () => clearTimeout(timer);
  }, [reduce, paused, hovered, focused, visible, suspended, frame.index]);
  const card = CARDS[frame.index]!;
  function vote(direction: "left" | "right") {
    buzz(direction === "right" ? 12 : [8, 20]);
    play(direction === "right" ? "like" : "pass");
    setFrame((current) => ({
      index: (current.index + 1) % CARDS.length,
      direction: direction === "right" ? 1 : -1,
      manual: true,
    }));
  }

  return (
    <section
      className="preview-card"
      aria-label="Example restaurant preview"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="preview-card-viewport">
        <div key={card.name} className="preview-card-content" data-direction={frame.direction}>
          <div className="preview-photo relative" style={{ background: card.gradient }}>
            <span aria-hidden className="absolute inset-0 grid place-items-center text-glyph">
              {card.emoji}
            </span>
            <img
              key={card.image}
              src={card.image}
              alt=""
              fetchPriority={frame.index === 0 ? "high" : undefined}
              width={640}
              height={400}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
              className="relative h-full w-full object-cover"
            />
          </div>
          <div className="preview-card-body">
            <p className="text-xs font-medium">Example restaurant</p>
            <div aria-live={frame.manual ? "polite" : "off"}>
              <h2 className="preview-title mt-2 font-display text-3xl font-bold leading-tight">
                {card.name}
              </h2>
              <p className="preview-meta">
                {card.category} · {card.rating} stars · {card.price} · {card.distance}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-card-actions">
        <div className="vote-main">
          <button type="button" className="vote-no" onClick={() => vote("left")}>
            <span aria-hidden>✕</span> Nope
          </button>
          <button type="button" className="vote-yes" onClick={() => vote("right")}>
            <span aria-hidden>♥</span> Yes, please
          </button>
        </div>
        <div className="preview-playback">
          <span>
            {frame.index + 1} / {CARDS.length} examples
          </span>
          {!reduce && (
            <button type="button" onClick={() => setPaused((value) => !value)}>
              {paused ? "Play preview" : "Pause preview"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
