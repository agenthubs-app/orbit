# 0020 未完成部分的接续范围审阅

> 执行方式继续采用 executing-plans、原地 `chat-agent`、唯一 Generator、TDD、逐功能提交；不采用多实现者或评审模型。本文件是待审补充方案，不修改已冻结的 PLANNER，也不自行重开 run-01 或登记新 Generator。

**Goal:** 接通已批准的二级行业消费者及本人资料工具，保留全部原验收与真实数据补齐要求。
**Architecture:** 继续使用现有 HTTP → actor-scoped service → storage、共享行业字典，以及 capability → runtime → observation/synthesis。增加缺失的传递字段和隐私边界，不新建替代 API、分类服务或编排框架。
**Tech Stack:** 现有 TypeScript、Next.js、Expo、Node 测试；生成源涉及现有 Python，但任何执行必须经 uv。
**Spec:** [冻结 Planner revision 1](PLANNER.md)、[数据范围](DATA_SCOPE.md)、[实际报告](REPORT.md)。
**代码基线:** 根提交 `5355f0c6a`，34 个文件的部分实现；不是已通过验收的发布版本。

## 已有批准与本次缺口

用户已批准原 0020 代码方案，并于 2026-09-14 明确要求先提交部分实现再持续推进。原目录、单选／省略／清空语义、本人资料输出白名单、原地执行与提交方式不再询问。新文件边界、已结束 run 的接续方式、其他 Sprint 的新增协议，以及真实环境副作用没有因此自动获准。

用户随后两次明确放开必要付费调用。此项授权已复用，不能再以“用户未允许付费”为阻塞；原累计 USD 5 硬上限没有被提高。调用前仍须核对已用费用及本次最坏成本，并满足对应代码／资料范围。

上一轮停止前没有把缺项补成可直接审阅的接续范围，这是尚可独立完成的准备工作。此处补齐，而不是只重复“blocked”。原 0020 保持历史 blocked；本提案经批准后，由协调者依 RULES 第 7 节登记明确关联原 SC 的接续 Sprint，再由同一个主代理执行一次。未批准前不预占编号、不开始第二次生成。

### 必需新增文件边界

以下路径相对 Web `repos/orbits`。只允许表中用途，不能据此重构整份文件。原 Planner 已列文件继续复用。

| 增加的精确文件 | 改动与验收目的 |
| --- | --- |
| `features/contacts/live-service.ts` | 在既有 `LiveContactsGraphProvider.updateContactPrimaryIndustry` 接口增加可选二级 ID；保留三参数调用兼容性。 |
| `app/api/contacts/[id]/handler.ts` | PATCH 白名单解析二级字段；区分省略、null、字符串，错误类型拒绝整次请求；actor 仍来自认证。 |
| `app/(app)/app/contacts/orbit-real-card-connection.tsx` | 实际详情页显示／编辑／保存／重开二级行业，失败保稿；不只是新增孤立 picker。 |
| `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts` | 从服务详情投影二级行业到既有页面模型，不读默认 fixture。 |
| `app/api/search/relationships/route.ts` | GET、form、JSON 都传递 `primaryIndustryIds`／`secondaryIndustryIds`，维持五类旧领域过滤。 |
| `features/orbit-ai/live-conversation-trace.ts` | 约束 self_profile artifact、conversation clone、各阶段 outputSource 与数据库摘要中的本人资料输出；不能只脱敏 registry observation。 |
| `app/(app)/app/orbit-profile-route-view-model.ts` | 为 `OrbitProfileView` 增加可选结构化行业 ID，让已获准 adapter 能无损投影；保留旧原文字段。 |
| `scripts/generate-full-product-functional-audit.mjs` | 仅在取得真实新证据后更新资料页的证据关联；保留旧历史记录，不降低验证门槛。 |

**范围纠正：** `profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter.ts` 本来就在原 Planner 白名单内，不应笼统说 adapter 未获准。真正漏掉的是它返回的 `OrbitProfileView` 所在文件；该类型目前只有旧 `industry: string`。原实现通过认证 GET 补读两个 ID，目前尚未完善服务端页面投影。

新增测试范围：`tests/api/secondary-industry-search-route.test.ts`、`tests/capabilities/orbit-agent-self-profile-trace.test.ts`、`tests/pages/contact-secondary-industry-editors.test.tsx`；原 Planner 的行业、资料、联系人、工具和数据覆盖测试继续使用。资料页完整运行证据仍需明确可用的浏览器、隔离账号及读写对象；不能改审计断言把 18 降成 2，或只移动旧行号冒充新验收。

## 接线任务与验证次序

### 1. 联系人写入及实际页面

接口增量保持原方法，不另建重复 provider：

```ts
updateContactPrimaryIndustry?: (
  contactId: string,
  actorId: string,
  primaryIndustryId: IndustryIdCode | null,
  secondaryIndustryId?: SecondaryIndustryIdCode | null,
) => LiveContactsProviderResult<ContactDTO>;
```

- [ ] 承接 `secondary-industry-records.test.ts` 的两个可执行失败用例；实现时去掉阻塞 TODO 标记，先确认仍为预期 RED，而非模块或环境错误。
- [ ] 先检查上述接口、`readPatchBody`、storage 方法、详情服务与实际页面的 upstream impact；HIGH/CRITICAL 先报告。复用原合并函数；显式错配在备注／标签或行业写入之前拒绝。
- [ ] 对认证用户 A 保存 `technology_internet / technology_internet.ai_data` 后经实际 GET 重开；改父级到 finance 后旧子项消失；非法组合不改原记录和附带备注；用户 B 不读取或修改 A 的记录。
- [ ] 补 Web 真正详情页面与 App 既有 ContactDetailScreen 接线；测试失败回执保稿、重开和旧主行业记录。仅在 HTTP 写入接通后开放控件。
- [ ] 完整相关文件、两端 typecheck、H 档所需验证后路径限定提交；真实双端同对象和原生验收不由 DOM 测试代替。

### 2. 搜索 HTTP 及资料页面投影

独立手算的检索反例：A=`technology_internet.ai_data`，B=`technology_internet.cybersecurity`；两者同父。请求如下时只返回 A：

```text
GET /api/search/relationships?primaryIndustryIds=technology_internet&secondaryIndustryIds=technology_internet.ai_data
POST JSON {"primaryIndustryIds":["technology_internet"],"secondaryIndustryIds":["technology_internet.ai_data"]}
POST form primaryIndustryIds=technology_internet&secondaryIndustryIds=technology_internet.ai_data
```

- [ ] 新 HTTP 测试对三种输入验证真实 handler → service → 内存记录过滤；保持认证分支真实，仅替换外部存储装配。分别测试空列表、非法 ID 和旧 `industryFilters`，不只检查入参里有字段。
- [ ] 观察遗漏字段导致同父不同子混入的 RED，再补三种解码入口。数组内 OR、两层 AND 的现有服务行为不改为字符串标签匹配。
- [ ] 页面模型增加可选 ID，获准 adapter 逐字段投影；补已有资料页 adapter 测试，断言 `primaryIndustryId` 和 `secondaryIndustryId` 的固定字面量及缺失兼容。保留加载／保存失败保稿验证。
- [ ] 相关完整测试与类型检查后提交，不将服务层通过写成 HTTP 或跨端已通过。

### 3. 本人资料工具与整条 trace 隐私链

- [ ] 使用原 Planner 的受控请求 `{toolName:"profile.getSelf", arguments:{query:"结合我的细分行业找适合交流的人", locale:"zh"}}`，在真实 registry/runtime 中观察未注册的 RED。
- [ ] reader 沿用 `getSelfProfileForAi(context, {locale})`，actor 仅由认证装配注入。未知参数（包括模型提供的 actorId/userId）在执行时拒绝；空资料、读取错误、未认证分别返回，不回退默认账号。
- [ ] 对 profileId、来源版本、行业 ID 建立 self_profile artifact；完整资料白名单仅供本轮模型执行上下文使用。trace 用明确的状态、版本及脱敏引用替代资料正文；对 conversation clone、artifact、outputSource 和数据库摘要逐项测试。
- [ ] 负例放入独特的测试姓名、bio、邮箱、生日、手机号和注入指令，检查完整序列化 trace 不含这些值；受控 synthesis 则确实收到允许的行业资料。不能为让 trace 测试通过而把合法模型输入也清空。
- [ ] 回归旧工具、双用户切换及零写入；完成相关测试后提交。工具接通且预算可核对后执行最少必要真实 provider 验收，记录模型、输入／输出 token 与实际费用；没有实际证据前仍为未完成。

## 数据生成与补齐的独立接续

原 SC-05 完整保留，不能因为接线先做就删去已有测试库。已核实 `LiveRecordStoreLike` 仅有普通 `upsertRecord`，没有版本条件写接口；原 get→upsert 不能作为并发安全实现。

下一段需单独冻结以下边界后实施，不能把这一段当成已审批的任意目录写权限：

1. 根生成源 `harness/relationship_data_goal_runner.py` 的 `_build_hybrid_runtime_fixture`、`generate_relationship_mockdata` 与输出步骤；现有入口会重写多种数据、验证器和 generation 文档，不能直接运行旧完整入口。提案为离线、确定性行业投影，先对临时目录生成并检查差异，再按精确产物清单替换；不调用 MiniMax。
2. `repos/mockdata` 的具体 seed/generated/export 人物集合，以及 Web `shared/mock/generated-relationship-fixtures.ts`；清单须列明对象与关联投影、映射依据和保留反例。消息、时间等无行业语义集合不补字段。
3. 原获准 `tests/support/industry-fixture-inventory.ts`、`scripts/backfill-test-secondary-industries.ts` 和两个覆盖测试负责执行清单、只读差异与显式 apply；必须先选定实际存储的原子版本条件写路径及测试范围，不能注入一个假的 CAS 再宣称真实库安全。
4. 真实 dry-run/apply 必须另有精确环境、workspace、actor、记录 ID、预期版本与写入批准。没有这些条件不连接未知数据库；正常目标、已符合、成功补齐、冲突、缺依据、失败与幂等回读分别记录。

本次额外只读核查已将旧候选统计具体化：`seed/users.seed.json` 与 `seed/contacts.seed.json` 各 132 条，`seed/event_participants.seed.json` 500 条，对应三个 `generated/*.generated.json` 数量相同；`exports/local_seed.json` 与 `exports/demo_seed.json` 分别包含这些集合。这些关联投影不能相加当作唯一人数。用户和联系人 JSON 顶层没有行业 ID，必须从源人物语义作明确映射，不能靠字段关键词扫描覆盖全部对象。

旧生成器在 `generate_relationship_mockdata` 开头使用 `datetime.now(timezone.utc)`，随后重写所有 seed/generated 文件、两个 export、测试反例、场景、验证器和 generation 文档；直接重新生成会连带修改时间等非行业字段。因此数据续接须保留已有时间和非行业内容，并逐产物核对差异，不能直接重跑旧入口。此次仅解析源码 JSON 的集合数量与键名，没有导入生成器、生成数据或连接数据库。

该段未就绪不阻止已获新范围批准的接线任务；反之，接线通过也不将 SC-05 或整个原 0020 标为 completed。

## 验证、预算与交接

- 原 Web 全量 51 fail、168 skipped、2 TODO 保留；此次用户允许 WIP 提交，不等于接受这些失败为通过。4 项环境问题已离线复验，10 项基线审计失败、36 项无数据库环境失败和本轮资料页证据失效分别处理。
- 当前新增本地测试使用清洁进程环境与默认 fetch 拒绝保护；不继承模型 key，不加载真实数据库配置。需要受控 fetch 的测试只注入确定性响应。
- 本地实现后执行原 H 档和新增直接消费者测试；不能反复跑未配置数据库或失效历史证据来刷次数。未满足的真实检查继续保持 blocked，逐项写入报告。
- AI/OCR 付费调用已获用户最新明确批准；硬预算仍为 USD 5.00。原已知 USD 0.012780 加本轮待核算增量，不能以旧余额冒充可用额度；逐调用核对成本，未提高或重置上限。
- 下一次审阅只需决定本提案的新增接线文件与明确接续方式，不重问目录、产品选择或原地提交；数据源／原子写路径和真实环境可独立审阅。其他 Sprint 的 B1/B3/时区等实质设计仍按各自提案办理。
