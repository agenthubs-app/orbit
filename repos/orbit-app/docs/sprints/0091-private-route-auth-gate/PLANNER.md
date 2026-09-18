# Sprint 0091 — 别让人盯着"正在确认登录状态"看六秒

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md「2026-09-19 全量功能与 UI 复核」第 5 条。
**单一目标:** 量出并缩短已登录用户的 `auth.ready` 等待，不放宽登录态判断。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `ededaa6ac`。未启动，run_count = 0。
**进入条件:** phoneweb 可登录演示账号。

## 已查明的事实

| 事实 | 位置 |
| --- | --- |
| 白屏文案出处 | `src/components/OrbitRouteAccessBoundary.tsx:63-74` `OrbitAuthLoading`，由 `:39-41` `!auth.ready` 触发 |
| 判断只有三态 | 同文件 `:34-42`：`signedIn` → 内容；`!ready` → 加载；否则跳登录。没有"已有本地会话、正在后台校验"这一档 |
| 会话来源 | `src/api/AuthSessionProvider` 的 `useOrbitAuthSession`（`ready`／`signedIn`／`actorId`／`notificationSessionRevision`） |
| 同步也在等它 | `src/hooks/useSyncedCollection.ts:165-172`：`!auth.ready` 时连 scope 都不开，所以 auth 慢会把镜像同步一起往后推 |
| 有 Web 侧超时先例 | `src/data/sync/sync-lifecycle.web.ts:57` `WEB_MIRROR_OPEN_TIMEOUT_MS = 15_000`；0077 报告记录过 expo-sqlite 通道不 settle 导致"卡在正在确认登录状态" |
| 观测 | `/followups`、`/contacts/dashboard` 六秒以上；其它页面未记录同样时长（需复核确认是否普遍） |

**判断 1：先量 `auth.ready` 的构成。** 0077 的历史说明这条路上有过 Web 存储通道不 settle 的问题；必须先确认六秒是存储读取、网络校验还是排队，再决定修法。
**判断 2：不放宽登录态。** 任何提速都不能让未登录或过期会话被当成已登录。可接受的方向是"本地会话先放行渲染、后台继续校验并在失败时撤回"，但这属于安全语义变更，需在实现前写清并被既有用例覆盖；若拿不准就只做纯耗时优化。
**判断 3：范围要先确认是这两页特有还是全局。** 若是全局（`OrbitPrivateRouteBoundary` 包住的所有私有路由），影响面按 H 档处理。

## 范围与文件

- 度量产物：`auth.ready` 时序表（`docs/audits/`）。
- App：`src/api/AuthSessionProvider*`、`src/components/OrbitRouteAccessBoundary.tsx`，以及度量指向的存储／网络初始化路径。
- 测试：认证边界与私有路由跳转的既有用例 + 新增时序用例。
- 排除：改登录流程与凭据存储格式；改服务端会话接口。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0091-01 | `auth.ready` 从挂载到 true 的耗时构成被量出（存储／网络／排队各占多少） | 时序表 |
| SC-0091-02 | 确认是两页特有还是全部私有路由 | 复核记录 |
| SC-0091-03 | 已登录首屏等待显著下降，修前修后同口径对照 | 前后耗时 + 截图 |
| SC-0091-04 | 未登录跳转、过期会话、账号切换的既有用例全部不退化 | 定向集通过 |
| SC-0091-05 | 两端 typecheck 0；phoneweb 复跑这两页 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0091-auth-gate`。2. 度量 `auth.ready` 构成与影响范围。3. 按度量决定修法并登记（涉及安全语义则先写清）。4. RED→GREEN。5. 前后对照 → 收口。

## 最小测试与检查

- 档位：App H（身份判断路径）。定向集必须覆盖未登录、过期、切换账号三类反例；收口 App 全量一次。

## 失败与交接

若唯一可行的提速需要改"本地会话先放行"的安全语义，停在步骤 3 并把该决定单独提出，不在本 Sprint 内自行放宽。
