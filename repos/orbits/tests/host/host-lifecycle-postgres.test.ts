/**
 * R17 SC-R17-02：主办方活动写入（三表同事务）。建 → 公開（参加コード两个 alias + 短链 + 缺省 event-ops 配置 + 幂等）
 * → by-code 命中 → 改日時（先给预览，选通知才写 outbox，配置同步换版本）→ 中止（只有 owner、alias 删除、通知）
 * → 归档 / 解除；回填重跑不覆盖 host 活动；再发行参加コード后旧码失效。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { applyEventCoreBackfillPlan } from "../../features/events/core/backfill";
import { createPostgresEventCoreRepository } from "../../features/events/core/storage/postgres-repository";
import { createHostLifecycle, defaultOperationsSchedule, slugBase } from "../../features/events/host/storage/lifecycle";
import { HostError } from "../../features/events/host/service";
import { hostDatabaseTest, withHostDatabase } from "../support/host-harness";
import { lockedFixtureQuery } from "../support/sync-revision-fixture";

const HOST = "actor:host";
const input = { endsAt: "2026-11-04T12:30:00.000Z", feeAmountYen: 5000, feeKind: "amount" as const, organizerProfileId: "prof_cfo", startsAt: "2026-11-04T10:00:00.000Z", title: "CFO Night Tokyo vol.19", venueName: "渋谷ストリーム 4F ホール" };

test("pure helpers: slug from the ASCII part of the title; default schedule keeps the ops constraints", () => {
  assert.equal(slugBase("CFO Night Tokyo vol.19", "evt_x"), "cfo-night-tokyo-vol-19");
  assert.equal(slugBase("製造業 朝会", "evt_abcdef123456"), "e-ef123456", "no ASCII → the tail of the event id");
  const s = defaultOperationsSchedule(input.startsAt, input.endsAt, null);
  assert.ok(Date.parse(s.profileEditDeadlineAt) <= Date.parse(s.registrationCutoffAt));
  assert.ok(Date.parse(s.registrationCutoffAt) <= Date.parse(s.resultsAvailableAt));
  assert.ok(Date.parse(s.resultsAvailableAt) <= Date.parse(s.roundOneStartsAt));
  assert.ok(Date.parse(s.roundOneStartsAt) < Date.parse(s.roundTwoStartsAt));
  assert.ok(Date.parse(s.roundTwoStartsAt) <= Date.parse(s.eventEndsAt));
  assert.throws(() => defaultOperationsSchedule(input.startsAt, "2026-11-04T10:10:00.000Z", null), HostError);
});

test("host lifecycle against the migrated schema", hostDatabaseTest, async () => {
  await withHostDatabase(async ({ client, pool, workspaceId }) => {
    await pool.query(`insert into organizer_profiles (workspace_id, profile_id, owner_actor_id, slug, display_name) values ($1, 'prof_cfo', $2, 'cfo-night', 'CFO Night 実行委員会')`, [workspaceId, HOST]);
    let n = 0;
    const lifecycle = createHostLifecycle({ client, newEventId: () => `evt_test_${++n}`, randomBytes: (() => { let k = 0; return () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, (k++ % 2) + n * 2]); })(), workspaceId });
    await assert.rejects(lifecycle.create("actor:other", input), (error: unknown) => error instanceof HostError && error.code === "FORBIDDEN", "the profile belongs to someone else");

    const draft = await lifecycle.create(HOST, input);
    assert.deepEqual([draft.lifecycle, draft.createdBy, draft.version, draft.payload.feeAmountYen], ["draft", "host", 1, 5000]);
    const core = createPostgresEventCoreRepository({ client, workspaceId });
    assert.equal((await core.getEvent(draft.eventId))?.lifecycleState, "draft");

    const { event: published } = await lifecycle.publish(HOST, draft.eventId, draft.version);
    assert.equal(published.lifecycle, "published");
    assert.match(published.publicCode ?? "", /^[2-9A-Z]{4}-[2-9A-Z]{4}$/u);
    const replay = await lifecycle.publish(HOST, draft.eventId, draft.version);
    assert.equal(replay.event.version, published.version, "publish is idempotent");
    const aliases = await pool.query<{ alias_type: string; alias_value: string }>(`select alias_type, alias_value from event_aliases where workspace_id = $1 and event_id = $2 order by alias_type, alias_value`, [workspaceId, draft.eventId]);
    assert.deepEqual(aliases.rows.map((row) => row.alias_type), ["event_id", "public_code", "public_code", "public_slug"]);
    assert.equal(aliases.rows.find((row) => row.alias_type === "public_slug")?.alias_value, "cfo-night-tokyo-vol-19");
    assert.equal((await core.resolveAlias(published.publicCode!.toLowerCase()))?.eventId, draft.eventId);
    assert.equal((await core.resolveAlias(published.publicCode!.replace("-", "").toLowerCase()))?.eventId, draft.eventId);
    const config = await pool.query(`select h.configuration_version, e.registration_migration_state from event_ops_configuration_heads h join event_ops_events e using (workspace_id, event_id) where h.workspace_id = $1 and h.event_id = $2`, [workspaceId, draft.eventId]);
    assert.equal(config.rows[0]?.registration_migration_state, "canonical", "check-in works without configuring matching");
    const versions = await pool.query(`select count(*)::int as n from event_event_versions where workspace_id = $1 and event_id = $2`, [workspaceId, draft.eventId]);
    assert.equal(versions.rows[0]?.n, 2);

    await lockedFixtureQuery(pool, `insert into event_ops_admission_policy_versions (workspace_id, event_id, policy_version, capacity, admission_mode, waitlist_enabled, registration_opens_at, registration_closes_at, updated_at) values ($1, $2, 1, 150, 'approval_required', true, now() - interval '1 day', '2026-11-03T14:59:00Z', now())`, [workspaceId, draft.eventId]);
    await lockedFixtureQuery(pool, `insert into event_ops_admission_policy_heads (workspace_id, event_id, policy_version, updated_at) values ($1, $2, 1, now())`, [workspaceId, draft.eventId]);
    await lockedFixtureQuery(pool, `insert into event_ops_admission_application_versions (workspace_id, event_id, actor_id, application_version, policy_version, status, profile_payload, submitted_at, updated_at) values ($1, $2, 'actor:a1', 1, 1, 'pending_review', '{}', now(), now())`, [workspaceId, draft.eventId]);
    await lockedFixtureQuery(pool, `insert into event_ops_admission_application_heads (workspace_id, event_id, actor_id, application_version, policy_version, status, profile_payload, submitted_at, updated_at) values ($1, $2, 'actor:a1', 1, 1, 'pending_review', '{}', now(), now())`, [workspaceId, draft.eventId]);

    const moved = { endsAt: "2026-11-05T12:30:00.000Z", expectedVersion: published.version, startsAt: "2026-11-05T10:00:00.000Z" };
    const preview = await lifecycle.update(HOST, draft.eventId, moved);
    assert.equal(preview.needsDecision, true, "a published time change asks whether to notify first");
    assert.equal(preview.event.version, published.version, "nothing written yet");
    const saved = await lifecycle.update(HOST, draft.eventId, { ...moved, notify: true });
    assert.equal(saved.event.startsAt, moved.startsAt);
    const configVersions = await pool.query(`select count(*)::int as n from event_ops_configurations where workspace_id = $1 and event_id = $2`, [workspaceId, draft.eventId]);
    assert.equal(configVersions.rows[0]?.n, 2, "ops configuration follows the new time");
    assert.equal(saved.notified, 0, "only approved / waitlisted people are told about a change");

    await assert.rejects(lifecycle.cancel("actor:manager", draft.eventId, saved.event.version, null), (error: unknown) => error instanceof HostError && error.code === "FORBIDDEN");
    const cancelled = await lifecycle.cancel(HOST, draft.eventId, saved.event.version, "会場の都合により中止となりました。");
    assert.deepEqual([cancelled.event.lifecycle, cancelled.event.publicCode, cancelled.notified], ["cancelled", null, 1]);
    assert.equal(await core.resolveAlias(published.publicCode!.toLowerCase()), null, "the code stops working");
    const outbox = await pool.query<{ kind: string; actor_id: string }>(`select kind, actor_id from event_host_notice_outbox where workspace_id = $1 and event_id = $2`, [workspaceId, draft.eventId]);
    assert.deepEqual(outbox.rows, [{ actor_id: "actor:a1", kind: "event_cancelled" }]);

    const archived = await lifecycle.archive(draft.eventId, cancelled.event.version, true);
    assert.equal(archived.lifecycle, "archived");
    const restored = await lifecycle.archive(draft.eventId, archived.version, false);
    assert.deepEqual([restored.lifecycle, Boolean(restored.cancelledAt)], ["cancelled", true]);

    // 回填重跑不覆盖 host 活动（码、生命周期都不动）。
    const before = await pool.query(`select event_version, lifecycle_state_v2 from event_ops_events where workspace_id = $1 and event_id = $2`, [workspaceId, draft.eventId]);
    await applyEventCoreBackfillPlan({ client, plan: { count: 1, events: [{ aliases: [{ type: "public_code", value: "OLDCODE1" }], contentHash: "x", description: "", endsAt: input.endsAt, eventId: draft.eventId, lifecycleState: "published", organizerActorId: HOST, publicCode: "OLDCODE1", sourcePayload: {}, startsAt: input.startsAt, timezone: "Asia/Tokyo", title: "overwritten", venue: "" }], hash: "h", migrationId: "m", resolutionCount: 0 }, workspaceId });
    const after = await pool.query(`select event_version, lifecycle_state_v2 from event_ops_events where workspace_id = $1 and event_id = $2`, [workspaceId, draft.eventId]);
    assert.deepEqual(after.rows, before.rows);
    assert.equal(await core.resolveAlias("oldcode1"), null);

    // 再发行：旧码立即失效。
    const second = await lifecycle.create(HOST, { ...input, title: "CFO Night Tokyo vol.20" });
    const live = (await lifecycle.publish(HOST, second.eventId, second.version)).event;
    const reissued = await lifecycle.reissueCode(second.eventId, live.version);
    assert.notEqual(reissued.publicCode, live.publicCode);
    assert.equal(await core.resolveAlias(live.publicCode!.toLowerCase()), null);
    assert.equal((await core.resolveAlias(reissued.publicCode!.toLowerCase()))?.eventId, second.eventId);
  });
});
