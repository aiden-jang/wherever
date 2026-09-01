/*
 * UI sound, synthesized rather than sampled: a dozen oscillator envelopes are a few hundred bytes
 * where the same palette as audio files would be a few hundred kilobytes to serve and wait for.
 *
 * Every cue comes from a C major pentatonic scale, which has no semitones in it. Cues overlap here - a
 * match lands while somebody is mid-swipe - and a scale with no minor seconds cannot clash whatever
 * combination happens to sound at once.
 */

const MUTE_KEY = "wherever.muted.v1";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Returns the new state. Unmuting plays a short confirmation so the toggle proves itself. */
export function toggleMuted(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode; the setting just won't survive a reload */
  }
  if (!muted) play("unmute");
  return muted;
}

/*
 * Built on first use, never at import: browsers refuse to start an AudioContext outside a user
 * gesture. Every cue is a tap, a swipe or a key, except the match fanfare - and by then the context
 * exists because you voted to get there. Somebody who joins and never swipes hears nothing, which
 * beats holding an audio graph open on every page load.
 */
function graph(): { ctx: AudioContext; master: GainNode } | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return master ? { ctx, master } : null;
}

/*
 * The first gesture anywhere builds the graph. Cues that arrive over the socket are not gestures, and
 * iOS only resumes an AudioContext inside one - so without this the first socket cue is dropped
 * silently and sound seems broken until you happen to swipe.
 */
export function primeOnFirstGesture(): void {
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  const prime = () => {
    for (const e of events) window.removeEventListener(e, prime);
    graph();
  };
  for (const e of events) window.addEventListener(e, prime, { passive: true });
}

/** Semitones from A440, so cue definitions read as intervals rather than magic frequencies. */
function hz(semitones: number): number {
  return 440 * Math.pow(2, semitones / 12);
}

const G4 = hz(-2);
const C5 = hz(3);
const D5 = hz(5);
const E5 = hz(7);
const G5 = hz(10);
const A5 = hz(12);
const C6 = hz(15);
const E6 = hz(19);
const G6 = hz(22);

type Voice = {
  freq: number;
  /** Seconds after the cue starts. */
  at?: number;
  dur?: number;
  gain?: number;
  /** Slide to this frequency across the note. A rise reads as yes, a fall as no. */
  glide?: number;
  type?: OscillatorType;
};

/*
 * Triangle by default: it has enough harmonics to carry through a noisy room without the buzz of a
 * square, which is what makes cheap web audio sound like a toy.
 */
const CUES: Record<string, Voice[]> = {
  // Three cards off the top of the deck: short, dry, and low enough not to compete with a vote.
  deal: [
    { freq: G4, dur: 0.05, gain: 0.07, type: "sine" },
    { freq: C5, at: 0.09, dur: 0.05, gain: 0.07, type: "sine" },
    { freq: D5, at: 0.18, dur: 0.06, gain: 0.08, type: "sine" },
  ],
  like: [{ freq: G5, glide: A5, dur: 0.09, gain: 0.16 }],
  pass: [{ freq: E5, glide: C5, dur: 0.1, gain: 0.1, type: "sine" }],
  superLike: [
    { freq: C6, dur: 0.07, gain: 0.13 },
    { freq: E6, at: 0.05, dur: 0.07, gain: 0.13 },
    { freq: G6, at: 0.1, dur: 0.14, gain: 0.15 },
  ],
  veto: [
    { freq: D5, dur: 0.13, gain: 0.15, type: "sawtooth" },
    { freq: G4, at: 0.1, dur: 0.22, gain: 0.12, type: "sawtooth" },
  ],
  match: [
    { freq: C5, dur: 0.14, gain: 0.14 },
    { freq: E5, at: 0.08, dur: 0.14, gain: 0.14 },
    { freq: G5, at: 0.16, dur: 0.16, gain: 0.14 },
    { freq: C6, at: 0.24, dur: 0.5, gain: 0.16 },
    // Held underneath the arpeggio so the chord rings out instead of stopping dead.
    { freq: E6, at: 0.24, dur: 0.6, gain: 0.07, type: "sine" },
    { freq: G5, at: 0.32, dur: 0.6, gain: 0.06, type: "sine" },
  ],
  join: [
    { freq: C5, dur: 0.07, gain: 0.09, type: "sine" },
    { freq: G5, at: 0.06, dur: 0.12, gain: 0.09, type: "sine" },
  ],
  tap: [{ freq: A5, dur: 0.045, gain: 0.09, type: "sine" }],
  unmute: [
    { freq: G5, dur: 0.06, gain: 0.11 },
    { freq: C6, at: 0.05, dur: 0.12, gain: 0.11 },
  ],
};

export type Cue = keyof typeof CUES;

/*
 * Held down arrow keys auto-repeat, and a fast swiper outruns the card animation. Retriggering the
 * same cue inside this window stacks identical oscillators into a buzz, so the repeat is dropped
 * rather than layered.
 */
const MIN_GAP_SECONDS = 0.05;
const lastPlayed = new Map<string, number>();

/*
 * Book notes slightly ahead of `currentTime`, never at it. The audio thread has already rendered up
 * to there, so a note booked for exactly now lands in the past and the hardware skips what it missed.
 * That does not silence the cue - it eats the attack and leaves the tail, which is why it is easy to
 * miss. 20ms is under the threshold where a delay is audible and clears one render quantum.
 */
const LOOKAHEAD_SECONDS = 0.02;

export function play(cue: Cue): void {
  const g = graph();
  if (!g) return;
  const voices = CUES[cue];
  if (!voices) return;

  const now = g.ctx.currentTime + LOOKAHEAD_SECONDS;
  if (now - (lastPlayed.get(cue) ?? -Infinity) < MIN_GAP_SECONDS) return;
  lastPlayed.set(cue, now);

  for (const v of voices) {
    const start = now + (v.at ?? 0);
    const dur = v.dur ?? 0.1;
    const peak = v.gain ?? 0.12;

    const osc = g.ctx.createOscillator();
    osc.type = v.type ?? "triangle";
    osc.frequency.setValueAtTime(v.freq, start);
    if (v.glide) osc.frequency.exponentialRampToValueAtTime(v.glide, start + dur);

    // A 6ms fade in and an exponential tail. Starting or ending a note at full amplitude puts a
    // step in the waveform, which the speaker reproduces as an audible click over the note itself.
    const env = g.ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(env);
    env.connect(g.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}
