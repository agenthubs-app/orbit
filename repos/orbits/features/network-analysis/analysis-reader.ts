/**
 * R11b 人脈分析: the reads behind GET /api/network/analysis and …/people (and the Web page loader).
 *
 * - The lock reads one number first: R11a summary `total` with no filter (everyone, the same rule as the 「N人」 header).
 *   Below NETWORK_ANALYSIS_UNLOCK_CONTACTS nothing else is read — no rows, no plan, no snapshot (PLANNER §5).
 * - Rows come from the R11a card reader itself (pages of 50, the list's own de-duplication / deletion and plan merge),
 *   follow-up ids from the same open-follow-up rule as the 要フォロー filter (one id-only statement), and the seniority level (only stored on the contact's
 *   publicProfile) from one bounded statement over exactly those contact ids of this owner.
 * - Plan needs: plan v2 person types (target vs linked). A failed plan read is `null` (the gap card says so); the rest
 *   of the page is unaffected.
 * 0 writes, 0 AI calls.
 */
import { createContactCardService, defaultContactNetworkMergeSources, type ContactCardActor, type ContactCardService, type ContactNetworkMergeSources } from "../contacts/card-service";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { NETWORK_ANALYSIS_UNLOCK_CONTACTS } from "./page-lock";
import { buildNetworkAnalysisPeople, buildNetworkAnalysisView, type NetworkAnalysisNeeds, type NetworkAnalysisRow } from "./analysis-model";
import { NETWORK_ANALYSIS_RAIL_LIMIT } from "../../shared/api-schema/network-analysis-view";
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

async function readProfileExtras(actorId: string, contactIds: readonly string[]): Promise<Map<string, { level: string | null; location: string | null }>> {
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime || contactIds.length === 0) return new Map();
  resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "contacts" });
  const result = await runtime.client.query<{ id: string; level: string | null; location: string | null }>(
    `/* network-analysis:seniority */
    select c.payload->>'id' as id,
      case when jsonb_typeof(c.payload->'publicProfile'->'seniorityLevel') = 'string' then c.payload->'publicProfile'->>'seniorityLevel' end as level,
      case when jsonb_typeof(c.payload->'location') = 'string' then left(c.payload->>'location', 256) end as location
    from orbit_records c
    where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2 and c.lifecycle_state <> 'deleted'
      and c.payload->>'id' = any($3::text[])`,
    [runtime.workspaceId, actorId, [...contactIds]],
  );
  return new Map(result.rows.flatMap((row) => (typeof row.id === "string"
    ? [[row.id, { level: typeof row.level === "string" ? row.level : null, location: typeof row.location === "string" ? row.location : null }]]
    : [])));
}

/** The open follow-ups' contact ids, as the card reader's 要フォロー filter counts them (one id-only statement). */
async function readFollowUpIds(actorId: string): Promise<readonly string[]> {
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime) return [];
  resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "tasks" });
  const { readOpenFollowUpContactIds } = await import("../contacts/storage/contact-list-postgres-reader");
  const { ids, truncated } = await readOpenFollowUpContactIds(runtime.client, { workspaceId: runtime.workspaceId, actorId });
  if (truncated) throw new Error("NETWORK_ANALYSIS_TOO_MANY_CONTACTS");
  return ids;
}

/** One request's plan / invite merge: the count and every card page ask it once, not once per page. */
function sharedMergeSources(base: ContactNetworkMergeSources = defaultContactNetworkMergeSources): ContactNetworkMergeSources {
  const goal = new Map<string, Promise<readonly string[]>>();
  const invite = new Map<string, Promise<readonly string[]>>();
  const once = (answers: Map<string, Promise<readonly string[]>>, actorId: string, read: () => Promise<readonly string[]>) => {
    let answer = answers.get(actorId);
    if (!answer) { answer = read(); answers.set(actorId, answer); }
    return answer.then((ids) => [...ids]);
  };
  return {
    goalRelatedIds: (actorId) => once(goal, actorId, () => base.goalRelatedIds(actorId)),
    inviteLinkedIds: (actorId) => once(invite, actorId, () => base.inviteLinkedIds(actorId)),
  };
}

export async function readNetworkAnalysisRows(
  actor: ContactCardActor,
  service: ContactCardService = createContactCardService(actor),
  followUpIdsOf: (actorId: string) => Promise<readonly string[]> = readFollowUpIds,
): Promise<NetworkAnalysisRow[]> {
  // Follow-ups only mark the listed cards, so their ids are enough (not their full cards).
  const [cards, followUps] = await Promise.all([
    allPages((cursor) => service.page({ limit: PAGE, cursor }, actor.id)),
    followUpIdsOf(actor.id),
  ]);
  const followUpIds = new Set(followUps);
  const extras = await readProfileExtras(actor.id, cards.map((card) => card.id));
  return cards.map((card) => ({
    id: card.id, name: card.displayName, organization: card.organization, role: card.role, status: card.status,
    primaryIndustryId: card.primaryIndustryId ?? null, city: card.region?.city ?? null, location: extras.get(card.id)?.location ?? null,
    metKind: card.metKind ?? null, seniorityLevel: extras.get(card.id)?.level ?? null, addedAt: card.addedAt ?? null, lastInteractionAt: card.lastInteractionAt ?? null,
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
  // Built per request (route handler, page loader): the count and the rows share one plan / invite merge.
  const merge = sharedMergeSources();
  return {
    readTotal: async (actor) => (await createContactCardService(actor, merge).summary({}, actor.id)).total,
    readRows: (actor) => readNetworkAnalysisRows(actor, createContactCardService(actor, merge)),
    readNeeds: readNetworkAnalysisNeeds,
    now: () => new Date(),
  };
}

async function readNetworkAnalysis(actor: ContactCardActor, deps: NetworkAnalysisReadDeps) {
  const total = await deps.readTotal(actor);
  const now = deps.now();
  if (total < NETWORK_ANALYSIS_UNLOCK_CONTACTS) return { view: buildNetworkAnalysisView({ total, rows: null, needs: null, now }), rows: null, needs: null, now };
  const [rows, needs] = await Promise.all([deps.readRows(actor), deps.readNeeds(actor.id)]);
  return { view: buildNetworkAnalysisView({ total: rows.length, rows, needs, now }), rows, needs, now };
}

/** The analysis view. Below 10 people: only the count is read. A failed count throws (the page shows retry, never a fake lock). */
export async function loadNetworkAnalysisView(actor: ContactCardActor, deps: NetworkAnalysisReadDeps = defaultNetworkAnalysisReadDeps()): Promise<NetworkAnalysisViewDTO> {
  return (await readNetworkAnalysis(actor, deps)).view;
}

/**
 * The view plus the drill-down rail's first page for each selection the screen opens on (NetworkAnalysisScreen
 * `defaultSelection`: the first industry on 構造, the first opportunity on 機会), built from the same rows — what
 * GET …/people?limit=NETWORK_ANALYSIS_RAIL_LIMIT returns, without reading every row a second time. Keyed `dimension:bucket`.
 */
export async function loadNetworkAnalysisViewWithRail(actor: ContactCardActor, deps: NetworkAnalysisReadDeps = defaultNetworkAnalysisReadDeps()): Promise<{ view: NetworkAnalysisViewDTO; rail: Record<string, NetworkAnalysisPeopleDTO> }> {
  const { view, rows, needs, now } = await readNetworkAnalysis(actor, deps);
  const rail: Record<string, NetworkAnalysisPeopleDTO> = {};
  if (!rows || rows.length < NETWORK_ANALYSIS_UNLOCK_CONTACTS || !view.structure) return { view, rail };
  const firstIndustry = view.structure.industries.buckets[0]?.id;
  const firstOpportunity = view.opportunities?.[0]?.kind;
  const openers: Array<{ dimension: NetworkAnalysisDimension; bucketId: string }> = [
    ...(firstIndustry ? [{ dimension: "industry" as const, bucketId: firstIndustry }] : []),
    ...(firstOpportunity ? [{ dimension: "opportunity" as const, bucketId: firstOpportunity }] : []),
  ];
  for (const { dimension, bucketId } of openers) {
    const people = buildNetworkAnalysisPeople({ rows, needs, dimension, bucketId, limit: NETWORK_ANALYSIS_RAIL_LIMIT, now });
    if (people) rail[`${dimension}:${bucketId}`] = people;
  }
  return { view, rail };
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
