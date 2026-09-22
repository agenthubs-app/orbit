import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpsCheckin } from "../../app/(app)/app/events/ops-0918/ops-checkin";
import { exportCsvHref } from "../../app/(app)/app/events/ops-0918/ops-model";
import { OpsConsoleShell } from "../../app/(app)/app/events/ops-0918/ops-shell";
import { buttonNamed, EVENT, EVENT_ID, flush, text } from "../support/ops-console-fixture";

// 运营台 任务 4：签到屏（设计 253–298 行；`/operations/check-in`）。特征化用例自 tests/pages/limited-check-in-roster.test.tsx
// （5 例）改指本屏：加载 + 计数 + 逐行动作 / markArrived 请求体 + 提示 + 重读 / 401 跳登录 / 409 文案 / 503 重试；
// 另加 SSR 结构、筛选 + 搜索、「最新签到」+「查看全部 →」。

const ENDPOINT = `/api/events/${encodeURIComponent(EVENT_ID)}/operations/admin/check-ins`;
const LOGIN_HREF = `/app/account/login?next=${encodeURIComponent(`/app/events/${encodeURIComponent(EVENT_ID)}/operations/check-in`)}`;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function roster(checkedIn = false) {
  return {
    eventId: EVENT_ID,
    participants: [
      { checkedIn, checkedInAt: checkedIn ? "2026-10-01T09:05:00.000Z" : null, displayName: "Alice", participantId: "p:a" },
      { checkedIn: false, checkedInAt: null, displayName: "Bob", participantId: "p:b" },
    ],
  };
}

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

interface Harness {
  assigned: string[];
  observed: Observed[];
  restore: () => void;
}

function install(respond: (call: Observed) => Response | Promise<Response>): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const observed: Observed[] = [];
  const assigned: string[] = [];
  globalThis.fetch = (async (url, init) => {
    const call = { body: typeof init?.body === "string" ? init.body : null, method: init?.method ?? "GET", url: String(url) };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { assign(href: string) { assigned.push(href); } } },
  });
  return {
    assigned,
    observed,
    restore() {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

async function withCheckin(
  respond: (call: Observed) => Response | Promise<Response>,
  run: (renderer: ReactTestRenderer, harness: Harness) => Promise<void> | void,
): Promise<void> {
  const harness = install(respond);
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsCheckin event={EVENT} />);
      await flush();
    });
    await run(renderer!, harness);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
}

function rows(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.props["data-ops-row"] === "string").map((node) => node.props["data-ops-row"] as string);
}

function action(renderer: ReactTestRenderer, participantId: string) {
  return renderer.root.find((node) => node.type === "button" && node.props["data-ops-arrive"] === participantId);
}

function filterButton(renderer: ReactTestRenderer, key: string) {
  return renderer.root.find((node) => node.type === "button" && node.props["data-ops-filter"] === key);
}

function stat(renderer: ReactTestRenderer, key: string): string {
  return renderer.root.find((node) => node.props["data-ops-stat"] === key).children.join("");
}

test("checkin SSR renders the console head with the 签到 tab active, three filters, the note card, no 签到失败 card and no design mock", () => {
  const html = renderToStaticMarkup(
    <OpsConsoleShell event={EVENT} more={[{ href: exportCsvHref(EVENT.id), label: "导出 CSV" }]} view="checkin">
      <OpsCheckin event={EVENT} />
    </OpsConsoleShell>,
  );
  assert.match(html, /<h1 class="op-h1">签到<\/h1>/u);
  assert.match(html, /aria-current="page" class="op-tab op-tab-on" href="[^"]+\/operations\/check-in" role="tab">签到</u);
  assert.match(html, /活动中心<\/a> \/ <a class="op-crumb-link" href="[^"]+">屏级替换夹具活动<\/a> \/ <a class="op-crumb-link" href="[^"]+">运营台<\/a> \/ 签到/u);
  assert.match(html, /role="menuitem">导出 CSV/u);
  assert.doesNotMatch(html, /管理角色/u);
  assert.match(html, /此页面仅显示签到所需信息/u);
  assert.match(html, /重复签到将自动拦截/u);
  assert.doesNotMatch(html, /签到失败/u, "no persisted failure state → card omitted");
  assert.match(html, /<span>姓名<\/span><span>状态<\/span><span class="op-chead-center">操作<\/span>/u, "three columns");
  assert.doesNotMatch(html, /<span>公司 \/ 职位<\/span>|<span>票种 \/ 分组<\/span>/u);
  for (const label of ["未签到", "已签到", "全部"]) assert.match(html, new RegExp(`class="btn op-cfilter"[^>]*>${label}</button>`, "u"));
  assert.match(html, /<button class="btn op-crefresh" data-ops-refresh="true" disabled="" type="button">刷新名单<\/button>/u, "manual refresh kept from the retired roster (deviation); disabled during the initial load");
  assert.match(html, /placeholder="搜索姓名或参会者编号…"/u);
  assert.match(html, /最新签到/u);
  assert.match(html, /查看全部 →/u);
  assert.doesNotMatch(html, /张嘉怡|陈浩|OpenAI|Meta · 软件工程师|14:28/u);
  assert.doesNotMatch(html, /data-ops-row=/u, "rows wait for the roster");
});

test("roster loads the limited check-in list: counts, 未签到 default filter, per-row actions, latest check-ins and 查看全部 →", async () => {
  await withCheckin(() => Response.json({ data: roster(true), success: true }), async (renderer, harness) => {
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", ENDPOINT]]);
    assert.equal(stat(renderer, "pending"), "1");
    assert.equal(stat(renderer, "checked"), "1");
    assert.deepEqual(rows(renderer), ["p:b"], "design default filter = 未签到");
    assert.equal(filterButton(renderer, "pending").props["aria-pressed"], true);
    assert.equal(filterButton(renderer, "pending").props.style.background, "#DDDEFA");
    assert.equal(filterButton(renderer, "all").props.style.background, "transparent");
    assert.equal(action(renderer, "p:b").props.disabled, false);
    assert.equal(action(renderer, "p:b").children.join(""), "标记到场");
    assert.deepEqual([action(renderer, "p:b").props.style.background, action(renderer, "p:b").props.style.color], ["#0E1225", "#FFFFFF"]);

    await act(async () => {
      filterButton(renderer, "all").props.onClick();
      await flush();
    });
    assert.deepEqual(rows(renderer), ["p:a", "p:b"]);
    assert.equal(action(renderer, "p:a").props.disabled, true, "checked-in row is disabled");
    assert.equal(action(renderer, "p:a").children.join(""), "已签到");
    assert.deepEqual([action(renderer, "p:a").props.style.background, action(renderer, "p:a").props.style.color, action(renderer, "p:a").props.style.cursor], ["#F1F1FA", "#9FA3C4", "default"]);
    const chip = (id: string) => renderer.root.find((node) => node.props["data-ops-chip"] === id);
    assert.equal(chip("p:a").children.join(""), "● 已签到");
    assert.deepEqual([chip("p:a").props.style.background, chip("p:a").props.style.color], ["#E6F1EC", "#2F6B4F"]);
    assert.equal(chip("p:b").children.join(""), "● 未签到");
    assert.deepEqual([chip("p:b").props.style.background, chip("p:b").props.style.color], ["#F1F1FA", "#6B6F99"]);
    const avatars = renderer.root.findAll((node) => node.props["data-ops-avatar"] !== undefined).map((node) => node.props.style.background);
    assert.deepEqual(avatars, ["#DDDEFA", "#ECEEFB"]);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);

    const latest = renderer.root.findAll((node) => typeof node.props["data-ops-latest"] === "string");
    assert.deepEqual(latest.map((node) => node.props["data-ops-latest"]), ["p:a"]);
    assert.match(text(renderer), /Alice18:05/u, "checkedInAt in JST HH:mm, no org line");

    const search = renderer.root.find((node) => node.type === "input" && node.props.placeholder === "搜索姓名或参会者编号…");
    await act(async () => {
      search.props.onChange({ target: { value: ":b" } });
      await flush();
    });
    assert.deepEqual(rows(renderer), ["p:b"], "participantId suffix");
    await act(async () => {
      search.props.onChange({ target: { value: "nobody" } });
      await flush();
    });
    assert.deepEqual(rows(renderer), []);
    assert.match(text(renderer), /没有匹配的参会者。换一个姓名试试，或清空筛选。/u);
    await act(async () => {
      search.props.onChange({ target: { value: "" } });
      buttonNamed(renderer, "查看全部 →").props.onClick();
      await flush();
    });
    assert.equal(filterButton(renderer, "done").props["aria-pressed"], true);
    assert.deepEqual(rows(renderer), ["p:a"]);
  });
});

test("刷新名单 re-fetches the roster and is disabled while loading", async () => {
  let release: (() => void) | null = null;
  let gets = 0;
  await withCheckin(async (call) => {
    gets += 1;
    if (gets === 1) return Response.json({ data: roster(), success: true });
    await new Promise<void>((resolve) => { release = resolve; });
    return Response.json({ data: roster(true), success: true });
  }, async (renderer, harness) => {
    const refresh = () => renderer.root.find((node) => node.props["data-ops-refresh"] !== undefined);
    assert.equal(refresh().props.disabled, false);
    assert.equal(refresh().children.join(""), "刷新名单");
    assert.equal(refresh().props.className, "btn op-crefresh");
    await act(async () => {
      refresh().props.onClick();
      await Promise.resolve();
    });
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", ENDPOINT], ["GET", ENDPOINT]], "second GET fired by the button");
    assert.equal(refresh().props.disabled, true, "disabled while the roster reloads");
    await act(async () => {
      release?.();
      await flush();
    });
    assert.equal(refresh().props.disabled, false);
    assert.equal(stat(renderer, "checked"), "1", "reloaded roster is rendered");
  });
});

test("mark arrived POSTs the participant id, shows the notice and reloads the roster", async () => {
  let posted: Observed | null = null;
  await withCheckin((call) => {
    if (call.method === "POST") {
      posted = call;
      return Response.json({ data: { checkedInAt: "2026-10-01T09:06:00.000Z", participantId: "p:b" }, success: true });
    }
    return Response.json({ data: roster(), success: true });
  }, async (renderer, harness) => {
    await act(async () => {
      action(renderer, "p:b").props.onClick();
      await flush();
    });
    assert.ok(posted);
    const observedPost = posted as Observed;
    assert.equal(observedPost.url, ENDPOINT);
    assert.deepEqual(JSON.parse(observedPost.body ?? "{}"), { participantId: "p:b" });
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "POST", "GET"]);
    assert.match(text(renderer), /Bob 已标记为到场。/u);
  });
});

test("a 401 on load clears the roster, explains, and redirects to the login page with next=", async () => {
  await withCheckin(() => Response.json({ error: { message: "unauthenticated" }, success: false }, { status: 401 }), async (renderer, harness) => {
    await act(async () => {
      await flush();
    });
    assert.match(text(renderer), /登录状态已失效，正在返回登录页。/u);
    assert.deepEqual(harness.assigned, [LOGIN_HREF]);
    assert.deepEqual(rows(renderer), []);
    assert.equal(renderer.root.findAll((node) => node.props["data-ops-stat"] !== undefined).length, 0, "counts hidden without a roster");
  });
});

test("a 409 on mark arrived keeps the roster and shows the check-in window copy", async () => {
  await withCheckin((call) => call.method === "POST"
    ? Response.json({ error: { message: "closed" }, success: false }, { status: 409 })
    : Response.json({ data: roster(), success: true }), async (renderer) => {
    await act(async () => {
      action(renderer, "p:a").props.onClick();
      await flush();
    });
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.match(JSON.stringify(alert.children.map((child) => (typeof child === "string" ? child : child.children.join("")))), /该活动当前不允许签到，请确认签到时间窗口。/u);
    assert.deepEqual(rows(renderer), ["p:a", "p:b"], "roster stays visible");
    assert.equal(action(renderer, "p:a").props.disabled, false, "pending flag is released");
    assert.equal(action(renderer, "p:a").children.join(""), "标记到场");
  });
});

test("retry after a 503 read failure re-fetches the roster", async () => {
  let calls = 0;
  await withCheckin(() => {
    calls += 1;
    return calls === 1
      ? Response.json({ error: { message: "storage down" }, success: false }, { status: 503 })
      : Response.json({ data: roster(), success: true });
  }, async (renderer) => {
    assert.match(text(renderer), /活动权限或签到存储暂时不可用，请稍后重试。/u);
    await act(async () => {
      buttonNamed(renderer, "重试").props.onClick();
      await flush();
    });
    assert.equal(calls, 2);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    assert.equal(stat(renderer, "pending"), "2");
    assert.equal(stat(renderer, "checked"), "0");
  });
});

test("check-in page gates on check_in.roster.read_limited before reading the event and mounts the check-in screen inside the ops-0918 shell", () => {
  const page = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/operations/check-in/page.tsx"), "utf8");
  const screen = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-checkin.tsx"), "utf8");
  const boundary = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-boundary.tsx"), "utf8");
  assert.match(page, /await Promise\.all\(\[params, auth\(\)\]\)/u);
  assert.match(page, /redirect\(`\/app\/account\/login\?next=/u);
  // 评审修正：getEvent 会泄露未发布活动标题，故与名单 API 同一能力做 per-event 门禁，未过不读活动。
  assert.match(page, /requireEventCapability\(\{[^}]*capability: "check_in\.roster\.read_limited"/u);
  assert.match(page, /createConfiguredEventAccessService\(\)/u);
  assert.ok(page.indexOf("requireEventCapability({") < page.indexOf("await loadEventOperationsPageEvent("), "gate runs before the event read");
  assert.match(page, /title="没有签到权限"/u);
  assert.match(page, /只有当前活动主办方或被授予签到角色的成员可以打开签到名单。/u);
  // 任务 7：三页共用 ops-0918/ops-boundary.tsx（eyebrow / title / description / retryHref / page 标记）
  assert.doesNotMatch(page, /function Boundary|PublicTopNav/u);
  assert.match(page, /<OpsBoundary [^>]*eyebrow="EVENT OPERATIONS · CHECK-IN"[^>]*page="event-check-in-boundary"[^>]*retryHref=\{`\/app\/events\/\$\{encodeURIComponent\(eventId\)\}\/operations\/check-in`\}[^>]*title="没有签到权限"/u);
  assert.match(boundary, /href="\/app\/events\/center">返回运营活动中心/u);
  assert.match(boundary, /href=\{retryHref\}>重试/u);
  assert.match(boundary, /data-orbit-real-page=\{page\}/u);
  assert.match(page, /loadEventOperationsPageEvent/u);
  assert.match(page, /data-orbit-real-page="ops-0918"/u);
  assert.match(page, /<AccountTopNav active="events" \/>/u);
  assert.match(page, /view="checkin"/u);
  assert.match(screen, /useCheckInRoster\(event\.id\)/u);
  assert.match(screen, /标记到场/u);
});
