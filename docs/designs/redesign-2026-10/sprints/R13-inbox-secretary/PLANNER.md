# Sprint R13 — 受信箱・秘書来源

**Plan revision:** 2（2026-10-18；RD-33 主会话代定已采纳）。**执行者：**乙，Claude 子任务；B 线 `redesign-b` / `line-b`，接 R11b。**目标：**两端受信箱合一，D-15 秘書来源可供 R10 先接，D-16 邮件要约隐藏；推送留 R14。易读目标见 [GOAL.md](GOAL.md)。

**编制事实基准：**已重新 `git fetch origin redesign`；`origin/redesign` 为 `cb866e48fbb41e7f540bbf66177f9ae0ac597591`，本工作树 HEAD 仍为 `e464b18772cb3df6c10b845ed7a0f22bf3f06d6b`。下文代码行号以 `git show origin/redesign:<path>` 复核；执行者开工仍须更新 `line-b` 后按符号复核。本文只是执行契约，不表示功能已完成。本次文档会话**只修订 GOAL / PLANNER，不提交、不推送**。

## 0. 给执行者的说明

1. **开工与读物。** 只在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-b` 执行；先确认 R11b 的提交和 `origin/redesign`，读本页、GOAL、[README](../README.md) 的 RD-16、RD-24～RD-33 和通用规则 10–13、[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–10、[HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用 G01–G26 及 §R13/R14、[DEFERRED-A](../DEFERRED-A.md)、[screen-ownership](../screen-ownership.md) 的收件箱两端行、[决定表](../maintenance/2026-10-12-decisions.md) D32 / §20、[IMPLEMENTATION-PLAN](../../IMPLEMENTATION-PLAN.md) §1.8 / D-15～17、`events/DESIGN.md` §6.4、R11b REPORT、R18a PLANNER 和 R31a/R31b 组件交付。旧 HOW-TO 的分支、推送、GitNexus 和旧像素措辞以较新的 RD-29～33 为准；RD-32 不再跑 GitNexus。
2. **交付顺序是硬依赖。** SC-02「秘書来源契约 + mock + App 同步」是第一份**单独的 `contract:` 里程碑提交**，提交号、DTO、mock 响应、App 解析样例立即交给 D 线 R10；在它完成前不改首页、不开始 R13 两端页面。R10 可先按 mock 开发，live 未就绪时只隐藏秘書卡内真实数据，不伪造生产数据。其余无依赖的画板预检和 R11b 引用检查可并行调查。B 线不要改 D 的首页文件。
3. **环境与提交。** B 线沿用 R11b 的独立 Web 端口 / `distDir`、Metro 端口、本机测试库与模拟器 UDID，先核实不撞别线；设计稿静态服务另取 **3350+ 的空端口**，用 `uv run --no-project python -m http.server <端口> -d docs/designs`，比对脚本加 `--design-base`，用完停止。Python 只经 uv。只在本机测试库验证，不连 Neon、不做生产迁移/部署/环境变量或分发。付费 AI 本 Sprint 正常路径 **0 次**；若为别的回归确需真调用，限本机、先设可核对的配额与失败降级，并在 REPORT 记用途和次数（RD-33）。
4. **测试、改稿与提交。** 开工记录两端全量、Web `typecheck` / `typecheck:app` / `lint`、App `tsc` 基线；新功能先 RED，测试真实读写、渲染与边界。改 `shared/**` 后 App `npm run sync:contract`，同一个按路径提交带源和副本；快照重生成，破坏项写 `BREAKING.md`。只按本线文件路径提交，提交前 `git pull --rebase origin redesign`，提交后 `git show --stat HEAD` 查越线；**不推送**，交主会话独立复核后推送（RD-32）。汇总文档 README / HANDOFF / DEFERRED-A / 决定表 / screen-ownership 的四栏更新原文写 REPORT「文档更新请求」，由主会话协调。
5. **像素与失败。** 先 `--list`、`board-preflight` 和数据来源表，再从 HTML/kit 数值落到新组件与 token；Web 先 `--style-diff`，迭代 `--only`，收口完整门禁。Web 三宽度 × 浅深，App 真模拟器浅深；RD-29 / §20 以每条超阈带合法归因为通过，raw 记录作参考。每屏最多 3 轮；缺板、待 A 线组件、待 D/C 线入口、失败测试分别登记，继续独立 SC，不把缺项写成通过。截图、门禁结果和日志放 `~/orbit-sprint-evidence/redesign/R13/run-01/`；REPORT 与独立 REVIEW 按 SC 逐项核对。

## 1. 本线归属的文件 / 不许碰的文件（RD-31）

**B 线可改（仅本 Sprint 需要的部分，删除前核对引用）：**

- Web 收件箱：`repos/orbits/app/(app)/app/inbox/**` 的 `/app/inbox` 页面、现有 inline panel / typed tab / source page；新建 `app/(app)/app/orbit-2026/inbox/**`、本域 copy 和 CSS Module。保留 `/app/inbox/sources/[id]` 的已登录跳转/详情语义；B 线仅用壳插槽，不改壳本体。
- App 收件箱：`repos/orbit-app/app/(app)/inbox.tsx`、`app/inbox/**`、`src/screens/inbox/**`、本域 view-model / i18n、`app/chat.tsx` 与 `app/chat/[id].tsx` 的兼容跳转；`src/screens/chat/**` 只有在消息能力和离线队列完全迁入、全站引用清零后才可删。新基线已删除旧 `ContactDetailScreen.tsx`，联系人详情现由 R11a 的 `NetworkContactScreen.tsx` 承担，B 线不改该屏；若需要聊天入口，向人脈线提出深链请求。离线消息上传与镜像模块只在行为确需且有回归测试时作窄改。
- 契约/服务：`repos/orbits/shared/contract/secretary-preview.ts`、`shared/api-schema/secretary-preview.ts`、`shared/compute/secretary-source.ts`、`shared/mock/demo-world/` 本域 fixture，`features/notifications/secretary/**` 与 `app/api/inbox/secretary/preview/**`；必要时只追加 `features/operations/maintenance/configured-tasks.ts` 的本任务登记。已有 `features/events/journey/{notification-job,notifications,live-mapping}.ts` 仅可修与本 Sprint 事件通知分类、真实截止时间或幂等直接相关的分支；`features/events/assessment/recompute-job.ts` 先只读，已有 `event_pick` 不重建。`shared/contract/inbox-notifications.ts` 现有枚举只核对，不重复增加值。契约索引、capability registry、App 同步副本、快照、路由/离线/审计登记和只减不增清单只处理本域条目。
- 本域测试和 `repos/orbits/scripts/visual/views/{web,app}-R13.json`、`attribution-redesign-R13.json`；本目录后续 REPORT / preflight-checklist。主会话负责共享 b5/b11/b12 画板的补画与汇总文档，执行者提具体请求并在新画板合入后重比。

**不许碰（通过请求交归属线）：** A 线 App `src/components/ui/**`、Web `orbit-2026/ui/**`、token、kit、画板工具；D 线 App `HomeDashboardScreen`、`AppScreen` / `ShellTopBar` / `app-navigation.ts` 和 Web `orbit-2026/shell/**`、R10 首页；C 线マイページ、`ShellInboxRow`、设置页壳和 R18 流程；E 线 iOrbit；R14 才改的通知投递策略、device/push 导航白名单、偏好设置和邀请推送。B 线不直接删或改正在被别线引用的组件/文件；写明具体路径、所需接口、验收和版本给主会话。公共 `shared/**`/注册表只追加本域项，遇冲突 rebase 后按源重生成，不能覆盖另一线的未提交改动。

## 2. 主会话代定（RD-33，已采纳）

| # | 已定口径与依据 | 验收落点 |
| --- | --- | --- |
| §B-13-1 | **R13 / R14 拆开。** R13 做站内列表、来源、动作和消息；R14 做 D-17 系统推送、设置、7:50 合并、邀请双方推送及 `R13-04` 深链。投递有独立频控和真机门禁，分开能按受信箱稳定契约验收；R13 不调整现行每日 2+1 或静音时间。 | SC-01 / 16；§12 |
| §B-13-2 | **已存在的来源值不重复改契约。** 四个 D-15 `InboxSourceKind` 已在 `shared/contract`；本期新增的是「哪些来源构成秘書、给首页怎样读」的**独立预览契约**。`mail_summary` 保留为未来枚举值，当前生产/演示都不生成、不展示。 | SC-02～04 / 15 |
| §B-13-3 | **分流 R26 评分变化与每日推荐，复用 R27。** R26 `event_pick` 是参加者名单公开或评分变化后的通知，保留现有按评估签名写入的语义键；每日 Top-1 推荐另起独立语义键，不把 R26 通知当推荐，也不重写旧记录。两者在通知流分开展示；秘書卡按 `(eventId, kind)` 作稳定键，同一活动两者同时命中时只留一张，理由优先取 R26 的 `event_pick`。R27 `event_deadline/event_prep` 不重复生产。D-15 旧计划写「前一天/当天 7:50」，较新的 `events/DESIGN.md` §6.4 和已交代码是截止 48 小时前、活动当天东京 8:00；本期沿用已交生产者时点，7:50 合并**推送**交 R14。`secretary-digest` 只做 Top-1 规则和预览调度；校正 `event_prep` 分类、真实 dueAt，旧行兼容读取、不做生产回填。 | SC-03 / 04 / 15 |
| §B-13-4 | **秘書只显示可信、可用且去重后的来源。** 当前 `sourceAccess` 对三个 event kind 直接返回 available；本期为本人活动/评估/推荐加归属、状态与目标可用性校验。过期、取消、退出、权限失效按现有脱敏投影显示，不留 stale 标题或 excerpt。每日推荐按现有分数降序、稳定 eventId 破同分；只选未标「興味なし」且未报名的一项，每账号东京日最多一条；无候选则空，不用 AI/示例补。预览先按活动和卡片语义去重、再排序取 Top-3 与算 `hasMore`；R26 与推荐同活动时保留 `event_pick` 理由，双生产者重跑不增加秘書卡。 | SC-03 / 04 / 10 / 15 |
| §B-13-5 | **`chat` 两屏并入，不直接删能力。** `/chat` → `/inbox?tab=messages`，`/chat/[id]` → `/inbox/[id]`；新消息页必须读到既有资格校验、已读、站内双向消息与断网 outbox。旧路由可作为轻量兼容跳转保留到总验收，旧重页面在引用清零后删。b5 的「下書きまで」适用于 Gmail/外部联络；现有**已验证的 Orbit 站内发送**属于另一分支，应补画后验收，不能借改版丢失已排队消息。 | SC-07 / 08 / 13 |
| §B-13-6 | **R13-02 按归属交接。** D 线 R10 把现有首页 🔔 接成正式入口、读统一未读数与 `/inbox?tab=notifications`；D 确认上线且回归通过后，C 线 R18a 从マイページ移除 `ShellInboxRow`。B 线只验入口与去重，不改 D 的首页或 C 的资料页。若 R10/C 尚未交付，SC-11 如实标待依赖，其他 SC 继续。 | SC-11 / 16 |
| §B-13-7 | **D-16 隐藏到取得单独授权。** 不请求 `gmail.readonly`，不读正文、不建摘要表/账本、不出现「メール要約」示例或入口；Gmail 元数据消息线程、草稿保持已有能力。b5/b11 含摘要的画板须由主会话按此代定补画，新板才是门禁基准；旧板注明作废于本期。 | SC-02 / 05 / 06 / 12～14 |
| §B-13-8 | **动作能力驱动。** 画板显示的左滑/悬停三动作不能对所有行硬画：只在 DTO `actions` 包含 `read/accept/snooze` 且目标可用时显示。现有 event 通知仅有 read/dismiss/handle，`snooze` 服务只认 `reminder_plan`；给事件通知增加动作前必须实现事务内幂等、真实到期/过期约束和回归。暂不支持的动作在该行隐藏，补画此状态，不做点后报错的假按钮。 | SC-09 / 12～14 |

## 3. 交接条目逐条去向（收口 REPORT 逐条写结果）

| 交接 # | R13 处理 / 转出 | 对应 SC |
| --- | --- | --- |
| R13-01 | Web `/app/inbox` 从 inline 旧抽屉变 b5 列表/详情；保留 compose seed 和旧来源深链 | 06 / 07 / 10 / 14 |
| R13-02 | D 线 R10 正式 🔔 → C 线 R18a 删除マイページ行；B 线验实际链和条件，不越线 | 11；未交付写依赖 |
| R13-03 | 四个值已在契约，核对 App 读取宽进、真实生产者；`mail_summary` 因 D-16 隐藏 | 02～05 / 15 |
| R13-04 | **由 R14 实施**：推送 `/task?seg=` 的合法分段与真机落地；R13 只验受信箱内部目标跳转，不改推送生成方或白名单 | 10 / 16；§12 |
| R13-05 | 核对结果：`chat` 是独立真实站内消息/离线 outbox，故并入受信箱并保留旧路径跳转，不直接删除数据与能力 | 07 / 08 / 13 |
| R14-01～03 | **全转 R14**：落地白名单、邀请双方推送、偏好 `quietStart/dailyCap` 等和 strict 读取；R13 不预改 | 16；§12 |

**通用 G 项映射：** G01、G10、G11、G15～G17、G21 → SC-05/06/10/13/14（壳插槽、AppScreen `inset="kit"`、二级返回；壳由 D 线）；G02～G04、G24、G26 → SC-12～14（对比度例外/危险色/40 可见 44 触控/UiText/token）；G05～G09、G23/G23b、G25 → SC-01/12～14（RD-26/29 新归因、演示只读、设计稿缺口、组件请求和每屏三轮）；G12～G14 → SC-06/10/14（390 无额外搜索/⌘K、旧全局样式、公开/已登录路由边界）；G18～G19 → SC-02～05/15（mock、503 隐藏、响应宽进、未知来源跳条）；G20、G22 → SC-07/12/16（旧用法只减、三语与 Web cookie）。G06 的“两会话”按 RD-31 四线修订，G05 的旧 `[data]` 单一口径按 RD-26/29 修订；这些覆盖关系在 REPORT 标注，不能直接照旧句执行。

## 4. 已查清的代码事实（`origin/redesign@cb866e48fbb`；每项执行时复核）

1. **D-15 枚举已在代码。** `repos/orbits/shared/contract/inbox-notifications.ts:5–9` 已含 `event_deadline/event_prep/event_pick/mail_summary`，`:26–57` 的 DTO 有 `sources`、`target`、`actions`、`readAt` 和全局 `unreadCount`；不是缺枚举。App `src/api/schema/inbox-notifications.ts:12,20–28,38–48` 有 strict 写 schema、宽进读 schema，未知 kind/sourceKind 跳单条；`src/api/inbox-notifications.ts:5–25` 逐项校验、跨账号直接失败、保留服务端未读总数。新增来源值前先测 App 解析，不拿“已有四值”当 producer 已 live。
2. **秘書分类与首页预览尚无独立读接口。** App `src/screens/inbox/NotificationInboxList.tsx:7–10` 只有 all/reminder/suggestion/update/history；`useNotificationInbox.ts:20–31` 只按 `kind`/history 查询。Web `app/(app)/app/inbox/typed-notifications-tab.tsx:9,20–22,67–70` 同样只有五类。`shared/compute/inbox-local.ts:19–24,115–127` 的共享筛选只认 `InboxNotificationKind`，目前没有 secretary。`shared/contract/inbox-summary.ts:1–9` 只提供消息/通知两个未读数，不给首页 Top-3。
3. **R26/R27 已是活动来源生产者。** `features/operations/maintenance/configured-tasks.ts:289–323` 已登记 assessment 重算 `event_pick` 和 R27 活动通知任务；`features/events/assessment/recompute-job.ts:34–52` 的 `event_pick` 是参加者名单首次公开或分数变化通知，既有 `semanticKey` 为 `event-pick:<assessmentId>:<signature>`，**不是每日 Top-1 推荐**。`features/events/journey/notification-job.ts:16–43,43–65` 查报名/计划活动并每 10 分钟至多一轮；`features/events/journey/notifications.ts:1–6,37–50,74–98` 规定 48h 截止/东京 8:00 会前、同人同活动同类 semanticKey。现行 job 的 `dailyCap` / `sentToday` 回调仍是空对象（`notification-job.ts:53–59`），故不能宣称已遵守用户设置。
4. **现有事件分类有偏差。** `features/events/journey/live-mapping.ts:395–409` 把 `event_deadline` 写 reminder、`event_prep` 写 suggestion，两者只有 `read/dismiss/handle`；deadline 的 `dueAt` 用写入时点而非真实申込截止。D-15 要 prep 为 reminder。`features/notifications/inbox-record-service.ts:53–72` 的 upsert 按 semanticKey 幂等且重放不重置已读，但 reminder 无 `dueAt`/`scheduledFor` 会被拒绝；`:148–169` 的动作校验按 revision/idempotencyKey。修分类和时间必须连同必要入参、测试一起改。
5. **来源安全不能靠 kind 名称。** `features/notifications/inbox-record-service-factory.ts:45–55` 对三种 event 来源目前直接 `available`；`shared/compute/inbox-local.ts:50–83` 的脱敏投影会把不可用来源标题、正文、excerpt 清掉；`features/sync/inbox-domain-reader.ts:10–24,79–83` 对已同步记录做来源状态再核对。R13 应在服务端确认本人资格和事件/评估状态，不能因旧 `available` 分支把取消/无权活动露给首页。
6. **同步字段是显式白名单。** `features/sync/domain-registry.ts:288–307` 的 `INBOX_DEVICE_FIELDS` 罗列字段，App 收件箱镜像从 `inbox-notifications` 域读。任何新 preview/来源字段若进通知记录，都要核对服务端白名单、App 镜像和 schema；否则在线可见、离线消失。现有 `shared/compute/inbox-local.ts:9–17` 是服务端/App 同步副本的同一显示规则。
7. **App 已有合一入口但还是旧 UI。** `app/(app)/inbox.tsx:1–4` 进 `RelationshipInboxScreen`；其 `src/screens/inbox/RelationshipInboxScreen.tsx:320–323,517–562,592–603` 已有 threads/alerts 分段、独立消息线程与通知详情深链。`app/inbox/[id].tsx:1–4` 已进该线程；`app/inbox/sources/[id].tsx:1–4` 是来源详情。新屏须复用这些真实读写语义，不把旧组件整体包在新外观里。
8. **旧 chat 是真实能力，仍有直链。** `app/chat.tsx:1–4`、`app/chat/[id].tsx:1–4` 各自渲染独立旧屏；`src/screens/chat/RelationshipChatScreen.tsx:40–56,93–121` 读本机镜像或真实 conversation summary，`RelationshipChatDetailScreen.tsx:70–92` 读消息并接 outbox。新基线中 `src/screens/contacts/ContactDetailScreen.tsx` 已删除；R11a 新 `src/screens/network/NetworkContactScreen.tsx:121,151–156` 有草稿/联系动作，未再指向 `/chat`。旧 `/chat` 仍在 `src/view-models/initial-route.ts:244–247` 解析，`src/view-models/app-navigation.ts:102–103` 旧父页返回它，`RelationshipChatScreen.tsx:121` 仍进 `/chat/<id>`。`src/data/sync/message-outbox-mutation.ts:27–75` 冻结请求并严格查键，`message-outbox-upload.ts:44–65,67–85` 重试、校验回执与失效会话；不能删屏时误删上传/待发数据。
9. **Web 仍是旧抽屉页。** `app/(app)/app/inbox/page.tsx:9–14` 认证后渲染 `RelationshipInboxPage`；`relationship-inbox-panel.tsx:73–129` 用自定义事件和 sessionStorage 接 compose seed，`:132–143` 仍读旧 `/api/chat/relationship-inbox`。`inbox-shell-title.tsx:6–10` 只给壳传标题。`app/inbox/sources/[id]/page.tsx:5–9` 已有鉴权及来源深链；新列表不能丢 compose 与来源跳转。
10. **跨线入口现状。** App `src/screens/home/HomeDashboardScreen.tsx:294–305` 已画 🔔 并指 `/inbox`，但首页整屏正式化归 D 线 R10；`src/components/ShellBackBar.tsx:33–39` 定义マイページ次入口，`src/screens/profile/ProfileScreen.tsx:28,467` 使用它，归 C 线 R18a。R13 验收必须在 R10/C 线提交后实测，B 线不能把这两个文件列为可改。
11. **推送策略仍旧。** `features/notifications/delivery-policy.ts:24–35` 静音写死 22:00–08:00；`delivery-policy-repository.ts:90–101` 自动 2 件/建议 1 件；`shared/contract/notification-delivery-policy.ts:12–19` 虽有 R14 可选字段，App `src/screens/settings/NotificationDeliverySettings.tsx:9–21` 仍是旧文案/旧控件。R14 不可被 R13 的 UI 截图假装已完成。

## 5. 契约与里程碑（先交 D 线 R10）

**M0 — 首个独立提交，不能捎带页面。** 在 B 线新建 `SecretaryPreviewDTO`、响应 schema、纯来源判定/排序、demo-world fixture 和 `GET /api/inbox/secretary/preview` 的 mock/`NOT_IMPLEMENTED` 路由。提交只含这些、同步 App 副本、必要的索引/快照/测试；提交号与接口样例即交 D 线 R10，主会话按路径将该提交纳入共享 `redesign` 后通知 D 线锁版本。R10 只改自己首页，不能复制 B 线判定函数。首提交后 R13 再接 live，不改 DTO 形状；若必须破坏，先登记 `BREAKING.md` 并再交 D。切勿把“契约有枚举”冒充已完成 M0。

```ts
type SecretaryCardKind = 'event_deadline' | 'event_prep' | 'event_pick' | 'daily_recommendation';
type SecretaryPreviewItemDTO = {
  key: string;             // 稳定卡片键：eventId + kind
  eventId: string;
  kind: SecretaryCardKind; // 卡片语义，不是 InboxNotificationDTO.kind
  notification: InboxNotificationDTO;
};
type SecretaryPreviewDTO = {
  actorId: string;           // 必须等于当前登录 actor
  items: readonly SecretaryPreviewItemDTO[]; // 0..3，已做来源校验、去重和权限投影
  hasMore: boolean;          // 同一过滤条件下是否还有可见项
  asOf: string;              // 带时区 ISO instant
};
```

- **来源集合与分流：**`event_deadline | event_prep | event_pick` 是现有 `InboxSourceKind`；`daily_recommendation` 只作秘書卡语义标签，不扩现有来源枚举或通知 `kind`。`mail_summary` 保留值但服务端不产生、preview/list/fixture 不含。R26 的 `event_pick` 维持原签名语义键及 id；每日推荐若写通知也使用现有 `event_pick` 来源值，但以独立语义键前缀、文案和预览 `kind=daily_recommendation` 与 R26 分流，通知流分别展示。秘書卡稳定键为 `(eventId, kind)`；同一活动的 R26 与每日推荐碰撞时预览只留一张 `event_pick` 卡及其理由，原通知记录均保留。同一活动多次 R26 变化只取最新有效卡。不可由 `InboxNotificationDTO.kind=suggestion` 猜秘書，也不可把推荐文案套到 R26 通知上。
- **读取：**preview 只取当前 actor 下 active、未失效、目标可用的来源，先按上述规则去重，再按 `notification.occurredAt desc, notification.id desc` 取前三张；`hasMore` 在同一去重结果上计算。不能先取普通通知第一页再前端过滤——60 条较新的普通通知后仍有一条秘書时，应返回那条。响应未知字段丢弃；未知 `kind`/`sourceKind` 跳条，全局 `/api/inbox/summary` 未读数不得被可见页数反推。App 离线读同一来源规则和 `sourceState`，失败/无镜像分别显示错误/尚无数据，不把旧账号镜像当本账号。
- **演示世界与 live：**fixture 只用 `demo-world` 的人/活动、带 `sample: true`、和响应 schema 同形；只读，不写库/不调 AI。live 未交时按 `whenNotImplemented` 隐藏真实秘書条目；R13 完成 SC-04 后才开 live。预览读接口要复用 inbox 已有 actor/source 校验与投影；因失败不回带敏感原文。首页点「受信箱『秘書』ですべて見る」进 `/inbox?tab=notifications&filter=secretary`（Web `/app/inbox?...`），两端参数同语义，其他值落 all。
- **同步/严格性：**共享源更新后同提交 App `sync:contract`，服务端写入/request `.strict()`，响应宽进且 owner 不匹配整页拒绝；合同快照和 parity 检查通过。新增通知字段若有，核对 `INBOX_DEVICE_FIELDS`、App mirror 的序列化/解析和 R14 的投递读取，做在线→同步→离线往返测试；本期优先复用既有 DTO，避免新字段。

## 6. 来源、分类、消息和动作契约

| 项 | 本 Sprint 可执行口径 | 必测边界 |
| --- | --- | --- |
| `event_deadline` | 复用 R27 已评估「参加予定に追加」且未报名、申込截止 48h 内的通知；`kind=reminder`，`dueAt` 为真实报名截止，目标为现有活动报名/详情 | 截止已过、已报名、活动取消、相同 semanticKey 重跑、因 10 分钟轮询延迟 |
| `event_prep` | 复用 R27 已报名/待审核的会前通知；`kind=reminder`、真实活动开始时刻/准备落点；按较新 R27 东京 8:00 口径 | 退票、改期、跨东京日、旧 `suggestion` 行兼容与新行不重复 |
| `event_pick`（R26 生产者） | 表示已评估活动的名单公开 / 评分变化；保留 `event-pick:<assessmentId>:<signature>`、原通知和结果页目标，不把它当每日推荐 | 原签名重跑不重复、不重置已读；评分变化文案与推荐文案分开 |
| `daily_recommendation`（秘書卡语义） | `secretary-digest` 从既有活动推荐服务按规则取当日 Top-1；通知沿用 `sourceKind=event_pick` 但用不同语义键前缀，预览标为 `daily_recommendation`。与 R26 同活动时只显示一张 `event_pick` 理由卡 | 分数同分、已「興味なし」、已报名/取消、无候选；两生产者交错重跑后按 `(eventId, kind)` 稳定且秘書卡不重复 |
| `mail_summary` | 枚举保留，所有生产和 UI 入口关闭；GMail 元数据线程与已有草稿不受影响 | 搜所有本期 fixture/按钮/响应无摘要，未申请 `gmail.readonly` |
| 消息与线程 | Gmail/主催线程只读/外发草稿；已验证 Orbit 站内会话保留现有资格检查、真实消息及 outbox。列表的消息/通知未读数取 `/api/inbox/summary`，分页保持各自游标 | 另一个 actor、失效资格、断网先入队再上传、重放一次、结束会话不发送 |
| 通知动作 | DTO `actions` 决定行按钮；read/dismiss/handle/accept/snooze 仍走 `/api/inbox/notifications/[id]/actions` 的 revision + idempotencyKey；加入 To-do 成功才出现任务链接。对事件若扩 `snooze`，先实现事务安全的通知时间更新且不能跨过过期；否则该行不画动作 | 双击、409 冲突、离线不可写、重试同 key、expired/unavailable 无操作、Web 与 App 一致 |

按日分组以账号时区计算（无有效时区按 `Asia/Tokyo` 显式兜底），同一条记录不因分组重排/切语言变更 id；「7:50 にまとめて」是 R14 真实合并推送的批次标记，本期没有批次数据时不显示该文案。详情跳转先标已读并确认回执；目标不可用时只显示脱敏状态且无跳转。Web 旧 compose seed 一次性消费、校验允许字段和目标，不能从 URL/sessionStorage 注入未验证的收件人或自动发送。

## 7. 旧屏替换与跨线接口

- App `/inbox` 与 `/inbox/[id]`、`/inbox/notifications/[id]`、`/inbox/sources/[id]` 保留路径接新屏（`AppScreen inset="kit"`，二级页返回到受信箱原 tab/filter/滚动）；`/chat` 与 `/chat/[id]` 保留轻量重定向，非本人的/无效 id 仍由新页拒绝。新基线的 `NetworkContactScreen` 没有旧聊天入口；如产品需要恢复，给 R11a 人脈线提新深链请求，B 线不改该屏。删旧 `RelationshipChat*` 组件前用 `rg` 核查所有代码/测试/离线审计引用，迁移其能力与登记，不能直接删被别线引用的文件。App `initial-route` 对旧链接的接受可保留；`parentForPath` 和 App shell 父页若需改，写给 D 线的具体请求。
- Web `/app/inbox` 保留登录保护，重写为 ShellPage 的 title/subtitle/左右插槽、左列表/右详情；保留 `/app/inbox/sources/[id]` 的身份校验。旧 panel 的 compose/open 事件要迁到新页面适配器，引用清零前不删 event bridge；左栏/1024 抽屉/390 胶囊是 D 的壳，B 不改。新 Web 页面 CSS 仅本域 Module + token，`Orbit2026Scope` 与 `ToastProvider` 不嵌旧页面作用域。
- **交 D（R10）：** M0 DTO、mock 响应、`GET /api/inbox/secretary/preview`、筛选落点和全局未读 API；要求首页 🔔 从任何状态都进通知 tab，红点与读数一致；D 负责壳路由/标题与 App `parentForPath` 请求。
- **交 C（R18a）：** 等 D 正式入口可用后从マイページ去 `ShellInboxRow`，同时保留其它行、回归旧画板更新版本；R14 通知设置路由/内容插槽由 C 和 B 协调，R13 的 ⚙ 只能进入真实可用的设置页，不出现假动作。
- **交 A（R31a/R31b）：** 若 Segmented、UnderlineTabs、滑动操作/hover actions、两栏列表、右详情、虚线确认卡、空态或抽屉无法用已交库表达，写组件名/画板 ID/缺少的属性和期望尺寸请求，B 不在页面里做私有仿件。组件合入后重比。

## 8. 像素 SC 与画板预检（屏幕 ID ↔ 实查画板）

2026-10-18 在本机 `3351` 静态服务（已停止）运行 `compare-redesign.mjs --list --design b5-me-inbox.html` / `b11-nav-v3.html` / `b8-responsive.html` / `b12-missing-states.html`：b5 的收件箱是 #0–8、深色 #65/#69；b11 秘書是 #26–30/#51；b8 **没有独立收件箱**的 1024/390 画板，b12 也没有 R13 的相应补板。序号只对当前 `origin/redesign` 有效；补画后用稳定 ID 和 `--list` 重新锁定。

| 屏幕 ID / 到达方式 | 画板（当前） | 门禁计划 |
| --- | --- | --- |
| A-R13-01 `/inbox?tab=notifications`，空账号 | b5 #0，phone 390×844 浅 | App 浅；深色设计稿无 |
| A-R13-02 通知少量/确认卡 | b5 #1，phone 浅 | App 浅；深色设计稿无 |
| A-R13-03 通知大量/筛选/左滑 | b5 #2 浅、#65 深 | **含邮件摘要示例**，由主会话补无 mail 版本后进门禁；旧板只作结构参考 |
| A-R13-04 切「メッセージ」大量 | b5 #3，phone 浅 | App 浅；深色设计稿无 |
| A-R13-05 消息→线程→折叠历史/草稿 | b5 #4，phone 浅 | App 浅；站内真实发送分支设计稿无 |
| A-R13-06 通知→「秘書」 | b11 #26，phone 浅 | 含邮件摘要，主会话补无 mail 版；b11 #28/#50 是 D-16，本期作废 |
| A-R13-07 秘書期限→详情 | b11 #29，phone 浅 | App 浅；数字只用真实活动数据或只读 fixture |
| A-R13-08 秘書推荐→详情 | b11 #30，phone 浅 | App 浅；没有合格推荐时「设计稿无，附截图」 |
| W-R13-01 `/app/inbox` 空账号 | b5 #5，web 1440×960 浅 | Web 1440 浅；深色/1024/390 设计稿无 |
| W-R13-02 通知少量/hover | b5 #6，web 浅 | Web 1440 浅；其余设计稿无 |
| W-R13-03 通知大量/分类/确认 | b5 #7，web 浅 | 含邮件摘要，主会话补无 mail 版后进门禁 |
| W-R13-04 消息列表/阅读区/右栏 | b5 #8 浅、#69 深 | Web 1440 浅深；1024/390 设计稿无 |
| W-R13-05 通知→「秘書」 | b11 #27 浅、#51 深 | 含邮件摘要，主会话补无 mail 版后进门禁 |

**主会话补画请求（不由 B 线擅改共享板）：** 在 b12 末尾追加稳定标号的无 mail 版本 `A-R13-03/06`、`W-R13-03/05`（各浅深）；明确 b5 #2/#7、b11 #26/#27/#51 在 R13 本期作废，但不影响其原型历史。App 消息真正站内发送、空/少/线程深色、Web 空/少/通知大量深色及 Web 1024/390 若主会话补画，则先 `--list` / 预检再进入门禁；补画前逐项**「设计稿无，附截图，不进门禁」**，不可拿 1440 缩小或把有 mail 的旧板当合格对照。R14 的 b5 #9–13、b11 #31/#32（锁屏、长按、着地、设置）**不属 R13**。

**已做的代表屏预检（只读，执行时对全矩阵重跑并存 `preflight-checklist.md`）：** `board-preflight.mjs --design b5-me-inbox.html --board-index 2,8 --no-variants` 报 #2：51 项中精确 44、近似行高 1.45×9、缺 token 6、自洽疑点 0、中途展开态；#8：61 项中精确 60、缺 token 1、自洽疑点 0，且「スレッドを検索」输入框要有真实搜索/过滤行为。`b11 --board-index 26,27,29,30 --no-variants`：#26/#27 的行高 1.45 近似、分别缺 token 7/3；#29 行高 1 近似、缺 6；#30 缺 6，四块均未报画板内数字自洽错误。缺项多数是 phone/web **展示外框**的 54px 圆角/阴影、黑色灵动岛和 30/60px 外边距，按规则 13 不实现；真实内容的 1.45 行高、16.33px 间距、字距 0.01em 与 Web 选中阴影要按 kit/token 精确核对，缺正式 token 向 A 线提请求，不手抄近似值。#30 的 4 个 emoji chip 是内容标识，需对应计划/业界/参加者/地域真实字段；若字段没有，主会话补无该 chip 的板，不凭空造数。

**正式预检五项：** ①每板未读数与各分段/筛选/可见行的口径分开，示例 `9/3/8` 是不同状态，不能拿一屏拼算；②每个标题、人数、日期、筛选、动作、搜索、详情/设置按钮列出 API 字段/功能，没有来源就改稿或隐藏；③token 缺口由 A 线补，装饰外框剔除；④先核对新组件与 G23/G23b，不能在本域造旧组件；⑤demo fixture 用同一演示世界、`sample:true`、同一账号时间线，开发态 `design=`/展开开关只在开发包，生产构建测试保证不存在。App `AppScreen inset="kit"`，系统状态栏/Home 指示条不画。像素收口等 R31a/R31b 组件合入；主会话补画后先重新预检。

**门禁证据：** 每个已认可屏幕 × 宽度 × 主题附 raw、超阈带数、`[data]/[raster]/[contrast]` 逐带归因、三联图与 `attribution-redesign-R13.json` 路径；Web 1440/1024/390 × 浅深、App 真模拟器浅深都要有一行（没板的明确标设计稿无）。Web 先样式 diff，App 看数字与必要裁剪图，整屏 raw 只作参考；不明差异不能靠 `[data]` 盖过缺块。独立 REVIEW 重跑改过/未过和 ≥20% 已过画面。

## 9. 范围与测试边界

**本期不做：** D-16 Gmail 正文授权/摘要/付费模型及真实个人邮件发送；R14 的系统推送注册、频控、静音/7:50 合并、锁屏与长按、推送深链白名单、双方邀请推送和通知设置正式页；D 线首页结构/导航壳；C 线マイページ或设置壳；A 线 token/组件改动；E 线 iOrbit。首页需要的只是 M0 接口与可核验的 live 结果。生产迁移、部署、环境变量、Neon、TestFlight 和 `redesign` 合回都登记 DEFERRED「待用户授权」，不以本机成功代替。

**回归重点：** 未知 `sourceKind` 只跳该条、跨账号响应整页拒绝且未读总数不从列表重算；62 条以上非秘書通知也能取较旧秘書 Top-3；R26 评分变化和每日推荐分流、同活动一张秘書卡、双生产者交错重跑不重复、不复活已读；R27 重放不重复；`event_prep` 分类、真实 dueAt 与旧行兼容；取消活动/资格撤销后服务端和离线镜像都脱敏；断网发送消息队列重放仅一条、会话终止标失败；App / Web 未读数与首页角标在离线回网后和服务端对账；D-16 所有非生产 fixture 以外的入口消失；Web compose seed 只消费一次、不能自动发送；测试库无付费 AI 调用。

## 10. 验收契约（16 条；操作链与主证据）

| SC | 操作链 / 预期 | 主证据 |
| --- | --- | --- |
| **SC-R13-01 基线/依赖** | 更新 B 线→核 R11b/R31a/b 版本、两端基线、旧引用；跑 §8 `--list` 和预检；列 D/C/A 请求和 R14 转项，不越线 | 基线摘要、版本号、预检输出、依赖清单 |
| **SC-R13-02 M0 契约里程碑** | 先写失败契约/演示测试→新增 `SecretaryPreviewDTO`/schema/纯来源规则/mock 路由→App `sync:contract`→快照与 parity 绿→**单独按路径提交**→把提交号/样例交 D 线；live 尚无时生产 503 隐藏 | 独立 commit stat、合同快照、App parse、demo fixture、D 线收件记录 |
| **SC-R13-03 来源归类/既有生产者** | 本机制造计划未报名、已报名、评估名单首次公开/评分变化→维护任务分别产生 deadline/prep/R26 `event_pick`；R26 旧签名重跑 id/已读不变，评分通知不冒充每日推荐；prep 为 reminder、dueAt 是真实日期；不生第二套期限通知；取消/失权后脱敏 | fake-clock 服务测试、测试库行与来源状态、维护任务名/计数 |
| **SC-R13-04 秘書推荐/live 预览** | 推荐服务给 2 个候选→按分数、eventId 选每日 Top-1→「興味なし」后替补/无候选则空；R26 评分变化与 Top-1 分别写入/展示通知，二者同活动时预览仅一张 `event_pick` 理由卡；双生产者交错重跑、同日重跑均不增卡且 `(eventId, kind)` 稳定；60 个新普通通知前的旧秘書仍可进 preview→D 首页 3 条/hasMore 与受信箱落点一致；零 AI | 双生产者重跑测试、规则测试、preview HTTP/schema、actor 隔离、D 线联调截图 |
| **SC-R13-05 App 通知页** | 🔔 或直链→`AppScreen inset="kit"` 的通知 tab→分类 秘書/提醒/提案/更新/履历→分页/已读数/日分组→离线镜像/回网；未知 source 跳条、actor 错误不显示 | 真实渲染与模拟器录屏、HTTP/镜像测试、A-R13-01～03/06 |
| **SC-R13-06 Web 通知页** | 左栏 `/app/inbox`→新标题/分段/左列表右详情→分类/hover/按日/分页；390 标题仍在且无额外 ⌘K；Web 来源旧深链需登录 | Web 1440/1024/390 操作截图、路由/渲染测试、W-R13-01～03/05 |
| **SC-R13-07 消息合一与旧链接** | App/Web 切消息→已有 Gmail/主催/站内线程只显示授权对象；`/chat`、`/chat/[id]` 老直链落新页且返回保留 tab；新联系人详情若需聊天入口先交 R11a 归属线；Web compose/open seed 只一次、无二次草稿 | 路由/资格/compose 测试、两端操作链、引用清单 |
| **SC-R13-08 站内消息/草稿/离线** | 已验证站内会话发一条→断网再发一条入 outbox→回网确认只投递一次；会话资格撤销队列标失败；Gmail/外部只可编辑/复制/打开草稿，无自动发送或正文摘要；旧 chat 重组件清理后同步/上传仍绿 | 消息上传/镜像回归、真实渲染、A-R13-04/05 与 W-R13-04 |
| **SC-R13-09 通知动作** | 可行动行 read/accept/snooze→回执后列表/未读同步，双点/同 key 重放不多任务；不可行动/过期/失效行不露按钮，409 刷新保留提示；未做事件 snooze 时不画「1時間後」 | 服务事务与 UI 测试、动作矩阵、测试库任务数 |
| **SC-R13-10 来源详情与目标** | 通知详情→来源状态校验→有权时到活动/准备/To-do/联系人；无权/取消显示脱敏且不能跳；App 二级返回到原筛选，Web 旧 `/app/inbox/sources/[id]` 仍鉴权；推送 `/task?seg=` 留 R14 | route/auth/来源测试、深链操作表、脱敏截图 |
| **SC-R13-11 跨线正式入口** | M0 后 D 线 R10 🔔 正式入口/全局未读已合入→B 验点击与红点→C 线 R18a 删除マイページ受信箱行→B 验页面只剩一个正式入口；若 D/C 未交则只标待依赖，不能 B 改其文件 | D/C 提交号、联调截图、`rg ShellInboxRow` 使用点/交接回执 |
| **SC-R13-12 文案/隐私/异常** | ja/zh/en 切换，Web cookie 不加 `?lang=`；空、加载、离线、503、401、来源失效均有可读状态；页面不说内部「来源/证据」，无 Gmail 正文/邮件要约/无来源的示例数字 | copy:qa、渲染/可访问性测试、字符串/网络请求审计、设计稿无截图 |
| **SC-R13-13 App 像素** | §8 每个 `A-R13-*` 已认可板的 URL/步骤→真模拟器浅深→逐带归因；缺板/待 A 组件/站内发送补板逐项标「设计稿无，附截图，不进门禁」 | `views/app-R13.json`、attribution、逐屏 raw/带数/截图 |
| **SC-R13-14 Web 像素** | §8 每个 `W-R13-*` 已认可板→1440/1024/390 浅深→style-diff 后逐带；旧含 mail 板只用于结构，不冒充通过 | `views/web-R13.json`、attribution、逐屏 raw/带数/截图 |
| **SC-R13-15 契约/同步/无回归** | 源/副本同步→响应未知枚举、strict 写入、名单跳条、白名单在线→离线往返；离线操作回网后 App / Web 各自消息数、通知数、首页角标逐项与服务端 `/api/inbox/summary` 对账，不拿当前页可见条数反推；R26/R27、R11a/R11b、R18a/R10 相邻路径回归；两端全量/typecheck/lint 对照基线零新增失败 | 合同快照、sync diff、离线前/回网后两端数值与服务端响应对账表、测试摘要与失败名（若有） |
| **SC-R13-16 REPORT/复核/转出** | REPORT 逐行对照 §3、代定、像素、代码事实偏差和越线检查；把 R14-01～03 与 R13-04、缺板/组件/跨线依赖、生产授权写四栏原文交主会话；独立 REVIEW 重跑未过/改过及 ≥20% 已过 | REPORT/REVIEW、按路径 commit stat、交接回执、DEFERRED 请求 |

## 11. 执行顺序

1. **SC-01**：B 线更新、记录测试基线、读 R11b/R18a/R31 与画板；主会话先排共享板补画请求。核对现有 chat/消息能力和文件归属。
2. **SC-02 第一提交**：只交秘書来源/preview 契约、mock 与同步副本，单独 `contract:` 提交给 D 线 R10；D 可开始首页 UI，B 随后继续。若新 schema 测试红，修契约后再提交，不能送未验证版本。
3. **SC-03/04**：在本机测试库修现有活动通知分类/时间和来源校验；保留 R26 评分变化通知，另做 `secretary-digest` 的每日 Top-1 规则与 live preview，并用双生产者交错重跑测试一活动一秘書卡。R26/R27 没有的真实事实就空，不用 AI。维护任务漏注册/版本老旧必须在 REPORT 记清，不宣称部署已生效。
4. **SC-05/06/07/08**：按 App/Web 新组件库替换两端收件箱；先实现通知与消息读路径，再迁旧 chat 的站内发送/离线队列，最后改旧直链与删仅自身引用的重组件。**不先删旧屏**。
5. **SC-09/10/11/12**：动作、深链与来源失效回归；在 D 的正式 🔔 与 C 的行移除合入后做跨线验收，不改他线文件。D/C 尚未合入时继续像素预检、契约和已授权的其余项。
6. **SC-13/14/15/16**：A 组件与主会话新板合入后跑门禁；缺板明确不进门禁。两端全量、REPORT、独立复核和交接。每一步的失败只卡其依赖，独立项继续。

## 12. R14 预告（单独 Sprint，同 B 线；本文件不充当 R14 的 PLANNER）

R14 从 R13 的站内事件/目标契约接手 D-17：`quietStart/quietEnd` 默认 22:00–7:30、`dailyCap` 1–3 默认 3、东京日频控、面談 30 分前可关例外、夜间 defer 在 7:50 合为 **1 通**、通知与站内记录分别保留；App/Web 偏好 UI，先把 `NotificationDeliverySettings` 响应读取改宽进再启用新字段（R14-03）。**R13-04 全由 R14 实施**：`notification-model.ts` 加 `/contacts/*` 和 `/contacts/new/scan/*` 白名单（R14-01），推送生成方只发 `/task?seg=todo` 等合法分段，真机点提醒落 To-do；R13 只验收受信箱内的目标落点。邀请成功双方推送、用现有 contact/source 类型（R14-02/D32）。b5 #9–13 与 b11 #31/#32 为其画板；D 线壳/C 线设置入口先交契约，R14 自己验真机与系统权限。若需要生产迁移/环境变量/部署，在 DEFERRED 标「待用户授权」，本机通过不等于生产启用。

## 13. 失败、请求与交接

- **画板/组件：** 当前 R13 大量与秘書板含 D-16 邮件要约，必须主会话补无 mail 板；之前状态记「设计稿无，附截图，不进门禁」。Web 1024/390、许多深色、站内发送也缺板。A 组件缺口写画板 ID、参数与预期，等 A 交付后重比；不在页面里打私有补丁。像素某屏三轮未过就列未过/具体差带和依赖，不整体报 done。
- **数据/行为：** R27 任务目前没有真实 `dailyCap/sentToday` 回调，R13 站内来源不能据此声称推送频控已完成；向 R14 交出完整查询/偏好需求。R26/R27 原通知的 `sourceAccess` 总 available、prep 分类/时间有偏差，必须修或明确未完成。旧 chat 若仍被别线引用，保留 shim/组件并列引用，不直接删。合同若因 schema/镜像白名单丢字段，先修并重跑在线→离线证据。
- **跨线：** 给 D 的 M0 提交号、DTO/路由/示例、正式 🔔 与父页请求；给 C 的 `ShellInboxRow` 移除时点与设置路由；给 A 的组件缺口；给 R14 的推送/偏好/白名单/真机清单。均在 REPORT 写「是什么 / 当前临时做法 / 接手必须做到 / 依据」四栏，主会话写 HANDOFF / DEFERRED / 决定表 / screen-ownership。R13 旧 chat 行应从原「并入（待核对）」改为「并入，旧路径兼容跳转」，由主会话更新。
- **授权与真实失败：** 生产迁移、部署、Neon、真机分发保持未做并登记待用户授权；付费 AI 本期 0 次。若测试新增失败，记录命令、退出码和受影响 SC，先做有界修复并重跑；未跑、缺板、旧版服务或依赖未合入都不能写「通过」。只在所有必需 SC 有证据、未过项按规则登记并独立复核后报告收口。
