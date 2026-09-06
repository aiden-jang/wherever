import type { Restaurant } from "@wherever/shared";

/** Reaching the winner directly, for the two things a group still asks after the vote. */
export function PlaceLinks({ restaurant }: { restaurant: Restaurant }) {
  if (!restaurant.phone && !restaurant.website) return null;
  return (
    <div className={`grid gap-2 ${restaurant.phone && restaurant.website ? "grid-cols-2" : "grid-cols-1"}`}>
      {restaurant.phone && (
        <a
          href={`tel:${restaurant.phone}`}
          className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]"
        >
          Call the place
        </a>
      )}
      {restaurant.website && (
        <a
          href={restaurant.website}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]"
        >
          Website ↗
        </a>
      )}
    </div>
  );
}
