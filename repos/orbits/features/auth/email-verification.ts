// 邮箱验证：注册后发一封、重新发送、点链接完成。不拦任何功能。
// Used by: app/api/auth/register、app/api/account/email-verification/send、app/api/auth/email-verification/confirm。
import { createHash, randomBytes } from "node:crypto";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createTransactionalMailer, resolveMailRecipient, transactionalSmtpConfig, type TransactionalMailer } from "../mail/transactional";
import { emailVerificationMail } from "./email-verification-mail";
import { createEmailVerificationStore, type EmailVerificationAccount, type EmailVerificationLanguage, type EmailVerificationStore } from "./email-verification-store";
import { publicOrigin } from "./password-reset-factory";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const EMAIL_VERIFICATION_TTL_MS = 7 * DAY;
export const EMAIL_VERIFICATION_COOLDOWN_MS = MINUTE;
export const EMAIL_VERIFICATION_PER_DAY = 5;
export const EMAIL_VERIFICATION_PATH = "/verify-email";

export type EmailVerificationSendOutcome =
  | { state: "sent"; sentAt: string }
  | { state: "verified" }
  | { state: "too_soon"; retryAfterSeconds: number }
  | { state: "daily_limit" }
  | { state: "failed" };

export function emailVerificationDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 东京日期（日本没有夏令时）。 */
function tokyoDay(at: Date): string {
  return new Date(at.getTime() + 9 * 60 * MINUTE).toISOString().slice(0, 10);
}

export function createEmailVerificationService(input: { store: EmailVerificationStore; mailer: TransactionalMailer; origin: string; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  return {
    async send(account: EmailVerificationAccount, language: EmailVerificationLanguage): Promise<EmailVerificationSendOutcome> {
      const at = now();
      const token = randomBytes(32).toString("base64url");
      const tokenHash = emailVerificationDigest(token);
      const issued = await input.store.issue(account, {
        tokenHash, language, sentAt: at.toISOString(), day: tokyoDay(at),
        expiresAt: new Date(at.getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString(),
      }, { notAfter: new Date(at.getTime() - EMAIL_VERIFICATION_COOLDOWN_MS).toISOString(), perDay: EMAIL_VERIFICATION_PER_DAY });
      if (!issued) {
        const state = await input.store.read(account);
        if (state?.verified) return { state: "verified" };
        if (!state) return { state: "failed" };
        const waitMs = state.sentAt ? Date.parse(state.sentAt) + EMAIL_VERIFICATION_COOLDOWN_MS - at.getTime() : 0;
        if (state.day === tokyoDay(at) && state.count >= EMAIL_VERIFICATION_PER_DAY) return { state: "daily_limit" };
        return { state: "too_soon", retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
      }
      const url = new URL(EMAIL_VERIFICATION_PATH, input.origin);
      // 令牌放在 # 之后：不进服务器日志，也不进 Referer。
      url.hash = new URLSearchParams({ token }).toString();
      let delivered = false;
      try {
        const mail = emailVerificationMail(language, url.toString());
        delivered = (await input.mailer.send({ ...mail, to: account.email, fromName: "Orbit", idempotencyKey: `email-verification-${tokenHash}` })).delivered;
      } catch {
        // 通道的报错里可能带收件人或链接，不写日志。
      }
      if (delivered) return { state: "sent", sentAt: at.toISOString() };
      await input.store.refund(account, tokenHash);
      return { state: "failed" };
    },
    async confirm(token: unknown): Promise<{ outcome: "verified"; userId: string } | { outcome: "already" | "expired" }> {
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return { outcome: "expired" };
      return input.store.confirm(emailVerificationDigest(token), now().toISOString());
    },
  };
}

export type EmailVerificationService = ReturnType<typeof createEmailVerificationService>;

type Env = Record<string, string | undefined>;

/** 能不能发信：有 SMTP、有站点地址，非生产环境还要有收件重定向地址（见 mail/transactional）。 */
export function emailVerificationDeliverable(env: Env = process.env): boolean {
  return Boolean(transactionalSmtpConfig(env) && publicOrigin(env) && resolveMailRecipient("a@example.invalid", env).to);
}

let override: EmailVerificationService | null = null;

/** 测试注入；传 null 恢复 live 装配。 */
export function setEmailVerificationServiceForTests(service: EmailVerificationService | null): void {
  override = service;
}

/** 点链接只要有库；`deliverable` 为 false 时不要调 send。 */
export function configuredEmailVerification(env: Env = process.env): { service: EmailVerificationService; deliverable: boolean } | null {
  if (override) return { service: override, deliverable: true };
  const database = createConfiguredPostgresLiveRecordStore({ env });
  if (!database) return null;
  return {
    deliverable: emailVerificationDeliverable(env),
    service: createEmailVerificationService({
      store: createEmailVerificationStore(database.client, database.workspaceId),
      mailer: createTransactionalMailer({ env }),
      origin: publicOrigin(env) ?? "http://localhost",
    }),
  };
}
