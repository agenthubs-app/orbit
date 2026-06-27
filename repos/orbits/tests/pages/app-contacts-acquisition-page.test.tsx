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

async function renderContactsNewPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/contacts/new/page")).default;
  const element = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(element);
}

const htmlEntities: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  quot: '"',
};

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

function textOnly(html: string): string {
  return decodeHtml(
    html
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function mainFlowText(html: string): string {
  return textOnly(
    html.replace(/<details[\s\S]*?<\/details>/g, " "),
  );
}

test("/app/contacts/new composes approved contact acquisition mock services", async () => {
  const html = await renderContactsNewPage();

  assert.match(html, /<h2>[^<]*Relationship source intake<\/h2>/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /Hana Sato/);
  assert.match(html, /Mika Tan/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /External contacts/);
  assert.match(html, /Email and calendar signals/);
  assert.match(html, /Referral recommendations/);
  assert.match(html, /Merge suggestions/);
  assert.match(html, /data-state-boundary="app-contacts-new-success"/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
});

test("/app/contacts/new leads with one sourced candidate and a safe decision", async () => {
  const html = await renderContactsNewPage();
  const primaryText = mainFlowText(html);

  assert.match(primaryText, /Current review candidate/);
  assert.match(primaryText, /Kenji Watanabe/);
  assert.match(primaryText, /Manual note from climate founders dinner/);
  assert.match(primaryText, /Next decision/);
  assert.match(primaryText, /Preview contact review/);
  assert.match(primaryText, /No contact record is created/);
  assert.match(primaryText, /Outside accounts contacted: none/);
  assert.match(
    html,
    /<h3 class="relationship-name">[^<]*Current review candidate<\/h3>[\s\S]*Manual note from climate founders dinner[\s\S]*Next decision[\s\S]*<button type="submit">[^<]*Preview contact review<\/button>[\s\S]*<h2>[^<]*Choose another relationship source<\/h2>/,
  );
});

test("/app/contacts/new presents selectable intake methods with status and next step copy", async () => {
  const html = await renderContactsNewPage();
  const expectedMethods = [
    {
      label: "Manual note",
      control: "Choose manual note",
      status: "Ready to review",
    },
    {
      label: "Business card",
      control: "Choose card scan",
      status: "Draft extracted",
    },
    {
      label: "Relationship QR",
      control: "Choose QR scan",
      status: "Context matched",
    },
    {
      label: "Event attendees",
      control: "Choose attendee import",
      status: "Roster staged",
    },
    {
      label: "External contacts",
      control: "Choose external contacts",
      status: "Candidates held",
    },
    {
      label: "Email and calendar",
      control: "Choose inbox signals",
      status: "Signals held",
    },
    {
      label: "Referral",
      control: "Choose referral",
      status: "Warm path ready",
    },
    {
      label: "Merge review",
      control: "Choose merge review",
      status: "Needs approval",
    },
  ] as const;
  const sourceMethodCards =
    html.match(/<article class="contacts-new-source-method">/g) ?? [];

  assert.equal(
    sourceMethodCards.length,
    expectedMethods.length,
    "renders exactly the eight relationship source methods required by the sprint",
  );

  for (const method of expectedMethods) {
    assert.match(html, new RegExp(`<h3 class="relationship-name">[^<]*${method.label}</h3>`));
    assert.match(html, new RegExp(`Status</dt>\\s*<dd>[^<]*${method.status}</dd>`));
    assert.match(html, new RegExp(`<button type="button">[^<]*${method.control}</button>`));
    assert.match(html, /<dt>[^<]*Next step<\/dt>\s*<dd>[^<]+<\/dd>/);
  }

  assert.match(
    html,
    /aria-label="Selectable relationship source methods"/,
    "source methods should be grouped as selectable options",
  );

  const expectedGroups = [
    {
      heading: "Captured in person",
      methods: ["Manual note", "Business card", "Relationship QR"],
    },
    {
      heading: "Imported records",
      methods: [
        "Event attendees",
        "External contacts",
        "Email and calendar",
        "Merge review",
      ],
    },
    {
      heading: "Warm introductions",
      methods: ["Referral"],
    },
  ] as const;
  const groupedSourceSections =
    html.match(/<section class="contacts-new-source-group">[\s\S]*?<\/section>/g) ??
    [];

  assert.equal(
    groupedSourceSections.length,
    expectedGroups.length,
    "alternate source methods should be visually grouped by relationship-source type",
  );

  for (const group of expectedGroups) {
    const sourceSection = groupedSourceSections.find((section) =>
      new RegExp(`<h3 class="relationship-name">[^<]*${group.heading}</h3>`).test(
        section,
      ),
    );

    assert.ok(sourceSection, `renders ${group.heading} source group`);

    for (const method of group.methods) {
      assert.match(
        sourceSection,
        new RegExp(`<h3 class="relationship-name">[^<]*${method}</h3>`),
        `${method} should render inside ${group.heading}`,
      );
    }
  }
});

test("/app/contacts/new names route-state checks as customer-facing intake status", async () => {
  const html = await renderContactsNewPage();
  const renderedHtml = html.replace(/<style[\s\S]*?<\/style>/g, " ");

  assert.match(html, /<summary>[^<]*Workspace status<\/summary>/);
  assert.match(html, /<summary>[^<]*Recovery options<\/summary>/);
  assert.match(html, /<h3 class="relationship-name">[^<]*Intake status<\/h3>/);
  assert.match(html, /Open source choices/);
  assert.match(html, /Review waiting intake/);
  assert.match(html, /Open safe intake/);
  assert.doesNotMatch(
    renderedHtml,
    /Source recovery states|Route state checks|Demo recovery checks|Demo workspace status/i,
  );
  assert.doesNotMatch(renderedHtml, /Check the same route|scenario URL/i);
});

test("/app/contacts/new hides shell demo recovery checks from the customer intake route", () => {
  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/contacts/new/page.tsx"),
    "utf8",
  );

  assert.match(
    pageSource,
    /\[aria-label="Secondary demo recovery checks"\]\s*\{\s*display: none;/,
    "the contact intake route should suppress shell demo recovery checks without editing shared shell code",
  );
  assert.match(
    pageSource,
    /\[data-runtime-status="compact"\]\s*\{\s*display: none;/,
    "the contact intake route should suppress the shell demo workspace status without editing shared shell code",
  );
});

test("/app/contacts/new keeps raw ids and implementation codes out of the main flow", async () => {
  const html = await renderContactsNewPage();
  const primaryText = mainFlowText(html);

  assert.doesNotMatch(primaryText, /\b(?:evidence|source|queue):[a-z0-9:_-]+\b/i);
  assert.doesNotMatch(primaryText, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  assert.doesNotMatch(primaryText, /Business card OCR Hana/);
  assert.doesNotMatch(primaryText, /Business card draft Hana/);
  assert.match(primaryText, /Manual note from climate founders dinner/);
  assert.match(primaryText, /Card from robotics investor salon/);
  assert.match(primaryText, /Card details read/);
  assert.match(primaryText, /Card draft ready/);
  assert.match(primaryText, /QR badge from Climate founders dinner/);
  assert.match(
    html,
    /<summary>[^<]*Source record details<\/summary>[\s\S]*<code>evidence:manual-note-kenji<\/code>/,
    "raw evidence ids remain available inside diagnostics",
  );
});

test("/app/contacts/new exports metadata for the browser document title", async (t) => {
  const routeModule = await import("../../app/(app)/app/contacts/new/page");

  assert.match(routeModule.metadata.title, /Contact acquisition \| Orbit/);
  assert.match(
    routeModule.metadata.description,
    /source-backed contact acquisition/i,
  );
  t.diagnostic(
    "app-contacts-new metadata title=\"Contact acquisition | Orbit\" description=source-backed contact acquisition",
  );
});

test("/app/contacts/new previews a contact acquisition action without external side effects", async (t) => {
  const html = await renderContactsNewPage({
    action: "confirm-manual-draft",
  });
  const reloadedHtml = await renderContactsNewPage({
    action: "confirm-manual-draft",
  });

  assert.match(html, /Ready for contact review: Kenji Watanabe/);
  assert.match(html, /Keep this source-backed candidate ready for later contact review/);
  assert.match(html, /Source moment/);
  assert.match(html, /Manual note from climate founders dinner/);
  assert.match(html, /Relationship reason/);
  assert.match(html, /Promised follow-up/);
  assert.match(html, /Will remain unsaved/);
  assert.match(html, /Outside accounts contacted: none/);
  assert.doesNotMatch(mainFlowText(html), /Source evidence:/);
  assert.doesNotMatch(mainFlowText(html), /Contact write executed:/);
  assert.doesNotMatch(mainFlowText(html), /Duplicate lookup executed:/);
  assert.match(
    html,
    /<summary>[^<]*Contact review diagnostics<\/summary>[\s\S]*Source evidence:[\s\S]*Contact write executed:[\s\S]*Duplicate lookup executed:/,
  );
  assert.match(html, /data-task-result="manual-contact-confirmation-preview"/);
  assert.match(
    html,
    /data-action-evidence="manual-contact-confirmation-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="manual-contact-confirmation-local-preview"/,
  );
  assert.match(reloadedHtml, /Outside accounts contacted: none/);

  t.diagnostic(
    [
      "app-contacts-new action=confirm-manual-draft",
      "result=manual-contact-confirmation-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/contacts/new renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No source is ready for review",
      expectedCopy:
        "Start from a manual note, card scan, relationship QR, attendee import, external contact list, email or calendar signal, referral, or merge review.",
      expectedRecoveryLabel: "Return to source choices",
    },
    {
      scenario: "pending",
      expectedTitle: "Source review is waiting",
      expectedCopy:
        "Relationship sources are waiting for review before any contact record can be staged.",
      expectedRecoveryLabel: "Review waiting source",
    },
    {
      scenario: "failure",
      expectedTitle: "Source intake needs attention",
      expectedCopy:
        "The intake desk could not assemble the current source queue, so Orbit keeps every source side-effect-free.",
      expectedRecoveryLabel: "Return to safe intake",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderContactsNewPage({ scenario: state.scenario });
    const primaryText = mainFlowText(html);

    assert.match(html, new RegExp(`<h2>[^<]*${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(primaryText, new RegExp(state.expectedRecoveryLabel));
    assert.match(html, /aria-label="Recovery actions"/);
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(`data-route-state-url="/app/contacts/new\\?scenario=${state.scenario}"`),
    );
    assert.doesNotMatch(primaryText, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
    assert.doesNotMatch(primaryText, /\b(?:evidence|source|queue):[a-z0-9:_-]+\b/i);
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    t.diagnostic(
      `app-contacts-new navigate=/app/contacts/new?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}"`,
    );
  }
});

test("/app/contacts/new evidence APIs return success envelopes", async (t) => {
  const draftsRoute = await import("../../app/api/contact-drafts/route");
  const permissionsRoute = await import("../../app/api/permissions/route");

  const draftsResponse = await draftsRoute.GET(
    new Request("http://localhost/api/contact-drafts"),
  );
  const permissionsResponse = await permissionsRoute.GET(
    new Request("http://localhost/api/permissions"),
  );

  assert.equal(draftsResponse.status, 200);
  assert.equal(permissionsResponse.status, 200);
  assert.equal((await draftsResponse.json()).success, true);
  assert.equal((await permissionsResponse.json()).success, true);
  t.diagnostic(
    "app-contacts-new api-envelope GET /api/contact-drafts=200 success=true GET /api/permissions=200 success=true",
  );
});

test("/app/contacts/new route adapter avoids raw fixtures and documents mock to live replacement", (t) => {
  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/contacts/new/page.tsx"),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /fixtures/i);
  assert.match(pageSource, /createManualContactCreationService/);
  assert.match(pageSource, /createBusinessCardScanOcrService/);
  assert.match(pageSource, /createQrScanConnectService/);
  assert.match(pageSource, /createEventAttendeeImportService/);
  assert.match(pageSource, /createExternalContactsImportService/);
  assert.match(pageSource, /createEmailCalendarSignalService/);
  assert.match(pageSource, /createReferralRecommendationService/);
  assert.match(pageSource, /createDuplicateMergeService/);
  assert.match(pageSource, /StateView/);

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
    "route state checks",
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
    "app-contacts-new live-doc evidence summary: Live files: features/acquisition/* contracts and features/permissions/contract.ts; Switch: service factory resolution via shared/services/module-mode.ts and shared/services/capability-registry.ts; Env and permissions: address book, Google Contacts, Gmail, Calendar, Microsoft Graph, camera, upload, event roster, referral consent; Privacy and provenance: source type, source label, evidence ids, captured fields, confirmation state, data-action-evidence, data-side-effects=none; Replacement tests: page route, live-mode service contracts, API envelopes, route state checks, privacy regressions",
  );
});
