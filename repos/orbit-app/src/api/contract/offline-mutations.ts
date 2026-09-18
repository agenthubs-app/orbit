export type MutationKind =
  | "note"
  | "task"
  | "relationship_followup"
  | "personal_schedule";

export type MutationOperation =
  | "create"
  | "update"
  | "delete"
  | "complete"
  | "reopen"
  | "cancel";

export interface Mutation {
  mutationId: string;
  kind: MutationKind;
  entityId: string;
  operation: MutationOperation;
  baseRevision: string | null;
  patch: Record<string, unknown>;
  createdAt: string;
}

export interface CanonicalResult {
  kind: MutationKind;
  id: string;
  revision: string;
  record: unknown | null;
}

export type MutationResult =
  | {
      status: "acknowledged";
      mutationId: string;
      canonical: CanonicalResult;
    }
  | { status: "conflict"; mutationId: string; server: CanonicalResult }
  | {
      status: "retryable" | "permanent";
      mutationId: string;
      code: string;
    }
  | {
      status: "not-authorized";
      mutationId: string;
      level: "account" | "domain";
      domainId: string;
    };
