# Sprint R28 — 新用户引导：实施计划与验收契约

**线与顺序：** C 线 `redesign-c` / `line-c`，Codex 主开发会话执行；R18a → R18b → R18c → **R28**。依据：README RD-31～33、[GOAL](GOAL.md)、[交接表](../HANDOFF-TO-FEATURE-SPRINTS.md)、[旧屏归属](../screen-ownership.md)。本文在 2026-10-18 `git fetch origin redesign` 后按 `origin/redesign` 的 `cb866e48fbb41e7f540bbf66177f9ae0ac597591` 核查受影响源码行号；该远端仍含 R18a 所计划迁走的旧文件，**不是** R18c 完成后的实施基线。实施者须先按路径重查本线实际起点。

## 0. 给 Codex 的执行说明

1. **目标与停点。** 依 SC-R28-01～16 做出可用的两端资料引导、三步指南、v2.2 intake 入口、示例期与路由清理，写 REPORT；规划、测试通过或一次提交都不是完成。独立复核由主会话自己重跑关键测试和门禁。若 R18c 尚未交付，只做已授权且不依赖它的设计、契约和隔离实现，依赖项逐条记下，不覆盖 C 线进行中的文件。
2. **环境。** 只在 C 线 worktree 开工，本地库沿用 `orbit_line_c`，Web 3400 / `.next-line-c`、Metro 8084、设计服务 3420（与其他会话不同）、独立 iOS 模拟器按 UDID 操作。先记录两端全量基线；orbits 测试用 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`，另跑 `npm run typecheck`、`npm run typecheck:app`、`npm run lint`、`npm run copy:qa`；App 用 `npm test`、`npx tsc --noEmit`。Python 如需执行先建 uv 环境，只用 `uv run`。不连 Neon / 生产。
3. **先设计后界面。** 用 `compare-redesign.mjs --list`（静态服务运行期间）核对 §8 的 b1 序号；先跑 `board-preflight`，把每个画面五项填写在 R28 实施证据中。b1 必须改的文案 / 进度、缺少的深色与 Web 1024 / 390、独立 `/start` 画板先由主会话按 RD-33 代定并补在 b12 末尾，记录原／新与理由；某状态没有画板时写「设计稿无，附截图，不进门禁」。画板和新组件库到位后才把该屏标为像素通过。组件只用新组件库；App 新屏统一 `AppScreen inset="kit"`、`UiText`、系统状态栏和安全区；Web 用 `Orbit2026Scope`、CSS Modules、ShellPage 插槽。壳归 D 线、token 和组件归 A 线，只发请求不私改。
4. **开发与收口。** 档位 H：真实操作链先 RED 再 GREEN，mock 与本地 live 都测；新增共享契约遵守 G18/G19，破坏性变更先登记 `BREAKING.md`，App 先兼容新版读取再切服务端，响应宽进、请求严出，`shared/**` 同步 App。可本地按需调用付费 AI，但必须记录各功能调用次数、额度命中与降级；不得启用生产开关。分屏门禁最多三轮；本线可做的其他项继续。收口两端全量与像素对照基线零新增失败、REPORT 逐项映射交接表并列未过项。只提交自己归属路径、不推送；生产迁移、部署、环境变量、TestFlight、合回均列给主会话登记 DEFERRED「待用户授权」。本次文档修订只改 GOAL / PLANNER，不实施本节动作。

## 1. 本线归属的文件 / 不许碰的文件（RD-31）

| 归属 | 文件与边界 |
| --- | --- |
| C：Web 引导 | `repos/orbits/app/(app)/app/{start/**,profile/onboarding/**,profile/continue/**,profile/onboarding-0918/**,profile/profile-onboarding-{navigation,route-policy,access.server}.ts}`；`_demo/demo-mode-core.tsx` 中只改本线 guide 状态／横条兼容字段，回归 E 线 iOrbit 消费者；新建本线 `orbit-2026/onboarding/**`、`orbit-2026/copy/onboarding.ts`。旧目录只在新屏及所有引用迁走后删。 |
| C：App 引导 | `repos/orbit-app/app/{start.tsx,profile/onboarding.tsx,profile/continue.tsx}`、`src/screens/profile/onboarding/**`、`src/view-models/{profile-onboarding,profile-continuation-route}.ts`；新建 `src/screens/guide/**` 及本线 API / 字典域，App 路由登记、离线清单只改本线项。 |
| C：指南与资料服务 | `repos/orbits/features/guide/**`、`app/api/guide/state/**`、guide 专用客户端 / 测试；`features/profile/onboarding.ts` 的本线门禁语义；新增 `features/profile/onboarding-progress*` 与 `app/api/profile/onboarding-progress/**` 的 actor 级 `profileOnboardingFlow` 进度（只供资料五屏续填）。`/api/profile` 契约、App 响应解析和客户端改动必须只做本线所需的兼容修改并同步，先查全仓引用。 |
| C：设计证据 | b1 A3 / A4 相关文案与本线画板；b12 **只在末尾追加** R28 组；新建本线 `views/{web,app}-R28.json`、归因文件、REPORT。汇总文档只交四栏文字给主会话，不在别线未提交文件上直接写。 |
| 兼容共享点 | R18a 应交出 Web `app/(app)/app/profile/use-profile-editor-session.ts`、`profile-tag-options.ts` 和 App `src/data/profile-edit-session.ts`。迁移 R28 引用到新路径；只在全仓无引用后删 `profile-0918/profile-model.ts` re-export。若实际交付路径不同，以 R18a REPORT 与代码为准，不先删旧文件。 |

**不许碰：** A 线 `src/components/ui/**`、Web `orbit-2026/ui/**`、设计 token / kit / visual 工具；D 线 App 根 `app/_layout.tsx`、`AppScreen` / 顶栏 / TabBar / `app-navigation`、Web `orbit-2026/shell/**`、Task 容器与两端 Task › プラン 文件、首页；B 线联系人列表、导入业务及 N12 / N12b 手入力弹窗；E 线 iOrbit；R22–R25 计划 v2.2 流程和 API 业务；R18b 认证公开页、R18c 账户权利页。必须触及的跨线点按 §10 发精确请求、由所属线单独提交并回传证据。公开欢迎 / 登录页仍归 R18b，R28 的已登录引导不挂到需登录的路由之外。

## 2. 主会话代定（RD-33；本次复核全部采纳）

1. **三个计数分开。** b1 #10–#21 的 A3 是资料 **5 屏**（基本、目标、强み／ニーズ、AI 自我介绍、名片导入）；首页「はじめの 3ステップ」是联系人 → 目标 → 计划；b1 #26–#38 的 A5 是 v2.2 **4 阶段**（目标、背景、问题、AI 初版）。计划 DESIGN:402 明确把 R28「第 4 步生成计划」对应首页三步的第 3 步；因此不把资料五屏缩成四屏，也不把旧 `guideState.currentStep` 扩成 4。A5 的前 3 阶段按既有 v2.2 契约顺序确认，未完成不得深链到 AI 初版。依据 screen-ownership:55,83,90、b1:1681–83、IMPLEMENTATION-PLAN:133,236。
2. **资料门禁与可选生日（D28-2）。** b1 #10 明写「生年月日（任意）」，现有服务却把生日列为必填（事实 3）。这是资料完成政策的语义变更，须升 `policyVersion` 到 **2**，并按 G18 先在 `repos/orbits/shared/contract/BREAKING.md` 登记契约变更、按 G19 先放宽 App `profileOnboardingSchema` 读取 1/2 及未知新版的安全降级，再切服务端 `calculateProfileOnboarding`。服务端 v2 完成谓词只要求姓名与两级行业；生日空保存 `null`，填写时仍校验真实日期，不把非法日期当完成。保留旧 v1 响应的读取能力，回执与跨端读回须覆盖 v1/v2，不能以继续发 v1 掩盖政策改变。
3. **目标与计划种类。** 资料目标选择顺序保留，最多 **2** 个；沿现有 App `composeRelationshipGoal` 的文本格式保存为「优先 1、优先 2：一句话」，**不默认追加季度／期限**（b1:1703/1733 明写不设期限）。两端解析时识别日中英已知标签，旧格式与未知自由文本保持原文、不丢内容；R18a 编辑器只处理同一 `relationshipGoal` 字符串。第一优先目标加一句话进入首次 intake，第二仍留资料里，日后可用 v2.2「追加目标」。b1 的六种资料目标与 v2.2 的六个 `PlanGoalKind` 并不完全同名；在指南计划入口让用户核对目标文字和 v2.2 类型（复用其选项），不能悄悄把「認知拡大／情報収集」映为错误类型。已有明确类型可预选，用户可改；无对应类型先请其选择。新增小状态先补 b12，不直接伪造类型。依据 `plan-v2.ts:10–13,527–532`、`PlanGoalEntry.tsx:23–26,103–115`、`types.ts:38`。
4. **指南硬顺序。** 第 1 步以 **3 位已确认联系人** 为准，非 10 张名片；第 2 步目标非空；第 3 步有真实生效计划。D2 老用户与存量 `step1Skipped=true` 只读兼容；新用户不能跳第 1 步。`?step=1..3` 只打开已解锁步。`guideState.currentStep` 只记录停留位置，**完成数由联系人／目标／计划派生**，不能拿 `currentStep` 当 `n/3`。`completedAt` 首次完成后不回退，旧 `currentStep=4` 读为无记录且写入拒绝。五屏资料进度另算。
5. **创建计划的边界。** 第 3 步以 `POST /api/agent/plans/intakes`、`source:"onboarding"`、稳定的用户动作幂等键创建或续接 intake，导航只用响应 `href`。计划 DESIGN:402 的早期示意把 `goalKind` 写为可选，现行 `planIntakeCreateRequestSchema` 要求它，实施按**现行严出契约**传入。A5 四阶段的输入、付费生成、确认与限额由 R22–R25 既有流程负责；R28 做入口与回程、跨端续接，不复制引擎或改 D 线 Task 页面。只在真实 active v1 / v2 plan 成立时标指南完成，示例计划不算。
6. **示例进度与拦写。** b1 / 01-system 的「4 / 5」是旧资料步骤示例值；本线示例模式用真实指南 3 步进度，能读到时显示 `n / 3`，读不到则只写「ガイドを続ける」。改稿时把旧固定 `4 / 5` 改成状态占位／示例 `n / 3`；N12 / N12b 既有手入力弹窗遵守决定表 §17-12 / §18-12 的无数字降级。示例只读由前端拦截与服务端 403 `SAMPLE_READ_ONLY` 双保险，不能只靠隐藏按钮。
7. **资料门禁与五屏续填分开。** 现有 `continue` 只看资料最低必填状态，基本资料一存就可能绕过余下四屏（事实 6）；App 还把空的可选画像／介绍误判为「没做」（`profile-onboarding.ts:266–300`）。新增独立的 actor 级 `profileOnboardingFlow` 进度（当前屏 1–5、最后已确认屏、`finishedAt`／稍后标记）：每屏 PUT 回执和复读成功后才推进，导入跳过也明确记完成；跨端 GET 复原，CAS／幂等防并发倒退。旧账号没有进度记录且资料完整时直接去安全 `next`，不强迫重做；新账号／未完成记录可见 b1 #15/#21 续填卡，点「あとで」可去安全 `next`，以后重新进入仍可续。`continue?next=` 只接受安全站内目的地、防自循环；邀请 `/i/<code>` 既有直达例外继续。读取失败显重试，不伪装完成。Web 本地草稿只保未提交输入，不覆盖服务端已确认字段。
8. **App `/start`。** 现有文件只是跳 `/profile/onboarding`，语义不等同 Web；改成受私有路由边界保护的真实指南页，读 `/api/guide/state` / 同一进度来源。`route-parity` 以真实页面及返回路径变绿，绝不新增例外。资料屏仍用 `/profile/onboarding`，两条路由用途不同。
9. **指南与示例开关分离（D28-9）。** `ORBIT_GUIDE_DEMO` 目前默认关，`readGuideStatusForActor` 与 `readStartGuideForActor` 都因此提早返回（事实 7）。R28 同时解除 `/app/start` 和首页真实进度读取的示例门控（`features/guide/progress.ts:240–242,384–385`）；开关只控制示例数据／横条，真实进度读取失败仍显不可用，不能假报 0/3。首页与指南的只读进度投影同 R10 共用：谁先开工谁创建、单独提交并把契约／提交号交给另一方，后者 import，不复制联系人／目标／计划的派生规则。本地替身可开示例并验证老用户判断、跨端折叠、写入拦截。生产启用示例、正式 `since`、付费 AI 月额与新生产配置都归「待用户授权」，不能因本 Sprint 完成而自动打开。新增付费调用若不可避免，先给服务端确定性配额、幂等与规则／手写降级，本机记次数。
10. **离线与缓存。** `/api/profile` 已是 App 账户页副本，资料引导写入仍在线且保留回执／复读；新的资料流程进度、`guideState` 与 plan intake 不新增离线 outbox，断网显示可重试与保留的本地草稿。若实施时确需新增同步字段，先核对 `domain-registry` 的 `fields` 白名单和 App 解码／outbox，纳入同一 SC；不能只在 UI 加字段。R28 不假定 `guideState` 已有离线 sync 域。
11. **日文 AI 介绍与三次额度。** b1 的介绍是日文，但现行 App `introDraftLanguage` 把 ja 转 en，服务端把非 en 转 zh（事实 13）。本线为既有 `/api/profile/intro-draft` 请求严格接受 `ja`，用日文行业标签／日文指令生成、沿 CJK 80 字限制校验；旧 zh/en 行为不变。资料介绍额度按**同一 actor 账号首次创建的 onboarding flow** 计算：首次成功生成计第 1 次，另有两次成功的「別の案」，共最多 3 次；`finishedAt` 后、重复初始化流程、刷新、换端、退出再进入和自然月切换均不重置，计划 AI 的月额另算。每次用户动作带稳定 `idempotencyKey`，同 actor 同 key 同请求重放只回原草稿、不再次调用模型或扣额；同 key 异请求拒绝；同 actor 并发必须原子占额。模型内部最多三次修正尝试只属同一用户动作；失败不占成功额度，但同 key 失败重放不再触发模型，重试需新用户动作／新 key 并记录实际调用。语气切换按画板不扣额，因此只能复用已得草稿／本地确定性改写，若需新付费调用须另定产品口径。AI 不可用或额度用尽时可手写日文并继续，不用英文／中文草稿假装日文成功。

## 3. 交接条目 → SC（REPORT 逐条写「做了／改了／转出」）

| 依据 | 本线处理与验收 |
| --- | --- |
| R28-01；D51；PA N12；01-system c-sample | A4 示例横条、药丸、写拦截与只读；N12 / N12b 是 B 线已有弹窗，只复测与回传；SC-10、SC-14。 |
| R28-02；D60 | Task › プラン 横条由 D 线恢复，C 交准确状态 / props / 操作链请求；SC-11。 |
| R28-03；R23 REPORT:78 | 旧「跳目标输入」改为 `POST /intakes` 并用 `href`；SC-09。 |
| R28-04；R12 REPORT:75,117 | Web `card-batch-ui` 旧引用迁走；App `/start` 真页；允许清单只减与 route parity 归零；SC-07、08、12。 |
| R18a 代定 20；R18b 代定 3；R18c 顺序 | `use-profile-editor-session` / tag options 新路径复用、最后删旧 re-export；b1:1701/1731 的 3→2、R18c 交付检查；SC-01、03、04、12。 |
| G01–G04、G10–G17、G21–G24（含 G23b）、G26 | 已登录 Web 用壳插槽而不改壳；App 用新顶栏 / `AppScreen inset="kit"` / UiText；token、语言、触控与危险色复用库；缺件给 A、导航给 D；SC-03、07、08、13、14。G14 的公开路由继续属 R18b。 |
| G05–G09、G25；README 规则 11–13；RD-16/26/29 | §8 每屏画板／补画、只读演示 fixture、数据／栅格／对比度归因、同屏三轮上限、系统手机外壳不实现；SC-01、13、14。 |
| G18–G20；README 规则 10；HOW-TO §3–7,9 | `NOT_IMPLEMENTED` 只降级受影响块；D28-2 升 `policyVersion:2` 先登 `BREAKING.md`、App 先兼容读取、再切服务端，`shared/**` 同步；三份旧屏允许清单只减；SC-03、09、12、15、16。 |
| screen-ownership 引导两行；IMPLEMENTATION-PLAN §1.2、§1.7、§1.9 | 资料五屏、指南三步、计划四阶段分别验证；App / Web 指定路由替换；SC-02～09、13。 |
| 2026-10-12 决定表 §17-12、§18-12；DEFERRED-A | N12／N12b 没进度则不显示分数；依赖 A / D 或生产授权登记请求，附重比条件；SC-10、11、14、16。 |

## 4. 已查清的事实（`git show origin/redesign:<path>`；不是未来交付的断言）

1. **三步是真实现有模型。** `repos/orbits/features/guide/start-steps.ts:5–18,38–49,70–104,107–143` 定义 3 位已确认联系人、目标、计划的硬顺序，非法 `?step=4` 被忽略，完成闩锁不倒退；完成标记由三个真实条件派生，`currentStep` 不是完成数。`features/guide/progress.ts:162–168` 的 active v1/v2 真实计划计完成，mock 示例不算；`:253–303` 按 `completedAt` 决定离开示例。
2. **状态协议。** `repos/orbits/features/guide/guide-state.ts:2–21,26–49,81–90` 把 `guideState` v2 存在按 actor 分片的 `orbit_records`，可写 `bannerCollapsed/currentStep`，旧 4 读 null；`app/api/guide/state/route-handler.ts:34–80,139–143` 只收这两字段，越权字段 400，未登录先 401。App 目前没有对应 `/start` 消费。
3. **资料门禁与画板冲突。** `repos/orbits/features/profile/onboarding.ts:14–23` 把姓名、一级行业、二级行业、生日都算必需并返回 `policyVersion:1`；`b1-onboarding-cards.html:1699,1730` 的两端基本资料屏把生日写为「任意」。`repos/orbits/shared/contract/profile.ts:23–33` 的类型也固定版本 1；`repos/orbit-app/src/api/profile-detail-contract.ts:11–15` 的 onboarding 子对象只接受 `policyVersion:1`，根与 profile 在 `:16–36` 宽进；`:40–48` 校验保存回执。必须按 G18/G19 顺序升级。
4. **当前 Web 资料流。** `repos/orbits/app/(app)/app/profile/onboarding-0918/onboarding-model.ts:18–24,79–127` 是 `profile/goals/persona/intro/import` 五步 + v1 本地草稿，`:12` 从旧 `profile-model` 取选项；`onboarding-flow.tsx:33–60` 仍引旧 `card-batch-ui` 和 GoalEditor，`:127–167` 保存五屏；`onboarding-client.ts:30–84` 做 PUT 回执与复读。`profile/onboarding/page.tsx:10–16,33–45` 仍挂旧屏。
5. **当前 App 资料流。** `repos/orbit-app/src/view-models/profile-onboarding.ts:16–25` 五步且 `GOAL_LIMIT=3`，`:191–221` 把目标 chip／一句话／期限合成 `relationshipGoal` 并能解析已知标签；`src/screens/profile/onboarding/ProfileOnboardingScreen.tsx:85–180` 逐步 GET/PUT，`:116–117` 默认补期限，`:184–213` 自动／重试生成介绍，`:263–300` 仍用旧 SafeArea / Text；`src/api/profile-onboarding.ts:31–72` 保存、冲突复读与回执，`:75–83` 调介绍生成。Web `profile/goal-editor/goal-editor-model.ts:1–8,103–125` 把旧 chip 前缀当正文并有期限模型；`onboarding-model.ts:101–127` 本地草稿不等于服务端资料。
6. **续航与邀请。** Web `profile/profile-onboarding-navigation.ts:31–46,55–95` 规范化 `next`、防资料／认证循环，并给 `/i/<code>` 特例；`profile/continue/page.tsx:24–48` 完整资料直去目标，否则进 onboarding。App `src/view-models/profile-continuation-route.ts:26–75` 限制目的地与嵌套 `next`，`app/profile/continue.tsx:5–10` 现只重定向；`src/view-models/profile-onboarding.ts:266–300` 按已填字段猜前四屏，无法知道跳过与第五屏完成。两端资料读取失败要避免互相重定向。
7. **路由与读取门控缺口。** App `repos/orbit-app/app/start.tsx:1–7` 目前直接 Redirect `/profile/onboarding`；Web `app/(app)/app/start/page.tsx:53–99` 在开关关闭时跳 `/app/agent`，开启后读真实服务端快照但仍套旧样式；`start-guide.tsx:34–35` 仍引用 `card-batch-ui`。`features/guide/progress.ts:240–242,384–385` 分别把首页进度与 `/app/start` 读操作绑到示例开关。README:105 记录 `route-parity` 的 `/start` 已知红项，实施时重跑而非假定现值。
8. **计划入口与上限。** Web `start/start-step-plan.tsx:5–9,85–88` 只跳 v2 目標入力；`shared/contract/plan-v2.ts:10–13,527–532` 已有 `source:"onboarding"`、goalKind 和幂等键；`shared/api-schema/plan-v2.ts:424–430` 请求严出；`app/api/agent/plans/intakes/route.ts:1–5` POST 已接流程；`orbit-2026/plan/PlanGoalEntry.tsx:103–115` 示范创建后用响应 `href`；`features/plans/v2/types.ts:38` 限两个目标。App `src/screens/plan/plan-api.ts:137–144` 通过 `x-orbit-platform: app` 请求 App 形状 href；同步的 `src/api/compute/plan-href.ts:2–15,48–51` 区分 `/plans/flow/<id>` 与 `/task?seg=plan&plan=<id>`。`tasks/plan-slot.tsx:9–11,26–29,58–67` 旧示例分支已删、Task 当前归 D 线。
9. **示例旧件。** `app/(app)/app/_demo/demo-mode-core.tsx:23–47,59–115` 已有三步视图、横条折叠 PATCH 与 `guardWrite`；`_demo/demo-guide-view.ts:18–26` 仅在示例时给视图。`orbit-2026/add/SampleBlockedDialog.tsx:13–35` 已实现 N12b 并在无进度时不显示数字；它属 B 线，不作为本线可删文件。`shared/config/guide-demo.ts:1–25` 的开关默认关闭。
10. **离线事实。** App `src/data/sync/page-copies.ts:1–22,43–45` 仅把成功的 `/api/profile` 读响应作账户页副本，不能当待同步资料草稿；`repos/orbits/features/sync/domain-registry.ts:3–16` 明说同步 payload 只发送 `fields` 白名单中的字段。对 R28 新状态要逐端审计，不能从「页面有缓存」推断能离线写入或自动同步。
11. **画板事实。** b1 `--list`：资料 App #10–15、Web #16–21；示例 App #22–23、Web #24–25；v2.2 四阶段入口及产物 #26–38，暗色资料目标 #61/#66。`b1-onboarding-cards.html:1681–83` 的 A3 stepper 仍 5；`:1701,1731` 写「1〜3個まで」；`:1774–91` 示例进度固定 4/5。现有画板并未单独画 App/Web `/start` 完整页。
12. **R18a 是预期交接，尚非远端事实。** R18a PLANNER:104 计划把 Web `use-profile-editor-session.ts` 与标签选项搬到 `profile/`，只留旧 `profile-model.ts` re-export 给 R28；本次 `git show` 的远端仍只有 `profile-0918/use-profile-editor-session.ts` 与旧 `profile-model.ts`。R28 开工按 R18a REPORT 和实际 import 图决定清理时机，不能按计划文件直接删。
13. **AI 日文缺口。** `repos/orbit-app/src/view-models/profile-onboarding.ts:310–312` 把 ja 映为 en；`repos/orbits/features/profile/intro-draft-service.ts:90–105,113–145` 只用 zh/en 指令、非 en 退 zh。`app/api/profile/intro-draft/route.ts:20–30` 接收 language 后交服务。现状不能生成日文介绍，R28 必须修并验实际日文输出。

## 5. 状态、数据与契约

### 5.1 资料与进度

`/profile/continue` 与 `/app/profile/continue` 是**路由决策**，不是第五／第六个表单步骤：`authenticated → GET /api/profile + GET actor 的 profileOnboardingFlow → 资料最低门禁未过? onboarding : 新账号流程未完? 可跳过的续填卡 : safe next`。旧账号无流程记录且资料已齐直接去 safe next；读取失败显示恢复态。新端点建议 `GET/POST /api/profile/onboarding-progress`：`GET` 返回 `currentScreen: 1..5 | null, lastConfirmedScreen: 0..5, finishedAt: string|null, deferred: boolean, version:1, revision:string|null`；`POST` 严格请求 `{ action:"initialize"|"confirm"|"defer"|"finish", screen?:1..5, expectedRevision:string|null, mutationId:string }`，服务端校验顺序和 CAS，不能让客户端直接写 `finishedAt`。`version` 是数据结构版本，`revision` 才是并发游标。**在第一次资料 PUT 前**为门禁未过的新账号幂等初始化进度记录；若这一步失败，显示重试，不允许先保存基本资料后被当成「无记录旧账号」绕过续填。服务用 actor 级 `orbit_records` 单记录，不新建生产表；确需迁移时停止该项并登记授权。此新增契约仍按通用规则 10：请求 strict、响应宽进／未知枚举显式兜底，`contract-snapshot` 后 `sync:contract` 同提交。引导资料的 PUT 必须带 `mutationId` / `expectedUpdatedAt`，冲突只读最新并重试一次，成功以回执 + GET readback 为准，再推进流程进度；若进度写失败，界面保留该步并重试同一幂等命令，不能谎称已确认。草稿按 actor 隔离，跨账号不串。姓名／行业缺项通过门禁；生日按代定 2 可留空。`relationshipGoal` 沿用「两项有序意向：一句话」纯文本，不带默认期限；回读与 R18a 编辑器互通，未知旧文本原样保留；不能把 v2.2 的 `goalKind` 偷放进这个文本字段。

`guideState` v2 不新增客户端可写字段：`GET` 读 `bannerCollapsed, currentStep, completedAt, grandfathered, step1Skipped, version`，`PATCH` 只许折叠或 1–3 步停留位置。`currentStep` 不是完成数；真实 `n/3` 由确认联系人、资料目标、active 计划共用的只读投影派生，R28 / R10 先开工者创建并单独提交，后者 import。联系人计数必须用确认谓词，不用导入原片数；`completedAt` 由服务端首次看见真实三步全完成时写入。`readGuideStatusForActor` 与 `readStartGuideForActor` 同时解除 `ORBIT_GUIDE_DEMO` 早退，只把开关用于示例状态／横条；读失败显示可重试，不当作 0 联系人。旧 `step1Skipped=true` 只读兼容。App 的客户端响应按通用规则 10 宽进、未知读取值有明确回退，请求严出；任何新增共享字段先同步 App。

### 5.2 计划与示例

`POST /api/agent/plans/intakes` 请求为 `{ goalText, goalKind, source:"onboarding", idempotencyKey }`，响应按 `PlanIntakeView.href` 跳转；用户再次点击同一动作沿用同一 key。App 沿现有计划 API 发 `x-orbit-platform: app`，校验响应为站内 App 路由后导航到 `/plans/flow/<intakeId>`，确认后的 Task 回程使用响应 App href／`planTaskSegmentHref("app", planId)`，不得把 Web `/app/...` href 直接传 Expo Router；平台 href 缺失或错误时显示可重试错误并记录契约缺口。Web 用 Web 响应 href。跨端回来时先 `GET /intakes` 找同一目标的候选，再读其详情确认 `source:"onboarding"` 才续接；列表项自身**不含** `source`（`plan-v2.ts:413–420`），不能只按第一项或同名目标误接 Task intake。没有匹配才新建，避免重复付费或计额。背景、问题、AI 初版及 confirm 沿 v2.2 原服务，确认后回 Task › プラン；指南以真实 active plan 为完成条件。AI 错误、限额、`NOT_IMPLEMENTED` 各有不同状态；本线不改已有计划配额数字。资料介绍 AI 独立按同 actor 同一次 onboarding 生命周期最多 3 个成功草稿（首次 1＋再生成 2）计次，不随自然月、刷新或换端重置；每个动作的幂等键跨端重放只返回原结果，不再调用模型、扣额，同键异体拒绝，并发原子占额。失败可手写继续；模型内部修正不算新用户动作但实际调用入账。

示例视图只从 guide 状态得出，演示世界条目带 `sample: true`；前端 `guardWrite` 先挡用户触发。本线引导会触及的每条写 API 要明确拒绝演示账号／示例请求，返回 403 `SAMPLE_READ_ONLY` 且数据库、AI 账本、外发为零；跨线写 API 的缺口交其负责人。不能把 403 当普通保存失败，也不能通过客户端标志授权真实写入。Task 横条只接 D 线的展示插槽／状态，C 线传 `inDemo`、`bannerCollapsed`、`n/3`、继续路径与拦截语义。

### 5.3 离线与版本

引导资料可显示上次成功的 `/api/profile` 页副本并标时间，但编辑／保存需要联网；断网仅保本机草稿，不排入未经审计的 outbox。指南状态与 intake 读取失败显示重试；不能以旧缓存完成指南或生成计划。若实际实现增加字段：服务端同步域 `fields`、App schema、SQLite 镜像／outbox、Web 镜像、R18c 账户清除路径逐项审计并补测试，否则不得声称跨端或离线一致。无需新增字段时在 REPORT 写明「审计后无新增同步字段」。`guideState` v2 读旧值；资料 `policyVersion` 由 1 升 2 先走 G18/G19：登记 `BREAKING.md`、共享类型与快照、App 读取兼容及同步验证，再上线服务端 v2 响应。旧 v1 数据与响应仍可读，未知新版不能误判为资料完成。

## 6. 画板预检与缺口（编制时只读运行，**不等于像素通过**）

本次在设计服务 3352 上跑 `compare-redesign.mjs --list`，并以 `board-preflight.mjs --design b1-onboarding-cards.html --board-index 10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,33,36,38` 检了 **20** 块：工具小结 **近似 token 4、缺 token 90、疑似不自洽 0、疑似无功能 23**。缺项含设计容器手机外框的圆角／阴影／黑色岛、内容区 `30px` 间距、字距、#13 的 1.85 行高、#19 的 1.9 行高、#20 的 42px 字号、#36 的 1.45 行高等；外框装饰按规则 13 不实现，内容区先查 token，真缺的以精确数值和用途发 A 线补 token 请求。#10–#13 的 `1/5…5/5` 是不同步骤，不是自洽失败；#38 被启发式标出的 7 个 emoji 是视觉 chip，不能直接删。工具只列候选，不替代逐项判断。

| 预检维度 | 结论与实施前动作 |
| --- | --- |
| ① 数字自洽 | b1 A3 五屏编号自洽；目标「最多 3」及按钮「2 / 3 選択中」与 v2.2 **2** 冲突、示例「4/5」与 guide 三步冲突；先按 §2 改稿并复跑。 |
| ② 数据／交互来源 | 资料读写 `/api/profile`、目标／联系人／计划真实服务、示例演示世界、intake POST 已核实；每张画板的姓名、已选 chip、导入数、AI 文本、进度和按钮动作须填来源，无法取得的数据用只读 fixture，不写库截屏。 |
| ③ token / 组件 | 只用 A 线库；内容区缺值请求 A，不能在本线另造按钮、分段、Modal、toast 或硬编码色。设计手机外壳不实现。 |
| ④ 文案／行为冲突 | 生日任意与门禁必需、资料目标 3 与计划 2、资料 5 与计划 4／指南 3、固定 `4/5`，逐条按 §2 的代定改画板／行为；R18b 只交出 1701/1731，不让 R28 改 R18b 认证画板。 |
| ⑤ 宽度／主题／中途态 | b1 A3 多为 App 浅 / Web 1440 浅，只有目标 #61/#66 深；独立 `/start` 无完整画板；按 RD-33 在 b12 末尾补本线宽度、深色、离开续填、锁定／错误态。未补状态附截图标「设计稿无，不进门禁」。 |

实施者为 §8 每个 P 编 `preflight-checklist.md`：记录工具数字、数据源、token、冲突处理、进入状态的操作；改稿／补画后再跑。静态服务仅供 `--list`，用完停止。新画板须主会话代定并标版本；未给出的补画标题在下表用 **拟**，不可冒充现有 b12 画板。

## 7. 旧屏替换、路由与跨线请求

| 目标 | 处理 |
| --- | --- |
| Web 资料 | `/app/profile/onboarding` 从 `onboarding-0918` 迁新屏；`/app/profile/continue` 安全跳转仍可用。迁走 `onboarding-model.ts` 对旧 `profile-model.ts` 的标签引用、复用 R18a 新 editor session；`onboarding-0918/**` 所有调用归零才删。旧 `card-batch-ui` 引用改接 B 线已交的新导入路由／组件，不复制导入业务。 |
| Web 指南 | `/app/start` 去旧 `OrbitReferenceStyles` / `data-orbit-real-page` 和旧 `card-batch-ui`；新 ShellPage + `Orbit2026Scope`，保留三步逻辑、真实状态和 `?step` 防越级。示例开关关闭时仍读取真实指南进度并显示页面，不再跳 `/app/agent`。 |
| App | `/profile/onboarding` 用新屏，`/profile/continue` 保留安全 `next`；`/start` 真指南。新二级页回到 `/home`，但 `parentForPath` 属 D 线，C 只发精确映射请求。路由保护、离线清单、覆盖清单与 `route-parity` 跟实际新页面登记。 |
| 共享清理 | R18a 的 Web `profile-model` re-export、三份旧屏允许清单、旧 css / 字典只在全仓引用为零后删；旧路由兼容重定向保留。改到 `shared/**` 先 snapshot 再 App `sync:contract`，同一提交。 |
| 给 R10 的共用投影交接 | 首页与指南只用一份真实三步只读投影；R10 若先开工，在其归属路径创建并单独提交，R28 import；R28 若先开工，则在 C 线 guide 路径创建并单独提交，R10 import。交出契约、fixture、失败语义、提交号和两端同 actor 读回结果；两方都不复制完成规则。 |
| 给 D 线的请求（RD-31） | **Task › プラン** 两端在 `inDemo=true` 时恢复 b1 A4 示例横条（展开／药丸、继续 `/start`，由真实 `guideState.bannerCollapsed` 保存），从 R10/R28 共用投影拿 `n/3`；写入口先拦截并配服务端 403。D 独立改 Task 容器／插槽与 App `parentForPath('/start')='/home'`，附 Task 空／有计划／示例、浅深截图及回归，回传提交号。C 不列 Task 文件为可改。 |
| 给 A／B／R22–25 的请求 | A：§6 内容区精确 token / 缺的 UI 组件，R31a/b 后重比；B：已归 B 的 N12/N12b 只复测、异常交 B 修；R22–25：若 intake 返回 href、配额或回程契约实测不符，交具体失败用例，R28 不私改其流程。 |

## 8. 逐屏像素子 SC（HOW-TO §8；每行单独判定）

记号：`b1#n` = `b1-onboarding-cards.html` 的 `--list` 序号；`b12 拟…` = **尚未存在**、由主会话代定后只在 b12 末尾补画。原板只有指定宽／主题；补画完成前对应缺口必须写「设计稿无，附截图，不进门禁」。Web 1440 / 1024 / 390 × 浅／深，App 390×844pt iOS 模拟器浅／深；桌面与手机都截完整页含应有壳，系统状态栏／Home 指示条不实现。正式门禁逐带只放行可核验的 `[data]`／`[raster]`／`[contrast]`；raw 附报告但按 README RD-29 与决定表 §20 归因判定。每个编号在 `views` 配置中用**画板标题**定位补画，避免 b12 index 漂移。

| 像素子 SC | 路由 / 到达状态 | 已有原板 | 补画／验收 |
| --- | --- | --- | --- |
| P-A01 基本 | App `/profile/onboarding` 新账号 → 基本资料 | b1#10「① 基本资料」浅 | 深 b12 拟 A-R28-01d；AppScreen inset=kit。 |
| P-A02 目标 | 基本保存 → 目标、选 2 个 | b1#11「② 目标」浅、#61 深 | 改「2個まで」及计数；浅深全屏。 |
| P-A03 强み | 目标保存 → 提供／需要／话题 | b1#12「③ 能给 / 需要 / 话题」浅 | 深 b12 拟 A-R28-03d。 |
| P-A04 介绍 | 上步保存 → AI 草稿／手改／再生成 | b1#13「④ AI 自我介绍」浅 | 深与错误／手写态 b12 拟 A-R28-04*；付费截屏用只读固定结果。 |
| P-A05 导入 | 介绍保存 → 批量导入／稍后 | b1#14「⑤ 批量导入名片」浅 | 深 b12 拟 A-R28-05d；导入页本体归 B，只测入口／返回。 |
| P-A06 续填 | 任一步离开再从 `continue` 进 | b1#15「中途离开 → 续きから再開」浅 | 深 b12 拟 A-R28-06d；保存字段与步骤一致。 |
| P-W01 基本 | Web `/app/profile/onboarding` 新账号 | b1#16「① 基本资料（Web）」1440 浅 | 1024／390／深 b12 拟 W-R28-01*。 |
| P-W02 目标 | 下一步、选 2 个 | b1#17「② 目标（Web）」1440 浅、#66 深 | 1024／390 补画；改「2個まで」。 |
| P-W03 强み | 目标保存后 | b1#18「③ 能给 / 需要 / 话题（Web）」1440 浅 | 1024／390／深补画。 |
| P-W04 介绍 | 上步保存后、编辑／再生成 | b1#19「④ AI 自我介绍（Web）」1440 浅 | 1024／390／深及失败态补画。 |
| P-W05 导入 | 介绍保存后、导入／跳过 | b1#20「⑤ 批量导入（Web）→ A5 方案生成」1440 浅 | 1024／390／深补画；A5 导航用真实 intake。 |
| P-W06 续填 | 刷新／换浏览器后 `continue` | b1#21「中途离开 → 续きから再開（Web）」1440 浅 | 1024／390／深补画。 |
| P-A07／W07 指南 | App `/start` / Web `/app/start`：锁定、当前、完成 | **设计稿无独立整页**；首页三步卡参照 `app.html#0` / `web.html#0`，A5 参照 b1#26–38 | b12 拟 A/W-R28-07* 先补画并预检；未补时各态附截图、不进门禁。A5 本体沿 R23–25 门禁，不算 R28 新画面。 |
| P-A08／A09 示例 | 示例首页横条展开 → 收药丸 → 点写操作 | b1#22「示例横条（展开）」、#23「收起为药丸 → 写操作被拦截」浅 | 深 b12 拟 A-R28-08/09d；真实 n/3 文案改稿。 |
| P-W08／W09 示例 | Web 示例横条展开 → 收药丸 → 写入口 | b1#24「示例横条（Web）」、#25「药丸 + 写操作拦截（Web）」1440 浅 | 1024／390／深补画；固定 4/5 改真实 n/3。 |

`profile/continue` 纯重定向、读取错误与 401／403、配额耗尽、已有计划回程，若无独立画板一律写「设计稿无，附截图，不进门禁」；必要的产品画法由主会话代定后才进新 b12 画板。N12 App / N12b Web 现有板 `b12#120–123` 属 B 线手入力弹窗，只纳入 R28 跨线回归，不把它们算作本线像素通过。b1 #26–38 为计划 v2.2 原板，R28 验其入口和真实回程，计划页面像素结果引用 R23–R25 的证据。

## 9. 验收契约（16 条；操作链与证据）

| SC | 操作链 / 成功条件 | 证据 |
| --- | --- | --- |
| SC-R28-01 开工与预检 | R18c 已交付的实际 commit／共享 editor 路径、C 线 clean 基线、端口／库／模拟器隔离先核对；`--list`、§6 五维预检逐 P 完成；R18a/b/c 报告差异写明。 | SHA、两端测试基线摘要、画板清单、预检逐屏表。 |
| SC-R28-02 入口与 `next` | Web / App 新注册、登录、资料完整／不完整、流程未完／已完／旧账号无记录、邀请 `/i/<code>`、非法外站／循环／嵌套 `next` 各走一次：未登录进认证并保目标，门禁未过进资料，新账号流程未完给可跳过续填卡，已完或旧账号去安全目标；读失败显重试，无循环。 | 路由测试、两端录屏／截图、目标 URL 表。 |
| SC-R28-03 资料五屏与 D28-2 | 先登记 G18 `BREAKING.md`，更新共享 `ProfileOnboardingContract`／snapshot 并让 App schema 安全读取 v1/v2（未知新版不误完成），验证 App 旧服务回执后才切服务端 `calculateProfileOnboarding` 为 `policyVersion:2`；两端 GET/PUT/readback 同时覆盖 v1/v2。第一次资料 PUT 前初始化流程进度；按基本→目标→强み／ニーズ→介绍→导入操作，逐步 PUT 回执＋GET 复读后进度才前进，导入跳过也落完成；模拟「基本 PUT 成功、进度 POST 失败」再进仍给续填；进度 API 未登录 401、越号／未知字段 400、重放幂等、并发不倒退、换账号后不可见／不可改前一个账号的记录；姓名／行业缺失不能误完成，生日空以 null 可继续、填入非法日期报字段错误；离开／刷新／换设备／同账号双标签继续已存步。 | `BREAKING.md` 登记文字、先 App 后服务端的提交／测试顺序、服务＋渲染测试、契约 snapshot／App v1/v2 解析、回执／readback／进度记录、P-A/W01,03,05,06 截图。 |
| SC-R28-04 目标／文案 | b1:1701/1705/1731 与 App `GOAL_LIMIT` 变 **2**，第三个不能选；选两项顺序稳定，资料编辑器重开不丢；进入首次计划前用户核对第一目标文字和 `goalKind`，不静默误映射；日中英文 copy／计数均通过。 | 2／3 边界与 roundtrip 测试、P-A/W02、copy:qa。 |
| SC-R28-05 AI 介绍 | 日文界面请求 `ja` 得日文介绍，zh/en 仍按原语言；资料生成可手改，不自动公开／发送。**三次**限定同 actor 账号首次创建的 onboarding flow，首次成功占 1、再生成最多 2，完成流程／换端／重进／跨月均不重置；同 actor＋同 `idempotencyKey`＋同请求重放回同草稿且模型调用／额度不变，同键异体拒绝，不同键并发最多三次成功；失败同键重放不再调用模型，新请求用新键，内部修正重试按 §2.11 计实际调用，额度用尽或 AI 失败仍可手写。语气切换不产生额外付费调用；截屏用 fixture 不调费。 | 按 actor／周期／并发／幂等键的服务计数与三语测试、AI 调用账本和手写降级、P-A/W04。 |
| SC-R28-06 名片入口与续填 | b1 第五屏可从 B 线导入返回；导入 0／3／10 张时 UI 说明不把 10 当硬门槛，已有 B 线导入不回归旧 `card-batch-ui`；跳过后仍可去三步指南；续填保留安全 `next`。 | 入口／返回／批次读测试、P-A/W05/06、旧引用搜索。 |
| SC-R28-07 `guideState` 与硬顺序 | 0、2、3 位已确认联系人、目标空／非空、active v1／v2／示例计划；`currentStep=3` 但三条件未达成时绝不显示 3/3；?step=2/3 锁定时拒越级，?step=4 忽略；存量 skipped 只读、新 PATCH skipped 400、未登录先 401；`completedAt` 一次写入且后来删除联系人仍结束示例；两个设备折叠／当前停步一致。 | 纯函数、共用真实进度投影、API、CAS／actor 隔离测试、状态快照。 |
| SC-R28-08 App `/start` | App 资料完成后打开 `/start` 是真实三步指南；示例开关关／开时均能读真实进度；由步骤 1 添加／确认联系人、返回刷新成 1/3 → 步骤 2 保存目标成 2/3 → 步骤 3 真实计划成 3/3；离线／失败可重试，安全返回 `/home`；`route-parity` 已知红项变绿且无新增例外。 | App 模拟器操作链、共用进度投影回执、route-parity 输出、P-A07。 |
| SC-R28-09 Web／App 指南 → v2.2 | 示例开关关闭／开启时指南和首页真实进度均可读，未登录、锁定链接均正确；两端第 3 步显已保存第一目标，用户核对 `goalKind` → `POST /intakes` `source:onboarding`。Web 用 Web 响应 `href`；App 经现有计划 API 发送 `x-orbit-platform: app`，验响应 href 为 `/plans/flow/<id>`，用 Expo Router 进入背景／问题／AI 初版，确认后用 App href／`planTaskSegmentHref("app", planId)` 回 `/task?seg=plan&plan=<id>`；错误平台 href 显可重试契约错误，不跳 Web URL。直接打开未确认的后续阶段不能越级；刷新续接同 intake，连点不重复创建／扣费，配额／AI 失败有恢复出口；R10/R28 共用投影只由先开工者单独提交，另一方 import。 | 两平台请求头／响应 href／路由回程、幂等测试、两端 4 阶段操作录屏、P-A/W07、R23–25 门禁引用、共用投影提交号。 |
| SC-R28-10 示例模式 | 新人且未完成三步看到示例横条；收起为药丸，换端维持；任意本线写入口前端拦、服务端 403 `SAMPLE_READ_ONLY`，库／AI／通知零副作用；退出示例后真实数据恢复。N12／N12b 无状态时不显示数字。 | 前后端写拒绝测试、库／账本差异为零、P-A/W08/09 与 N12 回归。 |
| SC-R28-11 D 线 Task 请求 | 发 §7 的精确请求并给状态契约／fixture；D 回传独立提交后，Task › プラン 空／有计划／示例横条、展开／药丸、写拦截与指南继续全链复测；D 未交时本线标「待 D 线」，不私改 Task。 | 请求四栏、D 提交号、两端 Task 录屏与门禁记录。 |
| SC-R28-12 旧屏与共享引用 | `onboarding-0918`／旧指南／`profile-model` re-export 的引用依序迁移，`use-profile-editor-session` 新路径复用且不破坏 R18a；旧 `card-batch-ui` 引用为零或仅剩 B 线合法处；旧允许清单只减；App / Web 路由、审计与 App 离线清单跟新屏更新。 | `git grep` 调用方、ratchet／route／契约检查、diff 越线清单。 |
| SC-R28-13 资料像素 | §8 P-A01–06、P-W01–06 每行各宽／主题走完整页门禁；A 新组件与 kit inset 对齐、Web 壳与 CSS token 对齐；缺板状态仅截图／登记，未过不得写 done。 | `views/app-R28.json`、`views/web-R28.json`、raw／带数／归因表、triptych、补画 SHA。 |
| SC-R28-14 指南／示例像素 | §8 P-A/W07–09 每行逐屏过门禁，示例人数／进度与画板数据仅 `[data]` 归因；N12／N12b 引用 B 的既有画板回归；A／D 组件或 Task 未交则写「待组件库／待 D 线」并列重比条件。 | 像素总表、证据目录、跨线回传、缺板截图。 |
| SC-R28-15 失败、兼容与离线 | 资料 GET／PUT 失败、冲突、无网络；guide 读取失败、plan intake 503／限额、AI 不可用；App schema 读取旧 `policyVersion:1`／新 2／未知新版与附加字段、旧 v1 guideState／旧草稿；账号切换后无他人缓存；同步白名单／outbox 审计没有字段丢失。失败不记完成，不产生额外写。 | 错误码与 UI 对照、v1/v2/未知版解析测试、离线／同步审计、截图。 |
| SC-R28-16 收口与交接 | 两端全量、typecheck、lint、copy:qa、route parity 对基线零新增；SC 与 R28-01～04、G 口径逐条 REPORT，付费 AI 次数、像素未过和越线 diff 明列；给 A/B/D/主会话四栏请求与 DEFERRED「待用户授权」；独立复核重跑门禁和关键用例。 | REPORT／REVIEW、命令摘要、`git diff --stat`、交接与授权清单。 |

## 10. 执行顺序与检查点

1. 核 R18c / R18a 实际起点、两端基线和 import 图；确认 B 新导入入口及 R23–25 intake 可调用。共享文件有另一端未提交改动时停在该文件，继续独立画板／测试工作。
2. `--list` → §6 预检 → 主会话代定的 b1 改稿和 b12 补画；设计版本和 P 映射固定后再写对应屏。先给 A 内容 token 请求、D Task 横条请求，让其他线并行处理。
3. 先写状态／路由／数据测试；按 G18 登记生日政策 v2 契约，先让 App 读取 v1/v2 并完成共享类型／快照同步，再切服务端 `policyVersion:2`，用回执与真实 readback 核验两端。随后完成资料五屏与安全 `next`；不能只改单端。
4. 与 R10 确认真实进度投影的先开工者，创建方独立提交、另一方 import；同时解除 `features/guide/progress.ts` 首页和 `/app/start` 的两个示例门控。完成 guideState App 消费、两端三步指南及 App `/start`，用确认联系人／目标／计划派生进度验证锁定与 completedAt。然后接两端 plan intake POST 和平台化 href 的 v2.2 回程，不动计划引擎。
5. 补示例横条、折叠与写拦截；D 线 Task 交付后做跨线回归。清理旧引用与允许清单，检查 sync 白名单／离线策略。
6. R31a/b 组件到位后按 P 分屏跑门禁（Web 先 `--style-diff`，App 看数字）；单屏最多 3 轮。收口全量门禁、测试、REPORT 和独立 REVIEW。每个检查点写本轮通过、失败、仍可执行项，不把等待 D / A 扩大成整 Sprint 阻塞。

## 11. 失败、请求与授权交接

- **失败不是完成。** API 读失败、AI 调用失败、状态 PATCH 失败、画板缺失或归因未过都在 REPORT 给错误码、影响的 SC、复现链、下一次动作；`NOT_IMPLEMENTED` 只隐藏依赖块，普通 503 要重试。基线红项与新增红项分列，不能把未跑写为通过。
- **跨线请求用四栏：** 是什么／当前临时做法／接手必须做到／依据与重比画面。D 线 Task 示例横条和导航壳映射、A 线组件／token、B 线 N12 回归与导入、R22–25 intake 契约问题分别发给负责人；本线只交契约和证据。所有新增交接由主会话按 RD-31 更新 HANDOFF 与 DEFERRED，不让 C 在共享台账覆盖别人改动。
- **授权项：** 生产开 `ORBIT_GUIDE_DEMO` / `since`、正式付费 AI 额度政策、生产迁移／配置、Neon、部署、TestFlight／真机分发、推送与合回 `chat-agent` 一律停在用户授权前，登记 DEFERRED「待用户授权」。本机验证可使用现有 key 并计数，不把真实费用藏在门禁截图里。
- **收口报告最低字段：** 基线／收口命令摘要；16 条 SC 结果；R28-01～04 逐条结果；P 表每屏 × 宽度 × 主题 raw、超阈值带、归因与证据目录；主会话代定清单与改稿 SHA；被引用文件清理的全仓搜索；付费 AI 次数；越线 diff；A/B/D 请求和返回提交；未完成项的具体阻塞及可执行余项。
