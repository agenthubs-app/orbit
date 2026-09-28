# Sprint W0006 — 执行总结

## 目标实现情况

- 本轮要实现：新用户在 /app/start 按顺序完成名片、目标、计划三步（活动随时可做），中途离开、换设备回来都能从原处继续。
- 已验证能做到：
  - 开关关闭时 /app/start 直接跳回 /app/agent；开关打开时资料未完成的用户也能进入（门禁只豁免 /app/start 这一个路径），全局 iOrbit 提问浮层在该页隐藏（SC-01）。
  - 步骤状态由真实数据与引导记录推导：已确认联系人 ≥3 或已跳过 → 第 1 步；有目标 → 第 2 步；D2 老用户第 1、2 步直接完成；有生效计划 → 第 3 步；按当前 actor 读报名事实（不依赖公开目录）或已加入社群 → 第 4 步。1–3 步严格顺序，第 4 步随时（SC-02）。
  - 第 1 步：槽位、「已确认 x / 3」、待确认数、原地扫名片（引导页自己挂名片状态机，全站宿主让出）、「先这样，继续」写入跳过标记；第 2 步：共享目标编辑器；第 3 步：目标草稿修改（取消不覆盖）、固定问题、选填补充、回答结构预告，「开始分析」在 W0008 前只提示「计划生成即将上线」，不伪造计划；第 4 步：社群卡片与真实推荐活动（SC-03）。
  - 引导记录 v2：step1Skipped、currentStep、completedAt；所有 currentStep 写入走同一串行队列，快速切换后跳过也不会被旧请求覆盖（SC-04，Codex review 后补）。
- 仍未实现或未验证：
  - **真实双浏览器验证没做**：开关关闭时 /app/start 会跳回 /app/agent，而 3000 端口的 dev server 属于另一会话、不能带开关重启；以「同一 actor 两组独立 handler 读写同一 currentStep」的路由测试替代。
  - 第 4 步推荐活动不显示「匹配你的目标」理由行。
  - 选填补充只保存在页面本地（W0008 接入生成时使用）。
  - 发现既有问题：`agent/page.tsx` 查报名状态时用 `session.user.id` 而非 canonical actor id——已登记为后续任务，未在本 Sprint 修改。

## 运行记录

- 原需求：RW-04、RW-05（第 3 步）；决定 D1、D2
- 结果：completed（双浏览器验证缺失）
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 功能 SHA：`ccb3a172`；分支 `sprint/W0006-start-guide`
- push：未执行

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0006-01 | pass | `tests/ui/profile-onboarding-proxy.test.ts`（豁免与仍拦截）、`app-start-guide-page.test.tsx`（开关两态零读取）、`orbit-global-ask-routes.test.ts` |
| SC-W0006-02 | pass | `tests/services/guide-start.test.ts`（规则、D2、跳过、顺序锁）、`app-start-guide.test.tsx`、`app-start-guide-page.test.tsx`（session id 与 actor id 不同、下架活动的报名仍计入）、`tests/services/active-registration.test.ts`（含真实 PG） |
| SC-W0006-03 | pass | `app-start-guide.test.tsx`、`app-card-batch-host-yield.test.tsx`（引导页上宿主零批次请求） |
| SC-W0006-04 | pass（路由级） | `guide-state-routes.test.ts`（同 actor 两组 handler、他人不受影响、非法值 400）、串行队列乱序测试 |
| SC-W0006-05 | pass | 回归集 341 条 336 过（唯一失败为基线 `?session=`；4 条需另一测试库而跳过）；review 修复前全量 5387 条 42 失败，与上一基线新增 0；`tsc` 0 |

## GitNexus

- `createStorageGuideStateService` HIGH（5 个受影响，均为引导相关调用方；改动为新增字段与方法，既有行为不变，W0004／W0005 测试全过）；其余 LOW。
- staged detect-changes：27 文件、48 符号、0 流程，risk low。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 第 4 步用 session id、只查公开目录 | 采纳 | 改用 actor.id，新增 `hasAnyActiveRegistration` 直接读报名事实 |
| 全屏引导仍显示全局提问浮层 | 采纳 | /app/start 精确排除 |
| 快速切换后跳过会留下错误 currentStep | 采纳 | 单一串行队列 |
| 缺双浏览器证据 | 无法做 | 原因见上 |

## 交接

- 给 W0008：第 3 步「开始分析」目前只提示即将上线；接入时把选填补充一并传给生成接口。
- 费用：0 次付费 AI 调用。
