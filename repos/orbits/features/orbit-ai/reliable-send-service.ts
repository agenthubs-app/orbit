import { createHash } from "node:crypto";

import type { AiSessionOriginContract, AiSessionOriginInputContract } from "../../shared/contract/ai-sessions";
import {
  ORBIT_AGENT_CHAT_HISTORY_WINDOW,
  type OrbitAgentChatSessionProvider,
} from "./storage/orbit-agent-chat-session-live-record-provider";

export interface ReliableSendInput {
  clientMessageId: string;
  expectedMessageRevision: number;
  locale: string;
  message: string;
  origin?: AiSessionOriginInputContract | undefined;
  protocolVersion: 2;
  references: readonly { id: string; type: "contact" | "event" | "note" }[];
  requestId: string;
  sessionId: string;
}

export type ReliableSendState = "completed" | "failed_before_execution" | "outcome_unknown" | "pending";
type TrustedOriginVerification = NonNullable<AiSessionOriginContract["verification"]>;
type ReliableAssistantMessage = {
  id: string;
  originVerification?: TrustedOriginVerification | undefined;
  text: string;
};

export interface ReliableSendRequestRecord<TResult> {
  assistantMessage?: ReliableAssistantMessage;
  fingerprint: string;
  requestId: string;
  result?: TResult;
  sessionId: string;
  state: ReliableSendState;
}

export interface OrbitAgentChatRequestStore {
  complete<TResult>(requestId: string, fingerprint: string, result: TResult): Promise<void>;
  get<TResult>(requestId: string): Promise<ReliableSendRequestRecord<TResult> | null>;
  markFailedBeforeExecution(requestId: string, fingerprint: string): Promise<void>;
  markOutcomeUnknown<TResult>(
    requestId: string,
    fingerprint: string,
    recovery?: {
      assistantMessage: ReliableAssistantMessage;
      result: TResult;
    },
  ): Promise<void>;
  claimSessionRevision(
    sessionId: string,
    expectedMessageRevision: number,
    requestId: string,
  ): Promise<void>;
  reserve(
    requestId: string,
    fingerprint: string,
    sessionId: string,
  ): Promise<"existing" | "started">;
  /**
   * The actor's request record whose stored result carries this agent run id
   * (0103: the run's timing steps are read from here). Exact, indexed lookup.
   */
  findByRunId?(runId: string): Promise<{ result: unknown; updatedAt?: string } | null>;
}

/** The agent run id a stored conversation result refers to, if any. */
export function runIdOfResult(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const data = (result as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const runId = (data as { runId?: unknown }).runId;
  return typeof runId === "string" && runId.trim() ? runId : null;
}

export class ReliableSendError extends Error {
  constructor(readonly code: "REQUEST_ID_REUSED" | "SESSION_REVISION_CONFLICT") {
    super(code);
  }
}

function canonicalFingerprint(input: ReliableSendInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        clientMessageId: input.clientMessageId,
        expectedMessageRevision: input.expectedMessageRevision,
        locale: input.locale,
        message: input.message,
        origin: input.origin
          ? {
              entryClient: input.origin.entryClient,
              entryPointId: input.origin.entryPointId,
              initialGroupId: input.origin.initialGroupId,
              kind: input.origin.kind,
              sourceDataVersion: input.origin.sourceDataVersion ?? null,
              template: input.origin.template,
            }
          : null,
        protocolVersion: input.protocolVersion,
        references: [...input.references]
          .map((reference) => ({ id: reference.id, type: reference.type }))
          .sort((left, right) =>
            `${left.type}\u0000${left.id}`.localeCompare(
              `${right.type}\u0000${right.id}`,
            ),
          ),
        requestId: input.requestId,
        sessionId: input.sessionId,
      }),
    )
    .digest("hex");
}

export function createMemoryOrbitAgentChatRequestStore(): OrbitAgentChatRequestStore {
  const records = new Map<string, ReliableSendRequestRecord<unknown>>();
  const sessionClaims = new Map<
    string,
    { claimedRevision: number; requestId: string }
  >();
  return {
    async complete<TResult>(requestId: string, fingerprint: string, result: TResult) {
      const existing = records.get(requestId);
      if (existing && existing.fingerprint !== fingerprint) {
        throw new ReliableSendError("REQUEST_ID_REUSED");
      }
      const sessionId = existing?.sessionId ?? "";
      records.set(requestId, {
        fingerprint,
        requestId,
        result,
        sessionId,
        state: "completed",
      });
    },
    async findByRunId(runId: string) {
      for (const record of records.values()) {
        if (record.result !== undefined && runIdOfResult(record.result) === runId) {
          return { result: record.result };
        }
      }
      return null;
    },
    async get<TResult>(requestId: string) {
      return (
        (records.get(requestId) as
          | ReliableSendRequestRecord<TResult>
          | undefined) ?? null
      );
    },
    async markOutcomeUnknown<TResult>(
      requestId: string,
      fingerprint: string,
      recovery?: {
        assistantMessage: ReliableAssistantMessage;
        result: TResult;
      },
    ) {
      const existing = records.get(requestId);
      if (existing && existing.fingerprint !== fingerprint) {
        throw new ReliableSendError("REQUEST_ID_REUSED");
      }
      records.set(requestId, {
        assistantMessage: recovery?.assistantMessage,
        fingerprint,
        requestId,
        result: recovery?.result,
        sessionId: existing?.sessionId ?? "",
        state: "outcome_unknown",
      });
    },
    async claimSessionRevision(sessionId, expectedMessageRevision, requestId) {
      const existing = sessionClaims.get(sessionId);
      if (
        existing &&
        existing.requestId !== requestId &&
        expectedMessageRevision < existing.claimedRevision
      ) {
        throw new ReliableSendError("SESSION_REVISION_CONFLICT");
      }
      sessionClaims.set(sessionId, {
        claimedRevision: expectedMessageRevision + 1,
        requestId,
      });
    },
    async markFailedBeforeExecution(requestId: string, fingerprint: string) {
      const existing = records.get(requestId);
      if (existing && existing.fingerprint !== fingerprint) {
        throw new ReliableSendError("REQUEST_ID_REUSED");
      }
      records.set(requestId, {
        fingerprint,
        requestId,
        sessionId: existing?.sessionId ?? "",
        state: "failed_before_execution",
      });
    },
    async reserve(requestId: string, fingerprint: string, sessionId: string) {
      const existing = records.get(requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new ReliableSendError("REQUEST_ID_REUSED");
        }
        if (existing.state === "failed_before_execution") {
          records.set(requestId, { ...existing, state: "pending" });
          return "started";
        }
        return "existing";
      }
      records.set(requestId, {
        fingerprint,
        requestId,
        sessionId,
        state: "pending",
      });
      return "started";
    },
  };
}

export function createReliableOrbitAgentSendService(dependencies: {
  now: () => string;
  requestStore: OrbitAgentChatRequestStore;
  sessionProvider: OrbitAgentChatSessionProvider;
}) {
  // Sprint 0112: a send reads the session header and its latest messages (for
  // the model history) once, then appends the user message and the reply. It
  // never reads or rewrites the whole session, so its cost does not grow with it.
  const appendAssistant = (
    sessionId: string,
    assistant: ReliableAssistantMessage,
    createdAt: string,
  ) => dependencies.sessionProvider.appendMessages(sessionId, {
    messages: [{ createdAt, id: assistant.id, role: "assistant", text: assistant.text }],
    updatedAt: createdAt,
    verification: assistant.originVerification,
  });

  return {
    async send<TResult>(request: {
      execute: (prepared?: {
        history: readonly { role: "user" | "assistant"; content: string }[];
        trustedOriginVerification?: TrustedOriginVerification | undefined;
      }) => Promise<{
        assistantMessage?: ReliableAssistantMessage;
        result: TResult;
      }>;
      input: ReliableSendInput;
      prepareExecution?: () => Promise<{
        trustedOriginVerification?: TrustedOriginVerification | undefined;
      }>;
    }): Promise<
      | { replayed: boolean; result: TResult; state: "completed" }
      | { replayed: boolean; state: Exclude<ReliableSendState, "completed"> }
    > {
      const fingerprint = canonicalFingerprint(request.input);
      const reservation = await dependencies.requestStore.reserve(
        request.input.requestId,
        fingerprint,
        request.input.sessionId,
      );
      if (reservation === "existing") {
        const existing = await dependencies.requestStore.get<TResult>(
          request.input.requestId,
        );
        if (!existing || existing.fingerprint !== fingerprint) {
          throw new ReliableSendError("REQUEST_ID_REUSED");
        }
        if (existing.state === "completed") {
          return {
            replayed: true,
            result: existing.result as TResult,
            state: "completed",
          };
        }
        if (
          existing.state === "outcome_unknown" &&
          existing.assistantMessage &&
          existing.result !== undefined
        ) {
          // Appending is idempotent by message id: a reply that was saved is left
          // alone, a missing one (and its trusted marker) is added now.
          try {
            await appendAssistant(request.input.sessionId, existing.assistantMessage, dependencies.now());
          } catch {
            return { replayed: true, state: "outcome_unknown" };
          }
          await dependencies.requestStore.complete(
            request.input.requestId,
            fingerprint,
            existing.result,
          );
          return {
            replayed: true,
            result: existing.result,
            state: "completed",
          };
        }
        return { replayed: true, state: existing.state };
      }

      let prepared: { trustedOriginVerification?: TrustedOriginVerification | undefined } | undefined;
      try {
        prepared = await request.prepareExecution?.();
      } catch (error) {
        await dependencies.requestStore.markFailedBeforeExecution(
          request.input.requestId,
          fingerprint,
        );
        throw error;
      }

      let current: Awaited<
        ReturnType<OrbitAgentChatSessionProvider["getSession"]>
      >;
      try {
        current = await dependencies.sessionProvider.getSession(
          request.input.sessionId,
          { limit: ORBIT_AGENT_CHAT_HISTORY_WINDOW + 1 },
        );
      } catch (error) {
        await dependencies.requestStore.markFailedBeforeExecution(
          request.input.requestId,
          fingerprint,
        );
        throw error;
      }
      const currentRevision = current?.messageRevision ?? current?.messages.length ?? 0;
      const lastMessage = current?.messages.at(-1);
      const userMessageAlreadyPersisted =
        currentRevision === request.input.expectedMessageRevision + 1 &&
        lastMessage?.id === request.input.clientMessageId &&
        lastMessage.role === "user" &&
        lastMessage.text === request.input.message;
      const verifiedAnalysisStartsAtFirstTurn = !prepared?.trustedOriginVerification || (
        request.input.expectedMessageRevision === 0 &&
        (
          current === null ||
          ((current.messageCount ?? current.messages.length) === 1 && userMessageAlreadyPersisted)
        )
      );
      if (!verifiedAnalysisStartsAtFirstTurn) {
        await dependencies.requestStore.markFailedBeforeExecution(
          request.input.requestId,
          fingerprint,
        );
        throw new ReliableSendError("SESSION_REVISION_CONFLICT");
      }
      if (
        currentRevision !== request.input.expectedMessageRevision &&
        !userMessageAlreadyPersisted
      ) {
        await dependencies.requestStore.markFailedBeforeExecution(
          request.input.requestId,
          fingerprint,
        );
        throw new ReliableSendError("SESSION_REVISION_CONFLICT");
      }
      try {
        await dependencies.requestStore.claimSessionRevision(
          request.input.sessionId,
          request.input.expectedMessageRevision,
          request.input.requestId,
        );
      } catch (error) {
        await dependencies.requestStore.markFailedBeforeExecution(
          request.input.requestId,
          fingerprint,
        );
        throw error;
      }

      if (!userMessageAlreadyPersisted) {
        const userCreatedAt = dependencies.now();
        try {
          await dependencies.sessionProvider.appendMessages(request.input.sessionId, {
            create: {
              createdAt: userCreatedAt,
              origin: request.input.origin
                ? {
                    ...request.input.origin,
                    firstSentText: request.input.message,
                    firstUserMessageId: request.input.clientMessageId,
                    recordedAt: userCreatedAt,
                    references: request.input.references,
                    schemaVersion: 1,
                  }
                : undefined,
              title: request.input.message.slice(0, 120),
            },
            messages: [{
              createdAt: userCreatedAt,
              id: request.input.clientMessageId,
              references: request.input.references,
              role: "user",
              text: request.input.message,
            }],
            updatedAt: userCreatedAt,
          });
        } catch (error) {
          await dependencies.requestStore.markFailedBeforeExecution(
            request.input.requestId,
            fingerprint,
          );
          throw error;
        }
      }

      let executed: Awaited<ReturnType<typeof request.execute>>;
      try {
        const history = ((userMessageAlreadyPersisted
          ? current?.messages.slice(0, -1)
          : current?.messages
        ) ?? []).slice(-ORBIT_AGENT_CHAT_HISTORY_WINDOW);
        executed = await request.execute({
          ...prepared,
          history: history.map(({ role, text }) => ({ role, content: text })),
        });
      } catch {
        await dependencies.requestStore.markOutcomeUnknown(
          request.input.requestId,
          fingerprint,
        );
        return { replayed: false, state: "outcome_unknown" };
      }

      if (!executed.assistantMessage) {
        await dependencies.requestStore.complete(
          request.input.requestId,
          fingerprint,
          executed.result,
        );
        return { replayed: false, result: executed.result, state: "completed" };
      }

      const verified = prepared?.trustedOriginVerification;
      const executionVerification = executed.assistantMessage.originVerification;
      const originVerification = verified && executionVerification &&
        verified.analysisVersion === executionVerification.analysisVersion &&
        verified.kind === executionVerification.kind &&
        verified.sourceDataVersion === executionVerification.sourceDataVersion
        ? verified : undefined;
      try {
        await appendAssistant(
          request.input.sessionId,
          { ...executed.assistantMessage, originVerification },
          dependencies.now(),
        );
        await dependencies.requestStore.complete(
          request.input.requestId,
          fingerprint,
          executed.result,
        );
      } catch {
        await dependencies.requestStore.markOutcomeUnknown(
          request.input.requestId,
          fingerprint,
          {
            assistantMessage: {
              ...executed.assistantMessage,
              originVerification,
            },
            result: executed.result,
          },
        );
        return { replayed: false, state: "outcome_unknown" };
      }

      return { replayed: false, result: executed.result, state: "completed" };
    },
  };
}
