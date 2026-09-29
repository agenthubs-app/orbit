# Sprint W0024 — 活动页按账号 id 读报名

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-02（已知待修：读报名要与写入口径一致，用 `actor.id`）。来源：W0018 REPORT 交接的「W0024 活动页报名口径」。
**单一目标:** `app/(app)/app/events/page.tsx` 在目录读取成功后解析一次账号，按 `actor.id` 读本人报名并与社群状态共用；查询次数不增加，返回字节增量实测并在上限内。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（W0026 合并后；revision 2 编制时是 `1d41bdfc`）。
**进入条件:** 无代码依赖；按执行顺序排在 W0026 之后。不需要云端授权。W24-1 已由用户 2026-09-29 决定：活动详情页另开 Sprint（W0027），本 Sprint 不碰。

## 已查清的事实（revision 2 按源码复核）

- `app/(app)/app/events/page.tsx`（143 行）：
  - 第 60–65 行 `Promise.all([auth(), getOrbitServerLanguage(), searchParams])`。
  - 第 66–69 行 `createConfiguredCanonicalPublicEventCatalogue()`，未配置时抛错；第 70–72 行 `await canonicalCatalogue.read()`（失败时抛出，页面进错误边界）。
  - 第 73–77 行 `readRuntimeEventRegistrationStates({ eventIds, userId: session?.user?.id })`——**问题所在**。
  - 第 98–109 行：登录用户**已经**调用了一次 `resolveAuthenticatedApiActorFromSession`（读一次账号会话图，`app/api/_shared/authenticated-actor.ts:117–134`），但只用于社群状态，且在报名读取之后、目录读取之后。
- 所以把这次解析挪到「目录读取成功之后、报名读取之前」，报名和社群共用 `actor.id`，**查询次数**不变；目录未配置或读取失败时仍然不读账号图（与现状一致）。
- **返回字节会增加**：`readRuntimeEventRegistrationStates`（`features/events/registration/runtime.ts:126`）经 `listRuntimeEventRegistrationsForUser`（第 69 行）读 legacy 投影和 canonical 报名的完整行。账号 id 与会话 id 不同的用户，修改前按会话 id 基本查不到行，修改后会返回他真实的报名行。按 W0017／D12 的「数据库返回字节」口径，这是增量，必须实测或估算，不能写 0 B。
- 活动页的活动 id 直接来自 canonical 目录，不需要 `/app/agent` 用的 `resolveConfiguredActorEventCanonicalIds` 映射。
- 参照口径：W0018 在 `app/(app)/app/agent/page.tsx` 的修法——第 220–223 行 `resolveConfiguredActorEventCanonicalIds({ actorId, eventIds })`，第 224–230 行 `readRuntimeEventRegistrationStates({ eventIds, userId: actorId })`，第 244 行 `readCommunityJoinedForActor({ actorId })`。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/events/page.tsx`：整页（事实见上）。
- `features/events/registration/runtime.ts`：第 69–111 行 `listRuntimeEventRegistrationsForUser`，第 126 行 `readRuntimeEventRegistrationStates(input: { eventIds: readonly string[]; userId?: string | null }): Promise<Record<string, RuntimeEventRegistrationState>>`。`userId` 为空时不读本人报名，只读可报名状态。
- `app/api/_shared/authenticated-actor.ts:117`：`resolveAuthenticatedApiActorFromSession(session): Promise<AuthenticatedApiActor | null>`。
- `features/community/service-factory.ts:95`：`readCommunityJoinedForActor({ actorId })`。
- `tests/pages/app-agent-registration-actor-id.test.tsx`：W0018 的回归测试，用 require.cache 替换页面依赖，替换 runtime 底下的 legacy 投影和 canonical membership 两条存储。本 Sprint 照这个写法做。
- `scripts/measure-plan-read-traffic.ts`：W0017／W0021 的本机返回字节测量写法（参照，用于 SC-03）。

### 关键符号与影响等级（GitNexus，2026-09-29 刷新到 `1d41bdf`）
- `AppEventsPage`：UNKNOWN（路由入口，无代码调用方；文本搜索确认只由 Next 路由加载）。
- `readRuntimeEventRegistrationStates`：同名歧义；本文件那一个 LOW（受影响 4，直接调用方 3：`/app/start`、`/app/agent`、`/app/events`）。**不改**，只改调用参数。
- `resolveAuthenticatedApiActorFromSession`：CRITICAL（直接调用方 22）。**不改**，只调用。

### 前序交接要点
- W0018：报名接口以 `actor.id` 写入，键为 eventId + actorId；读取必须用同一个 id。回归测试已有夹具。
- W0017／W0021：流量口径是数据库返回字节；查询次数和 SQL 形状不变不代表返回字节不变。
- W0016：verify 账号的会话 `sub` 就是账号 id，两者相同，所以浏览器只能证明没有回归，差异要靠测试证明。

### 易错边界（都对应到 SC）
- 不能回退到会话 id：解析返回 null 时不读本人报名，页面按「未报名」渲染，社群显示未加入，不抛错。（SC-02）
- 顺序不能变成「和目录并行」：账号解析保持在目录读取成功之后；目录未配置或 `read()` 失败时账号解析 0 次。（SC-02）
- 不能新增查询：登录请求里账号解析恰好 1 次（报名和社群共用），本人报名读取恰好 1 次；未登录时两者都是 0 次。（SC-02）
- 返回字节增量要有数：实测单次增量并按假设估算月增量，超过上限时 SC-03 失败，停下写 REPORT 请用户裁决，不在本 Sprint 裁剪 `readRuntimeEventRegistrationStates` 的返回列。（SC-03）
- 不改可报名状态的读取、目录读取、活动顺序和社群卡片位置；不碰活动详情页（W0027）。（SC-04）

## 范围与文件

- **修改：** `app/(app)/app/events/page.tsx`。
- **新建：** `tests/pages/app-events-registration-actor-id.test.tsx`；测量如需脚本，只放本机临时目录或证据目录，不进仓库。
- **排除：** 活动详情页（W0027）、`readRuntimeEventRegistrationStates` 本身、报名写入接口、`/app/start`、`/app/agent`。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0024-01 | 账号 id ≠ 会话 id：报名记在账号 id 下时，列表项 `youRsvped=true`，`scope=registered` 能看到；只记在会话 id 下时是未报名。legacy 投影（`legacy_unenrolled`）和 canonical membership（`enrolled`）两条路径都成立 | 新测试先 RED 后 GREEN |
| SC-W0024-02 | 调用计数与顺序：登录且目录成功时，账号解析 1 次（在 `canonicalCatalogue.read()` 成功之后）、本人报名读取 1 次（参数是 `actor.id`）、社群读取用同一个 `actor.id`；未登录时账号解析 0 次、本人报名读取 0 次；目录未配置或 `read()` 抛错时账号解析 0 次、报名读取 0 次；解析返回 null 时不读本人报名、也不以会话 id 读，页面照常渲染 | 同一测试计数各依赖的调用次数、参数与先后 |
| SC-W0024-03 | 流量：改前改后语句数相同（REPORT 列表）；本机实测一名账号有 1、5 场有效报名时 `listRuntimeEventRegistrationsForUser` 的返回字节（legacy 投影与 canonical 两路分别列），按「1000 人、全部账号 id ≠ 会话 id、每人每天打开活动页 1 次、每人 5 场有效报名」估算月增量，**上限 30 MB／月**；超出则本项记 failed，功能提交保留但不合并，交用户裁决（上线接受增量，或另开 Sprint 裁剪返回列） | 测量输出（证据目录）+ REPORT 表格 |
| SC-W0024-04 | 回归：未登录活动页和社群卡片不变（`tests/pages/app-events-community-card.test.tsx`、`tests/pages/app-events-registration-state.test.ts`、`tests/pages/app-events-live-route-services.test.ts`、`tests/pages/app-agent-registration-actor-id.test.tsx` 通过）；3001 上 verify-plan 的活动页显示验收活动「已报名」，控制台 0 错误；typecheck 通过；一次全量基线对照没有新增失败 | 定向集、tsc、浏览器截图（1440、375）、全量对照 |

## 一次 Generator 的执行顺序

1. 复核基线，保存 Planner 哈希。对 `AppEventsPage` 做 impact（UNKNOWN 时用文本搜索补查）。
2. 按 W0018 写法写 RED 测试（SC-01、SC-02，含目录失败分支）。
3. 最小改动：目录读取成功后解析账号，报名读取和社群共用 `actor.id`；解析为 null 时不读本人报名。**不与目录读取并行。**
4. 跑定向集和 typecheck；本机测量（SC-03）；浏览器验证；暂存区 `detect-changes`；提交。
5. 全量对照，一次 Codex 代码 review，同一 Generator 修复，写 REPORT，交接分支和固定 SHA。

## 最小测试与检查

- **档位：H。** 理由：读取身份口径变化（RULES §5.1「身份」）。改动面只有一个文件，review 和全量各做一次，不额外扩测。
- **开发定向集：** 新测试；`tests/pages/app-agent-registration-actor-id.test.tsx`（共用夹具不回归）；`tests/pages/app-events-community-card.test.tsx`、`tests/pages/app-events-registration-state.test.ts`、`tests/pages/app-events-live-route-services.test.ts`。
- **收口：** typecheck；全量基线对照（RULES §5.2）；一次 Codex 代码 review。
- **测量：** 本机库，按 `scripts/measure-plan-read-traffic.ts` 的口径（数据库返回字节），不 source `.env`。
- **浏览器：** 3001，verify-plan，桌面 1440 和手机 375。

## 失败与交接

REPORT 写：改前改后语句数对照、SC-03 的实测字节与月增量估算（含假设）、目录失败分支的计数证据；活动详情页问题已登记为 W0027。

## 修订记录

| review 意见（codex-plan-review.txt） | 处理 |
| --- | --- |
| P1-1（「查询条数不变」被错推为「出站 0 B」） | 接受。删掉 0 B 结论；GOAL 改为「查询次数不增加，返回字节增量实测／估算」；SC-03 改为实测单次字节并按假设估算，上限 30 MB／月，超出即失败 |
| P1-4（详情页身份问题未登记具体 Sprint） | 接受。用户 2026-09-29 决定另开 Sprint：W0027（H，含访问控制回归），GOAL 与 PLANNER 已写 |
| P2-1（「可与目录读取并行」改变失败路径读取） | 接受。保持「目录读取成功后再解析账号」顺序，删去并行建议；SC-02 增加「目录未配置或读取失败时账号解析 0 次」计数 |
| P2-2（`app/(app)/app/agent/page.tsx` 行号不准） | 接受。按源码改为第 220–223、224–230、244 行，并注明三个关键调用 |
| 其余 | 不涉及本 Sprint |
