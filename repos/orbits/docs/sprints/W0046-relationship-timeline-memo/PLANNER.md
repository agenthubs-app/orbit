# Sprint W0046 — 关系时间线（只读聚合）与「写 memo」单一写入

> revision 4：按 D46 修订（①⑦）：新建 `shared/contract/relationship-timeline.ts` 的同一提交内执行 App 机械同步脚本 `npm run sync:contract`（只复制、不改 App 逻辑）并跑 App 四个 *-sync 测试为绿；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-13、R-16，配额口径统一）：进入条件只写登记表依赖 W0045；`AiQuotaGate` 改为按操作计次（`reserve` 一次 = 1 次操作）+ 每次 HTTP 一条成本子账（`beginCall`／`endCall`）、发起方唯一 `finish`；验收契约改为「操作链 + 主证据」+ 必需证据子表。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。补全来源按 C-4 改记在 W0045 的 `enrichment.fields`（不再用 `publicProfile.fieldOrigins`）；memo 提取计入 W0048a 的后台自动池。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-04；**定稿共享契约「关系时间线 RelationshipTimelineItem」**（W0047 强度、W0051 洞察、W0052 最近动态都读它）。**单一目标:** 详情弹窗「最近互动」改为聚合时间线；「记录跟进」弹窗精简为「写 memo」，memo 只写 `contact_detail_states.notes`；memo 的 AI 提取管线接好但默认不发真实调用。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `a48e1749`，行号以它为准）。W0043（RN-01 文案止血）若先合并，会改 `network-detail-modal.tsx` 文案，开工按符号重新定位。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**进入条件:** **W0045 completed**（登记表依赖，README 为唯一来源，R-13），REPORT 交接 `ContactEnrichmentDTO`／`EnrichmentField`（含 offering／seeking／topics）与 `canWriteEnrichedValue`（W46-3 = C-4）；W46-1～W46-6 已定（D44，见文末）；不需要云端授权、不做 DDL 迁移（新集合走 `orbit_records`）；**本 Sprint 真实 DeepSeek 调用为 0**（后台池由 W0048a 落地后开闸，见 W46-1）。

## 已查清的事实（按 `a48e1749`）

1. **memo 现在的写法。**`app/(app)/app/contacts/network-0918/network-follow-modal.tsx`：`buildFollowPatch`（第 47 行）把 摘要／需求／提供／下一步 拼成一条 `note.body`，日期只进 `lastInteraction.occurredAt`；`save()`（第 113 行）`PATCH /api/contacts/<id>`；「同步到 AI 分析」是 `aria-disabled` 摆设（第 196–199 行）；阶段箭头只读（第 166–176 行）。详情弹窗「记录互动」「更新状态」都打开它（`network-detail-modal.tsx:59–60、233–234`）。保存成功后 `network-cards.tsx:36` 整页 reload，详情由服务端 `app/(app)/app/contacts/[id]/page.tsx` 重新组装（第 235 行 `openDetail`），**时间线可在服务端读好随详情下发，不需要新的客户端请求**。
2. **持久化。**`app/api/contacts/[id]/handler.ts:78 readNote` 只收 `{ body, authorLabel }`（App 也 PATCH 这个接口：`orbit-app/src/screens/contacts/ContactDetailScreen.tsx`）。`features/contacts/live-detail-service.ts:879 buildNote`：id = `note:live-contact-detail-update:` + sha256(actor, contact, author, body) 前 24 位，**同文不同日会被去重成一条**；`createdAt = now`。`persistedStateFor`（第 1028 行）逐字段重建 notes（`noteId/body/authorLabel/createdAt/privacy/sourceLabel`），**新加字段会在下一次任何 PATCH 时被丢掉**。存储类型 `features/contacts/live-service.ts:21 LiveContactDetailStoredNote`、`:36 LiveContactDetailState`；行在 `orbit_records`，`collection_name='contact_detail_states'`，record id `contact-detail:<actor>:<contact>`（`features/encounters/projection-repository.ts:47`）。
3. **当面记录也会投影进 notes。**`features/encounters/projection-repository.ts:144–175` 在事务里把 `human_encounters` 投影成 `noteId = note:<encounterId>`（`projector.ts:21`）写入同一行 notes，并更新 `lastInteraction`；约谈 memo（`features/appointments/memo-service.ts:72`）走的就是 encounters。时间线必须**按 encounterId 去重**，以 `human_encounters` 为准。
4. **详情读模型。**`live-detail-service.ts:431 notesFor` 把名片备注与 evidence 也做成 notes；`:526 detailFor` 第 566 行合并 persisted notes；`contactDetailPayloadFromGraph`（第 741 行）被 `features/sync/contact-domain-reader.ts` 用来给 **App 同步**组 payload——**不得改详情 payload 里 `notes` 的语义**，时间线作为新字段或独立读取。
5. **时间线各来源（都按本人隔离）：**
   - `human_encounters`：`orbit_records`，`targetId = contactId`、`occurredAt = observedAt`（`features/encounters/service.ts:150`），可按 `targetId` 精确读。
   - `notes` 集合：`features/notes/note-record.ts:5 NOTE_COLLECTION = "notes"`，`targetId` 是 note 自身，**联系人在 payload `contactIds`**（`shared/contract/notes.ts`）；现有 `repository.list(actorId)` 是 `limit: "unbounded"`。
   - `plan_log`：独立表，`linked_contact_ids text[]` 有 GIN 索引 `plan_log_contacts`（`features/plans/migrations.ts:102–134`）；事件见 `features/plans/contract.ts:90 PLAN_LOG_EVENTS`。
   - `personal_schedule_items`：`orbit_records`，payload `contactIds`（及可选 `contactId`），`state` 含 `cancelled`（`features/personal-schedule/authority-contract.ts:7–30`）；报名活动会生成 `kind:"event"` 项（`authority-service.ts:85–112`）；窗口读取 `GET /api/schedule-items?scope=personal&from=&to=`（`app/api/schedule-items/handler.ts:38–40`）。
   - 完成的跟进：`orbit_records` `tasks` 集合，关系生命周期任务 `status: "completed"`、有 `contactId`（`features/connections/lifecycle/contract.ts:19`），完成时刻取 `updatedAt`。
   - 认识：联系人行 `createdAt`、`source.type`（名片／扫码／活动导入／手动）、`metEventId/metEventTitle`（`shared/domain/contracts.ts:137–166`）。
   - **不读**：站内私信 `relationship_conversations／messages`（N-Q25）；event_ops 配对／交换表（见 W46-4）；evidence 推出的说明性 notes。
6. **专长／需求／话题。**`PublicProfileDTO`（`shared/domain/contracts.ts:65`）有 `offering/seeking/topics?: readonly string[]`，**没有来源标记**（C-4：来源统一记在 W0045 的 `enrichment.fields.{offering,seeking,topics}`，不改 `PublicProfileDTO`）；详情 `publicProfileFor`（`live-detail-service.ts:314`）为空时回退到关系推断值。写联系人行的现成模式：`contact-live-record-provider.ts:907 updateContactPrimaryIndustry`（读行 → 归属检查 → `updateRecordIfCurrent` 条件更新）。
7. **DeepSeek 现有接法。**`features/plans/ai-matcher.ts`：`PlanAiMatcher` 接口 + `createDeepseekPlanAiMatcher`（`json_object`、`thinking: disabled`、30 s 超时、`PlanAiMatcherError` 带用量）+ `createConfiguredPlanAiMatcher`（无 `DEEPSEEK_API_KEY` 返回 null）；`features/plans/match-worker.ts` 头注释：**先把 `ai_state` 置为 started 并提交再发请求，重试绝不再调用**。每日维护入口 `features/operations/maintenance/configured-tasks.ts`（含 `createPlanDailyRunGate`）。
8. 审计门：`tests/audits/unbounded-list-reads.test.ts` 对 `limit: "unbounded"` 做只减不增的棘轮——**新读取一律有上限**。

## 共享契约定稿：RelationshipTimelineItem（落在 `shared/contract/relationship-timeline.ts`）

```ts
export type RelationshipTimelineSource =
  | "memo"          // contact_detail_states.notes 中用户 memo（noteId 前缀 note:live-contact-detail-update:）
  | "encounter"     // human_encounters（其投影 note:<encounterId> 不再单列）
  | "note"          // notes 集合，payload.contactIds 含该联系人
  | "plan"          // plan_log，linked_contact_ids 含该联系人
  | "schedule"      // personal_schedule_items，contactIds/contactId 含该联系人，state ≠ cancelled
  | "followup_done" // tasks 集合，status = completed 且 contactId 匹配
  | "capture";      // 联系人建立（名片／扫码／活动交换／手动），每人恰好 1 条

export interface RelationshipTimelineItem {
  id: string;                 // `${source}:${原记录 id}`（plan 用 plan_log.id；capture 用 contactId）；稳定，W0047 signals 引用它
  source: RelationshipTimelineSource;
  contactId: string;
  occurredAt: string;         // ISO。memo=用户选的日期；encounter=observedAt；schedule=startsAt；plan=created_at；followup_done=updatedAt；capture=contact.createdAt
  occurredAtPrecision: "day" | "instant"; // memo 只选了日期时为 day，展示不编时分
  title: { zh: string; en: string };      // 规则生成的一句话（「写了 memo」「在〈活动〉交换名片」「计划：确认已建立联系」）
  excerpt?: string;           // 用户原文节选（memo／encounter／note 正文，≤160 字，不翻译）
  eventId?: string;           // 关联活动（memo 选的、encounter／schedule 自带、capture 的 metEventId）
  ref: { store: "contact_detail_states" | "human_encounters" | "notes" | "plan_log" | "personal_schedule_items" | "tasks" | "contacts"; recordId: string; subId?: string }; // 指回唯一事实来源，供「依据」跳转
  detail?: { planEvent?: string; scheduleKind?: "meeting" | "event" | "personal"; captureMethod?: "business_card" | "qr" | "event_exchange" | "manual" | "other"; memoEventTypes?: readonly MemoEventType[] };
}
export type MemoEventType = "met" | "collaborated" | "introduced" | "followed_up" | "other"; // 由 memo 提取得到（W0047 计分用）
export interface RelationshipTimelineResult {
  items: readonly RelationshipTimelineItem[];      // occurredAt 降序，同刻按 id
  unavailableSources: readonly RelationshipTimelineSource[]; // 读失败的来源；不为空时 UI 说明「部分记录暂时读不到」
}
```
- **只读聚合，不搬数据**：时间线没有自己的表，每次由来源现读现算；`ref` 永远指回来源行。三个入口（名字定稿，W0047／W0052 直接引用）：
  - 纯函数 `buildRelationshipTimeline(input: RelationshipTimelineSources, contactId: string): RelationshipTimelineResult`——接受「已读出的各来源行」（可含多位联系人），W0047 批量计分复用它；另导出 `mergeRelationshipTimelineItems(items, limit)`（跨联系人按 `occurredAt` 降序取前 N，同刻按 id）。
  - 单人读取 `readRelationshipTimelineForContact(input: { actorId: string; contactId: string; now: Date; limit?: number }): Promise<RelationshipTimelineResult>`——详情弹窗用，默认 20 条（W46-5）。
  - **跨联系人最近动态** `readRecentRelationshipTimelineForActor(input: { actorId: string; now: Date; limit: number }): Promise<RelationshipTimelineResult>`——覆盖全部七种来源，每来源按时间倒序读至多 `limit` 条（`limit` 上限 50），合并后取前 `limit` 条，每条带 `contactId`；只含仍属于本人的联系人的条目；**供 W0052 概览「最近动态」（W46-6／W52-3）**。
  - 全部读取器：只读本人数据、0 写入、每来源读取有上限；某来源失败时返回其余来源并在 `unavailableSources` 列出，全部失败时 `items: []` 且七种来源都列出（调用方据此显示「暂时读不到」而不是「没有记录」）。按 actor 批量读全部联系人的时间线（计分用）由 W0047 新增。

## 配额闸门接口（本 Sprint 定义，W0048a 用账本实现）

```ts
// features/ai-quota/gate.ts（只定义接口 + 「始终拒绝」实现；表与计数在 W0048a）
// revision 3 配额口径：额度按「操作」计（一次 reserve = 1 次）；成本按「每次供应商 HTTP 一条子账」记，以 operationId 聚合。
export type AiQuotaPool = "user" | "background" | "system";
export interface AiQuotaGate {
  reserve(input: { actorId: string; pool: AiQuotaPool; purpose: "memo_extraction"; trigger: "auto"; idempotencyKey: string; now: Date }):
    Promise<{ ok: true; operationId: string } | { ok: false; reason: "disabled" | "daily_limit"; retryOn?: string }>;
  // 每次供应商 HTTP 发出前登记一条子账，拿到响应（含输出无效）后补 token；无响应记 no_response
  beginCall(operationId: string, call: { provider: string; model: string }): Promise<{ callId: string }>;
  endCall(callId: string, usage: { inputTokens: number; outputTokens: number } | null): Promise<void>;
  // 只由持有 operationId 的发起方调用一次；没有任何子账拿到响应时账本记 released（不计次）
  finish(operationId: string, outcome: "succeeded" | "failed"): Promise<void>;
}
```
- memo 提取一律走后台自动池（C-5：每人每东京日 60 次操作，一条 memo 提取 = 1 次，超限顺延次日）；本 Sprint 注入「始终拒绝」实现（`reason: "disabled"`），W0048a 替换为账本实现，只放宽 `purpose`／`trigger` 枚举，不改其余形状（与 W0048a 契约 E 一致）。幂等键 `memo:<noteId>:<正文哈希>`。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `app/(app)/app/contacts/network-0918/network-follow-modal.tsx`（209 行，改为「写 memo」）、`network-detail-modal.tsx`（294 行；第 82、180–200 行「最近互动」）、`network-cards.tsx:35–37`。
- `app/(app)/app/contacts/[id]/page.tsx`（服务端组装 `detail`，接入时间线读取；示例分支第 160 行）。
- `app/(app)/app/orbit-contacts-route-view-model.ts:5–45 OrbitContactView`（加可选 `timeline` 字段）、`_demo/demo-network.ts:295 buildDemoNetworkDetail`（示例时间线）。
- `app/api/contacts/[id]/handler.ts:26–140`（`readNote` 扩字段）；`features/contacts/detail-contract.ts:223、339、352`；`features/contacts/live-detail-service.ts:854–925、1028–1110`。
- `features/encounters/projection-repository.ts:40–175`（去重依据）、`features/notes/repository.ts`、`features/plans/repository.ts:355–430`、`features/personal-schedule/service.ts`、`features/contacts/storage/contact-live-record-provider.ts:828、907`。
- `features/plans/ai-matcher.ts`、`features/plans/match-worker.ts:1–30`（提取管线照抄的模式）。

### 关键符号（原样）与 impact
- `function buildNote(input: { actorId: string; contact: ContactDetail; note?: ContactDetailUpdateInput["note"]; now: string; }): ContactDetailNote | null` — GitNexus ambiguous（2 个同名，另一个不在此文件）；文本搜索：本文件内 1 处调用。
- `function persistedStateFor(input: {...}): LiveContactDetailState` — 本文件私有；文本搜索 1 处调用。
- `function detailFor(...)` — LOW，直接 1（`payloadFor`）；`contactDetailPayloadFromGraph` — LOW，直接 1（`features/sync/contact-domain-reader.ts payloads`，**App 同步**）。
- `export function buildFollowPatch(...)` — LOW，直接 1（`save`）。`export function NetworkFollowModal(...)` — LOW，直接 2（`NetworkAll`、`NetworkCards`），2 个流程。`export function NetworkDetailModal(...)` — LOW，直接 3，2 个流程。
- `createLiveContactDetailTagStatusService` — LOW，直接 2（详情路由服务、`features/contacts/service-factory.ts`）。

### 前序交接要点
- W0005 示例模式写入走 `guardWrite` 不发请求；W0015 `metEventId` 是「在哪场活动认识」；W0010 详情右栏「关联到计划人脉需求」不动。

### 易错边界（都有对应 SC）
- memo 只写 `contact_detail_states.notes`（同一行的 `lastInteraction` 随之更新），保存请求不写 notes 集合、plan_log、human_encounters、contacts（SC-02）。
- 新字段（`occurredAt`、`eventId`、`kind: "memo"`）必须在 `persistedStateFor`、encounters 投影、`buildNote` 去重三处都保留；同文不同日是两条（SC-02）。
- 只有 memo 日期 ≥ 现有 `lastInteraction.occurredAt` 才推进 `lastInteraction`（补记旧事不覆盖更新的互动）（SC-02）。
- App 旧写法 `{ note: "文本" }`／`{ note: { body, authorLabel } }` 照常可用（SC-02）。
- 时间线读取 0 写入、不读私信表、全部按本人隔离、新读取有上限；单个来源失败不拖垮整条（SC-01）。
- 详情 payload `notes` 语义不变（App 同步）（SC-01）。
- AI 提取：每条 memo（noteId + 正文哈希）至多一次 provider 调用；写回只过 W0045 `canWriteEnrichedValue`（空栏或 `enrichment.fields.<field>.origin = ai` 才写，无来源记录的存量值按 `user` 不覆盖）；闸门为「始终拒绝」实现时 0 次真实调用、不写任何模拟内容到真实数据（SC-04）。

## 范围与文件

- 新建：`shared/contract/relationship-timeline.ts`；`features/relationship-timeline/`（`build.ts` 纯函数、`reader.ts` 含单人与跨联系人最近动态两个读取器）；`features/contacts/memo-extraction/`（provider、DeepSeek 适配器、mock、作业）；`features/ai-quota/gate.ts`（`AiQuotaGate` 接口 + 「始终拒绝」实现）；对应测试。
- 修改：`network-follow-modal.tsx`、`network-detail-modal.tsx`、`network-cards.tsx`／`network-all.tsx`（按钮文案与 onSaved）、`contacts/[id]/page.tsx`、`orbit-contacts-route-view-model.ts`、`_demo/demo-network.ts`、`app/api/contacts/[id]/handler.ts`、`features/contacts/detail-contract.ts`、`features/contacts/live-service.ts`（存储类型加可选字段）、`features/contacts/live-detail-service.ts`、`features/contacts/storage/contact-live-record-provider.ts`（加 AI 栏写入函数）、联系人 payload 的 `enrichment.fields.{offering,seeking,topics}`（W0045 已定稿的类型，C-4；**不改** `PublicProfileDTO`、不新增 `fieldOrigins`）、样式（`orbit-reference-styles.tsx` 中 `nw-fu-*`、`nw-tl-*` 段）。
- 排除：「更新状态」按钮、待设置关系面板、管线页（W0047）；强度计算（W0047）；配额账本与真实调用开闸（W0048a）；NFC 语音 memo；encounters／appointments 写入路径；App 端界面与逻辑；不删除旧 note 数据。
- 同步副本（D46①）：新建 `shared/contract/relationship-timeline.ts` 后，`repos/orbit-app/src/api/contract` 中由 `npm run sync:contract` 写出的变化与本 Sprint 代码同一提交；该契约文件只能 `./` 引用同目录契约（App `contract-sync` 自包含用例），不得引 `shared/domain`。

## 验收契约（最多五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0046-01 | **时间线只读聚合。**对一位七种来源都有记录的联系人调用单人读取器，得到符合契约、`occurredAt` 降序、只含本人数据的时间线，过程 0 次写 | 读取器 Postgres 测试（本机测试库，证明未 skip） |
| SC-W0046-02 | **memo 单一写入。**`PATCH /api/contacts/:id` 提交 `note: { body, occurredAt, eventId, kind: "memo" }`，`contact_detail_states` 该行 notes 多一条带这三个字段的记录，其他存储 0 次写 | handler + live-detail-service 测试（存储写调用计数断言） |
| SC-W0046-03 | **「写 memo」与时间线界面。**在详情弹窗点「写 memo」，填文字与日期保存，「最近互动」出现这条 memo（来源标签、日期、节选） | 组件测试（弹窗请求体 + 时间线渲染） |
| SC-W0046-04 | **memo 提取管线（门默认关闭）。**闸门为「始终拒绝」实现时写一条 memo，提取作业记 `disabled`、provider 0 次调用、联系人行 0 次写 | 作业测试（mock provider 计数） |
| SC-W0046-05 | **H 档收口与流量。**本机 50+ 联系人测试账号打开一次详情页，实测新增读取的语句数与返回字节并入 D39 月预算表 | 测量 JSON + REPORT 预算表（`~/orbit-sprint-evidence/web/sprint-W0046/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | `buildRelationshipTimeline` 七种来源各给出符合契约的条目；`note:<encounterId>` 不与 `encounter` 重复；`schedule` 排除 `cancelled`；`capture` 每人恰好 1 条 | 纯函数表驱动测试 |
| 01 | 他人数据 0 条（同 workspace 两个 actor 夹具）；对 `relationship_conversations／relationship_messages` 及 event_ops 表 0 次查询 | 读取器测试（SQL／store 调用记录断言） |
| 01 | 每条新读取带上限（审计棘轮不升） | `tests/audits/unbounded-list-reads.test.ts` |
| 01 | 任一来源抛错时其余照常、`unavailableSources` 列出它；全部失败时 `items: []` 且七种都列出 | 读取器测试 |
| 01 | `readRecentRelationshipTimelineForActor`：七种来源合并倒序、`limit` 生效、他人数据 0 条、已删除／不属于本人的联系人的条目不出现、降级语义同上 | 读取器测试 |
| 01 | `contactDetailPayloadFromGraph` 输出的 `notes` 与改前逐字段相同（App 同步） | 详情 payload 回归断言 |
| 02 | 同正文不同日期是两条；随后一次只改标签的 PATCH 与一次 encounters 投影后新字段仍在 | handler + live-detail-service 测试 |
| 02 | `lastInteraction` 只在 memo 日期 ≥ 原值时推进 | 同上 |
| 02 | 保存请求期间对 notes 集合、plan_log、human_encounters、contacts 0 次写 | 写调用计数断言 |
| 02 | App 旧 body 形状 `{ note: "文本" }`／`{ note: { body, authorLabel } }` 通过 | handler 测试 |
| 03 | 弹窗：文字（必填）、日期（默认东京今天）、可选关联活动（当天 `kind:"event"` 推荐，读失败只隐藏推荐）、提示行「memo 会用于为你生成人脉分析，仅你可见」；删去「同步到 AI 分析」、需求／提供／下一步、阶段箭头、标签区；「记录互动」改名「写 memo」 | 组件测试 |
| 03 | 时间线：`day` 精度不显示时分；`unavailableSources` 非空时一行说明；空时「还没有互动记录」；中英双语 | 组件测试 |
| 03 | 示例模式点「写 memo」0 请求、示例时间线为前端静态数据 | 组件测试（fetch 计数） |
| 03 | 真实账号写一条 memo 前后 1440／375 截图 | 证据目录截图 |
| 04 | `MemoExtractionProvider` + DeepSeek 适配器（`json_object`、`thinking: disabled`、超时；只发 memo 正文与对方公司／职位，不发邮箱电话） | 适配器 fetch 桩测试 |
| 04 | 作业按 `(noteId, 正文哈希)` 幂等，先落 `started` 再调用，重试不再调用 | 作业测试 |
| 04 | 结果写 `memo_extractions` 并按 `canWriteEnrichedValue` 写回 `offering/seeking/topics`，记 `enrichment.fields.<field> = { origin: "ai", updatedAt, via: "memo_extraction" }`；`user`／`card`／存量无来源值永不覆盖 | 作业测试（覆盖规则四例） |
| 04 | 闸门返回 `daily_limit` 时作业记 `deferred` 到 `retryOn`、0 次调用；一条 memo 提取只 `reserve` 1 次操作，每次 HTTP 各有 `beginCall`／`endCall` | 作业测试（闸门桩） |
| 04 | REPORT 写「真实调用 0 次」 | REPORT |
| 05 | 详情页按「每位活跃用户每天 5 次 × 30 天 × 1000 人」折算；`readRecentRelationshipTimelineForActor`（`limit` 10）单次实测 ×「每天打开概览 3 次 × 30 天 × 1000 人」作预估行（W0052 用实测替换）；超 1.6 GB 如实登记 D32 | REPORT 预算表 |
| 05 | 全量 `npm test` 对照基线新增失败 0；`npx tsc --noEmit -p .`；一次 Codex 代码 review | 全量清单、review 处理 |
| 05 | **D46①**：同一提交含 `npm run sync:contract` 写出的 App 副本，App 端 `contract-sync`／`api-schema-sync`／`compute-sync`／`domain-sync` 四个测试全绿；`repos/orbit-app` 除 `src/api/{contract,schema,compute,domain}` 外无改动 | 同步命令输出、App *-sync 测试输出、`git diff --stat` |

## 一次 Generator 的执行顺序

1. 复核进入条件与已定项（W46-6 与 W0052 的 W52-3 一致）；记录基线 SHA、Planner SHA256；`git status --short` 确认用户未提交文件不动。
2. impact（上表符号 + 实际要改的 handler／provider 函数）；ambiguous／UNKNOWN 用文本搜索补查并记 REPORT。
3. RED：契约与纯函数 → 读取器隔离／降级 → memo 写入保留 → 弹窗与时间线组件 → 提取作业。
4. 实现顺序同上；每步定向测试通过再进下一步。
5. 收口集 → 浏览器 → 流量测量 → 全量对照 → Codex review → 有限修复 → 在 `repos/orbit-app` 执行 `npm run sync:contract` 并跑 App 四个 *-sync 测试为绿（D46①）→ 路径限定提交（含同步副本）→ REPORT → 交接。

## 最小测试与检查

- **档位 H**：共享契约定稿 + 写入路径 + 付费 AI 管线（虽然门关闭）。
- **开发定向集**：新契约／纯函数／读取器／提取作业测试；`tests/capabilities/contact-detail-note-preservation.test.ts`；`tests/capabilities/event-encounter-note-live-generated-store.test.ts`；`grep -rl "network-follow-modal\|network-detail-modal\|buildFollowPatch" tests` 命中的页面测试。
- **收口集**：定向集 + `tests/pages/app-contact-detail-live-route-services.test.ts`、`tests/services/contact-owner-boundary.test.ts`、`tests/audits/unbounded-list-reads.test.ts`、sync 相关（`grep -rl "contact-domain-reader" tests`）、`npx tsc --noEmit -p .`。
- **数据库**：Postgres 读取器测试先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未 skip。
- **全量**：本地代码收口一次（RULES 5.2）。
- **App 机械同步（D46①，RULES §6）：**本 Sprint 改动 `shared/{contract,api-schema,compute,domain}`，须在**同一提交**里于 `repos/orbit-app` 执行 `npm run sync:contract`（即 `scripts/sync-contract.mjs`：`shared/contract`→`src/api/contract`、`shared/api-schema`→`src/api/schema`、`shared/compute`→`src/api/compute` 整目录逐字复制，`shared/domain` 只复制 `industries.ts`／`language.ts`→`src/api/domain`），只复制、不改 App 逻辑；再在 `repos/orbit-app` 跑 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/compute-sync.test.ts tests/domain-sync.test.ts`，须全绿（2026-10-02 编制时 4 文件 10 例全绿）。被同步的文件只能引用同步范围内的文件：`shared/contract` 只能 `./` 互引（`contract-sync` 的「自包含」用例），`shared/compute` 受 `tests/support/shared-compute-audit.ts` 约束（只可 `./`、`import type` 契约与两个字典），`shared/api-schema` 引 `../domain/*` 只限 `industries`／`language`；违反时改 Web 侧写法，不改 App。除同步脚本写出的副本外，本 Sprint diff 不含 `repos/orbit-app` 其他文件；App 界面与 App typecheck 不在本 Sprint 验收内，在 REPORT「App 影响」写明未验证。
- **不运行**：真实 DeepSeek；App 端 *-sync 以外的测试（App 只受「请求体可选字段」影响，用旧形状测试覆盖）。

## 失败与交接

外部条件缺失先不启动；run 已开始按 RULES 产出 failed／blocked 报告。REPORT 写：SC 映射与 SHA；**契约最终字段**（若与上文有偏差须写明原因，W0047 以 REPORT 为准）；三个时间线入口的最终导出签名（W0047 计分、W0052 最近动态直接使用）；`memo_extractions` 记录形状与作业状态机（含 `disabled`／`deferred`）；`AiQuotaGate` 接口与注入点名（交给 W0048a 用账本实现）；「App 影响」（同步了哪些副本、四个 *-sync 测试结果，D46①）；流量表；截图；全量清单；review 处理。交接列本线分支、固定最终 SHA、待合并目标 `chat-agent`。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W46-1 | 只接线、闸门默认关：定义 `AiQuotaGate`（`reserve`／`beginCall`／`endCall`／`finish`，rev 3 按操作计次）并只提供「始终拒绝」实现，W0048a 用账本实现后开闸，memo 提取计入后台自动池；本 Sprint 真实调用 0 次 | Notion AI、Linear AI、GitHub Copilot 先有统一计量／额度服务，各 AI 功能经同一个闸门调用，功能上线前闸门关闭 |
| W46-2 | 提取出的专长／需求／话题写回 `publicProfile.offering/seeking/topics`，来源记 `enrichment.fields`；`memo_extractions` 作可重建的派生缓存，memo 原文仍是唯一事实来源 | HubSpot／Clearbit、Affinity 自动补全把值写进联系人属性并记录来源，人工值优先、永不被自动值覆盖 |
| W46-3（= C-4） | 来源统一记在 W0045 的 `enrichment.fields.{offering,seeking,topics}`（`origin` 取 ai／user／card、`updatedAt`、`via`），不用 `publicProfile.fieldOrigins`；无标记的旧值视为 `user` | 单一事实来源：HubSpot 每个属性一份 property history 与 source，Salesforce 字段级 data source 标记 |
| W46-4 | 活动交换不单列来源，由 `capture`（`captureMethod: "event_exchange"`）表达，不读 event_ops 表 | LinkedIn／Affinity 时间线以「建立联系」为关系第一条事件，不重复展示底层撮合记录 |
| W46-5 | 详情时间线显示最近 20 条，超过显示「共 N 条」；每来源读取上限 50 | HubSpot、Affinity 联系人活动时间线默认按时间倒序展示最近活动；Linear issue 活动流同法 |
| W46-6（= W52-3） | 提供跨联系人「最近 N 条」读取 `readRecentRelationshipTimelineForActor`，W0052 直接用，不另写聚合 | HubSpot 活动时间线与首页 Recent activity、Affinity timeline 与 activity feed 由同一个活动聚合服务供数 |
