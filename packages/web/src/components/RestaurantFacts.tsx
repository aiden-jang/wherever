import { useState } from "react";
import { AMENITY_OPTIONS, type Restaurant } from "@wherever/shared";

const chipClass = "inline-flex items-center gap-1.5 detail-chip rounded-full px-3 py-1 text-xs";

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
          <span aria-hidden>♿</span> Wheelchair-accessible
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
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const compact = compactOnMobile && !expanded && hours.some((line) => line.startsWith(today));
  return (
    <section className={className}>
      <h3 className="text-sm font-semibold">Hours</h3>
      <ul className="mt-1 space-y-0.5 text-sm text-muted">
        {hours.map((line) => (
          <li
            key={line}
            className={line.startsWith(today) ? "hours-today" : compact ? "hidden sm:list-item" : undefined}
          >
            {line}
          </li>
        ))}
      </ul>
      {compact && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-xs font-semibold text-ember sm:hidden"
        >
          See all hours
        </button>
      )}
    </section>
  );
}
