# Analysis 模块

## 模块定位

Analysis 负责关系价值评分和优先级解释，是联系人、连接、事件和后续行动之间的分析层。

## 期望行为

模块应基于可追溯证据输出关系价值、优先级、解释和建议下一步。真实实现可以接入评分模型或规则引擎，但必须保留来源、限制和错误 envelope。

## Mock 行为

Mock 服务用 fixture 和本地规则生成关系价值评分、重算结果、空状态、等待状态和受控失败，不调用 AI、外部评分服务、网络或数据库。

## 热拔插边界

调用方必须通过 `features/analysis/service-factory.ts` 获取 `RelationshipValueScoringService`。评分算法可在 factory 后替换，API 和页面只依赖 contract。
