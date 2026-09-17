import assert from "node:assert/strict";
import test from "node:test";
import { assertSmallSeed, buildMinimalStagingSeed, STAGING_HOST, STAGING_LIMITS, STAGING_WORKSPACE, validateStagingTarget } from "../../scripts/lib/minimal-staging";

test("staging target guard rejects production, URL overrides and existing local databases", () => {
  validateStagingTarget(`postgresql://owner:synthetic@${STAGING_HOST}/neondb?sslmode=require`,true);
  validateStagingTarget("postgresql://li@localhost:5432/orbit_staging_20260917",false);
  for (const url of ["postgresql://owner:synthetic@production.neon.tech/neondb",`postgresql://owner:synthetic@${STAGING_HOST}/other`,`postgresql://owner:synthetic@${STAGING_HOST}/neondb?host=production`, `postgresql://owner:synthetic@${STAGING_HOST}/neondb?options=-csearch_path%3Dproduction`, `https://owner:synthetic@${STAGING_HOST}/neondb`]) assert.throws(()=>validateStagingTarget(url,true));
  assert.throws(()=>validateStagingTarget("postgresql://li@localhost:5432/postgres",false));
});

test("minimal seed has usable auth/account chains, two owned events, private contacts and no pressure history", async () => {
  const seed = await buildMinimalStagingSeed("Local-test-only-password-2026","2026-09-17T08:00:00.000Z");
  assert.equal(Object.keys(seed.accounts).length,4);
  assert.equal(seed.events.count,2);
  assert.ok(seed.records.length < STAGING_LIMITS.records);
  assert.ok(seed.seedBytes < STAGING_LIMITS.seedBytes);
  for (const account of Object.values(seed.accounts)) {
    assert.ok(seed.records.some(r=>r.collectionName==="accounts" && r.recordId===account.id));
    assert.ok(seed.records.some(r=>r.collectionName==="profiles" && r.userId===account.id));
  }
  assert.ok(seed.events.events.every(e=>e.organizerActorId===seed.accounts.organizer!.id));
  assert.deepEqual(seed.events.events.map(e=>e.lifecycleState).sort(),["draft","published"]);
  assert.ok(seed.events.events.every(e=>Date.parse(e.endsAt)>Date.parse(e.startsAt)));
  assert.equal(seed.records.filter(r=>r.collectionName==="connections").length,3);
  assert.ok(seed.records.filter(r=>r.collectionName==="connections").every(r=>r.userId!==seed.accounts.empty!.id));
  assert.ok(seed.records.every(r=>r.workspaceId===STAGING_WORKSPACE));
  assert.ok(seed.records.every(r=>!/(chat|artifact|generation|attempt)/i.test(r.collectionName)));
  assert.throws(()=>assertSmallSeed([...seed.records,seed.records[0]!],seed.events));
  assert.throws(()=>assertSmallSeed(seed.records,"x".repeat(STAGING_LIMITS.seedBytes)));
});
