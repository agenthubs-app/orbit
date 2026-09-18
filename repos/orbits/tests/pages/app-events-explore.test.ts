/**
 * /app/events（Orbit_0918 discover + 我的活动）行为契约测试。
 *
 * 前身为 app-events-view-switcher.test.ts。2026-09-18 设计替换（对照
 * docs/designs/Orbit_0918/Events.dc.html isList/isDiscover/isMine）后：
 * - 地图视图与 modules/map 切换器退役（设计无地图屏）；
 * - 话题 chips 退役，话题匹配由搜索框承担（matchesExploreFilters 不变）；
 * - 桌面/移动双树合并为单一响应式树，断言直接打在根树上；
 * - 我的活动 = scope=registered，渲染时间线横卡（报名成功→活动现场→会后回顾）。
 * 人数未知≠0、搜索语义、清除筛选恢复目录、语言切换重算等旧契约全部保留。
 */
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

test("the map view and view switcher are retired by the Orbit_0918 design", () => {
  const component = fs.readFileSync(
    path.join(appRoot, "orbit-real-explore-client.tsx"),
    "utf8",
  );

  assert.doesNotMatch(component, /MapCanvas/u);
  assert.doesNotMatch(component, /orbit-event-view-switcher/u);
  assert.doesNotMatch(component, /orbit-mobile-only/u);
  assert.doesNotMatch(component, /orbit-desktop-only/u);
});

test("the Orbit_0918 discover header, tabs, and stats are present", () => {
  const component = fs.readFileSync(
    path.join(appRoot, "orbit-real-explore-client.tsx"),
    "utf8",
  );

  assert.match(component, /发现活动/u);
  assert.match(component, /我的活动/u);
  assert.match(component, /主办管理/u);
  assert.match(component, /创建活动/u);
  assert.match(component, /orbit-explore-stats/u);
  assert.match(component, /orbit-event-mine-timeline/u);
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

test("event cards omit unknown participant counts and show known counts", () => {
  const unknownRenderer = createRenderer(exploreTree(exploreEvent(null)));
  try {
    assert.match(textContent(unknownRenderer.toJSON()), /Unknown count explore fixture/u);
    assert.doesNotMatch(
      textContent(unknownRenderer.root.findByProps({ className: "card card-hover orbit-event-module-card" })),
      /null\s+(registered|people|人)|undefined/u,
    );
  } finally {
    act(() => unknownRenderer.unmount());
  }

  const knownRenderer = createRenderer(exploreTree(exploreEvent(7)));
  try {
    assert.match(
      textContent(knownRenderer.root.findByProps({ className: "card card-hover orbit-event-module-card" })),
      /7 人已报名/u,
    );
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

test("status filters expose a labeled segmented group with pressed state", () => {
  let renderer!: ReturnType<typeof createRenderer>;
  act(() => {
    renderer = createRenderer(interactiveTree([interactiveEvent({ id: "event:filter", name: "Filter fixture" })]));
  });
  try {
    const statusGroup = renderer.root.findByProps({ role: "group", "aria-label": "活动状态" });
    const allStatus = statusGroup.findAllByType("button").find((button) => textContent(button) === "全部");
    const upcoming = statusGroup.findAllByType("button").find((button) => textContent(button) === "即将开始");
    assert.ok(allStatus);
    assert.ok(upcoming);
    assert.equal(allStatus.props["aria-pressed"], true);
    assert.equal(upcoming.props["aria-pressed"], false);
    act(() => upcoming.props.onClick());
    assert.equal(
      renderer.root
        .findByProps({ role: "group", "aria-label": "活动状态" })
        .findAllByType("button")
        .find((button) => textContent(button) === "即将开始")?.props["aria-pressed"],
      true,
    );
    assert.equal(
      renderer.root
        .findByProps({ role: "group", "aria-label": "活动状态" })
        .findAllByType("button")
        .find((button) => textContent(button) === "全部")?.props["aria-pressed"],
      false,
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

test("scope=registered renders the 我的活动 timeline layout", () => {
  const renderer = createRenderer(
    createElement(
      AppRouterContext.Provider,
      {
        value: {
          back: () => undefined,
          forward: () => undefined,
          prefetch: async () => undefined,
          push: () => undefined,
          refresh: () => undefined,
          replace: () => undefined,
        },
      },
      createElement(
        PathnameContext.Provider,
        { value: "/app/events" },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams("scope=registered") },
          createElement(OrbitRealExploreClient, {
            initialScope: "registered",
            registrationAvailabilityByEventId: {},
            viewModel: {
              account: { fullName: "Orbit" },
              connections: [],
              events: [
                {
                  ...interactiveEvent({ id: "event:mine", name: "Mine fixture" }),
                  stats: { attendees: [], authed: true, count: 7, youRsvped: true },
                  youRsvped: true,
                },
              ],
            },
          }),
        ),
      ),
    ),
  );
  try {
    assert.match(textContent(renderer.toJSON()), /我的活动/u);
    const mineCards = renderer.root.findAllByProps({ className: "card card-hover orbit-event-mine-card" });
    assert.equal(mineCards.length, 1);
    assert.match(textContent(mineCards[0]), /Mine fixture/u);
    assert.match(textContent(mineCards[0]), /报名成功/u);
    assert.match(textContent(mineCards[0]), /活动现场/u);
    assert.match(textContent(mineCards[0]), /会后回顾/u);
    // 发现网格不出现，时间线横卡取而代之。
    assert.equal(renderer.root.findAllByProps({ className: "card card-hover orbit-event-module-card" }).length, 0);
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
