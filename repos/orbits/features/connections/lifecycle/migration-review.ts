import { LifecycleMigrationError, lifecycleMigrationHash, type LifecycleMigrationPlan } from "./migration-plan";
import { normalizeRelationshipLifecycleInstant } from "./transition";

export interface LifecycleMigrationReview {
  schemaVersion: 1;
  actorId: string;
  workspaceId: string;
  sourceHash: string;
  manifestHash: string;
  planHash: string;
  reviewedBy: string;
  reviewedAt: string;
  approved: true;
}

const reviewKeys = ["schemaVersion", "actorId", "workspaceId", "sourceHash", "manifestHash", "planHash", "reviewedBy", "reviewedAt", "approved"] as const;
function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

// Parsing only verifies a caller-supplied artifact. It cannot prove that a human
// reviewed it, and must never manufacture approval or reviewer identity.
export function parseLifecycleMigrationReview(input: unknown): LifecycleMigrationReview {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw 0;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== reviewKeys.length || !keys.every(key => typeof key === "string" && reviewKeys.includes(key as typeof reviewKeys[number]))) throw 0;
    const value = Object.fromEntries(keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw 0;
      return [key, descriptor.value];
    }));
    if (value.schemaVersion !== 1 || value.approved !== true || !identity(value.actorId) || !identity(value.workspaceId) || !identity(value.reviewedBy)) throw 0;
    for (const key of ["sourceHash", "manifestHash", "planHash"] as const) {
      if (typeof value[key] !== "string" || !/^[a-f0-9]{64}$/u.test(value[key])) throw 0;
    }
    const reviewedAt = normalizeRelationshipLifecycleInstant(value.reviewedAt, "INVALID_TRANSITION");
    return { ...value, reviewedAt } as unknown as LifecycleMigrationReview;
  } catch { throw new LifecycleMigrationError("INVALID_REVIEW"); }
}

export function assertLifecycleMigrationReview(input: {
  review: LifecycleMigrationReview; plan: LifecycleMigrationPlan;
  actorId: string; workspaceId: string; operatorId: string; now: string;
}): void {
  try {
    const review = parseLifecycleMigrationReview(input.review);
    const clock = normalizeRelationshipLifecycleInstant(input.now, "INVALID_TRANSITION");
    if (![input.actorId, input.workspaceId, input.operatorId].every(identity) || review.actorId !== input.actorId || review.workspaceId !== input.workspaceId || review.reviewedBy !== input.operatorId || Date.parse(review.reviewedAt) > Date.parse(clock)) throw 0;
    // Check JSON safety before inspecting fields; an altered plan must not keep
    // the hash that was reviewed. The executor additionally re-plans from SQL.
    lifecycleMigrationHash(input.plan);
    const { planHash, ...fields } = input.plan;
    if (input.plan.migrationId !== "relationship-lifecycle-v1" || input.plan.schemaVersion !== 1 || input.plan.databaseWriteExecuted !== false || input.plan.actorId !== input.actorId || input.plan.workspaceId !== input.workspaceId || planHash !== lifecycleMigrationHash(fields)) throw 0;
    if (review.sourceHash !== input.plan.sourceHash || review.manifestHash !== input.plan.manifestHash || review.planHash !== planHash) throw 0;
    if (input.plan.applyEligible !== true || !Array.isArray(input.plan.issues) || input.plan.issues.length !== 0 || input.plan.after?.readyForCutover !== true || !Array.isArray(input.plan.after.issues) || input.plan.after.issues.length !== 0) throw new LifecycleMigrationError("REVIEW_REQUIRED");
    if (input.plan.after.actorId !== input.actorId || input.plan.after.workspaceId !== input.workspaceId) throw 0;
  } catch (error) {
    if (error instanceof LifecycleMigrationError && error.code === "REVIEW_REQUIRED") throw error;
    throw new LifecycleMigrationError("INVALID_REVIEW");
  }
}
