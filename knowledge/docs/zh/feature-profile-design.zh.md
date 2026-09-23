# profile Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/profile/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-profile-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:profile` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 profile feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/profile 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Profile 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：结构化行业与联系人互操作
- 第 6 节：Web 资料页的 onboarding 与保存边界
- 第 7 节：登录后的 onboarding continuation
- 第 8 节：Mock 行为
- 第 9 节：Live 替换方案
- 第 10 节：API 与页面使用
- 第 11 节：测试要求
- 第 12 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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

### Web 资料页的 onboarding 与保存边界

`/app/profile` 使用服务端返回的 `onboarding.policyVersion = 1` 作为唯一引导状态。该政策只检查 `displayName`、`primaryIndustryId`、`secondaryIndustryId` 和私密 `birthDate`；页面不会用当前登录账号的显示名预填值冒充已保存完成。生日只进入本人编辑器和私密状态提示，不能进入名片、公开投影或 AI 资料上下文。

基础资料和匹配偏好分开保存。基础资料的新一句话介绍写入 `bio`，限制为 80 个可见字符，并保留已有 `headline` 与 `relationshipGoal`；行业编辑使用稳定的父子 ID，旧 `industry` 文字只读保留。联系方式保存时先以服务端实际 handles 对象为基线，再应用可见字段，避免替换对象时丢失 phone、website、LinkedIn 等隐藏句柄。匹配保存只提交变更的 offering、seeking 或 topics；前两者各最多 5 项，topics 不在页面臆造数量上限，也不把它们镜像到市场、介绍渠道或关系类型字段。

页面写入使用 `expectedUpdatedAt` 与 `mutationId`。首次创建版本为 `null`，同一请求的不确定重试复用相同请求体和 ID，正文变化生成新 ID；PUT 回执必须匹配后，再用独立 GET 仅核对本次提交的字段。版本冲突保留本地草稿并要求加载最新版本，加载后把未保存字段合并回草稿再由用户再次保存。可选建议或用户主动触发的资料提取失败，不阻塞手动资料加载。

### 登录后的 onboarding continuation

认证成功后的注册自动登录、密码登录和 Google callback 统一进入 `/app/profile/continue`。该中转只读取当前 session actor 的权威 profile 与 `onboarding.policyVersion = 1`：资料未完成时回到 `/app/profile?onboarding=1&next=...`，完成时才回到原应用深链。它不调用可选建议、文档抽取或付费 provider；读取或保存失败留在资料页，用户可以重试。

回跳地址复用 auth 的应用内路径规范化，并额外拒绝 profile、continue 和 auth 自环，保留合法深链的 query/hash。现有 proxy 若把目标包在一层 `/app/profile/continue?next=...`，认证客户端只解包这一层后再次执行同一安全校验。资料页只有在基础 PUT 回执和独立 GET 都核实完成后才自动继续；若匹配偏好仍有草稿，页面停留在资料页并明确提示，草稿保留供单独保存。

本人资料页和 continuation 的服务端装配必须先用既有认证身份解析器，将 Auth.js 原始 subject 映射为 canonical account ID，与 `/api/profile` 的 actor 边界一致。不能直接把可能是 profile ID 的 `session.user.id` 传给 profile service；membership 缺失或解析异常须显示受控失败，不得按空资料首建。

这两个产品入口仅在 `resolveFeatureMode()` 为 live 时读取资料；缺配置、mock 或 hybrid 模式保持关闭，不挂载编辑器，也不读取示例资料。production 继续遵循共享配置的 always-live 规则。continuation 显式创建 live profile service。内部 scenario 与共享 loader 的既有模式约定保留；API 的非 production 默认 mock 行为是独立后端边界，不能因页面已保护就宣称 API 已修复。

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
