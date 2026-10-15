/**
 * W0003 SC-01 / SC-02：活动页置顶「加入 iOrbit 用户社群」卡片。
 *
 * - 占位素材逐项标「占位」（R27 起旧 events-0918 列表已删除，卡片位置的断言随之移除）；
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

import { CommunityCard } from "../../app/(app)/app/events/events-0918/community-card";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { COMMUNITY_CONFIG } from "../../features/community/config";

function textOf(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  return node.children.map((child) => textOf(child as ReactTestInstance | string)).join("");
}

function communitySection(root: ReactTestRenderer): ReactTestInstance {
  return root.root.find((node) => node.type === "section" && node.props.className === "ev-community");
}

test("every unprovided asset (QR, WeChat ID, group intro) renders a visible placeholder marker", () => {
  // D4：用户还没有提供二维码、微信号和群介绍，三项都必须是占位并在界面上看得见。
  assert.deepEqual(COMMUNITY_CONFIG.placeholder, { intro: true, qr: true, wechatId: true });
  assert.equal(COMMUNITY_CONFIG.intro, null);
  assert.equal(COMMUNITY_CONFIG.qrImageSrc, null);

  const card = () => createElement(CommunityCard, { joined: false, signedIn: true });
  const html = renderToStaticMarkup(card());
  assert.match(html, /data-community-placeholder="qr"><span>二维码<br\/>占位<\/span>/);
  assert.match(html, /data-community-placeholder="intro">【占位：群介绍，待提供】</);
  assert.match(html, /<code>orbit_helper<\/code><span class="ev-community-ph" data-community-placeholder="wechat">占位</);
  // 未经确认的承诺一律不出现，只保留中性的一句话。
  assert.match(html, /iOrbit 用户交流群。/);
  assert.doesNotMatch(html, /活动名额|第一时间|event seats/);

  const english = renderToStaticMarkup(createElement(OrbitLanguageProvider, { initialLanguage: "en", children: card() }));
  assert.match(english, /data-community-placeholder="qr"><span>QR code<br\/>Placeholder<\/span>/);
  assert.match(english, /data-community-placeholder="intro">\[Placeholder: group description, to be provided\]</);
  assert.match(english, /data-community-placeholder="wechat">Placeholder</);
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

