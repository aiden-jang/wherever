import { useEffect, useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { AMENITY_OPTIONS } from "@wherever/shared";
import { categoryLabel, distanceLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

const chipClass =
  "inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-muted";

/** Google Maps deep link: the place's own URI when we have it, else a name+address search. */
function mapsUrlFor(r: Restaurant): string {
  if (r.googleMapsUri) return r.googleMapsUri;
  const query = `${r.name} ${r.address ?? ""}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const actionClass =
  "flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition";

/**
 * A tap-to-open sheet with everything the Places response gave us about one restaurant: photo,
 * stats, whether it's open, address, weekly hours, and links out (Maps / website / call). Renders as
 * a bottom sheet on phones and a centered card on wider screens. Backdrop and Escape both close it.
 */
export function RestaurantDetail({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tinder-style gallery: one photo at a time, tap left/right to move. Only the current photo is
  // rendered, so a photo's bytes (the billable fetch) load on demand as you tap to it — not all up
  // front.
  const gallery = restaurant.photos ?? [];
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    setPhotoIdx(0);
  }, [restaurant.id]);

  const hasLinks = restaurant.website || restaurant.phone;
  // A permanent/temporary closure is more important than open-now, so it takes the status slot.
  const closedLabel =
    restaurant.businessStatus === "CLOSED_PERMANENTLY"
      ? "Permanently closed"
      : restaurant.businessStatus === "CLOSED_TEMPORARILY"
        ? "Temporarily closed"
        : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-soft shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${restaurant.name} details`}
      >
        {gallery.length > 1 ? (
          <div className="relative h-44 select-none bg-ink-soft">
            <img
              src={gallery[photoIdx]}
              alt=""
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
              className="h-full w-full object-cover"
            />
            {/* Progress segments (Instagram/Tinder style) showing which photo you're on. */}
            <div className="pointer-events-none absolute inset-x-3 top-2 flex gap-1">
              {gallery.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i === photoIdx ? "bg-white" : "bg-white/35"}`}
                />
              ))}
            </div>
            {/* Tap the left/right half to step through photos; clamped at the ends. */}
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))}
              className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
            />
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setPhotoIdx((i) => Math.min(gallery.length - 1, i + 1))}
              className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
            />
          </div>
        ) : (
          <RestaurantPhoto imageUrl={restaurant.imageUrl} category={restaurant.category} className="h-44" />
        )}

        <div className="p-5">
          <div className="font-display text-2xl font-bold leading-tight">{restaurant.name}</div>
          <div className="mt-2 truncate text-sm text-muted">{categoryLabel(restaurant.category)}</div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="whitespace-nowrap text-acid">
              {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
              {restaurant.rating && restaurant.reviewCount
                ? ` (${reviewCountLabel(restaurant.reviewCount)})`
                : ""}
            </span>
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">{priceLabel(restaurant.priceTier)}</span>
            {restaurant.priceRange && (
              <>
                <span className="text-white/20">·</span>
                <span className="whitespace-nowrap">{restaurant.priceRange}</span>
              </>
            )}
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">{distanceLabel(restaurant.distanceMeters)}</span>
          </div>

          {restaurant.editorialSummary && (
            <p className="mt-3 text-sm leading-snug text-cream/90">{restaurant.editorialSummary}</p>
          )}

          {closedLabel ? (
            <p className="mt-3 text-sm font-semibold text-flare">{closedLabel}</p>
          ) : (
            restaurant.openNow != null && (
              <p
                className={`mt-3 text-sm font-semibold ${
                  restaurant.openNow ? "text-acid" : "text-flare"
                }`}
              >
                {restaurant.openNow ? "Open now" : "Closed right now"}
              </p>
            )
          )}

          {(() => {
            const active = AMENITY_OPTIONS.filter((a) => restaurant.amenities?.[a.key]);
            if (active.length === 0 && !restaurant.wheelchairAccessible) return null;
            return (
              <div className="mt-3 flex flex-wrap gap-2">
                {active.map((a) => (
                  <span key={a.key} className={chipClass}>
                    <span aria-hidden>{a.emoji}</span> {a.label}
                  </span>
                ))}
                {restaurant.wheelchairAccessible && (
                  <span className={chipClass}>
                    <span aria-hidden>♿</span> Wheelchair-accessible
                  </span>
                )}
              </div>
            );
          })()}

          {restaurant.address && (
            <p className="mt-3 text-sm text-muted">{restaurant.address}</p>
          )}

          {restaurant.hours && restaurant.hours.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Hours</h3>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {restaurant.hours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <a
              href={mapsUrlFor(restaurant)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-ember px-4 py-3 text-sm font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
            >
              Open in Google Maps ↗
            </a>
            {hasLinks && (
              <div className="flex gap-2">
                {restaurant.website && (
                  <a
                    href={restaurant.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${actionClass} flex-1`}
                  >
                    Website ↗
                  </a>
                )}
                {restaurant.phone && (
                  <a href={`tel:${restaurant.phone}`} className={`${actionClass} flex-1`}>
                    Call ↗
                  </a>
                )}
              </div>
            )}
            <button type="button" onClick={onClose} className={actionClass}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
