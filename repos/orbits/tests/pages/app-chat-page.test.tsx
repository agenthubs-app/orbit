import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type PageSearchParams = Record<string, string | string[] | undefined>;

const internalCopyPattern =
  /\b(route|boundary|mock|harness|providers?|fixtures?|live|vector|model calls?|deterministic|database(?:s)?|console)\b/i;

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

async function renderChatPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const element = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(element);
}

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

test("/app/chat leads with one private reply priority before inventory", async () => {
  const html = await renderChatPage();
  const primaryText = primaryTextFromHtml(html);

  assert.match(html, /<h2>[^<]*Current reply priority<\/h2>/);
  assert.match(primaryText, /Maya Chen at Kumo Grid/);
  assert.match(primaryText, /Why it matters now/i);
  assert.match(primaryText, /Consent and privacy posture/i);
  assert.match(primaryText, /Suggested reply intent/i);
  assert.match(primaryText, /Next safe action/i);
  assert.match(primaryText, /Reply only after review; keep the draft local/i);
  assert.match(primaryText, /No external message, notification, profile update, private-note analysis, automated writing call, saved-record write, or outside network request occurs/i);
  assert.match(html, /data-state-boundary="app-chat-success"/);
  assert.match(html, /data-agent-panel="closed"/);
  assert.doesNotMatch(html, /data-agent-artifact-surface="side_panel"/);
  assert.doesNotMatch(html, /<h2>Chat command center<\/h2>/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /Chat will help summarize/);
  assert.doesNotMatch(primaryText, /\bevidence:[a-z0-9:_-]+\b/i);
  assert.doesNotMatch(primaryText, internalCopyPattern);

  assert.ok(
    primaryText.indexOf("Current reply priority") <
      primaryText.indexOf("Conversation inventory"),
    "current reply priority should come before broader conversation inventory",
  );
  assert.ok(
    primaryText.indexOf("Current reply priority") <
      primaryText.indexOf("Signal review"),
    "current reply priority should come before broader signal panels",
  );
});

test("/app/chat opens an agent artifact side panel from a natural-language prompt", async () => {
  const html = await renderChatPage({
    prompt: "帮我推荐下周适合见 Maya 的活动",
  });
  const primaryText = primaryTextFromHtml(html);

  assert.match(html, /data-agent-panel="open"/);
  assert.match(html, /data-agent-artifact-kind="event_recommendations"/);
  assert.match(html, /data-agent-artifact-surface="side_panel"/);
  assert.match(primaryText, /Agent reply/i);
  assert.match(primaryText, /活动推荐|event recommendation/i);
  assert.match(primaryText, /Recommended events/i);
  assert.match(primaryText, /Founder relationship roundtable/i);
  assert.match(primaryText, /Review event/i);
  assert.match(primaryText, /\bevents\b/i);
  assert.match(html, /data-requires-confirmation="true"/);
  assert.match(html, /data-side-effects="none"/);
  assert.match(html, /evidence:orbit-agent:event-recommendations:fixture/);
  assert.match(primaryText, /Conversation inventory/i);
  assert.doesNotMatch(primaryText, internalCopyPattern);
});

test("/app/chat groups panels into a readable reply-review workflow", async () => {
  const html = await renderChatPage();
  const primaryText = primaryTextFromHtml(html);

  assert.match(primaryText, /Reply-review workflow/i);
  assert.match(primaryText, /Conversation inventory/i);
  assert.match(primaryText, /One thread to review/i);
  assert.match(primaryText, /Participant labels/i);
  assert.match(primaryText, /Maya Chen wrote/i);
  assert.match(primaryText, /You wrote/i);
  assert.match(primaryText, /Writing assist/i);
  assert.match(primaryText, /Review status: staged for human review/i);
  assert.match(primaryText, /Summary for review/i);
  assert.match(primaryText, /Relationship signals to confirm/i);
  assert.match(primaryText, /Consent status: .*analysis allowed/i);
  assert.match(html, /Private note hidden from analysis and sharing/);
  assert.match(html, /<summary>[^<]*Source and safety evidence<\/summary>/);
  assert.match(html, /evidence:chat:maya:pilot-timing/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.doesNotMatch(primaryText, internalCopyPattern);
});

test("/app/chat previews the local reply action without external side effects", async (t) => {
  const html = await renderChatPage({
    action: "record-local-reply",
  });
  const reloadedHtml = await renderChatPage({
    action: "record-local-reply",
  });
  const expectedDraft =
    "Hi Maya Chen, following up from breakfast: I pulled together the pilot timing comparison from our last conversation. Which operator question should I prioritize for Kumo Grid?";
  const actionResultMatch = html.match(
    /<div[^>]*data-message-result="chat-record-local-reply-preview"[\s\S]*?<\/div>/,
  );
  const actionResultHtml = actionResultMatch?.[0] ?? "";
  const text = visibleText(html);
  const primaryText = primaryTextFromHtml(html);

  assert.match(html, /Local reply preview ready/);
  assert.match(primaryText, /Selected conversation: Maya Chen at Kumo Grid/);
  assert.match(primaryText, /Draft message/);
  assert.match(actionResultHtml, /Draft selected from writing assist/);
  assert.ok(actionResultHtml.includes(expectedDraft));
  assert.doesNotMatch(actionResultHtml, /Thanks Maya\. I will send/);
  assert.match(html, /two-window pilot comparison/);
  assert.match(primaryText, /Follow-up tracker/);
  assert.match(primaryText, /What remains local/i);
  assert.match(primaryText, /Selected conversation, draft reply, and follow-up tracker stay on this page/i);
  assert.match(primaryText, /No external message/i);
  assert.match(primaryText, /No notification/i);
  assert.match(primaryText, /No profile update/i);
  assert.match(primaryText, /No private-note analysis/i);
  assert.match(primaryText, /No automated writing call/i);
  assert.match(primaryText, /No saved-record write/i);
  assert.match(primaryText, /No outside network request/i);
  assert.match(html, /data-followup-tracker="local-chat-followup"/);
  assert.match(primaryText, /Send Maya the pilot timing comparison/);
  assert.match(primaryText, /Local reply preview ready for follow-up tracking/);
  assert.match(html, /data-message-result="chat-record-local-reply-preview"/);
  assert.match(
    html,
    /data-action-evidence="chat-record-local-reply-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="chat-record-local-reply-local-preview"/,
  );
  assert.match(
    primaryTextFromHtml(reloadedHtml),
    /Selected conversation, draft reply, and follow-up tracker stay on this page/i,
  );
  assert.doesNotMatch(primaryText, /\bevidence:[a-z0-9:_-]+\b/i);
  assert.doesNotMatch(primaryText, internalCopyPattern);
  assert.match(text, /evidence:chat:maya:pilot-timing/);

  t.diagnostic(
    [
      "app-chat action=record-local-reply",
      "result=chat-record-local-reply-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/chat renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No chat context is ready",
      expectedCopy:
        "Add source-backed relationship context before reviewing conversations, assists, summaries, and privacy controls.",
      expectedRecoveryHref: "/app/chat",
      expectedRecoveryLabel: "Show ready chat workspace",
    },
    {
      scenario: "pending",
      expectedTitle: "Chat context is still checking consent",
      expectedCopy:
        "Conversation review stays paused while local consent and source evidence are checked.",
      expectedRecoveryHref: "/app/chat",
      expectedRecoveryLabel: "Return to ready chat workspace",
    },
    {
      scenario: "failure",
      expectedTitle: "Chat workspace could not load",
      expectedCopy:
        "Conversation review is unavailable while source evidence and privacy controls are checked.",
      expectedRecoveryHref: "/app/chat",
      expectedRecoveryLabel: "Reload chat workspace",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderChatPage({ scenario: state.scenario });
    const text = visibleText(html);

    assert.match(html, new RegExp(`<h2>[^<]*${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(`data-route-state-url="/app/chat\\?scenario=${state.scenario}"`),
    );
    assert.match(html, /aria-label="[^"]*Chat route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${state.expectedRecoveryHref}">[^<]*${state.expectedRecoveryLabel}</a>`,
      ),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    assert.doesNotMatch(text, internalCopyPattern);
    t.diagnostic(
      `app-chat navigate=/app/chat?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/chat evidence APIs return success envelopes", async (t) => {
  const conversationsRoute = await import("../../app/api/chat/conversations/route");
  const threadRoute = await import("../../app/api/chat/conversations/[id]/route");
  const privacyRoute = await import("../../app/api/chat/privacy/route");

  const conversationsResponse = await conversationsRoute.GET(
    new Request("http://localhost/api/chat/conversations"),
  );
  const conversationsBody = await conversationsResponse.json();
  const threadResponse = await threadRoute.GET(
    new Request("http://localhost/api/chat/conversations/demo-conversation-1"),
    {
      params: Promise.resolve({ id: "demo-conversation-1" }),
    },
  );
  const threadBody = await threadResponse.json();
  const privacyResponse = await privacyRoute.GET(
    new Request("http://localhost/api/chat/privacy"),
  );
  const privacyBody = await privacyResponse.json();

  assert.equal(conversationsResponse.status, 200);
  assert.equal(conversationsBody.success, true);
  assert.equal(
    conversationsBody.data.conversations[0].participantName,
    "Maya Chen",
  );
  assert.equal(threadResponse.status, 200);
  assert.equal(threadBody.success, true);
  assert.equal(threadBody.data.messages[0].senderName, "Maya Chen");
  assert.equal(privacyResponse.status, 200);
  assert.equal(privacyBody.success, true);
  assert.equal(privacyBody.data.privateNotes[0].bodyRedacted, true);
  t.diagnostic(
    "app-chat api-envelope GET /api/chat/conversations=200 success=true first-contact=Maya GET /api/chat/conversations/demo-conversation-1=200 success=true first-message=Maya GET /api/chat/privacy=200 success=true private-note-redacted=true",
  );
});

test("/app/chat route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-command-center.tsx",
    ),
    "utf8",
  );
  const viewModelSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
    ),
    "utf8",
  );
  const serviceFactorySource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts",
    ),
    "utf8",
  );
  const artifactPanelSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/agent-artifact-side-panel.tsx",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /from\s+["'][^"']*fixtures?/i);
  assert.doesNotMatch(adapterSource, /createMock/);
  assert.doesNotMatch(adapterSource, /features\/chat/);
  assert.doesNotMatch(adapterSource, /features\/orbit-ai/);
  assert.doesNotMatch(adapterSource, /createAppChatRouteServices/);
  assert.doesNotMatch(adapterSource, /selectPrimaryOrbitAgentArtifactSurface/);
  assert.match(adapterSource, /loadAppChatRouteViewModel/);
  assert.match(adapterSource, /RouteStateBoundary/);
  assert.doesNotMatch(artifactPanelSource, /features\/orbit-ai/);
  assert.match(artifactPanelSource, /AppChatAgentArtifactSurfaceViewModel/);
  assert.doesNotMatch(artifactPanelSource, /createOrbitAgentConversationService/);
  assert.doesNotMatch(artifactPanelSource, /createMock/);
  assert.doesNotMatch(artifactPanelSource, /artifact-contract/);
  assert.match(viewModelSource, /createAppChatRouteServices/);
  assert.match(viewModelSource, /selectPrimaryOrbitAgentArtifactSurface/);
  assert.match(viewModelSource, /createOrbitAgentConversationService/);
  assert.doesNotMatch(viewModelSource, /from ["']react["']/);
  assert.doesNotMatch(viewModelSource, /shared\/ui|WorkbenchSurface|Chip/);
  assert.match(serviceFactorySource, /createModuleServiceFactory/);
  assert.match(serviceFactorySource, /createChatConversationMessageService/);
  assert.match(serviceFactorySource, /createChatWritingAssistService/);
  assert.match(serviceFactorySource, /createChatSummaryExtractionService/);
  assert.match(serviceFactorySource, /createChatPrivacyControlsService/);

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
    "route state checks",
    "route recovery actions",
    "data-action-evidence",
  ]) {
    assert.match(liveDoc.toLowerCase(), new RegExp(required));
  }

  assert.match(liveDoc, /## Evaluator Evidence Summary/);
  assert.match(liveDoc, /Live files:/);
  assert.match(liveDoc, /Switch:/);
  assert.match(liveDoc, /Env and permissions:/);
  assert.match(liveDoc, /Privacy and provenance:/);
  assert.match(liveDoc, /Replacement tests:/);
});
