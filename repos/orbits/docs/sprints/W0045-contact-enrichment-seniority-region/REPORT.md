# Sprint W0045 — 执行总结

## 结果

- 已验证能做到：
  - 名片识别在原有的同一次调用里多给出职级（六档）和规范地区（ISO 国家码 + 英文城市名）。DeepSeek 仍是 2 次请求加 1 次可选复核，Gemini 仍是 1 次。
  - 审阅页新增「职级」（附决策层／管理层／执行层分组提示）和「地区」两行，可以改；正反面不一致时不预选，并挡住自动导入和自动并入。
  - 确认时由服务端判定来源：提交值等于识别值记 AI，否则记手动；客户端伪造的来源无效。旧客户端不传新字段时什么都不写，确认指纹不变。
  - 并入已有联系人时按来源规则写入：空栏补上、AI 值可被替换，手动值和没有来源的存量值不动。
  - 联系人详情能读到这三项；详情弹窗顶部可以直接编辑行业／职级／地区。一次保存是一次原子更新，冲突返回 409 且什么都不写。
  - 交付了只在本机验证的回填脚本（先出计划、复核哈希后执行、重复执行 0 变化）和可复用的「按文字补全」模块（每次 ≤20 人，请求里没有邮箱和电话）。
- 仍未实现或未验证：
  - 名片样本只有 2 张（PLANNER 要求 ≥3 张），只跑了 1 批。
  - 生产回填没有执行（需单独授权）。
  - App 端界面和 App typecheck 不在本 Sprint 验收内。
  - 流量估算超出 1.6 GB 总账，已登记 D32 周检，见下文。

## 运行记录

- 结果：completed（协调者合并并验证合并树后）。
- Generator：Claude Opus 5.5／2026-10-02；Planner revision 4（SHA256 a7123800…）。
- 分支 `sprint/W0045-contact-enrichment-seniority-region`。功能 SHA：`68c9b55f` → `53180664`（review 修复）→ `5e0b7758`（同步写锁审计登记，最终）。chat-agent 合并 SHA 见 README 运行记录。
- **协调者注：** 收口后 sprint 分支顶上出现另一会话在共用工作树里提交的 `628831b4`（fix(storage): keep media workers out of maintenance function bundles），不属于本 Sprint。协调者只合并固定最终 SHA `5e0b7758`，`628831b4` 原样留在 sprint 分支，未并入 chat-agent。本报告由协调者按 Generator 原文写入并直接提交到 chat-agent（子代理写文件被拦）。
- 档位 H。全量对照（RULES 5.2，带 `ORBIT_EVENT_DATABASE_URL`）：改前 6261 例、14 失败；改后 6306 例、13 失败；新增失败 0。
  - 写死库地址的 `business-card-batch-schema` "unchanged current handlers…" 改前也失败，属于环境基线。
  - 收口中发现一条自己引入的失败：`sync-write-lock-audit` 要求登记新的写入方，已在 `5e0b7758` 登记修复。
  - 收口期间另一会话曾在同一工作树改过 `features/acquisition/*` 的几个文件（未提交），Generator 未动；两次运行里都在，第二次全量时已不在工作树。
- 付费 AI 调用：
  - 名片识别 1 批（2 张照片）：6 次 HTTP（转写 2、整理 2、复核 2），合计输入 9,955 token、输出 3,909 token。`bc_ingest_items.usage`（只含转写加整理）分别为 3,915／1,780 和 3,846／1,640。
  - 按文字补全：本机回填演练 1 次 HTTP，20 人，输入 2,108、输出 1,628。
  - 第二段没有新增调用。
- push：未 push。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 同一次调用多出职级与地区 | pass | `tests/capabilities/business-card-enrichment-extraction.test.ts`：两个 provider × 合法／越界／国家与城市矛盾／类型错／缺失，请求次数断言；`business-card-industry-extraction.test.ts`（版本 3）；`ingest-v2-routes` 的 v2 旧行回读 |
| 02 审阅页可改、来源由服务端判定 | pass | `tests/api/business-card-ingest-v2-routes.test.ts`「W0045 confirm judges…」（伪造来源无效、旧客户端重放、409、v2 旧卡）；`ingest-v2-route-view-model`、`app-card-batch-enrichment-fields`、`app-card-batch-model` |
| 03 按来源规则写入 | pass | `business-card-contact-match.test.ts`（空／ai／user／存量 × 三字段，以及审阅改过的值并入）；`business-card-contact-write.test.ts`；`contact-enrichment-domain.test.ts`；PATCH 测试里的 GET 读取 |
| 04 联系人编辑标 user | pass | `tests/api/contact-detail-enrichment-patch.test.ts`（标 user、一次条件更新、冲突返回 409 且不部分写入、非法值 400、越权 404）；`app-contact-enrichment-inline.test.tsx` |
| 05 回填只补空、可复核 | pass | `tests/services/contact-enrichment-backfill.test.ts`（本机库独立 schema：复核哈希、提交顺序锁、期间被改跳过、所有者变化跳过、规则不替换 ai 地区、重复 apply 0 变化、远端拒绝、≤20 人、文本清洗） |

- **库测试 0 skip 的证据：** 设置 `ORBIT_EVENT_DATABASE_URL` 和 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`（均指向 localhost），先跑 `node scripts/assert-local-test-databases.mjs` 通过。
  - 收口集 287 例：284 通过、1 失败（环境基线）、2 跳过。跳过的两条只需要 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，补上变量后单独重跑这两个文件为 5/5 通过、0 skip（`lifecycle-db-tests.txt`）。
  - 全量运行里路由用例「W0045 confirm judges…」「v2 confirm writes the reviewed industry…」和回填用例「apply needs the reviewed hash…」都显示 ✔，没有被跳过。
- **浏览器验证（verify-plan 账号）：**
  - 审阅页 1440 和 375 下两行正常显示。把一张卡的职级改为副总裁后确认，库里该字段记 `user/card_review`，其余记 `ai/card_ocr`。
  - 详情页 hero 区 1440 和 375 下显示三项及来源标签；地区改为 Kyoto 后保存，标签变为手动；375 下无横向溢出。
  - 控制台只有既有的 `/api/inbox/summary` 503 和 404。

## 假设与额外阅读

- **额外阅读（上下文包之外）：**
  - `features/contacts/storage/contact-write-live-record-provider.ts`：确认新建联系人的 payload 是整份写入。
  - `features/contacts/live-service.ts`：provider 接口。
  - `contact-industry-editor.tsx`：沿用现有编辑交互。
  - `contact-detail-view-model-adapter.ts`、`orbit-contacts-route-view-model.ts`、`network-shell.tsx`：详情展示与样式。
  - `business-card-ingest-v2/worker.ts`、`configured.ts`、`scripts/run-business-card-ingest-v2-worker.ts`：真实识别怎么跑。
  - `features/sync/commit-order-lock.ts`、`owner-backfill.ts`、`shared/storage/transactional-postgres.ts`、`live-database-config.ts`：回填的锁、连接和防误连。
  - `tests/storage/sync-write-lock-audit.test.ts`：写入方登记。
  - `contact-list-postgres-reader.ts`、`dashboard-*-postgres-reader.ts`：流量路径。
  - `features/plans/ai-matcher.ts`：文本模型调用先例。
- **新增路径**（第 0 节登记的必要补充）：
  - `features/acquisition/business-card-enrichment-prompt.ts`（职级与地区提示词、清洗）
  - `features/acquisition/business-card-ingest-v2/review-enrichment.ts`（服务端来源判定）
  - `features/contacts/enrichment/apply-enrichment.ts`（payload 写入规则）
  - `features/contacts/enrichment/backfill.ts`（回填核心）
  - `app/(app)/app/contacts/network-0918/contact-enrichment-inline.tsx`（详情 hero 区编辑）
- **取舍（协调者已认可）：**
  1. 并入已有联系人时，审阅页上改过的值（`user`）只补空、只替换 `ai`，写入后来源仍记 `user`。对标 HubSpot 合并保留主记录的值。因此 W0013 路由测试的一条期望改为：合并时联系人原有的 `ai` 行业被替换。
  2. 国家码除了「Intl 名称不等于代码本身」，另外排除 ZZ、EU、EZ、UN、QO、XA、XB。
  3. 回填对非 localhost 库连 dry-run 也拒绝；旧的 `seniorityLevel` 只补记来源 `card/legacy_profile`，值不动；回填只补空，不替换任何已有值（包括 `ai`）。
  4. 审阅页输入城市时保留原文，确认时由服务端归一。
  5. 新增错误码 `CONTACT_DETAIL_ENRICHMENT_NOT_SUPPORTED` 和 `CONTACT_DETAIL_CONFLICT`（409）。
  6. 回填按毫秒比较 `updated_at`，条件更新用同一事务锁住的原值；这是本机演练时发现的微秒精度问题。
  7. 详情编辑保存 20 秒超时，按失败处理，修改保留可重试。mock 详情服务对职级和地区不写入。
- **已知偏差：** 取締役被模型判成 director，提示词写的是 vp。记录在此，不再额外调用验证。
- **清洗口径的代价：** 连续数字 ≥7 位即视为电话，日本地址里的长门牌号（如「8-12-16-504」）也会被去掉；城市和区名保留，以隐私优先。
- **本机演练数据：** 本机库 `orbit_newui_events_20260922`（workspace `orbit-small-staging-20260917`）留有 1 批识别结果、2 个确认的联系人、回填写入的 105 个联系人。另一批排队中的旧批次 `bcb2:690cb2e0…` 没有动。

## review 处理（Codex 一次；原文 `codex-review.txt`）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 1 P1 电话脱敏只滤 ≥9 位，公司／职位没有清洗 | 采纳 | 在请求边界统一清洗所有文本字段：≥7 位数字串（邮编「〒」除外）、带 TEL／FAX／電話／携帯等标签的号码、分机号一并去掉；备注里含这些的行整行丢弃。补了 7／8 位、无分隔符、全角、分机、公司／职位被污染的用例（`53180664`） |
| 2 P1 回填 apply 没有绑定所有者 | 采纳 | 加锁的 SELECT 和条件 UPDATE 都加 `user_id is not distinct from` 计划值；所有者变化计为 skippedChanged。补了「计划后只改所有者」的用例 |
| 3 P1 一次 PATCH 拆成多次提交 | 采纳 | 行业、职级、地区合并为一次条件更新，冲突返回 409（`CONTACT_DETAIL_CONFLICT`），不会部分写入。补了「一次条件更新」和「冲突时行业也不写」的用例。详情状态是另一条记录，仍在 payload 之后单独写；这个窗口 W0045 之前就存在，见遗留 |
| 4 P2 规则地区会覆盖已有 ai 地区 | 采纳 | 规则地区先要求该字段为空；补了用例 |
| 5 P2 城市别名不校验所属国家 | 采纳 | 别名所属国家与国家码不一致时整对判非法：识别清成 null，PATCH 返回 400。补了领域层、识别、PATCH 三处的交叉用例 |
| 6 P2 关键库测试缺库时静默跳过 | 不改测试门控（裁决） | 本报告「验收结果」给出以本机库运行、0 skip 的证据（含变量名） |
| 7 流量（协调者追加） | 已估算 | 见下表；超出 1.6 GB，登记 D32 周检，不扩大改动 |
| 8 取締役 → director（协调者追加） | 记为已知偏差 | 见「假设」；没有额外调用 |

### 流量（D39 口径：按返回行的 JSON 字节；1000 人 × 30 天）

| 用户路径 | 是否返回完整联系人 payload | 每次增量 | 频次假设 | 月增量 |
| --- | --- | --- | --- | --- |
| 联系人详情 | 是，单个联系人 | 本机实测：已补全的 106 个联系人平均 +215 B，单个最大 +420 B（实测 838→1,231、948→1,347） | 每人每天 2 次（同既有详情页口径） | 12.9 MB（按最大 25.2 MB） |
| 人脉列表／卡片页 | 是，每页最多 30 行 `c.payload` | 30 × 215 B ≈ 6.45 KB | 每人每天 2 次 | 387 MB（按最大 756 MB） |
| 首页、分析、看板 | 否：SQL 内只投影字段，不返回 payload | 0 | — | 0 |

- 合计稳态约 +400 MB（按最大约 +781 MB），这是假设所有联系人都已补全的稳态。
- 叠加 W0041 后的去重总账（1,508／1,568／2,047 MB）后，三档约为 1,908／1,968／2,447 MB，都超出 1.6 GB。按裁决登记 D32 周检，本 Sprint 不扩大改动。
- 候选瘦身：列表读取不返回 `enrichment` 字段，每行约省 145 B。
- 回填会把被补全的联系人 `updated_at` 推后，导致 App 一次性重新同步这些联系人；这是一次性的，不按月计。生产没有回填。

## 交接

- **存储（定稿，W0046～W0055 只消费）：**
  - 职级：`publicProfile.seniorityLevel`（六档）
  - 地区：联系人 `region: { countryCode, city }`
  - 来源：`enrichment: { version: 1, fields: Partial<Record<EnrichmentField, { origin: "ai"|"user"|"card", updatedAt, via }>> }`，类型在 `shared/domain/contracts.ts`
- **纯函数：**
  - `canWriteEnrichedValue(current: { hasValue: boolean; provenance?: EnrichmentProvenance | null }, incoming: EnrichmentOrigin): boolean`，以及 `readStoredEnrichment`、`withEnrichmentProvenance`（`shared/domain/enrichment.ts`）
  - `seniorityGroup(level?: string | null): "decision" | "manager" | "staff" | "other"`（`shared/compute/seniority-group.ts`；`shared/domain/seniority.ts` 再导出并附中英日标签）
  - `normalizeRegion(countryCode, city): ContactRegionDTO | null`，以及 `regionFromLocationText`、`regionDisplayName`、`isValidCountryCode`、`REGION_CITY_ALIASES`（`shared/domain/regions.ts`）
- **payload 写入：** `applyEnrichedValues(payload, values: EnrichedValue[], at, { mergeIntoExisting? })`（`features/contacts/enrichment/apply-enrichment.ts`）。W0046 的 memo 提取应复用它；`offering`／`seeking`／`topics` 三个字段的写入分支还没实现，由 W0046 补。
- **按文字补全：**
  - 入口：`createConfiguredTextEnricher({ env?, fetchImplementation? }): TextEnricher | null`，`enrich({ contacts: TextEnrichmentContactInput[] ≤20, signal? }) → { model, proposals, usage: { inputTokens, outputTokens, latencyMs } }`
  - 每次 HTTP 返回一份 usage，模块本身不扣额度：W0048a 三层入口按操作记后台池（一批 ≤20 人 = 1 次操作），W0055 回填记 `system`。
- **回填用法：** `npx tsx scripts/backfill-contact-enrichment.ts [--ai --max-calls=N] [--out-dir=…]` 先 dry-run 写出计划文件；再加 `--apply --plan=<file> --reviewed-hash=<hash>` 执行。连接用 `ORBIT_ENRICHMENT_BACKFILL_DATABASE_URL`；远端库必须加 `--confirm-remote=<host>/<db>`。生产执行需单独授权。
  - 本机演练：116 个联系人，计划 105 条（地址规则命中 94、AI 补全 41），apply 共写 105 条，重复 apply 0 变化。
- **每张名片的 token 增量：** 本机库只有 v1 历史记录，无法直接对照。按提示词长度估算，整理调用每张约多 250–300 个输入 token；实测整理调用输入 2,691～2,760 token。
- **App 影响（R-9，交 W0055 汇总进 Bridge handoff）：**
  - 改动的 shared 文件：`shared/contract/business-card-batch.ts`（提取 DTO 和确认输入只加 optional 的 `seniorityLevel`、`regionCountryCode`、`regionCity`）、`shared/api-schema/business-card-batch.ts`（对应解析：读取宽松清洗，确认输入严格校验）、新增 `shared/compute/seniority-group.ts`。
  - 同一提交（`68c9b55f`）含 `npm run sync:contract` 写出的 3 个副本；App 四个 sync 测试 10/10 通过；`repos/orbit-app` 除 `src/api/{contract,schema,compute}` 外没有改动。
  - 旧 App 客户端不传新字段时不写、指纹不变。
  - 未验证：App 界面与 App typecheck。`shared/domain` 新增的 seniority／regions／enrichment 不进 App。
- **遗留：**
  - 详情状态（标签、备注等）和联系人 payload 仍不在同一事务：payload 三项已原子，但 payload 先提交、详情状态写入失败时 payload 已保存。W0045 之前即如此，provider 结构不支持同事务。
- **回退：** 按序 revert `5e0b7758`、`53180664`、`68c9b55f`，再在 App 端重新执行 sync。没有迁移，payload 里新增的字段对旧代码无害。
- **证据目录：** `~/orbit-sprint-evidence/web/sprint-W0045/run-01/`
  - review 原文：`codex-review.txt`
  - 全量对照：`full-baseline.txt`、`full-after.txt`、`full-after-2.txt`、`fail-*.txt`
  - 收口集：`closing-set-1/2/3.txt`、`lifecycle-db-tests.txt`
  - App 同步：`app-sync-tests*.txt`
  - 影响分析与提交前检查：`impact-detail.txt`、`detect-changes-staged*.txt`
  - 真实识别与确认：`real-ocr-run.txt`、`confirmed-contacts.txt`
  - 流量：`traffic-d39.txt`
  - 回填：`backfill/`（计划文件、`dry-run.txt`、`apply.txt`、`provenance-summary.txt`）
  - 截图（6 张）：`review-1440-rows.jpg`、`review-1440-seniority-edited.jpg`、`review-375-rows.jpg`、`detail-1440-hero.jpg`、`detail-1440-edit-form.jpg`、`detail-375-hero.jpg`
- **需要用户决定或授权：**
  1. 流量超出 1.6 GB 总账后是否做「列表读取不返回来源元数据」的瘦身（推荐：等 D32 周检实测再定；对标 HubSpot 列表视图只取展示列）。
  2. 生产回填的执行授权。
