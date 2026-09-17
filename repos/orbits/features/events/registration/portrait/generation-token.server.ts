import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PortraitGeneration } from "../../../../shared/contract/event-registration-portrait";
import { portraitGenerationSchema } from "../../../../shared/api-schema/event-registration-portrait";
import type { EventRegistrationQuestion, EventRegistrationQuestionSet } from "../contract";

export interface PortraitTokenScope { workspaceId: string; actorId: string; eventId: string }
const tokenSchema = z.strictObject({
  domain: z.literal("orbit.registration.portrait-generation.v1"),
  workspaceId: z.string().trim().min(1), actorId: z.string().trim().min(1), eventId: z.string().trim().min(1),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(), generation: portraitGenerationSchema,
});
const TOKEN_TTL_MS = 48 * 60 * 60 * 1_000;

export interface PortraitRegistrationQuestionProof extends PortraitTokenScope {
  sourceRegistrationFingerprint?: string | null;
  question: EventRegistrationQuestion;
  provenance: EventRegistrationQuestionSet["provenance"];
  questionSetHash: string | null;
  questionSetVersion: number | null;
  eventSourceVersion: string;
  sourceRegistrationVersion: string | null;
  language: "en" | "zh";
}
const formalTokenSchema = z.strictObject({
  sourceRegistrationFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  domain: z.literal("orbit.registration.portrait-question.v1"),
  workspaceId: z.string().trim().min(1), actorId: z.string().trim().min(1), eventId: z.string().trim().min(1),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(),
  questionSetHash: z.string().trim().min(1).max(256).nullable(), questionSetVersion: z.number().int().positive().nullable(),
  eventSourceVersion: z.iso.datetime({ offset: true }), sourceRegistrationVersion: z.iso.datetime({ offset: true }).nullable(), language: z.enum(["en", "zh"]),
  question: z.strictObject({
    id: z.enum(["positioning", "target_attendees", "value_offered", "desired_outcome", "follow_up_preference"]),
    intent: z.enum(["positioning", "target_attendees", "value_offered", "desired_outcome", "follow_up_preference"]),
    participantProfileField: z.enum(["positioning", "targetAttendees", "valueOffered", "desiredOutcome", "followUpPreference"]),
    required: z.boolean(), prompt: z.string().trim().min(1).max(2_000), options: z.array(z.string().trim().min(1).max(1_000)).max(8).readonly(),
  }).refine((question) => question.id === question.intent && question.participantProfileField === ({ positioning: "positioning", target_attendees: "targetAttendees", value_offered: "valueOffered", desired_outcome: "desiredOutcome", follow_up_preference: "followUpPreference" } as const)[question.intent]),
  provenance: z.strictObject({
    aiProviderRequested: z.boolean(), externalNetworkRequested: z.boolean(), fallbackReason: z.string().max(1_000).nullable(),
    generationMethod: z.enum(["deterministic-fallback", "deterministic-not-registerable", "deterministic-not-requested", "orbit-agent-model-failed", "orbit-agent-model-customized"]),
    model: z.string().max(256).nullable(), provider: z.string().max(128).nullable(),
  }),
});
export function signPortraitRegistrationQuestion(input: PortraitRegistrationQuestionProof & { secret?: string; now?: () => number }): string {
  const issuedAt = (input.now ?? Date.now)();
  const { secret, now: ignoredNow, ...proof } = input;
  const parsed = formalTokenSchema.safeParse({ ...proof, domain: "orbit.registration.portrait-question.v1", issuedAt, expiresAt: issuedAt + TOKEN_TTL_MS });
  if (!parsed.success) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The original formal question proof is invalid.");
  const encoded = Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
  const signature = createHmac("sha256", portraitTokenSecret(secret)).update("orbit.registration.portrait-question.v1\0").update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
export function verifyPortraitRegistrationQuestion(input: PortraitTokenScope & { portraitQuestionToken: string; secret?: string; now?: () => number }): PortraitRegistrationQuestionProof {
  if (input.portraitQuestionToken.length > 32_000) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The formal question proof exceeds its limit.");
  const [encoded, signature, ...extra] = input.portraitQuestionToken.split(".");
  if (!encoded || !signature || extra.length) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The formal question proof is malformed.");
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", portraitTokenSecret(input.secret)).update("orbit.registration.portrait-question.v1\0").update(encoded).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The formal question proof signature is invalid.");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The formal question proof payload is invalid."); }
  const parsed = formalTokenSchema.safeParse(value);
  if (!parsed.success) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The formal question proof fields are invalid.");
  const { issuedAt, expiresAt, domain, ...proof } = parsed.data;
  const now = (input.now ?? Date.now)();
  if (proof.workspaceId !== input.workspaceId.trim() || proof.actorId !== input.actorId.trim() || proof.eventId !== input.eventId.trim() || issuedAt > now || expiresAt - issuedAt !== TOKEN_TTL_MS) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The formal question proof scope or time is invalid.");
  if (expiresAt <= now) throw new PortraitTokenError("PORTRAIT_GENERATION_EXPIRED", "The formal question proof has expired. Fetch the current questions.");
  return proof as PortraitRegistrationQuestionProof;
}

export class PortraitTokenError extends Error {
  constructor(readonly code: "PORTRAIT_GENERATION_INVALID" | "PORTRAIT_GENERATION_EXPIRED", message: string) {
    super(message);
    this.name = "PortraitTokenError";
  }
}

function portraitTokenSecret(explicit?: string): string {
  const secret = explicit ?? process.env.ORBIT_INTERVIEW_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "A server portrait signing secret is required.");
  return secret;
}

export function signPortraitGeneration(input: PortraitTokenScope & { generation: PortraitGeneration; secret?: string; now?: () => number }): string {
  const issuedAt = (input.now ?? Date.now)();
  const parsed = tokenSchema.safeParse({ domain: "orbit.registration.portrait-generation.v1", workspaceId: input.workspaceId, actorId: input.actorId, eventId: input.eventId, generation: input.generation, issuedAt, expiresAt: issuedAt + TOKEN_TTL_MS });
  if (!parsed.success) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The server portrait result is invalid.");
  const encoded = Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
  const signature = createHmac("sha256", portraitTokenSecret(input.secret)).update("orbit.registration.portrait-generation.v1\0").update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
export function verifyPortraitGeneration(input: PortraitTokenScope & { generationToken: string; secret?: string; now?: () => number }): PortraitGeneration {
  if (input.generationToken.length > 64_000) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The portrait proof exceeds its limit.");
  const [encoded, signature, ...extra] = input.generationToken.split(".");
  if (!encoded || !signature || extra.length) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The portrait proof is malformed.");
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", portraitTokenSecret(input.secret)).update("orbit.registration.portrait-generation.v1\0").update(encoded).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The portrait proof signature is invalid.");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The portrait proof payload is invalid."); }
  const parsed = tokenSchema.safeParse(value);
  if (!parsed.success) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The portrait proof fields are invalid.");
  const payload = parsed.data;
  const now = (input.now ?? Date.now)();
  if (payload.workspaceId !== input.workspaceId.trim() || payload.actorId !== input.actorId.trim() || payload.eventId !== input.eventId.trim() || payload.issuedAt > now || payload.expiresAt - payload.issuedAt !== TOKEN_TTL_MS) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The portrait proof scope or time is invalid.");
  if (payload.expiresAt <= now) throw new PortraitTokenError("PORTRAIT_GENERATION_EXPIRED", "The portrait preview has expired. Generate a new preview.");
  return payload.generation as PortraitGeneration;
}
