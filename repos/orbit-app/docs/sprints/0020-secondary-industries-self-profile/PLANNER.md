# Sprint 0020 — 二级行业、本人资料 AI 工具与测试数据补齐

> 执行者遵守 [RULES.md](../RULES.md)：一份 Planner、一次 Generator；不设 Evaluator，不另派实现／评审代理。本次用户明确只要 Sprint 文档，不能启动实现或先改测试数据。

**Plan revision:** 1。**模式:** existing-codebase / single-generator / cross-client。
**原需求:** 2026-09-14 新增需求；关联 R-03／R-06 与 B1／B3，但不挪走这些原需求的未完成验收。
**单一目标:** 二级行业作为可保存、可检索、可由 AI 读取的共享事实，在两端及全部正常测试数据中一致使用。
**易读目标:** [GOAL.md](GOAL.md)。
**规格:** 本页的契约提案、[行业目录提案](INDUSTRY_CATALOG.md)、[测试数据范围](DATA_SCOPE.md)共同组成待审阅计划。
**技术栈:** 现有 TypeScript、Next.js Web/API、Expo App、Node 测试和既有 AI 工具注册器；不增加 provider、编排框架或分类服务依赖。
**编制基线:** 根整合仓库 `chat-agent`、HEAD `811623d51`；本次编制前根仓库 tracked 工作树干净。Web 子仓库内部 Git 基线较旧，不能把其整份 diff 当作本 Sprint 成果；执行时记录根仓库 HEAD 和精确路径基线。

## 启动条件与依赖

- 2026-09-14 用户已认可 INDUSTRY_CATALOG 的 14 个一级／79 个二级分类条目；此项批准继续复用。单选交互、工具字段范围、技术方案及实际执行仍按下列门槛处理，不重复要求批准相同目录。

- 本次只批准编制。用户审阅本 Planner、二级目录、单选规则、工具资料白名单和测试数据范围后，另有明确执行指令才能领取；全局 ACTIVE 不越过本限制。
- 用户已指定由当前代理负责相关 Web/API 修复。本 Sprint 的跨端代码白名单仍须随本计划审阅；数据库、密钥、部署、真实写入不因负责人变更而自动获准。
- 承接 0002 的已核事实，以及当前 profile、联系人主行业和 AI 工具基础。0020 不必等到 0019，也不以 0003／0005 整项 completed 为硬依赖；只要求本 Sprint 涉及的资料读写、actor 身份和 AI 工具路径可用且基线批准齐全。
- 与 0003、0005、0006、0007、0011、0013～0015 共用资料、工具或字典文件时串行持锁；不能用两个 Generator 同时修改这些文件。
- 本人资料的生日精度、注册其他门槛和设备时区属于此前独立决策，不由 0020 顺手实现；生日是否需要年份不阻止本 Sprint 设计。
- 0003 后续资料补全、0006 的联系人 AI 问答应复用本 Sprint 发布的字段／工具；其 Planner 由协调者另行对齐，0020 的 Generator 不直接改写其他 Sprint。
- 准备两名隔离测试用户、授权联系人／本人资料和可核对的旧测试数据范围；实际环境写入前按 DATA_SCOPE 的 dry-run 对象单独确认。付费验证沿用原累计 $5 预算，不重置。

## 当前代码事实与设计取舍

1. `shared/domain/industries.ts` 当前有 14 个一级分类和 `industryLabel`／`isIndustryIdCode`；App 通过现有 `npm run sync:contract` 同步 industries 字典。扩展同一文件，不另建一份只给 UI 或 AI 的目录。
2. 本人资料 `ManualProfileContract.industry` 目前是可选原文；联系人已有结构化 `primaryIndustryId`。新增规范字段并保留旧原文，不能直接把所有行业文本改成枚举。
3. 关系搜索另有 climate／enterprise_saas／fintech／healthcare／mobility 五个旧领域过滤值。它们不等于 14 类行业，必须保留旧语义并新增结构化行业过滤，不能强行一一映射。
4. AI 当前只读工具为 `events.recommend`、`contacts.recommend`、`followups.reviewQueue`、`chat.context`；没有读取本人资料的工具。必须接入 capability → registry → runtime → actor-scoped service → observation／回答，不以一句 prompt 代替工具。
5. `GET/PUT /api/profile` 已从认证上下文取得 actor，并调用 `getProfile({actorId})`／`updateProfile(...,{actorId})`。新的本人信息读取沿用这条服务边界，App 不直连数据库。

## 契约提案

### A. 共享分类和资料字段

保留现有一级 ID。目录提案有 79 个二级选项；本版一份资料只选一对父子行业。为两端可见的资料／联系人契约增加：

```ts
type IndustrySelectionContract = {
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
};
type SecondaryIndustryDefinitionContract = {
  id: SecondaryIndustryIdCode;
  parentId: IndustryIdCode;
  labels: Readonly<Record<OrbitLanguage, string>>;
  sortOrder: number;
};
```

`SecondaryIndustryIdCode` 是 INDUSTRY_CATALOG 提案全部完整二级 ID 的联合类型。原 `industry` 文本保留，显示标签按 ID 和语言派生，不保存另一份可漂移的翻译。只更新其他资料、同时省略两个行业字段时保留原选择；二级明确 null 表示清空。旧客户端仅改一级且未传二级时，服务端原子清空旧子项；明确清空一级也清空二级。请求显式提供不匹配的父子对则拒绝整次行业变更，不能静默改成另一子类。

新选择在服务端验证 ID 存在和父子归属；历史仅一级记录可继续读取，标为“二级未填写”，不伪造子行业。历史自由文本不能确定归属时保留原文，由用户或明确测试数据映射确认。0020 不因此给已有真实账号新增登录拦截。

通用纯函数仍放入已批准同步的 `shared/domain/industries.ts`：

```ts
declare function listSecondaryIndustries(primaryId: IndustryIdCode):
  readonly SecondaryIndustryDefinitionContract[];

declare function secondaryIndustryLabel(id: SecondaryIndustryIdCode, locale: OrbitLanguage): string;

declare function validateIndustrySelection(selection: IndustrySelectionContract):
  { valid: true } | { valid: false; reason: "unknown_primary" | "unknown_secondary" | "parent_mismatch" };
```

资料、联系人、检索／推荐及 AI 使用同一函数和 ID，不能在调用方复制分类表。表单完成选择时要求有效父子对；对旧记录的缺失值保持兼容，不把分类校验与注册完成评分混成一个规则。

### B. 可供 AI 调用的“读取本人信息”

新增服务文件 `features/profile/self-profile-reader.ts`，导出以下只读入口：

```ts
type SelfProfileReadContext = { actorId: string; mode: "mock" | "hybrid" | "live" };
type SelfProfileForAi = {
  profileId: string;
  displayName: string;
  organization: string | null;
  role: string | null;
  bio: string | null;
  offering: readonly string[];
  seeking: readonly string[];
  topics: readonly string[];
  industry: {
    primaryIndustryId: IndustryIdCode | null;
    secondaryIndustryId: SecondaryIndustryIdCode | null;
    primaryLabel: string | null;
    secondaryLabel: string | null;
    taxonomyVersion: 1;
  };
  updatedAt: string;
};
type SelfProfileReadResult =
  | { status: "ok"; profile: SelfProfileForAi }
  | { status: "empty"; profile: null }
  | { status: "error"; code: "UNAUTHORIZED" | "FORBIDDEN" | "SERVICE_UNAVAILABLE" };

declare function getSelfProfileForAi(context: SelfProfileReadContext, input: { locale: OrbitLanguage }):
  Promise<SelfProfileReadResult>;
```

- 工具名 `profile.getSelf`，模型参数沿用现有 `query`／`locale` 约定，不接受 actorId、userId、profileId、数据库查询或任意字段列表；未知参数须在实际执行验证中拒绝，不只靠 JSON Schema 的声明。
- context 的 actorId 只由已认证会话的服务装配注入。工具不能信任模型、查询文字或客户端 body 提供的身份。live 失败不能回退到默认测试用户。
- riskLevel 为 read；本方案只允许用户主动聊天请求内按需读取，不新增后台抓取、定时任务或打开页面即调用。只读调用本身不写资料、发消息、报名或调用第二个模型。
- 只返回上述资料白名单。生日、邮箱、手机号、凭证、私密笔记和内部权限字段不在输出中；以后扩字段另审阅。自我介绍等原文按数据处理，不能作为系统指令执行。
- 注册新的 `self_profile` artifact 类型及 profile 工具族，沿用现有 observation／trace／synthesis 通路；结果进入模型上下文，trace 保留工具名、结果状态、源版本和脱敏引用，不记录整份私人资料。
- 成功、空资料、读取失败和权限失败明确区分。AI 不得用旧账号缓存、历史提示词或虚构行业填补失败；账户切换后不得复用前一账号结果。
- 目前 AI 对话 locale 主要为 zh/en；本入口和字典支持 OrbitLanguage，按调用方已有语言约定传入，本 Sprint 不宣称完成整套日文 AI 流程。

### C. 其他信息中的实际应用

本 Sprint 必须完成三类真实消费者：本人资料保存／展示、联系人行业保存／展示与结构化检索、AI 自我资料读取并用于后续检索或回答。

结构化搜索新增 `primaryIndustryIds`／`secondaryIndustryIds`，各数组内 OR，两者同时存在时 AND；一级筛选包含其全部子项，二级按 ID 精确匹配。现有 `industryFilters` 的五领域行为保持兼容。服务端过滤和结果投影携带稳定 ID，前端显示语言不能影响匹配。

新增示例场景：“结合我的细分行业，找适合交流的人”。本人为人工智能与数据，候选集中含同一级的网络安全联系人；在明确要求相同二级的受控查询中，只保留匹配的二级联系人。模型输出工具调用后须经过真实注册器和服务执行，不能用固定文案模拟已经读过资料。

不新增行业评分算法、整套推荐排序或分析页面。其他消费者若只需一级汇总可继续按父类汇总，但其已有资料投影不得丢掉二级 ID；必需消费者缺失时 SC-0020-03 不通过。

## 范围与文件白名单

所有路径相对所属子仓库；执行时使用各自 cwd，不在 Web 工作目录使用 `../` 写 App。协调者负责根整合仓库 Git 与交接。

| 工作块 | Web/API 修改或新建范围 | App 修改或同步范围 |
| --- | --- | --- |
| 分类与领域契约 | `shared/contract/industries.ts`、`profile.ts`、`contacts.ts`、`orbit-ai.ts`；`shared/domain/industries.ts`、`contracts.ts` | 只经 `npm run sync:contract` 更新已批准副本；不把 `shared/domain/contracts.ts` 加入同步白名单 |
| 本人资料 | `features/profile/contract.ts`、`live-service.ts`、`mock-service.ts`、`storage/profile-live-record-provider.ts`；新建 `self-profile-reader.ts`；`app/api/profile/handlers.ts`；`app/(app)/app/profile/orbit-real-profile.tsx`、`compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter.ts`（同 profile 页面目录） | `src/api/profile-detail-contract.ts`、`src/view-models/profile.ts`、`src/screens/profile/ProfileScreen.tsx` |
| 联系人及结构化检索 | `features/contacts/detail-contract.ts`、`service.ts`、`live-detail-service.ts`、`mock-detail-service.ts`、`storage/contact-live-record-provider.ts`、`contact-graph-query.ts`、`contact-recommendation-search.ts`；`features/search/contract.ts`、`filter-options.ts`、`live-service.ts`、`mock-service.ts`、`stores/fixture-store.ts`、`backends/basic-rules-backend.ts`；`app/(app)/app/contacts/contact-industry-editor.tsx`、`app/(app)/app/orbit-contacts-route-view-model.ts`、`app/(app)/app/orbit-contacts-presentation.ts` | `src/view-models/contacts.ts`、`src/view-models/contact-detail-editor.ts`、`src/screens/contacts/ContactDetailScreen.tsx`、`ContactsScreen.tsx` 内的现有本地响应 schema 与选择／搜索接线 |
| AI 工具 | `features/agent/capabilities/contract.ts`、`registry.ts`；`features/orbit-ai/agent-tools/registry.ts`、`artifact-contract.ts`、`conversation-contract.ts`、`live-agent-runtime.ts`、`live-artifact-task-service.ts`、`service-factory.ts`、`gemini-provider.ts`、`mock-artifact-task-service.ts`、`mock-conversation-service.ts`；新建 `features/orbit-ai/self-profile-artifact-service.ts` | `src/view-models/conversations.ts`、`src/screens/ai/AiConversationScreen.tsx` 仅为新工具结果解码／显示作适配，不重做 AI 页面 |
| 测试数据 | DATA_SCOPE 所列源数据、生成器和 `tests/` 中已盘点行业承载夹具；新增 `tests/support/industry-fixture-inventory.ts`；新增 `scripts/backfill-test-secondary-industries.ts` 的 dry-run／显式 apply 入口 | `tests/` 中盘点出的行业承载夹具、回执及断言；不能借批量补字段重构无关测试 |
| 测试与说明 | 下述精确测试文件；`features/profile/DESIGN.md`、`features/orbit-ai/DESIGN.md`、`features/search/DESIGN.md` 的相关说明 | 下述新增／已有测试；本 Sprint 的实际 REPORT 由执行结束后创建 |

新 schema 如确需共享，只能在契约审阅时明确新增文件及同步范围后使用；不能手改生成副本。超出表内的生产文件修改先补 Planner 并审阅，不凭“全量应用”扩大到无关系统。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0020-01 | 14 个既有一级 ID 不变，获批二级目录具有稳定 ID／父类／三语标签；全部共享函数使用同一字典，非法父子对被服务端拒绝，旧字段／缺失值可读且不被伪造填充。 | 完整目录参数化测试、类型／同步检查、父子错配和旧客户端省略／明确清空的行为测试。 |
| SC-0020-02 | Web/App 本人资料和授权联系人可选择、保存并回读同一父子行业；切父类不残留旧子项，失败保稿、账号隔离，旧行业原文及其他资料字段不丢失。 | 两端实际路由交互、授权同对象双向保存／重开记录、App 必要原生选择操作；不能只验 payload 存在字段。 |
| SC-0020-03 | 结构化检索区分同父不同子且保留旧领域过滤语义；AI 在明确需要时通过注册器调用 profile.getSelf，取得本人实际二级行业并用于下一步回答／检索。 | 实际工具解析→执行→observation→synthesis 的受控 provider 测试，搜索返回 ID 对照，以及同版本授权真实 AI 调用的脱敏工具证据；字典函数孤立通过不够。 |
| SC-0020-04 | 模型不能指定别人的身份，未登录／越权／旧账号／空资料／读取失败各自正确处理；资料白名单和 trace 脱敏有效，读取无写入或自动外发，原文中的指令不越权执行。 | 恶意参数、双用户、缓存切换、空／失败分支、完整响应与日志禁含字段断言；检查既有工具仍可用。 |
| SC-0020-05 | DATA_SCOPE 内全部正常源码测试数据、生成数据及获准隔离环境的已有测试记录补齐有效二级行业，关联投影一致；反例逐项登记，未解决遗漏／冲突／失败为零。 | 可执行数据清单、覆盖测试、dry-run→获准 apply→回读计数及幂等二次执行；源码夹具通过但旧测试库未补齐时仍为 blocked。 |

## 一次 Generator 的实施顺序

下列均为未来执行步骤，本次不执行。共享接口与 AI 权限属于 H 档；每个任务按 RED → 最小修改 → 相关回归 → 路径限定提交推进，不能引入评审模型或第二轮 Generator。

### Task 1 — 目录、验证与测试数据盘点（SC-01／05）

- [ ] 审阅 INDUSTRY_CATALOG 和字段语义；沿 DATA_SCOPE 建立完整源对象／反例清单并冻结文件边界。
- [ ] 在现有 `tests/services/industry-taxonomy.test.ts` 增加参数化失败测试；例如：
  ```ts
  assert.equal(secondaryIndustryLabel("technology_internet.ai_data", "zh"), "人工智能与数据");
  assert.equal(validateIndustrySelection({
    primaryIndustryId: "finance_investment",
    secondaryIndustryId: "technology_internet.ai_data",
  }).valid, false);
  ```
- [ ] 观察新子项／函数缺失的预期失败，再实现同一字典和三项纯函数；新测试遍历整个获批目录，不只验示例。
- [ ] 同步现有白名单，运行目录与同步测试，审查 impact／暂存 detect 后提交。

### Task 2 — 资料、联系人和检索实际使用（SC-02／03）

- [ ] 新建 Web `tests/capabilities/secondary-industry-records.test.ts` 与 `tests/pages/secondary-industry-editors.test.tsx`；App 新建 `tests/secondary-industry-interactions.test.tsx`。分别覆盖：
  ```text
  输入 technology_internet + technology_internet.ai_data → 保存成功 → 重开仍为同一父子对
  改父类为 finance_investment 而保留旧子项 → 拒绝保存，保留草稿
  旧客户端只改 bio、省略行业字段 → 已存父子选择不变
  查询 secondaryIndustryIds=[technology_internet.ai_data] → 不返回仅匹配 cybersecurity 的联系人
  ```
- [ ] 观察路由失败后补服务验证、存储回读、两端选择控件和结构化检索；不靠前端本地标签掩盖服务端丢字段。
- [ ] 跑资料、联系人和自然搜索相关完整测试；逐功能提交并保留双向回读的同一记录 ID。

### Task 3 — 本人资料工具接入 AI（SC-03／04）

- [ ] 新建 `tests/capabilities/self-profile-reader.test.ts`、`tests/capabilities/orbit-agent-self-profile-tool.test.ts`，测试真实函数／注册器／runtime；受控 planner 返回：
  ```json
  {"toolName":"profile.getSelf","arguments":{"query":"结合我的细分行业找适合交流的人","locale":"zh"}}
  ```
- [ ] 断言工具拿到认证用户 A 的资料，输出稳定行业 ID、标签和源版本；模型私自加入 `actorId: "user-b"` 时拒绝参数，不读取 B。再用受控 synthesis 证明读取结果进入后续处理。
- [ ] 观察工具未注册等预期失败后实现 reader、artifact adapter、capability 注册及 runtime 映射；补空资料、失败、缓存隔离、敏感字段和旧工具回归。
- [ ] 用现有真实调用环境做最少一次必要工具场景；记账并留脱敏 trace。失败不盲目付费重试，不把受控 planner 测试称为真实模型成功；验证后提交。

### Task 4 — 全部正常测试数据补齐（SC-05）

- [ ] 新建 `tests/services/secondary-industry-fixture-coverage.test.ts`、`tests/services/test-secondary-industry-backfill.test.ts`；验证清单对象父子匹配、关联投影相同、反例有明确测试、缺漏使测试失败。
- [ ] 按每条测试人物现有业务语义指定分类，修改源构造器及必要回执断言；不使用模型随机分配，不将所有对象归入 other。
- [ ] 补齐工具默认 dry-run，apply 必须有精确环境／对象清单和版本校验；验证不改行业以外字段，执行两次不重复写，冲突不覆盖。
- [ ] 按 DATA_SCOPE 对获准既有测试记录执行补齐和回读，保留计数及未解决项。无获准环境则停在 blocked，不删除该验收项。

### Task 5 — 同版本收口与交接（全部 SC）

- [ ] 冻结两端相关文件，完成下述 H 档检查和必需业务证据；不能将已有基线失败算作本 Sprint 通过。
- [ ] 全部五项有有效证据后提交已验证功能；执行结束再创建 REPORT，写目标实现情况、实际版本／SHA／文件／SC／费用／未完成和其他端影响。
- [ ] 协调者更新登记表，并向 0003、0006、后续三语及跨端验收交接字段与工具；不改写它们的旧验收结果。

## 最小测试与检查

本次编制为 D 档：只检查文档路径、链接、5 项 SC、范围和 Git diff。以下命令均为未来实施，不声称现在可通过。

Web cwd：`/Users/xzhao/Projects/orbit/repos/orbits`。新增测试必须先落盘并观察 RED；之后运行：

```sh
node --test --import tsx tests/services/industry-taxonomy.test.ts tests/capabilities/secondary-industry-records.test.ts tests/pages/secondary-industry-editors.test.tsx tests/capabilities/self-profile-reader.test.ts tests/capabilities/orbit-agent-self-profile-tool.test.ts tests/services/secondary-industry-fixture-coverage.test.ts tests/services/test-secondary-industry-backfill.test.ts
node --test --import tsx tests/capabilities/profile-live-store.test.ts tests/capabilities/contact-detail-live-store.test.ts tests/capabilities/relationship-natural-search-live-store.test.ts tests/capabilities/relationship-natural-search-mock.test.ts tests/capabilities/agent-capability-registry.test.ts tests/capabilities/orbit-agent-gemini-live.test.ts tests/services/live-generated-fixture-seed.test.ts
npm run typecheck
npm test
```

App cwd：`/Users/xzhao/Projects/orbit/repos/orbit-app`：

```sh
npm run sync:contract
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/secondary-industry-interactions.test.tsx tests/profile-view-model.test.ts tests/ink-signal-profile.test.ts
npm run typecheck
npm test
```

- 同步只在提供方契约变更后执行；App 全量已含 contract/schema/domain 同步检查，不重复计数。
- 真实验收：两端本人资料和同一授权联系人双向写读；App 二级选择操作；AI 按需调用本人资料并使用二级行业；隔离测试库补齐及回读。每项记录同版本、身份、目标、允许刷新方式及结果。
- 不运行无关设备矩阵、生产迁移、整库重种或新 OCR。对真实 AI 只做必要场景，沿用累计账本与硬上限。

## 失败与交接

执行前缺目录／接口审阅、明确执行指令或适用环境时不领取。开始后发生必需 SC 失败，按规则有限修复并如实结束；不得以“行业可选了”代替其他消费者、AI 工具或测试数据完成。

领域接口、runtime artifact 接入或数据盘点若显示超出一个可控 Sprint，先由 Planner 保留全部需求并提出明确拆分，再获得批准；不能在实施中悄悄删去工具或旧测试库范围。没有有效版本／对象依据，不覆盖已有数据，不把测试用户的资料替换为固定人物。
