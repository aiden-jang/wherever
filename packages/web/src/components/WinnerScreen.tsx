import { type CSSProperties, useEffect, useState } from "react";

import { useShareAction } from "../useShareAction.js";
import { useInstallPrompt } from "../useInstallPrompt.js";
import { line, matchReasons, nearMissLine, type SessionFilters, type VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../sessionState.js";
import { priceLabel } from "./cardStyle.js";
import { PlanDirections } from "./PlanDirections.js";
import { DinnerTicket } from "./DinnerTicket.js";
import { distanceText } from "@wherever/shared";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { Confetti } from "./Confetti.js";
import { DirectionsDialog, mapsUrl } from "./DirectionsDialog.js";
import { PlaceLinks } from "./PlaceLinks.js";
import { VerdictNotes } from "./VerdictNotes.js";
import { RoundAgain } from "./RoundAgain.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";
import { filterSummaryChips } from "./FilterSummary.js";

import { VisitedHistory } from "./VisitedHistory.js";
import { seedFrom, consensusLine, planText } from "./winnerCopy.js";
export function WinnerScreen({
  match,
  visited,
  filters,
  isHost,
  onAgain,
  onChooseAlternative,
  onNeverAgain,
}: {
  match: Extract<NonNullable<MatchState>, { kind: "match" }>;
  visited: VisitedPlace[];
  filters?: SessionFilters;
  isHost: boolean;
  onAgain: (deck: "new" | "same") => void;
  onChooseAlternative: (restaurantId: string) => void;
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const {
    restaurant,
    rightSwipes,
    alternatives,
    totalParticipants,
    vetoedCount,
    round,
    tiedWith = 0,
    vetoedTop = false,
    superTipped = false,
  } = match;
  const unavailable =
    restaurant.openNow === false ||
    restaurant.businessStatus === "CLOSED_PERMANENTLY" ||
    restaurant.businessStatus === "CLOSED_TEMPORARILY";
  const [detailOpen, setDetailOpen] = useState(false);
  const { status: shareResult, share } = useShareAction(restaurant.id);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const { status: addressStatus, share: copy } = useShareAction(restaurant.id);
  const addressCopied = addressStatus === "copied";
  const reasons = matchReasons(restaurant, filters, rightSwipes, totalParticipants);
  const { offer: installOffer, install, dismiss: dismissInstall } = useInstallPrompt(round);
  const nearMiss = nearMissLine(restaurant.name, rightSwipes, alternatives);

  // Celebrate once when the verdict lands: confetti, a victory buzz, and the fanfare.
  const [celebrate, setCelebrate] = useState(true);
  useEffect(() => {
    buzz([18, 40, 18]);
    play("match");
    const t = setTimeout(() => setCelebrate(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const sharePlan = async () => {
    const url = mapsUrl(restaurant);
    const text = planText(
      restaurant,
      rightSwipes,
      totalParticipants,
      reasons.map((reason) => reason.label),
      alternatives[0]?.restaurant,
    );
    await share({ title: restaurant.name, text, url });
  };
  const copyAddress = () =>
    restaurant.address
      ? copy({ text: `${restaurant.name}\n${restaurant.address}` }, false)
      : Promise.resolve();

  return (
    <div className="relative w-full">
      {celebrate && <Confetti />}
      {/* The winner’s name belongs in the page heading as well as the interactive ticket. */}
      {/* Keep the mobile directions beside the pick; desktop actions occupy the second column. */}
      <div className="mx-auto w-full max-w-sm text-center lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="min-w-0">
          <h1 className="reveal font-display text-lg font-bold tracking-widest text-acid uppercase">
            Dinner is handled<span className="sr-only">: {restaurant.name}</span>
          </h1>
          <DinnerTicket
            restaurant={restaurant}
            rightSwipes={rightSwipes}
            totalParticipants={totalParticipants}
            onOpen={() => setDetailOpen(true)}
          />
          <PlanDirections
            restaurant={restaurant}
            unavailable={unavailable}
            onOpen={() => setDirectionsOpen(true)}
            className="mobile-directions"
          />

          <p
            className="reveal mt-2 inline-flex rounded-full border border-acid/20 bg-acid/10 px-3 py-1 text-xs font-semibold text-acid"
            style={{ "--reveal-at": "190ms" } as CSSProperties}
          >
            {tiedWith > 0 && totalParticipants > 1
              ? line("tie", seedFrom(restaurant.id))
              : consensusLine(rightSwipes, totalParticipants, seedFrom(restaurant.id))}
          </p>
          {tiedWith > 0 && totalParticipants <= 1 && (
            <p className="mt-2 text-xs text-muted">
              You liked {tiedWith + 1}. This one was dealt first, so it takes it.
            </p>
          )}
          {tiedWith === 0 && nearMiss && (
            // Only when it was actually close, and never alongside the tie line, which is its own story.
            <p className="mt-2 text-xs text-muted">{nearMiss}</p>
          )}
          {tiedWith > 0 && totalParticipants > 1 && (
            // Say how it was settled. The tie-break is deck order, which is deterministic so every
            // client lands on the same winner; pretending it was a coin toss would be a lie.
            <p className="mt-2 text-xs text-muted">
              {tiedWith === 1 ? "Two places finished level." : `${tiedWith + 1} places finished level.`} This
              one was dealt first, so it takes it.
            </p>
          )}
          {vetoedTop && (
            /*
             * The group agreed on somewhere else and somebody killed it. Vetoed places are dropped from
             * the ranking before a winner is picked, so without this the round reads as a clean win for
             * second place. No name and no place: the veto is anonymous by design, and naming what it
             * killed narrows the vetoer down in a group of four.
             */
            <p className="mt-2 text-xs text-flare">Something scored higher. Somebody vetoed it.</p>
          )}
          <section
            className="reveal mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-3 text-left"
            style={{ "--reveal-at": "290ms" } as CSSProperties}
          >
            <p className="px-1 text-2xs font-bold uppercase tracking-[0.16em] text-muted">
              Why this one works
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {reasons.map((reason) => (
                <div
                  key={`${reason.icon}-${reason.label}`}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/15 px-2.5 py-2"
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-acid/10 text-xs font-bold text-acid"
                    aria-hidden
                  >
                    {reason.icon}
                  </span>
                  <span className="text-xs font-medium leading-tight text-cream/90">{reason.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="min-w-0">
          <div
            className="mx-auto mt-3 h-1.5 w-28 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Group agreement"
            aria-valuemin={0}
            aria-valuemax={totalParticipants}
            aria-valuenow={rightSwipes}
            aria-valuetext={`${rightSwipes} of ${totalParticipants} people picked this place`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember to-acid transition-[width] duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, (rightSwipes / Math.max(1, totalParticipants)) * 100))}%`,
              }}
            />
          </div>
          <VerdictNotes vetoedCount={vetoedCount} superTipped={superTipped} round={round} />

          {filters && (
            /* Open: nobody clicks a receipt to ask "why these places?". Still collapsible because a
               heavily filtered round is a long list. */
            <details
              open
              className="group mt-5 rounded-2xl border border-white/10 bg-white/[0.035] text-left"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-cream marker:content-none">
                <span>
                  <span className="mr-2" aria-hidden>
                    🧾
                  </span>
                  Decision receipt
                </span>
                <span className="text-xs font-medium text-muted transition group-open:rotate-180" aria-hidden>
                  ⌄
                </span>
              </summary>
              <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                {filterSummaryChips(filters).map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-muted"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </details>
          )}

          {alternatives.length > 0 && (
            <details
              className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.035] text-left"
              open={unavailable || undefined}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-cream">
                    {unavailable ? "The doors are shut. Try a backup." : "If the wait is ridiculous"}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    Plan B: {alternatives[0]!.restaurant.name}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted transition group-open:rotate-180" aria-hidden>
                  ⌄
                </span>
              </summary>
              <ol className="space-y-2 border-t border-white/10 p-3">
                {alternatives.map((choice, index) => (
                  /* minmax(0,1fr) in both templates, and the base one is not optional: grid columns floor
                   at min-content, whether they are a bare 1fr or the implicit auto column a single-column
                   grid gets. Either way a long restaurant name widened the column instead of letting the
                   truncate inside it do its job, and the row ran out past the panel. */
                  <li
                    key={choice.restaurant.id}
                    className="grid gap-2 grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <a
                      href={mapsUrl(choice.restaurant)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-2 transition hover:border-white/25 hover:bg-white/5 active:scale-[0.99]"
                    >
                      <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-ember">
                        {index + 2}
                      </span>
                      <RestaurantPhoto
                        imageUrl={choice.restaurant.imageUrl}
                        category={choice.restaurant.category}
                        className="h-12 w-12 shrink-0 rounded-lg"
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-cream">
                          {choice.restaurant.name}
                        </strong>
                        <span className="block truncate text-xs text-muted">
                          {choice.rightSwipes} liked it
                          {distanceText(choice.restaurant.distanceMeters)
                            ? ` · ${distanceText(choice.restaurant.distanceMeters)}`
                            : ""}{" "}
                          · {priceLabel(choice.restaurant.priceTier)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-muted" aria-hidden>
                        ↗
                      </span>
                    </a>
                    {isHost && (
                      <button
                        type="button"
                        // There is one of these per runner-up, so the visible label alone is heard as
                        // "Make Plan A" twice with nothing to tell them apart.
                        aria-label={`Make ${choice.restaurant.name} Plan A`}
                        onClick={() => onChooseAlternative(choice.restaurant.id)}
                        className="rounded-xl border border-acid/25 bg-acid/10 px-4 py-2 text-xs font-bold text-acid transition hover:border-acid/50 hover:bg-acid/15 active:scale-[0.98]"
                      >
                        Make Plan A
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <PlanDirections
              restaurant={restaurant}
              unavailable={unavailable}
              onOpen={() => setDirectionsOpen(true)}
              className="desktop-directions"
            />
            <button
              type="button"
              onClick={() => void sharePlan()}
              disabled={shareResult !== null}
              aria-label={
                shareResult === "sharing"
                  ? "Opening dinner plan sharing"
                  : shareResult === "shared"
                    ? "Dinner plan shared"
                    : shareResult === "copied"
                      ? "Dinner plan copied"
                      : shareResult === "failed"
                        ? "Couldn’t share dinner plan"
                        : "Share dinner plan"
              }
              className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 active:scale-[0.98] transition disabled:cursor-default disabled:opacity-70"
            >
              {shareResult === "sharing"
                ? "Opening…"
                : shareResult === "shared"
                  ? "Plan shared"
                  : shareResult === "copied"
                    ? "Plan copied"
                    : shareResult === "failed"
                      ? "Couldn’t share"
                      : "Send the plan"}
            </button>
            <PlaceLinks restaurant={restaurant} />
            {installOffer && (
              /* Asked here and nowhere else: the round just ended, so there is an actual reason. */
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
                <span className="text-muted">Next argument could take one tap.</span>
                <button
                  type="button"
                  onClick={() => void install()}
                  className="rounded-full border border-acid/30 bg-acid/10 px-4 py-2 font-semibold text-acid transition hover:bg-acid/20 active:scale-[0.98]"
                >
                  Add to home screen
                </button>
                <button
                  type="button"
                  onClick={dismissInstall}
                  className="text-muted underline hover:text-cream"
                >
                  No thanks
                </button>
              </div>
            )}
            <RoundAgain isHost={isHost} onAgain={onAgain} />
          </div>

          <VisitedHistory visited={visited} onNeverAgain={onNeverAgain} />
        </div>
      </div>

      {detailOpen && <RestaurantDetail restaurant={restaurant} onClose={() => setDetailOpen(false)} />}
      {directionsOpen && (
        <DirectionsDialog
          restaurant={restaurant}
          addressCopied={addressCopied}
          addressCopyFailed={addressStatus === "failed"}
          onCopyAddress={copyAddress}
          onClose={() => setDirectionsOpen(false)}
        />
      )}
    </div>
  );
}
