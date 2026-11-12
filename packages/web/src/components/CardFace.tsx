import type { Restaurant } from "@wherever/shared";
import { distanceText } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel, styleFor } from "./cardStyle.js";
import { availabilityLabel } from "./RestaurantFacts.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

export function CardFace({
  restaurant,
  photoUrl,
  photoCount,
  photoIdx,
  onNextPhoto,
  revisit,
}: {
  restaurant: Restaurant;
  photoUrl: string | null | undefined;
  photoCount: number;
  photoIdx: number;
  onNextPhoto: () => void;
  revisit?: string | null;
}) {
  const cuisine = styleFor(restaurant.category);
  const distance = distanceText(restaurant.distanceMeters);
  const availability = availabilityLabel(restaurant);
  return (
    <>
      <div data-card-photo className="relative">
        <RestaurantPhoto imageUrl={photoUrl ?? null} category={restaurant.category} className="table-photo" />
        {photoCount > 1 && (
          <button
            type="button"
            aria-label={`Next photo, ${photoIdx + 1} of ${photoCount}`}
            className="absolute bottom-2 right-2 min-h-11 min-w-11 rounded-full bg-black/90 px-2 text-xs text-white"
            onPointerUp={(event) => event.stopPropagation()}
            onClick={onNextPhoto}
          >
            {photoIdx + 1}/{photoCount}
          </button>
        )}
        {revisit && (
          <span className="meal-revisit">
            <span aria-hidden>↺</span> {revisit}
          </span>
        )}
      </div>
      <div className="meal-body">
        <div className="meal-category">
          <span aria-hidden>{cuisine.emoji}</span> {categoryLabel(restaurant.category)}
          <span className="meal-rating">
            {restaurant.rating ? `★ ${restaurant.rating}` : "Unrated"}
            {restaurant.rating && restaurant.reviewCount
              ? ` (${reviewCountLabel(restaurant.reviewCount)})`
              : ""}
          </span>
        </div>
        <div className="meal-name">{restaurant.name}</div>
        <div className="meal-facts">
          <span>
            <small>Price</small>
            {restaurant.priceRange ??
              (restaurant.priceUnknown ? "Price unavailable" : priceLabel(restaurant.priceTier))}
          </span>
          {distance && (
            <span>
              <small>Distance</small>
              {distance}
            </span>
          )}
        </div>
        {availability && (
          <p
            className={`meal-hours ${restaurant.openNow === false || restaurant.businessStatus?.startsWith("CLOSED_") ? "meal-closed" : ""}`}
          >
            {availability}
          </p>
        )}
        {restaurant.source === "google" && (
          <p className="mt-2 text-xs" translate="no">
            Google Maps
          </p>
        )}
        {restaurant.editorialSummary && <p className="meal-summary">{restaurant.editorialSummary}</p>}
      </div>
    </>
  );
}
