import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { verifyInterviewResponseSubmissions } from "../interview-question-token.server";
import { PortraitTokenError, type PortraitTokenScope } from "./generation-token.server";

const domain = "orbit.registration.portrait-adaptive-question.v1";
const bindingSchema = z.strictObject({ domain: z.literal(domain), workspaceId: z.string().trim().min(1), actorId: z.string().trim().min(1), eventId: z.string().trim().min(1), questionTokenHash: z.string().regex(/^[a-f0-9]{64}$/), issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive() });

function adaptiveBindingPayload(input: PortraitTokenScope & { questionToken: string; secret?: string; now?: () => number }) {
  const secret = input.secret ?? process.env.ORBIT_INTERVIEW_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret?.trim() || input.questionToken.length > 32000) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive proof is invalid.");
  // Authenticate the original v1 token before reading any of its scope/time facts.
  verifyInterviewResponseSubmissions({ actorId: input.actorId, eventId: input.eventId, responses: [{ questionToken: input.questionToken, answer: "proof-validation" }], secret, now: input.now });
  const original = JSON.parse(Buffer.from(input.questionToken.split(".")[0], "base64url").toString("utf8"));
  const parsed = bindingSchema.safeParse({ domain, workspaceId: input.workspaceId, actorId: input.actorId, eventId: input.eventId, questionTokenHash: createHash("sha256").update(input.questionToken).digest("hex"), issuedAt: original.issuedAt, expiresAt: original.expiresAt });
  const now = (input.now ?? Date.now)();
  if (!parsed.success || parsed.data.issuedAt > now || parsed.data.expiresAt <= parsed.data.issuedAt || parsed.data.expiresAt - parsed.data.issuedAt > 48 * 60 * 60 * 1000) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive proof scope or time is invalid.");
  if (parsed.data.expiresAt <= now) throw new PortraitTokenError("PORTRAIT_GENERATION_EXPIRED", "The original adaptive question expired.");
  return { payload: parsed.data, secret };
}

export function signPortraitAdaptiveQuestion(input: PortraitTokenScope & { questionToken: string; secret?: string; now?: () => number }): string {
  const { payload, secret } = adaptiveBindingPayload(input);
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(domain + "\0").update(encoded).digest("base64url")}`;
}

export function verifyPortraitAdaptiveQuestion(input: PortraitTokenScope & { questionToken: string; portraitAdaptiveToken: string; secret?: string; now?: () => number }): void {
  const { payload, secret } = adaptiveBindingPayload(input);
  if (input.portraitAdaptiveToken.length > 32000) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive binding exceeds its limit.");
  const [encoded, signature, ...extra] = input.portraitAdaptiveToken.split(".");
  if (!encoded || !signature || extra.length) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive binding is malformed.");
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", secret).update(domain + "\0").update(encoded).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive binding signature is invalid.");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive binding payload is invalid."); }
  const parsed = bindingSchema.safeParse(value);
  if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(payload)) throw new PortraitTokenError("PORTRAIT_GENERATION_INVALID", "The adaptive binding belongs to another scope or question.");
}
