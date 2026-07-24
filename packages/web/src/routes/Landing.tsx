import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import type { AmenityKey, PriceTier, RestaurantSort, SessionFilters } from "@wherever/shared";
import {
  AMENITY_OPTIONS,
  CUISINE_OPTIONS,
  FILTER_PRESETS,
  isInNYC,
  MIN_REVIEWS_OPTIONS,
  NEIGHBORHOODS,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  RATING_OPTIONS,
  ROUND_TIMER_OPTIONS,
  SORT_OPTIONS,
} from "@wherever/shared";
import { Modal } from "../components/Modal.js";
import {
  createSession,
  getLocation,
  rememberName,
  recallName,
  DEFAULT_FILTERS,
} from "../api.js";

const DEADPAN_LINES = [
  "It's going to be tacos. It's always tacos. Vote anyway.",
  "You have a favorite. Say it with a swipe.",
  "The group chat: 200 messages, zero decisions.",
  "Someone will say 'I'm easy.' They are lying.",
  "Nobody's driving 40 minutes. Be honest.",
  "'Anywhere is fine.' Cool. We'll pick for you.",
  "You already know. Just swipe.",
  "Democracy, for dinner. Keep up.",
  "The vegetarian remembers last time.",
  "You're hungry and stalling. Iconic.",
  "Whoever picked last time doesn't get a vote. Kidding. Mostly.",
  "Six good options. You'll still say 'idk.'",
  "This took your group 45 minutes last time. Not tonight.",
  "No standoff. No group chat. Just swipe.",
  "Pick fast — the hangry one is turning.",
];

interface TeaserCard {
  name: string;
  category: string;
  emoji: string;
  price: string;
  rating: string;
  distance: string;
  gradient: string;
  rotation: string;
  offset: string;
}

const CARDS: TeaserCard[] = [
  { name: "Late Night Pizza Decisions", category: "Pizza", emoji: "🍕", price: "$", rating: "4.4", distance: "0.9 mi", gradient: "linear-gradient(135deg, #ff5e2c, #ff2d78)", rotation: "-8deg", offset: "translate(-38px, 26px)" },
  { name: "Noodle Situation", category: "Ramen", emoji: "🍜", price: "$$", rating: "4.1", distance: "1.1 mi", gradient: "linear-gradient(135deg, #7c3aed, #ff2d78)", rotation: "5deg", offset: "translate(30px, 12px)" },
  { name: "Probably Fine Tacos", category: "Tacos", emoji: "🌮", price: "$", rating: "4.6", distance: "0.5 mi", gradient: "linear-gradient(135deg, #ff8a3d, #ff5e2c)", rotation: "-1deg", offset: "translate(0, 0)" },
];

function StatusLine() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % DEADPAN_LINES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return <p className="mt-8 text-sm text-muted">{DEADPAN_LINES[i]}</p>;
}

/** The visual body of a teaser card. The front card also shows the working Nope/Yes controls. */
function TeaserCardFace({
  card,
  front = false,
  onVote,
}: {
  card: TeaserCard;
  front?: boolean;
  onVote?: (dir: "left" | "right") => void;
}) {
  return (
    <div className="rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
      <div className="h-36 flex items-center justify-center text-6xl" style={{ background: card.gradient }}>
        <span className="drop-shadow-lg">{card.emoji}</span>
      </div>
      <div className="p-4">
        <div className="font-display text-lg font-semibold leading-tight">{card.name}</div>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted">
          <span>{card.category}</span>
          <span className="text-white/20">·</span>
          <span className="text-acid">★ {card.rating}</span>
          <span className="text-white/20">·</span>
          <span>{card.price}</span>
          <span className="text-white/20">·</span>
          <span>{card.distance}</span>
        </div>
      </div>
      {front && (
        <>
          <span className="absolute top-4 left-4 rotate-[-12deg] rounded-lg border-2 border-acid px-3 py-1 text-xs font-bold tracking-widest text-acid">
            LET&apos;S EAT
          </span>
          <div className="flex gap-3 px-4 pb-4">
            <button
              type="button"
              aria-label="Nope"
              onClick={() => onVote?.("left")}
              className="flex-1 rounded-2xl border border-white/10 py-2 text-lg hover:border-flare hover:text-flare active:scale-95 transition"
            >
              ✕
            </button>
            <button
              type="button"
              aria-label="Yes"
              onClick={() => onVote?.("right")}
              className="flex-1 rounded-2xl bg-acid py-2 text-lg text-ink font-bold hover:brightness-110 active:scale-95 transition"
            >
              ♥
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Fixed slots the three cards sit in (front → back), so cycling swaps content, not positions.
const TEASER_SLOTS = [
  "translate(0px, 0px) rotate(-1deg)",
  "translate(30px, 12px) rotate(5deg) scale(0.95)",
  "translate(-38px, 26px) rotate(-8deg) scale(0.9)",
];

/**
 * A tiny, working swipe demo on the landing page: tap ♥/✕ on the front card and it flies off, the
 * next slides up. Shows the actual mechanic instead of faking it with dead buttons.
 */
function TeaserStack() {
  const [idx, setIdx] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right">("right");
  const reduce = useReducedMotion();

  const vote = (dir: "left" | "right") => {
    setExitDir(dir);
    setIdx((i) => (i + 1) % CARDS.length);
  };

  const front = CARDS[idx]!;

  return (
    <div className="relative h-full w-full flex items-center justify-center">
      {/* Background cards, peeking behind the front one. */}
      {[2, 1].map((depth) => {
        const card = CARDS[(idx + depth) % CARDS.length]!;
        return (
          <div
            key={`slot-${depth}`}
            className="absolute w-64 sm:w-72"
            style={{ transform: TEASER_SLOTS[depth], zIndex: 3 - depth }}
            aria-hidden
          >
            <TeaserCardFace card={card} />
          </div>
        );
      })}

      <AnimatePresence initial={false}>
        <motion.div
          key={front.name}
          className="absolute w-64 sm:w-72"
          style={{ zIndex: 3 }}
          initial={reduce ? { opacity: 0 } : { scale: 0.92, y: 24, opacity: 0 }}
          animate={{ x: 0, y: 0, scale: 1, rotate: -1, opacity: 1 }}
          exit={
            reduce
              ? { opacity: 0, transition: { duration: 0.12 } }
              : {
                  x: exitDir === "right" ? 380 : -380,
                  rotate: exitDir === "right" ? 16 : -16,
                  opacity: 0,
                  transition: { duration: 0.32 },
                }
          }
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <TeaserCardFace card={front} front onVote={vote} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

const segBase =
  "flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-colors border";
const segOn = "bg-ember text-ink border-ember";
const segOff = "bg-black/40 text-cream border-white/10 hover:border-white/30";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

/**
 * Cuisine multi-select + distance / price / open-now up front, with rating / min-reviews / sort
 * tucked behind a collapsible "get picky" disclosure. The app's whole premise is that deciding is
 * exhausting, so the create form leads with the few choices a group actually cares about and hides
 * the power-user knobs until asked. Empty cuisine = anything.
 */
function FilterFields({
  filters,
  onChange,
  showAreas,
}: {
  filters: SessionFilters;
  onChange: (next: SessionFilters) => void;
  showAreas: boolean;
}) {
  const [pickyOpen, setPickyOpen] = useState(false);

  const popularCuisines = CUISINE_OPTIONS.filter((c) => c.popular);
  const moreCuisines = CUISINE_OPTIONS.filter((c) => !c.popular);
  // Auto-expand the full list if a selected cuisine lives in the hidden set, so a pick can never be
  // silently tucked away out of view.
  const hasHiddenSelected = moreCuisines.some((c) => filters.categories.includes(c.value));
  const [showAllCuisines, setShowAllCuisines] = useState(hasHiddenSelected);
  const [rulesOpen, setRulesOpen] = useState(false);

  function toggleCuisine(value: string) {
    const has = filters.categories.includes(value);
    onChange({
      ...filters,
      categories: has
        ? filters.categories.filter((c) => c !== value)
        : [...filters.categories, value],
    });
  }

  function toggleAmenity(key: AmenityKey) {
    const current = filters.amenities ?? [];
    const has = current.includes(key);
    onChange({
      ...filters,
      amenities: has ? current.filter((a) => a !== key) : [...current, key],
    });
  }

  function togglePrice(tier: PriceTier) {
    const current = filters.priceTiers ?? [];
    const has = current.includes(tier);
    onChange({
      ...filters,
      priceTiers: has ? current.filter((t) => t !== tier) : [...current, tier].sort(),
    });
  }

  function toggleExclude(value: string) {
    const current = filters.excludedCategories ?? [];
    const has = current.includes(value);
    onChange({
      ...filters,
      excludedCategories: has ? current.filter((c) => c !== value) : [...current, value],
    });
  }

  // How many hidden knobs are set away from their defaults, so a collapsed section still tells the
  // host something's active under there. (Rating + review-count moved out to the main filters.)
  const pickyCount =
    ((filters.sort ?? "popularity") !== "popularity" ? 1 : 0) +
    (filters.amenities?.length ?? 0) +
    (filters.excludedCategories?.length ?? 0);

  // "House rules" = how the round runs (reveal voters + timer), folded away from the food filters.
  const rulesCount = (filters.revealVoters ? 1 : 0) + (filters.roundSeconds ? 1 : 0);

  // A quick-pick preset reads as "on" when every field it sets currently matches (it replaces each
  // field via spread, so exact match is right, and this clears the moment you tweak one of them).
  // Gives the preset buttons the pressed feedback they were missing — tapping felt like a no-op.
  const presetActive = (pf: Partial<SessionFilters>): boolean =>
    Object.entries(pf).every(([k, v]) => {
      const cur = (filters as unknown as Record<string, unknown>)[k];
      if (Array.isArray(v))
        return (
          Array.isArray(cur) &&
          cur.length === v.length &&
          [...cur].sort().join() === [...(v as unknown[])].sort().join()
        );
      return cur === v;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <FieldLabel>Quick picks</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {FILTER_PRESETS.map((p) => {
            const on = presetActive(p.filters);
            // Quick picks are single-select toggles. Every field a preset can touch is reset first,
            // so applying one can't leave another still "on" (the old multi-select bug), and tapping
            // the active one clears back to defaults (unselect). Cuisines/rating/reviews aren't
            // preset-managed, so they're left untouched.
            const presetReset = {
              priceTiers: [],
              radiusMeters: DEFAULT_FILTERS.radiusMeters,
              amenities: [],
              openNow: false,
            };
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? { ...filters, ...presetReset } : { ...filters, ...presetReset, ...p.filters })
                }
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "bg-ember text-ink border-ember font-semibold"
                    : "border-white/10 bg-black/40 text-cream hover:border-ember hover:text-ember"
                }`}
              >
                <span className="mr-1">{p.emoji}</span>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {showAreas && (
        <div className="flex flex-col gap-2">
          <FieldLabel>Where, geographically</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={!filters.area}
              onClick={() => onChange({ ...filters, area: undefined })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                !filters.area ? "bg-acid text-ink border-acid font-semibold" : "border-white/10 text-cream hover:border-white/30"
              }`}
            >
              📍 Near me
            </button>
            {NEIGHBORHOODS.map((n) => {
              const on = filters.area === n.value;
              return (
                <button
                  key={n.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...filters, area: n.value })}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    on ? "bg-acid text-ink border-acid font-semibold" : "border-white/10 text-cream hover:border-white/30"
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <FieldLabel>Cravings (pick some, or leave it to fate)</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(showAllCuisines ? CUISINE_OPTIONS : popularCuisines).map((c) => {
            const on = filters.categories.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCuisine(c.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on ? "bg-acid text-ink border-acid font-semibold" : "border-white/10 text-cream hover:border-white/30"
                }`}
              >
                <span className="mr-1">{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
          {!showAllCuisines && (
            <button
              type="button"
              onClick={() => setShowAllCuisines(true)}
              className="rounded-full border border-dashed border-white/20 px-3 py-1.5 text-sm text-muted hover:border-white/40 hover:text-cream transition-colors"
            >
              + {moreCuisines.length} more
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>How far you'll actually go</FieldLabel>
        <div className="flex gap-2">
          {RADIUS_OPTIONS.map((o) => (
            <button
              key={o.meters}
              type="button"
              aria-pressed={filters.radiusMeters === o.meters}
              onClick={() => onChange({ ...filters, radiusMeters: o.meters })}
              className={`${segBase} ${filters.radiusMeters === o.meters ? segOn : segOff}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Budget, realistically</FieldLabel>
        <div className="flex gap-2">
          {PRICE_OPTIONS.map((o) => {
            const on = (filters.priceTiers ?? []).includes(o.tier as PriceTier);
            return (
              <button
                key={o.tier}
                type="button"
                aria-pressed={on}
                onClick={() => togglePrice(o.tier as PriceTier)}
                className={`${segBase} ${on ? segOn : segOff}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted">
          {(filters.priceTiers?.length ?? 0) === 0
            ? "Any price — tap to pick exact levels"
            : "Only the levels you picked"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Standards</FieldLabel>
        <div className="flex gap-2">
          {RATING_OPTIONS.map((o) => {
            const on = (filters.minRating ?? 0) === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, minRating: o.value })}
                className={`${segBase} ${on ? segOn : segOff}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Enough reviews to trust it</FieldLabel>
        <div className="flex gap-2">
          {MIN_REVIEWS_OPTIONS.map((o) => {
            const on = (filters.minReviews ?? 0) === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, minReviews: o.value })}
                className={`${segBase} ${on ? segOn : segOff}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-pressed={filters.openNow ?? false}
        onClick={() => onChange({ ...filters, openNow: !filters.openNow })}
        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
          filters.openNow ? "border-ember bg-ember/10" : "border-white/10 hover:border-white/30"
        }`}
      >
        <span className="flex flex-col">
          <span className="font-semibold">Open now</span>
          <span className="text-xs text-muted">Hide places that are closed right now</span>
        </span>
        <span
          className={`relative h-6 w-11 rounded-full transition-colors ${
            filters.openNow ? "bg-ember" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              filters.openNow ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>

      {/* Power-user knobs most groups never touch, folded away so the form leads with the choices
          that actually matter. A count keeps them discoverable when set. */}
      <div className="rounded-2xl border border-white/10">
        <button
          type="button"
          aria-expanded={pickyOpen}
          onClick={() => setPickyOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-semibold">Get picky</span>
            {pickyCount > 0 && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-ember px-2 py-0.5 text-xs font-bold text-ink">
                {pickyCount} on
              </span>
            )}
            <span className="hidden truncate text-xs text-muted sm:inline">amenities, excludes, sort</span>
          </span>
          <Chevron open={pickyOpen} />
        </button>

        {pickyOpen && (
          <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4">
            <div className="flex flex-col gap-2">
              <FieldLabel>Must-haves</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {AMENITY_OPTIONS.map((a) => {
                  const on = (filters.amenities ?? []).includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAmenity(a.key)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on ? "bg-acid text-ink border-acid font-semibold" : "border-white/10 text-cream hover:border-white/30"
                      }`}
                    >
                      <span className="mr-1">{a.emoji}</span>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Not tonight</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {popularCuisines.map((c) => {
                  const on = (filters.excludedCategories ?? []).includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleExclude(c.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on ? "bg-flare text-ink border-flare font-semibold" : "border-white/10 text-cream hover:border-white/30"
                      }`}
                    >
                      <span className="mr-1">{c.emoji}</span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-muted">Anything you tap here won't show up.</span>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Order by</FieldLabel>
              <div className="flex gap-2">
                {SORT_OPTIONS.map((o) => {
                  const on = (filters.sort ?? "popularity") === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ ...filters, sort: o.value as RestaurantSort })}
                      className={`${segBase} ${on ? segOn : segOff}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* How the round runs — reveal-voters + timer. Separate from the food filters so the form
          reads as "what to eat" then "how we decide", not one long settings wall. */}
      <div className="rounded-2xl border border-white/10">
        <button
          type="button"
          aria-expanded={rulesOpen}
          onClick={() => setRulesOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-semibold">House rules</span>
            {rulesCount > 0 && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-ember px-2 py-0.5 text-xs font-bold text-ink">
                {rulesCount} on
              </span>
            )}
            <span className="hidden truncate text-xs text-muted sm:inline">timer, who's voted</span>
          </span>
          <Chevron open={rulesOpen} />
        </button>

        {rulesOpen && (
          <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4">
            <button
              type="button"
              aria-pressed={filters.revealVoters ?? false}
              onClick={() => onChange({ ...filters, revealVoters: !filters.revealVoters })}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                filters.revealVoters ? "border-ember bg-ember/10" : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="flex flex-col">
                <span className="font-semibold">Show who's voted</span>
                <span className="text-xs text-muted">
                  {filters.revealVoters ? "Everyone sees who's finished" : "Off — votes stay anonymous"}
                </span>
              </span>
              <span
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  filters.revealVoters ? "bg-ember" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    filters.revealVoters ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>

            <div className="flex flex-col gap-2">
              <FieldLabel>Round timer</FieldLabel>
              <div className="flex gap-2">
                {ROUND_TIMER_OPTIONS.map((o) => {
                  const on = (filters.roundSeconds ?? 0) === o.seconds;
                  return (
                    <button
                      key={o.seconds}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ ...filters, roundSeconds: o.seconds })}
                      className={`${segBase} ${on ? segOn : segOff}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-muted">
                {(filters.roundSeconds ?? 0) === 0
                  ? "No timer — decide when everyone's done"
                  : "When time's up, the votes so far decide"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateForm({ onError }: { onError: (m: string) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(recallName());
  const [filters, setFilters] = useState<SessionFilters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locOff, setLocOff] = useState(false);
  const [busy, setBusy] = useState(false);

  // Resolve location up front so we know whether to offer the NYC neighborhood shortcuts, and
  // reuse it at submit. If it's unavailable (denied/timeout), flag it so we can tell the user their
  // results will use a default area instead of silently serving the wrong city.
  useEffect(() => {
    getLocation().then((l) => {
      setLoc(l);
      setLocOff(l === null);
    });
  }, []);
  const showAreas = loc != null && isInNYC(loc.lat, loc.lng);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      rememberName(name.trim());
      // Use the location resolved on mount; don't re-invoke geolocation here (it can block up to
      // 5s again). If it's off, we already told the user results use a default area.
      const code = await createSession(name.trim(), {
        ...filters,
        ...(loc ?? {}),
      });
      navigate(`/s/${code}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something broke. Probably not you.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input className={inputClass} placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoFocus />
      <FilterFields filters={filters} onChange={setFilters} showAreas={showAreas} />
      <button type="submit" disabled={!name.trim() || busy} className="rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition">
        {busy ? "Shuffling the deck..." : "Deal the cards"}
      </button>
      {locOff && (
        <p className="text-center text-sm text-ink/60">
          location's off, so we'll use a default area. turn it on for spots near you.
        </p>
      )}
    </form>
  );
}

function JoinForm() {
  const navigate = useNavigate();
  const [name, setName] = useState(recallName());
  const [code, setCode] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || code.trim().length !== 6) return;
    rememberName(name.trim());
    navigate(`/s/${code.trim().toUpperCase()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input className={inputClass} placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className={`${inputClass} tracking-[0.4em] uppercase`} placeholder="CODE" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <button type="submit" disabled={!name.trim() || code.trim().length !== 6} className="rounded-2xl border border-white/15 px-6 py-3 text-lg font-semibold disabled:opacity-50 hover:bg-white/5 transition">
        Join
      </button>
    </form>
  );
}

export default function Landing() {
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex-1 grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto w-full px-6 pb-16">
      <section className="text-center lg:text-left">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-acid animate-pulse" />
          you're not fine with whatever
        </span>

        <h1 className="mt-6 font-display font-extrabold tracking-tight text-6xl sm:text-7xl leading-[0.95]">
          Wherever<span className="text-ember">,</span>
          <span className="block bg-gradient-to-r from-ember via-flare to-grape bg-clip-text text-transparent">Honestly</span>
        </h1>

        <p className="mt-5 text-lg text-muted max-w-md mx-auto lg:mx-0">
          Nobody's actually "fine with whatever." Swipe on it — majority wins, the group chat loses.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
          <button type="button" onClick={() => setModal("create")} className="rounded-full bg-ember px-8 py-4 text-lg font-semibold text-ink shadow-lg shadow-ember/30 hover:scale-[1.03] hover:shadow-ember/50 transition-transform">
            Start a session
          </button>
          <button type="button" onClick={() => setModal("join")} className="rounded-full border border-white/15 px-8 py-4 text-lg font-semibold hover:border-white/40 hover:bg-white/5 transition-colors">
            Join with a code
          </button>
        </div>

        <StatusLine />
      </section>

      <section className="relative h-[420px] flex items-center justify-center">
        <div className="float relative h-full w-full flex items-center justify-center" style={{ animation: "float-soft 6s ease-in-out infinite" }}>
          <TeaserStack />
        </div>
      </section>

      {modal === "create" && (
        <Modal title="Start a session" onClose={() => setModal(null)}>
          <CreateForm onError={setError} />
        </Modal>
      )}
      {modal === "join" && (
        <Modal title="Got a code?" onClose={() => setModal(null)}>
          <JoinForm />
        </Modal>
      )}
      {error && (
        <Modal title="That went poorly" onClose={() => setError(null)}>
          <p className="text-muted">{error}</p>
        </Modal>
      )}
    </main>
  );
}
