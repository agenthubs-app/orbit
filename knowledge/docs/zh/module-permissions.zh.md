# permissions 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/permissions.md` |
| 中文镜像 | `knowledge/docs/zh/module-permissions.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:permissions` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 permissions 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

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
