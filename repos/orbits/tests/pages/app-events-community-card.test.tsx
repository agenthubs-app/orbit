/**
 * W0003 SC-01 / SC-02：活动页置顶「加入 iOrbit 用户社群」卡片。
 *
 * - 有活动 / 无活动 / 我的活动页签都在最上面；标「免费」「长期有效」；占位素材逐项标「占位」；
 * - 社群不是活动：不进活动网格、不改变真实活动的内容与排序；
 * - 「我已加入」PUT /api/community/membership → 「✓ 已加入」；服务端传入已加入时首帧即是已加入；
 * - 复制微信号：剪贴板成功提示已复制，失败回退为选中文本。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import type { EventDTO } from "../../shared/domain/contracts";
import { CommunityCard } from "../../app/(app)/app/events/events-0918/community-card";
import { EventsList } from "../../app/(app)/app/events/events-0918/events-list";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { getOrbitLandingEventView, type OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";
import { COMMUNITY_CONFIG } from "../../features/community/config";

function event(id: string, name: string, startsAt: string): OrbitLandingEventView {
  return getOrbitLandingEventView({
    event: {
      endsAt: "2030-12-31T11:00:00.000Z",
      evidenceIds: [`evidence:${id}`],
      id,
      location: "Tokyo",
      name,
      organizerId: "actor:community-fixture",
      source: { id: `fixture:${id}`, label: "local fixture", type: "manual" },
      startsAt,
    } satisfies EventDTO,
    evidenceSummary: "Local community fixture",
    generatedAt: "2029-12-01T00:00:00.000Z",
    participantCount: null,
    routeCode: id.toUpperCase(),
  });
}

const EVENTS = [
  event("ev-b", "B later event", "2030-03-01T09:00:00.000Z"),
  event("ev-a", "A earlier event", "2030-01-01T09:00:00.000Z"),
];

function tree(
  events: readonly OrbitLandingEventView[],
  community?: { joined: boolean; signedIn: boolean },
  search = "",
) {
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
        { value: new URLSearchParams(search) },
        createElement(EventsList, {
          community,
          initialScope: search.includes("registered") ? "registered" : "all",
          registrationAvailabilityByEventId: {},
          viewModel: { account: { fullName: "Orbit" }, connections: [], events: [...events] },
        }),
      ),
    ),
  );
}

function textOf(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  return node.children.map((child) => textOf(child as ReactTestInstance | string)).join("");
}

function communitySection(root: ReactTestRenderer): ReactTestInstance {
  return root.root.find((node) => node.type === "section" && node.props.className === "ev-community");
}

test("the community card sits above the list whether or not there are events", () => {
  for (const events of [EVENTS, []]) {
    const html = renderToStaticMarkup(tree(events, { joined: false, signedIn: true }));
    const cardAt = html.indexOf('class="ev-community"');
    assert.ok(cardAt >= 0, `card missing with ${events.length} events`);
    assert.ok(cardAt < html.indexOf('class="ev-toolbar"'), "card must lead the page content");
    assert.match(html, /免费/);
    assert.match(html, /长期有效/);
    assert.match(html, /置顶/);
    assert.match(html, /加入 iOrbit 用户社群/);
    assert.match(html, /扫码添加助手，由助手拉你进群/);
  }
  // 我的活动页签同样置顶。
  const mine = renderToStaticMarkup(tree(EVENTS, { joined: false, signedIn: true }, "scope=registered"));
  assert.match(mine, /class="ev-community"/);
});

test("every unprovided asset (QR, WeChat ID, group intro) renders a visible placeholder marker", () => {
  // D4：用户还没有提供二维码、微信号和群介绍，三项都必须是占位并在界面上看得见。
  assert.deepEqual(COMMUNITY_CONFIG.placeholder, { intro: true, qr: true, wechatId: true });
  assert.equal(COMMUNITY_CONFIG.intro, null);
  assert.equal(COMMUNITY_CONFIG.qrImageSrc, null);

  const html = renderToStaticMarkup(tree([], { joined: false, signedIn: true }));
  assert.match(html, /data-community-placeholder="qr"><span>二维码<br\/>占位<\/span>/);
  assert.match(html, /data-community-placeholder="intro">【占位：群介绍，待提供】</);
  assert.match(html, /<code>orbit_helper<\/code><span class="ev-community-ph" data-community-placeholder="wechat">占位</);
  // 未经确认的承诺一律不出现，只保留中性的一句话。
  assert.match(html, /iOrbit 用户交流群。/);
  assert.doesNotMatch(html, /活动名额|第一时间|event seats/);

  const english = renderToStaticMarkup(createElement(OrbitLanguageProvider, { initialLanguage: "en", children: tree([], { joined: false, signedIn: true }) }));
  assert.match(english, /data-community-placeholder="qr"><span>QR code<br\/>Placeholder<\/span>/);
  assert.match(english, /data-community-placeholder="intro">\[Placeholder: group description, to be provided\]</);
  assert.match(english, /data-community-placeholder="wechat">Placeholder</);
});

test("the community card never joins the event grid, and the real list keeps its content and order", () => {
  const html = renderToStaticMarkup(tree(EVENTS, { joined: false, signedIn: true }));
  const cards = [...html.matchAll(/data-events-card="discover"/g)];
  assert.equal(cards.length, EVENTS.length);
  const grid = html.slice(html.indexOf('class="ev-grid"'));
  assert.doesNotMatch(grid, /ev-community/);
  // 顺序与传入一致（列表本身不重排）。
  assert.ok(grid.indexOf("B later event") < grid.indexOf("A earlier event"));
  // 统计四卡不把社群算进去：「本月活动」等仍只数真实活动。
  assert.doesNotMatch(html.slice(html.indexOf('class="ev-stats"'), html.indexOf('class="ev-grid"')), /社群/);
});

async function mountCard(
  t: TestContext,
  props: { joined: boolean; signedIn: boolean },
  options: { clipboard?: "ok" | "reject" | "missing"; putStatus?: number } = {},
) {
  const calls: Array<{ method: string; url: string }> = [];
  const clipboardWrites: string[] = [];
  const selections: unknown[] = [];
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const selection = {
    addRange: (range: unknown) => selections.push(range),
    removeAllRanges: () => undefined,
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { getSelection: () => selection },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createRange: () => ({ selectNodeContents(node: unknown) { (this as { node?: unknown }).node = node; } }),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value:
      options.clipboard === "missing"
        ? {}
        : {
            clipboard: {
              writeText: async (text: string) => {
                if (options.clipboard === "reject") throw new Error("NotAllowedError");
                clipboardWrites.push(text);
              },
            },
          },
  });
  t.after(() => {
    for (const [key, descriptor] of [
      ["window", previousWindow],
      ["document", previousDocument],
      ["navigator", previousNavigator],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    calls.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(input) });
    const status = options.putStatus ?? 200;
    return status === 200
      ? Response.json({ data: { joined: true, joinedAt: "2026-09-28T01:00:00.000Z" }, success: true })
      : Response.json({ error: { code: "UNAUTHORIZED", message: "Sign in" }, success: false }, { status });
  });

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(createElement(CommunityCard, props), {
      createNodeMock: (element) => ({ tag: element.type }),
    });
  });
  const settle = async () => {
    for (let index = 0; index < 4; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };
  return { calls, clipboardWrites, root, selections, settle };
}

function joinButton(root: ReactTestRenderer) {
  return root.root.find(
    (node) => typeof node.props.className === "string" && node.props.className.includes("ev-community-join"),
  );
}

test("「我已加入」 PUTs the membership and flips the card to joined", async (t) => {
  const mounted = await mountCard(t, { joined: false, signedIn: true });
  const button = joinButton(mounted.root);
  assert.equal(textOf(button), "我已加入");
  // 播报区域在变化之前就已存在（空），否则读屏器不会播报。
  const liveBefore = mounted.root.root.find((node) => node.props.role === "status");
  assert.equal(liveBefore.props["aria-live"], "polite");
  assert.equal(textOf(liveBefore), "");

  await act(async () => {
    await button.props.onClick();
  });
  await mounted.settle();

  assert.deepEqual(mounted.calls, [{ method: "PUT", url: "/api/community/membership" }]);
  const after = joinButton(mounted.root);
  assert.equal(textOf(after), "✓ 已加入");
  // 焦点稳定：不用 disabled（会把焦点丢掉），用 aria-disabled 表示不可再点。
  assert.equal(after.props.disabled, undefined);
  assert.equal(after.props["aria-disabled"], "true");
  assert.equal(communitySection(mounted.root).props["data-events-community"], "joined");
  // 成功通过 aria-live 状态行播报。
  const status = mounted.root.root.find((node) => node.props.role === "status");
  assert.equal(status.props["aria-live"], "polite");
  assert.equal(textOf(status), "已加入 iOrbit 用户社群。");

  // 已加入后再点不再发请求（服务端也是幂等的，这里只是不重复打扰）。
  await act(async () => {
    await after.props.onClick();
  });
  assert.equal(mounted.calls.length, 1);
});

test("a server-read joined state renders joined on the first frame", () => {
  const html = renderToStaticMarkup(createElement(CommunityCard, { joined: true, signedIn: true }));
  assert.match(html, /data-events-community="joined"/);
  assert.match(html, /✓ 已加入/);
  assert.doesNotMatch(html, />我已加入</);
});

test("a failed PUT keeps the card unjoined and says so", async (t) => {
  const mounted = await mountCard(t, { joined: false, signedIn: true }, { putStatus: 401 });
  await act(async () => {
    await joinButton(mounted.root).props.onClick();
  });
  await mounted.settle();

  assert.equal(textOf(joinButton(mounted.root)), "我已加入");
  const status = mounted.root.root.find((node) => node.props.role === "status");
  assert.equal(textOf(status), "请先登录，再标记已加入。");
});

test("signed-out visitors get a sign-in link instead of a write button", () => {
  const html = renderToStaticMarkup(createElement(CommunityCard, { joined: false, signedIn: false }));
  assert.match(html, /<a class="btn ev-community-join" href="\/app\/account\/login\?next=%2Fapp%2Fevents">登录后标记已加入<\/a>/);
});

test("copy writes the WeChat ID to the clipboard", async (t) => {
  const mounted = await mountCard(t, { joined: false, signedIn: true }, { clipboard: "ok" });
  const copy = mounted.root.root.find((node) => node.props.className === "btn ev-community-copy");
  await act(async () => {
    await copy.props.onClick();
  });
  assert.deepEqual(mounted.clipboardWrites, [COMMUNITY_CONFIG.wechatId]);
  assert.equal(textOf(mounted.root.root.find((node) => node.props.role === "status")), "微信号已复制。");
});

test("copy falls back to selecting the ID when the clipboard is refused or missing", async (t) => {
  for (const clipboard of ["reject", "missing"] as const) {
    await t.test(clipboard, async (sub) => {
      const mounted = await mountCard(sub, { joined: false, signedIn: true }, { clipboard });
      const copy = mounted.root.root.find((node) => node.props.className === "btn ev-community-copy");
      await act(async () => {
        await copy.props.onClick();
      });
      assert.equal(mounted.selections.length, 1, "the WeChat ID must be selected for manual copy");
      assert.deepEqual((mounted.selections[0] as { node?: unknown }).node, { tag: "code" });
      assert.match(
        textOf(mounted.root.root.find((node) => node.props.role === "status")),
        /已选中微信号/,
      );
    });
  }
});

test("both pages read the join state on the server before rendering", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const events = read("app/(app)/app/events/page.tsx");
  assert.match(events, /readCommunityJoinedForActor\(\{\s*actorId: communityActor\?\.id,?\s*\}\)/);
  assert.match(events, /community=\{\{\s*joined: communityJoined,/);
  const agent = read("app/(app)/app/agent/page.tsx");
  assert.match(agent, /readCommunityJoinedForActor\(\{ actorId \}\)/);
  assert.match(agent, /communityJoined=\{communityJoined\}/);
});
