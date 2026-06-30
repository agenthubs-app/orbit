# audit 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/audit.md` |
| 中文镜像 | `knowledge/docs/zh/module-audit.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:audit` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 audit 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/audit/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Audit 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Audit 负责来源一致性和 provenance 检查，用来验证业务对象是否保留了足够证据、来源和生成过程。

## 期望行为

模块应扫描联系人、连接、证据、推荐、任务、聊天摘要和 agent 动作等对象，输出一致性状态、风险发现和修复建议。

## Mock 行为

Mock 服务返回本地可重复的审计集合、问题发现和受控状态，不写入生产审计存储，不访问合规系统、数据库、AI 或外部网络。

## 热拔插边界

调用方必须通过 `features/audit/service-factory.ts` 获取 `SourceConsistencyProvenanceAuditService`。真实审计引擎只在 factory 后接入，不能改变 API 返回形状。
