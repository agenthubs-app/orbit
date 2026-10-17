import type { IntegrationAuthorization, OrbitIntegrationProvider } from "../../../../../features/integrations/contract";

export type IntegrationViewState = "preparing" | "disconnected" | "connected" | "action_required";
export type IntegrationAction = "none" | "connect" | "manage";
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function integrationStatus(record?: Pick<IntegrationAuthorization, "status" | "healthStatus">): IntegrationViewState {
  if (!record || record.status === "unavailable" || record.healthStatus === "unavailable") return "preparing";
  if (record.status === "active" && (record.healthStatus === "healthy" || record.healthStatus === "not_checked")) return "connected";
  if (record.status === "pending" || record.status === "revoked") return "disconnected";
  return "action_required";
}

export function integrationAction(provider: OrbitIntegrationProvider, state: IntegrationViewState): IntegrationAction {
  if (state === "preparing") return "none";
  if (state === "connected") return "manage";
  return provider === "gmail" || provider === "google_calendar" || provider === "microsoft_graph" ? "connect" : "none";
}

export async function listIntegrations(fetcher: Fetcher = fetch): Promise<IntegrationAuthorization[]> {
  const response = await fetcher("/api/integrations", { cache: "no-store" });
  if (!response.ok) throw new Error(`Integrations unavailable (${response.status}).`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) throw new Error("Invalid integrations response.");
  return (body as { data: unknown[] }).data.filter((value): value is IntegrationAuthorization =>
    !!value && typeof value === "object" && typeof (value as IntegrationAuthorization).provider === "string"
    && typeof (value as IntegrationAuthorization).status === "string"
    && typeof (value as IntegrationAuthorization).healthStatus === "string");
}

export async function checkIntegration(provider: OrbitIntegrationProvider, fetcher: Fetcher = fetch): Promise<void> {
  const response = await fetcher(`/api/integrations/${provider}/health`, { method: "POST" });
  if (!response.ok) throw new Error(`Health check failed (${response.status}).`);
}

export async function revokeIntegration(provider: OrbitIntegrationProvider, fetcher: Fetcher = fetch): Promise<void> {
  const response = await fetcher(`/api/integrations/${provider}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Disconnect failed (${response.status}).`);
}
