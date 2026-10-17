/**
 * R17 定型通知的投递 worker（host/DESIGN.md §2.10）。Owner: 甲 (R17).
 * - 取 outbox 里 pending 且没被领走的行（`for update skip locked` + 写 `claimed_until` 租约 5 分钟，两个维护任务重叠时不会领到同一行）→ 写收件箱（来源 `event_host_notice`，semanticKey = 幂等键，
 *   重放不重置已读）→ 只给有账号者发邮件（`features/mail/transactional`，非生产强制重定向）→ 标 sent / skipped / failed。
 * - 尊重通知设置：`updateEnabled = false` 时不发邮件（收件箱照写，用户自己能看到）。
 * - 邮件发送失败（`delivered: false, reason: "failed" | "rejected"`）当作失败重试；未配置 / 无重定向目标只算跳过邮件，收件箱照写。
 * - `desktop_link` 不属于任何活动（eventId = "host-center"），不查活动，用通用文案。
 * - 失败重试 5 次后标 failed；不调 AI、不发自由文本。
 */
import type { TransactionalMailer } from "../../../mail/transactional";
import type { HostNoticeKind } from "../../../../shared/contract/host-notices";
import { createInboxRecordUpserter } from "../../../notifications/inbox-record-service";
import { createPostgresInboxRecordTransaction } from "../../../notifications/storage/inbox-record-repository";
import { acquireSyncCommitOrderLock } from "../../../sync/commit-order-lock";
import type { EventOperationsPostgresClient } from "../../event-operations/storage/postgres-client";
import { renderHostNotice } from "./templates";

export const HOST_NOTICE_MAX_ATTEMPTS = 5;
export const HOST_NOTICE_CLAIM_LEASE_SECONDS = 300;

interface OutboxRow { notice_id: string; event_id: string; kind: HostNoticeKind; actor_id: string; idempotency_key: string; payload: Record<string, unknown> | string; attempts: number }

export interface HostNoticeWorkerDeps {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  mailer: TransactionalMailer | null;
  /** 通知设置：false = 不发邮件。缺省按允许。 */
  emailAllowed?: (actorId: string) => Promise<boolean>;
  now?: () => Date;
  appOrigin?: string;
}

export async function deliverHostNotices(deps: HostNoticeWorkerDeps, limit = 50): Promise<{ sent: number; skipped: number; failed: number }> {
  const { client, workspaceId } = deps;
  const now = deps.now ?? (() => new Date());
  const claimed = await client.transaction(async (executor) => {
    const rows = await executor.query<OutboxRow>(
      `select notice_id, event_id, kind, actor_id, idempotency_key, payload, attempts from event_host_notice_outbox
        where workspace_id = $1 and status = 'pending' and (claimed_until is null or claimed_until < $3::timestamptz)
        order by created_at limit $2 for update skip locked`,
      [workspaceId, limit, now().toISOString()],
    );
    if (rows.rows.length) {
      await executor.query(
        `update event_host_notice_outbox set attempts = attempts + 1, claimed_until = $3::timestamptz + make_interval(secs => $4) where workspace_id = $1 and notice_id = any($2::text[])`,
        [workspaceId, rows.rows.map((row) => row.notice_id), now().toISOString(), HOST_NOTICE_CLAIM_LEASE_SECONDS],
      );
    }
    return rows.rows;
  });
  const tally = { failed: 0, sent: 0, skipped: 0 };
  for (const row of claimed) {
    const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as Record<string, unknown>;
    try {
      const standalone = row.kind === "desktop_link";
      const event = standalone ? { rows: [{ display_name: null, host_note: null, starts_at: null, title: null, venue: null }] } : await client.query<{ title: string | null; starts_at: unknown; venue: string | null; display_name: string | null; host_note: string | null }>(
        `select e.title, e.starts_at, e.venue, p.display_name, x.host_note from event_ops_events e
           left join organizer_profiles p on p.workspace_id = e.workspace_id and p.profile_id = e.organizer_profile_id
           left join event_host_notice_extras x on x.workspace_id = e.workspace_id and x.event_id = e.event_id
          where e.workspace_id = $1 and e.event_id = $2`,
        [workspaceId, row.event_id],
      );
      const facts = event.rows[0];
      const user = await client.query<{ email: string | null; name: string | null }>(`select payload ->> 'email' as email, payload ->> 'displayName' as name from orbit_records where workspace_id = $1 and collection_name = 'auth_users' and payload ->> 'id' = $2 limit 1`, [workspaceId, row.actor_id]);
      const account = user.rows[0];
      if (!facts || !account) {
        await client.query(`update event_host_notice_outbox set status = 'skipped', last_error = $3 where workspace_id = $1 and notice_id = $2`, [workspaceId, row.notice_id, !facts ? "event_missing" : "no_account"]);
        tally.skipped += 1;
        continue;
      }
      const hostNote = typeof payload.hostNote === "string" ? payload.hostNote : facts.host_note;
      const copy = renderHostNotice(row.kind, { eventTitle: facts.title ?? "", organizerName: facts.display_name, receptionNumber: typeof payload.receptionNumber === "string" ? payload.receptionNumber : null, venue: facts.venue }, hostNote);
      const href = row.kind === "cohost_invite" || row.kind === "desktop_link" ? (typeof payload.href === "string" ? payload.href : "/app/events/center") : `/app/events/${encodeURIComponent(row.event_id)}`;
      const at = now().toISOString();
      const upsert = createInboxRecordUpserter({
        now: () => at,
        transaction: (owner, operation) => client.transaction(async (executor) => {
          await acquireSyncCommitOrderLock(executor);
          return operation(await createPostgresInboxRecordTransaction({ actorId: owner, executor, workspaceId }));
        }),
      });
      await upsert({
        actions: ["read", "dismiss"],
        actorId: row.actor_id,
        copy: { en: { reason: copy.en.body, title: copy.en.title }, ja: { reason: copy.ja.body, title: copy.ja.title }, zh: { reason: copy.zh.body, title: copy.zh.title } },
        kind: "update",
        object: { id: row.event_id, name: facts.title ?? copy.ja.title },
        occurredAt: at,
        origin: "business",
        reason: copy.ja.body,
        semanticKey: row.idempotency_key.slice(0, 500),
        sources: [{ objectId: row.event_id, occurredAt: at, readAt: at, sourceId: row.notice_id, sourceKind: "event_host_notice", sourceRevision: row.kind }],
        target: { href, id: row.event_id, kind: "event", status: "available" },
        title: copy.ja.title,
      });
      const allowed = deps.emailAllowed ? await deps.emailAllowed(row.actor_id).catch(() => true) : true;
      if (account.email && allowed && deps.mailer && row.kind !== "desktop_link") {
        const origin = deps.appOrigin ?? "https://orbitailink.com";
        const mailed = await deps.mailer.send({ fromName: facts.display_name ? `${facts.display_name}（Orbit 経由）` : undefined, idempotencyKey: row.idempotency_key, subject: `【${facts.title ?? ""}】${copy.ja.title}`, text: `${account.name ?? ""} 様\n\n${copy.ja.body}\n\nイベントを見る: ${origin}${href}\n\n配信停止はアプリの設定から`, to: account.email });
        // 发送失败 / 被拒要重试（不能标 sent）；未配置、无重定向目标只是不发邮件，收件箱已写好。
        if (!mailed.delivered && (mailed.reason === "failed" || mailed.reason === "rejected")) throw new Error(`mail_${mailed.reason}`);
      }
      await client.query(`update event_host_notice_outbox set status = 'sent', sent_at = $3, last_error = null, claimed_until = null where workspace_id = $1 and notice_id = $2`, [workspaceId, row.notice_id, at]);
      tally.sent += 1;
    } catch (error) {
      const failed = row.attempts + 1 >= HOST_NOTICE_MAX_ATTEMPTS;
      await client.query(`update event_host_notice_outbox set status = $3, last_error = $4, claimed_until = null where workspace_id = $1 and notice_id = $2`, [workspaceId, row.notice_id, failed ? "failed" : "pending", error instanceof Error ? error.message.slice(0, 80) : "unknown"]);
      if (failed) tally.failed += 1;
    }
  }
  return tally;
}
