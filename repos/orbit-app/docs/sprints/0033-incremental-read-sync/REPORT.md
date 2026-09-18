# Sprint 0033 — 执行报告（由 0075 收口）

## 结果

**blocked。** 登记表长期 running 的三个缺项——真实 server grants、authorization epoch、存储初始化与认证绑定——已由
Sprint 0075 补齐并有本机证据；但 0033 五项 SC 面向"全域"（AI 历史、联系人、消息、资源清单、全部 native 入口 mirror-first），
本报告只写证据能支撑的部分，其余明确列为未完成。状态由 running 改为 blocked：不是失败，是范围远未闭合、且后续工作已拆到 0076／0077。

## SC 映射（只写有证据的）

| SC | 状态 | 已有证据（0075） | 缺项 |
| --- | --- | --- | --- |
| SC-0033-01 租期／锁定／不串数据 | **partial** | 服务端 `/api/sync/lease` 按 actor 签发 v2 信封，grants 携带真实 epoch；App 协调器把 lease 存进镜像 `sync_meta`，离线冷启动经 `evaluateOfflineRead` 重新绑定作用域（`sync-coordinator-lease.test.ts`：冷启动无网可读、过期租约不绑）；跨 actor 越权拉取被拒（本机真实双账号 HTTP：B 出示 A 的游标 → 409；PG 拓扑 2/2） | 租约签发与原生 SQLCipher 迁移／重启／擦除失败路径（Tasks 2–4）未验；`subject` 由信封自证，App 端尚无独立身份核对 |
| SC-0033-02 全域严格授权投影 | **partial** | 注册表 v1 三域（notes／tasks／personal-schedule）按 `user_id` 投影，游标绑 actor/workspace/domain/schema/registry/epoch；授权变更换纪元强制重建（PG 拓扑）；撤权 → lease 无 grants、manifest 空、页拒绝 | 联系人、消息、AI 历史、活动等 workspace 域未注册；物理 delete／grant／revoke 的耐久日志未做 |
| SC-0033-03 页与游标原子落盘、单域重置 | **partial** | v2 仓库 `applyDomainPage` 页+游标同事务（0069 主线）；`retireEpochs` 只清目标域其他纪元、保留 pending/conflicted（`mirror-topology.test.ts`） | 预算续传、磁盘满、错误 key、资源 at-rest 未验 |
| SC-0033-04 全部 native 入口 mirror-first | **fail（未做）** | 无——8 屏接线在 0069 延后，0076 承接 | 全部 |
| SC-0033-05 同版本 Web/API + Simulator 同账号矩阵 | **fail（未做）** | 仅有协调器经真实 HTTP 的单链证据（3 条待办 → 镜像 3 行） | 逐 domain 增改删／撤权／断网重启矩阵 |

## 固定版本与证据位置

- 主线：`chat-agent` 含 0069（`ca8c50b15`，分支存量归位）与 0075（本次）。
- 测试：`repos/orbits/tests/api/sync-lease-manifest-domains.test.ts`、`tests/services/sync-domain-topology-postgres.test.ts`；
  `repos/orbit-app/tests/sync-coordinator-lease.test.ts`、`tests/mirror-topology.test.ts`。
- 真实 HTTP：0075 REPORT「本机双账号 HTTP 负例」一节。

## 下一步

0076 屏幕扩面（SC-04）；workspace 域注册与耐久删除日志（SC-02 余项）；0077 之后再做 Web 侧。
