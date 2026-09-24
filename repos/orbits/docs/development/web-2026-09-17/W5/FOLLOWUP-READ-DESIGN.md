# W5 F：首页关系跟进窄读取

## 批准边界与基线

专属树基线 `49b944f3dddb48287400435fb4cd23f3e2efd553`。只实现尚未接 UI 的 home facts 默认 followup reader；不修改 P、B1、通用 followup provider、共享契约、API、signals、worker、App 或三个 Agent UI。W4 写锁尚未释放，后续主批准接线方可修改。

本批精确六文件：

- `features/followups/storage/relationship-lifecycle-facts-reader.ts`（新增）。
- `app/(app)/app/tasks/relationship-lifecycle-tasks.ts`。
- `app/(app)/app/agent/home-facts-route-service.ts`。
- `tests/pages/app-home-facts-followup-reader.test.ts`（新增）。
- `tests/services/relationship-lifecycle-facts-reader-postgres.test.ts`（新增）。
- 本文（新增）。

## 入口与失败语义

home 的默认 followup loader 显式创建 configured facts reader，传入 `loadRelationshipLifecycleTasks({ actorId, reader })`。已有 `followupLoader` 注入保持。loader 未传 reader 时完全保留现有 provider 默认路径，`/app/tasks`、其 provider/API/signals 不切换。

`reader` 与 `provider` 不得同时指定（含 null）；类型与运行时均保护。显式 reader:null、不支持的 reader、缺配置、查询拒绝或结果无法验证均 unavailable，home count=null，不降级 fullgraph。空 actor 在任何 factory 前返回，零查询。loader 原有 `.trim()` 不变；reader 接受 loader 已验证身份，SQL 用原样参数，不另创大小写或 trim 政策。

reader 输出真正窄的 `{tasks, contacts, connections}`，不伪造 evidence/generatedAt。mapper 只放宽参数类型为所需字段子集，分类、排序、href 算法不改。href 仍使用 `contact.id`，不混同 storage recordId。

## 单 statement 授权与投影

同一 SQL statement 使用参数化 workspace/actor，所有来源 `lifecycle_state <> 'deleted'`。身份比较保留 JS 严格字符串相等：`user_id = $2` 或 JSON 字符串 `payload->'accountId' = to_jsonb($2::text)`；domain join 须限定 JSON 字符串类型并用 JSON equality，不用 `->>` 把 numeric/object 转为字符串授权。

1. T：该 workspace actor-owned tasks，全部状态，不按日期/status/LIMIT 截断。任务归属沿用 userId OR payload.accountId。
2. A：该 workspace **完整** actor-owned connections，仅作为授权与 C 提取依据。
3. C：T.connectionId 引用的 A，匹配 payload.id，而非 record_id。
4. H：T.contactId 或 C.contactId 所需 contacts；且 contact.user_id=actor 或存在 A.contactId 严格匹配该 contact.payload.id。授权 A 不能缩到 C。task-only 引用及 contact.payload.accountId 不能授权。

采用去重 domain key 集合与 hash semi-join，避免每条 contact 上相关子查询反复扫描 A；`IN` 半连接的 nullable predicate 以 `coalesce((... IN ...), false)` 固定为布尔值，避免 planner flatten 成重复 NestedLoop。不得仅凭返回数据小声称计算有界；以真实 EXPLAIN ANALYZE 检查 loops/扫描量。

返回 tagged rows，投影字段：

| 来源 | payload 字段 |
| --- | --- |
| T | id、title、status、contactId、connectionId、dueAt、source、evidenceIds、createdAt、updatedAt；accountId 仅作归属核验 |
| C | id、accountId、contactId、stage、summary、source、evidenceIds、createdAt、updatedAt |
| H | id、displayName、organization、stage、source、evidenceIds、createdAt、updatedAt |

source 仅保留原始 type/id/label，不能把缺失或非法 source 构造为有效值。附带核验所需 kind、workspace、recordId、userId、lifecycleState 与排序时间 metadata；可以返回 SQL 计算的授权/引用布尔证明，必须严格验证形状，不携带无关连接私有 payload。无 evidence collection、联系人电话/邮箱/notes/profileSnippet/detail/searchText。记录顺序保持既有 `coalesce(occurred_at, updated_at) desc, updated_at desc`，最终展示继续既有 dueAt/id 排序。

## 解析、完整性与重复身份

沿用旧 provider 有效性：非空字符串以 trim 判空但返回原值；合法 source type+非空 id；payload evidenceIds 至少一个非空字符串；createdAt/updatedAt 非空。T 额外要求 id/title/四种合法 status；C 要求 id/accountId/contactId/summary/合法 stage；H 要求 id/displayName/合法 stage。optionalString 仍返回原字符串。无效业务记录按旧 decoder 丢弃，不能因缩小 projection 使旧无效记录变有效。无权或无效关联令有效任务进入 orphan，这是已批准安全差异。

SQL envelope/类型/作用域/授权证明无法核验则整源失败，不能空集成功。raw SQL 行必须保留全部投影键（包括可为 null 的可选字段与 `source.label`）；已经归一化的 custom reader 走独立窄契约，允许可选字段缺省，但字段存在而类型/值非法时整源失败，不能过滤成 empty。新路径在 mapper 的 Map 之前检查 domain identity：多个存储记录映射同一有效 domain ID 且窄事实冲突时整源失败；完全等价 task 记录全部保留，等价 connection/contact 选稳定的最小 `metadata.recordId`，不任意 last-wins。旧 provider 路径不追加此策略。

## 默认 PG、custom、事务与成本

configured factory 复用 `createConfiguredPostgresLiveRecordStore()` 已有 client/workspace；不另建专用池，复用 configured factory，其 cache miss 仍由既有 factory 建池；不关闭共享 client，不新增缓存。memory/custom 可以显式提供满足窄 reader 契约的 reader；仅有 fullgraph provider 的旧使用者保留原调用，不把它作为 home fallback。没有 SQL/client 能力的 home 为 unavailable。

一个 statement 一个数据库读取视图；不声称多来源事务 snapshot，也不触碰 mutation 事务。新聚合逻辑从 `12+R` 到 `9+R`（followups 4→1），不含 auth、旧 home，也不把 promise memo 算减少查询。P 已由主协调收口但仍为两次 SQL；旧 home 的重复读取另计，不并入 F reader 的 statement 成本。T 的 actor 历史量、A 授权连接量、数据库 workspace 扫描和 R 的 recurrence 仍有成本。每源展示 3 项不是 SQL 上限；无 schema/index/cache 改动。

PG 成本门只约束本测试 fixture，不是任意生产规模的 CPU 常量承诺：foreign-growth 与 actor-association-growth 均在每个 `N ∈ {10,100,1000}` 新 schema/新表上运行，分别在未 `ANALYZE` 与显式 `ANALYZE orbit_records` 后执行 `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)`。测试递归遍历 plan node，记录每节点 `(Actual Rows + Rows Removed by Filter + Rows Removed by Join Filter) * Actual Loops`，总 work 必须 `≤ N*100+1000`；同时记录 raw row 数、`JSON.stringify(envelope)` bytes、reader query 次数、reader elapsed time、Planning/Execution Time 与完整两份 JSON plan。foreign 组要求固定 actor 的 T/C/H payload 与 bytes 不随无权数据增长，association 组独立放大 actor 自有 T/C/H 关联，专门暴露 O(N²)。

## TDD 与真实 PG 验收矩阵

先失败后通过，记录精确命令。覆盖：home 默认真实绑定且不调用旧 readFollowupGraph；reader/provider 互斥、null、缺配置、抛错、错误 envelope/重复冲突、空 actor 零 factory/query；四状态分类与正常有效 fixture 的 legacy parity；旧 /app/tasks 默认/显式 provider 不变；不伪造 graph。

授权覆盖 userId、NULL userId+字符串 accountId、两者冲突时既有 OR、空 actor、保留 trim、数字/对象/数组/null JSON 不授权、storage/domain 分离、task-only/contact accountId 拒绝、非 C 的 actor connection 授权、删除态/跨 workspace 拒绝、无效 T/C/H/source/evidence/date 字段及 orphan、重复 domain 身份冲突。必须对 SQL 原始返回断言无未授权/无关 payload，不仅对最终 mapper 断言。

PG 只用本任务新建 UTF8 本地实例及随机 schema，显式 loopback/数据库名/随机 schema guard 和 finally 清理，不读任何 .env、不连接其他域/main/云库。记录 10/100/1000 其他 actor 数据的真实 rows、JSON bytes（非 wire bytes）、query 次数、EXPLAIN ANALYZE loops/扫描、planning/execution/time；同时放大 actor 自己授权关联以暴露相关 CTE O(N²)。fixture 建表复用既有 schema，不新增产品迁移或索引。

回归包含原 home route/VM、web-tasks-relationship-lifecycle，Tokyo/LA 与 full types。运行时 fetch 禁止；不启动 Web/UI、不读生产配置。

## 图谱与合入门

编码前本树索引已刷新至 49b944，FTS disabled，使用绝对 repo + exact context/impact，并核对源码。loader/mapper/helpers LOW；options MEDIUM；通用 provider CRITICAL（10 impacted，含 signals/通知/API），后者不改。图谱缺 home 函数引用边，源码补证；新 reader UNKNOWN，不能作无影响结论。builder 的 callable/flow 上限仍保留，提交前完整 raw detect 不能取代该限制说明。

B1 尚未冻结，本地实现不依赖其未提交源码。基线 contact-scope helper 支持 contact owner OR actor-owned connection；可选 ID 是 storage recordId，不能拿 task domain ID 直接调用。其旧 ->> 比较会 coercion，F 使用已批准严格 JSON。合入前必须按 B1 冻结授权变化交叉核对；差异报主，不自动改 B1 或扩通用 provider。

UI 接线、W4 frozen owner gate、W3 recommendation/runtime rawSubject/account 分离与 failure→[] 核查均属后续，未纳入本批。App 无共享契约/API 变化，不宣称跨端业务已验。

## 实跑结果

- TDD 首轮 RED：缺少新 reader 模块时，`env -i ... node --import tsx --test tests/pages/app-home-facts-followup-reader.test.ts` 以 `MODULE_NOT_FOUND` 失败；controller 保留原始日志 `/tmp/orbit-w5-f-pg.hac7Yv/red-unit.log`。
- 本 worker 的 clean-env unit 在 raw/normalized、default binding、重复身份与 mapper parity 修正后通过；完整命令与计数以最终交接报告为准，不把 unit 结果当作 PG 成本通过。
- 本 worker 以指定 `ORBIT_W5_F_TEST_DATABASE_URL` 通过 `run-check.mjs` 尝试 PG 时，沙箱对 `127.0.0.1:56149` 返回 `EPERM`，未取得本地 SQL/EXPLAIN 结果；禁止用该阻断伪造 GREEN。controller 需在专属实例上运行上述两组冷 fixture。此前 controller 提供的病态 SQL 独立 plan 已测得 N=1000 work `2027003`，这正是线性门的 RED 证据；prototype plan 的 `284/2804/28004` 仅是修法实验，不代表产品已通过。
- controller 独立 PG second 已记录 `8/8`、`0 skip`，日志为 `/tmp/orbit-w5-f-pg.hac7Yv/pg-second.log`；默认绑定链 GREEN 日志为 `/tmp/orbit-w5-f-pg.hac7Yv/default-chain-green.log`（脚本 `/tmp/orbit-w5-f-pg.hac7Yv/probe-default.cjs`）。这些是 controller 证据，不替代本 worker 的 PG 运行。
- controller 独立最终验证记录 Tokyo `51/51`、LA `51/51`、fulltypes `0` 错误、default PG 链路成功（facts 1 query、旧 tasks 4 queries）；日志为 `/tmp/orbit-w5-f-pg.hac7Yv/tokyo-final.log`、`/tmp/orbit-w5-f-pg.hac7Yv/la-final.log`、`/tmp/orbit-w5-f-pg.hac7Yv/types-final.log`、`/tmp/orbit-w5-f-pg.hac7Yv/default-final.log`。上一轮 `pg-final.log` 为 `8/9`，唯一失败是 invalid connection fixture 的合法联系人预期漏列 `contact:invalid-connection:9`；原 Luna 仅补预期，未为测试修改 SQL/授权。
- controller 最终重新运行完整 PG 文件，`pg-verified.log` 为 `9/9`、零 skip；原始日志含全部冷/ANALYZE 后 EXPLAIN JSON，SHA256 `bded2ca928fadf8962841c70b3a8b5047517b7b6f959d9ff9c245b79ab1f40be`。摘要为 `/tmp/orbit-w5-f-pg.hac7Yv/pg-verified.summary.json`。对应 reader 源文件 SHA256 `c8da1f0b60dee9f5b33a79ef2c485b53ba44f883225ccb991145c29a7b46f8e3`。
- 默认链路 RED→GREEN 见 `default-chain-review.log`、`default-chain-green.log`；NULL-owner SQL RED→GREEN 见 `null-owner-red.log`、`null-owner-green.log`，均在上述临时目录。手工 `actorOwned:null` 仍被拒绝，真实 SQL 产出 `false` + `connectionAuthorized:true`。`invariants-final.log` 独立确认旧五个 mapper/helper 函数体及 legacy provider 执行分支与基线逐字相同。

最终 fixture 数据（work 为递归节点行访问代理量，不是 CPU 或数据库总操作上界；bytes 为 envelope JSON 字节，不是 wire bytes）：

| N | foreign JSON bytes | foreign work 冷/ANALYZE | NULL-owner 自有关联 JSON bytes | 自有关联 work 冷/ANALYZE | 自有关联执行 ms 冷/ANALYZE |
| --- | --- | --- | --- | --- | --- |
| 10 | 3586 | 83 / 155 | 21934 | 294 / 354 | 0.705 / 0.626 |
| 100 | 3586 | 353 / 664 | 220504 | 2904 / 3504 | 5.722 / 5.586 |
| 1000 | 3586 | 3053 / 6061 | 2227804 | 29004 / 33004 | 65.585 / 60.557 |

两组均恰好一条 reader SQL、一个 envelope；foreign 内含 T/C/H=2/1/2，自有关联各 N 条。全部 plan node 最大 Actual Loops=1；foreign N=1000 最大 RowsRemoved×Loops=1000，未出现相关 CTE 的百万次扫描。实际耗时会受机器负载影响。自有关联 N=1000 的 reader wall time 为111ms，不能只引用 SQL execution 时间代表整个读取/解析成本。

复验命令（cwd=`repos/orbits`；本地 PG URL 由复验者提供，必须通过测试内 loopback/数据库/schema guard；不读 `.env`）：

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin TZ=Asia/Tokyo NODE_OPTIONS=--require=/tmp/orbit-w5-f-pg.hac7Yv/no-fetch.cjs node --import tsx --test tests/pages/app-home-facts-followup-reader.test.ts tests/pages/app-home-facts-route-service.test.ts tests/pages/app-home-facts-view-model.test.ts tests/pages/web-tasks-relationship-lifecycle.test.tsx
# 同一命令改 TZ=America/Los_Angeles，51/51。
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node node_modules/typescript/bin/tsc --noEmit --incremental false
# 在同一 clean-env 中显式传入 ORBIT_W5_F_TEST_DATABASE_URL，再执行：
node --import tsx --test tests/services/relationship-lifecycle-facts-reader-postgres.test.ts
```

未启动 UI/server、未 build/deploy、未读生产或其他域数据库；未验证 App 业务、B1 冻结版授权差异或完整首页接线成本。原 Luna 实际模型为 `gpt-5.6-luna`、reasoning effort `max`，同一子 ID `01a0af7e-7221-7f03-852b-756c85c95b4f`；上述 PG 与跨时区/类型/不变式证据由 controller 独立运行。
