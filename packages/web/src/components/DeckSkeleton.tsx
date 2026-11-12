import { useLine } from "../useLine.js";

export function DeckSkeleton() {
  const dealingLine = useLine("dealing");
  return (
    <div className="table-layout">
      <div className="meal-card table-card">
        <div className="table-face animate-pulse" aria-hidden>
          <div data-card-photo className="relative">
            <div className="table-photo bg-ink/10" />
          </div>
          <div className="meal-body space-y-3">
            <div className="h-8 w-2/3 rounded bg-ink/10" />
            <div className="h-4 w-1/2 rounded bg-ink/10" />
          </div>
        </div>
        <div className="vote-controls" aria-hidden>
          <div className="vote-main">
            <div className="h-[46px] rounded-xl bg-ink/10" />
            <div className="h-[46px] rounded-xl bg-ink/10" />
          </div>
          <div className="vote-undo-slot" />
          <div className="vote-special">
            <div className="h-11 w-24 rounded-xl bg-ink/10" />
            <div className="h-11 w-24 rounded-xl bg-ink/10" />
          </div>
        </div>
        <p role="status" className="table-vote-feedback">
          {dealingLine}
        </p>
      </div>
    </div>
  );
}
