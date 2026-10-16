import { useEffect, useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { AMENITY_OPTIONS } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { distanceText } from "@wherever/shared";
import { RestaurantGallery } from "./RestaurantGallery.js";
import { useScrollLock } from "../useScrollLock.js";
import { useDialogFocus } from "../useDialogFocus.js";
import { useSwipeToDismiss } from "../useSwipeToDismiss.js";

const chipClass = "inline-flex items-center gap-1.5 detail-chip rounded-full px-3 py-1 text-xs text-muted";

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
export function RestaurantDetail({ restaurant, onClose }: { restaurant: Restaurant; onClose: () => void }) {
  useScrollLock();
  const { dragY, scrollRef, handlers } = useSwipeToDismiss(onClose);

  // Hours: on phones, show only today's line by default and let the user expand to the full week
  // (desktop always shows all — see the responsive classes below).
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const focusPanel = useDialogFocus();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-lg text-white/90 backdrop-blur-sm hover:bg-black/65 transition-colors"
        >
          ✕
        </button>
        <RestaurantGallery key={restaurant.id} restaurant={restaurant} />

        <div className="p-5">
          <h2 className="font-display text-3xl font-bold leading-tight">{restaurant.name}</h2>
          <div className="mt-2 truncate text-sm text-muted">{categoryLabel(restaurant.category)}</div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted tabular-nums">
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

          {closedLabel ? (
            <p className="mt-3 text-sm font-semibold text-flare">{closedLabel}</p>
          ) : (
            restaurant.openNow != null && (
              <p className={`mt-3 text-sm font-semibold ${restaurant.openNow ? "text-acid" : "text-flare"}`}>
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

          {restaurant.address && <p className="mt-3 text-sm text-muted">{restaurant.address}</p>}

          {restaurant.hours &&
            restaurant.hours.length > 0 &&
            (() => {
              const hours = restaurant.hours!;
              const hasToday = hours.some((l) => l.startsWith(today));
              return (
                <div className="detail-hours mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Hours</h3>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted">
                    {hours.map((line) => {
                      // Collapsed on mobile = today only. Non-today lines hide on mobile but stay on
                      // desktop (sm:list-item). If we can't spot today's line, don't hide anything.
                      const hideOnMobile = hasToday && !hoursExpanded && !line.startsWith(today);
                      return (
                        <li
                          key={line}
                          className={`${hideOnMobile ? "hidden sm:list-item" : ""} ${line.startsWith(today) ? "hours-today" : ""}`}
                        >
                          {line}
                        </li>
                      );
                    })}
                  </ul>
                  {hasToday && !hoursExpanded && (
                    <button
                      type="button"
                      onClick={() => setHoursExpanded(true)}
                      className="mt-1 text-xs font-semibold text-ember sm:hidden"
                    >
                      See all hours
                    </button>
                  )}
                </div>
              );
            })()}

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
        </div>
      </div>
    </div>
  );
}
