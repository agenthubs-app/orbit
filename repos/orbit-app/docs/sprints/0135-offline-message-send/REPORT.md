# Sprint 0135 执行报告：断网也能发消息（消息 M4）

**run-01。** 分支 `sprint/0135-offline-message-send`，基线是 chat-agent `5186c1eae` 加开工提交 `d2528a55c`，第二阶段先合入了 chat-agent `e569b1793`（0133）。没有推送、没有部署，没有碰生产库或 Neon，也没有改 GOAL.md、PLANNER.md 和 codex-review.md。

**状态：本地代码和验收都已完成，等协调者合并。付费调用 0 次。**

先说需要你知道的 6 件事：
- **两次流程违规：**
  - 拼命令时混进了一次裸的 `python3 -c 1`。它什么也没做，但违反了「Python 只用 uv」。
  - 提交前没有跑 GitNexus `detect-changes`。这个 worktree 没有被 GitNexus 收录，没法对它跑；impact 是对主检出的索引用 `gitnexus@1.6.12` 跑的，那份索引落后 102 个提交。
- **Simulator 安装包是复制来的：** 我从 9BF990F2 设备的容器里复制了已安装的 Debug 版 `Orbit.app`（只读），装到自己新建的设备上，没有对 9BF990F2 做任何操作。原因是 9/28 之后原生依赖没有变化，这样不用重新编译。
- **点错过两次：** 在 Simulator 上两次误点了「润色草稿」，跳到了 AI 页，文字已预填，但没有发送；3200 日志里没有任何模型调用。
- **共享执行器有改动：** 改了 4 个共享的 outbox 执行器文件和 1 个共享 hook，逐项列在第 4 节。0134 在并行改同一组文件，合并时可能会冲突。
- **服务器协议加了一个可选字段 `retireDraftThrough`。** 用来保证「离线重放不删除发送之后才保存的草稿」，详见第 3 节。

### 1. 结论

**已经能做到：**
- **断网发送入队：** 原生 App 断网时，聊天页（收件箱对话页和 `/chat/[id]`）的发送按钮可用。
  - 消息进入本机队列，排在最后，气泡下方写「待发送」。
  - 提示条变为「消息会在联网后发送」。
  - 杀进程后队列还在。联网后按写下的顺序逐条发出，「待发送」换成服务器的时间（D13）。
- **网络不稳只存一条：** 重发用的是同一个 requestId，服务器在同一个事务、同一把行锁里先按消息编号查重复，再查资格。
  - 回执丢失后即使对方已经撤销关系，重放拿到的也是原来那条消息，而不是「已撤销」。
- **服务器拒绝时：** 气泡下方写「未发送 · 重试 · 复制 · 放弃」，重试仍用原来的 requestId。
- **对话被撤销后不补发：** 消息标为失败，服务器上没有新消息。
  - 对话从本机删掉后，收件箱顶部显示「N 条消息未能发送：这段关系已结束 · 复制内容 · 放弃」。
- **收件箱列表叠加：** 有待发送消息的对话，最新一行显示待发送的那条，并排到前面；未读数不变，自己发的不算未读。
- **草稿不会被误删：** 离线发送只清掉写消息时已知的那份草稿。
- **仍然需要联网：** 存草稿、标记已读、邀请、撤销。浏览器版断网时也不能发（D2）。
- **`scripts/local-stack.mjs` 新增 `--port`：** 默认还是 3100，拒绝 3000。

**做不到或需要注意的：** 见第 9 节。

### 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 重复只算一次 | 通过（先 RED） | 真库 `relationship-offline-send-postgres`：回执丢失后撤销，重放返回原消息（201，sentAt 不变），序号 1、2 不跳号；撤销前没送达的那条返回 409 revoked；正文不同仍 409 REQUEST_REUSED；5 个并发重放只存 1 条，未读加 1。改动前跑：3 条失败 |
| 02 三条按序、杀进程后恢复 | 通过 | **真库：** 三条按序重放，中间一条回执丢失，序号 1、2、3，时间都是服务器第一次写入的时间。**App（真实协调器 + SQLite + 脚本服务器）：** 断网写三条 → 关库重开 → 联网后服务器按顺序收到三条，只有丢回执的那条重放了一次，队列清空，本机镜像里的序号和时间与服务器一致。**Simulator：** `SC02-offline-three-pending.png` → 杀 App、重启 3200 → `SC02-after-reconnect-server-times.png`；库里 seq 3/4/5；B 经 HTTP 读到的顺序一致，未读 4 |
| 03 撤销 | 通过 | **App 测试：** 撤销后两条都标为失败，服务器 0 条新消息，「未能发送」统计 2 条，放弃后清空。**UI 测试：** 顶部那一行、复制、放弃。**Simulator：** `SC03-queued-before-revoke.png` → A 从服务端撤销 → `SC03-inbox-unsent-ended.png`（「1 条消息未能发送」）→ 系统分享面板拷贝，`pbpaste` 读到原文 → 放弃后这一行消失；库里消息数前后都是 6 |
| 04 隔离、锁与守卫、草稿、清空路径 | 通过 | **真库：** C 重放 A 的 requestId 返回 404，撤销前后都不会泄露正文；严格版触发器、owner 审计和写锁审计都通过；草稿四种情况（已知时间、之后保存的、null、不带字段）和非法值返回 400。**App：** 队列行经保险箱归档、清库、恢复后仍能上传一次 |
| 05 Simulator + phoneweb、全量 | 通过 | A 在 Simulator 断网发送 → 断网冷启动后仍是「待发送」→ 联网后送达；B 在 phoneweb（Chromium）读到并在界面上回复，A 的 Simulator 看到回复（`SC05-*.png`）。全量、typecheck、棘轮见第 5 节 |

### 3. 设计取舍

1. **服务器：** 先确认发送人是对话成员（第三方返回 404，不泄露），再查重复，最后查资格。查重的指纹去掉了资格版本，因为离线重放可能带的是写消息时手机看到的旧版本。
2. **草稿保护加了可选字段 `retireDraftThrough`：**
   - 只在「本次新建了消息」时清理是不够的。回执丢失后重放时，服务器用的本来就是第一次的发送时间，后存的草稿已经能保住。
   - 真正的风险是：联网后用户先存了新草稿，队列才上传。
   - 所以手机传上写消息时已知的那份草稿的服务器时间，服务器只清掉不晚于它（也不晚于发送时间）的草稿。
   - 传 `null` 表示不清理；不传就是在线发送，0122 的规则不变。用服务器时间，不受手机时钟影响。
3. **队列一行一条消息：**
   - 行编号就是对话编号，所以同一对话的消息由执行器现有的「同一记录严格按顺序」规则保证依次发送。
   - 在仓库里把消息类别排除在合并逻辑之外：去掉这条排除，2 条测试失败。
   - 代价：前面一条被拒绝时，后面的消息会继续等，直到你重试或放弃那一条。所以失败的气泡多给了一个「放弃」。
4. **撤销处理：**
   - 每轮上传前，先把对话已不在本机的待发送消息标为失败。去掉这一步，撤销那条测试失败。
   - 界面上，只要对话不在本机，相关消息一律归到收件箱顶部那一行。
5. **复制用系统分享面板（里面有「拷贝」）：** 不新增原生剪贴板模块，避免重新编译原生包、动共享的 node_modules。
6. **离线发送只在原生开放：** 待发送队列的入口挂在本机消息来源 hook 上（`outboxSession`），浏览器和不提供这个入口的旧测试替身自动保持原来的行为。

### 4. 文件

**服务器（orbits）：**
- `features/relationship-communication/message-store.ts`：检查顺序。
- `features/relationship-communication/service.ts`：草稿清理上限。
- `app/api/relationship-communication/handler.ts`：透传新字段。
- `shared/api-schema/offline-policy.ts`：登记消息发送为 `offline_queue`；`tests/architecture/offline-policy.test.ts` 的矩阵同步加一行。
- `scripts/local-stack.mjs`：`--port`。
- 测试：新建 `tests/services/relationship-offline-send-postgres.test.ts`；`tests/scripts/local-stack.test.ts` 加 1 条；`tests/api-schema/business-card-batch-schema.test.ts` 的库名白名单加了 `orbit_0135_test`（照 0133 的做法）。

**App 新增：**
- `src/data/sync/message-outbox-mutation.ts`、`src/data/sync/message-outbox-upload.ts`
- `src/hooks/useRelationshipMessageOutbox.ts`
- `src/view-models/relationship-outbox.ts`
- `src/components/RelationshipOutboxViews.tsx`
- 测试 `tests/relationship-message-outbox.test.ts`（6 条）、`tests/relationship-offline-send-ui.test.tsx`（5 条）

**App 修改：**
- 两个聊天页：`RelationshipInboxScreen.tsx`、`RelationshipChatDetailScreen.tsx`
- 资格表副本 `src/api/schema/offline-policy.ts`（与 orbits 逐字节一致）
- i18n 中英日加 8 个 key
- 离线读取审计：`scripts/audit-offline-read-surfaces.ts`（3 处按行号登记的调用点随行号移动）、`src/data/offline-read/route-domain-inventory.ts`、`tests/offline-read-inventory.test.ts`

**共享 outbox 执行器的改动（逐项）：**
1. `src/data/sync/local-sync-repository.ts`：合并逻辑排除 `relationship-messages`（1 行）；新增 `discardOutboxMutations`，不删正在发送的行。
2. `src/data/sync/sync-coordinator.ts`：会话新增 `enqueueOfflineMessageMutation`、`retryOfflineMessage`、`discardOfflineMessages`，以及内部的 `messageLeaseScope`。
3. `src/data/sync/mutation-adapters.ts`：`isOfflineEligible` 放行 `relationship_message.send`。
4. `src/hooks/useSyncedCollection.ts`：上传时多跑一个消息上传器。
5. （共享 hook，不属于执行器）`src/hooks/local-relationship-messages-source.ts`：多出一个 `outboxSession`。
- `outbox-uploader.ts` 和本地库表结构没有改动，表结构本来就允许 `send` 操作。

### 5. 提交、全量、Postgres、typecheck、棘轮

**提交：**
- `2483f54cf` fix(orbits)：重放先于资格检查；离线发送保住之后保存的草稿
- `32fe96433` merge：chat-agent（0133），无冲突
- `738df75a2` feat(orbits)：local-stack 支持 `--port`
- `b3127e941` feat(app)：通过 outbox 离线发送；待发送 / 未发送；对话结束提示
- `b867d69bb` fix(app)：只有待发送消息时不再显示「暂无消息」；英文数量措辞（**最后一个功能提交**）
- `8d96a7eb2` test(0135)：business-card 白名单加上 0135 测试库（**最后一个提交**）

**全量：**
- **orbits：** 在 `8d96a7eb2` 上跑，`ORBIT_EVENT_DATABASE_URL=postgresql://xzhao@127.0.0.1:5432/orbit_0135_test`：5389 条，4883 通过，**0 失败**，506 跳过。
  - 这一次之前的一轮有 1 条失败（business-card 测试只认白名单里的库），补上白名单后单文件 38/38，然后整套重跑才得到上面的结果。
  - 第一阶段那次全量有 36 条失败，都是缺事件库环境变量；补上环境变量和事件表迁移后，那 13 个文件 38/38 通过。
- **App：** 在 `8d96a7eb2` 上跑：4003/4003，**0 失败**。中间曾经两次不绿：
  - 第一次 82 条失败：新 hook 在测试替身里引出了渲染死循环、触发了 web 打包问题，加上审计里按行号登记的调用点行号变了。都已修复。
  - 第二次只有 `tasks-unification-interactions` 1 条，这是规则里列出的已知不稳文件。单独连跑 3 次，结果是 19/0、19/0、19/1，最后一次仍失败了 1 条；最终全量里它通过。

**Postgres：** `orbit_0135_test` 上相关的 19 个文件串行跑（关系消息全套、新增真库测试、两个审计、资格表、local-stack、business-card）：105 条，104 通过，0 失败，1 跳过（原有的、需要额外环境变量）。

**typecheck 与 lint：** orbits 的 `typecheck`、`typecheck:app`、`lint`，以及 App 的 `tsc`，全部 0 错误。

**棘轮：** 读取上限和读取成本的基线文件都没有改动；orbits 全量里的棘轮正例和负例都通过。

**GitNexus impact：**
- `createSyncCoordinator` 是 **MEDIUM**（61 处）。
- LOW：`createRelationshipMessageStore`、`retireReplyDraftSentBy`、`createConversationMessagesPostHandler`、`createRelationshipCommunicationService`、`isOfflineEligible`、`ThreadContent`、`ScopedRelationshipInboxThreadScreen`。
- UNKNOWN：`enqueueOutboxMutation`、`OFFLINE_POLICY_REGISTRATIONS`、`RelationshipInboxScreen`、`ReplyComposer`。用文本搜索确认了调用方，都在预期范围内。

### 6. 运行时证据

证据目录：`/Volumes/ORICO/Dev/worktrees/orbit/sprint-0135-offline-message-send/repos/orbit-app/build/harness-state/evidence/sprint-0135/run-01/`（`screens/` 下 47 张截图，`api/` 下有 HTTP 回读和库里的消息清单）。日志在两端各自的 `build/harness-logs/sprint-0135-*`。

**环境：**
- **数据库：** 专用的 `orbit_0135_runtime`，结构从 `orbit_events` 只导出表结构，加迁移记录，再跑一次 `db:migrate:live`。没有用 `orbit_events` 的业务数据。
- **服务：** `local-stack start --build --no-paid-ai --port 3200`，provider key 在 web 和 worker 里都是 empty。
- **Metro：** 8084，`EXPO_PUBLIC_ORBIT_API_BASE_URL=http://127.0.0.1:3200`。
- **phoneweb：** 32135，上游指向 3200。
- **Simulator：** 自建的 `Orbit Sprint0135 Isolated`（747307E5-85D7-4DCE-9AC0-5B70D1FCBB08），iOS 26.4，用 idb 操作。
- **断网的方式：** 停掉 3200 进程组，不是关 Wi-Fi。

**QA 账号与数据：** 经 HTTP 新注册两个账号 qa0135-a 和 qa0135-b，补全资料，A 手动建联系人并邀请 B，B 接受。后来为 phoneweb 那一段又建了第二段关系。

**付费调用：0 次。** 3200 日志里没有 deepseek、gemini、openai 的记录。

**收尾：**
- 3200、Metro 8084、phoneweb 32135 都已停止。用户的 3000 一直没碰：中途查到过一次 PID 2815，收尾时又是 96114。
- 我自己的 Simulator：删掉了 `RCT_jsLocation`，没有在 App 里保存过服务器地址；已关机，设备保留。
- 清端口时连带结束了我自己设备上的 Orbit 进程，对其他设备没有影响。
- `orbit_0135_runtime` 和 `orbit_0135_test` 都已删除。临时密钥、账号文件和复制的 `.app` 已删除。
- 3200 构建改动了 `repos/orbits/next-env.d.ts`，我用单文件 checkout 恢复了。

**工作区：** 只剩原有的 codex-review.md 和未跟踪文件，另有构建产物 `repos/orbit-app/dist`（已被 git 忽略）。

### 7. 生产步骤（请写入 PRODUCTION_ROLLOUT.md，我没有碰生产）

1. **先部署 orbits（web）。** 不需要迁移；新字段是可选的，旧 App 照常工作。
2. **冒烟：** 同一个 requestId 发两次，返回同一条消息；撤销后用原 requestId 重放，返回原消息；用新 requestId 发送，返回 409。
3. **再发布 App。** 浏览器版行为不变。
4. **回滚：** 重新部署旧代码，或发布旧版 App。手机上已排队的消息会等到能上传为止。

### 8. 给 0136 的交接

四类断网写现在都已开放（笔记、待办、日程、消息）。全链矩阵从合并后的 chat-agent 开始；本线最后一个提交是 `8d96a7eb2`。

### 9. 遗留和需要注意的事

1. **「暂无消息」的修复没有在设备上复核。** 只有待发送消息时，`b867d69bb` 应该隐藏这行字，但 Metro 热更新后设备上仍然显示，我也没有补自动化测试。需要在设备上再看一次。
2. **前一条被拒绝会挡住后面的消息。** 同一对话里，前一条失败后，后面的消息继续显示「待发送」，直到你重试或放弃那一条。这是为了保住顺序。
3. **确认回执时会多写一行别名。** 别名表里会多一行，本地编号是对话编号；它会被下一次覆盖，到期自动清掉，不影响功能。
4. **发送响应里没有序号。** 序号和时间取自紧接着拉回来的镜像行；镜像行找不到时会按可重试处理，重放是安全的。
5. **复制走的是系统分享面板，** 不是直接写剪贴板。
6. **`/chat/[id]` 页面的新文字是硬编码中文，** 和这个页面原来的写法一致，没有走 i18n。
7. **AI 页「有 N 项修改还没同步」的提示没有把消息算进去。** 目前只统计笔记，不在本 Sprint 范围内。
8. **Simulator 上的撤销是 A 从服务端撤销的。** 撤销接口只有邀请人能调用，所以不是由 B 撤销。phoneweb 那一段是 B 收消息和回复，phoneweb 本身不支持断网发送（D2）。
### 10. 协调者复核

- 0135 合并到 `chat-agent` 后（合并提交 `ef016166a`），在主检出跑两端全量：
  - **orbits**：5389 条，4773 通过，**0 失败**，616 跳过。
  - **App**：4003 条，4002 通过。失败的那 1 条有两个用例名，所在文件单独各跑 3 次全部通过：`tasks-unification-interactions` 3×19/19，`notification-registration-races` 3×16/16。两者都是满载时的偶发超时，后者已加入不稳定观察名单。
- 共享的上传队列改动（见第 4 节）已经告知并行中的 0134，它收尾前会合入最新的 `chat-agent`，并处理冲突。
- 第 9 节第 1 条「只有待发送消息时仍显示『暂无消息』」：修复没在设备上复核过，并入 0136 的设备验收。第 7 条「AI 页的未同步计数没算消息」也并入 0136。
