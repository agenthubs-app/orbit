export interface CanonicalAccountIdentity {
  accountId: string;
  actorId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalAccountIdentityFromPayload(
  payload: unknown
): CanonicalAccountIdentity | null {
  if (!isRecord(payload) || !isRecord(payload.account) || !isRecord(payload.session)) {
    return null;
  }

  const accountId = typeof payload.account.id === "string"
    ? payload.account.id.trim()
    : "";

  if (payload.session.status !== "signed-in" || !accountId) {
    return null;
  }

  return { accountId, actorId: accountId };
}
