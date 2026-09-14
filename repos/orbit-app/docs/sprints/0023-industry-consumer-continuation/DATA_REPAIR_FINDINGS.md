# 测试数据补齐：已核实入口与剩余边界

2026-09-14 源码核查与本地夹具进度；这是原 SC-05 的接续记录，不是全部数据补齐成功报告，也不授权数据库操作。完整对象范围仍以 [0020 DATA_SCOPE](../0020-secondary-industries-self-profile/DATA_SCOPE.md)为准。

## 已实现的固定夹具与可执行清单

`464e7f816` 补齐 Web 资料、联系人列表／详情、自然搜索四组固定夹具；`10c2ecd7b` 新增 `tests/support/industry-fixture-inventory.ts`，执行真实夹具构造器和本地资料服务，不以文本命中数冒充覆盖。

随后 `fd91387b0` 补齐旧全局 `legacyDefaultMockFixtures` 的本人公开资料、networkPeople、联系人及完整参会者公开资料。清单现有 8 名人物、28 个正常投影，登记源文件／构造器／稳定记录和人物 ID／账号与分类依据。空本人资料和刻意缺少公开资料的稀疏参会者保留为两个具体反例。旧全局账号关联由 profile 与 connection 回读核对；无账号的 capability 夹具不伪造所属账号。

默认全局运行时仍来自 generatedRelationshipFixtures，不能将旧全局夹具的完成状态套给生成数据。清单内待盘点来源仍包含生成器／产物、seed、其他两端内联夹具及既有测试库；本清单当前只是增量覆盖。Web 71 个、App 25 个测试文件的关键词扫描是下一步阅读线索，不是完整对象清单或人数。

当前数据版本 H 检查：App 2582 pass／0 fail／0 skip；Web 2952 pass／47 fail／168 skip，两端类型检查 exit0。Web 失败集合与前次相比没有新增项，只移除了已修复的 Agent 报告模块错误；47 项既有审计／未配置数据库失败仍不算通过。没有运行 seed、连接真实数据库或发起付费模型请求。

App 的 `tests/profile-view-model.test.ts` 与 `tests/profile-manual-edit-view-model.test.ts` 随后补齐“小雨／企业 AI 应用”正常样本，实际名片、编辑草稿和保存请求使用 `technology_internet.ai_data`。先观察三条缺字段／旧文案 RED，再补输入；完整三文件11/11、App typecheck通过。空元数据、缺姓名及旧版无ID资料的兼容检查保留。首次旧版测试使用显式undefined违反exactOptionalPropertyTypes，已改为从本地副本真正省略两个字段，未放宽产品类型。这些 App 样本尚未并入 Web 的28投影清单，不虚构一个已统一执行的跨仓库清单。

只读 TypeScript 语法扫描进一步检查两端787个测试／helper源码文件，找到81个包含显式行业对象的文件、227个对象表达式；其中混有期望回执、反例、汇总桶及动态构造，不是227名人物。模板字符串里的浏览器夹具、导入／生成对象仍需单独跟踪，不能用这次扫描取代构造器执行。

上述 App 名片／编辑夹具提交为 `805188a56`；`2d1add128` 继续补齐首页、资料解码和建议／抽取转换中的明确 AI 样本。后者先观察5条缺字段 RED，补源输入后六个完整相关文件51/51，App typecheck通过；不更改首页事件领域或空资料反例。

`1adb805c7` 修复原白名单内 Contacts 推荐适配器的行业投影：同步／异步、普通／排序四条路径保留规范 ID、显式 null 和旧数据省略语义，不改排序和旧领域过滤。12个新路径用例中8个先因字段丢失失败，修复后推荐及夹具两个完整文件29/29。该版本 H 全量：App 2583 pass／0 fail／0 skip；Web 2964 pass／47 fail／168 skip，两端 typecheck exit0。与上一份全量日志逐项比较失败名称，没有新增或消失的失败。日志为 `build/harness-logs/sprint-0023-recommendation-{web,app}-full.log`。推荐投影尚待并入上述增量清单；不计作新的独立人物。

`d34712307` 已将4个真实推荐结果加入清单，现为8人／32个正常投影。并补齐 Web 内联测试的本人资料、存储联系人及两种推荐输入；5个预期RED后，四个完整文件43/43，Web typecheck exit0。实际服务输出保留行业ID，资料回读不一致不能报告保存成功；这些内联样本尚未统一进入32投影清单，不将测试数当作已登记人数。

`e5db81a32` 新增非个人行业来源的可执行分类：读取两条 AI 输出、四个统计桶、一份活动搜索偏好和三场活动。已完整阅读三个源文件及其消费路径：AI provider构造消息／关系摘要，Dashboard克隆汇总桶，活动推荐将偏好与活动领域比较；没有个人行业映射。原三个待盘点来源转入明确分类，不从整体清单删除。先见空清单RED，四个相关完整文件20/20、Web typecheck exit0。其他10个来源族仍待处理，不计作已补齐。

## 源数据与关联

`b5e868112` 后同版本I全量：Web2966 pass／47 fail／168 skip，失败名称集合与上一版相同；App2582 pass／1 fail／0 skip。新增App失败是任务设置按钮的几何测量43.99998474121094小于严格44下限，并非行业断言。相关任务页和测试不在这三个提交的差异中；未改源码／断言，限定用例重跑1/1。按钮位于slide Modal、minHeight使用44pt token，当前推断是动画测量精度，尚不构成已修复证据。本次全量失败保留，不能用重跑一项覆盖它。

已解析现有 JSON，没有导入或运行生成器：

几何失败的整个 `tests/app-wide-workspaces.test.ts` 随后原样重跑44/44（`build/harness-logs/sprint-0023-layout-full-file-recheck.log`），没有任何修复性编辑。两次限定诊断均未复现，保留间歇性失败记录，不再次运行整套测试来筛选绿色结果。

| 集合 | 记录数 | 已核实关联 |
| --- | --- | --- |
| `repos/mockdata/seed/users.seed.json` | 132 | 全部具有 company_id，关联 90 个公司 ID |
| `repos/mockdata/seed/contacts.seed.json` | 132 | user_id 全部能在 users 中找到 |
| `repos/mockdata/seed/event_participants.seed.json` | 500 | user_id 全部能在 users 中找到 |

以上不是 764 个独立人物。三个 `generated/*.generated.json` 及两个 `exports/local_seed.json`、`exports/demo_seed.json` 中对应集合是关联投影，必须分别核对，不相加作为唯一人数。上述关联检查尚不证明所有投影逐字段一致。

用户和联系人没有结构化行业 ID。生成器 `harness/relationship_data_goal_runner.py` 在 `generate_relationship_mockdata` 内构造公司，并为公司分配 10 类旧行业；随后构造用户时仅保留 company_id 与公司名称等字段，没有传递行业。公司数组没有作为独立 seed 或 export 集合保存，因此不能声称已从现有 companies.seed.json 读到了行业事实。

旧类别为 restaurant_inbound、ai_saas、manufacturing_dx、cross_border_ecommerce、venture_capital、community_events、retail_omnichannel、legal_accounting、tourism_hospitality、education_training。部分语义不能唯一确定二级 ID，例如 legal_accounting 同时包含法律和财税。不能按公司 ID 数字或数组位置轮换新子类，不能把需求中的行业当作本人的行业，也不能把所有歧义对象统一填为“其他”来通过检查。

下一步分类清单需为每个正常人物列出稳定 ID、确认的父子 ID、来源依据和关联投影；没有唯一依据的对象明确计入“缺依据”，不能算补齐成功。要补齐全部正常对象，须先审阅这部分映射。14 个一级和 79 个二级的覆盖仍由完整测试范围承担，不虚构这 132 人已覆盖全部目录。

## 新核实的接续范围（2026-09-14 已获准，实施中）

用户再次明确“全部获准”；按更新后的 RULES.md 第 0 节，以下 App 搜索模型／界面与 Web 纯 seed 模块纳入本轮既定行业验收范围，不再等待逐文件批准。保持原五项 SC、数据映射依据和真实环境边界；批准不代表下列实现或验收已经完成。

### App 自然搜索

已实现并提交 `e181bbdc3`：仅一级、仅二级、父子组合及旧领域混合请求均保留条件；结果保留规范 ID／null／省略语义并显示规范标签。现有人脉筛选区支持父子单选、切父清子、清空、区分同父不同子的历史与回放；失败保留条件，换号取消旧请求和回调。模型7个预期RED后完整12/12，实际界面4个预期RED后4/4；同版本App全量2593 pass／0 fail／0 skip，两端typecheck exit0。日志为 `build/harness-logs/sprint-0023-app-search-{model-red,model-green,ui-red,ui-green,full}.log`。这是本地HTTP边界交互证据，不代替同记录跨端或原生验收；历史I几何失败保留。

以下保留修复前的复现与范围依据：

无网络调用实际复现：`buildRelationshipSearchRequest` 只收到两级行业数组时返回输入为空；同时传 query 时只留下 query。`relationshipSearchToView` 的结果不含两个行业 ID。请求构造器影响 LOW／1个直接调用者 `ContactsScreen.runRelationshipSearch`，共7个受影响符号、0条已识别流程；结果 mapper 图谱为LOW／0直接，源码另确认 `relationshipSearchToView` 的 `.map` 消费。

- 需增加生产文件白名单：App `src/view-models/relationship-search.ts`。只接现有两级数组请求、可选结果ID和规范标签；沿用同层OR／两层AND及旧五领域兼容，不另建目录。
- App `src/screens/contacts/ContactsScreen.tsx` 已在原白名单：在现有筛选区接单选父子行业，保留旧领域，不另建页面。依赖 mapper 修复，不能先开放无效控件。
- 验证范围补入现有 App `tests/relationship-search-view-model.test.ts` 和 `tests/ink-signal-contacts.test.ts` 的实际搜索交互：仅行业条件、同父不同子、清空、旧领域、失败和换号，不用源文本断言代替点击和请求结果。
- `b5e868112` 只先补齐 App邀请／搜索、Web简报的正常源数据；3条缺字段RED后App两完整文件9/9、Web简报完整文件11/11，两端typecheck通过。App搜索卡片仍为旧结果模型，源数据通过不代表该消费者已修复。

### 联系人 seed 的纯数据边界

拟将纯定义与纯构造器提取到新增 Web `shared/mock/account-contact-fixtures.ts`，此精确新文件已随上述整体批准纳入范围。原 `scripts/seed-account-contact-fixtures.ts` 保留CLI、认证与既有行为，只改为消费纯构造结果；覆盖清单只调用无环境读取、无存储访问的构造器。构造器返回既有 contact／connection／evidence 数据及固定源序位，保留正文、日期和关联，只新增已确认的行业投影。当前ID使用账号SHA256前10位加固定序位01～12，不能重排或重新分配ID。

该CLI还会软删除命中的旧fixture，并改写一条已知介绍草稿；即使提取后也不能为行业验收直接执行它。实际补齐仍用独立版本条件写方案。

下表是12条源定义的只读映射准备，不是已补齐数据：

| 固定序位／人物 | 二级ID提议或缺项 |
| --- | --- |
| 01 林玫 | `finance_investment.venture_capital`：风险投资。 |
| 02 佐藤健司 | `manufacturing_supply_chain.robotics`：机器人和产线自动化。 |
| 03 田中爱子 | `professional_services.startup_services`：保留已有父类，原行业为创业服务；不按社群职称擅自改父类。 |
| 04 普丽娅·拉奥 | `technology_internet.ai_data`：企业人工智能交付。 |
| 05 索菲娅·马丁内斯 | `retail_consumer.ecommerce`：跨境电商。 |
| 06 奥马尔·拉赫曼 | `technology_internet.cloud_infrastructure`：云基础设施和云迁移。 |
| 07 森花 | 原父类为社群／非营利，简介为可持续发展顾问；不足以确认社群运营、公益组织或另一父类的咨询业务，保留缺依据。 |
| 08 陈立安 | `technology_internet.enterprise_software`：企业软件。 |
| 09 艾玛·威尔逊 | `media_creative.advertising_marketing`：品牌战略与上市营销。 |
| 10 小林大地 | 只知制造业和工厂数字化，未说明设备、汽车、电子或材料等实际生产行业，保留缺依据。 |
| 11 诺拉·费舍尔 | 数字医疗工具评估未区分医疗服务、器械或健康管理；目录没有独立“数字医疗”子类，保留缺依据。 |
| 12 拉菲尔·科斯塔 | `food_hospitality.hotels_tourism`：酒店集团。 |

### 活动问卷与内联数据

`features/events/registration/contract.ts` 将 `EventParticipantProfileAnswers` 定义为8个原文字段的Partial Record；`normalizeEventParticipantAnswers` 按白名单重建对象，直接写入行业ID会被丢掉。`eventOperationsParticipantFromRegistration` 优先读取 interviewResponses，再产生参与者DTO；冻结快照读取也调用同一归一化。结构化行业的领域归属、公开资料／问卷隐私和冻结版本关系需事件领域补充契约，不能扩答案字段后声称兼容。

E2E定义有64个匹配参与者和6条已取消历史，合计70个账号；后者不是无理由遗漏，不能为补行业改变其状态。已按源码和校验条件确认数量，未执行seed。其他事件内联样本含问卷迁移、非法值与冻结哈希反例；App泛称“互联网”的资料、原父类为专业服务的设计师也需分类依据，不能批量填值把反例变成正常记录。

上述缺项只限制对应动作。32个正常投影和非个人行业来源的现有验证继续有效；跨仓库内联清单仍未完整执行，本表不代表 SC-05 通过。

## 生成器边界

`generate_relationship_mockdata` 使用当前时间，并重写 seed、generated、exports、测试反例、验证器和 generation 文档；`_write_hybrid_runtime_fixture` 另写 Web 的 `shared/mock/generated-relationship-fixtures.ts`。直接重跑会改变非行业内容，不能作为本次精确补齐手段。

建议的接续边界是：离线行业映射与投影，保留现有时间、正文、ID、权限和关系；先输出到临时目录，检查只有批准字段发生变化，再处理精确产物。未来正常生成路径同时使用同一映射规则，避免下次生成丢字段。这一生成源／产物范围仍待独立冻结，本次没有修改或执行它。

## 实际版本保护路径

已读取 Web `shared/storage/live-record-store.ts` 与 `postgres-live-record-store.ts`：现有接口只有普通 get/list/upsert/delete；upsert 的冲突更新会覆盖 payload、updated_at 等列，没有预期版本条件。因此先 get 再 upsert 不满足并发保护。

已核实可复用的现有基础设施是 `shared/storage/transactional-postgres.ts` 的 `createTransactionalPostgresClient`。它在同一连接中使用 serializable 事务，失败 rollback，最后释放连接。无需为数据维护修改所有业务 provider 或扩大通用 store 接口。

建议由原计划中的专用维护脚本使用该事务入口，对已批准的精确 workspace/collection/record/user 进行参数化条件更新，同时校验预期 updated_at 与原 payload。只改行业字段及必要版本字段；未匹配行作为冲突，不能转为无条件 upsert。关联投影应在同一事务校验与更新，有任一冲突则全部回滚；串行化失败报告冲突，重新生成并审阅差异后才能再执行。该方案尚未实现，也未经真实 PostgreSQL 验证。

维护脚本必须显式取得隔离环境与精确清单，默认只读，不能自动读取产品环境配置后连接未知数据库。单测可以检查 SQL 参数、失败传播和 rollback，但不能替代真实库的并发及回读证据。

## 尚未具备的执行条件

- `tests/support/industry-fixture-inventory.ts` 已有上述增量实现，完整正常对象盘点仍未完成；`scripts/backfill-test-secondary-industries.ts` 尚不存在，不能引用为已实现补齐工具。
- 生成源、精确输出文件、人物分类依据及条件更新方案需要独立范围审阅；不是对已批准联系人／搜索／资料接线重复审批。
- 真实环境、schema、workspace、actor、记录 ID、预期版本和写入对象未确认；本次没有连接数据库盘点、迁移或补齐。
- 真实模型验收另受累计 USD 5 上限约束；先前已结算 USD 0.012780，旧 0020 意外增量尚未核算。现有浏览器只有空白标签，没有可复用的账单登录会话。没有新增付费请求，未将增量记作零。

本页将可安全准备的内容具体化，不缩减原五项 SC，也不代表整体任务完成。
