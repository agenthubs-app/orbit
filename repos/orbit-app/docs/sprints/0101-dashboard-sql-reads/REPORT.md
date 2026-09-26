# Sprint 0101 执行报告：看板改为数据库算（看板 D1）

**run-01**。Generator 为子代理，协调者代存报告。分支 `sprint/0101-dashboard-sql-reads`，功能提交为 `1cd605835`，未推送。Planner SHA256 为 `cf6e6e50…`。
**状态：completed**（协调者复核见最后一节）。

## 1. 结论

- **看板接口 `GET /api/dashboard`**：现在只执行一条 SQL，结果是一行，里面有：
  - 各种总数；
  - 4 个短列表，各取前 5 条；
  - 最近动态，最多 5 条；
  - 前 5 个来源编号。

  按读取成本账本：从 5068 行、3.57MB 降到 1 行、6.7KB。
- **分布**：行业、地区、角色、关系强度、价值类型都改成数据库分组计数。地区别名和角色归类仍在代码里用原来的 JS 规则合并，结果不变。
- **缺口和机会**：没有改，仍然读整张关系图，留给 0102。输出与改前一致，有测试断言。
- **联系人分析**：
  - 只按编号读取页面上出现的联系人。
  - 新增 `roleCounts`（按职位分组的计数，由数据库算），App 用它算「决策层 %」。旧服务器没有这个字段时，App 退回原来的算法。
- **App 登录**：没有指定跳转目标时进入 `/home`；显式的 next 仍然生效。Google 回调的默认跳转也一起改成了 `/home`。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 对照测试 | 通过 | 见下方说明 |
| 02 短列表 ≤ 5，只含显示字段 | 通过 | 测试断言；真实响应里检查了 231 个列表，超过 5 条的只有分布的桶 |
| 03 联系人分析按编号读 | 通过 | 测试断言三点：只读被引用的编号、不走列表分页、结果等于「完整列表按编号过滤」；传空编号时不读库 |
| 04 App 登录默认进 `/home` | 通过 | 5 条测试先失败再通过（216/216）；在 phoneweb 上真实登录验证了两种情况 |
| 05 phoneweb、Simulator、全量、typecheck、棘轮 | 通过 | 见第 5、6 节 |

**SC-01 对照测试**：`tests/services/dashboard-sql-read-model-postgres.test.ts`，用真实 Postgres。标准答案是保留下来的 JS 整图计算。

- 比较对象：5 个账号，分别是本人、编号有重叠的另一个账号、空账号、会退回 JS 的账号、不存在的账号。
- 比较内容：看板（最近动态条数取 0、2、4、99 和默认值，再加 empty、pending、failure 三种场景）、摘要、分布、缺口，全部逐项 `deepEqual`。
- 数据写入后再比一遍，写入包括软删除、改分数、新增联系人。
- 边界数据：
  - 高价值门槛取 69.5、69.49999999999999、70、70.4、88，以及 jsonb 里超过 double 精度的数；
  - 关系强度门槛；
  - 同一个联系人有两条关系、同一个编号有两条记录；
  - 无主的种子行；
  - 七种 ASCII 时间格式，以及全角时间（会退回 JS）。
- 故障注入：数据库没有 ICU 排序规则时退回整图读取，结果仍然一致。

**变异检查**：做了 7 处变异（门槛 69.5→70、warm 门槛 45→44.9、去掉大小写折叠、重复编号取第一条、按存储编号匹配、排序规则改回 "C" 等），每一处都让对照测试变红，之后已恢复。

## 3. 需要用户知道的

- **最近动态的排序规则**：原来的 JS 用 `localeCompare`，本地真实数据里的时间大多不是标准格式，原有的摘要 SQL 因此总是退回整图读取（改前小票：346 行、295KB）。现在改用 ICU 根排序规则 `und-x-icu`，拿 3825 个随机字符串与 Node 对比，0 处不一致。
  - **生产上要确认 Neon 有 `und-x-icu`**。如果没有，结果仍然正确，只是读得多，日志会出现 `dashboard_activity_collation_missing`。
- **排序最后加了 `record_id` 作为决胜条件**：本地演示账号有 66 个联系人的三个排序字段完全相同。改前它们的先后顺序取决于数据在磁盘上的存放顺序，本来就不确定。所以最近动态第 4 条从「张博文」变成了「王一凡」，其他显示完全相同。
- **所有来源编号列表都截到 5 个**：包括看板的来源编号、摘要各指标的来源编号、每个分布桶的来源编号。联系人分析的摘要原来带着 609 个编号，但没有任何页面显示它们。
- **已有的 AI 分析报告会显示一次「数据已更新」**：因为联系人分析的数据版本号变了。AI 背景资料里的联系人也只剩页面上出现的那些，另外加上职位计数。
- **旧版 App**：`roleCounts` 是可选字段，旧版 App 会忽略它，但会用「只含页面上联系人的列表」算决策层 %，结果会偏。建议尽快发新版 App。

## 4. 提交与文件

- 提交：`1cd605835` feat(orbits,app): compute dashboard totals, short lists and distributions in SQL (0101 D1)
- 新增：`features/dashboard/storage/dashboard-read-model-postgres-reader.ts`，对照测试。
- 修改：
  - dashboard：live-service、distribution、aggregate-projection、contract、service-factory、各 provider；
  - contacts：contract、live-service、graph-query、scope reader（新增可选参数 `match: "domain"`，默认行为不变）；
  - `mobile/contacts-dashboard-service.ts`；
  - schema，已用 `npm run sync:contract` 同步。
- App：`account-auth.ts`、`auth-session.ts`、`contacts.ts`、`contacts-analysis.ts`、`ContactsDashboardScreen.tsx`，以及登录相关的 4 个测试文件。

## 5. 子代理执行的测试

- **orbits 全量**：5145 条，34 条失败。和已知清单相比多出 1 条：Gemini 实时测试。它在全量负载下 12 秒后失败，单独跑 3 次都通过，和看板无关。
- **App 全量**：3597 条，1 条失败，是 route-parity。
- **Postgres 测试**（orbit_test）：8/8 通过。
- **cutover 测试库**：B3 测试和联系人搜索测试写死了只在 `orbit_cutover_test_20260917` 上跑，之前从没真正执行过。子代理在本地新建了这个库，库保留着。B3 的 5 条全部通过；联系人搜索有 9 条失败，在基线提交上也是同样 9 条失败。
- **typecheck**：三处都是 0 错误。
- **棘轮**：不变。

## 6. 运行时证据

**读取成本账本**：

| 链 | 改前 | 改后 |
|---|---|---|
| dashboard | 1 次查询 / 5068 行 / 3,570,222 字节 | 1 次查询 / 1 行 / 6,660 字节 |
| contacts.dashboard（新增） | 9 次查询 / 7160 行 / 5,013,724 字节 | 13 次查询 / 5523 行 / 3,911,181 字节 |

contacts.dashboard 改后剩下的约 2.96MB，是缺口和机会读的整张图，留给 0102。

**本地生产构建的小票**：同一个演示账号，基线提交和本 Sprint 各跑一次。

| 路由 | 改前：读取 / 返回 | 改后：读取 / 返回 |
|---|---|---|
| `/api/dashboard?activityLimit=4` | 345 行 282KB / 73KB | 5 行 9.9KB / 10KB |
| `/api/dashboard/summary` | 346 行 295KB / 22.5KB | 5 行 5.8KB / 4.4KB |
| `/api/dashboard/distributions` | 345 行 282KB / 37.8KB | 5 行 34.6KB / 18KB |
| `/api/mobile/contacts-dashboard` | 997 行 746KB / 341KB | 459 行 390KB / 74KB |

**页面一致性**：
- 用改前、改后两份真实响应分别算出 App 的看板、联系人分析、管理页视图模型，除「同时间并列那一格」和 `evaluatedAt` 外完全相同。
- phoneweb（390 宽）改前改后各截 4 张图，文字只差最近动态第 4 条。
- Simulator（iPhone 17 Pro，dev build）显示「决策层 62%、5 个领域、强关系 37%」，和 phoneweb 一致。注意：这个 dev build 连的是用户在 3000 端口的 dev server。

## 7. GitNexus

- `createStorageDashboardAggregateProvider`、`createDashboardSummaryPostgresReader`、`createPostgresContactScopeRecordReader`：CRITICAL。
- `createLiveNetworkDistributionAnalyticsService`：HIGH。
- scope reader 只新增了可选参数，默认行为不变。有几个符号是改完之后才补做的 impact，已如实记录。

## 8. 上线

1. 执行 `select 1 from pg_collation where collname='und-x-icu'`，确认 Neon 有 ICU 排序规则。
2. 尽快发新版 App，让「决策层 %」使用 `roleCounts`。

## 9. 遗留

1. 缺口、机会的整图读取和 AI 的版本核对，交给 0102。
2. 按编号读联系人时，还会一并读关系和来源（约 200KB），可以再裁剪。
3. 分布那条 SQL 读了 34KB，主要花在按维度排的来源编号上。
4. Gemini 实时测试在全量负载下不稳定。
5. cutover 测试库里联系人搜索有 9 条失败，是既有问题。

## 10. 协调者复核
协调者在 `1cd605835` 上独立做了以下检查：

- **Postgres 测试**：设置 `ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test`，跑对照测试、读取成本基线、小票三个文件，共 8 条，全部通过。
- **orbits 全量**：5145 条，4712 通过，34 失败，399 跳过。按名字对照已知清单，多出 1 条，是 `live contacts.recommend artifact uses method A instead of preview copy`。这条在 0098 就已记为不稳定用例。协调者单独跑它所在的文件 `orbit-ai-contact-recommendation-methods.test.ts` 3 次，都是 25/25 通过。判定为负载下的不稳定，不是回归。
- **App 全量**：3597 条，1 条失败，是 route-parity。
- **diff 审查**：没有新增 skip 或 only。

**已知不稳定用例**：以下几条在全量下可能失败，单独跑能通过，后续 Sprint 按此判定，不算回归。
- `contacts.recommend`
- 预约并发
- `personal-schedule-picker`
- Gemini 实时测试
- `window failure…`
