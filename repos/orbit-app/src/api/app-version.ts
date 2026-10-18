import type { OrbitApiClient } from "./client";
import { ORBIT_API_ENDPOINTS } from "./endpoints";
import { decideAppVersionGate, type AppVersionGateDecision } from "../view-models/app-version-policy";

export async function loadAppVersionGate(client: OrbitApiClient, currentVersion: string | undefined): Promise<AppVersionGateDecision> {
  const response = await client.get<unknown>(ORBIT_API_ENDPOINTS.appVersion);
  return decideAppVersionGate(response.success ? response.data : null, currentVersion);
}
