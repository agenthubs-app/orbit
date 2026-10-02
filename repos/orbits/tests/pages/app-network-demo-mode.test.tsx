/**
 * W0005 组件级：人脉页的真实组件在示例模式下渲染示例人物的数据。
 *
 * - SC-02：「所有人脉」30 行、六个来源格子计数、按来源筛选、每行「示例」角标、横条文案；
 *   没挂 Provider 时一切照旧（无横条、无角标、点行照常导航）；
 * - SC-03：概览与关系管线按示例数据渲染；点任意示例联系人在本页打开详情（8 位完整、其余简版），
 *   不发任何请求、不导航；
 * - SC-04：「写 memo」、memo 弹窗的「保存 memo」都被拦下，不发请求（W0046 改名；W0047 下线「更新状态」）；
 * - W0047 SC-04：示例管线四列是静态档位、详情档位标签与依据面板是前端数据，0 请求；
 *   「扫描名片」「导入人脉」仍是真实链接。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { ReactElement } from "react";

import { DemoInterceptLayer, DemoModeProvider, type DemoModeView } from "../../app/(app)/app/_demo/demo-mode-core";
import { buildDemoNetworkAnalysis, buildDemoNetworkDetail, buildDemoNetworkTierBoard, buildDemoNetworkViewModel } from "../../app/(app)/app/_demo/demo-network";
import { NetworkAll } from "../../app/(app)/app/contacts/network-0918/network-all";
import { NetworkDemoFrame } from "../../app/(app)/app/contacts/network-0918/network-demo-frame";
import { NetworkFollowModal } from "../../app/(app)/app/contacts/network-0918/network-follow-modal";
import { NetworkOverview } from "../../app/(app)/app/contacts/network-0918/network-overview";
import { NetworkPipeline } from "../../app/(app)/app/contacts/network-0918/network-pipeline";
import { NetworkDemoAnalysisNotice } from "../../app/(app)/app/contacts/network-0918/network-shell";

const NOW = new Date("2026-09-28T03:00:00.000Z");
const VM = buildDemoNetworkViewModel(NOW, "zh");
const ANALYSIS = buildDemoNetworkAnalysis(NOW, "zh");
const BOARD = buildDemoNetworkTierBoard();
const VIEW: DemoModeView = {
  bannerCollapsed: false,
  completed: 1,
  confirmedContacts: 3,
  nextStep: "goal",
  steps: { contacts: true, goal: false, plan: false },
};

const inDemo = (element: ReactElement, view: DemoModeView = VIEW) => <DemoModeProvider view={view}>{element}</DemoModeProvider>;
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

/* ── SSR ────────────────────────────────────────────────────────────── */

test("all contacts in the demo: 30 rows, each tagged 示例, the network banner and real scan / import links", () => {
  const html = renderToStaticMarkup(inDemo(<NetworkAll viewModel={VM} />));
  assert.match(html, /data-orbit-guide-demo-banner/);
  assert.match(html, /完成引导后，这里换成你自己的人脉。/);
  assert.match(html, /进度 1 \/ 3 · 下一步：设定目标/);
  assert.match(html, /共 30 位联系人/);
  assert.equal(count(html, /class="btn nw-row"/g), 30);
  assert.equal(count(html, /data-orbit-guide-demo-tag/g), 30);
  // 六个来源格子：全部 30、活动认识 9、朋友引荐 5、通讯录 5、名片导入 8、其他来源 3。
  for (const [label, n] of [["全部联系人", 30], ["活动认识", 9], ["朋友引荐", 5], ["通讯录", 5], ["名片导入", 8], ["其他来源", 3]] as const) {
    assert.match(html, new RegExp(`${label}</span><strong class="nw-source-n">${n}<`), label);
  }
  // 扫描名片 / 导入人脉 仍是真实入口（计入引导第 1 步）。
  assert.match(html, /href="\/app\/contacts\/new\?method=scan"[^>]*>＋ 扫描名片/);
  assert.match(html, /href="\/app\/contacts\/new"[^>]*>＋ 导入人脉/);
  assert.match(html, /王砚/);
  assert.match(html, /href="\/app\/contacts\/demo%3Awang-yan"/);
});

test("the demo source filter narrows to that source", () => {
  const html = renderToStaticMarkup(inDemo(<NetworkAll viewModel={VM} initialSource="scan" />));
  assert.equal(count(html, /class="btn nw-row"/g), 8);
  assert.match(html, /佐藤美咲/);
  assert.doesNotMatch(html, /王砚/);
});

test("without the demo provider the same list has no banner and no demo tags", () => {
  const html = renderToStaticMarkup(<NetworkAll viewModel={VM} />);
  assert.doesNotMatch(html, /data-orbit-guide-demo-banner/);
  assert.doesNotMatch(html, /data-orbit-guide-demo-tag/);
  // 真实页的分析文案与建议标题照旧（不前置联系人名）。
  const pipeline = renderToStaticMarkup(<NetworkPipeline viewModel={VM} analysis={ANALYSIS} board={BOARD} />);
  assert.match(pipeline, /基于你的关系管线、互动记录和行业动态/);
  assert.match(pipeline, /class="nw-suggest-title">14:00 见面，请他引荐 IT 决策人</);
  const overview = renderToStaticMarkup(<NetworkOverview viewModel={VM} analysis={ANALYSIS} />);
  assert.match(overview, /基于你的人脉数据/);
  assert.doesNotMatch(overview, /data-orbit-guide-demo-tag/);
});

test("overview in the demo: advancing highlights tagged, cockpit and distribution from the demo data", () => {
  const html = renderToStaticMarkup(inDemo(<NetworkOverview viewModel={VM} analysis={ANALYSIS} />));
  assert.match(html, /完成引导后，这里换成你自己的人脉。/);
  assert.match(html, /王砚<span class="ir-demo-tag"/);
  assert.match(html, /佐藤美咲<span class="ir-demo-tag"/);
  // 分析文案说明是示例人物的，不说「你的人脉」。
  assert.match(html, /示例人物的人脉分析 · 依据 30 位示例联系人/);
  assert.match(html, /示例人物的人脉分析：/);
  assert.doesNotMatch(html, /基于你的人脉数据/);
  assert.match(html, /正在推进<\/span><strong class="nw-stage-n">5</);
  // 最近动态里的人名是结构化字段，带「示例」角标。
  for (const name of ["铃木健", "高桥由美", "王砚", "佐藤美咲"]) {
    assert.match(html, new RegExp(`class="nw-recent-name">${name}<span class="ir-demo-tag"`), name);
  }
  assert.match(html, /制造/);
});

test("pipeline in the demo: four columns from the demo stages, AI suggestions point at demo contacts", () => {
  const html = renderToStaticMarkup(inDemo(<NetworkPipeline viewModel={VM} analysis={ANALYSIS} board={BOARD} />));
  assert.match(html, /完成引导后，这里换成你自己的人脉。/);
  assert.match(html, /总联系人<\/span>/);
  assert.equal(count(html, /class="nw-kanban-card"/g), 30);
  // W0047：四列是示例的静态档位（新认识／有往来／核心／待唤醒），列头人数合计 30。
  const columns = html.split('class="nw-kanban-col"').slice(1);
  assert.deepEqual(columns.map((col) => /data-network-tier="(\w+)"/.exec(col)?.[1]), ["new", "active", "core", "dormant"]);
  assert.equal(columns.map((col) => Number(/nw-kanban-n"[^>]*>(\d+)</.exec(col)?.[1])).reduce((a, b) => a + b, 0), 30);
  assert.ok(columns.every((col) => Number(/nw-kanban-n"[^>]*>(\d+)</.exec(col)?.[1]) > 0));
  // 30 张看板卡片 + 当前页 3 条 AI 建议里的联系人名。
  assert.equal(count(html, /data-orbit-guide-demo-tag/g), 33);
  // AI 建议里的人名带「示例」角标；文案说明是示例人物的分析。
  assert.match(html, /class="nw-suggest-title">王砚<span class="ir-demo-tag"[^>]*>示例<\/span> · 14:00 见面，请他引荐 IT 决策人/);
  assert.match(html, /class="nw-suggest-title">佐藤美咲<span class="ir-demo-tag"/);
  assert.match(html, /示例人物的人脉分析：/);
  assert.doesNotMatch(html, /基于你的关系管线/);
  assert.match(html, /href="\/app\/contacts\/demo%3Awang-yan"/);
});

test("the analysis sub-page in the demo is only the banner and a notice", () => {
  const html = renderToStaticMarkup(inDemo(<NetworkDemoAnalysisNotice />));
  assert.match(html, /data-orbit-guide-demo-banner/);
  assert.match(html, /data-network-demo-analysis/);
  assert.match(html, /示例里没有 AI 人脉分析/);
});

test("the demo frame: banner open → no pill; collapsed → the nav pill instead of the banner", () => {
  const open = renderToStaticMarkup(<NetworkDemoFrame guide={VIEW} route="app-contacts-route"><NetworkAll viewModel={VM} /></NetworkDemoFrame>);
  assert.match(open, /data-orbit-guide-demo="on"/);
  assert.match(open, /data-orbit-route="app-contacts-route"/);
  assert.match(open, /data-orbit-guide-demo-banner/);
  assert.doesNotMatch(open, /data-orbit-guide-demo-pill/);
  const collapsed = renderToStaticMarkup(<NetworkDemoFrame guide={{ ...VIEW, bannerCollapsed: true }} route="app-contacts-route"><NetworkAll viewModel={VM} /></NetworkDemoFrame>);
  assert.doesNotMatch(collapsed, /data-orbit-guide-demo-banner/);
  assert.match(collapsed, /data-orbit-guide-demo-pill/);
});

/* ── 交互（react-test-renderer） ───────────────────────────────────── */

interface Mounted {
  assigned: string[];
  /** 向 document 上的 keydown 监听者派发一次按键（共用弹窗 hook 挂在 document 上）。 */
  keydown: (key: string) => void;
  fetches: string[];
  root: ReactTestRenderer;
  text: () => string;
}

async function mount(t: TestContext, element: ReactElement): Promise<Mounted> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const assigned: string[] = [];
  const fetches: string[] = [];
  const documentListeners = new Map<string, Set<(event: unknown) => void>>();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement: null,
      addEventListener(type: string, listener: (event: unknown) => void) {
        if (!documentListeners.has(type)) documentListeners.set(type, new Set());
        documentListeners.get(type)!.add(listener);
      },
      documentElement: { lang: "zh" },
      removeEventListener(type: string, listener: (event: unknown) => void) {
        documentListeners.get(type)?.delete(listener);
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      location: { assign: (href: string) => assigned.push(href), reload: () => assigned.push("reload") },
      removeEventListener() {},
    },
  });
  let root: ReactTestRenderer | null = null;
  t.after(() => {
    act(() => root?.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete (globalThis as { document?: unknown }).document;
  });
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    fetches.push(String(input));
    return Response.json({ success: true });
  });
  await act(async () => {
    root = create(element);
  });
  const mounted = root as unknown as ReactTestRenderer;
  const keydown = (key: string) => {
    const event = { key, preventDefault() {}, shiftKey: false, stopPropagation() {} };
    for (const listener of [...(documentListeners.get("keydown") ?? [])]) listener(event);
  };
  return { assigned, fetches, keydown, root: mounted, text: () => JSON.stringify(mounted.toJSON()) };
}

function clickEvent(currentTarget: { focus: () => void } = { focus() {} }) {
  const event = { altKey: false, button: 0, ctrlKey: false, currentTarget, defaultPrevented: false, metaKey: false, preventDefault() { event.defaultPrevented = true; }, shiftKey: false };
  return event;
}

function anchor(root: ReactTestRenderer, className: string, href: string): ReactTestInstance {
  const found = root.root.findAll((node) => node.type === "a" && node.props.className === className && node.props.href === href);
  assert.ok(found[0], `${className} ${href}`);
  return found[0]!;
}

function button(root: ReactTestRenderer, className: string): ReactTestInstance {
  const found = root.root.findAll((node) => node.type === "button" && node.props.className === className);
  assert.ok(found[0], className);
  return found[0]!;
}

const has = (root: ReactTestRenderer, attribute: string) => root.root.findAll((node) => node.props?.[attribute] !== undefined).length > 0;
const detailOpen = (root: ReactTestRenderer) => root.root.findAll((node) => node.props?.["data-network-modal"] === "detail").length > 0;
const followOpen = (root: ReactTestRenderer) => root.root.findAll((node) => node.props?.["data-network-modal"] === "follow").length > 0;

test("clicking a demo row opens the full detail in place; write memo is intercepted, the tier basis is static, nothing is sent", async (t) => {
  const mounted = await mount(t, inDemo(<NetworkAll viewModel={VM} />));
  const { root } = mounted;
  const event = clickEvent();
  await act(async () => {
    anchor(root, "btn nw-row", "/app/contacts/demo%3Awang-yan").props.onClick(event);
  });
  assert.equal(event.defaultPrevented, true, "the row must not navigate");
  assert.ok(detailOpen(root));
  assert.match(mounted.text(), /札幌展会展位聊了 15 分钟/);
  assert.match(mounted.text(), /减少会议记录时间/);
  assert.match(mounted.text(), /今天见面时请他引荐铃木/);

  await act(async () => {
    button(root, "btn nw-detail-follow").props.onClick();
  });
  assert.equal(followOpen(root), false, "log interaction must not open the real follow-up form");
  // W0047：「更新状态」下线；档位标签与「依据」面板是示例静态数据。
  assert.equal(root.root.findAll((node) => node.props?.className === "btn nw-detail-status").length, 0);
  assert.match(mounted.text(), /核心/);
  await act(async () => {
    button(root, "btn nw-basis-toggle").props.onClick();
  });
  assert.ok(has(root, "data-network-basis"));
  assert.match(mounted.text(), /根据以下记录自动判断/);

  // 关闭只收起弹窗，不导航。
  const closeEvent = clickEvent();
  await act(async () => {
    anchor(root, "btn nw-detail-close", "/app/contacts").props.onClick(closeEvent);
  });
  assert.equal(closeEvent.defaultPrevented, true);
  assert.equal(detailOpen(root), false);
  assert.deepEqual(mounted.assigned, []);
  assert.deepEqual(mounted.fetches, []);
});

test("the write-memo button raises the 这是示例 intercept and never fetches; there is no update-status button", async (t) => {
  const detail = buildDemoNetworkDetail("demo:sato-misaki", NOW, "zh")!;
  const mounted = await mount(t, inDemo(<>
    <NetworkAll viewModel={VM} openDetail={{ closeHref: "/app/contacts", contact: detail }} />
    <DemoInterceptLayer />
  </>));
  const { root } = mounted;
  assert.equal(root.root.findAll((node) => node.props?.className === "btn nw-detail-status").length, 0);
  for (const [className, label] of [["btn nw-detail-follow", "memo"]] as const) {
    await act(async () => {
      button(root, className).props.onClick();
    });
    assert.ok(has(root, "data-orbit-guide-demo-intercept"), className);
    assert.match(mounted.text(), new RegExp(`这里会是你自己的${label}`));
    assert.equal(followOpen(root), false);
    await act(async () => {
      button(root, "btn ir-demo-dismiss").props.onClick();
    });
    assert.equal(has(root, "data-orbit-guide-demo-intercept"), false);
  }
  assert.deepEqual(mounted.fetches, []);
});

test("a demo contact without full detail opens the short version", async (t) => {
  const mounted = await mount(t, inDemo(<NetworkAll viewModel={VM} />));
  await act(async () => {
    anchor(mounted.root, "btn nw-row", "/app/contacts/demo%3Akato-ryo").props.onClick(clickEvent());
  });
  assert.ok(detailOpen(mounted.root));
  assert.match(mounted.text(), /上次互动（示例简版详情）/);
  assert.match(mounted.text(), /待了解/);
  assert.deepEqual(mounted.fetches, []);
});

test("pipeline and overview open demo details in place too (cards and suggestions)", async (t) => {
  const pipeline = await mount(t, inDemo(<NetworkPipeline viewModel={VM} analysis={ANALYSIS} board={BOARD} />));
  const kanban = clickEvent();
  await act(async () => {
    anchor(pipeline.root, "btn nw-kanban-who", "/app/contacts/demo%3Ayamada-taro").props.onClick(kanban);
  });
  assert.equal(kanban.defaultPrevented, true);
  assert.ok(detailOpen(pipeline.root));
  assert.match(pipeline.text(), /说明会后交换名片/);
  await act(async () => {
    anchor(pipeline.root, "btn nw-modal-close", "/app/contacts/pipeline").props.onClick(clickEvent());
  });
  assert.equal(detailOpen(pipeline.root), false);
  await act(async () => {
    anchor(pipeline.root, "btn nw-suggest", "/app/contacts/demo%3Asato-misaki").props.onClick(clickEvent());
  });
  assert.match(pipeline.text(), /她说现在用 Word 手记/);
  assert.deepEqual(pipeline.fetches, []);
  assert.deepEqual(pipeline.assigned, []);
});

test("overview highlights open the demo detail in place", async (t) => {
  const overview = await mount(t, inDemo(<NetworkOverview viewModel={VM} analysis={ANALYSIS} />));
  await act(async () => {
    anchor(overview.root, "btn nw-hl", "/app/contacts/demo%3Awang-yan").props.onClick(clickEvent());
  });
  assert.ok(detailOpen(overview.root));
  assert.deepEqual(overview.fetches, []);
});

test("modifier clicks and non-demo mode keep normal link navigation", async (t) => {
  const demo = await mount(t, inDemo(<NetworkAll viewModel={VM} />));
  const meta = { ...clickEvent(), metaKey: true };
  await act(async () => {
    anchor(demo.root, "btn nw-row", "/app/contacts/demo%3Awang-yan").props.onClick(meta);
  });
  assert.equal(meta.defaultPrevented, false);
  assert.equal(detailOpen(demo.root), false);

  const live = await mount(t, <NetworkAll viewModel={VM} />);
  const plain = clickEvent();
  await act(async () => {
    anchor(live.root, "btn nw-row", "/app/contacts/demo%3Awang-yan").props.onClick(plain);
  });
  assert.equal(plain.defaultPrevented, false, "outside the demo the row navigates as before");
  assert.equal(detailOpen(live.root), false);
});

test("the follow-up form's save is intercepted in the demo and sends no PATCH", async (t) => {
  const contact = buildDemoNetworkDetail("demo:wang-yan", NOW, "zh")!;
  const mounted = await mount(t, inDemo(<>
    <NetworkFollowModal contact={contact} onClose={() => undefined} onSaved={() => undefined} />
    <DemoInterceptLayer />
  </>));
  const summary = mounted.root.root.findAll((node) => node.type === "textarea" && node.props.id === "nw-fu-memo")[0]!;
  await act(async () => {
    summary.props.onChange({ target: { value: "聊了试用" } });
  });
  await act(async () => {
    await button(mounted.root, "btn nw-fu-save").props.onClick();
  });
  assert.ok(has(mounted.root, "data-orbit-guide-demo-intercept"));
  assert.deepEqual(mounted.fetches, []);
});

test("the in-page demo detail closes on Escape and hands focus back to the link that opened it", async (t) => {
  const mounted = await mount(t, inDemo(<><NetworkAll viewModel={VM} /><DemoInterceptLayer /></>));
  let focused = 0;
  const trigger = { focus: () => { focused += 1; } };
  await act(async () => {
    anchor(mounted.root, "btn nw-row", "/app/contacts/demo%3Awang-yan").props.onClick(clickEvent(trigger));
  });
  assert.ok(detailOpen(mounted.root));
  // 拦截层叠在详情上时，Esc 只关拦截层，详情留着。
  await act(async () => {
    button(mounted.root, "btn nw-detail-follow").props.onClick();
  });
  assert.ok(has(mounted.root, "data-orbit-guide-demo-intercept"));
  await act(async () => mounted.keydown("Escape"));
  assert.equal(has(mounted.root, "data-orbit-guide-demo-intercept"), false);
  assert.ok(detailOpen(mounted.root), "Escape on the intercept must not also close the detail");
  assert.equal(focused, 0);
  // 再按 Esc：详情关闭，焦点回到触发链接。
  await act(async () => mounted.keydown("Escape"));
  assert.equal(detailOpen(mounted.root), false);
  assert.equal(focused, 1);
  // 关闭按钮同样还原焦点。
  const again = { focus: () => { focused += 1; } };
  await act(async () => {
    anchor(mounted.root, "btn nw-row", "/app/contacts/demo%3Akato-ryo").props.onClick(clickEvent(again));
  });
  await act(async () => {
    anchor(mounted.root, "btn nw-modal-close", "/app/contacts").props.onClick(clickEvent());
  });
  assert.equal(detailOpen(mounted.root), false);
  assert.equal(focused, 2);
  assert.deepEqual(mounted.fetches, []);
  assert.deepEqual(mounted.assigned, []);
});
