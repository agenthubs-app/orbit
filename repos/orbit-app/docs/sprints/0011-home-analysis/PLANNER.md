# Sprint 0011 — 首页规格与人脉分析可信性

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** R-09／R-10／B7／D4。**单一目标:** 按确认的首页与 Pipeline 边界展示有时间／版本依据的分析，目标编辑只保存目标。
**基线:** 承接 0006 实际 REPORT 的 IORBIT 入口契约；首页与分析已有布局、确定性统计／钻取和已存数据读取保留。
**进入条件:** 0006 已提交；B7 发布分析生成时间、数据／分析版本及目标字段归属／安全更新；首页是否保留推荐活动及位置、D4 是否隐藏 Pipeline 和旧链接落点有明确批准。
**契约前置:** 新分析／目标方法、字段、失败语义与入口设计须补入 Planner 并审阅；保留首页原已批准的日程／待办／跟进，不能默认插入新模块或覆盖整份资料。

## 范围与文件

- 读取：[原计划 R-09／R-10](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md#r-10人脉分析与-pipeline)、[Contacts Dashboard 缺口](../../api-gaps.md#contacts-dashboard)、0006 REPORT；涉及活动推荐时读取 0001 实际结果。
- 读取：`src/view-models/profile.ts`、`src/api/schema/mobile-contacts-dashboard.ts`、`src/api/endpoints.ts`；现分析页由 `/api/mobile/contacts-dashboard` 读取，目标保存仍用整份 profile request。
- 修改白名单：`src/screens/home/HomeDashboardScreen.tsx`、`src/view-models/home-dashboard.ts`、`src/screens/contacts/ContactsDashboardScreen.tsx`、`src/screens/contacts/ContactsScreen.tsx`。
- 修改白名单：`src/view-models/contacts-dashboard.ts`、`src/view-models/contacts-analysis.ts`、`app/contacts/dashboard.tsx`、`app/contacts/pipeline.tsx`；Pipeline 路由只按批准决定入口／落点。
- 条件性新建：`src/api/relationship-goal.ts`、`tests/contacts-analysis-refresh-interactions.test.tsx`；前者消费已批准目标更新契约，不复制整份 profile 写入。
- 测试白名单：新交互测试及下列现有测试；文档仅本 Sprint `REPORT.md`；原始证据在 `build/harness-state/evidence/sprint-0011/run-01/`，先确认被忽略。
- 排除：统计算法重写、Pipeline 生命周期／归档／历史删除、重新开发 @选择器或 AI 保存（0006）、全库推荐算法／运营权限、新首页视觉方向、笔记。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0011-01 | 首页严格呈现获批区块与推荐位置；无推荐／推荐失败仍可到活动浏览，日程／待办／跟进各自错误不掩盖其余数据。 | home-dashboard 测试与 Simulator 对批准布局的可见结果；不需要推荐的决定也须可追溯。 |
| SC-0011-02 | 行业／来源等确定性统计可钻取；已存分析显示生成时间与版本，数据变化显示需重算提示，进入／刷新页面不自动付费生成。 | 新 analysis-refresh 交互、现有 analysis/dashboard 回归，断言普通进入／刷新没有生成请求。 |
| SC-0011-03 | 用户显式请求分析进入 0006 的 IORBIT 待发送上下文，原页保留已存报告；取消返回不生成，真实生成只在显式发送后执行。 | 新交互与 `ai-home-guidance-render` 回归；已授权 AI 场景的请求时点与保存后回读。 |
| SC-0011-04 | 修改长期目标只更新批准字段，不覆盖姓名／公司等资料；失败保留草稿，冲突或旧账号回执不显示成功，重开与 Web 回读一致。 | 新目标保存交互及授权字段级更新／两端回读，核对其他资料字段未变。 |
| SC-0011-05 | Pipeline 显示／隐藏与已批准 D4 一致；若隐藏，旧链接到明确合法落点，联系人生命周期、归档和历史仍可访问。 | Pipeline／analysis 路由与渲染回归，Simulator 新入口及旧链接核对。 |

## 一次 Generator 的执行顺序

1. 核对首页／D4／B7／0006；未决则登记 blocked，不启动 run-01；分析生成沿用全局费用与具体对象授权。
2. 记录 Planner 哈希、HEAD／diff，锁定首页与分析文件；逐符号 upstream impact，HIGH／CRITICAL 先报告。
3. 为批准区块、分析版本、目标字段写入和入口边界补 RED；按契约最小实现，不改确定性统计或自拟推荐布局。
4. 同一 Generator 完成定向、H 最终集与必需原生／跨端场景，按 RULES 有限修复；不调用 Evaluator、自评分或再开生成。
5. 各独立功能验证后由协调者路径限定暂存、detect_changes、commit；REPORT 记录决定与 SC 映射后结束。

## 最小测试与检查

- 档位：本次编制为 D；未来整体为 H，含目标业务写入、账号隔离及共享分析契约；其中纯入口／布局按 L 定向验证，最终仍须 H 的类型和一次全量。
- 以下命令 cwd 均为 `/Users/xzhao/Projects/orbit/repos/orbit-app`，本轮仅声明、不执行。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-dashboard.test.ts tests/home-dashboard-interactions.test.ts tests/contacts-analysis-view-model.test.ts tests/contacts-dashboard-view-model.test.ts tests/contacts-analysis-route-source.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contacts-dashboard-screen-source.test.ts tests/mobile-contacts-dashboard-screen-source.test.ts tests/contact-pipeline-view-model.test.ts tests/contact-pipeline-render.test.tsx tests/contact-pipeline-screen-source.test.ts tests/ai-home-guidance-render.test.tsx
```

- 新文件创建后：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contacts-analysis-refresh-interactions.test.tsx`，覆盖 SC-02～04 的请求、草稿、失败与账号边界。
- H 最终集：`npm run typecheck`、`npm test`、`git diff --check`；批准的 B7 副本改变才加 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts`。 同版本全量已包含这些同步用例时直接引用结果，不再单独重跑。
- 原生：只验证首页获批区块、已存报告／陈旧提示、目标编辑键盘、IORBIT 待发送及 Pipeline 旧链接；不把静态统计截图作为真实分析执行证据。
- HTTP／跨端：读取当前 `/api/mobile/contacts-dashboard`；B7 补齐后按获准目标字段写入并两端回读；AI 只经 0006 入口，累计账本仍 $5／已记 $0.012780，不重置预算。
- 不运行：OCR、活动运营全流程、Lighthouse、全平台截图、无关构建；无推荐的已批准决定不影响其他已声明 SC。

## 失败与交接

缺首页／Pipeline 决定或 B7 版本／目标契约时不启动，不把 client 当前时间伪装为生成时间，也不继续整份资料覆盖式目标保存。
运行中发现契约不符、分析预算不足或真实对象不可用则结束必要部分为 blocked／failed；不降低 SC 或自动再派 Generator。
REPORT 记录规格／D4 决定、B7 版本、SC→文件→功能 SHA→证据、两端字段保全、费用与未验项，向 0013 提供最终文案及稳定入口。
