import { CARD_SIZE, DECK_LAYOUT, PHOTO_SIZE } from "./cardStyle.js";
import { useLine } from "../useLine.js";
/** Card-shaped placeholder shown while the first deck is being fetched. */
export function DeckSkeleton() {
  const dealingLine = useLine("dealing");
  return (
    <div className={DECK_LAYOUT}>
      <div className="mx-auto w-full min-w-0 max-w-sm lg:mx-0 lg:max-w-none">
        <div className={CARD_SIZE}>
          <div
            className="absolute inset-0 meal-card rounded-card overflow-hidden animate-pulse"
            style={{ transform: "scale(0.95) translateY(14px)" }}
          />
          <div className="absolute inset-0 meal-card rounded-card overflow-hidden animate-pulse">
            <div className={`${PHOTO_SIZE} bg-ink/10`} />
            <div className="p-5 space-y-3">
              <div className="h-6 w-2/3 rounded bg-ink/10" />
              <div className="h-4 w-1/2 rounded bg-ink/10" />
            </div>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-muted">{dealingLine}</p>
      </div>
    </div>
  );
}
