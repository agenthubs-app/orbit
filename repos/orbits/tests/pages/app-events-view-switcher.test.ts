import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement, type ReactElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import type { EventDTO } from "../../shared/domain/contracts";
import { OrbitRealExploreClient } from "../../app/(app)/app/events/orbit-real-explore-client";
import { OrbitLanguageProvider, useOrbitLanguage } from "../../app/(app)/app/orbit-language-context";
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

function interactiveEvent(
  overrides: Partial<EventDTO> = {},
  routeCode = "INTERACTIVE-EVENT",
): OrbitLandingEventView {
  const event = {
    endsAt: "2030-01-01T11:00:00.000Z",
    evidenceIds: ["evidence:interactive"],
    id: "event:interactive",
    location: "Tokyo",
    name: "Community exchange",
    organizerId: "actor:interactive-fixture",
    source: {
      id: "fixture:interactive",
      label: "local fixture",
      type: "manual",
    },
    startsAt: "2030-01-01T09:00:00.000Z",
    ...overrides,
  } satisfies EventDTO;
  return getOrbitLandingEventView({
    event,
    evidenceSummary: "Local interactive fixture",
    generatedAt: "2029-12-01T00:00:00.000Z",
    participantCount: 7,
    routeCode,
  });
}

function interactiveTree(
  events: readonly OrbitLandingEventView[],
  input: {
    router?: {
      back: () => void;
      forward: () => void;
      prefetch: () => Promise<void>;
      push: () => void;
      refresh: () => void;
      replace: (href: string, options?: { scroll?: boolean }) => void;
    };
    search?: string;
  } = {
    router: {
      back: () => undefined,
      forward: () => undefined,
      prefetch: async () => undefined,
      push: () => undefined,
      refresh: () => undefined,
      replace: () => undefined,
    },
  },
) {
  return createElement(
    AppRouterContext.Provider,
    { value: input.router },
    createElement(
      PathnameContext.Provider,
      { value: "/app/events" },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams(input.search ?? "") },
        createElement(OrbitRealExploreClient, {
          registrationAvailabilityByEventId: {},
          viewModel: {
            account: { fullName: "Orbit" },
            connections: [],
            events: [...events],
          },
        }),
      ),
    ),
  );
}

function moduleCardNames(renderer: ReturnType<typeof createRenderer>): string[] {
  return renderer.root
    .findAllByProps({ className: "card card-hover orbit-event-module-card" })
    .map((card) => textContent(card.findByType("h2")));
}

function mobileExplore(renderer: ReturnType<typeof createRenderer>) {
  return renderer.root.findByProps({ className: "orbit-mobile-only" });
}

test("event search matches the visible topic label while retaining name, code, and theme includes", () => {
  const topic = interactiveEvent({
    id: "event:topic-search",
    name: "Networking exchange",
  }, "TOPIC-SEARCH");
  const topicView = { ...topic, industry: "Relationship building", tags: [] };
  const name = {
    ...interactiveEvent({
    id: "event:name-search",
    name: "Exact name fixture",
    }, "NAME-SEARCH"),
    industry: "Finance",
    tags: [],
  };
  const code = {
    ...interactiveEvent({
    id: "event:code-search",
    name: "Code fixture",
    }, "CODE-SEARCH"),
    industry: "Finance",
    tags: [],
  };
  const theme = {
    ...interactiveEvent({
      id: "event:theme-search",
      name: "Theme fixture",
    }, "THEME-SEARCH"),
    industry: "Finance",
    tags: [],
    theme: "theme-only",
  };
  const cases: readonly [string, string, readonly OrbitLandingEventView[]][] = [
    ["人脉拓展", topicView.name, [topicView]],
    ["Exact name", name.name, [name]],
    ["CODE-SEARCH", code.name, [code]],
    ["theme-only", theme.name, [theme]],
  ];

  for (const [query, expectedName, events] of cases) {
    const renderer = createRenderer(interactiveTree(events));
    try {
      const input = renderer.root.findAllByType("input")[0];
      assert.ok(input);
      if (query === "人脉拓展") {
        assert.ok(renderer.root.findAllByType("button").some((button) => textContent(button) === query));
      }
      act(() => input.props.onChange({ target: { value: query } }));
      assert.deepEqual(moduleCardNames(renderer), [expectedName], query);
    } finally {
      act(() => renderer.unmount());
    }
  }

  const caseSensitiveRenderer = createRenderer(interactiveTree([name]));
  try {
    const input = caseSensitiveRenderer.root.findAllByType("input")[0];
    assert.ok(input);
    act(() => input.props.onChange({ target: { value: "exact name" } }));
    assert.deepEqual(moduleCardNames(caseSensitiveRenderer), []);
  } finally {
    act(() => caseSensitiveRenderer.unmount());
  }
});

test("mobile status and topic filters have separate labeled scrollers and pressed state", () => {
  let renderer!: ReturnType<typeof createRenderer>;
  act(() => {
    renderer = createRenderer(interactiveTree([{
      ...interactiveEvent({ id: "event:filter-topic", name: "Filter fixture" }),
      industry: "Relationship building",
      tags: [],
    }]));
  });
  try {
    const mobile = mobileExplore(renderer);
    const statusGroup = mobile.findByProps({ role: "group", "aria-label": "活动状态" });
    const topicGroup = mobile.findByProps({ role: "group", "aria-label": "活动话题" });
    const statusScroller = statusGroup.findByProps({ className: "scroll noscroll orbit-chip-scroller" });
    const topicScroller = topicGroup.findByProps({ className: "scroll noscroll orbit-chip-scroller" });
    assert.match(textContent(statusGroup), /状态/u);
    assert.match(textContent(topicGroup), /话题/u);
    assert.doesNotMatch(textContent(statusScroller), /状态/u);
    assert.doesNotMatch(textContent(topicScroller), /话题/u);
    const allStatus = statusGroup.findAllByType("button").find(
      (button) => textContent(button) === "全部",
    );
    const upcoming = statusGroup.findAllByType("button").find(
      (button) => textContent(button) === "即将开始",
    );
    const topic = topicGroup.findAllByType("button").find(
      (button) => textContent(button) === "人脉拓展",
    );
    assert.ok(allStatus);
    assert.ok(upcoming);
    assert.ok(topic);
    assert.equal(allStatus.props["aria-pressed"], true);
    assert.equal(upcoming.props["aria-pressed"], false);
    assert.equal(topic.props["aria-pressed"], false);
    for (const button of [allStatus, upcoming, topic]) {
      assert.equal(button.props.style.minHeight, "var(--tap-min, 44px)");
      assert.equal(button.props.style.minWidth, "var(--tap-min, 44px)");
    }

    act(() => upcoming.props.onClick());
    assert.equal(
      mobileExplore(renderer)
        .findByProps({ role: "group", "aria-label": "活动状态" })
        .findAllByType("button")
        .find((button) => textContent(button) === "即将开始")?.props["aria-pressed"],
      true,
    );
    assert.equal(
      mobileExplore(renderer)
        .findByProps({ role: "group", "aria-label": "活动状态" })
        .findAllByType("button")
        .find((button) => textContent(button) === "全部")?.props["aria-pressed"],
      false,
    );
    act(() => topic.props.onClick());
    assert.equal(
      mobileExplore(renderer)
        .findByProps({ role: "group", "aria-label": "活动话题" })
        .findAllByType("button")
        .find((button) => textContent(button) === "人脉拓展")?.props["aria-pressed"],
      true,
    );
  } finally {
    act(() => renderer.unmount());
  }
});

test("desktop status and topic filters expose independent groups and pressed state", () => {
  let renderer!: ReturnType<typeof createRenderer>;
  act(() => {
    renderer = createRenderer(interactiveTree([{
      ...interactiveEvent({ id: "event:desktop-filter", name: "Desktop filter fixture" }),
      industry: "Relationship building",
      tags: [],
    }]));
  });
  try {
    const desktop = renderer.root.findByProps({ className: "orbit-desktop-only" });
    const statusGroup = desktop.findByProps({ role: "group", "aria-label": "活动状态" });
    const topicGroup = desktop.findByProps({ role: "group", "aria-label": "活动话题" });
    const allStatus = statusGroup.findAllByType("button").find((button) => textContent(button) === "全部");
    const upcoming = statusGroup.findAllByType("button").find((button) => textContent(button) === "即将开始");
    const topic = topicGroup.findAllByType("button").find((button) => textContent(button) === "人脉拓展");
    assert.ok(allStatus);
    assert.ok(upcoming);
    assert.ok(topic);
    assert.equal(allStatus.props["aria-pressed"], true);
    assert.equal(upcoming.props["aria-pressed"], false);
    assert.equal(topic.props["aria-pressed"], false);
    act(() => upcoming.props.onClick());
    assert.equal(
      renderer.root
        .findByProps({ className: "orbit-desktop-only" })
        .findByProps({ role: "group", "aria-label": "活动状态" })
        .findAllByType("button")
        .find((button) => textContent(button) === "即将开始")?.props["aria-pressed"],
      true,
    );
    assert.equal(
      renderer.root
        .findByProps({ className: "orbit-desktop-only" })
        .findByProps({ role: "group", "aria-label": "活动状态" })
        .findAllByType("button")
        .find((button) => textContent(button) === "全部")?.props["aria-pressed"],
      false,
    );
    act(() => topic.props.onClick());
    assert.equal(
      renderer.root
        .findByProps({ className: "orbit-desktop-only" })
        .findByProps({ role: "group", "aria-label": "活动话题" })
        .findAllByType("button")
        .find((button) => textContent(button) === "人脉拓展")?.props["aria-pressed"],
      true,
    );
  } finally {
    act(() => renderer.unmount());
  }
});

test("clearing a no-result search restores the full event catalogue", () => {
  const routerCalls: string[] = [];
  const renderer = createRenderer(interactiveTree([
    interactiveEvent({ id: "event:clear-a", name: "Clear A" }),
    interactiveEvent({ id: "event:clear-b", name: "Clear B" }),
  ], {
    router: {
      back: () => undefined,
      forward: () => undefined,
      prefetch: async () => undefined,
      push: () => undefined,
      refresh: () => undefined,
      replace: (href) => routerCalls.push(href),
    },
  }));
  try {
    const input = renderer.root.findAllByType("input")[0];
    assert.ok(input);
    act(() => input.props.onChange({ target: { value: "no-such-event" } }));
    assert.equal(moduleCardNames(renderer).length, 0);
    const clear = renderer.root.findAllByType("button").find(
      (button) => textContent(button) === "清除筛选",
    );
    assert.ok(clear);
    act(() => clear.props.onClick());
    assert.deepEqual(moduleCardNames(renderer), ["Clear A", "Clear B"]);
    assert.equal(routerCalls.at(-1), "/app/events");
  } finally {
    act(() => renderer.unmount());
  }
});

test("mobile view controls expose content and map selection and map copy states its schematic nature", () => {
  const first = interactiveEvent({ id: "event:map-first", name: "Map First" });
  const second = interactiveEvent({ id: "event:map-second", name: "Map Second" });
  const renderer = createRenderer(interactiveTree([first, second]));
  try {
    const mobile = mobileExplore(renderer);
    const viewGroup = mobile.findByProps({ role: "group", "aria-label": "活动视图" });
    const content = viewGroup.findAllByType("button").find(
      (button) => textContent(button) === "内容",
    );
    const map = viewGroup.findAllByType("button").find(
      (button) => textContent(button) === "地图",
    );
    assert.ok(content);
    assert.ok(map);
    assert.equal(content.props["aria-pressed"], true);
    assert.equal(map.props["aria-pressed"], false);

    act(() => map.props.onClick());
    assert.equal(content.props["aria-pressed"], false);
    assert.equal(map.props["aria-pressed"], true);
    assert.equal(content.props.style.minHeight, "var(--tap-min, 44px)");
    assert.equal(content.props.style.minWidth, "var(--tap-min, 44px)");
    assert.equal(map.props.style.minHeight, "var(--tap-min, 44px)");
    assert.equal(map.props.style.minWidth, "var(--tap-min, 44px)");
    assert.match(textContent(mobile), /活动分布示意（非实际位置）/u);
    assert.match(textContent(renderer.root), /2 场活动/u);

    const marker = mobile.findAllByType("button").find(
      (button) => button.props["aria-label"] === "查看活动：Map Second",
    );
    assert.ok(marker);
    act(() => marker.props.onClick());
    assert.ok(
      mobile
        .findAllByProps({ "data-orbit-map-event-card": true })
        .some((card) => textContent(card).includes("Map Second")),
    );
    assert.ok(
      mobile
        .findAllByProps({ "data-orbit-map-event-card": true })
        .some((card) => card.findAllByType("a").length > 0),
    );
  } finally {
    act(() => renderer.unmount());
  }
});

function LanguageCapture({
  children,
  onReady,
}: {
  children: ReactElement;
  onReady: (setLanguage: (next: "zh" | "en" | "ja") => void) => void;
}) {
  onReady(useOrbitLanguage().setLanguage);
  return children;
}

function languageTree(
  events: readonly OrbitLandingEventView[],
  language: "zh" | "en" | "ja",
  onReady: (setLanguage: (next: "zh" | "en" | "ja") => void) => void,
) {
  return createElement(
    OrbitLanguageProvider,
    {
      initialLanguage: language,
      children: createElement(
        LanguageCapture,
        {
          children: interactiveTree(events),
          onReady,
        },
      ),
    },
  );
}

function installBrowserGlobals() {
  const previous = new Map<string, PropertyDescriptor | undefined>([
    ["document", Object.getOwnPropertyDescriptor(globalThis, "document")],
    ["localStorage", Object.getOwnPropertyDescriptor(globalThis, "localStorage")],
    ["window", Object.getOwnPropertyDescriptor(globalThis, "window")],
  ]);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "", documentElement: { lang: "" } },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { setItem: () => undefined },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      OrbitI18n: { setLang: () => undefined },
      location: { hash: "", href: "/app/events", pathname: "/app/events", search: "" },
    },
  });
  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  };
}

test("topic search recomputes for language changes while preserving query state", () => {
  const topic = {
    ...interactiveEvent({ id: "event:language-topic", name: "Networking exchange" }),
    industry: "Relationship building",
    tags: [],
  };
  const restoreGlobals = installBrowserGlobals();
  let setLanguage: ((next: "zh" | "en" | "ja") => void) | undefined;
  const renderer = createRenderer(languageTree([topic], "zh", (setter) => {
    setLanguage = setter;
  }));
  try {
    const input = renderer.root.findAllByType("input")[0];
    assert.ok(input);
    act(() => input.props.onChange({ target: { value: "人脉拓展" } }));
    assert.deepEqual(moduleCardNames(renderer), [topic.name]);
    assert.ok(setLanguage);
    act(() => setLanguage!("en"));
    assert.equal(moduleCardNames(renderer).length, 0);
    assert.ok(renderer.root.findAllByProps({ "data-orbit-events-empty": true }).length > 0);
    act(() => setLanguage!("zh"));
    assert.deepEqual(moduleCardNames(renderer), [topic.name]);
  } finally {
    act(() => renderer.unmount());
    restoreGlobals();
  }
});
