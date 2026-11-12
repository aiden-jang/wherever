import { distanceText, type DecisionAlternative } from "@wherever/shared";
import { mapsUrl } from "./DirectionsDialog.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { availabilityLabel, isUnavailable } from "./RestaurantFacts.js";
import { priceLabel } from "./cardStyle.js";

export function BackupPlaces({
  alternatives,
  unavailable,
  demo,
  online,
  pending,
  isHost,
  onChooseAlternative,
}: {
  alternatives: DecisionAlternative[];
  unavailable: boolean;
  demo: boolean;
  online: boolean;
  pending: boolean;
  isHost: boolean;
  onChooseAlternative: (id: string) => void;
}) {
  if (!alternatives.length) return null;
  return (
    <details
      className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.035] text-left"
      open={unavailable || undefined}
      id="dinner-backups"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-cream">
            {unavailable ? "This place is unavailable. Try a backup." : "Other options"}
          </span>
          <span className="block text-xs text-muted [overflow-wrap:anywhere]">
            Plan B: {alternatives[0]!.restaurant.name}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted transition group-open:rotate-180" aria-hidden>
          ⌄
        </span>
      </summary>
      <ol className="space-y-2 border-t border-white/10 p-3">
        {alternatives.map((choice, index) => (
          <li key={choice.restaurant.id} className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <a
              href={demo ? undefined : mapsUrl(choice.restaurant)}
              target="_blank"
              aria-describedby="external-link-hint"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-2 transition hover:border-white/25 hover:bg-white/5 active:scale-[0.99]"
            >
              <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-ember">
                {index + 2}
              </span>
              <RestaurantPhoto
                imageUrl={choice.restaurant.source === "google" ? null : choice.restaurant.imageUrl}
                lazy
                thumbnail
                category={choice.restaurant.category}
                className="relative h-12 w-12 shrink-0 rounded-lg"
              />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-cream [overflow-wrap:anywhere]">
                  {choice.restaurant.name}
                </strong>
                <span className="block text-xs text-muted [overflow-wrap:anywhere]">
                  {choice.rightSwipes} liked it
                  {distanceText(choice.restaurant.distanceMeters)
                    ? ` · ${distanceText(choice.restaurant.distanceMeters)}`
                    : ""}{" "}
                  ·{" "}
                  {choice.restaurant.priceUnknown
                    ? "Price unavailable"
                    : priceLabel(choice.restaurant.priceTier)}
                  <span className="block">
                    {availabilityLabel(choice.restaurant) ?? "Hours not verified"}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-sm text-muted" aria-hidden>
                ↗
              </span>
            </a>
            {isHost && (
              <button
                type="button"
                disabled={!online || pending || isUnavailable(choice.restaurant)}
                // There is one of these per runner-up, so the visible label alone is heard as
                // "Make Plan A" twice with nothing to tell them apart.
                aria-label={`Make Plan A: ${choice.restaurant.name}`}
                onClick={() => onChooseAlternative(choice.restaurant.id)}
                className="min-h-11 rounded-xl border border-acid/25 bg-acid/10 px-4 py-2 text-sm font-semibold text-acid hover:border-acid/50 hover:bg-acid/15"
              >
                Make Plan A
              </button>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
