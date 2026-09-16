# Sprint 0060 实际报告

同一 run-01 已完成本地实现、唯一两端 I 的实际结果核对，并保存部分功能。提醒和重复已接入既有个人日程、实例及提醒计划链；没有完成真实账号／PostgreSQL／Web↔原生／Phone 到期提醒闭环，不标记 Sprint completed。远程 Push、生产 scheduler 和投递所有权实际验收仍未完成，不能把组件或 SQL 边界夹具当作真实运行证据。

## 固定版本与执行边界

执行者为既有 A60，唯一 Generator，没有新增实现者、评审者、Evaluator 或第二 run。worktree 为 `/Users/xzhao/Projects/orbit/.worktrees/sprint-0060-personal-reminders-recurrence`，分支 `codex/sprint-0060-personal-reminders-recurrence`。桌面任务默认的旧 cwd 未作为本轮产品编辑树。

Planner revision 1 的 SHA256 为 `937055c5fc6297673cdee75ddd8099f0323319b40f0d259e05a1953360920ace`，没有改写契约、重置预算或降低 SC。初始 BASE 为 `56f043251a6d5a9f20c396af16e2c8f6b63fe067`；后端先独立交付，ROOT 随后安全接入 B0059 固定布局，再释放 App 编辑／字典锁。

| 版本 | 实际证据 |
| --- | --- |
| 后端部分功能 `57bf36165b436523c2a52be39de6b0ec7b9b8a13` | TREE `627e5bf2164fdcdc6dd94c057d8f5b8dfb96ceb5`，parent 为初始 BASE，21 自有路径；ROOT 审原完整 patch 和必要修复差量后批准正常 commit，随后 clean |
| 安全基线合并 `80d2bf7aa4e02d5549a073165217145c131dbb03` | ROOT 合入 B 固定 `df63ae16e1b1304b28cd79958c990c24278866ed`，TREE `8cea0d8c241058083bd4da7b4c05480ead57798d`；不是 A 在 dirty 状态自行合并 MAIN |
| App／派发保护部分功能 `64157ae33852851b2b71bcbb3f8190df76cf3c50` | TREE `e52d53e0f6bdc176b953e6c06195461e8260309c`，parent `80d2bf7aa4e02d5549a073165217145c131dbb03`，19 自有路径，585 增／57 删；commit actual exit 0，随后 porcelain 空 |
| ROOT 实际 MAIN 主合 `5523bfc83aa6864d94886bbe8041d6e248bab4f1` | TREE `cc859ea8c89ec0e143534787f800f8f8765c5bfa`，无冲突；相比 feature 只多 B59 REPORT／README 两份文档，全部产品／测试 blob 相同。Main 固定审计 36 files／137 mapped／0 flows／LOW，不替代真实 SC |

ROOT 官方固定审计：初始 BASE→后端 TREE 为 21 files／66 mapped／0 flows／LOW；安全合并为 83 files／203 mapped／2 flows／MEDIUM，其中包含 B 和既有 MAIN 差量，不计作 A 新功能。App 旧候选 TREE `10c8179263b7a7a7101dd4591e456e522bd97c82` 为 12 files／36 mapped／0 flows；增量 TREE `0f739bf6ddf9bb1141f3028a2ac0f1fc8afd3704` 为 17 files／60 mapped／0 flows；最终 BASE80d2→TREEe52 为 19 files／72 mapped／0 flows／LOW。ROOT 实际 write-tree、精确 manifest、cached check 0、unstaged 空及完整差量均已核，最终功能提交批准是在两端 I 真正结束和失败边界审查之后。

旧冻结 TREE／patch 及所有原始失败日志保留，未以新候选覆盖。LOW 与 0 mapped flows 不能给原 HIGH／新增 UNKNOWN 降级。本 REPORT 是功能提交后的独立文档候选，尚待 ROOT 文档门槛和另一次提交，不预填自身提交 SHA、remote 一致或真实 SC 成功。

## 功能、文件与契约

相对 B 固定 df63，本轮 A 自有功能共 36 路径：初次后端 21，加 App 14 和新 typed source 1。精确清单在 `source-manifest-final.log`，可由 `git diff --name-only df63ae16e1b1304b28cd79958c990c24278866ed 64157ae33852851b2b71bcbb3f8190df76cf3c50` 重建。

| 行为与文件 | 功能提交及边界 |
| --- | --- |
| Web `shared/contract/tasks.ts`、`shared/api-schema/personal-schedule.ts` 及 App 对应副本；个人日程 authority／representation、schedule-items 两 handler | 57bf：严格 reminder lead、recurrence／until、series／occurrence metadata；显式 v3 opt-in。v1／v2 隐藏新规则并保持旧 source identity，字段省略不擦除新设置；旧端不能隐式修改重复系列 |
| Web `features/personal-schedule/{recurrence,occurrence-exceptions,service}.ts` | 57bf：持久系列与例外／取消，有限窗口按日程本地日历展开日／周／月，月底缺日跳过；稳定实例 `${seriesId}:occurrence:${date}`；UTC 秒、跨日、全天 exclusive end、DST gap／ambiguity 不静默漂移 |
| Web `features/personal-schedule/reminder-plans.ts` 与 reminder-plan factory、inbox business refresh／record factory | 57bf：复用既有计划／target authority／actor lock／生产事务，规则、例外、派生计划与操作 receipt 一致；有限 horizon 延展，未来 scheduled 旧版计划取消，不补发历史，不复活取消项 |
| Web 上述 helper／refresh／record factory 和 `features/notifications/typed-delivery-source.ts` | 64157：当前 actor／系列版本／lead／实例时间／时区及精确 hashed plan ID 验证。默认历史读取保留 delivered／failed／elapsed 事实；scheduled 旧版不能新增投影；typed 内部 `forDispatch` 对已标 delivered、但尚排队的旧计划也重新验权，复用现有 worker 派发前两次 source 检查 |
| App `src/api/personal-schedule.ts`、editor draft/model、Screen／Detail／List | 64157：v3 requests，严格实例 identity decoder，列表当前本地日→90 日有限窗；嵌套规则按值核对，保存 ACK＋独立 GET 同版本／有效规则后才成功，删除也独立读确认；409 保留草稿，discard 用最新已保存时区 |
| App `PersonalScheduleRules.tsx`、三语 messages／zh／en／ja | 64157：消费 0059 紧凑 KV／真实底部设置窗；七种提醒／四种重复、可选结束日、每月缺日说明。明确本次／整个系列范围，单实例不修改系列规则；过去实例提示不补发，后续继续遵守规则；新无效规则错误通过 typed locale key 显示本语 |
| Web recurrence／exceptions／reminder／runtime／API tests 和 SQL boundary fixture；App rules／interactions、workspace／ink tasks fixtures | 分别随两功能提交保存；身份、CAS／幂等、事务回滚、日历边界、独立回读、actor late response、scope、三语大字／小窗、真实 queued source→production typed worker 被抑制，以及普通 task／manual reminder 兼容 |

提醒 lead 为不提醒／0／5／15／30／60／1440 分钟，重复为无／daily／weekly／monthly。重复 until 是有效当地日期，系列不能早于开始日；移动单实例晚于系列 until 不改变其继承规则。实例窗口有界，超出已有展开限制显式失败，不无限复制或静默截断。

系列及单实例更新／删除须显式 scope、expectedUpdatedAt 和幂等键；单次例外的系列版本推进，独立重开仍从持久记录读取。读取／target authorization 不创建事务或新连接、不刷新计划。生产 mutation／horizon 延展复用同 actor lock 和既有事务／retry；SQL fixture 只证明生产代码发出的边界行为，不是实际 PostgreSQL 锁、隔离或授权引擎验收。

App 单实例选择整个系列时，只有 clean 草稿才导航至系列 base identity；dirty 草稿保持，不悄悄丢失修改。单次修改继承提醒／重复；设置系列规则须明确系列范围。普通 task 和手动提醒仍走原 authority，不因 managed helper 被统一禁用。

没有新增第二条 Expo 提醒 executor 或强制申请权限；服务器投递继续受现有 cutover／owner／偏好控制。真实 cutover 会取消旧本地 managed 提醒，但本轮没有对真实设备执行／验证该取消，因此不能宣称 native／server 双发已实际验收。

## Impact、锁与风险

`createPersonalScheduleService` HIGH：直接 1、扩展 9；`createConfiguredReminderPlanService` HIGH：直接 5、扩展 31、2 个 task PATCH／DELETE flows。已先告警 ROOT／用户并获必要范围批准；task／普通提醒兼容纳入定向集，不因最终 0 flows 审计减风险。

App `personalScheduleDraft` HIGH 4／5；`readPersonalSchedule` MEDIUM 5／10／1 TasksScreen flow。List LOW 2／2／1 flow；Screen、Editor、save、discard、Detail 和局部 style 精确符号分别核影响。locale 新修复：buildChange LOW indexed 0，但真实 Screen／model caller 补查；save LOW 1／2，字典／messageKeys LOW indexed 0，以动态 translator 消费补查。

派发修复：refresh LOW 1／1（typed materialize）；createInboxRuntime LOW 4／5；精确 sourceAccess LOW 1／1，以动态 InboxSourceAccess 消费补查；createTypedDeliverySources LOW 2／8；精确 resolve LOW indexed 0，以 worker 初次／派发前两处动态 resolve 补查。新增 recurrence／exceptions／rules／managed eligibility helpers 的索引缺项是 UNKNOWN，不称零风险；最后 eligibility helper 实际 caller 为 factory 和 refresh 两处。

workspace fixture LOW indexed 0，noWrites LOW 1／1；ink fixture LOW indexed 0、诊断 open LOW 1／1，完整文件实际消费者补查。所有本次产品符号修改前完成实际 upstream；官方 fixed compare 在 commit 前执行，没有用 ROOT 普通 staged=0 冒充 worktree 门槛。

ROOT 唯一索引 writer；stale 后唯一 refresh actual exit 0、229.3s，lastCommit eb2a42350709585f781b788f3f70fadcbbe4c63b，用户 AGENTS／CLAUDE SHA 保持。刷新期间本线只源码读取／准备因果测试，没有并发 graph read／write。共享 schema／副本在初次后端窗口完成，后续 App 字典只改 App；派发修复无公共 schema／sync writer。B UI 锁释放后才实施，未覆盖 B 或 MAIN 进行中改动。

## TDD 与每因果修复账

ROOT 明确 RULES 的最多两次局部 repair 是每个相同失败因果，不是整 Sprint 总量；不同 test 名不重开同因果额度，没有提高用户硬预算。数字为 tests／pass／fail，原失败／首次 GREEN 失败及候选均保留。

| 因果链 | 实际证据与最小修复 |
| --- | --- |
| 原后端与类型 | 定向完整 18 文件 98／97／1；原 reminder route 单失败 ROOT 在 MAIN 同 guards 实际复现，handler／test 没有本次差量。Web 初次 TS2554 的 z.record 参数类型原因 repair1 后必要 tests／types 通过 |
| delivered 历史不可重写 | 有效 RED：改期／关闭把 delivered 改 cancelled；最小修复只取消 scheduled 且 fireAt≥now 的 managed 未来计划，不改 delivered／failed／elapsed 事实 |
| 默认 Today ongoing 不遗漏 | 先保新 fixture result-shape／literal type 失败；撤回仅新 list 实现，正确 RED 8／6／2 后实现 duration carry-over。另 fixture 明确窗口误含次日 07:00，只纠正窗口至同日 14:00。最终七完整文件 46／46，Web types 0 |
| App draft／receipt／实例 | 纯规则 RED 4／0／4→完整三文件 16／16；legacy zone／例外移动 RED 6／4／2→完整五文件 27／27；nested equality／stable identity／timezone persistence 不靠 ACK 字段存在求绿 |
| App 控件／范围／独立回读 | 四 UI 反例 RED 4／0／4；headers fixture 原 helper 丢 headers，首轮只读真实 captured request 修复。detail＋delete RED 2／0／2；ACK＋GET 擦规则 RED 1／0／1。另 legacy timezone 必要字段导致 fixture 期待过时，独立 fixture 因果 repair1 更新明确 Asia/Tokyo，不弱化回读 |
| native role 类型 | 24463 types exit 2，只有新 View accessibilityRole 不在 native union；独立 type 原因 repair1 沿用 B 的 role="dialog"，92515 types exit 0 |
| 参考页间距 | 完整 UI 60／59／1，旧 12px remark→save gap 失败；独立 layout 原因 repair1 只压本页非交互 spacing，保 44pt／字体／remark／viewport／12px 原断言；完整 60／60 |
| 过去实例提示 | 有效 RED 1／0／1→1／1，UTC 秒优先使用 baseline；不申请权限、补发或创建 executor。随后完整 UI 61／61 |
| 新错误三语 | 实际 en／ja invalid until RED 2／0／2，alert 仍中文；model 完整 RED 7／6／1 缺 typed key。最小 locale mapping→2／2；最终完整 UI 63／63、八 model／locale／sync 文件 36／36 |
| managed 旧队列 | 首 fixture 错取哈希排序的 12 月计划，同 fixture 原因 repair1 精确选 9/18 到期实例，重新建立有效 RED 4／0／4：move／off 仍 available，cancel 后仍新增投影，delivered 旧 source 仍可派发。最小当前权威 gate→三完整文件 21／21；扩最相关时间改写／单实例改期／普通提醒兼容后六完整文件 42／42 |
| workspace 把 GET 算写 | App 唯一 I 新五失败保留。同分类因果 repair1 保完整 requests，只让 noWrites 禁 mutation；GET 返回 scoped v3 读协议，四种 mutation 反向证明仍 reject。完整 workspace 47／47；原 exact audit／privacy GET 未改 |
| ink fixture 缺 GET | 原 I 九 heading timeout。实际诊断 pageerror `TypeError: client2.get is not a function`，React passive-effect stack，1／0／1；原 timeout／errors assertion 保留。missingGET 因果 repair1 加独立 readonly get／完整 httpReads，原九 timeout 消除；完整 14／11／3 暴露本线新 exact GET1 无依据假设。第2且最后 repair 核初始 effect＋focus refresh 导致两 GET、前一 controller abort；逐条核窗口／版本／无 body／signal／实际 aborted，失败 write 后初始化 read 全集不变，原 task exact refresh／mutation count 保持。完整 14／14，未开第三轮或重 I |

workspace 分类原因使用 1 次、ink missingGET 原因使用 2 次；其余上表因果独立保账，不按新增用例名拆预算。诊断 console 只在单例因果检查期间存在，随后仅撤本线新增日志；没有删除 errors assertion、提高 timeout、换 heading、get optional chain 或改产品隐藏错误。

一次 apply_patch 因 hunk 顺序校验拒绝，原子未写入；纠正顺序后正常执行。只读命令曾试不存在的 descriptive worker／locale 文件／未消费 B REPORT，纠正到实际文件后完整读取；一个 tail cwd 拼错被进程创建拒绝，立即回实际 worktree。初次 broad ps 输出截断后改精准 PID 筛选。一个消息错误手写 ink session 已明确更正为 tool 实际 34930，不作证据。所有错误保 checkpoint，不宣称启动失败或未知 exit 为通过。

## 最终检查、唯一 I 和失败边界

Node 22.23.2／env-i／既有依赖，zero-outbound 与 0057 protected-runtime preload 始终开启。仅本 worktree 的 ignored node_modules 复用已批准 B dependency overlay；没有 install、改 ROOT 共享依赖、复制 env、配置真实库、迁移、seed、清用户数据或付费调用。

| 检查 | 实际终态 |
| --- | --- |
| 后端原完整轻链 | 18 文件／98 tests，97 pass／1 原 fail，0 skip／cancel，exit 1，2707.701708ms；没有重跑该整链 |
| 后端审查必要修复 | 七完整文件 46／46，exit 0，925.642125ms；Web types 50522 exit 0 |
| 最终派发保护六完整文件 | session 74441，42／42，0 skip／cancel，exit 0，1893.301584ms；`stale-source-final-direct.log` |
| 最终 App 规则／独立回读完整 UI | session 57504，63／63，0 skip／cancel，exit 0，45347.800584ms；`app-locale-repair-final-ui.log` |
| 八完整 App model／locale／contract-schema sync checks | 36／36，0 skip／cancel，exit 0，649.028916ms；`app-locale-repair-final-model.log`，检查不是重复 sync 写入 |
| 最终必要两端 types | App 41200／Web 46109 均 actual exit 0；两 fixture 修复后 App 16557 actual exit 0；轻链 guards denied 0 |
| 唯一 App I | session 24315／PID 75031，3243 tests，3228 pass／15 fail／0 skip／cancel，exit 1，206592.24775ms；`final-I-app.log` |
| App I 后最小完整 fixture 复测 | workspace 1353：47／47，exit 0，20711.606042ms；ink 最后 81679：14／14，exit 0，5693.959667ms；前 ink 34930／14-11-3 保留 |
| 唯一 Web I，App 终态且新 TREE 官方门后串行 | session 85572／wrapper PID 79651／child PID 79660，3770 tests，3505 pass／59 fail／206 skip／0 cancel，exit 1，130937.022ms；`final-I-web.log` |

没有第二次任一端 I，没有为了旧 CLI 静默／JSON 断言关闭 guards。I 时不夹改运行中的产品或测试源；App I 真正结束后才按 ROOT 登记修两 fixture，轻链全部结束才冻结最终 19 路径；Web I 整轮保持 TREEe52。各 PID 实际已不存在，所有测试／types 句柄 ended，唯一 H owner 已实际释放 ROOT。

App 原 15 fail 不能改记为全量通过：十四新增失败由两完整 fixture 轻链消除，旧 `/+html` unexpected 路由覆盖仍未修。actual native consumer inventory case 2468 已 PASS，不能照抄 B 原 I 的旧 inventory 失败。范围修复不改 UI／mutation 业务期望，原全量日志仍固定 3243／3228／15。

Web 与 B0059 原 I 实际提取各 59 个 top-level not-ok 标题，逐项一致，`newFailures=[]`、`removedFailures=[]`，对照在 `web-I-baseline-failure-compare-final.log`。原分类为 36 强制 PG 配置缺失、13 runtime／manifest 审计、5 子进程 guard stderr／JSON、2 旧 label／profile regex、2 contract 目录、1 原 reminder inbox 投影；206 skip 不记通过。标题一致与 partial 交付许可不代表已逐项在初始 BASE 重跑，更不豁免真实 SC 或 PostgreSQL 授权／scheduler 缺项。

必须精确列 guards：App I／定向轻链 denied 均 0；Web wrapper 末尾 zero／protected 为 0，但 Web goal-dashboard 既有组真实 TAP 为 PW0010 denied 4，protected 0。B 原日志相同组也 denied 4，当前 raw line 14125／B raw line 14039。保护措施阻拦了请求，没有放行或本轮新增 provider 使用；不能称整 Web guard 0。首次比较脚本误把 quoted stderr 的 denied0 当非零，原诊断日志保留，最终 anchored TAP 比较排除该误计，只剩两边相同 PW4。ROOT 独立提取并复核，不依赖本线摘要作最终失败放行。

## 五项 SC、视觉与真实缺项

| SC | 当前本地证据及尚未完成项 |
| --- | --- |
| 60-01 | 0059 设计内真实 KV／底部窗、七提醒／四重复、清除重开、invalid en／ja、ACK＋独立 GET、409／late actor 组件／HTTP 边界通过；真实授权账号同一记录 Web↔App／Phone 保存回读尚未执行 |
| 60-02 | 系列／例外持久写代码、有限展开、stable instance、日／周／月缺日、跨日／全天／DST gap／ambiguity 边界通过；真实 PostgreSQL 持久化重开和未来实例实际端上打开仍未验 |
| 60-03 | 显式 occurrence／series、CAS／幂等／late receipt、actor 隔离、事务失败回滚，以及当前 revision 旧计划不可复活反例通过；真实数据库并发、同账号改期／取消重开／ sibling 双端结果仍缺 |
| 60-04 | 现有 due refresh→唯一 semantic inbox→精确实例，以及实际 production typed sources／storage ledger／worker 抑制 stale queue 在 SQL／push 边界夹具通过；ROOT 单个已识别真实对象→到期应用内通知→正确详情闭环、偏好／owner／native 权限和取消实际证据仍 blocked；远程 Push／生产 scheduler 未验单列 |
| 60-05 | 两功能固定 commit、安全基线、两端 types／sync checks／官方源门槛／唯一两端 I 与必要局部复测，以及 ROOT 固定 MAIN 主合／push 与 remote SHA 核对／生产 build-restart-health 已有；本 REPORT 独立文档门／commit、8082 原生安装／同账号验收和 Phone 同库版本消费仍待完成，不能 completed |

本地实际 RNW 图为 `app-editor-reference.png` 及三语 `app-rules-{zh,en,ja}.png`：390×844 参考页、390×520／1.8 字号设置窗，remark→固定 save 的旧至少 12px gap 保持。只压本页非交互 spacing，不改全局 AppScreen、44pt hit target、字体或隐藏必要错误；参考 chip／底部窗布局沿用 B，不重新设计。图不是 Simulator／实体设备／真实账号证据。备注仍明确不支持，本地私有日程不承诺出现在他人跟进里。

## 交接、回退与预算

交 ROOT 固定产品 `64157ae33852851b2b71bcbb3f8190df76cf3c50`，包含初次后端 57bf 与安全基线 80d2 的历史；不能只 cherry-pick 后一提交而漏 v3 schema／service／exceptions 的必要前序。提交前源无其他 dirty，commit 后 porcelain 空。本报告是唯一新增文档 dirty，待 ROOT 独立 doc gate 再 commit；无未提交产品改动或活 H 句柄。

ROOT 唯一持有 MAIN／普通 push、服务、真实 actor／workspace／DB／Simulator／Phone／provider／累积预算。本报告冻结前 ROOT 交回实际状态：MAIN 5523 无冲突主合后，owned 旧 PID67541 停止且 listener 空；production build session45530 actual exit0；工具会话7071／127.0.0.1:3000 的新 runtime PID83786，BUILD `XP4aMyTN2G7sgMA121zm9`，actual health ok／live。Webpack cache 的 ENOSPC warning 保留；主盘实际仅190Mi，ROOT 在 build 终态后仅将 owned `.next/cache` recoverable move 至外盘并 symlink，释放到1.9Gi，未删除用户数据或重 build。本线未操作这些对象。

ROOT 新 native MainDA／8082 session64805 正在 build，尚未安装或完成真实 SC；旧 xcode.env.local Node25 原状不改。普通 MAIN push session2974 actual exit0，ROOT 独立 ls-remote session37307 核 `origin/chat-agent=5523bfc83aa6864d94886bbe8041d6e248bab4f1`。PUBLIC0056 未消费本轮，Phone 仍须独立版本交接。同库／同账号实际回读与到期提醒不从 production health 或 push 推断成功。Bridge 公共状态／handoff 台账由 ROOT 更新，本线不越权修改或启动第二 executor。

ROOT 真实验收准备已交：先核精确 actor／workspace、cutover since／generation、server owner／偏好／token可用性；一个明确日程 v3 保存＋独立 GET＋bounded list／instance GET，沿现有授权 refresh／materialize／worker 到实际 fireAt，核一次 inbox semantic key／准确目标，重复 refresh 不重复；取消仅该对象、保历史，不碰其他报名／账号／用户记录。缺 provider ticket 不宣称远程 Push receipt verified，缺 scheduler 不宣称自动上线。本线没有执行这些真实动作。

回退由 ROOT 对本次两个明确功能差量采用可追踪 revert，并考虑 B／MAIN 后续依赖；不 reset、删除 worktree／用户数据或回滚真实资料。没有本线真实资料写入待清理。已有 AI／OCR 累积 $5 硬预算未重置或按 Sprint 另建；本 run 新增获接受的付费调用与费用为 0，Web PW4 是被保护措施阻拦的既有测试请求，不是已执行收费调用。

## 证据位置

唯一 ignored evidence／checkpoint 为 `/Users/xzhao/Projects/orbit/.worktrees/sprint-0060-personal-reminders-recurrence/build/harness-state/evidence/sprint-0060/run-01/`。其中 `checkpoint.md` 保原候选、因果账、错误／所有实际终态；主日志为 `web-backend-direct.log`、`backend-audit-repair-final-direct.log`、`stale-source-final-direct.log`、`app-locale-repair-final-{ui,model}.log`、`final-I-{app,web}.log`、`app-wide-fixture-repair-direct.log`、`ink-tasks-{missing-get-causal-red,fixture-repair-direct,fixture-repair2-direct}.log`、`web-I-baseline-failure-compare-final.log`、`source-manifest-final.log` 及上述截图。

旧 App patch `app-product.diff` SHA256 `958fc466c73749c21fd6bfac4c72f9cfd0915989be14059864c877760f4d11bb`、中间 `app-stale-source-final-product.diff` SHA256 `2f2ad6ba229395388b94ccef176e271dd33e41820f4471486e72a313d761cfd0`、最终 `app-stale-source-final-fixture-product.diff` SHA256 `986ed4ec46d133d75fbc595e5664e1e762871496ad9335898c3a89811183a636` 均保留。临时／ignored 证据可能随本地清理失效，因此本报告保真实结果／失败／skip／guards4／未完成边界，不把日志复制进 public、不另造管理证据接口。

## ROOT 追加：2026-09-17 真实运行验收

本节补充报告冻结后的实际结果，不改写上述原始测试或失败事实。主线报告已合并至 `a69ec50ba8ab9e793a4e1ac9d3a307da4da3b942`，普通 push 后独立远端 SHA 一致；产品版本仍为 5523。

- 原生构建 64805 实际 exit 0／BUILD SUCCEEDED，覆盖安装 92358 exit 0；Simulator `DA432E9E-1204-4EE7-9A20-251CDB48E265` 的 `app.agenthubs.orbit` 已启动，实际 `RCT_jsLocation` 为 `127.0.0.1:8082`。Main Web 3000 与 Metro 8082 均实际健康。
- 真实“小雨”账号 `account_orbit_generated` 创建一个明确 QA 系列 `personal:c1fdb0042b5aa1293939d5af`：标题 `Orbit QA0060 20260917 rules associations`，东京时间 9 月 17 日 09:15–09:45，提前 15 分钟提醒，每天重复至 9 月 19 日。正常 UI 选择既有笔记和人脉，独立 v3 GET 验证所属账号、规则及关联 ID 均一致；不是 HTTP fixture 或截图推断。
- 真实底部窗显示既有笔记／人脉，输入 `ZT` 匹配佐藤联系人，选择后显示关联 chip。规则窗七提醒／四重复及结束日期实际可用。
- 9 月 18 日实例实际打开，显式选择“仅本次日程”并确认取消；后续独立 GET 返回 404／NOT_FOUND，列表保留 17 日和 19 日。19 日实例再从真实日历列表点击打开成功，显示继承规则和原关联。系列及两个保留实例仍是已识别测试资料，未硬删除或修改其他记录。
- 提醒闭环仍未通过：同账号 `/api/inbox/notifications` 实际 `enabled:false`，delivery owner 实际为 local／cutover false；诊断 deviceId 不是原生权限／token 证据。已询问用户是否仅开启该测试账号新版应用内通知入口，尚未收到批准，不修改其他账号、全局 cutover 或远程 Push。到期通知、实际 PostgreSQL 并发及远程 Push 仍待验，不能把规则保存成功称为提醒送达成功。
- Phone 固定消费提交 `b3562f4de8936d783cda097e1a30e1e3554208c7`、TREE `c6f2b1a9f4f014df233af3f5140f2a50590e877c`；生产构建／导出实际成功，BUILD `VFCyLoF7jSqlaRsqWLuA3`，entry SHA256 `aed12fe6ee10cf506911e195407363b720dfbc0c9f5ff20dbac3b7409ab850b6`。私有 Chromium／WebKit 390×844 使用真实 Phone actor `user_orbit_primary_qa` 验证新摘要 GET、拼音筛选、内存选择／取消及提醒重复 UI；原资料前后 hash 相同，匿名摘要 401，无业务写入或付费请求。该 actor 与 Main 小雨不同，不当作同账号跨端证据。ROOT 已读取回执并检查真实 WebKit 图片，批准固定产物整体 supervisor 发布；本节写入时公网切换结果尚待回报。
- Main 独立 Next `/app/tasks/personal` 页面仍使用 v2 编辑器并显示“提醒和重复暂不支持”，没有消费本次 App／Phone UI，须单独跟踪，不能宣称所有 Web 页面均已对齐。

真实原生图片另存 `/tmp/orbit-sprint0060-native.2BBKOw/`，其中 `notes-sheet.png`、`contacts-zt-selected.png`、`editor-before-save.png`、`detail-saved.png`、`occurrence-cancel-scope.png` 已实际查看。先前 A evidence 内六张 `app-editor-reference.png`、`app-rules-{zh,en,ja}.png`、`app-editor-shortcuts.png`、`app-detail.png` 后被 Phone 消费 HTTP fixture 测试写入；没有事前 hash，不能声称原图未变或恢复，当前应标注 Phone fixture 产物而非 A 原始截图，更不是实际设备证据。Phone 新真实账号图片在独立 `release-0060` 私有目录。

本轮累计预算 ledger 原始 SHA256 始终为 `493f2ed72328e543b620c28c6a8a9ab03823a92fd290381b79330dc720d2d4da`；未重跑任一端全量 I。上述进展仅补充部分真实正向验收，SC60-04 与整个 Sprint 仍未 completed。
