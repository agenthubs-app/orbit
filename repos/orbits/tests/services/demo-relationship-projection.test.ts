import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoRelationshipProjection } from "../../scripts/demo-relationship-projection";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { assessRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-preflight";
import { projectCanonicalContactLifecycles } from "../../features/connections/lifecycle/read-projection";

const workspaceId = "workspace:orbit-demo-fixtures";
const actorId = "account_orbit_generated";
const now = "2026-09-16T10:00:00.000Z";
async function fixtureStore() {
  const store = createMemoryLiveRecordStore();
  await seedGeneratedRelationshipFixturesIntoLiveStore({store, workspaceId});
  return store;
}

test("demo relationships have one canonical edge and current task per contact, valid lifecycle and replay safety", async () => {
  const store = await fixtureStore();
  const records = store.listRecords({ limit: "unbounded", workspaceId, includeDeleted:true});
  const original = structuredClone(records);
  assert.equal(assessRelationshipLifecycleMigration({records, workspaceId, actorId}).readyForCutover, false);
  const plan = buildDemoRelationshipProjection({records, workspaceId, now});
  assert.deepEqual(records, original);
  for (const row of plan) store.upsertRecord(row);
  const after = store.listRecords({ limit: "unbounded", workspaceId, includeDeleted:true});
  const report = assessRelationshipLifecycleMigration({records:after, workspaceId, actorId});
  assert.equal(report.readyForCutover, true, JSON.stringify(report.issues));
  assert.equal(report.counts.contacts, 66);
  assert.equal(report.counts.connections, 66);
  const tasks = store.listRecords({ limit: "unbounded", workspaceId, collectionName:"tasks"});
  assert.equal(tasks.filter(r=>["open","scheduled"].includes(String(r.payload.status))).length, 66);
  assert.equal(tasks.filter(r=>r.payload.status==="dismissed").length, 14);
  assert.equal(after.filter(r=>r.collectionName==="connections" && r.lifecycleState==="deleted").length, 384);
  const views = projectCanonicalContactLifecycles({records:after, workspaceId, actorId, now, timeZone:"Asia/Tokyo"});
  assert.equal(views.length, 66);
  assert.ok(views.every(v=>v.connectionVersion===1));
  assert.ok(views.filter(v=>v.relationshipStage==="active").every(v=>v.activeGoal));
  assert.ok(views.filter(v=>v.relationshipStage!=="active").every(v=>v.nextFollowup));
  assert.deepEqual(after.filter(r=>r.collectionName==="evidence"), original.filter(r=>r.collectionName==="evidence"));
  assert.deepEqual(buildDemoRelationshipProjection({records:after, workspaceId, now}), []);
  const edited = after.map(r=>r.collectionName==="tasks" && r.recordId==="task_067" ? {...r,payload:{...r.payload,title:"User edit"}} : r);
  assert.deepEqual(buildDemoRelationshipProjection({records:edited, workspaceId, now}), []);
});

test("demo lifecycle projection refuses wrong scope, edited source, partial replay and unknown live references", async () => {
  const store = await fixtureStore();
  const records = store.listRecords({ limit: "unbounded", workspaceId, includeDeleted:true});
  assert.throws(()=>buildDemoRelationshipProjection({records,workspaceId:"other",now}), /exact demo/);
  assert.throws(()=>buildDemoRelationshipProjection({records,workspaceId,now:"bad"}));
  const first = records.find(r=>r.collectionName==="connections")!;
  assert.throws(()=>buildDemoRelationshipProjection({records:records.map(r=>r===first?{...r,payload:{...r.payload,summary:"User edit"}}:r),workspaceId,now}), /edited|fixture/);
  const plan = buildDemoRelationshipProjection({records,workspaceId,now});
  store.upsertRecord(plan[0]!);
  assert.throws(()=>buildDemoRelationshipProjection({records:store.listRecords({ limit: "unbounded", workspaceId,includeDeleted:true}),workspaceId,now}), /partial/);
  const retired = plan.find(r=>r.collectionName==="connections" && r.lifecycleState==="deleted")!;
  assert.throws(()=>buildDemoRelationshipProjection({records:[...records,{...first,collectionName:"unknown",recordId:"new",payload:{connectionId:retired.recordId}}],workspaceId,now}), /Unresolved/);
});
