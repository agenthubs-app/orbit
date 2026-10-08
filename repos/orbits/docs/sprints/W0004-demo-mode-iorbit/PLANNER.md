# Sprint W0004 — iOrbit 首页示例模式

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-03（iOrbit 首页部分；我的计划与示例对话见 W0014）。**单一目标:** 开关打开且用户处于引导期时，iOrbit 概览屏用前端静态示例数据渲染，带「示例预览」横条、示例角标和写操作拦截；同时建立进度判定、开关与引导记录的最小骨架，供 W0005／W0006／W0014 复用。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0001。
**进入条件:** W0001 completed。本 Sprint 新建服务端开关 `ORBIT_GUIDE_DEMO`（默认关，D1）与 `ORBIT_GUIDE_DEMO_SINCE`（开关首次启用日期，用于判定老用户）。**D2 老用户定义**：账号创建早于 `ORBIT_GUIDE_DEMO_SINCE` 且首次判定时已确认联系人 ≥3；账号创建时间从账号记录（`features/account/storage/account-live-record-provider.ts`）读取，认证 actor 里没有这个字段；**读不到创建时间时按「已确认联系人 ≥3 即老用户」判定**（宁可少给老用户看示例）；首次判定结果写入引导记录 `grandfathered: true`，之后不再变化（上线后新注册、再扫满 3 张的用户不是老用户）。示例数据只在前端，不写库、不进入任何接口请求。

## 范围与文件

- 读取：`app/(app)/app/agent/page.tsx`、`iorbit-0918/iorbit-shell.tsx`、`iorbit-home.tsx`、`features/agent/preferences.ts`（`orbit_records` 单记录写法）、`features/contacts/storage/contact-list-postgres-reader.ts`（已确认联系人计数）、原型第 9 版示例数据。
- 修改：`app/(app)/app/agent/page.tsx`（服务端算出 `guide` 状态并下传）、`iorbit-shell.tsx`（透传；示例期间不挂载对 `/api/ai/conversations` 的自动请求）、`iorbit-home.tsx`（示例数据源、写操作走 `guardWrite`）、`iorbit-home-styles.ts` 及对应测试。
- 新建：`shared/config/guide-demo.ts`（读两个环境变量，纯服务端）；`features/guide/guide-state.ts`（`orbit_records` collection `guideState`、recordId `current`，本 Sprint 只含 `grandfathered`、`bannerCollapsed`、`version`；W0006 扩展）；`features/guide/progress.ts`（从真实数据推导第 1–3 步与是否进入示例，纯函数 + 读取器，读取器按 actor 过滤）；`app/api/guide/state/route.ts`（GET／PATCH `bannerCollapsed`，统一 envelope 与认证）；`app/(app)/app/_demo/demo-persona.ts`（固定示例人物，W0005／W0014 复用）；`app/(app)/app/_demo/demo-mode-context.tsx`（`useDemoMode()`、`guardWrite(label)`、横条、拦截弹层）；对应测试。
- 排除：人脉页（W0005）、我的计划与对话的示例（W0014）、引导页本体（W0006）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0004-01 | 开关关闭时任何用户看到 W0001 的真实首页；开关打开时进入示例的判定：新用户（第 1–3 步未全部完成）进入；D2 老用户不进入；完成第 1–3 步后退出 | `features/guide/progress` 纯函数测试（含 `ORBIT_GUIDE_DEMO_SINCE` 前后注册、首次判定后再扫满 3 张两例）+ 页面级测试（开关关／开） |
| SC-W0004-02 | 进度与老用户判定按 actor 隔离：两个用户的计数与引导记录互不影响；引导记录接口未登录 401、只能改本人记录、只接受 `bannerCollapsed` 字段 | 读取器测试（两用户）+ `/api/guide/state` 路由测试 |
| SC-W0004-03 | 示例模式下概览屏渲染示例人物的今日要事（主稿 + 短讯）、时间线、本周推进、已报名活动、最近对话；示例人名带「示例」角标；顶部横条显示进度与下一步并链接 `/app/start`；横条可收起成导航药丸，收起状态存引导记录，换浏览器一致 | 组件测试 + 浏览器截图（桌面、手机） |
| SC-W0004-04 | 示例模式下不发出任何真实请求：完成／明天提醒、刷新、追问发送、会话自动加载都不调用 `/api/agent/signals`、`/api/ai/conversations` 等接口，写操作弹出「这是示例…」并提供继续引导 | 组件／页面测试断言 fetch 未被调用（逐个接口列出） |
| SC-W0004-05 | 不引入新的回归 | W0001 收口集 + 新测试通过；typecheck；因新增写接口与身份相关读取，收口时一次 `npm test` 全量与基线对照 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0004/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0004-demo-mode-iorbit` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（新增写接口、按身份读取、开关）。
- 开发定向集：`features/guide/*` 测试、`/api/guide/state` 路由测试、`app-agent-iorbit-home.test.tsx`。
- 操作链收口集：W0001 收口集 + 新测试；typecheck；一次全量基线对照（RULES 5.2）。
- 不运行：App 端。

## 失败与交接

报告写明两个环境变量、老用户判定规则与首次判定写入时机、示例数据文件路径（W0005／W0014 复用）、与原型的差异。
