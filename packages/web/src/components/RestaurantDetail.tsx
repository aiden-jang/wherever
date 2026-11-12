import { useEffect } from "react";
import type { Restaurant } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { distanceText } from "@wherever/shared";
import { RestaurantGallery } from "./RestaurantGallery.js";
import { availabilityLabel, RestaurantAmenities, RestaurantHours } from "./RestaurantFacts.js";
import { useScrollLock } from "../useScrollLock.js";
import { useDialogFocus } from "../useDialogFocus.js";
import { useSwipeToDismiss } from "../useSwipeToDismiss.js";

/** Google Maps deep link: the place's own URI when we have it, else a name+address search. */
function mapsUrlFor(r: Restaurant): string {
  if (r.googleMapsUri) return r.googleMapsUri;
  const query = `${r.name} ${r.address ?? ""}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const actionClass =
  "flex items-center justify-center gap-2 detail-secondary rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition";

/**
 * A tap-to-open sheet with everything the Places response gave us about one restaurant: photo,
 * stats, whether it's open, address, weekly hours, and links out (Maps / website / call). Renders as
 * a bottom sheet on phones and a centered card on wider screens. Backdrop and Escape both close it.
 */
export function RestaurantDetail({
  restaurant,
  demo,
  initialPhotoIndex = 0,
  onClose,
}: {
  restaurant: Restaurant;
  demo: boolean;
  initialPhotoIndex?: number;
  onClose: () => void;
}) {
  useScrollLock();
  const { dragY, scrollRef, handlers } = useSwipeToDismiss(onClose);

  const focusPanel = useDialogFocus();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasLinks = restaurant.website || restaurant.phone;
  const availability = availabilityLabel(restaurant);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        ref={(el) => {
          scrollRef.current = el;
          focusPanel(el);
        }}
        tabIndex={-1}
        /* A bottom sheet on a phone, so its own last row sits over the home indicator. `pad-safe-bottom`
           keeps whatever padding it already had on everything else. */
        className="restaurant-detail relative w-full max-w-lg max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border border-white/10 shadow-raised pad-safe-bottom sm:rounded-3xl sm:pb-0"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? "none" : "transform 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
        role="dialog"
        // Same claim the other overlay makes, and now equally true: the keyboard cannot leave.
        aria-modal="true"
        aria-label={`${restaurant.name} details`}
      >
        <div className="pointer-events-none sticky top-0 z-10 flex h-0 justify-end px-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pointer-events-auto mt-3 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white hover:bg-ink-soft transition-colors"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <RestaurantGallery key={restaurant.id} restaurant={restaurant} initialIndex={initialPhotoIndex} />

        <div className="p-5">
          <h2 tabIndex={-1} className="font-display text-3xl font-bold leading-tight">
            {restaurant.name}
          </h2>
          {demo && <p className="mt-2 text-sm font-semibold">Sample restaurant. This place is fictional.</p>}
          <div className="mt-2 truncate text-sm text-muted">{categoryLabel(restaurant.category)}</div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted tabular-nums">
            <span className="whitespace-nowrap text-acid">
              {restaurant.rating ? `★ ${restaurant.rating}` : "Unrated"}
              {restaurant.rating && restaurant.reviewCount
                ? ` (${reviewCountLabel(restaurant.reviewCount)})`
                : ""}
            </span>
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">
              {restaurant.priceUnknown ? "Price unavailable" : priceLabel(restaurant.priceTier)}
            </span>
            {restaurant.priceRange && (
              <>
                <span className="text-white/20">·</span>
                <span className="whitespace-nowrap">{restaurant.priceRange}</span>
              </>
            )}
            {distanceText(restaurant.distanceMeters) && (
              <>
                <span className="text-white/20">·</span>
                <span className="whitespace-nowrap font-semibold text-cream tabular-nums">
                  {distanceText(restaurant.distanceMeters)}
                </span>
              </>
            )}
          </div>

          {restaurant.editorialSummary && (
            <p className="mt-3 text-sm leading-snug text-cream/90">{restaurant.editorialSummary}</p>
          )}

          {availability && <p className="mt-3 text-sm font-semibold text-muted">{availability}</p>}

          <RestaurantAmenities restaurant={restaurant} />
          {restaurant.source === "google" && (
            <p className="mt-2 text-xs" translate="no">
              Google Maps
            </p>
          )}

          {restaurant.address && <p className="mt-3 text-sm text-muted">{restaurant.address}</p>}

          <RestaurantHours hours={restaurant.hours} compactOnMobile className="detail-hours mt-4" />

          {!demo && (
            <div className="detail-actions mt-5 flex flex-col gap-2">
              <a
                href={mapsUrlFor(restaurant)}
                target="_blank"
                aria-describedby="external-link-hint"
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
                      aria-describedby="external-link-hint"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
