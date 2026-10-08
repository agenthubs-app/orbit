# Sprint W0027 — 活动详情页按账号 id 判定报名、主办方与私密访问

**Plan revision:** 2（本 Sprint 由 W0024 revision 1 的 W24-1 拆出，用户 2026-09-29 决定另开；首版即按 revision 2 的 review 处理编制）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-02（读报名与写入口径一致，用 `actor.id`）。来源：W0018 REPORT 交接、W0024 revision 1 已查清的事实。
**单一目标:** `app/(app)/app/events/[id]/page.tsx` 登录时先解析账号，用 `actor.id` 调 `resolveConfiguredCanonicalEventDetailView`；已登录但账号解析失败时显示不可用，不回退到会话 id。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（W0023 合并后；revision 2 编制时是 `1d41bdfc`）。
**进入条件:** W0024 已合并（复用它新建的活动页身份测试写法；两者文件不重叠）。不需要云端授权，不调用付费 AI。

## 已查清的事实（revision 2 按源码复核）

1. **页面**（`app/(app)/app/events/[id]/page.tsx`，230 行）：
   - 第 123–127 行 `Promise.all([params, searchParams, auth()])`。
   - 第 133–140 行 `resolveConfiguredCanonicalEventDetailView({ actorId: session?.user?.id, routeId: id })`，抛错时当作 `unavailable`——**问题所在**。
   - 第 142–146 行 `authentication_required` → 跳登录；第 148–166 行 `unavailable` 状态页；第 179 行名单按 `resolution.registered` 决定是否下发；第 180 行 `authed`；第 197 行 `canOpenOperations`；第 209–229 行 `forbidden`／`not_found` 状态页（`event-core-access-denied`／`event-core-event-not-found`）。
2. **判定逻辑**（`app/(app)/app/canonical-event-detail-view.ts`，234 行；本 Sprint **不改**）：
   - 第 98 行 `resolveCanonicalEventDetailView(input: { actorId?: string | null; routeId: string }, dependencies)`。
   - 第 110–122 行：公开目录查不到时用 `resolveActorEventCanonicalId({ actorId, eventId })`（按账号列出账号作用域活动）。
   - 第 129–131 行：私密且无 actor → `authentication_required`。
   - 第 140–151 行：`readRegisteredContext({ actorId, eventId })`、`accessService.get({ eventId, subjectActorId: actorId })`。
   - 第 159 行 `owner = actorId === canonicalEvent.organizerActorId || access?.owner === true`；第 162–167 行私密门：非主办、无活动角色、未报名 → `forbidden`（无访问服务时 `unavailable`）。
   - 第 189–195 行 `getOrbitRegisteredEventViewModel({ actorId, … })`（报名者名单）。
   - 第 214–234 行 `resolveConfiguredCanonicalEventDetailView` 装配。
3. **写入口径都是 `actor.id`**：建活动 `app/api/events/handler.ts`（`resolveAuthenticatedApiActor` → `actorId: actor.id`，第 155–209 行）；活动角色分配 `app/api/events/[id]/access/assignments/[subjectActorId]/handler.ts`（第 151、174 行）；报名（W0018）。所以详情页用会话 id 读，会在两者不同时把主办方、活动角色、报名者都判错。
4. **同类写法**：报名页 `app/(app)/app/events/[id]/register/page.tsx:65–90` 已先 `resolveAuthenticatedApiActorFromSession`，解析为 null 时 fail closed；测试 `tests/pages/app-event-registration-account-scope.test.tsx:338` 起有「Auth.js profile 主体 → canonical 账号」的完整夹具（`profile:a` → `account:a`）。
5. **现有源码断言要跟着改**：`tests/pages/app-event-detail-page.test.tsx:236–268` 用正则断言页面含 `actorId: session\?\.user\?\.id`。
6. **范围外的同类页面（观察项）**：`events/[id]/operations/page.tsx`（第 52、66、81 行）、`analytics/page.tsx:65`、`live/page.tsx:105`、`center/page.tsx` 也用 `session.user.id` 做活动权限或身份。本 Sprint 不改，登记为后续 Sprint 候选。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/events/[id]/page.tsx`：整页。
- `app/(app)/app/canonical-event-detail-view.ts`：第 25–62 行（结果与依赖类型）、第 98–234 行（只读）。
- `app/api/_shared/authenticated-actor.ts:117–134`：`resolveAuthenticatedApiActorFromSession(session): Promise<AuthenticatedApiActor | null>`，读一次账号会话图。
- `app/(app)/app/events/[id]/register/page.tsx:65–90`：同类写法。
- `tests/pages/app-event-registration-account-scope.test.tsx`（夹具与调用记录写法）、`tests/pages/app-canonical-event-detail-view.test.ts`（第 120、176、192、325、341 行：公开、私密需登录、报名者、活动角色、访问失败的既有用例）、`tests/pages/app-event-detail-page.test.tsx:236–268`、W0024 新建的 `tests/pages/app-events-registration-actor-id.test.tsx`。

### 关键符号与影响等级（GitNexus，2026-09-29 刷新到 `1d41bdf`）
- `AppEventDetailPage`：UNKNOWN（路由入口，无代码调用方；文本搜索确认只由 Next 路由加载）。
- `resolveConfiguredCanonicalEventDetailView`：LOW（直接调用方 1，即本页）。只改调用参数。
- `resolveCanonicalEventDetailView`：CRITICAL（partial，直接调用方 2）。**不改。**
- `resolveAuthenticatedApiActorFromSession`：CRITICAL（直接调用方 22）。**不改，只调用。**

### 前序交接要点
- W0018：报名以 `actor.id` 写入，键为 eventId + actorId。
- W0024：活动页已改为目录成功后解析一次账号、按 `actor.id` 读报名；测试夹具可复用。
- W0017／W0021：流量口径是数据库返回字节。
- W0016：verify 账号会话 `sub` 与账号 id 相同，浏览器只能证明不回归，差异靠测试证明；verify-host 是验收活动的主办方。

### 易错边界（都对应到 SC）
- 任何判定都不能用会话 id：已报名、名单、主办方、活动角色、账号作用域活动的回退查找。（SC-01、SC-02）
- 未登录时不解析账号（0 次），公开活动行为不变；私密活动仍跳登录。（SC-03、SC-04）
- 已登录但账号解析返回 null 或抛错：显示「暂时不可用」状态页，不跳登录（否则登录后又回来形成循环），不调用 `resolveConfiguredCanonicalEventDetailView`，也不以会话 id 或 null 作为 actor 继续判定。（SC-03）
- 只挂在会话 id 上的报名／主办／角色不能获得访问权：私密活动 → `forbidden`。（SC-02）
- 不改 `canonical-event-detail-view.ts` 的判定规则；不改其他活动子页面。（SC-05）

## 范围与文件

- **修改：** `app/(app)/app/events/[id]/page.tsx`；`tests/pages/app-event-detail-page.test.tsx`（更新第 236–268 行的源码断言）。
- **新建：** `tests/pages/app-event-detail-actor-id.test.tsx`。
- **排除：** `canonical-event-detail-view.ts` 的判定规则；活动子页面 operations／analytics／live／center／register（观察项）；报名、建活动、角色分配接口；迁移、部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0027-01 | 账号 id ≠ 会话 id（会话 `profile:a` → 账号 `account:a`）：页面把 `account:a` 传给 `resolveConfiguredCanonicalEventDetailView`；报名在账号 id 下 → `youRsvped=true`、名单下发；只在会话 id 下 → 未报名、`attendees: []`；公开目录查不到时的账号作用域回退也用账号 id | 新测试（require.cache 替换，记录调用参数），先 RED 后 GREEN |
| SC-W0027-02 | 主办方与私密访问：`organizerActorId = account:a` → `canOpenOperations=true`，私密活动可打开；活动角色授予 `account:a` 且 `state: active` → 私密活动可打开、`canOpenOperations=true`；主办或角色只挂在 `profile:a`、且未报名 → 私密活动为 `forbidden`（`event-core-access-denied` 状态页），公开活动 `canOpenOperations=false` | 新测试（用 `resolveCanonicalEventDetailView` 的真实判定 + 依赖替身） |
| SC-W0027-03 | 失败与未登录：未登录打开私密活动 → 跳登录（`next` 保持原路径），账号解析 0 次；未登录公开活动 → 与现在一致；已登录但账号解析返回 null 或抛错 → 「暂时不可用」状态页、不跳登录、`resolveConfiguredCanonicalEventDetailView` 0 次、没有任何以会话 id 为参数的读取 | 新测试 |
| SC-W0027-04 | 读取计数与流量：登录请求账号解析恰好 1 次，未登录 0 次；本机实测一次账号会话图读取的返回字节，按「1000 人、每人每天打开详情页 2 次」估算月增量，上限 60 MB／月；超出时本项记 failed，功能提交保留但不合并，交用户裁决 | 调用计数测试 + 测量输出（证据目录）+ REPORT 表格 |
| SC-W0027-05 | 回归：`tests/pages/app-event-detail-page.test.tsx`（更新后的源码断言）、`tests/pages/app-canonical-event-detail-view.test.ts`、`tests/pages/app-event-detail-0918.test.tsx`、`tests/pages/app-event-detail-live-route-services.test.ts`、`tests/pages/app-event-registration-guide.test.tsx`、`tests/pages/app-event-registration-account-scope.test.tsx` 通过；3001 上 verify-plan 打开 `EVENT_UPCOMING` 详情显示已报名与名单、verify-host 看到「主办方后台 →」、verify-legacy 显示未报名且无名单，桌面 1440、手机 375，控制台 0 错误；typecheck 通过；一次全量基线对照没有新增失败 | 定向集、tsc、截图、RULES §5.2 全量对照 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线和 Planner 哈希。对 `AppEventDetailPage`、`resolveConfiguredCanonicalEventDetailView` 做 upstream impact（UNKNOWN 用文本搜索补查）；确认 `resolveCanonicalEventDetailView` 不在改动范围。
2. 写 RED：SC-01～SC-04（新测试），并把旧源码断言改为断言「不含 `session?.user?.id` 作为 actorId、含账号解析」。
3. 最小实现：登录时解析账号 → 解析失败走不可用状态 → 用 `actor.id` 调判定；未登录保持现状。
4. 定向集 → 本机测量 → 3001 浏览器 → 暂存区 `detect-changes` → 提交。
5. 全量对照，一次 Codex 代码 review（重点：访问控制），同一 Generator 修复，写 REPORT，交接。

## 最小测试与检查

- **档位：H。** 理由：身份与访问控制（私密活动、主办方入口、名单下发）变化（RULES §5.1「身份／权限」）。
- **开发定向集：** 新测试；`tests/pages/app-event-detail-page.test.tsx`；`tests/pages/app-canonical-event-detail-view.test.ts`（访问控制回归）；`tests/pages/app-event-registration-account-scope.test.tsx`（共用夹具不回归）。
- **收口：** SC-05 列出的文件、typecheck、一次全量基线对照、一次 Codex 代码 review。
- **测量：** 本机库，数据库返回字节口径，不 source `.env`。
- **浏览器：** 3001，verify-plan、verify-host、verify-legacy。
- **不运行：** 付费 AI、Preview。

## 失败与交接

REPORT 写：身份判定前后对照（每个判定点用的是哪个 id）、访问控制回归证据、账号解析失败的处理、实测字节与月估算；观察项：operations／analytics／live／center 子页面仍用会话 id（建议作为下一个 H Sprint）。

## 修订记录

| review 意见（codex-plan-review.txt） | 处理 |
| --- | --- |
| P1-4（详情页身份问题未创建具体 Sprint） | 接受。用户 2026-09-29 决定另开：本 Sprint（H），完整 GOAL＋PLANNER，含已报名、主办方、活动角色、私密访问、未登录与解析失败的访问控制回归测试 |
| P2-1（W0024 失败路径读取顺序）的同类风险 | 采纳到本 Sprint：未登录与账号解析失败时都不进入判定、不以会话 id 读取，SC-03 计数证明 |
| 其余 | 不涉及本 Sprint。编制时另发现 operations／analytics／live／center 子页面同类问题，列为观察项 |
