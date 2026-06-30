# Orbit AI Trace Debug 英文设计源

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.md` |
| 中文镜像 | `knowledge/docs/zh/trace-debug-design-en.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

Orbit AI trace debug 设计的英文源文件；当前说明 full-chain trace、planner-only 兼容入口、共享 runtime 和人脉推荐方法选择。

## 审计依据

已核对 live-agent-runtime、live-conversation-service、live-conversation-trace、/api/dev/orbit-agent/trace route 和 contact recommendation tests；英文源与中文 companion 同步更新。

## 结构化阅读入口

- 第 1 节：Orbit AI Trace Debug 页面 设计
- 第 2 节：如何 阅读 文档
- 第 3 节：目标
- 第 4 节：当前 上下文
- 第 5 节：架构
- 第 6 节：联系人 推荐 和 方法 选择
- 第 7 节：Trace 契约
- 第 8 节：架构 检测 和 渲染 扩展性
- 第 9 节：页面 设计
- 第 10 节：安全 和 运行时 边界
- 第 11 节：错误 处理
- 第 12 节：Testing 策略
- 第 13 节：源标题：Out Of Scope
- 第 14 节：验收 标准

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
