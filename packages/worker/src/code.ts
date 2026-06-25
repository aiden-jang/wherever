// Session codes are short enough to read aloud but drawn from a CSPRNG over an
// unambiguous alphabet (no 0/O/1/I/L), so they are not guessable or
// enumerable. 6 chars over a 30-symbol alphabet is ~2.4 billion combinations.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateSessionCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}
