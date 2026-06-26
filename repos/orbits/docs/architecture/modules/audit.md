# Audit 模块

## 模块定位

Audit 负责来源一致性和 provenance 检查，用来验证业务对象是否保留了足够证据、来源和生成过程。

## 期望行为

模块应扫描联系人、连接、证据、推荐、任务、聊天摘要和 agent 动作等对象，输出一致性状态、风险发现和修复建议。

## Mock 行为

Mock 服务返回本地可重复的审计集合、问题发现和受控状态，不写入生产审计存储，不访问合规系统、数据库、AI 或外部网络。

## 热拔插边界

调用方必须通过 `features/audit/service-factory.ts` 获取 `SourceConsistencyProvenanceAuditService`。真实审计引擎只在 factory 后接入，不能改变 API 返回形状。
