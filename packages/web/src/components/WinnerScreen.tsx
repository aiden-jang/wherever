import { SavePlanImage } from "./SavePlanImage.js";
import { CopyFallback } from "./CopyFallback.js";
import { useEffect, useRef, useState } from "react";

import { useShareAction } from "../useShareAction.js";
import { useInstallPrompt } from "../useInstallPrompt.js";
import { matchReasons, type SessionFilters, type VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../sessionState.js";
import { PlanDirections } from "./PlanDirections.js";
import { DinnerTicket } from "./DinnerTicket.js";
import { RestaurantHours, RestaurantAmenities, isUnavailable } from "./RestaurantFacts.js";
import { BackupPlaces } from "./BackupPlaces.js";
import { Confetti } from "./Confetti.js";
import { DirectionsDialog, mapsUrl } from "./DirectionsDialog.js";
import { PlaceLinks } from "./PlaceLinks.js";
import { WinnerReceipt } from "./WinnerReceipt.js";
import { RoundAgain } from "./RoundAgain.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";

import { VisitedHistory } from "./VisitedHistory.js";
import { planText } from "./winnerCopy.js";
export function WinnerScreen({
  match,
  visited,
  filters,
  isHost,
  online,
  pending,
  demo,
  onAgain,
  onEditSearch,
  resultError,
  onChooseAlternative,
  onNeverAgain,
}: {
  match: Extract<NonNullable<MatchState>, { kind: "match" }>;
  visited: VisitedPlace[];
  filters?: SessionFilters;
  isHost: boolean;
  online: boolean;
  pending: boolean;
  demo: boolean;
  onEditSearch: () => void;
  resultError?: string | null;
  onAgain: (deck: "new" | "same") => void;
  onChooseAlternative: (restaurantId: string) => void;
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const { restaurant, rightSwipes, alternatives, totalParticipants, round, hostPicked = false } = match;
  const unavailable = isUnavailable(restaurant);
  const { status: shareResult, share } = useShareAction(restaurant.id);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const { status: addressStatus, share: copy } = useShareAction(restaurant.id);
  const addressCopied = addressStatus === "copied";
  const reasons = matchReasons(restaurant, filters, rightSwipes, totalParticipants, hostPicked);
  const { offer: installOffer, install, dismiss: dismissInstall } = useInstallPrompt(round);

  const [celebrate, setCelebrate] = useState(!unavailable);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    if (unavailable) {
      setCelebrate(false);
      return;
    }
    setCelebrate(true);
    buzz([18, 40, 18]);
    play("match");
    const t = setTimeout(() => setCelebrate(false), 4000);
    return () => clearTimeout(t);
  }, [unavailable]);

  const text = demo
    ? `Sample plan: ${restaurant.name}. This restaurant is fictional.`
    : planText(
        restaurant,
        rightSwipes,
        totalParticipants,
        reasons.map((reason) => reason.label),
        alternatives.find((choice) => !isUnavailable(choice.restaurant))?.restaurant,
        hostPicked,
      );
  const url = mapsUrl(restaurant);
  const sharePlan = () => share({ title: restaurant.name, text, ...(demo ? {} : { url }) });
  const shareMessage =
    shareResult === "sharing"
      ? "Opening…"
      : shareResult === "shared"
        ? "Plan shared."
        : shareResult === "copied"
          ? "Plan copied."
          : "";
  const copyAddress = () =>
    restaurant.address
      ? copy({ text: `${restaurant.name}\n${restaurant.address}` }, false)
      : Promise.resolve();

  const backups = (
    <BackupPlaces
      alternatives={alternatives}
      unavailable={unavailable}
      demo={demo}
      online={online}
      pending={pending}
      isHost={isHost}
      onChooseAlternative={onChooseAlternative}
    />
  );
  return (
    <div className="winner-page relative w-full">
      {celebrate && <Confetti />}
      <h1 ref={heading} tabIndex={-1} className="table-title">
        {unavailable ? "One catch: the hours" : "Dinner is handled"}
        <span className="sr-only">: {restaurant.name}</span>
      </h1>
      <div className="table-layout">
        <div className="min-w-0">
          <DinnerTicket
            restaurant={restaurant}
            rightSwipes={rightSwipes}
            hostPicked={hostPicked}
            totalParticipants={totalParticipants}
            action={
              <div className="ticket-actions">
                {demo && (
                  <p className="mb-2 text-sm font-semibold">Sample pick. You can share the sample plan.</p>
                )}
                <div className="ticket-action-buttons">
                  {!demo && (
                    <PlanDirections
                      restaurant={restaurant}
                      unavailable={unavailable}
                      onOpen={() => setDirectionsOpen(true)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void sharePlan()}
                    disabled={shareResult === "sharing"}
                    className="ticket-share"
                  >
                    {shareResult === "failed" ? "Try sharing again" : "Send the plan"}
                  </button>
                </div>
                {shareMessage && (
                  <p role="status" className="text-sm font-medium">
                    {shareMessage}
                  </p>
                )}
                {shareResult === "failed" && (
                  <CopyFallback label="Dinner plan to copy" text={demo ? text : `${text}\n${url}`} />
                )}
              </div>
            }
          />

          {unavailable && !alternatives.length && (
            <p className="mt-3 text-sm text-muted">Check Maps before heading out. Hours can change.</p>
          )}
          {backups}
          {!demo && (
            <details className="winner-disclosure">
              <summary>Plan image options</summary>
              <div className="winner-detail-content">
                <SavePlanImage key={restaurant.id} restaurant={restaurant} hostPicked={hostPicked} />
              </div>
            </details>
          )}
          <details className="winner-disclosure">
            <summary>Hours &amp; place details</summary>
            <div className="winner-detail-content">
              {restaurant.editorialSummary && (
                <p className="text-sm text-muted">{restaurant.editorialSummary}</p>
              )}
              <RestaurantAmenities restaurant={restaurant} />
              <RestaurantHours hours={restaurant.hours} className="mt-3" />
              {!demo && (
                <PlaceLinks
                  restaurant={restaurant}
                  showMap={!unavailable && Boolean(restaurant.address?.trim())}
                />
              )}
            </div>
          </details>
        </div>
        <aside className="table-rail winner-rail" aria-label="Round details">
          <h2 className="font-display text-lg font-bold">Still negotiating?</h2>
          <p className="mb-4 mt-1 text-sm text-muted">The group chat lives to eat another day.</p>
          <RoundAgain
            isHost={isHost}
            online={online}
            pending={pending}
            onAgain={onAgain}
            onEditSearch={onEditSearch}
            resultError={resultError}
          />
          <WinnerReceipt match={match} filters={filters} />
          {visited.length > 0 && (
            <details className="winner-disclosure">
              <summary>
                Past picks <span className="text-muted">({visited.length})</span>
              </summary>
              <VisitedHistory visited={visited} online={online} onNeverAgain={onNeverAgain} />
            </details>
          )}
          {installOffer && (
            <div className="winner-install">
              <button type="button" onClick={() => void install()}>
                Add to home screen
              </button>
              <button type="button" onClick={dismissInstall}>
                No thanks
              </button>
            </div>
          )}
        </aside>
      </div>

      {directionsOpen && restaurant.address?.trim() && (
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
