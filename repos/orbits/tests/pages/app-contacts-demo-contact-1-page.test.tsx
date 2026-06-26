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

async function renderContactDetailPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/contacts/[id]/page")).default;
  const element = await Page({
    params: Promise.resolve({ id: "demo-contact-1" }),
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(element);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const isSelfClosingTag = tag.endsWith("/>");
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

  return primaryText.replace(/\s+/g, " ").trim();
}

test("/app/contacts/demo-contact-1 carries the selected person into a relationship workspace", async () => {
  const html = await renderContactDetailPage();
  const primaryText = primaryTextFromHtml(html);
  const primaryPrepareLinks =
    html.match(/<a\b[^>]*>\s*Prepare follow-up\s*<\/a>/g) ?? [];

  assert.match(html, /<h1>Relationship workspace: Kenji Watanabe<\/h1>/);
  assert.match(primaryText, /Aster Grid/);
  assert.match(primaryText, /Source story/);
  assert.match(primaryText, /climate founders dinner/);
  assert.match(primaryText, /Relationship stage: Needs follow-up/);
  assert.match(primaryText, /Priority reason/);
  assert.match(primaryText, /storage pilot operator intro is explicit, timely/);
  assert.match(primaryText, /Prepare follow-up/);
  assert.match(
    primaryText,
    /Send Kenji the storage pilot operator intro by Friday/,
  );
  assert.equal(
    primaryPrepareLinks.length,
    1,
    "detail route should expose one primary Prepare follow-up link",
  );
  assert.match(html, /Review prepared draft/);
  assert.doesNotMatch(primaryText, /\bevidence:[a-z0-9:_-]+\b/i);
  assert.match(html, /<summary>Evidence IDs and source records<\/summary>/);
  assert.match(html, /evidence:connection-storage-pilot/);
  assert.match(html, /data-state-boundary="app-contact-detail-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /Contact detail state checks/);
  assert.doesNotMatch(html, />Empty state<\/a>|>Loading state<\/a>|>Failure state<\/a>/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
});

test("/app/contacts/demo-contact-1 prepares the next follow-up without external side effects", async (t) => {
  const expectedSafetySummary =
    "OUTSIDE ACCOUNTS CONTACTED: none / CONTACT RECORD CHANGED: no / MESSAGE SENT: no / NOTIFICATION SENT: no / SEARCH INDEX READ: no / DATABASE QUERY EXECUTED: no";
  const html = await renderContactDetailPage({
    action: "prepare-follow-up",
  });
  const reloadedHtml = await renderContactDetailPage({
    action: "prepare-follow-up",
  });

  assert.match(html, /Prepare follow-up/);
  assert.match(html, /Follow-up prepared: Operator confirmed warm introduction path/);
  assert.match(html, /Kenji wants the storage pilot operator intro before the partner review call/);
  assert.match(html, /Prepared follow-up draft preview/);
  assert.match(html, /Subject<\/dt><dd>Warm intro for storage pilot operators/);
  assert.match(html, /Draft note<\/dt><dd>Kenji, I can introduce you to the operator/);
  assert.match(html, /Choose where to stage this draft/);
  assert.match(html, /Save to local follow-up notes/);
  assert.match(html, /Copy into conversation prep/);
  assert.match(html, /Stage draft locally/);
  assert.match(html, /This draft stays local until you confirm where it should go/);
  assert.match(html, new RegExp(escapeRegex(expectedSafetySummary)));
  assert.match(html, /Outside accounts contacted<\/dt><dd>none/);
  assert.match(html, /Contact record changed<\/dt><dd>no/);
  assert.match(html, /Message sent<\/dt><dd>no/);
  assert.match(html, /Notification sent<\/dt><dd>no/);
  assert.match(html, /Search index read<\/dt><dd>no/);
  assert.match(html, /Database query executed<\/dt><dd>no/);
  assert.doesNotMatch(html, /Send follow-up|Message Kenji|Notify Kenji/);
  assert.match(html, /data-action-result="contact-detail-follow-up-prepared"/);
  assert.match(html, /data-action-evidence="evidence:connection-added-manual-note"/);
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="evidence:connection-added-manual-note"/,
  );
  assert.match(reloadedHtml, /Outside accounts contacted<\/dt><dd>none/);

  t.diagnostic(
    [
      "app-contacts-demo-contact-1 action=prepare-follow-up",
      "result=contact-detail-follow-up-prepared",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/contacts/demo-contact-1 renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No contact detail is available",
      expectedCopy:
        "Choose a contact with source evidence before reviewing tags, status, connection context, or relationship value.",
      expectedRecoveryHref: "/app/contacts",
      expectedRecoveryLabel: "Return to contacts list",
    },
    {
      scenario: "pending",
      expectedTitle: "Contact detail is loading",
      expectedCopy:
        "Orbit is waiting for local source evidence before exposing this relationship profile.",
      expectedRecoveryHref: "/app/contacts/demo-contact-1",
      expectedRecoveryLabel: "Check current detail",
    },
    {
      scenario: "failure",
      expectedTitle: "Contact detail could not load",
      expectedCopy:
        "The local relationship detail boundary returned a controlled failure.",
      expectedRecoveryHref: "/app/contacts/demo-contact-1",
      expectedRecoveryLabel: "Retry contact detail",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderContactDetailPage({ scenario: state.scenario });

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(escapeRegex(state.expectedCopy)));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(
        `data-route-state-url="/app/contacts/demo-contact-1\\?scenario=${state.scenario}"`,
      ),
    );
    assert.match(html, /aria-label="Contact detail route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${escapeRegex(state.expectedRecoveryHref)}">${escapeRegex(
          state.expectedRecoveryLabel,
        )}</a>`,
      ),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    t.diagnostic(
      `app-contacts-demo-contact-1 navigate=/app/contacts/demo-contact-1?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/contacts/demo-contact-1 API evidence surfaces return success envelopes", async (t) => {
  const contactsRoute = await import("../../app/api/contacts/[id]/route");
  const connectionsRoute = await import("../../app/api/connections/[id]/route");
  const valueRoute = await import(
    "../../app/api/analysis/relationship-value/[id]/route"
  );
  const probes = [
    {
      name: "app-contacts-demo-contact-1-page_1",
      response: await contactsRoute.GET(
        new Request("http://localhost/api/contacts/demo-contact-1"),
        { params: Promise.resolve({ id: "demo-contact-1" }) },
      ),
      expectedDatum: "Kenji Watanabe",
    },
    {
      name: "app-contacts-demo-contact-1-page_2",
      response: await connectionsRoute.GET(
        new Request("http://localhost/api/connections/demo-connection-1"),
        { params: Promise.resolve({ id: "demo-connection-1" }) },
      ),
      expectedDatum: "demo-connection-1",
    },
    {
      name: "app-contacts-demo-contact-1-page_3",
      response: await valueRoute.GET(
        new Request(
          "http://localhost/api/analysis/relationship-value/demo-connection-1",
        ),
        { params: Promise.resolve({ id: "demo-connection-1" }) },
      ),
      expectedDatum: "relationship-value:demo-connection-1",
    },
  ] as const;

  for (const probe of probes) {
    const body = await probe.response.json();

    assert.equal(probe.response.status, 200, probe.name);
    assert.equal(body.success, true, probe.name);
    assert.match(JSON.stringify(body.data), new RegExp(escapeRegex(probe.expectedDatum)));
    t.diagnostic(
      `${probe.name} status=200 success=true datum=${probe.expectedDatum}`,
    );
  }
});

test("/app/contacts/demo-contact-1 route adapter avoids raw fixtures and documents mock to live replacement", (t) => {
  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/contacts/[id]/page.tsx"),
    "utf8",
  );
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /fixtures/i);
  assert.doesNotMatch(pageSource, /createMock/i);
  assert.match(pageSource, /loadAppContactDetailRoute/);
  assert.match(adapterSource, /createModuleServiceFactory/);
  assert.match(adapterSource, /createContactDetailTagStatusService/);
  assert.match(adapterSource, /createConnectionEvidenceService/);
  assert.match(adapterSource, /createRelationshipValueScoringService/);

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
    "route state checks",
    "data-action-evidence",
    "data-side-effects",
  ]) {
    assert.match(liveDoc.toLowerCase(), new RegExp(required));
  }

  assert.match(liveDoc, /Live files:/);
  assert.match(liveDoc, /Switch:/);
  assert.match(liveDoc, /Env and permissions:/);
  assert.match(liveDoc, /Privacy and provenance:/);
  assert.match(liveDoc, /Replacement tests:/);

  t.diagnostic(
    "app-contacts-demo-contact-1 live-doc covers live files, switch, env and permissions, privacy and provenance, route state checks, mock action evidence, and replacement tests",
  );
});
