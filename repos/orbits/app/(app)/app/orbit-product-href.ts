// Shared (server + client) mapping from prototype hrefs to product routes.
// Keep this module free of "use client" so Server Components can call it.
export function productHref(prototypeHref: string) {
  if (
    prototypeHref === "/app" ||
    prototypeHref.startsWith("/app/") ||
    prototypeHref.startsWith("/app?")
  )
    return prototypeHref;
  if (prototypeHref === "/") return "/";
  if (prototypeHref === "/explore") return "/app/events";
  if (prototypeHref === "/agent") return "/app/agent";
  if (prototypeHref.startsWith("/agent?"))
    return `/app/agent?${prototypeHref.split("?")[1]}`;
  if (prototypeHref === "/home") return "/app/account/login";
  if (prototypeHref === "/home/events") return "/app/home/events";
  if (prototypeHref === "/home/profile") return "/app/profile";
  // iOrbit 任务 6a：`/app/today` / `/app/schedule` / `/app/followups` 已随路由归并
  // 删除；原型里的日程/待办入口改落到取代它们的两条 iOrbit 兄弟屏。
  if (prototypeHref === "/home/schedule") return "/app/agent/plan";
  if (prototypeHref === "/today" || prototypeHref === "/schedule")
    return "/app/agent/plan";
  if (prototypeHref === "/followups") return "/app/agent/actions";
  if (prototypeHref === "/home/cards") return "/app/contacts";
  if (prototypeHref === "/home/cards/scan") return "/app/contacts/new";
  if (prototypeHref.startsWith("/home/cards/"))
    return `/app/contacts/${prototypeHref.split("/").pop()}`;
  if (prototypeHref === "/party") return "/app/events";
  if (prototypeHref.startsWith("/events/"))
    return `/app/events/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/o/"))
    return `/app/o/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/register"))
    return `/app/register${prototypeHref.includes("?") ? `?${prototypeHref.split("?")[1]}` : ""}`;
  return `/app${prototypeHref}`;
}

/**
 * Builds the canonical Agent entry URL for a user-authored goal.
 *
 * Every surface that hands work to Agent should use this helper so the prompt
 * is encoded once and the Agent's existing `q` hydration flow can execute it.
 */
export function agentHrefForPrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    return "/app/agent";
  }

  return `/app/agent?q=${encodeURIComponent(normalizedPrompt)}`;
}

/**
 * Builds the live-screen URL (`/app/events/<id>/live`) from one source event identity.
 *
 * The former `/app/party*` workspace (party / check-in / graph) was retired on
 * 2026-09-22 in favour of the Orbit_0918 live screen, whose six tabs live under
 * a single route (`?tab=`). Keeping the event id in one shared helper prevents a
 * route transition from falling back to an unrelated demo/default event; an
 * empty id lands on the events list instead of a bare live route.
 */
export function partyHrefForEvent(eventId: string): string {
  const normalizedEventId = eventId.trim();

  if (!normalizedEventId) {
    return "/app/events";
  }

  return `/app/events/${encodeURIComponent(normalizedEventId)}/live`;
}
