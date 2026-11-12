import { cardsBehind, type BallotChoice, type Vote } from "@wherever/shared";
import { readDeck, readDemoMode } from "./deckSource.js";
import { sendTo } from "./roomSockets.js";
import { readRoundNumber, readVotes, socketIdentity, type SessionMeta } from "./roomState.js";
import type { RoomPlaces } from "./roomPlaces.js";
import { undoBlocked, type UndoState } from "./undoState.js";

export function ownBallot(votes: Vote[], participantId: string): BallotChoice[] {
  return votes
    .filter((vote) => vote.participantId === participantId)
    .map(({ restaurantId, direction, choiceId, super: superLike, veto }) => ({
      restaurantId,
      direction,
      ...(choiceId ? { choiceId } : {}),
      ...(superLike ? { super: true } : {}),
      ...(veto ? { veto: true } : {}),
    }));
}

async function currentRound(storage: DurableObjectStorage, roundId: number): Promise<boolean> {
  const meta = await storage.get<SessionMeta>("meta");
  return meta?.status === "swiping" && (await readRoundNumber(storage)) === roundId;
}

export async function sendResumedDeck(
  storage: DurableObjectStorage,
  places: RoomPlaces,
  ws: WebSocket,
  participantId: string,
  lazyPlaces: boolean,
): Promise<boolean> {
  const [deck, votes, roundId, demo, deadline, undo] = await Promise.all([
    readDeck(storage),
    readVotes(storage),
    readRoundNumber(storage),
    readDemoMode(storage),
    storage.get<number>("roundEndsAt"),
    storage.get<UndoState>("undoState"),
  ]);
  if (!(await currentRound(storage, roundId))) return false;
  const mine = ownBallot(votes, participantId);
  const alreadyVoted = mine.map((vote) => vote.restaurantId);
  const restaurants = deck.map((place) => places.forDeck(place));
  if (!lazyPlaces && restaurants.some((place) => place.detailsStatus && !alreadyVoted.includes(place.id))) {
    ws.close(1008, "Reload Wherever to continue this round.");
    return false;
  }
  const behindBy = cardsBehind(votes, participantId);
  sendTo(ws, {
    type: "deck",
    roundId,
    restaurants,
    alreadyVoted,
    ballot: mine,
    canUndo: mine.length > 0 && !undoBlocked(undo, roundId).includes(participantId),
    superUsed: mine.some((vote) => vote.super),
    vetoUsed: mine.some((vote) => vote.veto),
    ...(behindBy > 0 ? { behindBy } : {}),
    demo,
    roundEndsAt: deadline,
  });
  return true;
}

export async function sendRoundPlace(
  storage: DurableObjectStorage,
  places: RoomPlaces,
  ws: WebSocket,
  roundId: number,
  restaurantId: string,
): Promise<void> {
  const participantId = socketIdentity(ws)?.participantId;
  if (!participantId || !(await currentRound(storage, roundId))) return;
  const [meta, deck, votes] = await Promise.all([
    storage.get<SessionMeta>("meta"),
    readDeck(storage),
    readVotes(storage),
  ]);
  if (meta?.status !== "swiping") return;
  const voted = new Set(
    votes.filter((vote) => vote.participantId === participantId).map((vote) => vote.restaurantId),
  );
  const next = deck.find((place) => !voted.has(place.id));
  if (!next || next.id !== restaurantId) {
    await sendResumedDeck(storage, places, ws, participantId, true);
    return;
  }
  const restaurant = await places.show(next, meta.filters);
  if ((await currentRound(storage, roundId)) && ws.readyState === WebSocket.OPEN) {
    sendTo(ws, { type: "round_place", roundId, restaurant });
  }
}
