# Sprint 0043 — 执行总结（failed）

## 目标实现情况

本轮要让名单和分析入口使用真实活动 ID 与既有资格，并区分合法拒绝、隐藏资源和读取失败。

已验证的部分：未登录或 owner 资格未确认时不提供可点击名单入口；名单与分析读取不复用旧账号/旧活动缓存；注册资格仍要求本人、同一活动、active canonical registration，没有扩权。正式 MAIN QA 读回确认 event_02 的私有详情与真实空名单均为200，event_signup_03 的私有详情/名单安全404，两场本人分析403合法保留。

仍未完成：event_02 主线聚合实际仍500，没有预期的配置缺失503说明；public cancelled 与 ROOT 核验的 Core published 不一致；真实 registered 阳性/已配置聚合 fixture 未获创建及清理授权；原生请求的目标 ID、服务地址和 canonical actor 未直接捕获。早先原生标题与后来正式 Web 目标标题不对应，已撤销标题到目标 ID 的推断，不能用那些截图满足冻结原生 SC。局部测试通过及部分合入不改变 failed 结果。

## 运行记录

- 目标：[GOAL.md](GOAL.md)，R-04/R-09/R-14；结果：**failed**。
- 唯一 run-01，Generator `/root/c_sprint0043`；恢复原登记，不另开 Generator。结束：2026-09-16 10:41:46 UTC，按 ROOT 指示收口；开始时间沿根原登记，不虚构新起点。
- Planner revision1，SHA256 `424fd770cceceb81a6c0eb4987f6eaab39f02a45dd1ce95ab678417649e188cc`。
- 产品基线 `426b18819523c0b05dd30365b5a02669850841ac`；本树 tracked clean 开始，node_modules symlink 仅复用同 lock 已安装依赖。用户/其他线 dirty 未纳入。
- 分支 `codex/sprint-0043-event-read-access-repair`；最后功能 HEAD `aa2699e474a862aea40c46bab6f399b342db3d9f`，首功能 `f2a0066df0a27d4447eb4c09e7342b6c57305cb0`。
- ROOT 合入 C 的提交 `4378c964c`；正式验收生产树 `f2a25a55c4f1e11f773ac6f29eb4099ad59ce547`，BUILD_ID `EEQm5wm0AApGsD3hvfqSh`。后续 HEAD4201仅文档/A2A登记，不替代生产版本。
- ROOT 精确合并树检查：App221/220pass/1旧日程 orphan；Web22/22；两端 types0。不是完整全量或业务全通过。
- C 未 merge/push、未停启服务。远程 SHA/push 未验证，本报告不声明远程交付。
- MAIN本地生产 localhost:3000，workspace:orbit-dev，formal account/me 确认 `account_orbit_generated`。凭据仅 RAM 读取 ROOT Web 原 `.env/.env.local` 两个 ORBIT_XIAOYU_TEST 键，不输出邮箱/密码/cookie，不复用 Phone 演示凭据。
- ROOT 生产 build83338 exit0；WebPID22612/session85939；Metro8082PID7582。ROOT native xcode94016/install5943/launch79890 exit0，依赖 warnings 保留；DA432E9E-1204-4EE7-9A20-251CDB48E265，主包 app.agenthubs.orbit。原生 executable hash `a1ef0cdb9e3d8ea9b90528d8485e2232298a99bbd4576b98bb340467604d7623`。这些生命周期操作均由 ROOT 完成。

## 改了什么与 commit 对应

以下均以仓库根为相对起点，未修改权限范围、报名/导入动作、AI、Phone、共享生成契约或业务配置。

| 功能/原因 | 文件 | 功能 commit | SC |
|---|---|---|---|
| owner exact-ID资格确认后才显示名单CTA；scope切换/lateACK失效 | App `src/screens/events/EventAttendeeRosterLink.tsx`、`EventDetailScreen.tsx`；`tests/ink-signal-event-detail.test.ts` | f2a0066df |01/03|
| 分析和名单既有GET network-only/current scope；分析拒绝foreign event payload及配置错误格式化 | App `src/screens/events/EventAnalyticsScreen.tsx`、`EventAttendeesScreen.tsx`、`src/view-models/event-analytics.ts`；`tests/api-resource-scope.test.ts`、`event-analytics-view-model.test.ts`、`app-wide-events.test.ts` | f2a0066df |01/02/03/04|
| 注册源/metadata异常503保护，保持active本人同event资格；ROI无配置typed错误 | Web `app/api/events/[id]/registered-event-access.ts`、`analytics/handlers.ts`、`features/events/event-analytics/read-model.ts`；`tests/api/event-analytics.test.ts`、`tests/services/event-analytics-configuration.test.ts` | f2a0066df |02/03/04|
| 必要离线登记：沿现有events durable_normalized/schema1；C新增5行后的audit绑定255→260 | App `src/data/offline-read/route-domain-inventory.ts`、`scripts/audit-offline-read-surfaces.ts`、`tests/offline-read-inventory.test.ts` | aa2699e47 |01/03|

补充登记不等于 universal mirror 已接线；没有把资格读改成 secret/offline 例外，也没有永久修复审计的行号脆弱性。Phone public404 authenticated fallback 不由本轮重实现。

## 验收结果

| SC | 结果 | 实证与缺项 |
|---|---|---|
| SC-0043-01 | fail / missing | handler/真实hook browser边界及MAIN owner event02名单200空态已证实；原生详情→CTA→目标名单HTTP的exact target/path/actor未捕获，旧标题映射撤销。|
| SC-0043-02 | fail / missing | MAIN event02 aggregate仍500 INTERNAL_ERROR，无typed503 reason；两event registered自身403合法，但真实registered positive与configuredaggregate fixture缺，原生目标分析未满足。|
| SC-0043-03 | fail / missing | 正式sameactor/匿名401、403、安全404矩阵及缓存/lateACK反例成立；配置/上游实际500仍含混，目标原生错误/入口未完整证明。没有把安全404伪装200。|
| SC-0043-04 | fail / missing | 字段allowlist/foreign scope/cancelled canonical注册拒绝用例保留；MAIN public两event cancelled与ROOT Core published冲突，历史/取消/真实active角色矩阵缺。未用legacy取消报名投影假active。|
| SC-0043-05 | fail / missing | 固定版本MAIN正式QA HTTP已完成，生产/native构建版本有ROOT receipt；旧原生实际点击仅属未确认其他事件，不能替代冻结ID同账号主包有权/无权点击。500底层原因尚未查实，真实positivefixture未创建。|

### 同 canonical actor 的正式 MAIN HTTP

formal login后独立 `/api/account/me`200，data.account.id=`account_orbit_generated`；以下响应 feature-mode 均 live，只有GET读取，不输出个人字段。

| event | 私有详情 | attendees | aggregate | attendee自身分析 |
|---|---|---|---|---|
| event_02 |200，event.id精确相同|200，event.id精确相同，attendees0|500 INTERNAL_ERROR，无配置reason|403 FORBIDDEN|
| event_signup_03 |404 NOT_FOUND|404 NOT_FOUND|403 FORBIDDEN|403 FORBIDDEN|

匿名同8条私有GET均401 UNAUTHORIZED。public精确两个ID均200且event.id相同，但status cancelled；event02 owner详情status confirmed。正式 Web event02标题为日中AI圆桌、signup03 public标题为日中投资人与创业者沙龙；与早期native“沉睡/东京”标题不对应。原生截图保留观察历史，不用于目标SC通过。

## 验证与失败历史

证据根 `build/harness-state/evidence/sprint-0043/run-01/` 已忽略，不提交日志/截图/凭据。Node22使用固定缓存 `/Volumes/ORICO/Dev/cache/npm/_npx/54df5c7b67c3fbcf/node_modules/node/bin/node`；无安装/升级。相同功能源/依赖的有效检查复用，无关docs提交不作废证据。

| 完整命令/范围 | 实际结果 | 证据/版本 |
|---|---|---|
| App `node --test --import tsx tests/ink-signal-event-detail.test.ts` |158/158 exit0|原完整工具输出；f2源码，真实hook/client browser HTTP fixture，非live/native|
| App analytics VM/render/private route + attendees VM四完整文件 |19/19 exit0|原工具输出，非native；包含expected-ID拒绝|
| Web16完整直接消费者文件，包括analytics/configuration、registered operations、post-event/agent/admin、roster/import |177/177 exit0|`commands/web-direct-consumers.log`；覆盖HIGH wrapper12caller关联族|
| App resource-scope/attendees source/VM三完整文件 |28/28 exit0|`commands/app-roster-scope-green.log`|
| App完整app-wide-events+api-resource-scope |43/43 exit0|`commands/app-consumer-repair-green.log`；第一repair，仅signedOut旧CTA期待改为不可点击|
| Web完整隔离 `event-analytics-read-model-postgres.test.ts` |1/1 exit0、0skip|`commands/web-isolated-pg.log`；自建DB/schema/workspace，绝非MAIN registered阳性|
| App一次全量：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs 'tests/**/*.test.ts' 'tests/**/*.test.tsx'` |3019 total、3016pass、3fail、0skip；exit1；307799ms|`commands/app-full-isolated.log`；原2366已结束；2旧signedOut样式期待+offlineinventory缺项，不改记全量通过|
| Web一次全量：`node scripts/run-node-tests.mjs` |3571 total、3312pass、53fail、206skip；exit1；388687ms|`commands/web-full-isolated.log`；原71774已结束；audit/source期待及隔离missingPG cases，不能与不同隔离条件的旧23fail直接作回归数比较|
| 第二/最后repair：App完整offlineinventory+resource-scope+attendees source/VM |42 total、41pass、1fail、0skip；exit1|`commands/app-policy-direct.log`；新增qualification及名单POST audit缺项消失，唯一未修改PersonalScheduleList旧orphan保留|
| Web `tsc --noEmit --incremental false -p tsconfig.json`；App `tsc --noEmit` |两端exit0；补充policy后App再exit0|`commands/web-typecheck.log`、`app-typecheck-final.log`、`app-policy-typecheck.log`|

全量触发：权限/共享注册适配器H，本地收口仅受影响两端各一次。预加载 `isolated-env.mjs`阻止loadLocalEnv补回`.env/.env.local`，MAIN DB URL置真实空串，阻断外出fetch，剥离provider秘密；不是“delete env即可隔离”。206skip不算PG PASS，53fail未盲修。全量后仅批准两个const登记补充，不重全量。

TDD历史：signedOut误导CTA、owner lookup缺失、actor/baseUrl/event/logout lateACK、foreign event报告、注册源异常、配置typed错误均有RED后最小GREEN。配置fake最初SQL参数断言不准确，修正后以回退本轮throw得到真正genericError→typedclass断言RED（`web-configuration-red.log` exit1）再恢复GREEN。离线资格entry新测试RED缺条目（`app-policy-red.log`），补现有durable tuple后GREEN。行号audit缺失由原完整full RED证明；255→260只对齐本次位移，未宣称稳定定位问题永久解决。

隔离PG：`/Volumes/ORICO/Dev/cache/orbit-sprint0043-pg.UtIQJy/cluster`，独立Unixsocket同目录`socket`，port55443、listen_addresses空，DB`sprint0043_test`，owner xzhao/PID8368。运行既有operations、records、appointments、analytics migrations于唯一随机schema/workspace。finally精确drop自建schema，查询确认无剩余匹配schema，再停止自建cluster；未递归删除，证据目录保留。不触MAIN orbit_events、PhoneDB或其他进程。

未运行/未满足：真实registered positive/configuredaggregate fixture、原生exact target/path/baseUrl/actor与HTTP、实体设备/远程部署（本SC本地Simulator范围；无额外远程声明）。没有fixture/config/migration/报名/导入/paid/provider写入或存储reset。

## 最小只读根因链与后续范围

- 合法拒绝有实证：ROOT readonly核两event没有QA canonical membership/role assignment，signup03非owner；MAIN403/安全404与之相符，不改成放行。
- 配置typed保护只覆盖read-model最终无roiRow；实际调用顺序为 `aggregate handler → readOrganizerAggregate → ORGANIZER_AGGREGATE_SQL → EVENT_ANALYTICS_ROI_SQL → readEventAnalyticsRoiSnapshot → row/roiRow检查 → analyticsErrorResponse`。检查前任一SQL/快照异常可以先进入generic INTERNAL_ERROR500；MAIN只证实500和无typedreason，**未查实具体异常/缺migration表，不能推断没有独立ROI命名表就是根因**。ROOT核event02 configuration_heads0，但本轮未成功让实际主线进入typed503。
- 下一独立Planner scope应绑定SC02失败：只读复现实际SQL/配置/快照链，覆盖真实未配置PG反例，明确503与配置reason，不更改资格/指标或擅自migration。另将Core/public lifecycle来源冲突、原生当前服务地址/actor/精确ID捕获及必要合法positivefixture/cleanup分别规划。不得自动克隆整个0043换编号绕过单run。
- 行号审计稳健改造和universal mirror实际接线属于0033；本轮只转交必要tuple/位移，不绕过“全部已授权数据离线可读”目标。已有SYNC_INIT_FAILED为加密生命周期失败观察，根因未查实，不能归咎远程PG锁函数。

## 交接、范围检查与预算

- GitNexus upstream现有symbol先查；新/0 graph consumer以源码补查UNKNOWN，不当无影响。registered wrapper21symbols/12callers按skill HIGH已先披露、批准，仅异常分类不改资格并覆盖直接族。ROOT fresh graph receipt复用，未自行重复重建索引。
- 两功能提交前ROOT `detect-changes --scope staged -r /Users/xzhao/Projects/orbit`均exit0“No changes detected”，但**不能映射独立C暂存**；本树exact cached diff/check/name逐次通过。ROOT真正合入C时实际stage17files/56symbols/MEDIUM，2条EventAttendees源flows；不能把本树无映射检测当产品零影响。报告提交同样披露该局限并检查本树唯一REPORT暂存。
- 未提交产品/tests改动：0；报告单独commit，SHA由Git交接给ROOT，不自引用追填。worktree保留；C不更新根README/Bridge台账。
- 原生/shared browser窗口均已归还；后续窄QA独立browser/context已关闭，RAM凭据/profile/cookie局部引用释放。自建CDP observer23938 exit0、0retainedevents；自建PG已停。无活C运行时/设备/debugger锁、无遗留测试句柄。所有源码/runtime锁释放，由ROOT继续服务/Git生命周期。
- 费用：本run新增AI/OAuth/Push/provider调用0、费用增量0、预留增量0；沿原总账，不重置预算。两个本地repair用完，无第三repair/full/newGenerator。
- 恢复/回退：保留两个固定功能SHA和worktree，由协调者如需回退仅审阅指定切片/正式revert；C不自动reset、删除或回滚main。报告failed不自动结束用户批准的整体项目，ROOT可领取下一就绪Sprint。
