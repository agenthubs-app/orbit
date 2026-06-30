# permissions 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/permissions.md` |
| 中文镜像 | `knowledge/docs/zh/module-permissions.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:permissions` |

## 中文摘要

说明 permissions 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/permissions/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Permissions 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Permissions 负责权限状态、分阶段授权和敏感操作确认，是所有外部副作用前的安全边界。

## 期望行为

模块应报告权限状态、处理权限请求，并为敏感动作提供 approve/reject 确认。业务模块不能自行绕过该边界。

## Mock 行为

Mock 服务返回固定权限状态、请求结果和确认记录，不调用真实设备权限、日历授权、邮箱授权、外部账号或数据库。

## 热拔插边界

调用方必须通过 `features/permissions/service-factory.ts` 获取 permission state 和 sensitive action confirmation 服务。真实授权实现只在 factory 后接入。
