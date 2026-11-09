import { useEffect, useRef, type ComponentProps } from "react";
import { SwipeCard } from "./SwipeCard.js";

export function ActiveSwipeCard({
  disabled,
  onLoadPlace,
  onAnnounce,
  ...props
}: ComponentProps<typeof SwipeCard> & {
  disabled: boolean;
  onLoadPlace: (id: string) => void;
  onAnnounce?: (text: string) => void;
}) {
  const { id, detailsStatus, googleMapsUri, name } = props.restaurant;
  const wasPending = useRef(detailsStatus === "pending");
  useEffect(() => {
    if (detailsStatus === "pending") {
      if (!disabled) onLoadPlace(id);
    } else if (wasPending.current) {
      wasPending.current = false;
      onAnnounce?.(
        detailsStatus
          ? "Restaurant details unavailable. You can skip this place."
          : `${name} is ready to vote on.`,
      );
    }
  }, [disabled, detailsStatus, id, name, onAnnounce, onLoadPlace]);

  if (!detailsStatus) return <SwipeCard {...props} />;
  return (
    <div className="table-face">
      <div data-card-photo className="relative bg-ink/10" aria-hidden="true" />
      <div className="meal-body">
        {detailsStatus === "pending" ? (
          <p role="status" className="meal-name">
            Loading restaurant details…
          </p>
        ) : (
          <>
            <p className="meal-name">Restaurant details unavailable</p>
            {googleMapsUri && (
              <a
                href={googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-semibold underline"
                aria-describedby="external-link-hint"
              >
                View this place in Google Maps
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
