import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EventDTO } from "../../shared/domain/contracts";
import { getOrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";
import { OrbitRealHome } from "../../app/(app)/app/home/orbit-real-home";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/home/events renders personal events as content modules with image media", () => {
  const homeSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(homeSource, /getDemoEventSceneAsset/u);
  assert.match(homeSource, /function eventImageUrl/u);
  assert.match(homeSource, /orbit-account-event-module-card/u);
  assert.match(homeSource, /className="orbit-account-event-module-cover"/u);
  assert.match(homeSource, /className="orbit-account-event-module-body"/u);
  assert.match(homeSource, /className="orbit-account-event-module-meta"/u);
  assert.match(homeSource, /className="orbit-account-event-module-foot"/u);
  assert.match(homeSource, /data-demo-visual-asset-id/u);
  assert.match(homeSource, /imageUrl=\{eventImageUrl\(event\)\}/u);
  assert.doesNotMatch(homeSource, /orbit-account-event-poster-card/u);
  assert.doesNotMatch(homeSource, /orbit-account-event-poster-list/u);
});

test("/app/home/events applies the same event presentation layer as /app/events", () => {
  const pageSource = source("app/(app)/app/home/events/page.tsx");

  assert.match(pageSource, /presentOrbitEvents/u);
  assert.match(pageSource, /events:\s*presentOrbitEvents\(routeModel\.home\.events,\s*language \?\? "zh"\)/u);
});

test("active and ended Home event cards preserve the actor-owned event identity when entering the live screen", () => {
  const homeSource = source("app/(app)/app/home/orbit-real-home.tsx");

  assert.match(
    homeSource,
    /import \{ partyHrefForEvent \} from "\.\.\/orbit-product-href"/u,
  );
  assert.match(
    homeSource,
    /function enterEvent\(eventId: string\) \{\s*orbitNavigate\(partyHrefForEvent\(eventId\)\);\s*\}/u,
  );
  assert.equal(
    homeSource.match(/onClick=\{\(\) => enterEvent\(event\.id\)\}/gu)?.length,
    3,
  );
  assert.doesNotMatch(homeSource, /orbitNavigate\("\/party"\)/u);
});

test("Home event cards hide an unknown participant count", () => {
  const event = getOrbitLandingEventView({
    event: {
      endsAt: "2030-01-01T11:00:00.000Z",
      evidenceIds: ["evidence:home-unknown-count"],
      id: "event:home-unknown-count",
      location: "Tokyo",
      name: "Unknown count home fixture",
      organizerId: "actor:home-fixture",
      source: {
        id: "fixture:home-unknown-count",
        label: "local fixture",
        type: "manual",
      },
      startsAt: "2030-01-01T09:00:00.000Z",
    } satisfies EventDTO,
    evidenceSummary: "Local home fixture",
    generatedAt: "2029-12-01T00:00:00.000Z",
    participantCount: null,
    routeCode: "HOME-UNKNOWN-COUNT",
  });
  const html = renderToStaticMarkup(
    createElement(OrbitRealHome, {
      mode: "events",
      viewModel: {
        account: { fullName: "Orbit", headline: "", initial: "O" },
        events: [event],
        stats: { events: 1, inProgress: 0, people: 0 },
      },
    }),
  );

  assert.doesNotMatch(html, /null\s*人已报名|undefined\s*人已报名/u);
  assert.doesNotMatch(html, /人已报名/u);

  for (const participantCount of [0, 7]) {
    const knownHtml = renderToStaticMarkup(
      createElement(OrbitRealHome, {
        mode: "events",
        viewModel: {
          account: { fullName: "Orbit", headline: "", initial: "O" },
          events: [{ ...event, participantCount }],
          stats: { events: 1, inProgress: 0, people: 0 },
        },
      }),
    );

    assert.match(knownHtml, /Unknown count home fixture/u);
    assert.match(knownHtml, new RegExp(`${participantCount} 人已报名`, "u"));
  }
});
