# Sprint W0029 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 git diff，这里不逐文件复述。

## 结果

- 已验证能做到：
  - 活动详情页的报名者名单只读 `status`、`displayName`、`answers.positioning`。「谁会来」匿名预览只读 `status`、`answers.industry`、`answers.positioning`；`industry` 非空时连 `positioning` 也不读。两者都不再读整行 `profile_payload`／`payload`，预览读取不带名字（SC-01、SC-02）。
  - 名单和预览的可见结果与改前逐项相同，包括人数、名字、定位、顺序、桶、展示 label 和隐私门槛（SC-01、SC-02）。
  - 坏数据下的表现也与改前相同：旧读取整次报错的，新读取也报错；旧读取跳过或回退的，新读取也跳过或回退；已取消行的画像照旧不读（SC-01、SC-02）。
  - 名单仍然只在本人已报名时读取、只读 canonical、不截断。读取失败照旧向上抛，详情页显示 unavailable（SC-03）。
  - legacy 预览读取经 `customRead` 先过闸门再去重，失败不缓存。canonical 照旧不加闸门（SC-03）。
  - 流量（30 人活动，保守数据集）：名单每次 92,300 B → 2,500 B；预览每次（取两路较大者，含 enrollment）约 92.5 KB → 1,983 B。名单＋预览合计每月 ≤169 MB，上限 200 MB（SC-04）。
  - 用户路径总账实测约 1,106.8 MB，在 1.0～1.2 GB 之间，按 D20 放宽到 ≤1.2 GB，登记给 W0019（SC-04）。
  - 3001 上 verify-plan 打开已报名活动、verify-legacy 打开未报名活动，桌面 1440 和手机 375 都正常，控制台 0 错误。同一个库上逐场对照新旧名单与预览，14 场 0 差异（SC-05）。
- 仍未实现或未验证：
  - 当前页面没有挂载「谁会来」预览卡片，预览只能在浏览器里直接调用接口验证（见偏差 1）。
  - 运营侧 `currentParticipantsFor`、通知 handler 的 canonical 列表、迁移来源读取仍然读整行，本 Sprint 不处理。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 3（sha256 `0c6d59d3c6aa19e46ed5413185e550cf554a240ac0162a751366082c14cd7dc8`）
- 分支 `sprint/W0029-attendee-roster-trim`，基线 `6e0663ca`（与 `4722fcad` 相比，修改白名单内没有代码差异）；功能 SHA `7115d634`；`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照：基线 5764 个测试、失败 80；HEAD 5784 个测试、失败 81。唯一新增的是 `event-operations-onsite-concurrency`（两份副本并发导致 `too many clients already`），在 head 和 base 单独重跑都通过，判为偶发（`10-fail-*.txt`、`10-new-failures.txt`、`10-rerun-onsite-*.txt`）
- 付费 AI 调用 0；未 push；未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0029/run-01/`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0029-01 名单等价（含失败语义） | pass | `tests/services/event-roster-entries.test.ts`：旧行为探针（事实 5 矩阵 44 格 × rsvped／cancelled；基线上证明旧代码逐字副本与真实旧函数一致，`01-probe-baseline.txt`）；PG canonical 矩阵 44 格 × 2，新 `readRegisteredCatalogueAttendees` 与「旧读取＋旧映射」逐格相等（含 reject、值、顺序）；解析时抛错 9 类 × 2；SQL 形状（不返回 `profile_payload`，画像叶子不用 `#>>`／`->>`）。RED `02-red.txt`（19/20 fail）；GREEN `03-green.txt`（20/20，0 skip） |
| SC-W0029-02 预览等价（含聚合规则） | pass | 同一文件：legacy 与 canonical 两路都把旧完整 DTO 与新投影分别交给 `registrationClusterPreview`，结果深相等，投影行等于完整行的 JS 裁剪且顺序相同；聚合情况（大小写合并与首现 label、并列按首现、超过 6 桶截断、少于 5 人隐藏、positioning 回退、cancelled）；legacy 失败矩阵（事实 5 全表、非 `"rsvped"` status 6 种、行级 25 种）；runtime 子进程按真实配置对照 `eventRegistrationRuntimeService.list`，只返回窄列。`event-registration-preview-route` 全部通过 |
| SC-W0029-03 门槛、闸门与失败 | pass | 同一文件：本人未报名／cancelled／pending 时名单读取 0 次；名单读取 reject 时 `resolveCanonicalEventDetailView` 也 reject；legacy 闸门关闭时 SQL 0 次、并发相同调用只发 1 条 SQL、闸门每次都查、失败不缓存、store 写入驱逐进行中的读取；runtime 选路与 `list` 一致；预览 handler 默认走投影，失败不进缓存。W0027 `app-event-detail-actor-id`、W0028 `event-registration-status-read` 通过 |
| SC-W0029-04 流量与总账 | pass（按 D20 放宽） | `05-measure.txt`（脚本 `measure-w0029-roster-bytes.ts`）；改前 `01-measure-before.txt` |
| SC-W0029-05 回归 | pass | `04-regression-sc05.txt`：118 个测试，唯一失败是基线就失败的 `unbounded-list-reads`；`04-tsc.txt` exit 0；浏览器 `07-browser.json` 与 4 张截图；同库新旧对照 `06-verify-data.json`；全量对照见上 |

### SC-04 实测（W0017 口径：每条语句返回行 JSON 字节之和）

语句数改前改后都是 1 条；有效性检查合进每行的 `k` 列，没有另发语句。

| 读取 | 数据集 | 5 人 | 30 人 | 100 人 |
| --- | --- | --- | --- | --- |
| ① 名单（canonical） | w0028 | 13,015 → 245 B | 78,550 → 1,490 B | 262,890 → 4,990 B |
| ① 名单（canonical） | real | 15,291 → 410 B | 92,300 → 2,500 B | 308,842 → 8,380 B |
| ② 预览 legacy | w0028 | 10,770 → 290 B | 65,240 → 1,740 B | 218,970 → 5,800 B |
| ② 预览 legacy | real | 11,022 → 256 B | 66,790 → 1,535 B | 224,184 → 5,117 B |
| ② 预览 canonical（另加 enrollment 约 242 B） | w0028 | 13,015 → 290 B | 78,550 → 1,740 B | 262,890 → 5,800 B |
| ② 预览 canonical（另加 enrollment） | real | 15,291 → 256 B | 92,300 → 1,535 B | 308,842 → 5,117 B |

- 数据集：w0028 与 W0028 ④ 相同，没有 positioning；real 每人另填 positioning，行业轮换。
- 月估算（30 人活动；名单 20,000 次／月；预览 60,000 次／月，不计 60 秒缓存；预览取两路较大者，canonical 含 enrollment）：w0028 D 29.80 MB、E 118.98 MB；real D 50.00 MB、E 106.62 MB。取各自较大值：D 50.00 + E 118.98 = **168.98 MB ≤ 200 MB**。
- 参考：100 人活动时，名单 8,380 B／次，预览 ≤6,044 B／次。

### 预算重算（D20）

| # | 路径 | 被替代的旧流量（总账外） | 实测 |
| --- | --- | --- | --- |
| A | 活动页本人报名 | 382.80 MB | 10.35 MB（W0028） |
| B | 详情页本人判定（含 enrollment） | 167.28 MB | 18.30 MB（W0028） |
| C | 详情页账号解析 | 无（纯净增） | 25.2 MB（W0030） |
| D | 详情页名单 | 1,571–1,846 MB | **50.00 MB** |
| E | 匿名预览 | 4,728–5,553 MB（最坏） | **118.98 MB** |

- 总账：884 + 10.35 + 18.30 + 25.2 + 50.00 + 118.98 = **1,106.83 MB**。在 1.0～1.2 GB 之间，**按 D20 放宽到 ≤1.2 GB，登记给 W0019**。
- 不放宽需要 D＋E ≤62.15 MB，要在 SQL 里做聚合，会打破「聚合规则留在 JS、新旧用同一个函数」的前提，不在 PLANNER 范围内。
- 真实出站：D、E 两条路径的旧流量最坏合计约 6.3–7.4 GB／月，改后约 169 MB。
- W0030 全站受益表与 W0031 收件箱轮询不在 884 MB 口径内，另行登记（D24、D25）。

### EXPLAIN（本机小数据）

- legacy 预览走 `orbit_records_target_idx`（workspace, target_type, target_id）；canonical 名单和预览 heads 表按（workspace, event_id）索引扫描，再与两张 version 表主键嵌套循环，与旧整行读取同形。不需要新索引。

## 偏差

1. **预览卡片当前不可见。** 唯一请求 `/registration/preview` 的组件 `orbit-event-quick-signup.tsx` 没被任何页面渲染；`event-registration-workspace.tsx` 只引用了它的 `readQuickSignupAnswers`。浏览器验收改为：verify-legacy 打开未报名活动，页面正常，0 错误；登录态和匿名态直接请求接口，都返回 200，只有 `buckets`／`total`／`admissionControlled`；临时脚本在 3001 同库上逐场对照新旧预览和名单，14 场 0 差异。卡片是否恢复需要产品决定。
2. **投影形状。** SQL 返回扁平短列：`s` 状态、`k` 行标记／画像形状、`n`／`i`／`q` 三个 jsonb 叶子；`rosterEntryFromRow` 在 JS 端还原成与 `EventRegistration` 同路径的 `EventRegistrationRosterEntry`。裁剪规则与 PLANNER 一致（字符串原样；缺失或 null → null；其他类型 → `0`）。另加：预览在 `industry` 是非空白字符串时不取 `positioning`（旧代码此时也不读），「非空白」用与 JS `trim` 相同的字符集判断，测试覆盖全角空格、NBSP、BOM、U+2028 及不属于 trim 的零宽空格。
3. **有效性不另发语句。** canonical：`REGISTRATION_ROW_VALID` 不成立时 `k = 'invalid'`，覆盖所有行（含已取消），JS 端整体抛错；legacy 沿用 W0028 的 `unreadable`／`payload:` 约定，放在同一个 `k` 列。
4. **legacy 没加 `record_id` 决胜键。** ORDER BY 与旧读取逐字相同；排序键完全相同时新旧顺序都不确定，测试不构造这种情况。
5. 方法带 `fields` 参数（`"attendees" | "preview"`）：匿名预览的读取不含名字，名单的读取不含行业。
6. 新增 `features/events/registration/roster-entry.ts`，类型加在 `registration/contract.ts`，这两处不在 PLANNER 白名单里，按 RULES §0 登记。
7. `next-env.d.ts` 按协调者指令不还原、不提交。

## 假设与额外阅读

- 上下文包之外读了：`shared/storage/postgres-live-record-store.ts` 第 100–156 行；`event-operations/participant.ts` 的 `normalizeEventParticipantAnswers`；`event-operations/storage/migrations.ts` 的 `profile_payload` CHECK 约束；`app/(app)/app/events/[id]/orbit-event-quick-signup.tsx` 和 register 目录；`scripts/verify-server.sh`、`scripts/load-local-env.ts`、`scripts/verify-session-cookie.ts`；W0028 证据目录里的测量脚本和测试文件。
- 更新的测试替身：`tests/capabilities/event-registration-live.test.ts`（provider 新增方法）；`tests/services/event-registration-status-read.test.ts`（W0028 的详情页替身改用 `listCanonicalRosterEntries`）。
- `registrationClusterPreview` 和名单映射只放宽了参数类型、加了 `!`，编译后的 JS 不变，聚合规则不变。
- `unbounded-list-reads` 在基线和本分支都失败（`orbit-agent-chat-session-live-record-provider.ts` 5 > 4），与本 Sprint 无关；本 Sprint 没有新增 `limit: "unbounded"`。
- 浏览器验收只读；结束后 `--reset verify-plan` 和 `--reset verify-legacy`，verify-plan 的 summary 与验收前逐字一致。临时脚本已删；cookie 只经环境变量传递，没有落盘。

## GitNexus

- 开工 impact（`analyze --force --index-only` 全量重建后，`00-impact.txt`）：LOW：`readRegisteredCatalogueAttendees`、`registrationClusterPreview`、`createEventRegistrationPreviewHandler`、`createMemoryEventRegistrationProvider`。HIGH：`EventOperationsRepository`（118）、`EventRegistrationProvider`（91）、`createEventRegistrationLiveRecordProvider`（33）。CRITICAL：`createPostgresCanonicalRegistrationMethods`（42）。UNKNOWN：`createMemoryEventOperationsRepository`，以及 `listCanonicalRegistrations` 的 PG／内存实现，文本搜索（`00-text-search.txt`）确认都经接口类型，由 tsc 覆盖。
- 提交前 `detect-changes --scope staged`（`09-detect-changes.txt`）：14 个文件、240 个符号、165 个流程，risk critical。来源是共享接口新增成员和行号平移；原有方法不变。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）：无意见——投影保持原有选路、顺序、聚合与失败语义 | — | 无需修改 |

## 交接

- 新接口：类型 `EventRegistrationRosterEntry`、`EventRegistrationRosterFields`（`registration/contract.ts`）；canonical `EventOperationsRepository.listCanonicalRosterEntries(eventId, fields)`；legacy `EventRegistrationProvider.listRegistrationRosterEntries(eventId, fields)`；runtime `listRuntimeEventRosterEntries({ eventId, fields })`；共用（`registration/roster-entry.ts`）`rosterEntryFromRegistration`、`rosterEntryFromRow`、`rosterEntryShapeSql`、`rosterEntryLeafColumnsSql`。
- 给 W0019：总账按 D20 放宽到 ≤1.2 GB（实测 1,106.83 MB）；上线后在 Neon 上对照 `listCanonicalRosterEntries` 与 `listRegistrationRosterEntries` 的返回量；100 人以上的活动，名单与预览流量按人数比例增长。
- 给 W0031：本 Sprint 的合并 SHA 见登记表。
- 用户裁决（D26）：「谁会来」预览卡片先不恢复，登记为后续候选。
- 回退：revert `7115d634`。接口都是新增的，不影响旧消费者。
