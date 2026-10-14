import { useLine } from "../useLine.js";
/** Card-shaped placeholder shown while the first deck is being fetched. */
export function DeckSkeleton() {
  const dealingLine = useLine("dealing");
  return (
    <div className="w-full max-w-sm mx-auto lg:max-w-none">
      <div className="relative h-[clamp(340px,52dvh,410px)] lg:h-[clamp(360px,64dvh,520px)]">
        <div
          className="absolute inset-0 meal-card rounded-card overflow-hidden animate-pulse"
          style={{ transform: "scale(0.95) translateY(14px)" }}
        />
        <div className="absolute inset-0 meal-card rounded-card overflow-hidden animate-pulse">
          <div className="h-[clamp(132px,24dvh,192px)] lg:h-[clamp(200px,38dvh,340px)] bg-white/5" />
          <div className="p-5 space-y-3">
            <div className="h-6 w-2/3 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/5" />
          </div>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-muted">{dealingLine}</p>
    </div>
  );
}
