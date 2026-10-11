import { useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

export function RestaurantGallery({ restaurant }: { restaurant: Restaurant }) {
  const photos = restaurant.photos?.length
    ? restaurant.photos
    : restaurant.imageUrl
      ? [restaurant.imageUrl]
      : [];
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, photos.length - 1));
  return (
    <div
      className="restaurant-gallery"
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
        category={restaurant.category}
        className="detail-photo"
      />
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="gallery-arrow gallery-prev"
            aria-label="Previous photo"
            disabled={current === 0}
            onClick={() => setIndex(current - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="gallery-arrow gallery-next"
            aria-label="Next photo"
            disabled={current === photos.length - 1}
            onClick={() => setIndex(current + 1)}
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
