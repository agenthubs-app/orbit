# Sprint W0025 — 跟进排序运行时白名单与首页「部分来源不可用」

**Plan revision:** 2（本 Sprint 由 W0022 revision 1 的 W22-2 拆出，首版即按 revision 2 的 review 处理编制）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-01（「我该先联系谁」入口保留在本周推进栏底部，数据全部真实）、RV-02（验收发现）。来源：W0018 REPORT 交接；W22-2 用户 2026-09-29 决定「纳入」。
**单一目标:** `assertLifecycleNodeSortRuntime` 从单一 Node/ICU 组合改为经差分测试的白名单，加入本机组合；首页 `partial` 把跟进来源算进去。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（W0022 合并后；revision 2 编制时是 `1d41bdfc`）。
**进入条件:**
- W0022 已合并（两者都改 `iorbit-home.tsx`，不并行）。
- 本机 PG 测试库可用：`node scripts/assert-local-test-databases.mjs` 通过；`ORBIT_LIFECYCLE_TEST_DATABASE_URL` 显式导出为本机 `orbit_neon_audit_20260925`（用户名和密码取自本机 `ORBIT_EVENT_DATABASE_URL`，不要 source `.env`）。
- 不需要云端授权，不调用付费 AI，不部署。

## 已查清的事实（revision 2 按源码复核）

1. `features/followups/storage/lifecycle-task-pages.ts`
   - 第 174 行 `lifecycleSortRuntimeSchema`：PG 元组 zod 字面量（`pg "160012"`、`encoding "UTF8"`、`catalog`／`actual` `"153.136"`、`provider "i"`、`deterministic true`）。本机 PG 元组符合。
   - 第 175–177 行 `assertLifecycleNodeSortRuntime()`：只放行 `node 25.6.0 / icu 78.2 / unicode 17.0`，否则抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`。本机是 `26.10.0 / 78.3 / 17.0`。
   - 第 218 行：分页 `read` 在 SQL 返回**之后**才断言（不通过时已经读过库）；`lifecycle-home-summary.ts:69` 在查询**之前**断言；`features/connections/lifecycle/task-page.ts:46` 也调用。
2. 调用链：首页／策略页 `app/(app)/app/agent/home-facts-route-service.ts:814` `loadFollowups`、`:846` `loadBoundedFollowups` → `createLifecycleHomeSummaryReader().read()` → 断言抛错 → 被吞成 `unavailableFollowupSource`（同文件约 826–852 行）→ 策略页 `whoFirstState = unavailable`（`strategy-route-view-model.ts:134`）。`/app/tasks`（`app/(app)/app/tasks/page.tsx`，经 `lifecycle-pages-route-service`）和 `/api/relationship-tasks/page`（`app/api/relationship-tasks/page/handler.ts` → `task-page.ts`）同受影响。
3. 白名单来自 `e08a0806`（只在 chat-agent 上），约定见 `docs/operations/2026-09-25-bounded-read-v2-execution.md` 第 67 行与第 136 行：「经等价测试的运行时白名单、其他组合 fail-closed、目标生产运行时未验证即发布门」。
4. 首页 `iorbit-home.tsx:866` 的 `partial` 只看 `snapshot`、`signals`、`pendingCardsState`，不看 `facts.followups.state`；跟进项在第 494 行取 `facts?.followups.current.items`。所以跟进来源失败时首页仍会说「今天没有必须处理的事。」（第 1060 行）。
5. 同类单一组合还在联系人搜索：`features/contacts/storage/contact-list-postgres-reader.ts:1247` `APPROVED_CONTACT_SEARCH_RUNTIME`（同样只认 `25.6.0 / 78.2`）。**不在本 Sprint**，列为观察项并写进 W0019 发布门。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/followups/storage/lifecycle-task-pages.ts`：第 174–177 行（schema 与断言），第 205–220 行（分页 `read` 里的断言位置）。
- `features/followups/storage/lifecycle-home-summary.ts`：第 64–75 行 `createLifecycleHomeSummaryReader`。
- `features/connections/lifecycle/task-page.ts`：第 7 行 import，第 46 行断言。
- `app/(app)/app/agent/home-facts-route-service.ts`：第 814–870 行。
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`：第 494 行、第 860–870 行 `partial`、第 1060 行空态文案。
- `tests/services/lifecycle-task-pages-postgres.test.ts`（4 个差分用例，`skip: !ORBIT_LIFECYCLE_TEST_DATABASE_URL`）、`tests/services/relationship-task-page-postgres.test.ts`（1 个，同一变量）。
- `docs/operations/2026-09-25-bounded-read-v2-execution.md` 第 60–70 行、第 130–140 行。

### 关键符号与影响等级（GitNexus，2026-09-29 刷新到 `1d41bdf`）
- `assertLifecycleNodeSortRuntime`：**CRITICAL**（partial；直接调用方是三个 `read`，深度 2 的扇出经通用方法名 `read` 放大）。实际调用方以文本搜索为准：3 处（上文事实 1）。按共享契约处理，不因扇出来源而降级。
- `IOrbitHome`：**CRITICAL**（partial，直接调用方 3 个）。本 Sprint 只改 `partial` 的一个条件。

### 前序交接要点
- W0021：首页不新增客户端请求；流量口径是数据库返回字节。
- W0022：已给 `IOrbitHome` 加可选 props（引导入口与第 4 步提醒），本 Sprint 不动那部分。
- W0016／W0018：3001 验收 server、`verify-session-cookie.ts`、`--reset`。

### 易错边界（都对应到 SC）
- 只加入差分测试在**本机实际运行时**全部通过的组合；差分任一失败则撤回该组合，SC-01 记 failed，不以放宽断言或跳过用例换通过。（SC-01）
- 其他组合仍 fail-closed；不能写成「只比较 major 版本」或「unicode 相同即放行」。（SC-02）
- 不改 PG 元组 schema（生产 Neon 元组未验证，不能为它放宽字面量）。（SC-02）
- 不改排序 SQL、分组、计数和游标；只改放行判断。（SC-01 的差分即证明）
- 不写「生产可用」；发布门写进 REPORT 交给 W0019。（SC-04）
- 首页 `partial` 只增加跟进来源条件，其余来源判断不变。（SC-03）

## 范围与文件

- **修改：**
  - `features/followups/storage/lifecycle-task-pages.ts`（白名单常量 + 可注入版本号的纯判断函数，`assertLifecycleNodeSortRuntime` 保持签名与抛错码）
  - `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`（`partial` 条件）
  - 对应测试
- **新建：** 白名单单测（可加在现有 lifecycle 测试文件里，或新建 `tests/services/lifecycle-sort-runtime.test.ts`）。
- **排除：** 联系人搜索运行时白名单（观察项）；分页 `read` 断言位置前移（观察项：不通过时仍会先读库）；生产运行时；部署；迁移。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0025-01 | 本机组合 `node 26.10.0 / icu 78.3 / unicode 17.0` 加入白名单后，`tests/services/lifecycle-task-pages-postgres.test.ts`（4 个）与 `tests/services/relationship-task-page-postgres.test.ts`（1 个）在本机 PG 上全部通过、0 skip；REPORT 记录 `process.versions`、`select version()` 与排序规则版本 | PG 差分测试输出（证据目录），先跑 `node scripts/assert-local-test-databases.mjs` |
| SC-W0025-02 | 白名单判断：`25.6.0/78.2/17.0` 与 `26.10.0/78.3/17.0` 放行；`26.10.0/78.2/17.0`、`26.9.0/78.3/17.0`、`26.10.0/78.3/16.0` 等非白名单组合抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`；`lifecycleSortRuntimeSchema` 仍拒绝与字面量不符的 PG 元组 | 单测（注入版本号，不改 `process.versions`） |
| SC-W0025-03 | 首页：`facts.followups.state === "unavailable"` 时不显示「今天没有必须处理的事。」，按现有「部分来源不可用」样式呈现；跟进来源可用且无事项时仍显示原空态 | 首页组件测试（复用 `tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`），先 RED 后 GREEN |
| SC-W0025-04 | 真实页面：3001 上 verify-legacy 的策略页「先联系谁」显示真实列表，或「当前没有待推进的联系人机会」，不显示「来源暂时不可用」；`/app/tasks` 跟进分页不再是来源不可用；首页跟进补位正常；桌面 1440、手机 375，控制台 0 错误。REPORT 写 W0019 发布门（见「失败与交接」） | 截图 + REPORT |
| SC-W0025-05 | 回归：`tests/pages/app-home-facts-followup-reader.test.ts`、`tests/pages/app-agent-home-dashboard-entry.test.ts`、`tests/pages/app-agent-strategy-route-view-model.test.ts`、`tests/pages/app-home-facts-task-summary-reader.test.ts`、`tests/pages/web-tasks-relationship-lifecycle.test.tsx`、`tests/api/relationship-lifecycle-routes.test.ts` 通过；typecheck 通过；一次全量基线对照没有新增失败（旧基线里因运行时不符而失败的用例若变绿，单列） | 定向集、`npx tsc --noEmit -p .`、RULES §5.2 全量对照 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线和 Planner 哈希。对 `assertLifecycleNodeSortRuntime`、`IOrbitHome` 做 upstream impact，并用文本搜索列出真实调用方。
2. 写 RED：白名单单测（SC-02）、首页 `partial`（SC-03）。
3. 先把白名单改为可注入的纯判断（只含旧组合，行为不变）→ 加入本机候选组合 → 跑两组 PG 差分（SC-01）。失败则撤回候选组合，结束为 failed 并写 REPORT。
4. 首页 `partial` 修正 → 定向集 → 3001 浏览器 → 暂存区 `detect-changes` → 提交。
5. 全量对照，一次 Codex 代码 review，同一 Generator 修复，写 REPORT，交接。

## 最小测试与检查

- **档位：H。** 理由：跨 `/app/tasks`、首页、策略页、关系任务接口的共享契约；图谱 CRITICAL。
- **开发定向集：** SC-02 单测、SC-03 首页组件测试、SC-01 两个 PG 测试文件（`ORBIT_LIFECYCLE_TEST_DATABASE_URL` 显式导出，库名必须是 `orbit_neon_audit_20260925`）。
- **收口：** SC-05 列出的消费者测试、typecheck、一次全量基线对照、一次 Codex 代码 review。
- **浏览器：** 3001，verify-legacy。
- **不运行：** 付费 AI、Preview、生产运行时探测（没有授权）。

## 失败与交接

REPORT 必须写：
- 白名单加入的组合、差分测试结果与本机 PG／排序规则版本；
- **给 W0019 的发布门**：目标生产环境的 Vercel Node/ICU/Unicode 版本与 Neon PG `server_version_num`、`und-x-icu` 排序规则 `collversion` 必须先验证，且在该组合上跑通同两组差分测试后写进白名单；没验证就部署 chat-agent，「先联系谁」、`/app/tasks` 跟进分页、首页跟进补位、关系任务分页在生产都会 fail-closed 为不可用。联系人搜索（`APPROVED_CONTACT_SEARCH_RUNTIME`）同理，也要列进同一发布门；
- 观察项：联系人搜索单一组合；分页 `read` 在断言前已读库。

## 修订记录

| review 意见（codex-plan-review.txt） | 处理 |
| --- | --- |
| P1-3（W0022 混合三条操作链，运行时白名单是共享 H 风险） | 接受。运行时白名单与首页 `partial` 从 W0022 拆出成本 Sprint，档位 H，含 W0019 发布门 |
| 其余 | 不涉及本 Sprint。编制时另发现联系人搜索也用单一运行时组合，列为观察项并纳入发布门 |
