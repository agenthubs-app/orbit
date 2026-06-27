# Orbit AI 模块设计文档

## 设计定位

Orbit AI 是产品的对话式编排层。它把用户自然语言意图映射到 Profile、Contacts、Events、Followups、Chat、Dashboard 和 Agent 的功能页面或服务动作。它不是单独替代所有模块的超级模型。

核心原则是：AI 负责理解意图和打开合适工作区，业务事实仍由各模块 contract 提供。

## 子能力范围

- AI command center intent parsing。
- 侧边功能面板路由选择。
- 本地建议、预览动作和下一步说明。
- 与 app bootstrap、agent action、chat draft、event recommendation 等模块组合。

## 契约与数据边界

契约位于 `features/orbit-ai/contract.ts`。核心 DTO 包括 user prompt、resolved intent、target panel、suggested action、response copy、source references 和 safety boundary。Orbit AI 输出不能直接改联系人、发送消息或写外部系统。

`features/orbit-ai/service-factory.ts` 提供 command service。页面应通过 `createOrbitAiCommandService()` 获取能力。

## Mock 行为

Mock 使用规则匹配用户 prompt，返回稳定 intent 和 panel。它不调用 live AI provider，不请求外部网络，不写对话存储。无法识别的 prompt 应返回可恢复建议，而不是假装完成。

## Live 替换方案

Live 可以接 LLM intent parser 或 tool planner。模型输出必须经过 schema validation、allowed intent mapping 和 safety guard。LLM 不能直接返回任意 route 或任意 API call；只能选择注册过的能力。

## API 与页面使用

主要产品入口是 `/app`。Orbit AI 负责干净的中文优先聊天入口和功能侧页联动。它可以打开联系人、活动、跟进、聊天、关系健康或下一步面板，但页面内容仍来自对应模块。

## 测试要求

- intent 测试覆盖联系人、活动、跟进、聊天、dashboard、agent。
- unknown intent 测试覆盖 fallback。
- safety 测试确认 AI command 不执行外部副作用。
- 页面测试确认 prompt 能打开对应功能侧页。
- live 接入测试确认 LLM 输出被 schema 限制。

## 团队协作规则

Orbit AI 团队不直接实现各业务模块。新增功能入口时，先让业务模块提供 service contract 和页面，再把 intent 映射到该功能。
