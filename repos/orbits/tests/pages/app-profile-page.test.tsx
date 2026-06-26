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

async function renderProfilePage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/profile/page")).default;
  const element = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(element);
}

test("/app/profile renders profile composition from approved mock services", async () => {
  const html = await renderProfilePage();

  assert.match(html, /<h2>Ari Lane profile<\/h2>/);
  assert.match(
    html,
    /Every field below belongs to Ari Lane\. Source-backed identity, market, and relationship goals are usable now; preferred intro channels and suggested changes stay blocked until Ari Lane confirms the save\./,
  );
  assert.match(html, /What can guide follow-up now/);
  assert.match(
    html,
    /Name, headline, Tokyo market, and relationship goal are sourced and ready to inform relationship decisions\./,
  );
  assert.match(html, /What is blocked until confirmation/);
  assert.match(
    html,
    /Preferred intro channels and suggested profile changes stay in review until Ari Lane confirms them\./,
  );
  assert.match(html, /Outside access/);
  assert.match(
    html,
    /No outside account, storage, card scanning, writing, email, calendar, reminder, or message tool has been contacted\./,
  );
  assert.match(html, /orbit-app-shell:has\(\.app-profile-route\)/);
  assert.match(html, /Ari Lane/);
  assert.match(html, /Founder building a relationship operating system/);
  assert.match(html, /Resume draft ready/);
  assert.match(html, /Three sourced profile suggestions are waiting for Ari Lane review./);
  assert.match(html, /Next field: preferred intro channels/);
  assert.match(html, /Profile owner/);
  assert.match(html, /Review status: ready for confirmation/);
  assert.match(html, /Profile outcome/);
  assert.match(
    html,
    /Confirm Ari Lane(?:'|&#x27;)s intro preference/,
  );
  assert.match(html, /name="preferredIntroChannels"[^>]+value="warm intro"/);
  assert.match(html, /Confirm intro preference/);
  assert.doesNotMatch(html, /Confirm safe action/);
  assert.match(html, /Profile readiness checks/);
  assert.match(html, /href="\/app\/profile\?scenario=empty"/);
  assert.match(html, /href="\/app\/profile\?scenario=pending"/);
  assert.match(html, /href="\/app\/profile\?scenario=failure"/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*(Document extraction|Profile update review|Queued field|Queued value|Preview timestamp)[^<]*</i);
  assert.match(html, /data-state-boundary="app-profile-success"/);
});

test("/app/profile previews a profile update action without external side effects", async (t) => {
  const html = await renderProfilePage({ action: "complete-profile-field" });
  const selectedChannelHtml = await renderProfilePage({
    action: "complete-profile-field",
    preferredIntroChannels: "warm intro",
  });
  const reloadedHtml = await renderProfilePage({
    action: "complete-profile-field",
  });
  const repeatedActionHtml = await renderProfilePage({
    action: ["complete-profile-field", "complete-profile-field"],
  });

  assert.match(html, /Ready for confirmation: Ari Lane prefers warm intro and event follow-up/);
  assert.match(html, /The review panel is prepared for a confirmation step./);
  assert.match(html, /Profile save still requires explicit confirmation./);
  assert.match(html, /warm intro, event follow-up/);
  assert.match(html, /Outside tools contacted: none/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.match(html, /data-task-result="preferred-intro-channels-preview"/);
  assert.match(
    html,
    /data-action-evidence="complete-profile-field-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    selectedChannelHtml,
    /Ready for confirmation: Ari Lane prefers warm intro<\/strong>/,
  );
  assert.match(selectedChannelHtml, /Source evidence: evidence:profile-editor-put-request/);
  assert.match(selectedChannelHtml, /Outside tools contacted: none/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="complete-profile-field-local-preview"/,
  );
  assert.match(reloadedHtml, /Outside tools contacted: none/);
  assert.match(
    repeatedActionHtml,
    /data-action-evidence="complete-profile-field-local-preview"/,
  );
  assert.match(repeatedActionHtml, /Outside tools contacted: none/);

  t.diagnostic(
    [
      "app-profile action=complete-profile-field",
      "result=complete-profile-field-local-preview",
      "repeat-render=stable",
      "reload-render=stable",
      "duplicate-action=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/profile renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "Profile readiness is empty",
      expectedCopy:
        "Open profile setup to add reviewed profile context.",
      expectedLabel: "Open profile setup",
    },
    {
      scenario: "pending",
      expectedTitle: "Profile readiness is loading",
      expectedCopy:
        "Review held profile sources while manual edits, business-card draft, and suggested changes stay held.",
      expectedLabel: "Review held profile sources",
    },
    {
      scenario: "failure",
      expectedTitle: "Profile readiness could not load",
      expectedCopy:
        "Return to profile source review without accepting suggestions or changing Ari(?:'|&#x27;)s profile.",
      expectedLabel: "Return to profile source review",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderProfilePage({ scenario: state.scenario });

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(
      html,
      new RegExp(`aria-label="${state.expectedLabel}"[^>]*>${state.expectedLabel}</(?:a|button)>`),
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(`data-route-state-url="/app/profile\\?scenario=${state.scenario}"`),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    t.diagnostic(
      `app-profile navigate=/app/profile?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" copy="${state.expectedCopy}"`,
    );
  }
});

test("/app/profile evidence APIs return success envelopes", async (t) => {
  const profileRoute = await import("../../app/api/profile/route");
  const suggestionsRoute = await import(
    "../../app/api/profile/update-suggestions/route"
  );

  const profileResponse = await profileRoute.GET(
    new Request("http://localhost/api/profile"),
  );
  const suggestionsResponse = await suggestionsRoute.GET(
    new Request("http://localhost/api/profile/update-suggestions"),
  );

  assert.equal(profileResponse.status, 200);
  assert.equal(suggestionsResponse.status, 200);
  assert.equal((await profileResponse.json()).success, true);
  assert.equal((await suggestionsResponse.json()).success, true);
  t.diagnostic(
    "app-profile api-envelope GET /api/profile=200 success=true GET /api/profile/update-suggestions=200 success=true",
  );
});

test("/app/profile route adapter avoids raw fixtures and documents mock to live replacement", (t) => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-command-center.tsx",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /fixtures/i);
  assert.match(adapterSource, /createProfileService/);
  assert.match(adapterSource, /createProfileDocumentExtractionService/);
  assert.match(adapterSource, /createProfileSignalReviewQueueService/);
  assert.match(adapterSource, /StateView/);

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

  t.diagnostic(
    "app-profile live-doc covers live service/provider files; switch mechanism; required env vars or permissions; privacy/provenance constraints; replacement tests; route state checks; data-action-evidence",
  );
});

test("/app/profile page wrapper delegates to AppProfileCommandCenter without direct service imports", () => {
  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/profile/page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /AppProfileCommandCenter/);
  assert.match(
    pageSource,
    /<AppProfileCommandCenter searchParams=\{searchParams\} \/>/,
  );
  assert.doesNotMatch(
    pageSource,
    /from\s+["'][^"']*(?:features|shared\/services|shared\/api|shared\/domain)\//,
  );
});
