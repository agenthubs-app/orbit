import type {
  OfflinePolicy,
  OfflinePolicyRegistration,
} from "../contract/offline-policy";

const policy = (
  domainId: string,
  readPersistence: OfflinePolicy["readPersistence"],
  mutationPolicy: OfflinePolicy["mutationPolicy"],
  binaryPolicy: OfflinePolicy["binaryPolicy"] = "metadata_only",
): OfflinePolicy => ({
  domainId,
  schemaVersion: 1,
  registryVersion: 1,
  readPersistence,
  mutationPolicy,
  binaryPolicy,
});

export const OFFLINE_POLICY_REGISTRATIONS = [
  { method: "GET", pathname: "/api/notes", action: "read", policy: policy("note", "durable_normalized", "online_only") },
  { method: "GET", pathname: "/api/notes/:id", action: "read", policy: policy("note", "durable_normalized", "online_only") },
  { method: "POST", pathname: "/api/notes", action: "create", policy: policy("note", "durable_normalized", "offline_queue") },
  { method: "PATCH", pathname: "/api/notes/:id", action: "update", policy: policy("note", "durable_normalized", "offline_queue") },
  { method: "DELETE", pathname: "/api/notes/:id", action: "delete", policy: policy("note", "durable_normalized", "offline_queue") },
  { method: "GET", pathname: "/api/tasks", action: "read", policy: policy("task", "durable_normalized", "online_only") },
  { method: "GET", pathname: "/api/tasks/:id", action: "read", policy: policy("task", "durable_normalized", "online_only") },
  { method: "POST", pathname: "/api/tasks", action: "create", policy: policy("task", "durable_normalized", "offline_queue") },
  ...["update", "complete", "reopen", "cancel", "delete"].map((action) => ({
    method: action === "delete" ? "DELETE" : "PATCH",
    pathname: "/api/tasks/:id",
    action,
    policy: policy("task", "durable_normalized", "offline_queue"),
  })),
  ...["update", "complete", "reopen", "cancel", "delete"].map((action) => ({
    method: action === "delete" ? "DELETE" : "PATCH",
    pathname: "/api/tasks/:id",
    action: `relationship_followup.${action}`,
    policy: policy("relationship_followup", "durable_normalized", "offline_queue"),
  })),
  { method: "GET", pathname: "/api/schedule-items", action: "read", policy: policy("personal_schedule", "durable_normalized", "online_only") },
  { method: "GET", pathname: "/api/schedule-items/:id", action: "read", policy: policy("personal_schedule", "durable_normalized", "online_only") },
  { method: "POST", pathname: "/api/schedule-items", action: "create", policy: policy("personal_schedule", "durable_normalized", "offline_queue") },
  { method: "PATCH", pathname: "/api/schedule-items/:id", action: "update", policy: policy("personal_schedule", "durable_normalized", "offline_queue") },
  { method: "DELETE", pathname: "/api/schedule-items/:id", action: "delete", policy: policy("personal_schedule", "durable_normalized", "offline_queue") },
  { method: "GET", pathname: "/api/relationship-communication/conversations/:id/messages", action: "read", policy: policy("message", "durable_normalized", "online_only") },
  { method: "GET", pathname: "/api/events/public", action: "read", policy: policy("public_event", "encrypted_ttl_snapshot", "online_only", "on_demand_encrypted") },
  { method: "POST", pathname: "/api/auth/mobile/credentials", action: "authenticate", policy: policy("account_secret", "online_only_secret", "online_only", "never_local") },
] satisfies readonly OfflinePolicyRegistration[];

function matchesPath(template: string, pathname: string): boolean {
  const expected = template.split("/");
  const actual = pathname.split("/");
  return expected.length === actual.length && expected.every((part, index) =>
    part.startsWith(":") ? Boolean(actual[index]) : part === actual[index]);
}

export class OfflineDataPolicyRegistry {
  constructor(
    private readonly registrations: readonly OfflinePolicyRegistration[],
  ) {}

  resolve(method: string, pathname: string, action: string): OfflinePolicy {
    if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("?")) {
      throw new Error("policy-not-registered");
    }
    const registration = this.registrations.find((entry) =>
      entry.method === method && entry.action === action && matchesPath(entry.pathname, pathname));
    if (!registration) throw new Error("policy-not-registered");
    return registration.policy;
  }
}
