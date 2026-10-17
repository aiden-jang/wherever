import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sessionCodeFromShare } from "@wherever/shared";

/** Manifest share-target entry. Accept only invite URLs recognized by sessionCodeFromShare. */
export default function Share() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = sessionCodeFromShare(params.get("url") ?? params.get("text") ?? "");
  const joinable = code !== "";

  useEffect(() => {
    if (joinable) navigate(`/s/${code}`, { replace: true });
  }, [joinable, code, navigate]);

  if (joinable) return null;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-glyph" aria-hidden="true">
        🤷
      </p>
      <h1 className="font-display text-state font-bold">That wasn’t a session link.</h1>
      <p className="text-muted">
        Wherever can open an invite you were sent. Anything else, start from the top.
      </p>
      <Link
        to="/"
        className="rounded-full bg-ember px-6 py-3 font-semibold text-ink transition hover:brightness-110"
      >
        Start a session
      </Link>
    </main>
  );
}
