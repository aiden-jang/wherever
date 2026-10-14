import type { Restaurant } from "@wherever/shared";
import { mapsUrl } from "./DirectionsDialog.js";

export function PlanDirections({
  restaurant,
  unavailable,
  onOpen,
  className = "",
}: {
  restaurant: Restaurant;
  unavailable: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const style = `plan-directions ${className}`;
  return unavailable ? (
    <a href={mapsUrl(restaurant)} target="_blank" rel="noopener noreferrer" className={style}>
      See it in Google Maps <span aria-hidden>↗</span>
    </a>
  ) : (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        onOpen();
      }}
      className={style}
    >
      Get directions <span aria-hidden>↗</span>
    </button>
  );
}
