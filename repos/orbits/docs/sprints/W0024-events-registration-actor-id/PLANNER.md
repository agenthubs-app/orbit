# Sprint W0024 — 活动页按账号 id 读报名

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-02（已知待修：读报名要与写入口径一致，用 `actor.id`）。来源：W0018 REPORT 交接的「W0024 活动页报名口径」。
**单一目标:** `app/(app)/app/events/page.tsx` 按 canonical actor id 读本人报名；不增加数据库读取。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时是 `23563a57`，W0022 合并后以新 HEAD 为准）。
**进入条件:** 无代码依赖；按用户排定的顺序在 W0022 之后执行。不需要云端授权。

## 已查清的事实（编制时核对）

- `events/page.tsx` 第 74–77 行用 `userId: session?.user?.id` 调 `readRuntimeEventRegistrationStates`。
- 第 100–109 行，登录用户**已经**调用了一次 `resolveAuthenticatedApiActorFromSession`，但只拿来读社群状态，而且是在报名读取之后。
- 这次解析会读一次账号会话图（`authenticated-actor.ts:117–134`）。所以把解析提前、复用 `actor.id`，读取条数不变。
- 活动页的活动 id 直接来自 canonical 目录，不需要 W0018 在 `/app/agent` 用的 `resolveConfiguredActorEventCanonicalIds` 映射。
- 同类问题还在活动详情页 `/app/events/[id]/page.tsx:135`：`actorId: session?.user?.id` 用于已报名、主办方判断和私密活动访问。它牵涉授权，**不在本 Sprint**（W24-1）。

## 等待用户决定

| 编号 | 问题 | 推荐默认 |
| --- | --- | --- |
| W24-1 | 活动详情页同类问题（会话 id 用于已报名、主办方、私密访问）是否并入 | 不并入，另开 Sprint（H，含授权回归）。本 Sprint 只做列表页，不阻塞启动 |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/events/page.tsx`：整页 143 行；第 60–77 行是会话、目录和报名读取，第 98–109 行是账号解析和社群状态。
- `features/events/registration/runtime.ts:126`：`readRuntimeEventRegistrationStates(input: { eventIds: readonly string[]; userId?: string | null }): Promise<Record<string, RuntimeEventRegistrationState>>`。`userId` 为空时不读本人报名，只读可报名状态。
- `app/api/_shared/authenticated-actor.ts:117`：`resolveAuthenticatedApiActorFromSession(session): Promise<AuthenticatedApiActor | null>`，读一次账号会话图。
- `features/community/service-factory.ts:95`：`readCommunityJoinedForActor({ actorId })`。
- `tests/pages/app-agent-registration-actor-id.test.tsx`：W0018 的回归测试，用 require.cache 替换页面依赖，替换 runtime 底下的 legacy 投影和 canonical membership 两条存储。本 Sprint 照这个写法做。
- `app/(app)/app/agent/page.tsx:200–217`：W0018 的修法（参照口径）。

### 关键符号与影响等级
- `AppEventsPage`：UNKNOWN（路由入口，无代码调用方；文本搜索确认只由 Next 路由加载）。
- `readRuntimeEventRegistrationStates`：UNKNOWN（进程轴 LOW，最多 4 个受影响，直接调用方 3 个：`/app/start`、`/app/agent`、`/app/events`）。本 Sprint **不改**这个函数，只改调用参数。

### 前序交接要点
- W0018：报名接口以 `actor.id` 写入，键为 eventId + actorId；读取必须用同一个 id。回归测试已有夹具。
- W0017／W0021：流量口径是数据库返回字节；HTTP 响应变小不能代替数据库读取变少。
- W0016：verify 账号的会话 `sub` 就是账号 id，两者相同，所以浏览器只能证明没有回归，差异要靠测试证明。

### 易错边界（都对应到 SC）
- 不能回退到会话 id：解析失败（返回 null）时不读本人报名，页面按「未报名」渲染，社群显示未加入，不抛错。
- 不能新增读取：登录请求里账号解析恰好 1 次（报名和社群共用），本人报名读取恰好 1 次；未登录时两者都是 0 次。
- 不改可报名状态的读取、目录读取、活动顺序和社群卡片位置。
- 不碰活动详情页。

## 范围与文件

- **修改：** `app/(app)/app/events/page.tsx`。
- **新建：** `tests/pages/app-events-registration-actor-id.test.tsx`。
- **排除：** 活动详情页（W24-1）、`readRuntimeEventRegistrationStates` 本身、报名写入接口、`/app/start`、`/app/agent`。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0024-01 | 账号 id ≠ 会话 id：报名记在账号 id 下时，列表项 `youRsvped=true`，`scope=registered` 能看到；只记在会话 id 下时是未报名。legacy 投影（`legacy_unenrolled`）和 canonical membership（`enrolled`）两条路径都成立 | 新测试先 RED 后 GREEN |
| SC-W0024-02 | 读取次数：登录请求里账号解析 1 次、本人报名读取 1 次（按 `actor.id`）、社群读取用同一个 `actor.id`；未登录时账号解析 0 次、本人报名读取 0 次；解析返回 null 时不读本人报名，也不以会话 id 读，页面照常渲染 | 同一测试计数各依赖的调用次数和参数 |
| SC-W0024-03 | 流量：改前改后查询条数和形状相同。REPORT 按 W0017 口径写「每月增加 0 B」及依据；账号 id 与会话 id 不同的用户，多返回的只是他本来就有的报名行，估算上限写进 REPORT | REPORT 表格（改前／改后语句数） |
| SC-W0024-04 | 回归：未登录活动页和社群卡片不变（`tests/pages/app-events-community-card.test.tsx`、`app-events-registration-state.test.ts` 通过）；3001 上 verify-plan 的活动页显示验收活动「已报名」，控制台 0 错误；typecheck 通过；一次全量基线对照没有新增失败 | 定向集、tsc、浏览器截图（1440、375）、全量对照 |

## 一次 Generator 的执行顺序

1. 复核基线，保存 Planner 哈希。对 `AppEventsPage` 做 impact（UNKNOWN 时用文本搜索补查）。
2. 按 W0018 写法写 RED 测试（SC-01、SC-02）。
3. 最小改动：登录时先解析账号（可与目录读取并行），报名读取和社群共用 `actor.id`；解析为 null 时不读本人报名。
4. 跑定向集和 typecheck，浏览器验证，暂存区 `detect-changes`，提交。
5. 写 REPORT，交接分支和固定 SHA。

## 最小测试与检查

- **档位：H。** 理由：读取身份口径变化（RULES §5.1「身份」）。影响等级为 UNKNOWN/LOW、改动面只有一个文件，review 和全量各做一次，不额外扩测。
- **开发定向集：**
  - 新测试
  - `tests/pages/app-agent-registration-actor-id.test.tsx`（共用夹具不回归）
  - `tests/pages/app-events-community-card.test.tsx`、`tests/pages/app-events-registration-state.test.ts`、`tests/pages/app-events-live-route-services.test.ts`
- **收口：** typecheck；全量基线对照（RULES §5.2）；一次 Codex 代码 review。
- **浏览器：** 3001，verify-plan，桌面 1440 和手机 375。
- **不运行：** PG 测量脚本。查询形状不变，用语句计数测试和 REPORT 推算代替，并说明理由。

## 失败与交接

REPORT 写：改前改后读取对照、流量结论（0 B／月及依据），并把活动详情页问题交给下一个 Sprint（W24-1）。
