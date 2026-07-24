import assert from "node:assert/strict";
import test from "node:test";

import { scheduleEventPreviewToView } from "../src/view-models/schedule-event-preview";

test("scheduleEventPreviewToView maps event detail into a read-only schedule preview", () => {
  const view = scheduleEventPreviewToView({
    event: {
      description:
        "JA: 投資家向け。 ZH: 投资人与创业者提前登记融资阶段和想认识的人。 EN: Investor founder intake.",
      evidence: [
        {
          excerpt:
            "JA: 投資家向け。 ZH: 报名信息会用于会前整理介绍重点。 EN: Signup context."
        }
      ],
      id: "event_signup_03",
      nextAction: "Review the source-backed event in Orbit.",
      recommendedPreparation: "Review the source-backed event before taking action.",
      relationshipContext:
        "event_signup_03 profile_orbit_generated_operator JA: 投資家向け。 ZH: 根据报名信息提前整理融资阶段、介绍诉求和会谈主题。 EN: Prepare from signup data.",
      sourceMetadata: {
        label:
          "日中投資家・創業者申込サロン / 日中投资人与创业者报名沙龙 / Japan-China Investor Founder Signup Salon"
      },
      startsAt: "2026-07-04T10:00:00.000Z",
      status: "confirmed",
      title: "Tokyo founder salon",
      venue: "Shibuya"
    }
  });

  assert.deepEqual(view, {
    actions: [
      { href: "/schedule", label: "返回日程" },
      { href: "/events", label: "查看活动列表" }
    ],
    description: "投资人与创业者提前登记融资阶段和想认识的人。",
    event: {
      id: "event_signup_03",
      nextAction: "先看报名信息，再决定要准备的介绍和会谈重点。",
      sourceContext: "来源：日中投资人与创业者报名沙龙，证据 1 条",
      statusLabel: "已确认",
      timing: "活动时间：7月4日 周六 19:00",
      title: "日中投资人与创业者报名沙龙",
      venue: "地点：Shibuya"
    },
    guardrail: "这个预览不会写入日历、报名、提醒或消息。",
    title: "活动安排预览"
  });
});

test("scheduleEventPreviewToView keeps failure states useful", () => {
  const view = scheduleEventPreviewToView(null);

  assert.equal(view.title, "安排预览无法加载");
  assert.equal(view.description, "这条活动安排暂时不可用。");
  assert.equal(view.guardrail, "来源不可用时，Orbit 不会写入日历、提醒、消息或外部系统。");
  assert.deepEqual(view.actions, [
    { href: "/schedule", label: "返回日程" },
    { href: "/events", label: "查看活动列表" }
  ]);
});
