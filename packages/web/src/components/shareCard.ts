import type { Restaurant } from "@wherever/shared";
import { distanceText, wrapToWidth } from "@wherever/shared";
import { priceLabel, styleFor } from "./cardStyle.js";

export interface WinnerCardDetails {
  rightSwipes: number;
  totalParticipants: number;
  reasons?: string[];
  planned?: { start: string; duration: number } | null;
  backup?: Restaurant;
}

/** Two hex stops out of a `linear-gradient(...)` string, for painting on canvas. */
function gradientStops(css: string): [string, string] {
  const hexes = css.match(/#[0-9a-f]{3,6}/gi);
  return [hexes?.[0] ?? "#ff5e2c", hexes?.[1] ?? "#ff2d78"];
}

/** Measured with whatever font is currently set on the context. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  return wrapToWidth(text, maxWidth, (s) => ctx.measureText(s).width, { maxLines });
}

/**
 * Render a square, branded share image of the winning restaurant to a PNG blob. Drawn on a
 * canvas (no dependency) so it can be shared as a file or downloaded. Returns null if the
 * canvas 2D context is unavailable.
 */
export async function renderShareCard(r: Restaurant, details?: WinnerCardDetails): Promise<Blob | null> {
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Web fonts may not be ready for canvas on first paint; wait, but don't hang forever.
  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 400))]);
  }

  const [c1, c2] = gradientStops(styleFor(r.category).gradient);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // Dark scrim at the bottom for legible text over the gradient.
  const scrim = ctx.createLinearGradient(0, S * 0.4, 0, S);
  scrim.addColorStop(0, "rgba(12,10,9,0)");
  scrim.addColorStop(1, "rgba(12,10,9,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, S, S);

  ctx.textAlign = "center";

  // Eyebrow + the piece of evidence that makes this a group decision rather than a recommendation.
  ctx.fillStyle = "#d7ff3e";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText("DINNER IS DECIDED", S / 2, 105);
  if (details) {
    ctx.fillStyle = "rgba(12,10,9,0.55)";
    ctx.beginPath();
    ctx.roundRect(S / 2 - 150, 132, 300, 64, 32);
    ctx.fill();
    ctx.fillStyle = "#f6f1e7";
    ctx.font = "700 28px Inter, sans-serif";
    ctx.fillText(`${details.rightSwipes} of ${details.totalParticipants} picked it`, S / 2, 173);
  }

  // Big category emoji.
  ctx.font = "180px sans-serif";
  ctx.fillText(styleFor(r.category).emoji, S / 2, 410);

  // A glassy receipt panel keeps the useful details legible without flattening the category color.
  ctx.fillStyle = "rgba(12,10,9,0.42)";
  ctx.beginPath();
  ctx.roundRect(54, 485, S - 108, 500, 44);
  ctx.fill();

  // Restaurant name (wrapped, up to 2 lines so the actual plan still fits below it).
  ctx.fillStyle = "#f6f1e7";
  ctx.font = "800 76px 'Bricolage Grotesque', Inter, sans-serif";
  const lines = wrap(ctx, r.name, S - 170, 2);
  let y = 570;
  for (const line of lines) {
    ctx.fillText(line, S / 2, y);
    y += 75;
  }

  // Meta row.
  const meta = [
    r.category,
    r.rating ? `★ ${r.rating}` : "new",
    priceLabel(r.priceTier),
    // The same estimate the winner screen shows, so the picture and the page agree.
    distanceText(r.distanceMeters),
  ].join("   ·   ");
  ctx.fillStyle = "#a8a097";
  ctx.font = "500 32px Inter, sans-serif";
  // maxWidth, so a long category squeezes instead of running off both edges of a shared image.
  ctx.fillText(meta, S / 2, y + 5, S - 120);
  y += 55;

  if (details?.reasons?.length) {
    ctx.fillStyle = "#d7ff3e";
    ctx.font = "700 25px Inter, sans-serif";
    ctx.fillText("WHY IT WON", S / 2, y);
    y += 34;
    ctx.fillStyle = "#f6f1e7";
    ctx.font = "500 29px Inter, sans-serif";
    for (const line of wrap(ctx, details.reasons.slice(0, 3).join("  ·  "), S - 180, 2)) {
      ctx.fillText(line, S / 2, y);
      y += 34;
    }
  }

  if (details?.planned) {
    const when = new Date(details.planned.start).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    ctx.fillStyle = "#f6f1e7";
    ctx.font = "700 29px Inter, sans-serif";
    ctx.fillText(`MEET THERE  ${when}  ·  ${details.planned.duration} min`, S / 2, y + 8);
    y += 44;
  }

  if (details?.backup) {
    ctx.fillStyle = "#a8a097";
    ctx.font = "500 27px Inter, sans-serif";
    ctx.fillText(`Plan B  ·  ${details.backup.name}`, S / 2, Math.min(y + 4, 958), S - 170);
  }

  // A quieter signature: the card is the dinner plan first and product artifact second.
  ctx.fillStyle = "#f6f1e7";
  ctx.font = "800 40px 'Bricolage Grotesque', Inter, sans-serif";
  ctx.fillText("Wherever, Honestly", S / 2, S - 42);
  ctx.fillStyle = "#a8a097";
  ctx.font = "500 23px Inter, sans-serif";
  ctx.fillText("decided by swipe, not by group chat", S / 2, S - 12);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
