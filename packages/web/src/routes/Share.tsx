import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isCompleteCode, sessionCodeFrom } from "@wherever/shared";

/**
 * Where the OS drops a share aimed at the installed app.
 *
 * The manifest registers this as a `share_target`, so once the PWA is installed Wherever appears in
 * the phone's own share sheet. The case that matters: somebody posts an invite link in a group chat,
 * you long-press it, share it to Wherever, and land in the session. Without this the link opens a
 * browser tab beside the app you already installed.
 *
 * Only a link carrying `/s/` is treated as a code. `sessionCodeFrom` will happily pull six letters
 * out of any prose - its own comment says "join with TM4ERX" is unrecoverable, because "join with" is
 * alphabet letters too - so anything else lands on the home page rather than in a room chosen by
 * accident.
 */
export default function Share() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const shared = params.get("url") ?? params.get("text") ?? "";
  const code = /\/s\//i.test(shared) ? sessionCodeFrom(shared) : "";
  const joinable = isCompleteCode(code);

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
