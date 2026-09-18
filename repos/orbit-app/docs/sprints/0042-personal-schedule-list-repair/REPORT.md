# Sprint 0042 执行报告

2026-09-16；唯一 Generator C；同一 `run-01`，未重开生成、未调用 Evaluator。个人日程在线列表现能读取正式可编辑记录：主包创建、列表打开详情、编辑重开、Web 同记录读取和编辑、App 回读、确认删除及日历刷新一致，真实空态与读取错误不再混显。五项业务 SC 已验证；报告合并和登记表闭环由协调者完成后才可登记 completed。全量 Web 测试未全绿，详见失败保留。

## 固定版本与边界

- 原需求 R-08/R-09，0010/0026/0027 回归；规划产品基线 `9b2a9ccc5cbe0db32496424324071b321acf4a11`，实际起点 `91bfdbb2351a31c268babcf92ceba879f84f3645`。
- 冻结 Planner SHA256 `d0218e9e34f7c5dd5561483978d2111def145a9f78a410b79964b251bbb9f11d`；GOAL/PLANNER 未修改，原五项 SC 不降低。
- 分支 `codex/sprint-0042-personal-schedule-list-repair`，实现树 `/Users/xzhao/Projects/orbit/.worktrees/sprint-0042-personal-schedule-list-repair`。
- 功能提交：`94268e757a58e489d09a9988cb8492c844f96bb8` 在线 owned 集合链；`04be65cbceaffd39bfe54e15bc9ebc203a868668` 错误时不显示空态；最后功能 **`6a92629e9dca73e7dbd675308d6ca0e378c75ffe`** 页面正式 canonical 账号接线。
- 协调者已集成功能到外层主仓库 `426b18819523c0b05dd30365b5a02669850841ac`。最终本地 production Web BUILD_ID `ffPa-FLfCgMTBiMrUVaAu`，PID90050/session28331，启动 08:58:13.987Z，guard ready/health200；六项相关源码与外层提交字节匹配。Web 子目录独立旧 `.git` 的 child HEAD 不代表此次代码身份。
- iOS Simulator `DA432E9E-1204-4EE7-9A20-251CDB48E265`，主包 `app.agenthubs.orbit`，主线 Metro8082（实际 RCT_jsLocation `127.0.0.1:8082`），API 原值 `http://127.0.0.1:3000`，同 actor `account_orbit_generated`。不是 PhoneWeb、远端部署或实体设备验收。
- 原生 Debug build/install 成功；后续两次补修仅 Web UI/Page，App/API 相关源码未变，故不重复原生编译。Web 最终回读和错误/恢复均在最终 426 production artifact 上重新执行。

## 根因与实现

不能把历史集合投影冒充正式个人记录：旧主包证据及当前同 actor 无 query GET 均有 35 项、4 项 legacy personal 展示投影，缺 accountId/ownerUserId/createdAt/updatedAt。个人编辑列表的严格 DTO 检验正确拒绝它们。另一个实证 RED 是 authority 集合合法混合 event/meeting 被 narrow personal schema 当成损坏，产生 503。

修复只将个人在线列表接到 `/api/schedule-items?scope=personal`，此新 query 为共享 API 的可选行为；无 query 日历/首页聚合及 legacy 来源语义保留。Owned 服务先验证完整 authority envelope/payload、actor、collection、ID/source、时间版本及重复，再排除合法非个人项；正式个人数据损坏、foreign、重复显式失败。未猜补 owner/version，未降低正式写入回执或 schema，未批改既有数据、扩权、增加身份协议。

真实验收发现并在原 run 两轮有界补修：Web 空集合缓存遇到错误仍显示“暂无个人日程”；Web Page 又把外部 auth user ID 传给要求 canonical account 的严格 client。分别最小修改空态条件、调用既有 `resolveAuthenticatedApiActorFromSession`；common helper 不改，anonymous/null 保持登录 redirect 和 fail-closed。

| SC | 文件及功能 SHA | 实际验证与结果 |
| --- | --- | --- |
| 01 | App `src/api/personal-schedule.ts`、`src/screens/schedule/PersonalScheduleList.tsx`；Web `app/api/schedule-items/handler.ts`、`features/personal-schedule/service.ts`、`app/(app)/app/tasks/personal-schedule-client.ts`；94268 | Collection/Web client/App 实际 List RED→GREEN；production owned200/0 为真实空态；native 创建后 owned200/1、列表详情真实记录。 |
| 02 | 上述在线链；Web `app/(app)/app/tasks/personal/page.tsx`；6a926 | 同唯一 ID，App A→B、Web B→C、App 列表/详情重开 C；日历既有下拉刷新后 C。Web 确认删除后 GET404、owned0、聚合 exactID0、native 日历0、重开列表空、详情“没有找到对应内容”。 |
| 03 | Web `tests/api/personal-schedule-collection.test.ts`、既有 routes/authority tests；App `tests/personal-schedule-editor.test.ts`；94268 | 合法混合项成功；record/payload source、ID、owner、version、duplicate、unknown-field 反例显式失败；实际 handler 跨 actor/未认证拒绝及取消过滤。异常数据只在隔离 store 测试，不污染真实账号。 |
| 04 | Web `personal-schedule-workspace.tsx`、`tests/pages/personal-schedule-workspace.test.tsx`；04be；App `tests/personal-schedule-interactions.test.tsx`；94268 | Web empty→failed refresh→recovery 完整行为 RED→GREEN。Root 有界 TERM PID84245，native 原3000同登录刷新真实失败、空提示0，恢复同 artifact 后真实空态。最终426 Web 浏览器断网刷新：错误1/空0；恢复：错误0/空1。 |
| 05 | 全链三功能 SHA及本报告 | 最终主线426 production Web与主包8082双向读写同记录，精确 cleanup 全部入口一致。Root已完成各功能整合及相关测试/typecheck/build；报告固定 SHA交接，最后文档合并/登记待协调者执行。 |

0033 同步投影 `439f7f439` 与消费者 `00ccb4982`/`9ca83b4dd` 尚未作为本轮已交付主线 local-read 修复。核实无活动产品写者后只移交当前在线入口，不改通用 hooks/sync；未覆盖已交付 mirror-first。未来协调者合并0033须保留 mirror-first 并补合并树0042 SC，不盲合整条分支。本轮不依赖 mirror，冷启动 mirror 完整性测试不适用，不能声称已验0033。

追加路径均先登记/移交：collection 专用测试、Web list client、App List 在线入口、ink-signal 两处 owned GET 预期、feature `LIVE_IMPLEMENTATION.md`、Workspace 及其完整测试、Page 及 `tests/pages/personal-schedule-page-account-scope.test.ts`。共享 contract 源/副本、schema、四份 i18n、数据库基础设施、提醒设置未改。

## 命令及证据

证据根 `build/harness-state/evidence/sprint-0042/run-01/` 被 Git 忽略；下列日志均在其 `commands/`，checkpoint 留中间失败及版本。Node22 明确路径 `/Volumes/ORICO/Dev/cache/npm/_npx/54df5c7b67c3fbcf/node_modules/node/bin/node`，v22.22.1；两端 lock 相同，经批准只读 symlink 复用依赖，不安装/升级共享缓存。

在对应 Web/App cwd，以该 Node 执行 `--test --import tsx` 加完整文件路径：

- Web collection RED：`tests/api/personal-schedule-collection.test.ts`，9 cases/2 pass/7 fail，exit1，`collection-red.log`；实际 Web client RED exit1（`web-client-red.log`），App List RED exit1（`app-list-red.log`）。
- Web 最终完整定向：`tests/api/personal-schedule-collection.test.ts tests/api/personal-schedule-routes.test.ts tests/api/schedule-items-route.test.ts tests/pages/personal-schedule-workspace.test.tsx tests/services/schedule-authority.test.ts tests/pages/personal-schedule-page-account-scope.test.ts`，24/24 exit0（`web-canonical-page-green.log`）。前序五文件19/19；Workspace RED2/1 pass/1 fail→五文件20/20；Page RED4/1 pass/3 fail→六文件24/24，各 exit1→0，保留 `web-empty-failure-{red,green}.log`/`web-canonical-page-{red,green}.log`。
- App `tests/personal-schedule-editor.test.ts tests/personal-schedule-interactions.test.tsx` 完整14/14 exit0，`app-targeted-green.log`。实际直接消费者曾36/38，失败两项均旧 GET path 预期，经移交更新后完整 `tests/ink-signal-tasks.test.ts` 13/13 exit0（`app-task-consumers-green.log`），其余25同源码 pass 复用，不声称失败的原命令全绿。
- Web `<Node22> node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` exit0（含最终 Page 后 `web-canonical-page-typecheck.log`）；App `<Node22> node_modules/typescript/bin/tsc --noEmit` exit0（`app-typecheck.log`）。
- Root集成初版 Web9文件42/42、App3文件27/27 exit0；04be 后 Web5文件20/20；6a 后 Page+Workspace 两完整文件6/6及Web typecheck exit0。最终生产build97366 exit0，runtime健康由root提供并确认。
- 原生 `xcodebuild -workspace /Users/xzhao/Projects/orbit/repos/orbit-app/ios/Orbit.xcworkspace -scheme Orbit -configuration Debug -sdk iphonesimulator -destination id=DA432E9E-1204-4EE7-9A20-251CDB48E265 -derivedDataPath /Volumes/ORICO/Dev/cache/orbit-sprint0042-native.QopTyY/native-derived NODE_BINARY=<Node22路径> RCT_METRO_PORT=8082 build`，45550 exit0（`native-build-external.log` BUILD SUCCEEDED）；`xcrun simctl install <DA> <derived>/Build/Products/Debug-iphonesimulator/Orbit.app` exit0，launch exit0。首句柄95958 exit65/ENOSPC保留 `native-build.log`；仅本轮新 derived 经批准恢复性 move 至外接专属目录，未删除旧缓存/数据。实际 native 脚本被既有 `.xcode.env.local` 覆盖为 Node25，Debug skip bundling；不虚报 native 全 Node22，未修改用户配置。

GitNexus 固定根 repo upstream：service factory HIGH（1 direct/3 total）先告警再改；handler LOW一route，App List LOW两direct/一flow，Webclient LOW一consumer，Workspace LOW两direct/0 indexedflow，Page LOW0indexedcaller/flow但按framework入口源码补查。内部对象 list/GET未收录为UNKNOWN，不当低风险。Root唯一刷新索引；fresh Page gate72801 exit0。各功能提交前固定root detect 不读取C worktree，明确其不构成C符号范围PASS，以本树精确 staged diff/diff-check补核；root实际integration staged检查及source hunk核验保留。报告提交前同样执行 mandatory staged detect 并披露边界；文档提交不跑无关产品测试。

## 唯一样本与清理

只有 `personal:94582e82347f97284366ea85`，actor `account_orbit_generated`，标题 `ORBIT0042-RUN01-20260916-A`，东京2026-09-16 18:30–19:00，隔离地点ORBIT0042-LAB。App UI 创建版本08:51:37.211Z，App UI B版本08:53:33.216Z，Web UI C版本09:00:37.787Z；均同日2026-09-16、同ID/owner。实际 HTTP回执分别 `personal-created-receipt.json`、`personal-app-edited-receipt.json`、`personal-web-edited-receipt.json`。

Web点击“删除个人日程”→“确认删除个人日程”，正式接口处理 expected version，无SQL删库/广删。删除后 GET404 NOT_FOUND、scope personal200/0、无query200/35、exactID0；`personal-cleanup-receipt.json`。App重开空态、删除详情不可用，日历下拉刷新0测试项；`native-deleted-{calendar,reopened-empty}.json/png`、`native-deleted-detail-not-found.png`。不把404误写成取消DTO200；首次验收脚本对不存在data读scheduleItem抛错，随后只读确认404和集合，无重复删除。

最终 Web断网/恢复证据 `web-426-final-{offline,recovered}-state.json` 与截图；native同源停服/恢复证据 `native-same-origin-{failure,recovered-empty}.json/png`。临时18042 origin触发登录身份隔离，只记隔离证据，**不计SC04 PASS**。经明确授权 terminate→apply_patch仅本设备 AsyncStorage `orbit.apiBaseUrl` 单键18042→原3000→launch，原登录态恢复；不读改cookie/其他键，不删除容器。共享服务只由root停启。最后一次Web文案等待错用了App“加载失败”导致NodeREPL30s reset，属工具失败；一次新内存浏览器用实际“读取失败”文案完成最终验收，不加产品修复轮。认证context/browser已关闭、凭据未输出/复制、cookie未持久化；设备留原3000同账号个人列表，设备/API写和actor锁已明确释放供B。

## 全量失败与安全事实保留

唯一分配的主线Web全量在初始 merged `f0d747730037f0f9020297cd47aea37b17c9d489`：显式Node22调用 npm test（实际runner `node scripts/run-node-tests.mjs`），session53277，exit1，3558 tests /3359 pass /23 fail /176 skip，182376.703584ms，`web-merged-full.log`。未重跑全量；后续最小UI/Page及B测试修订只定向复验，**最终主线全量仍非绿色**。

运行前删除supported provider key/token/secret和DB/PG配置的child env，但36处测试自带 `loadLocalEnv()` 重载主线 `.env.local`，隔离意图失败，PG实际运行。立即向root纠正“未loadenv/未PG”旧断言；不能把176 skips或相较旧baseline的失败减少当PG PASS/基线修复。完整逐名对照 `web-full-failure-comparison.json`、执行加载范围 `web-full-loader-manifest.jsonl`。

20名称属于固定0041 baseline（532c29dcd8dd7e960654c71cfc083c7ffed06423:BASELINE.md；旧3544/3281pass57fail206skip）：六个 fresh runtime case（events、events/[id]、o/[slug]、party、party/checkin、party/graph）；prop-gated DataCard；literal route props；navigation replay；route query parameters；every route surface；profile actor isolation；manifest generation；契约目录不含运行时代码；契约出口；contact detail mapping；app home postgres providers；三项 app register loader/redirect/first-value decoder。其完整英文名称保留对照JSON，不合并成新增0042失败。

三项不在原57名称账本：

1. `Agent ledger and queue routes resolve server auth instead of request identity fields`：B新增auth实现与旧源码regex预期不符，交回B；root后续2eb测试修订定向通过，未称原全量通过。
2. `PostgreSQL keeps shared appointment details idempotent and accepts only one concurrent version`：fulfilled1 assertion通过，conflict-class计数0≠1；相关源起点→f0d无diff，可能未归一化SERIALIZABLE40001，拒绝reason未记录故仅推断，不改无关PG业务。
3. `Postgres heartbeat keeps exactly one live chain per workspace across duplicates, lost sends and restarts`：源码现有COMMIT decision先于发送和dispatched_seq更新，可进入pending resend窗口，实际ran/resent/resent而非superseded；与0042 API修改独立。

获准只读PG审计 BEGIN READ ONLY/ROLLBACK exit0，没有手工DELETE/DROP/重跑。appointment_details/maintenance前缀schema均不剩；两个exact随机UUID未被测试日志记录，不能声称已恢复exact名称。35个提取前缀只剩6个可识别preexisting operatorCLI schema，migration日期早于本轮；本轮范围public orbit_records created/updated计数0，但无BEFORE不能保证任何业务完全未变/被删项不存在。Provider reload 风险与共享服务guard/费用核验由root负责，不将仅移除child env当无外出证明。C定向/实际本链未调用AI、付费或OAuth；本链新增费用0，既有累计账本$0.012780不重置，历史未结算/其他线费用不伪造结清。

## 交接

业务SC无剩余未测项；不包含远端/实体设备、0033未来mirror整合或无关0041/PG基线恢复。最终源码及相关tests已固定提交，C无未提交产品修改；仅本报告文档commit待root合并核验登记。主线用户AGENTS/CLAUDE、管理README dirty未动/未提交。证据和本轮外接derived保留，不删除数据；本线没有活业务写进程，browser RAM认证已关闭。文件锁及运行设备/actor已交回；共享3000/8082保持root现有运行进程。

必要回退由协调者按三固定功能提交定点revert并重新验证/生产build，不由C reset/merge/push。Web/App读取影响、scope参数及canonical Page边界已说明；root以本报告固定SHA合并chat-agent、检查文档/登记闭环后关闭run-01。后续0043不在本run启动。
