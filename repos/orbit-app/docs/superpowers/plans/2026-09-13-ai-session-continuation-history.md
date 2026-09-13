# R-02：每轮会话续聊携带历史

> **For agentic workers:** 使用 `superpowers:executing-plans`，沿用已选的单代理、原目录和 `chat-agent` 分支；每个功能单独本地提交，不推送。

**Goal:** 从已保存的会话继续交流时，每轮都携带该会话的近期消息，不在首次成功回复后丢失上下文。

**Architecture:** 保留现有 Screen、journal、HTTP client 和 session 保存回执。属于草稿或已保存 session 的发送始终使用支持 `history` 的根 POST；普通旧 conversation 详情仍使用原有带 ID 路径。不修改 Web、服务端权限或保存协议。

**Tech Stack:** TypeScript、现有 Expo Router / RNW / Playwright 真实路由测试、Node Test Runner；无新依赖。

**Spec:** [剩余计划 R-02](2026-09-13-app-remaining-functionality-and-connectivity.md)、[显式发送子功能](2026-09-13-ai-explicit-send-intent.md)。本项落实原范围中的会话恢复，不新增页面或视觉设计。

## 已核实契约与边界

- Web 根 `POST /api/ai/conversations` 的 `readSendInput` 读取 history；带 ID 的 route 不读取。App 首次 session 发送走根路径，得到 resolvedConversationId 后下一次却走带 ID 路径，因此不再提交历史。
- 既有 App 历史窗口最多 8 条 user/assistant 消息，本项保持该窗口；Web 根 route 最多接收最近 12 条、每条 trim 后最多 2000 字，而实际 live runtime 再取最后 8 条，与 App 一致。会话保存的 100 条／每条 12000 字是另一套限制，不能称为模型会完整读取全部保存原文。
- 仅使用当前 thread 已确认消息作历史，不混入输入框尚未发送的内容。空新会话第一次发送仍不附加空 history。
- 保留 session ID、自定义标题、置顶、旧原文和已有保存失败恢复；网络失败重试仍使用当次冻结的请求，不重新拼装新的历史。
- 前端路径修复不构成 B3 请求 ID／服务端幂等，也不等于实际模型、持久化或跨端回读已通过。真实 AI/OCR 累计 5 美元边界保持，本项受控测试不调用模型。

## 文件与接口

- 修改 `src/screens/ai/AiConversationScreen.tsx` 内的 `sendMessage()`；复用 `conversationHistoryForRequest()` 和 `submitRequest(SendRequest)`，不新增公共类型或业务抽象。
- 扩展 `tests/ink-signal-ai-conversation.test.ts`，继续使用真实路由、Screen、HTTP client；网络、认证和原生能力只在外部边界替换。
- 更新本计划、总计划、连通性记录中的 R-02 子步骤；不能关闭尚未完成的 B3 和真实回读。

## 执行与验证

- [x] 两文件基线 104/104，35.803 秒、exit 0，0 失败／取消／跳过；日志 `/tmp/orbit-r02-history-baseline-20260913.log`。
- [x] 当前 commit 后刷新根 GitNexus 索引，分别对 AiConversationScreen、该文件 sendMessage、测试 fixture/open 做 upstream impact；报告实际范围后再编辑符号。
- [x] 加入并运行失败用例：打开包含两条旧消息的真实 session 路由，发送“再想一个方案”，响应后保存回执确认，再发送“接着讨论下一步”。断言第二轮仍走根 POST，history 是旧两条＋上一轮问答；生成后再次保存的 session 仍保留同一 ID／标题及全部六条消息。原实现因第二轮使用 `/api/ai/conversations/conversation%3A1` 且没有 history 而失败。

  ```ts
  assert.deepEqual((await writes(p))[2], {
    method: "POST", path: "/api/ai/conversations",
    body: { locale: "zh", message: "接着讨论下一步", history: [
      { role: "user", content: "讨论产品试点" },
      { role: "assistant", content: "梳理了试点范围、时间节点和资源需求。" },
      { role: "user", content: "再想一个方案" },
      { role: "assistant", content: "可以先讨论时间安排。" }
    ] }
  });
  ```

- [x] 加入并运行草稿场景失败用例：`/ai/new` 手动发送后输入下一条草稿，第一轮生成／保存确认不跳走，第二轮根 POST 只携带上一轮已确认的两条消息；若第二轮失败，在另写草稿后重试仍重发冻结的第二轮正文及历史，不混入第三条草稿。另保护首次生成失败后编辑重发的路径：失败消息不是已确认历史，重发仍不附加 history。
- [x] 最小实现，仅调整发送路径优先级和 history 是否提供：

  ```ts
  const usesSessionHistory = isDraftConversation || isStoredAgentSession || Boolean(previousSession);
  const history = previousSession ? conversationHistoryForRequest() : undefined;
  const sendPath = usesSessionHistory ? ORBIT_API_ENDPOINTS.conversations
    : resolvedConversationId ? aiConversationPath(resolvedConversationId) : path;
  await submitRequest({ path: sendPath, message, revision: draftRevision.current,
    history: history?.length ? history : undefined });
  ```

- [x] 回归新用例、原两文件 104 项基线，复验首次空会话无 history、原 conversation 详情路径不变、双击／作用域／保存回执／原稿保护仍通过。再运行 `npm run typecheck`、6 项契约同步检查与 `npm test` 全量；失败必须先定位，未运行项不标通过。
- [x] 自审实际 diff 与冻结重试行为；GitNexus staged detect_changes 后仅暂存本功能文件，以 `fix(app): preserve history across session continuations` 单独提交。原生真实续聊和跨端回读在费用控制就绪后执行，当前不提前声称通过。

## 自审结论

修复直接使用服务端已有 history 入口，不添加 API 字段、修改服务端、把 session ID 当 conversation ID 或新增本地会话存储。普通 conversation 路由与既有历史窗口不在本项扩展；完整 R-02 的服务端幂等、窗口产品语义和真实联验保持开放。

## 验证结果

- 基于 `eef661284` 刷新索引，259.9 秒、exit 0；390339 节点／559055 边／300 流程。编辑前四个目标均 LOW，0 个已识别直接调用者／流程；没有以图中零调用代替真实路由回归。
- 红测：新增三项中，两项因续聊错误路径且缺少 history 失败，一项首次失败重发保护通过。最小改动后 3/3，2.262 秒、exit 0。
- 两文件行为回归与六项同步检查合计 113/113，65.255 秒、exit 0；类型检查 exit 0。
- 全量 `npm test` 2246/2246，189.429 秒、exit 0；0 失败／取消／跳过。
- 提交前 staged detect_changes：5 文件、LOW、0 个列出的受影响流程；25 个触及项含文档、常量及旧行号重叠，并非 25 个改动函数。实际生产 diff 仅 sendMessage 的路径／history 选择，测试仅增加三个场景，没有修改既有断言或 fixture。
- 日志：`/tmp/orbit-r02-history-red-20260913.log`、`/tmp/orbit-r02-history-green-20260913.log`、`/tmp/orbit-r02-history-regression-20260913.log`、`/tmp/orbit-r02-history-typecheck-20260913.log`、`/tmp/orbit-r02-history-full-20260913.log`。
