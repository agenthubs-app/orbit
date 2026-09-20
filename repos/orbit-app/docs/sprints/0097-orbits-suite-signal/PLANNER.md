# Sprint 0097 — 让 orbits 全量重新变成信号

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 0095／0093 报告里记下的"orbits 48 条既有失败"。
**单一目标:** 48 条失败要么修好，要么被明确分类，使一次全量即可判断是否引入回归。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0088 合并后的 `chat-agent`；HEAD 全量 = 4299 tests / 48 fail。
**进入条件:** 本机 `orbit_test` 与 `orbit_events` 可用。

## 为什么这件事值得单列

不是为了好看。**现在这套测试无法独立判断回归**：本批次每个 Sprint 都必须切回 HEAD 跑一次全量作对照，一次二十多分钟，跑两遍才能得出"无新增失败"。这是每个 Sprint 都要付的固定成本，而且依赖人记住基线数字——0095 那次基线 49、改后 48，差值还得逐条比对才敢说是 flake。

## 已查明的分类（48 条，19 个文件，全部实测）

| 群 | 条数 | 文件 | 症结 | 判断 |
| --- | --- | --- | --- | --- |
| **A. 测试自己切错 SQL** | 2 | `event-analytics-read-model-postgres`、`confirmed-event-followup-postgres` | 两个测试用 `ORBIT_RECORDS_SCHEMA_SQL.split(";")` 逐条执行；而 `shared/storage/migrations.ts:47` 有一行 SQL 注释 `-- filter; results are identical either way.`，切在注释中间，下一片以 `results are identical…` 开头 → `syntax error at or near "results"`。**生产代码（同文件 `:96`）是整段 `client.query()`，没有这个问题。** | 纯测试缺陷，改成整段执行即可 |
| **B. 目标库缺 schema** | 4 | `event-access-migrations-postgres`、`event-access-repository-postgres`、`web-runtime-migration`、`event-profile-contract-repair-operator-cli-postgres` | `relation "event_ops_schema_migrations" does not exist`／`missing runtime table orbit_records`。`orbit_test` 目前 **0 张表** | 先查清这些测试各自解析到哪个库（`resolveLiveDatabaseConnectionConfig` 与直读 `ORBIT_EVENT_DATABASE_URL` 两条路不一致），再决定是补建 schema 还是修解析 |
| **C. 本机有 API key，"无 key 应失败"的用例反而过不了** | 4 | `orbit-agent-gemini-live`、`orbit-ai-language-normalization`、`contacts-analysis-generation`(×2) | 用例名就是 "fails closed without an API key"，但 `.env.local` 里有 key，于是真去调了提供方（耗时 3.5–9.6s 也印证了） | 这类用例必须自己把 env 置空，而不是依赖开发机恰好没配 key。否则它在 CI 与本机的结论相反 |
| **D. 运行时证据过期** | 12 | `full-product-functional-audit`、`product-surface-manifest` | "needs executed current-route evidence"、"Missing runtime surfaces (63)"、"navigation replay credits only its 27 exact route occurrences" | 需要重新跑证据采集流程。**先查清这套证据由什么生成、多久失效一次**；如果它本来就要求人工执行，那它不该混在 `npm test` 里 |
| **E. 页面夹具与本地数据漂移** | 7 | `app-event-registration-guide`(×5)、`app-agent-contact-recommendations`、`live-generated-fixture-seed` | 断言写死了活动标题、联系人名（如 `Tokyo AI Implementation Partner Meetup`、`二维码交换记录：佐藤 健一`），本地库里现在不是这些值 | 分清是种子该补、还是断言本就不该绑死具体业务文案 |
| **F. 契约目录卫生** | 2 | `contract-surface` | 「新增契约文件后要在 `shared/contract/index.ts` 补一行 export」「枚举的常量数组留在 features 或 shared/domain」 | **真实缺口**，照规则补即可 |
| **G. 并发下的不稳定** | 5 | `personal-schedule-picker-interactions` | 单独跑 6/6 全绿，全量并发下随机失败 | 先确认是资源竞争还是共享状态；在查清之前不得标记 skip |
| **H. 其余单条** | 12 | 见附表 | 逐条不同 | 逐条查清后归入上面某一群或单列 |

**判断 1：不许用 skip 换绿。** 任何一条改成 skip 都必须在报告里写明原因和恢复条件；把失败藏起来比让它红着更糟。
**判断 2：C 群是正确性问题，不只是环境问题。** 一个在开发机和 CI 上结论相反的用例，测的不是产品。
**判断 3：D 群先查再动。** 如果那套证据要求人工执行，把它留在 `npm test` 里就等于永久 12 条红——那是分类问题，不是修复问题。
**判断 4：分类要落在代码里，不是文档里。** 目标是"跑一次就知道"，所以仍然不能通过的用例要有机器可读的归类（skip + 原因、或独立的 npm script），而不是一张只有人读的表。

## 范围与文件

- 上表 19 个测试文件；`shared/contract/index.ts`（F 群）；证据采集脚本（D 群，查清后按 RULES 第 0 节登记）。
- **排除**：为了让断言通过去改产品行为。任何一条要改产品代码的，单独登记后再动。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0097-01 | A、C、F 三群修好（8 条） | 修前修后条数 |
| SC-0097-02 | B、D、E、G、H 每条有查清的原因与归类 | 分类表 + 各自证据 |
| SC-0097-03 | 一次全量即可判断回归：失败数 == 已分类条数，且逐条对得上 | 干净工作区全量输出 |
| SC-0097-04 | 没有任何一条靠 skip 换绿而不写明原因与恢复条件 | 逐条说明 |
| SC-0097-05 | 无回归：App 全量不受影响；orbits 通过数只增不减 | 摘要 |

## 失败与交接

若 D 群的证据采集确需人工执行且改造超出本 Sprint，则只把它从 `npm test` 的默认集合里分出去并写明怎么跑，不删用例、不改断言。
