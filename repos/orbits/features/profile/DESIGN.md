# Profile 模块设计文档

## 设计定位

Profile 负责用户自己的身份资料、名片信息、简历/名片文档抽取和资料更新建议。它回答“我是谁，我如何被介绍给别人，我的资料是否完整”。它不负责联系人采集，也不负责会话登录。

Profile 是很多关系动作的基础上下文。消息草稿、活动介绍、Agent 推荐都可能引用它。

## 子能力范围

- `profile-onboarding-and-manual-profile-editor`：资料查看、手动编辑、完整度。
- `profile-document-extraction-mock`：简历和名片文档抽取。
- `profile-signal-review-queue`：从聊天、活动、联系人信号中提出资料更新建议。

## 契约与数据边界

契约位于 `features/profile/contract.ts`。核心 DTO 包括 profile fields、completeness、manual edit state、document extraction draft、suggestion queue、source reference 和 provenance。Profile 不应暴露 OCR 原始 payload、LLM prompt 或账号 provider 字段。

Service factory 提供 profile、document extraction 和 signal review queue services。

## Mock 行为

Mock 使用本地 Ari Lane 资料和确定性建议。文档抽取不会调用 OCR 或文件存储；更新建议不会调用 AI provider；接受建议只返回本地 preview，不写真实 profile store。

## Live 替换方案

Live 可以接用户资料数据库、文档解析、OCR、LLM 信息抽取和人工编辑记录。文档抽取结果必须先进入 draft/review 状态，不能直接覆盖 Profile。来源和置信度必须保留。

## API 与页面使用

产品入口是 `/app/profile`。API 包括 profile get/update、resume extraction、business card extraction、update suggestions 和 accept。页面应优先展示资料完整度、待复核来源和人工可控编辑。

## 测试要求

- profile service 测试覆盖 get/update/completeness。
- extraction 测试确认不调用真实 OCR 或 AI。
- suggestion queue 测试覆盖 accept 和 no-side-effect preview。
- 页面测试确认资料恢复状态和来源复核可见。

## 团队协作规则

Profile 团队不维护账号会话，也不维护联系人详情。需要账号身份时调用 Account；需要别人的联系人信息时调用 Contacts；需要消息草稿时调用 Chat 或 Followups。
