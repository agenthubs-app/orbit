// Only the published Web participant link and its native equivalent are supported.
// No arbitrary query is reinterpreted as a participant or an actor identity.
export function eventParticipantHref(value: unknown): string | null {
  if (typeof value !== "string" || /[\\\s]/u.test(value)) return null;
  const path = value.startsWith("orbit://") ? `/${value.slice(8)}` : value;
  const web = /^\/(?:app\/)?events\/([^/?#]+)\?participant=([^&#]+)#event-matchmaking-title$/u.exec(path);
  const native = /^\/events\/([^/?#]+)\/participants\/([^/?#]+)$/u.exec(path);
  const match = web ?? native;
  if (!match) return null;
  try {
    const ids = [decodeURIComponent(match[1]!), decodeURIComponent(match[2]!)];
    if (ids.some(id => !id || id === "." || id === ".." || /[\\/?#%\s\u0000-\u001f\u007f]/u.test(id))) return null;
    if (ids[0] === "center") return null;
    return `/events/${encodeURIComponent(ids[0]!)}/participants/${encodeURIComponent(ids[1]!)}`;
  } catch { return null; }
}
