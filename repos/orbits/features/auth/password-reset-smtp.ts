import nodemailer from "nodemailer";
import type { PasswordResetMailer } from "./password-reset-service";

export function passwordResetSmtpConfig(env: Record<string, string | undefined> = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = env.ACCESS_EMAIL_FROM?.trim();
  const replyTo = env.ACCESS_EMAIL_REPLY_TO?.trim();
  const port = Number(env.SMTP_PORT ?? 465);
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, secure: env.SMTP_SECURE?.trim().toLowerCase() !== "false", user, pass, from, replyTo };
}

export function createSmtpPasswordResetMailer(config: NonNullable<ReturnType<typeof passwordResetSmtpConfig>>, transport = nodemailer.createTransport({
  host: config.host, port: config.port, secure: config.secure, requireTLS: !config.secure,
  auth: { user: config.user, pass: config.pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
})): PasswordResetMailer {
  return {
    async send(email, resetUrl, idempotencyKey) {
      try {
        const result = await transport.sendMail({ from: config.from, to: email, replyTo: config.replyTo,
          messageId: `<${idempotencyKey.replace(/[^a-zA-Z0-9-]/gu, "-")}@${new URL(resetUrl).hostname}>`,
          subject: "重置你的 Orbit 密码 / Reset your Orbit password",
          text: `请打开以下链接设置新密码，链接在申请后 30 分钟内有效，且只能使用一次。\n\n${resetUrl}\n\n如果你没有申请重置，请忽略这封邮件。\nOpen the link to set a new password. It expires 30 minutes after your request and can only be used once. If you did not request this, ignore this email.`,
        });
        if (!result.accepted?.some((recipient) => String(recipient).toLowerCase() === email.toLowerCase())) throw new Error("Rejected");
      } catch {
        throw new Error("Password reset delivery failed");
      }
    },
  };
}
