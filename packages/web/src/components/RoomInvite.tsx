import { useState } from "react";
import { useShareAction } from "../useShareAction.js";
import { JoinQr } from "./JoinQr.js";
import { CopyFallback } from "./CopyFallback.js";
export function RoomInvite({ code }: { code: string }) {
  const [lastAction, setLastAction] = useState<"code" | "link" | "share">("link");
  const { status: inviteStatus, share } = useShareAction(code);
  const copyCode = () => {
    setLastAction("code");
    void share({ text: code }, false);
  };
  const invite = new URL(`/s/${code}`, location.origin).href;
  const copyInviteLink = () => {
    setLastAction("link");
    void share({ url: invite }, false);
  };
  const shareInvite = () => {
    setLastAction("share");
    void share({ title: "Wherever, Honestly", text: "Come help pick where we're eating.", url: invite });
  };
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
          disabled={inviteStatus === "sharing"}
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
              ? lastAction === "code"
                ? "Room code copied."
                : "Link copied."
              : ""}
      </p>
      {inviteStatus === "failed" &&
        (lastAction === "code" ? (
          <CopyFallback label="Session code to copy" text={code} />
        ) : (
          <CopyFallback label="Invite link to copy" text={invite} />
        ))}
      <JoinQr code={code} url={invite} />
    </section>
  );
}
