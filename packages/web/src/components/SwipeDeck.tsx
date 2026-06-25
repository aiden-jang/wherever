import { useCallback, useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import type { Restaurant, SwipeDirection } from "@wherever/shared";
import { distanceLabel, priceLabel, styleFor } from "./cardStyle.js";

const SWIPE_THRESHOLD = 110;

function CardFace({ restaurant }: { restaurant: Restaurant }) {
  const s = styleFor(restaurant.category);
  return (
    <>
      <div
        className="h-48 flex items-center justify-center text-7xl"
        style={{ background: restaurant.imageUrl ? undefined : s.gradient }}
      >
        {restaurant.imageUrl ? (
          <img src={restaurant.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="drop-shadow-lg">{s.emoji}</span>
        )}
      </div>
      <div className="p-5">
        <div className="font-display text-2xl font-bold leading-tight">
          {restaurant.name}
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted">
          <span>{restaurant.category}</span>
          <span className="text-white/20">|</span>
          <span className="text-acid">
            {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
          </span>
          <span className="text-white/20">|</span>
          <span>{priceLabel(restaurant.priceTier)}</span>
          <span className="text-white/20">|</span>
          <span>{distanceLabel(restaurant.distanceMeters)}</span>
        </div>
      </div>
    </>
  );
}

function TopCard({
  restaurant,
  exitDir,
  onCommit,
}: {
  restaurant: Restaurant;
  exitDir: SwipeDirection;
  onCommit: (dir: SwipeDirection) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-16, 16]);
  const yes = useTransform(x, [30, 130], [0, 1]);
  const nope = useTransform(x, [-130, -30], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/60 overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.5}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) onCommit("right");
        else if (info.offset.x < -SWIPE_THRESHOLD) onCommit("left");
      }}
      exit={{
        x: exitDir === "right" ? 700 : -700,
        opacity: 0,
        transition: { duration: 0.28 },
      }}
    >
      <CardFace restaurant={restaurant} />
      <motion.span
        className="absolute top-6 left-6 rotate-[-14deg] rounded-xl border-2 border-acid px-4 py-1.5 text-lg font-extrabold tracking-widest text-acid"
        style={{ opacity: yes }}
      >
        LET&apos;S EAT
      </motion.span>
      <motion.span
        className="absolute top-6 right-6 rotate-[14deg] rounded-xl border-2 border-flare px-4 py-1.5 text-lg font-extrabold tracking-widest text-flare"
        style={{ opacity: nope }}
      >
        HARD PASS
      </motion.span>
    </motion.div>
  );
}

export function SwipeDeck({
  restaurants,
  alreadyVoted = [],
  onSwipe,
}: {
  restaurants: Restaurant[];
  alreadyVoted?: string[];
  onSwipe: (restaurantId: string, direction: SwipeDirection) => void;
}) {
  // Resume after a reconnect: start at the first card this client has not voted.
  const [index, setIndex] = useState(() => {
    const voted = new Set(alreadyVoted);
    const first = restaurants.findIndex((r) => !voted.has(r.id));
    return first === -1 ? restaurants.length : first;
  });
  const [exitDir, setExitDir] = useState<SwipeDirection>("right");

  const commit = useCallback(
    (dir: SwipeDirection) => {
      const current = restaurants[index];
      if (!current) return;
      setExitDir(dir);
      onSwipe(current.id, dir);
      setIndex((i) => i + 1);
    },
    [index, restaurants, onSwipe],
  );

  // Desktop: arrow keys swipe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") commit("left");
      else if (e.key === "ArrowRight") commit("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit]);

  const done = index >= restaurants.length;

  if (done) {
    return (
      <div className="text-center max-w-sm mx-auto mt-10">
        <div className="text-5xl">🧾</div>
        <h2 className="mt-4 font-display text-3xl font-bold">That's all of them.</h2>
        <p className="mt-2 text-muted">
          Your votes are in. Now we wait for everyone else to stop overthinking
          it. Results land in the next build step.
        </p>
      </div>
    );
  }

  const upcoming = restaurants.slice(index + 1, index + 3);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative h-[360px]">
        {/* Background cards, peeking behind the top one. */}
        {upcoming
          .map((r, i) => (
            <div
              key={r.id}
              className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 overflow-hidden transition-transform duration-200"
              style={{
                transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 14}px)`,
                zIndex: -i - 1,
              }}
            >
              <CardFace restaurant={r} />
            </div>
          ))
          .reverse()}

        <AnimatePresence initial={false}>
          <TopCard
            key={restaurants[index]!.id}
            restaurant={restaurants[index]!}
            exitDir={exitDir}
            onCommit={commit}
          />
        </AnimatePresence>
      </div>

      <div className="mt-8 flex items-center justify-center gap-6">
        <button
          type="button"
          aria-label="Hard pass"
          onClick={() => commit("left")}
          className="grid place-items-center h-16 w-16 rounded-full border border-white/15 text-2xl hover:border-flare hover:text-flare hover:scale-105 transition"
        >
          ✕
        </button>
        <span className="text-sm text-muted tabular-nums">
          {index + 1} / {restaurants.length}
        </span>
        <button
          type="button"
          aria-label="Let's eat"
          onClick={() => commit("right")}
          className="grid place-items-center h-16 w-16 rounded-full bg-acid text-ink text-2xl font-bold hover:scale-105 transition"
        >
          ♥
        </button>
      </div>
    </div>
  );
}
