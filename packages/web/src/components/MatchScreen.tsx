import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInstallPrompt } from "../useInstallPrompt.js";
import {
  line,
  matchReasons,
  nearMissLine,
  type Restaurant,
  type SessionFilters,
  type VisitedPlace,
} from "@wherever/shared";
import type { MatchState } from "../useSessionSocket.js";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
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

/*
 * Same line for everybody in the room: the seed comes from the winner's id, not a clock or a random,
 * so two phones looking at the same result never disagree about what just happened.
 */
function seedFrom(id: string): number {
  let n = 0;
  for (const character of id) n = (n + character.charCodeAt(0)) % 997;
  return n;
}

/** The tally is useful evidence; this is the human version of what it means. */
/*
 * One person is not a tie, however many places finished level.
 *
 * Alone, every place you liked scores exactly one, so a tie is guaranteed the moment you like two.
 * Keep the tie copy out of this case. "Dead tie. Of course it is." and "6 places finished level"
 * are jokes about a committee that was never in the room, and this is the first thing most
 * people see, because opening it alone to find out what it is is how everybody starts.
 */
function consensusLine(rightSwipes: number, totalParticipants: number, seed: number): string {
  if (totalParticipants <= 1) return line("solo", seed);
  if (rightSwipes === totalParticipants) return "Unanimous. Put it in the group chat.";
  if (rightSwipes / totalParticipants >= 0.75) return "A clear majority. Dinner is handled.";
  return "The committee picked a winner.";
}

/** A share should read like a plan someone can act on, not an app notification. */
function planText(
  r: Restaurant,
  rightSwipes: number,
  totalParticipants: number,
  reasons: string[] = [],
  backup?: Restaurant,
): string {
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
  const why = reasons.length > 0 ? `\nWhy it won: ${reasons.join(" · ")}` : "";
  const fallback = backup ? `\nPlan B: ${backup.name}\n${mapsUrl(backup)}` : "";
  return `Dinner plan: ${r.name}${where}\nPicked by ${rightSwipes} of ${totalParticipants}.${availability}${why}${fallback}`;
}

function History({
  visited,
  onNeverAgain,
}: {
  visited: VisitedPlace[];
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const [shareStatus, setShareStatus] = useState<"sharing" | "shared" | "copied" | null>(null);
  if (visited.length === 0) return null;
  const ordered = [...visited].sort(
    (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
  );
  const shareHistory = async () => {
    if (shareStatus) return;
    const text = `Already tried:\n${ordered.map((place) => `• ${place.name}`).join("\n")}`;
    setShareStatus("sharing");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Wherever past picks", text });
        setShareStatus("shared");
        setTimeout(() => setShareStatus(null), 1800);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setShareStatus(null);
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareStatus("copied");
      setTimeout(() => setShareStatus(null), 1800);
    } catch {
      setShareStatus(null);
    }
  };
  return (
    <div className="mt-10 text-left">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Already been dragged to</h3>
        <button
          type="button"
          onClick={() => void shareHistory()}
          disabled={shareStatus !== null}
          className="text-xs font-semibold text-muted transition hover:text-acid hover:underline disabled:cursor-default disabled:opacity-70"
        >
          {shareStatus === "sharing"
            ? "Opening…"
            : shareStatus === "shared"
              ? "Shared"
              : shareStatus === "copied"
                ? "Copied"
                : "Share list"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {ordered.map((v) => (
          <span
            key={v.restaurantId}
            className={`rounded-2xl border px-3 py-1.5 text-sm text-muted ${
              v.neverAgain ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-white/5"
            }`}
          >
            <span className="block text-cream/90">{v.name}</span>
            <time dateTime={v.visitedAt} className="block text-2xs text-muted">
              {new Date(v.visitedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year:
                  new Date(v.visitedAt).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
              })}
            </time>
            {/* The other reason to exclude a place. A visit fades on its own after a cooldown; this
                does not, so it is a deliberate tap rather than something you can do by swiping. */}
            <button
              type="button"
              onClick={() => onNeverAgain(v.restaurantId, !v.neverAgain)}
              aria-pressed={v.neverAgain === true}
              className="mt-0.5 block text-2xs font-semibold text-muted transition hover:text-acid"
            >
              {v.neverAgain ? "never again ✓" : "never again"}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MatchScreen({
  match,
  visited,
  filters,
  isHost,
  onAgain,
  onChooseAlternative,
  onNeverAgain,
}: {
  match: NonNullable<MatchState>;
  visited: VisitedPlace[];
  filters?: SessionFilters;
  isHost: boolean;
  onAgain: (deck: "new" | "same") => void;
  onChooseAlternative: (restaurantId: string) => void;
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const navigate = useNavigate();

  if (match.kind === "none") {
    // Two very different rounds end here, and saying "nobody liked anything" about the second one
    // is just false — people wanted things, and every one of them got vetoed. That is also the
    // case where somebody most wants to know what actually happened to their pick.
    const allVetoed = match.vetoedCount > 0;
    return (
      <div className="text-center max-w-sm mx-auto">
        <div className="text-glyph">{allVetoed ? "🚫" : "🤷"}</div>
        <h1 className="mt-4 font-display text-state font-bold">
          {allVetoed ? "Everything got vetoed." : "Nobody liked anything."}
        </h1>
        <p className="mt-3 text-muted">
          {allVetoed
            ? `${match.vetoedCount} place${match.vetoedCount === 1 ? "" : "s"} struck off, and whatever survived, nobody wanted. Run it back with a wider net.`
            : "A clean sweep of nos. Genuinely impressive. Cereal is still on the table, spiritually."}
        </p>
        {isHost ? (
          <button
            onClick={() => onAgain("new")}
            className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Run it back
          </button>
        ) : (
          /*
            The sibling branch (a winner was found) already offers a non-host the way out. This one
            offered a sentence and nothing else, which left the one person who cannot act on this
            screen with nowhere to go from it. Same words, same button, same shape.
          */
          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="text-muted">Round two is the host&rsquo;s call.</p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
            >
              Show myself out
            </button>
          </div>
        )}
        <History visited={visited} onNeverAgain={onNeverAgain} />
      </div>
    );
  }

  return (
    <WinnerScreen
      match={match}
      visited={visited}
      filters={filters}
      isHost={isHost}
      onAgain={onAgain}
      onChooseAlternative={onChooseAlternative}
      onNeverAgain={onNeverAgain}
    />
  );
}

function WinnerScreen({
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
  const mapsAction = unavailable ? "See it in Google Maps ↗" : "Get directions";
  const [detailOpen, setDetailOpen] = useState(false);
  const [shareResult, setShareResult] = useState<"sharing" | "copied" | "shared" | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
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

  return (
    <div className="relative w-full">
      {celebrate && <Confetti />}
      {/*
        The heading for the whole screen, not decoration. This branch had no h1 at all — only the
        "nobody agreed" branch did — so the app's main success screen started at h2 with a minor
        section ("1 still off the radar"). The winner's name is carried here for a screen reader
        because on screen it is the card below, which is a button and no place for a heading.
      */}
      {/*
        Two columns from lg: what happened on the left, what to do about it on the right.
        This screen carries a winner, a tally, the reasons, the
        receipt, the backups and the history, and all of it was a 384px column no matter how
        wide the window -- a phone screen with a thousand pixels of dark either side. One cut,
        so a phone still reads it top to bottom in exactly the order it always did.
      */}
      <div className="mx-auto w-full max-w-sm text-center lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="min-w-0">
          <h1 className="reveal font-display text-lg font-bold tracking-widest text-acid uppercase">
            It&apos;s decided<span className="sr-only">: {restaurant.name}</span>
          </h1>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            aria-label={`See details for ${restaurant.name}`}
            className="reveal relative mt-5 block w-full text-left rounded-card bg-ink-soft border border-white/10 shadow-raised overflow-hidden cursor-pointer hover:border-white/25 transition-colors"
            /* The other half of the deck's `chosen-card`: same name, so the card the room picked grows
             into this one instead of the screen cutting. */
            style={{ "--reveal-at": "90ms", viewTransitionName: "chosen-card" } as CSSProperties}
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
                {/* Same weight as on the card: getting there is the live question on this screen. */}
                {distanceText(restaurant.distanceMeters) && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="whitespace-nowrap font-semibold text-cream tabular-nums">
                      {distanceText(restaurant.distanceMeters)}
                    </span>
                  </>
                )}
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
                  <p
                    className={`mt-2 text-sm font-semibold ${restaurant.openNow ? "text-acid" : "text-flare"}`}
                  >
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

          <p
            className="reveal mt-4 text-muted tabular-nums"
            style={{ "--reveal-at": "190ms" } as CSSProperties}
          >
            {rightSwipes} of {totalParticipants} picked it.
          </p>
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
            {unavailable ? (
              <a
                href={mapsUrl(restaurant)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
              >
                {mapsAction}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setDirectionsOpen(true)}
                className="rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
              >
                {mapsAction}
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
              {shareResult === "sharing"
                ? "Opening…"
                : shareResult === "shared"
                  ? "Plan shared"
                  : shareResult === "copied"
                    ? "Plan copied"
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

          <History visited={visited} onNeverAgain={onNeverAgain} />
        </div>
      </div>

      {detailOpen && <RestaurantDetail restaurant={restaurant} onClose={() => setDetailOpen(false)} />}
      {directionsOpen && (
        <DirectionsDialog
          restaurant={restaurant}
          addressCopied={addressCopied}
          onCopyAddress={copyAddress}
          onClose={() => setDirectionsOpen(false)}
        />
      )}
    </div>
  );
}
