// Shared browser/Worker contract. Dynamic path segments never enter an event.
export const APP = "wherever";
export const HOST = "wherever.aidenjang.com";
export const PAGES = ["landing", "other", "session", "share"] as const;
export const ACTIONS = [] as const;
export type Page = (typeof PAGES)[number];
export type AnalyticsEvent = { name: "page_view"; page: Page } | { name: (typeof ACTIONS)[number] };
const exact: Record<string, Page> = { "/": "landing", "/share": "share" };
const prefixes: readonly (readonly [string, Page])[] = [["/s/", "session"]];
export function pageForPath(pathname: string): Page {
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (Object.prototype.hasOwnProperty.call(exact, path)) return exact[path]!;
  return prefixes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "other";
}
export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  if (event.name === "page_view")
    return (
      keys.length === 2 &&
      keys.includes("page") &&
      typeof event.page === "string" &&
      (PAGES as readonly string[]).includes(event.page)
    );
  return (
    keys.length === 1 && typeof event.name === "string" && (ACTIONS as readonly string[]).includes(event.name)
  );
}

// Confirmed server operations cannot be fabricated through the anonymous browser endpoint.
export const BROWSER_ACTIONS: readonly string[] = ACTIONS;
export function isBrowserAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isAnalyticsEvent(value)) return false;
  const name = value.name;
  return name === "page_view" || BROWSER_ACTIONS.includes(name);
}
