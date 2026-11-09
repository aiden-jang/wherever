import type { CSSProperties } from "react";
import type { Restaurant } from "@wherever/shared";
import { distanceText } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantGallery } from "./RestaurantGallery.js";
import { RestaurantAmenities } from "./RestaurantFacts.js";

export function DinnerTicket({
  restaurant,
  rightSwipes,
  totalParticipants,
}: {
  restaurant: Restaurant;
  rightSwipes: number;
  totalParticipants: number;
}) {
  const distance = distanceText(restaurant.distanceMeters);
  const closed =
    restaurant.businessStatus === "CLOSED_PERMANENTLY"
      ? "Permanently closed"
      : restaurant.businessStatus === "CLOSED_TEMPORARILY"
        ? "Temporarily closed"
        : restaurant.openNow === false
          ? "Closed right now"
          : null;
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
            {restaurant.rating ? `★ ${restaurant.rating}` : "New"}
            {restaurant.rating && restaurant.reviewCount
              ? ` (${reviewCountLabel(restaurant.reviewCount)})`
              : ""}
          </span>
        </p>
        <h2 className="ticket-name">{restaurant.name}</h2>
        <div className="meal-facts">
          <span>
            <small>Price</small>
            {restaurant.priceRange ?? priceLabel(restaurant.priceTier)}
          </span>
          {distance && (
            <span>
              <small>Distance</small>
              {distance}
            </span>
          )}
        </div>
        {closed ? (
          <p className="meal-hours meal-closed">● {closed}</p>
        ) : restaurant.openNow === true ? (
          <p className="meal-hours">● Open now</p>
        ) : null}
        {restaurant.address && <p className="ticket-address">{restaurant.address}</p>}
        {restaurant.editorialSummary && (
          <p className="mt-3 text-sm leading-relaxed">{restaurant.editorialSummary}</p>
        )}
        <RestaurantAmenities restaurant={restaurant} />
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
