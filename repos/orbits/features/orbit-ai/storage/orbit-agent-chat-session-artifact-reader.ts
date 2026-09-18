import { createHash } from "node:crypto";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { contactArtifactToDisplay } from "../../../shared/api-schema/ai-artifacts";
import type { AiSessionArtifactRecoveryContract, AiSessionArtifactTurnContract } from "../../../shared/contract/ai-artifacts";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import type { OrbitAgentChatSessionSnapshot } from "./orbit-agent-chat-session-live-record-provider";

export interface OrbitAgentChatSessionArtifactReader { read(session: OrbitAgentChatSessionSnapshot): Promise<AiSessionArtifactRecoveryContract> }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const otherKinds = new Set(["event_recommendations", "email_context", "followup_queue", "relationship_chat_context", "generic", "self_profile", "data_query"]);
interface RequestRow { record_id: string; request_id: string; source_bytes: number; payload: unknown }

export function createTransactionalOrbitAgentChatSessionArtifactReader(input: { actorId: string; workspaceId: string; client: TransactionalSqlExecutor }): OrbitAgentChatSessionArtifactReader {
  return { async read(session) {
    // Never download unbounded actor history or an oversized request body.
    const { rows } = await input.client.query<RequestRow>(`
      SELECT record_id, payload->>'requestId' AS request_id,
        octet_length(payload::text) AS source_bytes,
        CASE WHEN octet_length(payload::text) <= 262144 THEN payload ELSE NULL END AS payload
      FROM orbit_records
      WHERE workspace_id = $1 AND user_id = $2 AND collection_name = $3
        AND payload->>'sessionId' = $4 AND deleted_at IS NULL AND lifecycle_state = 'active'
        AND payload->>'state' = 'completed' AND payload->'result'->>'success' = 'true'
      ORDER BY updated_at DESC, record_id ASC LIMIT 101
    `, [input.workspaceId, input.actorId, "orbit_agent_chat_requests", session.id]);
    const recovery: AiSessionArtifactRecoveryContract = { turns: [], truncated: rows.length > 100 };
    const candidates: AiSessionArtifactTurnContract[] = [];
    for (const row of rows.slice(0, 100)) {
      if (Number(row.source_bytes) > 262144) { recovery.oversized = true; recovery.unavailable = true; continue; }
      const source = row.payload;
      if (!record(source) || source.sessionId !== session.id || source.state !== "completed" || typeof source.requestId !== "string"
        || row.request_id !== source.requestId || row.record_id !== createHash("sha256").update(JSON.stringify([input.actorId, source.requestId])).digest("hex")) { recovery.unavailable = true; continue; }
      const result = source.result;
      const data = record(result) && result.success === true && record(result.data) ? result.data : null;
      if (!data || !Array.isArray(data.messages) || !Array.isArray(data.artifacts) || typeof data.activeConversationId !== "string") { recovery.unavailable = true; continue; }
      const messages = data.messages.filter(record);
      const index = messages.findLastIndex(message => message.role === "assistant");
      const assistant = messages[index]; const user = messages[index - 1];
      const assistantId = typeof assistant?.messageId === "string" && assistant.messageId ? assistant.messageId : `assistant:${source.requestId}`;
      const savedIndex = session.messages.findIndex(message => message.id === assistantId && message.role === "assistant");
      const savedUser = session.messages[savedIndex - 1];
      if (!assistant || !user || user.role !== "user" || savedIndex < 1 || savedUser?.role !== "user" || !savedUser.id
        || session.messages.filter(message => message.id === assistantId).length !== 1 || session.messages.filter(message => message.id === savedUser.id).length !== 1
        || messages.some(message => message.conversationId !== data.activeConversationId)
        || messages.filter(message => message.messageId === assistant.messageId).length !== 1
        || typeof assistant.content !== "string" || typeof user.content !== "string"
        || session.messages[savedIndex]?.text.trim() !== assistant.content.trim().slice(0, 12000) || savedUser.text.trim() !== user.content.trim().slice(0, 12000)) { recovery.unavailable = true; continue; }
      const artifacts = data.artifacts.slice(0, 16).filter(value => {
        const kind = record(value) && record(value.task) ? value.task.kind : undefined;
        return typeof kind !== "string" || !otherKinds.has(kind);
      }).map(value => record(value) && record(value.task) && value.task.conversationId === data.activeConversationId ? contactArtifactToDisplay(value) : contactArtifactToDisplay(null));
      if (data.artifacts.length > 16) { recovery.truncated = true; artifacts.push(contactArtifactToDisplay(null)); }
      if (artifacts.length) candidates.push({ sessionId: session.id, requestId: source.requestId, userMessageId: savedUser.id, assistantMessageId: assistantId, status: "ready", artifacts: artifacts.slice(0, 16) });
    }
    for (const turn of candidates) {
      if (candidates.filter(value => value.assistantMessageId === turn.assistantMessageId).length !== 1) { recovery.unavailable = true; continue; }
      const next = { ...recovery, turns: [...recovery.turns, turn] };
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > 131000) { recovery.truncated = true; recovery.oversized = true; break; }
      recovery.turns.push(turn);
    }
    return recovery;
  } };
}

export function createOrbitAgentChatSessionArtifactReader(mode: FeatureMode, actorId: string): OrbitAgentChatSessionArtifactReader | null {
  if (mode === "mock") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? createTransactionalOrbitAgentChatSessionArtifactReader({ ...runtime, actorId }) : null;
}
