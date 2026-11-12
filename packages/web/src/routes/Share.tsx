import { PlateState } from "../components/PlateState.js";
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sessionCodeFromShare } from "@wherever/shared";

/** Manifest share-target entry. Accept only invite URLs recognized by sessionCodeFromShare. */
export default function Share() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code =
    sessionCodeFromShare(params.get("url") ?? "") || sessionCodeFromShare(params.get("text") ?? "");
  const joinable = code !== "";

  useEffect(() => {
    if (joinable) navigate(`/s/${code}`, { replace: true });
  }, [joinable, code, navigate]);

  if (joinable) return null;

  return (
    <main id="main-content" tabIndex={-1} className="table-room grid place-items-center text-center">
      <div className="table-panel max-w-sm">
        <PlateState />
        <h1 className="font-display text-state font-bold">That wasn’t a room link.</h1>
        <p className="mt-3 text-muted">Open a Wherever room link, or create a room below.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-ember px-6 py-3 font-semibold text-ink transition hover:brightness-110"
        >
          Create a room
        </Link>
      </div>
    </main>
  );
}
