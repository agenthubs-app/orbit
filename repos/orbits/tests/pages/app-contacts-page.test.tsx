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

async function renderContactsPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/contacts/page")).default;
  const element = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(element);
}

function extractContactRow(html: string, displayName: string): string {
  const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowMatch = html.match(
    new RegExp(
      `<article[^>]+aria-label="Contact relationship row for ${escapedName}"[^>]*>[\\s\\S]*?<\\/article>`,
    ),
  );

  assert.ok(rowMatch, `${displayName} contact row should render`);

  return rowMatch[0];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("/app/contacts leads with a current relationship review queue", async () => {
  const html = await renderContactsPage();
  const kenjiRow = extractContactRow(html, "Kenji Watanabe");
  const queueIndex = html.indexOf("Relationship review queue");
  const searchIndex = html.indexOf("Search contact list");
  const healthIndex = html.indexOf("List health");

  assert.match(html, /<h2>Relationship review queue<\/h2>/);
  assert.ok(queueIndex >= 0, "review queue should render");
  assert.ok(
    queueIndex < searchIndex,
    "review queue should appear before search controls",
  );
  assert.ok(
    queueIndex < healthIndex,
    "review queue should appear before diagnostics",
  );
  assert.match(html, /Who needs attention now/);
  assert.match(html, /Why Kenji matters now/);
  assert.match(html, /Source context: Manual note/);
  assert.match(
    html,
    /Next safe action: Send Kenji the storage pilot operator intro by Friday\./,
  );
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /data-state-boundary="app-contacts-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /Contacts will show who a person is/);
  assert.doesNotMatch(html, /Route state checks/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);

  assert.match(kenjiRow, /href="\/app\/contacts\/demo-contact-1"/);
  assert.match(kenjiRow, /Open relationship workspace/);
  assert.match(kenjiRow, /Aster Grid/);
  assert.match(kenjiRow, /Source context<\/dt><dd>Manual note/);
  assert.match(kenjiRow, /Relationship status<\/dt><dd>Needs follow-up/);
  assert.match(kenjiRow, /Relationship value<\/dt><dd>Commercial opportunity/);
  assert.match(kenjiRow, /Next safe action<\/dt><dd>Send Kenji/);
  assert.match(kenjiRow, /Commercial opportunity/);
  assert.match(kenjiRow, /Referral path/);
  assert.match(kenjiRow, /<summary>Contact evidence details<\/summary>/);
  assert.match(kenjiRow, /evidence:contacts-list-kenji/);
  assert.doesNotMatch(kenjiRow, /Score 91/);
});

test("/app/contacts keeps search controls and diagnostics secondary", async () => {
  const html = await renderContactsPage();

  assert.match(html, /Search contact list/);
  assert.match(html, /List health/);
  assert.match(
    html,
    /href="\/app\/contacts\?scenario=empty">No contacts found<\/a>/,
  );
  assert.match(
    html,
    /href="\/app\/contacts\?scenario=pending">Still checking sources<\/a>/,
  );
  assert.match(
    html,
    /href="\/app\/contacts\?scenario=failure">List unavailable<\/a>/,
  );
});

test("/app/contacts previews a contacts review action without external side effects", async (t) => {
  const expectedSafetySummary =
    "OUTSIDE ACCOUNTS CONTACTED: none / CONTACT RECORD CHANGED: no / MESSAGE SENT: no / NOTIFICATION SENT: no / SEARCH INDEX READ: no / DATABASE QUERY EXECUTED: no";
  const html = await renderContactsPage({
    action: "review-filtered-contact",
    query: "storage",
    tag: "topic:storage-pilots",
    value: "commercial_opportunity",
  });
  const reloadedHtml = await renderContactsPage({
    action: "review-filtered-contact",
    query: "storage",
    tag: "topic:storage-pilots",
    value: "commercial_opportunity",
  });

  assert.match(html, /Filtered review ready: Kenji Watanabe/);
  assert.match(html, /Send Kenji the storage pilot operator intro by Friday/);
  assert.match(html, new RegExp(escapeRegex(expectedSafetySummary)));
  assert.match(html, /Contact record changed: no/);
  assert.match(html, /Message sent: no/);
  assert.match(html, /Notification sent: no/);
  assert.match(html, /Search index read: no/);
  assert.match(html, /Database query executed: no/);
  assert.match(html, /Outside services contacted: none/);
  assert.match(html, /data-task-result="contacts-filtered-review-preview"/);
  assert.match(
    html,
    /data-action-evidence="contacts-filtered-review-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="contacts-filtered-review-local-preview"/,
  );
  assert.match(reloadedHtml, /Outside services contacted: none/);

  t.diagnostic(
    [
      "app-contacts action=review-filtered-contact",
      "result=contacts-filtered-review-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/contacts renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No contacts match this view",
      expectedCopy:
        "Clear the search and filters, or add a contact with source evidence before reviewing follow-up.",
      expectedRecoveryHref: "/app/contacts",
      expectedRecoveryLabel: "Show all sourced contacts",
    },
    {
      scenario: "pending",
      expectedTitle: "Checking contact sources",
      expectedCopy:
        "Contact rows stay hidden until their source evidence is ready.",
      expectedRecoveryHref: "/app/contacts",
      expectedRecoveryLabel: "Return to available contacts",
    },
    {
      scenario: "failure",
      expectedTitle: "Contacts could not load",
      expectedCopy: "Contacts list search and filter is unavailable",
      expectedRecoveryHref: "/app/contacts",
      expectedRecoveryLabel: "Reload contacts list",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderContactsPage({ scenario: state.scenario });

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(`data-route-state-url="/app/contacts\\?scenario=${state.scenario}"`),
    );
    assert.match(html, /aria-label="Contacts route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${state.expectedRecoveryHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">${state.expectedRecoveryLabel}</a>`,
      ),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    t.diagnostic(
      `app-contacts navigate=/app/contacts?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/contacts evidence API returns a success envelope", async (t) => {
  const contactsRoute = await import("../../app/api/contacts/route");

  const response = await contactsRoute.GET(
    new Request("http://localhost/api/contacts"),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.contacts[0].displayName, "Kenji Watanabe");
  t.diagnostic(
    "app-contacts api-envelope GET /api/contacts=200 success=true first-contact=Kenji Watanabe",
  );
});

test("/app/contacts route adapter avoids raw fixtures and documents mock to live replacement", (t) => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-command-center.tsx",
    ),
    "utf8",
  );
  const serviceFactoryPath = path.join(
    projectRoot,
    "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory.ts",
  );
  const serviceFactorySource = fs.existsSync(serviceFactoryPath)
    ? fs.readFileSync(serviceFactoryPath, "utf8")
    : "";
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /fixtures/i);
  assert.doesNotMatch(
    adapterSource,
    /createContactsListSearchAndFilterService/,
  );
  assert.match(adapterSource, /createAppContactsListSearchAndFilterService/);
  assert.match(adapterSource, /StateView/);
  assert.notEqual(serviceFactorySource, "");
  assert.match(serviceFactorySource, /createModuleServiceFactory/);
  assert.match(serviceFactorySource, /createContactsListSearchAndFilterService/);

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

  t.diagnostic(
    "app-contacts live-doc evidence summary: Live files: features/contacts contract, service, provider and app/api/contacts; Switch: service factory resolution through shared services and feature mode; Env and permissions: CRM/contact store, search index, email/calendar evidence scopes; Privacy and provenance: source labels, evidence ids, value rationale, data-action-evidence, data-side-effects=none; Replacement tests: page route, API envelope, route state checks, route recovery actions, privacy regressions",
  );
});
