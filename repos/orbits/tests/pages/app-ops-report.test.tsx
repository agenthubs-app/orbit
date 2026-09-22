import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { exportCsvHref } from "../../app/(app)/app/events/ops-0918/ops-model";
import { OpsReport } from "../../app/(app)/app/events/ops-0918/ops-report";
import { OpsConsoleShell } from "../../app/(app)/app/events/ops-0918/ops-shell";
import { buttonNamed, EVENT, EVENT_ID, flush, text } from "../support/ops-console-fixture";

// 运营台 任务 5：数据报告屏（设计 369–445 行；`/app/events/[id]/analytics`）。特征化用例自 tests/pages/event-analytics-route.test.tsx
// （1 例：双角色切换）改指本屏；另加 SSR 结构、organizer 单视图（403 attendee）、错误 + 重试、页面源码断言
// （替代 event-analytics-page-shell.test.ts）。数据形状与 event-analytics-route.test.tsx 一致。

const AGGREGATE = `/api/events/${encodeURIComponent(EVENT_ID)}/analytics/aggregate`;
const ATTENDEE = `/api/events/${encodeURIComponent(EVENT_ID)}/analytics/attendee`;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const appointmentCounts = { awaitingResponse: 0, cancelled: 0, completed: 1, confirmed: 1, draft: 0, negotiating: 0, reschedulePending: 0 };
const contactRequestCounts = { accepted: 1, awaitingTargetConsent: 0, declined: 0, withdrawn: 0 };

function organizerAggregate(overrides: Record<string, unknown> = {}) {
  return {
    appointments: appointmentCounts,
    checkIns: { checkedIn: 2 },
    contactRequests: contactRequestCounts,
    encounters: { captured: 1, projected: 1 },
    eventId: EVENT_ID,
    grouping: { published: true, roundOne: { assignedParticipants: 2, tables: 1 }, roundTwo: { assignedParticipants: 2, tables: 1 } },
    kind: "organizer_aggregate",
    registrations: { active: 3, cancelled: 0 },
    roi: {
      metrics: {
        attributionCoverage: { declaredCompletedOperations: 1, stronglyAttributedCompletedOperations: 1, rate: { denominator: 1, numerator: 1, value: 1 } },
        checkedInParticipants: 2,
        completedAttributedAgentOperations: 1,
        effectiveConnectionPairs: 1,
        effectiveConnectionParticipants: 2,
        effectiveConnectionRate: { denominator: 2, numerator: 2, value: 1 },
        mutualConnections: { acceptedRelationshipPairs: 1, distinctConnectedCheckIns: 2, mutuallyCheckedInPairs: 1, participationRate: { denominator: 2, numerator: 2, value: 1 } },
        strongActions: { appointments: 1, followupReminders: 4, humanEncounterNotes: 1, messageDrafts: 1 },
      },
      snapshot: {
        finalizedAt: null,
        formulaHash: "formula:test",
        metricVersion: "event-roi-v1",
        revision: null,
        sourceWatermark: { appointmentCount: 0, appointmentUpdatedAt: null, checkInCount: 2, checkInRevision: 1, completedAgentReceiptCount: 1, completedAgentReceiptUpdatedAt: null, configurationVersion: 1, membershipCount: 2, membershipRevision: 1, relationshipPairCount: 1, relationshipAcceptedAt: null },
        status: "live",
        windowEndsAt: "2026-08-12T08:00:00.000Z",
      },
    },
    ...overrides,
  };
}

function attendeeReport() {
  return {
    aiArtifact: { artifact: null, failureCode: null, status: "unconfigured" },
    appointments: appointmentCounts,
    checkIn: { checkedInAt: "2026-10-01T00:05:00.000Z", status: "checked_in" },
    contactRequests: contactRequestCounts,
    encounters: { captured: 1, projected: 1 },
    eventId: EVENT_ID,
    grouping: { roundOneTableNumber: 1, roundTwoTableNumber: 2, status: "available" },
    kind: "attendee_report",
    registration: { status: "active" },
  };
}

function install(respond: (url: string) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const observed: string[] = [];
  globalThis.fetch = (async (url) => {
    observed.push(String(url));
    return respond(String(url));
  }) as typeof fetch;
  return { observed, restore() { globalThis.fetch = originalFetch; } };
}

async function withReport(
  respond: (url: string) => Response | Promise<Response>,
  run: (renderer: ReactTestRenderer, harness: ReturnType<typeof install>) => Promise<void> | void,
): Promise<void> {
  const harness = install(respond);
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<OpsReport event={EVENT} />);
      await flush();
    });
    await run(renderer!, harness);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
}

function stats(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.props["data-ops-rstat"] === "string");
}

function kind(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.props["data-event-analytics-kind"] === "string").map((node) => node.props["data-event-analytics-kind"] as string);
}

test("report SSR renders the console head with the 数据报告 tab active, the single 整体视图 pill, the loading copy and no design mock", () => {
  const html = renderToStaticMarkup(
    <OpsConsoleShell event={EVENT} more={[{ href: exportCsvHref(EVENT.id), label: "导出 CSV" }]} view="report">
      <OpsReport event={EVENT} />
    </OpsConsoleShell>,
  );
  assert.match(html, /<h1 class="op-h1">数据报告<\/h1>/u);
  assert.match(html, /aria-current="page" class="op-tab op-tab-on" href="[^"]+\/analytics" role="tab">数据报告</u);
  assert.match(html, /活动中心<\/a> \/ <a class="op-crumb-link" href="[^"]+">屏级替换夹具活动<\/a> \/ <a class="op-crumb-link" href="[^"]+">运营台<\/a> \/ 数据报告/u);
  assert.match(html, /role="menuitem">导出 CSV/u);
  assert.match(html, /<button aria-pressed="true" class="btn op-rview" data-event-analytics-view="organizer_aggregate" style="background:#2E3270;color:#FFFFFF;font-weight:500" type="button">整体视图<\/button>/u);
  assert.doesNotMatch(html, /我的视图/u, "attendee pill only when both reports are readable");
  assert.match(html, /正在读取活动证据…/u);
  const markup = html.replace(/<style>[\s\S]*?<\/style>/u, "");
  assert.doesNotMatch(markup, /data-ops-rstat=|报名趋势|参会者来源|校友推荐|Tokyo AI Meetup|86|已完成跟进|61% 完成率/u);
});

test("organizer-only: the aggregate fills the four cards, 现场转化, 会后跟进 (no 已完成跟进 cell) and the report notes with the real JST window", async () => {
  await withReport((url) => {
    if (url === AGGREGATE) return Response.json({ data: organizerAggregate(), success: true });
    if (url === ATTENDEE) return Response.json({ error: { message: "forbidden" }, success: false }, { status: 403 });
    throw new Error(`Unexpected analytics request ${url}`);
  }, (renderer, harness) => {
    assert.deepEqual([...harness.observed].sort(), [AGGREGATE, ATTENDEE]);
    assert.deepEqual(kind(renderer), ["organizer_aggregate"]);
    assert.deepEqual(stats(renderer).map((node) => [node.props["data-ops-rstat"], node.props.style.background]), [
      ["registrations", "#F7F7FD"],
      ["checkedIn", "#F1F8F4"],
      ["contacts", "#FDF8EF"],
      ["followups", "#F7F7FD"],
    ]);
    const body = text(renderer);
    assert.match(body, /报名人数3/u);
    assert.match(body, /到场人数2/u);
    assert.match(body, /联系方式交换1/u);
    assert.match(body, /后续跟进4/u);
    assert.match(body, /现场转化/u);
    assert.match(body, /签到率67%2 \/ 3/u);
    assert.match(body, /联系方式交换率33%1 \/ 3/u);
    assert.match(body, /会后跟进/u);
    assert.match(body, /已生成 follow-up4基于现场互动与交换信息/u);
    assert.doesNotMatch(body, /已完成跟进/u, "no field → cell omitted");
    assert.doesNotMatch(body, /报名趋势|参会者来源/u, "no fields → cards omitted");
    assert.match(body, /数据统计时间本报告数据统计截至 2026年8月12日 17:00（东京时间）。/u);
    assert.match(body, /个人视图授权「我的视图」仅展示你有权限查看的部分数据，可能与整体数据存在差异。/u);
    assert.match(body, /数据不可用情况如因参会者未授权、现场未签到或信息不完整，部分数据可能无法统计。/u);
    assert.equal(renderer.root.findAll((node) => node.props["data-event-analytics-view"] === "attendee_report").length, 0, "single pill");
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    assert.doesNotMatch(body, /正在读取活动证据/u);
  });
});

test("zero registrations render — for both rates instead of a fake percentage", async () => {
  await withReport((url) => {
    if (url === AGGREGATE) return Response.json({ data: organizerAggregate({ checkIns: { checkedIn: 0 }, contactRequests: { ...contactRequestCounts, accepted: 0 }, registrations: { active: 0, cancelled: 0 } }), success: true });
    return Response.json({ error: { message: "forbidden" }, success: false }, { status: 403 });
  }, (renderer) => {
    assert.match(text(renderer), /签到率—0 \/ 0/u);
    assert.match(text(renderer), /联系方式交换率—0 \/ 0/u);
  });
});

test("dual-role users can switch between organizer aggregate and their own attendee report", async () => {
  await withReport((url) => {
    if (url === AGGREGATE) return Response.json({ data: organizerAggregate(), success: true });
    if (url === ATTENDEE) return Response.json({ data: attendeeReport(), success: true });
    throw new Error(`Unexpected analytics request ${url}`);
  }, async (renderer) => {
    assert.deepEqual(kind(renderer), ["organizer_aggregate"]);
    const attendeeButton = renderer.root.find((node) => node.props["data-event-analytics-view"] === "attendee_report");
    assert.equal(attendeeButton.props["aria-pressed"], false);
    assert.deepEqual([attendeeButton.props.style.background, attendeeButton.props.style.color, attendeeButton.props.style.fontWeight], ["transparent", "#6B6F99", 400]);
    await act(async () => {
      attendeeButton.props.onClick();
      await flush();
    });
    const pressed = renderer.root.find((node) => node.props["data-event-analytics-view"] === "attendee_report");
    assert.equal(pressed.props["aria-pressed"], true);
    assert.deepEqual([pressed.props.style.background, pressed.props.style.color, pressed.props.style.fontWeight], ["#2E3270", "#FFFFFF", 500]);
    assert.deepEqual(kind(renderer), ["attendee_report"]);
    const body = text(renderer);
    assert.match(body, /已同意联系1/u);
    assert.match(body, /本人交流记录1/u);
    assert.match(body, /已投影交流1/u);
    assert.match(body, /已完成约谈1/u);
    assert.match(body, /签到状态/u);
    assert.match(body, /已签到09:05/u, "checkedInAt in JST HH:mm");
    assert.match(body, /分组状态/u);
    assert.match(body, /已可见 · 第一轮第 1 桌 · 第二轮第 2 桌/u);
    assert.match(body, /AI 会后产物（只读）/u);
    assert.match(body, /状态未启用/u);
    assert.match(body, /尚无可读取的 AI 产物；不会触发生成或返回替代文案。/u);
    assert.equal(renderer.root.find((node) => node.props["data-event-analytics-ai-status"] !== undefined).props["data-event-analytics-ai-status"], "unconfigured");
    assert.doesNotMatch(body, /数据统计时间/u, "attendee report has no ROI window → row omitted");
    assert.match(body, /个人视图授权/u);
    await act(async () => {
      buttonNamed(renderer, "整体视图").props.onClick();
      await flush();
    });
    assert.deepEqual(kind(renderer), ["organizer_aggregate"]);
  });
});

test("a double 403 shows the Chinese denial as an error bar; 重试 re-fetches both reports", async () => {
  let calls = 0;
  await withReport(() => {
    calls += 1;
    if (calls <= 2) return Response.json({ error: { message: "forbidden" }, success: false }, { status: 403 });
    return Response.json({ data: organizerAggregate(), success: true });
  }, async (renderer) => {
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.match(alert.children.map((child) => (typeof child === "string" ? child : child.children.join(""))).join(""), /当前账号没有可查看的活动汇总或个人报告。/u);
    assert.equal(stats(renderer).length, 0);
    assert.doesNotMatch(text(renderer), /正在读取活动证据/u);
    await act(async () => {
      buttonNamed(renderer, "重试").props.onClick();
      await flush();
    });
    assert.equal(calls, 4, "retry re-fetches aggregate + attendee");
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    assert.equal(stats(renderer).length, 4);
  });
});

test("analytics page keeps its auth()-only gate, reads the published title without getEvent and mounts the report screen inside the ops-0918 shell", () => {
  const page = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/analytics/page.tsx"), "utf8");
  const screen = readFileSync(join(projectRoot, "app/(app)/app/events/ops-0918/ops-report.tsx"), "utf8");
  assert.match(page, /await Promise\.all\(\[params, auth\(\)\]\)/u);
  assert.match(page, /redirect\(/u);
  assert.doesNotMatch(page, /requireEventCapability/u, "门禁不动：分析接口按角色返回 403（报告屏空态）");
  assert.match(page, /getPublishedEvent\(/u);
  assert.doesNotMatch(page, /loadEventOperationsPageEvent|\.getEvent\(/u, "no unpublished-title leak without a capability gate");
  assert.match(page, /<OrbitReferenceStyles \/>/u);
  assert.match(page, /data-orbit-real-page="ops-0918"/u);
  assert.match(page, /<AccountTopNav active="events" \/>/u);
  assert.match(page, /view="report"/u);
  assert.match(page, /label: "导出 CSV"/u);
  assert.doesNotMatch(page, /EventAnalyticsRoute|PublicTopNav|className="orbit-shell"|data-appscroll|data-orbit-real-page="event-analytics"/u);
  assert.match(screen, /useEventAnalytics\(event\.id, activeView, setActiveView\)/u);
  assert.match(screen, /canSwitchViews/u);
});
