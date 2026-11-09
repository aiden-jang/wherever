import type { Restaurant } from "@wherever/shared";
import { mapsUrl } from "./DirectionsDialog.js";

const linkClass =
  "min-h-11 rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]";

export function PlaceLinks({ restaurant, showMap }: { restaurant: Restaurant; showMap: boolean }) {
  if (!showMap && !restaurant.phone && !restaurant.website) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
      {showMap && (
        <a
          href={mapsUrl(restaurant)}
          target="_blank"
          aria-describedby="external-link-hint"
          rel="noopener noreferrer"
          className={linkClass}
        >
          View on Google Maps <span aria-hidden>↗</span>
        </a>
      )}
      {restaurant.phone && (
        <a href={`tel:${restaurant.phone}`} className={linkClass}>
          Call the place
        </a>
      )}
      {restaurant.website && (
        <a
          href={restaurant.website}
          target="_blank"
          aria-describedby="external-link-hint"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Website ↗
        </a>
      )}
    </div>
  );
}
