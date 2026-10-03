/**
 * W0010 SC-03：三处入口共用的确认组件（`plan-match-sheet.tsx`）。
 *   - 审阅页最后一屏 `BatchPlanMatch`：快返回就地确认；超过 8 秒直接结束并说明；没有候选不显示
 *   - 逐条「是 / 不是」、确认后的「约 TA」行动卡（定时间 / 起草邮件即将开放 / 记一次互动）
 *   - 计划页「待确认 N」角标打开同一组件；联系人详情的「关联到计划人脉需求」
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitPlan } from "../../app/(app)/app/agent/iorbit-0918/iorbit-plan";
import type { PlanMatchList } from "../../app/(app)/app/agent/iorbit-0918/plan-match-client";
import {
  BatchPlanMatch,
  PLAN_MATCH_SCHEDULE_HREF,
  PLAN_MATCH_WAIT_MS,
  PlanMatchSheet,
  PlanNeedLinkPanel,
} from "../../app/(app)/app/agent/iorbit-0918/plan-match-sheet";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

const LIST: PlanMatchList = {
  candidates: [
    {
      aiReason: null,
      contactId: "contact:sato",
      contactName: "佐藤 健",
      contactSubtitle: "Cloudline KK · 事业部长",
      id: "cand-1",
      industry: { en: "Industry Associations", zh: "行业协会" },
      needId: "n-connector",
      needTitle: "能帮你引荐的行业前辈",
      strength: "strong",
      tier: "rule",
    },
    {
      aiReason: null,
      contactId: "contact:ito",
      contactName: "伊藤 翔",
      contactSubtitle: null,
      id: "cand-2",
      industry: { en: "Community & Nonprofit", zh: "社群与非营利" },
      needId: "n-connector",
      needTitle: "能帮你引荐的行业前辈",
      strength: "candidate",
      tier: "rule",
    },
  ],
  contactCount: 2,
  pendingByNeed: { "n-connector": 2 },
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function text(node: ReactTestInstance | ReactTestRenderer): string {
  return JSON.stringify("toJSON" in node ? node.toJSON() : node.children).replace(/","/g, "");
}

async function mount(
  t: TestContext,
  element: React.ReactElement,
  respond: (call: Call) => Response | Promise<Response> = () => Response.json({ success: false }, { status: 404 }),
) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: () => undefined,
      clearTimeout: (id: unknown) => clearTimeout(id as never),
      location: { href: "https://orbit.test/app/agent/plan", pathname: "/app/agent/plan", search: "" },
      removeEventListener: () => undefined,
      setTimeout: (handler: () => void, ms?: number) => setTimeout(handler, ms),
    },
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null, addEventListener: () => undefined, removeEventListener: () => undefined },
    writable: true,
  });
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const call = { body: init?.body ? JSON.parse(String(init.body)) : undefined, method: (init?.method ?? "GET").toUpperCase(), url: String(input) };
    calls.push(call);
    return respond(call);
  });
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(element);
  });
  const settle = async (rounds = 4) => {
    for (let index = 0; index < rounds; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };
  await settle();
  t.after(() => {
    act(() => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { calls, root, settle };
}

const byData = (root: ReactTestRenderer, key: string) =>
  root.root.findAll((node) => typeof node.type === "string" && node.props?.[key] !== undefined);

test("the review screen waits at most 8 seconds by default", () => {
  assert.equal(PLAN_MATCH_WAIT_MS, 8_000);
});

test("a fast match result is confirmed right on the review screen", async (t) => {
  const runs: string[] = [];
  const mounted = await mount(t, <BatchPlanMatch batchId="batch-1" run={async (batchId) => (runs.push(batchId), LIST)} waitMs={1_000} />);
  await mounted.settle();
  assert.deepEqual(runs, ["batch-1"]);
  assert.equal(byData(mounted.root, "data-plan-match-batch")[0]!.props["data-plan-match-batch"], "ready");
  assert.equal(byData(mounted.root, "data-plan-match-candidate").length, 2);
  const html = text(mounted.root);
  assert.ok(html.includes("佐藤 健") && html.includes("强匹配") && html.includes("同属二级行业：行业协会"));
});

test("a slow match result falls through after the wait with a pointer to Today and My plan", async (t) => {
  let aborted = false;
  const mounted = await mount(
    t,
    <BatchPlanMatch
      batchId="batch-1"
      run={(_batchId, signal) =>
        new Promise<PlanMatchList>(() => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
        })
      }
      waitMs={20}
    />,
  );
  assert.equal(byData(mounted.root, "data-plan-match-batch")[0]!.props["data-plan-match-batch"], "waiting");
  assert.ok(text(mounted.root).includes("正在对照你的计划"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  assert.equal(byData(mounted.root, "data-plan-match-batch")[0]!.props["data-plan-match-batch"], "late");
  assert.ok(text(mounted.root).includes("匹配结果出来后，会出现在 iOrbit 今日要事和「我的计划」里"));
  assert.equal(aborted, true);
  assert.equal(byData(mounted.root, "data-plan-match-candidate").length, 0);
});

test("no candidates means the review screen shows nothing extra", async (t) => {
  const mounted = await mount(t, <BatchPlanMatch batchId="b" run={async () => ({ candidates: [], contactCount: 0, pendingByNeed: {} })} />);
  await mounted.settle();
  assert.equal(mounted.root.toJSON(), null);
});

test("yes creates the 约 TA action card with three buttons; no removes the row", async (t) => {
  const decided: Array<[string, string]> = [];
  const mounted = await mount(
    t,
    <PlanMatchSheet candidates={LIST.candidates} onDecided={(id, decision) => decided.push([id, decision])} />,
    (call) => {
      if (call.url === "/api/agent/plans/candidates") {
        const body = call.body as { candidateId: string; decision: string };
        return Response.json({
          data: {
            candidateId: body.candidateId,
            link: body.decision === "accept" ? { action: { id: "a-new", meta: { contactId: "contact:sato" }, title: "约 佐藤 健" }, need: { id: "n-connector" } } : null,
            status: body.decision === "accept" ? "accepted" : "dismissed",
          },
          success: true,
        });
      }
      if (call.url === "/api/agent/plans/items/a-new/interaction") return Response.json({ data: {}, success: true });
      return Response.json({ success: false }, { status: 404 });
    },
  );
  const [yes] = byData(mounted.root, "data-plan-match-yes");
  await act(async () => yes!.props.onClick());
  await mounted.settle();
  // 第一行已经变成行动卡，剩下的「不是」按钮属于第二行。
  const [no] = byData(mounted.root, "data-plan-match-no");
  await act(async () => no!.props.onClick());
  await mounted.settle();
  assert.deepEqual(decided, [["cand-1", "accept"], ["cand-2", "dismiss"]]);
  assert.deepEqual(
    mounted.calls.filter((call) => call.url === "/api/agent/plans/candidates").map((call) => call.body),
    [{ candidateId: "cand-1", decision: "accept" }, { candidateId: "cand-2", decision: "dismiss" }],
  );
  assert.equal(byData(mounted.root, "data-plan-match-candidate").length, 1, "the dismissed row is gone");
  const html = text(mounted.root);
  assert.ok(html.includes("已加入本周：约 佐藤 健"));

  const schedule = mounted.root.root.findAll((node) => node.type === "a" && node.props.href === PLAN_MATCH_SCHEDULE_HREF);
  assert.equal(schedule.length, 1);
  const [draft] = byData(mounted.root, "data-plan-match-draft");
  assert.equal(draft!.props.disabled, false, "drafting is available on click");
  assert.ok(!mounted.calls.some((call) => call.url.endsWith("/draft")), "nothing is drafted before the click");
  const [interaction] = byData(mounted.root, "data-plan-match-interaction");
  await act(async () => interaction!.props.onClick());
  await mounted.settle();
  const posted = mounted.calls.find((call) => call.url === "/api/agent/plans/items/a-new/interaction");
  assert.ok(posted);
  assert.match(String((posted.body as { idempotencyKey: string }).idempotencyKey), /^plan-interaction:/);
  assert.ok(text(mounted.root).includes("已记下 · 已建立联系"));
});

test("a failed decision keeps the row and explains it", async (t) => {
  const mounted = await mount(t, <PlanMatchSheet candidates={LIST.candidates.slice(0, 1)} />, () =>
    Response.json({ error: { message: "服务暂时不可用" }, success: false }, { status: 503 }),
  );
  const [yes] = byData(mounted.root, "data-plan-match-yes");
  await act(async () => yes!.props.onClick());
  await mounted.settle();
  assert.equal(byData(mounted.root, "data-plan-match-candidate").length, 1);
  assert.ok(text(mounted.root).includes("没能保存。（服务暂时不可用）"));
});

test("the plan page shows 待确认 N next to a need and opens the same sheet for that need only", async (t) => {
  const mounted = await mount(t, <IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />, (call) =>
    call.url === "/api/agent/plans/candidates" ? Response.json({ data: LIST, success: true }) : Response.json({ success: false }, { status: 404 }),
  );
  await mounted.settle();
  const badges = byData(mounted.root, "data-orbit-plan-need-matches");
  assert.equal(badges.length, 1);
  assert.equal(badges[0]!.props["data-orbit-plan-need-matches"], "n-connector");
  assert.ok(text(badges[0]!).includes("待确认 2"));
  await act(async () => badges[0]!.props.onClick());
  assert.equal(byData(mounted.root, "data-plan-match-dialog").length, 1);
  assert.equal(byData(mounted.root, "data-plan-match-candidate").length, 2);
  assert.ok(text(mounted.root).includes("可能对应这条需求的人"));
});

test("the plan page renders no badge when the match service is unreachable", () => {
  const html = renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />);
  assert.doesNotMatch(html, /data-orbit-plan-need-matches/);
});

test("matched 约 TA actions carry the three buttons on the plan page's this-week list", async (t) => {
  const snapshot = planSnapshotFixture();
  snapshot.items.push({
    ...snapshot.items[0]!,
    contactLinks: [{ contactId: "contact:sato", establishedAt: null, linkedAt: "2026-09-28T01:00:00.000Z", state: "linked" }],
    detail: "人脉需求：能帮你引荐的行业前辈",
    id: "a-match",
    linkedContactIds: ["contact:sato"],
    meta: { contactId: "contact:sato", needItemId: "n-connector", source: "network_match" },
    sortKey: 99,
    title: "约 佐藤 健",
  });
  const html = renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={snapshot} now={PLAN_NOW} />);
  const row = html.slice(html.indexOf('data-orbit-plan-action="a-match"'));
  assert.match(row, /data-plan-match-action="a-match"/);
  assert.match(row.slice(0, row.indexOf("data-orbit-plan-action=", 10) > 0 ? row.indexOf("data-orbit-plan-action=", 10) : undefined), /定时间[\s\S]*起草邮件[\s\S]*记一次互动/);
  // 普通行动没有这组按钮。
  const start = html.indexOf('data-orbit-plan-action="a-this-week"');
  const plain = html.slice(start, html.indexOf("data-orbit-plan-action=", start + 10));
  assert.doesNotMatch(plain, /data-plan-match-action/);
});

test("the contact detail links the contact to a need of the actor's plan", async (t) => {
  const posts: unknown[] = [];
  let linked = 0;
  const mounted = await mount(t, <PlanNeedLinkPanel contactId="contact:sato" onLinked={() => { linked += 1; }} />, (call) => {
    // W0021：关联弹层只要条目，读首页视图（不含进展记录）。
    if (call.url === "/api/agent/plans/current?view=home") return Response.json({ data: planSnapshotFixture(), success: true });
    if (call.url === "/api/agent/plans/candidates" && call.method === "POST") {
      posts.push(call.body);
      return Response.json({
        data: { action: { id: "a-new", meta: { contactId: "contact:sato" }, title: "约 佐藤 健" }, need: { id: "n-target" } },
        success: true,
      });
    }
    return Response.json({ success: false }, { status: 404 });
  });
  // 点开之前不读计划。
  assert.equal(mounted.calls.length, 0);
  const [open] = byData(mounted.root, "data-plan-need-link-open");
  await act(async () => open!.props.onClick());
  await mounted.settle();
  const radios = mounted.root.root.findAll((node) => node.type === "input" && node.props.type === "radio");
  assert.deepEqual(radios.map((node) => node.props.value), ["n-connector", "n-target"]);
  await act(async () => radios[1]!.props.onChange());
  const [submit] = byData(mounted.root, "data-plan-need-link-submit");
  await act(async () => submit!.props.onClick());
  await mounted.settle();
  assert.equal(posts.length, 1);
  const body = posts[0] as { action: string; contactId: string; needItemId: string; idempotencyKey: string };
  assert.equal(body.action, "link");
  assert.equal(body.contactId, "contact:sato");
  assert.equal(body.needItemId, "n-target");
  assert.match(body.idempotencyKey, /^plan-link:/);
  assert.ok(text(mounted.root).includes("已关联到「中小企业的 IT 负责人」，本周多了一条「约 佐藤 健」。"));
  // W0060：关联成功后回调一次（详情据此刷新出新的需求 chip）。
  assert.equal(linked, 1);
  // W0021 写后失效矩阵：手动关联之后这里不再读任何东西（打开时读一次计划，提交一次 POST）。
  assert.deepEqual(mounted.calls.map((call) => `${call.method} ${call.url}`), [
    "GET /api/agent/plans/current?view=home",
    "POST /api/agent/plans/candidates",
  ]);
});

test("in demo mode the manual link is intercepted before any request", async (t) => {
  let guarded = 0;
  const mounted = await mount(t, <PlanNeedLinkPanel contactId="contact:sato" guard={() => (guarded++, true)} />);
  const [open] = byData(mounted.root, "data-plan-need-link-open");
  await act(async () => open!.props.onClick());
  assert.equal(guarded, 1);
  assert.equal(mounted.calls.length, 0);
});

test("the card review final screen appends the plan match only once the server batch is completed", async () => {
  const { CardBatchImport } = await import("../../app/(app)/app/contacts/card-batch-0918/card-batch-ui");
  const finishedBatch = (status: string) =>
    ({
      act: async () => undefined,
      active: null,
      attributed: {},
      attribution: { cards: {}, events: [] },
      attributionDecisions: {},
      setAttributionDecision: () => undefined,
      autoCount: 2,
      autoRunning: false,
      batchId: "batch-1",
      busy: false,
      cards: [{ cardId: "c1" }, { cardId: "c2" }],
      detail: { batch: { status }, items: [] },
      drafts: {},
      duplicates: new Set(),
      error: null,
      finished: true,
      isHandled: () => true,
      laterCount: status === "completed" ? 0 : 1,
      laterSet: new Set(),
      loadFailed: false,
      matches: {},
      mergedCount: 0,
      missing: 0,
      openCard: () => undefined,
      pending: [],
      pumpUploads: async () => undefined,
      queue: [],
      reattach: async () => undefined,
      reviewing: true,
      setAside: 0,
      setDrafts: () => undefined,
      setSide: () => undefined,
      setZoom: () => undefined,
      settledCount: 2,
      side: "front",
      stage: "review",
      status,
      uploadFailed: false,
      userCount: 0,
      zoom: false,
    }) as never;
  const render = (status: string) =>
    renderToStaticMarkup(
      <CardBatchImport available batch={finishedBatch(status)} onBatchStarted={() => undefined} onReset={() => undefined} t={(copy) => copy.zh} />,
    );
  const completed = render("completed");
  assert.match(completed, /本批名片已全部处理/);
  assert.match(completed, /data-plan-match-batch="waiting"/);
  assert.ok(completed.indexOf("本批名片已全部处理") < completed.indexOf("data-plan-match-batch"));
  // 还有「稍后处理」的名片：服务端批次没完成，没有匹配任务，不触发。
  assert.doesNotMatch(render("ready_for_review"), /data-plan-match-batch/);
});

function actionSheet(respondDraft: (attempt: number) => Response) {
  let attempts = 0;
  return (call: Call) => {
    if (call.url === "/api/agent/plans/items/a-new/draft") {
      attempts += 1;
      return respondDraft(attempts);
    }
    return Response.json({ success: false }, { status: 404 });
  };
}

test("起草邮件 drafts only on click and shows an editable draft with a copy button, never sending", async (t) => {
  const { MatchActionButtons } = await import("../../app/(app)/app/agent/iorbit-0918/plan-match-sheet");
  const mounted = await mount(
    t,
    <MatchActionButtons actionItemId="a-new" />,
    actionSheet(() => Response.json({ data: { draft: { body: "佐藤 健您好：\n想约您聊聊。", provider: "template", subject: "想约您 20 分钟聊聊" } }, success: true })),
  );
  assert.equal(mounted.calls.length, 0, "zero calls before the click");
  const [draft] = byData(mounted.root, "data-plan-match-draft");
  await act(async () => draft!.props.onClick());
  await mounted.settle();
  assert.deepEqual(mounted.calls.map((call) => [call.method, call.url, call.body]), [["POST", "/api/agent/plans/items/a-new/draft", { language: "zh" }]]);
  const textarea = mounted.root.root.findAll((node) => node.type === "textarea")[0]!;
  assert.equal(textarea.props.value, "主题：想约您 20 分钟聊聊\n\n佐藤 健您好：\n想约您聊聊。");
  await act(async () => textarea.props.onChange({ target: { value: "改过的草稿" } }));
  assert.equal(mounted.root.root.findAll((node) => node.type === "textarea")[0]!.props.value, "改过的草稿");
  assert.equal(byData(mounted.root, "data-plan-match-copy").length, 1);
  assert.ok(text(mounted.root).includes("只是草稿，Orbit 不会替你发送。"));
});

test("a failed draft shows a retry that asks again", async (t) => {
  const { MatchActionButtons } = await import("../../app/(app)/app/agent/iorbit-0918/plan-match-sheet");
  const mounted = await mount(
    t,
    <MatchActionButtons actionItemId="a-new" />,
    actionSheet((attempt) =>
      attempt === 1
        ? Response.json({ error: { message: "down" }, success: false }, { status: 503 })
        : Response.json({ data: { draft: { body: "正文", provider: "template", subject: "主题行" } }, success: true }),
    ),
  );
  await act(async () => byData(mounted.root, "data-plan-match-draft")[0]!.props.onClick());
  await mounted.settle();
  assert.ok(text(mounted.root).includes("没能起草邮件，请重试。"));
  assert.ok(text(byData(mounted.root, "data-plan-match-draft")[0]!).includes("重试起草"));
  await act(async () => byData(mounted.root, "data-plan-match-draft")[0]!.props.onClick());
  await mounted.settle();
  assert.equal(mounted.calls.length, 2);
  assert.equal(mounted.root.root.findAll((node) => node.type === "textarea")[0]!.props.value, "主题：主题行\n\n正文");
});

test("a decision the server did not apply (lost race) is shown as a failure", async (t) => {
  const mounted = await mount(t, <PlanMatchSheet candidates={LIST.candidates.slice(0, 1)} />, () =>
    Response.json({ error: { message: "CONFLICT: already dismissed" }, success: false }, { status: 409 }),
  );
  await act(async () => byData(mounted.root, "data-plan-match-yes")[0]!.props.onClick());
  await mounted.settle();
  assert.equal(byData(mounted.root, "data-plan-match-candidate").length, 1);
  assert.ok(text(mounted.root).includes("没能保存"));
  assert.ok(!text(mounted.root).includes("已加入本周"));
});

/* ------------------------------------------------------------------ */
/* W0023 SC-04：计划已到期时，确认只记关联，确认处说明下一份计划再安排   */
/* ------------------------------------------------------------------ */

const ENDED_NOTE = "已关联到「能帮你引荐的行业前辈」；计划已到期，制定下一份计划时会安排「约 TA」";

/** 到期计划上的接受：`link.action` 为 null。 */
function endedDecision(call: Call): Response {
  const body = call.body as { candidateId: string; decision: string };
  return Response.json({
    data: {
      candidateId: body.candidateId,
      link: body.decision === "accept" ? { action: null, log: { id: "log-1" }, need: { id: "n-connector" }, replayed: false } : null,
      replayed: false,
      status: body.decision === "accept" ? "accepted" : "dismissed",
    },
    success: true,
  });
}

function assertEndedRow(root: ReactTestRenderer, candidateId: string) {
  const row = byData(root, "data-plan-match-candidate").find((node) => node.props["data-plan-match-candidate"] === candidateId)!;
  const strings = (node: ReactTestInstance | string): string =>
    typeof node === "string" ? node : node.children.map((child) => strings(child)).join("");
  const rowText = strings(row);
  assert.ok(rowText.includes(ENDED_NOTE), rowText);
  assert.ok(!rowText.includes("已加入本周"));
  assert.equal(row.findAll((node) => node.props?.["data-plan-match-yes"] !== undefined).length, 0, "no 是 after accepting");
  assert.equal(row.findAll((node) => node.props?.["data-plan-match-no"] !== undefined).length, 0, "no 不是 after accepting");
  assert.equal(row.findAll((node) => node.props?.["data-plan-match-action"] !== undefined).length, 0, "no action buttons");
}

test("W0023: accepting on an ended plan shows the next-plan note instead of the 约 TA card", async (t) => {
  const decided: Array<[string, string, unknown]> = [];
  const mounted = await mount(
    t,
    <PlanMatchSheet candidates={LIST.candidates} onDecided={(id, decision, action) => decided.push([id, decision, action])} />,
    (call) => (call.url === "/api/agent/plans/candidates" ? endedDecision(call) : Response.json({ success: false }, { status: 404 })),
  );
  await act(async () => byData(mounted.root, "data-plan-match-yes")[0]!.props.onClick());
  await mounted.settle();
  assertEndedRow(mounted.root, "cand-1");
  assert.deepEqual(decided, [["cand-1", "accept", null]]);
  // 另一行照常可以「是 / 不是」。
  assert.equal(byData(mounted.root, "data-plan-match-yes").length, 1);
});

test("W0023: the review screen (BatchPlanMatch) wires the same ended-plan note", async (t) => {
  const mounted = await mount(t, <BatchPlanMatch batchId="batch-1" run={async () => LIST} waitMs={1_000} />, (call) =>
    call.url === "/api/agent/plans/candidates" ? endedDecision(call) : Response.json({ success: false }, { status: 404 }),
  );
  await mounted.settle();
  await act(async () => byData(mounted.root, "data-plan-match-yes")[0]!.props.onClick());
  await mounted.settle();
  assertEndedRow(mounted.root, "cand-1");
});

test("W0023: the plan page's 待确认 N sheet shows the ended-plan note after 是", async (t) => {
  const mounted = await mount(t, <IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />, (call) => {
    if (call.url === "/api/agent/plans/candidates" && call.method === "POST") return endedDecision(call);
    if (call.url === "/api/agent/plans/candidates") return Response.json({ data: LIST, success: true });
    if (call.url.startsWith("/api/agent/plans/current")) return Response.json({ data: planSnapshotFixture(), success: true });
    return Response.json({ success: false }, { status: 404 });
  });
  await mounted.settle();
  await act(async () => byData(mounted.root, "data-orbit-plan-need-matches")[0]!.props.onClick());
  await act(async () => byData(mounted.root, "data-plan-match-yes")[0]!.props.onClick());
  await mounted.settle();
  assertEndedRow(mounted.root, "cand-1");
});

test("W0023: the contact detail's manual link on an ended plan says the next plan will schedule 约 TA", async (t) => {
  const mounted = await mount(t, <PlanNeedLinkPanel contactId="contact:sato" />, (call) => {
    if (call.url === "/api/agent/plans/current?view=home") return Response.json({ data: planSnapshotFixture(), success: true });
    if (call.url === "/api/agent/plans/candidates" && call.method === "POST") {
      return Response.json({ data: { action: null, log: null, need: { id: "n-target" }, replayed: false }, success: true });
    }
    return Response.json({ success: false }, { status: 404 });
  });
  await act(async () => byData(mounted.root, "data-plan-need-link-open")[0]!.props.onClick());
  await mounted.settle();
  const radios = mounted.root.root.findAll((node) => node.type === "input" && node.props.type === "radio");
  await act(async () => radios[1]!.props.onChange());
  await act(async () => byData(mounted.root, "data-plan-need-link-submit")[0]!.props.onClick());
  await mounted.settle();
  const html = text(mounted.root);
  assert.ok(html.includes("已关联到「中小企业的 IT 负责人」；计划已到期，制定下一份计划时会安排「约 TA」。"), html);
  assert.ok(!html.includes("本周多了一条"));
  assert.ok(!html.includes("Unexpected link payload"));
});

test("W0023: a link response without a need is still rejected as malformed", async (t) => {
  const mounted = await mount(t, <PlanMatchSheet candidates={LIST.candidates.slice(0, 1)} />, () =>
    Response.json({ data: { candidateId: "cand-1", link: null, status: "accepted" }, success: true }),
  );
  await act(async () => byData(mounted.root, "data-plan-match-yes")[0]!.props.onClick());
  await mounted.settle();
  assert.ok(text(mounted.root).includes("没能保存"));
  assert.ok(!text(mounted.root).includes("计划已到期"));
});
