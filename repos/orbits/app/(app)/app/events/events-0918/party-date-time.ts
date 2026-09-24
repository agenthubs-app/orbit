const TOKYO_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Event Operations currently runs in Tokyo. Rendering with UTC getters after
 * applying the fixed JST offset keeps the server and browser byte-identical;
 * locale-dependent Date formatting would otherwise force a hydration rebuild.
 */
export function formatOrbitPartyDateTime(value: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return "—";
  const tokyo = new Date(instant.getTime() + TOKYO_OFFSET_MILLISECONDS);
  return `${tokyo.getUTCFullYear()}/${twoDigits(tokyo.getUTCMonth() + 1)}/${twoDigits(tokyo.getUTCDate())} ${twoDigits(tokyo.getUTCHours())}:${twoDigits(tokyo.getUTCMinutes())}:${twoDigits(tokyo.getUTCSeconds())} JST`;
}
