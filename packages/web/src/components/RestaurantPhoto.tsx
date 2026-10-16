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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = imageUrl != null && failedUrl !== imageUrl;

  return (
    <div
      className={`flex items-center justify-center text-7xl ${className}`}
      style={{ background: showImage ? undefined : s.gradient }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          // Decorative on purpose: the name sits beside every one of these, and "photo of Carmine's"
          // read out before the name it repeats is noise, not description.
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <span className="drop-shadow-lg">{s.emoji}</span>
      )}
    </div>
  );
}
