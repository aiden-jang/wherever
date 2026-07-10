import type { Restaurant } from "@wherever/shared";
import { distanceLabel, priceLabel, styleFor } from "./cardStyle.js";

/** Two hex stops out of a `linear-gradient(...)` string, for painting on canvas. */
function gradientStops(css: string): [string, string] {
  const hexes = css.match(/#[0-9a-f]{3,6}/gi);
  return [hexes?.[0] ?? "#ff5e2c", hexes?.[1] ?? "#ff2d78"];
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/**
 * Render a square, branded share image of the winning restaurant to a PNG blob. Drawn on a
 * canvas (no dependency) so it can be shared as a file or downloaded. Returns null if the
 * canvas 2D context is unavailable.
 */
export async function renderShareCard(r: Restaurant): Promise<Blob | null> {
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

  // Eyebrow.
  ctx.fillStyle = "#d7ff3e";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText("IT'S DECIDED", S / 2, 150);

  // Big category emoji.
  ctx.font = "220px sans-serif";
  ctx.fillText(styleFor(r.category).emoji, S / 2, 470);

  // Restaurant name (wrapped, up to 3 lines).
  ctx.fillStyle = "#f6f1e7";
  ctx.font = "800 88px 'Bricolage Grotesque', Inter, sans-serif";
  const lines = wrap(ctx, r.name, S - 140);
  let y = 660;
  for (const line of lines) {
    ctx.fillText(line, S / 2, y);
    y += 100;
  }

  // Meta row.
  const meta = [
    r.category,
    r.rating ? `★ ${r.rating}` : "new",
    priceLabel(r.priceTier),
    distanceLabel(r.distanceMeters),
  ].join("   ·   ");
  ctx.fillStyle = "#a8a097";
  ctx.font = "500 40px Inter, sans-serif";
  ctx.fillText(meta, S / 2, y + 20);

  // Wordmark + tagline footer.
  ctx.fillStyle = "#f6f1e7";
  ctx.font = "800 52px 'Bricolage Grotesque', Inter, sans-serif";
  ctx.fillText("Wherever, Honestly", S / 2, S - 90);
  ctx.fillStyle = "#a8a097";
  ctx.font = "500 32px Inter, sans-serif";
  ctx.fillText("decided by swipe, not by group chat", S / 2, S - 44);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
