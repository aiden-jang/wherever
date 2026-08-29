import { CODE_ALPHABET, CODE_LENGTH } from "@wherever/shared";

// Codes are short enough to read aloud but drawn from a CSPRNG, so they are not guessable or
// enumerable. 6 chars over a 31-symbol alphabet is ~9e8 combinations.
export function generateSessionCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}
