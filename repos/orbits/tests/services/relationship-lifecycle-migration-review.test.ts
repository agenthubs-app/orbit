import assert from "node:assert/strict";
import test from "node:test";
import { lifecycleMigrationHash, planRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-plan";
import { assertLifecycleMigrationReview, parseLifecycleMigrationReview, type LifecycleMigrationReview } from "../../features/connections/lifecycle/migration-review";

const actorId = "actor:review";
const workspaceId = "workspace:review";
const operatorId = "operator:reviewer";
const now = "2026-09-09T01:00:00.000Z";
const plan = planRelationshipLifecycleMigration({
  manifest: { schemaVersion: 1, actorId, workspaceId, ownerRepairs: [] },
  records: [
    { collectionName: "contacts", recordId: "contact:a", payload: { id: "contact:a", stage: "active", createdAt: now, updatedAt: now } },
    { collectionName: "connections", recordId: "connection:a", payload: { id: "connection:a", contactId: "contact:a", accountId: actorId, stage: "active", activeGoal: "PRIVATE GOAL", createdAt: now, updatedAt: now } },
  ].map(row => ({ ...row, workspaceId, userId: actorId, sourceType: "manual", sourceId: "source:a", evidenceIds: [], lifecycleState: "active", createdAt: now, updatedAt: now })),
});
// Literal approval supplied by a reviewer in this isolated test fixture. The
// production API must never manufacture this artifact from a plan itself.
const review: LifecycleMigrationReview = {
  schemaVersion: 1, actorId, workspaceId,
  sourceHash: plan.sourceHash, manifestHash: plan.manifestHash, planHash: plan.planHash,
  approved: true, reviewedBy: operatorId, reviewedAt: "2026-09-09T00:30:00.000Z",
};
const input = { review, plan, actorId, workspaceId, operatorId, now };

test("external approval must bind the exact plan, source, manifest and operation identity", () => {
  assert.doesNotThrow(() => assertLifecycleMigrationReview(input));
  for (const field of ["sourceHash", "manifestHash", "planHash"] as const) {
    assert.throws(() => assertLifecycleMigrationReview({ ...input, review: { ...review, [field]: "0".repeat(64) } }), { code: "INVALID_REVIEW" });
  }
  for (const field of ["actorId", "workspaceId", "operatorId"] as const) {
    assert.throws(() => assertLifecycleMigrationReview({ ...input, [field]: "identity:other" }), { code: "INVALID_REVIEW" });
    assert.throws(() => assertLifecycleMigrationReview({ ...input, [field]: " " }), { code: "INVALID_REVIEW" });
  }
  for (const field of ["actorId", "workspaceId", "reviewedBy"] as const) {
    assert.throws(() => assertLifecycleMigrationReview({ ...input, review: { ...review, [field]: "identity:other" } }), { code: "INVALID_REVIEW" });
  }
});

test("review parsing is exact, requires explicit approval, and returns an independent copy", () => {
  for (const invalid of [null, [], { ...review, approved: false }, { ...review, approved: "true" }, { ...review, schemaVersion: 2 }, { ...review, extra: true }, { ...review, extra: undefined }]) {
    assert.throws(() => parseLifecycleMigrationReview(invalid), { code: "INVALID_REVIEW" });
  }
  for (const field of Object.keys(review)) {
    const missing: Record<string, unknown> = { ...review }; delete missing[field];
    assert.throws(() => parseLifecycleMigrationReview(missing), { code: "INVALID_REVIEW" });
  }
  const source = { ...review };
  const parsed = parseLifecycleMigrationReview(source);
  source.reviewedBy = "changed";
  assert.equal(parsed.reviewedBy, operatorId);
  assert.notEqual(parsed, source);
  assert.deepEqual(parseLifecycleMigrationReview(Object.fromEntries(Object.entries(review).reverse())), review);
});

test("identities and hashes cannot be blank, coerced, ambiguous or malformed", () => {
  for (const field of ["actorId", "workspaceId", "reviewedBy"] as const) {
    for (const value of ["", " ", " padded", "control\0id", "control\nid", "a".repeat(513), 3, ["actor:review"]]) {
      assert.throws(() => parseLifecycleMigrationReview({ ...review, [field]: value }), { code: "INVALID_REVIEW" });
    }
  }
  for (const field of ["sourceHash", "manifestHash", "planHash"] as const) {
    for (const value of ["", "f".repeat(63), "F".repeat(64), "z".repeat(64), 1, null]) {
      assert.throws(() => parseLifecycleMigrationReview({ ...review, [field]: value }), { code: "INVALID_REVIEW" });
    }
  }
});

test("review and clock instants must be valid and approval cannot come from the future", () => {
  const local = { ...review, reviewedAt: "2026-09-09T09:30:00+09:00" };
  assert.equal(parseLifecycleMigrationReview(local).reviewedAt, review.reviewedAt);
  assert.doesNotThrow(() => assertLifecycleMigrationReview({ ...input, review: local }));
  assert.doesNotThrow(() => assertLifecycleMigrationReview({ ...input, review: { ...review, reviewedAt: now } }));
  assert.throws(() => assertLifecycleMigrationReview({ ...input, review: { ...review, reviewedAt: "2026-09-09T01:00:00.001Z" } }), { code: "INVALID_REVIEW" });
  for (const date of ["tomorrow", "2026-02-30T01:00:00Z", "2026-09-09", "", undefined]) {
    assert.throws(() => parseLifecycleMigrationReview({ ...review, reviewedAt: date }), { code: "INVALID_REVIEW" });
    assert.throws(() => assertLifecycleMigrationReview({ ...input, now: date as string }), { code: "INVALID_REVIEW" });
  }
});

test("a hash does not make a blocked, altered or inconsistent plan executable", () => {
  assert.throws(() => assertLifecycleMigrationReview({ ...input, plan: { ...plan, changes: [] } }), { code: "INVALID_REVIEW" });
  for (const patch of [{ applyEligible: false }, { issues: [{ code: "MISSING_GOAL", collectionName: "connections", recordId: "connection:a" }] }, { after: { ...plan.after, readyForCutover: false } }]) {
    const { planHash: ignored, ...fields } = { ...plan, ...patch };
    void ignored;
    const blocked = { ...fields, planHash: lifecycleMigrationHash(fields) };
    assert.throws(() => assertLifecycleMigrationReview({ ...input, plan: blocked, review: { ...review, planHash: blocked.planHash } }), { code: "REVIEW_REQUIRED" });
  }
  for (const patch of [{ schemaVersion: 2 }, { migrationId: "another-migration" }, { databaseWriteExecuted: true }, { actorId: "actor:other" }]) {
    assert.throws(() => assertLifecycleMigrationReview({ ...input, plan: { ...plan, ...patch } as never }), { code: "INVALID_REVIEW" });
  }
});

test("malformed review objects fail without running getters or exposing private input", () => {
  let reads = 0;
  const getter = { ...review };
  Object.defineProperty(getter, "reviewedBy", { enumerable: true, get() { reads++; return "PRIVATE ACTOR"; } });
  const hidden = Object.defineProperty({ ...review }, "private", { value: "PRIVATE HIDDEN" });
  for (const value of [getter, hidden, { ...review, private: "PRIVATE EXTRA" }, { ...review, [Symbol("private")]: true }]) {
    assert.throws(() => parseLifecycleMigrationReview(value), error => error instanceof Error && error.name === "LifecycleMigrationError" && !error.message.includes("PRIVATE"));
  }
  assert.equal(reads, 0);
  assert.doesNotThrow(() => assertLifecycleMigrationReview({ ...input, review: Object.freeze({ ...review }), plan: Object.freeze(structuredClone(plan)) }));
});
