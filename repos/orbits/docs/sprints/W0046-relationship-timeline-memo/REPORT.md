# Sprint W0046 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 联系人详情的「最近互动」改成聚合时间线：memo、当面见面、笔记、计划记录、已开始的日程（含报名活动）、已完成跟进、建立联系，七种来源按时间倒序，显示最近 20 条，超过显示「共 N 条」。只读本人数据、0 次写；某个来源读失败时其余照常并提示「部分记录暂时读不到」。（SC-01、SC-03）
  - 「记录跟进」弹窗改为「写 memo」：
    - 字段：文字必填，日期默认东京今天，可选关联当天已报名的活动；
    - 提示行「memo 会用于为你生成人脉分析，仅你可见」；
    - 删去「同步到 AI 分析」、需求／提供／下一步、阶段箭头、标签区。
    - 保存只写 `contact_detail_states.notes`。同正文不同日期是两条 memo。「上次互动」只在 memo 日期不早于原值时推进。两个并发保存不会互相覆盖：冲突后重读、合并，再重试。（SC-02、SC-03）
  - memo 的 AI 提取管线已接好：provider 接口、DeepSeek 适配器、mock、作业、`memo_extractions` 记录、写回专长／需求／话题并记来源。经 `AiQuotaGate` 的「始终拒绝」实现，每条 memo 只记一条 `disabled`，provider 0 次调用，联系人行 0 次写。（SC-04）
  - 示例模式下，时间线是前端静态数据，「写 memo」保存被拦下、0 请求。
- 仍未实现或未验证：
  - 真实开闸（W0048a）；
  - 没有提取记录的 memo 的补扫（交给 W0048a）；
  - 「更新状态」按钮的改造（W0047）；
  - App 界面与 App typecheck（只做了契约同步）。

## 运行记录

- 结果：completed（协调者合并并验证合并树后）。
- Generator：Opus 5.5，2026-10-02；Planner revision 4（SHA256 `ca5c0a5d0e88f32bfd7b60e5ffc91fc73078896d1c07fed798c014d6dcae29ba`）
- 分支 `sprint/W0046-relationship-timeline-memo`，基线 `7bd8ecb0`
- 功能 SHA：`d9882c32`（功能）、`a8280e09`（review 修复）、`7c6b9b92`（示例回归修复）＝ **最终 `7c6b9b92`**；chat-agent 合并 SHA 见 README 运行记录。
- 报告由协调者按 Generator 原文写入（子代理写文件被拦）。
- 档位 H。全量对照（RULES 5.2，带本机库变量，两次运行环境相同）：

  | 运行 | 总数 | 通过 | 失败 | skip |
  | --- | --- | --- | --- | --- |
  | 基线 | 6313 | 6155 | 85 | 73 |
  | 最终 | 6348 | 6191 | 84 | 73 |

  - 第一轮发现 1 例真回归：示例英文详情里混了中文标题，已在 `7c6b9b92` 修复。
  - 最终新增仅 1 例 `sync-revision-migration-postgres.test.ts` 的 rollback 用例，判定为与本 Sprint 无关的偶发失败：未 import 任何改动文件；基线里同文件的兄弟用例失败过；单独跑 2 次都是 10/10。
- 付费 AI 调用：**DeepSeek 真实调用 0 次，token 0。** push：未做。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0046-01 | pass | `tests/capabilities/relationship-timeline-build.test.ts`；`tests/capabilities/relationship-timeline-reader-postgres.test.ts`（`ORBIT_EVENT_DATABASE_URL` 指向本机库：5 pass／0 skip，`reader-postgres-0skip.txt`）；`tests/api/contact-memo-patch.test.ts` 中 `contactDetailPayloadFromGraph` 回归；`tests/audits/unbounded-list-reads.test.ts` |
| SC-W0046-02 | pass | `tests/api/contact-memo-patch.test.ts`（单一写入、同文不同日、标签／纯文本 PATCH 与 encounters 投影后字段保留、`lastInteraction` 单调、App 旧形状、并发 memo／标签都不丢、持续冲突 3 次后 409） |
| SC-W0046-03 | pass | `tests/pages/app-network-follow-modal.test.tsx`；`app-network-demo-mode.test.tsx`；截图 `detail-1440-before/after.png`、`memo-modal-1440(-selected).png`、`detail-375-after.png`、`memo-modal-375.png`；375 无横向溢出 |
| SC-W0046-04 | pass | `tests/capabilities/memo-extraction-job.test.ts`（disabled／deferred／先 started 后调用／失败／并发认领／beginCall 失败可重试／覆盖规则四例／存储隔离／DeepSeek fetch 桩）；真实链路 `memo-extractions-after-browser.txt` |
| SC-W0046-05 | pass（流量超 1.6 GB 登记 D32） | `traffic-d39-final.json`；全量对照；`tsc-3.txt` 源码 0 错；App `app-sync-tests.txt` 10/10；`repos/orbit-app` 只改 `src/api/contract/{index.ts, relationship-timeline.ts}` |

### 流量（D39 口径：实测返回行的 JSON 字节；本机 `user_verify_plan`，57 位联系人）

| 读取 | 语句数 | 单次 | 月估算 |
| --- | --- | --- | --- |
| 详情页单人时间线 | 7 | 1,784 B | — |
| 「写 memo」活动推荐 | 1 | 128 B | — |
| 详情页合计 | 8 | 1,912 B | ×5 次／天 ×30 天 ×1000 人 ≈ **286.8 MB** |
| 跨联系人最近动态（limit 10，W0052 预估行） | 8 | 5,030 B | ×3 ×30 ×1000 ≈ **452.7 MB** |

W0045 后总账已约 1,908～2,447 MB，加上本项仍超 1.6 GB，只登记 D32。候选瘦身：详情时间线每来源上限 50→20，周检实测后再定（对标 HubSpot 活动时间线首屏只取最近若干条、其余分页按需加载）。最坏情况（7 来源各 50 条、正文截到 200 字）单次约 80～90 KB。

## 假设与额外阅读

- 上下文包之外读过的文件：
  - `app/api/schedule-items/handler.ts`、`features/personal-schedule/service.ts`：确认 `scope=personal` 只返回 personal 类型的项；
  - `shared/storage/{live-record-store,postgres-live-record-store,configured-live-record-store}.ts`：CAS 与 insert-if-absent 的语义；
  - `features/encounters/projector.ts`、`memory-projection-repository.ts`：投影 noteId 的格式；
  - `tests/contract-surface.test.ts`：契约只放类型；
  - `scripts/run-node-tests.mjs`、`verify-session-cookie.ts`；
  - `contact-detail-route-service.ts`：转发 `upsertContactDetailState` 的第二个参数。
- 对模糊点的选择（协调者已认可）：
  1. 契约追加可选 `RelationshipTimelineResult.total`（合并后、截断前的条数，用于「共 N 条」），新增 `ContactMemoNoteInputContract` 类型。其余字段与 PLANNER 定稿一致。
  2. memo 日期存东京日期 `YYYY-MM-DD`。时间线 `occurredAt` 统一为 UTC ISO，day 精度取东京当日 00:00，界面按东京时间显示（固定 +9，无 hydration 差异）。
  3. schedule 只列已开始的日程（startsAt ≤ now）。
  4. 「写 memo」的关联活动推荐由详情页服务端读出：近 30 天、最多 20 条个人日程里 kind=event 的项，随详情下发，弹窗本身不发请求。原因是 `scope=personal` 拿不到报名活动。
  5. 提取作业在保存成功后用 `next/server` 的 `after()` 在响应之外排队；保存请求只写 contact_detail_states。`memo_extractions` 是 orbit_records 的新集合，不做 DDL。
  6. 「更新状态」仍打开同一个「写 memo」弹窗（排除在本 Sprint 外，W0047 改造）。
  7. 时间线条目 `detail.memoEventTypes` 暂不填。eventTypes 在 `memo_extractions.output.eventTypes`，W0047 可以从那里读。
- review 修复里的取值：
  - 最近动态每条记录最多展开 20 个关联联系人 id（对标 HubSpot 活动关联只展示前若干位）；
  - 归属查询固定 `LIMIT 200`；
  - 详情状态写入最多 3 次（首次 + 2 次冲突重试）；
  - 提取认领租约 5 分钟。
- 本机库种子：`user_verify_plan` 名下 50 个联系人（source_id `w0046-seed`）、1 条活动日程、1 条见面记录，只在本机测试库，用于 SC-05 的 50+ 账号和浏览器验证。
- 浏览器：内置浏览器面板隐藏无法截图，改用 playwright 无头浏览器，用 `next-auth/jwt` 签的 cookie 登录，跑完整操作链。控制台唯一错误是 `/api/inbox/summary` 返回 503，与本 Sprint 无关。

## review 处理（H 档，Codex 代码 review 一次，原文 `codex-review.txt`）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1 提取幂等是先读后写，store 无条件 upsert | 采纳 | 存储改为 `insert`（insertRecordIfAbsent）和 `replace`（以 updatedAt 为前提的 CAS）；先原子认领（claimed），只有胜者才 reserve／beginCall／调用 provider，之后每次状态推进都是 CAS。补 `Promise.all` 并发测试：reserve、provider、finish 各 1 次 |
| P1 memo／标签／lastInteraction 以完整快照无条件 upsert | 采纳 | `upsertContactDetailState(state, expected)` 加乐观锁（null＝行必须不存在，`{updatedAt}`＝版本必须一致）。冲突后重读，按本次窄 delta 重算：备注追加去重、标签增删、上次互动单调取大；最多 3 次，仍冲突返回 409。补并发 memo＋标签、并发两条 memo、持续冲突 409 三个测试 |
| P2 handler 按正文找待提取 memo | 采纳 | 保存结果新增 `savedNoteId`，作业用它。补断言：同正文不同日期产生两个不同的 `job.noteId` |
| P2 started 之后 beginCall 抛错会永久卡住 | 采纳 | 顺序改为 claimed → reserve → beginCall → started → provider。beginCall 失败时 finish(failed) 释放，记 `deferred`、`retryOn=now`，可以重试；只有「HTTP 可能已发出」才进终态。补用例 |
| P2 after() 注册失败和回调异常被静默吞掉 | 部分采纳 | memo 保存成功的语义不变。新增结构化错误日志 `memo_extraction_error`：区分 enqueue_failed／job_failed，带 actorId／contactId／noteId，不含正文。补三个测试：默认 after() 不在请求作用域、注册失败、回调失败，以及成功路径。有界补扫不在本 Sprint 做，交接给 W0048a |
| P2 最近动态按 ids.length 作 LIMIT，关联 id 无上限 | 采纳 | 每条记录在 SQL 里截到 20 个关联 id；单人读取只回传该联系人本身；归属查询参数和 LIMIT 固定 200。补用例：单条笔记关联 600 位联系人 |
| P2 PG 主证据缺库时会 skip | 不改门控（全库惯例） | 用本机库运行该文件：5 pass／0 skip（`reader-postgres-0skip.txt`），变量名 `ORBIT_EVENT_DATABASE_URL` |

## 交接

- **给 W0047／W0051／W0052 的契约**（`shared/contract/relationship-timeline.ts`，已同步到 App）：
  - `RelationshipTimelineSource = "memo"|"encounter"|"note"|"plan"|"schedule"|"followup_done"|"capture"`
  - `RelationshipTimelineItem { id: \`${source}:${原记录 id}\`; source; contactId; occurredAt: UTC ISO; occurredAtPrecision: "day"|"instant"; title: {zh,en}; excerpt?; eventId?; ref: { store, recordId, subId? }; detail?: { planEvent?, scheduleKind?, captureMethod?, memoEventTypes? } }`
  - `RelationshipTimelineResult { items; unavailableSources; total? }`
  - `MemoEventType = "met"|"collaborated"|"introduced"|"followed_up"|"other"`
- **三个入口的最终签名**：
  - `features/relationship-timeline/build.ts`：
    - `buildRelationshipTimeline(input: RelationshipTimelineSources, contactId: string): RelationshipTimelineResult`
    - `mergeRelationshipTimelineItems(items, limit): RelationshipTimelineItem[]`
    - 常量 `RELATIONSHIP_TIMELINE_SOURCES`、`MEMO_NOTE_ID_PREFIX`
  - `features/relationship-timeline/reader.ts`：
    - `readRelationshipTimelineForContact(input: { actorId; contactId; now: Date; limit?: number }, deps?: { runtime? }): Promise<RelationshipTimelineResult>`（默认 20，每来源读至多 50）
    - `readRecentRelationshipTimelineForActor(input: { actorId; now: Date; limit: number }, deps?): Promise<RelationshipTimelineResult>`（limit ≤ 50，每条记录展开 ≤ 20 个联系人，归属查询 ≤ 200）
    - `readMemoEventOptions({ actorId, now }, deps?)`
    - W0047 按 actor 批量读全部联系人的时间线（计分用）由 W0047 新增，复用 `buildRelationshipTimeline`。
- **memo 存储**：`contact_detail_states.notes[]` 中 noteId 以 `note:live-contact-detail-update:` 开头的条目，可选 `occurredAt`（东京日期）、`eventId`、`kind:"memo"`。详情 payload（App 同步）的 notes 不带这三个字段。PATCH 结果带 `savedNoteId`。
- **memo_extractions**：
  - 存储位置：orbit_records 集合 `memo_extractions`，record id `memo-extraction:<actor>:<key>`，key ＝ `memo:<noteId>:<sha256(正文) 前 24 位>`。
  - 状态机：`claimed`（租约 5 分钟、未发 HTTP）→ `disabled`｜`deferred(retryOn)`｜`started` → `succeeded`｜`failed`。`started`、`succeeded`、`failed` 是终态，不再调用 provider。
  - 记录内含 `output{offering,seeking,topics,eventTypes}`、`writtenFields`、`usage`、`operationId`。
- **AiQuotaGate**（`features/ai-quota/gate.ts`）：
  - 接口：`reserve({actorId,pool,purpose:"memo_extraction",trigger:"auto",idempotencyKey,now}) → {ok:true,operationId} | {ok:false,reason:"disabled"|"daily_limit",retryOn?}`；`beginCall(operationId,{provider,model}) → {callId}`；`endCall(callId, usage|null)`；`finish(operationId,"succeeded"|"failed")`。
  - 注入点：`createConfiguredAiQuotaGate()`，目前返回 `createAlwaysDenyAiQuotaGate()`。W0048a 在这里换成账本实现，并放宽 purpose／trigger 枚举。
- **写回**：`applyEnrichedValues` 已支持 `offering`／`seeking`／`topics`（值在 `publicProfile.*`）。provider 新增 `applyContactMemoExtraction(contactId, actorId, values, at)`，只接受 `ai`／`memo_extraction`，走 `canWriteEnrichedValue`，并做一次条件更新。
- **交给 W0048a 的补扫事项**：开闸时由维护任务对「没有 memo_extractions 记录」以及「disabled／到期 deferred」的 memo 做有界补扫，计入后台池。作业本身已经幂等，可以直接重跑 `runMemoExtraction`。
- **App 影响**：
  - 同步副本：`repos/orbit-app/src/api/contract/relationship-timeline.ts`（新增）、`index.ts`（导出）。四个 *-sync 测试 10/10。
  - App 旧请求体照常可用；PATCH 响应多一个可选的 `savedNoteId`。
  - 未验证：App 界面与 App typecheck。
- **需要用户决定或授权**：无。流量超 1.6 GB 只登记 D32（候选：详情时间线每来源 50→20，周检实测后再定）。
- **回退**：按序 revert `7c6b9b92`、`a8280e09`、`d9882c32`，再在 App 端重新执行 `npm run sync:contract`。没有迁移；`memo_extractions` 是派生缓存，可以留着也可以删；memo 新字段对旧代码无害。
- **证据目录** `~/orbit-sprint-evidence/web/sprint-W0046/run-01/`：
  - 影响分析与提交前检查：`impact-summary.txt`、`detect-changes-staged-{1,2,3}.txt`
  - 类型检查：`tsc-{1,2,3}.txt`
  - 收口集：`closing-set-{1,2}.txt`（254 pass／0 skip）
  - 数据库主证据：`reader-postgres-0skip.txt`
  - App 同步：`app-sync*.txt`
  - 全量对照：`full-baseline.txt`、`full-after.txt`、`full-after-2.txt`、`fail-*.txt`、`new-fail-recheck.txt`、`sync-revision-recheck.txt`
  - 浏览器：`browser-run.txt` 和 6 张截图
  - 真实链路：`memo-extractions-after-browser.txt`
  - 流量：`traffic-d39.json`、`traffic-d39-final.json`
  - review 原文：`codex-review.txt`
