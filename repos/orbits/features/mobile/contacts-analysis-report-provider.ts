import { createHash } from "node:crypto";

import type { MobileContactsDashboardPayload } from "../../shared/api-schema/mobile-contacts-dashboard";
import type { OrbitAgentChatSessionProvider } from "../orbit-ai/storage/orbit-agent-chat-session-live-record-provider";

export const CONTACTS_ANALYSIS_VERSION = "contacts.analysis@1" as const;

export type ContactsAnalysisSource = Pick<
  MobileContactsDashboardPayload,
  "aggregate" | "contacts" | "distributions" | "gaps" | "opportunities" | "profile" | "summary"
>;

export interface ContactsAnalysisReport {
  analysisVersion: typeof CONTACTS_ANALYSIS_VERSION;
  body: string;
  generatedAt: string;
  messageId: string;
  sessionId: string;
  sourceDataVersion: string;
}

export interface ContactsAnalysisPayload {
  current: {
    analysisVersion: typeof CONTACTS_ANALYSIS_VERSION;
    sourceDataVersion: string;
  };
  report: ContactsAnalysisReport | null;
  stale: boolean;
}

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | {
  [key: string]: CanonicalValue;
};

const RESPONSE_ASSEMBLY_TIME_KEYS = new Set([
  "collectedAt",
  "evaluatedAt",
  "generatedAt",
  "recomputedAt",
]);

const UNORDERED_COLLECTION_KEYS = new Set([
  "contacts",
  "dirtyFields",
  "evidenceIds",
  "preferredIntroChannels",
  "references",
  "tags",
  "targetRelationshipTypes",
  "validationMessages",
]);

function canonicalize(value: unknown, key?: string): CanonicalValue | undefined {
  if (key && RESPONSE_ASSEMBLY_TIME_KEYS.has(key)) return undefined;
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    const normalized = value.flatMap((item) => {
        const normalized = canonicalize(item);
        return normalized === undefined ? [] : [normalized];
      });
    return key && UNORDERED_COLLECTION_KEYS.has(key)
      ? normalized.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : normalized;
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, CanonicalValue> = {};
    for (const [childKey, childValue] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
      const normalized = canonicalize(childValue, childKey);
      if (normalized !== undefined) result[childKey] = normalized;
    }
    return result;
  }
  return undefined;
}

export function createContactsAnalysisSourceDataVersion(source: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(source) ?? null))
    .digest("hex");
}

export function verifyContactsAnalysisSourceVersion(input: {
  claimed: string;
  source: ContactsAnalysisSource;
}): {
  analysisVersion: typeof CONTACTS_ANALYSIS_VERSION;
  kind: "contacts_analysis_execution";
  sourceDataVersion: string;
} | null {
  const sourceDataVersion = createContactsAnalysisSourceDataVersion(input.source);
  return input.claimed === sourceDataVersion
    ? {
        analysisVersion: CONTACTS_ANALYSIS_VERSION,
        kind: "contacts_analysis_execution",
        sourceDataVersion,
      }
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function persistedReport(
  session: Awaited<ReturnType<OrbitAgentChatSessionProvider["getSession"]>>,
): ContactsAnalysisReport | null {
  if (
    !session ||
    session.origin?.entryPointId !== "contacts.analysis" ||
    session.origin.kind !== "structured" ||
    session.origin.template?.id !== "contacts.analysis" ||
    session.origin.template.version !== 1 ||
    session.origin.verification?.kind !== "contacts_analysis_execution" ||
    session.origin.verification.analysisVersion !== CONTACTS_ANALYSIS_VERSION ||
    session.origin.verification.sourceDataVersion !== session.origin.sourceDataVersion ||
    !nonEmptyString(session.origin.sourceDataVersion) ||
    !/^[a-f0-9]{64}$/.test(session.origin.sourceDataVersion)
  ) {
    return null;
  }

  const firstUserMessageIndex = session.messages.findIndex(
    (message) =>
      message.role === "user" && message.id === session.origin?.firstUserMessageId,
  );
  const assistant = firstUserMessageIndex >= 0
    ? session.messages[firstUserMessageIndex + 1]
    : undefined;
  if (
    assistant?.role !== "assistant" ||
    !nonEmptyString(assistant.id) ||
    !nonEmptyString(assistant.text) ||
    !nonEmptyString(assistant.createdAt) ||
    !Number.isFinite(new Date(assistant.createdAt).getTime())
  ) {
    return null;
  }

  return {
    analysisVersion: CONTACTS_ANALYSIS_VERSION,
    body: assistant.text,
    generatedAt: new Date(assistant.createdAt).toISOString(),
    messageId: assistant.id,
    sessionId: session.id,
    sourceDataVersion: session.origin.sourceDataVersion,
  };
}

export function createContactsAnalysisReportProvider(input: {
  sessionProvider: OrbitAgentChatSessionProvider | null;
}) {
  return {
    async getAnalysis({ source }: { source: ContactsAnalysisSource }): Promise<
      | { success: true; data: ContactsAnalysisPayload }
      | { success: false; error: "unavailable" }
    > {
      if (!input.sessionProvider) return { success: false, error: "unavailable" };

      try {
        const currentSourceDataVersion = createContactsAnalysisSourceDataVersion(source);
        const sessions = await input.sessionProvider.listSessionsByEntryPoint("contacts.analysis");
        const report = sessions
          .flatMap((session) => {
            const candidate = persistedReport(session);
            return candidate ? [candidate] : [];
          })
          .sort(
            (left, right) =>
              right.generatedAt.localeCompare(left.generatedAt) ||
              right.messageId.localeCompare(left.messageId),
          )[0] ?? null;

        return {
          success: true,
          data: {
            current: {
              analysisVersion: CONTACTS_ANALYSIS_VERSION,
              sourceDataVersion: currentSourceDataVersion,
            },
            report,
            stale: report ? report.sourceDataVersion !== currentSourceDataVersion : false,
          },
        };
      } catch {
        return { success: false, error: "unavailable" };
      }
    },
  };
}
