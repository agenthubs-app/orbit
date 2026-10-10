// R08 (SC-R08-06): recognise the 「尚未実装」 answer the redesign contract routes
// give in live mode (503 SERVICE_UNAVAILABLE, context.reason NOT_IMPLEMENTED), and
// decide what a screen does about it: fall back to a default or hide the entry.
// Shared by the server and the App (synced to src/api/compute).

export const NOT_IMPLEMENTED_REASON = "NOT_IMPLEMENTED";

type ErrorLike = { code?: unknown; context?: unknown };

function errorOf(payload: unknown): ErrorLike | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { success?: unknown; error?: unknown; code?: unknown };
  // The failure envelope { success: false, error: { code, context } } …
  if (record.success === false && record.error && typeof record.error === "object") return record.error as ErrorLike;
  // … or an error object a client already unwrapped ({ code, context }).
  if (typeof record.code === "string") return record as ErrorLike;
  return null;
}

export function isNotImplemented(payload: unknown): boolean {
  const error = errorOf(payload);
  if (!error || error.code !== "SERVICE_UNAVAILABLE") return false;
  const context = error.context;
  return Boolean(context && typeof context === "object" && (context as { reason?: unknown }).reason === NOT_IMPLEMENTED_REASON);
}

export type NotImplementedPolicy<T> = { use: "default"; value: T } | { use: "hide" };
export type NotImplementedOutcome<T> = { show: true; value: T } | { show: false };

/** null when the payload is not a 「尚未実装」 answer (handle it as usual). */
export function whenNotImplemented<T>(payload: unknown, policy: NotImplementedPolicy<T>): NotImplementedOutcome<T> | null {
  if (!isNotImplemented(payload)) return null;
  return policy.use === "default" ? { show: true, value: policy.value } : { show: false };
}
