import { createHash } from "node:crypto";

import type { OrbitAgentChatSessionProvider } from "./storage/orbit-agent-chat-session-live-record-provider";

export interface ReliableSendInput {
  clientMessageId: string;
  expectedMessageRevision: number;
  locale: string;
  message: string;
  protocolVersion: 2;
  references: readonly { id: string; type: "contact" | "event" | "note" }[];
  requestId: string;
  sessionId: string;
}

export type ReliableSendState = "completed" | "failed_before_execution" | "outcome_unknown" | "pending";

export interface ReliableSendRequestRecord<TResult> {
  assistantMessage?: { id: string; text: string };
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
      assistantMessage: { id: string; text: string };
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
        assistantMessage: { id: string; text: string };
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
  return {
    async send<TResult>(request: {
      execute: () => Promise<{
        assistantMessage?: { id: string; text: string };
        result: TResult;
      }>;
      input: ReliableSendInput;
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
          const session = await dependencies.sessionProvider.getSession(
            request.input.sessionId,
          );
          if (!session) return { replayed: true, state: "outcome_unknown" };
          const savedAssistant = session.messages.some(
            (message) =>
              message.id === existing.assistantMessage?.id &&
              message.role === "assistant" &&
              message.text === existing.assistantMessage.text,
          );
          if (!savedAssistant) {
            const assistantCreatedAt = dependencies.now();
            try {
              await dependencies.sessionProvider.upsertSession({
                ...session,
                messageRevision:
                  (session.messageRevision ?? session.messages.length) + 1,
                messages: [
                  ...session.messages,
                  {
                    createdAt: assistantCreatedAt,
                    id: existing.assistantMessage.id,
                    role: "assistant",
                    text: existing.assistantMessage.text,
                  },
                ],
                updatedAt: assistantCreatedAt,
              });
            } catch {
              return { replayed: true, state: "outcome_unknown" };
            }
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

      let current: Awaited<
        ReturnType<OrbitAgentChatSessionProvider["getSession"]>
      >;
      try {
        current = await dependencies.sessionProvider.getSession(
          request.input.sessionId,
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
          await dependencies.sessionProvider.upsertSession({
            createdAt: current?.createdAt ?? userCreatedAt,
            customTitle: current?.customTitle,
            id: request.input.sessionId,
            messageRevision: currentRevision + 1,
            messages: [
              ...(current?.messages ?? []),
              {
                createdAt: userCreatedAt,
                id: request.input.clientMessageId,
                role: "user",
                text: request.input.message,
              },
            ],
            panel: current?.panel,
            pinned: current?.pinned,
            title: current?.title ?? request.input.message.slice(0, 120),
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
        executed = await request.execute();
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

      const assistantCreatedAt = dependencies.now();
      const withUser = await dependencies.sessionProvider.getSession(
        request.input.sessionId,
      );
      if (!withUser) {
        await dependencies.requestStore.markOutcomeUnknown(
          request.input.requestId,
          fingerprint,
          {
            assistantMessage: executed.assistantMessage,
            result: executed.result,
          },
        );
        return { replayed: false, state: "outcome_unknown" };
      }
      try {
        await dependencies.sessionProvider.upsertSession({
          ...withUser,
          messageRevision: (withUser.messageRevision ?? request.input.expectedMessageRevision + 1) + 1,
          messages: [
            ...withUser.messages,
            {
              createdAt: assistantCreatedAt,
              id: executed.assistantMessage.id,
              role: "assistant",
              text: executed.assistantMessage.text,
            },
          ],
          updatedAt: assistantCreatedAt,
        });
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
            assistantMessage: executed.assistantMessage,
            result: executed.result,
          },
        );
        return { replayed: false, state: "outcome_unknown" };
      }

      return { replayed: false, result: executed.result, state: "completed" };
    },
  };
}
