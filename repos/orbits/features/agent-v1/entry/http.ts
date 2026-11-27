/**
 * The HTTP side of the protocol-3 entry (设计稿附录 D): the existing routes call these only when
 * ORBIT_AGENT_V1_MODE=on (and, for the send, only for protocolVersion 3), so with the switch off
 * every route answers exactly as before.
 *
 *   POST /api/ai/conversations (protocolVersion 3)           → handleAgentV1Send
 *   GET  /api/ai/conversations/sessions/[id]?requestId=      → readAgentV1RequestDocument
 *   GET  /api/ai/conversations/sessions/[id]/events          → handleAgentV1Events
 *   POST /api/ai/runs/[requestId]/transition {action:cancel} → handleAgentV1Cancel
 */
import { after, NextResponse } from "next/server";

import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { agentEventsAfterSchema, agentSelectionInputSchema, agentSendInputSchema } from "../../../shared/api-schema/agent-v1";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import type { AgentResultDocument } from "../../../shared/contract/agent-v1";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import type { AiQuotaGate } from "../../ai-quota/gate";
import { createPostgresAiUsageLedger } from "../../ai-quota/ledger";
import { createOrbitAgentChatSessionProvider } from "../../orbit-ai/storage/orbit-agent-chat-session-provider-factory";
import { emitTrace } from "../observability/trace";
import { createGraphExecutor } from "../graph/executor";
import { configuredAgentEntryStore } from "./configured-store";
import { createSessionWriter } from "./legacy-runtime";
import { agentV1EntryEnabled } from "./mode";
import { acceptMessage, acceptSelection, cancelCurrentRun, getRequestResult, listSessionEvents, maybeResumeSession, type AgentEntryDependencies } from "./service";
import { AgentEntryError } from "./store";

const storeFor = configuredAgentEntryStore;

/** Processing runs after the response (next/server `after`); outside a request scope it starts at once. */
function afterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** iOrbit 对话计量（2026-11-27）：live 库上的 AI 账本；mock / hybrid 或没有库：不记账（照常对话）。 */
function usageLedgerFor(mode: FeatureMode): AiQuotaGate | null {
  if (mode === "mock" || mode === "hybrid") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }) : null;
}

export function configuredAgentEntryDependencies(mode: FeatureMode, actorId: string): AgentEntryDependencies | null {
  const store = storeFor(mode);
  if (!store) return null;
  const provider = createOrbitAgentChatSessionProvider(mode, actorId);
  return {
    // AG03: the request graph replaces the existing runtime here; the confirmation boundary stays around it.
    execute: createGraphExecutor(mode),
    schedule: afterResponse,
    sessions: provider ? createSessionWriter(provider) : null,
    store,
    usage: usageLedgerFor(mode),
  };
}

function errorResponse(mode: FeatureMode, error: AppError, status?: number): Response {
  return NextResponse.json(failure(error), { headers: runtimeBoundaryHeaders(mode), status: status ?? getHttpStatusForAppErrorCode(error.code) });
}

export async function handleAgentV1Send(input: {
  body: Record<string, unknown>;
  actorId: string | null;
  mode: FeatureMode;
  dependencies?: AgentEntryDependencies | null;
}): Promise<Response> {
  const { mode } = input;
  if (!agentV1EntryEnabled()) {
    return errorResponse(mode, new AppError("VALIDATION_ERROR", "Protocol version 3 is not enabled on this server; send with protocol version 2."), 400);
  }
  if ("selection" in input.body) return handleAgentV1Select({ ...input, mode });
  const parsed = agentSendInputSchema.safeParse(input.body);
  if (!parsed.success) return errorResponse(mode, new AppError("VALIDATION_ERROR", "A valid protocol 3 conversation request is required."), 400);
  if (parsed.data.origin?.entryPointId === "contacts.analysis") {
    return errorResponse(mode, new AppError("VALIDATION_ERROR", "The contacts analysis entry still sends with protocol version 2."), 400);
  }
  const actorId = input.actorId ?? "mock:anonymous";
  const dependencies = input.dependencies ?? configuredAgentEntryDependencies(mode, actorId);
  if (!dependencies) return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Agent request storage is not configured."), 503);
  try {
    const { receipt } = await acceptMessage(dependencies, { actorId, body: parsed.data });
    return NextResponse.json(success({ agentRequest: receipt }), { headers: runtimeBoundaryHeaders(mode), status: 202 });
  } catch (error) {
    if (error instanceof AgentEntryError) {
      return errorResponse(mode, new AppError("CONFLICT", "This message key was already used with different content."), 409);
    }
    return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Agent request storage is unavailable.", { cause: error }), 503);
  }
}

const SELECTION_REFUSALS: Record<string, { status: number; message: string }> = {
  CLARIFICATION_CLOSED: { message: "These options are no longer open.", status: 409 },
  CLARIFICATION_NOT_FOUND: { message: "These options were not offered in this request.", status: 409 },
  OPTION_NOT_OFFERED: { message: "That option was not one of those offered.", status: 409 },
  REQUEST_ID_REUSED: { message: "This selection key was already used for another choice.", status: 409 },
  REQUEST_NOT_FOUND: { message: "No such request in this conversation.", status: 404 },
  REQUEST_NOT_WAITING: { message: "This request is still being processed; try again when it has answered.", status: 409 },
};

/** AG04: a click under a request's directions (same POST, protocol 3, body with `selection`). */
async function handleAgentV1Select(input: { body: Record<string, unknown>; actorId: string | null; mode: FeatureMode; dependencies?: AgentEntryDependencies | null }): Promise<Response> {
  const { mode } = input;
  const parsed = agentSelectionInputSchema.safeParse(input.body);
  if (!parsed.success) return errorResponse(mode, new AppError("VALIDATION_ERROR", "A valid protocol 3 selection is required."), 400);
  const actorId = input.actorId ?? "mock:anonymous";
  const dependencies = input.dependencies ?? configuredAgentEntryDependencies(mode, actorId);
  if (!dependencies) return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Agent request storage is not configured."), 503);
  try {
    const { receipt } = await acceptSelection(dependencies, { actorId, body: parsed.data });
    return NextResponse.json(success({ agentSelection: receipt }), { headers: runtimeBoundaryHeaders(mode), status: 202 });
  } catch (error) {
    const refusal = error instanceof AgentEntryError ? SELECTION_REFUSALS[error.code] : undefined;
    if (refusal && error instanceof AgentEntryError) {
      const appError = new AppError(refusal.status === 404 ? "NOT_FOUND" : "CONFLICT", refusal.message);
      return NextResponse.json(failure(appError, { reason: error.code }), { headers: runtimeBoundaryHeaders(mode), status: refusal.status });
    }
    return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Agent request storage is unavailable.", { cause: error }), 503);
  }
}

/** The result document of a protocol-3 request in this session, for its owner; null otherwise. */
export async function readAgentV1RequestDocument(input: {
  mode: FeatureMode;
  actorId: string;
  requestId: string;
  sessionId: string;
  dependencies?: AgentEntryDependencies | null;
}): Promise<AgentResultDocument | null> {
  if (!agentV1EntryEnabled()) return null;
  const dependencies = input.dependencies ?? configuredAgentEntryDependencies(input.mode, input.actorId);
  if (!dependencies) return null;
  const document = await getRequestResult(dependencies, { actorId: input.actorId, requestId: input.requestId });
  return document && document.sessionId === input.sessionId ? document : null;
}

/** Stop by requestId. Null when the id is not a protocol-3 request of this account (the caller falls back). */
export async function handleAgentV1Cancel(input: {
  mode: FeatureMode;
  actorId: string | null;
  requestId: string;
  dependencies?: AgentEntryDependencies | null;
}): Promise<Response | null> {
  if (!agentV1EntryEnabled() || !input.actorId) return null;
  const dependencies = input.dependencies ?? configuredAgentEntryDependencies(input.mode, input.actorId);
  if (!dependencies) return null;
  const cancelled = await cancelCurrentRun(dependencies, { actorId: input.actorId, requestId: input.requestId });
  if (!cancelled) return null;
  return NextResponse.json(success({ agentRequest: cancelled }), { headers: runtimeBoundaryHeaders(input.mode), status: 200 });
}

const STREAM_POLL_MS = 300;
const STREAM_MAX_MS = 55_000;
const STREAM_PING_MS = 15_000;

/**
 * The session's event channel. `text/event-stream` gets a stream (id = seq, so a reconnect with
 * Last-Event-ID resumes after it); anything else gets one JSON page of the events after `after`.
 * Only the owner's events are read; another account's session id yields nothing.
 */
export async function handleAgentV1Events(request: Request, input: {
  mode: FeatureMode;
  actorId: string;
  sessionId: string;
  dependencies?: AgentEntryDependencies | null;
  pollMs?: number;
  maxStreamMs?: number;
}): Promise<Response> {
  const { mode } = input;
  if (!agentV1EntryEnabled()) return errorResponse(mode, new AppError("NOT_FOUND", "Not found."), 404);
  const url = new URL(request.url);
  const rawAfter = request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "0";
  const after = agentEventsAfterSchema.safeParse(rawAfter);
  if (!after.success) return errorResponse(mode, new AppError("VALIDATION_ERROR", "after must be a non-negative event sequence number."), 400);
  const dependencies = input.dependencies ?? configuredAgentEntryDependencies(mode, input.actorId);
  if (!dependencies) return errorResponse(mode, new AppError("SERVICE_UNAVAILABLE", "Agent request storage is not configured."), 503);
  const wantsStream = (request.headers.get("accept") ?? "").includes("text/event-stream");
  emitTrace({ after: after.data, sessionId: input.sessionId, stream: wantsStream, type: "entry.channel.open" });
  void maybeResumeSession(dependencies, input.actorId, input.sessionId);

  if (!wantsStream) {
    const page = await listSessionEvents(dependencies, { actorId: input.actorId, afterSeq: after.data, sessionId: input.sessionId });
    if (page.events.length) emitTrace({ after: after.data, seqs: page.events.map((event) => event.seq), sessionId: input.sessionId, stream: false, type: "entry.channel.push" });
    return NextResponse.json(success(page), { headers: runtimeBoundaryHeaders(mode), status: 200 });
  }

  const encoder = new TextEncoder();
  const pollMs = input.pollMs ?? STREAM_POLL_MS;
  const maxStreamMs = input.maxStreamMs ?? STREAM_MAX_MS;
  let lastSeq = after.data;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let lastPing = Date.now();
      let lastResumeCheck = Date.now();
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      while (!closed && Date.now() - startedAt < maxStreamMs) {
        try {
          const page = await listSessionEvents(dependencies, { actorId: input.actorId, afterSeq: lastSeq, sessionId: input.sessionId });
          if (page.events.length && !closed) {
            const frames = page.events.map((event) => `id: ${event.seq}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`).join("");
            controller.enqueue(encoder.encode(frames));
            emitTrace({ after: lastSeq, seqs: page.events.map((event) => event.seq), sessionId: input.sessionId, stream: true, type: "entry.channel.push" });
            lastSeq = page.lastSeq;
          }
          if (Date.now() - lastPing >= STREAM_PING_MS && !closed) {
            controller.enqueue(encoder.encode(": ping\n\n"));
            lastPing = Date.now();
          }
          if (Date.now() - lastResumeCheck >= 5_000) {
            void maybeResumeSession(dependencies, input.actorId, input.sessionId);
            lastResumeCheck = Date.now();
          }
        } catch {
          // keep the stream; the client can always fall back to the query
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      close();
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      ...(runtimeBoundaryHeaders(mode) as Record<string, string>),
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
    status: 200,
  });
}
