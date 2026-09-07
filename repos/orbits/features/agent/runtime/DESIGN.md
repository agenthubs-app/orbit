# Orbit Agent Runtime

The runtime is the durable execution boundary behind Agent conversations and
confirmed actions. A conversation may produce a read-only Run or a Run with one
or more action proposals; the same Run is then used by the Agent UI, ledger,
outbox worker, and audit views.

## Run lifecycle

- Each successful conversation persists an ordered step trace.
- Step order is explicit (`sequence`) so storage backends do not decide the
  visual or execution order.
- Run progress is derived from persisted steps, never from a client-side timer.
- A non-terminal Run may be canceled. Cancellation also cancels every
  non-terminal action and pending/retry-scheduled outbox item in that Run.
- A failed or canceled Run is retryable only when it has at least one failed or
  canceled step. Retry resets only those steps and increments their attempt.
- A completed Run cannot be canceled, and a Run with executing/completed
  actions cannot be canceled through the conversation surface.

These constraints prevent a canceled confirmation card from later executing in
the worker and keep retry scope narrow enough to preserve completed work.

## API and UI boundary

`GET /api/ai/runs/:id` returns the Run, ordered steps, linked actions, and
derived progress. `POST /api/ai/runs/:id/transition` accepts only `cancel` or
`retry`. The Agent status card renders this server state and polls only while a
Run or action remains non-terminal.

The service factory caches actor-scoped runtime instances so a request never
crosses user boundaries. The cache has an explicit implementation version:
when the runtime interface changes during development hot reload, stale service
instances are discarded instead of leaking an old method surface into new
routes.

## 日历撤销的执行身份

日历动作仅在用户明确确认后创建。撤销使用当前 actor 的集成服务，从匹配 action、operation、idempotency key 的已完成回执读取 `calendar:` resultRef，再向创建时选定的 provider 删除该事件；不接受提案 payload 中的 providerRecordId 作为删除目标。删除失败不写 undone 回执，允许重试；完成后重复撤销复用既有结果。新自然语言日历提案采用能力注册表的 compensationSupported；旧持久化提案不被回写。

`agent-calendar-compensation.test.ts` 覆盖两种 provider、持久化存储适配器重建、失败重试、重复撤销与无回执拒绝；43 项运行时、工作流、集成安全和能力测试通过。使用的是测试 provider 边界，真实 OAuth/外部日历写入验收仍待完成。
