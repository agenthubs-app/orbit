# Sprint 0062 run-01 结束报告（供 ROOT 收口）

## 结果

已修复个人日程保存中的关联权限读取逃逸事务连接问题。生产 factory 按当前事务 store 构造关联 reader；service 在事务内进行 ACL 检查，保留旧注入 reader 的兼容路径。没有扩大连接池、放宽权限、释放 actor 锁或修改 CAS、幂等、事务重试规则。

功能已正常提交并由 ROOT 精确合入 Main；ROOT 新生产产物上的真实 PostgreSQL 并发保存、幂等重试、独立回读和原业务字段恢复已通过。共享全量集成并非全绿，既有失败、跳过和出站拦截如实保留。报告文档提交、Main 收口及 push/独立远端核验尚由 ROOT 执行，不能提前标记整项 completed。

## 固定版本与范围

- Planner SHA256：`b037a213bdafe01667051211f82dc10f034880a32ab0d0ff21900006fe52205f`。
- BASE：`0d5a57f340863d9596afe6f7637c35dcac68f81e`。
- 功能 commit：`021451c5d8eaffb129e4a43bbd9c21017f549101`；TREE：`3bb786b9ef67d5c251b78de11e195abff30b207e`。
- ROOT 组合 Main：`47f12034e356d303f3034a5f58aa9d9d9eb2167b`。
- ROOT 官方 BASE0d5..组合Main47范围 gate：13 files、40 mapped symbols、0 flows、LOW，无异域 paths；这些是组合0061+0062范围，不冒充A四文件单独结果。
- 精确四文件、267 行新增/3 行删除：`service.ts`、`service-factory.ts`、新 `personal-schedule-transaction-associations.test.ts`、新同名 SQL fixture；均在 `repos/orbits` 对应个人日程服务/测试目录。未改 App、共享 API/schema、pool、通知开关、cutover/worker、账户或环境。
- 功能 patch SHA256：`dd9e8252c8548c4f861ed11309d2c745b03f63e0d31b1cd829ab5aae12fb2997`。
- ROOT 官方固定 BASE..TREE detect_changes 审查确认四文件域内范围，无 stale 警告，授权后正常提交；提交后工作树干净，产品写锁已释放。

## 风险与因果

旧实现中，一个连接持有 actor 事务锁，另一个并发请求占用第二连接等待锁；持锁事务通过外层 reader 借第三连接执行关联 ACL，max2 池耗尽而等待。修复只将该读取绑定到已有事务连接。

编辑前 impact：`createPersonalScheduleService` HIGH，4 个直接调用方/15 个扩展影响；factory LOW，3/8；`mutate` LOW，3 个 create/update/remove 调用。索引报告的 execute 零映射不代表零风险：源码存在 mutate→withScheduleTransaction→execute 动态回调，补记 UNKNOWN。新 fixture/helper 未索引，补记 UNKNOWN，真实调用仅新测试。HIGH 已事先告知 ROOT/用户。

## 验证及保留失败

本线 Node22、双重出站保护始终开启，未运行全量 I、真实 DB、服务或设备操作。受控 max2 SQL fixture 包装真实事务 client、Postgres store、contact/note repository、ACL、service 和回执路径；它不是实际 PostgreSQL MVCC/隔离或设备验收的替代品。

| 证据 | 实际结果 |
| --- | --- |
| `causal-red.log` | 初次 seed 失败，contact evidenceIds 为空违反真实 decoder；独立 fixture 原因修复1次，未放宽 ACL |
| `causal-red-with-reason.log` | 旧源码有效 RED：exit1，1项失败，421.437208ms；明确报 association read escaped transaction: max2 pool has no free lease；guards0 |
| `causal-green.log` | 最小生产修复后 exit0，1/1通过，359.574833ms；无跳过/取消，guards0 |
| `complete-new-tests.log` | 14项中2通过/12失败：fixture 关闭原 client 而非 runtime 缓存 wrapper，导致后续用例缓存错池；独立 fixture 生命周期原因修复1次，未改生产缓存或削弱断言 |
| `complete-new-tests-cache-repair1.log` | exit0，14/14通过，565.167959ms；无跳过/取消，guards0 |
| `direct-consumers-final.log`，句柄6770 | exit0，43/43通过，0失败/跳过/取消，2469.852542ms；全部 worker/wrapper 双 guards 拦截0 |
| `web-types.log`，句柄32413 | 一次 Web types actualexit0；双 guards 拦截0 |

完整定向集包含新事务测试、旧 runtime/exceptions/reminder-plans，以及 contacts-live-store/note-association-reader。覆盖同 revision 一成功一冲突、exact receipt 重试、同 key 异体拒绝、actor/workspace 隔离、contact/note 外人/删除/缺失/异 workspace 共八种拒绝、计划/回执 SQL 失败全业务回滚及释放租约、后续保存可用、取消实例保留、旧注入 reader 兼容。不存在独立 Today provider 测试文件，没有虚构该覆盖；provider 未改，底层 service.list 已验证。未运行 B API fixture 或通知全链。

ROOT 唯一共享 Web I（句柄39251，组合 Main47f12034，原 Node22/guards）：actualexit1，3808 tests，3543 pass，59 fail，206 skip，0 cancel，176985.014416ms；2026-09-17 00:39:38.536Z 至00:42:35.658Z。ROOT 完整 fail NAME 集与上一 A60 Web I 的59项完全相同，无新增/无旧失败消失。zero-outbound denied4，protected0，不能写全量通过或全部 guard0。ROOT 组合 types 句柄17904 actualexit0、guards0。未因既有失败新增一次全量 I。

## ROOT 真实生产与跨端证据

以下为 ROOT 主动交付的实际运行结果，本线未自行操作真实数据或运行设备：

- 旧生产 PID7579 已由 ROOT 停止；生产 build51509 子构建 actualexit0，新 BUILD `L8fbGtRZ_QJku0p8citoB`、Next PID15582、Main3000 健康200，源码固定为组合 Main47f12034，原 budget preload/ledger 保持。
- 2026-09-17 00:43:59.541Z 真实 PG CAS helper actualexit0。同一个已识别 QA 系列的两个 parallel series PATCH 返回 `[200,409]`，败者为 CONFLICT，胜者同 key 重试 exact receipt；独立 GET 后按最新 revision 恢复原 title/rules/note/contact。
- 9月18日已取消实例仍404，bounded dates仅17日及19日，取消实例与原规则未丢失。
- Web UI 将提醒 lead15→30，只发一次 scopeSeries PATCH，ACK、GET/detail 均为30；Native 在同小雨账户/Api3000 的选择窗确认30 checked，再由原生 UI 保存回15成功。
- 00:50:10Z 独立 GET200 确认 title、times、daily until19、reminder15、原 note/contact 全部恢复；18日仍404。真实成功保存正常推进 revision，最终 `00:49:42.607Z`，未要求恢复旧 updatedAt。
- 00:50:54Z ROOT 再从真实 Web 页面读到提醒15，完成 Web30→Native读30→Native保存15→Web读15的往返验证。
- 原失败句柄26982的两个 timeout及同旧产物重启恢复7579的证据保持原样，新真实 CAS 证明原症状解除，不改写原失败为通过。

## 四项 SC 状态

| SC | 最终事实与状态 |
| --- | --- |
| 62-01 | 满足：有效旧源码因果 RED、修复 GREEN、max2 无逃逸读；ROOT 新生产真实并发完成，不再连接池饥饿 |
| 62-02 | 满足：本地 CAS/幂等/隔离完整用例，加 ROOT 真实200+409、exact replay与独立GET |
| 62-03 | 满足：真实 repository 的拒绝/回滚完整用例，ROOT恢复原关联/规则，取消18日404且17/19保留；跨端提醒改动恢复15 |
| 62-04 | 部分满足，等待 ROOT 交付收口：功能正常commit及精确Main合入、types、唯一Web I实际结果、新production build/health/真实回读已完成；中文报告文档gate/commit、最终Main与push/独立远端核验尚未执行，未预填SHA或completed |

## 边界、费用与交接

真实到期提醒送达/远程 Push 不属于0062 SC，未验且不标通过。inbox actorwide 派生刷新未获批准，ROOT 浏览器主动挡 badge GET，不声称 inbox 验收通过。未新增 provider 调用；累计$5上限未重置，ROOT ledger SHA 前缀493f保持不变。A只交该 ignored 报告文本；ROOT负责正式落稿、独立文档范围 gate、正常 docs commit、Main收口与远端核验，并登记其真实结果。

如需回退，由 ROOT 对精确功能提交正常 revert并重新验证产物，不做 hard reset、扩大连接池、删除真实QA或清空其他账户数据。无本线未结束测试/type句柄或产品写入；本线run-01实现及证据交接结束，整项交付状态取决于62-04剩余收口，不重开closed0060。


## ROOT 最终交付补充（2026-09-17）

上述 Generator 文本保留交接时点，不用后续成功覆盖原失败。产品主线47f12034e356d303f3034a5f58aa9d9d9eb2167b已普通push：句柄28793 actualexit0；独立ls-remote句柄86741 actualexit0，远端chat-agent精确同SHA。正式中文报告与台账文档由ROOT另行正常提交、push并独立核对；最终文档SHA登记于实际Git和ROOT检查点，不在报告内预填自引用SHA。

ROOT新生产Web实际补测：自己的新QA系列personal:5d78132dbe9006d20995aa63由实际页面创建；创建回执为正常201。管理脚本46759误期待200而失败，保留失败。只读核对两个实例及准确sourceId后，修正回执期待并精确续做该记录，未重复创建。75620 actualexit0，UTC00:58:23.030Z：仅本次删除9月20日后独立GET404，9月21日仍GET200；随后整个系列清除提醒与重复，唯一PATCH为reminderMinutes:null/recurrence:null，详情显示不提醒·不重复，独立GET无这两字段。最后通过实际UI软删除本次自建QA，独立GET404。续做恰三次业务mutation（本次DELETE、规则PATCH、系列DELETE），原QA系列未动；两次inbox badge GET刻意阻挡并排除，不是通知验收。

0061 SC61-02真实Web删除动作缺项现在已补齐；SC61-01清除规则有新实际UI与正式回读证据，不仅fixture。0062不将该页面实现归功自身。共享Web I原59失败/206跳过/denied4仍未解决；实际到期通知、远程Push和全域离线仍不据此通过。正式报告文档gate/commit/push闭环之前交付状态仍待ROOT收口，不新增Generator run。
