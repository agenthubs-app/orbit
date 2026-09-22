import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const source = (path: string) => readFileSync(join(projectRoot, path), "utf8");

test("event operations workspace requires login and per-event operations capability", () => {
  const page = source("app/(app)/app/events/[id]/operations/page.tsx");
  const eventDetail = source("app/(app)/app/events/[id]/page.tsx");

  assert.match(page, /const \[\{ id: routeId \}, session\] = await Promise\.all\(\[params, auth\(\)\]\)/);
  assert.match(page, /if \(!session\?\.user\?\.id\)/);
  assert.match(page, /createConfiguredEventAccessService\(\)/);
  assert.match(page, /canonicalEventId = \(await eventCore\.getEvent\(eventId\)\)\?\.eventId/);
  assert.match(page, /requireEventCapability/);
  assert.match(page, /capability: "operations\.read_sensitive"/);
  assert.match(page, /actorId: session\.user\.id/);
  assert.match(page, /eventId: canonicalEventId/);
  assert.match(page, /Event operations access required/);
  assert.doesNotMatch(page, /readPublicEventCatalogue/);
  assert.doesNotMatch(eventDetail, /Open organizer operations/);
});

test("organizer workspace exposes the complete strict generation and audit workflow", () => {
  // 运营台 任务 1：状态/fetch/动作已原样搬入 ops-0918/use-event-operations.ts；
  // 下面按「hook 文件 vs JSX 文件」拆分同一组断言，意图不变。
  // 运营台 任务 3：旧 admin workspace JSX 已被 ops-0918 概览 / 匹配屏替换（旧文件删除）。JSX 侧断言的新去处：
  //   ops-console.tsx           useEventOperations(event)、/export（「更多 ⌄」菜单）
  //   ops-overview.tsx          CONSENT AUDIT / VENUE CHECK-IN ENTRY /
  //                             不会生成二维码图片 / CONFIGURED TIMELINE / readOnly={canonicalScheduleFields.includes /
  //                             onInput ×3 + nextValue ×3 / profileEditDeadlineAt / roundOneStartsAt（配置折叠区）
  //   运营台 任务 4：「参会者与到场状态」目录（REAL REGISTRATION DIRECTORY / 标记到场）迁出概览 ——
  //   真实报名目录 → ops-people.tsx（workspace.participants 表格）；标记到场 → ops-checkin.tsx（useCheckInRoster.markArrived）。
  //   ops-match.tsx             Worker 处理中 / 重试失败分片 / 原子发布 / 所有任务完成并由你发布后… / table.rationale /
  //                             table.icebreakers / member.seat（桌卡）/ grouping.roundOne|roundTwo（经 ops-model roundTables）
  //   ops-operations-shared.tsx 生成匹配（尚无生成时的按钮名）/ 失败的片段会自动重试（确认框）/ 重试失败分片 / 原子发布 文案表
  //   ops-model.ts              grouping.roundOne / grouping.roundTwo（roundTables）；PUBLISHED SEATING PREVIEW 眉题随旧预览区
  //                             一并退役（桌卡 = 已发布分桌，语义由「桌卡只读取已原子发布的结果」文案承接）。
  const screens = [
    "app/(app)/app/events/ops-0918/ops-console.tsx",
    "app/(app)/app/events/ops-0918/ops-overview.tsx",
    "app/(app)/app/events/ops-0918/ops-match.tsx",
    "app/(app)/app/events/ops-0918/ops-operations-shared.tsx",
    "app/(app)/app/events/ops-0918/ops-people.tsx",
    "app/(app)/app/events/ops-0918/ops-checkin.tsx",
  ];
  const client = screens.map(source).join("\n");
  const model = source("app/(app)/app/events/ops-0918/ops-model.ts");
  const hook = source("app/(app)/app/events/ops-0918/use-event-operations.ts");
  assert.match(client, /useEventOperations\(event\)/);

  assert.match(hook, /method: "PUT"/);
  assert.match(client, /生成匹配/);
  assert.match(client, /Worker 处理中/);
  assert.match(hook, /setInterval/);
  assert.match(client, /失败的片段会自动重试/);
  assert.match(hook, /失败的片段会自动重试/);
  assert.doesNotMatch(client, /maxConcurrency|event-operations-admin-ui/);
  assert.doesNotMatch(hook, /maxConcurrency|event-operations-admin-ui/);
  assert.match(client, /重试失败分片/);
  assert.match(client, /原子发布/);
  assert.match(hook, /已完成分片的输出全部保留/);
  assert.match(
    hook,
    /const actionError[\s\S]*await load\(\);[\s\S]*setError\(actionError\)/,
    "generation failures must remain visible after the latest persisted state is reloaded",
  );
  assert.match(client, /\/export/);
  assert.match(client, /workspace\.participants\.length === 0 \? <div className="op-empty op-prow-empty">尚无报名。/, "real registration directory (people screen)");
  assert.match(client, /CONSENT AUDIT/);
  assert.match(hook, /\/check-ins/);
  assert.match(client, /标记到场/);
  assert.match(client, /VENUE CHECK-IN ENTRY/);
  assert.match(client, /不会生成二维码图片/);
  assert.match(hook, /\/operations\/check-in`/);
  assert.doesNotMatch(client, /\/app\/party/);
  assert.doesNotMatch(hook, /\/app\/party/);
  assert.match(client, /CONFIGURED TIMELINE/);
  assert.match(hook, /canonicalScheduleFields = \["eventStartsAt", "eventEndsAt"\]/);
  assert.match(hook, /field === "eventStartsAt"\s*\? event\.startsAt/);
  assert.match(hook, /field === "eventEndsAt"\s*\? event\.endsAt/);
  assert.match(client, /readOnly=\{canonicalScheduleFields\.includes/);
  assert.equal(
    (client.match(/onInput=\{\(input\) => \{/g) ?? []).length,
    3,
    "datetime and numeric policies must update on real input, paste, and autofill events",
  );
  assert.equal(
    (client.match(/const nextValue = input\.currentTarget\.value/g) ?? []).length,
    3,
    "input values must be snapshotted before React releases the synthetic event",
  );
  assert.doesNotMatch(client, /onChange=\{\(input\) => setForm/);
  assert.match(client, /profileEditDeadlineAt/);
  assert.match(client, /roundOneStartsAt/);
  assert.match(client, /桌卡只读取已原子发布的结果/u);
  assert.match(client, /roundTables\(published, round\)/);
  assert.match(model, /grouping\.roundOne/);
  assert.match(model, /grouping\.roundTwo/);
  assert.match(client, /table\.rationale/);
  assert.match(client, /table\.icebreakers/);
  assert.match(client, /member\.seat/);
  assert.match(client, /所有任务完成并由你发布后，参会者才能看到生成结果/);
  assert.doesNotMatch(client, /mock recommendation|fallback table|first four/i);
});

test("event operations routes bind organizer and attendee actions to server event scope", () => {
  const handlers = source("app/api/events/[id]/operations/handlers.ts");
  const service = source("features/events/event-operations/service.ts");
  const onsiteRepository = source(
    "features/events/event-operations/storage/onsite-operations-repository.ts",
  );
  const ownerRoutes = [
    "app/api/events/[id]/operations/admin/route.ts",
    "app/api/events/[id]/operations/admin/export/route.ts",
    "app/api/events/[id]/operations/admin/check-ins/route.ts",
    "app/api/events/[id]/operations/admin/generations/route.ts",
    "app/api/events/[id]/operations/admin/generations/[generationId]/run/route.ts",
    "app/api/events/[id]/operations/admin/generations/[generationId]/retry/route.ts",
    "app/api/events/[id]/operations/admin/generations/[generationId]/publish/route.ts",
  ];
  const attendeeRoutes = [
    "app/api/events/[id]/operations/route.ts",
    "app/api/events/[id]/operations/check-in/route.ts",
    "app/api/events/[id]/operations/contact-requests/route.ts",
    "app/api/events/[id]/operations/contact-requests/[requestId]/respond/route.ts",
  ];

  for (const path of [...ownerRoutes, ...attendeeRoutes]) {
    assert.match(source(path), /createEventOperations/);
  }
  assert.match(
    handlers,
    /withEventCapabilityAccess\("attendees\.export"/u,
  );
  assert.match(handlers, /withRegisteredEventAccess/);
  assert.match(handlers, /EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED/);
  assert.doesNotMatch(handlers, /serviceFor\(dependencies\)\.runGeneration/);
  assert.match(handlers, /eventId: access\.eventId/g);
  assert.match(handlers, /published\?\.directory \?\? workspace\.participants/);
  assert.match(handlers, /published\?\.generationId/);
  assert.match(handlers, /published\?\.snapshotHash/);
  assert.match(service, /generation\.eventId !== input\.eventId/);
  assert.match(onsiteRepository, /request\.event_id !== eventId/);
  assert.match(onsiteRepository, /request\.target_actor_id !== targetActorId/);
  assert.match(onsiteRepository, /Only the target participant can respond/);
});

test("E2E seed requires an external password and never fabricates AI output", () => {
  const seed = source("features/events/event-operations/seed.ts");
  const script = source("scripts/seed-event-operations-e2e.ts");

  assert.match(seed, /EVENT_OPERATIONS_E2E_PARTICIPANTS/);
  assert.match(seed, /matchingCohort\.length !== 64/);
  assert.match(seed, /cancelledFixtures\.length !== 6/);
  assert.match(seed, /lateFixtures\.length !== 3/);
  assert.match(script, /EVENT_OPERATIONS_E2E_SEED_ACCOUNTS/);
  assert.match(seed, /profileEditDeadlineAt/);
  assert.match(seed, /EVENT_OPERATIONS_COLLECTIONS/);
  assert.match(script, /ORBIT_EVENT_OPERATIONS_SEED_PASSWORD/);
  assert.match(script, /The seed never embeds or prints a password/);
  assert.match(script, /No recommendation, table, graph, check-in, or contact-request result was fabricated/);
  assert.doesNotMatch(script, /password:\s*["'][^"']+["']/);
});
