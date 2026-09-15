# Sprint 0028 — “我的”页面组 Ink & Signal 改版

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../README.md)。
**原需求:** 2026-09-15 用户提供 `软件UI设计现代化 (5).zip`，要求为“我的”页面组编写新 Sprint 后交给 D 线实现。
**单一目标:** 将八个“我的”相关状态实现为真实可操作、隐私正确、跨端一致的新版页面组。
**易读目标:** [GOAL.md](GOAL.md)。**视觉与字段规格:** [DESIGN.md](DESIGN.md)。
**规划基线:** `chat-agent@577eadea52`；0026 正由 C 线在主工作区执行，0027 已保留给 C 线的日程详情，因此本任务使用 0028。D 线在独立分支 `codex/d-line-sprint-0028` 执行，不接管 C 线未提交文件。

## 进入条件与依赖

- 用户已选定附件中的新版设计并明确授权 D 线实施；本次 Sprint 文档就是设计／规格批准记录，不再为八屏视觉重复提问。
- 启动前 D 线读取根 `AGENTS.md`、`docs/sprints/RULES.md`、本 Sprint 三份文档、0003／0013／0020／0023 的最新 REPORT，以及 `bridge/status.md`／`bridge/handoffs.md`；以实际 `chat-agent` 最新提交合并或变基当前分支，不能基于旧 0007 快照实现。
- 0026 若尚未合入，D 线可实现不依赖 canonical identity 的展示与纯转换；任何 actor-scoped draft／HTTP 写入接线必须先包含 0026 的 canonical `accountId/actorId`，不得回退 raw Auth.js `user.id`。0027 与本 Sprint 无代码依赖。
- 开始 run-01 前登记 owner、Planner SHA-256、实际 HEAD、文件锁和现有 diff。每个待改函数／组件／handler 先做 GitNexus upstream impact；HIGH／CRITICAL 必须先报告具体 blast radius 再继续。
- Web/API 与共享契约会变化，实施期间必须保持一套 App 可访问的 Web/API。最后一次 Web／shared 修改后必须停止旧进程、重新生产构建、重启并验证 health，之后才能采集原生／跨端证据。

## 契约决定

### 资料与保存

- 继续使用 `GET/PUT /api/profile` 的版本／mutationId／onboarding 回执；八屏共享一个按 `API origin + canonical actorId` 隔离的 edit session。只有主编辑页“保存”发 PUT；标签、“更多资料”和预览只更新／读取当前 session。
- `bio` 最多 80 个用户可见字符；`offering`、`seeking` 各最多 5 项。服务端也验证上限、规范化空白和稳定去重，不能只在 UI 截断。
- 扩展公开资料为 `spokenLanguages?: readonly string[]`，扩展 handles 为 LinkedIn／X 时保持旧字段兼容。省略字段表示保留，显式空值表示用户清空；旧记录与旧客户端继续可读写。
- `relationshipGoal/targetRelationshipTypes/topics/headline` 不做破坏性迁移。新版可把其内容作为候选带入，但必须经用户确认；保存新字段不能清除旧字段。完整度继续以服务器返回为准，UI 不自行猜测 onboarding 完成。
- 版本冲突、网络失败、回执字段／mutationId 不匹配均保留原草稿和原 expectedUpdatedAt；重试同一意图复用 mutationId。切换账号或 API origin 后不能显示另一 scope 草稿。

### 建议、抽取与预览

- profile signal target 扩展 `bio/offering/seeking`；新增 actor-scoped dismiss 决策与幂等回执。采用、编辑后采用只更新当前草稿，最终资料仍由用户另点“保存”。
- “全部采用”只处理 pending；单项失败保留该项和错误，其余已确认项不重复。不能通过客户端隐藏模拟服务端 dismiss。
- 扫名片／上传简历复用现有 picker、抽取、证据与复核；原始文档字节不进日志，抽取结果不自动覆盖资料。付费 provider 非视觉验收必需，默认用受控零付费路径；若真实调用必需，继续全局 $5 硬上限与原账本。
- 新增一个纯公开投影函数作为主页／预览／AI self-profile reader 的共同边界；预览绝不包含生日、默认跟进节奏、私密 handles 或内部 provenance。预览自己的 CTA disabled，不产生写入。

### 设置与账号

- 设置页只展示有真实来源的行：通知、语言、账号／工作区、权限／隐私、服务器、退出。外观／文字大小可显示“跟随系统／标准”的只读状态；只有实现了真实持久化和应用范围后才可带 chevron 成为可操作行。
- 数据范围、导出、About 版本、工作区创建、个人空间、成员、邀请和角色变更不在现有服务契约内；本 Sprint 不新增这些后端能力。没有真实数据／路由就省略或明确不可用，绝不照抄 fixture。
- 退出登录继续撤销当前 session 并清理当前 scope 的未提交 profile edit session；失败可重试且不能泄漏已退出身份。

## 范围与文件白名单

同一 Generator 在 D 线独立 worktree 串行修改；只有 D 线在其分支暂存与提交。主线 C 线未提交文件、用户未跟踪设计素材和其他 Sprint 文档均不写、不暂存。

### Web/API 与共享契约

- `repos/orbits/shared/contract/profile.ts`
- `repos/orbits/features/profile/contract.ts`
- `repos/orbits/features/profile/service.ts`
- `repos/orbits/features/profile/live-service.ts`
- `repos/orbits/features/profile/mock-service.ts`
- `repos/orbits/features/profile/signal-contract.ts`
- `repos/orbits/features/profile/live-signal-service.ts`
- `repos/orbits/features/profile/mock-signal-service.ts`
- `repos/orbits/features/profile/storage/profile-live-record-provider.ts`
- `repos/orbits/features/profile/storage/profile-signal-live-record-provider.ts`
- `repos/orbits/features/profile/self-profile-reader.ts`
- `repos/orbits/app/api/profile/handlers.ts`
- `repos/orbits/app/api/profile/update-suggestions/handler.ts`
- `repos/orbits/app/api/profile/update-suggestions/[id]/accept/handler.ts`
- 新建 `repos/orbits/app/api/profile/update-suggestions/[id]/dismiss/handler.ts` 与 `route.ts`
- 对应既有 profile service／store／route／self-profile 测试；新建 `repos/orbits/tests/capabilities/profile-ink-signal-fields.test.ts` 和 `repos/orbits/tests/api/profile-suggestion-decisions.test.ts`

若 impact 证明 profile storage 的 payload codec 或 route factory 位于上表外，最多补入一个直接 provider／factory 文件，并在启动追加记录写出路径、SC 和 impact；不得借机改通用数据库、认证或账号模型。

### App 数据、路由和页面

- 通过 `npm run sync:contract` 更新 `repos/orbit-app/src/api/contract/profile.ts` 及同步索引
- `repos/orbit-app/src/api/profile-detail-contract.ts`
- `repos/orbit-app/src/api/endpoints.ts`
- `repos/orbit-app/src/view-models/profile.ts`
- 新建 `repos/orbit-app/src/data/profile-edit-session.ts`
- `repos/orbit-app/src/screens/profile/ProfileScreen.tsx`：收敛为“我的”主页容器，保留真实读取／统计／状态
- `repos/orbit-app/src/screens/profile/AccountScreen.tsx`
- `repos/orbit-app/src/screens/settings/SettingsScreen.tsx`
- 新建 `EditProfileScreen.tsx`、`ProfileMoreScreen.tsx`、`ProfileTagPickerScreen.tsx`、`ProfileSuggestionsScreen.tsx`、`ProfilePreviewScreen.tsx`、`ProfilePublicView.tsx` 于 `repos/orbit-app/src/screens/profile/`
- 新建 `repos/orbit-app/app/profile/edit.tsx`、`more.tsx`、`tags.tsx`、`suggestions.tsx`、`preview.tsx`，全部使用 private route boundary
- `repos/orbit-app/app/(app)/profile.tsx`、`app/settings.tsx`、`app/account.tsx` 只做必要 scope／路由接线
- `repos/orbit-app/src/i18n/messages.ts`、`zh.ts`、`ja.ts`、`en.ts` 仅新增 0028 所需键，用户内容仍通过 literal 边界显示
- 扩展 `tests/ink-signal-profile.test.ts`、`tests/ink-signal-settings-account.test.ts`、`tests/profile-completion-interactions.test.tsx`、`tests/profile-manual-edit-view-model.test.ts`、`tests/profile-suggestions-view-model.test.ts`、`tests/app-locale-profile.test.ts`
- 新建 `tests/profile-edit-session.test.ts`、`tests/profile-page-group-interactions.test.tsx`、`tests/profile-public-projection.test.ts`

新的可复用视觉组件只能在 `src/screens/profile/` 内新增，除非 GitNexus impact 证明设置与账号必须共同消费；不修改全局 `AppScreen`、`OrbitTabBar`、主题 token、API client、AuthSessionProvider 或导航基础设施来追求单页像素效果。

### 文档、证据与交接

- 本目录 `GOAL.md`、`DESIGN.md`、`PLANNER.md` 与八张 `assets/*.png`；执行结束后才新增 `REPORT.md`
- `repos/orbit-app/docs/sprints/README.md`
- 根 `bridge/status.md`、`bridge/handoffs.md` 及按模板新增的 0028 交接文件
- 运行证据只放被忽略的 `repos/orbit-app/build/harness-state/evidence/sprint-0028/run-01/` 和 `build/harness-logs/`，不提交真实账号、Cookie、token、原始简历／名片或私人资料

## 排除范围

- 不实施压缩包中不属于上述八屏的页面；不复制 HTML、固定手机外框、状态栏或 fixture 数据。
- 不新增工作区创建、成员邀请／角色、数据导出、资料分享、消息发送或加入人脉后端；预览 CTA 不对本人产生动作。
- 不删除 legacy profile 字段、不批量迁移生产资料、不改变 0003 的姓名／行业／生日 onboarding 规则，不把生日公开或交给 AI。
- 不用单纯隐藏控件、静态截图、源码字符串断言或 mock-only 页面冒充完成；没有真实 endpoint 的交互不能显示成功。
- 不部署、不写生产数据库、不清理真实记录，不更改 C 线 0026／0027 的产品文件。合并到 `chat-agent` 由协调者在 D 功能提交和报告完成后按用户既有总合并要求执行。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0028-01 | “我的”、设置、账号与工作区使用真实账号／统计／通知／语言／workspace 数据按 1c/3a 呈现，所有可见入口可达；未支持能力不伪造，失败不显示成 0 或示例数据。 | 现有 ink-signal 行为 harness 的 RED→GREEN；真实 HTTP 成功／加载／空／失败；390×844、320×844、fontScale 2 与深色截图；路由点击记录。 |
| SC-0028-02 | 点编辑资料后，主编辑／更多资料／两个标签选择页在返回、取消、键盘、旋转、账号或服务器切换时保持正确 session；bio 80 字、两组标签各 5 项、语言／links／生日／节奏均按契约保存，409 和 503 保留草稿。 | profile edit session、view-model、真实路由交互和 Web service/store RED→GREEN；省略／清空／旧客户端／CAS／幂等／另一 actor 反例。 |
| SC-0028-03 | 资料建议逐条采用、忽略、编辑后采用和全部采用具有真实持久化决策；只更新当前草稿，不自动写 profile，部分失败可恢复；名片／简历只产生待复核建议。 | suggestion service／route／App 交互测试；重复意图、stale、foreign actor、部分失败、picker cancel／failure 和零自动 profile PUT 断言。 |
| SC-0028-04 | 他人预览与实际公开投影一致，明确排除生日、默认跟进、私密 handles 和 provenance；预览自己的 CTA 不写入，主页／预览／AI self-profile 不发生字段漂移。 | public projection 与 self-profile reader 测试；敏感标记字段负断言、未保存草稿预览、另一 actor 隔离；iOS VoiceOver 名称和大字号证据。 |
| SC-0028-05 | 当前源码构建的 Web/API 与 iOS App 在同账号、同数据库双向编辑并回读同一资料；八屏逐图对照通过，Web/shared 最后变更后已生产重建重启，当前 Simulator 展示该功能提交。 | 两端定向＋typecheck＋受影响端全量；Web commit／build／URL／health、App base URL／build、脱敏 account/profile ID 与 version；Web→App、App→Web、409、另一账号隔离；八屏 Simulator 截图和差异记录。 |

## 一次 Generator 的执行顺序

每项都属于同一个 `run-01`，不得另派第二个 Generator 或 Evaluator。

### Task 1 — 冻结契约与公共投影（SC-02／03／04）

1. 同步最新主线并核对 0026 状态，登记基线、Planner hash、运行环境和文件锁；读取直接前序报告与当前 diff。
2. 对 profile contract、live service、signal service、storage provider、self-profile reader、App profile schema／view-model 逐个做 upstream impact；HIGH／CRITICAL 先报告。
3. 先写 Web RED：新字段旧记录兼容、80／5／5 上限、省略与清空、CAS／幂等、actor 隔离、dismiss／重复决策和公开投影不含私密字段。再做最小 contract/service/provider/handler 实现。
4. 运行 Web 完整相关文件和 typecheck；同步 shared contract 到 App，检查生成差异。公共投影必须只有一个规则来源，不能由主页、预览和 AI 各自过滤。

### Task 2 — 编辑 session 与五个 5a 页面（SC-02／03／04）

1. 先写 App RED：scope 隔离 session、旧字段候选、字数／数量、子页往返、取消、CAS 409／503、重复保存、建议采用／忽略／编辑／批量部分失败、抽取不自动写入和预览隐私。
2. 实现 `profile-edit-session` 与五个独立 private routes。主页只负责读取和进入编辑；子页只更新 session；主编辑保存一次 canonical PUT，成功后清理该 session 并返回最新版主页。
3. 把现有 picker／document extraction／suggestion 逻辑从 1900 行主页按职责迁移到对应页面，保留 request abort、scope generation、field revision 和 mutationId 行为；不复制一套旧逻辑。
4. 运行新测试完整文件、现有 profile completion／manual edit／suggestion 消费者和 App typecheck；在 React Native Web harness 对照五张 5a 图，先处理结构和交互再调像素。

### Task 3 — 1c/3a 主页、设置和账号（SC-01）

1. 扩展已有 ink-signal RED，锁定真实统计错误态、设置各真实入口、canonical 单 workspace、退出失败、未支持行不可交互、窄屏／大字号／深色和中日英。
2. 按三张图重构展示层，复用现有通知、语言、权限、服务器和 sign-out 行为。设置与账号页不因设计稿新增无后端能力。
3. 完成八屏 390×844 Web-rendered 视觉初检；对照字体、线条、间距、固定底栏与滚动，不用绝对定位把页面锁死在一台设备。

### Task 4 — 当前 Web 与原生集成收口（全部 SC）

1. 跑两端受影响完整文件、共享同步、typecheck 和本 Sprint含 H 变更的一次全量；执行 `git diff --check` 与 GitNexus `detect_changes(scope: staged)`，确认只影响 profile/settings/account 流程。
2. 停止旧 Web 进程；在目标环境生产构建当前功能提交，启动新产物并检查 health。保持该 Web/API 运行，App 指向其可达地址；若后续再改 Web/shared，重复构建与重启。
3. 浏览器保存一份含 bio、两组标签、语言、links 和私密生日的资料→Simulator 刷新逐屏回读；Simulator 修改并保存→浏览器回读同一 version；再做 409、另一账号不可见和预览隐私。
4. 在当前 iOS Simulator 逐屏完成入口、返回、标签、建议、更多资料、预览、键盘、中／日／英、大字号和 VoiceOver 名称；八张截图与源图逐项记录差异。五项 SC 全部满足才提交 REPORT／Bridge／README，否则按事实结束 blocked／failed。

## 最小测试与检查

**档位：H + I。** 本 Sprint 改 actor 私有 profile 写入、CAS／幂等、公开／私密投影、共享契约与跨端状态，且页面拆分会影响 onboarding 和 AI self-profile；开发中按 Task 定向，代码收口后 Web 与 App 各做一次全量和真实跨端／Simulator 验收。

Web cwd `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/d177/orbit/repos/orbits`（D 线按实际 worktree 路径替换前缀）：

```sh
node --test --import tsx tests/capabilities/profile-onboarding-and-manual-profile-editor.test.ts tests/capabilities/profile-update-conflicts.test.ts tests/capabilities/profile-private-birth-date.test.ts tests/capabilities/profile-signal-review-queue.test.ts tests/capabilities/profile-signal-review-live-store.test.ts tests/capabilities/self-profile-reader.test.ts tests/capabilities/profile-ink-signal-fields.test.ts tests/api/profile-suggestion-decisions.test.ts
npm run typecheck
npm test
```

App cwd `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/d177/orbit/repos/orbit-app`：

```sh
npm run sync:contract
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/profile-edit-session.test.ts tests/profile-page-group-interactions.test.tsx tests/profile-public-projection.test.ts tests/ink-signal-profile.test.ts tests/ink-signal-settings-account.test.ts tests/profile-completion-interactions.test.tsx tests/profile-manual-edit-view-model.test.ts tests/profile-suggestions-view-model.test.ts tests/app-locale-profile.test.ts
npm run typecheck
npm test
```

视觉证据必须包含八个目标页面、资料加载／失败、409 保留草稿、建议部分失败、标签上限、320pt＋fontScale 2、深色和至少中／日／英主路径。Web harness 用于快速对照，最终 SC-05 必须来自当前功能提交的 iOS Simulator；只启动 Metro 或展示旧 build 不算。

## 失败与交接

同一非预期失败按 RULES 最多两轮本地修复。任何生日泄露、跨账号草稿、旧客户端字段被清空、建议自动写 profile、版本冲突覆盖、空点击、fixture 成员或未重启 Web 都使对应 SC 失败。缺真实账号只阻塞真实跨端部分，不阻止契约、UI 和 Simulator 的独立实现；run 已开始后仍缺必需证据则以 blocked 报告结束，不降低 SC。

交接必须列：两端功能 SHA、0026 合入基线、实际追加白名单、profile/signal 契约变化、旧字段兼容、公开投影规则、Web 生产构建与重启、App base URL／build、同账号与另一账号证据、八图差异、所有 RED→GREEN 和失败历史。功能完成后由协调者合并到 `chat-agent` 并做用户要求的最终全量验证；D 线不得自行覆盖主线 C 的未提交工作。
