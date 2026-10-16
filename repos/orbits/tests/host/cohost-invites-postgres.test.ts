/**
 * R17 SC-R17-09：共同運営者邀请安全。令牌单次、绑定被邀请人（转发后被别人接受 → 拒绝）、短码限流与锁定、
 * 无效码反馈一致、manager 角色授予后有审核能力、owner 不可移除、改角色必须写理由、只有 owner 能发邀请。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { canAccessEventCapability } from "../../features/events/event-access/capability-policy";
import { createPostgresEventAccessRepository } from "../../features/events/event-access/storage/postgres-repository";
import { HostError } from "../../features/events/host/service";
import { createHostCohosts } from "../../features/events/host/storage/cohosts";
import { createHostLifecycle } from "../../features/events/host/storage/lifecycle";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";
const isHost = (code: string) => (error: unknown) => error instanceof HostError && error.code === code;

test("co-host invites, accept, roles and protections", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    for (const [id, email] of [["actor:ito", "ito@example.com"], ["actor:other", "other@example.com"]]) {
      await lockedFixtureQuery(pool, `insert into orbit_records (workspace_id, collection_name, record_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'auth_users', $2, 'auth', $3, $4::jsonb, now(), now())`, [workspaceId, `auth_user:${email}`, id, JSON.stringify({ displayName: id.slice(6), email, id })]);
    }
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1, 'prof', $2, 'org', 'Org')`, [workspaceId, HOST]);
    const lifecycle = createHostLifecycle({ client, newEventId: () => "evt_cohost", workspaceId });
    const draft = await lifecycle.create(HOST, { endsAt: "2100-01-02T12:00:00.000Z", feeKind: "free", organizerProfileId: "prof", startsAt: "2100-01-02T10:00:00.000Z", title: "Cohost night" });
    await lifecycle.publish(HOST, draft.eventId, draft.version);
    const access = createPostgresEventAccessRepository({ client, workspaceId });
    let clock = new Date();
    let seed = 0;
    const cohosts = createHostCohosts({ access, client, now: () => clock, randomBytes: (size) => Uint8Array.from({ length: size }, (_, i) => (i * 7 + ++seed) % 251), workspaceId });

    await assert.rejects(cohosts.invite("actor:ito", draft.eventId, { idempotencyKey: "key-invite-x", role: "manager" }), isHost("FORBIDDEN"), "only the owner invites");
    const bound = await cohosts.invite(HOST, draft.eventId, { idempotencyKey: "key-invite-1", role: "manager", target: "ito@example.com" });
    assert.match(bound.shortCode, /^H-[2-9A-Z]{4}-[2-9A-Z]{4}$/u);
    assert.ok(bound.link.length > 40, "≥128-bit token");
    const notice = await pool.query(`select actor_id, kind from event_host_notice_outbox where workspace_id = $1`, [workspaceId]);
    assert.deepEqual(notice.rows, [{ actor_id: "actor:ito", kind: "cohost_invite" }], "an in-app notice for an existing account only");
    const stranger = await cohosts.invite(HOST, draft.eventId, { idempotencyKey: "key-invite-2", role: "check_in", target: "nobody@example.com" });
    assert.ok(stranger.shortCode, "the same answer whether or not the address has an account");
    assert.equal((await pool.query(`select count(*)::int as n from event_host_notice_outbox where workspace_id = $1`, [workspaceId])).rows[0]?.n, 1, "no notice to an unknown address");

    const token = bound.link.split("/").pop()!;
    await assert.rejects(cohosts.accept("actor:other", token, "client-a"), isHost("TOKEN_INVALID"), "a forwarded link cannot be used by someone else");
    const accepted = await cohosts.accept("actor:ito", token, "client-b");
    assert.equal(accepted.role, "manager");
    await assert.rejects(cohosts.accept("actor:ito", token, "client-b"), isHost("TOKEN_INVALID"), "single use");
    const view = await access.get({ eventId: draft.eventId, subjectActorId: "actor:ito" });
    assert.equal(canAccessEventCapability({ capability: "admission.decide", owner: view.owner, role: view.role, state: view.state }), true, "manager can review");
    assert.equal(canAccessEventCapability({ capability: "event.cancel", owner: view.owner, role: view.role, state: view.state }), false);

    assert.equal(await cohosts.preview("H-2222-2222", "client-c"), null);
    for (let i = 0; i < 9; i += 1) await cohosts.preview("H-2222-2222", "client-c");
    await assert.rejects(cohosts.preview(stranger.shortCode, "client-c"), isHost("RATE_LIMITED"), "locked after 10 failures, even for a valid code");
    clock = new Date(clock.getTime() + 16 * 60_000);
    assert.ok(await cohosts.preview(stranger.shortCode, "client-c"), "unlocked after 15 minutes");
    clock = new Date(clock.getTime() + 8 * 86_400_000);
    assert.equal(await cohosts.preview(stranger.shortCode, "client-d"), null, "expired after 7 days");
    clock = new Date();

    await assert.rejects(cohosts.remove(HOST, draft.eventId, HOST, { expectedRevision: 0, reason: "x" }), isHost("FORBIDDEN"), "the owner cannot be removed");
    await assert.rejects(cohosts.changeRole(HOST, draft.eventId, "actor:ito", { expectedRevision: view.revision, reason: "  ", role: "check_in" }), isHost("VALIDATION"), "a reason is required");
    await cohosts.changeRole(HOST, draft.eventId, "actor:ito", { expectedRevision: view.revision, reason: "当日の受付を担当するため", role: "check_in" });
    const members = await cohosts.members(draft.eventId);
    assert.deepEqual(members.map((member) => member.role), ["owner", "check_in"]);
    const history = await cohosts.history(draft.eventId);
    assert.deepEqual(history.map((item) => [item.action, item.reason]), [["changed", "当日の受付を担当するため"], ["granted", "招待リンクから参加"]]);
    assert.deepEqual((await cohosts.checkInEvents("actor:ito")).map((item) => item.eventId), [draft.eventId]);
  });
});
