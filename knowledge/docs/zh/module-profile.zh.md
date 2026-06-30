# profile 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/profile.md` |
| 中文镜像 | `knowledge/docs/zh/module-profile.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:profile` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 profile 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/profile/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Profile 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Profile 负责用户自己的资料、资料完整度、文档抽取和资料更新建议，是账号上下文的业务画像层。

## 期望行为

模块应提供资料读取、编辑、完整度评分、名片/简历抽取和来自信号的更新建议。抽取和建议必须可复核。

## Mock 行为

Mock 服务用 fixture 模拟个人资料、名片/简历抽取和更新建议，不执行真实 OCR、PDF 解析、AI 抽取、数据库写入或外部网络访问。

## 热拔插边界

调用方必须通过 `features/profile/service-factory.ts` 获取 profile、document extraction 和 signal review queue 服务。真实 OCR 或资料存储可单独替换。
