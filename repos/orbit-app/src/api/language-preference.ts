import { z } from "zod";

import type {
  AccountLanguagePreferenceSaveContract,
  OrbitLanguagePreferenceContract,
} from "./contract/account-language-preference";

const timestamp = z.iso.datetime({ offset: true });
const language = z.enum(["zh", "ja", "en"]);
const preferenceSchema = z.discriminatedUnion("mode", [
  z.object({ language: z.null(), mode: z.literal("system"), updatedAt: timestamp.nullable() }),
  z.object({ language, mode: z.literal("manual"), updatedAt: timestamp }),
]);

export interface LanguagePreferenceScope {
  actorId: string;
  baseUrl: string;
  cookieHeader: string;
}

export interface LanguagePreferenceSaveAttempt {
  body: AccountLanguagePreferenceSaveContract;
  fingerprint: string;
  mutationId: string;
  scope: LanguagePreferenceScope;
}

export function parseLanguagePreference(value: unknown): OrbitLanguagePreferenceContract | null {
  const parsed = preferenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function sameScope(left: LanguagePreferenceScope, right: LanguagePreferenceScope): boolean {
  return left.actorId === right.actorId
    && left.baseUrl === right.baseUrl
    && left.cookieHeader === right.cookieHeader;
}

export function createLanguagePreferenceSaveAttempt(
  input: LanguagePreferenceScope & {
    input: Omit<AccountLanguagePreferenceSaveContract, "mutationId">;
  },
  previous: LanguagePreferenceSaveAttempt | null,
  createMutationId: () => string,
): LanguagePreferenceSaveAttempt {
  const fingerprint = JSON.stringify([
    input.baseUrl,
    input.actorId,
    input.cookieHeader,
    input.input.mode,
    input.input.language,
    input.input.expectedUpdatedAt,
  ]);
  const mutationId = previous?.fingerprint === fingerprint
    ? previous.mutationId
    : `ios:language-preference:${createMutationId()}`;
  return {
    body: { ...input.input, mutationId },
    fingerprint,
    mutationId,
    scope: {
      actorId: input.actorId,
      baseUrl: input.baseUrl,
      cookieHeader: input.cookieHeader,
    },
  };
}

export function acceptLanguagePreferenceReceipt(
  attempt: LanguagePreferenceSaveAttempt,
  value: unknown,
  currentScope: LanguagePreferenceScope,
): { ok: false } | { ok: true; preference: OrbitLanguagePreferenceContract } {
  if (!sameScope(attempt.scope, currentScope)) return { ok: false };
  const receipt = z.discriminatedUnion("mode", [
    z.object({
      language: z.null(),
      mode: z.literal("system"),
      mutationId: z.literal(attempt.mutationId),
      updatedAt: timestamp,
    }),
    z.object({
      language,
      mode: z.literal("manual"),
      mutationId: z.literal(attempt.mutationId),
      updatedAt: timestamp,
    }),
  ]).safeParse(value);
  if (!receipt.success) return { ok: false };
  if (receipt.data.mode !== attempt.body.mode || receipt.data.language !== attempt.body.language) {
    return { ok: false };
  }
  if (
    attempt.body.expectedUpdatedAt
    && Date.parse(receipt.data.updatedAt) <= Date.parse(attempt.body.expectedUpdatedAt)
  ) return { ok: false };
  return {
    ok: true,
    preference: receipt.data.mode === "manual"
      ? { mode: "manual", language: receipt.data.language, updatedAt: receipt.data.updatedAt }
      : { mode: "system", language: null, updatedAt: receipt.data.updatedAt },
  };
}
