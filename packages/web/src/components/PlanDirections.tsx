import type { Restaurant } from "@wherever/shared";
import { mapsUrl } from "./DirectionsDialog.js";

export function PlanDirections({
  restaurant,
  unavailable,
  onOpen,
}: {
  restaurant: Restaurant;
  unavailable: boolean;
  onOpen: () => void;
}) {
  return unavailable || !restaurant.address?.trim() ? (
    <a
      href={mapsUrl(restaurant)}
      target="_blank"
      aria-describedby="external-link-hint"
      rel="noopener noreferrer"
      className="plan-directions"
    >
      See it in Google Maps <span aria-hidden>↗</span>
    </a>
  ) : (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        onOpen();
      }}
      className="plan-directions"
    >
      Get directions <span aria-hidden>↗</span>
    </button>
  );
}
