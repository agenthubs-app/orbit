export const ORBIT_INTEGRATION_PROVIDERS = [
  "google_calendar",
  "gmail",
  "microsoft_graph",
] as const;

export type OrbitIntegrationProvider =
  (typeof ORBIT_INTEGRATION_PROVIDERS)[number];

export const ORBIT_INTEGRATION_CAPABILITIES = [
  "calendar.read",
  "calendar.write",
  "mail.metadata.read",
] as const;

export type OrbitIntegrationCapability =
  (typeof ORBIT_INTEGRATION_CAPABILITIES)[number];

export type IntegrationHealthStatus =
  | "healthy"
  | "not_checked"
  | "action_required"
  | "degraded"
  | "unavailable";

export const ORBIT_INTEGRATION_SCOPES = {
  google_calendar: [
    "calendar.events.readonly",
    "calendar.events.write",
  ],
  gmail: ["gmail.metadata.readonly"],
  microsoft_graph: [
    "calendar.read",
    "calendar.readwrite",
    "mail.readbasic",
  ],
} as const;

export interface IntegrationAuthorization {
  authorizationId: string;
  provider: OrbitIntegrationProvider;
  scopes: readonly string[];
  status: "pending" | "active" | "revoked" | "expired" | "unavailable";
  capabilities: readonly OrbitIntegrationCapability[];
  healthStatus: IntegrationHealthStatus;
  healthMessage: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface IntegrationHealthRecord {
  provider: OrbitIntegrationProvider;
  status: "healthy" | "degraded";
  message: string;
  checkedAt: string;
  latencyMs: number;
}

export interface IntegrationToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: readonly string[];
  tokenType: string;
}

export interface ExternalCalendarEventSummary {
  providerRecordId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  attendeeCount: number;
  evidenceId: string;
}

export interface ExternalRelationshipSignal {
  providerRecordId: string;
  kind: "email_metadata" | "calendar_metadata";
  occurredAt: string;
  counterpartDomain?: string;
  subjectHint?: string;
  evidenceId: string;
  messageBodyPersisted: false;
}
