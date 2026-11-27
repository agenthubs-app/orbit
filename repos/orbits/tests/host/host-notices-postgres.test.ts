/**
 * R17 SC-R17-14：定型通知。邮件模块非生产强制重定向（没配重定向就不发）；worker 写收件箱（来源 event_host_notice、幂等）、
 * 只给有账号者发邮件、尊重通知设置、模板固定 + 主催者からのひとこと 只附在承認 / 繰り上げ / 中止。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createTransactionalMailer, isProductionMailEnvironment, resolveMailRecipient } from "../../features/mail/transactional";
import { enqueueHostNotice } from "../../features/events/host/storage/admission-hooks";
import { deliverHostNotices } from "../../features/events/host/notices/worker";
import { renderHostNotice } from "../../features/events/host/notices/templates";
import { hostNoteText } from "../../shared/api-schema/host-events";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

test("mail: only a production deployment mails the real address; anywhere else it goes to the redirect or nowhere", async () => {
  assert.equal(isProductionMailEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
  assert.deepEqual(resolveMailRecipient("user@example.com", { NODE_ENV: "development", ORBIT_MAIL_REDIRECT_TO: "qa@orbit.test" }), { redirected: true, to: "qa@orbit.test" });
  assert.deepEqual(resolveMailRecipient("user@example.com", { NODE_ENV: "production", VERCEL_ENV: "preview" }), { redirected: true, to: null });
  assert.deepEqual(resolveMailRecipient("user@example.com", { NODE_ENV: "production", VERCEL_ENV: "production" }), { redirected: false, to: "user@example.com" });
  const sent: Array<{ to: string; subject: string }> = [];
  const transport = { sendMail: async (mail: { to: string; subject: string }) => { sent.push(mail); return { accepted: [mail.to] }; } } as never;
  const env = { ACCESS_EMAIL_FROM: "no-reply@orbit.test", NODE_ENV: "test", ORBIT_MAIL_REDIRECT_TO: "qa@orbit.test", SMTP_HOST: "smtp.test", SMTP_PASS: "x", SMTP_USER: "u" };
  const result = await createTransactionalMailer({ env, transport }).send({ idempotencyKey: "k1", subject: "件名", text: "本文", to: "real.person@example.com" });
  assert.deepEqual(result, { delivered: true, redirected: true });
  assert.deepEqual(sent.map((mail) => [mail.to, mail.subject]), [["qa@orbit.test", "[redirected] 件名"]], "never the real address outside production");
  const none = await createTransactionalMailer({ env: { ...env, ORBIT_MAIL_REDIRECT_TO: "" }, transport }).send({ idempotencyKey: "k2", subject: "s", text: "t", to: "real.person@example.com" });
  assert.equal(none.delivered, false);
  assert.equal(sent.length, 1);
});

test("templates are fixed text; the host note only rides on approvals / promotions / cancellations; links are refused", () => {
  const approved = renderHostNotice("admission_approved", { eventTitle: "CFO Night Tokyo vol.18", organizerName: "CFO Night 実行委員会" }, "当日は 18:45 から受付を開始します。");
  assert.equal(approved.ja.body, "CFO Night Tokyo vol.18 への参加が承認されました。当日は受付で QR を表示してください。\n主催者より：当日は 18:45 から受付を開始します。");
  assert.ok(!renderHostNotice("admission_rejected", { eventTitle: "x", organizerName: null }, "note").ja.body.includes("note"));
  assert.equal(hostNoteText.safeParse("詳しくは https://example.com で").success, false);
  assert.equal(hostNoteText.safeParse("詳しくは example.com で").success, false);
  assert.equal(hostNoteText.safeParse("あ".repeat(141)).success, false);
  assert.equal(hostNoteText.safeParse("名刺を 20枚ほどお持ちください。").success, true);
});

test("worker: inbox for everyone with an account, email only when allowed, idempotent", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await lockedFixtureQuery(pool, `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, lifecycle_state_v2, title, created_by) values ($1, 'evt_n', 'host', now(), now(), 'published', 'CFO Night Tokyo vol.18', 'host')`, [workspaceId]);
    for (const [id, email] of [["actor:a", "a@example.com"], ["actor:b", "b@example.com"]]) {
      await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, `auth_user:${email}`, id, JSON.stringify({ displayName: id, email, id })]);
    }
    await client.transaction(async (executor) => {
      await enqueueHostNotice(executor, { actorId: "actor:a", eventId: "evt_n", kind: "admission_approved", payload: { receptionNumber: "A-001" }, workspaceId });
      await enqueueHostNotice(executor, { actorId: "actor:b", eventId: "evt_n", kind: "admission_rejected", workspaceId });
      await enqueueHostNotice(executor, { actorId: "actor:ghost", eventId: "evt_n", kind: "admission_rejected", workspaceId });
      assert.equal(await enqueueHostNotice(executor, { actorId: "actor:a", eventId: "evt_n", kind: "admission_approved", workspaceId }), false, "same person, same event, same kind: once");
    });
    const mails: string[] = [];
    const mailer = { send: async (mail: { to: string }) => { mails.push(mail.to); return { delivered: true, redirected: true }; } };
    const tally = await deliverHostNotices({ client, emailAllowed: async (actor) => actor !== "actor:b", mailer, workspaceId });
    assert.deepEqual(tally, { failed: 0, sent: 2, skipped: 1 });
    assert.deepEqual(mails, ["a@example.com"], "b turned update mails off; the ghost has no account");
    const inbox = await pool.query<{ user_id: string; payload: { notification: { sources: Array<{ sourceKind: string }>; title: string } } }>(`select user_id, payload from orbit_records where workspace_id = $1 and collection_name = 'inboxNotifications' order by user_id`, [workspaceId]);
    assert.deepEqual(inbox.rows.map((row) => [row.user_id, row.payload.notification.sources[0]?.sourceKind, row.payload.notification.title]), [["actor:a", "event_host_notice", "参加が承認されました"], ["actor:b", "event_host_notice", "申込について"]]);
    assert.deepEqual(await deliverHostNotices({ client, mailer, workspaceId }), { failed: 0, sent: 0, skipped: 0 }, "nothing is delivered twice");
  });
});

test("worker (R17 复核): a failed mail is retried, a claimed row is not taken twice, desktop links need no event", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await lockedFixtureQuery(pool, `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, lifecycle_state_v2, title, created_by) values ($1, 'evt_r', 'host', now(), now(), 'published', 'CFO Night Tokyo vol.18', 'host')`, [workspaceId]);
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', 'auth_user:a@example.com', 'auth', 'actor:a', $2::jsonb, now(), now())`, [workspaceId, JSON.stringify({ displayName: "A", email: "a@example.com", id: "actor:a" })]);
    await client.transaction(async (executor) => {
      await enqueueHostNotice(executor, { actorId: "actor:a", eventId: "evt_r", kind: "admission_approved", workspaceId });
      await enqueueHostNotice(executor, { actorId: "actor:a", eventId: "host-center", idempotencyKey: "notice:host-center:desktop_link:actor:a:x", kind: "desktop_link", payload: { href: "/app/events/center" }, workspaceId });
    });
    let fail = true;
    const mailer = { send: async () => (fail ? { delivered: false, reason: "failed" as const, redirected: true } : { delivered: true, redirected: true }) };
    let t = new Date("2026-10-08T10:00:00Z");
    const first = await deliverHostNotices({ client, mailer, now: () => t, workspaceId });
    assert.deepEqual(first, { failed: 0, sent: 1, skipped: 0 }, "the desktop link (no event, no mail) is delivered; the failed mail is not marked sent");
    const pending = await pool.query<{ status: string; claimed_until: unknown }>(`select status, claimed_until from event_host_notice_outbox where workspace_id = $1 and kind = 'admission_approved'`, [workspaceId]);
    assert.equal(pending.rows[0]?.status, "pending");
    // 租约里的行（模拟另一个 worker 刚领走）不会被再次领取。
    await pool.query(`update event_host_notice_outbox set claimed_until = $2 where workspace_id = $1 and kind = 'admission_approved'`, [workspaceId, "2026-10-08T10:10:00Z"]);
    t = new Date("2026-10-08T10:05:00Z");
    assert.deepEqual(await deliverHostNotices({ client, mailer, now: () => t, workspaceId }), { failed: 0, sent: 0, skipped: 0 });
    fail = false;
    t = new Date("2026-10-08T10:11:00Z");
    assert.deepEqual(await deliverHostNotices({ client, mailer, now: () => t, workspaceId }), { failed: 0, sent: 1, skipped: 0 }, "retried after the lease and the mail went out");
  });
});

test("worker mail (2026-11-27): addressed by profile name in the recipient's language, not the account name in Japanese", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await lockedFixtureQuery(pool, `insert into event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at, lifecycle_state_v2, title, created_by) values ($1, 'evt_l', 'host', now(), now(), 'published', '第六期 中日创业交流会', 'host')`, [workspaceId]);
    const people = [["actor:zh", "cherlytae@example.com", "小雨", { mode: "manual", language: "zh" }], ["actor:none", "none@example.com", null, null], ["actor:last", "last@example.com", "Ken", { mode: "system", language: null }]] as const;
    for (const [id, email, profileName, pref] of people) {
      await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, `auth_user:${email}`, id, JSON.stringify({ displayName: email.split("@")[0], email, id })]);
      if (profileName) await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'profiles', $2, $3, 'manual', $2, $4::jsonb, now(), now())`, [workspaceId, `profile:${id}`, id, JSON.stringify({ accountId: id, displayName: profileName })]);
      if (pref) await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'account_language_preferences', $2, $3, 'manual', $2, $4::jsonb, now(), now())`, [workspaceId, `lang:${id}`, id, JSON.stringify({ actorId: id, ...pref })]);
    }
    // 跟随系统的 Ken：最近一次使用的界面语言是英文（accountUiLanguageSeen）。
    await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'accountUiLanguageSeen', 'seen:last', 'actor:last', 'manual', 'seen:last', '{"actorId":"actor:last","language":"en"}'::jsonb, now(), now())`, [workspaceId]);
    await client.transaction(async (executor) => {
      for (const [id] of people) await enqueueHostNotice(executor, { actorId: id, eventId: "evt_l", kind: "admission_approved", workspaceId });
    });
    const mails: { to: string; subject: string; text: string }[] = [];
    const mailer = { send: async (mail: { to: string; subject: string; text: string }) => { mails.push(mail); return { delivered: true, redirected: true }; } };
    await deliverHostNotices({ client, mailer, workspaceId });
    const by = (to: string) => mails.find((mail) => mail.to === to)!;
    assert.match(by("cherlytae@example.com").text, /^小雨，你好\n\n你已获准参加第六期 中日创业交流会。/u, "profile name, Chinese greeting and body");
    assert.equal(by("cherlytae@example.com").subject, "【第六期 中日创业交流会】参加已获批准");
    assert.doesNotMatch(by("cherlytae@example.com").text, /cherlytae|様|イベントを見る/u);
    assert.match(by("none@example.com").text, /^none 様\n\n/u, "no profile name and no preference: account name, Japanese");
    assert.match(by("last@example.com").text, /^Hi Ken,\n\nYour place at/u, "following the system: the last UI language");
  });
});
