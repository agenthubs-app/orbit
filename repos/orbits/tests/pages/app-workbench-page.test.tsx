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

async function renderAppPage(searchParams?: PageSearchParams): Promise<string> {
  const { AppWorkbench } = await import(
    "../../app/(app)/compose-app-from-previously-approved-mock-first-capabilities/app-workbench"
  );
  const element = <AppWorkbench searchParams={searchParams ?? {}} />;

  return renderToStaticMarkup(element);
}

test("/app renders the relationship workbench from approved capability services", async () => {
  const html = await renderAppPage();

  assert.match(html, /<h2>Orbit relationship command center<\/h2>/);
  assert.match(html, /Mina Tanaka/);
  assert.match(html, /Tokyo SaaS Leaders Roundtable/);
  assert.match(html, /Preview one-task focus queue/);
  assert.doesNotMatch(html, /Mock action result/i);
  assert.doesNotMatch(html, /Route state previews/);
  assert.match(html, /data-state-boundary="app-workbench-success"/);
});

test("/app previews one focus-queue action without external side effects", async () => {
  const html = await renderAppPage({ taskLimit: "1" });

  assert.match(html, /Focus queue ready: 1 task queued/);
  assert.match(html, /Send recap to Akari Mori/);
  assert.match(html, /No external side effects recorded/);
  assert.match(html, /No external network requested/);
});

test("/app renders empty loading and failure states through the shared state boundary", async () => {
  const Page = (await import("../../app/(app)/app/page")).default;
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "Orbit relationship command center is empty",
      expectedCopy: "Add a sourced contact or import an event attendee roster.",
    },
    {
      scenario: "pending",
      expectedTitle: "Orbit relationship command center is loading",
      expectedCopy: "Keep the app shell visible and retry loading the workspace.",
    },
    {
      scenario: "failure",
      expectedTitle: "Orbit relationship command center could not load",
      expectedCopy: "APP_BOOTSTRAP_MOCK_FAILED",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderAppPage({ scenario: state.scenario });

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  }
});

test("/app route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/compose-app-from-previously-approved-mock-first-capabilities/app-workbench.tsx",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/compose-app-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /fixtures/i);
  assert.match(adapterSource, /createAppBootstrapService/);
  assert.match(adapterSource, /createProfileService/);
  assert.match(adapterSource, /createEventCrudAndImportService/);
  assert.match(adapterSource, /createFollowupTaskGenerationService/);
  assert.match(adapterSource, /createDashboardAggregateService/);
  assert.match(adapterSource, /createReminderScheduleNotificationService/);
  assert.match(adapterSource, /createAgentActionQueueService/);

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
  ]) {
    assert.match(liveDoc.toLowerCase(), new RegExp(required));
  }
});
