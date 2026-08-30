/*
 * The one or two letters an avatar circle shows for somebody.
 *
 * There were two copies of this, already drifted apart -- one fell back to "?" for an empty name and
 * the other rendered an empty circle -- and neither returned initials. Both took the first two
 * characters of the whole string, so "Aiden Jang" came out as "AI" rather than "AJ".
 */

/** First user-perceived character, so an emoji or an accented letter is not cut in half. */
function firstGrapheme(word: string): string {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } })
    .Segmenter;
  if (Seg) {
    for (const { segment } of new Seg(undefined, { granularity: "grapheme" }).segment(word)) return segment;
    return "";
  }
  // Array.from splits by code point, which still keeps a surrogate pair whole.
  return Array.from(word)[0] ?? "";
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    // One name: two letters fill the circle better than one, which is what both old copies did.
    const letters = Array.from(firstGrapheme(words[0]!) + (Array.from(words[0]!)[1] ?? ""));
    return letters.join("").toUpperCase();
  }
  return (firstGrapheme(words[0]!) + firstGrapheme(words[1]!)).toUpperCase();
}
