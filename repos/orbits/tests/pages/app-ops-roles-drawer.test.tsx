import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpsConsole } from "../../app/(app)/app/events/ops-0918/ops-console";
import { MANUAL_SUBJECT, OpsRolesDrawer } from "../../app/(app)/app/events/ops-0918/ops-roles-drawer";
import { OpsConsoleShell } from "../../app/(app)/app/events/ops-0918/ops-shell";
import { EVENT, EVENT_ID, flush, text } from "../support/ops-console-fixture";

// 运营台 任务 6：协作者抽屉（设计 447–476 行；`/operations?drawer=roles`）。特征化用例自
// tests/pages/event-role-management-workspace.test.tsx（:86 重新授予时序 / :188 改角色 + 移除时序）改指 `OpsRolesDrawer`；
// 另加 SSR 结构（关闭态不渲染 / 打开态结构 / 无权限忽略参数 / 无 mock 文案）、409 → 刷新 + 提示、Esc / 遮罩 / ✕ 关闭导航。

const ACCESS = `/api/events/${encodeURIComponent(EVENT_ID)}/access`;
const OWNER_ID = "actor:event-owner";
const OPERATOR_ID = "actor:operator";
const CLOSE_HREF = `/app/events/${encodeURIComponent(EVENT_ID)}/operations`;

type DelegatedRole = "check_in" | "operations" | "reviewer" | "read_only_analyst";

function assignment(input: { revision: number; role: DelegatedRole | null; state: "active" | "revoked" | null; subjectActorId: string }) {
  return { eventId: EVENT_ID, owner: false, ...input };
}

function rolePayload(members: readonly { revision: number; role: DelegatedRole; subjectActorId: string }[] = []) {
  return {
    event: {
      endsAt: EVENT.endsAt,
      eventId: EVENT_ID,
      lifecycleState: "published",
      migrationPending: false,
      owner: true,
      revision: 0,
      role: "owner",
      startsAt: EVENT.startsAt,
      title: EVENT.title,
      venue: "Tokyo",
    },
    members: [
      { assignedAt: null, assignedByActorId: null, eventId: EVENT_ID, reason: "Derived from the Event Core organizer.", revision: 0, role: "owner", state: "active", subjectActorId: OWNER_ID },
      ...members.map((member) => ({ assignedAt: "2026-09-01T08:00:00.000Z", assignedByActorId: OWNER_ID, eventId: EVENT_ID, reason: "现场运营职责", revision: member.revision, role: member.role, state: "active" as const, subjectActorId: member.subjectActorId })),
    ],
  };
}

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

/** fetch + window 桩：window 需要 keydown 监听与 `location.assign`（关闭 = 整页导航）。 */
function install(respond: (call: Observed) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const observed: Observed[] = [];
  const assigned: string[] = [];
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  globalThis.fetch = (async (url, init) => {
    const call = { body: typeof init?.body === "string" ? init.body : null, method: init?.method ?? "GET", url: String(url) };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, handler: (event: unknown) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      clearInterval() {},
      location: { assign(href: string) { assigned.push(href); }, origin: "https://orbit.test" },
      removeEventListener(type: string, handler: (event: unknown) => void) { listeners.get(type)?.delete(handler); },
      setInterval() { return 1; },
    },
  });
  return {
    assigned,
    dispatch(type: string, event: unknown) { for (const handler of listeners.get(type) ?? []) handler(event); },
    listeners,
    observed,
    restore() {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

/** 参与者候选池（`/operations/admin`）默认 403 → 手动 actor ID 输入框；角色表按 `roles` 返回。 */
function respondWith(handlers: (call: Observed) => Response | null) {
  return (call: Observed) => {
    if (call.url.includes("/operations/admin")) return Response.json({ error: { message: "forbidden" }, success: false }, { status: 403 });
    const handled = handlers(call);
    if (handled) return handled;
    throw new Error(`Unexpected request ${call.method} ${call.url}`);
  };
}

async function withDrawer(
  respond: (call: Observed) => Response | Promise<Response>,
  run: (renderer: ReactTestRenderer, harness: ReturnType<typeof install>) => Promise<void> | void,
): Promise<void> {
  const harness = install(respond);
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsRolesDrawer closeHref={CLOSE_HREF} eventId={EVENT_ID} />);
      await flush();
    });
    await run(renderer!, harness);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
}

function byProp(renderer: ReactTestRenderer, prop: string, value: string) {
  return renderer.root.find((node) => node.props[prop] === value);
}

/** 错误条文案（任务 7 起错误条 = <span>文案</span> + 「刷新角色」按钮）。 */
function alertText(renderer: ReactTestRenderer) {
  return renderer.root.find((node) => node.props.role === "alert").findByType("span").children.join("");
}

function members(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.props["data-event-role-member"] === "string").map((node) => node.props["data-event-role-member"] as string);
}

// ── SSR 结构 ──

test("drawer SSR: closed by default, only mounted for roles.manage + ?drawer=roles, ignored without the capability", () => {
  const closed = renderToStaticMarkup(<OpsConsole canManageRoles event={EVENT} tab="ops" />);
  assert.doesNotMatch(closed, /data-ops-drawer/u);
  assert.doesNotMatch(closed, /协作者管理/u);

  const open = renderToStaticMarkup(<OpsConsole canManageRoles drawer="roles" event={EVENT} tab="ops" />);
  assert.match(open, /<div class="op-dw-overlay" data-ops-drawer="roles">/u);
  assert.match(open, /<div aria-labelledby="ops-roles-drawer-title" aria-modal="true" class="op-dw-panel" role="dialog">/u);
  // 抽屉挂在壳内（`OpsConsoleShell` 的 drawer 槽），概览屏仍然渲染
  assert.match(open, /<h1 class="op-h1">屏级替换夹具活动 · 运营台<\/h1>/u);

  const denied = renderToStaticMarkup(<OpsConsole drawer="roles" event={EVENT} tab="ops" />);
  assert.doesNotMatch(denied, /data-ops-drawer/u);
  assert.doesNotMatch(denied, /协作者管理/u);
});

test("drawer SSR renders the design head, both sections, the real selects/inputs and no design mock", () => {
  const html = renderToStaticMarkup(
    <OpsConsoleShell drawer={<OpsRolesDrawer closeHref={CLOSE_HREF} eventId={EVENT_ID} />} event={EVENT} view="ops">
      <div />
    </OpsConsoleShell>,
  );
  assert.match(html, /<span class="op-dw-ico">⚇<\/span>/u);
  assert.match(html, /<strong class="op-dw-title" id="ops-roles-drawer-title">协作者管理<\/strong>/u);
  assert.match(html, /<span class="op-dw-sub">仅管理当前活动的协作者权限。<\/span>/u);
  assert.match(html, /<button aria-label="关闭" class="btn op-dw-close" type="button">✕<\/button>/u);
  assert.match(html, /<strong class="op-dw-sec-title">当前协作者（0）<\/strong>/u);
  assert.match(html, /role="status">正在读取当前角色…</u);
  assert.match(html, /<strong class="op-dw-sec-title">添加协作者<\/strong>/u);
  assert.match(html, /<span class="op-dw-label">参与者<\/span><input class="op-dw-input" data-event-role-subject="new" placeholder="请输入参与者 actor ID" value=""\/>/u);
  assert.match(html, /<span class="op-dw-label">角色<\/span><select class="op-dw-input" data-event-role-select="new">/u);
  for (const label of ["运营", "签到", "审核", "只读分析"]) assert.match(html, new RegExp(`<option value="[a-z_]+"[^>]*>${label}</option>`, "u"));
  assert.match(html, /<span class="op-dw-label">理由<\/span><input class="op-dw-input" data-event-role-reason="new" placeholder="授权理由（必填）" value=""\/>/u);
  assert.match(html, /<button class="btn op-dw-submit" data-event-role-action="grant" type="button">添加协作者<\/button>/u);
  assert.match(html, /<span class="op-dw-hint">ⓘ 权限仅对当前活动生效。<\/span>/u);
  const markup = html.replace(/<style>[\s\S]*?<\/style>/u, "");
  for (const mock of ["李青", "王萌", "陈川", "运营组", "管理员", "邮箱或用户名"]) assert.doesNotMatch(markup, new RegExp(mock, "u"));
  // 「数据查看」是设计 mock 的角色名；运营台副标「…现场签到与数据查看。」合法，只查角色 / 选项位置
  assert.doesNotMatch(markup, />数据查看</u);
});

// ── 行为 ──

test("drawer lists owner first with 活动负责人 and every delegated member with the design role tones; owner has no ··· menu", async () => {
  await withDrawer(respondWith((call) => {
    if (call.url === `${ACCESS}/roles`) {
      return Response.json({ data: rolePayload([
        { revision: 1, role: "check_in", subjectActorId: "user:b" },
        { revision: 2, role: "reviewer", subjectActorId: "user:c" },
        { revision: 3, role: "read_only_analyst", subjectActorId: "user:d" },
      ]), success: true });
    }
    return null;
  }), (renderer) => {
    assert.deepEqual(members(renderer), [OWNER_ID, "user:b", "user:c", "user:d"]);
    const body = text(renderer);
    assert.match(body, /当前协作者（4）/u);
    const chips = renderer.root.findAll((node) => node.props.className === "op-dw-role").map((node) => [node.children.join(""), node.props.style]);
    assert.deepEqual(chips, [
      ["活动负责人", { background: "#ECEEFB", color: "#2E3270" }],
      ["签到", { background: "#E6F1EC", color: "#2F6B4F" }],
      ["审核", { background: "#FBF1E4", color: "#9A6B22" }],
      ["只读分析", { background: "#F1F1FA", color: "#6B6F99" }],
    ]);
    // 候选池不可用 → 名字 = actorId，头像 = 后 2 位
    const avatars = renderer.root.findAll((node) => node.props.className === "op-dw-ava").map((node) => node.children.join(""));
    assert.deepEqual(avatars, ["er", ":b", ":c", ":d"]);
    const ownerRow = byProp(renderer, "data-event-role-member", OWNER_ID);
    assert.equal(ownerRow.findAllByType("details").length, 0);
    assert.equal(byProp(renderer, "data-event-role-member", "user:b").findAllByType("details").length, 1);
  });
});

// 旧 :86 「regrant reads a revoked subject's durable head revision before it writes」
test("grant reads a revoked subject's durable head revision before it PUTs, then refreshes the roster and toasts", async () => {
  let regranted = false;
  await withDrawer(respondWith((call) => {
    if (call.url === `${ACCESS}/roles`) {
      return Response.json({ data: regranted ? rolePayload([{ revision: 8, role: "operations", subjectActorId: "actor:revoked" }]) : rolePayload(), success: true });
    }
    if (call.url === `${ACCESS}/assignments/${encodeURIComponent("actor:revoked")}` && call.method === "GET") {
      return Response.json({ data: assignment({ revision: 7, role: "check_in", state: "revoked", subjectActorId: "actor:revoked" }), success: true });
    }
    if (call.url === `${ACCESS}/assignments/${encodeURIComponent("actor:revoked")}` && call.method === "PUT") {
      regranted = true;
      return Response.json({ data: assignment({ revision: 8, role: "operations", state: "active", subjectActorId: "actor:revoked" }), success: true });
    }
    return null;
  }), async (renderer, harness) => {
    assert.match(text(renderer), /除活动负责人外，尚无协作者。/u);
    await act(async () => {
      byProp(renderer, "data-event-role-subject", "new").props.onChange({ target: { value: "actor:revoked" } });
      byProp(renderer, "data-event-role-reason", "new").props.onChange({ target: { value: "签到班次恢复" } });
      await flush();
    });
    await act(async () => {
      byProp(renderer, "data-event-role-action", "grant").props.onClick();
      await flush();
    });
    assert.deepEqual(
      harness.observed.filter(({ url }) => !url.includes("/operations/admin")).map(({ method, url }) => ({ method, url })),
      [
        { method: "GET", url: `${ACCESS}/roles` },
        { method: "GET", url: `${ACCESS}/assignments/${encodeURIComponent("actor:revoked")}` },
        { method: "PUT", url: `${ACCESS}/assignments/${encodeURIComponent("actor:revoked")}` },
        { method: "GET", url: `${ACCESS}/roles` },
      ],
    );
    assert.equal(harness.observed.find((call) => call.method === "PUT")?.body, JSON.stringify({ expectedRevision: 7, reason: "签到班次恢复", role: "operations" }));
    assert.deepEqual(members(renderer), [OWNER_ID, "actor:revoked"]);
    const toast = renderer.root.find((node) => node.props.className === "op-toast");
    assert.equal(toast.children.join(""), "已按最新版本重新授予 运营（版本 8）。");
    assert.match(text(renderer), /当前协作者（2）/u);
  });
});

// 旧 :188 「role change and revoke each read the current revision and refresh the active role roster」
test("··· → 改角色 / 移除 each read the current revision, write with the reason and refresh the roster", async () => {
  let active = true;
  let currentRole: "operations" | "reviewer" = "operations";
  let revision = 4;
  const writes: { body: string | null; method: string }[] = [];
  await withDrawer(respondWith((call) => {
    if (call.url === `${ACCESS}/roles`) {
      return Response.json({ data: rolePayload(active ? [{ revision, role: currentRole, subjectActorId: OPERATOR_ID }] : []), success: true });
    }
    if (call.url !== `${ACCESS}/assignments/${encodeURIComponent(OPERATOR_ID)}`) return null;
    if (call.method === "GET") {
      return Response.json({ data: assignment({ revision, role: active ? currentRole : null, state: active ? "active" : null, subjectActorId: OPERATOR_ID }), success: true });
    }
    writes.push({ body: call.body, method: call.method });
    if (call.method === "PUT") {
      currentRole = "reviewer";
      revision = 5;
      return Response.json({ data: assignment({ revision, role: currentRole, state: "active", subjectActorId: OPERATOR_ID }), success: true });
    }
    active = false;
    revision = 6;
    return Response.json({ data: assignment({ revision, role: currentRole, state: "revoked", subjectActorId: OPERATOR_ID }), success: true });
  }), async (renderer) => {
    // 打开前无行内表单
    assert.equal(renderer.root.findAll((node) => typeof node.props["data-event-role-edit"] === "string").length, 0);
    await act(async () => { byProp(renderer, "data-event-role-action", `edit:${OPERATOR_ID}`).props.onClick(); });
    assert.equal(byProp(renderer, "data-event-role-edit", `change:${OPERATOR_ID}`).findAllByType("select").length, 1);
    await act(async () => {
      byProp(renderer, "data-event-role-select", OPERATOR_ID).props.onChange({ target: { value: "reviewer" } });
      byProp(renderer, "data-event-role-reason", OPERATOR_ID).props.onChange({ target: { value: "改为报名审核" } });
      await flush();
    });
    await act(async () => {
      byProp(renderer, "data-event-role-action", `change:${OPERATOR_ID}`).props.onClick();
      await flush();
    });
    assert.deepEqual(writes[0], { body: JSON.stringify({ expectedRevision: 4, reason: "改为报名审核", role: "reviewer" }), method: "PUT" });
    assert.equal(byProp(renderer, "data-event-role-member", OPERATOR_ID).find((node) => node.props.className === "op-dw-role").children.join(""), "审核");

    await act(async () => { byProp(renderer, "data-event-role-action", `remove:${OPERATOR_ID}`).props.onClick(); });
    const removeForm = byProp(renderer, "data-event-role-edit", `revoke:${OPERATOR_ID}`);
    assert.equal(removeForm.findAllByType("select").length, 0);
    assert.equal(removeForm.findAllByType("input")[0].props.placeholder, "移除理由（必填）");
    await act(async () => {
      byProp(renderer, "data-event-role-reason", OPERATOR_ID).props.onChange({ target: { value: "审核班次结束" } });
      await flush();
    });
    await act(async () => {
      byProp(renderer, "data-event-role-action", `revoke:${OPERATOR_ID}`).props.onClick();
      await flush();
    });
    assert.deepEqual(writes[1], { body: JSON.stringify({ expectedRevision: 5, reason: "审核班次结束" }), method: "DELETE" });
    assert.deepEqual(members(renderer), [OWNER_ID]);
    assert.match(text(renderer), /当前协作者（1）/u);
  });
});

test("409 on a change reloads the roster and shows the conflict message verbatim at the top of the panel", async () => {
  let roleCalls = 0;
  await withDrawer(respondWith((call) => {
    if (call.url === `${ACCESS}/roles`) {
      roleCalls += 1;
      return Response.json({ data: rolePayload([{ revision: roleCalls, role: "operations", subjectActorId: OPERATOR_ID }]), success: true });
    }
    if (call.url !== `${ACCESS}/assignments/${encodeURIComponent(OPERATOR_ID)}`) return null;
    if (call.method === "GET") return Response.json({ data: assignment({ revision: 1, role: "operations", state: "active", subjectActorId: OPERATOR_ID }), success: true });
    return Response.json({ error: { message: "stale revision" }, success: false }, { status: 409 });
  }), async (renderer) => {
    await act(async () => { byProp(renderer, "data-event-role-action", `edit:${OPERATOR_ID}`).props.onClick(); });
    await act(async () => {
      byProp(renderer, "data-event-role-select", OPERATOR_ID).props.onChange({ target: { value: "check_in" } });
      byProp(renderer, "data-event-role-reason", OPERATOR_ID).props.onChange({ target: { value: "并发冲突演练" } });
      await flush();
    });
    await act(async () => {
      byProp(renderer, "data-event-role-action", `change:${OPERATOR_ID}`).props.onClick();
      await flush();
    });
    assert.equal(roleCalls, 2);
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.equal(alert.props.className, "op-note op-note-error op-dw-note");
    assert.equal(alertText(renderer), "角色刚被其他管理员更新；已刷新当前版本，请确认后重试。");
    assert.equal(renderer.root.findAll((node) => node.props.className === "op-toast").length, 0);
  });
});

test("empty reason is rejected client-side before any assignment read", async () => {
  await withDrawer(respondWith((call) => (call.url === `${ACCESS}/roles` ? Response.json({ data: rolePayload(), success: true }) : null)), async (renderer, harness) => {
    await act(async () => {
      byProp(renderer, "data-event-role-subject", "new").props.onChange({ target: { value: "actor:new" } });
      await flush();
    });
    await act(async () => {
      byProp(renderer, "data-event-role-action", "grant").props.onClick();
      await flush();
    });
    assert.equal(alertText(renderer), "请填写 1–1000 个字符的授权或变更原因。");
    assert.equal(harness.observed.filter((call) => call.url.includes("/assignments/")).length, 0);
  });
});

test("participant picker replaces the actor-id input when the candidate pool loads, and names/initials come from it", async () => {
  const harness = install((call) => {
    if (call.url.includes("/operations/admin")) {
      return Response.json({ data: { participants: [
        { actorId: "user:b", company: "Orbit", displayName: "Bob 参与者" },
        { actorId: "user:a", company: null, displayName: "Alice 参与者" },
      ] }, success: true });
    }
    if (call.url === `${ACCESS}/roles`) return Response.json({ data: rolePayload([{ revision: 1, role: "check_in", subjectActorId: "user:b" }]), success: true });
    throw new Error(`Unexpected request ${call.method} ${call.url}`);
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsRolesDrawer closeHref={CLOSE_HREF} eventId={EVENT_ID} />);
      await flush();
    });
    const picker = renderer!.root.find((node) => node.props["data-event-role-participant-picker"] !== undefined);
    assert.equal(picker.type, "select");
    assert.deepEqual(picker.findAllByType("option").map((node) => node.props.value), ["", "user:a", "user:b", MANUAL_SUBJECT]);
    assert.equal(picker.findAllByType("option").at(-1)!.children.join(""), "其他账号 ID…");
    assert.equal(renderer!.root.findAll((node) => node.props["data-event-role-subject"] === "new").length, 0);
    const row = byProp(renderer!, "data-event-role-member", "user:b");
    assert.equal(row.find((node) => node.props.className === "op-dw-name").children.join(""), "Bob 参与者 · Orbit");
    assert.equal(row.find((node) => node.props.className === "op-dw-ava").children.join(""), "B");
    await act(async () => { picker.props.onChange({ target: { value: "user:a" } }); });
    assert.equal(picker.props.value, "user:a");
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
});

// 任务 7 评审遗留 1：候选池存在时仍能给活动之外的人员粘贴准确账号 ID（旧工作区能力）
test("其他账号 ID… switches the participant picker to a manual actor-id input; the grant PUTs the pasted id, a picked participant switches back", async () => {
  const observedPuts: string[] = [];
  const harness = install((call) => {
    if (call.url.includes("/operations/admin")) {
      return Response.json({ data: { participants: [{ actorId: "user:b", company: "Orbit", displayName: "Bob 参与者" }] }, success: true });
    }
    if (call.url === `${ACCESS}/roles`) return Response.json({ data: rolePayload(), success: true });
    if (call.url === `${ACCESS}/assignments/${encodeURIComponent("actor:outsider")}` && call.method === "GET") {
      return Response.json({ data: assignment({ revision: 0, role: null, state: null, subjectActorId: "actor:outsider" }), success: true });
    }
    if (call.url === `${ACCESS}/assignments/${encodeURIComponent("actor:outsider")}` && call.method === "PUT") {
      observedPuts.push(call.body ?? "");
      return Response.json({ data: assignment({ revision: 1, role: "reviewer", state: "active", subjectActorId: "actor:outsider" }), success: true });
    }
    throw new Error(`Unexpected request ${call.method} ${call.url}`);
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsRolesDrawer closeHref={CLOSE_HREF} eventId={EVENT_ID} />);
      await flush();
    });
    const picker = () => renderer!.root.find((node) => node.props["data-event-role-participant-picker"] !== undefined);
    const manualInput = () => renderer!.root.findAll((node) => node.props["data-event-role-subject"] === "new");
    assert.equal(manualInput().length, 0, "select only while a participant is expected");
    await act(async () => { picker().props.onChange({ target: { value: MANUAL_SUBJECT } }); });
    assert.equal(picker().props.value, MANUAL_SUBJECT, "select stays on 其他账号 ID… and is not sent as an actor id");
    assert.equal(manualInput().length, 1);
    assert.equal(manualInput()[0].props.placeholder, "请输入准确的账号 ID（可为活动之外的人员）");
    await act(async () => {
      manualInput()[0].props.onChange({ target: { value: "actor:outsider" } });
      byProp(renderer!, "data-event-role-select", "new").props.onChange({ target: { value: "reviewer" } });
      byProp(renderer!, "data-event-role-reason", "new").props.onChange({ target: { value: "外部审核员" } });
      await flush();
    });
    await act(async () => {
      byProp(renderer!, "data-event-role-action", "grant").props.onClick();
      await flush();
    });
    assert.deepEqual(observedPuts.map((body) => JSON.parse(body)), [{ expectedRevision: 0, reason: "外部审核员", role: "reviewer" }]);
    assert.equal(manualInput().length, 1, "manual mode survives the grant (id cleared by the hook)");
    assert.equal(manualInput()[0].props.value, "");
    // 选回参与者 → 文本框收起，值 = 参与者 actor ID
    await act(async () => { picker().props.onChange({ target: { value: "user:b" } }); });
    assert.equal(manualInput().length, 0);
    assert.equal(picker().props.value, "user:b");
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
});

test("a failed roles read shows the error with 刷新角色, which re-fetches /roles without closing the drawer", async () => {
  let roleCalls = 0;
  await withDrawer(respondWith((call) => {
    if (call.url !== `${ACCESS}/roles`) return null;
    roleCalls += 1;
    return roleCalls === 1
      ? Response.json({ error: { message: "角色表暂时不可用" }, success: false }, { status: 503 })
      : Response.json({ data: rolePayload([{ revision: 1, role: "check_in", subjectActorId: OPERATOR_ID }]), success: true });
  }), async (renderer, harness) => {
    assert.equal(alertText(renderer), "角色表暂时不可用");
    const reload = renderer.root.find((node) => node.props["data-event-role-reload"] !== undefined);
    assert.equal(reload.props.disabled, false);
    assert.equal(reload.children.join(""), "刷新角色");
    await act(async () => {
      reload.props.onClick();
      await flush();
    });
    assert.equal(roleCalls, 2);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    assert.deepEqual(members(renderer), [OWNER_ID, OPERATOR_ID]);
    assert.deepEqual(harness.assigned, [], "reload never navigates");
  });
});

test("✕, overlay click and Esc navigate back to the tab without ?drawer; panel clicks and editable-target Esc do not", async () => {
  await withDrawer(respondWith((call) => (call.url === `${ACCESS}/roles` ? Response.json({ data: rolePayload(), success: true }) : null)), async (renderer, harness) => {
    const overlay = byProp(renderer, "data-ops-drawer", "roles");
    const panel = renderer.root.find((node) => node.props.role === "dialog");
    // 面板内点击（target ≠ currentTarget）不关闭
    overlay.props.onClick({ currentTarget: overlay, target: panel });
    assert.deepEqual(harness.assigned, []);
    overlay.props.onClick({ currentTarget: overlay, target: overlay });
    assert.deepEqual(harness.assigned, [CLOSE_HREF]);
    renderer.root.find((node) => node.props["aria-label"] === "关闭").props.onClick();
    assert.deepEqual(harness.assigned, [CLOSE_HREF, CLOSE_HREF]);
    assert.equal(harness.listeners.get("keydown")?.size, 1);
    let prevented = 0;
    harness.dispatch("keydown", { key: "Escape", preventDefault() { prevented += 1; }, target: null });
    assert.deepEqual(harness.assigned, [CLOSE_HREF, CLOSE_HREF, CLOSE_HREF]);
    assert.equal(prevented, 1);
    harness.dispatch("keydown", { key: "Enter", preventDefault() { prevented += 1; }, target: null });
    assert.equal(harness.assigned.length, 3);
  });
});

test("closeHref keeps ?tab=match when the drawer was opened from the match tab", async () => {
  const harness = install(respondWith((call) => (call.url === `${ACCESS}/roles` ? Response.json({ data: rolePayload(), success: true }) : null)));
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsConsole canManageRoles drawer="roles" event={EVENT} tab="match" />);
      await flush();
    });
    assert.equal(renderer!.root.findByType(OpsRolesDrawer).props.closeHref, `${CLOSE_HREF}?tab=match`);
    renderer!.root.find((node) => node.props["aria-label"] === "关闭").props.onClick();
    assert.deepEqual(harness.assigned, [`${CLOSE_HREF}?tab=match`]);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
});
