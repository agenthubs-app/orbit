# audit Feature 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/audit/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-audit-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:audit` |

## 中文摘要

记录 audit feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/audit 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Audit 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：API 与页面使用
- 第 8 节：测试要求
- 第 9 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 设计定位

Audit 负责来源一致性和 provenance 检查。Orbit 的核心承诺是：每个关系动作都能解释来源。Audit 不决定业务动作，也不替用户发送消息；它检查某条记录、某个推荐或某个自动化动作是否有足够证据。

这个模块是 mock-to-live 阶段的保护层。真实 provider 接入越多，Audit 越需要保持独立。

## 子能力范围

- `source-consistency-and-provenance-audit`：检查来源缺失、证据不一致、过期信号和不可追踪动作。
- 为 Dashboard、Agent、Contacts、Events 和 Followups 提供 provenance warning。

## 契约与数据边界

Audit 输出应包含 target id、target type、finding severity、finding message、evidence refs、recommended review action 和 no-side-effect ledger。它可以引用其他模块证据，但不能直接修改其他模块记录。

Service factory 是调用入口。Audit 的 raw finding 不应暴露 provider 内部字段，页面只显示用户能理解的来源问题。

## Mock 行为

Mock audit 使用本地 evidence fixture 生成稳定警告。它不会访问数据库、日志系统、云存储或外部审计服务。受控失败场景必须返回 envelope failure，页面渲染可恢复状态。

## Live 替换方案

Live 可以接数据库审计表、事件日志、对象存储、第三方合规系统或后台任务结果。Provider 返回值必须被 mapper 转成 Audit finding。严重 finding 可以阻止外部动作，但这个阻止应通过 Agent 或 Permissions 的确认边界执行。

## API 与页面使用

Audit 可以提供 provenance run API，也可以被 Dashboard 聚合。页面使用 Audit 展示“哪些来源需要复核”，不展示完整内部日志。技术 id 只应放在可展开诊断区。

## 测试要求

- finding 生成测试覆盖 missing source、stale evidence、conflict、clean state。
- API envelope 测试覆盖 success、empty、pending、failure。
- 页面测试确认 audit warning 可见但不泄露 raw internal ids。
- live 接入测试覆盖 mapper 和 severity 映射。

## 团队协作规则

Audit 团队不直接改业务模块状态。发现问题后输出 finding，由业务模块或 Agent 决定如何提示用户。跨模块只引用公开 evidence refs。
