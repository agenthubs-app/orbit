import type { ContactSyncPayload } from "../../api/contract/contact-local-directory";
import type { InviteConnectionView } from "../../api/contract/invite-codes";
import type { PlanContactFit } from "../../api/contract/plan-v2";

export type NetworkDesignVariant = "empty" | "locked5" | "few14" | "many286";
export interface NetworkDesignContacts {
  actorId: string;
  variant: NetworkDesignVariant;
  rows: ContactSyncPayload[];
  goalRelatedIds: string[];
  followUpContactIds: string[];
  links: { contactId: string; label: string; talked: boolean }[];
  fits: Record<string, PlanContactFit>;
  connections: Record<string, InviteConnectionView>;
  valueLines: Record<string, { relation: string; evidence: string[]; meetingCount?: number }>;
}

export function networkDesignEnabled(env: string | undefined = process.env.EXPO_PUBLIC_ORBIT_REDESIGN_MOCK, dev: boolean = typeof __DEV__ !== "undefined" && __DEV__): boolean {
  return dev && Boolean(env?.split(",").map((entry) => entry.trim()).some((entry) => entry === "network" || entry === "all"));
}

export function parseNetworkDesignContacts(value: unknown, actorId: string): NetworkDesignContacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.actorId !== actorId || !["empty", "locked5", "few14", "many286"].includes(String(item.variant))) return null;
  if (!Array.isArray(item.rows) || !Array.isArray(item.goalRelatedIds) || !Array.isArray(item.followUpContactIds) || !Array.isArray(item.links)) return null;
  if (!item.fits || !item.connections || !item.valueLines) return null;
  if (!item.rows.every((row) => row && typeof row === "object" && typeof row.id === "string" && row.card && row.card.id === row.id)) return null;
  if (![...item.goalRelatedIds, ...item.followUpContactIds].every((id) => typeof id === "string")) return null;
  return item as unknown as NetworkDesignContacts;
}
