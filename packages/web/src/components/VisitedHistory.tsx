import { useShareAction } from "../useShareAction.js";
import type { VisitedPlace } from "@wherever/shared";
import { CopyFallback } from "./CopyFallback.js";
export function VisitedHistory({
  visited,
  online,
  onNeverAgain,
}: {
  visited: VisitedPlace[];
  online: boolean;
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const { status: shareStatus, share } = useShareAction("history");
  if (visited.length === 0) return null;
  const ordered = [...visited].sort(
    (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
  );
  const label = (place: VisitedPlace, index: number) => place.name || `Past pick ${ordered.length - index}`;
  const text = `Past picks:\n${ordered
    .map((place, index) => `• ${label(place, index)}${place.mapsUrl ? ` — ${place.mapsUrl}` : ""}`)
    .join("\n")}`;
  const shareHistory = async () => {
    if (shareStatus === "sharing") return;
    await share({ title: "Wherever past picks", text });
  };
  return (
    <div className="visited-history mt-10 text-left">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Past picks</h3>
        <button
          type="button"
          onClick={() => void shareHistory()}
          disabled={shareStatus === "sharing"}
          aria-live="polite"
          className="text-xs font-semibold text-muted transition hover:text-acid hover:underline disabled:cursor-default disabled:opacity-70"
        >
          {shareStatus === "sharing"
            ? "Opening…"
            : shareStatus === "shared"
              ? "Shared"
              : shareStatus === "copied"
                ? "Copied"
                : shareStatus === "failed"
                  ? "Couldn’t share"
                  : "Share list"}
        </button>
      </div>
      {shareStatus === "failed" && <CopyFallback label="Past picks to copy" text={text} />}
      <div className="mt-2 flex flex-wrap gap-2">
        {ordered.map((v, index) => (
          <span
            key={v.restaurantId}
            className={`rounded-2xl border px-3 py-1.5 text-sm text-muted ${
              v.neverAgain ? "border-dashed border-white/15 bg-white/[0.02]" : "border-white/10 bg-white/5"
            }`}
          >
            {v.mapsUrl ? (
              <a
                href={v.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby="external-link-hint"
                className="inline-flex min-h-6 items-center text-cream underline [overflow-wrap:anywhere]"
              >
                {label(v, index)} <span className="sr-only">on Google Maps</span>
              </a>
            ) : (
              <span className="block text-cream/90 [overflow-wrap:anywhere]">{label(v, index)}</span>
            )}
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
              disabled={!online}
              onClick={() => onNeverAgain(v.restaurantId, !v.neverAgain)}
              aria-pressed={v.neverAgain === true}
              aria-label={`Exclude ${label(v, index)} from future rounds`}
              className="mt-0.5 block min-h-11 px-2 text-sm font-semibold text-muted transition enabled:hover:text-acid disabled:opacity-60"
            >
              {v.neverAgain ? "Excluded" : "Exclude from future rounds"}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
