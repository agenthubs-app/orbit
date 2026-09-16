import { MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES } from "../shared/mock/event-organizer-fixtures";
import type { LiveRecord } from "../shared/storage/live-record-store";

function containsIdentity(value: unknown, id: string): boolean {
  if (value === id) return true;
  return !!value && typeof value === "object" &&
    Object.values(value).some((child) => containsIdentity(child, id));
}

/** Pure reviewed plan; the caller must read and apply in one transaction. */
export function buildDemoOrganizerProjection(input: {
  records: readonly LiveRecord[];
  workspaceId: string;
  now: string;
}): readonly LiveRecord[] {
  if (input.workspaceId !== "workspace:orbit-demo-fixtures" ||
      input.records.some((row) => row.workspaceId !== input.workspaceId)) {
    throw new Error("Organizer projection requires the exact demo workspace.");
  }
  const changes: LiveRecord[] = [];
  const required = (collectionName: string, recordId: string) => {
    const rows = input.records.filter(row => row.collectionName === collectionName && row.recordId === recordId);
    if (rows.length !== 1) throw new Error(`Missing or ambiguous ${collectionName}:${recordId}`);
    return rows[0]!;
  };
  const canonicalIds = new Set<string>();
  for (const fixture of MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES) {
    if (fixture.key === "xiaoyu") continue; // Never alter the existing Google identity.
    const users = input.records.filter(row => row.collectionName === "auth_users" &&
      row.lifecycleState === "active" && row.payload.email === fixture.email);
    if (users.length !== 1 || users[0]!.payload.provider !== "credentials" ||
        typeof users[0]!.payload.id !== "string") throw new Error(`Missing fixture login: ${fixture.key}`);
    const actorId = users[0]!.payload.id as string;
    if (actorId === fixture.accountId || canonicalIds.has(actorId)) throw new Error("Conflicting organizer login mapping.");
    canonicalIds.add(actorId);
    const account = required("accounts", actorId);
    const profile = required("profiles", `profile:${actorId}`);
    if (account.lifecycleState !== "active" || profile.lifecycleState !== "active" ||
        account.userId !== actorId || profile.userId !== actorId || profile.payload.accountId !== actorId) {
      throw new Error(`Canonical organizer ownership mismatch: ${fixture.key}`);
    }
    const organizer = required("organizers", fixture.organizerId);
    if (![fixture.accountId, actorId].includes(String(organizer.payload.accountId)) ||
        ![fixture.accountId, actorId].includes(String(organizer.userId))) throw new Error("Conflicting organizer projection owner.");
    const oldAccount = required("accounts", fixture.accountId);
    const oldProfile = required("profiles", `profile:${fixture.accountId}`);
    for (const row of [oldAccount, oldProfile]) {
      if (row.provider !== "generated-relationship-fixtures" || row.userId !== fixture.accountId) {
        throw new Error("Refusing to retire a non-fixture account/profile.");
      }
    }
    const allowed = new Set([organizer, oldAccount, oldProfile]);
    if (input.records.some(row => !allowed.has(row) && row.lifecycleState !== "deleted" &&
      (containsIdentity(row, fixture.accountId) || containsIdentity(row, oldProfile.recordId)))) {
      throw new Error(`Unresolved reference to duplicate organizer account: ${fixture.key}`);
    }
    const payload = { ...profile.payload };
    for (const key of ["role", "organization", "timezone"] as const) {
      if (payload[key] === undefined && oldProfile.payload[key] !== undefined) payload[key] = oldProfile.payload[key];
    }
    if (payload.handles === undefined && oldProfile.payload.handles !== undefined) payload.handles = oldProfile.payload.handles;
    if (JSON.stringify(payload) !== JSON.stringify(profile.payload)) {
      changes.push({ ...profile, payload: { ...payload, updatedAt: input.now }, updatedAt: input.now });
    }
    if (organizer.userId !== actorId || organizer.payload.accountId !== actorId) {
      changes.push({ ...organizer, userId: actorId, updatedAt: input.now,
        payload: { ...organizer.payload, accountId: actorId, updatedAt: input.now } });
    }
    for (const row of [oldAccount, oldProfile]) {
      if (row.lifecycleState !== "deleted") changes.push({ ...row, lifecycleState: "deleted",
        deletedAt: input.now, updatedAt: input.now,
        payload: { ...row.payload, supersededByAccountId: actorId } });
    }
  }
  return changes;
}
