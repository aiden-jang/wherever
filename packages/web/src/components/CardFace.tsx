import type { Restaurant } from "@wherever/shared";
import { distanceText } from "@wherever/shared";
import { PHOTO_SIZE, categoryLabel, priceLabel, reviewCountLabel, styleFor } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

export function CardFace({
  restaurant,
  photoUrl,
  photoCount,
  photoIdx,
  revisit,
}: {
  restaurant: Restaurant;
  photoUrl: string | null | undefined;
  photoCount: number;
  photoIdx: number;
  revisit?: string | null;
}) {
  const cuisine = styleFor(restaurant.category);
  const distance = distanceText(restaurant.distanceMeters);
  const closed =
    restaurant.businessStatus === "CLOSED_PERMANENTLY"
      ? "Permanently closed"
      : restaurant.businessStatus === "CLOSED_TEMPORARILY"
        ? "Temporarily closed"
        : restaurant.openNow === false
          ? "Closed now"
          : null;
  return (
    <>
      <div data-card-photo className="relative">
        <RestaurantPhoto imageUrl={photoUrl ?? null} category={restaurant.category} className={PHOTO_SIZE} />
        {photoCount > 1 && (
          <div className="photo-tracks" aria-hidden>
            {Array.from({ length: photoCount }).map((_, i) => (
              <span key={i} className={i === photoIdx ? "photo-current" : ""} />
            ))}
          </div>
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
            {restaurant.rating ? `★ ${restaurant.rating}` : "New"}
            {restaurant.rating && restaurant.reviewCount
              ? ` (${reviewCountLabel(restaurant.reviewCount)})`
              : ""}
          </span>
        </div>
        <div className="meal-name">{restaurant.name}</div>
        <div className="meal-facts">
          <span>
            <small>THE DAMAGE</small>
            {restaurant.priceRange ?? priceLabel(restaurant.priceTier)}
          </span>
          {distance && (
            <span>
              <small>GETTING THERE</small>
              {distance}
            </span>
          )}
        </div>
        {closed ? (
          <p className="meal-hours meal-closed">● {closed}</p>
        ) : restaurant.openNow === true ? (
          <p className="meal-hours">● Open now</p>
        ) : null}
        {restaurant.editorialSummary && <p className="meal-summary">{restaurant.editorialSummary}</p>}
      </div>
    </>
  );
}
