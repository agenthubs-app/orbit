/**
 * R17（host/DESIGN.md §2.10「邮件模块」）：Orbit 名义的定型事务邮件（复用 SMTP 配置）。Owner: 甲 (R17).
 * - **非生产强制重定向**：只要不是生产部署（`VERCEL_ENV=production` 且 `NODE_ENV=production`），收件人一律换成
 *   `ORBIT_MAIL_REDIRECT_TO`；没配就不发（记日志）。由代码保证、有测试，不靠约定。
 * - 只发定型文（模板在调用方）；不发 CSV 名单、不发给非用户地址（调用方只传有账号者的邮箱）。
 * - 日志只写协议级错误码，不写收件人、正文。
 */
import nodemailer from "nodemailer";

type Env = Readonly<Record<string, string | undefined>>;

export interface TransactionalMail {
  to: string;
  subject: string;
  text: string;
  /** 发件显示名（「CFO Night 実行委員会（Orbit 経由）」）。 */
  fromName?: string;
  idempotencyKey: string;
}

export interface TransactionalMailResult {
  delivered: boolean;
  /** 非生产重定向到了 QA 地址。 */
  redirected: boolean;
  reason?: "unconfigured" | "no_redirect_target" | "rejected" | "failed";
}

export interface TransactionalMailer {
  send(mail: TransactionalMail): Promise<TransactionalMailResult>;
}

export function isProductionMailEnvironment(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" && env.VERCEL_ENV === "production";
}

/** 实际收件人：生产原样；非生产 → 重定向地址或 null（不发）。 */
export function resolveMailRecipient(to: string, env: Env = process.env): { to: string | null; redirected: boolean } {
  if (isProductionMailEnvironment(env)) return { redirected: false, to };
  const redirect = env.ORBIT_MAIL_REDIRECT_TO?.trim();
  return redirect && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(redirect) ? { redirected: true, to: redirect } : { redirected: true, to: null };
}

export function transactionalSmtpConfig(env: Env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = (env.ORBIT_MAIL_FROM ?? env.ACCESS_EMAIL_FROM)?.trim();
  const port = Number(env.SMTP_PORT ?? 465);
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { from, host, pass, port, secure: env.SMTP_SECURE?.trim().toLowerCase() !== "false", user };
}

type Transport = Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail">;

export function createTransactionalMailer(input: { env?: Env; transport?: Transport | null } = {}): TransactionalMailer {
  const env = input.env ?? process.env;
  const config = transactionalSmtpConfig(env);
  const transport = input.transport !== undefined ? input.transport : config ? nodemailer.createTransport({
    auth: { pass: config.pass, user: config.user }, connectionTimeout: 10_000, debug: false, disableFileAccess: true, disableUrlAccess: true,
    greetingTimeout: 10_000, host: config.host, logger: false, port: config.port, requireTLS: !config.secure, secure: config.secure, socketTimeout: 15_000,
  }) : null;
  return {
    async send(mail) {
      const recipient = resolveMailRecipient(mail.to, env);
      if (!recipient.to) {
        console.info(JSON.stringify({ event: "transactional_mail_skipped", reason: "no_redirect_target" }));
        return { delivered: false, reason: "no_redirect_target", redirected: true };
      }
      if (!transport || !config) return { delivered: false, reason: "unconfigured", redirected: recipient.redirected };
      try {
        const fromName = mail.fromName?.replace(/["\r\n]/gu, "").slice(0, 80);
        const result = await transport.sendMail({
          from: fromName ? `"${fromName}" <${config.from}>` : config.from,
          messageId: `<${mail.idempotencyKey.replace(/[^a-zA-Z0-9-]/gu, "-")}@orbit-transactional>`,
          subject: recipient.redirected ? `[redirected] ${mail.subject}` : mail.subject,
          text: mail.text,
          to: recipient.to,
        });
        const accepted = (result.accepted ?? []).some((item: unknown) => String(item).toLowerCase() === recipient.to!.toLowerCase());
        return accepted ? { delivered: true, redirected: recipient.redirected } : { delivered: false, reason: "rejected", redirected: recipient.redirected };
      } catch (error) {
        const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
        console.error(JSON.stringify({ event: "transactional_mail_failed", smtpCode: code }));
        return { delivered: false, reason: "failed", redirected: recipient.redirected };
      }
    },
  };
}
