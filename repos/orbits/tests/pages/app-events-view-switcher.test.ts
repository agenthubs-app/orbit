import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import type { EventDTO } from "../../shared/domain/contracts";
import { OrbitRealExploreClient } from "../../app/(app)/app/events/orbit-real-explore-client";
import { getOrbitLandingEventView, type OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";

const appRoot = path.join(process.cwd(), "app/(app)/app/events");

test("event view switcher owns one outline and exposes its selected state", () => {
  const component = fs.readFileSync(
    path.join(appRoot, "orbit-real-explore-client.tsx"),
    "utf8",
  );

  assert.match(component, /className="orbit-event-view-switcher"/u);
  assert.match(component, /aria-pressed=\{effMode === "modules"\}/u);
  assert.match(component, /aria-pressed=\{effMode === "map"\}/u);
  assert.match(component, /\.orbit-event-view-switcher > \.orbit-event-view-option\s*\{[\s\S]*?border-color: transparent;/u);
  assert.match(component, /\.orbit-event-view-switcher > \.orbit-event-view-option:focus-visible\s*\{[\s\S]*?outline-offset: -3px;/u);
});

function exploreEvent(participantCount: number | null): OrbitLandingEventView {
  return getOrbitLandingEventView({
    event: {
      endsAt: "2030-01-01T11:00:00.000Z",
      evidenceIds: ["evidence:explore-unknown-count"],
      id: "event:explore-unknown-count",
      location: "Tokyo",
      name: "Unknown count explore fixture",
      organizerId: "actor:explore-fixture",
      source: {
        id: "fixture:explore-unknown-count",
        label: "local fixture",
        type: "manual",
      },
      startsAt: "2030-01-01T09:00:00.000Z",
    } satisfies EventDTO,
    evidenceSummary: "Local explore fixture",
    generatedAt: "2029-12-01T00:00:00.000Z",
    participantCount,
    routeCode: "EXPLORE-UNKNOWN-COUNT",
  });
}

function exploreTree(event: OrbitLandingEventView) {
  const router = {
    back: () => undefined,
    forward: () => undefined,
    prefetch: async () => undefined,
    push: () => undefined,
    refresh: () => undefined,
    replace: () => undefined,
  };
  return createElement(
    AppRouterContext.Provider,
    { value: router },
    createElement(
      PathnameContext.Provider,
      { value: "/app/events" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(OrbitRealExploreClient, {
          registrationAvailabilityByEventId: {},
          viewModel: {
            account: { fullName: "Orbit" },
            connections: [],
            events: [event],
          },
        }),
      ),
    ),
  );
}

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "children" in value) {
    return textContent((value as { children?: unknown }).children);
  }
  return "";
}

test("event cards omit unknown participant counts in modules, map, and mobile views", () => {
  const unknownRenderer = createRenderer(exploreTree(exploreEvent(null)));
  try {
    assert.match(textContent(unknownRenderer.toJSON()), /Unknown count explore fixture/u);
    assert.doesNotMatch(
      textContent(unknownRenderer.root.findByProps({ className: "card card-hover orbit-event-module-card" })),
      /null\s+(registered|people|人)|undefined/u,
    );
    assert.doesNotMatch(
      textContent(unknownRenderer.root.findByProps({ className: "card card-hover" })),
      /null\s+(registered|people|人)|undefined/u,
    );
    const unknownMapButton = unknownRenderer.root.findAllByProps({ "aria-pressed": false }).find(
      (button) => textContent(button).includes("地图"),
    );
    assert.ok(unknownMapButton, "the fixture should expose the map view");
    act(() => unknownMapButton.props.onClick());
    const unknownMapCards = unknownRenderer.root.findAllByProps({ "data-orbit-map-event-card": true });
    assert.ok(unknownMapCards.length > 0, "the map view should render event cards");
    for (const mapCard of unknownMapCards) {
      assert.doesNotMatch(textContent(mapCard), /null\s+(people|人)|undefined/u);
    }
  } finally {
    act(() => unknownRenderer.unmount());
  }

  const knownRenderer = createRenderer(exploreTree(exploreEvent(7)));
  try {
    assert.match(
      textContent(knownRenderer.root.findByProps({ className: "card card-hover orbit-event-module-card" })),
      /7 人已报名/u,
    );
    assert.match(
      textContent(knownRenderer.root.findByProps({ className: "card card-hover" })),
      /7 人/u,
    );
    const knownMapButton = knownRenderer.root.findAllByProps({ "aria-pressed": false }).find(
      (button) => textContent(button).includes("地图"),
    );
    assert.ok(knownMapButton, "the fixture should expose the map view");
    act(() => knownMapButton.props.onClick());
    const knownMapCards = knownRenderer.root.findAllByProps({ "data-orbit-map-event-card": true });
    assert.ok(knownMapCards.length > 0, "the map view should render event cards");
    for (const mapCard of knownMapCards) {
      assert.match(textContent(mapCard), /7 人/u);
    }
  } finally {
    act(() => knownRenderer.unmount());
  }
});
