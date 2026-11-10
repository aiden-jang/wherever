import { useId, useState } from "react";
import { AMENITY_OPTIONS, type Restaurant } from "@wherever/shared";

const chipClass = "inline-flex items-center gap-1.5 detail-chip rounded-full px-3 py-1 text-xs";

export function isUnavailable(restaurant: Restaurant) {
  return (
    restaurant.openNow === false ||
    restaurant.businessStatus === "CLOSED_PERMANENTLY" ||
    restaurant.businessStatus === "CLOSED_TEMPORARILY"
  );
}

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
  const hoursId = useId();
  if (!hours?.length) return null;
  const compact = compactOnMobile && hours.length > 2;
  const now = new Date();
  const day = (offset: number) =>
    new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset),
    );
  const today = hours.findIndex((line) => line.startsWith(day(0) + ":"));
  const tomorrow = hours.findIndex((line) => line.startsWith(day(1) + ":"));
  const preview = new Set([today < 0 ? 0 : today, tomorrow < 0 ? (today === 0 ? 1 : 0) : tomorrow]);
  return (
    <section className={className}>
      <h3 className="text-sm font-semibold">Hours</h3>
      <ul id={hoursId} className="mt-1 flex flex-col gap-0.5 text-sm text-muted">
        {hours.map((line, index) => (
          <li
            key={line}
            className={
              compact && !expanded
                ? !preview.has(index)
                  ? "hidden sm:list-item"
                  : index === today
                    ? "order-first font-semibold sm:order-none"
                    : undefined
                : undefined
            }
          >
            {line}
          </li>
        ))}
      </ul>
      {compact && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={hoursId}
          className="mt-1 min-h-11 text-sm font-semibold text-ember sm:hidden"
        >
          {expanded ? "See fewer hours" : "See all hours"}
        </button>
      )}
    </section>
  );
}
