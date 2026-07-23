# home 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/home.md` |
| 中文镜像 | `knowledge/docs/zh/module-home.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:home` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 home 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/app/(app)/app/home、repos/orbits/app/page.tsx。

## 结构化阅读入口

- 第 1 节：Home 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：Live 行为
- 第 6 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Home 是个人入口和活动入口的页面组合层。它负责把 events、contacts 和
profile 的 route payload 汇总成个人 hub，不负责搜索、存储、推荐或资料
编辑。

## 期望行为

Home 应展示用户身份、报名/相关活动、人脉数量和推进中的关系数量。它只复用
下游 feature 已经批准的 route/service 边界，不直接访问 fixture、database、
search index 或 provider SDK。

## Mock 行为

旧 mock-first Home 由 `getOrbitHomeViewModel()` 同步拼接 landing、contacts
和 profile 的本地 view model。该函数仍可作为旧 UI 辅助存在，但真实
`/app/home` 和 `/app/home/events` 页面不再调用它。

## Live 行为

Live Home 通过 `loadAppHomeRouteViewModel()` 组合三个 live-capable route
loader：

- Events route payload 提供活动列表。
- Contacts route payload 提供人脉统计。
- Profile route payload 提供账户名称和 headline。

Home adapter 只做 UI shape 映射，把这些 payload 转换为 `OrbitHomeViewModel`
供 `OrbitRealHome` 使用。任何 child route 返回 empty、pending 或 failure
时，Home 渲染 shared `StateView`，不会 fallback 到 mock。

## 热拔插边界

Home 不注册自己的 storage provider。events、contacts、profile 的实现从
mock/hybrid/live 切换时，Home 通过这些 route loader 自然继承能力。新增搜索
或向量检索也应先进入对应 feature/search service，再由 Home 消费结果。
