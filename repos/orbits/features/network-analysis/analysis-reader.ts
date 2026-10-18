/**
 * R11b 人脈分析: the reads behind GET /api/network/analysis and …/people (and the Web page loader).
 *
 * - The lock reads one number first: R11a summary `total` with no filter (everyone, the same rule as the 「N人」 header).
 *   Below NETWORK_ANALYSIS_UNLOCK_CONTACTS nothing else is read — no rows, no plan, no snapshot (PLANNER §5).
 * - Rows come from the R11a card reader itself (pages of 50, the list's own de-duplication / deletion and plan merge),
 *   follow-up ids from the same reader's 要フォロー filter, and the seniority level (only stored on the contact's
 *   publicProfile) from one bounded statement over exactly those contact ids of this owner.
 * - Plan needs: plan v2 person types (target vs linked). A failed plan read is `null` (the gap card says so); the rest
 *   of the page is unaffected.
 * 0 writes, 0 AI calls.
 */
import { createContactCardService, type ContactCardActor, type ContactCardService } from "../contacts/card-service";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { NETWORK_ANALYSIS_UNLOCK_CONTACTS } from "./page-lock";
import { buildNetworkAnalysisPeople, buildNetworkAnalysisView, type NetworkAnalysisNeeds, type NetworkAnalysisRow } from "./analysis-model";
import type { NetworkAnalysisDimension, NetworkAnalysisPeopleDTO, NetworkAnalysisPeopleSort, NetworkAnalysisViewDTO } from "../../shared/contract/network-analysis-view";

/** Upper bound of rows one analysis reads (40 pages of 50). Beyond it the read fails visibly instead of counting a part. */
export const NETWORK_ANALYSIS_ROW_LIMIT = 2_000;
const PAGE = 50;

export interface NetworkAnalysisReadDeps {
  readTotal(actor: ContactCardActor): Promise<number>;
  readRows(actor: ContactCardActor): Promise<NetworkAnalysisRow[]>;
  readNeeds(actorId: string): Promise<NetworkAnalysisNeeds>;
  now(): Date;
}

async function allPages<T>(read: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page = await read(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (items.length > NETWORK_ANALYSIS_ROW_LIMIT) throw new Error("NETWORK_ANALYSIS_TOO_MANY_CONTACTS");
  } while (cursor);
  return items;
}

async function readSeniority(actorId: string, contactIds: readonly string[]): Promise<Map<string, string>> {
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime || contactIds.length === 0) return new Map();
  resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "contacts" });
  const result = await runtime.client.query<{ id: string; level: string | null }>(
    `/* network-analysis:seniority */
    select c.payload->>'id' as id, c.payload->'publicProfile'->>'seniorityLevel' as level
    from orbit_records c
    where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2 and c.lifecycle_state <> 'deleted'
      and c.payload->>'id' = any($3::text[]) and jsonb_typeof(c.payload->'publicProfile'->'seniorityLevel') = 'string'`,
    [runtime.workspaceId, actorId, [...contactIds]],
  );
  return new Map(result.rows.flatMap((row) => (typeof row.id === "string" && typeof row.level === "string" ? [[row.id, row.level]] : [])));
}

export async function readNetworkAnalysisRows(actor: ContactCardActor, service: ContactCardService = createContactCardService(actor)): Promise<NetworkAnalysisRow[]> {
  const [cards, followUps] = await Promise.all([
    allPages((cursor) => service.page({ limit: PAGE, cursor }, actor.id)),
    allPages((cursor) => service.page({ limit: PAGE, cursor, needsFollowUp: true }, actor.id)),
  ]);
  const followUpIds = new Set(followUps.map((card) => card.id));
  const levels = await readSeniority(actor.id, cards.map((card) => card.id));
  return cards.map((card) => ({
    id: card.id, name: card.displayName, organization: card.organization, role: card.role, status: card.status,
    primaryIndustryId: card.primaryIndustryId ?? null, city: card.region?.city ?? null, metKind: card.metKind ?? null,
    seniorityLevel: levels.get(card.id) ?? null, addedAt: card.addedAt ?? null, lastInteractionAt: card.lastInteractionAt ?? null,
    goalRelated: card.goalRelated === true, needsFollowUp: followUpIds.has(card.id), nextActionPreview: card.nextActionPreview,
  }));
}

export async function readNetworkAnalysisNeeds(actorId: string): Promise<NetworkAnalysisNeeds> {
  try {
    const { readActiveV2Needs } = await import("../plans/v2/active-needs");
    const active = await readActiveV2Needs(actorId, "live");
    if (!active) return [];
    return active.needs.map((need) => ({
      planId: need.planId, needId: need.itemId, title: need.title, primaryIndustryId: need.primaryIndustryId,
      targetCount: need.targetCount, linkedCount: need.contactLinks.length, skipped: need.skipped,
    }));
  } catch (error) {
    console.error(JSON.stringify({ event: "network_analysis_plan_unavailable", error: error instanceof Error ? error.name : "unknown" }));
    return null;
  }
}

export function defaultNetworkAnalysisReadDeps(): NetworkAnalysisReadDeps {
  return {
    readTotal: async (actor) => (await createContactCardService(actor).summary({}, actor.id)).total,
    readRows: (actor) => readNetworkAnalysisRows(actor),
    readNeeds: readNetworkAnalysisNeeds,
    now: () => new Date(),
  };
}

/** The analysis view. Below 10 people: only the count is read. A failed count throws (the page shows retry, never a fake lock). */
export async function loadNetworkAnalysisView(actor: ContactCardActor, deps: NetworkAnalysisReadDeps = defaultNetworkAnalysisReadDeps()): Promise<NetworkAnalysisViewDTO> {
  const total = await deps.readTotal(actor);
  const now = deps.now();
  if (total < NETWORK_ANALYSIS_UNLOCK_CONTACTS) return buildNetworkAnalysisView({ total, rows: null, needs: null, now });
  const [rows, needs] = await Promise.all([deps.readRows(actor), deps.readNeeds(actor.id)]);
  return buildNetworkAnalysisView({ total: rows.length, rows, needs, now });
}

/** One drill-down list; null = locked (below 10) or an unknown bucket. */
export async function loadNetworkAnalysisPeople(
  actor: ContactCardActor,
  query: { dimension: NetworkAnalysisDimension; bucket: string; sort?: NetworkAnalysisPeopleSort; cursor?: string; limit?: number },
  deps: NetworkAnalysisReadDeps = defaultNetworkAnalysisReadDeps(),
): Promise<NetworkAnalysisPeopleDTO | "locked" | null> {
  if ((await deps.readTotal(actor)) < NETWORK_ANALYSIS_UNLOCK_CONTACTS) return "locked";
  const [rows, needs] = await Promise.all([deps.readRows(actor), deps.readNeeds(actor.id)]);
  if (rows.length < NETWORK_ANALYSIS_UNLOCK_CONTACTS) return "locked";
  return buildNetworkAnalysisPeople({ rows, needs, dimension: query.dimension, bucketId: query.bucket, sort: query.sort, cursor: query.cursor, limit: query.limit, now: deps.now() });
}
