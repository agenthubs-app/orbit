# Sprint 0047 — Web 历史 AI 会话续聊输入 Implementation Plan

> 执行者遵守项目 RULES 的单一 Generator、TDD 和固定 SHA 交接；不调用用户已取消的 brainstorming/executing-plans，不引入逐任务 Reviewer。当前仅 planned，run_count=0，由协调线核就绪后派发。

**Goal:** 历史会话重开后可以在 Web 原会话继续提问，并双端读回。

**Architecture:** 在现有 agent inChat 分支提供唯一显式 composer，复用现有 `ask`/reliable-send 和 canonical 会话恢复链。保留跨页 global dock 门禁，不新建发送协议。

**Tech Stack:** 现有 Next/React、TypeScript、node:test、Playwright；不安装新框架。

**Spec:** [实测证据与设计](AUDIT-DESIGN.md)。原需求 R-00/R-02/R-14，关联 0044 SC02/03/05 的具体新增失败，不克隆整个失败 Sprint。基线 `6a8d22556e937912dcf5d5298cd6b8ca585106c8`；此前连续修复指令可复用，但实际 run、文件锁和真实付费动作另核登记。

## 全局边界与进入条件

- C0043 活动、E0046 身份/fixture 准备可并行，不改它们的文件；默认最多两个 root 实现 Generator，本项排队。
- Phone PW0010 `orbit-real-agent.tsx`/`ask` 展示切片先固定 SHA 并移交，不能覆盖其同函数修改；0036 manifest/registry/source-read 和共用 auth/store 均不改。
- 实際本地生产 Web 与主包8082同 canonical QA，固定实际 native/API 地址/数据库/UDID。重启主机后不能复用旧 PID；Web 改动必须 production build/restart/health 再实测。
- 无生产 seed/migration、OAuth、Push 或外部动作；确定性测试全部截获外出。真实 provider 仅用户显式 UI 发送且协调者另核次数/原全局 $5 ledger，无 reservation 未确认时不追加。
- 不增加分析、消息组织或历史编辑能力，不删既存用户历史。测试写入限定新建精确自有会话及原 UI 清理。

## 文件与接口

- 修改 `repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx`：inChat composer、必要草稿/加载提交状态最小接线；消费现有 `ask(query, retryAssistantIndex?, originOverride?)`，不重新调用 fetch 绕过它。
- `repos/orbits/app/(app)/app/orbit-global-ask/orbit-global-ask.tsx` 和 `orbit-ask-context.tsx` 只作为门禁/草稿约定参考；确有必要改动需追加精确 impact/consumer，不把全局浮球改成 agent composer。
- 新建 `repos/orbits/tests/pages/app-agent-session-continuation.browser.mjs`：复用现有 `app-agent-task-interaction.browser.mjs` 的 isolated preview/auth/intercept 方式，使用完整有效 canonical snapshot/reliable receipt fixture，不用旧直接 POST 假保存链代替可靠协议。
- 回归现有 `tests/ui/orbit-global-ask-routes.test.ts`、`orbit-global-ask-pinned-bar.test.ts`、`tests/capabilities/orbit-agent-conversation-readback.test.ts`及 `features/orbit-ai/reliable-send-service` 完整直属测试。必要样式文件先登记，生成 contract 不变不重复 sync。

## 五项验收

| SC | 可观察行为 | 证据 |
| --- | --- | --- |
| 01 | Web 历史点击→已有会话消息及唯一可操作输入框；空白禁用，加载/pending 防重复 | 实际 DOM 操作与 intercepted HTTP，390px/desktop 不遮挡消息 |
| 02 | 用户追问落到恢复的 exact session/canonical actor/current server revision，不自动另建会话；一次点击只一逻辑请求 | history→输入→submit→formalGET 消息增加，可靠回执与跨 actor 拒绝回归 |
| 03 | HTTP/网络失败可见、保留可恢复输入/原请求；显式 retry 不伪成功或重复执行，切会话 lateACK 不串数据 | browser failure/unknown outcome 与可靠消费者完整行为测试 |
| 04 | dashboard 初始提问、跨页 global ask、task artifact 持久恢复和 Phone people fallback 仍正确；无第二浮球/绕过身份 | 既有 global ask/task browser 与 PW0010 相关结果展示同版本复验 |
| 05 | production Web 重建启动后，真实同账号 Web 历史→续聊→刷新→主包重开读回；精确清理、固定 SHA merge/push | 原生/API/费用/cleanup receipt；缺真实 provider 对应行未测，不用 intercept 代替 |

## 单操作链执行步骤

- [ ] **RED：** 在隔离预览拦截正式会话 API，准备两条有效保存消息和 revision2；点击历史恢复后断言 `await page.getByRole('textbox').count()` 等于1。当前实际DOM0应失败，不用源码 regex 当回归。
- [ ] **最小实现：** 对待改组件/函数先固定 root upstream impact，高风险先报告。仅在 inChat 消息区之后增加可访问 form，提交事件 `preventDefault()` 后显式调用现有 `ask(trimmedQuery)`，空白、恢复未完成或 thinking 时不提交；用现有可靠回执决定清稿，失败/unknown outcome 不换请求。不无条件在 Promise.resolve 后清稿，因为现有 ask catch 会消费错误。
- [ ] **GREEN：** 完整 browser 用例截获所有 API/provider/业务写，只允许测试响应：history exact ID/revision→一次发送→同会话两条新增消息→reload；注入401/409/503/网络unknown/pending与session切换。确认 malformed/foreign snapshot仍 fail closed，task/people结果保留。
- [ ] **操作链提交：** 运行完整直属 node:test 文件、Web typecheck；此身份/发送共享链为H，代码冻结收口一次受影响端集成，不逐小提交全量。任何已有 full baseline FAIL/skip 保留，不改记全绿。执行 root staged detect（注明 worktree mapping局限）与精确 own staged/commit范围后提交。
- [ ] **实际交付：** 固定功能 SHA 交ROOT；ROOT merge chat-agent→production build/restart/health→主包8082实际同会话交互。真实付费前核 ledger 和批准，只读问题不写业务域；报告记录请求次数/结算、SC缺项和精确session UI清理→formalGET404。报告与功能commit分别固定，普通 push 独立核远端 SHA。

失败上限及交付遵守 [RULES](../RULES.md) 与 [共同契约](../SIMULATOR_REMEDIATION_PROGRAM.md#4-共同执行验收和交付约束)。每错误最多两个局部修复，不重开 0044、不自动第二 run，不用 API 直接发请求绕过缺失入口。当前文档没有声明测试已运行或功能已完成。
