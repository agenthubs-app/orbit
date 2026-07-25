import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  homeFilteredEvents,
  homeToView,
  type HomeEventFilter
} from "../src/view-models/home";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

const profilePayload = {
  profile: {
    bio: "Orbit 创始人，帮企业把 AI 用到真实业务里。",
    displayName: "Xinyi Zhao",
    headline: "Orbit 创始人",
    industry: "AI 企业应用",
    offering: ["AI 落地路径", "企业知识库"],
    organization: "Orbit",
    relationshipGoal: "找到能互相帮忙的企业客户、合作伙伴和日本本地资源。",
    role: "创始人",
    seeking: ["正在导入 AI 的企业"],
    timezone: "Tokyo",
    topics: ["RAG", "Agent 工作流"]
  }
};

const eventsPayload = {
  events: [
    {
      id: "event_live",
      location: "东京",
      startsAt: "2026-08-04T10:00:00.000+09:00",
      status: "active",
      title: "AI 企业落地早餐会"
    },
    {
      id: "event_next",
      location: "大阪",
      startsAt: "2026-08-10T10:00:00.000+09:00",
      status: "scheduled",
      title: "关西跨境商务交流会"
    },
    {
      id: "event_done",
      location: "京都",
      startsAt: "2026-07-10T10:00:00.000+09:00",
      status: "ended",
      title: "创业者复盘会"
    }
  ]
};

const contactsPayload = {
  contacts: [
    {
      displayName: "王晨",
      id: "contact_1",
      organization: "红桥科技",
      role: "市场负责人",
      status: "active"
    },
    {
      displayName: "田中",
      id: "contact_2",
      organization: "Kansai Partners",
      role: "顾问",
      status: "dormant"
    }
  ]
};

test("homeToView combines profile, events, and contacts into a Chinese mobile hub", () => {
  const view = homeToView({
    contacts: contactsPayload,
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: profilePayload
  });

  assert.equal(view.profile.displayName, "小雨");
  assert.deepEqual(view.stats, {
    events: "3",
    inProgress: "1",
    people: "2"
  });
  assert.deepEqual(view.assistant, {
    placeholder: "问人脉、活动、跟进或日程",
    title: "有什么可以帮你？"
  });
  assert.deepEqual(view.layout, {
    aiMinHeight: 560,
    askInputMinHeight: 138,
    entryVariant: "compact",
    pipelineVariant: "single-row",
    secondaryEventLimit: 2
  });
  assert.deepEqual(view.pipeline, [
    {
      detail: "需要准备与复盘",
      label: "活动",
      tone: "sky",
      value: "3"
    },
    {
      detail: "可触达关系",
      label: "人脉",
      tone: "accent",
      value: "2"
    },
    {
      detail: "今天优先处理",
      label: "在推进",
      tone: "live",
      value: "1"
    }
  ]);
  assert.deepEqual(view.profilePanel, {
    bio:
      "我是 Orbit 的创始人，主要帮企业把 AI 接进真实业务：销售线索整理、客服知识库、内部检索、运营报表、员工助理和跨系统工作流。很多团队不是缺工具，而是缺一个能先跑起来的切入点。我通常会从最重复、最容易漏、最占人力的环节开始，把试点拆小，再推进到能稳定使用的生产流程。",
    facts: [
      { label: "身份", value: "创始人" },
      { label: "领域", value: "AI 企业应用 · 日本市场 · B2B" },
      { label: "时区", value: "Tokyo" }
    ],
    goal:
      "通过 Orbit 找到值得互相帮忙的人：我会优先介绍明确需求、靠谱交付和能形成长期合作的资源。",
    groups: [
      {
        items: [
          "企业 AI 导入路径梳理",
          "知识库 / 内部检索 / 员工助手方案",
          "销售、客服、运营流程自动化",
          "日本落地服务商与合作方连接",
          "创业者、投资人、企业服务资源引荐"
        ],
        title: "我能提供"
      },
      {
        items: [
          "正在导入 AI 或准备做试点的企业",
          "有日本市场落地经验的合作伙伴",
          "企业服务、SaaS、自动化和数据治理资源"
        ],
        title: "我在寻找"
      },
      {
        items: [
          "企业 AI 导入",
          "知识库与内部检索",
          "Agent 工作流",
          "销售和客服自动化",
          "中日商务合作"
        ],
        title: "想聊的话题"
      }
    ],
    title: "别人会看到的资料"
  });
  assert.deepEqual(
    view.entries.map((entry) => [entry.href, entry.title]),
    [
      ["/profile", "通用画像"],
      ["/contacts", "名片夹"],
      ["/schedule", "日程安排"]
    ]
  );
  assert.deepEqual(view.filterCounts, {
    active: 1,
    all: 3,
    ended: 1,
    upcoming: 1
  });
  assert.equal(view.events[0]?.state, "active");
  assert.equal(view.events[1]?.state, "upcoming");
  assert.equal(view.events[2]?.state, "ended");
  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|source-backed|implementation|command-center)\b/iu
  );
});

test("home relationship workbench is a fixed three-cell row", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /pipelineRail:\s*\{[^}]*flexDirection:\s*"row"/su
  );
  assert.doesNotMatch(
    source,
    /pipelineRail:\s*\{[^}]*flexWrap:\s*"wrap"/su
  );
  assert.match(source, /pipelineCell:\s*\{[^}]*minWidth:\s*0/su);
  assert.match(source, /pipelineDivider:\s*\{/u);
});

test("home events route renders events as an image-first list", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );
  const contentStart = source.indexOf("function HomeEventsContent");
  const imageListStart = source.indexOf("function EventImageList");
  const contentSource = source.slice(contentStart, imageListStart);

  assert.ok(contentStart > -1);
  assert.ok(imageListStart > contentStart);
  assert.match(source, /filterEventSummaries/u);
  assert.match(source, /eventDiscoveryFilterCounts/u);
  assert.match(source, /eventDiscoveryTopics/u);
  assert.match(source, /function HomeEventDiscoveryControls/u);
  assert.match(
    source,
    /const homeEventFilterOrder: HomeEventFilter\[\] = \[\s*"all",\s*"upcoming",\s*"active",\s*"ended"\s*\]/su
  );
  assert.match(source, /eventQuery,\s*setEventQuery/u);
  assert.match(source, /eventTopicFilter,\s*setEventTopicFilter/u);
  assert.match(source, /placeholder="搜索活动、地点或主题"/u);
  assert.match(source, /function EventImageList/u);
  assert.match(source, /function EventImageCard/u);
  assert.match(source, /styles\.homeEventImageList/u);
  assert.match(source, /styles\.homeEventImageCard/u);
  assert.match(source, /styles\.homeEventImageFrame/u);
  assert.match(source, /styles\.homeEventImageContent/u);
  assert.match(source, /styles\.homeEventImageTopRow/u);
  assert.match(source, /styles\.homeEventImageBottom/u);
  assert.match(source, /styles\.homeEventImageDateChip/u);
  assert.match(source, /styles\.homeEventImageStatusPill/u);
  assert.match(source, /styles\.homeEventImageTitle/u);
  assert.match(source, /styles\.homeEventImageMetaRow/u);
  assert.match(source, /event\.participantCountLabel/u);
  assert.match(source, /event\.actionLabel/u);
  assert.match(
    source,
    /homeEventImageFrame:\s*\{[^}]*height:\s*300[^}]*width:\s*"100%"/su
  );
  assert.doesNotMatch(source, /homeEventImageFrame:\s*\{[^}]*padding:/su);
  assert.match(
    source,
    /homeEventImageContent:\s*\{[^}]*\.\.\.StyleSheet\.absoluteFill[^}]*padding:\s*spacing\.lg/su
  );
  assert.doesNotMatch(source, /function EventModuleList/u);
  assert.doesNotMatch(source, /function EventModuleCard/u);
  assert.doesNotMatch(source, /styles\.homeEventModuleCoverFrame/u);
  assert.doesNotMatch(source, /styles\.homeEventImageBody/u);
  assert.doesNotMatch(source, /styles\.homeEventImageTopicRow/u);

  const coverIndex = source.indexOf("style={styles.homeEventImageFrame}");
  const titleIndex = source.indexOf("style={styles.homeEventImageTitle}");
  const ctaIndex = source.indexOf("style={styles.homeEventImageCta}");
  const coverCloseIndex = source.indexOf("</ImageBackground>", coverIndex);

  assert.ok(titleIndex > -1);
  assert.ok(coverIndex > -1);
  assert.ok(coverIndex < titleIndex);
  assert.ok(titleIndex < coverCloseIndex);
  assert.ok(ctaIndex > titleIndex);
  assert.ok(ctaIndex < coverCloseIndex);
  assert.match(contentSource, /<EventImageList/u);
  assert.match(contentSource, /events=\{filteredEvents\}/u);
  assert.ok(
    contentSource.indexOf("<EventImageList") <
      contentSource.indexOf("<HomeEventDiscoveryControls"),
    "home events should open with image modules before discovery controls"
  );
  assert.doesNotMatch(contentSource, /homeEventFilterBlock/u);
  assert.doesNotMatch(contentSource, /title="活动状态"/u);
  assert.doesNotMatch(contentSource, /<EventRow/u);
});

test("home hub event preview also uses the image-first event list", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );
  const hubStart = source.indexOf("function HomeHubContent");
  const profileStart = source.indexOf("function HomeProfilePanel");
  const hubSource = source.slice(hubStart, profileStart);

  assert.match(hubSource, /<EventImageList/u);
  assert.doesNotMatch(hubSource, /<EventRow/u);
});

test("home event image cards keep time and location labels readable", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /homeEventImageMetaRow:\s*\{[^}]*gap:\s*spacing\.xs/su
  );
  assert.doesNotMatch(
    source,
    /homeEventImageMetaRow:\s*\{[^}]*flexDirection:\s*"row"/su
  );
  assert.match(
    source,
    /homeEventImageMetaLine:\s*\{[^}]*maxWidth:\s*"100%"/su
  );
  assert.match(
    source,
    /homeEventImageDetail:\s*\{[^}]*flexShrink:\s*1/su
  );
  assert.doesNotMatch(source, /homeEventImageDetail:\s*\{[^}]*flex:\s*1/su);
});

test("homeFilteredEvents applies the same filters as the web home events view", () => {
  const view = homeToView({
    contacts: contactsPayload,
    events: eventsPayload,
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: profilePayload
  });
  const idsByFilter = (filter: HomeEventFilter) =>
    homeFilteredEvents(view.events, filter).map((event) => event.id);

  assert.deepEqual(idsByFilter("all"), ["event_live", "event_next", "event_done"]);
  assert.deepEqual(idsByFilter("active"), ["event_live"]);
  assert.deepEqual(idsByFilter("upcoming"), ["event_next"]);
  assert.deepEqual(idsByFilter("ended"), ["event_done"]);
});

test("homeToView marks scheduled events as ended when their time has passed", () => {
  const view = homeToView({
    contacts: contactsPayload,
    events: {
      events: [
        {
          endsAt: "2026-06-15T11:00:00.000+09:00",
          id: "event_past_scheduled",
          location: "Osaka",
          startsAt: "2026-06-15T10:00:00.000+09:00",
          status: "scheduled",
          title: "已过去的商务交流会"
        }
      ]
    },
    now: new Date("2026-07-24T00:00:00.000+09:00"),
    profile: profilePayload
  });

  assert.equal(view.events[0]?.state, "ended");
  assert.deepEqual(view.filterCounts, {
    active: 0,
    all: 1,
    ended: 1,
    upcoming: 0
  });
});
