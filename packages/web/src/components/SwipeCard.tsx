import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { type Restaurant, type SwipeDirection } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { CardFace } from "./CardFace.js";

import { throwVerdict, distanceText } from "@wherever/shared";

/** A screen-reader summary of the card, so deciding isn't a guess without sight. */
function cardDescription(r: Restaurant, revisit?: string | null): string {
  const parts: (string | null)[] = [r.name, categoryLabel(r.category)];
  if (r.rating) {
    parts.push(
      r.reviewCount ? `${r.rating} stars, ${reviewCountLabel(r.reviewCount)} reviews` : `${r.rating} stars`,
    );
  }
  parts.push(priceLabel(r.priceTier), distanceText(r.distanceMeters));
  // Closed is worth hearing before you vote, same as seeing it.
  if (r.openNow === false) parts.push("closed right now");
  if (revisit) parts.push(revisit);
  return parts.filter(Boolean).join(", ");
}

// A press that moves less than this many pixels counts as a tap (open details) rather than a drag.
const TAP_MOVE_TOLERANCE = 8;

export function SwipeCard({
  revisit,
  restaurant,
  onCommit,
  onOpenDetail,
}: {
  restaurant: Restaurant;
  revisit: string | null;
  onCommit: (dir: SwipeDirection) => void;
  onOpenDetail: (r: Restaurant) => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  // No tilt for motion-sensitive users; the card still tracks the drag horizontally.
  const rotate = useTransform(x, [-220, 220], reduce ? [0, 0] : [-16, 16]);
  const yes = useTransform(x, [30, 130], [0, 1]);
  const nope = useTransform(x, [-130, -30], [1, 0]);
  // Distinguish a tap from a drag (a vote) by how far the pointer travelled between down and up,
  // so tapping never fights the swipe gesture.
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // Photos: tapping the photo cycles through them; tapping the "i" badge or the text area opens
  // details. Fall back to the single imageUrl when there's no gallery.
  const photos =
    restaurant.photos && restaurant.photos.length > 0
      ? restaurant.photos
      : restaurant.imageUrl
        ? [restaurant.imageUrl]
        : [];
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    setPhotoIdx(0);
  }, [restaurant.id]);

  return (
    <motion.div
      className="absolute inset-0 meal-card rounded-card shadow-raised overflow-hidden cursor-grab active:cursor-grabbing"
      role="group"
      aria-roledescription="restaurant card"
      aria-label={cardDescription(restaurant, revisit)}
      style={{ x, rotate, touchAction: "pan-y" }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.5}
      onPointerDown={(e) => {
        pressStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = pressStart.current;
        pressStart.current = null;
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_MOVE_TOLERANCE) {
          return;
        }
        const target = e.target as HTMLElement;
        // Tapping the photo (but not the "i" badge sitting on it) cycles photos; everywhere else
        // — the badge and the text area below — opens details.
        if (
          photos.length > 1 &&
          target.closest?.("[data-card-photo]") &&
          !target.closest?.("[data-card-info]")
        ) {
          setPhotoIdx((i) => (i + 1) % photos.length);
        } else {
          onOpenDetail(restaurant);
        }
      }}
      onDragEnd={(_, info) => {
        const verdict = throwVerdict(info.offset.x, info.velocity.x);
        if (!verdict) return;
        onCommit(verdict);
      }}
    >
      <CardFace
        revisit={revisit}
        restaurant={restaurant}
        photoUrl={photos[photoIdx] ?? restaurant.imageUrl}
        photoCount={photos.length}
        photoIdx={photoIdx}
      />
      {/* The details affordance: a real hit target (data-card-info) so the tap handler opens details
          when it's tapped, even though the surrounding photo cycles. */}
      <button
        type="button"
        aria-label={`See details for ${restaurant.name}`}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          onOpenDetail(restaurant);
        }}
        data-card-info
        className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-sm font-semibold text-white/90 backdrop-blur-sm"
      >
        <span aria-hidden>i</span>
      </button>
      <motion.span
        className="absolute top-6 left-6 rotate-[-14deg] rounded-xl border-2 border-acid bg-ink/70 px-4 py-1.5 text-lg font-extrabold tracking-widest text-acid backdrop-blur-[2px]"
        style={{ opacity: yes }}
      >
        LET&apos;S EAT
      </motion.span>
      <motion.span
        className="absolute top-6 right-6 rotate-[14deg] rounded-xl border-2 border-flare bg-ink/70 px-4 py-1.5 text-lg font-extrabold tracking-widest text-flare backdrop-blur-[2px]"
        style={{ opacity: nope }}
      >
        NOPE
      </motion.span>
    </motion.div>
  );
}
