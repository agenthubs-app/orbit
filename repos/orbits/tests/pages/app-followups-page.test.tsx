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

async function renderFollowupsPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/followups/page")).default;
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

function assertTextAppearsBefore(text: string, first: string, second: string) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);

  assert.ok(firstIndex >= 0, `Expected "${first}" to appear in page text.`);
  assert.ok(secondIndex >= 0, `Expected "${second}" to appear in page text.`);
  assert.ok(
    firstIndex < secondIndex,
    `Expected "${first}" to appear before "${second}".`,
  );
}

test("/app/followups composes approved followup task draft and reminder capabilities", async () => {
  const html = await renderFollowupsPage();
  const text = visibleText(html);

  assert.match(html, /<h2>Promise to keep next<\/h2>/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /Kumo Grid/);
  assert.match(html, /Send Maya the event recap and ask about pilot timing/);
  assert.match(html, /Following up on pilot timing/);
  assert.match(html, /Deliver the grid storage intro deck promised to Maya/);
  assert.match(html, /queue:notification:maya-deck/);
  assert.match(html, /data-state-boundary="app-followups-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /Followups will hold drafts/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.doesNotMatch(text, internalCopyPattern);
});

test("/app/followups leads with one promise priority before broader inventory", async () => {
  const html = await renderFollowupsPage();
  const text = visibleText(html);

  assert.match(html, /<h2>Promise to keep next<\/h2>/);
  assert.match(text, /For Maya Chen at Kumo Grid/);
  assert.match(
    text,
    /Selected promise Send Maya the event recap and ask about pilot timing/,
  );
  assert.match(
    text,
    /Why it matters now The new connection has fresh event context and source-backed buyer urgency\./,
  );
  assert.match(
    text,
    /Source trigger New connection from Climate operators breakfast roster/,
  );
  assert.match(text, /Draft readiness Draft awaiting review/);
  assert.match(text, /Reminder timing Due tomorrow/);
  assert.match(
    text,
    /Next safe action Review the drafted follow-through before marking anything complete\./,
  );
  assertTextAppearsBefore(text, "Promise to keep next", "Ready for review");
  assertTextAppearsBefore(text, "Promise to keep next", "Reminder queue");
});

test("/app/followups groups task draft reminder and queue as a promise workflow", async () => {
  const html = await renderFollowupsPage();
  const text = visibleText(html);

  assert.match(html, /<h2>Promise workflow<\/h2>/);
  assert.match(text, /Task to decide Send Maya the event recap and ask about pilot timing/);
  assert.match(text, /Message draft to review Following up on pilot timing/);
  assert.match(text, /Reminder to keep visible Deliver the grid storage intro deck promised to Maya/);
  assert.match(text, /Queue hold before delivery Push reminder for Maya Chen/);
  assert.match(text, /Relationship Maya Chen · Kumo Grid/);
  assert.match(text, /Due tomorrow/);
  assert.match(text, /Due today/);
  assert.match(text, /Source context Climate operators breakfast roster/);
  assert.match(text, /Review status Held for local review/);
});

test("/app/followups previews the core completion action without external side effects", async (t) => {
  const html = await renderFollowupsPage({
    action: "complete-top-followup",
  });
  const reloadedHtml = await renderFollowupsPage({
    action: "complete-top-followup",
  });
  const text = visibleText(html);

  assert.match(
    html,
    /Completion preview ready: Send Maya the event recap and ask about pilot timing/,
  );
  assert.match(html, /Review promise completion/);
  assert.match(text, /Selected promise: Send Maya the event recap and ask about pilot timing/);
  assert.match(text, /Draft context: Following up on pilot timing · within 24 hours/);
  assert.match(
    text,
    /Reminder context: Deliver the grid storage intro deck promised to Maya · due today/,
  );
  assert.match(
    text,
    /Still staged locally: promise review, draft review, reminder review, queue hold/,
  );
  assert.match(
    text,
    /Calendar changes: none Scheduler changes: none Messages sent: none Notifications delivered: none Saved records changed: none Automated writing calls: none Outside network requests: none Completion recorded: no/,
  );
  assert.match(html, /data-task-result="followups-complete-top-task-preview"/);
  assert.match(
    html,
    /data-action-evidence="followups-complete-top-task-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="followups-complete-top-task-local-preview"/,
  );
  assert.match(visibleText(reloadedHtml), /Completion recorded: no/);

  t.diagnostic(
    [
      "app-followups action=complete-top-followup",
      "result=followups-complete-top-task-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/followups constrains long evidence labels inside the route viewport", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-command-center.tsx",
    ),
    "utf8",
  );

  assert.match(
    adapterSource,
    /\.app-followups-route\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    adapterSource,
    /\.app-followups-route\s+\.orbit-chip,[\s\S]*overflow-wrap:\s*anywhere/,
  );
  assert.match(
    adapterSource,
    /\.app-followups-route\s+\.followups-state-links\s+a[\s\S]*max-width:\s*100%/,
  );
  assert.match(
    adapterSource,
    /\.app-followups-route\s+\.followups-action-form\s+button[\s\S]*white-space:\s*normal/,
  );
});

test("/app/followups renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No follow-ups are ready",
      expectedCopy:
        "Add a sourced relationship trigger before reviewing tasks, drafts, and reminders.",
      expectedNextStep:
        "Add a relationship source; ready follow-ups appear after a sourced trigger exists.",
      expectedRecoveryHref: "/app/contacts/new",
      expectedRecoveryLabel: "Add a relationship source",
    },
    {
      scenario: "pending",
      expectedTitle: "Follow-ups are still checking source evidence",
      expectedCopy:
        "Task, draft, and reminder review stays paused until source evidence is ready.",
      expectedNextStep:
        "Return to ready follow-ups after source evidence is available.",
      expectedRecoveryHref: "/app/followups",
      expectedRecoveryLabel: "Return to ready follow-ups",
    },
    {
      scenario: "failure",
      expectedTitle: "Follow-ups could not load",
      expectedCopy:
        "Follow-up tasks, drafts, and reminders are unavailable while source evidence is checked.",
      expectedNextStep: "Reload follow-ups before taking action.",
      expectedRecoveryHref: "/app/followups",
      expectedRecoveryLabel: "Reload follow-ups",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderFollowupsPage({ scenario: state.scenario });
    const text = visibleText(html);

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, new RegExp(state.expectedNextStep));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(
        `data-route-state-url="/app/followups\\?scenario=${state.scenario}"`,
      ),
    );
    assert.match(html, /aria-label="Follow-ups route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${state.expectedRecoveryHref}">${state.expectedRecoveryLabel}</a>`,
      ),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    assert.doesNotMatch(text, internalCopyPattern);
    t.diagnostic(
      `app-followups navigate=/app/followups?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/followups keeps one top-level privacy boundary and compact item provenance", async () => {
  const html = await renderFollowupsPage();
  const text = visibleText(html);
  const privacyCopy =
    "No saved record, calendar or scheduler change, email or message send, notification delivery, automated writing call, or outside network request is made from this page.";
  const privacyMatches = text.match(
    /No saved record, calendar or scheduler change, email or message send, notification delivery, automated writing call, or outside network request is made from this page\./g,
  );

  assert.equal(privacyMatches?.length, 1);
  assertTextAppearsBefore(text, privacyCopy, "For Maya Chen at Kumo Grid");
  assertTextAppearsBefore(text, "For Maya Chen at Kumo Grid", "Evidence details");
  assert.match(html, /<details class="followups-evidence-details">/);
  assert.doesNotMatch(
    text,
    /Review promise completion Preview what would be marked complete, then stop before any saved record/,
  );
});

test("/app/followups evidence APIs return success envelopes", async (t) => {
  const tasksRoute = await import("../../app/api/tasks/route");
  const notificationsRoute = await import("../../app/api/notifications/route");

  const tasksResponse = await tasksRoute.GET(
    new Request("http://localhost/api/tasks"),
  );
  const tasksBody = await tasksResponse.json();
  const notificationsResponse = await notificationsRoute.GET(
    new Request("http://localhost/api/notifications"),
  );
  const notificationsBody = await notificationsResponse.json();

  assert.equal(tasksResponse.status, 200);
  assert.equal(tasksBody.success, true);
  assert.equal(
    tasksBody.data.tasks[0].title,
    "Send Maya the event recap and ask about pilot timing",
  );
  assert.equal(notificationsResponse.status, 200);
  assert.equal(notificationsBody.success, true);
  assert.equal(
    notificationsBody.data.notificationQueue[0].queueEntryId,
    "queue:notification:maya-deck",
  );
  t.diagnostic(
    "app-followups api-envelope GET /api/tasks=200 success=true first-task=Maya GET /api/notifications=200 success=true first-queue=queue:notification:maya-deck",
  );
});

test("/app/followups route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-command-center.tsx",
    ),
    "utf8",
  );
  const serviceFactorySource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-service-factory.ts",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /from\s+["'][^"']*fixtures?/i);
  assert.doesNotMatch(adapterSource, /createMock/);
  assert.match(adapterSource, /createAppFollowupsRouteServices/);
  assert.match(adapterSource, /RouteStateBoundary/);
  assert.match(serviceFactorySource, /createModuleServiceFactory/);
  assert.match(serviceFactorySource, /createFollowupTaskGenerationService/);
  assert.match(serviceFactorySource, /createMessageDraftGeneratorService/);
  assert.match(serviceFactorySource, /createReminderScheduleNotificationService/);

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
