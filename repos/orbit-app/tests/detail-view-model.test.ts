import assert from "node:assert/strict";
import test from "node:test";
import {
  aiConversationPath,
  contactDetailPath,
  eventAttendeesPath,
  eventDetailPath
} from "../src/api/endpoints";
import {
  buildContactDetailMetadataRequest,
  buildContactDetailNoteRequest,
  contactDetailHeroToView,
  contactDetailToSummary
} from "../src/view-models/contacts";
import {
  eventDetailHeroToView,
  eventDetailToSummary
} from "../src/view-models/events";

test("detail endpoint helpers URL-encode ids", () => {
  assert.equal(eventDetailPath("event/with space"), "/api/events/event%2Fwith%20space");
  assert.equal(
    eventAttendeesPath("event/with space"),
    "/api/events/event%2Fwith%20space/attendees"
  );
  assert.equal(
    contactDetailPath("contact/with space"),
    "/api/contacts/contact%2Fwith%20space"
  );
  assert.equal(
    aiConversationPath("chat/with space"),
    "/api/ai/conversations/chat%2Fwith%20space"
  );
});

test("eventDetailToSummary maps event detail payloads", () => {
  const summary = eventDetailToSummary({
    event: {
      description:
        "event_signup_03 source:event_signup_03 JA: 投資家向け。 ZH: 让投资人与创业者登记融资阶段、希望介绍对象和会谈主题。 EN: Investor founder intake.",
      evidence: [
        {
          excerpt:
            "JA: 投資家向け。 ZH: 让投资人与创业者登记融资阶段、希望介绍对象和会谈主题。 EN: Investor founder intake."
        }
      ],
      id: "event-1",
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

  assert.deepEqual(summary, {
    actionLabel: "报名",
    coverPath: "/orbit-covers/events/investor-founder-salon.jpg",
    aboutSections: [
      {
        body: "让投资人与创业者登记融资阶段、希望介绍对象和会谈主题。",
        iconName: "information-circle-outline",
        id: "overview",
        title: "活动背景"
      },
      {
        body: "根据报名信息提前整理融资阶段、介绍诉求和会谈主题。",
        iconName: "git-network-outline",
        id: "relationship",
        title: "关系价值"
      },
      {
        body: "整理参会者背景、想认识的人和可以主动提供的资源。",
        iconName: "flag-outline",
        id: "preparation",
        title: "会前准备"
      }
    ],
    address: "",
    agenda: [
      {
        description: "Shibuya",
        id: "start",
        time: "7月4日 周六 19:00",
        title: "活动开始"
      }
    ],
    attendeeCountLabel: "参会者待确认",
    attendeePreview: [],
    description: "让投资人与创业者登记融资阶段、希望介绍对象和会谈主题。",
    evidenceExcerpts: ["让投资人与创业者登记融资阶段、希望介绍对象和会谈主题。"],
    feeLabel: "现场确认",
    id: "event-1",
    location: "Shibuya",
    nextAction: "先看报名信息，再决定要准备的介绍和会谈重点。",
    organizerName: "日中投资人与创业者报名沙龙",
    participantCountLabel: "报名人数待确认",
    preparation: "整理参会者背景、想认识的人和可以主动提供的资源。",
    registrationActionLabel: "报名参加",
    registrationDetail: "确认参加后可见完整参会者名单。",
    relationshipContext: "根据报名信息提前整理融资阶段、介绍诉求和会谈主题。",
    sourceLabel: "日中投资人与创业者报名沙龙",
    startsAt: "7月4日 周六 19:00",
    status: "已确认",
    subtitle: "",
    title: "日中投资人与创业者报名沙龙",
    topics: [],
    venueDetail: "Shibuya"
  });
});

test("eventDetailToSummary carries web event detail modules for mobile rendering", () => {
  const summary = eventDetailToSummary({
    event: {
      about: [
        {
          body: "面向在关西寻找商务合作的中国创业者和本地服务商。",
          icon: "users",
          label: "适合谁"
        }
      ],
      address: "大阪市北区梅田 1-1",
      agenda: [
        {
          description: "核对报名信息并领取交流编号。",
          label: "签到",
          time: "18:30"
        },
        {
          description: "围绕跨境落地、税务设立和渠道合作做小组交流。",
          label: "主题交流",
          time: "19:00"
        }
      ],
      description: "关西创业者和跨境业务负责人做一轮高质量对接。",
      feeLabel: "免费",
      id: "event_signup_01",
      organizer: "Orbit 关西商务社区",
      sourceMetadata: {
        label:
          "関西越境ビジネス申込テスト会 / 关西跨境商务交流会 / Kansai Cross-Border Business Meetup"
      },
      startsAt: "2026-07-21T10:00:00+09:00",
      stats: {
        attendees: [
          { initial: "王", name: "王小雨", role: "Orbit 创始人" },
          { name: "Mina Chen", role: "跨境电商负责人" }
        ],
        count: 42,
        youRsvped: false
      },
      status: "confirmed",
      venue: "Osaka Innovation Hub"
    }
  });

  assert.deepEqual(summary.aboutSections, [
    {
      body: "面向在关西寻找商务合作的中国创业者和本地服务商。",
      iconName: "people-outline",
      id: "适合谁",
      title: "适合谁"
    }
  ]);
  assert.deepEqual(summary.agenda, [
    {
      description: "核对报名信息并领取交流编号。",
      id: "18:30-签到",
      time: "18:30",
      title: "签到"
    },
    {
      description: "围绕跨境落地、税务设立和渠道合作做小组交流。",
      id: "19:00-主题交流",
      time: "19:00",
      title: "主题交流"
    }
  ]);
  assert.equal(summary.address, "大阪市北区梅田 1-1");
  assert.equal(summary.attendeeCountLabel, "42 位参会者");
  assert.deepEqual(summary.attendeePreview, [
    { id: "王小雨-0", initial: "王", name: "王小雨", role: "Orbit 创始人" },
    { id: "Mina Chen-1", initial: "M", name: "Mina Chen", role: "跨境电商负责人" }
  ]);
  assert.equal(summary.feeLabel, "免费");
  assert.equal(summary.organizerName, "Orbit 关西商务社区");
  assert.equal(summary.registrationActionLabel, "报名参加");
  assert.equal(summary.registrationDetail, "确认参加后可见完整参会者名单。");
  assert.equal(summary.venueDetail, "Osaka Innovation Hub · 大阪市北区梅田 1-1");
});

test("eventDetailHeroToView prepares an image-led mobile detail hero", () => {
  const hero = eventDetailHeroToView(
    eventDetailToSummary({
      event: {
        description: "关西创业者和跨境业务负责人做一轮高质量对接。",
        id: "event_signup_01",
        sourceMetadata: {
          label:
            "関西越境ビジネス申込テスト会 / 关西跨境商务交流会 / Kansai Cross-Border Business Meetup"
        },
        startsAt: "2026-07-21T10:00:00+09:00",
        status: "confirmed",
        venue: "Osaka"
      }
    })
  );

  assert.deepEqual(hero, {
    coverPath: "/orbit-covers/events/kansai-business-connect.jpg",
    detailLine: "7月21日 周二 10:00 · Osaka",
    status: "已确认",
    summary: "关西创业者和跨境业务负责人做一轮高质量对接。",
    title: "关西跨境商务交流会"
  });
});

test("eventDetailToSummary removes signup test wording from user-facing copy", () => {
  const summary = eventDetailToSummary({
    event: {
      description:
        "用于测试新参与者通过报名表填写兴趣、可提供价值和希望介绍对象的未开始活动。",
      id: "event_signup_01",
      sourceMetadata: {
        label:
          "関西越境ビジネス申込テスト会 / 关西跨境商务报名测试会 / Kansai Cross-Border Business Signup Lab"
      },
      startsAt: "2026-07-21T10:00:00+09:00",
      status: "confirmed",
      venue: "Osaka"
    }
  });

  assert.equal(summary.title, "关西跨境商务交流会");
  assert.equal(
    summary.description,
    "通过报名表确认兴趣、可提供的资源和希望介绍的人。"
  );
  assert.equal(summary.sourceLabel, "关西跨境商务交流会");
});

test("contactDetailToSummary maps contact detail payloads", () => {
  const summary = contactDetailToSummary({
    contact: {
      avatarAssetUrl: "/orbit-demo-assets/avatars/contact-001.svg",
      displayName: "Maya Chen",
      id: "contact-1",
      lastInteractionAt: "2026-07-01T09:00:00.000Z",
      location: "Tokyo",
      nextAction: "Send the storage intro.",
      organization: "Northstar",
      profileSnippet: "Invests in climate infrastructure.",
      relationshipContext: "Warm investor relationship",
      role: "Partner",
      source: {
        label: "QR scan for Maya Chen"
      },
      status: "needs_follow_up",
      evidence: [
        {
          excerpt:
            "JA: 気候インフラの投資家。 ZH: 气候基础设施投资人，正在寻找日本市场合作伙伴。 EN: Climate infrastructure investor."
        }
      ],
      notes: [
        {
          body: "Met at the founder dinner and asked for a partner intro."
        }
      ],
      publicProfile: {
        bio:
          "JA: 気候インフラの投資家。 / 气候基础设施投资人，正在寻找日本市场合作伙伴。 / Climate infrastructure investor.",
        conversationPrompts: ["介绍日本市场的合作伙伴"],
        offering: ["投资人视角"],
        seeking: ["日本市场合作伙伴"],
        topics: ["气候科技", "基础设施"]
      },
      value: {
        valueTypes: ["strategic_fit", "referral_path"],
        score: 88
      }
    }
  });

  assert.deepEqual(summary, {
    archiveAction: {
      label: "归档联系人",
      nextStatus: "archived",
      pendingLabel: "归档中",
      successMessage: "已归档 Maya Chen。"
    },
    detailTags: [],
    id: "contact-1",
    imageUrl: "/orbit-demo-assets/avatars/contact-001.svg",
    lastInteractionAt: "2026-07-01T09:00:00.000Z",
    location: "Tokyo",
    name: "Maya Chen",
    nextAction: "给 Maya Chen 补一条引荐跟进。",
    noteSummaries: ["在创始人晚宴上聊过，对方希望介绍合作伙伴。"],
    organization: "Northstar",
    publicBio: "气候基础设施投资人，正在寻找日本市场合作伙伴。",
    publicOffering: ["投资人视角"],
    publicPrompts: ["介绍日本市场的合作伙伴"],
    publicSeeking: ["日本市场合作伙伴"],
    publicTopics: ["气候科技", "基础设施"],
    relationship: "气候基础设施投资人，正在寻找日本市场合作伙伴。",
    role: "合伙人",
    sourceLabel: "QR 扫码：Maya Chen",
    status: "待联系",
    statusAction: {
      label: "标记为在推进",
      nextStatus: "active",
      pendingLabel: "更新中",
      successMessage: "已把 Maya Chen 标记为在推进。"
    },
    evidenceExcerpts: ["气候基础设施投资人，正在寻找日本市场合作伙伴。"],
    valueLabels: ["战略契合", "引荐路径"],
    valueScore: 88
  });
});

test("contactDetailHeroToView prepares an avatar-led mobile detail hero", () => {
  const hero = contactDetailHeroToView(
    contactDetailToSummary({
      contact: {
        avatarAssetUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        displayName: "Maya Chen",
        id: "contact_001",
        organization: "Northstar",
        profileSnippet: "Northstar 的投资人，正在寻找日本市场合作伙伴。",
        role: "Partner",
        status: "needs_follow_up",
        value: {
          score: 88,
          valueTypes: ["strategic_fit", "referral_path"]
        }
      }
    })
  );

  assert.deepEqual(hero, {
    avatar: {
      imageUrl: "/orbit-demo-assets/avatars/contact-001.svg",
      initial: "M",
      tone: "violet"
    },
    detailLine: "Northstar · 合伙人",
    name: "Maya Chen",
    relationship: "Northstar 的投资人，正在寻找日本市场合作伙伴。",
    status: "待联系",
    valueScoreLabel: "价值分 88"
  });
});

test("contactDetailToSummary exposes safe status actions", () => {
  const active = contactDetailToSummary({
    contact: {
      displayName: "Hana Sato",
      id: "contact:hana-sato",
      organization: "Tokyo Climate Guild",
      role: "Community Lead",
      status: "active"
    }
  });
  const archived = contactDetailToSummary({
    contact: {
      displayName: "Old Contact",
      id: "contact:old",
      organization: "Archive",
      role: "Advisor",
      status: "archived"
    }
  });

  assert.deepEqual(active.statusAction, {
    label: "放回待联系",
    nextStatus: "needs_follow_up",
    pendingLabel: "更新中",
    successMessage: "已把 Hana Sato 放回待联系。"
  });
  assert.equal(archived.statusAction, null);
  assert.deepEqual(active.archiveAction, {
    label: "归档联系人",
    nextStatus: "archived",
    pendingLabel: "归档中",
    successMessage: "已归档 Hana Sato。"
  });
  assert.equal(archived.archiveAction, null);
});

test("buildContactDetailNoteRequest prepares contact detail note updates", () => {
  assert.deepEqual(
    buildContactDetailNoteRequest("  下次把关西渠道名单发给 Kenji。 "),
    {
      request: {
        body: {
          note: {
            authorLabel: "小雨",
            body: "下次把关西渠道名单发给 Kenji。"
          }
        }
      },
      success: true,
      successMessage: "已保存这条记录。"
    }
  );

  assert.deepEqual(buildContactDetailNoteRequest("   "), {
    error: "先写一条备注。",
    success: false
  });
});

test("buildContactDetailMetadataRequest prepares tag and last interaction updates", () => {
  assert.deepEqual(
    buildContactDetailMetadataRequest({
      channel: " manual_note ",
      occurredAt: " 2026-07-24T09:30:00.000Z ",
      summary: "  和 Kenji 确认下周介绍关西渠道。 ",
      tagsText: " topic:storage-pilots, priority:warm-follow-up, topic:storage-pilots "
    }),
    {
      request: {
        body: {
          lastInteraction: {
            channel: "manual_note",
            occurredAt: "2026-07-24T09:30:00.000Z",
            summary: "和 Kenji 确认下周介绍关西渠道。"
          },
          tags: ["topic:storage-pilots", "priority:warm-follow-up"]
        }
      },
      success: true,
      successMessage: "已更新标签和最近互动。"
    }
  );

  assert.deepEqual(
    buildContactDetailMetadataRequest({
      channel: "",
      occurredAt: "",
      summary: "",
      tagsText: ""
    }),
    {
      error: "至少填写一个标签或最近互动。",
      success: false
    }
  );
});

test("contactDetailToSummary localizes English public detail fields", () => {
  const summary = contactDetailToSummary({
    contact: {
      displayName: "Kenji Watanabe",
      evidence: [
        {
          excerpt:
            "Manual note says Kenji asked for a storage pilot operator intro after the climate founders dinner."
        },
        {
          excerpt:
            "Status is needs_follow_up because the operator introduction has not been sent yet."
        }
      ],
      id: "demo-contact-1",
      organization: "Aster Grid",
      profileSnippet: "Founder at Aster Grid focused on storage pilot partnerships.",
      publicProfile: {
        bio: "Founder at Aster Grid focused on storage pilot partnerships.",
        conversationPrompts: [
          "Which operator profile makes a storage pilot credible?",
          "Where do climate founders lose momentum after an event?"
        ],
        offering: [
          "storage pilot operator access",
          "founder diligence context"
        ],
        seeking: [
          "operator introductions",
          "commercial pilot partners"
        ],
        topics: [
          "storage pilots",
          "operator partnerships",
          "climate infrastructure"
        ]
      },
      role: "Founder",
      source: {
        label: "Manual note"
      },
      status: "needs_follow_up"
    }
  });

  assert.equal(
    summary.publicBio,
    "Aster Grid 的创始人，正在推进储能试点合作。"
  );
  assert.equal(summary.role, "创始人");
  assert.deepEqual(summary.publicOffering, [
    "储能试点运营方资源",
    "创始人尽调背景"
  ]);
  assert.deepEqual(summary.publicSeeking, [
    "运营方引荐",
    "商业试点伙伴"
  ]);
  assert.deepEqual(summary.publicTopics, [
    "储能试点",
    "运营方合作",
    "气候基础设施"
  ]);
  assert.deepEqual(summary.publicPrompts, [
    "怎样的运营方背景能让储能试点更可信？",
    "气候创业者在活动后通常会在哪一步失去推进节奏？"
  ]);
  assert.equal(summary.sourceLabel, "手动记录");
  assert.deepEqual(summary.evidenceExcerpts, [
    "Kenji 在气候创业者晚宴后，希望引荐储能试点运营方。",
    "运营方引荐还没有发出，所以这条关系仍在待联系。"
  ]);
});

test("contactDetailToSummary cleans live contact implementation copy", () => {
  const summary = contactDetailToSummary({
    contact: {
      displayName: "岡田 隼人",
      id: "contact_029",
      organization: "Red Bridge Technologies",
      publicProfile: {
        bio:
          "紅橋テクノロジーのマーケティング責任者。 / 红桥科技的市场负责人。本次关注「日本落地可信赖的税务与设立顾问」，可提供「关西合作渠道介绍」。 / Marketing Lead at Red Bridge Technologies.",
        conversationPrompts: ["review evidence before follow-up"],
        offering: ["community context"],
        seeking: ["review evidence before follow-up"],
        topics: ["Red Bridge Technologies", "Marketing Lead"]
      },
      source: {
        label: "QR scan for 岡田 隼人"
      },
      notes: [
        {
          body:
            "岡田 隼人 has a concrete current-user relationship record from Direct QR scan for 岡田 隼人."
        }
      ],
      relationshipContext:
        "岡田 隼人 has a concrete current-user relationship record from Direct QR scan for 岡田 隼人.",
      role: "Marketing Lead",
      status: "nurture"
    }
  });

  assert.equal(
    summary.relationship,
    "红桥科技的市场负责人。本次关注「日本落地可信赖的税务与设立顾问」，可提供「关西合作渠道介绍」。"
  );
  assert.deepEqual(summary.publicOffering, ["社群资源"]);
  assert.deepEqual(summary.publicSeeking, ["查看证据后跟进"]);
  assert.deepEqual(summary.publicPrompts, ["查看证据后跟进"]);
  assert.deepEqual(summary.publicTopics, []);
  assert.deepEqual(summary.noteSummaries, []);
  assert.equal(summary.sourceLabel, "QR 扫码：岡田 隼人");
  assert.equal(summary.status, "培养中");
});

test("contactDetailToSummary localizes live business-card placeholders", () => {
  const summary = contactDetailToSummary({
    contact: {
      displayName: "江東 新",
      id: "contact:business-card:ef5fc8ebe8c22b853887dcc9",
      location: "Unknown location",
      notes: [
        {
          body: "Met through a business card exchange with 株式会社アイ・エム・エス."
        }
      ],
      organization: "株式会社アイ・エム・エス",
      profileSnippet: "Met through a business card exchange with 株式会社アイ・エム・エス.",
      publicProfile: {
        bio: "Met through a business card exchange with 株式会社アイ・エム・エス."
      },
      relationshipContext:
        "Met through a business card exchange with 株式会社アイ・エム・エス.",
      role: "代表取締役社長",
      status: "needs_follow_up"
    }
  });

  assert.equal(summary.organization, "IMS 股份公司");
  assert.equal(summary.role, "代表董事兼社长");
  assert.equal(summary.location, "地区待补充");
  assert.equal(summary.publicBio, "通过名片交换认识，来源公司为 IMS 股份公司。");
  assert.equal(summary.relationship, "通过名片交换认识，来源公司为 IMS 股份公司。");
  assert.deepEqual(summary.noteSummaries, [
    "通过名片交换认识，来源公司为 IMS 股份公司。"
  ]);
});
