# connections 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/connections.md` |
| 中文镜像 | `knowledge/docs/zh/module-connections.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:connections` |

## 中文摘要

说明 connections 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/connections/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Connections 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Connections 负责人与人、人与事件、人与证据之间的关系记录，并维护关系阶段和画像。

## 期望行为

模块应提供连接列表、连接详情、证据追加、关系阶段更新和关系画像查询。所有输出都应带有可追溯来源。

## Mock 行为

Mock 服务基于 fixture 返回连接、证据、阶段和画像，并模拟添加证据与受控错误，不进行真实图数据库、CRM、消息或外部写入。

## 热拔插边界

调用方必须通过 `features/connections/service-factory.ts` 获取 connection evidence 和 relationship stage/profile 服务。未来图存储或 CRM 适配器只替换 factory 后方实现。
