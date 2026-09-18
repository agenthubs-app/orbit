import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoOrganizerProjection } from "../../scripts/demo-organizer-projection";
import { MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES } from "../../shared/mock/event-organizer-fixtures";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const workspaceId = "workspace:orbit-demo-fixtures";
const now = "2026-09-16T12:00:00.000Z";
function rows(): LiveRecord[] {
  const result: LiveRecord[] = [];
  for (const f of MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES.filter(f=>f.key!=="xiaoyu")) {
    const actor = `auth:${f.key}`;
    const add = (collectionName: string, recordId: string, userId: string, payload: Record<string,unknown>) => result.push({
      workspaceId, collectionName, recordId, userId, payload, createdAt: now, updatedAt: now,
      lifecycleState: "active", sourceId: "test", sourceType: "system", evidenceIds: [], provider: "generated-relationship-fixtures",
    });
    add("auth_users", f.email, actor, {id: actor, email: f.email, provider: "credentials", passwordHash: "do-not-change"});
    add("accounts", actor, actor, {id:actor});
    add("profiles", `profile:${actor}`, actor, {id:`profile:${actor}`,accountId:actor,displayName:"User-edited name",role:"User-edited role"});
    add("accounts", f.accountId, f.accountId, {id:f.accountId});
    add("profiles", `profile:${f.accountId}`, f.accountId, {accountId:f.accountId,organization:f.organization,role:f.role});
    add("organizers", f.organizerId, f.accountId, {id:f.organizerId,accountId:f.accountId});
  }
  return result;
}

test("organizer projection consolidates identities without touching login or user edits and replays unchanged", () => {
  const source=rows(); const original=structuredClone(source);
  const store=createMemoryLiveRecordStore(source);
  const plan=buildDemoOrganizerProjection({records:source,workspaceId,now});
  assert.equal(plan.length,52);
  assert.deepEqual(source,original);
  for(const row of plan) store.upsertRecord(row);
  assert.equal(store.listRecords({ limit: "unbounded", workspaceId,collectionName:"accounts"}).length,13);
  assert.equal(store.listRecords({ limit: "unbounded", workspaceId,collectionName:"profiles"}).length,13);
  assert.ok(store.listRecords({ limit: "unbounded", workspaceId,collectionName:"profiles"}).every(r=>r.payload.role==="User-edited role" && r.payload.organization));
  assert.deepEqual(store.listRecords({ limit: "unbounded", workspaceId,collectionName:"auth_users"}),source.filter(r=>r.collectionName==="auth_users"));
  assert.deepEqual(buildDemoOrganizerProjection({records:store.listRecords({ limit: "unbounded", workspaceId,includeDeleted:true}),workspaceId,now}),[]);
});

test("organizer projection refuses a different workspace, unknown references, and non-fixture duplicate records", () => {
  const source=rows();
  assert.throws(()=>buildDemoOrganizerProjection({records:source,workspaceId:"production",now}),/exact demo/);
  const old=source.find(r=>r.collectionName==="accounts" && r.recordId.startsWith("account_"))!;
  assert.throws(()=>buildDemoOrganizerProjection({records:[...source,{...old,collectionName:"tasks",recordId:"foreign-reference"}],workspaceId,now}),/Unresolved reference/);
  assert.throws(()=>buildDemoOrganizerProjection({records:source.map(r=>r===old?{...r,provider:"manual"}:r),workspaceId,now}),/non-fixture/);
});
