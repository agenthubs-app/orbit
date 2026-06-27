import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../shared/ui/app-shell";

type PageSearchParams = Record<string, string | string[] | undefined>;

const sprintAccountSummary = {
  displayName: "Orbit Demo Workspace",
  initials: "OD",
  primaryContext: "Event-grounded relationship workspace",
  provenance: "Mock services stay behind existing capability contracts.",
  sourcePosture: "Sources staged for review before outreach",
};

const sprintRuntimeStatus = {
  label: "Demo workspace status",
  details: [
    "Mock services stay behind existing capability contracts.",
    "No live login, sync, or outbound action is connected.",
  ],
  compactBoundary: "Privacy boundary: staged review only; no live sync or outbound action.",
};

const sprintTopActions = [
  {
    id: "add-source",
    href: "/app/contacts/new",
    label: "Add a relationship source",
    provenance: "Opens contact intake without live sync.",
    tone: "primary" as const,
  },
  {
    id: "review-next-moves",
    href: "/app/agent",
    label: "Review next moves",
    provenance: "Opens the local action queue.",
    tone: "secondary" as const,
  },
];

const sprintBottomNavigation = [
  { href: "/app", label: "Orbit AI", route: "/app" },
  { href: "/app/contacts", label: "People", route: "/app/contacts" },
  { href: "/app/events", label: "Events", route: "/app/events" },
  { href: "/app/followups", label: "Follow-ups", route: "/app/followups" },
  { href: "/app/chat", label: "Conversations", route: "/app/chat" },
  {
    href: "/app/dashboard",
    label: "Relationship health",
    route: "/app/dashboard",
  },
  { href: "/app/agent", label: "Next moves", route: "/app/agent" },
] as const;

const bannedPrimaryPatterns = [
  /\bharness\b/i,
  /\bfixtures?\b/i,
  /\bmock\b/i,
  /\boperators?\b/i,
  /\bplaceholders?\b/i,
  /\bproviders?\b/i,
  /\bservices?\b/i,
  /document extraction/i,
  /profile update review/i,
  /preview timestamp/i,
  /queued field/i,
  /queued value/i,
  /raw ids?/i,
  /route examples/i,
  /sample records/i,
  /scenario url/i,
  /\bevidence:[a-z0-9:_-]+\b/i,
  /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/,
  /\b[a-z]+(?:-[a-z0-9]+){3,}\b/,
] as const;

const htmlEntities: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  quot: '"',
};

const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeHtml(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (_match, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }

      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }

      return htmlEntities[entity] ?? `&${entity};`;
    },
  );
}

function primaryTextFromHtml(html: string): string {
  let primaryText = "";
  let previousIndex = 0;
  const skippedElements: Array<{ depth: number; tagName: string }> = [];
  const tagPattern = /<\/?([a-z][a-z0-9:-]*)(?:\s[^>]*)?>/gi;

  for (const tagMatch of html.matchAll(tagPattern)) {
    const tag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();
    const isClosingTag = tag.startsWith("</");
    const isSelfClosingTag = tag.endsWith("/>") || voidTags.has(tagName);
    const currentSkip = skippedElements[skippedElements.length - 1];

    if (!currentSkip) {
      primaryText += html.slice(previousIndex, tagMatch.index);
    }

    if (currentSkip) {
      if (!isClosingTag && !isSelfClosingTag && tagName === currentSkip.tagName) {
        currentSkip.depth += 1;
      }

      if (isClosingTag && tagName === currentSkip.tagName) {
        currentSkip.depth -= 1;

        if (currentSkip.depth === 0) {
          skippedElements.pop();
        }
      }
    } else if (
      !isClosingTag &&
      !isSelfClosingTag &&
      (/^<(details|script|style)\b/i.test(tag) || /\shidden(?:[=\s>]|$)/i.test(tag))
    ) {
      skippedElements.push({ depth: 1, tagName });
    }

    previousIndex = tagMatch.index + tag.length;
  }

  if (!skippedElements.length) {
    primaryText += html.slice(previousIndex);
  }

  return decodeHtml(primaryText).replace(/\s+/g, " ").trim();
}

async function renderAppHome(searchParams?: PageSearchParams): Promise<string> {
  const Page = (await import("../../app/(app)/app/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        accountSummary: sprintAccountSummary,
        activeRoute: "/app",
        runtimeStatus: sprintRuntimeStatus,
        topActions: sprintTopActions,
        bottomNavigation: sprintBottomNavigation,
        variant: "ai-command",
      },
      pageElement,
    ),
  );
}

async function renderProfilePage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/profile/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderContactsNewPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/contacts/new/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderContactsPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/contacts/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderFollowupsPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/followups/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderChatPage(searchParams?: PageSearchParams): Promise<string> {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderDashboardPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/dashboard/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderContactDetailPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/contacts/[id]/page")).default;
  const pageElement = await Page({
    params: Promise.resolve({ id: "demo-contact-1" }),
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderEventsPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/events/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderEventDetailPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/events/[id]/page")).default;
  const pageElement = await Page({
    params: Promise.resolve({ id: "demo-event-1" }),
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderAgentPage(searchParams?: PageSearchParams): Promise<string> {
  const Page = (await import("../../app/(app)/app/agent/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(pageElement);
}

function assertPrimaryTextAvoidsInternalVocabulary(
  routeLabel: string,
  html: string,
) {
  const primaryText = primaryTextFromHtml(html);

  for (const pattern of bannedPrimaryPatterns) {
    assert.doesNotMatch(
      primaryText,
      pattern,
      `${routeLabel} primary text should not expose ${pattern}: ${primaryText}`,
    );
  }
}

function assertChineseLeadsEnglish(
  routeLabel: string,
  text: string,
  chineseCopy: string,
  englishCopy: string,
) {
  const chineseIndex = text.indexOf(chineseCopy);
  const englishIndex = text.indexOf(englishCopy);

  assert.notEqual(
    chineseIndex,
    -1,
    `${routeLabel} should show Chinese copy: ${chineseCopy}`,
  );
  assert.notEqual(
    englishIndex,
    -1,
    `${routeLabel} should show secondary English copy: ${englishCopy}`,
  );
  assert.ok(
    chineseIndex < englishIndex,
    `${routeLabel} should place Chinese before English for ${chineseCopy} / ${englishCopy}`,
  );
}

test("all product pages present Chinese-first bilingual interface copy", async () => {
  const cases = [
    {
      chinese: "问 Orbit AI",
      english: "Ask Orbit AI",
      html: await renderAppHome(),
      label: "/app",
    },
    {
      chinese: "个人资料",
      english: "Profile",
      html: await renderProfilePage(),
      label: "/app/profile",
    },
    {
      chinese: "添加关系来源",
      english: "Relationship source intake",
      html: await renderContactsNewPage(),
      label: "/app/contacts/new",
    },
    {
      chinese: "关系复盘队列",
      english: "Relationship review queue",
      html: await renderContactsPage(),
      label: "/app/contacts",
    },
    {
      chinese: "关系工作区",
      english: "Relationship workspace",
      html: await renderContactDetailPage(),
      label: "/app/contacts/demo-contact-1",
    },
    {
      chinese: "当前活动优先级",
      english: "Current event priority",
      html: await renderEventsPage(),
      label: "/app/events",
    },
    {
      chinese: "当前活动",
      english: "Current event",
      html: await renderEventDetailPage(),
      label: "/app/events/demo-event-1",
    },
    {
      chinese: "要守住的承诺",
      english: "Promise to keep next",
      html: await renderFollowupsPage(),
      label: "/app/followups",
    },
    {
      chinese: "当前回复优先级",
      english: "Current reply priority",
      html: await renderChatPage(),
      label: "/app/chat",
    },
    {
      chinese: "关系健康优先级",
      english: "Network health priority",
      html: await renderDashboardPage(),
      label: "/app/dashboard",
    },
    {
      chinese: "下一步审核",
      english: "Agent review",
      html: await renderAgentPage(),
      label: "/app/agent",
    },
  ];

  for (const pageCase of cases) {
    assertChineseLeadsEnglish(
      pageCase.label,
      primaryTextFromHtml(pageCase.html),
      pageCase.chinese,
      pageCase.english,
    );
  }
});

test("/app and /app/profile primary text avoids internal implementation vocabulary", async () => {
  const cases = [
    { label: "/app", html: await renderAppHome() },
    { label: "/app?scenario=empty", html: await renderAppHome({ scenario: "empty" }) },
    { label: "/app?scenario=pending", html: await renderAppHome({ scenario: "pending" }) },
    { label: "/app?scenario=failure", html: await renderAppHome({ scenario: "failure" }) },
    { label: "/app/profile", html: await renderProfilePage() },
    {
      label: "/app/profile?scenario=empty",
      html: await renderProfilePage({ scenario: "empty" }),
    },
    {
      label: "/app/profile?scenario=pending",
      html: await renderProfilePage({ scenario: "pending" }),
    },
    {
      label: "/app/profile?scenario=failure",
      html: await renderProfilePage({ scenario: "failure" }),
    },
    { label: "/app/contacts/new", html: await renderContactsNewPage() },
    {
      label: "/app/contacts/new?scenario=empty",
      html: await renderContactsNewPage({ scenario: "empty" }),
    },
    {
      label: "/app/contacts/new?scenario=pending",
      html: await renderContactsNewPage({ scenario: "pending" }),
    },
    {
      label: "/app/contacts/new?scenario=failure",
      html: await renderContactsNewPage({ scenario: "failure" }),
    },
  ];

  for (const pageCase of cases) {
    assertPrimaryTextAvoidsInternalVocabulary(pageCase.label, pageCase.html);
  }
});

test("/app/contacts primary copy reads as connected relationship work", async () => {
  const contactsHtml = await renderContactsPage();
  const contactDetailHtml = await renderContactDetailPage();
  const contactsText = primaryTextFromHtml(contactsHtml);
  const detailText = primaryTextFromHtml(contactDetailHtml);

  assert.match(contactsText, /Relationship review queue/i);
  assert.match(contactsText, /Who needs attention now/i);
  assert.match(contactsText, /Why Kenji matters now/i);
  assert.match(contactsText, /Open relationship workspace/i);
  assert.match(detailText, /Relationship workspace: Kenji Watanabe/i);
  assert.match(detailText, /Source story/i);
  assert.match(detailText, /Relationship stage: .*Needs follow-up/i);
  assert.match(detailText, /Priority reason/i);
  assert.match(detailText, /Prepare follow-up/i);

  for (const [label, text] of [
    ["/app/contacts", contactsText],
    ["/app/contacts/demo-contact-1", detailText],
  ] as const) {
    assert.doesNotMatch(
      text,
      /\b(?:evidence|relationship-value|contact|connection):[a-z0-9:_-]+\b/i,
      `${label} primary text should keep raw ids in secondary disclosures`,
    );
    assert.doesNotMatch(
      text,
      /\b(?:harness|fixtures?|mock|providers?|services?)\b/i,
      `${label} primary text should avoid implementation vocabulary`,
    );
  }

  assert.match(contactsHtml, /<summary>[^<]*Contact evidence details<\/summary>/);
  assert.match(contactDetailHtml, /<summary>[^<]*Evidence IDs and source records<\/summary>/);
  assert.match(contactsHtml, /evidence:contacts-list-kenji/);
  assert.match(contactDetailHtml, /evidence:connection-storage-pilot/);
});

test("/app/events primary copy reads as event preparation work", async () => {
  const eventsHtml = await renderEventsPage();
  const detailHtml = await renderEventDetailPage();
  const eventsText = primaryTextFromHtml(eventsHtml);
  const detailText = primaryTextFromHtml(detailHtml);

  assert.match(eventsText, /Current event priority/);
  assert.match(eventsText, /Prepare for Climate founders dinner/);
  assert.match(eventsText, /Open Climate founders dinner workspace/);
  assert.match(eventsText, /Event choices/);
  assert.match(detailText, /Current event: Climate founders dinner/);
  assert.match(detailText, /Source story/);
  assert.match(detailText, /First person to meet: Priya Shah/);
  assert.match(detailText, /In-room action: .*Mark Priya Shah to meet on this page/);
  assert.match(detailText, /Meet Priya Shah first/);
  assert.match(detailText, /Opening line context/);
  assert.match(detailText, /trusted event details/i);
  assert.doesNotMatch(detailText, /event detail record/i);
  assert.doesNotMatch(detailText, /route-only/i);

  for (const [label, text] of [
    ["/app/events", eventsText],
    ["/app/events/demo-event-1", detailText],
  ] as const) {
    assert.doesNotMatch(
      text,
      /\b(?:evidence|event-rec|want-connect|imported-event-record):[a-z0-9:_-]+\b/i,
      `${label} primary text should keep raw ids in secondary evidence only`,
    );
    assert.doesNotMatch(
      text,
      /\b(?:harness|fixtures?|mock|providers?|services?|route apis?|composed capability)\b/i,
      `${label} primary text should avoid implementation vocabulary`,
    );
  }
});

test("/app/followups primary copy reads as promise follow-through work", async () => {
  const html = await renderFollowupsPage();
  const actionHtml = await renderFollowupsPage({
    action: "complete-top-followup",
  });
  const followupsText = primaryTextFromHtml(html);
  const actionText = primaryTextFromHtml(actionHtml);

  assert.match(followupsText, /Promise to keep next/);
  assert.match(followupsText, /For Maya Chen at Kumo Grid/);
  assert.match(followupsText, /Promise workflow/);
  assert.match(followupsText, /Queue hold before delivery/);
  assert.match(actionText, /Completion preview ready/);
  assert.match(actionText, /Still staged locally/);

  for (const [label, text] of [
    ["/app/followups", followupsText],
    ["/app/followups?action=complete-top-followup", actionText],
  ] as const) {
    assert.doesNotMatch(
      text,
      /\b(?:evidence|queue|task|reminder|source):[a-z0-9:_-]+\b/i,
      `${label} primary text should keep raw ids in secondary evidence details`,
    );
    assert.doesNotMatch(
      text,
      /\b(?:harness|fixtures?|mock|providers?|services?|deterministic)\b/i,
      `${label} primary text should avoid implementation vocabulary`,
    );
  }

  assert.match(html, /<summary>[^<]*Evidence details<\/summary>/);
  assert.match(html, /queue:notification:maya-deck/);
  assert.match(actionHtml, /data-side-effects="none"/);
});

test("/app/chat primary copy reads as private reply review", async () => {
  const html = await renderChatPage();
  const actionHtml = await renderChatPage({ action: "record-local-reply" });
  const chatText = primaryTextFromHtml(html);
  const actionText = primaryTextFromHtml(actionHtml);

  assert.match(chatText, /Current reply priority/i);
  assert.match(chatText, /Maya Chen at Kumo Grid/);
  assert.match(chatText, /Why it matters now/i);
  assert.match(chatText, /Consent and privacy posture/i);
  assert.match(chatText, /Suggested reply intent/i);
  assert.match(chatText, /Next safe action/i);
  assert.match(chatText, /Reply-review workflow/i);
  assert.match(chatText, /Participant labels/i);
  assert.match(chatText, /Review status: .*staged for human review/i);
  assert.match(actionText, /Local reply preview ready/i);
  assert.match(actionText, /Selected conversation: Maya Chen at Kumo Grid/i);
  assert.match(actionText, /What remains local/i);
  assert.match(actionText, /No external message/i);
  assert.match(actionText, /No notification/i);
  assert.match(actionText, /No profile update/i);
  assert.match(actionText, /No private-note analysis/i);
  assert.match(actionText, /No automated writing call/i);
  assert.match(actionText, /No saved-record write/i);
  assert.match(actionText, /No outside network request/i);

  for (const [label, text] of [
    ["/app/chat", chatText],
    ["/app/chat?action=record-local-reply", actionText],
  ] as const) {
    assert.doesNotMatch(
      text,
      /\b(?:evidence|conversation|chat|source):[a-z0-9:_-]+\b/i,
      `${label} primary text should keep raw ids in secondary evidence details`,
    );
    assert.doesNotMatch(
      text,
      /\b(?:harness|fixtures?|mock|providers?|services?|deterministic|database(?:s)?)\b/i,
      `${label} primary text should avoid implementation vocabulary`,
    );
  }

  assert.match(html, /<summary>[^<]*Source and safety evidence<\/summary>/);
  assert.match(actionHtml, /data-side-effects="none"/);
  assert.match(actionHtml, /evidence:chat:maya:pilot-timing/);
});

test("/app/dashboard primary copy reads as relationship health-to-action work", async () => {
  const html = await renderDashboardPage();
  const actionHtml = await renderDashboardPage({
    action: "run-dashboard-review",
  });
  const dashboardText = primaryTextFromHtml(html);
  const actionText = primaryTextFromHtml(actionHtml);

  assert.match(dashboardText, /Network health priority/i);
  assert.match(dashboardText, /Current priority: Maya Chen at Kumo Grid/i);
  assert.match(dashboardText, /Why it matters now/i);
  assert.match(dashboardText, /Source confidence: High/i);
  assert.match(dashboardText, /Review status: .*Ready for human review/i);
  assert.match(dashboardText, /Recommended next move/i);
  assert.match(dashboardText, /Health-to-action workflow/i);
  assert.match(dashboardText, /Coverage context/i);
  assert.match(dashboardText, /Review status/i);
  assert.match(
    dashboardText,
    /No side effects: no saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs from this page\./i,
  );
  assert.match(actionText, /Review preview refreshed local guidance/i);
  assert.match(actionText, /What remains local/i);
  assert.match(actionText, /No outside network request/i);

  for (const [label, text] of [
    ["/app/dashboard", dashboardText],
    ["/app/dashboard?action=run-dashboard-review", actionText],
  ] as const) {
    assert.doesNotMatch(
      text,
      /\b(?:evidence|dashboard|audit|source):[a-z0-9:_-]+\b/i,
      `${label} primary text should keep raw ids in secondary evidence details`,
    );
    assert.doesNotMatch(
      text,
      /\b(?:harness|fixtures?|mock|providers?|services?|deterministic|database(?:s)?|route)\b/i,
      `${label} primary text should avoid implementation vocabulary`,
    );
  }

  assert.match(html, /<summary>[^<]*Evidence source trail<\/summary>/);
  assert.doesNotMatch(
    html,
    /<details(?![^>]*hidden)[^>]*><summary>Technical provenance IDs<\/summary>/,
  );
  assert.match(html, /evidence:dashboard:new-contact:maya/);
  assert.match(actionHtml, /data-side-effects="none"/);
});

test("/app and /app/profile keep outcome-oriented action language visible", async () => {
  const appText = primaryTextFromHtml(await renderAppHome()).toLowerCase();
  const profileText = primaryTextFromHtml(await renderProfilePage()).toLowerCase();
  const contactsNewText = primaryTextFromHtml(await renderContactsNewPage()).toLowerCase();

  assert.match(appText, /问 orbit ai/);
  assert.match(appText, /推荐活动/);
  assert.match(appText, /推荐人脉/);
  assert.match(appText, /检查下一步/);
  assert.match(appText, /功能面板/);
  assert.match(appText, /关系轨道|来源和下一步|预览/);
  assert.match(profileText, /confirm intro preference/);
  assert.doesNotMatch(profileText, /confirm safe action/);
  assert.match(profileText, /review setup gap/);
  assert.match(profileText, /review held profile sources/);
  assert.match(profileText, /review profile source recovery/);
  assert.match(contactsNewText, /relationship source intake/);
  assert.match(contactsNewText, /manual note from climate founders dinner/);
  assert.match(contactsNewText, /preview contact review/);
  assert.match(contactsNewText, /choose another relationship source/);
  assert.match(contactsNewText, /outside accounts contacted: none/);
});

test("/app primary copy reads as an AI command center with functional panels", async () => {
  const html = await renderAppHome();
  const appText = primaryTextFromHtml(html);
  const englishText = primaryTextFromHtml(await renderAppHome({ lang: "en" }));

  assert.match(appText, /问 Orbit AI/i);
  assert.match(appText, /你现在想在东京推进什么？/i);
  assert.match(appText, /告诉我你想推进哪类机会/i);
  assert.match(appText, /实时关系轨道/i);
  assert.match(appText, /从聊天打开功能面板/i);
  assert.match(appText, /推荐活动/i);
  assert.match(appText, /推荐人脉/i);
  assert.match(appText, /打开跟进/i);
  assert.match(appText, /检查下一步/i);
  assert.match(appText, /功能面板/i);
  assert.match(englishText, /Ask Orbit AI/i);
  assert.match(englishText, /Open a function panel from chat/i);
  assert.doesNotMatch(appText, /capabilit(?:y|ies)|modules?|services?|providers?/i);
});

test("/app keeps raw provenance identifiers out of primary copy", async () => {
  const html = await renderAppHome();
  const appText = primaryTextFromHtml(html);
  const contactsNewHtml = await renderContactsNewPage();
  const contactsNewText = primaryTextFromHtml(contactsNewHtml);

  assert.doesNotMatch(
    appText,
    /\b(?:evidence|queue|source):[a-z0-9:_-]+\b/i,
  );
  assert.doesNotMatch(
    appText,
    /\b(?:bootstrap|dashboard|fixture|summary|agent-action|event-fixture|profile-fixture)-[a-z0-9:_-]+\b/i,
  );
  assert.match(html, /<summary>来源详情 \/ Source details<\/summary>/);
  assert.match(html, /bootstrap-fixture-1/);
  assert.doesNotMatch(
    contactsNewText,
    /\b(?:evidence|queue|source):[a-z0-9:_-]+\b/i,
  );
  assert.doesNotMatch(
    contactsNewText,
    /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/,
  );
  assert.match(contactsNewText, /Manual note from climate founders dinner/);
  assert.match(contactsNewHtml, /<summary>[^<]*Source record details<\/summary>/);
  assert.match(contactsNewHtml, /evidence:manual-note-kenji/);
});

test("/app and /app/profile state recovery points to visible recovery controls", async () => {
  const cases = [
    {
      expectedCopy: "Add a relationship source to start from reviewed context.",
      expectedLabel: "Add a relationship source",
      label: "/app?scenario=empty",
      html: await renderAppHome({ scenario: "empty" }),
    },
    {
      expectedCopy:
        "Return to relationship cockpit to recheck the reviewed source queue after profile, event, follow-up, and next-move evidence finish review.",
      expectedLabel: "Return to relationship cockpit",
      label: "/app?scenario=pending",
      html: await renderAppHome({ scenario: "pending" }),
    },
    {
      expectedCopy:
        "Return to relationship cockpit without writing records, delivering reminders, sending messages, or contacting outside tools.",
      expectedLabel: "Return to relationship cockpit",
      label: "/app?scenario=failure",
      html: await renderAppHome({ scenario: "failure" }),
    },
    {
      expectedCopy: "Open profile setup to add reviewed profile context.",
      expectedLabel: "Open profile setup",
      label: "/app/profile?scenario=empty",
      html: await renderProfilePage({ scenario: "empty" }),
    },
    {
      expectedCopy:
        "Review held profile sources while manual edits, business-card draft, and suggested changes stay held.",
      expectedLabel: "Review held profile sources",
      label: "/app/profile?scenario=pending",
      html: await renderProfilePage({ scenario: "pending" }),
    },
    {
      expectedCopy:
        "Return to profile source review without accepting suggestions or changing Ari's profile.",
      expectedLabel: "Return to profile source review",
      label: "/app/profile?scenario=failure",
      html: await renderProfilePage({ scenario: "failure" }),
    },
  ];

  for (const pageCase of cases) {
    const primaryText = primaryTextFromHtml(pageCase.html);

    assert.match(
      primaryText,
      new RegExp(pageCase.expectedLabel, "i"),
      `${pageCase.label} should name the visible recovery control`,
    );
    assert.match(
      primaryText,
      new RegExp(pageCase.expectedCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${pageCase.label} should repeat recovery copy that matches the visible control`,
    );
    assert.doesNotMatch(
      primaryText,
      /\b(?:retry|reload|refresh)\b/i,
      `${pageCase.label} should not name recovery actions without matching visible controls`,
    );
    assert.doesNotMatch(
      primaryText,
      /before (?:choosing|deciding)|open this workspace later/i,
      `${pageCase.label} should not describe follow-up decisions that are not visible controls`,
    );
    assert.match(
      pageCase.html,
      /<summary>来源详情 \/ Source details<\/summary>/,
      `${pageCase.label} should render the matching source-details disclosure`,
    );
    assert.doesNotMatch(
      pageCase.html,
      /<summary>Inspect source details<\/summary>/,
      `${pageCase.label} should not label source evidence like a recovery action`,
    );
  }
});
