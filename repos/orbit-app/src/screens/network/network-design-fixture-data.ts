import type { ContactSyncPayload } from "../../api/contract/contact-local-directory";
import { contactCardSchema } from "../../api/schema/contact-card-page";
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

function parseContactRow(value: unknown): ContactSyncPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return null;
  const card = contactCardSchema.safeParse(row.card);
  if (!card.success || card.data.id !== row.id) return null;
  if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) return null;
  const search = row.search;
  if (!search || typeof search !== "object" || Array.isArray(search)) return null;
  const fields = search as Record<string, unknown>;
  if (typeof fields.text !== "string" || typeof fields.occurredAt !== "string" || typeof fields.updatedAt !== "string" || (fields.error !== null && typeof fields.error !== "string")) return null;
  if (row.detail !== null && (!row.detail || typeof row.detail !== "object" || Array.isArray(row.detail))) return null;
  return { ...row, card: card.data } as ContactSyncPayload;
}

export function parseNetworkDesignContacts(value: unknown, actorId: string): NetworkDesignContacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.actorId !== actorId || !["empty", "locked5", "few14", "many286"].includes(String(item.variant))) return null;
  if (!Array.isArray(item.rows) || !Array.isArray(item.goalRelatedIds) || !Array.isArray(item.followUpContactIds) || !Array.isArray(item.links)) return null;
  if (!item.fits || !item.connections || !item.valueLines) return null;
  if (![...item.goalRelatedIds, ...item.followUpContactIds].every((id) => typeof id === "string")) return null;
  return { ...item, rows: item.rows.flatMap((row) => {
    const parsed = parseContactRow(row);
    return parsed ? [parsed] : [];
  }) } as unknown as NetworkDesignContacts;
}
