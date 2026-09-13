# R-02：AI 发送意图与空会话实施计划

> **For agentic workers:** 使用 `superpowers:executing-plans` 按下列步骤执行，沿用当前单代理、原目录及 `chat-agent` 分支。用户于 2026-09-13 要求外出期间按原计划自行调查、判断和执行，不再逐项问询。

**Goal:** 旧链接与业务上下文只预填问题；AI 首页已点击的发送只执行一次，空的新会话也可输入、发送和保存。

**Architecture:** 保留 Expo Router → Screen → HTTP client 与现有会话 journal。AI 首页显式点击时登记一次性、账号／服务器绑定的本地发送意图；会话路由必须消费同一意图才继续该次发送。URL 自身不授予发送权限，原有业务入口无需改为新协议。

**Tech Stack:** 现有 TypeScript、React、Expo Router、已安装的 expo-crypto、Node Test Runner 与 RNW/Playwright 真实路由交互测试；不添加依赖。

**Spec:** [剩余计划 R-02](2026-09-13-app-remaining-functionality-and-connectivity.md)、[已批准视觉](../../designs/2026-09-12-ink-signal/README.md)。本项仅收敛计划已定义的发送语义，不新增页面或改变布局。

## 约束与取舍

- `initialMessage` 默认只预填；无参数或仅空白的 `/ai/new` 仍显示现有输入框，不读取虚构的 `/api/ai/conversations/new` 详情。
- 普通挂载、刷新、返回、Cookie 更新、前后台切换与已消费链接重开均不自动生成。URL 中伪造 `send` 标记或随机意图 ID 不能触发请求。
- 首页“发送”已经是显式动作，不要求用户再点第二次。一次性意图仅存在当前 JS 进程，不写本地存储、不跨账号／服务器、不在重启后重放。
- 一次只保留最近一个意图及其来源／消费状态；确切匹配 id、账号、服务器、问题后只消费一次，跳转前不清空首页草稿。已消费记录只用于拦截重放和错误身份的预填，不形成历史队列。发送失败、结果未知、保存失败分别沿用现有恢复机制。
- 旧会话原文、已保存快照、保存回执验证、只重试保存、较新草稿、任务确认与稳定 session 地址均保留。进入另一个账号／服务器不带入原账号 URL 草稿。
- 一次性导航意图不是服务端幂等。请求超时后的服务端执行状态、跨端续聊和 B3 协议另行核实，本项不伪造 request ID 支持或关闭整个 R-02。
- 真实 AI/OCR 仍受累计 5 美元约束；本项红绿与交互回归全部替换外部网络边界，不产生模型费用。
- 编辑现有符号前完成 GitNexus upstream impact；索引失败不算通过。只提交本功能相关 App 文件，不包含原生截图、临时日志或依赖；不推送。

## 文件责任

- 新增 `src/data/ai-send-intent.ts`：一个在内存中的最近意图，负责登记、来源查询与精确消费，不承担网络、会话保存或业务权限。
- 修改 `src/screens/ai/AiScreen.tsx`：仅显式发送时生成 UUID、登记作用域和原问题，再路由到新会话。
- 修改 `app/ai/[id].tsx`：读取意图 ID，按当前作用域消费；绑定初始草稿来源，保留 journal 与已消费标记。
- 修改 `src/screens/ai/AiConversationScreen.tsx`：区分草稿与已发送，所有新会话均可输入；只有已登记的显式动作继续发送，其他初始文本只预填。
- 扩展 `tests/ink-signal-ai-conversation.test.ts` 与 `tests/ink-signal-ai-home.test.ts`：旧深链、空会话、真实首页→会话、重挂载及作用域回归；新增 `tests/ai-send-intent.test.ts` 覆盖纯内存作用域边界。
- 更新本计划、总计划与连通性记录，保留 B3／真实运行时未完成项。

## 执行步骤

- [x] 核对当前路由和两处 `initialMessage` 生产入口；首页手写发送与业务页 `onAskOrbit` 分开处理。恢复索引、运行逐符号影响分析并记录结果。
- [x] 运行现有三文件基线：156/156，0 失败／取消／跳过，31.066 秒，exit 0；日志 `/tmp/orbit-r02-intent-baseline-20260913.log`。不把历史全量结果当本次结果：

  ```sh
  node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-ai-conversation.test.ts tests/ink-signal-ai-home.test.ts tests/conversation-view-model.test.ts
  ```

- [x] 先加入真实路由失败用例：打开带初始问题的新会话后写请求为 `[]`，输入框保留原问题；刷新／失焦返回仍为 `[]`。空新会话可输入，手动发送只请求根 `/api/ai/conversations`。旧实现因自动 POST 或缺少输入框失败，不以导入错误代替红测。
- [x] 意图模块的接口与边界：

  ```ts
  type AiSendIntent = { id: string; actorId: string; baseUrl: string; message: string };
  registerAiSendIntent(intent: AiSendIntent): void;
  consumeAiSendIntent(intent: AiSendIntent): boolean;
  aiSendIntentOrigin(id: string): { actorId: string; baseUrl: string } | null;
  ```

  独立断言匹配只成功一次、不同账号／服务器／消息不成功、未登记 ID 不成功、新登记替代未使用旧意图。测试字面输入与结果，不断言 Map 私有结构。

- [x] 实施最小代码：AI 首页用已有 `expo-crypto` UUID；路由传 `sendIntent` 并在 effect 内经作用域校验后消费，不能在 render 中消费。新会话初始 journal 草稿取允许来源的 `initialMessage`；未发送的 thread 为空态，只有确实发出后才显示处理中／失败消息。保留现有 HTTP 请求和保存回执协议。
- [x] 将旧“初始生成”测试的准备动作改为真实点击发送，保留所有失败恢复与保存断言。另以真实首页和会话路由联测已点击发送的单次延续，不只用伪造 fixture 意图证明成功。
- [x] 回归双击、刷新、Cookie 变化、失焦／返回、整路由重挂载、账号／服务器切换、失败重试、保存重试及新草稿保护；未知或伪造意图保持未发送。补充真实首页已消费参数重挂载后仍有结果未知、重新生成和编辑原问题入口，不用消失的失败提示掩盖已发生请求。
- [x] 类型检查、三文件完整回归、新意图测试、契约同步检查与全量测试。最终 `npm test` 2243/2243、0 失败／取消／跳过，177.379 秒、exit 0；类型检查 exit 0、同步检查 6/6。失败／修正记录见验证文档；未运行的原生发送不算通过。

  ```sh
  npm run typecheck
  npm test
  node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts
  git diff --check
  ```

- [x] 在 Simulator 只读打开空新会话，查看实际输入框和发送按钮；服务记录五个 GET 200，没有触发模型。
- [ ] 原设备带问题旧深链与真实首页发送留待费用控制就绪后单列验收，避免失效旧 bundle 意外消费预算，不能借用本项测试费用豁免。
- [x] 完成提交前自审与 GitNexus staged detect_changes，仅暂存列出的相关文件，LOW、无列出的受影响流程。按既有授权本地提交 `fix(app): require explicit intent for AI generation`；B3、跨端及完整 R-02 保持开放，未推送。

## 自审

两类入口有不同含义：业务上下文预填不等于发送，首页发送也不降级为第二次确认。一次性意图是这一区别的最小跨路由状态，不新增通用队列或业务缓存。空会话、首次发送、保存、原稿恢复和身份切换都由现有真实路由测试覆盖；服务端幂等及付费验收仍独立记录。

自审红测补充：重复 URL 参数会提供数组，路由应与 Screen 一样读取首项，不调用数组 trim；延迟导航跨身份不能仅拦截 POST，还必须防止原问题预填。后者促使单条意图保留来源与消费状态，账号／服务器不匹配时先在 effect 取消，重新挂载或回到原身份也不自动恢复。首页在完成交接前保留原草稿，随机数模块失败时有原问题与可重试提示。这些均有真实控件测试，未扩展外部权限。

只读接口核对还发现：根 `POST /api/ai/conversations` 读取并传递 `history`，带 ID 路由的 `readSendInput` 只读取 conversationId、locale、message、scenario，没有传递 history；两个解析入口均没有生成幂等字段。本项不改 Web 或伪造已支持的协议。后续续聊修复需结合真实 session 回读选择已有根路径，服务端生成幂等仍单列 B3。
