import type { PhotoCredit } from "@wherever/shared";
import { useState } from "react";
import { styleFor } from "./cardStyle.js";

/**
 * The photo area of a restaurant card. Shows the image when there is one, and falls back to the
 * category's gradient + emoji if there is no photo or the image fails to load (e.g. the photo
 * proxy 502s). Callers set the height via className.
 */
export function RestaurantPhoto({
  imageUrl,
  credits,
  lazy = false,
  category,
  className = "",
}: {
  imageUrl: string | null;
  credits?: PhotoCredit[];
  lazy?: boolean;
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
        <>
          <img
            src={imageUrl}
            width={800}
            height={500}
            loading={lazy ? "lazy" : undefined}
            // Decorative on purpose: the name sits beside every one of these, and "photo of Carmine's"
            // read out before the name it repeats is noise, not description.
            alt=""
            className="h-full w-full object-cover"
            onError={() => setFailedUrl(imageUrl)}
          />
          {credits && credits.length > 0 && (
            <span className="absolute bottom-1 left-1 max-w-[90%] rounded bg-black/90 px-2 py-1 text-xs text-white">
              {credits.map((credit) => (
                <span className="mr-2" key={credit.name}>
                  {credit.url ? (
                    <a
                      href={credit.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                      onPointerUp={(event) => event.stopPropagation()}
                    >
                      {credit.name}
                    </a>
                  ) : (
                    credit.name
                  )}
                </span>
              ))}
            </span>
          )}
        </>
      ) : (
        <span aria-hidden className="drop-shadow-lg">
          {s.emoji}
        </span>
      )}
    </div>
  );
}
