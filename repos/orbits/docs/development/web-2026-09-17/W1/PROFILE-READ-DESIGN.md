# P：本人资料 PostgreSQL 读取下推

状态：主任务已审 W5 精确设计并批准独立五文件批次；实施基线 `f65500966051f3626fece7ed83df56ba1cc23c4a`。原 Luna/max 先 RED 后实现，W1 Astra 负责独立设计复核、验证与交接。本文件同时记录设计和最终结果，不修改既有 REPORT。

## 问题与目标

正常本人资料读取目前分别取 workspace 的全部 accounts、profiles，再在应用内按 actor 过滤和解析。本批仍执行两个 SELECT，将相同授权条件和必要字段投影下推 PostgreSQL，减少传回应用的无关记录及大字段。没有“两次变一次”的收益，不承诺数据库扫描或 CPU 有界，不新增索引、共享 API、缓存或 schema。

仅正常 `createTransactionalStorageProfileProvider().readProfileGraph` 绑定既有 client/workspace 的新 reader。configured provider 已经通过此 factory 创建，必须验证默认路径实际接上。source/sourceLabel、配置缺失与缓存语义保持。

## 事务和 fallback 边界

- `withProfileMutation` 的 `operation: store => operation(createStorageProfileProvider({ ...options, store }))` 原语义保留。reader 不放共享 options，不传入回调；读、merge、写、receipt 继续使用同一事务 store。
- `profile-mutations.ts`、`existingProfileRecord` 及 mutation 内全读不属于优化范围。用 outer client 查询抛错、transaction executor 可用的反例验证 mutation 不越出事务。
- 明确传入 memory/custom store 的 `createStorageProfileProvider` 保留原全 store 路径，成本不能记为已下推。
- SQL 查询失败向上传递；不回退全 workspace、不构造空成功。空/纯空白 actor 在 reader/store 前拒绝并零查询，合法身份不擅自 trim。

## 授权与选择语义

公共条件为参数化 workspace、对应 collection 及 `lifecycle_state <> 'deleted'`。账户条件为 `user_id = actor OR payload->'id' = to_jsonb(actor::text)`；profile 条件为 `payload->'accountId' = to_jsonb(actor::text) AND (user_id IS NULL OR user_id = actor)`。

使用 JSON equality 保持字符串严格匹配，数字、对象、数组、JSON null、缺键不能经 `->>` 字符化取得权限。不把 legacy recordId 推定为 domain id，不新增唯一性或冲突 owner 规则。

排序保持 `coalesce(occurred_at, updated_at) DESC, updated_at DESC`。不加 LIMIT、去重、新 tie-breaker、DTO-validity 过滤或 archived 排除。完全并列键原本没有稳定顺序保证，本批不宣称确定性选择。应用仍沿用原 mapper 和 `currentProfile` 的首个匹配语义。

## 窄投影

内部 read-record 只表示真实返回字段，不伪装成缺字段的完整 LiveRecord。mapper 参数可收窄，完整记录保持结构兼容。

| 数据 | 保留字段 |
| --- | --- |
| accounts payload | id、name、createdAt、updatedAt |
| profiles payload | id、accountId、displayName、birthDate、role、timezone、headline、handles、homeMarket、organization、preferredFollowUpWindow、preferredIntroChannels、preferredLanguage、relationshipGoal、targetRelationshipTypes、spokenLanguages、publicProfile、createdAt、updatedAt |
| metadata | workspace_id、collection_name、record_id、user_id、evidence_ids、created_at、updated_at、occurred_at、lifecycle_state |

handles/publicProfile 保留完整原值，不重定义嵌套结构。保留字段 JSON 类型、显式 null 与缺键区别；不提前填默认值。不返回 searchText 或无关大 payload。metadata 的 Date/string、NULL owner、NULL evidence 转换沿用原 PG adapter 语义。

先授权选行，再由原 mapper 判断 DTO 有效性。已授权但缺必需字段的记录不进 DTO，却仍参与 `latestTimestamp`；空集合仍为 epoch，不改成 SQL MAX。底层 payload 无 object 数据库约束，投影也需核实原 decoder 对已授权非对象载荷的行为，不能盲用 jsonb_each 产生新的失败或用 WHERE 静默删记录。

## 修改前证据

专属索引 `orbit-web-w1-197d` 在基线代码强制刷新，108,911 nodes / 244,983 edges / 2,085 clusters / 789 flows。精确 query/context/impact：

- createStorageProfileProvider：LOW，2 个直接消费者、4 个总影响；包含 transactional factory 及其 mutation operation。
- createTransactionalStorageProfileProvider：LOW，1 direct / 2 total；configured factory 为直接消费者。
- createConfiguredStorageProfileProvider：LOW，1 direct，为 live service factory。
- profileFromRecord：LOW，已解析 upsert 调用；latestTimestamp：LOW，已解析 readProfileGraph 调用。
- accountFromRecord 和 readProfileGraph 方法为 UNKNOWN：图谱只记录 mapper 的访问引用，未解析动态 provider 调用。源码确认 live-service 的正常 loadProfile 与 mutation 都调用 readProfileGraph，不能以零流程或 LOW 省略 CAS 和推荐回归。

完整原始证据 `/tmp/orbit-w1-profile-read-*-context.json`、`*-impact.json`、`/tmp/orbit-w1-profile-read-query.json`。保留既有大文件及流程预算盲区；最终完整 detect 另行记录。

## 隔离验证与成本口径

本任务新建 UTF8 PostgreSQL，数据目录 `/tmp/orbit-profile-cas.43igvq5u/data`，独占 socket `/tmp/orbit-profile-cas.43igvq5u`，数据库 postgres、用户 li、端口 5432，仅 Unix socket、`listen_addresses=''`。没有使用 main/其他领域服务或任何云数据库。PG parity 使用带前缀随机 schema，结束清理；连接 guard、执行命令与最终 cleanup 证据将在验收时记录。

必测双 workspace/actor、NULL/冲突 owner、legacy ID、JSON 身份类型、deleted/archived、排序、invalid 时间贡献、null/缺键/嵌套投影、evidence fallback、SQL failure 无 fallback、空 actor 零查询、默认 configured 接线、mutation 只用事务 store。既有 CAS/receipt 和本树推荐回归保留。

本树尚不含主任务新 W3 public-goal runtime；主已指定严格推荐冻结 `501ed5c869a961555975891646134f696c6b6190`（主当前已集成），明确在 P 冻结后由主独立集成执行 `tests/services/public-goal-recommendations-runtime.test.ts` 与 `public-goal-recommendations.test.ts`。本域不迁移/重置树，不把旧推荐测试冒称新 W3 runtime 验收。

成本在 10/100/1000 个无关 actor 的隔离数据下分别记录旧路径与新路径两次 SQL 的返回行数、JSON 字节估计、EXPLAIN ANALYZE BUFFERS 实际计划及时间。JSON 字节不是网络协议或账单计量；单次本地耗时不能推导云环境加速比。保留 nested payload 或同 actor 多记录仍可能较大，查询数及扫描上界不因本批改变。

## 独立成本实验

Astra 使用同一真实 PG schema、相同输入，比较原 store provider 与 transactional provider 正常读取，逐档 `graph deepEqual`。fixture 每个 actor 各一个 account/profile，带 8,192 字节无关 payload 和 1,300 字节 search text。每档新旧均为两个 SELECT，记录的是返回 JSON 序列化字节，不是线上传输计量。

| 无关 actor | 旧返回行 | 新返回行 | 旧 JSON 字节 | 新 JSON 字节 | 旧读取耗时 ms | 新读取耗时 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 22 | 2 | 227,175 | 1,053 | 4.010 | 1.266 |
| 100 | 202 | 2 | 2,086,855 | 1,053 | 12.061 | 0.918 |
| 1000 | 2002 | 2 | 20,692,565 | 1,053 | 104.566 | 3.084 |

原始 SQL、参数、逐查询计数、完整 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 保存于 `/tmp/orbit-w1-profile-read-cost.json`，脚本为 `/tmp/orbit-w1-profile-read-proof/cost.ts`。随机成本 schema 已删除并验证不存在。

执行计划也说明限制：10 档双方均 Seq Scan；100 档新 account 仍 Seq Scan、新 profile 使用既有 private-owner bitmap 索引；1000 档新 account 的既有 occurred-at bitmap 扫描返回 1001 个候选再过滤 1000 条，新 profile 使用既有 private-owner bitmap。1000 档新 account 的服务端执行时间 1.705 ms，旧 account 为 1.186 ms，因此不宣称所有 SQL 更快或数据库扫描成本固定。上述单次本地端到端耗时主要体现传回、解码与过滤的数据量变化。

## 最终验收

### 行为 RED / GREEN

Astra 在生产代码零 diff 时编写 `/tmp/orbit-w1-profile-read-proof/outer-reader.test.ts`，直接调用既有两个 factory：普通 PG 两 SQL 必须绑定包含首尾空格的原始 actor、剔除 search text；custom store 空白 actor 必须在两个 list 之前拒绝。基线两项都因既有行为不符而失败（`/tmp/orbit-w1-profile-read-outer-red.log`），实现后同一测试不变、2/2 GREEN（`/tmp/orbit-w1-profile-read-outer-green.log`）。这是行为证据，不是新模块缺失引起的编译失败。

Luna 另有 `/tmp/orbit-w1-profile-read-red.log`：包含两项既有 factory 行为失败和新 reader 模块缺失，六个 PG 用例当时因未提供 socket 跳过；模块缺失和 skip 不计作语义 RED 或通过。

### 既有回归

`/tmp/orbit-w1-profile-read-regression.log`：59/59，零失败、零跳过。含 profile live store、14 项实际 PG CAS/receipt、onboarding policy、private birth date、ink signals、self-profile reader、agent self-profile tool/trace、event value/live/canonical recommendation、app agent event recommendations。另有实施前 `/tmp/orbit-w1-profile-read-baseline.log` 21/21、零跳过，仅用于证明既有基线。

执行均使用 `env -i PATH="$PATH" HOME="$HOME" USER=li LC_ALL=C ORBIT_PROFILE_TEST_SOCKET_DIR=/tmp/orbit-profile-cas.43igvq5u`，无云数据库、模型或 OCR 调用。

新增两文件 11/11 实际执行、零跳过；Astra 将独立两个既有 API proof 一并运行后为 13/13（`/tmp/orbit-w1-profile-read-final-green.log`），Luna 自测记录为 `/tmp/orbit-w1-profile-read-final-tests.log`。主语义 fixture 对原 store 与新 provider 做完整 graph deepEqual，并通过 live service 对比当前 profile；包含 actor/workspace 隔离、NULL/冲突 owner、legacy id、archived/deleted、授权后无效 DTO 的时间贡献。数字 123 与字符串 "123"、对象/数组实际 PG 文本化 actor 反例均验证不会把 JSON 类型转换成身份。user_id 授权的根数字/数组记录保留并参与 generatedAt，再由原 mapper 丢弃无效 DTO。

投影验证完整嵌套数据、显式 null 和缺键区别、不传无关大字段；查询失败原错误向上传递且只发既定两个 SQL。默认 process.env 配置路径实际连接本任务随机 schema，验证 provider cache 命中及真实两个 actor SQL、不读 search_text。外层 query 故意抛错时，mutation 仍在 transaction executor 内成功保存，重开可读；原 CAS/receipt 回归也通过。

四个代码/测试文件已冻结，Astra 实际 SHA256 与 Luna 交接值一致：reader `08e717fda3efbb43784c059d90397257d7a4d7d8d3246ae9360c4f7f3120435e`；provider `6c39e43d628164eeb1f3e0db4071b0f1d480d21d7d61c85cb4300a5dc21d1355`；reader tests `f46d3675495e4f82808f969d1c4214810b5f0b4f14ea5f8bd038855b09b54a5b`；parity tests `12d243f5a605311408a4ef00704d74c6bc72db9b11ad017ffa2ba73b8638a7fa`。

Astra 独立完整 `npm run typecheck`（`tsc --noEmit --incremental false -p tsconfig.json`）退出 0，日志 `/tmp/orbit-w1-profile-read-final-typecheck.log`。最终 `git diff --check` 通过。生产 diff 仅普通读接线与 mapper 输入类型收窄、空 actor guard；`existingProfileRecord`、upsert body、mutation callback 及 `profile-mutations.ts` 未改。

PG 结束检查非系统 schema 仅 `public`，所有随机 parity/CAS/cost schema 均已删除；`pg_ctl -D /tmp/orbit-profile-cas.43igvq5u/data stop -m fast` 成功，`/tmp/orbit-w1-profile-read-pg-cleanup.log` 显示 server stopped。

最终 force index 成功：109,090 nodes / 245,276 edges / 2,087 clusters / 789 flows。完整未截断 raw 为 `/tmp/orbit-w1-profile-read-detect-incremental.json` 与 `-combined.json`；本批 **5 差异文件 / 179 符号 / 0 流程 / LOW**，五个路径全部映射。累计相对 `161e9e6c4d1f314db90365a4d840718adfa12c70` 为 **21 差异文件 / 673 符号 / 5 流程 / MEDIUM**，映射 20 文件。完整 diff/mapped/unmapped 路径数组及 ID 唯一性检查保存在 `/tmp/orbit-w1-profile-read-detect-audit.json`。本批精确集合为本报告、`features/profile/storage/profile-actor-postgres-reader.ts`、`features/profile/storage/profile-live-record-provider.ts`、`tests/storage/profile-actor-postgres-reader.test.ts`、`tests/capabilities/profile-actor-postgres-parity.test.ts`，没有额外映射路径。

逐条读取本批 179 个 symbol UID；累计 673 记录逐字段验证为此前已审 494 记录与本批 179 的精确并集，旧 494 记录全部未变。changed/flow ID 非空唯一、路径非空，数组与 summary 一致，raw 无 error/partial/truncated。五条流程全部 26 步的精确 UID 再次读取于 `/tmp/orbit-w1-profile-read-final-processes.json`：三条既有 next 规范化链、两条既有 crypto digest/update 同名误连，与旧冻结结果相同。

累计唯一 unmapped 文件仍为旧 `tests/pages/app-profile-live-route-services.test.ts`，精确查询 `/tmp/orbit-w1-profile-read-final-file-coverage.json` 返回 File（null range）+ 22 实体，0-based 范围 15–74、235–255；旧改动 hunk 未落到这些实体，未为映射率重写测试。本批两个新测试文件虽有节点，也不表示每个匿名测试都有独立节点。

图谱覆盖限制仍存在：14 个大文件跳过，9,549/9,749 候选入口未枚举，8,766 callees 丢弃，61 次遍历受预算截断；本批 LOW/0 flows 不意味着动态 provider 没有消费者。正常读取与事务隔离结论依据源码边界、实际 PG 和 CAS 测试，不能从图谱零流程推导安全。

提交仅包含上述五文件，父提交 `f65500966051f3626fece7ed83df56ba1cc23c4a`；最终 SHA 随提交后的主任务交接提供。主整合时仍须执行冻结 W3 `501ed5c869a961555975891646134f696c6b6190` 对应的新 strict recommendation runtime 22 项及 CAS 门；本域未声称这些未在本树出现的新版用例已通过。Web 读契约形状未变，未修改 App/共享 schema/API，也未部署。
