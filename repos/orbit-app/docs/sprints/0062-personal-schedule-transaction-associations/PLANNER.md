# 个人日程事务内关联权限检查实施计划

> 执行者：既有空闲 A 线，GPT-5.6 Sol / medium；一个 Generator、唯一 run-01。遵守 RULES，不调用已卸载技能，不派 Reviewer 或第二 Generator。

**目标：** 修复 ROOT 真实并发 PATCH 已证实的连接池饥饿，保留权限、CAS、幂等及整个系列／单次语义。

**架构：** 保存事务中的关联读取必须与当前事务 store／SQL executor 绑定，不能再借用原 pool。生产 service factory 提供按 store 构造 reader 的方式；非 PG 与已有注入 reader 的消费者保持兼容。只改本域服务与接线，不修改 shared API/schema 或全局连接池。

**技术：** TypeScript、node:test、既有 SQL fixture／真实 Postgres store、Node22；无新增依赖。

**规格与依据：** 用户“继续完成未完成的”，RULES0/10 已批准剩余普通本地修复。2026-09-17 ROOT 在 Main 产品5523 的小雨 QA 系列上并发两个相同 expectedUpdatedAt 的 PATCH：均超时，PG 两个连接分别 idle-in-transaction／等待 actor advisory lock；持锁保存随后通过外层 associationReader 请求第三连接。重启相同产物后 GET200，原 updatedAt 与全部业务字段未变。此项是新发现的具体运行缺陷，不重开 closed0060，不克隆其全部 SC。

## 基线、边界与约束

- 固定基线 `0d5a57f340863d9596afe6f7637c35dcac68f81e`；独立 `codex/sprint-0062-personal-schedule-transaction-associations`／`.worktrees/sprint-0062-personal-schedule-transaction-associations`。ROOT 文档本轮未提交，执行前按 ROOT 提供的绝对路径完整读 GOAL/PLANNER 并核哈希，不复制旧计划。ROOT 唯一 graph writer，当前索引 lastCommit 为此基线。
- 修改白名单 `repos/orbits/features/personal-schedule/service.ts`、`service-factory.ts`；确有必要时 `association-reader.ts`。新测试 `repos/orbits/tests/services/personal-schedule-transaction-associations.test.ts`；必要新 SQL fixture `repos/orbits/tests/fixtures/personal-schedule-transaction-associations.ts`。原 association/runtime/exceptions/reminder 相关完整测试只读运行；若需修实际直接注入消费者，先给 ROOT 精确路径登记，避免碰 B 的 API/client fixtures。
- B0061独占页面 client/model/workspace/sheets 与 pages/API fixture。A禁止修改这些文件、App、共享 schema、pool max、auth、全局主题、通知 flag/cutover／worker、迁移或部署。ROOT独占台账、真实账号、DB、Simulator、服务生命周期、费用账本及公网。
- 证据只能在本线 ignored `build/harness-state/evidence/sprint-0062/run-01/`，不放 public/src/docs。日志不能含 Cookie/token、连接串、密码或个人正文；HTTP 异常只打印第一行，不能输出 Playwright Call log。
- 先逐符号 upstream impact；HIGH/CRITICAL先报告，UNKNOWN用真实源码 caller补充。不用扩大pool、连接数量、跳过ACL、超时重试循环或释放actor锁掩盖根因。
- 维持 serializable transaction、actor/workspace锁、既有有限重试、expectedUpdatedAt、幂等 fingerprint 和 receipt；拒绝权限时 schedule/exception/reminder/receipt全部回滚。事务外纯读取可以沿原 pool。
- H：事务／权限读取接线改变。A先完成 RED→GREEN、实际相关完整定向集与一次 Web types，不启动全量。ROOT统一冻结0061+0062相关写入并分配唯一 Web I，按 RULES5.2 同一精确版本检查支持两Sprint对应 SC；所有原 fail/skip/denied 记录保留。若源码继续变动，仅补受影响定向回归，不伪称全量全绿。
- 定向验证与官方固定 BASE..TREE gate 后允许可独立复用功能 commit，明确“集成待验”，不是 completed；REPORT仅 run真实结束后编制。ROOT合并树实际 I/生产构建/跨端验证后补真实闭环。已批准 $5累计账本不重置，本轮真实provider调用为零，隔离测试 dualguards 不关闭。

## 四项 SC 与主要验证

| SC | 验收 | 主要证据 |
| --- | --- | --- |
| 62-01 | 持锁事务的关联ACL只使用该事务连接，无额外借池；并发请求不饿死 | 可控max2池、真实SQL/store/reader执行记录，原因果RED与GREEN；不能仅mock允许所有ID |
| 62-02 | 同版本并发一个成功、一个冲突；成功同幂等键重试原回执，无重复写；不同actor/workspace不混用 | 服务完整定向CAS/receipt/隔离用例，ROOT真实同QA并发PATCH+独立GET |
| 62-03 | 无权限笔记／人脉仍拒绝；任何ACL/计划失败无部分业务写入；取消实例及规则保留 | 实际reader拒绝与失败回滚完整测试，ROOT QA原业务字段恢复及9/18实例404 |
| 62-04 | 固定源码及中文报告commit/Main精确merge/push；生产Web重编重启后运行健康 | 官方gate、相关types、唯一受影响端Web I原结果、ROOTbuild/health/真实回读；不代替提醒送达／Push |

## 连续实现任务

### 任务1：真实执行器边界 RED

- [ ] 完整读 service/factory/association-reader、transactional-postgres 与现有 SQL fixture；记录原 pool reader 和 tx store调用路径，先 impact实际待改符号。
- [ ] 新受控 fixture 包装真实存储SQL，两个租约占用时事务内调用pool.query确定性抛出 `association read escaped transaction`，不靠永久挂住或sleep判断；记录 pool 与 tx executor的 query分流。真实 contact/note repository 与 ACL仍运行。
- [ ] 用 production接线或等价可注入factory验证：`await assert.rejects(concurrentSave(), /escaped transaction/)` 的原缺陷证据必须来自旧代码；修复后的测试主断言为并发完成、无逃逸读，不能把fixture自身拒绝当成功。期望接线方向：

```ts
// 生产 factory 按本次事务 store构造，示意名称不是强制新公共API。
associationReaderForStore: store => createPersonalScheduleAssociationReader({ store, workspaceId })
// service execute(store) 在ACL读取前绑定；已有非PG注入保持兼容。
const reader = input.associationReaderForStore?.(store) ?? input.associationReader;
const accessible = reader ? await reader.accessibleIds({ actorId, kind, ids }) : [];
```

- [ ] 记录原RED实际命令/退出码及guards，再最小实现上述绑定；reader不可缓存错误actor/tx，不将权限结果全局缓存。

### 任务2：并发、权限与回滚完整收口

- [ ] 服务新完整测试覆盖 `Promise.allSettled` 同 revision 更新，断言一成功、一 CONFLICT；成功相同body/key重试 exactreceipt，differentbody同key拒绝。使用可控barrier驱动并发，不用延长timeout。
- [ ] 用真实 repository 的 owned／wrongactor／deleted note和contact ACL验证允许与拒绝；assert拒绝后业务集合/receipt/计划与before一致；任意SQL失败回滚且连接释放，随后GET/保存可用。
- [ ] 跑新完整文件及实际受影响旧 service/runtime/association/exceptions/reminder文件；复用未变规则计算测试，不运行通知42全链或 B API fixture。一次Web typecheck保句柄，非预期同因果最多两repair，原失败不覆盖。
- [ ] 将 manifest、固定TREE与全部命令结果交ROOT；拿官方gate后路径限定独立功能commit（集成待验），释放所有产品写锁。等ROOT固定组合树 I 结果再编制真实中文REPORT，不能先写成功。

### 任务3：ROOT真实主线验收与交付

- [ ] ROOT冻结两线固定源版本，精确合入 chat-agent，唯一组合版本 Web I支持共同集成项；构建停旧生产、启动新产物、健康与正式登录重新确认。App源码没变则复用0060有效安装，不无谓重AppI。
- [ ] 只操作已识别 QA系列 `personal:c1fdb0042b5aa1293939d5af`，actor `account_orbit_generated`，同 expectedUpdatedAt并发两个series标题PATCH，应得到200+409；胜者同幂等重试不变，独立GET确认，然后按最新revision恢复原业务字段。9/18实例仍404，boundedfrom/to仅17与19；不能要求旧updatedAt不变，因为成功真实保存会推进revision。
- [ ] 错误日志仅首行，真实异常先保脱敏证据；不再将受影响旧生产并发复现。ROOT记录fixedSHA、MainmergeSHA、普通push与独立远端、BUILD/PID/账号/数据存储、全部未通过项，再判断SC；到期提醒授权待决不影响本修复实施，也不能标送达完成。

## 交接与失败处置

一个run，不新增评审、不自动重生成。失败或外部条件缺失只绑定具体SC；安全部分正常commit，中文REPORT逐项给原RED/GREEN、types/I完整fail/skip/guards、实际风险与回退。ROOT新增文档与用户AGENTS/CLAUDE dirty不夹入功能commit。真实外部写范围不扩大到其他账号、通知、token、provider或未知记录。
