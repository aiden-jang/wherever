import { PlateState } from "../components/PlateState.js";
import { Link } from "react-router-dom";

/** Catch-all for unknown URLs. Kept on-brand: a page nobody could agree existed. */
export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <PlateState />
        <h1 className="mt-4 font-display text-state font-bold">Nothing's here.</h1>
        <p className="mt-3 text-muted">
          We couldn’t find this page. It may have moved. A very ambitious dinner plan.
        </p>
        <Link
          to="/"
          className="mt-8 inline-block rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
        >
          Back to deciding
        </Link>
      </div>
    </main>
  );
}
