/**
 * Resolve the contact behind Orbit's generated relationship connection ids.
 *
 * Live relationship fixtures and stores use `connection_for_<contactId>` as a
 * stable foreign-key identity. Keeping this translation in one shared helper
 * prevents UI adapters from guessing contact ids from display names.
 */
export function contactIdFromConnectionIdentity(
  connectionId: string,
): string | null {
  const normalizedId = connectionId.trim();
  const prefix = "connection_for_";

  if (!normalizedId.startsWith(prefix)) {
    return null;
  }

  const contactId = normalizedId.slice(prefix.length);

  return /^contact(?:_|:|-)[\p{L}\p{N}][\p{L}\p{N}_:-]*$/u.test(contactId)
    ? contactId
    : null;
}
