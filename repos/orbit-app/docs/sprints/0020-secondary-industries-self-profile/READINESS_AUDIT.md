# 0020 源码与测试数据入口核查

2026-09-14，产品基线 `df824de70`。本页是启动前核查，不是 Generator 报告、目录实现或测试库补齐结果。

## 已核清的目录与同步条件

- 以 INDUSTRY_CATALOG.md 的表格行对照 Web `shared/domain/industries.ts` 的 INDUSTRY_IDS：14 个父类、79 个唯一子 ID、父类全部合法、每个父类都有明确 other。数量与已批准目录一致。
- 每父类子项数依次为：餐饮 6、科技 6、金融 7、专业服务 6、制造 7、零售 6、贸易 6、房地产 6、医疗 6、教育 6、传媒 6、社群 5、政府 5、其他 1。缺失值仍不能自动映射 other。
- 当前字典仅有一级目录、isIndustryIdCode、industryLabel；二级 helper 尚未实现。目录正确不等于新能力已存在。
- App `scripts/sync-contract.mjs` 已同步全部 shared/contract 类型、shared/api-schema，以及 domain 的 industries.ts／language.ts 两个文件。现有通道足够，不需要新增跨仓库运行时 import 或扩大 domain 白名单。
- 同步命令会重建目标目录，因此提供方变化后才运行；本次只运行在临时隔离目录验证该脚本的既有测试，没有执行产品目录同步。
- Web 规则要求共享契约无 import，而当前 industries.ts／profile.ts 实际含相邻类型 import；这是既有约定与代码的冲突。新增类型按无 import 规则编写，必要语言键使用内联类型并经现有 ContractMatches 验证；不以本 Sprint 名义批量清理其他契约文件。

## 资料字段实际写入链

`app/api/profile/handlers.ts` 的 GET／PUT 从认证上下文取得 actor，调用 profile service；`features/profile/live-service.ts` 的 mergeProfile 重建 publicProfile，`storage/profile-live-record-provider.ts` 再标准化读回。二级字段必须同时接入这几处，否则前端发出字段也可能在合并／回读时丢失。

App 的 `src/api/profile-detail-contract.ts` 是本地响应校验，不是自动生成副本；选择、保存回执和字段解析都要补齐。其现有回执比较每个请求字段与响应值，不能只加入下拉框。

0020 保留行业原文，新增父子 ID；不改变注册门槛。0003 应另用服务端注册完成判定，不能把当前六项 completeness 分数当行业是否填写的权威来源。

## 数据入口与副作用分类

| 入口 | 已核事实 | 后续允许的做法 |
| --- | --- | --- |
| Web `shared/mock/fixtures.ts`、`shared/mock/generated-relationship-fixtures.ts` | 共享集合／生成对象的来源 | 从集合注册及稳定源 ID 枚举人物对象，再追踪投影；不是逐文件搜索即完成覆盖。 |
| Web `features/profile/fixtures.ts` | 正常、空、pending、失败及编辑输入；正常 mockManualProfile 当前没有结构化行业 | 正常资料补有效分类；空／失败反例保留并登记，不把所有空值都当漏补。 |
| Web `features/contacts/fixtures.ts`、`detail-fixtures.ts` | 列表与详情各有来源和派生对象；详情含旧行业原文 | 按同一人物源 ID 统一映射，保留旧原文，不让列表／详情各自选分类。 |
| Web `shared/ai/mock-fixtures.ts` | AI provider 输出／来源夹具，不是所有对象都有人物行业语义 | 只核对确实携带人物资料的产物；不为工具运行记录硬塞行业。 |
| Web `shared/storage/seed-generated-fixtures.ts` | 从 defaultMockFixtures 集合生成记录；写入函数接受显式 store | 覆盖测试注入内存 store；不调用配置好的业务数据库。 |
| Web `scripts/seed-account-contact-fixtures.ts`、`seed-account-agent-pressure-fixtures.ts` | 文件末尾执行 main，含真实 upsert | 不直接 import 或执行来盘点；实现时提取纯数据定义后用隔离测试调用。 |
| Web `scripts/seed-event-operations-e2e.ts` | 顶层 main，会读取数据库和测试密码相关配置 | 不执行；只读追踪其数据定义，写入范围另审。 |
| Web `scripts/seed-primary-test-account.ts` | 顶层 main，会加载环境、运行 records migration、创建／更新账号并调用其他 seed | 不能当成只读检查或普通测试运行；本次没有执行、读取凭证或连接数据库。 |

### 可复现的候选文件扫描

Web cwd：

```sh
rg -l --glob '*.ts' --glob '*.tsx' '\b(primaryIndustryId|industry)\b' shared/mock shared/ai features scripts tests
```

得到 117 个候选文件，其中 tests 下 66 个，其余为源数据、服务、投影或脚本。App cwd 对 tests 用相同表达式得到 28 个候选文件。这个口径与旧 DATA_SCOPE 的人物类型／行业联合搜索不同，不能解释为旧数据减少或覆盖已完成。

关键反例：profile 的正常 fixture 尚无 industry 字段，因此单纯关键词扫描也会漏掉必须补齐的对象。实施期必须沿类型、集合、构造器和导入链补完可执行 inventory；本页不把候选文件数当记录数，不声称清单分母已经冻结。

## 本次验证

| 检查 | 结果 | 能证明什么 |
| --- | --- | --- |
| 目录表格与现有父类 ID 静态断言 | 14／79、唯一性、父类和 other 均通过 | 已批准分类文本可接现有父类；未验证新代码。 |
| Web `node --test --import tsx tests/services/industry-taxonomy.test.ts` | 3 pass，0 fail／skip | 当前一级字典基线。 |
| App `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/domain-sync.test.ts tests/account-auth-view-model.test.ts tests/mobile-profile-view-model.test.ts` | 20 pass，0 fail／skip | 当前同步、合法返回路径及身份名称基线；后两项供 0003 复用。 |

无模型、OCR、产品 HTTP、数据库读写、迁移或服务启停；未新增产品测试或产品实现。接下来可按已经写明的 Task 1 在代码方案审阅通过后开始 RED，不需要重新调查本页的目录和同步事实。

## 仍需隔离的动作

1. 代码实现：等待 PLANNER 的单选／跨端字段／检索／工具输出边界书面批准；执行指令和行业目录批准已收到，不重复索取。
2. 真实测试库补齐：等待明确环境、对象及 dry-run 后的适用写入批准；不得阻塞已获准的独立代码工作，也不能把 SC-05 降为源码测试通过。
3. 真实 AI 与双端写读：沿原账本和授权对象执行；在实际验证前核对，不因静态测试通过声称业务完成。
