export const PARTY_RETURN_PATHS = [
  "/app/party",
  "/app/party/checkin",
  "/app/party/graph",
] as const;

export type PartyReturnPath = (typeof PARTY_RETURN_PATHS)[number];

export interface PartyLoginSearchParams {
  eventId?: string | string[];
  tab?: string | string[];
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

/**
 * Builds a login URL from a fixed Party pathname and an explicit query
 * allow-list. URLSearchParams owns both encoding layers: attendee values are
 * encoded once inside the return path, then that complete path is encoded once
 * as the login page's `next` value. No caller-provided pathname is accepted.
 */
export function partyLoginHref(
  pathname: PartyReturnPath,
  searchParams?: PartyLoginSearchParams,
): string {
  if (!(PARTY_RETURN_PATHS as readonly string[]).includes(pathname)) {
    throw new Error("Unsupported Party return path.");
  }

  const returnUrl = new URL(pathname, "https://orbit.local");
  const eventId = firstSearchParam(searchParams?.eventId);
  const tab = firstSearchParam(searchParams?.tab);

  if (eventId) returnUrl.searchParams.set("eventId", eventId);
  if (tab) returnUrl.searchParams.set("tab", tab);

  const returnPath = `${returnUrl.pathname}${returnUrl.search}`;
  return `/app/account/login?${new URLSearchParams({ next: returnPath })}`;
}
