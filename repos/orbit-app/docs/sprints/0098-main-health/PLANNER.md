# Sprint 0098 — 主线健康

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 2026-09-27 用户指令「我希望你自己去修」（主线 App 81 条失败）；Sprint 路线 0098。
**单一目标:** 两端全量回到可验收：App 除已登记环境类失败外全绿；orbits 全量可跑完且无新增失败。
**基线:** `chat-agent` @ `eadf3bd39`（已快进 Li-QY 新 6 个提交）。2026-09-26 在 `4c168c60b` 实测：App 3622 条 / 81 fail（集中在 `relationship-inbox-lifecycle` 23、`relationship-inbox-badge-lifecycle` 21、`ink-signal-inbox` 12、`ink-signal-contact-detail` 8、`app-wide-workspaces` 6；主因 Li-QY 新引入的 `/api/inbox/summary` 合并协议及 404 回退探测；已确证一例 `today-tasks-screen-source.test.ts:33` 断言 `todayState.refresh()` 而源码已改为 `todayState.state.refresh()`）。orbits：`tests/pages/event-registration-readback.test.tsx` 挂起；绕开后 4915 / 38 fail，均为 0097 已分类群。

## 判断

1. **先分清测试过期还是产品坏了。** 断言与新实现不一致而产品行为正确的，改测试；产品行为真错的，改产品并补反例。每条在报告里归类。
2. **不许用 skip 换绿**（沿用 0097 判断 1）。
3. **挂起测试先定位原因**（等待未关闭的服务器／句柄／轮询），修到能在合理时间内完成；不能靠整体超时掩盖。
4. 0097 D 群（运行时证据）只登记，不改运行方式。

## 范围

- App、orbits 两端失败/挂起涉及的测试文件与必要的产品代码。
- **排除**：与失败无关的重构；改变产品行为来迎合过期断言。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0098-01 | App 全量：失败仅剩报告中逐条列明原因的环境类用例 | 修前/修后全量摘要 + 失败清单 |
| SC-0098-02 | orbits 全量能跑完，`event-registration-readback` 不再挂起 | 全量耗时与摘要 |
| SC-0098-03 | orbits 失败数 ≤ 38 且每条对得上 0097 分类或本报告新增说明 | 对照表 |
| SC-0098-04 | 每条修复归类为「测试过期」或「产品缺陷」，产品缺陷有反例测试 | 报告表 |
| SC-0098-05 | 两端 typecheck 通过；读取上限棘轮不增加 | 输出摘要 |

## 失败与交接

同一失败两轮修复不过则如实记为未修，写明假设与证据，不阻塞其余修复。
