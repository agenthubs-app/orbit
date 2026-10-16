/**
 * R17（host/DESIGN.md §2.6「QR v2」）：受付 QR 令牌的签发与校验（服务端）。Owner: 甲 (R17).
 * - HMAC-SHA256（密钥 `ORBIT_CHECKIN_TOKEN_SECRET`），签名截断 32 字符 base64url；活动结束后 24 小时过期。
 * - 非生产缺省用固定开发密钥（测试与本机），生产没配密钥时不签发（返回 null，界面不显示 QR）、校验一律失败。
 * - 旧明文 `orbit-checkin:<eventId>:<participantId>` 不再接受。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { checkInTokenSigningInput, encodeCheckInToken, parseCheckInToken, type CheckInTokenParts } from "../../../shared/compute/checkin-token";

const DEV_SECRET = "orbit-dev-checkin-secret-not-for-production";
export const CHECKIN_TOKEN_GRACE_MS = 24 * 60 * 60 * 1000;

export function checkInTokenSecret(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const configured = env.ORBIT_CHECKIN_TOKEN_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  return env.NODE_ENV === "production" ? null : DEV_SECRET;
}

function sign(parts: CheckInTokenParts, secret: string): string {
  return createHmac("sha256", secret).update(checkInTokenSigningInput(parts)).digest("base64url").slice(0, 32);
}

export function issueCheckInToken(input: { eventId: string; participantId: string; eventEndsAt: string }, secret = checkInTokenSecret()): string | null {
  if (!secret) return null;
  const exp = Math.floor((Date.parse(input.eventEndsAt) + CHECKIN_TOKEN_GRACE_MS) / 1000);
  if (!Number.isFinite(exp)) return null;
  const parts = { eventId: input.eventId, exp, participantId: input.participantId };
  return encodeCheckInToken(parts, sign(parts, secret));
}

export type CheckInTokenCheck = { ok: true; participantId: string } | { ok: false; reason: "malformed" | "other_event" | "expired" | "bad_signature" | "unconfigured" };

export function verifyCheckInToken(payload: string, input: { eventId: string; now: Date }, secret = checkInTokenSecret()): CheckInTokenCheck {
  if (!secret) return { ok: false, reason: "unconfigured" };
  const parts = parseCheckInToken(payload);
  if (!parts) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(sign(parts, secret));
  const actual = Buffer.from(parts.signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "bad_signature" };
  if (parts.eventId !== input.eventId) return { ok: false, reason: "other_event" };
  if (parts.exp * 1000 < input.now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, participantId: parts.participantId };
}
