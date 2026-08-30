/*
 * Break a line of text to a width, for the share card's canvas.
 *
 * Pure, and here rather than beside the canvas code, so it can be tested without a browser: it takes
 * a measuring function instead of a 2D context. The card is a 1080px image people post, so text that
 * runs off the edge or stops mid-name is not a cosmetic problem.
 */

export interface WrapOptions {
  /** Lines past this are dropped and the last one gets an ellipsis. */
  maxLines?: number;
}

export function wrapToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  { maxLines = 3 }: WrapOptions = {},
): string[] {
  if (maxWidth <= 0 || maxLines <= 0) return [];
  const lines: string[] = [];
  let line = "";

  /* A word wider than the whole line never fits, so break it by character. Without this the old
     wrapper kept it as one line and the canvas drew it straight off both edges. */
  const pieces: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (measure(word) <= maxWidth) {
      pieces.push(word);
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > maxWidth) {
        pieces.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) pieces.push(chunk);
  }

  for (const piece of pieces) {
    const next = line ? `${line} ${piece}` : piece;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = piece;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;

  /* Truncating in silence is the worst option here: the card is shared, and a name cut mid-word
     reads as the whole name of a different restaurant. */
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]!}…`;
  while (last.length > 1 && measure(last) > maxWidth) last = `${last.slice(0, -2)}…`;
  kept[maxLines - 1] = last;
  return kept;
}
