import type { Restaurant } from "@wherever/shared";
import { Modal } from "./Modal.js";

/**
 * A Google Maps link to the winning place itself (the place page, not turn-by-turn navigation), so
 * tapping the button just opens the spot in Maps. Prefers the place's canonical Maps URI; otherwise
 * a name+address search, with the address included so it resolves to the right spot even for chains.
 */
export function mapsUrl(r: Pick<Restaurant, "name" | "address" | "googleMapsUri">): string {
  return (
    r.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address ?? ""}`.trim())}`
  );
}

/** The result screen is the moment people leave, so an operational winner should open navigation—not just a listing. */
function directionsUrl(r: Restaurant): string {
  const destination = `${r.name} ${r.address ?? ""}`.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function appleDirectionsUrl(r: Restaurant): string {
  const destination = `${r.name} ${r.address ?? ""}`.trim();
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
}

function wazeDirectionsUrl(r: Restaurant): string {
  const destination = `${r.name} ${r.address ?? ""}`.trim();
  return `https://www.waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}

export function DirectionsDialog({
  restaurant,
  addressCopied,
  addressCopyFailed,
  onCopyAddress,
  onClose,
}: {
  restaurant: Restaurant;
  addressCopied: boolean;
  addressCopyFailed: boolean;
  onCopyAddress: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal title="How are we getting there?" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        Pick the map app you already trust with the aux cord.
      </p>
      {restaurant.address && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-cream/90">
          {restaurant.address}
        </p>
      )}
      <div className="mt-5 grid gap-2">
        <a
          href={directionsUrl(restaurant)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="rounded-full bg-ember px-5 py-3 text-center text-sm font-semibold text-ink transition hover:brightness-110 active:scale-[0.98]"
        >
          Google Maps ↗
        </a>
        <a
          href={appleDirectionsUrl(restaurant)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]"
        >
          Apple Maps ↗
        </a>
        <a
          href={wazeDirectionsUrl(restaurant)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="rounded-full border border-white/15 px-5 py-3 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]"
        >
          Waze ↗
        </a>
      </div>
      {restaurant.address && (
        <button
          type="button"
          onClick={() => void onCopyAddress()}
          disabled={addressCopied}
          className="mt-3 w-full px-4 py-2 text-xs font-semibold text-muted transition hover:text-cream disabled:opacity-70"
        >
          {addressCopied
            ? "Address copied"
            : addressCopyFailed
              ? "Couldn’t copy. Select the address above."
              : "Copy address instead"}
        </button>
      )}
    </Modal>
  );
}
