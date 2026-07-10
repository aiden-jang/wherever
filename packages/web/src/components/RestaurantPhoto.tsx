import { useState } from "react";
import { styleFor } from "./cardStyle.js";

/**
 * The photo area of a restaurant card. Shows the image when there is one, and falls back to the
 * category's gradient + emoji if there is no photo or the image fails to load (e.g. the photo
 * proxy 502s). Callers set the height via className.
 */
export function RestaurantPhoto({
  imageUrl,
  category,
  className = "",
}: {
  imageUrl: string | null;
  category: string;
  className?: string;
}) {
  const s = styleFor(category);
  const [failed, setFailed] = useState(false);
  const showImage = imageUrl != null && !failed;

  return (
    <div
      className={`flex items-center justify-center text-7xl ${className}`}
      style={{ background: showImage ? undefined : s.gradient }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="drop-shadow-lg">{s.emoji}</span>
      )}
    </div>
  );
}
