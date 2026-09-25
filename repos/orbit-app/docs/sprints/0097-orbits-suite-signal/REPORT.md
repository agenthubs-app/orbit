# Sprint 0097 报告 — orbits 全量的 48 条既有失败

**状态:** 见登记表（**partial**）。**run-01。** 修好 7 条（48 → 41），零新增失败；**SC-0097-03 未达成**——一次全量仍然不能独立判断回归。

## 修好的三群

### A 群：测试自己把 SQL 切断了（2 条）

`shared/storage/migrations.ts:47` 有一行 SQL 注释：

```sql
-- filter; results are identical either way.
```

两个测试用 `ORBIT_RECORDS_SCHEMA_SQL.split(";")` 逐条执行，切在这个分号上，下一片以 `results are identical either way.` 开头 → `syntax error at or near "results"`。生产代码（同文件 `:96`）一直是整段 `client.query()`，没有这个问题。

改成整段执行后，`confirmed-event-followup` 立刻通过；`event-analytics` 还是红的，因为它走的是 event-operations 客户端——**pg 对多语句字符串返回的是结果数组**，那个客户端的单结果包装读 `result.rows` 会拿到 undefined。所以这条改用原始连接池执行 schema。这一步值得记：第一次"修好"只解决了一半，是第二次跑才发现的。

### C 群：本机有 key，"无 key 应失败"的用例反而过不了（3 条）

三个用例都传 `apiKey: null` 然后断言失败关闭。但 `gemini-provider.ts:405` 的语义是 **null = 未指定，回落到环境变量**：

```ts
apiKey: explicitApiKey ?? readString(process.env.DEEPSEEK_API_KEY),
```

于是在配了 key 的机器上，它们真去调了提供方（耗时 3.5–9.6s 就是证据），断言结果与用例名相反。**这不只是环境问题**：一个在开发机和 CI 上结论相反的用例，测的不是产品。现在它们在调用前后清掉并恢复 `DEEPSEEK_API_KEY`／`OPENAI_API_KEY`／`GEMINI_API_KEY`／`ORBIT_AGENT_PROVIDER`。

**顺带定位到 0088 追查过的那个 12 秒。** 清掉 key 之后重跑，另一条用例恰好在 12010ms 失败——那是 `agent-tools/registry.ts:187` 的 `timeoutMs: 12_000`，一次真实的提供方调用超时。连跑两次 43/43 全绿，说明它是 live 调用的偶发。0088 报告说"`12000ms timeout exceeded` 的唯一来源是 agent 工具超时，不在仪表盘路径上"——这里拿到了它真的会发生的实例。

### F 群：契约出口（1 条修好，1 条撤回）

**修好**：六个契约文件（`account-language-preference`／`contact-needs`／`offline-mutations`／`offline-policy`／`relationship-lifecycle`／`universal-read`）从未出现在 `shared/contract/index.ts`。补出口时发现 `offline-policy` 与 `universal-read` **各自独立定义了完全相同的** `ReadPersistence`／`MutationPolicy`／`BinaryPolicy`——不去重就没法同时出口。现在一处定义，另一处 import。

**撤回**：`契约目录只声明类型，不含运行时代码` 这条我改了又退回来了，原因写在下面。

## 一次失败的尝试，以及为什么退回

`shared/contract/profile.ts:108` 有个 `export function projectPublicProfile`，违反"契约只放类型"。它是服务端（`self-profile-reader`）和 App（`ProfileScreen`、`profile-page-model`）共用的运行时逻辑。

我把它移到了 `shared/domain/`，改了六处 import，两端 typecheck 都过了。**然后 App 全量红了三条**：`domain-sync.test.ts` 明确规定同步到客户端的 domain 文件**只能是 `industries.ts` 和 `language.ts`**，并且有一条专门的用例检查"不会复制未授权的 domain 文件"。

也就是说：契约目录禁止运行时代码，domain 目录对客户端只开放两个字典——**这份共享逻辑当前没有一个被认可的去处**，这正是它当初留在契约文件里的原因。

这不是清理，是一个架构决定（要不要给"客户端也要执行的共享逻辑"开一个受控目录，还是让两端各留一份）。我把改动整体退回了，没有为了让一条断言变绿去破坏一条写得很清楚的规则。**这条留红，并单列为待决定项。**

## 剩下的 41 条：分类与各自的症结

| 群 | 条数 | 症结（实测） | 下一步需要什么 |
| --- | --- | --- | --- |
| B. 目标库缺 schema | 4 | `event_ops_schema_migrations` / `orbit_records` 不存在；`orbit_test` 目前 **0 张表**。这些测试解析目标库的方式不一致——一部分走 `resolveLiveDatabaseConnectionConfig`（受 `ORBIT_DATABASE_TARGET=local` 影响，指向 `orbit_events`），一部分直读 `ORBIT_EVENT_DATABASE_URL`（指向 `orbit_test`） | 先统一解析口径，再决定补建 schema 还是改指向 |
| D. 运行时证据过期 | 12 | `full-product-functional-audit` / `product-surface-manifest`：「needs executed current-route evidence」「Missing runtime surfaces (63)」「navigation replay credits only its 27 exact route occurrences」 | 查清这套证据由什么生成。**若本来就要求人工执行，它不该待在 `npm test` 默认集合里**——那是分类问题不是修复问题 |
| E. 页面夹具与本地数据漂移 | 7 | 断言写死业务文案（`Tokyo AI Implementation Partner Meetup`、`二维码交换记录：佐藤 健一`），本地库现在不是这些值 | 决定该补种子还是断言本就不该绑死文案 |
| G. 并发下不稳定 | 5 | `personal-schedule-picker-interactions` 单独跑 6/6 全绿 | 查资源竞争还是共享状态；**在查清前不得 skip** |
| F′. 契约运行时代码 | 1 | 上面那节 | 架构决定 |
| H. 其余单条 | 12 | 例如 `reliable POST…` 期望 200 实际 **202**（路由在这套 mock 边界下走的是"已受理"而非"已完成"）；`live database config prefers event-specific URL` 期望对象多出一个 `target: 'cloud'` 字段 | 逐条查清 |

## 验收对照

| SC | 结果 | 说明 |
| --- | --- | --- |
| SC-0097-01 | partial | A（2）、C（3）、F 的出口那条（1）修好，另加一条 0094 留下的过期 prompt 断言；F 的"契约只放类型"撤回，需架构决定 |
| SC-0097-02 | pass | 上表：41 条全部归群，每群都有实测症结 |
| SC-0097-03 | **fail** | 仍是 41 条红。分类只落在文档里，没落进代码——**一次全量依然不能独立判断回归** |
| SC-0097-04 | pass | 没有任何一条用 skip 换绿 |
| SC-0097-05 | pass | App 3572/3572；orbits 通过数 4019 → 4026，零新增失败 |

## 交接

值得做的下一步不是继续逐条修，而是**先决定 D 群**：12 条里有 12 条都在同一个"运行时证据"机制上。如果那套证据确实需要人工执行，把它从默认集合里分出去，剩下的 29 条才有可能收敛到"一次全量就能判断回归"。

## 2026-09-25 后续：资料公开投影的运行时边界

此前 F′ 的契约目录检查失败已按新的实现范围修复：Web 实现在 `features/profile/public-projection.ts`，App 实现在 `src/screens/profile/profile-page-model.ts`；`shared/contract/profile.ts` 及官方同步到 App 的副本现在只保留类型声明。两端 projector 保留相同的显式公开字段白名单，生日、私密联系方式、跟进偏好和来源元数据仍被排除。

本地定向结果：orbits 25/25、App 21/21，两端 typecheck 通过。没有重跑 orbits 全量，因此本报告的 41 项历史统计未更新，0097 总体状态仍为 `partial`；本记录不表示生产发布或整项 Sprint 验收完成。
