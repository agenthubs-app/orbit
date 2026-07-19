# 根路由与 Home 路由分工

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/root-home-routing.md` |
| 中文镜像 | `knowledge/docs/zh/root-home-routing.zh.md` |
| 分类 | `architecture` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `app` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

规定三个 home 类路由的分工：/ 是公共产品入口（render-only、无写副作用），/app/home 是登录后个人中枢（live-capable、可 fail-closed），/app/home/events 是个人活动列表；禁止把 / 指回 /app/home，并要求根页活动链接用稳定 id 而非可能碰撞的 display code。

## 审计依据

当前权威的路由分工约定；具体渲染与链接行为以 repos/orbits/app/page.tsx 和 app/(app)/app/home 路由代码及相关页面测试为准。

## 结构化阅读入口

- 第 1 节：源标题：Root Home Routing

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
