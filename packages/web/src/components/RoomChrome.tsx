import type { DemoReason, Participant } from "@wherever/shared";
import { DemoBanner } from "./LobbyStatus.js";
import { FloatingReactions } from "./Reactions.js";
import { LiveRegion } from "./LiveRegion.js";
import { Toasts, type Toast } from "./toasts.js";

/* The demo banner belongs here rather than on the swiping screen alone: the decided screen is the
   one offering directions and a phone number for a restaurant that does not exist. */
export function RoomChrome({
  announcement,
  toasts,
  reactions,
  roster,
  demo,
}: {
  announcement: string;
  toasts: Toast[];
  reactions: Parameters<typeof FloatingReactions>[0]["reactions"];
  roster: Participant[];
  demo: DemoReason | null;
}) {
  return (
    <>
      <LiveRegion message={announcement} />
      <Toasts toasts={toasts} />
      <FloatingReactions reactions={reactions} roster={roster.map((p) => p.id)} />
      {demo && <DemoBanner reason={demo} />}
    </>
  );
}
