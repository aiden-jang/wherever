import type { CSSProperties, ReactNode } from "react";
import type { Restaurant } from "@wherever/shared";
import { distanceText } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantGallery } from "./RestaurantGallery.js";
import { availabilityLabel, RestaurantAmenities } from "./RestaurantFacts.js";

export function DinnerTicket({
  restaurant,
  rightSwipes,
  totalParticipants,
  action,
}: {
  restaurant: Restaurant;
  rightSwipes: number;
  totalParticipants: number;
  action?: ReactNode;
}) {
  const distance = distanceText(restaurant.distanceMeters);
  const availability = availabilityLabel(restaurant);
  return (
    <article
      className="dinner-ticket reveal"
      style={{ "--reveal-at": "90ms", viewTransitionName: "chosen-card" } as CSSProperties}
    >
      <div className="ticket-top">
        <span>Tonight’s plan</span>
        <img src="/art/ticket.svg" alt="" width={26} height={26} />
      </div>
      <RestaurantGallery key={restaurant.id} restaurant={restaurant} className="ticket-photo" />
      <div className="ticket-body">
        <p className="meal-category">
          {categoryLabel(restaurant.category)}
          <span className="meal-rating">
            {restaurant.rating ? `★ ${restaurant.rating}` : "Unrated"}
            {restaurant.rating && restaurant.reviewCount
              ? ` (${reviewCountLabel(restaurant.reviewCount)})`
              : ""}
          </span>
        </p>
        <h2 className="ticket-name">{restaurant.name}</h2>
        {action}
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
        {restaurant.address && <p className="ticket-address">{restaurant.address}</p>}
        {restaurant.editorialSummary && (
          <p className="mt-3 text-sm leading-relaxed">{restaurant.editorialSummary}</p>
        )}
        <RestaurantAmenities restaurant={restaurant} />
        {restaurant.source === "google" && (
          <p className="mt-2 text-xs" translate="no">
            Google Maps
          </p>
        )}
      </div>
      <div className="ticket-tear">
        <span>
          {rightSwipes} / {totalParticipants} picked it
        </span>
        <span>{totalParticipants > 1 ? "An agreement. Historic." : "Your call. No committee."}</span>
      </div>
    </article>
  );
}
