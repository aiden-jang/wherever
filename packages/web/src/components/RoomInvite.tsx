import { useShareAction } from "../useShareAction.js";
import { JoinQr } from "./JoinQr.js";
import { CopyFallback } from "./CopyFallback.js";
export function RoomInvite({ code }: { code: string }) {
  const { status: codeStatus, share: copy } = useShareAction(code);
  const { status: inviteStatus, share } = useShareAction(code);
  const copyCode = () => void copy({ text: code }, false);
  const invite = new URL(`/s/${code}`, location.origin).href;
  const copyInviteLink = () => share({ url: invite }, false);
  const shareInvite = () =>
    share({ title: "Wherever, Honestly", text: "Come help pick where we're eating.", url: invite });
  return (
    <section className="lobby-invite" aria-label="Invite to this room">
      <div className="lobby-code-row">
        <div>
          <h2 className="font-display text-lg font-bold">Room code</h2>
          <p className="text-xs text-muted">Tap the code to copy</p>
        </div>
        <button
          type="button"
          onClick={copyCode}
          aria-label={`Copy room code ${code}`}
          className="session-code"
          translate="no"
        >
          {code}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-2">
        <button
          type="button"
          onClick={() => void shareInvite()}
          disabled={inviteStatus === "sharing"}
          className="min-h-11 rounded-xl border border-white/20 px-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-60"
        >
          Invite the group
        </button>
        <button
          type="button"
          onClick={() => void copyInviteLink()}
          disabled={inviteStatus === "sharing"}
          className="min-h-11 rounded-xl px-2 text-sm font-medium text-muted hover:text-cream hover:underline disabled:opacity-60"
        >
          Copy link
        </button>
      </div>
      <p role="status" className="text-xs text-muted">
        {inviteStatus === "sharing"
          ? "Opening…"
          : inviteStatus === "shared"
            ? "Invite shared."
            : inviteStatus === "copied"
              ? "Link copied."
              : codeStatus === "copied"
                ? "Room code copied."
                : ""}
      </p>
      {codeStatus === "failed" && <CopyFallback label="Session code to copy" text={code} />}
      {inviteStatus === "failed" && <CopyFallback label="Invite link to copy" text={invite} />}
      <JoinQr code={code} url={invite} />
    </section>
  );
}
