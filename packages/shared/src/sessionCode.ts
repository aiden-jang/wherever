/*
 * One definition of what a session code is, because the worker mints them and the web parses them.
 *
 * No 0/O/1/I/L: the code gets read aloud across a table, and those are the pairs people get wrong.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/**
 * Pull a code out of whatever somebody pasted: the code itself, the whole invite link, or either
 * with the whitespace a copy picks up. A plain `maxLength` input turns the link into "HTTPS:".
 *
 * Not prose. "join with TM4ERX" is unrecoverable, because "join with" is alphabet letters too.
 */
export function sessionCodeFrom(raw: string): string {
  const afterPath = raw.split(/\/s\//i).pop() ?? raw;
  const kept = [...afterPath.toUpperCase()].filter((character) => CODE_ALPHABET.includes(character));
  return kept.slice(0, CODE_LENGTH).join("");
}

export function isCompleteCode(code: string): boolean {
  return code.length === CODE_LENGTH;
}

/** Accept shared invite URLs carrying /s/; arbitrary prose can otherwise resemble a join code. */
export function sessionCodeFromShare(shared: string): string {
  if (!/\/s\//i.test(shared)) return "";
  const code = sessionCodeFrom(shared);
  return isCompleteCode(code) ? code : "";
}
