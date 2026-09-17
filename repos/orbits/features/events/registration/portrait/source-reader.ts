import { createHash } from "node:crypto";
import { canAccessEventCapability } from "../../event-access/capability-policy";
import { questionSetHash } from "../../experience/validation";
import type { EventExperienceConfiguration } from "../../experience/contract";
import type { EventParticipantProfile } from "../contract";
import { PortraitError, type PortraitSnapshotReader } from "./contract";

export const readPortraitSnapshot: PortraitSnapshotReader = async (transaction, input) => {
  const event = await transaction.query<{ organizer_actor_id: string; updated_at: Date | string; event_version: number | string }>(
    "select organizer_actor_id, updated_at,event_version from event_ops_events where workspace_id=$1 and event_id=$2 and lifecycle_state_v2 in ('published','cancelled','archived')",
    [input.workspaceId, input.eventId],
  );
  if (event.rows.length !== 1) {
    if (event.rows.length > 1) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The event source is ambiguous.");
    return { eventExists: false, access: { owner: false, role: null, state: null }, sourceRegistrationVersion: null, registrationProfile: null };
  }
  const role = await transaction.query<{ role: string; state: string; revision: number | string }>(
    "select revision,role,state from event_ops_event_role_assignment_heads where workspace_id=$1 and event_id=$2 and subject_actor_id=$3",
    [input.workspaceId, input.eventId, input.actorId],
  );
  if (role.rows.length > 1) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The role source is ambiguous.");
  const access = { owner: event.rows[0].organizer_actor_id === input.actorId, role: role.rows[0]?.role ?? null, state: role.rows[0]?.state ?? null };
  if (input.actorId !== input.subjectId && !canAccessEventCapability({ ...access, capability: "operations.read_sensitive" })) throw new PortraitError(403, "PORTRAIT_FORBIDDEN", "Current sensitive event access is required.");
  const source = await transaction.query<{ updated_at: Date | string; membership_version: number | string; profile_version: number | string; participant_id: string; profile_payload: unknown }>(
    `select membership.updated_at, membership.membership_version, membership.profile_version, membership.participant_id, profile.profile_payload
     from event_ops_membership_heads membership
     left join event_ops_profile_versions profile on profile.workspace_id=membership.workspace_id and profile.event_id=membership.event_id and profile.participant_id=membership.participant_id and profile.profile_version=membership.profile_version
     where membership.workspace_id=$1 and membership.event_id=$2 and membership.actor_id=$3`,
    [input.workspaceId, input.eventId, input.subjectId],
  );
  if (source.rows.length > 1) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The registration source is ambiguous.");
  let registrationProfile: EventParticipantProfile | null = null;
  let sourceRegistrationFingerprint: string | null = null;
  const row = source.rows[0];
  if (row) {
    const membershipVersion = String(row.membership_version);
    const profileVersion = String(row.profile_version);
    if (!/^[1-9][0-9]*$/.test(membershipVersion) || !/^[1-9][0-9]*$/.test(profileVersion) || !row.participant_id) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The canonical registration versions are invalid.");
    sourceRegistrationFingerprint = createHash("sha256").update(JSON.stringify([input.workspaceId, input.eventId, input.subjectId, row.participant_id, membershipVersion, profileVersion])).digest("hex");
    const payload = typeof row.profile_payload === "string" ? JSON.parse(row.profile_payload) : row.profile_payload;
    const profile = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).registrationProfile : null;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The registration profile source is invalid.");
    const value = profile as EventParticipantProfile;
    if (value.eventId !== input.eventId || value.userId !== input.subjectId || !value.answers || typeof value.answers !== "object" || Array.isArray(value.answers)) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The registration profile belongs to another scope.");
    registrationProfile = structuredClone(value);
  }
  const sourceRegistrationVersion = row ? new Date(row.updated_at).toISOString() : null;
  const eventSourceVersion = new Date(event.rows[0].updated_at).toISOString();
  const eventVersion = Number(event.rows[0].event_version);
  if (!Number.isSafeInteger(eventVersion) || eventVersion < 1) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The canonical event version is invalid.");
  const published = await transaction.query<{ published_version: number | string | null; configuration: unknown }>(
    `select head.published_version,version.configuration from event_ops_experience_heads head
     left join event_ops_experience_versions version on version.workspace_id=head.workspace_id and version.event_id=head.event_id and version.experience_version=head.published_version
     where head.workspace_id=$1 and head.event_id=$2`, [input.workspaceId, input.eventId],
  );
  if (published.rows.length > 1) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The published question source is ambiguous.");
  let publishedHash: string | null = null;
  let publishedVersion: number | null = null;
  const current = published.rows[0];
  if (current?.published_version !== null && current?.published_version !== undefined) {
    publishedVersion = Number(current.published_version);
    const configuration = typeof current.configuration === "string" ? JSON.parse(current.configuration) : current.configuration;
    if (!Number.isSafeInteger(publishedVersion) || publishedVersion < 1 || !configuration || typeof configuration !== "object" || Array.isArray(configuration) || !(configuration as EventExperienceConfiguration).questionSet) throw new PortraitError(503, "PORTRAIT_SOURCE_INVALID", "The published question source is invalid.");
    publishedHash = questionSetHash((configuration as EventExperienceConfiguration).questionSet);
  }
  return { eventExists: true, access, sourceRegistrationVersion, sourceRegistrationFingerprint, registrationProfile, eventSourceVersion, eventVersion, questionSetHash: publishedHash, questionSetVersion: publishedVersion };
};
