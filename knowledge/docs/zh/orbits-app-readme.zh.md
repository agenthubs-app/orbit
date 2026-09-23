# Orbits App 开发 README

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/README.md` |
| 中文镜像 | `knowledge/docs/zh/orbits-app-readme.zh.md` |
| 分类 | `developer-guide` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `repos/orbits` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 Next.js app 的基础启动、开发命令和项目入口，是 repos/orbits 内最短的操作说明。

## 审计依据

已核对 package.json 中仍存在 README 提到的核心脚本；详细实现边界以 AGENTS.md 和知识库为准。

## 结构化阅读入口

- 第 1 节：源标题：Orbits
- 第 2 节：本地测试账号
- 第 3 节：活动运营 E2E 数据

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

This is the Git-maintained application repository built by the Orbit long-run harness.

The harness itself lives outside this repo at the project root.

## 本地测试账号

本地服务启动后，打开 <http://localhost:3000/app/account/login>：

| 项目 | 内容 |
| --- | --- |
| 邮箱 | `qa@orbit.test` |
| 密码 | `OrbitTest2026!` |
| 显示名称 | `Orbit QA` |

该账号仅用于本地开发和浏览器回归测试，已在本地 Postgres 的 live 模式下验证可登录。不要在生产或共享环境复用此密码。若本地数据库被重建，可在注册页用同一组信息重新创建账号。

## 活动运营 E2E 数据

活动运营链路使用固定 64 人的有效匹配队列，全部在截止前报名，并覆盖完整、部分和最小画像；另保留 6 条已取消生命周期记录，其中 3 条曾逾期报名，因此数据库共有 70 条报名历史，但活动目录和冻结/发布结果始终严格为 64 人。种子只重置该测试活动的作用域，可重复执行，不会伪造 AI 推荐或分桌结果。准备数据库、模型密钥、账号及完整浏览器验收步骤见 [活动运营 E2E 指南](./docs/event-operations-e2e.md)。
