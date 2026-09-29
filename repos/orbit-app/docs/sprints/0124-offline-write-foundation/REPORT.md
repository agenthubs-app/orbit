# Sprint 0124 · run-01 执行报告（主线收口待完成）

**状态：实现与逐项证据已交接；Sprint 尚未 completed。** B 线本地实现与必要定向验收已提交。当前候选分支尚未合并到 `chat-agent`；合并树上的最终 App 全量尚未运行。下文不会把补证前全量结果冒充当前 HEAD 的收口结果。

## 结果概览

已交付手机端本地 outbox、服务端镜像与未确认写入叠加读取、按账号加密队列保险箱、上传执行器与时机、临时 ID/依赖替换、账号状态 API 和仅测试注册的 mutation 域；没有向产品资格表开放任何离线写入类别，也没有增加批量 API。

实现提交包括 B 功能提交 `f7edd5a60`、补齐边界测试的 `a59c7215b`，以及合并 0137 验收变更后的候选 `85fe921c8`。B 最后补充提交为 `341d8e2a78298acae9d700ece64f391646ac10fa`（当前分支 HEAD），只涉及 SC03 测试及本 Sprint checkpoint。所有本地改动均未 push 或部署。

## SC-0124-01–05 证据

| SC | 当前可核对的结果 | 证据与限制 |
| --- | --- | --- |
| SC-0124-01 | 真实 SQLite 队列证明首次请求体冻结；服务器已执行而首回执丢失后，同 mutationId/同字节重放只执行一次；确认后 outbox 清空并写 alias。 | `repos/orbit-app/tests/outbox-uploader.test.ts` 的 “a lost receipt response replays identical bytes once and resolves its alias in real SQLite” 和 “a test-only mutation uploads and acknowledges in real SQLite without entering the product mirror”。包含在候选 `85fe921c8` 的 App full 中。 |
| SC-0124-02 | 临时编号确认后原子写 server row、alias 与依赖引用；alias 写入故障回滚；父项永久失败时依赖保留内容并标记失败。 | `repos/orbit-app/tests/local-sync-repository.test.ts` 的 “acknowledgement atomically writes the server row, alias, and dependent references” 与 “acknowledgement rolls back the canonical row and outbox when alias persistence fails”；`repos/orbit-app/tests/outbox-uploader.test.ts` 的依赖永久失败分类。包含在候选 `85fe921c8` 的 App full 中。 |
| SC-0124-03 | 实际 Provider + Node SQLite 补证覆盖非空队列冷启动 401、运行时 401、换账号继续/取消四支；两个拒绝路径和确认继续路径都验证精确 mutation 在 vault、镜像内容不入 vault、旧镜像/key 清除；取消保留旧会话、outbox、mirror/key。真实设备顺序为：B 入队→选择“加密保存并注销”→登录页 N=1/冷启动 N=1→Root 用同账号正常登录恢复队列（1 项、vault=0、mirror=1）→再次触发退出 Alert 并选择“取消”以保留恢复后的队列→精准清理本轮 fixture。 | 新增的 Provider 补证 22/22：`repos/orbit-app/build/harness-logs/sprint-0124-sc03-provider-sqlite.log`。真实设备元数据：`/Users/xzhao/Projects/orbit/build/harness-state/evidence/sprint-0124/root-qa/sc03-restoration-check.json`；截图：`sc03-login-pending-1.png`、`sc03-logout-three-options.png`、`sc03-same-account-restored.png`、`sc03-own-fixture-cleared-verified.png`，均在同目录。Root 核实两次 Alert 的先后及各结果，精确 fixture 清理后仍登录。生命周期还覆盖非空 logout archive/同账号 restore 与 vault 写失败不删除源队列。 |
| SC-0124-04 | 账号状态 API 对 active/disabled/password_changed 返回三态，数据库故障返回 503；App 仅对明确拒绝清理，不把 503 当拒绝。 | `repos/orbits/tests/services/account-status-postgres.test.ts` 实际 handler→真实 `orbit_test` PG 的 1/1 输出：`repos/orbits/build/harness-logs/sprint-0124-0137-combo-account-status-pg.log`。此外 `repos/orbit-app/tests/offline-identity.test.ts`、`offline-cold-start.test.ts` 与 `auth-session-provider-races.test.ts` 覆盖拒绝/不可达区分。 |
| SC-0124-05 | 上传单飞、最多 4 并行、FIFO、依赖、状态分类、注入时钟/随机重试预算和所有获批上传触发器有定向覆盖；被冻结的读取棘轮及低一计数负例通过。 | App 侧由 outbox、coordinator lease 与 merged notification lifecycle 测试覆盖，见候选 `85fe921c8` 全量日志。Orbits 串行全量中的 ratchet 正例/负例：`repos/orbits/build/harness-logs/sprint-0124-0137-combo-orbits-full-serial.log`。 |

## 综合验证与版本边界

- 候选 `85fe921c8` 的完整 App 组合全量：3904/3904、0 fail、0 skip；日志 `repos/orbit-app/build/harness-logs/sprint-0124-0137-combo-app-full.log`。这是新增 SC03 Provider 四用例之前的快照，不是当前 `341d8e2a7` 的完整全量结果。
- 候选 `85fe921c8` 的 Orbits 串行完整套件：5354 tests，4867 pass、0 fail、487 skip；日志 `repos/orbits/build/harness-logs/sprint-0124-0137-combo-orbits-full-serial.log`。跳过项仍是 skipped，不表述为已通过。该完整日志中的读取 ratchet 与 below-actual 负例均通过。
- SC-0124-04 独立真实 PG 证据：`orbit_test` 1/1，详见上表。其他 scoped PG 矩阵保留各自结果；已知 cutover 组在 `orbit_cutover_test_20260917` 为 73 tests / 66 pass / 7 fail（已知联系人搜索基线问题），不把它隐藏或作为 0124 通过证据。0137 pipeline PG 1/1 属于 0137，不计作本 Sprint SC。
- 补充提交 `341d8e2a7` 后只运行了相应 App 全文件定向测试与 App typecheck：Provider race 文件 22/22、0 skip；`tsc --noEmit` exit 0；`git diff --check` exit 0。逐场景说明：`repos/orbit-app/build/harness-state/evidence/sprint-0124/run-01/sc03-provider-sqlite-supplement.md`。该日志中的 SecureStore/SQLCipher 原生 API 是测试 adapter；Node SQLite schema、队列、vault 数据及清理操作是真 SQLite。它不代替设备 SQLCipher 证据。
- 根图检测索引已刷新至候选 `85fe921c8`；全范围变更检查 LOW、46 changed symbols、0 affected processes。`eraseRejectedIdentity` 的 impact 返回 `partial=true`，未把空 caller 视作安全结论；源码确认路径为 Provider `restoreSession`。本次补充仅更改测试和 checkpoint。

## 未完成的唯一收口门槛

Root 将在 0137 现场/产品稳定后统一把固定 B commit `341d8e2a78298acae9d700ece64f391646ac10fa` 合入本地 `chat-agent`，并在包含该补证和最终稳定 A+B 源码的精确合并树上执行原目标所需的两端全量、两端类型检查及必要跨端/合并后检查。候选 `85fe921c8` 的 3904 App 与 5354 Orbits 完整套件结果只属于该候选版本；当前没有覆盖 `341d8e2a7` 的合并树全量。该 I 档闭环是唯一剩余门槛；未完成前不关闭 Sprint、不将 README 登记为 completed。Root/A 合并与验证后再更新生命周期登记、最终合并 SHA 和结果。没有其他已知 B 侧产品或 SC 定向测试缺项。

设备、3100、Metro 与 Simulator 均由 Root/A 持锁；本报告阶段未操作这些资源、未重跑 PG/full、未触及 `next-env.d.ts` 或 `.claude/skills/gitnexus/`，也未 push、部署或调用付费 provider。
