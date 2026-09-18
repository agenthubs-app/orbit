# Sprint 0075 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`35cfa571d09a97d8cf872fc2c43334ea84df2047d39c9be69ffc03c36f12e653`。

## 先用人话说

服务端现在真的签发 grants：`GET /api/sync/lease` 给当前登录人一张 v2 租约，三个注册域各一条 grant，
`authorizationEpoch` 由该账号的授权记录（auth_users / accounts / permissions）真实推导——写一条 permissions 就换纪元，
软删身份行就没有 grants。`/api/sync/manifest` 给每域水位，`/api/sync/domains/:id` 按域分页，游标绑 actor／workspace／domain／schema／registry／epoch。

App 这边补上了 0033 一直 running 的根因：生产协调器 `createLocalSyncRepository({ actorId, database })` 没有任何作用域绑定，
v2 仓库任何读写都抛 `read scope epoch is not bound`。现在协调器先拿租约、把 grants 变成 `activeReadScopes`、租约存进镜像的 `sync_meta`，
离线冷启动无网也能重绑读镜像；纪元变了先清旧纪元行再全量重建；撤权域清空。

**本机真实双账号 HTTP 证据**（两个专用本地账号 `qa-sync-a/b@orbit.test`，凭据只存 scratchpad）：A 真实 POST 3 条待办 → lease 3 grants（epoch `6b6b286e`）→ manifest tasks 水位 9117 → 逐页 2+1 条、owner 全为 A；
**B 出示 A 的游标 → 409 SYNC_RESET_REQUIRED**；B 自己的页 0 条 A 行；软删 B 的身份行后 B 的 lease／manifest／page 全部 401。
App 协调器经真实 HTTP：镜像 0 行 → 同步 `fresh` → 3 行、租约已存、3 grants。

四份 0033–0036 REPORT 按证据写：0033／0034／0035 由 running 改 **blocked**（各 SC partial／fail 逐条写明），0036 维持 blocked。没有一处预填通过。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `543627493`；登记后 `8724d2949` |
| 功能提交 | `2e88d4faa` feat(sprint-0075) |
| 合并 | `1170c3eb9` merge(sprint-0075)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0075-01 真实 grants／epoch／lease | pass | `sync-lease-manifest-domains.test.ts` 3/3：信封过 App `offlineReadEnvelopeSchema`、grants 覆盖三域、`offline ≤ session`；manifest 与 lease 纪元一致；域页 claims 含 epoch/generation/registry（`afterRevision=2`）；授权行变化 → 旧游标 409；未知域 404；无授权行 → grants []、manifest []、page 403。`sync-domain-topology-postgres.test.ts` 2/2 在真实 PG 上重复以上并加撤权 |
| SC-0075-02 跨 actor 越权（真实双账号） | pass | HTTP：B 出示 A 游标 → 409 `SYNC_RESET_REQUIRED`；B 页无 A 行；B manifest 水位 ≠ A。PG 拓扑同断言 |
| SC-0075-03 纪元变更全量重建；撤权不可读 | pass | App `sync-coordinator-lease.test.ts`：e1→e2 后旧纪元 0 行、新纪元从无游标全量拉、`listRecords` 先旧后新；撤权后 tasks 0 行、notes 不受影响；`mirror-topology.test.ts` `retireEpochs` 只清目标域其他纪元、保留 pending。服务端：写 permissions → 旧游标 409、新纪元全量 4 条；软删身份 → 无 grants／空 manifest／403（HTTP 上为 401） |
| SC-0075-04 生产接线可用 | pass | 协调器测试三条不再出现 `read scope epoch is not bound`／`legacy page spans domains`；离线冷启动从存储租约重绑并可读，过期租约不绑；真实 HTTP 脚本 `coordinator-over-http.ts`：`{before:0, syncStatus:"fresh", after:3, mirrorRows:[tasks 3], leaseStored:true, leaseGrants:3}` |
| SC-0075-05 收口与无回归 | pass | 四份 REPORT + 登记表；App 全量 **3493/3493**（0074 收口 3489 + 4）；orbits 全量 4239 / 3999 / 85，失败集合与 0074 收口**零新增**（3 个新测试在全量中执行）；两端 typecheck 0；Simulator 冷启动 16×200 + 1×304、0 个 5xx；phoneweb 待办页正常 |

## 判断与取舍

- 纪元由数据推导、不新建表：可复现、与 0072 授权水位同源；代价是任何授权相关写入都让该账号全部域重建（粗但安全）。
- 注册表只含三个 sync 集合；contacts 等 workspace 域的按人镜像未做（0076／后续）。
- 租约 `baseUrl` 由客户端查询参数给出（phoneweb 经代理时服务端 origin ≠ 客户端 base）；App 校验信封 baseUrl 与自身一致，跨服务器复用仍被拒。
- `subject` 由信封自证：App 端没有独立的身份主体核对来源，记为 0033 SC-01 余项。
- 撤权在 HTTP 上表现为 401（身份行软删后 actor 解析失败），比 403 更早拦下；handler 级 403 路径由测试覆盖。

## 顺带发现（不在本 Sprint 修）

1. `qa@orbit.test` 与 `.env.local` 里的 `ORBIT_XIAOYU_TEST_PASSWORD` 都登不进本机 dev 库（CredentialsSignin）——本机主测试账号密码与文档不一致，本 Sprint 改用新建的专用账号绕过，未动 qa 账号。
2. 旧 `/api/sync` 混合页路由仍在（0069 验收脚本依赖），App 已不调用；何时下线待 0076 屏幕接线后决定。
3. 两个本地测试账号 `qa-sync-a/b@orbit.test`（B 已软删身份行）留在 dev 库，凭据在 scratchpad（会话结束即失效）。

## 未提交、影响与下一步

- 未提交：`repos/orbits/next-env.d.ts` 等用户既有改动，全程未暂存。
- `detect_changes`（staged）：10 符号 / 23 文件 / 0 流程 / LOW（新增路由与协调器不在旧索引流程中，App 全量与 HTTP 证据覆盖）。
- 回退方式：`git revert -m 1 1170c3eb9`。
- 运行环境：本机 Postgres `orbit_sprint0067_test`（随机 schema）与 dev 库 `orbit_events`（新增 2 个测试账号、A 的 3 条待办）；Web/API 3000（dev HMR 已加载新路由）；phoneweb 32111；Simulator `DA432E9E`。未连云端、未部署。
- 预算：无 AI/OCR 调用。
- 下一步：**0076 App 消费者扩面**——按 0070 流量榜把屏幕接到 `useSyncedCollection`／scoped reader，棘轮与出库字节双降。
