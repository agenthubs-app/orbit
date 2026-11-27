/**
 * One-off notice to the accounts migrated from party-app (日中创新创业协会 exchange meetups): the sign-up system moved to
 * Orbit, recover the account through "forgot password", and the 6th meetup (11/28) is open.
 *
 * Runs only from the build-time operator script (scripts/announce-migrated-users.ts); nothing under app/ imports it.
 * Modes (ORBIT_MIGRATION_NOTICE_MODE): unset = nothing; `dry` = counts only; `test` = one mail to
 * ORBIT_MIGRATION_NOTICE_TEST_TO; `apply` = every recipient, only when ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT equals the
 * recipient count the dry run printed. Each recipient gets one ledger row (orbit_records `announcement_deliveries`,
 * record `<campaign>:<userId>`), claimed before the send: a rerun sends only to rows that are missing or `failed`, and a
 * row left `sending` by a crash is never retried (it may have gone out). Logs carry counts and masked samples only.
 */
import { isValidAuthEmail, normalizeAuthEmail } from "../../auth/contract";
import { isProductionMailEnvironment, transactionalSmtpConfig, type TransactionalMailer } from "../../mail/transactional";
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

type Env = Readonly<Record<string, string | undefined>>;

export const MIGRATED_FROM = "party-app:chinichi-2026";
export const NOTICE_CAMPAIGN = "chinichi-6-migration-notice";
export const NOTICE_LEDGER_COLLECTION = "announcement_deliveries";
export const NOTICE_FROM_NAME = "日中创新创业协会";
export const NOTICE_SUBJECT = "【日中创新创业协会】报名系统已更换，请重置密码找回账号｜第六期交流会 11/28（周六）报名中";
export const NOTICE_TEXT = `各位好，

交流会的报名系统换成了新的平台 Orbit。大家之前的账号和资料已经全部迁移过来，不需要重新注册。

■ 第一次登录请先重置密码

1. 打开 https://orbitailink.com/app/account/forgot-password
2. 输入您之前报名用的邮箱（就是收到这封邮件的邮箱）
3. 按邮件里的链接设置新密码，链接 7 天内有效

设置好之后，原来的资料都在账号里。

■ 第六期中日创业交流会

时间：11月28日（周六）14:00 签到，14:30 开始，17:30 结束
地点：東京都港区新橋6-5-3 山田屋ビル B2
费用：4,500日元
名额：60人，满员截止
报名：https://orbitailink.com/app/events/evt_4176514ffa2c47e9b4a0

登录后在活动页直接报名。报名后请添加微信 Nakahara923 并备注姓名，支付参会费后审核通过。

收不到重置邮件，或者想换一个邮箱登录，请微信联系 Nakahara923。

日中创新创业协会

────────────────────

皆さま

交流会の申込システムを、新しいプラットフォーム「Orbit」に切り替えました。これまでのアカウントとプロフィールはすべて移行済みですので、新規登録は不要です。

■ 初回ログインの前に、パスワードを再設定してください

1. https://orbitailink.com/app/account/forgot-password を開く
2. これまで申込に使っていたメールアドレス（このメールが届いたアドレス）を入力
3. 届いたメールのリンクから新しいパスワードを設定（リンクの有効期限は7日間）

設定が終われば、以前の情報はそのままアカウントに入っています。

■ 第6回 中日創業交流会

日時：11月28日（土）14:00 受付、14:30 開始、17:30 終了
会場：東京都港区新橋6-5-3 山田屋ビル B2
参加費：4,500円
定員：60名（満席になり次第締切）
申込：https://orbitailink.com/app/events/evt_4176514ffa2c47e9b4a0

ログイン後、イベントページからお申し込みください。申込後、WeChat「Nakahara923」を追加してお名前をお知らせいただき、参加費のお支払い確認後に承認となります。

再設定メールが届かない場合や、メールアドレスを変更したい場合は、WeChat「Nakahara923」までご連絡ください。

日中创新创业协会
`;

// ---------------------------------------------------------------- recipients

/** What the recipient query returns per migrated sign-in row (no names, no profile data). */
export interface MigratedAccountRow {
  user_id: string | null;
  email: string | null;
  lifecycle_state: string;
  deletion_requested: boolean;
  deletion_pending: boolean;
}

export type NoticeExclusion = "missing_id" | "inactive" | "deletion_in_progress" | "invalid_email" | "placeholder_domain" | "duplicate";

export interface NoticeRecipient { userId: string; email: string }

const PLACEHOLDER_DOMAINS = new Set(["example.com", "example.org", "example.net", "example.jp", "test.com", "localhost"]);
const PLACEHOLDER_TLDS = new Set(["example", "invalid", "test", "local", "localhost", "internal"]);

export function isPlaceholderEmailDomain(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return PLACEHOLDER_DOMAINS.has(domain) || PLACEHOLDER_TLDS.has(tld) ||
    /(^|[.-])(placeholder|dummy|noemail|no-email|none|nomail)([.-]|$)/u.test(domain) || /^(no-?reply|noemail|dummy|placeholder)$/u.test(email.slice(0, email.lastIndexOf("@")));
}

/**
 * The current sign-in row of every account the party-app migration created. The sign-in email is read from the row
 * as it is now (an operator email change re-keys the row and keeps `migratedFrom`). Purged accounts have no row left.
 */
export async function loadMigratedAccounts(sql: { query: <T>(text: string, values?: readonly unknown[]) => Promise<{ rows: readonly T[] }> }, workspaceId: string): Promise<MigratedAccountRow[]> {
  const result = await sql.query<MigratedAccountRow>(`select u.payload->>'id' as user_id, u.payload->>'email' as email, u.lifecycle_state,
      coalesce(u.payload->>'deletionRequestedAt','')<>'' as deletion_requested,
      exists(select 1 from orbit_records d where d.workspace_id=u.workspace_id and d.collection_name='account_deletion_requests'
        and d.payload->>'userId'=u.payload->>'id' and d.payload->>'status' in ('pending','purging')) as deletion_pending
    from orbit_records u where u.workspace_id=$1 and u.collection_name='auth_users' and u.payload->>'migratedFrom'=$2
    order by u.created_at, u.record_id`, [workspaceId, MIGRATED_FROM]);
  return [...result.rows];
}

export function classifyRecipients(rows: readonly MigratedAccountRow[]): { recipients: NoticeRecipient[]; excluded: Record<NoticeExclusion, number> } {
  const excluded: Record<NoticeExclusion, number> = { missing_id: 0, inactive: 0, deletion_in_progress: 0, invalid_email: 0, placeholder_domain: 0, duplicate: 0 };
  const recipients: NoticeRecipient[] = [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  for (const row of rows) {
    const email = normalizeAuthEmail(row.email ?? "");
    const reason: NoticeExclusion | null = !row.user_id ? "missing_id"
      : row.lifecycle_state !== "active" ? "inactive"
      : row.deletion_requested || row.deletion_pending ? "deletion_in_progress"
      : !email || email.length > 254 || !isValidAuthEmail(email) ? "invalid_email"
      : isPlaceholderEmailDomain(email) ? "placeholder_domain"
      : seenIds.has(row.user_id) || seenEmails.has(email) ? "duplicate"
      : null;
    if (reason) { excluded[reason] += 1; continue; }
    seenIds.add(row.user_id!);
    seenEmails.add(email);
    recipients.push({ userId: row.user_id!, email });
  }
  return { recipients, excluded };
}

/** `ab***@gmail.com`: the only form an address takes in logs. */
export function maskNoticeEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "(none)";
  const local = email.slice(0, at);
  return `${local.slice(0, local.length > 2 ? 2 : 1)}***@${email.slice(at + 1)}`;
}

export function topDomains(recipients: readonly NoticeRecipient[], limit = 10): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const { email } of recipients) { const domain = email.slice(email.lastIndexOf("@") + 1); counts.set(domain, (counts.get(domain) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

// ---------------------------------------------------------------- ledger

export type NoticeDeliveryStatus = "sending" | "sent" | "failed";

export interface NoticeLedgerEntry { status: NoticeDeliveryStatus; attempts: number; version: string; createdAt: string }

export interface NoticeLedger {
  load(campaign: string): Promise<Map<string, NoticeLedgerEntry>>;
  /** Marks the recipient `sending`; false when another run got there first. */
  claim(campaign: string, userId: string, previous: NoticeLedgerEntry | null, at: Date): Promise<boolean>;
  finish(campaign: string, userId: string, status: "sent" | "failed", reason: string | null, attempts: number, createdAt: string, at: Date): Promise<void>;
}

type LedgerPayload = { campaign: string; userId: string; status: NoticeDeliveryStatus; attempts: number; reason?: string | null; updatedAt: string };

/** The ledger on the generic record store: private operator metadata, never synced, no address or body stored. */
export function createRecordStoreNoticeLedger(store: LiveRecordStoreLike<LedgerPayload>, workspaceId: string): NoticeLedger {
  const record = (campaign: string, userId: string, payload: LedgerPayload, createdAt: string, updatedAt: string): LiveRecord<LedgerPayload> => ({
    workspaceId, collectionName: NOTICE_LEDGER_COLLECTION, recordId: `${campaign}:${userId}`, userId: null,
    sourceType: "operator-announcement", sourceId: campaign, evidenceIds: [], lifecycleState: "active", createdAt, updatedAt, payload,
  });
  return {
    async load(campaign) {
      const rows = await store.listRecords({ workspaceId, collectionName: NOTICE_LEDGER_COLLECTION, sourceId: campaign, limit: 5000, omitSearchText: true });
      return new Map(rows.map((row) => [row.payload.userId, { status: row.payload.status, attempts: Number(row.payload.attempts) || 0, version: row.updatedAt, createdAt: row.createdAt }]));
    },
    async claim(campaign, userId, previous, at) {
      if (!previous) {
        const stamp = at.toISOString();
        return Boolean(await store.insertRecordIfAbsent!(record(campaign, userId, { campaign, userId, status: "sending", attempts: 1, updatedAt: stamp }, stamp, stamp)));
      }
      if (previous.status !== "failed") return false;
      const stamp = new Date(Math.max(at.getTime(), Date.parse(previous.version) + 1)).toISOString();
      return Boolean(await store.updateRecordIfCurrent!(
        record(campaign, userId, { campaign, userId, status: "sending", attempts: previous.attempts + 1, updatedAt: stamp }, previous.createdAt, stamp),
        { userId: null, updatedAt: previous.version }));
    },
    async finish(campaign, userId, status, reason, attempts, createdAt, at) {
      const stamp = at.toISOString();
      await store.upsertRecord(record(campaign, userId, { campaign, userId, status, attempts, reason, updatedAt: stamp }, createdAt, stamp));
    },
  };
}

// ---------------------------------------------------------------- run

export type NoticeMode = "off" | "dry" | "test" | "apply";

export function noticeMode(env: Env): NoticeMode {
  const raw = env.ORBIT_MIGRATION_NOTICE_MODE?.trim();
  if (!raw) return "off";
  if (raw === "dry" || raw === "test" || raw === "apply") return raw;
  throw new Error("ORBIT_MIGRATION_NOTICE_MODE must be dry, test or apply");
}

export interface NoticeRunInput {
  env: Env;
  mailer: TransactionalMailer;
  /** Not used in `test` mode (no database needed). */
  loadRows?: () => Promise<readonly MigratedAccountRow[]>;
  ledger?: NoticeLedger;
  log: (label: string, value: unknown) => void;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  /** Stop starting new sends after this long (the build has a time limit); a rerun picks up the rest. */
  budgetMs?: number;
  campaign?: string;
}

export interface NoticeRunSummary {
  mode: NoticeMode;
  recipients?: number;
  sent?: number;
  failed?: number;
  skipped?: { alreadySent: number; uncertain: number; claimedElsewhere: number; deferred: number };
  failureReasons?: Record<string, number>;
}

/**
 * 两封信之间的间隔（毫秒）。生产发信是个人 Gmail SMTP，连发会被限速（EAUTH，2026-11-27），默认 8 秒；
 * 用 ORBIT_MIGRATION_NOTICE_INTERVAL_MS 调整（整数，1000–60000，越界或写错用默认）。
 */
export const NOTICE_INTERVAL_DEFAULT_MS = 8_000;
export function noticeIntervalMs(env: Env): number {
  const value = Number(env.ORBIT_MIGRATION_NOTICE_INTERVAL_MS);
  return Number.isInteger(value) && value >= 1_000 && value <= 60_000 ? value : NOTICE_INTERVAL_DEFAULT_MS;
}

export async function runMigratedUserNotice(input: NoticeRunInput): Promise<NoticeRunSummary> {
  const mode = noticeMode(input.env);
  const campaign = input.campaign ?? NOTICE_CAMPAIGN;
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const intervalMs = input.intervalMs ?? noticeIntervalMs(input.env);
  const budgetMs = input.budgetMs ?? 9 * 60_000;
  if (mode === "off") { input.log("disabled", { hint: "set ORBIT_MIGRATION_NOTICE_MODE=dry|test|apply" }); return { mode }; }
  const productionMail = isProductionMailEnvironment(input.env);
  const smtpConfigured = Boolean(transactionalSmtpConfig(input.env));
  input.log("environment", { mode, campaign, productionMail, smtpConfigured });
  // Outside production the mailer redirects every recipient: an apply there would mark real people as sent.
  if ((mode === "apply" || mode === "test") && !productionMail) throw new Error("NOT_PRODUCTION_MAIL_ENVIRONMENT");
  if ((mode === "apply" || mode === "test") && !smtpConfigured) throw new Error("SMTP_UNCONFIGURED");

  if (mode === "test") {
    const to = normalizeAuthEmail(input.env.ORBIT_MIGRATION_NOTICE_TEST_TO ?? "");
    if (!isValidAuthEmail(to)) throw new Error("ORBIT_MIGRATION_NOTICE_TEST_TO required");
    const result = await input.mailer.send({ to, subject: NOTICE_SUBJECT, text: NOTICE_TEXT, fromName: NOTICE_FROM_NAME, idempotencyKey: `${campaign}/test/${now().getTime()}` });
    input.log("test", { to: maskNoticeEmail(to), delivered: result.delivered, redirected: result.redirected, reason: result.reason ?? null });
    if (!result.delivered) throw new Error("TEST_SEND_FAILED");
    return { mode, sent: 1, failed: 0 };
  }

  if (!input.loadRows || !input.ledger) throw new Error("DATABASE_REQUIRED");
  const rows = await input.loadRows();
  const { recipients, excluded } = classifyRecipients(rows);
  const ledger = await input.ledger.load(campaign);
  const ledgerCounts = { sent: 0, failed: 0, sending: 0 };
  for (const recipient of recipients) { const entry = ledger.get(recipient.userId); if (entry) ledgerCounts[entry.status] += 1; }
  input.log("recipients", {
    migratedRows: rows.length, recipients: recipients.length, excludedTotal: rows.length - recipients.length, excluded,
    topDomains: topDomains(recipients), samples: recipients.slice(0, 5).map((r) => maskNoticeEmail(r.email)),
    ledger: { ...ledgerCounts, notYet: recipients.length - ledgerCounts.sent - ledgerCounts.failed - ledgerCounts.sending },
  });
  if (mode === "dry") return { mode, recipients: recipients.length };

  const expected = input.env.ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT?.trim();
  if (!expected || !/^\d+$/u.test(expected) || Number(expected) !== recipients.length) throw new Error("EXPECTED_COUNT_MISMATCH");

  const summary = { mode, recipients: recipients.length, sent: 0, failed: 0, skipped: { alreadySent: 0, uncertain: 0, claimedElsewhere: 0, deferred: 0 }, failureReasons: {} as Record<string, number> };
  const started = now().getTime();
  let lastStart: number | null = null;
  for (const recipient of recipients) {
    const entry = ledger.get(recipient.userId) ?? null;
    if (entry?.status === "sent") { summary.skipped.alreadySent += 1; continue; }
    if (entry?.status === "sending") { summary.skipped.uncertain += 1; continue; }
    if (now().getTime() - started >= budgetMs) { summary.skipped.deferred += 1; continue; }
    if (lastStart !== null) { const wait = lastStart + intervalMs - now().getTime(); if (wait > 0) await sleep(wait); }
    lastStart = now().getTime();
    const claimedAt = now();
    if (!await input.ledger.claim(campaign, recipient.userId, entry, claimedAt)) { summary.skipped.claimedElsewhere += 1; continue; }
    const attempts = (entry?.attempts ?? 0) + 1;
    let reason: string | null = null;
    try {
      const result = await input.mailer.send({ to: recipient.email, subject: NOTICE_SUBJECT, text: NOTICE_TEXT, fromName: NOTICE_FROM_NAME,
        idempotencyKey: `${campaign}/${recipient.userId}/${attempts}` });
      reason = result.delivered && !result.redirected ? null : result.reason ?? (result.redirected ? "redirected" : "failed");
    } catch {
      reason = "failed";
    }
    // A ledger write failure aborts the run: the row stays `sending`, so a rerun never resends it.
    await input.ledger.finish(campaign, recipient.userId, reason ? "failed" : "sent", reason, attempts, entry?.createdAt ?? claimedAt.toISOString(), now());
    if (reason) { summary.failed += 1; summary.failureReasons[reason] = (summary.failureReasons[reason] ?? 0) + 1; }
    else summary.sent += 1;
  }
  input.log("result", summary);
  return summary;
}
