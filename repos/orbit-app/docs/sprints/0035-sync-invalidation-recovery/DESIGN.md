# Sprint 0035 — 全域失效与恢复设计

依据已批准的[全域离线读取规范](../../../../../docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md)第 4、5、7、8、9 节。规范页的“等待书面审查”为历史状态；本轮用户已明确批准。此文只细化 C 线调度，不修改 A 线游标／权限／存储或 B 线 outbox／receipt 语义。

## 现状与依赖

规划基线 `2f862c9f84167408df09914acca521f528ae4185` 有 0032 加密生命周期与通知协调器，尚无 `features/sync` 服务和 registry 驱动恢复实现。0033／0034 旧设计中的固定 kind 不是全域契约。实施前由管理线提供通过验收的 A/B 固定 SHA 和接口；C 线只写薄绑定，不伪造已落地依赖。独立纯调度测试可以先行，集成依赖不能跳过。

## 状态边界

使用独立 `shared/contract/sync-invalidation.ts` 与严格 schema，避免与 0033 的 cursor contract 并行编辑。`POST /api/sync/status` 为只读认证查询：请求体只带版本和已知域水位，防止全域向量超出 URL 长度；响应 `Cache-Control: private, no-store`，不使用跨权限缓存的 ETag。它替换旧计划的标量 `GET afterRevision`，不改变 0033 数据 endpoint。

响应包含 `registryVersion`、`serverTime`、`domains[]`；每项只有 `domainId`、`schemaVersion`、`authorizationEpoch`、`watermark`、`reason`。`reason` 是 `unchanged | changed | reset-required | not-authorized`。域名与版本只从服务器 manifest 登记，epoch 是不透明值，水位只允许同一域／同一 epoch 内比较，不与 opaque cursor 互转。客户端不能以请求传入 actor、workspace、角色或 epoch 获得权限。

服务器重新授权后逐域调用 0033 adapter 的 journal/status 能力，覆盖内容变更、授权新增、visibility delete、物理 tombstone 和 retention reset。不能只扩大 `orbit_records` 的 SQL IN 集合。历史 AI、预约、消息和活动运营的权威源不同。撤权域仅在此前经验证的 scope 清单内返回清理指令，不泄露未授权新域或实体存在性。未知 domain／版本／epoch 显式拒绝并要求刷新认证 manifest。

## 恢复协调

同 base URL／actor／workspace 的一个协调器，绑定当前 registry 与授权 generation。所有触发进入同一个队列。事件快照与运行中新增 dirty 集合分开；成功只消费本轮快照，失败保留 dirty；运行期间再来的有效提示合并为一轮后续恢复，后续轮中新事件仍能再排队，不能用一个永久 rerun 标志吞掉后续变更。

| 触发 | 行为 |
| --- | --- |
| 启动／进程重启 | 从 0033 持久 checkpoint 读 manifest/partial 状态，认证成功后逐域恢复 |
| 前台 polling | 立即检查，随后每 15 秒一次，无变化不拉 delta；单飞 status，后台停止 |
| optional hint | 严格解码并校验 scope generation，250ms 合并；只标 dirty，不落实体、不推进 cursor |
| AppState 回前台 | 超过 60 秒或有通知／dirty 时立即恢复；其余调用 0033 freshness 检查 |
| 网络恢复 | 重新验证身份与 epoch → 等待撤权投影/资源清理 → 0034 上传 → 0033 分域恢复 |
| manual refresh | 绕过 TTL／退避等待，仍单飞；返回当前恢复结果供页面刷新结束 |
| 通知点击 | 先发恢复事件，再走原 allowlist/deep-link 路由；没有域信息时做全域 status，不信任 payload 中的业务数据 |
| cursor 过期／epoch 变化 | 调用 0033 指定域 reset，再 bootstrap；保留 device drafts、outbox/conflict；不重置无关域 |
| 换账号／Base URL／workspace／角色 | abort、停 timer/transport、使 generation 失效；0033 完成作用域切换后再启动新协调器 |

认证 401/403 走 0033 整体 revoked；域 403 只锁定／清理该域。`local-read` 可以显示镜像，但不能上传；联网验证失败时恢复失败且保留可读状态的既有规则。清理失败阻断上传，不能凭已缓存权限继续。

## 频率与预算

默认 HTTP 周期 15 秒。registry 声明为高频的消息／通知域可以使用 5 秒提示周期，合并到同一个 status 请求；其他域仍每 15 秒检查一次。无配置仍满足 15 秒检测目标。服务器响应／网络耗时另外记录，不能把检测周期写成无条件 15 秒 UI 完成保证。

恢复调度使用 0033 已批准的页数、字节、时间、电量与磁盘预算，只能收紧，不能增大。每轮按 round-robin 每域一页，高频域先取一页，历史 AI 不得独占；提交页与游标仍由 0033 事务完成。预算耗尽保留 `partial`，下一前台机会从已提交页继续；后台仅在 OS 实际给出的运行窗口内工作，停止后不重下已完成页。

失败 full-jitter 上限依次为 1、2、4、8、30 秒，之后保持 30 秒；manual 可越过等待但不创建并发。认证失败不重试上传；独立域错误不吞掉其他域结果。仅记录 transport 类别、计数、耗时、预算停止原因与错误枚举，不记录 URL、ID、cursor、epoch、正文或 token。

## 所有权与验收

0033 提供 registry、状态读取 adapter、认证／撤权清理、reset、分页预算和原子 checkpoint；0034 提供上传入口与结果，不接受 C 线改变重放、receipt、锁序或冲突规则。0035 拥有 status wire contract、transport、恢复调度及薄接线。0036 消费恢复证据与 freshness，不从失效摘要授予 AI 权限。

实施步骤在[执行计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0035-universal-recovery.md)。只提供规划时不创建 REPORT、不改根台账、不消耗 Generator run。本轮按用户要求提交四份规划文档后暂停，由管理线审查；不 merge/push。
