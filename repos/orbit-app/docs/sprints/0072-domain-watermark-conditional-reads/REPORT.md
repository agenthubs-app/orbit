# Sprint 0072 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`c2d8e12aa6fffefb8ac9ef7fc57aadc71c371c924430f13cdba2fd193fd890ae`。

## 先用人话说

六条最常被 App 反复拉的列表接口（待办、笔记、个人日程、联系人、关系证据、活动）现在有了"没变就不读"的闸：
服务端先用一条走索引、只回一行的水位线 SQL 算出这次响应依赖的数据版本做成 ETag，客户端带着上次的 ETag 来，
没变就回 **304、零行业务读**，App 用上一次的响应体。真机效果：Simulator 从首页进待办再回首页，
服务端日志里 `/api/tasks?status=open`、`/api/tasks`、`/api/contacts`、`/api/schedule-items?scope=personal` 全是 304；
phoneweb 在 SPA 内 待办 → 首页 → 待办 也一样。

中途踩到并修掉的一个真问题：App 各屏幕 `useMemo` 出自己的 client 且各自包一层 fetch，第一版缓存按 fetch 身份分桶，
结果 Simulator 上 `/api/notes` 能 304、`/api/tasks` 永远 200。改成进程内共享缓存（键含 baseUrl／Cookie／路径／headers）后全部命中。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `d45474da8`；登记后 `3128d3c70` |
| 功能提交 | `e8717c721` feat(sprint-0072) |
| 合并 | `db34e498c` merge(sprint-0072)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0072-01 水位线廉价且正确 | pass | `domain-watermark-postgres.test.ts` 1/1：1 条 SQL、1 行；`enable_seqscan=off` 下 EXPLAIN 命中 `orbit_records_(workspace_collection\|private_owner)_idx`；插入／更新／软删／硬删各自改变指纹；B 的写入不动 A 的私有水位；授权集合与私有域折进同一条 SQL |
| SC-0072-02 未变即 304、零业务读 | pass | `conditional-routes-postgres.test.ts` 1/1（真实 configured 接线 + 读指标观察者）：6 路由第一次 200 带 `W/"…"` ETag 与 `Cache-Control: private, no-cache`，第二次 304 无 body，且**恰 1 条 SQL、1 行** |
| SC-0072-03 变了立刻失配 | pass | 同上：A 写待办 → A 200 新 ETag；B 写待办 → A 仍 304；写 contacts → contacts／events／connections 200 而 tasks 仍 304；写 `permissions` → 6 路由全部 200；`ORBIT_READ_ETAG_VERSION` 变 → 200；`?status=open` 与无参 ETag 不同。`conditional-read.test.ts` 6/6 固定 helper 纯逻辑（含水位线失败降级） |
| SC-0072-04 App 回放 | pass | `tests/api-client-conditional.test.ts` 6/6：二次 GET 带 If-None-Match、304 回放 envelope（data 逐字段相等、status 200、`meta.fromCache=true`）、新 ETag 替换、不同 query 分开、失败响应不记忆、无记忆的 304 报 `ORBIT_APP_STALE_CONDITIONAL_RESPONSE`、不同 Cookie 不互串、**不同 client 实例共享记忆**、POST 不缓存。既有 `api-client.test.ts` 30/30 |
| SC-0072-05 运行时与全量 | pass | Simulator：4 条路由 304（服务端日志）；phoneweb：SPA 往返 3 条路由 304、待办页 54/10/13 数据完整；两端 typecheck 0；App 全量 **3489/3489**（0070 收口 3483 + 6 新用例）；orbits 全量 4220 / 3980 / 85 fail，失败集合与 0071 前基线**零新增**（3 个新测试文件在全量中实际执行） |

## 判断与取舍（已在 PLANNER 写明，此处记结果）

- `limit`-style 授权纪元尚无（lease 属 0075）：用 `accounts / auth_users / permissions` 的 workspace 级水位替代，任何授权相关写入都使全部路由失配——粗但安全。
- dashboard／profile 未接：依赖集合无法静态确定，接错等于返回陈旧数据。schedule-items 只接 `scope=personal`，今日聚合视图保持 200。
- 联系人／关系证据／活动是 workspace 级水位：任何人的联系人写入都让所有人的这些路由失配。正确但粗，0075 拿到按人授权纪元后可细化。
- App 缓存只在内存，不进离线读取策略与快照层；账号切换靠服务端 ETag 含 actorId + 客户端键含 Cookie 双重保证不互串。

## 顺带发现（不在本 Sprint 修）

1. phoneweb 页面语言在测试中一度切成英文（"People"），与本 Sprint 无关，疑与 `/api/account/language-preference` 缓存无关（该路由未接条件读）；未深究。
2. `connections/route.ts` 之前无任何注入点，本次抽成 `handler.ts`；同类"route 直写逻辑"的路由还有若干（dashboard 等），接条件读前都得先抽。

## 未提交、影响与下一步

- 未提交：`repos/orbits/next-env.d.ts`、设计图 PNG 等用户既有改动，全程未暂存。
- `detect_changes`（staged）：37 符号 / 17 文件 / 19 流程 / CRITICAL——全部经 `createOrbitApiClient`（App 所有屏幕的入口）与 6 个 handler；由 App 全量 3489/3489 与两端运行时验证覆盖。
- 回退方式：`git revert -m 1 db34e498c`。
- 运行环境：本机 Postgres `orbit_sprint0067_test`（随机 schema）；Web/API 3000（dev HMR 已生效）；phoneweb 32111（已重新导出）；Simulator `DA432E9E`（Metro 热更新）。未连云端、未部署。
- 预算：无 AI/OCR 调用。
- 下一步：**0073 搜索路径索引对齐**（pg_trgm + GIN，消灭 `ilike '%x%'` 全集合过滤）。
