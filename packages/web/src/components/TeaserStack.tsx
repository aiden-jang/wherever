import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  rotation: string;
  offset: string;
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
    rotation: "-8deg",
    offset: "translate(-38px, 26px)",
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
    rotation: "5deg",
    offset: "translate(30px, 12px)",
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
    rotation: "-1deg",
    offset: "translate(0, 0)",
  },
];

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
    <div className="preview-card">
      {/* Real (CC0) food photo over the gradient. If the image fails to load, it hides itself and
          the gradient + emoji underneath show through. */}
      <div className="relative h-44" style={{ background: card.gradient }}>
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
      <div className="preview-card-body">
        <div className="font-display text-2xl font-bold leading-tight">{card.name}</div>
        <div className="preview-meta">
          <span>{card.category}</span>
          <span className="preview-divider">·</span>
          <span className="preview-rating">★ {card.rating}</span>
          <span className="preview-divider">·</span>
          <span>{card.price}</span>
          <span className="preview-divider">·</span>
          <span>{card.distance}</span>
        </div>
      </div>
      {front && (
        <>
          {/* Backed, not bare. Acid green on a bright pizza photo at 12px reads as a scribble across
              the crust rather than as a stamp — the one bit of the hero card that says what the app
              does. The swipe stamps get the same treatment for the same reason. */}
          <span className="preview-stamp">A SOLID MAYBE</span>
          <div className="flex gap-3 px-4 pb-4">
            <button
              type="button"
              aria-label="Nope"
              onClick={() => onVote?.("left")}
              className="preview-vote preview-pass"
            >
              <span aria-hidden>✕</span> Nope
            </button>
            <button
              type="button"
              aria-label="Yes"
              onClick={() => onVote?.("right")}
              className="preview-vote preview-yes"
            >
              <span aria-hidden>♥</span> Yes, please
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
export function TeaserStack() {
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
