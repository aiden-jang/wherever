import { useState } from "react";
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

export function LandingPreview() {
  const [index, setIndex] = useState(0);
  const card = CARDS[index]!;
  function vote(direction: "left" | "right") {
    buzz(direction === "right" ? 12 : [8, 20]);
    play(direction === "right" ? "like" : "pass");
    setIndex((current) => (current + 1) % CARDS.length);
  }

  return (
    <div className="preview-card">
      <div className="preview-photo relative" style={{ background: card.gradient }}>
        <span aria-hidden className="absolute inset-0 grid place-items-center text-glyph">
          {card.emoji}
        </span>
        <img
          key={card.image}
          src={card.image}
          alt=""
          fetchPriority={index === 0 ? "high" : undefined}
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
        <div aria-live="polite">
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight">{card.name}</h2>
          <p className="preview-meta">
            {card.category} · {card.rating} stars · {card.price} · {card.distance}
          </p>
        </div>
        <div className="vote-main">
          <button type="button" className="vote-no" onClick={() => vote("left")}>
            <span aria-hidden>✕</span> Nope
          </button>
          <button type="button" className="vote-yes" onClick={() => vote("right")}>
            <span aria-hidden>♥</span> Yes, please
          </button>
        </div>
      </div>
    </div>
  );
}
