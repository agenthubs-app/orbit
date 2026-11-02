# Sprint 0144 — 离线资格表和实际一致

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态以[登记表](../README.md#sprint-登记表)为准。
**原需求:** 2026-11-02 断网写设计核对偏差 3、5，小问题 a、d；用户 2026-11-02 决定见 GOAL。
**单一目标:** `src/api/schema/offline-policy.ts` 及其守卫与实际断网写一致。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0143 合入后的 `chat-agent`；分支 `offline-fixes-20261102`。
**进入条件:** 0143 已合入。

## 已确认的事实

- 关系跟进断网完成／推迟：R20a（a4e91afd1），`data/sync/task-outbox-mutation.ts:18`、`sync-coordinator.ts:931`；`data/offline/policy-registry.ts:18` 仍标为只能在线。服务器 `tasks/service.ts` complete 只改任务行。
- iOrbit 历史整理／删除：R21，`AiScreen.tsx:586,692`；`sync-coordinator.ts:944` 跳过资格检查。
- 删除联系人：LF12，`useDeleteContact.ts`、`sync-coordinator.ts:999`；服务器只软删本人联系人行（`features/contacts/delete/service.ts`）。
- 消息发送：`offline-policy.ts:56`、`mutation-adapters.ts:18` 仍允许，入口已于 8316390c0 移除。
- `todo.unavailable`：`TodoScreen.tsx:374,408`。
- 笔记删除：`delete-note.ts`，未检查排队中的修改。

## 范围与文件

- 修改：`offline-policy.ts`、`policy-registry.ts`、`mutation-adapters.ts`、`sync-coordinator.ts` 的资格调用、`TodoScreen.tsx`、笔记删除入口、`docs/sprints/0120-offline-write-design/` 中 D6 的补充说明；相关测试与 i18n。
- 保留：消息发送队列代码（不删）。
- 排除：服务器改动。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0144-01 | 三类断网操作登记在资格表，保存时和上传前都走同一资格检查；「完成并记录结果」仍需联网 | 资格表与协调器测试 |
| SC-0144-02 | 资格表不再允许消息发送；已排队的旧消息仍可重试／放弃 | 测试 |
| SC-0144-03 | 断网被挡的待办操作显示「需要联网」；笔记有排队修改时删除被挡并说明 | 页面测试 |
| SC-0144-04 | App 全量测试、类型检查无新增失败 | 命令与计数 |

## 失败与交接

同 0141。
