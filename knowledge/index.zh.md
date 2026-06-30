# Orbit 知识库

这是 Orbit 项目的结构化知识入口。理解项目时，先读这里，再进入文档库、主题知识页、开发历史和排障经验，最后再阅读代码。

## 主要入口

- [文档库目录](docs/catalog.zh.md)（`knowledge/docs/catalog.zh.md`）：单独的文档查询入口，链接权威文档地址、中文简介、状态和来源路径。
- [开发历史](history/development-log.zh.md)（`knowledge/history/development-log.zh.md`）：记录重要修改做了什么、为什么做、关联提交和验证方式。
- [排障与经验](learnings/index.zh.md)（`knowledge/learnings/index.zh.md`）：整合 `.learnings/` 和 `repos/orbits/.learnings/` 的 troubleshooting、errors 和 recurring patterns。
- [维护日志](log.zh.md)（`knowledge/log.zh.md`）：记录知识库本身的 ingest、更新和审计动作。

## 核心知识主题

- [项目总览](wiki/project-overview.zh.md)（`knowledge/wiki/project-overview.zh.md`）：Orbit 的产品目标、主要来源文档和当前开发阶段。
- [架构总览](wiki/architecture.zh.md)（`knowledge/wiki/architecture.zh.md`）：Next.js app、feature module、service factory、mock/hybrid/live 和 route view-model 边界。
- [Agent 系统](wiki/agent-system.zh.md)（`knowledge/wiki/agent-system.zh.md`）：Orbit AI、Agent action queue、bounded ReAct、工具注册、确认和安全账本。
- [数据与 Mockdata](wiki/data-and-mockdata.zh.md)（`knowledge/wiki/data-and-mockdata.zh.md`）：local-remote database、relationship schema、generated fixture 和 mockdata 生成链路。
- [Harness](wiki/harness.zh.md)（`knowledge/wiki/harness.zh.md`）：长跑 harness、sprint contract、evidence、protected paths 和验证流程。
- [模块地图](wiki/modules.zh.md)（`knowledge/wiki/modules.zh.md`）：业务模块分组、模块架构文档和读取顺序。

## 阅读顺序

1. 快速理解项目：读本页、项目总览、架构总览。
2. 找文档：读文档库目录，根据状态选择当前权威文档。
3. 修改代码：先读相关知识页和 catalog 条目，再读对应 feature、app route 或 harness 代码。
4. 排障：先读 learnings，再定位测试、日志和源码。
