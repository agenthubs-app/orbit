# Sprint R16 — REVIEW（独立复核 · 服务端部分）

**复核人：** 独立 AI 复核会话，2026-10-12。全新上下文，没参与实现，也没看执行会话的推理。
**对象：** `1b2be48a`（契约：导入契约、契约 3 追加）、`d3a7dfc6`（纯函数 `work-contact-likelihood` / `vcard-build` / `completion-question-rules`，`features/contacts/completion` 每天一问 live）。复核时 HEAD = `d3a7dfc6`；工作区里另有别的会话的未提交文件（shell / task / tokens / Overlay 等），与本次无关，没有动。文中行号按 `d3a7dfc6`。
**范围：** 只复核服务端。两端界面（导入四门、まとめて確認、`CompletionQuestionCard`）与像素门禁按用户指示暂停（等逐像素标准），不算缺陷；本 Sprint 也还没有 REPORT。
**依据：** `GOAL.md`、`PLANNER.md`（rev 3）；`add-and-invite/DESIGN.md` §2.7、§2.8、§3.3、§3.4、§4.3、§9 #20 #21 #24；`sprints/README.md` 通用规则 10（宽进严出）、11（偏离设计先请用户拍板）；格式按 `R15-invite-codes/REVIEW.md`。

下面的结论来自复核人重读代码、重跑测试，以及 scratchpad `r16-review/` 里的三个临时探针：`likelihood-probe.mts`（预选规则误判）、`vcard-probe.mts`（vCard → 服务端解析器往返的边界）、`completion-probe.test.mts`（P1–P5：两个服务实例并发取题、东京日边界、过期题、活动选项来源、全量读取成本）。探针只连本机 `postgres://localhost/orbit_test`（随机 schema，用完删除）。

## 结论：有条件通过（没有 S；M1–M5 应修）

服务端骨架扎实：导入契约是对着真实 handler + 本机 Postgres 逐字段核对出来的，没有漏字段、也没改写值；契约 3 只加可选字段、枚举宽进；快照与 App 副本一致。每天一问的「一天一题」由记录 id（人 + 东京日）+ `insertRecordIfAbsent` + 按人的 advisory 锁三重保证，两个服务实例并发 6 次取题只生成 1 条；东京日边界、同天重放、跳过 3 次停止、他人隔离、幂等、示例模式拦写都成立。

要修的是规则层面的「判断错」：预选把银行支店、东京ガス、关西電力、ヤマト運輸、岩波書店、姓「土屋」的人当成店铺 / 服务排除（M1）；vCard 按通讯录顺序输出邮箱，而服务端只取第一个，私人邮箱在前时公司邮箱会丢（M2）；「我参加过的活动」用联系人的 `metEventId` 代替参加记录、用最早一位联系人的加入时间代替活动日期，6 月的活动会出现在 10 月导入的人的选项里（M3，也是对 PLANNER 的偏离，需拍板）；每天第一次取题全量读人脈（含备注全文）（M4）；mock 与 live 行为不一致，乙按 mock 做卡片会漏掉 `densityAfter` 与「答过消失」（M5）。

### 已经做到、复核人独立核实过的部分

**测试与检查真实通过**（都在 `d3a7dfc6` 上，Postgres 只用本机 `orbit_test`）：

| 范围 | 结果 |
| --- | --- |
| orbits 8 个文件：`contracts/contact-import-contract-parity`、`domain/{completion-question-rules,vcard-build,work-contact-likelihood}`、`services/completion-question`、`api/{completion-question-routes,redesign-contract-routes}`、`contracts/demo-world-consistency` | 82 / 82（含 parity 4 个 Postgres 用例、completion 5 个 Postgres 用例，均实际执行、未跳过） |
| 门禁：`contracts/{contract-append-only,redesign-schema-parity}`、`services/contact-import-events-postgres` | 8 通过 / 1 跳过 / 0 失败 |
| App：`contract-sync`、`contract-fixtures-parse`、`contract-tolerant-reading` | 7 / 7 |
| orbits `typecheck`、`typecheck:app`、`lint`；App `tsc --noEmit` | 都是 0 错误 |
| `node scripts/contract-snapshot.mjs` | 「契約快照一致」 |
| App 副本 8 个文件（契约 3 个、schema 2 个、compute 3 个）与源 `diff` | 完全相同 |

**导入契约如实描述现有响应（SC 契约部分）。** 复核人对照 `app/api/contacts/import/handlers.ts` 与 `features/contacts/import/{types,service}.ts`：
- parity 测试用真实 `createContactImportHandlers` + 真实 `createContactImportService` + 随机 schema，跑 csv·linkedin（上传、四种 filter 的行、列表、单个、决定、提交、提交后行）、csv·generic（含 Shift_JIS、未知表头、改映射、取消）、vcard（上传、行、提交）、event（活动列表、导入一场）；每个响应 `schema.parse` 后与原 JSON `deepEqual`——zod 会丢掉未声明的键，所以相等 = 契约没漏字段、没改值。请求体都先过严格 schema 再发给 handler。
- 上传头常量与 handler 读的头一致（`x-orbit-import-kind` / `idempotency-key` / `x-orbit-import-file-name`，`handlers.ts:136-142`）；失败 `reason` 列表与 `ContactImportError` 的 8 个码、`ContactImportRejectReason` 的 6 个值一致。
- 宽进：`kind/format/status/decision/followUp.state` 都是 `tolerantEnum`（未知 `decision` 读成 `skip`，不会被当成新建 / 合并；未知批次状态读成 `expired`，不会无限轮询），`issues` 用 `knownValues`，列表用 `readableItems`，候选用 `ingestContactCandidateObject.shape` 放宽外层（内层是平的，`matchedOn` 宽进）。严出：四个请求体都 `.strict()`、枚举封闭、上限与 handler 一致（2000 条）。
- PLANNER 草案里的 `counts{ total, duplicates, needsReview, ready, committed }` 在真实响应里不存在，契约按真实形状（`counts{created,merged,skipped,failed}` + `review{…}`）写——这是对的，PLANNER 本来就要求「以 types.ts 和 handler 为准」。

**契约 3 追加（DESIGN §4.3）。** `contactName / contactSubtitle / sourceChip / kind` 都是可选，`kind` 兜底 `met_where`、`sourceChip` 兜底 `manual`；`densityAfter` 可选 `1|2|3`；`askedOn` 注释改为东京日；没有给任何必填字段加 `| undefined`。演示世界的题改成 R16 形状（●○○ 的 LinkedIn 联系人、选项 = 演示世界里真实存在的活动 + 固定项）并进了 `demo-world-consistency`。

**每天一问规则逐条（SC-R16-05 服务端部分）：**
- **一天一题、并发：** 记录 id = sha256(人, 东京日)（`repository.ts`）；取题先只读，没有才进写锁（`pg_advisory_xact_lock`，按 workspace + 人），锁内再查一次，再 `insertRecordIfAbsent`。探针 P1：同一个库上两个独立的服务实例（模拟两台服务器 / 两台设备）并发 6 次 `today()` → 1 个 id、库里 1 行。
- **东京日边界：** P2：`2026-10-12T14:59:59.999Z` 出的题 `askedOn = 2026-10-12`，跳过后 `15:00:00Z` 再取 → `2026-10-13`、新题、`skipCount = 1`。`tokyoCalendarDaysUntil(now, addedAt)` 的方向复核过（= 已过天数，非负），30 天窗口与 ±14 天窗口都按东京日。
- **同天重放 / 答后消失：** 同一天再取返回同一题；答过或跳过后当天 `null`（服务端状态，另一端刷新即消失）；当天没有可问的人写 `status = none`，当天不再读人脈（测试断言读库 1 次）。
- **挑人与题型：** ●○○（D-10，`contactDensity`）且近 30 个东京日内加入、没被连续跳过 3 次；最新加入的优先；缺公司先问「会社は？」，否则问「どこで？」；同一题型答过（含「覚えていない」）不再问。
- **选项不编造：** 活动只来自我人脈里真实记着的 `metEventId/metEventTitle`（来源本身有问题，见 M3），「前職の同僚」只在人脈里另有同公司的人时出，公司只来自同一非免费邮箱域名的联系人；固定项「紹介」「覚えていない」「自分で入力」；选项与固定项同名时去重；长度裁到 60 字，回答按裁后文字匹配、写入用原值。
- **四种回答写入位置：** 活动 → `metEventId/metEventTitle`（只补空）；紹介 / 前職の同僚 → 备注末尾一行「出会い：…」（已有同一行不重复）；公司 → `organization`，经 `applyContactFieldValues`（乐观并发，旧值进 `fieldHistory`，来源 `completion`）；覚えていない → 联系人不变，只记在问题上（测试断言整个 payload 不变）。「自分で入力」本身不是合法答案；手输公司 ≤120 字。
- **`densityAfter`：** 写入后从库里重读联系人，往来（`contact_detail_states` 的笔记 / 最近互动）与本人入力（R15 `inviteLinkedContactIds`，读失败按没有算）一起按 D-10 重算；有邮箱答「どこで」→ 2，没有邮箱 / 电话 → 仍是 1。
- **跳过 3 次、明日：** `skipCount` 跨天累计、答过归零、连续 3 次后不再问这个人；跳过同键重放返回同结果，跳过后再答 → CONFLICT。
- **他人隔离：** 记录读取同时校验 `userId` 与 payload `actorId`；Bob 答 / 跳 Alice 的题 → NOT_FOUND（与不存在同一响应）。
- **示例模式：** 演示账号或 `x-orbit-sample: 1` → 回答 / 跳过 403 `SAMPLE_READ_ONLY`，取题返回 `null` 且不写库；与 R12 / R15 同一口径。
- **live 接线：** `service-factory` 只给 `contact-completion` 注册 live，其余 6 个契约 live 仍是 NOT_IMPLEMENTED；live 响应仍过契约 schema 再发出；库未配置 503。impact 记录（`~/orbit-sprint-evidence/redesign/R16/run-01/impact-server.md`）里 HIGH 的 `applyContactFieldValues` 只新增调用方、未改实现，属实。

**vCard 往返（SC-R16-01 的服务端前提）。** 转义（`\` `,` `;` 换行）、UTF-8 75 字节折行（不切开字符，含 emoji、跨行的 `\n` 转义）往返无损；中日文姓在前、西文名在前；手机标 `CELL` 被服务端优先取用；多行备注、LinkedIn URL、地址国家都能回来。

## 问题清单

### S（必须修）

无。

### M（应该修）

**M1 预选的「排除」规则同时套在公司名上，大量正常的工作联系人被当成店铺 / 服务排除。**
- 现象：`work-contact-likelihood.ts:82` 对名字**和公司名**跑 `EXCLUSION_PATTERNS`（`:50-54`），`shop` 里有 `店$|店\s|屋$|屋\s|ジム…`，`service` 里有 `ガス|電力|運輸|delivery…`。探针 `likelihood-probe.mts` 的结果（都是有公司名 / 公司邮箱 / 职称的人，`likely` 全是 false）：
  - 「三菱UFJ銀行 渋谷支店」「トヨタ自動車株式会社 名古屋支店」「株式会社岩波書店」→ `shop`（`店$`）；
  - 「土屋 太郎 · ソニー株式会社 · @sony.co.jp」「古屋 · @nexa.co.jp」→ `shop`（`屋\s` / `屋$` 命中姓氏）；
  - 「東京ガス株式会社 · 課長」「関西電力」「ヤマト運輸株式会社 · 部長」「Delivery Hero SE · VP」→ `service`；
  - 「ジム・スミス · Acme · CTO」→ `shop`（`ジム`）。
  反过来，「Mom (cell)」带公司域名邮箱会被预选（家人称呼只认整段名字）。
- 为什么是问题：DESIGN §2.7 / §9 #20 写的是排除「母」「〜店」「病院」等**个人用名字**——通讯录里存成「◯◯店」「◯◯病院」的那种条目。日本的名片 / 通讯录里「◯◯支店」「◯◯ガス」「◯◯運輸」是最常见的公司写法之一，「土屋」「古屋」「守屋」是常见姓。PLANNER 易错边界第 2 条明确列了「把有公司邮箱的人漏掉」。用户虽然能手动补选，但预选的意义就是让 1,284 人里不用逐个看。
- 修法：排除只看「名字」这一栏，并且只在没有工作依据时生效，或者至少：① 公司名不参与 `shop/service` 判断（`medical` 可以保留，DESIGN 点名了病院）；② `店/屋` 只认名字结尾且整段名字不像「姓 + 名」（例如名字里有空格分隔的两段、或有公司邮箱 / 职称时不排除）；③ 去掉 `支店|本店|書店|代理店` 这类公司用词的误伤（`(?<!支|本|書|代理)店`）；④ `ジム` 删掉或要求整段等于「ジム」；⑤ 家人称呼先去掉括号与「携帯」「自宅」「iPhone」等后缀再比较。把上面探针里的 11 个例子加进表驱动测试。

**M2 vCard 按通讯录原顺序输出邮箱，服务端只取第一个——私人邮箱在前时公司邮箱丢失。**
- 现象：`vcard-build.ts:141` 按 `entry.emails` 原顺序写 `EMAIL`；服务端解析器只取第一个 `EMAIL`（`features/contacts/import/parse/vcard.ts:153`）、第一个 `TEL`（`:154`，有 `CELL` 时取 `CELL`）、`ORG` 第一段。探针：`emails = [home ken@gmail.com, work ken.sato@nexa.co.jp]` → 导入后的邮箱是 `ken@gmail.com`，公司邮箱没了；`phones = [work fax, work]` → 存成传真号。iPhone 通讯录里个人邮箱在前很常见。
- 为什么是问题：这个人正是因为有公司邮箱才被预选（M1 的 `work_email` 依据），导入后反而只剩私人邮箱——查重（邮箱命中）、浓度（D-10）、以后发邮件都受影响。PLANNER 易错边界「vCard 转换丢了公司 / 职位 / 多个电话」；测试只断言「文本里有 2 个 EMAIL」，没断言服务端留下的是哪一个。服务端零改动是 DESIGN §9 #21 的前提，所以应该在生成端排好顺序。
- 修法：`buildVcard` 输出前排序：邮箱按「标签是 work 或非免费域名」→ 其余；电话按「mobile/CELL」→「work（非 fax）」→ 其余，传真放最后。补往返测试：私人邮箱在前 → 服务端取到公司邮箱；传真在前 → 服务端取到语音号码。

**M3 「我参加过的活动」不是参加记录，活动时间也不是活动日期——会出现时间不对的活动选项（对 PLANNER 的偏离，需用户拍板）。**
- 现象：`service.ts:114` `attendedEvents` 把「我的联系人里记着的 `metEventId`」当成我参加过的活动，时间取这些联系人里最早的 `createdAt`。探针 P4：6 月活动的名片 10 月 9 日才补录 → 10 月 10 日导入的 LinkedIn 联系人的「どこで？」选项第一个就是「June Summit」。另外，我参加了但没留下联系人记录的活动永远不会出现；「イベントから」导入一个月后才做，活动时间就变成导入那天。PLANNER「已查清的事实」第 6 条写的是「从现有参加记录读（R26 的数据，只读）」；现场交换表 `event_ops_events.starts_at` / `event_ops_relationship_*` 已经在 `features/contacts/import/events-source.ts` 里读过。
- 为什么是问题：DESIGN §2.8 的选项是「与这个人加入时间相近（±14 天）的**我参加过的活动**」，「选项不编造」的前提是时间与参加都真实。现在的选项虽然是真实存在的活动，但「相近」这个判断可能完全不对，用户点了就会把错误的活动写进 `metEventId`（只补空，之后不会再被问）。这个替代是执行人自定的，提交说明与代码注释里写了，但没有进「请用户拍板」。
- 修法：活动来源改成参加记录（`event_ops_events` 的 `starts_at`，本人参加 / 主办的活动；R26 若有更合适的只读接口用它），时间用活动开始时间；参加记录读不到时再退回现在的做法并在注释里写明。LinkedIn 导入的人可考虑用 CSV 的 `connectedOn` 作「加入时间」（导入行里有这个字段）——这一条改了 DESIGN 的口径，一并请用户拍板。补用例：活动日期在窗口外、但名片录入时间在窗口内 → 不出现。

**M4 每天第一次取题全量读本人人脈（含备注全文），候选人的往来记录也不按 30 天窗口筛。**
- 现象：`generate` 每人每东京日跑一次（`none` 标记保证只一次）：`listCompletionContacts` 读最多 20,000 条联系人（`repository.ts:22`），投影里包含 `notes` 全文（`:117`，只为判断有没有「出会い」一行）；再读最多 1,000 条问题记录；然后对**所有** ●○○ 的人（不限 30 天）按 id 读 `contact_detail_states`（`service.ts:182-183`）。探针 P5：3,000 个半年前加入的 ●○○ 联系人、每人 2 KB 备注 → 第一次取题本机 326 ms、读了约 6 MB，而真正有资格的只有 1 个人；第二次 9 ms。这段在按人的写锁 + 事务里执行。
- 为什么是问题：取题会在 App To-do、Web 人脈右栏、首页（R20 / R11 / R10）每天被调用；对每个活跃用户每天一次全量拉人脈，在 Neon 上就是按人脈规模线性的出站流量（项目已有 Neon 出站审计），人脈 2 万人时一次读几十 MB，而且持锁。
- 修法：分两步读——候选人用 SQL 只取近 30 天加入的联系人（`created_at` / `payload->>'createdAt'` 条件）且投影里不带 `notes` 全文，改成在 SQL 里算 `notes ~ '(^|\n)出会い\s*[：:]'` 的布尔值；往来记录只读这些候选人；「同公司 / 同域名」的选项在选定目标后用一条按 `organization` / 邮箱域名过滤的查询取计数即可，不需要整份人脈。补一个「读库行数与人脈规模无关」的用例（例如 3,000 个旧联系人时读取行数 < 50）。

**M5 mock 与 live 行为不一致，乙按 mock 做卡片会漏掉 live 的行为。**
- 现象：`features/redesign-contracts/handlers.ts:39-50` 的 mock：回答接受任意字符串（live 不在选项里 → 400 `INVALID_ANSWER`）；结果没有 `densityAfter`（live 总有）；答过 / 跳过后 `GET` 仍返回同一题（live 当天返回 `null`）；同一题重复回答永远成功（live 换键 → 409）。演示世界的题也没有 `kind = organization` 的样例。
- 为什么是问题：R16 交付的是「接口 + 卡片组件，由乙挂到自己的屏上」（DESIGN §2.8），乙在 dev / 测试里用的是 mock。卡片「答后显示浓度变化」「答后卡片消失」「选项外的答案报错」在 mock 下都测不到，到 live 才暴露。R15 已经把邀请码 mock 改成有状态（真正递增 `usedCount`），有先例。
- 修法：mock 照 live 规则走——按演示世界的选项校验答案、返回 `densityAfter`（演示联系人的浓度按 D-10 算）、进程内记住当天已答 / 已跳过的题（`GET` 随后返回 `null`，`resetDemoState` 一类入口清掉）、换键重答 409；演示世界补一条 `organization` 题。路由测试里 mock 与 live 用同一组断言跑一遍。

### m（建议修）

- **m1 题目生成后不再核对，过期的题会覆盖用户后来的值。** 探针 P3：昨天的「会社は？」没答，今天又给同一人出了「会社は？」；用户先答了昨天那题（Acme），今天这题仍显示，再答（Globex）→ `organization` 被覆盖成 Globex（历史里两条）。用户在人物页自己填了公司后同样会发生。建议 `visible()` 与回答前都按当前联系人重新判断这一题型还缺不缺，不缺就当作已解决（当天返回 `null` / 回答 409）；活动题在 `metEventId` 已有时不要记成「答了 event」却什么都没写。
- **m2 题面与固定选项是写死的日文。** `completionQuestionText`（`completion-question-rules.ts:123`）与 `COMPLETION_OPTION_LABELS` 是日文，回答也要把日文标签原样发回；中文 / 英文界面若直接显示 `question` / `options` 就违反三语规则。建议契约注释写明：卡片按 `kind` + `contactName` 自己拼题面，固定项按值映射到三语文案，`question` 只作兜底；或者在契约里给每个选项加一个稳定的 `key`（只加可选字段）。
- **m3 `sourceChip` 是临时推断，与 R11 的人脈列表可能不一致。** `service.ts:90` 靠来源标签里有没有「vcard」、备注里有没有「LinkedIn:」行来判断；带 LinkedIn URL 列的汎用 CSV 会被标成 `linkedin`，活动导入的人是 `manual`。建议把推断放进 `shared/compute`（与 R11 共用一份），或在导入写联系人时把 `format` 记进 `source`。
- **m4 D-10 的「计划已关联」没算。** `completionDensityFacts` 固定 `hasGoalRelation: false`（`completion-question-rules.ts:85`），已经关联计划的 ●●● 联系人仍可能被问。影响小，补上或在注释里写明是已知取舍。
- **m5 vCard 没名字的条目必被挡下。** 只有电话 / 邮箱、或只有读音（`phoneticFamilyName` 等）的条目生成空 `FN`，服务端标 `missing_name`（阻塞）。建议 `FN` 依次退到读音、邮箱本地部分；名字里的换行折成空格（现在 `C\rD` 原样带进显示名）。
- **m6 当天已写「没有可问的人」后，当天新导入的人要等到明天。** 这是执行人的自定决定（为了一天只读一次人脈），合理但没写进对外说明；导入完成页若提示「明日から 1問ずつ」即可，否则在导入提交后清掉当天的 `none` 标记。
- **m7 导入契约的失败细节没写全。** `UNDECIDED_ROWS` 带 `context.undecided`、`MERGE_NOT_CONFIRMED` 带 `context.missing / stray`（`app/api/contacts/import/handlers.ts:121`），契约没写；503 没有 `reason`。App 要据此提示「还有 N 条没决定」，建议在 `ContactImportFailureReason` 旁注明这些键。

## 需要用户拍板（README 规则 11）

1. **M3 活动选项的来源与时间**：用参加记录 + 活动开始时间（复核人推荐，PLANNER 原意），还是保留「联系人里记着的活动 + 最早录入时间」。
2. **LinkedIn 导入的人用 `connectedOn` 还是导入时间作「加入时间」**（影响 30 天窗口与 ±14 天活动窗口）。复核人推荐 `connectedOn`（有值时）。
3. **m6 当天导入后是否立刻能出题**（现在：要等第二天）。

## 复核人做了什么

- 读 GOAL、PLANNER rev 3、DESIGN 相关各节、README 规则 10 / 11、R15 REVIEW；逐文件读两个提交的全部服务端代码与测试，以及被调用的 `contact-field-write.ts`、导入 handler / service / vCard 解析器、`tokyo-calendar-days.ts`、`redesign-contracts` 路由。
- 跑上表全部测试、类型检查、lint、契约快照检查、App 副本 diff；核对 impact 记录。
- 探针（scratchpad `r16-review/`，只连本机 `orbit_test`）：预选 17 例、vCard 8 例、每天一问 P1–P5。

## 没做的事

- 两端界面、展示页、像素门禁、模拟器 / 浏览器点击走查（用户指示暂停）；Web 端到端（Playwright）。
- 两端全量测试（只跑了相关文件与门禁）；`copy:qa`（本次两个提交没有界面文案）。
- 没有用真实 iPhone 通讯录导出的 `.vcf` 与 expo-contacts 实际返回的标签值验证 `phoneType` / `emailType`（App 端还没接）。
- 没有连 Neon、没有调付费 AI。

## 处理记录（执行人，2026-10-12）

修复提交 `141a599b`（App 副本同提交）。

| # | 处理 |
| --- | --- |
| M1 | 已修：店铺 / 服务排除只看名字；公司写法、支店 / 代理店不排除；「〜屋」单段名、運輸 / ガス 等只在没有公司邮箱和职称时排除；家人称呼去掉「携帯」等标签再比；45 条表驱动用例 |
| M2 | 已修：vCard 生成时公司 / work 邮箱排前，电话按手机 → 公司 → 代表 → 自宅 → 传真；往返测试 |
| M3 | 不改实现，列入 REPORT「请用户拍板」第 1 项 |
| M4 | 已修：取题按需查询，不读备注全文；3,000 个旧联系人时第一次取题只读 7 行（原约 6 MB） |
| M5 | 已修：mock 校验答案、返回 `densityAfter`、答过 / 跳过后当天为 null、幂等；mock 与 live 跑同一组路由断言 |
| m1 | 已修：显示前与回答前按当前值复核，已有值则当作已解决，回答 409，不覆盖 |
| m2、m4、m7 | 只补注释（三语显示方式、浓度暂不计「计划已关联」、导入失败键） |
| m3 | 不改：要改导入服务的写入，PLANNER 规定导入服务不改行为，交 R11 统一处理来源标签 |
| m5 | 已修：无名字条目的显示名依次用读音、公司、邮箱前缀 |
| m6 | 当天导入后当天就能出题（仍一天一题），列入「请用户拍板」第 3 项 |

修复后：orbits 相关 138 条（137 过、1 跳过）、App 11 条；两端类型检查、lint 0；快照一致。
