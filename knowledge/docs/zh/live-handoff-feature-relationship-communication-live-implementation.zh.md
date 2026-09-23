# relationship-communication 能力 Live 交接：live implementation

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/relationship-communication/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-relationship-communication-live-implementation.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:relationship-communication` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 relationship-communication 模块 live implementation 能力的 live 实现 边界：需要替换的服务、环境变量、权限约束和验证要求。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/relationship-communication。具体切换行为以 service factory 与测试为准。

## 结构化阅读入口

- 第 1 节：联系人消息收件箱

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

0037 将真实消息作为 Web / App 收件箱的默认入口；通知单独显示。名称与消息原文来自已授权会话，不从联系人代号或 AI 草稿生成。用户明确点击发送后才写消息，响应丢失时复用同一 requestId 重试；已读只推进对方消息的游标。

`GET /api/relationship-communication/conversations` 支持 limit（默认50、上限100）及绑定 actor 的 cursor，返回可选 nextCursor 和全会话 unreadTotal。旧消费者仍可读取 conversations。当前实现对授权会话快照排序分页，不扫描联系人目录；存储层仍读取会话集合，尚非数据库级分页。两端前台15秒刷新；刷新后列表回到最新第一页，正在阅读的 Web 会话保留独立详情。

页签选择按账号与服务来源保存。消息和通知未读分别计数，外层只显示未读点；通知读取失败不妨碍通信。真实消息不依赖 AI 开关，也不进入关系提醒的年龄过滤。账号变更、取消和迟到回执不能更新下一账号。

本次在隔离 PostgreSQL、本地生产 Web/API（31037）、两合成 QA 账号和独立 iPhone 17 Pro Simulator bundle 中验证 Web 发起、对方回复、响应丢失重试去重、App 回复后 Web 回读、前台到达及已读同步。确切版本、原始检查失败及后续回归见 App 的 Sprint 0037 执行报告。本地验证不代表远程发布或 Push 设备送达。
