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

### 结构化行业与联系人互操作

本人资料与联系人共用 `shared/domain/industries.ts` 的一级／二级目录，但各自保持原有服务和权限边界。字段为 `primaryIndustryId`、`secondaryIndustryId`；旧 `industry` 原文不被覆盖，显示标签按 ID 派生。

资料页的服务结果、页面组合模型和展示适配器都保留这两个可选 ID。缺少 ID 的旧资料仍显示原行业文字，不自动推断新分类；这避免了数据库已保存、页面投影却丢字段的问题。

联系人详情的 HTTP PATCH 已接通两个 ID：新选择提交完整父子对，切换一级清空旧子项，明确错配在任何附带备注／标签写入前拒绝。旧客户端省略两个字段时保留选择；只改一级时由存储层清除不再适用的二级。Web 和 App 都检查保存回执的两个 ID，失败保留草稿，重新打开后读取保存值。此接线不表示真实同记录跨端或原生操作已验收。

## Mock 行为

Mock 使用本地 Ari Lane 资料和确定性建议。文档抽取不会调用 OCR 或文件存储；更新建议不会调用 AI provider；接受建议只返回本地 preview，不写真实 profile store。

Ari Lane 的正常手动资料夹具使用 `technology_internet.enterprise_software`，读取、编辑输入及保存预览保留同一父子选择；空资料反例仍为空，完整度评分不随本轮行业补齐改变。联系人列表、详情和搜索中的同一测试人物保持一致行业，旧搜索领域原文保留。此批固定夹具不代表生成数据、内联测试或既有测试库已全部补齐。

`tests/support/industry-fixture-inventory.ts` 执行这些夹具及本地资料服务，记录源、构造器、记录 ID、人物关联、账号依据和分类依据。目前覆盖 8 名测试人物的 28 个正常投影，包括旧全局夹具的本人公开资料、networkPeople、联系人及完整参会者公开资料。旧夹具的账号归属由 profile.accountId 和联系人／connection 关联核对；未携带账号的 capability 夹具明确标为未绑定账号，不冒充双用户隔离数据。清单另列空资料、稀疏参会者两个反例和待盘点来源，覆盖测试通过只证明已登记部分。

`NetworkPersonDTO` 与联系人一样允许两个可选行业 ID，旧缺字段记录仍合法。旧全局夹具的 Ari Kato 使用企业软件，Mina Tanaka 的招聘市场使用人力资源与招聘，Nia Patel 使用社群运营；相同 personId 的关联投影保持一致。稀疏参会者不因此新建 publicProfile。默认运行时仍来自生成夹具，其源和产物尚待独立补齐，不把旧全局夹具的完成状态套给默认数据。

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
