import type { TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { createAccountDeletionRecordStore } from "../deletion-records";
import { purgeAccountAgentData } from "./agent";
import { purgeAccountConnections } from "./connections";
import { purgeAccountContacts } from "./contacts";
import { purgeAccountEvents } from "./events";
import { purgeAccountExports } from "./exports";
import { deliverAccountCompletionMailOnce, purgeAccountFinalIdentity } from "./final-identity";
import { purgeAccountInbox } from "./inbox";
import { assertLocalAccountPurgeDatabase, assertLocalAccountPurgeTarget } from "./local-gate";
import { purgeAccountNotes } from "./notes";
import { purgeAccountPlans } from "./plans";
import { createAccountPurgeProgressStore } from "./progress";

type Dependencies = {
  db: TransactionalPostgresClient;
  workspaceId: string;
  storage: { delete(actorId: string, key: string): Promise<void> };
  eraseObject(key: string): Promise<void>;
  revokeToken?: (sourceId: string, encryptedPayload: unknown) => Promise<void>;
  sendCompletion(input: { email: string; idempotencyKey: string }): Promise<void>;
  now?: () => Date;
};

/** A single local-only claim and its ordered domain steps. Production has no entrypoint. */
export async function runLocalAccountPurgeOnce(input: Dependencies): Promise<
  { kind: "idle" } | { kind: "failed"; step: string; reason: string } | { kind: "deleted"; deleted: number }
> {
  assertLocalAccountPurgeTarget();
  await assertLocalAccountPurgeDatabase(input.db);
  const { db, workspaceId } = input;
  // 主会话代定 §R18c-5: a crash after identity commit leaves only the
  // anonymous completion outbox. Drain it before looking for another account.
  try {
    await deliverAccountCompletionMailOnce({ db, workspaceId, sendCompletion: input.sendCompletion, now: input.now });
  } catch (error) {
    return { kind: "failed", step: "completion-mail", reason: error instanceof Error ? error.message : "UNKNOWN" };
  }
  const records = createAccountDeletionRecordStore({ db, workspaceId, now: input.now });
  const progress = createAccountPurgeProgressStore({ db, workspaceId, now: input.now });
  const claim = await records.claimNextPurge();
  if (!claim) return { kind: "idle" };
  const { actorId, userId } = claim.request;
  const { leaseToken } = claim;
  const steps = [
    { id: "connections", run: () => purgeAccountConnections({ db, workspaceId, actorId, userId, revokeToken: input.revokeToken }) },
    { id: "exports", run: () => purgeAccountExports({ db, workspaceId, actorId, storage: input.storage }) },
    { id: "contacts", run: () => purgeAccountContacts({ db, workspaceId, actorId, eraseObject: input.eraseObject }) },
    { id: "notes", run: () => purgeAccountNotes(db, workspaceId, actorId) },
    { id: "plans", run: () => purgeAccountPlans(db, workspaceId, actorId) },
    { id: "agent", run: () => purgeAccountAgentData(db, workspaceId, actorId) },
    { id: "events", run: () => purgeAccountEvents(db, workspaceId, actorId) },
    { id: "inbox", run: () => purgeAccountInbox(db, workspaceId, actorId) },
  ] as const;
  for (const step of steps) {
    try {
      if (await progress.get(actorId, step.id)) continue;
      const result = await step.run();
      await progress.complete(actorId, leaseToken, step.id, { deleted: result.deleted,
        ...("retainedPseudonymizedAuditRows" in result && typeof result.retainedPseudonymizedAuditRows === "number"
          ? { retainedPseudonymizedAuditRows: result.retainedPseudonymizedAuditRows } : {}),
        ...("objects" in result && typeof result.objects === "number" ? { objects: result.objects } : {}) });
    } catch (error) {
      return { kind: "failed", step: step.id, reason: error instanceof Error ? error.message : "UNKNOWN" };
    }
  }
  try {
    const result = await purgeAccountFinalIdentity({ db, workspaceId, actorId, userId, leaseToken,
      sendCompletion: input.sendCompletion, now: input.now });
    return { kind: "deleted", deleted: result.deleted };
  } catch (error) {
    return { kind: "failed", step: "final-identity", reason: error instanceof Error ? error.message : "UNKNOWN" };
  }
}
