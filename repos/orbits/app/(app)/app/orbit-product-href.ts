// Shared (server + client) mapping from prototype hrefs to product routes.
// Keep this module free of "use client" so Server Components can call it.
export function productHref(prototypeHref: string) {
  if (
    prototypeHref === "/app" ||
    prototypeHref.startsWith("/app/") ||
    prototypeHref.startsWith("/app?")
  ) return prototypeHref;
  if (prototypeHref === "/") return "/";
  if (prototypeHref === "/explore") return "/app/events";
  if (prototypeHref === "/agent") return "/app/agent";
  if (prototypeHref.startsWith("/agent?")) return `/app/agent?${prototypeHref.split("?")[1]}`;
  if (prototypeHref === "/home") return "/app/account/login";
  if (prototypeHref === "/home/events") return "/app/home/events";
  if (prototypeHref === "/home/profile") return "/app/profile";
  if (prototypeHref === "/home/schedule") return "/app/followups";
  if (prototypeHref === "/home/cards") return "/app/contacts";
  if (prototypeHref === "/home/cards/scan") return "/app/contacts/new";
  if (prototypeHref.startsWith("/home/cards/")) return `/app/contacts/${prototypeHref.split("/").pop()}`;
  if (prototypeHref === "/party") return "/app/party";
  if (prototypeHref.startsWith("/events/")) return `/app/events/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/o/")) return `/app/o/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/register")) return `/app/register${prototypeHref.includes("?") ? `?${prototypeHref.split("?")[1]}` : ""}`;
  return `/app${prototypeHref}`;
}

export type OrbitPartySubroute = "" | "/checkin" | "/graph";

/**
 * Builds every Party URL from the same source event identity.
 *
 * Party, check-in, and graph are separate routes, but they are one workspace.
 * Keeping eventId in one shared helper prevents a route transition from falling
 * back to an unrelated demo/default event.
 */
export function partyHrefForEvent(
  eventId: string,
  subroute: OrbitPartySubroute = "",
): string {
  const normalizedEventId = eventId.trim();
  const pathname = `/app/party${subroute}`;

  if (!normalizedEventId) {
    return pathname;
  }

  return `${pathname}?eventId=${encodeURIComponent(normalizedEventId)}`;
}
