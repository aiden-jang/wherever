import type { BallotChoice, Restaurant } from "@wherever/shared";

export function PrivateShortlist({
  liked,
  restaurants,
  onOpen,
}: {
  liked: BallotChoice[];
  restaurants: Restaurant[];
  onOpen: (restaurant: Restaurant) => void;
}) {
  return (
    <details className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-cream [&::-webkit-details-marker]:hidden">
        <span>Your private shortlist</span>
        <span className="rounded-full bg-acid/10 px-2 py-0.5 text-xs text-acid">{liked.length} liked</span>
      </summary>
      <div className="border-t border-white/10 p-2">
        {liked.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted">You passed on the whole deck. Bold.</p>
        ) : (
          <ul className="space-y-1">
            {liked.map((choice) => {
              const restaurant = restaurants.find((candidate) => candidate.id === choice.restaurantId);
              if (!restaurant) return null;
              if (restaurant.detailsStatus && restaurant.googleMapsUri)
                return (
                  <li key={choice.restaurantId}>
                    <a
                      className="block rounded-xl px-3 py-2.5 text-sm underline"
                      href={restaurant.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Liked place {restaurants.indexOf(restaurant) + 1} on Google Maps
                    </a>
                  </li>
                );
              return (
                <li key={choice.restaurantId}>
                  <button
                    type="button"
                    onClick={() => onOpen(restaurant)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/5"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere] font-medium">{restaurant.name}</span>
                    <span className={choice.super ? "shrink-0 text-grape" : "shrink-0 text-acid"}>
                      {choice.super ? "⭐ super" : "♥ liked"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
