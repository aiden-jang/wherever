import type { PlannedMeetup, Restaurant } from "@wherever/shared";
import { downloadInvite } from "./MeetupPlanner.js";

/*
 * The secondary actions on the result screen, folded away behind one summary.
 *
 * Flat, these six buttons sit between "Send the plan" and "Run it back" and bury both. Collapsed,
 * the two decisions that matter stay adjacent and the rest is one tap away.
 */
export function PlanExtras({
  restaurant,
  isHost,
  planned,
  rightSwipes,
  totalParticipants,
  addressCopied,
  onCopyAddress,
  cardResult,
  onSaveCard,
  onPlanMeetup,
}: {
  restaurant: Restaurant;
  isHost: boolean;
  planned: PlannedMeetup | null;
  rightSwipes: number;
  totalParticipants: number;
  addressCopied: boolean;
  onCopyAddress: () => void;
  cardResult: "making" | "shared" | "saved" | null;
  onSaveCard: () => void;
  onPlanMeetup: () => void;
}) {
  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[0.025] text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-muted transition hover:text-cream marker:content-none">
        More ways to plan
        <span className="transition group-open:rotate-180" aria-hidden>
          ⌄
        </span>
      </summary>
      <div className="grid gap-2 border-t border-white/10 p-3">
        {(restaurant.phone || restaurant.website) && (
          <div
            className={`grid gap-2 ${restaurant.phone && restaurant.website ? "grid-cols-2" : "grid-cols-1"}`}
          >
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]"
              >
                Call the place
              </a>
            )}
            {restaurant.website && (
              <a
                href={restaurant.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-white/5 active:scale-[0.98]"
              >
                Website ↗
              </a>
            )}
          </div>
        )}
        {restaurant.address && (
          <button
            type="button"
            onClick={onCopyAddress}
            disabled={addressCopied}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-muted transition hover:border-white/20 hover:text-cream disabled:cursor-default disabled:opacity-70"
          >
            {addressCopied ? "Address copied" : "Copy address"}
          </button>
        )}
        <button
          type="button"
          onClick={onSaveCard}
          disabled={cardResult !== null}
          className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-white/20 hover:text-cream active:scale-[0.98] disabled:cursor-default disabled:opacity-70"
        >
          {cardResult === "making"
            ? "Making winner card…"
            : cardResult === "shared"
              ? "Winner card shared"
              : cardResult === "saved"
                ? "Winner card saved"
                : "Save the winner card"}
        </button>
        {isHost && (
          <button
            type="button"
            onClick={onPlanMeetup}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-white/20 hover:text-cream active:scale-[0.98]"
          >
            {planned ? "Change meetup time" : "Set meetup time"}
          </button>
        )}
        {!isHost && planned && (
          <button
            type="button"
            onClick={() =>
              downloadInvite(
                restaurant,
                new Date(planned.start),
                planned.duration,
                `Picked by ${rightSwipes} of ${totalParticipants} on Wherever, Honestly.`,
              )
            }
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-white/20 hover:text-cream active:scale-[0.98]"
          >
            Add meetup to my calendar
          </button>
        )}
      </div>
    </details>
  );
}
