import { describe, expect, it } from "vitest";
import { shouldOfferInstall, type InstallNudgeState } from "./installNudge.js";

const ready: InstallNudgeState = {
  browserOffered: true,
  installed: false,
  dismissed: false,
  decidedRounds: 1,
};

describe("asking somebody to install this", () => {
  it("asks once a round has actually decided something", () => {
    expect(shouldOfferInstall(ready)).toBe(true);
  });

  it("never asks before the app has done its one job", () => {
    // Nobody installs an app they have not used, and asking on arrival is the thing everybody hates.
    expect(shouldOfferInstall({ ...ready, decidedRounds: 0 })).toBe(false);
  });

  it("takes no for an answer", () => {
    expect(shouldOfferInstall({ ...ready, dismissed: true })).toBe(false);
  });

  it("does not ask somebody who already installed it", () => {
    expect(shouldOfferInstall({ ...ready, installed: true })).toBe(false);
  });

  it("stays quiet when the browser has no install to offer", () => {
    // Safari never fires the event. Walking people through a share-sheet menu they did not ask for
    // is worse than saying nothing, so this simply does not appear there.
    expect(shouldOfferInstall({ ...ready, browserOffered: false })).toBe(false);
  });

  it("needs every reason to line up, not just one", () => {
    const blockers: Partial<InstallNudgeState>[] = [
      { browserOffered: false },
      { installed: true },
      { dismissed: true },
      { decidedRounds: 0 },
    ];
    for (const blocker of blockers) {
      expect(shouldOfferInstall({ ...ready, ...blocker }), JSON.stringify(blocker)).toBe(false);
    }
  });
});
