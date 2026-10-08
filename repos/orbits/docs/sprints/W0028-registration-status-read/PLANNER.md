# Sprint W0028 — 本人报名读取只返回 eventId／status

**Plan revision:** 4（2026-09-29）。
- revision 2：按 Codex 方案 review（`scratchpad/w0028/codex-plan-review.txt`）修订，并入用户裁决 D19。
- revision 3：并入用户裁决 D20（W28-4 选 A）；按 W0029 方案 review 交叉核对的结果，修正 canonical 有效性判断的条件（补上无穷时间戳，写清 `registrationProfile` 为 null 时不报错）。
- revision 4：W0027 已合并（`2d6bf323`），协调者按 `chat-agent` `a070c5b5` 刷新全部【W0027 合并后刷新】占位：基线、W0027 REPORT、详情页调用点、W0027 测试文件、impact、行号。SC 语义不变。

逐条处理见末尾「review 处理」。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-03、RV-05。来源：W0024 REPORT 的 SC-03 failed，以及用户决定 D18、D19（2026-09-29）。

**单一目标:** 给「本人是否报名」新增只取 `eventId`／`status` 的轻量读取，legacy 投影在 SQL 里按活动 id 过滤。接到两处：
- `readRuntimeEventRegistrationStates`：活动页用它，`/app/agent`、`/app/start` 也用它。
- `readRegisteredCatalogueAttendees` 里的本人报名判定：活动详情页用它。

要求：页面可见行为不变，语句数不增加，读取的去重和闸门行为不变，失败语义与旧读取完全一致（D20：W28-4 选 A），实测活动页＋详情页的本人报名读取合计 ≤30 MB／月。报名者名单不在本 Sprint 瘦身，只实测（D19），名单瘦身由 W0029 做。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** `chat-agent` `a070c5b5`（W0027 合并提交 `2d6bf323`，之后只有登记表文档提交）。
- 行号最初按 `a25f93ec` 核对。`git diff a25f93ec a070c5b5` 在 `features/events`、`features/sync`、`shared/storage` 下为空，本 Sprint 要改的源文件一行没变，所以下文行号在 `a070c5b5` 上仍然有效（revision 4 已抽查 `runtime.ts:69/126`、`registered-catalogue-attendees.ts:15`、`canonical-event-detail-view.ts:231`、`orbit-registered-event-route-view-model.ts:35`、审计基线第 44 行）。
- W0027 在这段时间只改了 `app/(app)/app/events/[id]/page.tsx` 和测试（见事实 5、7）。

**进入条件:**
- W0027 已 completed 并合并进 `chat-agent`（`2d6bf323`）。✔
- 协调者已刷新原标有【W0027 合并后刷新】的位置：基线、W0027 REPORT 路径、详情页调用点、W0027 测试文件、impact 结果（revision 4 完成）。✔
- 本机 PG 测试库 `orbit_test` 可用。
- 不需要云端授权，不调用付费 AI。

## 已定决定（D19，2026-09-29）

| 编号 | 决定 |
| --- | --- |
| W28-1 | A：报名者名单瘦身另开 W0029（排在 W0019 之前）。本 Sprint 只实测名单读取的字节，写进 REPORT，不计入 SC-04 上限 |
| W28-2 | A：其他整行读取消费者不切换，登记为后续候选（活动归属、计划对账、journeys、目标推荐） |
| W28-3 | A：活动页＋详情页本人报名读取**合计** ≤30 MB／月，按改后的绝对字节计 |
| W28-4 | A（D20）：canonical 轻量读取保持旧的失败语义。三表 join 不变，只取 `event_id`、`status`，外加一列 SQL 算出的有效性布尔值；判断条件见事实 4 |

## 已查清的事实（`a25f93ec` 编制；revision 4 在 `a070c5b5` 复核，行号不变）

1. **`features/events/registration/runtime.ts`**（W0027 不改这个文件）
   - 第 69–111 行 `listRuntimeEventRegistrationsForUser`：并行读取三路：
     - legacy 投影 `runtimeProvider.listRegistrationsForUser`；
     - canonical `eventOperationsRepository.listCanonicalRegistrationsForUser`，repository 未配置时是 `[]`；
     - 每场一条 `getEnrollment`。
   - 然后按 enrollment 选路：`legacy_unenrolled`／`legacy_importing` 取投影，其余取 canonical。
   - 第 126–160 行 `readRuntimeEventRegistrationStates`：只用到 `status === "rsvped"` 和 `eventId`。
2. **legacy 投影**（`features/events/registration/storage/live-record-provider.ts`）
   - 第 130–148 行：`store.listRecords({ limit: "unbounded", collectionName: "event_registrations", userId, workspaceId })` 读回这个用户的**全部**报名。然后在内存里用 `isStoredEventRegistration`（第 31–45 行）过滤：
     - 只要求 `registrationId`、`registration.id`、`registration.eventId`、`registration.userId` 是字符串，并且 `registration` 是非数组对象；
     - **不校验 `status`**（review P1-1）。缺失、`null`、任意字符串的 status 都会保留在结果里，下游因为 `!== "rsvped"` 把它视为未报名。
   - 返回整个 `payload`（含 `participantProfile`）。`status` 嵌套在 `payload.registration` 里，现有 `payloadFields` 只能投影顶层键，裁不到它。
   - 第 92–114 行 `getRegistration`：按 `recordId` 取一条，再校验 `eventId`、`userId`、`id === registrationId`，同样不校验 status。
3. **store 包装**（`shared/storage/configured-live-record-store.ts:144–190`，review P1-2）
   - `configured.store` 有两层：外层是 read-budget gate（每次**逻辑调用**先 `gate.assertAllowed({ collectionName })`，见 `features/sync/read-budget-gate.ts:148–166`）；内层是进程内 in-flight 去重（`createReadDedupedLiveRecordStore`，键是操作名加规范化后的查询，数组先排序）。
   - 所以两个并发的相同读取只发一条 SQL，但闸门会检查两次。直接用 `configured.client` 会同时绕过这两层。
4. **canonical**（`features/events/event-operations/storage/canonical-registration-repository.ts`）
   - 第 957–968 行：`registrationSelect()`（第 348–376 行）是 heads join `membership_versions` join `profile_versions`，返回 13 列，其中有 `profile_payload`。
   - 第 324–346 行 `registrationFromRow` 逐行解析；`listCanonicalRegistrationsForUser` 和单场 `getRegistrationWith` 用 `.map` 或直接调用它，**任意一行解析失败，整次读取就抛错**，已取消的行也算在内。解析会抛错的条件如下（revision 3 按源码和 node 实验逐条核对）：
     - `profile_payload` **不含** `registrationProfile` 键。`clone(undefined)` 等于 `JSON.parse(undefined)`，会抛 `SyntaxError`（已用 node 验证）。键存在但值为 `null` 时，`clone(null)` 返回 `null`，**不抛错**；值为字符串、数组等非对象时也**不抛错**。本人报名读取不会访问画像内容，所以这两种情况对本 Sprint 都不影响结果。
     - `event_id`、`actor_id`、`participant_id`、`source_registration_id` 为空串（`text()`）。这些列都是 `text not null`，只可能出现空串这一种坏值。
     - `registered_at`、`head_updated_at` 不是有限时间，或者 `cancelled_at`、`reactivated_at` 非空且不是有限时间。列类型是 `timestamptz`，但 PG 允许 `'infinity'`／`'-infinity'`。node-pg 的 `postgres-date` 会把它们解析成 `Infinity`／`-Infinity`，`timestamp()` 随后抛错（已用 node 验证）。**这一条是 revision 2 漏掉的。**
     - status 不是 rsvped／cancelled。heads 表有 CHECK 约束，实际构造不出来；判断条件里仍写上，作为防御。
     - `jsonValue(profile_payload)` 要求是非数组对象。表上有 `jsonb not null` 加对象类型的 CHECK（`migrations.ts:84`），也构造不出来。
   - 有效性判断条件（W28-4 A），和上面逐条对应：
     ```sql
     profile_version.profile_payload ? 'registrationProfile'
     and membership_head.event_id <> '' and membership_head.actor_id <> ''
     and membership_head.participant_id <> '' and membership_version.source_registration_id <> ''
     and isfinite(membership_version.registered_at) and isfinite(membership_head.updated_at)
     and (membership_version.cancelled_at is null or isfinite(membership_version.cancelled_at))
     and (membership_version.reactivated_at is null or isfinite(membership_version.reactivated_at))
     and membership_head.status in ('rsvped','cancelled')
     ```
     任意一行判定为 false，JS 端就抛出和旧读取同类的错误（`Canonical event registration row has an invalid ...`，报错文案不要求逐字一致，调用方只看是否 reject）。
     Generator 如果发现 `registrationFromRow` 还有别的抛错点（以开工时的源码为准），必须补进这组条件，并在 SC-01 的损坏矩阵里加上对应用例。
   - heads 表到两张 version 表都有外键（第 136–163 行），所以 join 后的行集和只查 heads 相同；但失败语义只有保留 join 才能一致，因此按 W28-4 A 保留 join。
   - canonical 读取目前**不经过** gate，也没有去重（直接走 event-ops client）。
5. **详情页本人报名**（`features/events/registered-catalogue-attendees.ts:15–51`）
   - 先调 `eventRegistrationRuntimeService.get(...)`（`deadline-gated-service.ts:226–235`：读 enrollment，再从 legacy 或 canonical 取一整行），只看 `status === "rsvped"`。
   - 已报名时再调 `listCanonicalRegistrations(eventId)` 读名单（W0029 负责）。
   - 详情页调判定的位置（`a070c5b5` 核对）：
     - `app/(app)/app/events/[id]/page.tsx`：第 117–132 行 `resolveEventDetailActorId` 调 `resolveAuthenticatedApiActorFromSession` 得到 `actor.id`；第 157–170 行只在已登录且解析成功时，才以 `actorId` 调 `resolveConfiguredCanonicalEventDetailView`。已登录但解析为 null 或抛错时直接走 `unavailable`（证据 id `event-detail-account-unavailable`），不调判定。
     - `app/(app)/app/canonical-event-detail-view.ts:231` 把 `readRegisteredCatalogueAttendees` 注入为 `readRegisteredContext`，第 141 行调用。
     - 兜底入口：`app/(app)/app/orbit-registered-event-route-view-model.ts:35`（`getOrbitRegisteredEventViewModel`）。
   - 账号解析这一步（`resolveAuthenticatedApiActorFromSession` → `readAccountSessionGraph`）**不在本 Sprint 范围**，它的字节由 W0030 处理（D22），不计入 SC-04。
6. **页面文件不需要改**：页面只消费 `registered` 布尔值。
7. **测试替身**：
   - `tests/pages/app-events-registration-actor-id.test.tsx:136–161`（W0024）和 `tests/pages/app-agent-registration-actor-id.test.tsx:92–110`（W0018）用 require.cache 替换 `live-record-provider.ts` 和 `event-operations/repository.ts`。
   - runtime 改调新方法后，这两份替身要同步加新方法，原有断言不动。
   - W0027 新建的详情页测试：`tests/pages/app-event-detail-actor-id.test.tsx`。它用依赖替身直接替换 `readRegisteredContext`，不经过 `readRegisteredCatalogueAttendees` 和报名 runtime，所以本 Sprint 改内部读取不需要改它，只要求照旧通过。
   - W0027 顺带改了三份读页面源码的测试（`app-event-detail-live-route-services.test.ts`、`app-event-detail-page.test.tsx`、`app-event-registration-guide.test.tsx`，断言页面含 `resolveAuthenticatedApiActorFromSession(`）。本 Sprint 不改页面文件，它们不受影响。
8. **审计棘轮**：`tests/audits/unbounded-list-reads.test.ts` 数 `limit: "unbounded"` 出现的次数，只许减少；`live-record-provider.ts` 的基线是 2（baseline 第 44 行）。
9. **W0024 实测**（`~/orbit-sprint-evidence/web/sprint-W0024/run-01/04-measure.txt`）：
   - 5 场报名：legacy 10,365 B，canonical 12,760 B。
   - 报名窗口：13 条语句，1,180 B。
   - 30 MB／月换算下来，每次打开约 1,000 B。
10. **W0027 交接给本 Sprint 的数据**（`docs/sprints/W0027-event-detail-actor-id/REPORT.md`「交接」）：
   - 详情页本人报名读取（`readRegisteredCatalogueAttendees`）和名单读取的字节，W0027 **没有测**。
   - W0027 之后参数从会话 id 换成账号 id：对账号 id ≠ 会话 id 的用户，改前读不到行，改后读到真实行，增量性质和 W0024 相同。所以 SC-04 ③（详情页本人判定）和 ④（名单）都要按**改后的绝对字节**实测，不能拿 W0027 之前的数据做「改前」。
   - W0027 实测的账号解析 1,959–1,984 B／次（约 118–119 MB／月）属于 W0030，不进本 Sprint 的合计。

## 决定：新增轻量读取，不改现有函数

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| 改 `listRuntimeEventRegistrationsForUser`、`listRegistrationsForUser`、`listCanonicalRegistrationsForUser` 的返回列 | **不采用** | 三者都是 CRITICAL，返回完整的 `EventRegistration`，并且还有其他消费者（D19 W28-2 决定不切） |
| 给 `LiveRecordListQuery` 加嵌套路径投影 | **不采用** | 这是共享存储契约（CRITICAL） |
| **新增**轻量方法，只让 `readRuntimeEventRegistrationStates` 和 `readRegisteredCatalogueAttendees` 改用 | **采用** | 对现有方法只做增量；`readRuntimeEventRegistrationStates` 是 LOW，签名不变 |

下面的命名是建议。Generator 可以调整，但要在 REPORT 里登记。

- **类型**：在 `contract.ts` 加 `EventRegistrationStatusRecord = { eventId: string; status: string | null }`。
  - `status` 故意**不**收窄成 `"rsvped" | "cancelled"`：legacy 的坏数据要原样带回（事实 2），调用方只认 `=== "rsvped"`。
  - canonical 行的 status 由表的 CHECK 约束和有效性判断（事实 4）共同保证。
- **legacy 投影**：`EventRegistrationProvider`（`service.ts:9`）新增两个必需方法：
  - `listRegistrationStatusesForUser(userId, eventIds)`
  - `getRegistrationStatus(eventId, userId)`

  两种实现：
  - 内存 provider：从现有结果映射。
  - live-record provider：新增可选参数 `statusSql?: { client; gate: ReadBudgetGate | null }`。
    - **有 `statusSql` 时**，专用 SQL 必须先经过一层和 store 等价的封装（review P1-2）：
      1. 每次逻辑调用先执行 `gate?.assertAllowed({ collectionName: "event_registrations" })`，闸门关闭时在发 SQL 之前抛错；
      2. 然后按「操作名 + workspaceId + userId + 排序去重后的 eventIds（或 eventId）」做 in-flight 去重：Promise 结束（成功或失败）就删除键，失败结果不缓存；
      3. 再执行 SQL。
    - 封装的实现可以复用或抽出 `createReadDedupedLiveRecordStore` 里的 `once`。抽出属于必要的纯函数提取，要在 REPORT 登记。
    - **没有 `statusSql` 时**（内存 store、脚本、seed、cloud-worker），复用现有的 `listRegistrationsForUser`／`getRegistration` 再映射，这样不新增 `limit: "unbounded"`。
  - `createConfiguredEventRegistrationProvider` 在 PG 分支传入 `{ client: configured.client, gate: resolveSharedReadBudgetGate() }`。
- **canonical**：`EventOperationsRepository`（`repository.ts:278` 附近）新增两个方法：
  - `listCanonicalRegistrationStatusesForUser(userId, eventIds)`
  - `getCanonicalRegistrationStatus(eventId, userId)`

  PG 实现写在 `canonical-registration-repository.ts`，并加进第 30–40 行的 `Pick`；只取 `event_id`、`status` 和有效性布尔值（事实 4），三表 join 保留。内存实现写在 `memory-repository.ts:1128` 附近。canonical 读取**不加** gate 和去重，和现有 canonical 读取保持一致。
- **runtime**：
  - 新增 `listRuntimeEventRegistrationStatusesForUser`：结构照搬第 69–111 行。
  - 新增 `readRuntimeEventRegistrationStatus({ eventId, userId })`：选路照搬 `deadline-gated-service.ts:226–235`，语句数和现在的 `get` 相同，都是 enrollment 1 条加存储 1 条。
  - `readRuntimeEventRegistrationStates` 改为调用新增的批量函数。
- **`readRegisteredCatalogueAttendees`**：本人判定改调 `readRuntimeEventRegistrationStatus`，名单部分不动。

建议的 legacy SQL 如下（结构校验和 `isStoredEventRegistration` 一致，**不按 status 过滤**，Generator 以等价测试为准）：

```sql
select payload #>> '{registration,eventId}' as event_id,
       payload #>  '{registration,status}'  as status   -- 原样带回 jsonb（缺失为 SQL null），在 JS 里只判断是否等于 "rsvped"
  from orbit_records
 where workspace_id = $1 and collection_name = 'event_registrations' and user_id = $2
   and lifecycle_state <> 'deleted'
   and jsonb_typeof(payload -> 'registrationId') = 'string'
   and jsonb_typeof(payload -> 'registration') = 'object'
   and jsonb_typeof(payload #> '{registration,id}') = 'string'
   and jsonb_typeof(payload #> '{registration,eventId}') = 'string'
   and jsonb_typeof(payload #> '{registration,userId}') = 'string'
   and payload #>> '{registration,userId}' = $2
   and payload #>> '{registration,eventId}' = any($3::text[])
 order by coalesce(occurred_at, updated_at) desc, updated_at desc;  -- 与 listRecords 同序，重复记录仍是「后写入 Map 者胜」
```

legacy 的 status 不能用 `#>>` 取成文本再比较。原因：如果 status 是 JSON 的 `"rsvped"` 以外的类型（例如数字），旧代码判断为不等于 `"rsvped"`。所以取 jsonb，在 JS 里用 `=== "rsvped"` 判断；或者在 SQL 里写 `jsonb_typeof(...) = 'string' and ... = 'rsvped'` 算出布尔值。无论哪种写法，都必须通过 SC-01 的 status 矩阵。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件（行号按 `a25f93ec` 编制，`a070c5b5` 复核不变）

- `features/events/registration/runtime.ts`：全文。
- `features/events/registration/service.ts`：第 9–25、43–45、85–131 行。
- `features/events/registration/contract.ts`：第 79–98 行。
- `features/events/registration/storage/live-record-provider.ts`：全文。
- `shared/storage/configured-live-record-store.ts`：第 45–190 行（去重实现与包装顺序）。
- `features/sync/read-budget-gate.ts`：第 45–175 行。
- `features/events/event-operations/repository.ts`：第 270–285、329–352 行。
- `features/events/event-operations/storage/canonical-registration-repository.ts`：第 30–40、93–99、324–376、957–968 行。
- `features/events/event-operations/storage/migrations.ts`：第 78–163 行（约束）。
- `features/events/event-operations/storage/memory-repository.ts`：第 1124–1133 行。
- `features/events/registration/deadline-gated-service.ts`：第 186–260 行。
- `features/events/registered-catalogue-attendees.ts`：全文。
- 测试：
  - `tests/pages/app-events-registration-actor-id.test.tsx`
  - `tests/pages/app-agent-registration-actor-id.test.tsx`
  - `tests/services/event-registration-batch.test.ts`
  - `tests/pages/app-registered-event-lifecycle.test.ts`
  - `tests/storage/configured-live-record-store.test.ts`：去重测试的写法。
  - `tests/pages/app-event-detail-actor-id.test.tsx`（W0027）：只需跑通，不需要读懂内部。
- 测量：把 `~/orbit-sprint-evidence/web/sprint-W0024/run-01/measure-events-registration-bytes.ts` 复制到本 Sprint 的证据目录再扩展。详情页单场判定可参考 `~/orbit-sprint-evidence/web/sprint-W0027/run-01/measure-detail-actor-bytes.ts` 的临时 schema 造数写法。
- W0027 REPORT 的「交接」要点已摘进事实 5、7、10，不必再读全文。

### 关键符号与影响等级（revision 4：`a070c5b5` 全量重建索引后的结果）

索引注意：`node .gitnexus/run.cjs analyze --index-only` 这次 FTS 构建失败，按名字查函数全部报 not found；`analyze --force --index-only` 全量重建后恢复。同名符号多时要加 `-f <文件>` 消歧，下表都是消歧后的结果。

| 符号（文件） | 等级 | 动作 |
| --- | --- | --- |
| `readRuntimeEventRegistrationStates`（`registration/runtime.ts`） | **HIGH**，影响 4，直接 3：`AppAgentPage`、`AppEventsPage`、`readStartEvents`（revision 3 记 LOW：不加 `-f` 时有歧义，其中一个候选是 LOW） | 改内部实现，签名不变 |
| `listRuntimeEventRegistrationsForUser`（`runtime.ts`） | CRITICAL，影响 13，直接 5（`readRuntimeEventRegistrationStates`、活动归属 3 处、`reconcileEventRegistrationsBatch`） | 不改 |
| `EventRegistrationProvider.listRegistrationsForUser`（`registration/service.ts`） | HIGH，影响 115（同名 2 个候选，另一个 UNKNOWN 0） | 不改；新增同级方法 |
| `EventOperationsRepository.listCanonicalRegistrationsForUser`（`event-operations/repository.ts`） | CRITICAL，影响 115，直接 3（`listMemberships`、`listRuntimeEventRegistrationsForUser`、测量脚本） | 不改；新增同级方法 |
| `createConfiguredEventRegistrationProvider`（`storage/live-record-provider.ts`） | LOW，影响 29，直接 2（`runtime.ts`、种子脚本） | PG 分支多传 `statusSql` |
| `createEventRegistrationLiveRecordProvider`（同上） | **HIGH**，影响 33，直接 6（cloud-worker、seed、configured provider、测量脚本、worker 脚本、`seed-verify-accounts`） | 新增可选参数 |
| `createReadDedupedLiveRecordStore`（`shared/storage/configured-live-record-store.ts`） | **CRITICAL**，影响 277，直接 1 | 只在抽出 `once` 时触及，行为不变 |
| `readRegisteredCatalogueAttendees`（`events/registered-catalogue-attendees.ts`） | LOW，影响 4，直接 3：`resolveCanonicalEventDetailView`、`resolveConfiguredCanonicalEventDetailView`、`getOrbitRegisteredEventViewModel` | 本人判定改调轻量读取 |
| `eventRegistrationRuntimeService.get` | — | 不改（报名页需要整行来回填表单） |

等级下调的条目（`readRegisteredCatalogueAttendees`、`createConfiguredEventRegistrationProvider`）不降低本 Sprint 档位：档位按「共享契约＋权限输入」定为 H，见「最小测试与检查」。Generator 开工时按 RULES §4 第 5 步再跑一次，以开工时的结果为准。

### 前序交接要点

- W0024：活动页在目录读取成功之后解析一次账号，按 `actor.id` 读取；账号解析为 null 时不读本人报名。
- W0027（合并 `2d6bf323`）：详情页登录时先解析账号（1 次，排在详情判定之前），再按 `actor.id` 调判定；未登录不解析；已登录但解析为 null 或抛错时显示「暂时不可用」（`event-detail-account-unavailable`），不回退会话 id、不调判定。本人报名和名单读取的字节 W0027 未测，由本 Sprint 按改后绝对字节实测（事实 10）。
- W0018：报名写入的键是 eventId + `actor.id`。
- W0017／W0021：流量口径是每条语句返回行的 JSON 字节之和。`features/events/core/start-window.ts` 是专用轻量 SQL 的先例。
- W0016：3001 验收 server；verify 账号的会话 id 和账号 id 相同。

### 易错边界（都有对应 SC）

- **legacy 的 status 语义（SC-01）**：记录只按结构校验保留或丢弃，不看 status。缺失、`null`、任意字符串、非字符串的 status 都要保留下来，并算作未报名；不能把这些记录跳过，也不能因此抛错。批量读取和单场读取都要这样。
- **canonical 的失败语义（SC-01、SC-03）**：W28-4 选 A。损坏矩阵里凡是旧读取会抛错的情况，新读取也要抛错；旧读取不抛错的情况（`registrationProfile` 为 null 或非对象），新读取也不能抛错。
- **去重和闸门（SC-03）**：legacy 轻量读取每次逻辑调用都先过闸门，并发的相同调用只发一条 SQL，失败结果不缓存。canonical 维持现状，不加闸门，也不去重。
- **读取失败不能当成未报名（SC-03）**：读取出错要向上抛；详情页经现有的 try/catch 变成 `unavailable`。
- **语句数不增加（SC-04）**：`any($3)` 不能换成逐条查询（N+1）。
- **不能回退到会话 id，也不能提前读（SC-02）**：按 W0024 SC-02 做回归。
- 不新增 `limit: "unbounded"`；不改页面文件、整行读取、报名写入和名单。

## 范围与文件

- **修改：**
  - `features/events/registration/contract.ts`
  - `features/events/registration/service.ts`
  - `features/events/registration/storage/live-record-provider.ts`
  - `features/events/registration/runtime.ts`
  - `features/events/registered-catalogue-attendees.ts`
  - `features/events/event-operations/repository.ts`
  - `features/events/event-operations/storage/canonical-registration-repository.ts`
  - `features/events/event-operations/storage/memory-repository.ts`
  - 如抽出去重工具：`shared/storage/configured-live-record-store.ts`，只做纯函数提取，行为不变
  - 两份页面测试：只加替身，并加「整行方法 0 次」断言
  - tsc 报出的接口替身
- **新建：**
  - `tests/services/event-registration-status-read.test.ts`：SQL 形状、PG 等价矩阵、去重和闸门。
  - 详情页本人判定测试：可以并入上面这个文件。
  - 测量脚本：只放在证据目录。
- **排除：**
  - 页面文件
  - 整行读取函数
  - `eventRegistrationRuntimeService`
  - W28-2 列出的消费者
  - 名单读取（W0029）
  - 迁移和索引：EXPLAIN 显示需要索引时先停下，记入 REPORT
  - 部署

## 验收契约（五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0028-01 | **等价（W28-4 A：失败语义也一致）**。本机 PG 临时 schema 造数据，对照新旧读取。<br>**legacy 矩阵**：rsvped；cancelled；status 缺失、`null`、任意字符串（如 `"pending"`）、数字；别人的报名；集合外的 20 场旧报名；同一 eventId 的重复记录；结构损坏（缺 `registrationId`、`registration.userId` 不符）；已删除。<br>**canonical 矩阵**：rsvped；cancelled；别人的报名；集合外；损坏矩阵，已取消的行和 rsvped 的行各做一遍：<br>- 会抛错：`profile_payload` 缺 `registrationProfile` 键；`source_registration_id`、`participant_id` 为空串；`registered_at`、`membership_head.updated_at`、`cancelled_at`、`reactivated_at` 为 `'infinity'` 或 `'-infinity'`。<br>- 不应抛错：`registrationProfile` 为 `null`、字符串或数组。<br>- 构造不出来的情况（非法 status、非对象 `profile_payload`）由 CHECK 约束排除，在 REPORT 里注明。<br>**对照项**：<br>- 批量：`listRuntimeEventRegistrationStatusesForUser` 与 `listRuntimeEventRegistrationsForUser` 的 `{eventId → rsvped?}` 深相等；<br>- 单场：`readRuntimeEventRegistrationStatus` 与 `eventRegistrationRuntimeService.get(...)?.status === "rsvped"` 逐场相等，legacy 和 enrolled 两种 enrollment 都覆盖；<br>- 失败：凡是旧读取 reject 的情况，新读取也 reject；凡是旧读取不 reject 的情况，新读取也不 reject。批量读取和单场读取都要验证。<br>**SQL 形状**：不返回 `payload`、`profile_payload`、`search_text`；legacy SQL 按活动 id 过滤；eventIds 为空时 0 条语句。 | 新测试先 RED 后 GREEN；PG 部分在 `orbit_test` 上 0 skip |
| SC-W0028-02 | **页面行为不变，并且走轻量路径**：<br>- W0024 与 W0018 页面测试的原有断言一条不改，只换替身，全部通过；<br>- 新增断言：整行方法被页面调用 0 次；<br>- W0024 SC-02 的调用日志和次数照旧，包括目录失败和账号解析为 null 时的 0 次；<br>- 详情页本人判定：rsvped 时下发名单，cancelled 或无报名时返回 null，`eventRegistrationRuntimeService.get` 0 次；<br>- `tests/pages/app-registered-event-lifecycle.test.ts` 通过；<br>- W0027 详情页测试 `tests/pages/app-event-detail-actor-id.test.tsx` 通过（不改其断言）。 | 定向测试输出 |
| SC-W0028-03 | **失败、闸门、去重**：<br>(a) 任意一路轻量读取抛错，`readRuntimeEventRegistrationStates` 同样 reject；<br>(b) 闸门关闭时，legacy 轻量读取在发 SQL 之前抛出 `ReadBudgetExceededError`，SQL 调用 0 次；<br>(c) 两个并发、参数相同（eventIds 顺序不同也算相同）的 legacy 轻量读取：闸门检查 2 次，SQL 1 次，两个调用得到相同结果；第一条失败后，下一次调用重新发 SQL；<br>(d) repository 未配置时，canonical 为空；<br>(e) 详情页本人判定抛错时，结果是 `unavailable`，不进入私密活动判定。 | 新测试（替身，加计数 client） |
| SC-W0028-04 | **流量**。按 W0024 的口径出「改前（整行）／改后（轻量）」对照表，列出语句数、行数、字节：<br>① 13 场目录，legacy 和 canonical 各有 1 场、5 场报名；<br>② 在 ① 的基础上再加 20 场目录外的 legacy 旧报名；<br>③ 详情页本人判定单场，两条路径各一次；<br>④ 名单读取单列实测（活动 5 人、30 人），不计入上限（D19 W28-1）。<br>**要求**：<br>- 语句数改前改后相同；<br>- ② 的改后字节与 ① 相同；<br>- 活动页 5 场时单次 ≤1,000 B；<br>- 按「1000 人，每人每天活动页 1 次＋详情页 2 次，每人 5 场报名全落在字节较大的一路，30 天」估算，改后绝对字节合计 ≤30 MB／月。<br>超出时本项 failed，交用户裁决。 | 测量输出 + REPORT 表格 |
| SC-W0028-05 | **回归**：<br>- 以下测试通过：`tests/pages/app-events-community-card.test.tsx`、`app-events-registration-state.test.ts`、`app-events-live-route-services.test.ts`、`app-start-guide-page.test.tsx`、`app-agent-guide-demo-page.test.tsx`、`app-canonical-agent-personal-scope.test.ts`、`app-canonical-event-detail-view.test.ts`、`app-event-detail-page.test.tsx`、`tests/services/event-registration-batch.test.ts`、`canonical-participant-event-journeys.test.ts`、`public-goal-recommendations-runtime.test.ts`、`tests/capabilities/event-registration-live.test.ts`、`tests/storage/configured-live-record-store.test.ts`、`tests/audits/unbounded-list-reads.test.ts`（计数不增加）；<br>- `npx tsc --noEmit -p .` 通过；<br>- 3001 上用 verify-plan 看活动页（全部／我的活动）和已报名活动的详情页，桌面 1440 与手机 375，控制台 0 错误；<br>- 一次全量基线对照，没有新增失败。 | 定向测试、tsc、截图、RULES §5.2 |

## 一次 Generator 的执行顺序

1. 复核进入条件：W0027 已合并（`2d6bf323`），revision 4 已刷新占位；确认 HEAD 仍基于 `a070c5b5`，若之后又有代码合并，先用 `git diff a070c5b5 HEAD -- <修改白名单>` 核对行号。保存基线和 Planner 哈希，刷新 GitNexus 索引（FTS 失败时用 `analyze --force --index-only`），逐个符号加 `-f` 做 upstream impact（UNKNOWN 的用文本搜索补查）。
2. 跑测量脚本，拿到改前的数据。
3. 写 RED：SC-01（含 status 矩阵和 canonical 损坏矩阵）、SC-03（闸门、去重、失败）、SC-02（替身和 0 次断言）。
4. 按这个顺序做最小实现：类型 → 接口与实现（含去重封装）→ runtime → 两处切换 → 补齐替身。
5. 跑定向测试和 tsc，测改后的数据；对两条批量 SQL 做 EXPLAIN，结果记入 REPORT。
6. 浏览器验证，暂存区 `detect-changes`，按路径提交。
7. 全量对照；做一次 Codex 代码 review，重点看等价性、闸门和去重、失败语义；由同一 Generator 修复；写 REPORT，交接。

## 最小测试与检查

- **档位：H。** 理由：新增 SQL；扩展了两个 CRITICAL 共享接口；读取封装会触及进程内去重；详情页私密访问判定用到本人报名输入。对应 RULES §5.1 的「共享契约」和「权限」。
- **开发定向集：**
  - 新测试
  - 两份页面测试
  - `tests/pages/app-registered-event-lifecycle.test.ts`
  - `tests/services/event-registration-batch.test.ts`
  - `tests/storage/configured-live-record-store.test.ts`
  - `tests/audits/unbounded-list-reads.test.ts`
  - PG 测试先导出 `ORBIT_EVENT_DATABASE_URL`（指向本机 `orbit_test`），并先跑 `node scripts/assert-local-test-databases.mjs`。**不要 source `.env`。**
- **收口：** SC-05、tsc、一次全量对照、一次 Codex 代码 review。
- **浏览器：** 3001 验收 server，账号 verify-plan。收尾执行 `git checkout -- next-env.d.ts`。
- **不运行：** 付费 AI、Preview、生产库。

## 失败与交接

REPORT 需要写明：
- 最终命名；
- 改前改后对照表和月估算，以及估算假设；
- EXPLAIN 结果；
- 等价矩阵和损坏矩阵的覆盖情况，以及有效性判断条件的最终版本；
- 闸门和去重的证据；
- 顺带受益的页面：`/app/agent`、`/app/start`；
- 名单读取的实测（交给 W0029 作为基线）；
- 活动页与详情页本人报名读取的实测月流量，分两行列出：W0029 要用它们重算用户路径的流量总账（W0029 PLANNER「预算重算」表的 A、B 两行）；
- W28-2 的后续候选。

交接内容：分支 `sprint/W0028-registration-status-read`，固定最终 SHA，目标合并到 `chat-agent`。另外补给 W0019：上线后在 Neon 控制台对照这两条轻量读取。

回退：revert 本 Sprint 的提交即可。接口只是新增，不影响旧消费者。

## 开放问题

无。W28-1～W28-4 已由 D19、D20 决定，见「已定决定」表。

W28-4 A 的代价（留档）：每行多一个有效性布尔值，约 20–25 B。5 场报名时每次打开约多 125 B，按合计口径每月约多 4.5 MB，合计预估改后约 15–22 MB，仍在 30 MB 以内。三表 join 的数据库开销和现在一样。

## 观察项（不在本 Sprint 处理）

- `readRuntimeEventRegistrationStates` 每场会读两次 enrollment，外加一次 `getPublishedEvent`。这属于语句数优化，只记录不处理。
- 名单读取（`listCanonicalRegistrations`）和匿名报名预览（`/api/events/[id]/registration/preview`）都会读取整行，已交给 W0029。

## review 处理

| review 意见（`codex-plan-review.txt`） | 处理 |
| --- | --- |
| P1-1 legacy status 语义：旧校验不看 status，缺失、null、任意字符串的记录仍然返回，只是算未报名 | 接受。事实 2 写明旧语义；类型改为 `status: string \| null`，不收窄；建议 SQL 不按 status 过滤，并说明为什么要取 jsonb；易错边界增加对应条目；SC-01 legacy 矩阵加入缺失、null、任意字符串、数字的 status，批量和单场都对照 |
| P1-2 轻量 SQL 绕过了 store 的 in-flight 去重 | 接受。事实 3 写明包装顺序；legacy 轻量读取必须经过等价封装：每次逻辑调用先过闸门，再对相同查询做 in-flight 去重，失败不缓存；canonical 维持现状（原本就没有闸门和去重）。SC-03 (b)(c) 增加闸门在发 SQL 之前生效、并发相同参数只发一条 SQL、失败后重新发起三项测试 |
| P1-3 canonical 只查 heads 时失败语义不同 | 接受。事实 4 列出旧读取会抛错的具体条件，以及哪些由表约束保证；新增开放问题 W28-4，给出两种做法的代价，推荐 A（join 加有效性布尔值，每行约多 20–25 B）；SC-01 加入 canonical 损坏矩阵，SC-03 (e) 保留 |
| P2 基线还没有包含 W0027 | 接受。基线、W0027 REPORT、详情页调用点、W0027 测试文件、impact 结果都标成【W0027 合并后刷新】，由协调者在开工前刷新；进入条件里加入「已刷新」；说明行号按 `a25f93ec` 核对，以刷新后为准 |
| D19（用户裁决 W28-1～W28-3，均选 A） | 并入「已定决定」表；名单只实测，交给 W0029；SC-04 ④ 单列名单，不计入上限 |
| D20（用户裁决 W28-4 选 A） | 并入「已定决定」表；开放问题清空；事实 4、易错边界、SC-01 都按 A 写成确定要求 |
| 来源：W0029 方案 review 交叉核对（W0029 P1-1 指出 canonical 损坏语义判断不准） | 部分接受。按源码加 node 实验逐条核对 `registrationFromRow`：<br>(1) 缺 `registrationProfile` 键**确实**会抛错（`clone(undefined)`），W0029 review 认为「只校验 profile_payload 是对象」这一点不成立，本条件保留；<br>(2) 键存在但值为 null 或非对象时**不**抛错，已写明，并加入「不应抛错」矩阵；<br>(3) revision 2 **漏掉了**无穷时间戳（`'infinity'` 经 postgres-date 解析成 `Infinity`，`timestamp()` 随后抛错），已补进有效性条件和损坏矩阵；<br>(4) 非法 status、非对象 `profile_payload` 由 CHECK 约束排除，条件里保留一条防御，REPORT 注明构造不出来 |

## 修订记录

- revision 4（2026-09-29，协调者）：W0027 合并后按 `a070c5b5` 填实全部【W0027 合并后刷新】占位（基线、详情页调用点与行号、W0027 测试文件、W0027 交接数据→事实 10、impact 表重跑并加 `-f` 消歧）；源码 diff 为空，行号不变；SC-01～05 语义与上限不变。
