import { hashString } from "../../../shared/utils/stable-hash";

const PUBLIC_ORGANIZER_FALLBACK = "Event organizer";

/**
 * Event Core currently stores an organizer actor id, but no public organizer
 * profile. Expose one opaque, stable label everywhere until that profile exists.
 * The actor id itself must never cross a public boundary.
 */
export function canonicalPublicOrganizerLabel(
  organizerActorId: string | null | undefined,
): string {
  const normalizedActorId = organizerActorId?.trim() ?? "";
  if (!normalizedActorId) return PUBLIC_ORGANIZER_FALLBACK;

  const fingerprint = hashString(normalizedActorId)
    .toString(36)
    .toLocaleUpperCase("en-US")
    .padStart(6, "0");

  return `Organizer #${fingerprint}`;
}

/** True when `name` is only the opaque fallback above (or empty): the organizer has no public name yet, so the UI shows a generic 「主催者」 instead of the hash. */
export function isCanonicalPublicOrganizerLabel(name: string | null | undefined): boolean {
  const normalized = name?.trim() ?? "";
  return normalized === "" || normalized === PUBLIC_ORGANIZER_FALLBACK || /^Organizer #[0-9A-Z]{6,}$/.test(normalized);
}
