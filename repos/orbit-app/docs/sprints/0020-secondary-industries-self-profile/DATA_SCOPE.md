# Sprint 0020 — 测试数据范围与补齐验收

本文件定义未来实施范围，不是已经执行的数据清单或迁移报告。用户要求覆盖“现在所有的测试数据”，不能只改新建样本。

## 哪些对象需要补齐

| 对象／来源 | 要检查的内容 | 完成要求 |
| --- | --- | --- |
| 本人资料、登录测试用户的 profile | 一级／二级选择和 AI 本人资料读取 | 正常完整样本均有有效父子 ID；不能只给默认用户补字段 |
| 联系人、networkPeople、关联人脉及名片确认后的测试对象 | 同一人物的行业事实及已有行业投影 | 以所属领域对象为来源，投影复用同一选择；不能各自生成不同分类 |
| 参会者公开资料、推荐／匹配与搜索样本 | 已包含人物行业的输入和输出 | 可区分同一级下不同二级；无行业语义的活动时间、消息等对象不硬塞字段 |
| 内联单测、API 夹具、页面 mock、测试构造器 | 正常样本、预期回执、派生视图及序列化快照 | 更新源对象并核对实际输出；不能只替换快照让测试变绿 |
| 生成数据、seed 定义与验证器 | 新建和重复执行后的内容 | 新 seed 全部符合分类；相同源 ID 保留一致行业和关系 |
| 已持久化的隔离测试环境数据 | 批准的环境、账号、集合及记录 ID | 对现有测试记录补齐并回读；只改脚本但旧测试库仍缺字段不通过 |

“所有”是上述范围内的全部正常行业承载对象，不是给所有 JSON 对象添加行业字段。真实用户数据、生产数据不属于测试数据。

## 已确认的数据入口

以下路径均相对各自子仓库。它们是读取起点，不是完整覆盖证明：

- Web：`shared/mock/fixtures.ts`、`shared/mock/generated-relationship-fixtures.ts`、`shared/ai/mock-fixtures.ts`。
- Web：`features/profile/fixtures.ts`、`features/contacts/fixtures.ts`、`features/contacts/detail-fixtures.ts`、`features/search/fixtures.ts`、`features/dashboard/distribution-fixtures.ts`、`features/recommendations/event-value-fixtures.ts`。
- Web：`scripts/seed-account-contact-fixtures.ts`、`scripts/seed-account-agent-pressure-fixtures.ts`、`scripts/seed-event-operations-e2e.ts`、`scripts/seed-primary-test-account.ts`、`shared/storage/seed-generated-fixtures.ts` 及其导入的数据构造器。
- Web：`tests/` 中直接构造或间接导入本人资料、联系人、公开资料与行业检索结果的测试。
- App：`tests/`、`tests/helpers/` 中对应资料、联系人、AI、HTTP 回执和跨页夹具；复用源对象的测试也要追踪。
- 两端供测试使用的 demo 数据、JSON 或生成文件须从实际消费者继续追踪；不能因不叫 fixtures 就排除。

编制时按人物类型名、`industry` 和 `primaryIndustryId` 的文本检索，得到 Web 84 个、App 30 个候选文件。这只是源码线索，既不是测试记录数量，也不是全量审计结果。执行时必须沿 fixture 注册表、导入链、构造器和 seed 集合补全清单。

## 必须产生的清单

实施时新增 Web `tests/support/industry-fixture-inventory.ts` 作为可执行覆盖清单，记录：

- 源文件／构造器／集合，稳定源 ID，人物关联与所属账号；
- 分类为正常、缺字段反例、旧版本反例或无行业语义；
- 正常对象的一级 ID、二级 ID、映射依据和关联投影；
- 反例所属的具体测试及必须保留缺失／非法值的原因。

覆盖测试要执行数据构造器并验证对象，不只检查文件中出现了字段名。清单中的正常对象必须全部有有效父子关系；导入或生成新样本却未登记时测试失败。若扫描发现遗漏，先补清单，不缩小分母。现有测试反例不是未解释的 skip。

带顶层 main、自动读取环境或数据库写入的 seed 脚本不能直接 import 来盘点。先把该脚本的纯测试数据定义提取到可安全导入的模块，保留原 CLI 行为；覆盖测试只调用纯构造器或注入内存存储，不连接业务数据库。测试环境未确认前不执行现有 seed 命令。

至少覆盖全部一级类别、同父不同子的区分、每个二级 ID 的字典有效性，以及本人资料与测试联系人相互不同的情况。不得把全部数据一律填成“其他”以通过覆盖检查。

## 隔离测试库补齐流程

1. 先盘点实际测试环境及 fixture 所有者，列出明确环境、workspace、actor、集合、记录 ID 与预期版本。不能按邮箱后缀或名称模糊猜测哪些是真实数据。
2. 生成只读 dry-run 差异：已符合、可按确认映射补齐、已有冲突、缺少依据四类分别计数，记录关联对象总数；不运行带隐式初始化或迁移的旧 seed 入口。
3. 对 dry-run 中的精确测试对象及字段取得适用批准，再通过受控服务／测试维护脚本更新；只写行业字段，不改姓名、正文、ID、权限或关系，不删除／重建整个 fixture 集合。
4. 使用版本检查避免覆盖期间的新修改；已有人为确认的分类不自动覆盖。失败逐项记录，重跑保持幂等，并保留可恢复的原行业值。
5. 实际回读验证所有正常目标及其投影，证明 `已符合 + 成功补齐 = 本次获准正常目标总数`，且未解决冲突、遗漏和失败均为 0。反例另计。
6. 无隔离环境或写入批准时，该项保持 blocked，整个 Sprint 不能称 completed；代码和夹具文件通过不替代旧测试库验收。

本次编制不运行上述任何写入或 dry-run；不读取凭证、不迁移数据库。执行证据按 Sprint 规则保存，报告只放脱敏结果。

[返回验收契约](PLANNER.md)
