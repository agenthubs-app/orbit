import assert from "node:assert/strict";
import test from "node:test";

import { partyModeToView } from "../src/view-models/party";

test("partyModeToView builds a Chinese on-site party view from event context", () => {
  const view = partyModeToView({
    attendeesPayload: {
      attendees: [
        {
          attendeeId: "participant_002",
          attendeeTags: [{ label: "跨境渠道" }],
          avatarAssetUrl: "/orbit-demo-assets/avatars/participant-002.svg",
          checkInStatus: "registered",
          displayName: "王琳",
          eligibleRecommendation: {
            reasons: ["能介绍关西渠道伙伴。", "provider generated note"]
          },
          organization: "红桥科技",
          relationshipContext:
            "紅橋テックの市場責任者。 / 红桥科技的市场负责人。本次关注「日本落地可信赖的税务与设立顾问」，可提供「关西合作渠道介绍」。 / Market lead at Hongqiao Tech.",
          role: "市场负责人",
          suggestedNextAction: "先聊日本落地服务，再确认能不能互相介绍。"
        },
        {
          attendeeId: "participant_001",
          attendeeTags: [{ label: "投资人" }],
          checkInStatus: "checked_in",
          displayName: "林 直人",
          knownContactMarker: {
            contactId: "contact_001",
            isKnownContact: true
          },
          organization: "Kansai Ventures",
          relationshipContext: "可聊日本渠道和投资人视角。",
          role: "Partner",
          suggestedNextAction: "活动现场先约 10 分钟。"
        }
      ],
      event: {
        name: "関西越境ビジネス交流会 / 关西跨境商务交流会 / Kansai Cross-border Business Meetup",
        startsAt: "2026-02-15T10:00:00+09:00",
        venue: "大阪 Grand Front"
      }
    },
    eventPayload: {
      event: {
        description:
          "関西企業向け交流会。 / 面向中国创业者和关西本地资源方的闭门交流。 / Private meetup.",
        id: "event_01",
        startsAt: "2026-02-15T10:00:00+09:00",
        status: "scheduled",
        title:
          "関西越境ビジネス交流会 / 关西跨境商务交流会 / Kansai Cross-border Business Meetup",
        venue: "大阪 Grand Front"
      }
    },
    matchesPayload: {
      matches: [
        {
          matchId: "match_001",
          participantNames: ["Orbit operator", "王琳"],
          successNotice: {
            message: "generated match should be hidden",
            nextAction: "external action should be hidden",
            title: "generated match"
          }
        }
      ]
    }
  });

  assert.equal(view.eventTitle, "关西跨境商务交流会");
  assert.equal(view.accessCode, "EVEN-4821");
  assert.equal(view.checkIn.statusLabel, "待现场确认");
  assert.equal(view.metrics[0]?.label, "参会者");
  assert.equal(view.metrics[0]?.value, "2");
  assert.equal(view.metrics[1]?.label, "已签到");
  assert.equal(view.metrics[1]?.value, "1");
  assert.equal(view.metrics[2]?.label, "现场匹配");
  assert.equal(view.metrics[2]?.value, "1");
  assert.equal(view.priorityPeople[0]?.name, "王琳");
  assert.equal(
    view.priorityPeople[0]?.imageUrl,
    "/orbit-demo-assets/avatars/participant-002.svg"
  );
  assert.equal(view.priorityPeople[0]?.matchLabel, "现场匹配");
  assert.equal(
    view.priorityPeople[0]?.reason,
    "能介绍关西渠道伙伴。"
  );
  assert.equal(
    view.priorityPeople[0]?.relationshipContext,
    "红桥科技的市场负责人。本次关注「日本落地可信赖的税务与设立顾问」，可提供「关西合作渠道介绍」。"
  );
  assert.deepEqual(
    view.graphGroups.map((group) => group.title),
    ["跨境渠道", "投资人"]
  );
  assert.equal(view.agenda[0]?.title, "到场签到");
});

test("partyModeToView keeps empty party state useful", () => {
  const view = partyModeToView({
    attendeesPayload: {},
    eventPayload: {},
    matchesPayload: {}
  });

  assert.equal(view.eventId, "event_01");
  assert.equal(view.eventTitle, "活动现场");
  assert.equal(view.accessCode, "EVEN-4821");
  assert.deepEqual(view.priorityPeople, []);
  assert.deepEqual(view.graphGroups, []);
  assert.equal(view.nextAction, "先打开签到码，再看这场活动最值得优先认识的人。");
});

test("partyModeToView does not duplicate relationship context as the reason", () => {
  const view = partyModeToView({
    attendeesPayload: {
      attendees: [
        {
          attendeeId: "participant_011",
          checkInStatus: "registered",
          displayName: "曾伟",
          organization: "Kansai Community",
          relationshipContext:
            "关西社群的产品经理。本次关注「零售直播电商分销伙伴」，可提供「跟进消息多语言本地化」。",
          role: "Product Manager",
          suggestedNextAction: "如果对方也愿意，再继续下一步。"
        }
      ],
      event: {
        name: "东京餐饮入境客增长会"
      }
    },
    eventPayload: {
      event: {
        id: "event_01",
        title: "东京餐饮入境客增长会"
      }
    },
    matchesPayload: {}
  });

  assert.equal(
    view.priorityPeople[0]?.reason,
    "关西社群的产品经理。本次关注「零售直播电商分销伙伴」，可提供「跟进消息多语言本地化」。"
  );
  assert.equal(view.priorityPeople[0]?.relationshipContext, "");
});
