import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createPasswordResetService, type PasswordResetMailer } from "./password-reset-service";
import { createPasswordResetStore } from "./password-reset-store";
import { createSmtpPasswordResetMailer, passwordResetSmtpConfig } from "./password-reset-smtp";

export function passwordResetConfig(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.AUTH_SECRET?.trim();
  const apiKey = env.ORBIT_AUTH_RESEND_API_KEY?.trim();
  const from = env.ORBIT_AUTH_MAIL_FROM?.trim();
  const smtp = passwordResetSmtpConfig(env);
  const rawOrigin = env.ORBIT_PUBLIC_ORIGIN?.trim();
  if (!secret || secret.length < 32 || (!smtp && (!apiKey || !from)) || !rawOrigin) return null;
  try {
    const url = new URL(rawOrigin);
    const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { secret, apiKey, from, smtp, origin: url.origin };
  } catch {
    return null;
  }
}

export function createResendPasswordResetMailer(config: { apiKey: string; from: string }, fetcher: typeof fetch = fetch): PasswordResetMailer {
  return {
    async send(email, resetUrl, idempotencyKey) {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ from: config.from, to: [email], subject: "重置你的 Orbit 密码 / Reset your Orbit password",
          text: `请打开以下链接设置新密码，链接在申请后 30 分钟内有效，且只能使用一次。\n\n${resetUrl}\n\n如果你没有申请重置，请忽略这封邮件。\nOpen the link to set a new password. It expires 30 minutes after your request and can only be used once. If you did not request this, ignore this email.` }),
      });
      const result = await response.json().catch(() => null) as { id?: unknown } | null;
      if (!response.ok || typeof result?.id !== "string" || !result.id) throw new Error("Password reset delivery failed");
    },
  };
}

export function createConfiguredPasswordResetRuntime() {
  const config = passwordResetConfig();
  if (!config) return null;
  const database = createConfiguredPostgresLiveRecordStore();
  if (!database) return null;
  const store = createPasswordResetStore(database.client, database.workspaceId);
  return { ...config, store, service: createPasswordResetService(store, config.secret), mailer: config.smtp ? createSmtpPasswordResetMailer(config.smtp) : createResendPasswordResetMailer({ apiKey: config.apiKey!, from: config.from! }) };
}
