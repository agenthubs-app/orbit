# Codex Review — Sprint 0103

审阅日期：2026-09-27。结论：**停写重复轨迹方向正确；动作列表截断会漏掉仍需用户处理的记录。**

## 审阅版本与范围

- 基线：`84890147d`；实现：`58a17ad3b`；结束报告：`39c874031`。
- 阅读 PLANNER、REPORT、普通问答运行写入、派生步骤、运行读取、子记录 target 绑定、幂等回执查找、旧数据回填及账本消费者。
- 以下问题所在实现与审阅 HEAD `ec308129ab85f2db981b5116e145b1a33c860dc3` 相同。

## 发现

### [P2] 在过滤前取最新 500 条，导致旧待确认动作从账本消失

位置：[agent-runtime-live-record-provider.ts:304](/Users/xzhao/Projects/orbit/repos/orbits/features/agent/storage/agent-runtime-live-record-provider.ts:304)，消费者：[runtime-adapter.ts:220](/Users/xzhao/Projects/orbit/repos/orbits/features/agent/ledger/runtime-adapter.ts:220)。

`listActions()` 先在持久化存储取最多 500 条所有状态的动作，再在内存按 status、workflow 和创建时间过滤。一个账号有 500 条更新更晚的已完成动作时，更早的待确认动作即便仍存在，也无法从“待确认”账本读到；按旧日期/特定 workflow 查询同样会得到假空结果。返回没有 nextCursor/hasMore，账本还会宣称“共 0 条”，控制台告警不能帮助用户找回记录。这超出了“限制单次读取量”的目标，也违背 SC-0103-04 账本显示不变。

**独立复现：** 使用真实 repository + 内存 store，按新到旧排列 500 条 completed 和 1 条 awaiting_confirmation。`listActions({status:'awaiting_confirmation'})` 返回 0，`getAction()` 仍能读到那一条。源码确认 Postgres 的 LIMIT 也在 repository 的过滤之前，问题不依赖测试 store 的排序实现。

**建议：** 将业务过滤移到 SQL、再限制一页，并让消费者显式翻页；至少保证未完成动作不会被无关历史动作挤出。补 501 条且最后一条匹配状态/workflow/日期的测试，不要仅测试总数低于上限的账本。

## 其余审阅意见与上线边界

- 派生步骤核对 runId、保留已有步骤、按 stepId 去重；普通问答一次保存 completed 运行，不再写重复步骤和开始/完成统计。未发现该主路径的可证实新增缺陷。
- 上线前应完成旧 child/request rows 的 target 回填并核验，再让消费者切换到精确读。REPORT 建议“部署后回填”会留下旧运行缺动作/回执的时间窗口；生产切换方案应避免该窗口。这里只提出意见，没有执行迁移。
- 每个运行的子记录读取也有合计 500 条上限，回执查找另有 500 条上限；现有测试证明的是“其他运行历史增加不影响读取”，没有证明“单个运行超过上限仍完整”。建议后续为内部正确性读取提供分页/精确幂等键查询，不能将截断数据用于完整性判断。未复现真实业务达到该规模，因此不另列已确认缺陷。
- 非协议 2 的普通问答步骤为空、带动作流程统计仍写入，REPORT 已披露，应保留兼容和范围边界。

## 验证与影响

- 独立执行 `tests/services/agent-conversation-run-steps.test.ts`：**3/3 通过，无跳过**；独立执行上述 501 条动作反例。
- 未跑真库、全量、付费问答或原生验证；没有改动源码、测试或数据库。
- GitNexus upstream impact：`createStorageAgentRuntimeRepository` 为 **CRITICAL**，38 个受影响符号，涵盖运行服务工厂、账本、AI 会话和动作处理入口。该结果来自旧索引，只用于识别影响方向；`context(getRun)` 仍指向旧 list 调用，不能证明新精确读已完整覆盖。
- 建议：修正筛选/分页语义后重新核对账本；不要仅以读取棘轮减 1 和历史规模测试作为 SC-0103-04 的证据。
