# Sprint 0112 执行报告：AI 会话分页、卡片按需、问答只追加（AI B1 + B2）

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。
- 分支：`sprint/0112-ai-session-paging`，基线 `5d6ef0b65`，加开工提交 `86b925d82`。
- 最后提交：`3d2cdbc9f`。没有推送，没有合并。
- GOAL.md 和 PLANNER.md 都没改。codex-review.md 没碰，stash 没碰。

**状态：completed。** SC-01 到 SC-05 都有同一版本的证据。App 全量第一次跑出 1 条失败，是本 Sprint 引入的，已修好并回归通过，见第 5 节。

## 1. 结论

**会话长度不再影响读写量。** 在同一个真库、同一个真路由上，改前改后对比如下：

| 操作 | 改前（N=1000） | 改后（任何长度） |
|---|---|---|
| 打开会话 | 1103 行，1.45 MB | 33 行，约 24 KB |
| 问一次 | 读 7018 行、9.1 MB，写 2008 行 | 读 24 行，写 7 行 |

- **打开会话**只取最近 20 条（多读 1 条用来判断还有没有更早的），再按主键读出这一页里各条回答对应的请求记录。消息按新建的索引 `orbit_records_agent_chat_message_order_idx` 倒序读取。EXPLAIN 显示走的是 Index Scan，只读 21 行、5 个缓冲页。
- **翻页游标**用 HMAC 签名，绑定账号和会话。换账号、换会话、篡改游标，都返回 400。
- **问答只追加。** 先读会话头和最近 13 条（给模型的历史最多 12 条），然后在一个带咨询锁的事务里追加问题和回答。原有消息逐字节不变。
- **旧客户端上传整会话不会破坏数据。** 服务器按消息编号合并：没上传的消息不删也不挪位置，已有编号的消息原地更新，新消息追加到末尾。
  - 没有编号的消息，只有在快照确实从第一条开始时（旧客户端的全量快照）才按位置对应。其余情况按内容生成固定编号，同一份快照重发不会产生重复。
  - 已删除的会话收到迟到的保存，照旧返回 410。
- **App 和网页都不再上传整会话。** 网页只发新增或改动的消息（加面板），标题沿用已存的。App 只有在服务器没返回可靠发送回执时才走旧的保存，现在也只发这一轮。
- **0110 遗留已修。** 恢复出来的回合如果提过动作，会带上 runId 和 actionIds，网页能重新显示状态卡和「确认执行」。
  - 运行时验证：用接口真问了一个提醒请求，存下来的回复是纯文本，没有 runId。在网页上恢复这个会话，状态卡照样出现。
  - App 的对话页本来就不显示动作卡（新回复也不显示），所以 App 这边没有可恢复的东西，确认动作仍在 All Actions 里做。
- **读取上限棘轮 156 → 150。**
  - chat-session provider 里 5 处不设上限的读取全部去掉（原先 5 > 4），0123 加的待办超额项已删除。
  - `contact-live-record-provider` 从 4 下调到 3，`personal-schedule/service` 从 2 下调到 1，都是实际值。
  - transactions 文件里剩下的 5 处都是分组和整理相关的读取，不涉及会话消息，没有动。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 打开只读 20 条和对应卡片；上翻读完全部，顺序对，不重复不遗漏 | 通过 | 真库和真 handler 测试，先见 RED：1000 条旧格式会话走 50 页，顺序和唯一性都对；N=10/100/1000 读取行数一致；卡片只恢复这一页的回合，跨页边界的那一轮也能恢复 |
| 02 每轮读写与长度无关；旧客户端整会话 POST 不截断 | 通过 | 真 POST 路由测试：N=10/100/1000/3000 读写行数完全相同；并发 6 路追加后位置连续、无重复；重放不再写；过期 revision 在调用模型前被拒；旧客户端的几种快照（部分页、全量、无编号）都已测 |
| 03 两端上翻、滚动位置、卡片、追加 | 通过 | App：Playwright 加 react-native-web，5 条测试；网页：react-test-renderer，4 条测试；另有 Simulator 和网页截图（第 6 节） |
| 04 审计通过、跨账号隔离 | 通过 | 棘轮审计通过；游标、404、同编号会话的隔离测试都通过 |
| 05 全量、typecheck、小票 | 通过 | 见第 5、6 节 |

## 3. 设计取舍（请知悉）

1. **给模型的历史改为最近 12 条。** 原来可靠发送会把整个会话交给模型。planner 和 synthesis 本来就只用最后 8 条，唯一受影响的是卡片检索用的上下文，从全部历史变成最近 12 条。选 12 是因为路由对客户端传来的历史本来就截到 12 条。
2. **会话的搜索文本限长 8000 字**：保留开头 2000 字，加上最新的内容。侧栏搜索可以搜到标题、第一个问题和最近的消息，中间很老的消息内容搜不到了。
   - 这是每轮写入量不随长度增长的代价。
   - 运行时字节数在大约几百条之后就饱和了：N=1000 问一次是 107 KB，N=3000 是 104 KB。行数一直是 37 到 38 行。
3. **内存存储（mock 模式和单元测试）不能在存储里排序。** 这种情况下最多扫 5000 行，超过就明确报错。生产环境总是走 SQL。
4. **App 打开会话时仍停在这一页的顶部**，和原来的行为一致。「加载更早的消息」就在顶部。点击或往上滚回顶部都会加载更早的一页。
5. **「卡片按需加载」的实现方式。** 卡片随所在页一起取回：打开时取最近一页的，往上翻时一起取回那几轮的，显示在各自回答的下面（原来 App 把卡片都挂在最后一条回答下）。
   - 加载时显示中性的占位行「正在加载更早的消息…」。卡片恢复不完整时显示「重新加载卡片」，只重读受影响的那几页。
   - 没有新增组件，也没有新增颜色：App 沿用账本「加载更多」那一行的样式，网页沿用 `ir-panel-note` 和 `ir-chip`。
6. **网页的失败占位不再保存。** 失败时那条没有编号的「重新提交」占位消息，现在不会写进服务器，只在当前页面上可见。
7. **网页的一处小修复。** 从链接直接打开的会话，发送时用恢复时拿到的 revision。原来这种会话如果不在侧栏列表里，会按 revision 0 发送。

## 4. 文件与提交

**提交：**
- `8870ba6e6` feat(orbits): AI sessions open a page of 20, questions append instead of rewriting, old-client saves merge by id (0112)
- `65c8e6df8` feat(app): AI conversation opens on the latest 20 messages and loads earlier pages from the top (0112)
- `75619e68a` feat(orbits): web chat restores a session a page at a time, saves only what changed, and shows restored action cards (0112)
- `012039c00` fix(app): keep the reading position while prepended AI messages finish laying out (0112)
- `3d2cdbc9f` test(app): move the offline-read audit's line key for the conversation send to its new line (0112)

**服务端**（`repos/orbits/` 下）：
- `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`（重写）
- `features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader.ts`
- `features/orbit-ai/reliable-send-service.ts`
- `app/api/ai/conversations/route.ts`
- `app/api/ai/conversations/sessions/[id]/handler.ts`
- `shared/storage/migrations.ts`（新索引）
- `shared/contract/{ai-session-page,ai-artifacts}.ts`、`shared/api-schema/{ai-session-page,ai-artifacts}.ts`

**网页：** `app/(app)/app/agent/iorbit-0918/` 下的 `iorbit-model.ts`、`use-agent-chat.ts`、`iorbit-chat.tsx`、`iorbit-shell.tsx`、`iorbit-styles.ts`

**App：**
- `src/screens/ai/AiConversationScreen.tsx`
- `src/api/ai-history-contract.ts`
- `src/view-models/{ai-artifacts,conversations}.ts`
- `src/i18n/{messages,zh,en,ja}.ts`
- 同步过来的契约：`src/api/contract|schema/{ai-artifacts,ai-session-page}.ts`
- `scripts/audit-offline-read-surfaces.ts`

**新增测试及各自证明的内容**（都先见 RED）：
- **`tests/services/ai-session-paging-postgres.test.ts`**，12 条，真库加真路由。RED 时 9 条失败。
  1. 旧格式的 500 轮会话：先看到最新 20 条，一路翻页读完 1000 条，不重复不遗漏。
  2. N=10/100/1000 打开会话的读取成本相同，卡片只恢复这一页的回合，而且打开不写库。
  3. 更早的一页带回那一页的卡片，包括被页边界切开的那一轮。
  4. 游标隔离：跨账号、跨会话、篡改签名、非法 limit 都被拒绝；A 打不开 B 的会话。
  5. 真 POST 路由在 N=10/100/1000/3000 下读写行数相同，只追加；原有行的 md5 全部不变；给模型的历史是最近 12 条。
  6. 重放不写库；过期 revision 返回 409，而且不调用模型。
  7. 6 路并发追加后位置是 0 到 45，不重复、不留空；同一编号重试只存一次。
  8. 旧客户端上传「一页加新消息」：不截断、不重排、不重复，重发同一份也不会多出消息。
  9. 没有编号的旧会话：全量快照按位置对应；把读到的一页原样传回，什么都不变。
  10. 已删除的会话收到迟到保存返回 410。
  11. 带动作的回合，恢复时带上 runId 和 actionIds。
  12. 删除 1000 条消息的会话、查找分析会话，都按有上限的批次读取。
- **App `tests/ai-conversation-paging.test.ts`**，5 条：
  - 首屏 20 条，然后一页一页加载到「已加载全部消息」。
  - 滚动位置保持。我把补偿代码临时去掉，确认这条测试会失败。
  - 卡片出现在自己的回答下面，而且在对应页加载之前不出现。
  - 加载中显示占位行，失败时显示「重试」并能恢复。
  - 翻页阅读不会上传会话。
- **网页 `tests/pages/app-agent-session-paging.test.tsx`**，4 条：
  - 恢复后按 20 条一页读完全部 150 条。
  - 失败后可以重试。
  - 新回答之后只保存这一轮，而且沿用已存的标题。
  - 恢复出的动作回合显示状态卡。
- **按新契约改写的既有测试。** 下面这些测试原来锁定的是旧行为（整会话上传、`listSessions`、`upsertVerifiedAnalysisSession`、LIMIT 101）：
  - orbits：`orbit-agent-chat-session-live-store`、`orbit-agent-reliable-send`、`orbit-agent-conversation-readback`、`ai-session-origin`、`orbit-agent-session-artifact-readback`、`contacts-analysis-report-provider`、`dashboard-snapshot-postgres`
  - App：`ink-signal-ai-conversation` 中 2 条、`ai-conversation-screen-source` 中 1 条
  - 网页测试夹具加了可选的 `sessionReader`，默认行为不变。

## 5. 全量、typecheck、Postgres

- **orbits `npm test`**：5259 条，4742 通过，**0 失败**，517 跳过。付费主机拦截没有触发。
- **App `npm test`**：3723 条，第一次 3722 通过、1 条失败，是 `offline-read-inventory` 里的「the actual native consumers all have explicit versioned policies」。
  - 原因：离线读取审计按行号登记了对话发送的路径，我加了分页代码后这一行从 328 挪到了 425。
  - 已在 `3d2cdbc9f` 修复，这个文件单独跑 23/23 通过。按规则没有再跑一次全量。
- **typecheck**：orbits `typecheck` 为 0，`typecheck:app` 为 0，App `tsc` 为 0；`npm run lint` 为 0。
- **Postgres 测试**：共运行 78 个文件，全部 `--test-concurrency=1`，都是既设置了数据库环境变量、又涉及本次改动的模块或迁移 SQL 的文件。迁移 SQL 改了，所以几乎所有真库测试都在范围内。完整文件列表在证据目录的 `pg0112-test.txt` 和 `pg0112-cutover.txt`。
  - 在 `orbit_test` 上：74 个文件，243 条，239 通过，**0 失败**，4 条跳过。跳过的都是原本就有条件门控的增长基准。
  - 在 `orbit_cutover_test_20260917` 上：`read-projection-parity-postgres`、`contact-search-pagination`、`canonical-reminder-wake`、`canonical-reminder-command-transaction`，共 73 条，66 通过。7 条失败正是 `contact-search-pagination` 已登记的 7 条既有失败，这个文件单独跑也是 7 条。
  - 另外 `ORBIT_AGENT_SESSION_TEST_DATABASE_URL` 门控的 2 个文件也在 `orbit_test` 上跑过，2/2 通过。
- **棘轮**：156 → 150，只减不增。读取成本基线测试在全量里通过。

## 6. 运行时证据

证据在 `build/harness-state/evidence/sprint-0112/run-01/`，分 `commands/` 和 `screens/` 两个子目录。

**环境：**
- 用 `local-stack start --build` 在 3100 起生产构建，连本机库 `orbit_events`，3000 没碰。
- 本地库先执行了 `db:migrate:live`，新索引已建好。
- 服务进程加载了 paid-guard，上限 4 次。
- QA 账号 A 和 B 是新注册的；造数写入的是旧存储格式，会话分别有 150、10、100、1000、3000 条消息。

**小票（`orbit_read_receipts`，生产机制）：**

| N | 打开：行 / 查询 | 问一次：行 / 查询 / 字节 |
|---|---|---|
| 10 | 17 / 10 | 33 / 35 / 27.8 KB |
| 100 | 28 / 10 | 37 / 35 / 61.7 KB |
| 1000 | 28 / 10 | 37 / 35 / 105.6 KB |
| 3000 | 28 / 10 | 37 / 35 / 103.8 KB |

字节在搜索文本达到上限后就不再增长（N=1000 和 3000 基本相同）。改前的对照数字在 `commands/before-costs.log`（同一个真库测试跑的旧代码）。

**网页（Playwright，1440 宽，3100）：**
- 首屏 20 条，截图 `web-01`。
- 加载中占位行，截图 `web-02`。
- 加载后锚点消息「消息 130」位置前后都是 y=138，截图 `web-03`。
- 读到全部 150 条，顺序和唯一性都对，显示「已加载全部消息」，截图 `web-04`。
- 恢复出的动作卡带「确认执行」，截图 `web-05`。
- 翻页后再问一次：页面上新消息追加显示；随后的保存请求只有 2 条消息，标题是已存的，截图 `web-06`。

**App（iPhone 17 Pro Simulator，Debug 构建加 Metro，服务器地址 3100，QA 账号 A）：**
- 首屏是第 134 到 153 条，顶部有「Load earlier messages」（账号语言是英文），截图 `sim-01`。
- 第 71 轮的卡片在自己的回答下面，截图 `sim-02`。
- 往回加载之后，锚点第 134 条的位置前后都是 y=208，截图 `sim-04`。
  - 第一版在真机渲染上补偿不足：第 134 条从 y=185 跳到了 2218。原因是新内容分两次排版，只补偿了第一次。`012039c00` 修复后复测通过。
- 往上滚动会自动加载更早的页，更早那几轮的卡片随页出现，截图 `sim-05`（卡片 x 坐标来自无障碍标签日志）。
- 滚到顶显示「All messages loaded」，截图 `sim-06`。
- 在 App 里问了一次会被本地拦截的问题，库里追加到第 154、155 条，截图 `sim-07`。
- 库里核对：长会话共 154 条（App 那一问之后是 156 条），位置 0 到 153 连续唯一，原来的 150 条没有一条被重写。

**清理：**
- QA 相关的 orbit_records 共 4522 行已删除，删除前完整导出到 `commands/qa-rows-backup.jsonl`（权限 600，没有入库）；QA 小票 128 条也已删除；复查剩余 0 行。
- 3100、两个 worker、Metro 都已停止。3000 的开发服务照常，健康检查返回 200。
- Simulator 服务器地址已改回 `http://127.0.0.1:3000`，截图 `sim-08`。演示账号需要重新登录。
- 本地库的新索引保留。

## 7. 付费调用记录（上限 4 次）

| # | 时间（UTC） | 主机 | 用途 | 结果 |
|---|---|---|---|---|
| 1 | 2026-09-27 21:52:32 | api.deepseek.com | 接口真问提醒请求，用来验证恢复动作卡 | 200，424ms |

共 **1/4** 次，保守按 $0.002 记。其余问答（接口 7 次、网页 1 次、App 1 次）都被本地拦截，0 付费。原始记录在 scratchpad 的 `paid-calls-0112.jsonl`。

## 8. GitNexus

- `createStorageOrbitAgentChatSessionProvider`：**HIGH**，影响 5 处，涉及对话 POST 的 8 条流程。已由真库测试、Postgres 集合和两端全量覆盖。
- 网页的 `persistStoredAgentChatSession`、`loadStoredAgentChatSession`：**HIGH**。已由网页 agent 页面测试（278 条）和新的分页测试覆盖。
- `runOrbitRecordsMigration`：MEDIUM，影响 18 处。只新增了一条 `create index if not exists`，78 个 Postgres 文件都跑过。
- `createReliableOrbitAgentSendService`、`AiConversationScreen`：图谱里 0 处调用，属于未解析，已用全文搜索确认调用点。
- 最终 `detect-changes --scope compare --base-ref 86b925d82`：51 个文件、195 个符号，risk high，影响 8 条对话 POST 流程，都在预期范围内。

## 9. 生产上线步骤（给用户）

1. **先建索引，最好在部署前手动用不锁表的方式建。** 部署时的迁移会执行普通的 `create index`，在大表上会短暂阻塞 orbit_records 的写入：
   ```sql
   create index concurrently if not exists orbit_records_agent_chat_message_order_idx
     on orbit_records(workspace_id,target_id,(case when jsonb_typeof(payload->'index')='number' then (payload->>'index')::numeric end) desc,record_id desc)
     where collection_name='orbit_agent_chat_messages' and lifecycle_state<>'deleted';
   ```
   建好之后，迁移里的 `if not exists` 会直接跳过。
2. **确认生产配置了至少 32 字节的 `ORBIT_READ_CURSOR_SECRET`（或 `AUTH_SECRET`）。** 没有的话，打开长会话会报错。侧栏分页已经依赖同一个密钥。
3. **不需要回填。** 旧格式的会话可以直接打开和追加，第一次追加时会把 `nextMessageIndex` 补上，并把搜索文本截到上限。
4. **部署后旧网页标签页仍能用。** 它们会把整会话上传，服务器会按编号合并，不会截掉数据；刷新页面后就是新行为。

## 10. 遗留与需要知悉

1. **侧栏搜索覆盖范围变小**：很长会话里中间的老消息内容搜不到了，见第 3 节第 2 条。如果需要全文搜索，建议另开任务让摘要查询直接搜消息行。这次没做，因为 Planner 写明侧栏不动。
2. **每问一次还有约 100 KB 的固定开销**：搜索文本的读取和写回时的 RETURNING 各两次，大小有上限，不随长度增长。把上限从 8000 字调小可以再降，代价是搜索覆盖更少。
3. **App 对话页没有动作状态卡**，新回复也没有，确认动作要去 All Actions。0110 那条遗留只针对网页，已修。
4. **网页的滚动保持**在 Chromium 上实测没问题，Safari 没有实测。代码自己做了补偿，不依赖浏览器的 scroll anchoring。
5. **交接给 0118**：有序、有上限的读取和 `nextMessageIndex` 可以直接作为手机端增量同步的依据。
## 11. 协调者复核

协调者在 `3d2cdbc9f` 上独立复核：

- **orbits 全量**：5259 条，4742 通过，0 失败，517 跳过。
- **App 全量**：3723/3723 通过。子代理那次「局部修复后没有重跑全量」，这次补上了。
- **Postgres 测试**：因为改了共享迁移，协调者跑了 `orbit_test` 上**全部**使用数据库环境变量的文件（排除需要 cutover 库的 4 个），共 261 条，255 通过，1 失败，5 跳过。
  - 失败的是 `task-page-postgres`「canonical task pages are owned…」，原因是单条语句超时（statement_timeout=15000）。
  - 用 0112 的代码单独跑 6 次，5 次通过；把迁移文件临时换回 0112 之前的版本跑 3 次，3 次通过。两边耗时相近，都在 22–31 秒。
  - 结论：大数据量测试的语句在 15 秒上限附近波动，偶尔超时；没有证据表明是 0112 新增索引造成的。已登记为不稳定用例，留待以后查根因。
  - 迁移文件对照完已恢复，工作区没有残留。
- **截图抽查**：
  - `sim-01`：App 首屏顶部是「Load earlier messages」行，沿用账本「加载更多」的样式，黑白规范，蓝色只用在文字上。
  - `web-05`：网页恢复历史会话后显示「本次安排」卡片，「确认执行」是黑色主按钮。
  - 两张都符合已批准的界面方案（用户 2026-09-28 授权协调者批准）。
- **证据目录位置**：本 Sprint 的证据在仓库根目录的 `build/harness-state/evidence/sprint-0112/`，被 `.git/info/exclude` 忽略。QA 备份文件 `qa-rows-backup.jsonl` 不会被提交。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`，先用 `concurrently` 建索引、再部署，并确认读取游标密钥已配置。
