# Sprint R14 — 推送与通知设置

**Plan revision:** 2（2026-10-18；RD-33 主会话代定已确认）。**模式:** existing-codebase / single-generator；执行者为 Claude 子任务，B 线 `redesign-b` / `line-b`，接 R13 后。

**单一目标:** 接通 R18a 留给 R14 的两端通知静态路由，完成 D-17 静音、全局日上限、7:50 合并推送、面談例外、秘書设置与安全落地；复用注册及投递基础设施。

**易读目标:** [GOAL.md](GOAL.md)。**代码事实基线:** `origin/redesign` `cb866e48f`（2026-10-18 `git fetch origin redesign` 后；下文 `file:line` 均按此 revision 的 `git show origin/redesign:<path>` 核查）。本工作树 HEAD 仍为 `e464b1877`，执行时更新 B 线并核对。
**进入条件:** R13 的受信箱／秘書来源与 R18a 的设置入口已经交付到 B 线可读取的版本；R31a / R31b 合入后才收像素。未交付时只做独立的频控、契约及画板准备，不假定上游已经存在。**本计划没有授权生产操作。**

---

## 0. 给 Claude 子任务的执行说明

1. **目录与沟通。** 只在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-b`（`line-b`）执行；先 `git fetch origin redesign`、`git pull --rebase origin redesign`，核对 R13 / R18a / R31a / R31b 的实际交付与本线干净状态。你一次只做一个子任务；每轮最后回复主会话：完成 SC、按路径提交号、测试摘要（通过／失败数与失败名）、未过画面、请求／代定／待用户授权和下一步。产品与缺画板问题写 REPORT「待主会话代定」，继续不依赖的任务，不问用户。
2. **阅读顺序。** 本页、GOAL；[`../README.md`](../README.md) RD-16、RD-24～RD-33 与通用规则 10–13；[`../HOW-TO-START-A-FEATURE-SPRINT.md`](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–§10；[`../HANDOFF-TO-FEATURE-SPRINTS.md`](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用 G01–G26 及 §R13/R14；[`../DEFERRED-A.md`](../DEFERRED-A.md) §2、§4；[`../screen-ownership.md`](../screen-ownership.md) 收件箱／账户行；[`../maintenance/2026-10-12-decisions.md`](../maintenance/2026-10-12-decisions.md) D32、§20；[`../../IMPLEMENTATION-PLAN.md`](../../IMPLEMENTATION-PLAN.md) §1.8、D-15～D-17、附录 D；R13 与 R18a 的 REPORT / PLANNER；两端 `AGENTS.md` 和 `repos/orbits/scripts/visual/README-redesign.md`。
3. **本线环境。** 沿 B 线的 Web `:3300`、`ORBIT_NEXT_DIST_DIR=.next-line-b`、Metro `:8083`、本机库 `orbit_line_b`、`Orbit Line B` 模拟器 UDID。设计稿静态服务另取 **3350+ 的未占用端口**（每会话不同），先 `uv venv`，激活后跑 `python -m http.server <端口> -d docs/designs`，在 `repos/orbits` 用 `compare-redesign.mjs --list --design ... --design-base http://localhost:<端口>/redesign-2026-10/`；用完停服。任何 Python 只用 uv 环境与 `uv run` 或已激活环境。证据放 `~/orbit-sprint-evidence/redesign/R14/run-01/`。不连 Neon、生产库、真实 Google 账号，不迁生产、不部署、不发 TestFlight。
4. **提交与共用文件。** TDD 先 RED；每个可独立验收的 SC 通过后按路径提交：`git commit -m "<type>(R14): …" -- <本线文件…>`；提交前 `git pull --rebase origin redesign`，提交后查 `git show --stat HEAD`。不 `git add -A`、不推送、不开 PR。共享契约从 `repos/orbits/shared/**` 改，运行 `node scripts/contract-snapshot.mjs --write` 与 App `npm run sync:contract`，源和副本同一 `contract:` 提交；`.snapshot.json` 冲突时重新生成。RD-32 已取消 GitNexus 门禁，影响面靠代码及测试核对。
5. **停在具体依赖。** R13 未交的来源、R18a 未交的静态路由前置、主会话未改的矛盾画板、R31a/b 未交的组件，各只阻塞相应 SC；其他 SC 继续。需要动 A 线组件／token、D 线导航壳、C 线设置容器或他线正在改的文件，写 REPORT「请求」并给出最小接口，不越线。单画面修 3 轮仍不过写「未过」。**本 Sprint 预期零新 AI 调用；本机任何付费 AI 真调用前，先设不可自行提高的调用／费用硬配额及超额失败降级，再逐次记用途、次数、token 与费用，交主会话复核。**
6. **REPORT 与交接。** REPORT 逐条列 §3 的接手结果、SC 证据、原稿／改稿画板、代定落实、全量对比、越线自查、未过、生产未做、外部请求。README、HANDOFF、DEFERRED-A、决定表、screen-ownership 由主会话维护；B 线不改这些台账，把四栏交接原文及「待用户授权」条目放 REPORT。主会话独立复核后才推 `redesign`。

## 1. 本线归属的文件 / 不许碰的文件（RD-31）

**本线可新建或修改（仅 R14 所需的最小范围）：**

- **App 页面与推送:** 新建 `repos/orbit-app/app/settings/notifications.tsx`、`app/settings/notifications/secretary.tsx` 和 `src/screens/settings/notifications/**`；从 `src/screens/settings/{NotificationDeliverySettings,NotificationDiscoverySettings}.tsx` 复用 API／CAS 行为，旧 Pressable / Text 界面必须改为 R31a 新组件，确认外部引用后才删旧 UI；`src/notifications/{notification-model,delivery-navigation,NotificationLifecycle}.ts[x]` 只改落地或复用所必需的分支，注册／注销机制不重写；对应测试与新 `src/i18n/{ja,zh,en}/notifications.ts`。新路由及字典域的审计／登记文件只追加本线行。
- **Web 页面:** 新建 `repos/orbits/app/(app)/app/settings/notifications/**`（静态 `page.tsx`、页面私有组件／CSS）及 `app/(app)/app/orbit-2026/copy/notifications.ts`；现有 `settings/notification-{delivery,discovery}-settings.tsx` 只复用 API／CAS 行为，旧 `<input>`／`<label>` 界面不直接搬进新页，控件用 R31b 新组件。R13 的 inbox 页在 R13 交付并冻结后，只接「⚙ → 通知／秘書设置」链接，不整屏重写。
- **服务端投递:** `repos/orbits/features/notifications/{delivery-policy,delivery-policy-repository,typed-delivery-worker,typed-delivery-source,typed-delivery-factory,delivery-pass,delivery-service,reminder-plan-service,push-adapter}.ts` 中确需的函数（先证明哪些旧投递入口仍可运行，避免双轨配额）；`app/api/inbox/delivery/preferences/{handler,route}.ts`；设备服务只复用。邀请双方通知只动 `features/invite-codes/{notification,configured}.ts` 的相关分支及测试，保留原导出与幂等键。
- **契约／fixture:** `repos/orbits/shared/contract/notification-delivery-policy.ts`、对应 `shared/api-schema/*`、`shared/mock/demo-world/fixtures.ts` 与 App 同步副本；只加不改，优先使用现有字段。若 R13 的通知 DTO 确需新增同步字段，先核对 `features/sync/domain-registry.ts` 的 `INBOX_DEVICE_FIELDS`、App schema 和离线副本，再在同一 SC 更新白名单／版本与往返测试；**优先用现有字段与客户端派生分组，避免新增同步字段**。
- **门禁与证据:** 新建 `repos/orbits/scripts/visual/views/{web,app}-R14.json`、`attribution-redesign-R14.json`，本目录 `preflight-checklist.md` / `REPORT.md` 属执行产物；旧用法允许清单只删除本线已替换的行。

**不许碰（只可引用或写请求）：**

- **A 线:** App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、共用视觉脚本／对比归因规则。缺组件或 token 列请求给 A，不能在页面里手写近似件。
- **D 线:** App `src/components/{ShellTopBar,ShellBackground,OrbitTabBar,TabPageBar}.tsx`、`src/view-models/{app-navigation,shell-state}.ts`；Web `orbit-2026/shell/**`、`shell-routes.ts`。若设置高亮或返回目标需壳改，交 D 线；现有 `parentForPath(settings/*)` 应先验证。
- **C 线 R18a:** App `app/settings/[section].tsx`、`src/screens/settings/SettingsScreen.tsx`、`app/settings.tsx`；Web `app/(app)/app/settings/{page.tsx,[section]/page.tsx}` 与 `orbit-2026/account/**`；`src/i18n/*/settings.ts`。R14 只建静态子路由。不要删除 C 线仍引用的旧设置组件。
- **R13 / 其他:** 未冻结前的 `src/screens/inbox/**`、Web `app/(app)/app/inbox/**`、秘書来源生产者与 `features/contacts/**`；R20 Task／日历、R10 首页、R19 小组件、E 线 iOrbit、甲的加人 UI、R15 以外的邀请文件。R13 交付后若需 inbox 一行设置入口，先核对它的最新文件和测试，写交接。
- **主会话台账／画板:** README、HANDOFF、DEFERRED-A、决定表、screen-ownership 和 b5 / b11 画板不由本子任务并行改。§2 列出的矛盾由主会话改稿并留注释，B 线按新板验收。

## 2. 主会话代定（RD-33，已确认）

| # | 代定与依据 | 执行及画板后果 |
| --- | --- | --- |
| §B-14-1 | **全局推送日上限默认 3，可选 1／2／3。** D-17 与契约 7 的 `dailyCap?:1\|2\|3` 优先于较旧 b5 #13/#29 的「3／5／上限なし」；较新 b11 #32 的「固定」解释为「秘書没有独立上限」，显示当前全局值。用户消息与 automatic 等全部仍启用的推送来源共用账号级计数。 | 主会话把 b5 三档改成 1／2／3、b11 文案改成随当前值变化；未经改稿的两板不能拿旧选项进门禁。所有实际系统推送按用户时区同一天共享配额，超额只在受信箱可读。 |
| §B-14-2 | **静音候选持有到汇总投递。** 默认静音 22:00–07:30；静音期间产生的候选不在静音结束时逐条放行，而是持有并合为一通。静音结束早于 7:50 时在 7:50 发，结束晚于 7:50 时在结束时发；静音结束到 7:50 之间的新候选也等待合并，特别覆盖 07:30–07:50。时段用用户 profile 的 IANA 时区；`quietStart === quietEnd` 拒绝，跨午夜按当地墙钟处理，DST 跳变用现有时区函数验证。 | b5 #13/#29 的时间控件真实可改；R13 分组「7:50 にまとめて」只作默认值文案，自定义较晚结束时间显示实际投递时间。持有期间用户改静音、频道、来源开关或上限后，按最新 revision、来源状态及当日配额重判，不能沿旧 `availableAt` 直接发。`delivery-policy.ts:30-35` 当前到静音结束即可发，R14 必须修改并加测试。 |
| §B-14-3 | **合并的是推送投递，不是收件箱实体。** 对静音期间仍有效、未读、未撤回的候选按 actor × 本地日建一个稳定批次，只发一通；每台已注册设备可收到该通，但账号配额只占一通。`digest` 是投递种类／批次，不能直接给 `InboxNotificationKind` 加枚举。 | 原通知仍能在 R13 受信箱按日分组逐条操作；digest 的锁屏正文走 `lockScreenContent`，默认不泄露人名／主题；推送 data 只有 `deliveryId`。旧 defer 候选不得随后逐条补发；worker 重试与未知回执沿原 ledger 的安全规则。 |
| §B-14-4 | **面談 30 分前可越过静音，不能越过用户日上限。** 只对可验证的预约提醒生效；用户关闭开关或活动取消立即失效。 | 无真实面談来源时不造一条示例生产推送；用本机替身验收。 |
| §B-14-5 | **隐藏邮件摘要入口与示例。** D-16 已建议不做 restricted Gmail scope；b11 #32 的「Gmail 連携中」与开启开关、锁屏 #31 的邮件摘要示例都不进入本期产品。偏好缺省 `secretaryMail=false`、`secretaryDeadline=true`、`secretaryPick=true`；后两项只有 R13 真实来源可用时才显示可操作。 | 主会话从 b11 #32 / #31、b5 相关画板移除邮件摘要入口、开关和示例，汇总示例换成已实现来源；不放可开启的「準備中」开关。App／Web／fixture／文案也不露出邮件摘要；D-16 / scope / 生产授权留 DEFERRED。 |
| §B-14-6 | **锁屏当前只支持 `private` / `full` 两档，默认 `private`。** b5 #13 三档（すべて／名前を隠す／件名のみ）不能逐一映射到现有契约；推荐改成「内容を隠す／内容を表示」两档。 | 主会话先修板；R14 不伪造第三档。通知标题／正文从服务端按选项生成，设备 payload 不含原始私人对象。 |
| §B-14-7 | **通知页先明确一列推送偏好，受信箱保持可读。** b5 #29 的「プッシュ／受信箱」双开关、App 类别（人脈更新／主催通知／履歴）与当前仅按 `message/reminder/suggestion/update` 频道启用的模型不一一对应。推荐主会话把无法独立控制的行改为说明或只读状态；已有 `NotificationDiscoverySettings` 另作为「自動で見つける」块接回，不能冒充主催／人脈源开关。 | 不以客户端隐藏收件箱记录伪装「受信箱关」；若主会话最终要求逐来源／双列开关，先补明确契约、源映射、同步白名单与测试再开画面，不在旧板下假通过。Web「ブラウザ通知」目前无客户端注册实现，主会话改为「準備中」不可操作或从板上移除。 |
| §B-14-8 | **邀请双方各生成一条本人可读通知。** 保留 `sourceKind='contact'`、`kind='update'`、连接 id 幂等；邀请人与受邀人分别用自己的联系人 id／授权校验。推送由同一 worker 产生，不从 R15 handler 直接发送。 | 原只通知邀请人的行为改为双方；同一连接重试不重复，收件箱关闭推送时记录仍保留。 |
| §B-14-9 | **页面定位。** App `/settings/notifications` 是 R18a 入口的静态路由；App `/settings/notifications/secretary` 从 R13 秘書设置入口进入；Web 只在 `/app/settings/notifications` 实现已有画板。未有 Web 秘書专页画板，Web 可在通知页展示真实的可用来源状态，不新建伪像素页。 | R18a 动态「準備中」仍保留给其他设置段；新的静态路由优先测试。没有画板的 Web 秘書状态附截图，不进门禁。 |
| §B-14-10 | **生产边界。** 本机可用注入式 push provider 测试真实调度；生产 worker 开关、迁移、凭据、部署、APNs／Expo 真机收件与 D-16 restricted scope 均标「待用户授权」。 | REPORT 给主会话 DEFERRED 四栏条目；不能把替身测试表述为真机送达。 |
| §B-14-11 | **配额只认一个账号级权威计数器。** `typed-delivery-worker`、旧 `delivery-service`／`reminder-plan-service` 和活动维护任务都需盘点；任何仍启用的发送路径必须同用 D-17 配额预留，或在已验证的 cutover 后停止旧发送，不靠两个各自的「3」。活动维护任务的 dailyCap 只应限制**推送**，不能因此不写站内通知。 | B 线修自己投递路径；`features/events/journey/**` 归事件线，给负责人／R13 一条明确请求：移除站内生成阶段的 2 件截断并接统一推送配额。该请求未落地前，不宣称「超额只进受信箱」覆盖活动通知。 |

以上代定已由主会话确认；**主会话改稿／补画落地前，受影响像素 SC 标「待画板」，不能写 PASS**。不在本 Sprint 私自修改原画板。

## 3. 交接表逐条映射（开工和 REPORT 均逐条核对）

| 条目 | 本 Sprint 的 SC 或明确转出 |
| --- | --- |
| G01 | SC-09：Web 设置页用 `ShellPage`；旧 R13 受信箱壳归 R13，R14 不改。 |
| G02 | SC-08～10：设计稿说明文字按 RD-05 的 `ink-3` 例外，其余文本查对比度。 |
| G03 | SC-08～10：错误／危险态用既定 `coralText`。 |
| G04 | SC-08 / 10：App 按钮可见 40、触控 ≥44，调用 R31a 组件。 |
| G05 | SC-08～10、15：逐像素与归因；设计稿无的状态不计通过。 |
| G06 | SC-01 / 08～10 / 16：先样式数字后像素、三轮上限、主会话独立复核。 |
| G07 | SC-01 / 08～10：使用 `--list` 的 b5 / b11 编号；作废／备选板不验收。 |
| G08 | SC-08～10：只读演示世界截图，无真实付费 AI 或生产写库。 |
| G09 | SC-08～10：示例数据的文字差异只归 `[data]`，不用它豁免结构缺块。 |
| G10 | SC-09：Web 壳插槽用已有 API，不改壳。 |
| G11 | SC-09：Web 390 标「设计稿无」，仍保留壳标题，不自行设 `phoneFold`。 |
| G12 | SC-09：390 无额外 🔍／⌘K；本页没有搜索入口。 |
| G13 | SC-09 / 15：旧全局样式不漏进设置页，弹层叠层及窄屏底部 inset 验证。 |
| G14 | SC-11：通知设置是登录页，保留登录守卫；不把公开目标放到 `/app/**` 下面。 |
| G15 | SC-07 / 11：App 一级壳不碰；新二级路由返回設定，壳改交 D 线。 |
| G16 | SC-08 / 10：AppScreen 自带正确底栏转场，不直接画 `OrbitTabBar`。 |
| G17 | SC-08 / 10：新 App 屏一律 `AppScreen inset="kit"`，用壳背景／顶栏和 R31a 新控件。 |
| G18 | SC-08～12：live 503 / `NOT_IMPLEMENTED` 时显示明确空态或隐藏不可用块；fixture 标 sample，能力上线再登记。 |
| G19 | SC-02 / 06 / 12：启用字段／枚举前核对 App 宽进读取与逐条跳过；当前契约字段已在 origin。 |
| G20 | SC-11 / 15：旧屏重写后只减允许清单，外部引用未归零的组件不删。 |
| G21 | SC-09：Web 新页 `Orbit2026Scope` + `ToastProvider`，CSS token，弹层用 kit，减少动效。 |
| G22 | SC-09：Web `orbit-lang`，不拼 `?lang=`。 |
| G23 | SC-08～10：组件缺口请求 A 线；不改组件库。 |
| G23b | SC-08～10：Chip / Button 等以 R31a/b 新参数为准，不加页面私有近似样式。 |
| G24 | SC-08 / 10：App 日文文字用 `UiText`。 |
| G25 | SC-08～10 / 16：`--style-diff`／单板抽取、只看失败摘要、每板最多三轮、按路径提交。 |
| G26 | SC-01 / 08～10：先查 token；缺口请求 A，不能手抄近似值。 |
| R13-01 / 02 / 03 / 05 | **转 R13。** R14 只读其已交的受信箱、秘書来源与入口；SC-12 验证可用性和 API 兼容，不接管 R13 的旧 `chat` 页面或整屏像素。 |
| R13-04 | **R14 实施推送深链，R13 验受信箱内部落点。** SC-07 修改 `/task?seg=` 白名单并验系统通知点击落 To-do；R13 的 SC-R13-10 验受信箱详情到 To-do，不将推送深链实现退回 R13。 |
| R14-01 | SC-07：`notification-model.ts` 加联系人及扫描合法深链，负例防路径穿越／外链。 |
| R14-02 | SC-06：邀请双方站内通知及推送候选，沿用 `contact` / `source`，幂等。 |
| R14-03 | SC-02 / 12：契约 7 字段从 fixture 走到持久层、App 宽进读取及投递；不能只改 fixture。 |

## 4. 已查清的代码事实（逐条按 `origin/redesign` 核实；执行时复核新 HEAD）

1. 契约 7 的可选 `quietStart`、`quietEnd`、`dailyCap:1|2|3`、`secretaryMail/Deadline/Pick`、`meetingException` **已经存在**，不是 R14 再定义新名字；`repos/orbits/shared/contract/notification-delivery-policy.ts:12-19,30-37`。服务端输入 schema 是 `.strict()`，响应 schema 宽进并对坏时段／未知 cap 降级为 unset；`repos/orbits/shared/api-schema/notification-delivery-policy.ts:5-10`。App 同步 schema 也是宽进；`repos/orbit-app/src/api/schema/notification-delivery-policy.ts:5-10`。HANDOFF R14-03「App strict」是旧事实，仍需回归测试而非盲改。
2. `defaultDeliveryPreferences()` 尚未给新增字段默认值；`evaluateDeliveryPolicy()` 仍在 22:00–08:00 defer 到 08:00，到静音结束即可发，尚无 07:50 持有与合并；`repos/orbits/features/notifications/delivery-policy.ts:2-3,24-35`。`deliveryQuotaUsage()` 只计算自动与建议数；同文件 `:37-42`。
3. `createDeliveryPolicyRepository()` 有按 actor 的事务锁和 revision CAS，但 legacy `notificationPreferences.quietHours` 镜像仍固定 22:00–08:00；`reserve()` 在 `if(value.automatic&&!reservation)` 下才预留并检查配额，用户消息未计入，且当前限制仍是自动 2／建议 1；`repos/orbits/features/notifications/delivery-policy-repository.ts:66-85,90-104`，关键分支在 `:97`。改默认与配额必须同时改两个读取路径，不能只改 UI 文案。
4. 现有 GET／PUT 偏好接口已鉴权、请求严出、409 冲突和 503；`repos/orbits/app/api/inbox/delivery/preferences/handler.ts:9-17`。App 旧控件持 revision 写入并在失败时重读，但文案仍写「2件」「22:00–08:00」；`repos/orbit-app/src/screens/settings/NotificationDeliverySettings.tsx:11-21`。Web 旧控件也用相同 API；`repos/orbits/app/(app)/app/settings/notification-delivery-settings.tsx:8-14`。
5. 现有 typed worker 的顺序是读源 → 评估静音 → reserve → 再读源／偏好／设备 → provider → 回执结算，能复用幂等与重试骨架；`repos/orbits/features/notifications/typed-delivery-worker.ts:18-45`。`delivery-pass.ts:93-108` 按已选择推送的 actor 枚举并运行这个 worker；`typed-delivery-factory.ts:12-32` 从受信箱物化投递候选。
6. `NotificationDelivery` 当前只有 `push|in_app` channel、没有 digest 种类；公开 view 的 data 只应有 `deliveryId`；`repos/orbits/features/notifications/delivery-service.ts:19-72`。来源解析会重新验证通知仍可用、未读、在 cutover 后，且提供受信箱详情 href；`repos/orbits/features/notifications/typed-delivery-source.ts:17-35`。digest 应在这里复用安全边界，不能拼未鉴权的源内容到 payload。
7. App 生命周期在用户 opt-in、系统权限允许后复用持久设备 token 注册；失败等待下次前台重试；`repos/orbit-app/src/notifications/NotificationLifecycle.tsx:70-124`。本机 opt-in 存 SecureStore，注销会撤销设备；`repos/orbit-app/src/notifications/push-device-session.ts:12-16,52-81`。
8. 本地通知白名单目前只有 `/tasks/:id`、`/schedule/events/:id`、`/inbox...`；Task `seg` 已限于 calendar/todo/plan/memo 且过滤 query；`repos/orbit-app/src/notifications/notification-model.ts:29-50,53-85`。远程推送先到 `/inbox?deliveryId`；`NotificationLifecycle.tsx:62-68`，收件箱再校验 delivery 的 actor/target；`src/screens/inbox/RelationshipInboxScreen.tsx:427-446`。不能把服务端推送 data 直接变成任意路由。
9. 邀请成功的通知函数目前 `actorId=input.inviterActorId`，只给邀请人，目标指向邀请人联系人详情；`repos/orbits/features/invite-codes/notification.ts:21-36`。配置器查邀请人联系人后仅写这一条；`features/invite-codes/configured.ts:121-135`。R14-02 尚未完成。
10. R18a 计划明确把 App／Web 的 `notifications` 留成动态「準備中」，由 R14 静态路由接管；`docs/designs/redesign-2026-10/sprints/R18a-account-mypage-settings/PLANNER.md:82`。但当前 origin 仍只有 App `app/settings.tsx` 和 Web `settings/page.tsx` 的旧设置（App `SettingsScreen.tsx:1-2,103-139`，Web `settings/page.tsx:8-29`），没有两端 `notifications` 静态路由；R13／R18a 交付必须作为开工差异复核，不把计划写成已实现。
11. `agentPreferences.quietHours` 是另一套来源，默认 22:00–08:00；`repos/orbits/features/agent/preferences.ts:5-16,37-45`。R14 的推送静音以契约 7 为唯一编辑入口；需要 agent 规则读取新时间时通过只读适配而非双写两个互相冲突的用户设置。
12. 演示世界偏好已填字段，但仍为 22:00–08:00、`dailyCap:2`、`secretaryMail:true`；`repos/orbits/shared/mock/demo-world/fixtures.ts:270-289`。必须与 §2 和 R13 可用来源同改，样本不代表生产能力。
13. 秘書的 `event_deadline/event_prep/event_pick/mail_summary` 来源枚举已预留，App 通知列表逐条宽进读取、未知项跳过且保留服务端 unreadCount；`repos/orbits/shared/contract/inbox-notifications.ts:1-9`、`repos/orbit-app/src/api/inbox-notifications.ts:5-25`。这些字段的存在不证明 R13 生产者已交。
14. 离线受信箱只同步 `INBOX_DEVICE_FIELDS` 白名单（不含新字段），`repos/orbits/features/sync/domain-registry.ts:288-308`；App 离线页面从同步副本读取。给受信箱 DTO 加字段却不改白名单会在离线丢失，反向写入还须查对应 outbox；R14 推荐不新增受信箱字段。
15. b5 #13 旧三档上限／锁屏三档及 b5 #29 Web 浏览器通知可操作，与 D-17／现有契约冲突；`docs/designs/redesign-2026-10/b5-me-inbox.html:1109-1114,1224-1225`。b11 #32 邮件摘要默认开、全局上限标固定、7:50 汇总；`b11-nav-v3.html:1366-1372`，但 D-16 建议首期不做，故需 §2 的代定及画板改稿。
16. 另有旧 `delivery-service.ts:978-1025` 的独立静音／`dailyPushLimit` 判定，`reminder-plan-service.ts:320-326` 可直接调用 provider；`push-adapter.ts:122-125` 的预事件默认时段仍为 22:00–08:00。活动 `features/events/journey/notification-job.ts:1-5,53-59` 在**写受信箱前**用未接真实读数的 dailyCap（缺省 2）截断；`features/events/journey/notifications.ts:54-64`。这些路径必须先确认是否在执行，再保证统一配额与受信箱不漏记录；不能只把 typed worker 改到 3 就报告 D-17 完成。

## 5. 契约、状态机与跨线接口

- **契约 7:** `GET /api/inbox/delivery/preferences` 返回所有当前有效值；旧记录缺字段时读出默认 `quietStart="22:00"`、`quietEnd="07:30"`、`dailyCap=3`、`meetingException=true`、`secretaryMail=false`、`secretaryDeadline=true`、`secretaryPick=true`；后两项仅在 R13 真实来源可用时生效。PUT/POST 仍携 `expectedRevision`，只接受合法 HH:mm、1–3 与布尔值，拒绝相同时段，409 后刷新读回。写入必须保留未知旧字段，响应宽进／请求严出；快照、App 副本、fixture 及兼容用例同一提交。登录身份切换后旧异步响应不能覆盖新账号的设置。
- **频控状态:** 有效受信箱实体 → 按当前偏好与来源判定 → 静音期间产生的候选持有；静音结束早于 7:50 则持有到 7:50，晚于则持有到结束，结束到 7:50 之间的新候选也入批 → 到时按 actor × 本地日合成一通 digest → 按最新偏好 revision、来源状态与配额重判 → 在同一配额／幂等事务中 reserve → provider → receipt。面談例外仍按 §B-14-4 单独判定。日上限对用户消息、business、automation、预约型面談及 digest 共用一份账号级预留；移除 `reserve()` 的 automatic-only 计数门槛，并在既有幂等预留上避免重复占额。同一账号多设备只计 1 通。provider outcome unknown 不重发；明确拒收按现有安全重试；禁用推送或已读后不发送、受信箱仍在。开工盘点所有 provider 入口并做 cutover／统一预留；旧入口仍活跃时不得有独立日上限绕过本配额。
- **显示与离线:** App／Web 设置用在线 GET/PUT（没有可靠的离线偏好 outbox 时禁用保存并提示重试，不假装离线成功）；受信箱的逐项记录及按日分组沿 R13 数据读，digest 不新建一个可读的 `InboxNotificationKind`。若最终新增 DTO 字段，要同时更新 strict 写 schema、宽进读 schema、`INBOX_DEVICE_FIELDS`、App 副本、同步版本／测试和任何离线 outbox 白名单；缺一项不启用。
- **秘書来源:** R13 提供 `event_deadline/event_prep/event_pick`；R14 的开关只影响对应推送候选，不阻断站内生成。`secretaryMail` 本期保持 false，邮件摘要入口、开关、推送示例和 fixture 全部隐藏。R10 首页与 R19 小组件读取 R13 站内来源，不依赖 R14 推送是否打开；交接只给它们数据契约，不编辑它们的文件。
- **路由与隐私:** 本地通知白名单只允许真实路由形状 `/contacts/:id` 与 `/contacts/new/scan/:batchId`；单段 id 非空且不得把保留字 `new`／`dashboard` 当联系人 id。拒绝 `..`、`%2F`、反斜杠、控制字符、`//`、外部 scheme 及任意 query；Task 只保留现有合法查询。远程 payload 仍只有 deliveryId，先验证登录和 delivery 归属，再进受信箱／授权目标。公开邀请接受页属于 R15 公共路由，绝不放进需要登录的 `/app/**`。

## 6. 画板编号、预检与数据来源

2026-10-18 已按 `repos/orbits/scripts/visual/README-redesign.md` 起独立静态服务，用 `compare-redesign.mjs --list` 逐份核对 b5、b11、b8、b12（服务已停止），并运行 `board-preflight.mjs --design … --board-index …`。**这是原稿预检；§2 改稿后执行者须重跑并把结果贴进本节及 REPORT**。画板文件均以 `origin/redesign` 对应版本为基准；写界面前重新核实本线 HEAD。

| P id / 用途 | `--list` 精确匹配 | 原稿预检结论 | 数据／控件和改稿前置 |
| --- | --- | --- | --- |
| A-R14-P01 通知设置 | `b5-me-inbox.html #13`，`phone 390×844 light`，标题「通知設定」 | 42 个取值：精确 35、近似 0、缺 token 7；自洽疑点 0、疑似无功能 0；文字 23／按钮 6／图标 1。缺口中 54px 手机框圆角、框阴影、黑岛为画板装饰（RD-13 不实现）；30/60px 与 0.04/0.01em 字距须逐节点辨别，实际 UI 若缺 token 请 A 线补。 | 推送类别从契约／真实来源、cap 与今日已占额从服务端、静音时段／面談例外从偏好、锁屏档位从 `lockScreenContent`；旧 5／无限和第三档先按 §2 改稿。 |
| W-R14-P01 Web 通知设置 | `b5-me-inbox.html #29`，`web 1440×960 light`，标题「設定 › 通知 · Web」 | 50 个取值：精确 49、近似 0、缺 1（整块 Web 框阴影，装饰）；自洽疑点 0、疑似无功能 0；文字 35／按钮 3／图标 1。 | 账号偏好／推送设备状态／受信箱状态真实读取；原稿双列受信箱开关、5／无限和浏览器通知按 §2 改稿，不能仅把按钮画上却无保存行为。 |
| A-R14-P02 秘書设置 | `b11-nav-v3.html #32`，`phone 390×844 light`，标题「⑤ 秘書の設定」 | 39 个取值：精确 33、近似 0、缺 6；其中手机框圆角／阴影／黑岛为装饰，30/60px 与字距需复查。自洽疑点 0、疑似无功能 0；文字 19／图标 1。 | R13 来源能力与开关、全局 cap、静音时段；移除邮件摘要入口、开关与示例，固定 3 文案按 §2 改稿。静音「変更 ›」到 A-R14-P01 同一设置源。 |
| 合并推送内容参考 | `b11-nav-v3.html #31`，`phone 390×844 dark`，标题「④ プッシュ（ロック画面）」 | 系统锁屏 mock，含 7:50 一通及面談 30 分前第二通；不是 App 页面或可控制的系统外壳。 | 用注入式 provider 验证标题、私密／完整正文、汇总件数、每日 1／3、2／3 与 landing；附模拟通知截图。**不做 App 像素门禁**，邮件摘要示例须移除。 |

**画板不存在的组合：** A-R14-P01 / P02 的 App 深色、W-R14-P01 的 Web 1024／390 和深色均「设计稿无，附截图，不进门禁」；偏好加载／失败／409、系统权限拒绝、无 R13 来源、digest 空批次、推送已达上限、Web 秘書状态也没有板，同样仅行为测试和截图。b8 / b12 `--list` 未找到 R14 专用补板。主会话若补画，应在本表加精确文件与编号后再纳入门禁；不可借用别 Sprint 的画板宣称 PASS。

**开工预检五项（每个 P 都执行）：** ①数字和切换互相自洽（1／2／3、今日已用、全局与秘書同一 cap）；②每个行／按钮有真实来源和操作结果（无来源写缺口，不能用 fixture 伪 live）；③样式从 kit 及 token 抄精确值，缺 token 给 A 线请求；④Web 1440 / 1024 / 390、App 模拟器浅／深逐一标有板／无板；⑤演示 fixture 使 3 件来源、时段、开关、文字长度与改后画板一致，中途态用仅开发包有效的 `design=` / `open-path` 到达，生产构建测试证明不可达。`board-preflight.mjs` 复跑输出直接贴本节；不得把边框装饰 token 缺口写成产品 UI 缺口。

## 7. 像素 SC 细则与门禁命令

| 画面 | 到达画面的操作链（以 R18a / R13 实际路由核对） | 验收 |
| --- | --- | --- |
| A-R14-P01 | 登录本机演示账号 → `設定` →「通知」→ App `/settings/notifications`；开发态 fixture 设 cap=3、已用=2、静音开启、面談例外开启；切到 1／2 后再回 3 验证读回。 | 改稿后 b5 #13；真实 iOS 模拟器 **浅色**，整屏含 AppScreen 顶栏与安全区；深色「设计稿无，附截图」。不画 9:41、Home 条／手机框。 |
| W-R14-P01 | 登录 → `/app/settings/notifications`（或設定子菜单）→ 查看「通知するもの」、频控／时段；切换可用开关再刷新；窄屏从同一路由进入。 | 改稿后 b5 #29；Web **1440 light** 完整页（含导航壳）。1024／390、dark「设计稿无，附截图」，行为与可达性仍测。 |
| A-R14-P02 | 登录 → 受信箱「秘書」→「設定」或深链 `/settings/notifications/secretary` → 切换期限／推荐 →「静かな時間帯 変更」返回 A-R14-P01。 | 改稿后 b11 #32；真实 iOS 模拟器 **浅色**；深色「设计稿无，附截图」。来源不可用时另附状态截图，不用这个状态冒充原稿。 |

每个有板画面先跑 `--style-diff`（Web）或 App 数字报告，迭代用 `--only <P id>`，最后跑完整 `views/{web,app}-R14.json`。Web 1440 与 App 浅色用 `--grid` 逐带验收；整屏 raw 记录为参考，所有超阈带必须有真实 `[data]`、`[raster]` 或受 `contrast-substitutions.json` 约束的 `[contrast]` 归因（RD-26／29、决定表 §20）；颜色、布局、元素有无、按钮功能不归 `[data]`。归因写 `scripts/visual/attribution-redesign-R14.json`，证据目录按 §0；完整页 `compare.html` 附画板／实现／diff。R31a/b 尚未合入时先完成结构、数据、逻辑并登记待重比，不能把「等组件库」写成通过。

## 8. 验收契约（SC；每条有操作链与可检查证据）

| SC | 操作链与必须观察到的结果 | 证据 |
| --- | --- | --- |
| **SC-R14-01 基线／预检** | 更新 `line-b` → 核对 R13、R18a、R31a/b 的提交和相关路由／来源 → 两端基线测试 → `--list` 固定 b5 #13/#29、b11 #32/#31 → 改稿前后 `board-preflight`。改稿未到时只标待画板。 | HEAD、基线通过／失败数与用例名、画板编号与 §6 五项表、主会话改稿版本。 |
| **SC-R14-02 契约与 CAS（R14-03／G19）** | 旧记录 GET → 读出 22:00／07:30／3 及可用秘書默认值 → App／Web 同 revision 写 `dailyCap=1`、`quietStart=23:00` → 刷新一致；两个客户端用同 revision 并发写时后者 409 并重读；坏 HH:mm、同起止、4、未知请求字段均 400；响应多余字段／未知非判型字段不崩。 | 先 RED 后 GREEN 的 schema、repository、handler、App 读取测试；契约 snapshot、`sync:contract` 输出与 GET/PUT 本机记录。 |
| **SC-R14-03 静音与全局上限（D-17）** | 盘点全部 provider 入口及 cutover → 注入东京／不同时区时钟与用户消息、automatic 的 reminder、suggestion、update 候选 → 22:00–07:30 静音不逐条发、07:30–07:50 等待汇总；cap=1/2/3 时两类按任一到达顺序占同一个账号日上限，第三类 business 和面談也计入；跨午夜、DST、两设备、并发 worker 和 revision 更改仍不超额；cap 满后受信箱记录可读，旧入口不能绕过配额。 | `delivery-policy.ts:30-35`、`delivery-policy-repository.ts:97` 的 RED→GREEN 单元及 repository／typed／仍活跃旧 worker 集成测试；逐候选决策、包含 user 与 automatic 的同一预留记录、push 替身调用数、旧入口清单、旧「2＋1」断言删除的理由。 |
| **SC-R14-04 7:50 合并（D-17）** | 默认 22:00–07:30 内有候选，07:30–07:50 又有候选 → 07:49 无 push，07:50 只有一通 digest，受信箱仍逐条可读；静音改为 22:00–07:00 时仍等到 07:50，改为 22:00–08:30 时 07:50 不发、08:30 一通。候选持有时修改静音、频道或来源开关、dailyCap，均按新 revision 和来源状态重判；已读／取消／过期不进摘要；重启、重试、设备并发、未知回执不重发，不把候选随后逐条送出。 | 可控时钟 + provider 替身及 `evaluateDeliveryPolicy()` 测试、持有候选与偏好变更后的 ledger／配额快照、投递 payload 仅 `deliveryId`、R13 分组截图及 worker 日志。 |
| **SC-R14-05 面談例外** | 面談前 30 分钟落在静音内 → 开关开且 cap 未满时发送并占 1；开关关、cap 已满或面談取消时不发送，站内提醒仍按来源存在；7:50 digest 不再重复算入已送的面談。 | 预约来源 + policy 测试、推送替身次数、取消与日上限记录、b11 #31 内容参考截图。 |
| **SC-R14-06 邀请双方（R14-02／D32）** | 邀请人发码 → 受邀人接受 → 两账号分别看到 1 条本人 `contact`／`source` 通知和可推送候选 → 重放连接事件不重复；任何一方关闭推送仍保留自己的站内通知；联系人删除／越权时目标不可打开。 | R15 邀请测试扩展、两个 actor 的 inbox 与 outbox 记录、provider 替身计数和联系人授权测试。 |
| **SC-R14-07 落地白名单（R14-01、R13-04）** | R14 实施本地 `/contacts/<id>`、`/contacts/new/scan/<batchId>`、`/task?seg=todo` 合法推送深链，点系统通知实际到 To-do；`/contacts/new` 等保留段、`..`、编码斜杠、外链、`//`、多余查询与未知 seg 被拒或安全回退；点远程推送先到登录后 `/inbox?deliveryId`，取本人 delivery 后到受信箱／有权限目标，伪造他人 id 不开。R13 只验其受信箱内部目标跳转。 | R14 的 `notification-model`、delivery-navigation、路由及登录守卫测试；模拟器 `simctl openurl` 操作记录；R13 SC-R13-10 的受信箱 To-do 落点回归。 |
| **SC-R14-08 App 通知页（A-R14-P01）** | R18a 設定入口 → 静态 `/settings/notifications` → 读取、切换、保存、刷新；系统权限未问时可请求、拒绝时打开系统设置；推送 opt-in 与 token 登记复用；无网络时禁用保存并可重试。屏用 `AppScreen inset="kit"`、`UiText`、R31a 控件。 | 改稿后 b5 #13 浅色像素 `--grid` 报告、App 真实截图／`compare.html`、渲染与权限操作测试；深色／失败态「设计稿无」截图。 |
| **SC-R14-09 Web 通知页（W-R14-P01）** | R18a 設定子菜单 → 静态 `/app/settings/notifications` 而非 `[section]` 占位 → 改偏好刷新一致，错误／409 可恢复；退出登录后拒绝访问；1440 完整壳、1024/390 可操作。 | 改稿后 b5 #29 1440 light 像素、Web 操作／路由优先级测试、1024／390／dark「设计稿无」截图、copy:qa。 |
| **SC-R14-10 秘書设置（A-R14-P02）** | R13 秘書入口 → 静态子页 → 只见真实可用的「期限／おすすめ」开关，切换并刷新；邮件摘要入口、开关与示例完全隐藏，静音修改落回同一全局设置，固定上限随全局 cap 显示；返回受信箱。 | 改稿后 b11 #32 浅色像素、App 模拟器操作与截图；断言无邮件摘要控件／文案／示例；R13 来源未交时的能力空态行为测试与「设计稿无」截图。 |
| **SC-R14-11 注册、权限与旧屏收口** | App opt-in 关→设备撤销→重开且 OS 已授权→重新登记；系统拒绝时不假成功；账号切换无旧响应；R18a 动态段仍能服务其他设置；旧通知 UI 的使用点逐一核对，仅在为零时删除。Web 不伪造浏览器 push。 | push registration races / permission 测试、引用搜索、路由审计、旧用法清单差异、账号隔离记录。 |
| **SC-R14-12 R13／R10／R19 契约交接** | R13 的 event_deadline／prep／pick 实际生成 → 站内分类、日分组、首页／小组件只读来源不受 R14 推送开关影响；活动来源在 cap 满时仍被写进受信箱（事件线修 `notification-job` 的提前截断）；不认识的 App 来源逐条跳过，不使整页失败；若 R13 尚未交则记具体缺口，先完成其他 SC。 | R13 最新接口／fixture 版本、App tolerant 与同步白名单测试、活动维护任务读取／写入测试、给事件线及 R10/R19 的四栏交接原文。 |
| **SC-R14-13 异常／无障碍** | 无登录、503、离线、409、无通知权限、设备无 token、时区变更、午夜边界、空 digest；两端屏幕阅读器能读开关及当前状态，键盘／VoiceOver 可操作，减少动效生效；不显示过期或别人的私密正文。 | Web/App 渲染与集成测试、VoiceOver／键盘操作记录、错误态「设计稿无」截图、隐私负例。 |
| **SC-R14-14 演示世界与 i18n** | 用改稿后的 3 条示例来源构造 fixture，经同一 API/schema 解析；非生产 `design=` 可达固定中途态，生产构建不可达；日／中／英文案全走字典与 copy kind，不出现过时「2 件／08:00」或假邮件能力。 | demo-world 测试、生产开关防护测试、`copy:qa` 与 no-hardcoded-copy 摘要、三语截图抽查。 |
| **SC-R14-15 全量与像素收口** | R31a/b 合入、主会话改稿后，跑全部有板 P 的门禁、两端全量测试、类型、lint、路由／审计；未过板不标 done，超阈带只按合法三类归因；与开工基线比较零新增失败。 | `views/{web,app}-R14.json`、attribution、每 P 的 raw／超阈带／归因路径、全量命令与失败名、`compare.html`；主会话独立复核抽查 ≥20% 已过板并重跑未过／改过板。 |
| **SC-R14-16 REPORT／交接** | SC-01～15 逐条结论 → §3 逐条接手或转出 → 按路径提交 → 主会话复核；生产事项列「待用户授权」，跨线缺口写四栏交接，不把暂缓当通过。 | REPORT／REVIEW、`git diff --stat origin/redesign...HEAD`、提交清单、越线检查及 DEFERRED 请求原文。 |

## 9. 执行顺序

1. **先核实依赖与板（SC-01）。** 更新 B 线，读 R13 / R18a 交付的实际 HEAD；主会话依据 §2 修 b5 #13/#29 与 b11 #31/#32（或给出可复核替代板），B 线复跑预检。没有修板前可写逻辑，但不能做这三张像素验收。
2. **从规则到持久层（SC-02～05）。** 先写失败测试，再完成默认／CAS、静音与配额、digest、面談例外。先用 provider 替身与本机库跑通「来源→ledger→receipt」，再接 R13 实体来源。每一步验证后检查本线差异再继续。
3. **落地及邀请（SC-06～07）。** 保持 R15 原幂等行为，做双账号通知；本地深链只放宽明确前缀，远程 delivery 仍走本人鉴权。向 R13 核对 Task 落点和秘書入口。
4. **页面（SC-08～11、14）。** 先 App／Web 静态路由和真实 API，再秘書页、权限及三语。只使用 R31a/b 已交组件；缺的给 A 线请求。新 App 页面 `AppScreen inset="kit"`，不改 D 线导航壳。
5. **收口（SC-12～16）。** 逐来源、离线和异常回归；有板页面过像素，没板截图登记；全量对照基线；REPORT 给主会话独立复核。生产事项停在本机验证之后等授权。

## 10. 失败、待用户授权与交接

- **画板冲突／组件缺口:** §2 的 b5 三档、锁屏三档、双列受信箱、浏览器通知，b11 邮件摘要与固定上限，均先由主会话修板或明确逐条代定；B 线不改 A 的 token / 组件或 C 的设置容器。缺画板的宽度／主题／状态写「设计稿无，附截图，不进门禁」。任何 pixel 未过记 P id、命令、超阈带及归因失败；三轮停止该画面并继续独立工作。
- **R13 尚未交:** 记录来源接口、字段、版本与受阻 SC-04/10/12；SC-02/03/06/07 和路由骨架可继续。R10 首页、R19 小组件只收 R13 的站内通知契约，R14 不能替它们改页。若 R13 秘書生产者不存在，不把 fixture 当 live。
- **跨线请求:** A 线负责缺 token／组件参数（逐节点值、对照画板）；D 线负责 App 返回／Web 高亮若现有壳不够；C 线负责 R18a 设置入口／动态占位若尚未交；R13 负责来源与受信箱分组；主会话负责 b5/b11 改稿及 README/HANDOFF/DEFERRED/决定表更新。REPORT 写每项「是什么｜当前状态｜接手必须做到｜依据」四栏，不能只写一句“待处理”。
- **生产与外部依赖（待用户授权）:** 任何需要生产 Neon 迁移、生产 worker 启用、环境变量／推送凭据、部署、TestFlight／真机通知、Gmail `gmail.readonly` 及 D-16 验证的项，均只在 REPORT 给出可审阅的操作清单与本机证据，交主会话登记 DEFERRED「待用户授权」。本 Sprint 不执行这些动作。本机任何付费 AI 真调用前先落实调用／费用硬配额和超额降级，再逐次记用途、次数、token 与费用；秘書期限与推荐按现有规则／评分，预期零调用。
- **基线失败／验证限制:** 两端全量、类型或像素若有新失败，先定位并在本线范围内做有界修复；同一新增失败修两轮未解，列用例、复现命令和受阻 SC，继续无依赖项。未跑的检查写「未运行」，不可写 PASS。只有任务完成、用户暂停、硬预算到或所有剩余项都具体受阻，才停止本 Sprint。
