import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventAttendeeContactDraftImportRequest,
  buildEventAttendeeRosterImportRequest,
  buildEncounterNoteRequest,
  buildWantConnectRequest,
  eventAttendeeContactDraftImportToView,
  eventAttendeeRosterImportToView,
  eventEncounterNoteToView,
  eventAttendeeRosterToView,
  eventMatchesToView
} from "../src/view-models/event-attendees";
import * as eventAttendeeViewModels from "../src/view-models/event-attendees";

const eventEncounterEvidenceToView = (
  eventAttendeeViewModels as typeof eventAttendeeViewModels & {
    eventEncounterEvidenceToView?: (data: unknown) => unknown;
  }
).eventEncounterEvidenceToView;

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
        avatarAssetUrl: "/orbit-demo-assets/avatars/participant-001.svg",
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
      imageUrl: "/orbit-demo-assets/avatars/participant-001.svg",
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

test("buildEncounterNoteRequest uses the selected attendee and typed note", () => {
  const attendee = {
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
  };

  assert.deepEqual(
    buildEncounterNoteRequest(attendee, "  现场聊到关西渠道，可以下周约 30 分钟。  "),
    {
      contactId: "contact_001",
      noteText: "现场聊到关西渠道，可以下周约 30 分钟。"
    }
  );
  assert.equal(buildEncounterNoteRequest(attendee, "   "), null);
});

test("eventEncounterNoteToView maps saved encounter-note payloads into Chinese feedback", () => {
  const view = eventEncounterNoteToView({
    data: {
      evidenceDraft: {
        evidenceId: "evidence:event-encounter-created",
        excerpt:
          "Priya asked for a storage pilot introduction and offered to share deployment constraints."
      },
      encounter: {
        encounterId: "demo-encounter-1"
      },
      nextAction:
        "Review the encounter note and create evidence before drafting any follow-up.",
      note: {
        text:
          "EN: Priya asked for a storage intro. ZH: Priya 想找储能试点介绍，可以先确认部署限制。"
      },
      participant: {
        displayName: "Priya Shah",
        organization: "Solace Battery",
        role: "CEO"
      },
      state: "success",
      summary:
        "A typed on-site note, voice-note placeholder, conversation summary seed, and evidence draft were created from local fixtures."
    },
    success: true
  });

  assert.deepEqual(view, {
    encounterId: "demo-encounter-1",
    evidenceLabel: "证据草稿已生成",
    feedback: "已记录 Priya Shah 的现场记录。",
    nextAction: "先检查这条记录，再决定是否转成跟进或联系人证据。",
    noteText: "Priya 想找储能试点介绍，可以先确认部署限制。",
    participantLabel: "Priya Shah · Solace Battery · CEO",
    title: "现场记录已保存"
  });
});

test("eventEncounterEvidenceToView maps promoted encounter evidence into Chinese feedback", () => {
  assert.equal(typeof eventEncounterEvidenceToView, "function");

  assert.deepEqual(
    eventEncounterEvidenceToView?.({
      data: {
        encounterId: "demo-encounter-1",
        evidence: {
          evidenceId: "evidence:event-encounter-created",
          excerpt:
            "EN: Priya asked for a storage intro. ZH: Priya 想找储能试点介绍，可以先确认部署限制。"
        },
        nextAction:
          "Attach this evidence to the relationship timeline before composing follow-up copy.",
        state: "success",
        summary:
          "The local encounter note was converted into deterministic relationship evidence."
      },
      success: true
    }),
    {
      encounterId: "demo-encounter-1",
      evidenceId: "evidence:event-encounter-created",
      feedback: "关系证据已生成。",
      nextAction: "证据已生成，下一步再决定是否写跟进。",
      sourceExcerpt: "Priya 想找储能试点介绍，可以先确认部署限制。",
      title: "关系证据"
    }
  );
});

test("event attendee draft import helpers prepare review-only contact drafts", () => {
  assert.deepEqual(
    buildEventAttendeeContactDraftImportRequest(" demo-event-1 ", "priority_follow_up"),
    {
      request: {
        body: {
          eventId: "demo-event-1",
          relationshipStatusFilter: "priority_follow_up"
        },
        endpoint: "/api/contact-drafts/event-attendees/import"
      },
      success: true
    }
  );

  assert.deepEqual(buildEventAttendeeContactDraftImportRequest("   "), {
    error: "这场活动缺少编号，暂时不能导入候选。",
    success: false
  });
});

test("event attendee roster import helpers prepare event context imports", () => {
  assert.deepEqual(
    buildEventAttendeeRosterImportRequest(" demo-event-1 ", {
      eligibleOnly: true,
      knownContactOnly: false,
      tagFilter: "storage_pilot"
    }),
    {
      request: {
        body: {
          eligibleOnly: true,
          knownContactOnly: false,
          tagFilter: "storage_pilot"
        },
        endpoint: "/api/events/demo-event-1/attendees/import"
      },
      success: true
    }
  );

  assert.deepEqual(buildEventAttendeeRosterImportRequest("   "), {
    error: "这场活动缺少编号，暂时不能导入名单。",
    success: false
  });
});

test("eventAttendeeRosterImportToView maps staged roster imports into Chinese feedback", () => {
  const view = eventAttendeeRosterImportToView({
    attendees: [
      { attendeeId: "attendee-1" },
      { attendeeId: "attendee-2" }
    ],
    event: {
      name: "大阪产业交流会"
    },
    importBatch: {
      attendeeIds: ["attendee-1", "attendee-2"],
      emailProviderRequested: false,
      externalNetworkRequested: false,
      id: "event-attendee-roster-import:demo-event-1",
      liveDatabaseWriteExecuted: false,
      notificationDelivered: false,
      recommendationCandidateIds: ["candidate-1"]
    },
    nextAction:
      "Review imported attendees before creating follow-ups or external messages.",
    summary:
      "The mock roster import staged eligible recommendation candidates without organizer, database, AI, calendar, email, or notification calls."
  });

  assert.deepEqual(view, {
    metrics: ["2 位参会者", "1 条推荐", "只生成导入预览"],
    nextAction: "先看名单，再决定现场认识和会后跟进。",
    safetyText: "没有写联系人，也没有发消息。",
    summary: "大阪产业交流会 · 2 位参会者已进入活动上下文。",
    title: "名册已导入"
  });
  assert.doesNotMatch(JSON.stringify(view), /mock|fixture|provider|database|AI/i);
});

test("eventAttendeeContactDraftImportToView maps imported attendee drafts into Chinese review cards", () => {
  const view = eventAttendeeContactDraftImportToView({
    contactDrafts: [
      {
        attendeeId: "attendee:demo-1",
        bulkDatabaseImportExecuted: false,
        contactWriteExecuted: false,
        displayName: "Aiko Mori",
        evidence: [
          {
            excerpt:
              "Local fixture lists Aiko Mori, Luis Ortega, and Priya Shah as demo attendees."
          },
          {
            excerpt:
              "The dinner context is climate BD, distribution partnerships, and storage pilot introductions."
          }
        ],
        id: "event-draft:demo-1",
        notificationDelivered: false,
        organization: "Blue Harbor Climate",
        readyForReview: true,
        relationshipContext:
          "Aiko joined the climate founders dinner to discuss channel partnerships for grid resilience pilots.",
        relationshipStatus: {
          code: "new_potential_contact",
          label: "New potential contact",
          rationale:
            "No existing relationship was found in the mock roster, but the event context matches current BD goals.",
          suggestedPriority: "review"
        },
        role: "VP Partnerships",
        suggestedNextAction:
          "Review Aiko as a new potential contact and ask about pilot partner coverage."
      },
      {
        attendeeId: "attendee:demo-3",
        bulkDatabaseImportExecuted: false,
        contactWriteExecuted: false,
        displayName: "Priya Shah",
        evidence: [
          {
            excerpt:
              "Mock rules label attendee relationship status from local goals and existing-contact hints."
          }
        ],
        id: "event-draft:demo-3",
        notificationDelivered: false,
        organization: "Solace Battery",
        readyForReview: true,
        relationshipContext:
          "Priya spoke about storage reliability and maps to the current storage pilot follow-up goal.",
        relationshipStatus: {
          code: "priority_follow_up",
          label: "Priority follow-up",
          rationale:
            "Speaker role and shared event goals make this attendee a high-priority relationship review.",
          suggestedPriority: "high"
        },
        role: "CEO",
        suggestedNextAction:
          "Draft a post-event follow-up asking Priya about storage pilot operator introductions."
      }
    ],
    nextAction: "Review each relationship status label before confirming any contact write.",
    state: "success",
    summary:
      "Two event attendee contact drafts are ready for review from local fixtures."
  });

  assert.deepEqual(view, {
    drafts: [
      {
        detail: "Blue Harbor Climate · VP Partnerships",
        evidence: [
          "活动名单：Aiko Mori 等参会者已进入待复核名单。",
          "活动背景：这场晚餐围绕气候 BD、渠道合作和储能试点介绍。"
        ],
        id: "event-draft:demo-1",
        name: "Aiko Mori",
        nextAction: "把 Aiko 作为新联系人复核，先问清试点伙伴覆盖范围。",
        relationship: "Aiko 参加气候创业者晚餐，想聊电网韧性试点的渠道合作。",
        statusLabel: "新关系",
        writeState: "待复核，未写入联系人"
      },
      {
        detail: "Solace Battery · CEO",
        evidence: ["证据显示这位参会者和当前活动目标有关。"],
        id: "event-draft:demo-3",
        name: "Priya Shah",
        nextAction: "给 Priya 准备会后跟进，确认储能试点运营方介绍。",
        relationship: "Priya 分享过储能可靠性，和当前储能试点跟进目标相关。",
        statusLabel: "优先跟进",
        writeState: "待复核，未写入联系人"
      }
    ],
    nextAction: "去添加人脉页复核后再确认。",
    summary: "2 条候选",
    title: "已生成待确认候选"
  });
  assert.doesNotMatch(JSON.stringify(view), /mock|fixture|provider|implementation|database/i);
});
