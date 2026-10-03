# Sprint 0124 · run-01 执行报告

**状态：原 SC-0124-01–05 已验收，已合入本地 `chat-agent`。** 功能合并为 `00652e229`，保留 B 测试修复原提交祖先的合并为 `a09fa8d80e212a2b406ef6c54faaa68958479a16`；二者产品及测试树相同。最终验证树为 `412ceae1f04948a329c0f70ad63d9d2d9363dcea`。0137 的独立页面验收仍进行中，不计作本 Sprint 完成，也不阻挡 0132 的地基依赖。

## 结果概览

已交付手机端本地 outbox、服务端镜像与未确认写入叠加读取、按账号加密队列保险箱、上传执行器与时机、临时 ID/依赖替换、账号状态 API 和仅测试注册的 mutation 域；没有向产品资格表开放任何离线写入类别，也没有增加批量 API。

实现提交包括 B 功能提交 `f7edd5a60`、补齐边界测试的 `a59c7215b`，以及合并 0137 验收变更后的候选 `85fe921c8`；Provider 补证为 `341d8e2a78298acae9d700ece64f391646ac10fa`，阶段报告为 `eb1bf3ae1`，测试替身校准为 `4ba7c28cbd382b00d7f439db04411c0aaf732847`。这些提交已保留在本地主线历史中。所有本地改动均未 push 或部署。

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
- 后续 Root 在未提交合并树 `4a0978c931d82e008d21d809186932f7da661582` 执行的新鲜 App full 为 3908/3907 pass、1 fail、0 skip；唯一失败仍保留原日志 `/Users/xzhao/Projects/orbit/build/harness-logs/sprint-0124-0137/main-4a0978-app-full.log`，不可表述为 flaky 或全绿。失败是 `tests/notes-web-local-first.test.tsx` 的非安全上下文在线列表/详情用例报告 `Maximum update depth exceeded`。B 与 Main 的该文件独立定向各 6/6 通过；B 用例 bundle 明确把 `useSyncedCollection` 等 hooks 换成 fixture。只读调用链定位到测试替身引用不稳定：空联系人详情的 `useNoteContactSummaries` effect 在无 missing 项时写入新 Map、依赖 `client`；fixture 的 `useOrbitApiClient` 原来每 render 返回新对象。真实客户端由 `useMemo` 稳定，故未修改产品 hook。随后用真实浏览器详情 render 检查 fixture client identity：旧 fixture RED（8 次调用/8 个实例，预期稳定单实例）；改为模块级共享 fixture client 后该 identity 检查 GREEN，目标用例 1/1、整文件 6/6。此为 test-only fixture 校准；Root 仍须在修复提交合入的稳定组合树重跑 App full，未覆盖前不关闭 Sprint。此变更没有重跑 Orbits full/PG，也未操作设备或服务。

## 最终合并树验证（2026-09-29，Root 复核）

- 新鲜 App 全量在主线待合并索引树 `412ceae1f04948a329c0f70ad63d9d2d9363dcea` 运行：3908/3908、0 fail、0 skip，exit 0，263942.728625ms。日志：`/Users/xzhao/Projects/orbit/build/harness-logs/sprint-0124-0137/main-fixture-fixed-app-full.log`。旧 fixture 的唯一 full 失败已消失，原失败日志保留；RED/GREEN 原始输出只在 B 的原 run 工具记录中，没有伪造日志文件。
- 新鲜服务端全量：5354 tests、4867 pass、0 fail、0 cancelled、487 explicit skip，739465.364167ms。日志：`/Users/xzhao/Projects/orbit/build/harness-logs/sprint-0124-0137/main-412ceae-equivalent-isolated-orbits-full-serial.log`。它运行于现有 B 隔离工作区 `4ba7c28c`，而非主线物理目录；主线索引与 B 的整个 `repos/orbits`、B 工作目录的产品/测试/脚本逐字比较均 exit 0。唯一已有生成差异为 Next 自有 `next-env.d.ts` 类型引用，Node 测试不读取它。本报告不把该结果写成主线物理 cwd 全量通过。
- 主线 `.env.local` 曾污染服务端测试环境：错误 target/URL、空 module mode、空 auth secret 先后造成失败或中断。Root 保留所有日志，未改产品、删测试或放宽付费屏障；达到局部重试上限后改用无 dotenv 的同源隔离工作区。先做 75/75、0 skip 的环境敏感预检，再执行上述完整文件集。读取 ratchet 及低一计数负例均通过。
- 最终两端 `npm run typecheck` 都在主线运行、exit 0：`main-412ceae-final-app-types.log`、`main-412ceae-final-orbits-types.log`，目录同上。之前同产品源的 orbits lint 也 exit 0；App 无 lint script，不杜撰检查。
- 原 SC03 设备恢复/退出/精准清理及 SC04 真实 PG 四条件证据仍有效，产品源未变。历史设备截图中 B 标签后被查明实际为 A；SC03 始终是同一真实账号保留、恢复和清理，不冒称跨账号用例。换账号确认/取消与两种 401 的非空队列证据来自实际 Provider 驱动真实 SQLite，限制见上表。
- 其他 PG 矩阵：315 条中 311 pass / 4 explicit skip，专用组 7/7；cutover 73 条中 66 pass / 7 已知联系人搜索基线失败仍未解决，缺失固定库/角色未创建。这些限制不改写为通过，也不属于 0124 原 SC 的缺项。
- 提交前完整图检测：all 712/712 changed symbols、86 files、10/10 processes（含 7 个保留的用户 review），staged 659/659、79 files、10/10 processes，HIGH 已告知；无截断或缺失汇总项。主线合并后补 B 祖先时索引树完全不变，staged 无变更。用户 review、输出及技能文件未提交。

本 Sprint 不开放笔记/待办/日程/消息的产品离线写入；由 0132–0135 依次接续。已为 0132 准备独立工作区，实际 Generator 开工及基线以登记表为准。0137 的联系人关系区错误、笔记/AI 跨账号与剩余设备证据仍由 A 原 run 继续，不被本报告关闭。

设备、3100、Metro 与 Simulator 均由 Root/A 持锁；本报告阶段未操作这些资源、未重跑 PG/full、未触及 `next-env.d.ts` 或 `.claude/skills/gitnexus/`，也未 push、部署或调用付费 provider。
