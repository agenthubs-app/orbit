/**
 * agent-design AG02: the one server-side preview of a card (设计稿 §5.1 actionPreview). The single-
 * card GET, the decision response and the result document all return this; clients render it and
 * never assemble card fields themselves. Expiry is judged from expiresAt when it is read.
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import type { AgentActionRecord, AgentRunDetail } from "./contract";
import { cardOperationStatus, effectiveCardStatus } from "./decision";

export function agentCardPreview(action: AgentActionRecord, detail: AgentRunDetail | null, now: string): AgentActionPreviewContract {
  return {
    actionId: action.actionId,
    ...(action.contentChanges?.length ? { changes: action.contentChanges.map((change) => ({ ...change })) } : {}),
    ...(action.expiresAt ? { expiresAt: action.expiresAt } : {}),
    ...(action.locale === "zh" || action.locale === "ja" || action.locale === "en" ? { locale: action.locale } : {}),
    operations: action.operations.map((op) => ({
      after: { ...(op.after ?? op.payload) },
      ...(op.before ? { before: { ...op.before } } : {}),
      capability: op.capability ?? op.operationType,
      ...(op.dependsOn?.length ? { dependsOn: [...op.dependsOn] } : {}),
      ...(op.display ? { display: { ...op.display, rows: op.display.rows.map((row) => ({ ...row })) } } : {}),
      operationId: op.operationId,
      ...(op.partId ? { partId: op.partId } : {}),
      ...(op.shown ? { shown: { ...op.shown } } : {}),
      status: cardOperationStatus(op.operationId, action, detail, now),
      ...(op.targetRef ? { target: { ...op.targetRef } } : {}),
      text: op.preview,
    })),
    ...(action.origin ? { origin: { ...action.origin } } : {}),
    payloadHash: action.payloadHash ?? action.immutablePayloadHash,
    revision: action.revision ?? 1,
    revisions: (action.revisions ?? []).map((item) => ({ payloadHash: item.payloadHash, revision: item.revision })),
    status: effectiveCardStatus(action, now),
    summary: action.preview,
    title: action.title,
    updatedAt: action.updatedAt,
  };
}
