# Sprint 0035 — 执行报告（由 0075 收口）

## 结果

**blocked。** C 线只执行了独立 Task 2（polling／coalescer 调度核心，`sync-trigger-coordinator.ts` + 测试在主线）。
0072 交付了"域水位线 + 304"的服务端能力，0075 交付了 `/api/sync/manifest`（每域 watermark／epoch／generation，content-free），
这两块是 SC-01 的直接证据；生命周期恢复链与真实双账号／角色切换验收未做。状态由 running 改为 blocked。

## SC 映射

| SC | 状态 | 证据／缺项 |
| --- | --- | --- |
| SC-0035-01 每域 content-free watermark 摘要，授权变化可见，跨账号拒绝 | **partial** | `/api/sync/manifest` 每域 `watermark`（max sync_revision）+ `authorizationEpoch`；跨账号：B 用 A 的游标 → 409、撤权 → 无 grants（0075 PG 拓扑与 HTTP 负例）。仅注册表三域，非"真实 registry 全域" |
| SC-0035-02 15 s 检查、合并、无变化不拉 delta | **partial** | 调度核心 `sync-trigger-coordinator.test.ts` 在主线；"无变化不拉"由 0072 的 304 在 6 条热路由实现；未接到 App 的触发链 |
| SC-0035-03 启动／后台／断网／通知点击恢复 | **fail（未做）** | 协调器只有 mount/explicit/foreground/invalidated 四种 reason；先鉴权清理再上传拉取的顺序在 0075 协调器里是"先租约→清理旧纪元→拉取"，上传（0034）不存在 |
| SC-0035-04 cursor/epoch reset 只清目标域；切换失效旧 timer/promise | **partial** | `retireEpochs` 只清目标域；协调器 `supersede` 让旧 flight 停止（0069 主线）；真实加密库回归与双账号角色验收未做 |
| SC-0035-05 无 realtime SDK 仍通过；观测不含隐私 | **partial** | HTTP 路径即全部路径（无 realtime）；`read_budget_gate`／`postgres_read_metric` 日志不含正文；性能对比未做 |

## 下一步

App 触发链接入 manifest（先比水位再拉页）、生命周期恢复矩阵——排在 0076 之后。
