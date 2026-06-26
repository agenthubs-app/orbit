# Recommendations 模块

## 模块定位

Recommendations 负责活动推荐、开场白和活动价值建议，连接 events、contacts、connections 和 analysis。

## 期望行为

模块应基于用户目标、关系上下文和事件信息输出推荐列表、推荐理由、开场白和可确认的活动价值动作。

## Mock 行为

Mock 服务返回固定推荐、开场白和价值建议，模拟 accept 操作与受控状态，不调用真实推荐模型、AI、外部活动平台、数据库或网络。

## 热拔插边界

调用方必须通过 `features/recommendations/service-factory.ts` 获取 event recommendation 和 event value recommendation 服务。真实推荐引擎只替换 factory 后方实现。
