import { useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

export function RestaurantGallery({
  restaurant,
  className = "",
  initialIndex = 0,
}: {
  restaurant: Restaurant;
  className?: string;
  initialIndex?: number;
}) {
  const photos = restaurant.photos?.length
    ? restaurant.photos
    : restaurant.imageUrl
      ? [restaurant.imageUrl]
      : [];
  const [index, setIndex] = useState(initialIndex);
  const current = Math.max(0, Math.min(index, photos.length - 1));
  const source = restaurant.photoMapsUris?.[photos[current] ?? ""];
  return (
    <div
      className={`restaurant-gallery ${className}`}
      role="group"
      aria-label={`${restaurant.name} photos`}
      onKeyDown={(event) => {
        if (photos.length < 2) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setIndex(Math.max(0, current - 1));
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setIndex(Math.min(photos.length - 1, current + 1));
        }
      }}
    >
      <RestaurantPhoto
        key={photos[current] ?? restaurant.id}
        imageUrl={photos[current] ?? null}
        credits={restaurant.photoCredits?.[photos[current] ?? ""]}
        category={restaurant.category}
        className="detail-photo"
      />
      {source && (
        <a href={source} target="_blank" rel="noopener noreferrer" className="gallery-source">
          View photo on Google Maps
        </a>
      )}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="gallery-arrow gallery-prev"
            aria-label="Previous photo"
            aria-disabled={current === 0}
            onClick={() => setIndex(Math.max(0, current - 1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="gallery-arrow gallery-next"
            aria-label="Next photo"
            aria-disabled={current === photos.length - 1}
            onClick={() => setIndex(Math.min(photos.length - 1, current + 1))}
          >
            ›
          </button>
          <span className="gallery-count" role="status">
            {current + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}
