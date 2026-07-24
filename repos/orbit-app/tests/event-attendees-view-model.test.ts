import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWantConnectRequest,
  eventAttendeeRosterToView,
  eventMatchesToView
} from "../src/view-models/event-attendees";

test("eventAttendeeRosterToView maps attendees into mobile cards", () => {
  const view = eventAttendeeRosterToView({
    attendees: [
      {
        attendeeId: "participant_001",
        attendeeTags: [
          {
            code: "investor_context",
            label: "投资人",
            rationale: "Looks relevant."
          },
          {
            code: "known_contact",
            label: "known_contact fixture",
            rationale: "fixture label"
          }
        ],
        checkInStatus: "checked_in",
        displayName: "林 直人",
        eligibleRecommendation: {
          attendeeId: "participant_001",
          blockedByKnownContact: false,
          isEligible: true,
          reasons: ["关注中国团队在日本落地。", "provider generated should be hidden"],
          recommendationCandidateId: "recommendation_001"
        },
        knownContactMarker: {
          attendeeId: "participant_001",
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
      name: "日中投资人与创业者报名沙龙",
      startsAt: "2026-08-18T09:00:00.000Z",
      venue: "Tokyo"
    },
    nextAction: "Review the live attendee roster before importing it into event context.",
    summary: "Live storage filtered attendees using roster tags and eligibility."
  });

  assert.equal(view.eventTitle, "日中投资人与创业者报名沙龙");
  assert.equal(view.eventDetail, "8月18日 周二 18:00 · Tokyo");
  assert.equal(view.nextAction, "先看名单，挑 1-2 个最值得现场聊的人。");
  assert.deepEqual(view.attendees, [
    {
      canWantConnect: true,
      contactId: "contact_001",
      id: "participant_001",
      knownLabel: "已在人脉中",
      name: "林 直人",
      organizationRole: "Kansai Ventures · Partner",
      reasons: ["关注中国团队在日本落地。"],
      relationshipContext: "可聊日本渠道和投资人视角。",
      statusLabel: "已签到",
      suggestedNextAction: "活动现场先约 10 分钟。",
      tags: ["投资人"]
    }
  ]);
});

test("eventAttendeeRosterToView maps live attendee import payloads", () => {
  const view = eventAttendeeRosterToView({
    attendees: [
      {
        attendeeId: "participant_011",
        checkInStatus: "registered",
        displayName: "曾伟",
        existingContactId: "contact_078",
        importEligible: true,
        organization: "Kansai Community",
        relationshipContext:
          "Looking for: AI workflow PoC buyer. Can offer: Mandarin Japanese community marketing channel. 関西コミュニティのプロダクトマネージャー。 / 关西社群的产品经理。本次关注「零售直播电商分销伙伴」，可提供「跟进消息多语言本地化」。 / Product Manager at Kansai Community.",
        relationshipStatus: {
          code: "known_contact",
          label: "Known contact",
          rationale: "This attendee is already connected to a source-backed contact.",
          suggestedPriority: "warm"
        },
        role: "Product Manager",
        suggestedNextAction: "Review the existing contact before staging any follow-up."
      },
      {
        attendeeId: "participant_001",
        checkInStatus: "registered",
        displayName: "中村 沙也香",
        existingContactId: null,
        importEligible: true,
        organization: "Asakusa Foods",
        relationshipContext:
          "浅草フーズの創業者CEO。 / 浅草餐饮的创始人 CEO。本次关注「零售直播电商分销伙伴」，可提供「跟进消息多语言本地化」。 / Founder CEO at Asakusa Foods.",
        relationshipStatus: {
          code: "new_potential_contact",
          label: "New potential contact",
          rationale: "The attendee has source-backed live intent but is not a known contact.",
          suggestedPriority: "review"
        },
        role: "Founder CEO",
        suggestedNextAction: "Review the attendee intent before confirming a contact draft."
      }
    ],
    event: {
      name: "東京インバウンド飲食店成長会 / Tokyo Inbound Restaurant Growth Forum",
      organizer:
        "東京インバウンド飲食店成長会 / 东京餐饮入境客增长会 / Tokyo Inbound Restaurant Growth Forum",
      startsAt: "2026-02-15T10:00:00+09:00",
      venue: "Osaka"
    },
    nextAction: "Clear the attendee filter or verify the live attendee source.",
    summary: "No live event attendees matched the request."
  });

  assert.equal(view.eventTitle, "东京餐饮入境客增长会");
  assert.equal(view.nextAction, "先看名单，挑 1-2 个最值得现场聊的人。");
  assert.equal(view.attendees[0]?.contactId, "contact_078");
  assert.equal(view.attendees[0]?.knownLabel, "已在人脉中");
  assert.equal(
    view.attendees[0]?.relationshipContext,
    "关西社群的产品经理。本次关注「零售直播电商分销伙伴」，可提供「跟进消息多语言本地化」。"
  );
  assert.deepEqual(view.attendees[0]?.tags, ["已认识"]);
  assert.deepEqual(view.attendees[1]?.tags, []);
  assert.equal(view.attendees[1]?.knownLabel, "新关系");
  assert.equal(
    view.attendees[0]?.suggestedNextAction,
    "如果对方也愿意，再继续下一步。"
  );
});

test("eventMatchesToView maps mutual-interest matches", () => {
  const view = eventMatchesToView({
    matches: [
      {
        matchId: "match_001",
        participantContactIds: ["contact:operator", "contact_001"],
        participantNames: ["Orbit operator", "林 直人"],
        successNotice: {
          message:
            "Lin is a generated attendee match for the salon. Keep the introduction on-site and require confirmation before any external message is sent.",
          nextAction: "Review the on-site introduction context before taking any external action.",
          title: "Generated mutual interest ready"
        }
      }
    ],
    nextAction: "Live storage returned want-connect matches.",
    summary: "Live storage returned want-connect matches."
  });

  assert.deepEqual(view, {
    matches: [
      {
        id: "match_001",
        message: "现场有互相想认识的信号，先当面确认，再继续下一步。",
        names: ["我", "林 直人"],
        nextAction: "先当面确认对方也愿意继续聊。",
        title: "可以现场介绍"
      }
    ],
    nextAction: "先看匹配，再决定要不要现场介绍。"
  });
});

test("buildWantConnectRequest uses selected attendee contact id", () => {
  assert.deepEqual(
    buildWantConnectRequest({
      canWantConnect: true,
      contactId: "contact_001",
      id: "participant_001",
      knownLabel: "已在人脉中",
      name: "林 直人",
      organizationRole: "Kansai Ventures · Partner",
      reasons: [],
      relationshipContext: "",
      statusLabel: "已签到",
      suggestedNextAction: "",
      tags: []
    }),
    {
      targetContactId: "contact_001"
    }
  );
});
