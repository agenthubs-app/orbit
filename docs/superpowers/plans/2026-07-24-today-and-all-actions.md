# Today 决策收件箱 + All actions 操作账本页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已落地的操作账本（`features/agent/ledger/`）接到界面上：新增 `/app/today` 决策收件箱并挂进顶部导航（顺带修好三条 404 死链），把 All actions 挂进「人脉」左侧栏，并统一 iOrbit 与人脉的侧边栏宽度。

**Architecture:** 两个新路由都走仓库既有的 route-view-model 模式（server component 读 service → view-model → UI 组件），选中态用真实 URL 参数（`?entry=`/`?status=`）而非客户端状态，只有写操作（确认/稍后/撤销/重试）是 client component 调 ledger API。顶部导航是单一共享组件 `OrbitTopNav`，加 Today 与修死链都在同一处。

**Tech Stack:** Next.js 16 App Router（server components）、TypeScript、`node --test` + tsx、既有 `orbit-reference-primitives`（Icon/house CSS classes）与 `orbit-language-server`（localizeOrbitTree）。

## Global Constraints

- **不重构导航结构**：只在既有 `OrbitTopNav` 的 `links` 数组里新增 Today、修正三条 href。不新增导航壳、不动 iOrbit 按钮、不删除 `日程`。
- **iOrbit 界面与命名不动**：不得把 iOrbit 改名为 Ask Orbit，不得改动 `/app/agent` 的对话界面结构。
- **侧边栏宽度以人脉为准**：共享常量 `ORBIT_LEFT_SIDEBAR_WIDTH` 从 248 改为 **212**（人脉现状实测值）；iOrbit 拖拽下限 `HISTORY_SIDEBAR_MIN_WIDTH` 从 220 降为 **180**（否则 212 会被 clamp 顶回 220）；上限 380 与拖拽逻辑保持不变。
- **真实导航硬性要求**：顶部导航每个 href 必须指向真实存在的页面。现状实测 `/app/explore`、`/app/home/schedule`、`/app/home/cards` 全部 404，真实页面是 `/app/events`、`/app/schedule`、`/app/contacts`。
- **只存草稿硬约束**：界面上任何"确认执行"都不得出现"发送"字样或发送路径；消息类子操作展示为草稿，文案沿用 ledger service 返回的 `nextAction`。
- **证据 chip 不含语音记录**：只渲染 ledger 的 `evidenceChips`，其 kind 已被 contract 限死为四种。
- **mock 模式无跨请求持久化**：每个 API 请求新建 service 实例，确认后刷新会回到初始 6 条。这是既有 mock-first 行为，**不是缺陷**；持久化留给后续 live Postgres provider。
- **i18n 已知缺口**：`localizeOrbitTree` 是从原型资产里抽取的 zh→en 词典，无法新增词条。本计划新增的中文文案在 EN 下可能仍显示中文，与 ledger fixtures 现状一致。**不是本计划要解决的问题**，不得为此引入平行的 `{en,zh}` 文案结构（会与 `localizeOrbitTree` 的字符串遍历机制冲突）。
- 所有命令在 `/Users/li/work/orbit/repos/orbits` 下执行。分支 `agent-action-ledger`。
- 提交前运行 `(cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit)`。
- Commit 信息以 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 结尾。

---

## File Structure

```
app/(app)/app/today/
  compose-app-today-from-agent-ledger/today-route-view-model.ts   # 账本 → Today 分栏数据
  orbit-real-today.tsx                                            # 左栏分组列表（server）
  orbit-today-decision-panel.tsx                                  # 右栏决策详情（server）
  orbit-today-decision-form.tsx                                   # 确认/稍后（client，唯一写入口）
  page.tsx                                                        # route adapter
app/(app)/app/contacts/
  all-actions/
    compose-app-all-actions-from-agent-ledger/all-actions-route-view-model.ts
    orbit-real-all-actions.tsx                                    # 账本列表 + 状态筛选（server）
    orbit-all-actions-controls.tsx                                # 撤销/重试（client）
    orbit-all-actions-settings.tsx                                # 权限与通知（client）
    page.tsx
  orbit-crm-sidebar.tsx                                           # [modify] 新增 All actions 项
  orbit-real-{contacts,cards-import,cards-dashboard,cards-pipeline-view,card-connection}.tsx  # [modify] 9 处 grid 消费常量
app/(app)/app/orbit-public-shell.tsx                              # [modify] Today + 修死链
app/(app)/app/orbit-account-shell.tsx                             # [modify] active 联合类型加 today
app/(app)/app/orbit-layout-constants.ts                           # [modify] 248 → 212
app/(app)/app/agent/orbit-real-agent.tsx                          # [modify] 下限 220 → 180
tests/pages/app-today-route-view-model.test.ts
tests/pages/app-all-actions-route-view-model.test.ts
tests/ui/orbit-top-nav-links.test.ts
tests/ui/orbit-sidebar-width-constant.test.ts                     # [modify] 212 + 单一来源断言
package.json                                                      # [modify] lint tsc 列表追加
```

---

### Task 1: Today route — view-model + 左栏分组列表

**Files:**
- Create: `app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model.ts`
- Create: `app/(app)/app/today/orbit-real-today.tsx`
- Create: `app/(app)/app/today/page.tsx`
- Test: `tests/pages/app-today-route-view-model.test.ts`

**Interfaces:**
- Consumes: `createAgentLedgerService`（`features/agent/service-factory`）、`agentLedgerFailureToAppError` 与 `AgentLedgerEntry`（`features/agent/ledger/contract`）、`OrbitReferenceStyles`、`OrbitVisualFreezeRuntime`、`getOrbitServerLanguage`/`localizeOrbitTree`、`AccountTopNav`、`Icon`。
- Produces（后续 Task 依赖的确切名字）：`loadAppTodayRouteViewModel(searchParams?): Promise<AppTodayRouteViewModel>`、types `AppTodaySearchParams`、`TodaySectionKey`（`"decide" | "prepared" | "recent"`）、`TodaySectionViewModel`、`AppTodayRouteViewModel`（字段 `state`/`decideCount`/`sections`/`selectedEntry`/`evidenceIds`/`errorCode`/`failureMessage`）；组件 `OrbitRealToday({ viewModel })`。

- [ ] **Step 1: Write the failing test**

创建 `tests/pages/app-today-route-view-model.test.ts`：

```ts
/**
 * Today route view-model 测试。
 *
 * Today 是操作账本的一个视图：awaiting_confirmation → 需要你决定，
 * executing → ORBIT 已准备，completed/partially_failed/undone → 最近完成。
 * deferred（稍后处理）不在 Today 出现，只在 All actions 可见。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadAppTodayRouteViewModel } from "../../app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model";

test("today buckets ledger entries into decide, prepared, and recent", async () => {
  const model = await loadAppTodayRouteViewModel();

  assert.equal(model.state, "success");
  assert.deepEqual(
    model.sections.map((section) => section.key),
    ["decide", "prepared", "recent"],
  );
  assert.equal(model.decideCount, 2);
});

test("each section only contains entries whose status belongs to it", async () => {
  const model = await loadAppTodayRouteViewModel();
  const allowed: Record<string, readonly string[]> = {
    decide: ["awaiting_confirmation"],
    prepared: ["executing"],
    recent: ["completed", "partially_failed", "undone"],
  };

  for (const section of model.sections) {
    for (const entry of section.entries) {
      assert.ok(
        allowed[section.key].includes(entry.status),
        `${entry.entryId} (${entry.status}) does not belong in ${section.key}`,
      );
    }
  }
});

test("deferred entries never surface on Today", async () => {
  const model = await loadAppTodayRouteViewModel();
  const statuses = model.sections.flatMap((section) =>
    section.entries.map((entry) => entry.status),
  );

  assert.ok(!statuses.includes("deferred"));
});

test("selection defaults to the first decide entry", async () => {
  const model = await loadAppTodayRouteViewModel();

  assert.equal(model.selectedEntry?.entryId, "ledger-followup-alex-chen");
});

test("an explicit ?entry= wins over the default selection", async () => {
  const model = await loadAppTodayRouteViewModel({ entry: "ledger-reply-xuwei-intro" });

  assert.equal(model.selectedEntry?.entryId, "ledger-reply-xuwei-intro");
});

test("an unknown ?entry= falls back to the default selection", async () => {
  const model = await loadAppTodayRouteViewModel({ entry: "ledger-does-not-exist" });

  assert.equal(model.selectedEntry?.entryId, "ledger-followup-alex-chen");
});

test("the failure scenario yields a typed failure view model", async () => {
  const model = await loadAppTodayRouteViewModel({ scenario: "failure" });

  assert.equal(model.state, "failure");
  assert.equal(model.errorCode, "AGENT_LEDGER_MOCK_FAILED");
  assert.equal(model.sections.length, 0);
  assert.equal(model.selectedEntry, null);
  assert.ok((model.failureMessage ?? "").length > 0);
});

test("the empty scenario yields an empty view model with no sections", async () => {
  const model = await loadAppTodayRouteViewModel({ scenario: "empty" });

  assert.equal(model.state, "empty");
  assert.equal(model.sections.length, 0);
  assert.equal(model.decideCount, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/pages/app-today-route-view-model.test.ts`
Expected: FAIL —— `Cannot find module '.../today-route-view-model'`

- [ ] **Step 3: Write the view-model**

创建 `app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model.ts`：

```ts
/**
 * Today 决策收件箱 route view-model。
 *
 * Today 不持有自己的数据，它只是操作账本的一个视图：
 *   awaiting_confirmation → 需要你决定
 *   executing             → ORBIT 已准备
 *   completed / partially_failed / undone → 最近完成
 * deferred（稍后处理）刻意不在 Today 出现，只在 All actions 可见。
 */
import {
  agentLedgerFailureToAppError,
  type AgentLedgerEntry,
} from "../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../features/agent/service-factory";

export type AppTodaySearchParams = Record<
  string,
  string | string[] | undefined
>;

export type TodaySectionKey = "decide" | "prepared" | "recent";

export interface TodaySectionViewModel {
  key: TodaySectionKey;
  title: string;
  entries: readonly AgentLedgerEntry[];
}

export interface AppTodayRouteViewModel {
  state: "success" | "empty" | "failure";
  decideCount: number;
  sections: readonly TodaySectionViewModel[];
  selectedEntry: AgentLedgerEntry | null;
  evidenceIds: readonly string[];
  errorCode: string | null;
  failureMessage: string | null;
}

const SECTION_TITLES: Record<TodaySectionKey, string> = {
  decide: "需要你决定",
  prepared: "ORBIT 已准备",
  recent: "最近完成",
};

const SECTION_STATUSES: Record<
  TodaySectionKey,
  readonly AgentLedgerEntry["status"][]
> = {
  decide: ["awaiting_confirmation"],
  prepared: ["executing"],
  recent: ["completed", "partially_failed", "undone"],
};

function readParam(
  params: AppTodaySearchParams | undefined,
  key: string,
): string | null {
  const value = params?.[key];

  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;

  return null;
}

export async function loadAppTodayRouteViewModel(
  searchParams?: AppTodaySearchParams,
): Promise<AppTodayRouteViewModel> {
  const service = createAgentLedgerService();
  const result = await service.listEntries({
    scenario: readParam(searchParams, "scenario"),
  });

  if (result.success === false) {
    return {
      decideCount: 0,
      errorCode: result.error.code,
      evidenceIds: result.error.evidenceIds,
      failureMessage: agentLedgerFailureToAppError(result).message,
      sections: [],
      selectedEntry: null,
      state: "failure",
    };
  }

  const entries = result.data.entries;
  const sections = (Object.keys(SECTION_STATUSES) as TodaySectionKey[])
    .map((key) => ({
      entries: entries.filter((entry) =>
        SECTION_STATUSES[key].includes(entry.status),
      ),
      key,
      title: SECTION_TITLES[key],
    }))
    .filter((section) => section.entries.length > 0);

  const decideEntries =
    sections.find((section) => section.key === "decide")?.entries ?? [];
  const requestedEntryId = readParam(searchParams, "entry");
  const selectedEntry =
    entries.find((entry) => entry.entryId === requestedEntryId) ??
    decideEntries[0] ??
    null;

  return {
    decideCount: decideEntries.length,
    errorCode: null,
    evidenceIds: result.data.provenance.evidenceIds,
    failureMessage: null,
    sections,
    selectedEntry,
    state: entries.length === 0 ? "empty" : "success",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/pages/app-today-route-view-model.test.ts`
Expected: PASS（8 项）

- [ ] **Step 5: Write the left-column UI**

创建 `app/(app)/app/today/orbit-real-today.tsx`：

```tsx
/**
 * Today 决策收件箱主界面（server component）。
 *
 * 左栏是分组列表，选中态走真实 URL（?entry=），不依赖客户端状态。
 * 右栏决策详情由 Task 2 挂入。
 */
import { Icon } from "../orbit-reference-primitives";
import type {
  AgentLedgerEntry,
} from "../../../../features/agent/ledger/contract";
import type { AppTodayRouteViewModel } from "./compose-app-today-from-agent-ledger/today-route-view-model";

const STATUS_LABELS: Record<AgentLedgerEntry["status"], string> = {
  awaiting_confirmation: "等待确认",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  undone: "已撤销",
};

const SECTION_ICONS: Record<string, string> = {
  decide: "target",
  prepared: "sparkle",
  recent: "checkCircle",
};

function EntryRow({
  entry,
  selected,
}: {
  entry: AgentLedgerEntry;
  selected: boolean;
}) {
  return (
    <a
      aria-current={selected ? "true" : undefined}
      data-orbit-today-entry={entry.entryId}
      href={`/app/today?entry=${encodeURIComponent(entry.entryId)}`}
      style={{
        alignItems: "center",
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--text)",
            fontSize: 15,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.title}
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
          {entry.organization ?? entry.contactName ?? STATUS_LABELS[entry.status]}
        </div>
      </div>
      <span className="chip" style={{ flexShrink: 0 }}>
        {STATUS_LABELS[entry.status]}
      </span>
      <Icon name="chevR" size={16} />
    </a>
  );
}

export function OrbitRealToday({
  viewModel,
}: {
  viewModel: AppTodayRouteViewModel;
}) {
  if (viewModel.state === "failure") {
    return (
      <div data-orbit-route="app-today-route-state" style={{ padding: 32 }}>
        <div className="eyebrow">Today</div>
        <h1 style={{ fontSize: 24, margin: "8px 0 12px" }}>账本暂时读不出来</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          {viewModel.failureMessage}
        </p>
      </div>
    );
  }

  if (viewModel.state === "empty") {
    return (
      <div data-orbit-route="app-today-route-empty" style={{ padding: 32 }}>
        <div className="eyebrow">Today</div>
        <h1 style={{ fontSize: 24, margin: "8px 0 12px" }}>今天没有需要你决定的事</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          Orbit 会在有新的跟进窗口时把决策放到这里。
        </p>
      </div>
    );
  }

  return (
    <div data-orbit-today-list style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header>
        <div className="eyebrow">Today</div>
        <h1 style={{ fontSize: 30, lineHeight: 1.25, margin: "10px 0 8px" }}>
          今晚有 {viewModel.decideCount} 件事需要你决定。
        </h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          其余的 Orbit 已经准备好了 —— 确认即可完成，所有操作都可撤销。
        </p>
      </header>

      {viewModel.sections.map((section) => (
        <section data-orbit-today-section={section.key} key={section.key}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Icon name={SECTION_ICONS[section.key] ?? "list"} size={16} />
            <span className="eyebrow">{section.title}</span>
            <span
              className="mono"
              style={{ color: "var(--text-3)", fontSize: 12 }}
            >
              {section.entries.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {section.entries.map((entry) => (
              <EntryRow
                entry={entry}
                key={entry.entryId}
                selected={viewModel.selectedEntry?.entryId === entry.entryId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

创建 `app/(app)/app/today/page.tsx`：

```tsx
/**
 * Today 决策收件箱 route adapter。
 *
 * route 只负责挂样式/runtime 并把 view-model 交给 UI；
 * 数据来源是操作账本 service（mock-first）。
 */
import { AccountTopNav } from "../orbit-account-shell";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppTodayRouteViewModel,
  type AppTodaySearchParams,
} from "./compose-app-today-from-agent-ledger/today-route-view-model";
import { OrbitRealToday } from "./orbit-real-today";

export const dynamic = "force-dynamic";

export default async function AppTodayPage({
  searchParams,
}: {
  searchParams?: Promise<AppTodaySearchParams>;
} = {}) {
  const viewModel = await loadAppTodayRouteViewModel(await searchParams);
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <AccountTopNav active="today" />
      <div data-orbit-route="app-today-route" style={{ margin: "0 auto", maxWidth: 1180, padding: "28px 24px 96px" }}>
        <OrbitRealToday viewModel={localizeOrbitTree(viewModel, language)} />
      </div>
    </>
  );
}
```

注意：`AccountTopNav active="today"` 依赖 Task 3 放宽 `active` 的联合类型。本任务先写上，Task 3 之前 `npm run lint` 会在这一行报类型错——这是预期的，Task 3 会修好；本任务的验收标准是测试通过与页面可渲染，不含 lint。

- [ ] **Step 6: Verify the page renders**

Run:
```bash
npm run dev
```
另开终端：`curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/app/today`
Expected: `200`。再 `curl -s http://localhost:3000/app/today | grep -c 'data-orbit-today-section'` → 至少 `1`。确认后停掉 dev server。

- [ ] **Step 7: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/today" tests/pages/app-today-route-view-model.test.ts
git commit -m "feat(today): add Today decision inbox route backed by the action ledger

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Today 决策详情面板 + 确认/稍后处理

**Files:**
- Create: `app/(app)/app/today/orbit-today-decision-panel.tsx`
- Create: `app/(app)/app/today/orbit-today-decision-form.tsx`
- Modify: `app/(app)/app/today/page.tsx`（两栏布局，挂入面板）
- Test: `tests/pages/app-today-decision-panel.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `AppTodayRouteViewModel`、`AgentLedgerEntry`；ledger API `POST /api/agent/ledger/[id]/transition`。
- Produces: `OrbitTodayDecisionPanel({ entry })`（server，`entry: AgentLedgerEntry | null`）、`OrbitTodayDecisionForm({ entryId, operations })`（client，`operations: readonly AgentLedgerOperation[]`）。

- [ ] **Step 1: Write the failing test**

创建 `tests/pages/app-today-decision-panel.test.tsx`：

```tsx
/**
 * Today 决策详情面板测试。
 *
 * 面板必须回答设计稿的三个问题：为什么现在出现、建议基于什么信息、确认后将会发生什么，
 * 并且必须显式声明"消息只保存为草稿，不会自动发送"。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentLedgerEntryFixtures } from "../../features/agent/ledger/fixtures";
import { OrbitTodayDecisionPanel } from "../../app/(app)/app/today/orbit-today-decision-panel";

const alexChen = agentLedgerEntryFixtures.find(
  (entry) => entry.entryId === "ledger-followup-alex-chen",
)!;

test("the panel renders why-now, evidence chips, and effect previews", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={alexChen} />);

  assert.ok(html.includes("为什么现在出现"));
  assert.ok(html.includes(alexChen.whyNow));
  assert.ok(html.includes("建议基于什么信息"));
  assert.ok(html.includes("活动资料"));
  assert.ok(html.includes("确认后将会"));
  assert.ok(html.includes("保存会面笔记"));
});

test("the panel states the draft-only guarantee", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={alexChen} />);

  assert.ok(html.includes("只保存为草稿"));
  assert.ok(!html.includes("自动发送邮件"));
});

test("the panel never renders a voice-recording evidence chip", () => {
  for (const entry of agentLedgerEntryFixtures) {
    const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={entry} />);
    assert.ok(!html.includes("语音"), entry.entryId);
  }
});

test("a null entry renders an explicit empty panel rather than crashing", () => {
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={null} />);

  assert.ok(html.includes("选择左侧任一条目"));
});

test("terminal entries render no confirm form", () => {
  const completed = agentLedgerEntryFixtures.find(
    (entry) => entry.entryId === "ledger-archive-six-contacts",
  )!;
  const html = renderToStaticMarkup(<OrbitTodayDecisionPanel entry={completed} />);

  assert.ok(!html.includes("确认执行"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/pages/app-today-decision-panel.test.tsx`
Expected: FAIL —— `Cannot find module '.../orbit-today-decision-panel'`

- [ ] **Step 3: Write the client form**

创建 `app/(app)/app/today/orbit-today-decision-form.tsx`：

```tsx
"use client";

import { useState } from "react";
import type { AgentLedgerOperation } from "../../../../features/agent/ledger/contract";

/**
 * 决策写入口。勾选子操作后确认，或整条稍后处理。
 * 这里没有、也不允许有任何"发送"路径：消息类子操作只落草稿。
 */
export function OrbitTodayDecisionForm({
  entryId,
  operations,
}: {
  entryId: string;
  operations: readonly AgentLedgerOperation[];
}) {
  const [selected, setSelected] = useState<readonly string[]>(
    operations
      .filter((operation) => operation.selectedByDefault)
      .map((operation) => operation.operationId),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyTransition(
    transition: "confirm" | "defer",
  ): Promise<void> {
    setPending(true);
    setError(null);

    const response = await fetch(
      `/api/agent/ledger/${encodeURIComponent(entryId)}/transition`,
      {
        body: JSON.stringify({
          selectedOperationIds: transition === "confirm" ? selected : undefined,
          transition,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json()) as
      | { success: true }
      | { success: false; error: { message: string } };

    if (body.success === false) {
      setError(body.error.message);
      setPending(false);
      return;
    }

    window.location.reload();
  }

  return (
    <div data-orbit-today-decision-form style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {operations.map((operation) => (
          <label
            key={operation.operationId}
            style={{ alignItems: "flex-start", cursor: "pointer", display: "flex", gap: 10 }}
          >
            <input
              checked={selected.includes(operation.operationId)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, operation.operationId]
                    : current.filter((id) => id !== operation.operationId),
                )
              }
              type="checkbox"
            />
            <span>
              <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 500 }}>
                {operation.title}
              </span>
              <span style={{ color: "var(--text-3)", display: "block", fontSize: 12.5 }}>
                {operation.effectSummary}
              </span>
            </span>
          </label>
        ))}
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b4413c)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-primary"
          disabled={pending || selected.length === 0}
          onClick={() => void applyTransition("confirm")}
          type="button"
        >
          确认执行
        </button>
        <button
          className="btn"
          disabled={pending}
          onClick={() => void applyTransition("defer")}
          type="button"
        >
          稍后处理
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the panel**

创建 `app/(app)/app/today/orbit-today-decision-panel.tsx`：

```tsx
/**
 * Today 决策详情面板（server component）。
 *
 * 回答设计稿的三个问题：为什么现在出现 / 建议基于什么信息 / 确认后将会发生什么。
 * 只有 awaiting_confirmation 与 deferred 的条目才渲染写入口。
 */
import { Icon } from "../orbit-reference-primitives";
import type { AgentLedgerEntry } from "../../../../features/agent/ledger/contract";
import { OrbitTodayDecisionForm } from "./orbit-today-decision-form";

const EVIDENCE_ICONS: Record<string, string> = {
  calendar_signal: "calendar",
  chat_summary: "message",
  contact_note: "doc",
  event_material: "doc",
};

export function OrbitTodayDecisionPanel({
  entry,
}: {
  entry: AgentLedgerEntry | null;
}) {
  if (!entry) {
    return (
      <aside className="card" data-orbit-today-panel="empty" style={{ padding: 22 }}>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          选择左侧任一条目查看决策详情。
        </p>
      </aside>
    );
  }

  const editable =
    entry.status === "awaiting_confirmation" || entry.status === "deferred";

  return (
    <aside className="card" data-orbit-today-panel={entry.entryId} style={{ display: "flex", flexDirection: "column", gap: 18, padding: 22 }}>
      <div>
        <div className="eyebrow">决策详情</div>
        <h2 style={{ fontSize: 20, margin: "8px 0 0" }}>{entry.title}</h2>
      </div>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
          为什么现在出现?
        </h3>
        <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {entry.whyNow}
        </p>
      </section>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 8px" }}>
          建议基于什么信息?
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entry.evidenceChips.map((chip) => (
            <span className="chip" key={chip.evidenceId} style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
              <Icon name={EVIDENCE_ICONS[chip.kind] ?? "doc"} size={13} />
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 8px" }}>
          确认后将会
        </h3>
        <ul style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          {entry.operations.map((operation) => (
            <li key={operation.operationId}>{operation.title}</li>
          ))}
        </ul>
      </section>

      <p
        style={{
          background: "var(--accent-soft)",
          borderRadius: 12,
          color: "var(--text-2)",
          fontSize: 13,
          lineHeight: 1.6,
          margin: 0,
          padding: "12px 14px",
        }}
      >
        消息只保存为草稿，不会自动发送。所有写操作可随时在 All actions 中撤销。
      </p>

      {editable ? (
        <OrbitTodayDecisionForm entryId={entry.entryId} operations={entry.operations} />
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --import tsx tests/pages/app-today-decision-panel.test.tsx`
Expected: PASS（5 项）

- [ ] **Step 6: Wire the panel into a two-column page**

修改 `app/(app)/app/today/page.tsx` —— 新增 import：

```tsx
import { OrbitTodayDecisionPanel } from "./orbit-today-decision-panel";
```

并把 `<div data-orbit-route="app-today-route" …>` 内部替换为两栏布局：

```tsx
      <div data-orbit-route="app-today-route" style={{ margin: "0 auto", maxWidth: 1180, padding: "28px 24px 96px" }}>
        <div style={{ alignItems: "start", display: "grid", gap: 28, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 380px)" }}>
          <OrbitRealToday viewModel={localizeOrbitTree(viewModel, language)} />
          <OrbitTodayDecisionPanel entry={localizeOrbitTree(viewModel.selectedEntry, language)} />
        </div>
      </div>
```

- [ ] **Step 7: Verify end to end**

Run `npm run dev`，另开终端：

```bash
curl -s "http://localhost:3000/app/today?entry=ledger-reply-xuwei-intro" | grep -c 'data-orbit-today-panel="ledger-reply-xuwei-intro"'
```
Expected: `1`（说明 `?entry=` 真实驱动了右栏）。停掉 dev server。

- [ ] **Step 8: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/today" tests/pages/app-today-decision-panel.test.tsx
git commit -m "feat(today): add decision detail panel with confirm and defer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 顶部导航 — 新增 Today 并修好三条死链

**Files:**
- Modify: `app/(app)/app/orbit-public-shell.tsx`（`OrbitNavActive` 与 `links`）
- Modify: `app/(app)/app/orbit-account-shell.tsx`（`AccountTopNav` 的 `active` 联合类型）
- Test: `tests/ui/orbit-top-nav-links.test.ts`

**Interfaces:**
- Produces: `OrbitNavActive` 新增 `"today"` 成员；`links` 四项，href 全部指向真实页面。

**背景（实测数据，不要重新推导）：** `productHref(h)` 对非 `/app` 开头的路径返回 `/app${h}`。现状 `links` 是 `/explore`、`/home/schedule`、`/home/cards`，解析后分别是 `/app/explore`、`/app/home/schedule`、`/app/home/cards`，三者全部 404；真实页面目录是 `app/(app)/app/events`、`app/(app)/app/schedule`、`app/(app)/app/contacts`。

- [ ] **Step 1: Write the failing test**

创建 `tests/ui/orbit-top-nav-links.test.ts`：

```ts
/**
 * 顶部导航链接完整性测试。
 *
 * 「真实导航」是硬性产品决定：导航里的每个 href 都必须解析到一个真实存在的
 * App Router 页面。这条测试是防止死链回归的闸门。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { productHref } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const shellSource = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
  "utf8",
);

function navHrefs(): readonly string[] {
  const block = shellSource.slice(
    shellSource.indexOf("const links = ["),
    shellSource.indexOf("] as const;", shellSource.indexOf("const links = [")),
  );

  return [...block.matchAll(/\["(\/[^"]*)"/g)].map((match) => match[1]);
}

test("the nav exposes Today plus events, schedule, and contacts", () => {
  assert.deepEqual(navHrefs(), ["/today", "/events", "/schedule", "/contacts"]);
});

test("every nav href resolves to a real App Router page", () => {
  for (const href of navHrefs()) {
    const resolved = productHref(href);
    const pagePath = join(
      projectRoot,
      "app/(app)/app",
      resolved.replace(/^\/app\/?/, ""),
      "page.tsx",
    );

    assert.ok(
      existsSync(pagePath),
      `nav href ${href} resolves to ${resolved} but ${pagePath} does not exist`,
    );
  }
});

test("the retired prototype hrefs are gone", () => {
  for (const dead of ["/explore", "/home/schedule", "/home/cards"]) {
    assert.ok(
      !navHrefs().includes(dead),
      `${dead} is a known 404 and must not return to the nav`,
    );
  }
});

test("today is a valid nav active key", () => {
  assert.ok(shellSource.includes('"today"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/ui/orbit-top-nav-links.test.ts`
Expected: FAIL —— 第一条断言得到 `["/explore", "/home/schedule", "/home/cards"]`

- [ ] **Step 3: Update the nav**

修改 `app/(app)/app/orbit-public-shell.tsx` 第 8 行：

```ts
export type OrbitNavActive = "home" | "today" | "events" | "schedule" | "cards" | "agent" | "me";
```

并把 `links` 数组替换为：

```ts
  const links = [
    ["/today", t({ en: "Today", zh: "Today" }), "today"],
    ["/events", t({ en: "Events", zh: "活动" }), "events"],
    ["/schedule", t({ en: "Calendar", zh: "日程" }), "schedule"],
    ["/contacts", t({ en: "Contacts", zh: "人脉" }), "cards"],
  ] as const;
```

修改 `app/(app)/app/orbit-account-shell.tsx` 第 25 行，把 `AccountTopNav` 的 `active` 联合类型加上 `today`：

```ts
  active?: "agent" | "today" | "events" | "schedule" | "cards" | "me";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/ui/orbit-top-nav-links.test.ts`
Expected: PASS（4 项）

- [ ] **Step 5: Verify every nav target really answers 200**

Run `npm run dev`，另开终端：

```bash
for p in /app/today /app/events /app/schedule /app/contacts; do printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$p)"; done
```
Expected: 四行全部 `200`。停掉 dev server。

- [ ] **Step 6: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/orbit-public-shell.tsx" "app/(app)/app/orbit-account-shell.tsx" tests/ui/orbit-top-nav-links.test.ts
git commit -m "feat(nav): add Today to the top nav and repair three dead links

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 侧边栏宽度统一到 212

**Files:**
- Modify: `app/(app)/app/orbit-layout-constants.ts`（248 → 212）
- Modify: `app/(app)/app/agent/orbit-real-agent.tsx`（`HISTORY_SIDEBAR_MIN_WIDTH` 220 → 180）
- Modify: `app/(app)/app/contacts/orbit-real-contacts.tsx`（4 处 grid）
- Modify: `app/(app)/app/contacts/orbit-real-cards-import.tsx`（1 处）
- Modify: `app/(app)/app/contacts/orbit-real-cards-dashboard.tsx`（1 处）
- Modify: `app/(app)/app/contacts/orbit-real-cards-pipeline-view.tsx`（1 处）
- Modify: `app/(app)/app/contacts/orbit-real-card-connection.tsx`（1 处）
- Modify: `app/(app)/app/contacts/orbit-crm-sidebar.tsx`（注释里的 212 改为引用常量）
- Test: `tests/ui/orbit-sidebar-width-constant.test.ts`（改写）

**Interfaces:**
- Produces: `ORBIT_LEFT_SIDEBAR_WIDTH = 212`，成为 iOrbit 与人脉两处侧边栏宽度的唯一来源。

**背景（实测，不要重新推导）：** 人脉侧栏实测 212px，来自 5 个文件里共 **9 处** 硬编码 `gridTemplateColumns: "212px 1fr"`。iOrbit 侧栏默认 248、下限 220、上限 380。用户要求 iOrbit 向人脉看齐，因此常量取 212；下限必须降到 ≤212，否则初始值会被 `clampHistorySidebarWidth` 顶回 220。

- [ ] **Step 1: Rewrite the test**

把 `tests/ui/orbit-sidebar-width-constant.test.ts` 整体替换为：

```ts
/**
 * 侧边栏宽度单一来源测试。
 *
 * iOrbit 历史侧边栏与人脉左侧栏必须同宽（212px，以人脉为准），且这个宽度只能有
 * 一个来源。iOrbit 仍然可以拖拽调宽，但下限必须不高于初始宽度。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../app/(app)/app/orbit-layout-constants";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("the shared sidebar width matches the 人脉 column", () => {
  assert.equal(ORBIT_LEFT_SIDEBAR_WIDTH, 212);
});

test("the iOrbit sidebar derives its default width from the shared constant", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.ok(agent.includes("ORBIT_LEFT_SIDEBAR_WIDTH"));
  assert.ok(
    agent.includes("const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH"),
  );
});

test("the iOrbit drag lower bound does not exceed the initial width", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");
  const min = Number(
    /const HISTORY_SIDEBAR_MIN_WIDTH = (\d+)/.exec(agent)?.[1] ?? "0",
  );

  assert.ok(min > 0, "HISTORY_SIDEBAR_MIN_WIDTH must be a number literal");
  assert.ok(
    min <= ORBIT_LEFT_SIDEBAR_WIDTH,
    `min ${min} would clamp the ${ORBIT_LEFT_SIDEBAR_WIDTH}px initial width upward`,
  );
});

test("the iOrbit sidebar is still resizable", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.ok(agent.includes("clampHistorySidebarWidth"));
  assert.ok(agent.includes("HISTORY_SIDEBAR_MAX_WIDTH = 380"));
});

test("no contacts surface hardcodes the sidebar column width", () => {
  const contactsDir = join(projectRoot, "app/(app)/app/contacts");
  const offenders = readdirSync(contactsDir)
    .filter((name) => name.endsWith(".tsx"))
    .filter((name) =>
      readFileSync(join(contactsDir, name), "utf8").includes("212px 1fr"),
    );

  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/ui/orbit-sidebar-width-constant.test.ts`
Expected: FAIL —— 第一条断言 `248 !== 212`

- [ ] **Step 3: Change the constant and the drag lower bound**

修改 `app/(app)/app/orbit-layout-constants.ts`：

```ts
// 布局共享常量。
// iOrbit 历史侧边栏与人脉页左侧边栏必须同宽；以人脉列宽（212px）为准。
export const ORBIT_LEFT_SIDEBAR_WIDTH = 212;
```

修改 `app/(app)/app/agent/orbit-real-agent.tsx` 第 47 行：

```ts
const HISTORY_SIDEBAR_MIN_WIDTH = 180;
```

（`HISTORY_SIDEBAR_DEFAULT_WIDTH`、`HISTORY_SIDEBAR_MAX_WIDTH = 380`、`clampHistorySidebarWidth` 与拖拽逻辑一律不动。）

- [ ] **Step 4: Route the 9 grid sites through the constant**

在下列 5 个文件的 import 区各加一行（相对路径都是 `../orbit-layout-constants`，因为文件都在 `app/(app)/app/contacts/` 下）：

```ts
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
```

然后把这 5 个文件里**全部 9 处**

```ts
gridTemplateColumns: "212px 1fr"
```

替换为

```ts
gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`
```

分布：`orbit-real-contacts.tsx` 4 处、`orbit-real-cards-import.tsx` 1 处、`orbit-real-cards-dashboard.tsx` 1 处、`orbit-real-cards-pipeline-view.tsx` 1 处、`orbit-real-card-connection.tsx` 1 处。注意 `orbit-real-cards-dashboard.tsx` 里另有一处 `gridTemplateColumns: "34px 1fr auto"`，**那是卡片内部布局，不要动**。

把 `app/(app)/app/contacts/orbit-crm-sidebar.tsx` 里的注释

```
 *  Renders the full 212px column (bg + border + padding). */
```

改为

```
 *  Renders the full ORBIT_LEFT_SIDEBAR_WIDTH column (bg + border + padding). */
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --import tsx tests/ui/orbit-sidebar-width-constant.test.ts`
Expected: PASS（5 项）

- [ ] **Step 6: Verify both sidebars measure the same in the browser**

Run `npm run dev`，然后在浏览器分别打开 `http://localhost:3000/app/contacts` 与 `http://localhost:3000/app/agent`，在两页的 devtools console 里执行：

```js
document.querySelector('aside').getBoundingClientRect().width
```
Expected: 两页都是 `212`。停掉 dev server。

- [ ] **Step 7: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/orbit-layout-constants.ts" "app/(app)/app/agent/orbit-real-agent.tsx" "app/(app)/app/contacts" tests/ui/orbit-sidebar-width-constant.test.ts
git commit -m "fix(layout): align the iOrbit sidebar to the 212px contacts column

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: All actions 页 + 人脉侧栏入口

**Files:**
- Create: `app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model.ts`
- Create: `app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx`
- Create: `app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx`
- Create: `app/(app)/app/contacts/all-actions/page.tsx`
- Modify: `app/(app)/app/contacts/orbit-crm-sidebar.tsx`
- Test: `tests/pages/app-all-actions-route-view-model.test.ts`

**Interfaces:**
- Consumes: ledger service 与 API（含 `retry`/`undo` transition）、Task 4 的常量、`CrmSidebar`。
- Produces: `loadAppAllActionsRouteViewModel(searchParams?)`、types `AppAllActionsSearchParams`、`AllActionsFilterViewModel`（`{ key, label, count, active }`）、`AppAllActionsRouteViewModel`（`{ state, filters, entries, activeFilter, evidenceIds, errorCode, failureMessage }`）；组件 `OrbitRealAllActions({ viewModel })`、`OrbitAllActionsControls({ entryId, canUndo, canRetry })`；`CrmSidebarActive` 新增 `"allActions"` 成员。

- [ ] **Step 1: Write the failing test**

创建 `tests/pages/app-all-actions-route-view-model.test.ts`：

```ts
/**
 * All actions route view-model 测试。
 *
 * All actions 是账本的全量视图：包含 Today 不显示的 deferred，
 * 并按状态提供筛选。可撤销/可重试完全由条目状态推导。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadAppAllActionsRouteViewModel } from "../../app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";

test("all actions lists every ledger entry by default", async () => {
  const model = await loadAppAllActionsRouteViewModel();

  assert.equal(model.state, "success");
  assert.equal(model.entries.length, 6);
  assert.equal(model.activeFilter, "all");
});

test("the filter row carries a count per status plus an all bucket", async () => {
  const model = await loadAppAllActionsRouteViewModel();
  const byKey = new Map(model.filters.map((filter) => [filter.key, filter]));

  assert.equal(byKey.get("all")?.count, 6);
  assert.equal(byKey.get("awaiting_confirmation")?.count, 2);
  assert.equal(byKey.get("executing")?.count, 1);
  assert.equal(byKey.get("completed")?.count, 1);
  assert.equal(byKey.get("partially_failed")?.count, 1);
  assert.equal(byKey.get("undone")?.count, 1);
  assert.ok(byKey.get("all")?.active);
});

test("?status= narrows the list and moves the active filter", async () => {
  const model = await loadAppAllActionsRouteViewModel({
    status: "awaiting_confirmation",
  });

  assert.equal(model.activeFilter, "awaiting_confirmation");
  assert.equal(model.entries.length, 2);
  assert.ok(
    model.entries.every((entry) => entry.status === "awaiting_confirmation"),
  );
});

test("filter counts stay computed from the full ledger while filtered", async () => {
  const model = await loadAppAllActionsRouteViewModel({ status: "completed" });
  const all = model.filters.find((filter) => filter.key === "all");

  assert.equal(all?.count, 6);
  assert.equal(all?.active, false);
});

test("an unknown ?status= falls back to the all bucket", async () => {
  const model = await loadAppAllActionsRouteViewModel({ status: "nonsense" });

  assert.equal(model.activeFilter, "all");
  assert.equal(model.entries.length, 6);
});

test("the failure scenario yields a typed failure view model", async () => {
  const model = await loadAppAllActionsRouteViewModel({ scenario: "failure" });

  assert.equal(model.state, "failure");
  assert.equal(model.errorCode, "AGENT_LEDGER_MOCK_FAILED");
  assert.equal(model.entries.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/pages/app-all-actions-route-view-model.test.ts`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: Write the view-model**

创建 `app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model.ts`：

```ts
/**
 * All actions（操作账本）route view-model。
 *
 * 与 Today 的区别：这里是全量视图，包含 deferred，并按状态提供筛选。
 * 计数始终基于全量账本，不随当前筛选变化。
 */
import {
  AGENT_LEDGER_ENTRY_STATUSES,
  agentLedgerFailureToAppError,
  type AgentLedgerEntry,
  type AgentLedgerEntryStatus,
} from "../../../../../../features/agent/ledger/contract";
import { createAgentLedgerService } from "../../../../../../features/agent/service-factory";

export type AppAllActionsSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type AllActionsFilterKey = "all" | AgentLedgerEntryStatus;

export interface AllActionsFilterViewModel {
  key: AllActionsFilterKey;
  label: string;
  count: number;
  active: boolean;
}

export interface AppAllActionsRouteViewModel {
  state: "success" | "empty" | "failure";
  filters: readonly AllActionsFilterViewModel[];
  entries: readonly AgentLedgerEntry[];
  activeFilter: AllActionsFilterKey;
  evidenceIds: readonly string[];
  errorCode: string | null;
  failureMessage: string | null;
}

const FILTER_LABELS: Record<AllActionsFilterKey, string> = {
  all: "全部",
  awaiting_confirmation: "等待确认",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  undone: "已撤销",
};

function readParam(
  params: AppAllActionsSearchParams | undefined,
  key: string,
): string | null {
  const value = params?.[key];

  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;

  return null;
}

function resolveFilter(value: string | null): AllActionsFilterKey {
  return (AGENT_LEDGER_ENTRY_STATUSES as readonly string[]).includes(
    value ?? "",
  )
    ? (value as AgentLedgerEntryStatus)
    : "all";
}

export async function loadAppAllActionsRouteViewModel(
  searchParams?: AppAllActionsSearchParams,
): Promise<AppAllActionsRouteViewModel> {
  const service = createAgentLedgerService();
  const result = await service.listEntries({
    scenario: readParam(searchParams, "scenario"),
  });

  if (result.success === false) {
    return {
      activeFilter: "all",
      entries: [],
      errorCode: result.error.code,
      evidenceIds: result.error.evidenceIds,
      failureMessage: agentLedgerFailureToAppError(result).message,
      filters: [],
      state: "failure",
    };
  }

  const allEntries = result.data.entries;
  const activeFilter = resolveFilter(readParam(searchParams, "status"));
  const entries =
    activeFilter === "all"
      ? allEntries
      : allEntries.filter((entry) => entry.status === activeFilter);

  const statusFilters = AGENT_LEDGER_ENTRY_STATUSES.map((status) => ({
    active: activeFilter === status,
    count: allEntries.filter((entry) => entry.status === status).length,
    key: status as AllActionsFilterKey,
    label: FILTER_LABELS[status],
  })).filter((filter) => filter.count > 0);

  return {
    activeFilter,
    entries,
    errorCode: null,
    evidenceIds: result.data.provenance.evidenceIds,
    failureMessage: null,
    filters: [
      {
        active: activeFilter === "all",
        count: allEntries.length,
        key: "all",
        label: FILTER_LABELS.all,
      },
      ...statusFilters,
    ],
    state: allEntries.length === 0 ? "empty" : "success",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --import tsx tests/pages/app-all-actions-route-view-model.test.ts`
Expected: PASS（6 项）

- [ ] **Step 5: Write the controls and the page**

创建 `app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx`：

```tsx
"use client";

import { useState } from "react";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLedgerSuccess(body: unknown): boolean {
  return isRecord(body) && body.success === true;
}

export function readLedgerError(body: unknown): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }

  return "操作没有完成，请重试。";
}

/**
 * All actions 的写入口：撤销已完成的操作、重试失败项。
 * 重试是幂等的——成功项不会重复执行（由 ledger service 保证）。
 */
export function OrbitAllActionsControls({
  canRetry,
  canUndo,
  entryId,
}: {
  canRetry: boolean;
  canUndo: boolean;
  entryId: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 网络异常或非 JSON 响应都必须复位 pending，否则按钮会永久禁用。
  async function applyTransition(transition: "undo" | "retry"): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/agent/ledger/${encodeURIComponent(entryId)}/transition`,
        {
          body: JSON.stringify({ transition }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json()) as unknown;

      if (!isLedgerSuccess(body)) {
        setError(readLedgerError(body));
        setPending(false);
        return;
      }

      window.location.reload();
    } catch {
      setError("网络错误，操作未执行。请重试。");
      setPending(false);
    }
  }

  if (!canUndo && !canRetry) return null;

  return (
    <span style={{ alignItems: "center", display: "inline-flex", gap: 8 }}>
      {error ? (
        <span role="alert" style={{ color: "var(--danger, #b4413c)", fontSize: 12 }}>
          {error}
        </span>
      ) : null}
      {canRetry ? (
        <button
          className="btn"
          disabled={pending}
          onClick={() => void applyTransition("retry")}
          type="button"
        >
          重试失败项
        </button>
      ) : null}
      {canUndo ? (
        <button
          className="btn"
          disabled={pending}
          onClick={() => void applyTransition("undo")}
          type="button"
        >
          撤销
        </button>
      ) : null}
    </span>
  );
}
```

创建 `app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx`：

```tsx
/**
 * All actions（操作账本）主界面（server component）。
 *
 * 每一次写操作都记录在这里，可追溯、可撤销。筛选走真实 URL（?status=）。
 */
import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { AppAllActionsRouteViewModel } from "./compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitAllActionsControls } from "./orbit-all-actions-controls";

const STATUS_LABELS: Record<AgentLedgerEntry["status"], string> = {
  awaiting_confirmation: "等待确认",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  undone: "已撤销",
};

function EntryRow({ entry }: { entry: AgentLedgerEntry }) {
  const sourceLabels = entry.sourceRefs.map((ref) => ref.label).join("、");

  return (
    <li
      data-orbit-all-actions-entry={entry.entryId}
      style={{
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: 14,
        padding: "14px 0",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--text)", fontSize: 14.5, fontWeight: 600 }}>
          {entry.title}
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3 }}>
          来源：{sourceLabels}
        </div>
      </div>
      <OrbitAllActionsControls
        canRetry={entry.status === "partially_failed" || entry.status === "failed"}
        canUndo={
          entry.undoable &&
          (entry.status === "completed" || entry.status === "partially_failed")
        }
        entryId={entry.entryId}
      />
      <span className="chip" style={{ flexShrink: 0 }}>
        {STATUS_LABELS[entry.status]}
      </span>
    </li>
  );
}

export function OrbitRealAllActions({
  viewModel,
}: {
  viewModel: AppAllActionsRouteViewModel;
}) {
  if (viewModel.state === "failure") {
    return (
      <div data-orbit-route="app-all-actions-route-state">
        <div className="eyebrow">All actions</div>
        <h1 style={{ fontSize: 24, margin: "8px 0 12px" }}>账本暂时读不出来</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>{viewModel.failureMessage}</p>
      </div>
    );
  }

  return (
    <div data-orbit-all-actions>
      <div className="eyebrow">人脉</div>
      <h1 style={{ fontSize: 28, margin: "10px 0 6px" }}>All actions</h1>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 20px" }}>
        每一次写操作都记录在这里，可追溯、可撤销。
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {viewModel.filters.map((filter) => (
          <a
            aria-current={filter.active ? "true" : undefined}
            data-orbit-all-actions-filter={filter.key}
            href={
              filter.key === "all"
                ? "/app/contacts/all-actions"
                : `/app/contacts/all-actions?status=${filter.key}`
            }
            key={filter.key}
            style={{
              background: filter.active ? "var(--text)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
              color: filter.active ? "var(--surface)" : "var(--text-2)",
              fontSize: 13,
              padding: "6px 14px",
              textDecoration: "none",
            }}
          >
            {filter.label} {filter.count}
          </a>
        ))}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {viewModel.entries.map((entry) => (
          <EntryRow entry={entry} key={entry.entryId} />
        ))}
      </ul>
    </div>
  );
}
```

创建 `app/(app)/app/contacts/all-actions/page.tsx`：

```tsx
/**
 * All actions route adapter —— 挂在「人脉」左侧栏下。
 */
import { AccountTopNav } from "../../orbit-account-shell";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../orbit-layout-constants";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { CrmSidebar } from "../orbit-crm-sidebar";
import {
  loadAppAllActionsRouteViewModel,
  type AppAllActionsSearchParams,
} from "./compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitRealAllActions } from "./orbit-real-all-actions";

export const dynamic = "force-dynamic";

export default async function AppAllActionsPage({
  searchParams,
}: {
  searchParams?: Promise<AppAllActionsSearchParams>;
} = {}) {
  const viewModel = await loadAppAllActionsRouteViewModel(await searchParams);
  const language = await getOrbitServerLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <AccountTopNav active="cards" />
      <div
        data-orbit-route="app-all-actions-route"
        style={{
          display: "grid",
          gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`,
          height: "calc(100dvh - 64px)",
          minHeight: 0,
        }}
      >
        <CrmSidebar active="allActions" />
        <div style={{ overflowY: "auto", padding: "28px 32px 80px" }}>
          <OrbitRealAllActions viewModel={localizeOrbitTree(viewModel, language)} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Add the sidebar entry**

修改 `app/(app)/app/contacts/orbit-crm-sidebar.tsx`：把 `CrmSidebarActive` 加上新成员，

```ts
export type CrmSidebarActive =
  | "list"
  | "pipeline"
  | "graph"
  | "intros"
  | "dashboard"
  | "allActions"
  | "import"
  | "scan";
```

并在 `WALLET_ITEMS` 数组末尾追加一项：

```ts
  { key: "allActions", icon: "list", href: "/app/contacts/all-actions", label: { en: "All actions", zh: "All actions" } },
```

- [ ] **Step 7: Verify end to end**

Run `npm run dev`，另开终端：

```bash
curl -s -o /dev/null -w 'all-actions %{http_code}\n' http://localhost:3000/app/contacts/all-actions
curl -s "http://localhost:3000/app/contacts/all-actions?status=partially_failed" | grep -c 'data-orbit-all-actions-entry="ledger-sync-three-events"'
curl -s http://localhost:3000/app/contacts | grep -c 'href="/app/contacts/all-actions"'
```
Expected: `all-actions 200`、第二条 `1`（筛选生效）、第三条 ≥ `1`（人脉页侧栏出现入口）。停掉 dev server。

- [ ] **Step 8: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/contacts/all-actions" "app/(app)/app/contacts/orbit-crm-sidebar.tsx" tests/pages/app-all-actions-route-view-model.test.ts
git commit -m "feat(contacts): add the All actions ledger page to the CRM sidebar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 权限与通知设置区 + lint 列表

**Files:**
- Create: `app/(app)/app/contacts/all-actions/orbit-all-actions-settings.tsx`
- Modify: `app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx`（页尾挂入设置区）
- Modify: `package.json`（lint tsc 列表追加本计划新增文件）
- Test: `tests/pages/app-all-actions-settings.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `OrbitRealAllActions`。
- Produces: `OrbitAllActionsSettings()`（client，无 props；本地状态即可，设置持久化留给后续 agent-settings 接线）。

**范围说明：** 设计稿的设置区有三项——自动准备会面笔记、活动后推送跟进提醒、安静时段 22:00–08:00。本任务只做界面与本地交互，**不接 `/api/agent/settings`**（既有 autonomy settings contract 尚无安静时段字段，接线属于后续计划）。测试与文案都必须如实反映"尚未持久化"。

- [ ] **Step 1: Write the failing test**

创建 `tests/pages/app-all-actions-settings.test.tsx`：

```tsx
/**
 * All actions 权限与通知设置区测试。
 *
 * 三项设置来自设计稿；当前只有界面与本地交互，尚未持久化到 agent settings。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitAllActionsSettings } from "../../app/(app)/app/contacts/all-actions/orbit-all-actions-settings";

test("the settings block renders the three designed controls", () => {
  const html = renderToStaticMarkup(<OrbitAllActionsSettings />);

  assert.ok(html.includes("权限与通知"));
  assert.ok(html.includes("自动准备会面笔记"));
  assert.ok(html.includes("活动后推送跟进提醒"));
  assert.ok(html.includes("安静时段"));
  assert.ok(html.includes("22:00"));
  assert.ok(html.includes("08:00"));
});

test("the settings block is honest about not persisting yet", () => {
  const html = renderToStaticMarkup(<OrbitAllActionsSettings />);

  assert.ok(html.includes("尚未保存"));
});

test("both toggles render as checkboxes defaulted on", () => {
  const html = renderToStaticMarkup(<OrbitAllActionsSettings />);
  const checkboxes = html.match(/type="checkbox"/g) ?? [];

  assert.equal(checkboxes.length, 2);
  assert.equal((html.match(/checked=""/g) ?? []).length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --import tsx tests/pages/app-all-actions-settings.test.tsx`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: Write the settings block**

创建 `app/(app)/app/contacts/all-actions/orbit-all-actions-settings.tsx`：

```tsx
"use client";

import { useState } from "react";

/**
 * 权限与通知设置区。
 *
 * 目前只有界面与本地交互：agent autonomy settings contract 还没有安静时段字段，
 * 接线属于后续计划，所以这里明确告诉用户改动尚未保存。
 */
function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        display: "flex",
        gap: 12,
        padding: "14px 0",
      }}
    >
      <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>{label}</span>
      {/* globals.css 给裸 input 设了 width:100% + min-height，checkbox 必须显式覆盖。 */}
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ flexShrink: 0, height: 16, minHeight: 0, padding: 0, width: 16 }}
        type="checkbox"
      />
    </label>
  );
}

export function OrbitAllActionsSettings() {
  const [autoNotes, setAutoNotes] = useState(true);
  const [postEventReminders, setPostEventReminders] = useState(true);

  return (
    <section data-orbit-all-actions-settings style={{ marginTop: 36 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        权限与通知
      </div>
      <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: "0 0 8px" }}>
        改动尚未保存 —— 设置的持久化会随 agent settings 一起接入。
      </p>

      <ToggleRow
        checked={autoNotes}
        label="自动准备会面笔记"
        onChange={setAutoNotes}
      />
      <ToggleRow
        checked={postEventReminders}
        label="活动后推送跟进提醒"
        onChange={setPostEventReminders}
      />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          padding: "14px 0",
        }}
      >
        <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>安静时段</span>
        <span className="mono" style={{ color: "var(--text-2)", fontSize: 13 }}>
          22:00 – 08:00
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Mount it on the All actions page**

修改 `app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx` —— 新增 import：

```tsx
import { OrbitAllActionsSettings } from "./orbit-all-actions-settings";
```

并在 `OrbitRealAllActions` 成功分支的 `</ul>` 之后、最外层 `</div>` 之前插入：

```tsx
      <OrbitAllActionsSettings />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --import tsx tests/pages/app-all-actions-settings.test.tsx`
Expected: PASS（3 项）

- [ ] **Step 6: Append new files to the lint tsc list**

修改 `package.json` 的 `lint` script：在文件列表末尾（Task 5 of the ledger plan 追加的 `"tests/api/agent-action-ledger-routes.test.ts"` 之后）继续追加：

```
"app/(app)/app/orbit-layout-constants.ts" "app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model.ts" "app/(app)/app/today/orbit-real-today.tsx" "app/(app)/app/today/orbit-today-decision-panel.tsx" "app/(app)/app/today/orbit-today-decision-form.tsx" "app/(app)/app/today/page.tsx" "app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model.ts" "app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx" "app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx" "app/(app)/app/contacts/all-actions/orbit-all-actions-settings.tsx" "app/(app)/app/contacts/all-actions/page.tsx" "tests/pages/app-today-route-view-model.test.ts" "tests/pages/app-all-actions-route-view-model.test.ts" "tests/ui/orbit-top-nav-links.test.ts" "tests/ui/orbit-sidebar-width-constant.test.ts"
```

Run: `npm run lint`
Expected: 新增文件零错误。若报既有无关文件的错误，如实记录、不要去修与本计划无关的文件。

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 本计划新增的全部测试通过；失败数不得超过基线的 66 个既有失败。如实记录实际数字。

- [ ] **Step 8: Commit**

```bash
cd /Users/li/work/orbit && node .gitnexus/run.cjs detect-changes --repo orbit
cd repos/orbits && git add "app/(app)/app/contacts/all-actions" tests/pages/app-all-actions-settings.test.tsx package.json
git commit -m "feat(contacts): add permissions and quiet-hours settings to All actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Follow-up（本计划不做，留给后续）

1. **账本持久化**：mock 模式每请求新建 service，确认/撤销刷新即回滚。需要 Postgres live-record-provider 才能真正落地。
2. **设置接线**：`agent autonomy settings` contract 尚无安静时段字段；Task 6 的三项设置目前只有界面。
3. **`mockOutcome: "fail"` fixture**：账本的 entry 级 `failed` 状态与 retry-`undoable` 回归测试目前无法被现有 fixture 覆盖（上一份计划终审的已知缺口）。
4. **i18n 词典**：新增中文文案在 EN 下不翻译，需要扩展 `localizeOrbitTree` 的词典来源。
5. **Today「即将发生」区**：设计稿里还有"即将发生 + 与目标联系人重叠"，需要 events/schedule 数据，属于另一条数据链路。
6. **两个新页面的移动端布局**（终审 2026-07-25 记录）：`/app/today` 与 `/app/contacts/all-actions` 目前只有桌面布局（无 `orbit-desktop-only`/`orbit-mobile-only` 变体）。修复移动端汉堡导航时必须同时给这两页移动端布局，否则修好导航反而暴露破版页面。
7. **账本 UI 帮助函数去重**：`isLedgerSuccess`/`readLedgerError`/`readParam`/状态标签字典在 Today 与 All actions 各有一份，待抽 `ledger-ui-helpers` 共享模块；all-actions controls 的多余导出一并收掉。
8. **live provider 落地时**：Today 的 `?entry=` 会命中列表不显示的 deferred 条目（面板与列表不一致）；宽度测试改为递归扫描；补 `mockOutcome:"fail"` fixture。
