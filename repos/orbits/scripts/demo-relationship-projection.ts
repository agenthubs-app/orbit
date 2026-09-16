import { defaultMockFixtures } from "../shared/mock/fixtures";
import type { LiveRecord } from "../shared/storage/live-record-store";
import { lifecycleMigrationHash } from "../features/connections/lifecycle/migration-plan";
import { assessRelationshipLifecycleMigration } from "../features/connections/lifecycle/migration-preflight";
import { normalizeRelationshipLifecycleInstant } from "../features/connections/lifecycle/transition";
import { isConnectionStage } from "../shared/domain/source-types";

const revision = "demo-relationship-lifecycle-v1";
const actorId = "account_orbit_generated";
const collections = ["contacts", "connections", "tasks"] as const;

function normalizedFixtureTime(value: unknown): string {
  if (typeof value !== "string") throw new Error("Fixture timestamp is missing.");
  // Original generated fixtures use PostgreSQL microseconds; runtime uses ms.
  return normalizeRelationshipLifecycleInstant(value.replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:\d{2}$)/u, "$1"), "INVALID_TRANSITION");
}

function containsId(value: unknown, ids: Set<string>): boolean {
  if (typeof value === "string") return ids.has(value);
  return !!value && typeof value === "object" && Object.values(value).some(v=>containsId(v,ids));
}

/** Fixture-only redesign, never a general migration of real user relationships. */
export function buildDemoRelationshipProjection(input: {
  records: readonly LiveRecord[]; workspaceId: string; now: string;
}): readonly LiveRecord[] {
  if (input.workspaceId !== "workspace:orbit-demo-fixtures" || input.records.some(r=>r.workspaceId!==input.workspaceId)) {
    throw new Error("Relationship projection requires the exact demo workspace.");
  }
  const now = normalizeRelationshipLifecycleInstant(input.now, "INVALID_TRANSITION");
  const expected = collections.flatMap(collectionName => defaultMockFixtures[collectionName].map(payload=>({collectionName,payload})));
  const source = expected.map(({collectionName,payload}) => {
    const matches = input.records.filter(r=>r.collectionName===collectionName && r.recordId===payload.id);
    if (matches.length!==1) throw new Error("Missing or ambiguous fixture record.");
    const row = matches[0]!;
    if (row.provider!=="generated-relationship-fixtures" || row.userId!==actorId) throw new Error("Non-fixture ownership refused.");
    return row;
  });
  const marked = source.filter(r=>r.payload.fixtureRevision===revision).length;
  if (marked && marked!==source.length) throw new Error("Refusing partial fixture replay.");
  if (marked) {
    const report = assessRelationshipLifecycleMigration({...input, actorId});
    if (!report.readyForCutover) throw new Error("Replayed fixture lifecycle is inconsistent; preserve user edits for review.");
    return [];
  }
  for (let i=0;i<source.length;i++) {
    if (source[i]!.lifecycleState!=="active" || lifecycleMigrationHash(source[i]!.payload)!==lifecycleMigrationHash(expected[i]!.payload)) {
      throw new Error(`Refusing edited fixture: ${source[i]!.collectionName}:${source[i]!.recordId}`);
    }
  }
  const contacts = source.filter(r=>r.collectionName==="contacts");
  const connections = source.filter(r=>r.collectionName==="connections").sort((a,b)=>a.recordId.localeCompare(b.recordId));
  const tasks = source.filter(r=>r.collectionName==="tasks");
  const canonical = new Map<string,LiveRecord>();
  for (const row of connections) if (!canonical.has(String(row.payload.contactId))) canonical.set(String(row.payload.contactId), row);
  const retiredIds = new Set(connections.filter(r=>canonical.get(String(r.payload.contactId))!==r).map(r=>r.recordId));
  for (const row of input.records) {
    if (row.lifecycleState!=="deleted" && !source.includes(row) && !["evidence","aiAnalyses"].includes(row.collectionName) && containsId(row, retiredIds)) {
      throw new Error(`Unresolved duplicate connection reference: ${row.collectionName}:${row.recordId}`);
    }
  }
  const changes = new Map<string,LiveRecord>();
  const put = (row: LiveRecord) => changes.set(`${row.collectionName}:${row.recordId}`,row);
  const changed = (row: LiveRecord, fields: Record<string,unknown>): LiveRecord => ({...row,updatedAt:now,payload:{...row.payload,
    createdAt:normalizedFixtureTime(row.payload.createdAt),updatedAt:now,version:1,fixtureRevision:revision,...fields}});
  for (const contact of contacts) {
    const connection = canonical.get(contact.recordId);
    if (!connection) throw new Error("Fixture contact has no relationship.");
    // Acquisition statuses are not relationship stages. These are already
    // imported contacts: their synthetic next action is review/follow-up.
    const stage = isConnectionStage(connection.payload.stage) ? connection.payload.stage : "needs_follow_up";
    const candidates = tasks.filter(r=>r.payload.contactId===contact.recordId).sort((a,b)=>
      normalizedFixtureTime(String(b.payload.dueAt)).localeCompare(normalizedFixtureTime(String(a.payload.dueAt))) || a.recordId.localeCompare(b.recordId));
    if (!candidates.length || candidates.some(r=>!["open","scheduled"].includes(String(r.payload.status)))) throw new Error("Unexpected fixture task history.");
    const suggested = connection.payload.suggestedActions;
    const activeGoal = stage==="active" && Array.isArray(suggested) && typeof suggested[0]==="string" ? suggested[0] : null;
    if (stage==="active" && !activeGoal?.trim()) throw new Error("Active fixture requires an explicit goal.");
    put(changed(contact,{stage}));
    put(changed(connection,{stage,activeGoal}));
    for (const [index,task] of candidates.entries()) {
      put(changed(task,{connectionId:connection.recordId,dueAt:normalizedFixtureTime(task.payload.dueAt),
        relationshipPurpose:stage==="nurture"?"maintenance":"follow_up",
        ...(index>0?{status:"dismissed",fixtureRetirementReason:"duplicate synthetic next action"}:{}),
      }));
    }
  }
  for (const row of connections.filter(r=>retiredIds.has(r.recordId))) {
    put({...row,lifecycleState:"deleted",deletedAt:now,updatedAt:now,payload:{...row.payload,fixtureRevision:revision,
      supersededByConnectionId:canonical.get(String(row.payload.contactId))!.recordId}});
  }
  // Never carry an analysis over to a different source or pretend it was rerun.
  const connectionIds = new Set(connections.map(r=>r.recordId));
  for (const row of input.records.filter(r=>r.collectionName==="aiAnalyses" && r.lifecycleState!=="deleted" && r.targetType==="connection" && connectionIds.has(String(r.targetId)))) {
    const baseline = defaultMockFixtures.aiAnalyses.find(a=>a.id===row.recordId);
    if (row.provider!=="generated-relationship-fixtures" || row.userId!==actorId || !baseline || lifecycleMigrationHash(row.payload)!==lifecycleMigrationHash(baseline)) {
      throw new Error("Refusing edited fixture analysis.");
    }
    put({...row,lifecycleState:"deleted",deletedAt:now,updatedAt:now,payload:{...row.payload,fixtureRevision:revision,fixtureRetirementReason:"relationship inputs redesigned; regenerate explicitly"}});
  }
  const projected = input.records.map(row=>changes.get(`${row.collectionName}:${row.recordId}`)??row);
  const report = assessRelationshipLifecycleMigration({records:projected,workspaceId:input.workspaceId,actorId});
  if (!report.readyForCutover) throw new Error(`Fixture lifecycle validation failed: ${JSON.stringify(report.issues.slice(0,5))}`);
  return [...changes.values()];
}
