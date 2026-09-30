import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createRelationshipBoundedReader } from "./bounded-reader";

export function createRelationshipReadService(actor: { id: string; accountId?: string; workspaceId?: string }) {
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime || (actor.workspaceId && actor.workspaceId !== runtime.workspaceId)) throw new Error("RELATIONSHIP_STORAGE_UNAVAILABLE");
  for (const collectionName of ["relationship_conversation_members", "relationship_conversations", "relationship_messages"]) {
    resolveSharedReadBudgetGate()?.assertAllowed({ collectionName });
  }
  return createRelationshipBoundedReader({ ...runtime, actorId: actor.accountId ?? actor.id,
    cursorSecret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  });
}
