# Sprint 0103 执行报告：AI 轨迹停写重复记录，读取改为按编号精确读（A1 + A3）

**run-01**。Generator 为子代理，报告由协调者代存。分支 `sprint/0103-ai-trace-stop-duplicates`，代码提交 `58a17ad3b`，未推送。
**状态：completed。** 生产上要执行一次回填命令，见第 7 节。

## 1. 结论

- **写入**：问一次 AI，不再写步骤记录（本地实测原来 9 行）和统计记录（2 行）。新的运行记录一次写成 completed，写之前不再先读。
- **运行详情接口 `/api/ai/runs/[id]`**：返回的键、步骤编号、名字、类型、顺序、状态都和原来相同。步骤改为从请求记录的计时拼出来，并新增 `durationMs` 字段。
- **读取**：步骤、动作、发件箱、回执和请求记录，都在信封上写明属于哪次运行（`target_type='agent_run'`、`target_id=运行编号`），读取走已有的 `orbit_records_target_idx`。
  - `getRun` 从「1 条查询 + 4 次读全部历史」变成 2 条查询。
  - 回执的幂等查找也改成只在本次运行内查。
- **读取上限棘轮**：165 → 164。
- **读取成本账本**：新增 `ai.run` 链。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 普通问答不新增步骤和统计 | 通过 | 真库测试：改前新增步骤 4 行、统计 2 行；改后都是 0，运行记录 +1（completed） |
| 02 运行详情接口形状不变 | 通过 | 真路由契约测试：7 个顶层键一致；步骤字段逐项一致，多出 `durationMs`；进度一致。反例：B 读不到 A 的运行 |
| 03 读取量与历史条数无关 | 通过 | 改前：10 次历史读 89 行 / 111KB，200 次历史读 1685 行 / 2.05MB。改后：两种情况都是 2 条查询 / 5 行 / 9,731B |
| 04 带动作的运行：状态卡和账本不变 | 通过 | 真库测试，与旧写法的参照组逐项一致 |
| 05 棘轮、全量、typecheck、phoneweb | 通过 | 棘轮基线合计 164。棘轮测试文件本身仍失败：chat-session provider 实际 5 处、基线 4 处，这是既有问题，交给 0109 |

## 3. 设计取舍

1. **带动作的运行仍保留原有步骤行。** 状态卡的进度依赖它们。运行详情会把存下的步骤和从计时拼出的步骤合并，编号相同的去重。
2. **只停写普通问答的开始、完成两条统计。** 带动作流程的统计和「查看」类统计还在写，目前没有页面读取它们，见遗留第 3 条。
3. **账本列表 `listActions` 改为最多读最新 500 条。** 触到上限时记日志告警。
4. **回执幂等查找的接口新增 `runId` 参数。** 调用方有两处，都已经拿得到运行编号。
5. **非可靠协议（protocolVersion≠2）的问答，运行详情的步骤为空数组。** 网页和 App 都用协议 2。
6. **新增回填脚本 `db:migrate:agent-run-targets`。** 它给改前写下的旧行补上所属运行编号。只更新空值，不删除，可以重复执行。

## 4. 文件

- **修改**：
  - AI 路由 `persistConversationRunTrace`
  - 运行详情 handler
  - agent runtime 的 contract、service、repository
  - agent-runtime-live-record-provider
  - reliable-send-service
  - chat-request-store
  - package.json
  - 棘轮基线、账本基线、账本链路
  - 3 个测试的桩和调用签名
- **新增**：
  - `features/agent/runtime/conversation-run-steps.ts`
  - `scripts/migrate-agent-run-targets.ts`
  - `tests/services/agent-run-trace-postgres.test.ts`（6 条真库测试，均先见 RED）
  - `tests/services/agent-conversation-run-steps.test.ts`（3 条单元测试，实现后补写）

## 5. 子代理执行的测试

- **orbits 全量**：5162 条，33 失败，全部在已知清单内。
- **App 全量**：3597 条，2 失败。一条是 route-parity；另一条「batch reviews reflow narrow-double」单独跑 3 次都是 32/32 通过，本 Sprint 也没改 App，判为不稳定。
- **Postgres 测试**：12/12 通过，orbit-agent-session-postgres 1/1 通过。
- **typecheck**：三处都是 0 错误。

## 6. 运行时证据

证据在 `build/harness-state/evidence/sprint-0103/run-01/`。

**POST /api/ai/conversations 的读取小票**（同类问题）：

| | 查询 | 行 | 字节 |
|---|---|---|---|
| 改前 | 105 | 98 | 142,678 |
| 改后 | 42 | 31 | 51,839 |

- 改后两次问答新增的步骤和统计都是 0 行。
- 运行详情接口：改前 16,824B，改后 14,180B。用改后的代码读改前那次运行，显示 9 步，没有重复。
- 本地回填：更新 625 行。再执行一次，更新 0 行。
- phoneweb 上问答显示正常。测试会话已经删除。

## 7. 上线步骤

**部署后执行一次 `npm run db:migrate:agent-run-targets`。** 如果不执行，改前写下的带动作运行在按编号读取时看不到自己的动作、发件箱和回执，状态卡和撤销功能会受影响。新写入的数据不受影响。这个命令只做 UPDATE，建议先查一下生产行数，数据多的话分批执行。

## 8. 费用

DeepSeek 调用 3 次，没有超时，保守记 $0.006。付费账本累计 **$0.048249 / $5**。

## 9. GitNexus

- `createStorageAgentRuntimeRepository`、`createAgentRuntimeService`：CRITICAL，影响 37 处。已用 60 个文件的定向测试集和全量测试覆盖。
- 其余改动：LOW。

## 10. 遗留

1. 棘轮测试文件仍失败（chat-session provider 实际 5 处，基线 4 处），交给 0109。
2. 账本列表上限 500 条。
3. 带动作流程和「查看」类统计还在写，要不要停写，放到 A2（0107）一起决定。
4. 非可靠协议的问答，运行详情里步骤为空。

## 11. 协调者复核

- Postgres 测试（`ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test`）：agent-run-trace、run-steps、账本共 11 条，全部通过。
- diff 审查：没有新增 skip 或 only；棘轮基线只删掉 agent-runtime 那一行（1 处）。
- orbits 全量：5162 条，4716 通过，34 失败，412 跳过。按名字对照已知清单，多出的只有 `contacts.recommend`，是已登记的不稳定用例。
- App 全量：3597 条，3 失败。除 route-parity 外，另 2 条是 `ink-signal-card-review`「batch reviews reflow」和 `tasks-unification-interactions`「suggestion next page replaces twenty previews」。协调者把这两个文件各单独跑 3 次，都是全部通过（32/32、19/19）；本 Sprint 也没有改 App 代码。因此判为负载下的不稳定用例，已加入已知不稳定清单。
