# bootstrap Feature 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/bootstrap/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-bootstrap-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:bootstrap` |

## 中文摘要

记录 bootstrap feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/bootstrap 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Bootstrap 模块设计文档
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

Bootstrap 负责启动产品工作台时的一次性聚合。它把账号、权限、Profile、联系人、活动、跟进、仪表盘和 Agent 的核心状态整理成首页可以使用的初始上下文。

Bootstrap 不拥有业务事实。它的职责是编排和兜底，让 `/app` 在 mock 模式下能稳定启动，在 live 模式下能清楚暴露哪个依赖还没准备好。

## 子能力范围

- `app-bootstrap-mock-aggregator`：聚合 mock 账号、Profile、联系人、活动、跟进和 Agent 状态。
- 为 `/app` AI command center 和产品 shell 提供初始数据。

## 契约与数据边界

契约位于 `features/bootstrap/contract.ts`。输出应包含 workspace summary、primary prompt context、route readiness、supporting counts、recovery links 和 provenance。Bootstrap 只能消费其他模块 service interface，不能 import 其他模块 mock fixture。

`features/bootstrap/service-factory.ts` 是唯一入口。

## Mock 行为

Mock bootstrap 通过 service factory 读取本地 mock 服务并组合结果。它不访问数据库、搜索、AI provider 或外部网络。某个依赖失败时，Bootstrap 应返回明确 partial/failure 状态，而不是让首页崩溃。

## Live 替换方案

Live bootstrap 可以并发读取真实模块服务，但需要设置超时、错误归因和 partial recovery。不能因为一个次要模块失败就清空整个首页。真实实现仍然返回同一个 bootstrap DTO。

## API 与页面使用

主要 API 是 `/api/app/bootstrap`，主要页面是 `/app`。页面用它决定默认侧边面板、首页摘要、恢复动作和可用功能入口。页面不能从 Bootstrap 结果里读取 provider 细节。

## 测试要求

- 聚合测试确认 Bootstrap 通过 service factory 获取依赖。
- API 测试覆盖 success、empty、pending、failure。
- 页面测试确认 `/app` 在 partial 状态仍有可恢复 UI。
- live 接入测试确认单模块失败不会造成无归因失败。

## 团队协作规则

Bootstrap 团队只负责组合，不负责修其他模块的业务结果。需要新增首页字段时，先在对应模块 contract 增加语义字段，再由 Bootstrap 聚合。
