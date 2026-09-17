# Sprint 0034 — 按风险开放离线写入设计

依据已批准的[全域离线读取规范](../../../../../docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md)第 4.3、5、7、9 节。规范文件中的旧待审标签不覆盖本轮明确批准。本次只编制规划，不开始 Generator 实现。

## 边界与策略

0033 拥有身份五态、租期、scope/epoch、读取域 registry、资源 manifest、canonical revision、journal、游标及其重置；0034 的 `OfflineDataPolicyRegistry` 引用它的已登记域和版本，不复制第二套读取 registry，也不从 AI manifest 推导权限。

每个具体 API 路径族与 UI action 登记三个独立维度：

| 维度 | 精确取值 | 约束 |
| --- | --- | --- |
| readPersistence | durable_normalized / encrypted_ttl_snapshot / device_only / online_only_secret | 完整结构化数据入镜像；snapshot 仅兼容白名单页面；草稿仅本机；秘密不落盘 |
| mutationPolicy | offline_queue / local_only / online_only | 仅四域已批准动作排队；编辑器未确认输入为草稿；其他服务端写入在线 |
| binaryPolicy | metadata_only / on_demand_encrypted / user_pinned_encrypted / never_local | 元数据与文件分离，文件只能进入独立加密资源缓存 |

默认拒绝未知 domain、schema/registry version、字段、epoch、endpoint 或 action。路径按 HTTP method + pathname 模板匹配，校验 query；不能按宽泛前缀放行，也不能把任意 URL 转成合法路径。读取可持久化不授予入队权；入队权不授予在线请求权。

| 领域 | 首批允许确认动作 | 保留校验 |
| --- | --- | --- |
| note | create/update/delete | owner、严格 patch、联系人/活动关联、版本 |
| task | create/update/complete/reopen/cancel/delete | 私有 confirmed task；拒绝接受 suggestion 和共享/活动任务 |
| relationship_followup | update/complete/reopen/cancel/delete | 复用 canonical relationship task ID；connection 当前有效；不离线生成/确认建议 |
| personal_schedule | create/update/delete | actor 私有 canonical personal_schedule_items；排除 appointment/shared meeting |

跟进另存副本仅在服务器领域校验允许私有 relationship task 创建且 connection 仍有效时开放；否则只提供前两项。偏好等其他域须独立验证严格 patch、版本、幂等、回滚及权限后另行扩展，不属于首批。

## Outbox、alias 与资格

mutation 持久化稳定 `mutationId`、0033 scope 引用、domain、entityId、operation、baseRevision、严格 patch、确认时间、序号及重试状态。create 使用 `local:<uuid>`；未确认草稿不入 outbox。actor/workspace/epoch 来自已验证上下文，服务端不信任客户端自报值。

持久 outbox 与 canonical rows 分离，pending overlay 不改写云端事实。每个实体 FIFO，不同实体最多 4 个在途；local ID 的后续更新依赖 create 回执，alias 按 scope/domain 隔离。同一原始 mutation 重放保持 payload fingerprint；仅未发送的依赖 mutation 可在首次上传前通过 alias 固定 canonical ID 和 baseRevision。已发送但回执丢失的 mutation 不改 payload、不换 ID。

资格在用户确认和上传前分别检查。`local-read` 可在有效租期内保存已批准的本地 pending，但不能发出服务器写入。恢复顺序由 0035 调度：0033 在线再认证和权限刷新 → 锁定/清理撤权投影及资源 → 0034 eligible upload → 0033 delta。旧 epoch outbox 不自动改绑新 epoch；重新授权后显式重新确认。域重置保留 outbox/conflict/草稿，但锁定态不得显示其敏感正文；账号整体撤销按 0033 加密擦除。

## 全局 receipt 与领域事务

全局 mutation receipt 是唯一批量重放权威，key 为已认证 scope + mutationId；同 ID 同 fingerprint 返回原结果，不同 fingerprint 永久拒绝。每项 batch 独立事务，最多 50 项；整个请求必须先取得新鲜在线身份与服务器授权。

锁顺序固定：mutation receipt lock → 领域 transaction/CAS → 共享 sync-write lock。同一 PostgreSQL 事务保存业务结果、0033 journal/revision 和最终 receipt；禁止领域服务另开事务或先提交自己的 receipt。现有 note/task/schedule receipt 只作兼容/校验，不再成为第二提交边界。授权在读取旧 receipt 前复核，失去权限时不泄露旧结果。

update/delete 使用 0033 canonical revision 做 CAS，领域 adapter 同时保留已有 note version、task/schedule expectedUpdatedAt 的并发规则，不把客户端时间当 sync revision。canonical personal schedule 使用 authority-service/authority-contract，不复活旧存储写路径。

receipt 返回 acknowledged/conflict/retryable/permanent 或有明确 account/domain 作用域的授权失败。ack 的 canonical record、revision、alias、该 mutation 删除和后续依赖修正必须在同一 SQLCipher 事务落地；故障注入证明全成或全败。delta 与 ack 的版本比较使用 0033 规则，较旧 ack 不覆盖较新 canonical，但仍完成自身 receipt 对账。上传不推进游标。

## 重试与冲突

网络/5xx/429 可重试：full jitter，基础 1 秒、上限 60 秒、尊重有界 Retry-After（最高 5 分钟），每轮每项最多 5 次、总运行 30 秒；用注入时钟/随机数测试，到限保留 queued 供后续调度。401/认证 403 暂停账号；领域 403 只锁定该域。400/422 或 fingerprint 不同为永久失败并保稿；409 阻塞该实体而不阻塞其他实体。账号切换取消在途，旧 scope 回执只能在原 scope 重新激活且验证后处理。

冲突保存双方正文、base/server revision、mutation 及时间，UI 不自动选择：使用云端清掉该实体冲突及依赖 pending；保留本机需显式确认，以最新云端 revision 创建新 mutationId；另存副本走领域 eligibility；delete conflict 先展示云端当前内容再二次确认。若云端再次变化，再次返回 conflict。

## Policy snapshot 与 binary cache

snapshot envelope 持有 schemaVersion、registryVersion、authorization epoch、expiresAt、payloadBytes、SHA-256、完整性状态。白名单 schema 必须 strict；拒绝 Cookie/token/provider context/隐藏提示词/邀请密钥/后台审计/未知字段、raw/base64 binary、非有限大小。兼容快照上限 256 KiB、TTL 最多 5 分钟且不超过 0033 离线租期；snapshot 不证明完整 bootstrap。旧无元数据快照不可提升为 canonical，验证失败返回可识别 failure；过期返回 stale 标记且不使用过期 payload。正常镜像 stale 读取仍由 0033 租期管理，不受 snapshot TTL 清除规则影响。

binary cache 消费 0033 manifest 的资源 ID、所属 scope/domain/epoch、MIME、大小和 hash，不自造 manifest。用独立 SQLCipher 资源数据库存文件 BLOB（与结构化库分开、独立 key reference），不把明文落到 Expo 文件缓存；每资源上限 20 MiB、总配额 200 MiB，按需未 pinned LRU 淘汰，pinned 满则明确报 disk-full 不静默取消固定。metadata_only/never_local 禁止下载；on-demand 只在打开时下载，pin 是本机明确动作。缺失显示 not-downloaded，hash 不匹配失败并删损坏 bytes，保留文字和 metadata。打开时用 native 内存消费边界，禁止共享明文临时文件/日志。Web 实现返回不支持持久文件，不宣称浏览器离线。

域撤权先锁访问再删除该域资源，域 reset 删除 canonical 资源但保留设备草稿/outbox/conflict；整体登出/撤权清理资源 key，删除失败仍 locked。迁移通过事务 new/copy/verify/swap，真实 SQLCipher 验证崩溃恢复、重跑和明文不可见。

## 0033 接口冻结与验收

B 线可以先写纯策略、eligibility、重试分类、严格 mutation schema 的 RED，以及注入端口的 outbox/receipt/冲突故障用例。只能把它们视为预备测试，不能用 mock 宣称 0033 集成通过。

身份 guard、scope capability、epoch 生命周期、存储 migration/transaction、canonical apply/version comparison、manifest projection validator、域 reset/revoke 和服务端 journal/锁接线，必须等待 0033 相应阶段固定 SHA 与真实验收证据。B 线只写自己的适配层，不更改上游类型或游标。全部 SC 及精确步骤见 Planner 与根实施计划；0035 消费上传状态，0036 消费按域 pending 数量并验证 AI 可见性。
