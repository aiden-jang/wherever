/** Preserve identity across reconnects. Blocked storage falls back to memory so joining still works. */
const fallbackClientIds = new Map<string, string>();

export function clientIdFor(code: string): string {
  const key = `cid:${code.toUpperCase()}`;
  try {
    let id = sessionStorage.getItem(key) ?? fallbackClientIds.get(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    let id = fallbackClientIds.get(key);
    if (!id) {
      id = crypto.randomUUID();
      fallbackClientIds.set(key, id);
    }
    return id;
  }
}

export function rememberClientId(code: string, id: string): void {
  const key = `cid:${code.toUpperCase()}`;
  try {
    sessionStorage.setItem(key, id);
  } catch {
    fallbackClientIds.set(key, id);
  }
}
