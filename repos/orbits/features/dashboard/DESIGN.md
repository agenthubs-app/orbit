# Dashboard 模块设计文档

## 设计定位

Dashboard 负责把关系系统的健康状态汇总成可行动的视图。它不是报表中心，也不是单纯的指标卡。它应该回答：当前网络哪里有机会，哪里有缺口，哪段关系需要优先处理。

Dashboard 只聚合和解释，不直接修改联系人、发送消息或创建任务。

## 子能力范围

- `dashboard-aggregate-mock`：总览指标、最近活动、当前优先动作。
- `network-distribution-analytics-mock`：行业、地区、角色等网络分布。
- `opportunity-reminder-analytics-mock`：机会提醒和关系风险。

## 契约与数据边界

契约位于 `features/dashboard/contract.ts`。核心 DTO 包括 summary metrics、distribution buckets、network gaps、opportunities、recent activity、source confidence 和 provenance warnings。Dashboard 不暴露底层查询、模型权重或审计日志原文。

Service factory 提供 aggregate、distribution 和 opportunity services。

## Mock 行为

Mock 使用本地关系数据生成稳定指标，不读数据库、不调用搜索、不写审计报告、不触发通知。运行 dashboard review 只刷新本地 preview，不能产生外部 side effect。

## Live 替换方案

Live 可以接分析数据库、搜索索引、关系图谱和后台汇总任务。查询结果必须映射成 Dashboard contract。耗时分析应有 pending 状态和上次可用数据，不应让页面空白。

## API 与页面使用

产品入口是 `/app/dashboard`。API 包括 dashboard summary、distributions、network gaps、opportunities 和 recompute。页面优先展示一个关系健康到行动的建议，再展示指标和分布。

## 测试要求

- aggregate 测试确认 summary、activity、next move 都有 provenance。
- distribution 测试覆盖 empty 和 pending。
- opportunity 测试确认推荐动作不产生外部写入。
- 页面测试确认 technical ids 只在展开诊断区。
- live 接入测试覆盖查询失败和 partial recovery。

## 团队协作规则

Dashboard 团队不直接拥有联系人、活动或跟进事实。它通过 Contacts、Events、Followups、Audit 和 Analysis 的 contract 聚合。新增指标先明确来源模块。
