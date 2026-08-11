import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Restaurant, VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../useSessionSocket.js";
import { categoryLabel, distanceLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { Confetti } from "./Confetti.js";
import { Modal } from "./Modal.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";
import { renderShareCard } from "./shareCard.js";

/**
 * A Google Maps link to the winning place itself (the place page, not turn-by-turn navigation), so
 * tapping the button just opens the spot in Maps. Prefers the place's canonical Maps URI; otherwise
 * a name+address search, with the address included so it resolves to the right spot even for chains.
 */
function mapsUrl(r: Restaurant): string {
  return (
    r.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address ?? ""}`.trim())}`
  );
}

/** The result screen is the moment people leave, so an operational winner should open navigation—not just a listing. */
function directionsUrl(r: Restaurant): string {
  const destination = `${r.name} ${r.address ?? ""}`.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** The tally is useful evidence; this is the human version of what it means. */
function consensusLine(rightSwipes: number, totalParticipants: number): string {
  if (totalParticipants <= 1) return 'Your call. Dinner is handled.';
  if (rightSwipes === totalParticipants) return 'Unanimous. Put it in the group chat.';
  if (rightSwipes / totalParticipants >= 0.75) return 'A clear majority. Dinner is handled.';
  return 'The committee picked a winner.';
}

/** A share should read like a plan someone can act on, not an app notification. */
function planText(r: Restaurant, rightSwipes: number, totalParticipants: number): string {
  const where = r.address ? `\n${r.address}` : "";
  const availability =
    r.businessStatus === "CLOSED_PERMANENTLY"
      ? " Permanently closed."
      : r.businessStatus === "CLOSED_TEMPORARILY"
        ? " Temporarily closed."
        : r.openNow == null
          ? ""
          : r.openNow
            ? " Open now."
            : " Closed right now.";
  return `Dinner plan: ${r.name}${where}\nPicked by ${rightSwipes} of ${totalParticipants}.${availability}`;
}

function defaultPlanStart(): string {
  const date = new Date();
  date.setHours(19, 0, 0, 0);
  if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsText(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

function History({ visited }: { visited: VisitedPlace[] }) {
  if (visited.length === 0) return null;
  return (
    <div className="mt-10 text-left">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Already been dragged to
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {visited.map((v) => (
          <span
            key={v.restaurantId}
            className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-sm text-muted"
          >
            {v.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MatchScreen({
  match,
  visited,
  isHost,
  onAgain,
}: {
  match: NonNullable<MatchState>;
  visited: VisitedPlace[];
  isHost: boolean;
  onAgain: () => void;
}) {
  const navigate = useNavigate();

  if (match.kind === "none") {
    // Two very different rounds end here, and saying "nobody liked anything" about the second one
    // is just false — people wanted things, and every one of them got vetoed. That is also the
    // case where somebody most wants to know what actually happened to their pick.
    const allVetoed = match.vetoedCount > 0;
    return (
      <div className="text-center max-w-sm mx-auto">
        <div className="text-6xl">{allVetoed ? "🚫" : "🤷"}</div>
        <h1 className="mt-4 font-display text-4xl font-bold">
          {allVetoed ? "Everything got vetoed." : "Nobody liked anything."}
        </h1>
        <p className="mt-3 text-muted">
          {allVetoed
            ? `${match.vetoedCount} place${match.vetoedCount === 1 ? "" : "s"} struck off, and whatever survived, nobody wanted. Run it back with a wider net.`
            : "A clean sweep of nos. Genuinely impressive. Cereal is still on the table, spiritually."}
        </p>
        {isHost ? (
          <button
            onClick={onAgain}
            className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Run it back
          </button>
        ) : (
          <p className="mt-8 text-muted">Round two is the host&rsquo;s call.</p>
        )}
        <History visited={visited} />
      </div>
    );
  }

  return <WinnerScreen match={match} visited={visited} isHost={isHost} onAgain={onAgain} navigate={navigate} />;
}

function WinnerScreen({
  match,
  visited,
  isHost,
  onAgain,
  navigate,
}: {
  match: Extract<NonNullable<MatchState>, { kind: "match" }>;
  visited: VisitedPlace[];
  isHost: boolean;
  onAgain: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { restaurant, rightSwipes, totalParticipants, vetoedCount, round } = match;
  const unavailable =
    restaurant.openNow === false ||
    restaurant.businessStatus === 'CLOSED_PERMANENTLY' ||
    restaurant.businessStatus === 'CLOSED_TEMPORARILY';
  const mapsAction = unavailable ? 'See it in Google Maps ↗' : 'Get directions ↗';
  const [detailOpen, setDetailOpen] = useState(false);
  const [shareResult, setShareResult] = useState<"sharing" | "copied" | "shared" | null>(null);
  const [cardResult, setCardResult] = useState<"making" | "shared" | "saved" | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [planStart, setPlanStart] = useState(defaultPlanStart);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

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
    const text = planText(restaurant, rightSwipes, totalParticipants);
    const finish = (result: "copied" | "shared") => {
      setShareResult(result);
      setTimeout(() => setShareResult(null), 1800);
    };
    setShareResult("sharing");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: restaurant.name, text, url });
        finish("shared");
        return;
      } catch (error) {
        // Closing the sheet is deliberate. Only a genuine share failure falls
        // through to copying the finished plan.
        if (error instanceof Error && error.name === "AbortError") {
          setShareResult(null);
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      finish("copied");
    } catch {
      // The Maps button remains the no-fail way to act on the result.
      setShareResult(null);
    }
  };

  const copyAddress = async () => {
    if (!restaurant.address || addressCopied) return;
    try {
      await navigator.clipboard.writeText(`${restaurant.name}\n${restaurant.address}`);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      // Directions is still the primary, no-fail way to get there.
    }
  };

  // A group-chat text gets people moving; a card is the little receipt someone keeps. The renderer
  // is fully local and the native sheet gets the actual PNG when the platform supports file shares.
  const saveWinnerCard = async () => {
    if (cardResult) return;
    setCardResult("making");
    try {
      const blob = await renderShareCard(restaurant);
      if (!blob) {
        setCardResult(null);
        return;
      }
      const fileName = `${restaurant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wherever"}-winner.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const canShareFile = typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));
      if (canShareFile) {
        try {
          await navigator.share({ title: `${restaurant.name} won`, files: [file] });
          setCardResult("shared");
          setTimeout(() => setCardResult(null), 2000);
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            setCardResult(null);
            return;
          }
        }
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setCardResult("saved");
      setTimeout(() => setCardResult(null), 2000);
    } catch {
      setCardResult(null);
    }
  };

  const addToCalendar = () => {
    const start = new Date(planStart);
    if (Number.isNaN(start.getTime())) {
      setCalendarError("Pick a time first.");
      return;
    }
    const end = new Date(start.getTime() + 90 * 60_000);
    const uid = `${restaurant.id}-${start.getTime()}@wherever`;
    const details = `Picked by ${rightSwipes} of ${totalParticipants} on Wherever, Honestly.`;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wherever Honestly//EN", "BEGIN:VEVENT",
      `UID:${icsText(uid)}`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(`Dinner at ${restaurant.name}`)}`, `LOCATION:${icsText(restaurant.address ?? restaurant.name)}`,
      `DESCRIPTION:${icsText(details)}`, "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n");
    const href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `${restaurant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dinner"}.ics`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    setPlannerOpen(false);
    setCalendarError(null);
  };

  const openCalendar = (provider: "google" | "outlook") => {
    const start = new Date(planStart);
    if (Number.isNaN(start.getTime())) {
      setCalendarError("Pick a time first.");
      return;
    }
    const end = new Date(start.getTime() + 90 * 60_000);
    const title = `Dinner at ${restaurant.name}`;
    const location = restaurant.address ?? restaurant.name;
    const details = `Picked by ${rightSwipes} of ${totalParticipants} on Wherever, Honestly.`;
    const url = provider === "google"
      ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsDate(start)}/${icsDate(end)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(details)}`
      : `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(start.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}&location=${encodeURIComponent(location)}&body=${encodeURIComponent(details)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setPlannerOpen(false);
    setCalendarError(null);
  };

  return (
    <div className="relative text-center max-w-sm mx-auto w-full">
      {celebrate && <Confetti />}
      <p className="font-display text-lg font-bold tracking-widest text-acid uppercase">
        It&apos;s decided
      </p>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        aria-label={`See details for ${restaurant.name}`}
        className="pop-in relative mt-5 block w-full text-left rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/60 overflow-hidden cursor-pointer hover:border-white/25 transition-colors"
      >
        <RestaurantPhoto imageUrl={restaurant.imageUrl} category={restaurant.category} className="h-44" />
        <span className="pointer-events-none absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-sm font-semibold text-white/90 backdrop-blur-sm">
          i
        </span>
        <div className="p-5">
          <div className="font-display text-3xl font-extrabold leading-tight line-clamp-2">
            {restaurant.name}
          </div>
          {/* Category on its own line, stats below with each value kept whole — same treatment as
              the deck card so the winner never wraps mid-value on a phone. */}
          <div className="mt-2 truncate text-sm text-muted">{categoryLabel(restaurant.category)}</div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="whitespace-nowrap text-acid">
              {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
              {restaurant.rating && restaurant.reviewCount
                ? ` (${reviewCountLabel(restaurant.reviewCount)})`
                : ""}
            </span>
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">{priceLabel(restaurant.priceTier)}</span>
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">{distanceLabel(restaurant.distanceMeters)}</span>
          </div>
          {/*
            Whether it is open, on the winner itself.
            The detail sheet has said this all along, but only after a tap, and this is the one fact
            that can undo the decision the group just made: a closed door after everyone has agreed
            and started walking is the failure this screen exists to prevent. Permanent closure
            outranks today's hours, same order the detail sheet uses.
          */}
          {(() => {
            const shut =
              restaurant.businessStatus === "CLOSED_PERMANENTLY"
                ? "Permanently closed"
                : restaurant.businessStatus === "CLOSED_TEMPORARILY"
                  ? "Temporarily closed"
                  : null;
            if (shut) return <p className="mt-2 text-sm font-semibold text-flare">{shut}</p>;
            if (restaurant.openNow == null) return null;
            return (
              <p className={`mt-2 text-sm font-semibold ${restaurant.openNow ? "text-acid" : "text-flare"}`}>
                {restaurant.openNow ? "Open now" : "Closed right now"}
              </p>
            );
          })()}
          {restaurant.address && (
            <p className="mt-3 truncate text-sm text-muted" title={restaurant.address}>
              {restaurant.address}
            </p>
          )}
        <p className="mt-3 text-xs text-muted">Tap for hours, contact details &amp; directions</p>
        </div>
      </button>

      <p className="mt-4 text-muted">
        {rightSwipes} of {totalParticipants} picked it.
      </p>
      <p className="mt-2 inline-flex rounded-full border border-acid/20 bg-acid/10 px-3 py-1 text-xs font-semibold text-acid">
        {consensusLine(rightSwipes, totalParticipants)}
      </p>
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
          style={{ width: `${Math.max(0, Math.min(100, (rightSwipes / Math.max(1, totalParticipants)) * 100))}%` }}
        />
      </div>
      {/* Without this a vetoed favourite just silently isn't here, which reads as the tally being
          wrong rather than as somebody having used their one no. Count only — who spent it stays
          private, the same as every other vote in a round. */}
      {vetoedCount > 0 && (
        <p className="mt-1 text-sm text-muted/70">
          🚫 {vetoedCount} {vetoedCount === 1 ? "place was" : "places were"} vetoed out of the running.
        </p>
      )}
      {/* Only once the group has genuinely laboured. Round 1 is just dinner; saying "round 1" about
          it would be noise, and the joke below only earns itself if the number is real. */}
      {round >= 2 && (
        <p className="mt-1 text-sm italic text-muted/70">
          {round >= 4
            ? `${round} rounds to pick one place. The group chat would have been faster.`
            : `Round ${round}. Worth the wait, presumably.`}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={unavailable ? mapsUrl(restaurant) : directionsUrl(restaurant)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
        >
          {mapsAction}
        </a>
        {(restaurant.phone || restaurant.website) && (
          <div className={`grid gap-3 ${restaurant.phone && restaurant.website ? "grid-cols-2" : "grid-cols-1"}`}>
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition"
              >
                Call the place
              </a>
            )}
            {restaurant.website && (
              <a
                href={restaurant.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition"
              >
                Website ↗
              </a>
            )}
          </div>
        )}
        {restaurant.address && (
          <button
            type="button"
            onClick={() => void copyAddress()}
            disabled={addressCopied}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-muted hover:border-white/20 hover:text-cream transition disabled:cursor-default disabled:opacity-70"
          >
            {addressCopied ? 'Address copied' : 'Copy address'}
          </button>
        )}
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
                  : "Share dinner plan"
          }
          className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 active:scale-[0.98] transition disabled:cursor-default disabled:opacity-70"
        >
          {shareResult === "sharing" ? "Opening…" : shareResult === "shared" ? "Plan shared" : shareResult === "copied" ? "Plan copied" : "Send the plan"}
        </button>
        <button
          type="button"
          onClick={() => void saveWinnerCard()}
          disabled={cardResult !== null}
          className="rounded-full border border-white/10 px-8 py-2.5 text-sm font-semibold text-muted hover:border-white/20 hover:text-cream active:scale-[0.98] transition disabled:cursor-default disabled:opacity-70"
        >
          {cardResult === "making" ? "Making winner card…" : cardResult === "shared" ? "Winner card shared" : cardResult === "saved" ? "Winner card saved" : "Save the winner card"}
        </button>
        <button
          type="button"
          onClick={() => setPlannerOpen(true)}
          className="rounded-full border border-white/10 px-8 py-2.5 text-sm font-semibold text-muted hover:border-white/20 hover:text-cream active:scale-[0.98] transition"
        >
          Add it to calendar
        </button>
        {isHost ? (
          <button
            onClick={onAgain}
            className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
          >
            Run it back (this one&apos;s out)
          </button>
        ) : (
          <button
            onClick={() => navigate("/")}
            className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
          >
            Show myself out
          </button>
        )}
      </div>

      <History visited={visited} />

      {detailOpen && (
        <RestaurantDetail restaurant={restaurant} onClose={() => setDetailOpen(false)} />
      )}
      {plannerOpen && (
        <Modal title="Put dinner on the calendar" onClose={() => { setPlannerOpen(false); setCalendarError(null); }}>
          <p className="text-sm leading-relaxed text-muted">
            Save {restaurant.name} wherever the group keeps plans. It&apos;s set to 90 minutes; change the start if tonight isn&apos;t right.
          </p>
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="dinner-time">
            Start time
          </label>
          <input
            id="dinner-time"
            type="datetime-local"
            value={planStart}
            onChange={(event) => setPlanStart(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/15 bg-ink px-3 py-3 text-sm text-cream outline-none focus:border-acid"
          />
          {calendarError && <p role="alert" className="mt-2 text-sm text-flare">{calendarError}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openCalendar("google")}
              className="rounded-full bg-ember px-4 py-3 text-sm font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
            >
              Google Calendar ↗
            </button>
            <button
              type="button"
              onClick={() => openCalendar("outlook")}
              className="rounded-full border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition"
            >
              Outlook ↗
            </button>
          </div>
          <button
            type="button"
            onClick={addToCalendar}
            className="mt-2 w-full rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-muted hover:border-white/20 hover:text-cream active:scale-[0.98] transition"
          >
            Download .ics for Apple Calendar
          </button>
        </Modal>
      )}
    </div>
  );
}
