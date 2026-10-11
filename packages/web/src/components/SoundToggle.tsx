import { useState } from "react";
import { isMuted, toggleMuted } from "./sound.js";

/*
 * Sound is on by default, which is only defensible because the first noise the app can make is a
 * response to your own tap — browsers won't start an audio context any other way. The control still
 * lives in the header rather than a settings screen: this app gets opened at a table with other
 * people, and "make it stop" has to be one tap away from wherever you are.
 */
export function SoundToggle() {
  const [muted, setMuted] = useState(isMuted);

  return (
    <button
      type="button"
      onClick={() => setMuted(toggleMuted())}
      aria-pressed={muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off" : "Sound on"}
      className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-muted hover:text-cream hover:border-white/30 transition-colors"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {muted ? (
          <>
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a10 10 0 0 1 0 14" />
          </>
        )}
      </svg>
    </button>
  );
}
