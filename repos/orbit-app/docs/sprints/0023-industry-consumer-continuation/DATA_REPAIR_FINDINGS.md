# 测试数据补齐：已核实入口与剩余边界

2026-09-14 只读核查；这是原 SC-05 的接续准备，不是补齐成功报告，也不授权数据库操作。完整对象范围仍以 [0020 DATA_SCOPE](../0020-secondary-industries-self-profile/DATA_SCOPE.md)为准。

## 源数据与关联

已解析现有 JSON，没有导入或运行生成器：

| 集合 | 记录数 | 已核实关联 |
| --- | --- | --- |
| `repos/mockdata/seed/users.seed.json` | 132 | 全部具有 company_id，关联 90 个公司 ID |
| `repos/mockdata/seed/contacts.seed.json` | 132 | user_id 全部能在 users 中找到 |
| `repos/mockdata/seed/event_participants.seed.json` | 500 | user_id 全部能在 users 中找到 |

以上不是 764 个独立人物。三个 `generated/*.generated.json` 及两个 `exports/local_seed.json`、`exports/demo_seed.json` 中对应集合是关联投影，必须分别核对，不相加作为唯一人数。上述关联检查尚不证明所有投影逐字段一致。

用户和联系人没有结构化行业 ID。生成器 `harness/relationship_data_goal_runner.py` 在 `generate_relationship_mockdata` 内构造公司，并为公司分配 10 类旧行业；随后构造用户时仅保留 company_id 与公司名称等字段，没有传递行业。公司数组没有作为独立 seed 或 export 集合保存，因此不能声称已从现有 companies.seed.json 读到了行业事实。

旧类别为 restaurant_inbound、ai_saas、manufacturing_dx、cross_border_ecommerce、venture_capital、community_events、retail_omnichannel、legal_accounting、tourism_hospitality、education_training。部分语义不能唯一确定二级 ID，例如 legal_accounting 同时包含法律和财税。不能按公司 ID 数字或数组位置轮换新子类，不能把需求中的行业当作本人的行业，也不能把所有歧义对象统一填为“其他”来通过检查。

下一步分类清单需为每个正常人物列出稳定 ID、确认的父子 ID、来源依据和关联投影；没有唯一依据的对象明确计入“缺依据”，不能算补齐成功。要补齐全部正常对象，须先审阅这部分映射。14 个一级和 79 个二级的覆盖仍由完整测试范围承担，不虚构这 132 人已覆盖全部目录。

## 生成器边界

`generate_relationship_mockdata` 使用当前时间，并重写 seed、generated、exports、测试反例、验证器和 generation 文档；`_write_hybrid_runtime_fixture` 另写 Web 的 `shared/mock/generated-relationship-fixtures.ts`。直接重跑会改变非行业内容，不能作为本次精确补齐手段。

建议的接续边界是：离线行业映射与投影，保留现有时间、正文、ID、权限和关系；先输出到临时目录，检查只有批准字段发生变化，再处理精确产物。未来正常生成路径同时使用同一映射规则，避免下次生成丢字段。这一生成源／产物范围仍待独立冻结，本次没有修改或执行它。

## 实际版本保护路径

已读取 Web `shared/storage/live-record-store.ts` 与 `postgres-live-record-store.ts`：现有接口只有普通 get/list/upsert/delete；upsert 的冲突更新会覆盖 payload、updated_at 等列，没有预期版本条件。因此先 get 再 upsert 不满足并发保护。

已核实可复用的现有基础设施是 `shared/storage/transactional-postgres.ts` 的 `createTransactionalPostgresClient`。它在同一连接中使用 serializable 事务，失败 rollback，最后释放连接。无需为数据维护修改所有业务 provider 或扩大通用 store 接口。

建议由原计划中的专用维护脚本使用该事务入口，对已批准的精确 workspace/collection/record/user 进行参数化条件更新，同时校验预期 updated_at 与原 payload。只改行业字段及必要版本字段；未匹配行作为冲突，不能转为无条件 upsert。关联投影应在同一事务校验与更新，有任一冲突则全部回滚；串行化失败报告冲突，重新生成并审阅差异后才能再执行。该方案尚未实现，也未经真实 PostgreSQL 验证。

维护脚本必须显式取得隔离环境与精确清单，默认只读，不能自动读取产品环境配置后连接未知数据库。单测可以检查 SQL 参数、失败传播和 rollback，但不能替代真实库的并发及回读证据。

## 尚未具备的执行条件

- 原计划中的 `tests/support/industry-fixture-inventory.ts` 和 `scripts/backfill-test-secondary-industries.ts` 尚不存在，不能引用为已实现工具。
- 生成源、精确输出文件、人物分类依据及条件更新方案需要独立范围审阅；不是对已批准联系人／搜索／资料接线重复审批。
- 真实环境、schema、workspace、actor、记录 ID、预期版本和写入对象未确认；本次没有连接数据库盘点、迁移或补齐。
- 真实模型验收另受累计 USD 5 上限约束；先前已结算 USD 0.012780，旧 0020 意外增量尚未核算。现有浏览器只有空白标签，没有可复用的账单登录会话。没有新增付费请求，未将增量记作零。

本页将可安全准备的内容具体化，不缩减原五项 SC，也不代表整体任务完成。
