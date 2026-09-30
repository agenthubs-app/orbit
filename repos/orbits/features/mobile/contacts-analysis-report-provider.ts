import { createHash } from "node:crypto";

import type { MobileContactsDashboardPayload } from "../../shared/api-schema/mobile-contacts-dashboard";
import type { OrbitAgentChatSessionProvider } from "../orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { isContactsAnalysisReportBody } from "../orbit-ai/contacts-analysis-execution";

export const CONTACTS_ANALYSIS_VERSION = "contacts.analysis@1" as const;

export type ContactsAnalysisSource = Pick<
  MobileContactsDashboardPayload,
  "aggregate" | "contacts" | "distributions" | "gaps" | "opportunities" | "profile" | "summary"
> & {
  /**
   * Sprint 0102: the actor's relationship-graph version when the database
   * provides one. The source data version is then derived from it and the
   * bounded profile input (0121), so the AI entry can verify a page's version
   * with the version query and the profile read, before reading any section.
   */
  graphVersion?: string;
};

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

/**
 * Profile fields the analysis model can reason about (goal coverage, next
 * steps). With a graph version, the AI source data version binds exactly these
 * plus the section state, so editing the relationship goal makes a report stale
 * while birth date, avatar, handles, timestamps and editor state do not.
 */
export const CONTACTS_ANALYSIS_PROFILE_FIELDS = [
  "displayName",
  "headline",
  "organization",
  "role",
  "homeMarket",
  "relationshipGoal",
  "targetRelationshipTypes",
  "preferredFollowUpWindow",
  "preferredLanguage",
  "preferredIntroChannels",
  "industry",
  "primaryIndustryId",
  "secondaryIndustryId",
  "seniorityLevel",
  "bio",
  "offering",
  "seeking",
  "topics",
  "spokenLanguages",
] as const;

/** The bounded profile input of the analysis version; null when the profile section is unavailable. */
export function contactsAnalysisProfileInput(section: unknown): CanonicalValue {
  if (!section || typeof section !== "object") return null;
  const { state, profile } = section as { state?: unknown; profile?: unknown };
  const fields = profile && typeof profile === "object"
    ? Object.fromEntries(CONTACTS_ANALYSIS_PROFILE_FIELDS.flatMap((field) => {
        const value = (profile as Record<string, unknown>)[field];
        return value === undefined ? [] : [[field, value]];
      }))
    : null;
  return canonicalize({ state: typeof state === "string" ? state : null, profile: fields }) ?? null;
}

/**
 * 64-hex AI source data version for a relationship-graph version and the
 * page's profile section (same format as the content hash). The graph version
 * alone still keys the gaps/opportunities snapshot (0102); the AI report also
 * depends on the profile the model reads, so both are bound here (0121).
 */
export function contactsAnalysisGraphSourceDataVersion(graphVersion: string, profileSection: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(["contacts.analysis.graph@2", graphVersion, contactsAnalysisProfileInput(profileSection)]))
    .digest("hex");
}

export function createContactsAnalysisSourceDataVersion(source: Record<string, unknown>): string {
  // Without a graph version (mock mode, no sync_revision column) the version
  // stays the canonical content hash, which already covers the profile.
  if (typeof source.graphVersion === "string") {
    return contactsAnalysisGraphSourceDataVersion(source.graphVersion, source.profile);
  }
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
    session?.messages[firstUserMessageIndex]?.text !== session?.origin?.firstSentText ||
    assistant?.role !== "assistant" ||
    !nonEmptyString(assistant.id) ||
    !nonEmptyString(assistant.text) ||
    !isContactsAnalysisReportBody(assistant.text) ||
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
