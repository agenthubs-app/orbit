import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });

export interface RelationshipGoalScope {
  actorId: string;
  baseUrl: string;
  profileId: string;
}

export interface RelationshipGoalSaveInput extends RelationshipGoalScope {
  expectedUpdatedAt: string;
  relationshipGoal: string;
}

export interface RelationshipGoalSaveAttempt {
  body: {
    expectedUpdatedAt: string;
    mutationId: string;
    relationshipGoal: string;
  };
  fingerprint: string;
  mutationId: string;
  scope: RelationshipGoalScope;
}

export type RelationshipGoalSaveConfirmation =
  | { ok: false }
  | {
      ok: true;
      relationshipGoal: string;
      updatedAt: string;
    };

function saveFingerprint(input: RelationshipGoalSaveInput, relationshipGoal: string): string {
  return JSON.stringify([
    input.actorId,
    input.baseUrl,
    input.profileId,
    input.expectedUpdatedAt,
    relationshipGoal,
  ]);
}

export function createRelationshipGoalSaveAttempt(
  input: RelationshipGoalSaveInput,
  previous: RelationshipGoalSaveAttempt | null,
  createMutationId: () => string,
): RelationshipGoalSaveAttempt {
  const relationshipGoal = input.relationshipGoal.trim();
  const fingerprint = saveFingerprint(input, relationshipGoal);
  const mutationId = previous?.fingerprint === fingerprint
    ? previous.mutationId
    : `ios:relationship-goal:${createMutationId()}`;

  return {
    body: {
      expectedUpdatedAt: input.expectedUpdatedAt,
      mutationId,
      relationshipGoal,
    },
    fingerprint,
    mutationId,
    scope: {
      actorId: input.actorId,
      baseUrl: input.baseUrl,
      profileId: input.profileId,
    },
  };
}

function sameScope(left: RelationshipGoalScope, right: RelationshipGoalScope): boolean {
  return left.actorId === right.actorId
    && left.baseUrl === right.baseUrl
    && left.profileId === right.profileId;
}

export function acceptRelationshipGoalSaveReceipt(
  attempt: RelationshipGoalSaveAttempt,
  value: unknown,
  currentScope: RelationshipGoalScope,
): RelationshipGoalSaveConfirmation {
  if (!sameScope(attempt.scope, currentScope)) return { ok: false };

  const receipt = z.object({
    editor: z.object({ lastSavedAt: timestamp }),
    mutationId: z.literal(attempt.mutationId),
    profile: z.object({
      id: z.literal(attempt.scope.profileId),
      relationshipGoal: z.literal(attempt.body.relationshipGoal),
      updatedAt: timestamp,
    }),
  }).safeParse(value);

  if (!receipt.success) return { ok: false };
  const updatedAt = receipt.data.profile.updatedAt;
  if (
    receipt.data.editor.lastSavedAt !== updatedAt
    || Date.parse(updatedAt) <= Date.parse(attempt.body.expectedUpdatedAt)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    relationshipGoal: receipt.data.profile.relationshipGoal,
    updatedAt,
  };
}
