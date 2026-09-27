# Sprint 0112 — AI 会话分页、卡片按需、问答只追加（AI B1 + B2）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「AI 对话数据方案」B1、B2（`docs/designs/2026-09-27-data-architecture/ai-data-design.html` 第四节、第六节「B1 改变了用户体验」、第七节验收 6、第八节决定 2「首屏 20 条」）。
**同一目标下的必要补充（设计案未单列，报告须标明）:** ① 可靠发送每轮读 7N+7 行、写 2N+3 行（会话 N 条消息）改为只追加；② 客户端保存不再上传整个会话（分页后客户端只持有部分消息，整会话上传会把未加载的消息截掉）；③ 0098 起一直失败的读取上限审计（`orbit-agent-chat-session-live-record-provider.ts` 实际 5 > 基线 4）恢复通过。
**单一目标:** 打开与问答的会话读写量固定，与会话长度无关；两端按 20 条分页显示。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0111 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 付费调用计入 $5 账本，本 Sprint 最多 4 次（主要用造数而不是真问答来构造长会话）。

## 已查明的事实（2026-09-27）

- 会话与消息存在子空间 `${workspaceId}:actor:${actorId}`，集合 `orbit_agent_chat_sessions`、`orbit_agent_chat_messages`，无 `user_id`，`target_type=conversation`、`target_id=会话编号`；顺序字段为信纸里的 `index`（数组位置）。请求记录 `orbit_agent_chat_requests` 在 base workspace，`user_id`=本人。
- `repos/orbits/features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`：`readMessages` :390-410 按会话不设上限读取并按 `index` 排序；不设上限读取共 5 处：:396 `readMessages`、:621 `deleteSession`、:664 `listSessions`（每个会话再 `readMessages`）、:687-691 `listSessionSummariesPage` 后备分支（fc0569649 新增，仅在没有 `summaryPageClient` 时执行）、:725 `listSessionsByEntryPoint`（每个会话再 `readMessages`）。`persistSession` :505 读现有快照、:575-577 重写全部消息、:591 再读回。
- 可靠发送 `features/orbit-ai/reliable-send-service.ts`：`getSession` :334 → `upsertSession`（用户消息）:392 → `getSession` :468 → `persistSession`（助手消息）:480；路由 `app/api/ai/conversations/route.ts:858` 再 `getSession`。
- 打开会话 `GET /api/ai/conversations/sessions/[id]`（`sessions/[id]/handler.ts:139-232`）：`provider.getSession`（全部消息）+ 组织信息 + 卡片恢复（`orbit-agent-chat-session-artifact-reader.ts:22-72`：请求记录 LIMIT 101、处理 100、单条 >256KB 跳过、每轮 ≤16 个、响应上限 131KB，按 `assistant:<requestId>` 对应回合）；`PATCH` 先 `getSession`。`POST /sessions` → `upsertSession` 写整会话。
- 消费方：App `src/screens/ai/AiConversationScreen.tsx`（:169 打开、:298 POST 整会话、:460 恢复、:241 卡片）、`AiScreen.tsx`（列表、打开/删除）、`src/api/ai-session-management.ts:35`（PATCH）；网页 `app/(app)/app/agent/iorbit-0918/iorbit-model.ts:881` 读取、:899 POST 整会话，`use-agent-chat.ts:223,572,614`，历史 `use-agent-history.ts`，首页 `iorbit-home.tsx:240`（`?limit=3`）。
- 侧栏会话列表已是 SQL 摘要分页（limit ≤ 50，不读消息），不动。
- 开发库最长会话 71 条消息（`agent-session-mt03t1qp-n76n1m`）。

## 范围与文件

1. **有序、有上限的消息读取**：按（会话, 顺序号）倒序取 N 条，走索引（新增索引或把顺序号放到可索引的位置，迁移可重复执行）；游标为「上一页最早那条的顺序号」。
2. **打开会话接口**：默认返回最近 20 条 + 「是否还有更早」+ 游标；新增取更早一页的方式（同一接口带游标或新路由）；卡片恢复只针对本页包含的助手回合（按 requestId 精确读取），不再取最近 100 条。
3. **问答只追加**：可靠发送与路由不再读取或重写整会话；只写新消息与会话摘要（标题、最后预览、条数、更新时间）；需要上下文时按有上限的方式读取最近若干轮（数量与模型上下文策略保持现状，报告写明）。
4. **客户端保存**：App 与网页不再 POST 整会话；改为只发送新增/变更的消息或元数据（接口与迁移兼容：旧客户端的整会话 POST 不得截断服务器上未加载的消息——服务器按消息编号合并、不删除未包含的消息）。
5. **去掉 5 处不设上限读取**（删除或改为有上限/分页），棘轮基线相应下调，审计恢复通过。
6. **两端显示**：上翻加载、加载中状态、滚动位置保持、卡片随页恢复。
- 排除：会话进入本地副本（0118）；请求记录保留期（设计案未定）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0112-01 | 500 轮会话：打开只读 20 条消息与这 20 条对应的卡片；连续上翻读完全部，顺序正确无重复无遗漏 | 真库测试（先 RED）+ 读取计量 |
| SC-0112-02 | 每轮问答读写的消息行数与会话长度无关（10 条 vs 500 条会话实测相同）；旧客户端整会话 POST 不会截断服务器消息 | 真库测试 + 读取计量 |
| SC-0112-03 | App 与网页：上翻加载、滚动位置保持、卡片恢复、新消息追加显示正确 | App/网页测试 + phoneweb 与 Simulator 截图/录屏 |
| SC-0112-04 | 不设上限读取审计通过（chat-session provider 与 transactions 文件中涉及会话消息的项全部清除，基线下调）；跨账号不可读他人会话 | 审计测试 + 隔离测试 |
| SC-0112-05 | 两端全量、typecheck 通过；小票显示打开会话与问答的读取量下降 | 摘要 + 小票对照 |

## 测试

- 档位 H（AI 主路径 + 两端界面 + 存储顺序）。开发集：会话 provider、可靠发送、会话路由、卡片恢复的 Postgres 测试；App/网页会话屏幕测试；收口：两端全量。
- 长会话用脚本在本地库造数（不走模型）；真问答只做 1–2 次验证追加路径。

## 失败与交接

交接给 0118：会话消息的有序、有上限读取与顺序号是放进手机时增量同步的依据。
