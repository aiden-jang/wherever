import type { ClientMessage, SessionFilters } from "@wherever/shared";
import { useShareAction } from "../useShareAction.js";
import { FilterSummary } from "./FilterSummary.js";
import { JoinQr } from "./JoinQr.js";
export function RoomInvite({
  code,
  filters,
  isHost,
  send,
}: {
  code: string;
  filters?: SessionFilters;
  isHost: boolean;
  send: (message: ClientMessage) => void;
}) {
  const { status: codeStatus, share: copy } = useShareAction(code);
  const { status: inviteStatus, share } = useShareAction(code);
  const copyCode = () => void copy({ text: code }, false);
  const copyInviteLink = () => share({ url: location.href }, false);
  const shareInvite = () =>
    share({ title: "Wherever, Honestly", text: "Come help pick where we're eating.", url: location.href });
  return (
    <div className="lobby-invite w-full text-center mt-4">
      <p className="text-sm text-muted">Share this code. Or the link. Whatever is less effort.</p>
      <button
        onClick={copyCode}
        aria-label="Copy the session code"
        className="mt-3 block w-full font-display session-code font-extrabold text-ember active:scale-95 transition"
      >
        {code}
      </button>
      <p className="mt-1 text-xs text-muted">
        {codeStatus === "copied"
          ? "Copied the code."
          : codeStatus === "failed"
            ? "Couldn’t copy it. Select the code instead."
            : "Tap the code to copy it"}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => void shareInvite()}
          disabled={inviteStatus !== null}
          aria-live="polite"
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/5 active:scale-95 transition disabled:cursor-default disabled:opacity-60"
        >
          {inviteStatus === "sharing"
            ? "Opening…"
            : inviteStatus === "shared"
              ? "Invite sent"
              : inviteStatus === "copied"
                ? "Link copied"
                : inviteStatus === "failed"
                  ? "Couldn’t copy link"
                  : "Invite the group"}
        </button>
        <button
          type="button"
          onClick={() => void copyInviteLink()}
          disabled={inviteStatus !== null}
          className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-muted hover:border-white/20 hover:text-cream transition disabled:cursor-default disabled:opacity-60"
        >
          Copy link
        </button>
      </div>
      <JoinQr code={code} url={location.href} />
      {/* The rules live here now, not in the create modal: the group can see them, and somebody is
            waiting for people to join anyway. Host-only to change, since they are one shared deck. */}
      {filters && (
        <FilterSummary
          filters={filters}
          editable={isHost}
          onChange={(filters) => send({ type: "set_filters", filters })}
        />
      )}
    </div>
  );
}
