import { useState } from "react";
import { AMENITY_OPTIONS, type Restaurant } from "@wherever/shared";

const chipClass = "inline-flex items-center gap-1.5 detail-chip rounded-full px-3 py-1 text-xs";

export function availabilityLabel(restaurant: Restaurant): string | null {
  if (restaurant.businessStatus === "CLOSED_PERMANENTLY") return "Permanently closed";
  if (restaurant.businessStatus === "CLOSED_TEMPORARILY") return "Temporarily closed";
  if (restaurant.openNow == null) return null;
  if (restaurant.availabilityCheckedAt) {
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
      restaurant.availabilityCheckedAt,
    );
    return `${restaurant.openNow ? "Open" : "Closed"} when checked at ${time}`;
  }
  return restaurant.openNow ? "Open now" : "Closed now";
}

export function RestaurantAmenities({ restaurant }: { restaurant: Restaurant }) {
  const active = AMENITY_OPTIONS.filter((option) => restaurant.amenities?.[option.key]);
  if (!active.length && !restaurant.wheelchairAccessible) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {active.map(({ key, emoji, label }) => (
        <span key={key} className={chipClass}>
          <span aria-hidden>{emoji}</span> {label}
        </span>
      ))}
      {restaurant.wheelchairAccessible && (
        <span className={chipClass}>
          <span aria-hidden>♿</span> Wheelchair-accessible entrance
        </span>
      )}
    </div>
  );
}

export function RestaurantHours({
  hours,
  compactOnMobile = false,
  className,
}: {
  hours?: string[] | null;
  compactOnMobile?: boolean;
  className: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!hours?.length) return null;
  const compact = compactOnMobile && !expanded && hours.length > 2;
  return (
    <section className={className}>
      <h3 className="text-sm font-semibold">Hours</h3>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {hours.map((line, index) => (
          <li key={line} className={compact && index >= 2 ? "hidden sm:list-item" : undefined}>
            {line}
          </li>
        ))}
      </ul>
      {compact && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 min-h-11 text-sm font-semibold text-ember sm:hidden"
        >
          See all hours
        </button>
      )}
    </section>
  );
}
