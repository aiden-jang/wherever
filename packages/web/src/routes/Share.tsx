import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sessionCodeFromShare } from "@wherever/shared";

/**
 * Where the OS drops a share aimed at the installed app.
 *
 * The manifest registers this as a `share_target`, so once the PWA is installed Wherever appears in
 * the phone's own share sheet. The case that matters: somebody posts an invite link in a group chat,
 * you long-press it, share it to Wherever, and land in the session. Without this the link opens a
 * browser tab beside the app you already installed.
 *
 * The rule about what counts as a code lives in `sessionCodeFromShare`, with the tests: the cost of
 * being loose here is dropping somebody into a stranger's dinner because they shared a review.
 */
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
