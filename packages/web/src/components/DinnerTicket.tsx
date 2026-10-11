import type { CSSProperties } from "react";
import type { Restaurant } from "@wherever/shared";
import { distanceText } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

export function DinnerTicket({
  restaurant,
  rightSwipes,
  totalParticipants,
  onOpen,
}: {
  restaurant: Restaurant;
  rightSwipes: number;
  totalParticipants: number;
  onOpen: () => void;
}) {
  const closed =
    restaurant.businessStatus === "CLOSED_PERMANENTLY"
      ? "Permanently closed"
      : restaurant.businessStatus === "CLOSED_TEMPORARILY"
        ? "Temporarily closed"
        : restaurant.openNow === false
          ? "Closed right now"
          : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`See details for ${restaurant.name}`}
      className="dinner-ticket reveal"
      style={{ "--reveal-at": "90ms", viewTransitionName: "chosen-card" } as CSSProperties}
    >
      <div className="ticket-top">
        <span>TONIGHT’S PLAN</span>
        <span aria-hidden>✳</span>
      </div>
      <RestaurantPhoto
        imageUrl={restaurant.imageUrl}
        category={restaurant.category}
        className="h-44 lg:h-52"
      />
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
        <div className="ticket-name">{restaurant.name}</div>
        <div className="meal-facts">
          <span>
            <small>THE DAMAGE</small>
            {restaurant.priceRange ?? priceLabel(restaurant.priceTier)}
          </span>
          {distanceText(restaurant.distanceMeters) && (
            <span>
              <small>GETTING THERE</small>
              {distanceText(restaurant.distanceMeters)}
            </span>
          )}
        </div>
        {closed ? (
          <p className="meal-hours meal-closed">● {closed}</p>
        ) : restaurant.openNow === true ? (
          <p className="meal-hours">● Open now</p>
        ) : null}
        {restaurant.address && <p className="ticket-address">{restaurant.address}</p>}
      </div>
      <div className="ticket-tear">
        <span>
          {rightSwipes} / {totalParticipants} picked it
        </span>
        <span>{totalParticipants > 1 ? "An agreement. Historic." : "Your call. No committee."}</span>
      </div>
      <div className="ticket-bottom">
        Hours &amp; restaurant details <span aria-hidden>↗</span>
      </div>
    </button>
  );
}
