# Dashboard 模块

## 模块定位

Dashboard 负责关系网络总览、分布分析、网络缺口和机会提醒，是运营视角的聚合分析层。

## 期望行为

模块应汇总联系人、连接、事件、任务和 agent 状态，输出可解释的指标、分布、缺口和建议行动。

## Mock 行为

Mock 服务用固定 fixture 生成 dashboard summary、network distribution 和 opportunity reminder，不执行真实分析任务、数据库查询、外部网络或通知。

## 热拔插边界

调用方必须通过 `features/dashboard/service-factory.ts` 获取 aggregate、distribution 和 opportunity 服务。真实分析仓库、图计算或 job runner 只在 factory 后注册。
