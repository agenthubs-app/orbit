# Orbit App Sprint 管理入口

**运行状态：ACTIVE（2026-09-14，用户要求完成框架与文档后自主执行 Sprint）。** 本目录是文档驱动的 Sprint Dev 管理规程；当前代理按规程执行，不是另行安装的后台 SDK 编排程序。只领取前置条件与适用批准齐全的 Sprint。

用户已指定：编号从 `0001` 开始，每个 Sprint 一份 Planner、一次 Generator，不设 Evaluator 或 Generator↔Evaluator 循环，验证遵守最小必要原则。每个 Sprint 实现收口后必须在本线提交 Git 改动，交接固定 SHA，由协调者合并回主线 `chat-agent` 并验证合并树；未 commit 或未 merge 的 Sprint 不能标记 completed。此规则取代先前草稿中 S0～S8 的编号、同一 Sprint 多实现者和固定独立评审安排。

**2026-09-14 提速规则已生效：** 开发中跑定向测试，沿用户操作链批量交付；纯L默认不跑全量，含H在本地代码收口时对受影响端做一次集成检查。取消“每个子功能／三个提交后自动全量”，复用未变化的阅读和验证，合并碎片化进度文档。详见[RULES第4、5、8节](RULES.md)；覆盖旧Planner的执行频率，原SC、批准、预算及真实验收不变。

## 先读哪里

### 2026-09-18 新增读取成本治理（Phase 0 主线对齐）

用户已批准[读取成本治理设计案 Rev 4]，要求逐个 Phase 执行，三次归位统一用 `merge` 不用 rebase。
Phase 0 共三项：0067 生产源码归位（**completed**）→ 0068 phoneweb 基座归位（**completed**）→ 0069 增量同步存量归位（**blocked**，核心已落地、接线待 0075/0076）。
后续 Phase A 量尺（0070，completed）、B 止血（0071 completed，0072 completed，0073 completed，0074 completed）、C 收口扩面（0075 completed，0076 第一批 completed）、D Web 本地优先（0077 completed，0078 completed）、
E 结构（0079–0080，需单独批准）依次领取，不并行。

| Sprint | 目标 | 进入条件与当前事实 | 状态 |
| --- | --- | --- | --- |
| [0067](0067-mainline-production-alignment/GOAL.md) | 主线重新包含生产正在运行的源码，并把本地／云端切换开关嵌进生产库围栏内部 | 五项 SC 全部 pass。功能 merge `e2a0d6a37`（父 `53e0640e5` + `161e9e6c4`）已 fast-forward 进 `chat-agent`，`git merge-base --is-ancestor 161e9e6c4 chat-agent` 退出码 0。同环境前后对照：4154/88fail → 4173/86fail，失败集合零新增、两项消失。两端 typecheck 0。本机 target=local 实际登录读到 78 联系人/64 待办。原 86 项失败保持披露，不宣称全绿 | completed |
| [0068](0068-phoneweb-runtime-baseline/GOAL.md) | phoneweb 运行时基座归位主线，作为 Web 本地优先的地基 | 五项 SC 全部 pass。两次 merge `708a50095` + `3fa710ee8` 及归位必需修复 `3730ddb2f` 已 fast-forward 进 `chat-agent`。App 全量 3433 → 3452 全绿零新增失败；phoneweb 真实 Chromium 登录读 78 联系人；Simulator 冷启动正常。3 个部署助手文件明确延后。发现 `npm test` glob 不含 `.mjs`，留 0070 处理 | completed |
| [0069](0069-incremental-sync-baseline/GOAL.md) | sprint-0033 增量同步存量归位主线，主线 v2 本地 schema 不倒退 | run-01 结束。merge `ca8c50b15`（父 `daa4be352`+`d0333d2f0`）已进 `chat-agent`，落地 29 文件：服务端 `/api/sync` + cursor/read-service/migrations，App sync-client/coordinator/freshness/hook + v2 仓库移植。**屏幕接线全部退回**：分支 coordinator 无 epoch 来源（v2 要求 activeReadScopes，来源是 0075 的 lease）；分支把 sync 写锁触发器打进基础 schema 砸掉 0060–0062 共 26 项，store/lifecycle/notes 全部退回。App 3461/0fail、orbits 86fail=0067 基线、typecheck 0/0；`/api/sync` 认证 200。SC-05 按构造不可达；6 个测试文件延后 0045/0075/0076。0033 状态不变 | blocked |
| [0070](0070-flow-topology-and-read-baseline/GOAL.md) | 三层数据流测试拓扑（本机 PG 扮演云端 · 客户端镜像只装本人数据）+ 读取成本基线闸门 | 依赖 0067（completed）；不依赖 0069 延后项，只用其已落地的 read-service。基线 `59f33a9ec`，Planner SHA 221eb101。合并 `dd9dd5a88`；基线冻结：contacts.list 6 SQL/1548 行/1.37 MB，dashboard 1 SQL/5068 行/3.57 MB。档位 L + 一次 App 全量（test glob 变更）。只用本机 PG | completed |
| [0071](0071-read-budget-guardrails/GOAL.md) | 读取预算护栏：`listRecords.limit` 必填（`number \| "unbounded"`）+ Postgres LIMIT 下推 + 无上限读取棘轮 + 笔记列表投影 | 依赖 0070（completed）。基线 `4507b3e66`，Planner SHA b25f78a1。176 处调用/77 文件机械补 `"unbounded"`，零行为变化；档位 H，orbits 全量前后对照。只用本机 PG。合并 `deda00f89`；棘轮冻结 76 文件/174 处；notes.list 14 134 → 12 116 B；暴露并修复 0067 遗留的注册测试写 dev 库问题 | completed |
| [0072](0072-domain-watermark-conditional-reads/GOAL.md) | 域水位线 + 条件请求：6 条 GET 路由（tasks/notes/schedule-items/contacts/connections/events）未变即 304、零业务读；App client 带 If-None-Match 并内存回放 | 依赖 0071（completed）。基线 `d45474da8`，Planner SHA c2d8e12a。授权纪元用 accounts/auth_users/permissions 水位替代（lease 属 0075）；dashboard/profile 不接。档位 H，两端全量对照。只用本机 PG。合并后 Simulator/phoneweb 二次拉取 304 实证；App 全量 3489/3489、orbits 零新增失败 | completed |
| [0073](0073-search-index-alignment/GOAL.md) | 搜索路径索引对齐：pg_trgm GIN 让 `search_text ilike` 走索引，删从未使用的 tsvector 索引；不改查询、不改语义 | 依赖 0070（completed）。基线 `26423d9b9`，Planner SHA 9d4f24ac。结果逐条一致为硬断言；2 字中文查询不走索引如实记录。档位 M，orbits 全量一次。只用本机 PG。14 词逐条一致；dev 库真实 3 字搜索走 BitmapAnd(trgm)；修掉并发建扩展与扩展装错 schema 两个迁移坑 | completed |
| [0074](0074-pool-timeouts-read-budget-gate/GOAL.md) | 连接池/超时按环境（serverless/worker/local）配置 + 进程内读预算闸门：非关键读超阈值 503 有理由，关键读与写不受影响 | 依赖 0070（completed）。基线 `3ece6d171`，Planner SHA 9da1ef19。闸门 opt-in（生产开启属部署决定）；各 feature 自建池不动。档位 H，orbits 全量。只用本机 PG。真实接线下 /api/contacts 超预算 503 带理由、accounts 读与写照常；0062 并发保存 14/14；orbits 全量零新增（2 条旧默认池断言改为按 profile） | completed |
| [0075](0075-grants-epoch-lease-acceptance/GOAL.md) | 服务端真实 grants/epoch/lease（/api/sync/lease、manifest、domains/:id）+ App 协调器按租约绑定作用域；纪元变更全量重建、越权拒绝、撤权不可读；为 0033–0036 写按证据的 REPORT | 依赖 0069、0070（completed）。基线 `543627493`，Planner SHA 35cfa571。注册表 v1 只含 notes/tasks/personal-schedule；屏幕接线留 0076。档位 H，两端全量。只用本机。本机真实双账号：B 用 A 游标 409、撤权 401；协调器经 HTTP 镜像 3 行；0033/0034/0035 改 blocked（按证据） | completed |
| [0076](0076-app-consumer-expansion-batch-1/GOAL.md) | App 消费者扩面第一批：原生待办页镜像优先（租约→域页），Web 保持网络读；棘轮 174→173 | 依赖 0071、0075（completed）。基线 `cadbb2e10`，Planner SHA 9283afe9。服务端 tasks 读路径不改（canonical payload 嵌套，payloadAccountId 不可用）。档位 App H / orbits L。Simulator 第二次进入待办 0 请求、勾选后镜像确认 52/12；修掉 v2 域页下发旧格式行的问题 | completed |
| [0077](0077-web-local-mirror-storage/GOAL.md) | Web 本地镜像存储层：expo-sqlite web（wa-sqlite+OPFS）分库 + Web Crypto 不可导出密钥 + 正文 AES-GCM 落盘 + 白名单 tasks/personal-schedule + 威胁模型文档；不可用时静默 online-only | 依赖 0068、0069、0075（completed）。基线 `73b1b7c8b`，Planner SHA c475686b。先 spike 证明引擎可用，不过则 blocked；屏幕接入留 0078。档位 App H。真实 Chromium：OPFS 开库、AES-GCM 密文落盘、密钥不可导出、换账号／登出 purge、三种退化态；phoneweb 设置页安全／非安全源截图；修掉 Web 入口缺 initialize、Expo __common 抽走 Worker 模块、OPFS 64 字节路径名三个问题 | completed |
| [0078](0078-web-consumer-incremental-sync/GOAL.md) | Web 消费者接入增量同步：协调器 manifest 水位线门控（两端共享）+ 服务端 manifest 304；Web `/tasks` 镜像优先 + 后台增量、能力不可用走网络；离线 stale／空镜像失败显错／登出清库／SSR 不依赖镜像 | 依赖 0077（completed）。基线 `bc39eeb24`，Planner SHA 435ed9c4。本地 schema v2→v3（游标加水位线列）；个人日程 Web 列表消费者留第二批。档位 App H / orbits M。phoneweb `/tasks` 第一次 lease→manifest→域页、第二次 0 同步请求；manifest 304 真实 PG 与本机 Next 验证；修掉协调器"未绑定授权逼同步""无镜像先要租约"两个问题 | completed |
| [0081](0081-portrait-generation-422/GOAL.md) | 活动画像：答满 8 题后 persona 预览 422，抓 `portraitCode` 后修复，拒绝时界面透出原因 | TODO 第 1 条。已定位到 `answer-proofs.ts` 校验分支；首要怀疑预填题 responseId 与服务端不一致。档位 App L / orbits M。基线 `12a9f9653`，Planner SHA 726a8b6a | planned |
| [0082](0082-event-title-cover-authority/GOAL.md) | 活动标题与封面唯一来源：首页推荐活动中文标题 + 封面；删列表页挑中文段与硬编码封面表 | TODO 第 5 条。默认权威 = canonical 头表标题 + 封面入数据；先服务端后前端。档位 orbits M / App M。基线 `12a9f9653`，Planner SHA 4cda728a 。功能 `898538d68`／合并 `b966e0224`。根因：canonical 头表一直是中文权威，只有首页推荐读到陈旧的 `payload.name`；封面从来不是活动数据（App 两份硬编码表）。回填 13/16，3 个活动缺封面用占位图 | completed |
| [0083](0083-profile-suggestions-localization/GOAL.md) | 资料更新建议全部中文：服务端规则文案三语字典按账号语言输出；摘录按用户决定处理 | TODO 第 3 条。进入条件：用户决定是否连种子英文对话／记忆一起中文化（默认不改种子）。档位 orbits M / App L。基线 `12a9f9653`，Planner SHA db35473f 。功能 `4c64423b1`／合并 `1f09fe288`。三语字典按 `?language=` 输出，未知回落 zh；摘录保留原文并标"来源原文"（种子中文化仍待用户决定） | completed |
| [0084](0084-profile-page-hierarchy-audit/GOAL.md) | 资料类页面层级：全面截图审核 → 设计案 → 统一 `ProfilePagePrimitives` 四类元素规格 | TODO 第 2 条。含用户批准门（设计案）；审核范围含设置／账号／活动详情等同结构页面。档位 App H。基线 `12a9f9653`，Planner SHA 81db145c | planned |
| [0085](0085-iorbit-entity-read-show-write/GOAL.md) | IORBIT 五实体读／展示／写：实体小卡片、草稿卡确认状态机、五种创建、去掉"AI 运行依据" | TODO 第 4 条。含用户批准门（设计案须回答卡片规格／状态机／写入接口／prompt vs workflow）；设计案若超一个 Sprint 则拆 0086。档位 orbits H / App H。基线 `12a9f9653`，Planner SHA f45ef0b8 | planned |
| [0086](0086-inbox-typed-only-fail-closed/GOAL.md) | 收件箱只认三类通知：去 `ORBIT_TYPED_INBOX_ACTORS` 白名单默认启用、App 只读 `/api/inbox/notifications`、0040 迁移隔离 40 条生成记录与失效 reminderPlans、读取路径对无法归类记录 fail closed | 用户 2026-09-18 反馈"来源已不可用"。调查：0037–0040 均已合并；未启用（白名单未配置）+ 迁移从未执行 = 旧链直出。严格按 2026-09-16 通知设计。档位 orbits H / App H。基线 `1e2cbe555`，Planner SHA 8a4003dd | planned |

已查清的前置事实：生产切库已于 2026-09-17 完成并正在服务（`www.orbitailink.com` 200、`/api/health` mode=live，
新 Neon `orange-forest-30108072` 用量 34.6 MB／386.75 kB），旧 Vercel 项目 `paused=true`。
但**生产源码未回主线**，两边自 `29efb4c9d` 起各自前进；新 Vercel 项目无 Git 关联，合并主线不会自动部署。

### 2026-09-17 新增 7a 报名与画像设计

| Sprint | 目标 | 进入条件与当前事实 | 状态 |
| --- | --- | --- | --- |
| [0066](0066-registration-portrait-7a/GOAL.md) | 按7a三张稿重做报名资料、画像追问和结果，补齐真实编辑、独立保存与权限 | 用户已确认中文[契约](0066-registration-portrait-7a/PLANNER.md)。唯一B／Sol medium／run-01，Planner SHA a11c7312。功能7a87＋修复17da已合Main e73并push独立远端；精确Main App101/101、Web62/62。Phone固定修复8d87 fresh Next＋Expo完成，公网仍旧0065。原全量失败／skip／子guard4保持，不宣称全绿；[REPORT](0066-registration-portrait-7a/REPORT.md)仅checkpoint，完整真实SC仍缺 | running |

0066 最新运行事实（2026-09-17 23:23 JST）：功能 `7a87b89aa`＋必要修复 `17da84fa6` 已正常合Main `e73e6fb26`，普通push及独立远端一致，保留同事29ef基线。修复后的精确合并树App101/101、Web62/62／guard0。Main Web fresh BUILD `SVEnCJOV4jKN2V14iYf4b`／3000已重启；Simulator fresh编译／覆盖安装重试／启动PID73396，真实主8082已加载修复后JS。Main正常UI认证仍受既有数据库SQL53000传输额度阻挡，未升级／切库／改API origin，不声称原生报名业务SC通过。

Phone44文件消费e2a＋六文件必要修复 `8d87be6ff`／TREE `d09c602bb` 已普通提交，fresh Next BUILD `qvLcDXi4dMYJS8RLgBWDS`＋Expo entry1b9b完成／NO_PAID guard0／账本hash不变。旧源真实私有画像version1／3项来源回答、正式回执及独立GET成立，九份保护摘要及报名cancelled/version4不变，仅新增画像／回执两条。旧源实际发现入口2/8及fresh重开2次模型尝试（拒绝2次），原唯一B已修复并完整受影响文件验证；新源实际3/8／0attempts重开尚缺。当前Browser连接列表为空、任务交接工具未返回，ROOT仅接管已批准机械同步commit／build，不做第二实现。原4次provider调用结算$0.006760／无reservation，窗口已关闭；公网保持旧0065，完整SC未通过、不标completed。

下方既有目录与运行历史保留；0066不是0049／0050的第二次Generator，较早状态以本节最新实测事实为准。

1. [执行规则](RULES.md)：一次执行、边界、状态、最小测试、提交与失败处理。
2. 本表选择 Sprint，先读 `GOAL.md` 了解要实现的结果；执行前再读 `PLANNER.md` 及它明确引用的前序 `REPORT.md`。不要载入整个历史对话或所有 Sprint。
3. [目标模板](templates/GOAL.md)、[Planner 模板](templates/PLANNER.md)、[总结模板](templates/REPORT.md)用于后续新增 Sprint；只有执行过才创建实际 `REPORT.md`。
4. 需求和历史证据仍见[原剩余计划](../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)与[连通性记录](../verification/2026-09-13-app-connectivity.md)。它们不再决定本目录的执行角色／频率。
5. [实施顺序](EXECUTION_ORDER.md)：2026-09-14 用户要求按依赖减少重复修改；离线期间继续无需新决定的工作，不再提问，不越过独立审批。

### 2026-09-18 新增 TODO 收口 Sprint（0081–0085）

用户在 `TODO.md` 记录了 5 个问题，拆成 5 个 Sprint，基线 `chat-agent` = `12a9f9653`，全部 planned、run_count = 0，未领取。建议顺序：0081（小修复）→ 0086（收件箱三类通知默认启用 + 旧记录迁移隔离 + 读取 fail closed）→ 0082 → 0083（等用户答一个边界问题）→ 0084（截图审核 + 设计案批准门）→ 0085（设计案批准门，改 agent 行动方式）。0084／0085 按"先出设计案再实现"规则，设计案未批准不进实现步。编号跳过为 Phase E 保留的 0079／0080。

## 目录契约

```text
docs/sprints/
  README.md                  # 唯一运行状态和 Sprint 状态登记表
  RULES.md                   # 所有 Sprint 的执行规则
  templates/
    GOAL.md                  # 易读目标模板；不记录完成状态
    PLANNER.md               # 计划模板；不是执行过的 Sprint
    REPORT.md                # 结果模板；不能预填通过
  0001-event-discovery/
    GOAL.md                  # 要实现什么、做完能看到什么、怎么验收
    PLANNER.md               # 本 Sprint 的唯一验收契约
    REPORT.md                # 执行结束后新增；包括失败／受阻结果
  0002-readiness-handoff/
    GOAL.md
    PLANNER.md
  ...
build/harness-state/evidence/sprint-0001/run-01/
  commands/ screenshots/ api/ git/ checkpoint.md
build/harness-logs/
  sprint-0001-run-01.log
```

原始日志和截图使用已有被忽略的 `build/` 子目录，不改 `.gitignore`、不进产品源码或 Git。运行目录只在对应 Sprint 启动时创建。用户要求的 Planner／报告是可提交文档，集中在 `docs/sprints/`。证据只读留存，不自动清空 `build/` 或迁移旧日志。

2026-09-16 新增[收件箱与自主通知项目计划](NOTIFICATION_PROGRAM.md)：0037 → 0038 → 0039 → 0040，分别交付联系人消息、三类通知、AI有依据的发现、推送与旧流切换。2026-09-16用户已授权本session按重叠检查结果顺序实施；真实run见下方记录。

## Sprint 登记表

未列入下方运行记录的 Sprint 均为 `run_count = 0`、`report = 未产生`。表中的依赖是进入条件，不声称已满足。0001 接续既有四文件；0002 不依赖0001的功能结果。其余按依赖就绪执行，不以编号大小证明就绪。

每个 Sprint 的目标页都用具体操作说明预期结果。目标说明不等于完成声明；技术范围和 SC 仍以 `PLANNER.md` 为准，实际成果只看执行报告与下表状态。

| Sprint | 要实现的结果 | 原范围 | 依赖／额外前置 | 状态 |
| --- | --- | --- | --- | --- |
| [0001](0001-event-discovery/GOAL.md) | 用全部地点和话题找到活动，筛选后仍能翻页和打开详情 | R-09 | 无；接续当前四文件 | completed |
| [0002](0002-readiness-handoff/GOAL.md) | 查清已完成能力、后续缺项和每项开工条件 | R-01、R-00～R-12 依赖 | 无；只读文档工作 | completed |
| [0003](0003-profile-completion/GOAL.md) | 注册、补全资料后回到原页面，完整用户不再被拦截 | R-03 | 本地实现已提交；SC-01～04通过，真实 Google 最终回跳与同账号双端回读缺失，见 REPORT | blocked |
| [0004](0004-registration/GOAL.md) | 报名、取消和重报后，答案、人数及各页状态一致 | R-04 | run-01 已完成；功能 `319f6f7bb`，见 REPORT | completed |
| [0005](0005-ai-session-reliability/GOAL.md) | AI 重试不重复生成，Web/App 续聊不丢历史 | R-00、R-02 | 原产品提交 `30c1e210c`、主线集成 `efbfc23ae`；本地／隔离 PostgreSQL 验证完成，真实同账号双端设备往返和 R-00 首次 503 根因仍缺证据，见 REPORT | blocked |
| [0006](0006-contact-mentions/GOAL.md) | @ 选准联系人，带入 AI 的问题由用户确认发送 | R-06 | 原功能 `09e1a71fa`、主线集成 `0ff447a55`；本地实现与回归完成，真实同账号 Web↔App 引用回读仍缺证据，见 REPORT | blocked |
| [0007](0007-two-sided-cards/GOAL.md) | 正反面名片复核后只创建一个联系人 | R-07 | run-01 已结束；本地双面契约与一次确认已提交，实体 iPhone／真实 OCR／同记录跨端验收缺环境；见 REPORT | blocked |
| [0008](0008-identity-chat/GOAL.md) | 验证邀请和身份绑定后，双方能真实收发消息 | R-05 | run-01 已完成；原功能 `6d8173b78`、主线集成 `64629369d`，见 REPORT | completed |
| [0009](0009-timezone/GOAL.md) | 同一事项在首页、待办、日历和活动中不落错日 | R-09 | run-01 已完成；功能 `a4bbfd9f6`，见 REPORT | completed |
| [0010](0010-task-schedule-editing/GOAL.md) | 个人事项能创建、编辑和清空字段，各页与提醒一致 | R-08 | run-01 已完成；功能 `d005c2b79`，见 REPORT | completed |
| [0011](0011-home-analysis/GOAL.md) | 首页符合确认布局，分析可辨新旧，目标可单独保存 | R-09、R-10 | 登录态 Simulator 首页／Pipeline 与同账号 Web↔App 目标回读已完成；仅真实 provider 报告生成与两端回读未运行，见 REPORT | blocked |
| [0012](0012-message-state/GOAL.md) | 前台新消息及时出现，已读角标与跳转目标正确 | R-11 | 功能提交 `218fb3d4b`；自动化与 iOS 打包通过，真实双用户原生／实体推送环境缺失，见 REPORT | blocked |
| [0013](0013-locale-foundation/GOAL.md) | 用中日英操作账号、首页和设置，切语言不丢输入 | R-12 | run-01 completed；功能 `cc3930449`、`1bd99f737`、`9d5c13622`，见 REPORT | completed |
| [0014](0014-locale-relationships-events/GOAL.md) | 用中日英处理人脉、名片和活动，保留原文与答案 | R-12 | run-01 completed；功能 `9761b343d`，见 REPORT | completed |
| [0015](0015-locale-assistant-workflows/GOAL.md) | 用中日英操作 AI、事项和消息，保留内容与日期 | R-12 | 功能 `d7180e134`；原生返回修复 `16d545b06`；SC-01～04 全部通过，见 REPORT | completed |
| [0016](0016-native-navigation/GOAL.md) | 用实际设备验收导航、字号、键盘和辅助功能 | R-09、R-12 | 0014、0015；原生审批／设备 | blocked |
| [0017](0017-cross-client-acceptance/GOAL.md) | 用真实主流程及五类记录双向回读证明两端一致 | R-01、R-14及主链路余项 | 0003～0016；共同环境／授权 | blocked |
| [0018](0018-notes-core/GOAL.md) | 一份私密笔记关联多人，保留旧内容并安全切换入口 | R-13 | 功能提交 `8e81e588e`；同账号 live Web/API、PostgreSQL 与原生 iOS Simulator 双向验收已补齐，见 REPORT | completed |
| [0019](0019-note-suggestions/GOAL.md) | 确认笔记建议后只建一次事项，逐项验收全部原需求 | R-13、R-14 | 功能提交 `15685b18e`；SC-0019-04 真实跨端／原生验收已补齐，SC-0019-05 仍等待 R-00～R-14 全范围关闭，见 REPORT | blocked |
| [0020](0020-secondary-industries-self-profile/GOAL.md) | 二级行业在资料、联系人和检索中复用，AI 能读取本人资料，现有测试数据补齐 | 2026-09-14 新增；关联 R-03／R-06 | run-01 已结束；部分代码未提交，HTTP/provider/trace/生成源范围缺项与 H 验证未通过；见 REPORT | blocked |
| [0021](0021-ai-session-organization/GOAL.md) | 保存 AI 会话入口与首条内容，按项目式分组整理，并能置顶、改名、删除和跨端回读 | 2026-09-14 新增；关联 R-00／R-02／R-06 | 功能 HEAD `9bc7039a5`；同账号 Web↔App、当前 iOS 长按／更多／分组／确认／真实冲突反馈均已验证，见 REPORT | completed |
| [0022](0022-unified-tasks/GOAL.md) | 同一待办入口切换全部／人脉，兼容旧跟进链接并保留草稿、建议和提醒入口 | 2026-09-14 新增；关联 R-08／R-09／R-06 | run-01 已完成；功能 `ef5d0b02d`，见 REPORT | completed |
| [0023](0023-industry-consumer-continuation/GOAL.md) | 接通联系人行业、搜索 HTTP 与本人资料工具，承接 0020 全部未完成验收 | SC-0020-01～05；明确获准接续 | 现有部分实现与 8 文件补充方案已批准；真实数据／设备按对象处理 | running |
| [0024](0024-contact-needs-ranking/GOAL.md) | 在人脉主页保存需求，并在独立页面按可核对依据稳定排序 | 用户批准 `concept-v2.png`；关联 0011／0023 | Web `bf35efb85`；App 最终 HEAD `d4cc8a441`；SC-01～05 全部通过，见 REPORT | completed |
| [0025](0025-notes-ink-signal-search/GOAL.md) | 按最新 4a 重做笔记列表、编辑、详情与联系人笔记页签，用加号和输入搜索关联人脉，不平铺联系人全集 | 2026-09-15 新增；承接 R-13／0018／0019 | run-01 已完成；五项 SC、同账号 Web↔App、Web／iOS 构建与有界搜索均通过；见 [REPORT](0025-notes-ink-signal-search/REPORT.md) | completed |
| [0026](0026-canonical-app-account-identity/GOAL.md) | 统一 App 登录主体与业务账号身份，让待办、个人日程和笔记正确读取 canonical owner | 用户批准追加 C 线 Sprint；承接现有 `/api/account/me` | run-01 completed；功能 `f5f595df4`、邀请补漏 `3385369dd`；见 [REPORT](0026-canonical-app-account-identity/REPORT.md) | completed |
| [0027](0027-open-schedule-meeting-details/GOAL.md) | 让四类日程进入对应详情，并按来源安全添加、编辑或清空会议说明 | 用户批准追加 C 线 Sprint；承接 appointment 聚合与 0026 canonical actor | run-01 completed；功能 `3ca1f5936`、旧日程兼容 `0cbc45ffa`；见 [REPORT](0027-open-schedule-meeting-details/REPORT.md) | completed |
| [0028](0028-profile-page-group-redesign/GOAL.md) | 按最新八屏设计重做“我的”、设置、账号与完整资料编辑流程，保持真实数据、隐私和跨端一致 | 用户提供 `软件UI设计现代化 (5).zip` 并指定 D 线实现 | 固定最终 SHA `d37d6545d` 已由 `314aedd7c` 合并；主线目标 237/237、全量 2860/2860、typecheck、iOS build、Web live health 与 Simulator 安装启动通过，见 [REPORT](0028-profile-page-group-redesign/REPORT.md) | completed |
| [0029](0029-data-authority-ai-read-surface/GOAL.md) | 统一数据权威源并让 AI 按认证 actor 查询笔记、待办、跟进和日程 | 用户要求全面数据审查并补齐 AI 盲区，交由 B 线实现 | 固定 B SHA `f5bded060` 已由 `6f5f141ed` 合并；真实 migration apply 与同 actor 四域回读仍开放；Calendar/Gmail/Microsoft OAuth adapter 按 2026-09-16 用户决定转后续 TODO | blocked |
| [0030](0030-inbox-ink-signal-unified-feed/GOAL.md) | 按 3a 设计把活动、待办、人脉和 IORBIT 通知组成真实统一收件箱 | 用户提供 `软件UI设计现代化 (5).zip` 并指定 E 线实现 | E 线固定 SHA `a252220a8`；同账号 live task/read/refresh 已验收，缺失 live 类别见 [REPORT](0030-inbox-ink-signal-unified-feed/REPORT.md) | completed |
| [0032-cloud](0032-cloud-relationship-lifecycle/GOAL.md) | 两端完成人脉跟进并确认关系下一步，刷新回读同一云端状态 | 云端计划 R1/R4；用户「这五项闭环」 | 与下方 0032-hybrid 是并行分支各自登记的独立目标，保留目录和历史；原生/云端最新证据见根目录 bridge 的 cloud-five-item 与 read-budget-staging 交接，不以代码合并标完成 | running |
| [0031](0031-cross-platform-performance/GOAL.md) | 以同环境真实性能基线优化 App 与 Web 的最慢关键路径，不改变功能与数据边界 | 用户批准基线驱动方案并指定 B 线执行 | run-01 failed；固定 B SHA `d71e40839`，安全测量与 Agent 拆包由 `7a48c3bc6` 合并；App 30% 与跨页 p95 门槛未通过，见 [REPORT](0031-cross-platform-performance/REPORT.md) | failed |
| [0032](0032-hybrid-sync-foundation/GOAL.md) | 建立云端权威、加密且按账号隔离的 App 本地实体镜像 | 用户批准“云端权威＋本地持久镜像＋增量同步”方案 | run-01 最终 HEAD `1e40ee915`，merge `00b81ab18`；App 主集 94/94、消费者 49/49、全量 2934/2934，Web 19/19、两端 typecheck、production build 48/48、3108 live/ok，重建 SQLCipher 与 native 8＋5＋48 项通过，见 [REPORT](0032-hybrid-sync-foundation/REPORT.md) | completed |
| [0033](0033-incremental-read-sync/GOAL.md) | 所有已授权、用户可见的结构化账号数据在同步后均可离线读取，并明确部分／未下载／撤权状态 | 0032 已 completed/merged；全域规范与实施计划已批准、合并 | 0075 收口：lease/manifest/domains 与 epoch 已在主线（本机真实双账号与 PG 拓扑证据）；全域覆盖与屏幕 mirror-first 未做，REPORT 逐 SC 写明 | blocked |
| [0034](0034-offline-personal-mutations/GOAL.md) | 在全域离线只读基础上，对低风险个人域提供显式、幂等、可冲突处理的离线写入 | 0033 共享接口固定后才能接线；独立 policy 规则可先执行 | 0075 收口：只有策略守卫与仓库保留 pending 的证据；离线写入/回执/冲突未做，REPORT 逐 SC 写明 | blocked |
| [0035](0035-sync-invalidation-recovery/GOAL.md) | 以 registry 驱动的水位、轮询和恢复队列修复所有授权域的漏提示、断网、重启与撤权变化 | A/B 真实恢复绑定串行等待；portable 调度核心可先执行 | 0075 收口：manifest 水位 + 0072 的 304 覆盖 SC-01/02 部分；生命周期恢复矩阵未做，REPORT 逐 SC 写明 | blocked |
| [0036](0036-ai-sync-visibility-acceptance/GOAL.md) | 让 AI 按当前授权查询笔记、任务、跟进、联系人、消息、会议、通知与历史 AI 对话等用户可见数据，并完成全域验收 | App pending 与总验收等待 0033～0035；服务端权限/分页可先执行 | 0075 收口：无新证据，维持 blocked；REPORT 记录现状 | blocked |
| [0037](0037-contact-message-inbox/GOAL.md) | 把联系人消息从通知中独立出来，让用户看到真实对话并可靠收发、回复和同步已读。 | 2026-09-16 已确认的消息/三类通知设计 | 功能及主线 a591494b0；共同环境双账号通信/原生回读已验收，见 [REPORT](0037-contact-message-inbox/REPORT.md) | completed |
| [0038](0038-typed-notification-inbox/GOAL.md) | 让每条通知明确属于提醒、建议或动态，显示原因和可追溯来源，并让 Web 与 App 操作同一条记录。 | 2026-09-16 已确认的消息/三类通知设计 | 功能及主线e045651b3；同账号三类通知与双向动作验收，[REPORT](0038-typed-notification-inbox/REPORT.md)保留失败历史 | completed |
| [0039](0039-evidence-based-notification-discovery/GOAL.md) | 让 AI 从允许使用的真实信息中自主发现具体动作，有可信时间才提醒，并展示可核查的原文依据。 | 2026-09-16 已确认的消息/三类通知设计 | 功能4aa21961a/合并131723ddb；云端既有来源的真实 AI provider/费用仍缺；外部 Calendar/Gmail/Microsoft OAuth 来源转后续 TODO，见[REPORT](0039-evidence-based-notification-discovery/REPORT.md) | blocked |
| [0040](0040-notification-delivery-cutover/GOAL.md) | 让消息和通知按独立偏好可靠送达，减少重复打扰，并安全替换旧通知数据与旧发送链。 | 2026-09-16 已确认的消息/三类通知设计 | 功能eacd7a227/合并0b552649d；偏好/迁移已验，真实Push/AI及原生出站确认未齐，见[REPORT](0040-notification-delivery-cutover/REPORT.md) | blocked |
| [0041](0041-web-test-baseline-restoration/GOAL.md) | 恢复可信的 Web 测试基线，把确定性测试与显式前置的集成测试分开，并修复当前所有已知基线失败 | 用户批准 B/D 在定向验证与独立审查通过后先合并，并要求把既有 Web 全量失败单独建 Sprint 跟踪 | 原run已交blocked报告30a032849；固定532c29dcd确定性3183/3183，隔离集成前置/两次integration+all及审查/主线整合未齐，不重开Generator | blocked |
| [0042](0042-personal-schedule-list-repair/GOAL.md) | 修复个人日程列表读取，并验证增改删后列表、详情与日历一致 | B/C/D报告追加；R-08/R-09，承接0010/0026/0027 | C run-01 SC01～05完成，三功能主线426b188195；报告31e7c665及登记随本次文档整合闭环，旧Web全量失败保留 | completed |
| [0043](0043-event-read-access-repair/GOAL.md) | 活动参会者与分析入口符合实际资格，合法读取成功、拒绝与服务错误明确 | C主包参会者404/分析500与403；R-04/R-09/R-14 | C唯一run结束failed；产品aa2699已部分合入，报告b971a8e1f。MAIN aggregate仍500，真实registered正例及原生精确请求缺证，旧标题映射撤销，不二次生成 | failed |
| [0044](0044-ai-conversation-readback-repair/GOAL.md) | AI新会话发送后可持久回读和续聊，不返回悬空成功会话 | D POST200后GET404；R-00/R-02/R-14 | 部分功能已合入；原生实际发送/重开通过，Web历史会话没有composer导致续聊失败，notes实际调用/源版本和原生失败恢复缺证据；REPORT已提交，run关闭 | failed |
| [0045](0045-private-note-deletion/GOAL.md) | 确认删除私密笔记并传播到关联入口、镜像及新AI检索，不越权或复活 | D整条笔记无删除入口/API；R-13/R-14追加 | 原run661c015冻结、tracked clean且无活代理/测试；生产端口/锁序/adapter/迁移/传播仍待，不直接发布半成品；用户要求启动0051，ROOT暂挂后续执行槽并移交历史UI/读取锁，保留原Planner/SC/run/commit | paused |
| [0046](0046-repeatable-functional-acceptance/GOAL.md) | 用正确主包与隔离有效样本补齐交互矩阵，失效通知来源安全提示 | 用户实际交互要求、B/C错包与C/D样本缺口；R-11/R-14 | 原run legacy8e304→主线e660；40旧通知失效负例已实测，合法样本/完整矩阵/离线未齐；用户要求启动0049，ROOT暂挂本run释放执行槽，保留SC/冻结源码，不关闭或重开 | paused |
| [0047](0047-web-ai-session-composer/GOAL.md) | Web历史AI会话有唯一续聊输入，追问持久保存在原会话并双端读回 | 0044实际Web输入控件0，关联SC02/03/05；R-00/R-02/R-14 | run_count=0；Phone PW0010已限定验收关闭，另PW0011新分析生成由Phone父规划；D/E原run槽位未释放，不复开0044或替代0036源版本接线 | planned |
| [0048](0048-analytics-configuration-preflight/GOAL.md) | 活动分析未配置时先准确拒绝，不因后续缺快照表变通用500 | 0043 SC02/03失败；ROOT只读真PG复现stage2零ROI/stage3缺snapshot表42P01 | 窄范围追加计划已编制，run_count=0；不重开0043，不自动migration，不复刻整个失败Sprint | planned |
| [0049](0049-registration-questionnaire-progression/GOAL.md) | 报名选择题只在其他展开输入，画像保留已答题并显示实际覆盖度和停止建议 | 2026-09-16用户三项新要求，关联R-04/R-09/0014 | 原run源码固定bb2bc9bd510a3358180a8a38a564a08bd7aec266，Phone已消费dd2；定向与types回执通过，全量仍有失败/skip，SC05与主线集成未齐；新0050暂挂本run后续执行槽，保留原Planner/SC/commit，不重开或completed | paused |
| [0050](0050-registration-status-cancel-reactivate/GOAL.md) | 看懂报名限制，在合法窗口完成取消与再次报名 | 2026-09-16用户截图两项新要求，关联R-04/0004/0049及Phone取消修复 | 原唯一run-01已结束，最终464a1ff6c1169e93337219fe24d527635dad3b98，功能fe41cb49及字典e285b9c9固定；clean/锁释放/原Planner不改。ROOT必要固定依赖已精确消费到chat-agent34b4a65364d552e1d70fd241ad2e1d0d65d7b2fc，代码与被测A58完整版本相同，旧全量失败/取消/skip保留；主Web新生产build31066实际exit0、PID52170/BUILDsFvXXnpt2erv0ZL3ngLVH/live健康，Metro8082保持。SC05仍缺合法QA窗口、同actor Phone/主8082真实取消→再次报名，PUBLIC0056未升级，代码主合不算完成，不重开Generator | blocked |
| [0051](0051-notes-history-lifecycle/GOAL.md) | 从写笔记入口查看所有已保存历史，并验证笔记创建至删除、离线和AI读取的完整生命周期 | 2026-09-16用户新增并要求支线执行，关联R-13/R-14及0018/0025/0033～36/0045 | 原唯一run-01部分交付后结束，功能094d82e245→66de9ac5f3、最终报告42fcd36208b1291b00371bc2e8777f02ff301e41；clean、全部源锁和进程释放，保留原Planner哈希。App一次3103/3103、最后草稿18/18；Web定向17/17、全量57既有失败/206skip。SC03/04正式v3/AI统一读取、删除port/事务/授权source fence/离线及SC05 ROOT真实集成未齐，不重开Generator | blocked |
| [0052](0052-needs-evidence-ranking/GOAL.md) | 需求匹配显示简短可核对的真实依据，评分体现业务场景和实际能力而非泛AI词 | 2026-09-16用户匹配短句和分数改进要求，Phone父只读诊断/冻结契约222ab259 | 唯一A原run已closed，193e源码/f124报告固定，clean/源锁及句柄释放；ROOT精确集成005494并push，新主3000build/live200，组合17/25及types0。原I3130/3129pass/1fail与3621/3358pass/57fail/206skip、guard拒绝4保留。Phone独立83232f5a新build/6场预览真实v2数据一致，但实际原点单需求漏ordering、自身落地诉求误计实施经历导致四个100分，原SC02/03实际失败；新增窄0055纠偏。公网publication暂停保留f4，ja/en受控展示非持久三语PASS，SC05未齐，原run/报告不重开或改写 | failed |
| [0053](0053-personal-schedule-design/GOAL.md) | 按参考重做个人日程时间块、编辑和独立详情，并保存真实线上地点/全天/私有关联 | 2026-09-16用户参考图并要求交支线，关联0010/0027/0042/0051 | B唯一run-01结束，功能75151e986f/报告66b1a4a473固定，Planner0976aa58不变、锁释放。ROOT精确合chat-agent27a45a2be并push；合并树App179/179、Web55/55、types0，原I失败/206skip及版本不确定性保留。主3000新生产build/health200、IPv48082运行；原生build/install0且实读8082，真实新建30分→详情、改期1小时→详情、全天及仅自建记录删除/日历0项已验证。Phone精确组合f4e1059a5发布321xx，本地Chromium/公开Chromium及WebKit实际登录/v2集合/新建页/已有详情读取通过，业务写0；错误缓存/空串两产物及回退保留。原生秒单位显示缺陷与全天日期语义待修，同actor/同数据库双向写回读和视觉矩阵未齐，见BR029，不重开原Generator、不completed | blocked |
| [0054](0054-personal-schedule-display-correctness/GOAL.md) | 修正个人日程原生分钟单位和全天占用日期，UTC/编辑语义不变 | 0053真实Hermes显示秒及全天多一天；承接SC01/02/05，窄范围不重开旧run | 唯一B run-01已closed；功能1ab65fbb42e909307963ff342da714a5d13e92e3、中文报告b35667cf9e83e5dd4b6dda47cd5e945475e46ce6固定，Planner f593452f不变、clean/六源锁及句柄释放。B App42/42、Web13/13/types0；ROOT当前精确集成树同42/13/types0及实际cached审计，UTC秒/endTime/duration/editor/字典/契约不变。SC04真实Hermes三语言/同actorWeb回读及SC05主线新产物/Phone交接仍待ROOT，browser非原生证明，不重开Generator或completed | blocked |
| [0055](0055-needs-intent-evidence-correctness/GOAL.md) | 识别原点单需求，避免自身诉求/意愿被误计相关实施经历 | 0052真实新预览SC02/03失败，原话及分项private证据；只承接两具体缺陷，不克隆整0052 | 唯一A run-01 closed/clean/锁及句柄释放，功能56e0c19d1f4875540f277dca46360aded124f88a/中文报告e6707dd14abe0195897ab081feab43d266a127e3固定，Planner458c4f不变。ROOT精确合main d9cbf4918976f5b009d04a4af618cff7563f52e5/treeadaf一致及push/remote同SHA，25/25/types0/guard0，初loader误require失败保留；prod审计42mapped/4pathsLOW/newhelperUNKNOWN。新Webbuild83645实际0、45001/PID9654/BUILD3u94p/livehealth；Phone精确54+55至a272/tree d916，原账号78联系人及需求/版本/本体/预算固定，六场真实zh/受控非持久ja/en读取ordering与旧四实施0、已有personal30min真实通过，ROOT实际raw及entryhash核。但新未改delivery能力仍从试点客户诉求误得39分，公网放行立即撤回且父确认尚未切321；关联0056窄纠偏。SC55-04/05原生/公共完整证据未齐、f4/ngrok/322原样，原52全量及能力失败不抹，不重开Generator或completed | blocked |
| [0056](0056-delivery-capability-evidence/GOAL.md) | 交付能力及摘要只从本人能力陈述取证，不借其寻找试点客户的诉求 | 0052能力/摘要SC02/03及0055真实新预览未改capacity失败，原匿名raw和暂停receipt；复用原准确取证批准 | 唯一A run-01 closed/clean/三锁及句柄释放，固定功能85c17690c106cbef887215763a5588427b3578d8/treecc05、中文报告ad6aeb572d1e6ff68a45b59e0f02898f99a248fd；首46项24fail、types夹具失败及修复、ROOT48项2fail保留。ROOT精确MAIN5332e16499f754fe77e59177fda1ee63219c409e/treec97及普通push/远端一致，合并树54/54/0skip/guard0/types43666实际0，官方5files37mapped0flowsLOW/newhelperUNKNOWN。新主Web生产build83394实际0/BUILDicDh/17007 livehealth；Phone固定6788f4f95cc139f7b7c53fd26bd780b8bd32d5bf/tree3e08精确消费、BUILDl2Ei、原域321xx IPC已发布18042/18043/18044，原ngrok/冻结322未动，完整f4保留可回退。六场本地原zh/受控非持久ja/en及两场公网真实zh登录读取通过，ROOT独立原profile/78contacts/goal及版本深比较、全部roundsum/API-direct、market能力0/摘要无delivery、服务cwd与实际公网HTML/entry200/SHAe53/API200live核；public原字节预算before=after493f。六登录POST匿名分类初失败/ENOENT保留，精确guard路径映射后auth分列/0业务与模型事件。仍无真实全天、同actor原生写往返和持久ja/en跨端证据；只读通过不等于所有SC/旧52/54/55完成，source/wire/权重与真实资料保持 | blocked |

| [0057](0057-canonical-mainline-read-boundary/GOAL.md) | canonical活动主线集成不触发旧导入名单私有资格查询，legacy仍保持原owner检查 | 0050/PW0012精确集成树实际App171项170pass1fail，额外私有owner GET；不是重做报名或重开C | 唯一B run-01已结束，固定部分功能ca77035729bffae1c977ed30b6697921c02decfb/TREEd510、实际报告df372d8e54b6d484afbf67ec61268f70d18d06ae，clean/锁释放。两文件55+/4-，完整canonical27/27/App types0；原唯一I3200/3198pass/2fail/0skip0cancel/542guard非零0保留。新增canonical4登记缺项经0058真实完整审计修正，不豁免；/+html及全域runtime缺项仍保留。ROOT主合chat-agent34b4a65364d552e1d70fd241ad2e1d0d65d7b2fc，总官方57files165mapped2语言流程MEDIUM/newcanonical与AST UNKNOWN；主Web实际新build31066exit0/PID52170/BUILDsFvXXnpt2erv0ZL3ngLVH/live健康、主8082保持，PUBLIC0056不动。SC04真实原生/Phone消费未补齐，不重开run或completed | blocked |
| [0058](0058-offline-surface-alignment/GOAL.md) | 补齐活动/日程真实消费接口的离线域及策略登记，审计识别动态调用但未知请求仍拒绝 | 原全域离线0033～0036及0050/0053/0057实际I缺项；新增canonical4和MAIN实际personal6/10invalid，不克隆原Sprint | A唯一run-01closed，固定源137f6f2ea0d85a0f604a436b74ca12e53f54494c/TREEe20ae9bb2a854b4f83c96b08d9ea1fd3652c12b3、报告8b5182601f8ba3cbba7fb4a2537e66309c29e156/TREEc171，clean/锁释放。十项登记及真实审计完整17/17/types0，原唯一App I3203/3202pass/1fail/+html/0skip0cancel/542guards非零0，不报全量green。ROOT已精确主合chat-agent34b4a65364d552e1d70fd241ad2e1d0d65d7b2fc，新生产Webbuild31066exit0/PID52170/BUILDsFvXXnpt2erv0ZL3ngLVH/live健康；代码与原完整被测版本相同复用证据，不再full。SC03全域runtime/可信grant/epoch/selector未接，SC05主8082实际设备与Phone消费未验/PUBLIC0056保持，不重开run或completed | blocked |
| [0059](0059-personal-editor-sheets/GOAL.md) | 按ZIP6a还原个人日程编辑设计，关联笔记/人脉点击即打开有列表及首字母搜索的底部选择窗 | 用户2026-09-17三项追加要求；旧0053/0057原run不重开，提醒重复真实执行另0060 | B唯一run01/Sol medium本地源码及中文REPORT7b883已主合push。官方32files40mapped0flowsLOW，原readNote HIGH/新UNKNOWN保留；consumer/policy20/20审计空、UI50/50、types0。唯一App I3140/3138pass2旧fail、Web I3715/3450pass59fail206skip与旧contract2fail保留。ROOT当前Simulator主8082实测既有笔记/人脉列表、选择取消和中文首字母ZT匹配通过，仅SmallRain正向，不代替真实ACL负例/同actor跨端/离线SC。Main现已消费0060产品5523，Web BUILD XP4aMyTN2G7sgMA121zm9/PID83786/3000实际健康；新原生64805构建中。PUBLIC0056尚未升级，隔离消费进行中；锁已释放，不标completed | blocked |
| [0060](0060-personal-reminders-recurrence/GOAL.md) | 真实支持提醒和日/周/月重复，保存回读、实例编辑取消与到期投递形成闭环 | 用户明确升级0053unsupported边界；App最终消费0059设计，复用既有通知所有权避免双发 | A唯一run01/Sol medium本地源码/中文REPORT交接结束为partial，Planner SHA937055不变；backend57bf、安全基线80d2、最终product64157ae33852851b2b71bcbb3f8190df76cf3c50/REPORTf4bb5e0e83f761dab36372a9265f3563cdf655c5固定。提醒/日周月系列与例外/v3独立回读/旧pending权威派发gate已接线，HIGH/UNKNOWN保留。轻链backend42/42、UI63/63、model36/36/types0；唯一App I3243/3228pass15fail，其中14新增fixture失败仅完整47/14局部修复通过、旧/+html保留；唯一Web I3770/3505pass59旧fail206skip，真实PWdenied4同B原组、非整Webguard0，不称fullgreen。ROOT产品主合5523且push/独立remote同SHA，production45530实际0→runtime7071/PID83786/BUILD XP4aMyTN2G7sgMA121zm9/3000健康；原生64805尚构建/未安装。真实同对象到期SC60-04、PG并发/同actorWeb原生/Phone与远程Push仍未验；PUBLIC0056未升级，隔离集成中。全部源码/字典/sync/H锁释放，由ROOT继续真实验收，不标completed | blocked |

2026-09-16按用户“总结B/C/D报告后设计sprints”新增[中文汇总与追加计划](SIMULATOR_REMEDIATION_PROGRAM.md)，随后用户明确“42～46开始修复”及“请继续”，五项实施批准已满足。0042 completed，0043/0044原run以failed收口且报告已合入；0045/0046继续各自唯一run-01，未提前REPORT。0047/0048是实际具体失败的追加计划、run_count=0，不克隆原Sprint或自动第三Generator。全域离线9/9失败仍映射0033～0036原目标；0036原run关闭事实保留，剩余接线不能假作原run恢复，不降低SC。

采用较小 Sprint，而不是把几套子系统放进一次 Generator。0001～0017覆盖当前主链路；0018～0019是后期笔记，未完成仍保留原需求，不把后期排队算作整个项目完成。

0032～0036 是 2026-09-15 用户批准的本地持久化／云端同步多步方案，固定串行关系为 `0031 → 0032 → 0033 → 0034 → 0035 → 0036`。每一步只在前一步固定 SHA 已提交、合并到 `chat-agent` 并通过合并树验证后启动；不同时修改共享 sync contract、App 本地数据库或 Web sync route。0032～0035 分别只负责基础、读同步、写同步和失效恢复，0036 才执行全量跨端／AI／Data Atlas 收口，因此不能用后一步的测试替代前一步的必需证据。

这是当前已知范围的首批拆分，不是对未知接口的实现承诺。缺协议的 Planner 必须在启动前补入实际契约并审阅；原生补丁、公开活动集合等调查若发现本表未覆盖的必要实现，由 Planner 明确补计划／新编号，不留到最终验收时假定已完成，也不借新编号自动重跑失败 Generator。

### 2026-09-14 启动前就绪检查

协调者按各 Planner 的进入条件核对：0003～0019 均有尚未满足的直接或前序依赖，登记 `blocked`、`run_count = 0`。没有领取这些 Sprint，没有生成执行报告，也没有将缺项改为“不适用”。具体协议／运行失败／决策／环境／样本／授权分类见[0002交接清单](../verification/2026-09-13-app-connectivity.md#24-sprint-0002后续-sprint-就绪交接)。

可单独解除的入口是0003（B1/D2）、0005（B3及Web恢复风险处理或隔离专测授权）、0007（B5与安全OCR环境／实体样本）、0008（B4与双用户）、0009（权威时区与DST／全天日期策略）。0002文档交接已完成；各项仍须具备自身声明的其余前置。其余按本表依赖推进，不要求等全部B1～B8都解决后才领取其中一项。

恢复时只核对本 Sprint 的发布契约、批准、环境与样本，必要时补全并审阅 Planner；不要求该 Sprint 自己的实现／验收先完成。已批准的同动作／对象／环境权限继续复用，只有缺失或新增部分需要确认。原 App Planner 的文件白名单不自动扩张；Web/API 责任授权的后续变化见下一节，密钥与迁移仍需独立批准。

### 2026-09-14 补充决定与新 Sprint

- 用户已明确由当前代理负责相关 Web/API 修复；这是责任与相关代码范围的授权，不等于批准数据库迁移、密钥变更、部署或任意真实数据写入。每项跨端任务仍须有经审阅的文件边界与验证范围。
- 用户已采用姓名＋行业必填、自我介绍选填，生日后续确定为完整年月日且仅本人可见；时区策略为跟随设备。这些决定取代之前相冲突的待定描述；完整接口与执行边界仍须修订审阅，不能仅凭产品决定齐全宣称整个 Sprint 就绪。
- 新增 [0020 Planner](0020-secondary-industries-self-profile/PLANNER.md)、[二级目录提案](0020-secondary-industries-self-profile/INDUSTRY_CATALOG.md)和[测试数据范围](0020-secondary-industries-self-profile/DATA_SCOPE.md)。用户本次明确只编制文档，不实现、不启动 Generator、不调用模型或改测试数据库。
- 0020 按 planned 登记，run_count = 0，未产生 REPORT；单独执行指令和计划审阅齐全后才可检查 ready。它是新增需求，不是原失败 Sprint 的第二次运行，也不隐含必须排在 0019 后实施。
- 新增 [0021 Planner](0021-ai-session-organization/PLANNER.md)及[参考与交互规格](0021-ai-session-organization/REFERENCE_AND_BEHAVIOR.md)，记录会话入口元信息、项目式分组、置顶／改名／删除和跨端持久化。用户已澄清只参考 ChatGPT App 的功能与组织形式，公开截图由代理寻找，不做像素复刻。当前只编制，planned、run_count = 0、未产生 REPORT；原 0001～0020 的状态不变。

### 2026-09-15 最新笔记 4a 与 Sprint 0025

- 用户提供 `/Users/xzhao/Downloads/软件UI设计现代化 (3).zip`，明确只采用六张 `screenshots/4a-*` 及其对应代码，并指定创建 0025。虽然 0024 当前未使用，本次按用户的明确编号保留 0025；不补建或复用 0024。
- [0025 设计参考](0025-notes-ink-signal-search/DESIGN.md)已保存六张截图、SHA-256、对应画板 HTML／fixture 摘录，并解决图稿与用户原话的冲突：不实施空查询 A–Z 联系人全集；实际为加号／`@` 入口，输入一个词后由服务端分页返回有限候选。
- 当前只完成 Sprint 文档，状态 planned、run_count = 0、未产生 REPORT，也未修改产品源码。后续 run 必须继续 0018 的私密／版本／幂等与 0019 的显式 IORBIT 确认，并按 Web 运行门槛在 Web/API 重建重启后做同账号 Web↔App 回读。

### 2026-09-15 “我的”页面组与 Sprint 0028

- 用户提供 `/Users/xzhao/Downloads/软件UI设计现代化 (5).zip`，指定把新的“我的”页面组写成 Sprint 后交由 D 线实现。压缩包只作为设计资料，不执行其中脚本或说明。
- 0028 采用八张目标图：“我的”、设置、账号与工作区、编辑资料、更多资料、选择标签、资料建议复核、资料预览。其余 32 张图不属于本 Sprint；来源、哈希、字段兼容和不伪造功能规则见[设计参考](0028-profile-page-group-redesign/DESIGN.md)。
- 0027 已由用户分配给 C 线的日程详情任务，故本任务使用下一个编号 0028。D 线固定最终 SHA `d37d6545d` 已由主线 merge commit `314aedd7c` 合并并完成精确合并树验证，Sprint 现为 completed。

## 运行记录

### 0065 / run-01（2026-09-17）

ROOT在0064验收准备中只读确认真实React Native Web Alert空实现、两活动取消入口直接调用原生Alert，新增[GOAL](0065-web-event-cancel-confirmation/GOAL.md)／[PLANNER](0065-web-event-cancel-confirmation/PLANNER.md)承接已批准取消目标及SC64-04。不称已实际点击复现，真实页面仍待合法配置。唯一A任务 `01a0a838-4974-7ea2-bc4f-8ecce28b2af2` Sol medium，新独立Sprint树／run_count1，基线104ff7988（产品9dc）；0033 PhaseB生产依赖保持未批准/暂停、旧run不关闭或重开。本Sprint与B0064 Web工具文件不重叠，最多两个唯一Generator，ROOT握全部真实QA/Git/index。状态running；Planner冻结hash/实际启动记录在ROOT当前checkpoint，未实施公共版本切换或宣称SC通过。

终验追加：状态completed/run_count1，原running为历史启动状态。固定功能d0e141cc与本线报告94c212已合Main；Root正常UI单新QAcase详情及资料页两处真实confirm拒绝0写/确认singleCAS/独立回读与重新报名通过，原资料摘要保全。新Phone519/f082 freshentry875实际PUBLIC同SHA1afd、health200live及正常UI登录后逐13页正确enabled/业务0，普通push远端7b1b3de289eba6e550a4702954df6056eddc664e一致；管理文档最终push事实见Root checkpoint。[REPORT](0065-web-event-cancel-confirmation/REPORT.md)保留唯一I18fail与完整局部31pass，不冒称全绿/真实Native/AI或全项目完成。

### 0064 / run-01（2026-09-17）

用户在十三场活动配置及旧Phone发布诊断后明确要求“去做吧”。新增[GOAL](0064-phoneweb-registration-window-repair/GOAL.md)／[PLANNER](0064-phoneweb-registration-window-repair/PLANNER.md)，仅修复已识别的Phone展示域配置并消费已交付0050发布，不重开closed0050/0063。唯一Generator为既有B任务 `01a0a879-e8fe-77e3-b748-bd78005aecc8`，GPT-5.6 Sol / medium，run_count=1，基线 `9dc41bd1e80d1129206b001ae6640907b3e41b9a`；ROOT独占真实DB/账号/主Git/索引，Phone协调任务只机械消费与构建交接。状态running，Planner冻结哈希及工作树启动证据由ROOT当前checkpoint登记；尚未执行真实配置写入、切服务或声明SC通过。

终验追加：状态completed/run_count1，SC64-01～05已通过，原running为历史启动状态。fixed796d+8daf已合Main并普通push/远端7b1b3de289eba6e550a4702954df6056eddc664e同SHA；原B同run一次中文[REPORT](0064-phoneweb-registration-window-repair/REPORT.md)提交4a1cb131已合Main376b05d4，管理文档最终push事实见Root checkpoint。真实13版本化配置/audit、同plan幂等与freshchanges0，原六表count/hash配置前后全原；旧主办方映射错误dryrun失败保留后严格修正，不改原owner。0065依赖真实双入口取消/重报闭环及新PhonePUBLIC发布验证完成；正常QA仅新case新增4member/1head/1profile/1head/2response、最终cancelled，排除此新case后原数据摘要全原。唯一WebI64fail213skip保留，环境局部5pass/新工具38pass/types0，非全绿；推荐schema/legacy差异、Native/AI/Push/OAuth等缺项不关闭。详见[BR-030](../../../../bridge/2026-09-17-phoneweb-registration-repair.md)。

### 0027 / run-01

- owner：C 线任务 `01a0a041-c352-7022-98de-1783b8b1adb8`；run_count：1；开始 2026-09-15 16:34 JST。用户已批准 0027 目标、推荐方案与实施；Planner revision 1／SHA256 `01635159a35495b325ed401aaff09a3224940578d321c8eec2ff4de542efba84`。
- 起始 HEAD：`5bfd59e96e555019a88749a2f2b461a7d2ac06a8`；tracked 产品工作区无其他修改。根 `AGENTS.md`／`CLAUDE.md`、`.gitnexus`、设计图、prototype、`output/` 与 `tmp/` 均为既有用户／外部内容，不写、不暂存。
- 范围：Web appointment 共享说明、participant-only CAS/idempotent details API、共享 DTO/schema；App 四类日程 href、会议详情读写、三语与失败保留草稿。Web/API 改动后重建重启当前共同服务，再进行 Simulator 8082 验收。
- 文件锁：本 Sprint Planner 所列 Web appointment／details route／shared contract 与 App schedule／meeting detail／同步副本／字典／直接测试；Bridge 与本 Sprint 文档在收口时更新。C 线独占 Git 暂存与提交。
- run-01 已于 2026-09-15 17:45 JST `completed`：功能 `3ca1f5936`、当前旧日程会议兼容 `0cbc45ffa`。Web 预约／legacy 回归 25/25、PostgreSQL 并发 1/1、App 日程组合 90/90、两端 typecheck、Web 生产构建和 iOS build 通过；登录态 Simulator 四类详情及会议保存→重开→清空通过。详见 [REPORT](0027-open-schedule-meeting-details/REPORT.md)。

### 0024 / run-01

- owner：C 线任务 `01a0a041-c352-7022-98de-1783b8b1adb8`；run_count：1；开始 2026-09-15 07:42 JST。用户已批准 v2 图与实施；Planner revision 1／SHA256 `2caf94fa29c71a474a8d95ccf72944e317ce5550a0493ea4524a2eb8cf5c9cea`。
- 实际主线产品基线 `c5c091fba`，设计导入／登记前 HEAD `32f5d16af`；C worktree 的旧副本已存 pre-start 备份，不做 reset 或整树覆盖。Planner 早期记录的 `42edbdc15` 不再作为实现基线。
- 先释放全新 Web contract／schema／feature／route／测试范围，和 0015 无共享文件；App 字典仍由 0015 独占。精确锁、交接和后续 App 解锁条件见[范围补充](0024-contact-needs-ranking/APPROVED_SCOPE_ADDENDUM.md)。
- run-01 已 `completed`：Web `bf35efb85`、App `725e60b39`、空态修复 `146f5fa09`、原生可访问性与三语返回修复 `d4cc8a441` 已提交。同账号 Web↔App 双向回读、真实 100 分→依据→详情→返回、中／日／英及原生 Dynamic Type 均通过，见 [REPORT](0024-contact-needs-ranking/REPORT.md)。

### 0015 / run-01

- owner：当前主代理 `/root`；run_count：1；开始 2026-09-15 07:39 JST，原地 `chat-agent`，单一 Generator。基线 HEAD `c5c091fba`；Planner revision 1／SHA256 `50280129380cfa0a181bdbdb4a38d1a74dfae38c7ddb815b027151982810f858`。
- 0013／0014 已 completed 并释放共享字典锁；0006、0010、0012 的本地实现可消费，三者尚欠的真实双端／实体推送证据不阻塞本轮零付费 UI 本地化，仍由原报告与 0016／0017 承接。
- 页面锁收窄为 AI 6、事项／Today 4、日程 4、收件箱 1 个真实文件；必要 direct consumer、literal 边界与验证档升级条件见[范围补充](0015-locale-assistant-workflows/APPROVED_SCOPE_ADDENDUM.md)。
- run-01 已于 2026-09-15 12:39 JST `completed`：主体功能 `d7180e134`；原生发现的日文直达返回中文问题先 RED 后由 `16d545b06` 修复。最终目标组合 130/130、App 全量 2776/2776、typecheck 和 diff-check 通过；中文 AI、日文事项、英文日程／收件箱在专用模拟器完成零付费冒烟，见 [REPORT](0015-locale-assistant-workflows/REPORT.md)。

### 0014 / run-01

- owner：当前主代理 `/root`；run_count：1；开始 2026-09-15 06:05 JST，原地 `chat-agent`，单一 Generator。基线 HEAD `caf533bb8`；Planner revision 1／SHA256 `19628ee910d5240c8114b686cc15c95392359fd3f06d7ad134916362c64758b9`。
- 0013 已 completed，0004/0008 本地业务语义 completed；0007 的实体 OCR／真实联系人外部阻塞不妨碍本轮零付费三语 UI 实现。启动基线四个 Planner 文件 182/182 通过，provider keys 清空。
- 目录已收窄为人脉列表／详情／邀请、名片入口／摄入／复核、活动发现／详情／报名真实路由；排除运营、分析、签到等页面。必要 component/view-model 追加与 H 档验证登记在[范围补充](0014-locale-relationships-events/APPROVED_SCOPE_ADDENDUM.md)。
- 结束 2026-09-15 07:30 JST；结果 completed；功能 `9761b343d`。中／日／英动态切换保留搜索、筛选、OCR 编辑、报名答案、业务原文和稳定 ID；目标组合 197/197，首轮全量发现的 15 项旧源码／默认中文兼容失败修复后复验 42/42，最终清空 provider key 的 App 全量 2753/2753、typecheck 与 diff-check 通过。见[执行报告](0014-locale-relationships-events/REPORT.md)。

### 0013 / run-01

- owner：当前主代理 `/root`；run_count：1；开始 2026-09-15 04:35 JST，原地 `chat-agent`，单一 Generator。基线 HEAD `cdd82a31e`；原 Planner revision 2／SHA256 `6f02d207f00b2e044a6a85c7073a5b905c47036cdff677ad457d993742e48ae8`。
- 采用 2026-09-14 已记录的整体批准与 `TECHNICAL_PREPARATION.md` 推荐方案 A：独立 actor-scoped 账号语言偏好记录／GET+PUT 端点；不从旧 `profile.preferredLanguage` 推断手动选择，不把设备语言写入账号。
- 改动前基线：App 账号／资料／设置／首页 258/258 通过；Web 语言／profile 22/22 个可执行用例通过，14 个 PostgreSQL 用例因未配置一次性数据库 socket 明确跳过。实现后必须补齐独立记录的 PostgreSQL CAS／幂等／回滚／actor 隔离证据。
- 结束 2026-09-15 06:02 JST；结果 completed；最后功能 HEAD `9d5c13622`。App 中／日／英基础与账号、资料、首页、设置及可达密码／权限链路完成；设备 A 保存→独立设备 B 服务端回读、真实 PostgreSQL 并发／幂等／回滚、日期不变量和原生大字号均通过。两次全量尝试及其旧夹具失败、后续完整受影响文件复验均按事实保留，不改写为最终全量通过。见[执行报告](0013-locale-foundation/REPORT.md)。

### 0011 / run-01

- owner：当前主代理 `/root`；run_count：1；开始 2026-09-15 03:17 JST，结束本地实现与验证 04:18 JST。Planner revision 3／SHA256 `1b817d35135aec7cdbe2eb231c047ad7f298d3142bc34d02e1fb1f43345d19f6`；最后功能 HEAD `9a10522b1`。
- 功能提交：目标字段保存 `a1d7d7665`、首页 `727aeeae2`、可信报告服务 `7a2e9f767`、Web IORBIT 入口 `3038e8ea7`、App 消费 `9a10522b1`。进入/刷新不生成，报告带服务端验证的生成时间、源数据版本和分析版本；目标保存不覆盖其他资料。
- App Planner 组合 72/72、28/28、5/5，生命周期组合 128/128，最终全量 2715/2715；Web 0011 组合 99/99；两端 typecheck exit0。所有 provider key 清空，新增付费调用 0。
- 结果 blocked：iOS 26.4 Simulator 仅确认 Orbit 可启动但停在登录页；没有授权共同账号/真实分析对象，未完成登录态首页/Pipeline、真实 provider 报告生成后双端重开、关系目标同账号 Web↔App 回读。见[执行报告](0011-home-analysis/REPORT.md)与 Bridge BR-014。

### 0004 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-15 00:55 JST，原地 `chat-agent`，无第二实现者。基线 HEAD `b2afc634d`，原 Planner SHA256 `1e4d139e552c9090eb7fda71b6438a22753a04a4b1e69f3d0b690f0ed8ea9519`。
- 历史题库 500 已定位为 `event_ops_experience_heads` 不可见；当前本地 `orbit_events/public` 已执行 `event-experience-v1-versioned-heads` 迁移并幂等复验，日志在被忽略证据目录。用户的连续执行与必要环境授权已记录为[跨端实施范围补充](0004-registration/APPROVED_SCOPE_ADDENDUM.md)。
- 结束：2026-09-15 02:20 JST；结果 completed；最后功能 HEAD `319f6f7bb`，见[执行报告](0004-registration/REPORT.md)。资格、报名／取消／重报、准入申请与撤回、答案匹配及详情／列表／首页／日历同记录回读均通过。
- 功能提交：`6c3ff4cc6`、`4591428b7`、`58c01f49a`、`603a59e1a`、`319f6f7bb`。App 最终全量 2642/2642、两端 typecheck exit0；Web 相关注册／公开目录／真实 PostgreSQL 组通过。真实原生证据在被忽略的 `build/harness-state/evidence/sprint-0004/run-01/`。
- 合成 QA 数据已按精确 workspace／actor 清理，默认活动恢复到运行前 revision 3 并复核公开人数为0。至少4次真实 DeepSeek 调用的精确 token／增量金额未取得，不记为0；用户未跟踪设计素材和 prototype 未触碰。A 线报名文件锁已释放。

### 0009 / run-01

- owner：C 线任务；run_count：1；基线 `fca77373f`，功能提交 `a4bbfd9f6`。设备时区、DST／异常、全天日期、草稿时区和跨页解释已实现。
- 主树组合验证为 App typecheck exit0、全量2632/2632、0 skip、diff-check通过；真实原生 Tokyo／Los Angeles／Kolkata 与独立 PostgreSQL 同记录 Web/App 回读证据见 [REPORT](0009-timezone/REPORT.md)。合成身份注入边界和 GitNexus 重建失败均保留，不写成真实登录或生产链路通过。

### 0010 / run-01

- owner：C 线任务；run_count：1；开始：2026-09-15 00:12 JST。承接 `a4bbfd9f6` 与 B6 已批准协议，使用独立 PostgreSQL／Simulator，不与 A0004 共用事件报名文件。
- C 线独占事项、日程、首页的0010白名单；共享登记表与Git提交仍由协调者处理。原 Planner SHA256 `5f169b6879af07d7f21515e1d02f7f9ab14a9bcd0b207d950c47080be0c66c16`。
- 结束：2026-09-15；结果 completed；主线功能提交 `d005c2b79`，见[执行报告](0010-task-schedule-editing/REPORT.md)与[批准范围补充](0010-task-schedule-editing/APPROVED_SCOPE_ADDENDUM.md)。个人事项、日期／截止／地点清空、个人日程 CRUD、版本冲突、幂等和提醒保持原计划均完成。
- 冻结补丁61文件 SHA256 `e94ec5eb4c079b7d0583a966d898cd5778b6ef91c4dbf8653d083abc66c4eea6`。主线整合后两端typecheck exit0、App组合154/154、Web组合26/26及任务日期17/17；真实 PostgreSQL 与原生双向同记录证据保存在被忽略的 run-01 目录。旧全量失败／skip和未计量provider费用按报告保留，不改写为通过或0。

### 0022 / run-01

- owner：C 线任务；run_count：1；结束：2026-09-15；结果 completed。Planner SHA256 `d58db78992f48873a32ed040554a997241c2ee02e6573f30fc80a85ec283d9a7`；主线功能提交 `ef5d0b02d`，见[执行报告](0022-unified-tasks/REPORT.md)与[必要测试范围补充](0022-unified-tasks/APPROVED_SCOPE_ADDENDUM.md)。
- 通用待办、人脉待办及未完成／已完成四个视图共用 canonical task 集合；旧 `/followups` 私有入口归一化到人脉筛选，Pipeline、AI、消息和日历跳转到稳定任务地址。候选／提醒不伪装成已保存待办，起草只预填 IORBIT，用户显式发送前不生成。
- 主线复验 65/65、83/83、208/208，App typecheck exit0；隔离 PostgreSQL 与 iOS Simulator 完成同一任务 App完成→Web回读→Web恢复→App回读。原 App 全量 2645 中44项因旧测试夹具编译失败的历史结果保留，夹具修复后的65项完整相关集通过，不改写为全量通过。
- 实施前 `initial-route` 影响为 HIGH，主线陈旧 GitNexus staged detect 错误返回0；按HIGH覆盖导航消费者并人工核对24路径。22份冻结文件逐字一致，另两测试分别保留A0003登录补全和E线真实消息变化。

### 0007 / run-01

- owner：当前主代理 `/root`；run_count：1；2026-09-14 启动，2026-09-15 01:05 JST 结束本地实现与验证。
- 基线 `fca77373f123c03e29a0584cba46bade5f5eb907`；Planner revision 1／SHA256 `05b1e519f405a25ef4da034abd1115cf5f4c501c5552448efa9e56bc013ede46`。
- 双面 manifest、来源复核、稳定确认意图、整卡原子一次创建和旧单面兼容由 D 线原提交 `0a1ca09a4`、主线集成 `011b575bb` 交付；[执行报告](0007-two-sided-cards/REPORT.md)。
- 最终 App 全量 2603/2603，两端 typecheck 通过，PostgreSQL 名片 API／repository 28/28。Web 全量 2990 pass／51 fail／187 skip；其中 47 个失败与既有基线逐名相同，4 个新增 provider 环境失败在清空全部 key 后 63/63 通过，不称 Web 全量通过。
- 结果 blocked：实体 iPhone `shinhaha (26.2)` 离线，没有共同 API/OCR 环境、真实非空批次和授权联系人对象，SC-01～05 的实体／真实跨端证据未闭合。没有真实迁移、部署、push 或 merge。
- 费用：原记录 USD 0.012780／5.00；全量至少 4 个用例进入 provider 请求路径，日志无用量，且首次中断轮是否到达该区段未知，本轮增量待核算。
- checkpoint：`build/harness-state/evidence/sprint-0007/run-01/checkpoint.md`（App cwd，被忽略）；没有 D 线活进程。20 分钟线程心跳保持启用，外部条件恢复后从报告的关闭条件继续。

### 0006 / run-01

- owner：B 线当前主代理 `/root`；run_count：1；开始：2026-09-15 JST。基线 HEAD `75eca33e9`，启动时 tracked 工作树干净；Planner revision 2 SHA256 `303ad11647d89384ff31d64cb7d125a660dc95026028a8bc83aaa15c6d90f173`。
- 承接 0005 protocol v2 与 0021 origin schemaVersion 1；按已批准入口 1／2／3／7 实现一次性预填意图、稳定联系人引用和服务端 actor 验权。真实账号／设备证据按可用环境单列，不阻塞本地可执行实现。
- 原功能提交 `09e1a71fa`，主线集成 `0ff447a55`；App 全量 2604/2604、两端 typecheck 和全部 0006 定向测试通过。Web 安全全量 3020 pass／48 个无关既有 fail／184 skip；真实同账号 Web↔App 引用回读仍 blocked，详见 [REPORT](0006-contact-mentions/REPORT.md)。

### 0005 / run-01

- owner：B 线当前主代理 `/root`；run_count：1；开始：2026-09-14 JST。独立 worktree `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/8475/orbit`，不接管 A 线 profile/auth 改动，不启动第二实现者。
- 基线 HEAD `fca77373f123c03e29a0584cba46bade5f5eb907`，启动时 tracked 工作树干净；原 Planner revision 1 SHA256 `4b7910b723924b457a36769ecbce8d565f371f5e38191125eabab80a4cffe089`。
- 用户明确启动 B 线并授予完成 0005→0021→0006 所需权限；按 RULES 第0节复用批准，B3 跨端必要文件见[范围补充](0005-ai-session-reliability/APPROVED_SCOPE_ADDENDUM.md)。真实数据库、设备、账号和付费调用仍按实际证据与累计预算登记。
- 当前从存储并发／旧快照保护的 RED 开始；GitNexus 索引落后当前 HEAD 5 个提交，依用户此前要求不运行会改根 AGENTS 的索引刷新命令，使用现有影响结果并逐文件源码补查。
- 原产品实现提交 `30c1e210c`，主线集成 `efbfc23ae`；Web 定向 42/42、App 定向 83/83、两端 typecheck、隔离 PostgreSQL 1/1。真实双端设备与 R-00 503 根因仍 blocked，详见 [REPORT](0005-ai-session-reliability/REPORT.md)。

### 0021 / run-01

- owner：B 线当前主代理 `/root`；run_count：1；开始：2026-09-15 00:19 JST。承接 0005 功能 HEAD `30c1e210c` 和同一 B 线授权，串行持有 AI 会话／契约／provider 文件。
- 实施前先把 B3 实际字段与 0021 organization revision 对照写入 Planner，并读取 Bridge 状态与交接，避免覆盖 E 线联系人详情／聊天／收件箱范围。
- 功能提交 `c645d357a`、`cabf07b27`、`9f4396d1c`、`3de117902`、`9bc7039a5`；Web 定向 39/39、App 定向 95/95、原生弹窗修复文件 73/73、两端 typecheck 及临时隔离 PostgreSQL 通过。当前 iOS Simulator 已完成长按／更多／分组／确认和真实 409 反馈；同一全新合成账号完成 App→Web→App 分组改名与删除回读，结果 completed，详见 [REPORT](0021-ai-session-organization/REPORT.md)。
### 0025 / run-01

- Generator owner：`/root`；开始时间：2026-09-15 10:05 JST；基线 HEAD：`e594f076e5b36e302043bc13026a14af98b4cada`。
- Planner revision 1；SHA-256：`b22dda257617049ae6e0a9bb045b9bebf2f1bb2cc17be41abce92a2461d007cc`；档位 H + I。
- 文件锁：Planner 白名单内的 Web/API、共享契约、App 笔记／联系人入口、0025 与 Bridge 交接文件；根 `AGENTS.md`、`CLAUDE.md` 及未跟踪 `docs/designs/2026-09-15-notes-contact-picker/` 属于既有用户内容，本 run 不写、不暂存。
- 运行目标：先用 RED 覆盖兼容契约与有界联系人搜索，再实现 App 搜索式关联、提及／草稿和六个 4a 状态；Web/API 改动后必须重新生产构建、重启并以同账号／同数据库完成浏览器与原生 App 双向回读。
- 结束：2026-09-15 12:44 JST；结果 completed；功能提交 `01a1592d9801702b37d874c7d7477b16f2e75472`；[执行报告](0025-notes-ink-signal-search/REPORT.md)。
- 验证：Web 定向 45/45、typecheck、production build 5 与 live health 通过；App 定向 65/65、typecheck、契约同步、全量 2598/2598 和 iOS 构建 0 error／0 warning 通过；Web 全量的唯一新增失败已修复，剩余 52 与既有基线相同。
- 同账号验收：浏览器与原生 App 均为 `qa@orbit.test`，双向创建／编辑／搜索、版本 2、actor 404、stale 409 和幂等均已验证；BR-019 为 verified。

### 0026 / run-01

- Generator owner：C 线当前主代理 `/root`；开始时间：2026-09-15 15:20 JST；基线 HEAD：`34f95a20a1953b824444b61a5d691d95a070f165`。
- Planner revision 1；SHA-256：`716e6886b4df3295480860e07cdf81e94d1fcfda8b6de9202d5c5bbe4f159bb1`；档位 H + I。
- 文件锁：0026 Planner 白名单内的 App auth、actor-scoped snapshot、待办／个人日程／笔记／配对 AI intent 消费者、直接测试与 Sprint／Bridge 文档。Web/API 产品代码和全部既有未跟踪设计资产不写、不暂存。
- 运行目标：先用 RED 证明 raw `userId` 与 canonical `accountId` 不同会误拒合法 owner，再从 `/api/account/me` 建立唯一 canonical 身份，并保持 foreign owner、失败接口和缺字段 fail closed。
- 结束：2026-09-15 16:17 JST；结果 completed；功能提交 `f5f595df447afc1aad9c028a467f075421073709`，邀请 scope 审计补漏 `3385369ddf42b19b590007ec9c573cab82d8f03d`；[执行报告](0026-canonical-app-account-identity/REPORT.md)。
- 验证：App typecheck、契约同步、身份／任务／日程／笔记／AI／消息定向和最终全量 2804/2804 通过；当前 Web health live/ok；iOS 当前源码构建 0 error／0 warning，登录态 Simulator 在 8082 读取待办、日程和笔记工作区。
- 审计：业务 owner、actor-scoped cache／draft／receipt 使用 canonical `auth.actorId`；活动会话、名片导入 session scope、认证与密码重置保留 raw subject，见 [身份审计](0026-canonical-app-account-identity/IDENTITY_AUDIT.md)与 [BR-020](../../../../bridge/2026-09-15-canonical-app-identity.md)。

### 0018 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-15 06:55 JST。原地 `chat-agent`，单一 Generator，无其他写入者或 Evaluator。
- 用户明确要求开始实现 0018 与 0019；复用 `RULES.md` 第 0、6 节的整体批准。0017 未完成的真实共同环境验收不阻止本地跨端实现，但 SC-0018-05 没有真实回读证据前不得将本 Sprint 标为 completed。
- 基线 HEAD `40338854659b1408ea9903b19a043d56a214352f`；根 `AGENTS.md`、`CLAUDE.md` 的既有用户改动不属于本 Sprint，保持不写不暂存。
- Planner revision 3 SHA256：`750df5d4ceb63b6691de6b61667eda96152da779833ead97e1b171c02057b79b`。完成目标所需的 Web/API、共享契约、App 路由与测试追加范围见[跨端实施补充](0018-notes-core/APPROVED_SCOPE_ADDENDUM.md)。
- 当前代码没有独立 `/api/notes`、App notes 路由或笔记版本／多人关联契约；实现使用现有 `orbit_records` 通用信封，不创建数据库迁移、不访问真实账号或记录。
- run-01 于 2026-09-15 07:45 JST 结束为 blocked。功能提交 `8e81e588e`；Web notes 定向 13/13、类型检查通过，App 全量 2583/2583 通过。Web 全量 3004 pass／52 fail／183 skip，新增 notes 测试通过，既有环境／审计失败及相对旧文档基线扩大的 5 个审计子项已在 [REPORT](0018-notes-core/REPORT.md) 逐项记录。SC-0018-05 因缺真实共同环境、同账号与原生设备证据未关闭。
- 2026-09-15 09:21 JST 补充验收：生产构建的 live Web/API、隔离 PostgreSQL、同账号 Web/App 与原生 iOS Simulator 已完成双向读写、刷新、版本冲突和 actor 隔离。SC-0018-05 更新为 pass，0018 当前状态为 completed；原 run-01 的 blocked 记录保留为历史。

### 0019 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-15 07:45 JST。原地 `chat-agent`，单一 Generator，无其他写入者或 Evaluator。
- 用户明确要求连续实现 0018 与 0019；基线 HEAD `36bf8f5ca`。根 `AGENTS.md`、`CLAUDE.md` 的既有用户改动继续保持不写不暂存。
- Planner revision 2 SHA256：`02281c85f0e8faf049e0edf1416ca84e146347b47d07f9226442bb69dd1e263a`。来源引用、日期歧义、接受幂等、版本失效和跨端文件范围见[跨端实施补充](0019-note-suggestions/APPROVED_SCOPE_ADDENDUM.md)。
- 0018 功能提交 `8e81e588e` 已提供本地 actor 私有 note ID／version／contactIds 契约；SC-0018-05 的真实共同环境缺项继续传递到 0019 最终验收，但不阻塞本地可执行实现。测试不访问真实数据库／账号，不调用付费模型。
- run-01 于 2026-09-15 08:16 JST 结束为 blocked。功能提交 `15685b18e`；Web 定向与类型检查通过，App 最终全量 2590/2590 通过。Web 全量 3008 pass／52 fail／183 skip，新增测试通过且失败数与 0018 基线相同。SC-0019-04 缺真实共同环境／同账号／原生证据，SC-0019-05 因 R-00～R-14 多项前序仍未关闭而受阻；详见 [REPORT](0019-note-suggestions/REPORT.md)。
- 2026-09-15 09:21 JST 补充验收：原生 App 的笔记预填、显式发送、建议接受、幂等、任务回读、返回来源及含糊日期零写入均在同一 live Web/API 与账号上通过。SC-0019-04 更新为 pass；0019 仍仅因 SC-0019-05 的全范围前序缺项保持 blocked。

### 0003 / run-01

- 结束：2026-09-15 03:03 JST；结果 blocked；最后功能 HEAD `b2afc634d`、当前集成主线 `e93ba57cf`，见[执行报告](0003-profile-completion/REPORT.md)。SC-01～04 已通过，只剩 SC-05 的真实 Google 最终回跳和同一账号 Web/App 双向回读。
- 当前主线 0003 定向集为 App 209/209、Web 非 PostgreSQL 54/54；App 全量2672/2672、两端typecheck exit0。Google broker/PKCE 已真实到 Google 官方登录页，但当前浏览器无用户登录态且 Chrome 控制不可用，没有把到达登录页写成完整 OAuth 成功。
- 历史检查点：原子保存已提交 `6082b9961`：版本比较、幂等回执、事务回滚，14项临时PostgreSQL测试实际执行。App全量2593/2593；Web最终3005 pass／47原有fail／168skip，失败名称与基线一致。首次48 fail中的旧首页工厂断言已定位并修订，历史日志保留。当时继续同一批两端补全交互及认证导航，未把子功能算作Sprint完成。
- 历史检查点：已提交资料基础层 `65c2a8050`：独立onboarding、私密生日及投影隔离；App全量2593/2593，Web2990 pass／47原有fail／168skip，失败名称与基线完全一致。首次App全量的统计重试时序失败保留，受控回包修订后相关156/156及全量通过。当时继续事务保存与补全导航，尚未关闭完整SC，见[进度证据](0003-profile-completion/PROGRESS.md)。
- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 21:26 JST，原地 `chat-agent`，无第二实现者。前序0002报告及B1技术提案已读取，复用整体批准，见[跨端实施补充](0003-profile-completion/APPROVED_SCOPE_ADDENDUM.md)。
- 基线功能HEAD `f4bdef4c0`；原Planner revision 2 SHA256 `8315be01f929ce997cc43dfeadd87f489522c63ce53d1dd7102c7288018c4bd1`。本任务产品文件无未提交差异，0023仅剩协调文档；未跟踪用户素材保留。
- 历史检查点：当时的有效基线为 App2593 pass／0 fail／0 skip，Web2969 pass／47既有fail／168skip，两端typecheck exit0。Web失败名称与原I版本一致，沿用已批准的基线继续，不降低SC。
- 历史检查点：文件锁当时按原Planner及补充归当前主代理；0023不同时写本任务的资料／契约文件。当时真实注册、Google系统回跳、共同账号双端回读均未执行；目前真实注册已完成，最终 Google 回跳及同一账号双端回读仍缺，不因此阻止其他独立本地实现。

### 0023 / run-01

- 最新整体批准已按 RULES 第0节生效，旧“待审”不再构成逐文件审批停点。App两级搜索与筛选交互已提交 `e181bbdc3`；App全量2593/2593、两端typecheck通过。继续纯seed构造与数据投影，不执行写库CLI；真实环境、分类缺依据及费用核算仍分别保留。
- 纯seed构造、9名人物行业投影与12人／24投影清单已提交 `f4bdef4c0`；相关9/9，Web全量2969 pass／47既有fail／168skip、typecheck通过。3名人物缺依据，未执行CLI／写库；后续资料文件锁暂交0003的同一主代理，0023剩余SC不自动关闭。

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 16:42 JST。原地 `chat-agent`，无其他写入者或 Evaluator。
- 用户明确“全部同意”当前 8 个新增文件及接续 Sprint，并要求快速持续执行；必要付费调用已批准。复用这些批准，不反复请求同一事项。未具体界定的未来破坏性操作、真实数据库写入及部署不推定授权。
- 基线 HEAD `d531c42d4`，产品 WIP `5355f0c6a`；tracked 工作树干净，用户未跟踪设计文件与 prototype 保留。原 0020 run-01 保持历史 blocked，不覆盖原失败。
- 契约：[PLANNER revision 1](0023-industry-consumer-continuation/PLANNER.md)，继承原五项 SC 和接续方案的精确范围。联系人、搜索／资料投影、AI 与 trace 已分批提交；当前继续本地测试数据，真实验证门槛独立保留。
- Planner SHA256：`5ab6f8a60493c73fd52200981dc99b44dcb9492bc2d338b96d2002a1c787b68d`。联系人接线已提交 `9daf52dad`，搜索 HTTP 已提交 `36f7255d8`，资料页投影已提交 `db972c3f8`。三个额外传递／兼容文件的批准见[范围补充](0023-industry-consumer-continuation/APPROVED_SCOPE_ADDENDUM.md)，不再等待重复批准。
- AI 本人资料工具、完整 trace 和 Agent 报告兼容已提交 `2c079ee93`。用户明确批准三个报告文件的最小兼容修复后，缺失说明的 RED 已消除；五个完整相关文件 13/13，Web typecheck exit0。报告只登记新能力和动态数量，保留原实测、受限项和安全断言。
- 本地数据提交：`464e7f816` 固定资料／联系人／搜索夹具；`10c2ecd7b` 可执行增量清单；`fd91387b0` 旧全局人物及关联投影。清单现有8人／28个正常投影／两个反例，生成数据、其余内联样本和既有测试库仍未补齐，见[数据进度](0023-industry-consumer-continuation/DATA_REPAIR_FINDINGS.md)。
- App 资料正常夹具补齐：`805188a56` 名片／编辑／保存，`2d1add128` 首页及建议／抽取转换；五个修改文件加既有行业交互测试共51/51、App typecheck exit0。空资料、缺姓名和旧版无ID反例保留，尚未并入 Web 的增量投影清单；没有因此声明 App 全部测试数据已补齐。
- 最近 H 全量（`fd91387b0` 同一源码版本）：App 2582 pass／0 fail／0 skip；Web 2952 pass／47 fail／168 skip，两端 typecheck exit0。Web 47项失败与上次逐项对比没有新增，原48项中的 Agent 报告模块错误已消失；不是把旧计数直接改写。日志在 build/harness-logs/sprint-0023-fixture-{web,app}-full.log。真实模型、跨端、原生和既有测试库验收仍未完成，环境隔离历史与未核算费用保留。
- 更新 H 全量（`1adb805c7`）：推荐候选在同步／异步及普通／排序路径保留行业 ID、null 和省略语义；12个新增路径用例先见8个预期RED，修复后相关两文件29/29。App全量2583 pass／0 fail／0 skip；Web2964 pass／47 fail／168 skip，失败名称集合与上一版无变化；两端typecheck exit0。日志为 build/harness-logs/sprint-0023-recommendation-{web,app}-full.log。继续本地夹具盘点，不以阶段提交结束整体工作。
- 后续L数据检查：`d34712307` 补内联资料／联系人／推荐输入并登记4个实际推荐投影，清单现8人32正常投影；5个RED后四文件43/43。`e5db81a32` 将AI输出／统计桶／活动偏好与活动领域三个来源列入明确非个人行业分类，登记RED后四文件20/20；两次Web typecheck均exit0。两个反例保留，其他10个来源族仍未完成；不把这两次局部检查称为新的全量。
- `b5e868112` 补App邀请／搜索及Web简报正常输入，3条RED后App9/9、Web11/11，两端typecheck通过。连续三个L提交后的I全量：Web2966 pass／47 fail／168 skip，失败名称无新增；App2582 pass／1 fail／0 skip。App失败为 `app-wide-workspaces.test.ts` 任务设置关闭按钮测量43.99998474121094未满足严格44下限；未改代码或断言，限定该用例重跑1/1。它使用slide Modal且按钮样式minHeight来自44pt token，动画几何精度只是当前诊断，不能把单次通过当修复或把全量改记通过。日志为 build/harness-logs/sprint-0023-inline-integration-{web,app}-full.log 和 sprint-0023-layout-failure-repro.log。新增App搜索mapper及纯seed构造器的待审精确边界见数据进度页。
- `64defa67d` 新增离线受审行业 backfill 计划与注入式条件事务 apply：CLI 拒绝 `--apply`，没有连接或写入真实数据库。汇总清单为20人／56投影，其中17人有依据、3人缺依据；保留2个反例、10个非人物记录和10类待盘点来源，明确 `complete:false`。定向20/20、Web typecheck通过；真实快照、并发／回读及完整盘点仍缺，SC-05继续 running／blocked-by-object，不因工具可用而关闭。

### 0020 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 10:04 JST。
- 用户已同意上一条明确提出的“0020 现有代码方案，不含真实数据库写入、迁移和部署”，要求执行、离线期间不再提问。此批准替代旧“技术方案待审”与“仅编制”描述，保持原目录和单选／工具白名单；不扩大到其他 Sprint 的新设计。
- Planner revision：1；SHA256：`529bd9a278bf357f59d4ba3ae8a7e7485b479dcc5fe4985f53efc13dd016dcd6`。
- 起始 HEAD：`808515a82`；tracked 工作树干净；用户未跟踪设计素材、prototype 与 `.gitnexus` 保留。
- 执行范围：现有 Planner 的 Web/App 代码与源码夹具，原地 `chat-agent`、同一 Generator 串行；根 Git 由当前代理独占。不改变冻结 Planner。真实对象的独立缺项保留，SC-02／03／05 不以本地模拟替代。
- 结束：2026-09-14 11:04 JST，结果 blocked；[执行报告](0020-secondary-industries-self-profile/REPORT.md)。没有功能 commit，源码保留为未提交改动，不能作为后续已交付依赖。
- 验证：两端 typecheck 通过；App 全量 2581/2581；Web 全量 2932 pass、51 fail、168 skipped、2 TODO。10 项审计失败在基线复现；本轮使资料页旧运行证据失效，未擅自改审计断言。4 项 provider 环境失败离线复验通过。
- 费用：原已记录 $0.012780/$5，Web 全量遗漏 DeepSeek 环境隔离产生意外 provider 路径，本轮增量待核算，不是 0；核算前停止额外付费调用。
- checkpoint：`build/harness-state/evidence/sprint-0020/run-01/checkpoint.md`（App cwd，被忽略）；所有测试进程已结束，不自动重开 run-01。
- 12:29 JST 后续：用户明确要求先提交再推进；34 文件部分实现已 WIP 提交 `5355f0c6a`，非完成验收。新复验 Web 22 pass／2 个仍失败的 TODO、App 163 pass、两端 typecheck 通过；原全量失败不变。提交后补成[精确接续范围提案](0020-secondary-industries-self-profile/CONTINUATION_PROPOSAL.md)，未改冻结 Planner、未自动重开 Generator。
- 最新授权：用户两次明确允许必要付费调用，沿用原累计 $5 上限，费用逐次核对；此前意外调用增量未核算，不当作零。接线文件／接续方案的独立审阅与真实数据写入边界不变。

### 产品决定记录（2026-09-14，后续确认）

本节记录用户已确认的产品规则，不表示实现完成，也不替代单独的执行指令。

| 事项 | 已确认决定 | 影响与剩余边界 |
| --- | --- | --- |
| 生日 | 需要填写完整年月日，且仅本人可见 | 0003；不再询问年份精度，不公开展示或加入 AI 本人资料工具输出；实际字段与完成判定仍须落入接口。 |
| 二级行业 | 用户认可现有 14 个一级、79 个二级选项的目录提案 | 0020；认可对象为提交 `621874a5c` 的 INDUSTRY_CATALOG.md 分类条目，不等于批准全部技术方案、测试库写入或启动实现。 |
| Pipeline | 保留独立 Pipeline 入口 | 0011；不实施隐藏入口方案。 |
| 首页活动／待办 | 活动替换当前联系跟进内容区块；仅参考用户图片中的活动列表呈现；未完成待办最多显示 5 条 | 0011；不照搬整页布局，不删除其余待办或旧跟进业务数据；首页跟进快捷按钮由记笔记替换。 |
| 人脉待办 | 全部具体行动统一为待办，人脉待办只是筛选视图；需要联系的联系人留在人脉页面，不设首页独立跟进入口 | 用户已认可设计；已登记 0022，处理筛选、入口、旧路由及能力兼容，不扩张 0010 的编辑协议范围。 |
| 界面语言 | 默认跟随设备，手动选择保存到账号并同步其他设备 | 0013～0015；账号手动选择优先，不再询问设备级还是账号级；实际读写／刷新契约仍需补齐。 |
| AI 入口 | 用户已按当前 App 入口清单确认：1、2、3、7 用模板转入 IORBIT；4 取消；5、6、8、9 保持现状；流程内辅助入口 10～13 不动 | 具体编号、按钮与规则见 [0006 入口决定](0006-contact-mentions/PLANNER.md#已确认的入口决定2026-09-14)。0008 承接聊天摘要取消要求；其余契约、文件边界与验证范围仍需补齐审阅，不表示已经实现。 |
| 笔记建议 | 用户认可笔记页用“从这篇笔记整理待办”模板、携带笔记引用进入 IORBIT；用户发送后生成建议，再确认创建事项 | 见 [0019 Planner](0019-note-suggestions/PLANNER.md)。笔记页不独立调用 AI 提取待办；具体引用／接受协议仍需补齐审阅。 |
| AI 会话管理 | 每个会话保存开头／入口信息；App 支持分组、置顶和删除，功能与组织形式参考 ChatGPT App，不要求 UI 完全复刻 | 新增 0021；已找到并查看公开 iOS 截图。具体契约和“删除分组保留会话”等方案随 Planner 审阅，不视为已实现。 |
| 笔记管理 | 首页“记笔记”直接替换原联系跟进快捷按钮，位置在新建待办之后，不额外增加一项 | 0018 负责可用的创建入口，0011 对齐首页位置；按钮去留已确认。旧内容分类、迁移及完整管理路由仍需设计。 |

此前的姓名＋行业必填、自我介绍选填、设备时区策略与 Web/API 负责人授权继续有效。本轮把生日、首页活动／待办、语言同步及笔记快捷入口写入 0003／0011／0013／0018 的 revision 2 和目标页；未启动实现，运行状态、run_count 和历史报告不变。其余旧 Planner 与已确认决定冲突时以此决定为准，执行前继续完成技术范围审阅。

### 0001 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 00:03:40 JST。
- Planner revision：1；SHA256：`e81528e71ff7162a7abd43e599d25dc806613575a50ae25241a340067e0d9b93`。
- 起始 HEAD：`62bbe0af12475953e53c1d91a10b69d93ca8db56`；承接暂停点的四文件 56+/8-，没有其他产品文件改动。
- 结束：2026-09-14 00:19 JST；功能提交：`bc6a6c1ed8e8946668d16a6923741569577b56ef`；[执行报告](0001-event-discovery/REPORT.md)。
- 验证：106/106相关测试、2577/2577全量、类型通过；Simulator只读活动筛选通过。四文件与被验收提交一致。
- 原0001四文件和Simulator锁已释放；Git仍由协调者独占。checkpoint：`build/harness-state/evidence/sprint-0001/run-01/checkpoint.md`。

### 0002 / run-01

- owner：`/root/sprint_0002_generator`；run_count：1；开始：2026-09-14 00:15 JST。
- Planner revision：1；SHA256：`8efbf5aa556577c7c395fb170242c609ee1c2cb61d539d57ca8800f3fb45441a`。
- 起始 HEAD：`bc6a6c1ed8e8946668d16a6923741569577b56ef`；三个业务文档启动前无未提交差异。
- 结束：2026-09-14 00:38 JST；文档提交：`cced58bd7c30308e3e0ac21fcd7b3de6466b372a`；[执行报告](0002-readiness-handoff/REPORT.md)。
- 验证：五项SC通过；14个相对链接、17行就绪条件和15处源码引用检查通过；暂存detect仅3个文档／16个Section／0受影响流程。D档，无产品测试、HTTP或原生操作。
- 原文件锁：`docs/api-gaps.md`、`docs/verification/2026-09-13-app-connectivity.md`、`docs/superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md` 及 0002 报告，现已释放。只读源码，未接管 Simulator、API、账号、费用或 Git。
- 0002 不依赖0001结果；与0001收尾只并行处理无重叠文档，仍各自只有一个 Generator。

### 0008 / run-01

- owner：`/root/e_line`；run_count：1；开始：2026-09-14 23:24 JST。
- Planner revision：1 + B4 已批准技术契约；SHA256：`a20d9e1084b2b77d1d1fe29f3c3aab79f853874234a44b5bf8dce7f73b2261d1`。
- 起始 HEAD：`fca77373f123c03e29a0584cba46bade5f5eb907`；启动前产品工作区干净。
- 文件锁：0008 Planner 白名单、已登记的必要 Web/API 契约与实现路径，以及对应测试。与 B 线共享的 `ContactDetailScreen`、`RelationshipChatScreen`、`RelationshipInboxScreen` 仅在本 worktree 修改并在报告中明确交接。
- B4 契约已冻结；真实双用户、数据库和实体设备环境在执行中核验，缺少外部环境只影响对应真实证据，不降低本地权限、幂等与隔离验收。
- 结束：2026-09-15 00:36 JST；功能提交：`6d8173b786105d24642a1ab7b83c4253e4a79eb9`；[执行报告](0008-identity-chat/REPORT.md)。
- 验证：两端类型与 0008 定向集通过，PostgreSQL live-store 1/1；iOS Simulator 构建 0 error／0 warning 并成功安装启动。Web 全量受既有 live 环境基线影响，报告保留原始失败数。
- 文件锁已转交 0012 所需的 Inbox 与通知范围；根 `AGENTS.md`、`CLAUDE.md` 用户改动未纳入功能提交。

### 0012 / run-01

- owner：`/root/e_line`；run_count：1；开始：2026-09-15 00:36 JST。
- 前置：0008 功能提交 `6d8173b78`；启动时先刷新 GitNexus 索引并冻结前台刷新、已读回执、角标失效及通知注册契约。
- 范围：0012 Planner 列出的 Inbox、badge、notification lifecycle、条件性 message-state 模块及对应测试；不生成或保存推送服务密钥。
- 结束：2026-09-15 01:39 JST；结果 blocked；功能提交 `218fb3d4bc30ab0a45750f2e3a04592e133b1710`，见[执行报告](0012-message-state/REPORT.md)。
- 验证：App typecheck、iOS Hermes export、411/411 定向集、2589/2589 全量和 PostgreSQL live-store 1/1 通过。实现已完整落地；缺授权双用户原生持续前台／真实失效目标和 Expo project／server key／实体推送证据，必需 SC-02、03、05 不伪记 pass。

0020/run-01 已以 blocked 结束，代码未提交；其 REPORT 逐项记录剩余 Sprint 的范围、设计、依赖与环境门槛，不表示全部实施完成。用户要求连续实施所有剩余 Sprint 的指令保持有效，不逐项重复询问；适用条件闭合后按单次运行规则安排接续。0001／0002 不重新运行。管理框架、19份Planner和0001报告提交为 `1a0c7086420a421169f63e8e4b0a04c6cc329315`；本报告／登记表提交可从Git历史查看，不在报告内追填自身SHA。

### 2026-09-14 顺序实施与离线指令

此前 0020／0021“只编制、需另行执行指令”是历史事实；用户现已要求完成 0022 后逐步实现，[实施顺序](EXECUTION_ORDER.md)承接本次授权。两项 Planner 中的旧“本次只编制”不再作为缺执行指令的理由，但其明确要求的书面技术审阅、依赖及真实写入批准继续保留。0022 的 [设计](0022-unified-tasks/DESIGN.md)与 [Planner](0022-unified-tasks/PLANNER.md)已经编制，run_count 为 0，不预建 REPORT。

用户随后说明将离线一小时，要求独立推进、不再提问、优先无需用户决定的工作。执行安全技术准备和依赖核查；没有就绪 Sprint 时如实记录，不擅自批准契约或消耗 run。

用户再次要求执行后，按新增停止规则继续推进：[0020 源码／数据入口核查](0020-secondary-industries-self-profile/READINESS_AUDIT.md)、[0003/B1 技术补充](0003-profile-completion/TECHNICAL_PREPARATION.md)、[0005/B3 协议与隔离复现](0005-ai-session-reliability/B3_PROTOCOL_PREPARATION.md)已落盘。当前产品基线为 `df824de70`；新增 Web 字典 3 项、App 同步／账户 20 项、Web 会话 7 项基线均通过，旧快照覆盖在全新 memory store 复现；不代表新功能通过、真实数据损失或已启动 run。继续动作见 EXECUTION_ORDER，不因这些文档完成而结束整体实施。

同轮后续：`fab788d62` 保存 B2/B6 证据，`18a8627b9` 保存 B4/B5 技术准备。B6 既有 15 项测试通过，但新内存复现并发同版本编辑接受两次、仅保留一次修改；B2 从留存服务日志取得与原 500 相邻的题库表不可见异常（42P01），尚未连接当前数据库核对／修复。另已核对 B7 分析时间、账号语言来源及 B8 旧备注边界，见 [当前动作与缺项](EXECUTION_ORDER.md#进入代码阶段的实际缺项)。这些是准备与诊断成果，0003～0022 仍未启动 Generator，也没有功能 REPORT。

## 2026-09-13 暂停点（历史基线）

- 分支 `chat-agent`，HEAD `62bbe0af12475953e53c1d91a10b69d93ca8db56`。
- 既有活动修复四文件仍未提交：`src/screens/events/EventsScreen.tsx`、`src/view-models/events.ts`、`tests/ink-signal-events.test.ts`、`tests/screen-state.test.ts`；56 行增加／8 行删除。由 0001 明确承接，不丢弃或重复实现。
- 上个提交版本全量 2574/2574；本次未提交修复有 5 项 RED→GREEN 和类型通过，尚欠完整相关回归、原生及 commit。具体日志见 0001 Planner。
- 真实 AI/OCR 原累计上限 $5，已记录保守费用 $0.012780／5 次供应商请求；继续原账本，不按 Sprint 或代理重置预算。
- 该规划轮只创建／修订管理文档和 App 的规则入口，没有运行功能测试、业务请求、Generator 或提交现有功能；之后的实际执行另列运行记录。

## 恢复方式

用户明确恢复后，由协调者把运行状态改为 ACTIVE，并检查相应 Planner 的进入条件、版本和审批。可以明确要求“执行 Sprint 0001”；这只授权它的既定范围，不自动批准后端、真实写入或其他未决设计。需要连续执行时，按用户授权范围依次领取就绪 Sprint。

每次启动登记 `owner`、`run_count: 1`、Planner 哈希、起始 HEAD／diff 和开始时间。结束在本表更新状态并链接实际报告；登记表与报告有冲突时先停下核对，不能选择较乐观的状态。不填虚构 owner、运行时间或 commit。

### 0030 / run-01

- Generator owner：E 线当前代理 `/root`；开始时间：2026-09-15 JST；结束时间：2026-09-15 19:41 JST；状态：completed；分支：`codex/e-line-sprint-0030`。
- 集成基线：`01bcceeb5c11113c8677ca9e89be39d9678fb0bc`，基线合并与重复内容修复后 HEAD `03b63e8a5`；用户既有 `AGENTS.md`、`CLAUDE.md` 与未跟踪笔记设计目录保持未暂存。
- 批准设计：`0030-inbox-ink-signal-unified-feed/assets/3a-inbox.png`，源自 `软件UI设计现代化 (5).zip` 的 `design_handoff_orbit_ink_signal/screenshots/3a-收件箱.png`，780×1688 px，SHA-256 `a2f576c474780cd451c10eb7a2b3fe339130a18974c0f6436f9a1494e2522702`。
- 运行目标：以真实 conversation、notification、relationship signal 聚合四类收件箱，逐条确认“全部已读”，保留既有详情／定向写信能力，并在同账号、同数据库的 live Web/API 与 iOS Simulator 上验收。
- 结果：产品/测试固定 HEAD `4d351f0a0eddc1479eebb3a6b6852a466cad322d`；inbox matrix 231/231、App 全量 2828/2828、typecheck、原生 0 error／0 warning和同账号 40/40 read 持久通过。当前 QA 数据缺 activity/contact/IORBIT/conversation，历史 reminder task 与 canonical task 交集为 0；这些运行限制登记在 [REPORT](0030-inbox-ink-signal-unified-feed/REPORT.md) 和 BR-024，不伪造记录。

### 0037 / run-01

- 开始：2026-09-15T22:12:36.030Z；owner：E线当前session主代理，唯一Generator；分支 codex/e-line-sprint-0037，工作树 /Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/798d/orbit。
- 基线：53c44973f；Planner SHA256：`111b90cae89d5bce491b3c2dd31b3ca6b948730b6b78b70b6d73d0b5f92cc9ed`；用户已明确要求本session实现0037～0040，复用适用批准。
- 范围锁：0037 Planner的消息/收件箱消费者、必要语言文案及行为测试；不修改0033～0036的sync、outbox、AI freshness和未提交文件。共同Simulator/Web进程先核实使用者再接管。
- 重叠检查：0033实际在codex/sprint-0033-runtime-acceptance等工作树推进，主线ready标签滞后；0037与已查文件无直接代码重叠。0039接入query-service/manifest前等0036写入结束或使用不修改这些文件的独立适配器；0040与0035通知协调器接线须集成后复验。语言文件与根台账只能串行合并。
- 本run尚未做真实双账号/远程Push验收；按实际结果继续更新，不预填通过。

- 0037收口：功能/主线 a591494b0；两端同版本运行证据及失败历史见REPORT；下一步0038，未改0033～0036文件。

### 0038 / run-01

- 开始：2026-09-15T23:21:42.686Z；owner：E线当前session，唯一Generator；分支codex/e-line-sprint-0038；基线f2ab646dc。
- Planner SHA256：58bbe969bdb65567e5dfa07920e85a438ef75175c234fb787a35cd0a0078b548。复用已批准通知设计与本session连续实施授权。
- 独占通知记录/API、消费者及语言接线；沿用0037独立QA数据库/31037/Simulator bundle。根AGENTS/CLAUDE和旧设计/GitNexus生成目录保持原状、不提交。
- 0033～0036未进入本线：采用现有云端业务服务，不改sync/outbox/AI visibility。共享台账由本协调者串行集成。

- 0038收口：功能/主线e045651b3；真实跨端记录、时间修正及显式提醒优先策略已验收，完整失败历史见REPORT/BR-026。继续0039。

### 0039 / run-01

- 开始：2026-09-16T00:27:40.473Z；owner：E线当前session，唯一Generator；分支codex/e-line-sprint-0039；基线0ed78f065。
- Planner SHA256：424d1194cc4072b1f1b6b617e9065940ede951af2a85a6f583a8a53a9449dd3d。复用已批准规格与本session连续实施授权。
- 独占notifications/discovery、新设置API/UI及对应契约/测试；使用云端独立适配器，不改0036 query-service/manifest，不写0033 sync/0035 outbox。继承独立QA环境；保留用户AGENTS/CLAUDE和旧设计目录。
- 真实provider前核对0020未结算费用；离线代码/队列不依赖这项缺口。

- 0039收口：run-01 blocked，功能4aa21961a/合并131723ddb；合并树Web16/16、App22/22、两端typecheck通过。真实模型链及历史费用缺项见REPORT，独立工作继续0040。

### 0040 / run-01

- 开始：2026-09-16T01:31:46.940Z；owner：当前session唯一Generator；分支codex/e-line-sprint-0040；基线562373393。
- Planner SHA256 de08d8ed7560c0321afa9a2bf4b2e5b950db9218c83fd6f268ba7f8bcdd665ee。0037/0038已完成；0039固定协议已合并，真实AI链等待费用/provider，仅暂停0040相应依赖场景，其余按根自主执行规则继续。
- 0033实际9174工作树1c8b442e1，tracked clean；0035尚未改通知协调器。本线持有notifications/delivery及通知响应有限接线；不改sync提示、outbox或root layout。0035后续须复验组合。独立QA31037、原Simulator/bundle继续。
- 0040收口：run-01关闭为blocked；功能eacd7a227/合并0b552649d，主线Web16/16、App129/129及两端typecheck通过。共同设置、真实入站、QA迁移/回退保留业务已验证；远程Push、历史AI费用/provider与本轮原生出站确认缺项见REPORT/BR-028。0037/38 completed，0039/40代码交付但未全验收；暂停20分钟跟进和本线发现watch，Web保留。
- 可执行：策略/偏好、事务投递身份、迁移dry-run/QA apply及独立UI；可调查：精确Push配置存在性；等待外部：未结算费用、真实模型/远程设备证据。

### 0033 / run-01（全域离线读取升级）

- 开始：2026-09-16T12:19:17+09:00；owner：A 线任务 `01a0a838-4974-7ea2-bc4f-8ecce28b2af2`（A线｜0033 全域读取第一阶段），唯一 Generator；原登记的 `client-new-thread:fc2240dc-8f65-4da4-bb9c-0e1c12a686e3` 是创建句柄，不能作实际任务 ID。基线 `3a9b9696737289df12bb382cf77266c0b51ecd8f`，启动时 tracked 工作树干净。
- Planner SHA256：`a9190990bacab2fd3d2b659c912f3fa8cb0359d1dc2f193d663b5fd519532fe3`；批准中文规范与详细计划均已合并到 `chat-agent` 并推送。
- 本切片文件锁：`repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`、`scripts/audit-offline-read-surfaces.ts`、`tests/offline-read-inventory.test.ts`、Web `shared/contract/universal-read.ts`、`shared/api-schema/universal-read.ts` 及由既有同步命令生成的 App 副本；仅执行详细计划 Task 1。
- A 线持有域 ID、route inventory 与 universal-read contract 的定义权；B/C/D 只能消费已固定接口，不得并行重定义。认证、数据库、manifest/cursor 等后续高风险 Task 尚未放行。
- 2026-09-16继续授权：复用原run、Task1固定`edba0ebfeb635f684fe193cd88f4f4e428211ec6`与干净工作树，先释放Task2A两个新增文件`src/api/offline-read-session.ts`、`tests/offline-read-session.test.ts`（均在App）：纯租期解码、时间/域scope断言与online-only写入能力的TDD切片，消费既有strict wire契约，不改identity/provider/transport、契约/清单、SQLCipher、Web或DB。全域读资格不受0034首批四域写集限制；无可读存储不伪造localRead成功。Task2B真实server-grants和2C共享认证/transport锁仍等待具体依赖与放行；中间能力提交不标Task2或Sprint完成，不加Generator/Reviewer。当前主线本地初始化告警单列；Task5锁顺序冲突在migration放行前必须统一。
- Task2A固定`9994150c041e4cea91aef4bfe8dd37795b982f08`已合入`bbe0060007d1c4b1245ad0db06af944aa46d2aee`并push/独立ls-remote一致；ROOT完整8/8零跳过/typecheck exit0。仅新pure模块和测试，无生产消费者，不能把pure local-read返回值当存储ready/真实签发grant；2B服务器全域grant枚举与持久authorizationEpoch来源仍缺，2C认证/transport仍未放行。
- Task3/18独立native-preflight工具准备已放行同一A原run：仅既定`repos/orbit-app/scripts/verify-offline-read-native.ts`及必要新增`tests/sqlcipher-native-config.test.ts`，TDD验证config-plugin→Pod properties/实际编译标志漂移；static通过不当真实cipher/coldstartPASS，缺原生结果明确未验证/非零。当前配置意图true但生成properties缺key/实际编译无codec，根因历史未定；不prebuild/pod/改node_modules/清钥清库。Task5锁序[中文修订待审](../../../../docs/superpowers/specs/2026-09-16-sync-lock-order-amendment.zh-CN.md)，未批准前不改既定规范或迁移。

### 0034 / run-01（风险分级离线写入升级）

- 开始：2026-09-16T12:19:17+09:00；owner：B 线任务 `01a0a838-4972-7183-a138-d8dd5e96f5c7`，唯一 Generator；worktree `/Users/xzhao/.codex/worktrees/b70b/orbit`；基线 `3a9b9696737289df12bb382cf77266c0b51ecd8f`，启动时 tracked 工作树干净。
- Planner SHA256：`c53a516f17ed339d845d0caf1142665b98f8f4a73d43a21f2b847fe64a6309f0`。
- 本切片文件锁：Web `shared/contract/offline-policy.ts`、`shared/contract/offline-mutations.ts`、`tests/architecture/offline-policy.test.ts`；App 对应生成副本、`src/data/offline/ports.ts`、`policy-registry.ts`、`src/data/sync/mutation-adapters.ts`、`tests/offline-mutation-eligibility.test.ts`；仅执行详细计划 Task 1。
- 不修改 0033 共享核心、snapshot、outbox、cursor 或认证；真实绑定等待 A 线固定 SHA。未知 route/domain 默认拒绝，`local-read` 不授予在线写权限。

### 0035 / run-01（全域失效恢复升级）

- 开始：2026-09-16T12:19:17+09:00；owner：C 线任务 `client-new-thread:6fe77f03-aa9f-4595-adc6-158ef8746add`，唯一 Generator；基线 `3a9b9696737289df12bb382cf77266c0b51ecd8f`，启动时 tracked 工作树干净。
- Planner SHA256：`e5b8a3b7b870cc1ad8aace5f88a73f1fc492ef671f63da4b05457e571ebe9158`。
- 本切片文件锁：App `src/data/sync/invalidation-transport.ts`、`polling-invalidation-transport.ts`、`sync-trigger-coordinator.ts` 及两个同名直接测试；仅执行详细计划 Task 2。
- 不实现服务端 status、不保存或推进 A 线 cursor、不接管 B 线 outbox；真实 recovery binding 等 A/B 固定 SHA。本切片只证明单飞、dirty 保留、abort、退避与无重叠。

### 0036 / run-01（AI 全域数据访问升级）

- 开始：2026-09-16T12:19:17+09:00；owner：D 线任务 `01a0a838-4974-7ea2-bc4f-8eab26470a14`，唯一 Generator；worktree `/Users/xzhao/.codex/worktrees/b66b/orbit`；基线 `3a9b9696737289df12bb382cf77266c0b51ecd8f`，启动时 tracked 工作树干净。
- Planner SHA256：`b6db74a23d47f3af15276db25640fe1794648200c0b24518461f6571a0347b91`。
- 本切片文件锁：Web `features/orbit-ai/data-query/read-contract.ts`、`permission-registry.ts`、`query-cursor.ts`、`query-result.ts`、现有 `query-schema.ts`、`data-visibility/manifest.ts`，对应 Task 1～2 测试以及其直接受影响的 manifest 架构测试与 `docs/orbit-ai-read.md` 说明。
- `createActorQueryInputSchema` 影响集合超过 15 个符号，按项目规则视为 HIGH；已向用户提示并由管理线刷新 stale GitNexus 索引后复核。Task 2 可在不改该符号时继续新文件/测试。AI manifest 仅声明服务端能力，不是客户端离线授权依据。
- 后续D原任务明确固定`9b0fd19176661b18ef137b5eb672de4eb48257a7`、working tree clean、全部runtime/artifact/query锁释放且原run已关闭；本轮API核对实际任务`01a0a838-4974-7ea2-bc4f-8eab26470a14`原交接，再次确认不能恢复为第二Generator。剩余真实AI工具runtime接线、源版本和综合验收并未完成，完整REPORT仍缺；登记blocked不冒completed，也不将原数据读取目标删除。

本轮用户明确要求把可并行开发分到不同线；协调者只放行上述互不重叠的第一批切片，覆盖默认“两条独立 Sprint”并发限制。共享 auth/sync contract、snapshot、i18n、Simulator、Web 服务和集成验证仍严格串行，四个 run 不共享真实账号写入、数据库迁移或服务生命周期。

### 0042 / run-01

- 开始：2026-09-16T17:04:32+09:00；唯一Generator：管理任务内 C 支线 `/root/c_sprint0042`，GPT-5.6 Sol / medium；工作树 `.worktrees/sprint-0042-personal-schedule-list-repair`，分支 `codex/sprint-0042-personal-schedule-list-repair`；产品起始基线 `9b2a9ccc5cbe0db32496424324071b321acf4a11`，计划登记提交作为实际工作树起点另记checkpoint。
- Planner SHA256：`d0218e9e34f7c5dd5561483978d2111def145a9f78a410b79964b251bbb9f11d`；复用用户“42～46开始修复 / 请继续”的批准。
- 先独占0042在线 personal-schedule API/schema、Web personal-schedule 服务/集合handler与定向测试；`PersonalScheduleList`、通用hooks/sync、共享生成契约及字典须管理线核实0033持有者后逐路径移交，不能自行重写mirror-first。
- 先比对0033固定投影修复 `439f7f439` 与消费者 `9ca83b4dd`，它们尚未等于主线验收。只读main3000允许；服务重启、Simulator/账号写入、数据库环境与重套件排期由协调者串行分配。0043等待本项锁释放。
- run内路径补充：`repos/orbits/tests/api/personal-schedule-collection.test.ts`（真实store/authority/集合读取，SC01/03/04）；`repos/orbits/app/(app)/app/tasks/personal-schedule-client.ts`（Web列表接线，SC02/05）。已核实0033消费者固定提交且无产品未提交，当前`PersonalScheduleList.tsx`在线入口锁移交C；本轮修主线在线owned读取，后续0033集成保留mirror-first，不倒退消费者。无query聚合保持既有日历/首页与legacy日程语义，不猜补owner/version。
- 原run两轮必要Web补修追加：`app/(app)/app/tasks/personal-schedule-workspace.tsx`及完整测试（错误不混显空态）、`app/(app)/app/tasks/personal/page.tsx`及`tests/pages/personal-schedule-page-account-scope.test.ts`（既有canonical helper接线、anonymous/null redirect）；没有削弱owner校验、改通用auth、sync、字典或数据库。固定三功能94268e757/04be65cbc/6a92629e9均已合入`426b18819523c0b05dd30365b5a02669850841ac`，报告`31e7c665d23985184e7831e5233c71720ab0dab4`随本次文档整合。
- 收口：最终production Web BUILD_ID `ffPa-FLfCgMTBiMrUVaAu`、PID90050/3000与主包DA设备/main8082完成同记录App A→B、Web C→App列表/详情/日历回读，精确删除后GET404、owned0、聚合35且exactID0；最终Web离线刷新错误1/空0→恢复错误0/空1，原生同源TERM/恢复实测。Web分支24/24、最终合并树直接6/6及typecheck0；原生build/install0，实际native脚本Node25、Web/tests Node22如实区分。全量23失败及env重载事故仍保留在REPORT，不称全库绿色；0033未来mirror集成须复验，不等于已完成全域离线。
- 文件/设备/main actor/API写锁全部释放，认证浏览器已关闭，唯一个人测试记录已准确清理；B接手当前runtime窗口。报告与本次登记文档检查/主线整合闭环后completed。

### 0044 / run-01

- 开始：2026-09-16T17:04:32+09:00；唯一Generator：管理任务内 B 支线 `/root/b_sprint0044`，GPT-5.6 Sol / medium；工作树 `.worktrees/sprint-0044-ai-conversation-readback-repair`，分支 `codex/sprint-0044-ai-conversation-readback-repair`；产品起始基线 `9b2a9ccc5cbe0db32496424324071b321acf4a11`，计划登记提交作为实际工作树起点另记checkpoint。
- Planner SHA256：`67f61b3cd5b10b736211dd30a19804bb3a7137bc6418042c28825b78e9f9bdd9`；同一用户批准。
- 先独占会话生命周期route、reliable-send/live-conversation/session-storage范围中不与0036冻结切片重叠的文件和定向测试；0036 data-query/manifest不得改，runtime/artifact/service-factory/AiScreen须当前D线交接后明确移交。已向原0036任务请求固定SHA及锁清单，不派其重复实现0044。
- 不调用付费provider、不改live配置或重启共享进程；先确定性POST→真实store→GET TDD。所需跨端运行身份与隔离对象由协调者分配，真实工具/费用证据缺项不记PASS。
- 原0036 D任务已明确释放所有活动锁：固定`9b0fd19176661b18ef137b5eb672de4eb48257a7`，工作树无未提交；必要会话runtime/service-factory/AiScreen及route/test范围移交B，不改0036冻结data-query/manifest契约。路径补充：`repos/orbits/app/api/ai/conversations/request-context.ts`（局部canonical身份适配，SC01/02/04）、`repos/orbits/tests/capabilities/orbit-agent-conversation-readback.test.ts`（POST→真实store→正式session GET/list，SC01～04）。不扩大到共用agent-request-context。
- 同一run补充受影响认证测试：`repos/orbits/tests/capabilities/agent-actor-brief-boundaries.test.ts`追踪精确local canonical adapter；readback完整测试增加恶意body/header身份隔离。功能提交`e40bf223ca2ad642ecd013487f39bb021e1cd1c0`后补充测试提交`2eb91b677b80be39e070cc5d36a55543815d8a31`，不改生产身份行为或冻结SC。
- 最新运行授权覆盖上述初期“不付费”限制：C0042释放后，B复用DA主包/原3000 canonical QA/主8082和主线426 production artifact，至多两个实际只读发送、现有loop3最多六provider出站，原共享累计硬预算$5不重置；任何unknown/未确认usage/保留预留即停止追加。付费前账本15entries/$0.032249/0reserved；Phone服务独立、根产品merge与服务生命周期冻结，临时独立浏览器只用已有库、凭据仅RAM。
- 同run真实PG只读元数据：tasks open54/followups open27/notes1，取样ID/owner/source时间匹配，但笔记真实entity v3被legacy query丢弃、tasks/followups无独立revision，结果无authority/readAt/records.revision；0036冻结契约虽已合入仍未接actualruntime。SC04源版本缺口保持未满足，不用schema version/timestamp充数、不在0044重写0036。
- 原run已结束，报告固定 `78cecfa59`，功能/测试已合入。原生实际一次发送→正式GET200 revision2→历史重开成功；实际tasks/followups各10条且truncated，未调用notes。3笔provider全部settled共$0.006362，共享账本18entries/$0.038611/0reserved；没有第二POST。生产Web历史会话渲染没有任何输入控件，global ask排除agent而chat分支未渲染composer，真实跨Web续聊失败；原生真实失败恢复缺项保留。精确自建会话UI删除后正式GET404/history缺席，request/revision审计保留，所有窗口释放。状态failed不因部分合入改为completed，不复开Generator；Web composer需要另冻结追加方案，0036实际source fence接线仍按原任务推进。

0042/0044初期集成检查点：功能合入`chat-agent`的`f0d747730037f0f9020297cd47aea37b17c9d489`；Web定向42/42、App27/27。该树Web全量曾失败：3558项、3359通过、23失败、176跳过，20旧失败、3新增名称；本地测试自行加载`.env.local`并实际连接PG，不能记为隔离或全绿。C原run证据保留逐名对照/loader映射/只读审计；两个PG新增失败所涉源码本轮未修改，无before快照不能保证业务未变。B关联旧认证断言第一轮修复后6完整文件41/41，主线补充两完整文件15/15，未重全量。当时两Sprint均running；最新0042收口及0044未满足项见各run条目，旧失败不因局部修复或文档整合改为通过。

获准排队：0045由D接续并复用 `codex/sprint-0033-note-delete` 的 `03bfe4aa5` 墓碑能力，尚无Generator run；0046现由E领取先准备，最终验收依赖单列，不提前生成REPORT。0045原子sharedstore依赖0033尚未合入的sync写锁migration；精确main dev PG只读catalog确认当前函数不存在，不能盲合导致现有upsert失效；UI及其他独立准备与此依赖分开。

0043关联范围协调：PhoneWeb任务独占PW-0009的EventsScreen历史筛选、专属演示活动日期以及EventDetailScreen仅真正public NOT_FOUND且已登录时的既有auth详情读取接线（已实测auth200/public404）。0043不重复该详情fallback，仍调查参会者/分析资格、权威来源与正确错误态；PhoneWeb固定SHA交接后在主线复验。不修改public_code/alias、不扩权，32110由PhoneWeb任务独占，32100重启仍需串行协调。

### 0043 / run-01

- 开始登记：2026-09-16T18:08:49+09:00；唯一Generator管理任务内C支线`/root/c_sprint0043`，GPT-5.6 Sol / medium；独立worktree `.worktrees/sprint-0043-event-read-access-repair`，分支`codex/sprint-0043-event-read-access-repair`，产品基线`426b18819523c0b05dd30365b5a02669850841ac`，tracked干净、两端锁文件一致，复用现有依赖symlink不安装。
- 冻结Planner SHA256 `424fd770cceceb81a6c0eb4987f6eaab39f02a45dd1ce95ab678417649e188cc`；复用已批准五SC，不改契约。基线直接Web18/18及App15/15 exit0，不能冒充live资格通过。
- 进入条件已核：精确main `orbit_events/workspace:orbit-dev/account_orbit_generated`只读PG事务确认`event_02`已Event Core cutover且QA为organizer；`event_signup_03`已cutover但QA非owner、无role assignment，两活动均无该QA canonical membership head。有权/无权角色可核验；真实registered attendee正例单列待合法精确fixture及清理方式，不给旧活动/账号扩权，不把旧取消投影当active registration。
- 先独占Planner内App参会者/分析consumer及Web对应handlers/资格适配器/实际service与直接测试，按根因逐符号impact后TDD。0033活动源及通用sync、0044所有会话/runtime/App AI、PhonePW0010 reader/AI契约/会话UI、i18n和共享contract生成边界不并行改；必要新增文件登记用途/SC后实施，不增加审批循环。
- B持DA/main actor/共享runtime与付费窗口期间，C仅独立分支源码/定向测试和已批准只读元数据调查；不操控主包/共享浏览器、不API业务写、不自行停启3000/8082/Phone、不合产品到root。需同版本真实验收/fixture时等根明确释放，固定SHA交接后根merge→生产build/restart→实际操作→报告/主线闭环。
- B0044现已释放全部窗口；C恢复原未结束run而非再生成。统一图实际元数据已更新至`1f2c697ac`/2026-09-16T09:17:08.460Z，原进程句柄消失不等于分析失败；核查无活analyze且命令exit0 Already up to date，驻留MCP列表缓存须与disk元数据区分。新增资格CTA模块`src/screens/events/EventAttendeeRosterLink.tsx`及EventDetailCard最小接线获准，避开Phone public404 fallback。注册wrapper12直接caller/21symbols按技能HIGH已报告，最小503异常保护不改资格并覆盖传递消费者；event_02配置head精确只读count0，不写配置或扩权。
- 固定产品`f2a0066df0a27d4447eb4c09e7342b6c57305cb0`/最终`aa2699e474a862aea40c46bab6f399b342db3d9f`已机械合入`4378c964c`，不是验收完成。精确合并树App5完整文件221项/220通过/1失败/0跳过，唯一失败为此前PersonalScheduleList旧detail GET清单孤项；Web2文件22/22与两端typecheck exit0。原全量App3019/3016通过/3失败/0跳过、Web3571/3312通过/53失败/206跳过均保留，两个局部修复轮次已用尽，不再重跑Generator或全量。
- 新主线Web生产构建与主包安装后，C实际点击“沉睡关系重新激活会”详情名单CTA→名单屏空名单；两活动运营分析均出现通用服务错误，没有预期配置说明/合法拒绝，另一活动详情无名单CTA但为unconfirmed重试。活动标题与冻结metadata分别对应event_02/signup03，不是已捕获的原生pathparam。匿名formal account/me及两活动四私有GET共8次均401。原生HTTP、请求ID与canonical actor未正式观测，不能推断实际500/503；MAIN QA凭据来源和真实registered正例缺项保持未满足。C已释放DA与共享browser窗口、产品冻结，无fixture/config写入或第三修复；run尚未REPORT收口。
- 收口更正：上条原生标题到event_02/signup03的推断已撤销；正式Web两目标标题与截图不同，不能用其满足冻结原生SC。原MAIN登录从B44实际脚本AST查实使用ROOT `.env.local` 的ORBIT_XIAOYU_TEST_EMAIL/PASSWORD（非qa@标签），仅RAM正式登录后account/me200确认account_orbit_generated。精确8GET：event02 owner/attendees200（名单0）、aggregate500 INTERNAL_ERROR无配置reason、attendee403；signup03 owner/attendees安全404、aggregate/attendee403。两个精确public GET200但status cancelled，与只读Core published冲突。C原run已结束failed，报告固定`b971a8e1f6ce48796e00591ae83f6e7726dfdcd8`；五SC均fail/missing，独立browser已关闭、所有锁释放、无第三修复。产品部分合入不改变失败事实。

### 0045 / run-01

- 开始登记：2026-09-16T19:44+09:00；C43原run已结束释放后，唯一Generator管理任务内D支线`/root/d_sprint0045`，GPT-5.6 Sol / medium；独立`.worktrees/sprint-0045-private-note-deletion`、`codex/sprint-0045-private-note-deletion`，产品基线`bbe0060007d1c4b1245ad0db06af944aa46d2aee`，工作树clean；worktree创建中提前status曾显示尚未checkout文件的D状态，创建33237明确exit0后重新检查clean，非用户删除/改动。
- 冻结Planner SHA256 `82f1e09a68e4379c2e2b9c8bf71e401c7aa0cd0030f6f7dc605701771714d6f2`，保留五SC及旧notes原子能力`03bfe4aa5793e4107658cb856d76be641c479340`为只读参考，不能盲合共享store/DB依赖。基线三个App完整notes interaction/list/view-model文件13/13零跳过 exit0，复用现有node_modules symlink不安装。
- 首切片仅独占App `src/screens/notes/NoteDetailScreen.tsx`、`src/view-models/notes.ts`与上述完整直接测试、必要中/日/英四字典；必要新增局部delete helper/test先按原SC01/02登记。实现确认/取消、防重复、失败保正文、版本冲突、精确actor/note/version/scope晚ACK保护；消费真实DELETE形状，不虚构成功回执或离线删除资格。不改Web/server/SQLCipher、共享生成契约、auth/client/hooks、AI/事件/通知/全局台账，不运行设备、服务、DB写或provider。
- 当前MAIN notes主DELETE未接，真正PG sync-write-lock迁移/事务和全域mirror/AI实际删除传播仍缺；UI定向测试不冒SC04/05。独立切片可路径限定commit交接，但在API/迁移验收前不发布未有后端能力的成功声明；原run按checkpoint保留待依赖，不提前成功REPORT。Phone原A独占DA/Phone账号原生只读，D仅独立源码/测试，不改ROOT当前Metro源或抢设备。
- App切片已冻结`446dbd5b791588dd3d137b0379be6f17a9ff7646`（8App路径）；ROOT机械核对并独立完成实际6完整受影响文件33/33零跳过及typecheck exit0。首ROOT命令误给不存在的contact `.tsx`导致只执行5文件29/29，已单独补真实`.test.ts`4/4，不以exit0掩盖漏文件。暂未合入MAIN；SC03/04/05与正确后端原子事务/migration依赖仍未齐，原run保持checkpoint待精确放行。

### 0046 / run-01

- 开始登记：2026-09-16T19:06+09:00；唯一Generator管理任务内E支线`/root/e_sprint0046`，GPT-5.6 Sol / medium；工作树`.worktrees/sprint-0046-repeatable-functional-acceptance`，分支`codex/sprint-0046-repeatable-functional-acceptance`，产品基线`434219a8cf3a188a4c43f31b5d06a72d0af7bfc5`，tracked干净，复用现有依赖symlink，不复制.env。
- 冻结Planner SHA256 `7241cd46081fe55894df4ae5fe543989af000dd6c08dce4f36489fb1f25f2279`。先独占`repos/orbit-app/scripts/verify-simulator-runtime-identity.mjs`、`repos/orbits/scripts/prepare-simulator-acceptance-fixtures.ts`及其直接确定性测试；新增测试路径由E追踪登记SC01/02后实施，脚本默认只读/dry-run，实际样本写入必须明确精确目标和cleanup批准。既有通知失效consumer先只读调查，后续必要产品切片另核与0033/Phone文件锁，不重做活动/AI/笔记产品。
- 基线Web两个完整notification-source/cutover文件3/3；App完整typed-notification-inbox3/3，均exit0。App首次裸tsx命令未带项目render hook导致依赖JSX转换失败，按既有package test入口补hook后通过，非产品修复，不隐藏历史。
- 主机18:46重启后ROOT已恢复mainWeb同426产物PID7578/live200及Metro8082PID7582/running；Phone服务暂未恢复，待A固定PW0010统一编译。E不控制共享服务/设备/浏览器/账号或DB写入，不安装新框架、不provider出站、不重置账本。最终SC04矩阵等待0042～45和0033～36必需接口，缺项只阻对应动作；本地准备不冒充最终原生/离线验收。
- 必要新增测试路径`repos/orbit-app/tests/simulator-runtime-identity.test.mjs`、`repos/orbits/tests/services/simulator-acceptance-fixtures.test.ts`及工具说明`repos/orbit-app/docs/verification/simulator-acceptance-preparation.md`已按SC01/02登记。真实设备无booted/缺loaded-JS与actor实际receipt必须BLOCKED；fixture testadapter验证不能冒真实样本apply成功。
- 五文件工具切片固定`cb62638da83c82e34145f502814e19ed227e60e7`，已合入`f2a25a55c4f1e11f773ac6f29eb4099ad59ce547`；ROOT精确暂存/合并树App7/7、Web5/5 exit0，source/diff检查仅上述新增路径，新增工具未收录图谱不记零风险。identity仅产出evidence-consistent且actualAcceptancePassed=false，真实loaded-JS/actor缺项仍BLOCKED；fixture纯Map/dry-run不冒真实apply/cleanup。最终SC矩阵与真实样本仍依赖0045和0033～36，不创建成功REPORT。
- 同一原run legacy SC03最小修复已经来源/DTO核对后放行：App3个notification VMs删除两处猜任务链接fallback并安全隐藏失效旧正文；Web原provider/live-service/canonical通知GET与新增本域legacy-source-projection/helper测试，仅精确workspace/正式task或schedule wrapper/actor/lifecycle可导航。`inboxNotificationActions` HIGH/3直接caller已披露。不改字典/shared/auth/其他产品域，不用假evidence sentinel顶替业务证据，不跑实际业务API/DB写/设备/服务；局部TDD进行中，不提前声明runtime SC03/整Sprint通过。

2026-09-16主线统一运行时：C43、Phone PW0010单功能（仅`58e4840169625460e06a2d69769e95552878ebb6`，没有整合Phone全部祖先）及E46工具切片已整合并普通push到`f2a25a55c4f1e11f773ac6f29eb4099ad59ce547`，独立ls-remote一致。PW0010主线提交`224fdc1d4`另包含原Phone A对App audit两个existing AI行号键的必要校正；完整offline audit仍仅旧日程孤项失败，没有新增AI findings，不记全量通过。

该产品树Web Next production build exit0，BUILD_ID`EEQm5wm0AApGsD3hvfqSh`，main3000/PID22612/live200、原orbit_events/workspace:orbit-dev；Metro8082/PID7582/running。DA`DA432E9E-1204-4EE7-9A20-251CDB48E265`重新编译、安装、启动主包app.agenthubs.orbit/PID23068均exit0，built与installed executable SHA256一致`a1ef0cdb9e3d8ea9b90528d8485e2232298a99bbd4576b98bb340467604d7623`；Metro实际为该主包加载1985modules，但loaded-JS精确hash/原生HTTP尚未由observer取得，不把expected元数据复制成observed证据。iOS依赖警告保留；`SYNC_INIT_FAILED 44ce35fbe92cb862`未关闭（后缀为scope摘要，不是底层错误码），在线首页成功不等于SQLCipher/全域离线PASS。本地初始化失败与服务端缺sync-write-lock function是独立缺项；不删库/密钥重置/空function绕过。

Phone独立32100/PID17635/BUILD_ID`8sXNW8nifgU1rD0IF79lc`、32110/PID21340及新公共tunnel由Phone协调任务持有；MAIN与Phone同邮箱不能证明密码/数据相同。PW-0010原run已结束：公开Chromium/WebKit390px及主线原生同演示账号真实8候选/原消息/详情返回/历史重开/刷新通过，原request/messages/budget摘要不变；ROOT实际恢复精确127.0.0.1:3000与小雨MAIN Appscope，UI归ROOT。固定Phone文档交付`da3dd71d`只消费[原样REPORT](../../../../docs/phoneweb/sprints/0010-contact-artifact/REPORT.md)，不合Phone祖先/旧台账。通过仅本轮功能，原后端全量失败/跳过与完整Phone覆盖保持开放。共享原账本18entries/$0.038611/0reserved，未重置，本轮构建/只读检查无provider调用；旧运行时记录仅保留历史，不代表当前版本。

0047追加计划仅针对0044实测生产Web历史会话无composer，不克隆整个失败Sprint。当前GOAL/AUDIT-DESIGN/PLANNER已编制，建议空闲B后续单run；Phone PW0010同ask函数展示切片先冻结/移交，本轮C0043与E0046保持两个实现槽，不自动派第三线。0036源版本/笔记实际工具接线仍由既有Sprint承接；0044 failed报告与费用/清理事实保留。

### 2026-09-17：0059／0060 主线实际验收补充

此项更新覆盖上表“原生64805构建中／未安装”的旧运行状态，不改写原始 I 失败或 Sprint blocked 判定。Main 产品5523、报告a69ec50已主合并普通push，独立远端核对一致。原生64805构建和92358覆盖安装均实际exit0，主包连接8082；Main Web3000健康。

ROOT 实际使用小雨账号 `account_orbit_generated` 验证已有笔记／人脉底部窗、`ZT` 首字母匹配与关联 chip；正常 UI 新建一个明确 QA 系列，提前15分钟／每天至9月19日规则及关联经独立v3 GET一致。18日实例“仅本次”取消后独立GET404，17日及19日保留，19日实际日历列表点击详情成功。真实到期提醒仍待验：该账号 typed inbox 实际enabled false、owner local／cutover false，尚未获准启用，不宣称保存等于送达；PG并发及远程Push仍未完成。

Phone 固定消费b3562f4／TREEc6f2、BUILD `VFCyLoF7jSqlaRsqWLuA3` 的真实 actor Chromium／WebKit 私有预览通过列表／拼音／选择取消及规则UI，未保存业务资料或调用provider；ROOT已审核并批准整体owned supervisor公网发布，实际切换结果另行登记。Phone actor不同于Main小雨，不代替同账号跨端证据。Main独立Next `/app/tasks/personal` 仍是旧v2／提醒重复unsupported UI，必须单独跟踪，不能宣称全部Web页面对齐。详见[0060 REPORT追加验收](0060-personal-reminders-recurrence/REPORT.md)。

Phone公网0060随后实际发布成功，监督进程98032／backend98035／frontend98036健康，固定ngrok域名未变，ROOT独立核公网entry SHA匹配。公开Chromium／WebKit真实actor新关联窗／首字母／选择取消／规则UI通过，原业务数据不变、无provider调用；私有324预览已正常关闭、0056回退保留。真实提醒送达和Main独立Next旧v2页面仍是未完成项。

### 2026-09-17：0061 就绪与提醒剩余调查

用户要求“继续完成未完成的”，复用原设计与实施批准。新增[0061目标](0061-next-personal-schedule-v3/GOAL.md)／[中文计划](0061-next-personal-schedule-v3/PLANNER.md)，仅修复确证独立Next `/app/tasks/personal` v2规则／关联UI缺口，既有空闲B、Sol medium、一个run-01，状态ready／run_count=0，待隔离树固定基线与Planner哈希实际登记后启动；不重开0059／0060。ROOT独占真实服务／Simulator／测试对象，A仅有界只读查提醒配置及现有到期入口，不做第二Generator或改通知flag。通知测试账号启用动作按已有明确授权范围核实，其他账号、globalcutover和远程Push保持不变。

0061启动就绪实际确认：B创建独立 `.worktrees/sprint-0061-next-personal-schedule-v3`／`codex/sprint-0061-next-personal-schedule-v3` exit0，HEAD精确 `0d5a57f340863d9596afe6f7637c35dcac68f81e`、工作树clean，Planner SHA256 `8fea9e4493a06e876522a7b4a6a81a8e1f2136e60a7aeaac590561e40a767063`。唯一run-01领取，状态running；Web局部文件锁归B，真实环境归ROOT。ROOT刷新后新增计划提交造成实际Main索引behind1告警，第二次唯一索引刷新期间暂停graph／产品修改，独立源码读取与测试设计继续，不消耗新run或重测试。

A的独立只读调查已结束：精确actor通知入口 `ORBIT_TYPED_INBOX_ACTORS` 可仅启用小雨，但现有inbox GET会刷新该actor全部派生提醒计划／业务通知，无法收窄单QA；不会据此调用全局worker／discovery／cutover migration／Push。ROOT已明确询问该测试账号派生刷新写范围，未收到批准前不执行。原QA今天fireAt09:00已过，不能补发历史或改系统时钟；v3真实有界只读列表GET200确认9/17及9/19两个实例和取消事实保持。

### 2026-09-17：0062 就绪与共享集成窗口登记

ROOT在唯一小雨QA日程真实并发保存时确证事务外关联reader耗尽max2池，两PATCH与随后GET超时，原并发结果不通过。已owned恢复同一生产产物，Main3000新PID7579／管理句柄2001，正式登录后health/QA GET200，原updatedAt、标题、规则及关联完全未变；不在旧产物上再次并发复现。新增[0062目标](0062-personal-schedule-transaction-associations/GOAL.md)／[中文计划](0062-personal-schedule-transaction-associations/PLANNER.md)，基线0d5a57f，Planner SHA256 `b037a213bdafe01667051211f82dc10f034880a32ab0d0ff21900006fe52205f`，状态ready／run_count=0，待既有A隔离树clean核对后领取run-01。只改本域事务与关联接线，独立于B0061页面；不重开closed0060，不改连接池／授权语义／通知配置。

按RULES5.2/8补充0061/0062集成执行登记：不改任何冻结Planner或SC，两线必要定向与各实际源码types通过、官方固定树gate后，可以提交标明“集成待验”的独立功能版本；所有相关产品写者冻结后，ROOT在精确组合源码树只运行一次受影响Web I，该同版本检查同时支持两份SC集成项。原失败/skip/denied保留，真实QA与生产重编重启仍必需；共享I不是completed豁免或新增运行。0061 B最终一行展示修复使原types未覆盖最终树，允许仅相关端最终types必要复核，不是全量重复。

0062实际启动核对：既有A新树创建exit0，HEAD精确0d5a57f、porcelain空、Planner哈希匹配、build证据ignored，唯一run-01领取，状态running。服务upstream HIGH直接4/展开15/0索引flows，涉及factory、提醒目标授权、通知sourceAccess与refresh；已告警，按获准H本域修复和直接消费者验证继续。factory LOW直接3/展开8/0flows，新增symbol仍源码补查，不把0flows当零风险。

### 2026-09-17：0061／0062 最终实际验收与交付

两唯一run-01已结束，工作树clean、产品锁释放。0061 B功能12bb54ad／中文[REPORT](0061-next-personal-schedule-v3/REPORT.md)，0062 A功能021451c5／中文[REPORT](0062-personal-schedule-transaction-associations/REPORT.md)，精确合入Main47f12034并普通push、独立远端同SHA。官方组合gate13files40mapped0flowsLOW。B66/66、A43/43与必要types0；唯一共享Web I3808/3543pass/59fail/206skip actual1，旧59失败名称完全一致，真实PWdenied4／protected0保留，非fullgreen。

新production BUILD L8fbGtRZ_QJku0p8citoB／NextPID15582健康200，旧7579已owned退出；当前管理句柄51509。主包DA设备安装成功且Api3000／主8082。原QA真实PG并发200+409及exact receipt重试、恢复原字段；Web15→30→原生读30／保存15→Web读15完成。另实际UI自建QA仅本次删除20日404、21日200，规则null清除及详情／独立GET吻合，最后只软删除自建QA404。201被helper错期待200的原失败、旧CAStimeout和其他失败如实保留，未重复创建或重全量。

0061/0062功能SC实际验收通过，正式中文报告／台账随本次ROOT正常文档提交并push闭环；准确最终交付SHA由实际Git／ROOT检查点登记，不预填未来成功。0060真正到期通知SC60-04仍未满足；actorwide派生刷新批准尚未到、远程Push／全域离线不通过。Phone公网已0060且固定入口健康，独立actor证据不等同Main同账号。最新[Bridge运行时交接](../../../../bridge/2026-09-17-personal-schedule-v3-runtime.md)。

下一项0063月历／小时分钟选择器设计已明确获准，Phone父任务中文Planner冻结SHA89822f57996134f77a4ea6ba64bc96708c7d05451f4ccd83d4a31c45c495176c；原B结束后由ROOT释放最新Main基线，唯一Sol medium Generator接续，不复开0061或0062。

### 0063 / run-01（2026-09-17）

用户已在Phone父任务明确批准日期／时间点选设计，ROOT已完整阅读并复用该批准。中文[GOAL](0063-date-time-picker/GOAL.md)／[DESIGN](0063-date-time-picker/DESIGN.md)／[PLANNER](0063-date-time-picker/PLANNER.md)逐字同步冻结稿；Planner SHA89822f57996134f77a4ea6ba64bc96708c7d05451f4ccd83d4a31c45c495176c不变。唯一Generator既有B任务01a0a879-e8fe-77e3-b748-bd78005aecc8、phoneweb-0063-date-time-picker标签、GPT-5.6 Sol / medium；新worktree .worktrees/sprint-0063-date-time-picker／branch codex/sprint-0063-date-time-picker实际创建exit0，HEAD/BASE b16b49d87a27415bd561df61b11cecd7df46ed3f、初始clean、证据ignored。状态running、唯一run01，不复开已结束0061/0062。

ROOT唯一索引44084实际exit0/234.7s，disk lastCommit精确b16、indexedAt01:03:41.094Z／402977nodes580660edges300flows后，已正式放行B逐symbolimpact／TDD。App TimeBlock/Rules/必要Screen/editor、本域新PersonalScheduleDateTimePicker/picker纯model、四locale/必要直接tests；Next workspace/rules/editor-model/本域picker组件与纯model、直接tests独占归B；其新组件/model/tests精确manifest已ROOT核读本run checkpoint并登记。既有六图只迁当前输出新63ignored目录，不覆盖旧证据。Backend/shared契约/全局time/auth/offline/通知排除，真实DB/小雨actor/DA/服务生命周期/账本/index/生产构建归ROOT，Phone父负责源冻结后精确消费/preview/public窗口，无第二Generator/Reviewer/Evaluator。ROOT该启动文档自有dirty待最终提交，不再制造Main HEAD索引过期循环。

ROOT实际集成追加：功能649994fe713fa88662db5dbd11ec8c6e6b9490eb/TREEf099ba7293c3fb0502e65af2bbd587b13a20eb86，官方22文件70mapped/0flows/LOW（保AppDraft8直接调用HIGH及新UNKNOWN）。最终完整App119/119、Web71/71、各types0，完整原RED/fullfail与两次限定布局修复保留。精确noff合chat-agent26f74a55c7f9458788bf59625a8a6dede6892756，普通push21614实际0且独立远端同SHA；正式中文报告/台账文档收口仍待，状态尚running。

唯一Main I两端结束非绿：Web3826tests/3561pass/59旧fail/206skip/实际PWdenied4；App3273tests/3272pass/唯一旧58-route视觉fail/0skip/guards0。完整NAME无新增；14此前局部fixture修复未再失败不归功选择器。新I六图在ROOT独立目录，六B旧图已恢复原SHA/regularfile，不混为真实账号验证。原baseline失败保留给0041，不重I求绿。

新Main production build0/BUILD taZi5Ng0EztLjlmYGnGbA/Next36058健康3000；原生新编译安装启动0/Orbit37204实际TCP连主Metro69917/8082。同小雨原QA真实Web picker15→37保存09:37/10:07、原生读37→原生picker15保存09:15/09:45→Web95738正式独立GET及实际picker15回读0。原30分钟、rem15/daily19/笔记人脉不变，18取消GET404。原生calendar选20取消仍17、清结束仅草稿并确认放弃回详情已实测；不冒称清结束持久化或真实纽约DST证据。DST/闰日/跨年/全天/until等边界由完整模型及直接组件测试覆盖。

Phone精确15路径consumer6d1c771aee07f9a704863f11c3548354aea0b4d5/TREE6ed9ac4341077856db4eb1269d28ffd2374f0016，保Phone字典/script/私有政策；37/37及两端types0、串行build/export0，privatepreview healthy32400/32410。真实Chromium/WebKit各一次新建精确37分钟/默认30分钟/正式前后端独立GET及重开成功，两个returned-ID仅各精确删除200→404/listabsence，原记录偏好ledger493f保持；ROOT完整读取receipt6543a4f9及目检实际图。首helper外层dialog strictmode fail/0业务写、修namedinner selector1后实际成功，原失败保留，无产品/guard变动。ROOT已批准该固定artifact PUBLIC切换；实际公网/回退证据仍待，不能提前写发布完成。

公网终验已解除前述待验：22582最后第三次正常owned切换actual0，新PUBLIC43205/backend43206/frontend43207健康零重启，固定BUILD IemxmhFeX5ZE1DvJDjF5x/servedentry rawSHA05b38715858bc27be6e6cf2b3c843288300c55a74bca034ab016c2ad97f4c200与私有冻结一致。52919 PUBLIC Chromium/WebKit真实正常VisitSite/登录/原对象读取/日历选择取消/精确37分确认及默认10:07草稿actual0，原对象偏好ledger493f保持，公共authPOST2/modelEvents0/business0，各2inboxGETexcluded不验收，each15实际ngrok静态GET单列不是全链无外呼。ROOT完整读取publication83204c49及public2browser2c47d04a、独立SHA与实际图目检确认。

保留首公共helper两次auth前失败/0业务写和两次真实normalrollback0060健康/原entryaed12恢复。最终repair2只exact18静态GET闭包+首次VisitSite/login readiness，源码依赖及匿名firstdoc42007实际0后最后切换，API/provider/budgetguard未变，无第三repair/第四release。完整旧0060源/产物/launcher保留；当前回退脚本仅准备不伪称已执行。成功后ownedprivatepreview37928/37/38正常退出，32400/10无listener，PUBLIC与既有ngrok保留。中文最终REPORT/正式8文档gate/提交和最终远端核对正在ROOT收口，完成后才能登记本run交付，不能因此抹59旧Webfail/1旧Appfail、到期通知/全域离线缺项。

0063最终中文[REPORT](0063-date-time-picker/REPORT.md)已按Generator冻结稿原字节落地（SHA256 3de0ccf170dee42c10486324a29f2764ba9631cdbea0dcd6c2154e3f9e8deeaa）。唯一Generator run-01已结束并释放源码锁，SC63-01至05的产品、主线运行及Phone真实交互证据见该报告；ROOT仅以这8份正式文档的官方gate、普通提交/push和独立远端一致闭环登记交付，实际最终SHA记录在Git及ROOT检查点，不预填未来成功。上述早期running/待验条目保留为时间顺序记录，不再重开0063或重复全量I；本轮Web旧59失败/App旧1失败、真正到期通知、远程Push及全域离线仍不是通过。

后续执行：0033原A工作树已正常ff到产品Main26f74a55，继续原run的Task3本地schema/repository迁移，不创建第二Generator。采用单一v2 canonical真实事务迁移、已授权ReadScope/domain注入、未验证legacy隔离及初始化失败保库；Node fixture不替代原生SQLCipher/磁盘故障实测。新增server授权/epoch/锁顺序设计另设中文审阅门，Calendar等外部OAuth adapter继续TODO，不阻塞独立本地Task3。
