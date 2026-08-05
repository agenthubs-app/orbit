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
