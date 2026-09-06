import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { before, after } from "node:test";
import { createIsolatedRegistrationRuntime } from "../support/isolated-registration-runtime";

let isolatedRuntime: Awaited<ReturnType<typeof createIsolatedRegistrationRuntime>>;
before(async () => { isolatedRuntime = await createIsolatedRegistrationRuntime(); });
after(async () => { await isolatedRuntime?.close(); });

test("registered catalogue attendee access follows persisted registration lifecycle", async () => {
  const actorId = `actor:catalogue-roster-lifecycle:${randomUUID()}`;
  const eventId = "event_signup_01";
  const { eventRegistrationRuntimeService } =
    await import("../../features/events/registration/runtime");
  const { getOrbitRegisteredEventViewModel } =
    await import("../../app/(app)/app/orbit-registered-event-route-view-model");
  const { resolveCanonicalPublicEventView } =
    await import("../../app/(app)/app/canonical-public-event-view");
  const event = await resolveCanonicalPublicEventView(eventId);
  assert.ok(event);

  assert.equal(
    await getOrbitRegisteredEventViewModel({ actorId, event }),
    null,
  );
  assert.equal(
    await resolveCanonicalPublicEventView("unknown-public-event"),
    null,
  );
  assert.equal(
    await getOrbitRegisteredEventViewModel({ actorId: "", event }),
    null,
  );
  assert.equal(
    await getOrbitRegisteredEventViewModel({
      actorId: "actor:catalogue-roster-other",
      event,
    }),
    null,
  );

  await eventRegistrationRuntimeService.register({
    answers: {
      desiredOutcome: "找到两位能共同验证日本制造业渠道合作假设的长期伙伴",
      energyStyle: "先听清背景，再围绕真实项目做小组深聊",
      experienceHighlight: "带领双语团队把工业 AI 试点推进到三家集团正式采购",
      followUpPreference: "会后四十八小时内邮件同步纪要，下周安排线上复盘",
      industry: "工业人工智能、气候科技与跨境企业软件",
      positioning: "负责跨境增长与生态合作的产品负责人",
      targetAttendees: "拥有日本制造业渠道并在落地边缘 AI 的业务负责人",
      valueOffered: "中日市场进入实验、企业采购决策链经验与产业伙伴引荐",
    },
    displayName: "目录名单测试用户",
    eventId,
    userId: actorId,
  });

  const registered = await getOrbitRegisteredEventViewModel({
    actorId,
    event,
  });

  assert.ok(registered);
  assert.equal(registered.stats.authed, true);
  assert.equal(registered.stats.youRsvped, true);
  assert.equal(registered.youRsvped, true);
  assert.equal(registered.stats.attendees.length, registered.participantCount);
  assert.ok(registered.stats.attendees.length > 0);

  await eventRegistrationRuntimeService.cancel({
    eventId,
    userId: actorId,
  });

  assert.equal(
    await getOrbitRegisteredEventViewModel({ actorId, event }),
    null,
  );
});

