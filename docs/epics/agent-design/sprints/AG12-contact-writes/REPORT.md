# Sprint AG12 — 执行总结（联系人写入，H）

改了哪些文件看 git diff（`6f95d1f65..6fe8046a8`），这里不逐文件复述。

## 结果

- 已验证能做到：
  - **开场项 AE-FN-003（AG10 协调者复核）：** “这周该跟进谁”的回答开头写两条标准（到期没做的跟进、过了计划日的待办），现在由代码决定谁符合：只有真有这类记录的人才计数、编号（`fn.rank` 的 `listed`）；只是本周到期或计划在本周做、还没过期的人（小林健，11/18 计划）另起一行写“还没过期的（不算在上面）”。中日英都一样；没人符合时写“按这些条件，现在没有符合的”。日文、英文的“谁该跟进”也按这条走。
  - **新增（AG12-1）：** 新加的人与已有的人同名同公司，或同公司只差一个字（中日文名）／一两个字母（拉丁名）时，先追问列出已有的那几位（名字、公司、职位，不带邮箱电话），并给“都不是，另建一位”。选了已有的就不出卡、不新建、不合并，回复“没有新建联系人”；选“另建”才出新增卡。同名但公司不同的不算候选（AE-SCL-024 的岚图机器人张伟、张卫东都不再列出）。
  - **修改（AG12-2）：** 卡上只有说到的那一项，写“现在的值 → 新值”；确认时按卡上展示过的值和名字重新核对，别处改了这一项就不执行、出第 2 版（AE-CON-004：现在是“青叶品牌设计”→ 改成“青叶设计事务所”）；别的字段被改不算冲突，按点击时读到的版本执行。旧值进 `fieldHistory`。
  - **版本：** 联系人 `version` 每次写入加一，写 `contacts` 的 10 个模块都经 `features/contacts/contact-version.ts`（架构测试按文本搜索找写入方，新写入方不用它就失败）。字段写入接口 `PATCH /api/contacts/:id/fields` 接受可选的 `expectedVersion`：带了只试一次，不符返回 409，不覆盖；不带的旧客户端照旧重读重试。
  - **删除与恢复（AG12-3）：** 删除卡列出她名下的笔记和待办，写明不会删除、30 天内能恢复；执行只改联系人这一行（Postgres 测试逐行比对）。恢复卡用“恢复”的徽章和说法，恢复的是原编号；超过 30 天拒绝。
  - **导入（AG12-4）：** 贴一段表格，卡上逐行写新增、可能重复（不合并）、跳过及原因（“跳过：没有姓名”）；总数句是“导入联系人：新增2行、疑似重复1行、跳过1行”。准备阶段在内存里用导入自己的解析与查重，零写入；说“第一行也新建”时代码读出行号与决定，不调模型，同一张卡出第 2 版，旧版不能再确认；确认后走 upload → setDecisions → commit，Postgres 测试核对提交结果与预览逐行一致。
  - **联系方式（AG12-5）：** 邮箱、电话等在记录、查重候选、卡片说明里都不交给模型；另在主模型和判断模型的每次请求出口统一扣下用户本条消息里没打出来的邮箱和电话。回答知道“有，但没授权给它看”（AE-CON-008 回答：“电话和邮箱保存在他的联系人页面里，我这边看不到（需要单独授权），并不是没有”）。
  - **两端：** 不改界面组件代码。删除、恢复的徽章与完成状态词加在共用的 `shared/compute` 和 `shared/copy`（经同步脚本到 App），两端在原有徽章位置显示。Web 的 `ConfirmationCard` 与 App 的 `AgentConfirmationCard` 对同一份服务端预览（修改、删除、恢复、导入第 1 版和第 2 版）渲染出的文字逐字相同。
- 仍未实现或未验证：
  - **门槛的 5 个 REF 不变量用例不过（AG11 的用例，见“需要决定”）。** AG12 自己的 12 例与其余不变量 48 例的代码判定全过。
  - **真实界面截图没有拍成。** 评测服务（3110）的页面登录拒收签发的会话 cookie（API 接受），模拟器是 drafts worktree 的、可能有别的会话在用，没去动。改为两端组件渲染同一份预览并比对文字（相同），见证据。
  - 行业、职级、地区、标签、状态、备注这一版不能在对话里改（第二层只能说五个基本字段），仍在联系人页面改；不在门槛用例里。

## 运行记录

- 结果：门槛已跑、等待评审（AG12 自己的 12 例与其余不变量代码判定全过；REF 5 例需协调者决定，见文末）
- Generator：Claude Opus 5.5，2026-11-18；Planner revision 1（SHA-256 `dc91d29a07afd8f5812a64d5c1509dedd458cb9a8d2a3a5a34b179402a7e8f2d`，开工更正记录已追加）
- 分支 `sprint/AG12-contact-writes`；基线 `6f95d1f65`；功能最终 SHA `6fe8046a8`（之后只有文档提交）；合并：等待协调者
- 档位 H；全量对照见下
- 付费调用：DeepSeek／Gemini 真实调用约 1,136 次（13 次运行合计），约 4.22 元（门槛约 0.50 元；8 次回归约 2.86 元；开发与稳定性约 0.86 元）；上限 30 元／次、150 元／sprint 都没碰。push：无

### 提交

| SHA | 内容 |
|---|---|
| `9af42a4ec` | 开场 AE-FN-003：代码决定谁符合跟进标准 |
| `9d6540298` | AG12-2 版本加一、字段写入期望版本、契约同步 |
| `b6ef9de3c` | AG12-5 联系方式统一出口 |
| `0d7ee2940` | AG12-1～4 联系人适配器、图、账本、卡片显示 |
| `3d9d0fbf7` | 评测：四个 CON 判定词、联系人外部修改 |
| `e3707dfbe` | 开发运行 1 的修复（联系方式“有但没授权”、近似名、导入改版前后数量） |
| `fdee928e1` | 稳定性运行 3 的修复（“import these”指贴的表格；导入、恢复是登记的写入动词） |
| `6fe8046a8` | 能力登记覆盖联系人卡的操作类型 |

### 门槛与回归（都在 `6fe8046` 上，干净构建，`--workers 4`，一个接一个跑；评审未做，交协调者）

| 运行 | 代码判定 | 费用 |
|---|---|---|
| `20261118-103843-6fe8046-AG12-gate-run-01` | 60/65（失败的全是 REF-001、005、006、007、008） | 0.502 元 |
| `20261118-104151-6fe8046-AG10-gate-rerun-at-AG12` | 62/63（AE-FN-010：DeepSeek 15 秒超时，trace 里 `model.failed` 15006 ms） | 0.533 元 |
| `20261118-110236-6fe8046-AE-FN-010-timeout-retry-1` | 1/1（超时单例重跑第 1 次即过，记为接口抖动） | 0.009 元 |
| `20261118-104507-6fe8046-AG09-gate-rerun-at-AG12` | 54/54 | 0.412 元 |
| `20261118-104755-6fe8046-AG08-gate-rerun-at-AG12` | 50/50 | 0.337 元 |
| `20261118-105034-6fe8046-AG07-gate-rerun-at-AG12` | 43/43 | 0.316 元 |
| `20261118-105248-6fe8046-AG06-gate-rerun-at-AG12` | 47/47 | 0.365 元 |
| `20261118-105506-6fe8046-AG05-gate-rerun-at-AG12` | 43/43 | 0.313 元 |
| `20261118-105832-6fe8046-AG04-gate-rerun-at-AG12` | 37/37 | 0.299 元 |
| `20261118-110034-6fe8046-AG03-gate-rerun-at-AG12` | 39/39 | 0.285 元 |

每次运行都已生成 judge-pack。AG04、AG03 第一次因为我在运行中途改了 PLANNER（工作区不干净）被拒绝开始，撤回改动后在同一构建上重跑。

### 开发与稳定性运行（门槛前，AG12 自己的 12 例各跑 3 遍）

| 运行 | 结果 | 结论 |
|---|---|---|
| `20261118-101011-3d9d0fb-AG12-dev-1`（整套门槛） | 57/65 | CON-006、007、010 判定口径（外部设备写入、导入卡覆盖新建）→ 运行器修正；CON-008 回答说“记录里没有电话邮箱”、SCL-024 列出张卫东、导入改版回复没写原数量 → `e3707df` |
| `…-e3707df-AG12-stab-1/2/3` | 12/12、12/12、11/12 | 第 3 遍 AE-CON-010：第一层把 “these” 标成对象，代码追问“these 指什么”，第二句又被当成新建一人 → `fdee928` |
| `…-fdee928-AG12-stab2-1/2/3` | 12/12 ×3 | 三遍结果相同 |

### 全量对照（`LANG=en_US.UTF-8`，不 source `.env`）

- `fdee928` 上：8897 例，25 失败；与基线 24 条相比新增 1 条：“agent capability registry covers every current tool, workflow, and ledger operation”（新的五个联系人操作类型没登记为 agent-v1 卡类型）→ `6fe8046` 修好。
- `6fe8046`（最终代码）上：8897 例，24 失败，与基线 24 条逐条同名，没有新增。
- 带本机测试库的收口集（PLANNER 列的 13 份加本 sprint 新测试，`orbit_agent_v1_entry_test`）：114/114，0 skip；生命周期测试全过。
- App：四个同步测试 10/10；`npm run typecheck` 只有 `tests/ios-scene-lifecycle-config.test.ts(47,16)` 一条，文件本 sprint 未动。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG12-1 | pass（代码判定；待评审） | `tests/agent-v1/contact-domain.test.ts`（候选顺序与过滤、选已有不出卡、选另建才出新增卡）、`tests/services/contact-writes-postgres.test.ts`（新增只多一位、不合并、重放不重复）；门槛 CON-001、002、SCL-023、024 代码判定过 |
| AG12-2 | pass（代码判定；待评审） | `tests/services/contact-version-postgres.test.ts`（各写入方加一、期望版本不符 409 且不重试、旧客户端照旧）、`tests/architecture/contact-version-writers.test.ts`、`tests/api/contact-fields-route.test.ts` 新用例；生命周期测试通过；门槛 CON-003、004、009 |
| AG12-3 | pass（代码判定；待评审） | `contact-domain.test.ts`（影响清单、恢复原编号、过期不出卡）、`contact-writes-postgres.test.ts`（删除只改联系人一行、30 天外拒绝）；`contact-delete-postgres.test.ts` 通过；门槛 CON-005、006 |
| AG12-4 | pass（代码判定；待评审）；截图未做 | `contact-domain.test.ts`（逐行归类、改一行出第 2 版、旧版点击 `CARD_REVISION_CHANGED`）、`contact-writes-postgres.test.ts`（提交与预览一致、零合并）；门槛 CON-007、010；两端组件渲染文字相同（`web-card-render.txt`、`app-card-render.txt`、`web-app-same.txt`） |
| AG12-5 | pass（代码判定；待评审） | `tests/agent-v1/contact-field-grants.test.ts`（记录去字段、出口扣下、用户自己打的放行、真实请求体不含）、`contact-domain.test.ts`（查重候选、卡片、读取与回答四条路径的模型输入都不含）；门槛 CON-008 及 CON-001～003 的 `model_input_excludes` |

开场项 AE-FN-003：`tests/agent-v1/ag12-opening-fn003.test.ts`（中日英、没人符合）；AG10 回归运行里 AE-FN-003 代码判定通过。

## 写入方清单与版本处理

| 模块 | 写什么 | 版本处理 |
|---|---|---|
| `features/contacts/contact-field-write.ts` | 五个基本字段（手入力统合、补全、招待同步、Agent 修改都经它） | 下一版；`expectedVersion` 带了只试一次 |
| `features/contacts/business-card-contact-match.ts` | 名片／导入并入已有联系人 | 下一版 |
| `features/contacts/storage/contact-write-live-record-provider.ts` | `saveContact`（名片、手入力新建、导入新建、活动换名片、种子） | 先读已存的：有就下一版，新建为 1（获取路径自带的 1 保留） |
| `features/contacts/storage/contact-live-record-provider.ts` | 行业、补全编辑、画像写回 | 下一版 |
| `features/contacts/delete/service.ts` | 软删除、恢复 | 同一段 SQL 片段 `contactNextVersionSql()` |
| `features/contacts/enrichment/backfill.ts` | 补全回填 | 下一版 |
| `features/contacts/action-writer.ts` | 旧执行器 `contacts.archive` | 先读已存的再取下一版 |
| `features/invite-codes/invite-fields.ts` | 招待的列表字段 | 下一版（标量经字段写入） |
| `features/network-analysis/layers-runtime.ts` | 三层更新写回 | 下一版 |
| `features/connections/lifecycle/initialization.ts` | 关系初始化 | 原来就加一，改为经 `nextContactVersion` |

不写联系人（读或写别的集合）：`connections/lifecycle/postgres-repository.ts`、`contacts/completion/repository.ts`、`manual-contact-v2/service.ts`（经上面两个）、`events/confirmed-followup/service.ts`、`invite-codes/service.ts`（经写入 provider；撤销是墓碑删除）、`notifications/appointment-inbox-backfill.ts`、`shared/storage/generated-notification-title-repair.ts`、`shared/storage/seed-generated-fixtures.ts`。墓碑删除（`deleteRecord`：手入力撤销、招待撤销、`removeContacts`）记录消失，不加版本。`scripts/` 下的种子与迁移脚本没改；评测种子走 `saveContact`，现在写进 1。

**生命周期的行为变化：** 没有版本的旧联系人被写过一次就带上版本，`initialization.ts` 的 `legacyPending`（要求 `version === undefined`）不再成立，旧的“互换但未初始化”关系在被编辑后不会被重新初始化。与那里的注释“被编辑过的关系不重新初始化”一致；生命周期测试（`relationship-lifecycle-postgres`、`relationship-lifecycle-routes`、`contact-detail-lifecycle-guard-postgres`）全过，没有测试依赖“编辑过仍可初始化”。

## 假设与额外阅读

- 额外读了：`features/agent/runtime/decision.ts`、`service.ts`、`card-operations.ts`（卡片冻结、点击核对、新版本）、`features/agent-v1/graph/nodes/propose.ts`、`propose/resolve.ts`、`route.ts`、`judgment/intent-review.ts`、`answer/materials.ts`、`orbit-ai/data-query/permission-registry.ts`、`contacts/import/service.ts`、`dedupe.ts`、`parse/`、评测运行器 `runner.ts`、`hard-checks.ts`、`observations.ts`，两端卡片组件；原因都是找接线点和现有行为。
- 选择：
  - 版本沿用 `version` 字段（设计稿附录 E），不另起字段；理由见上面的生命周期一节。
  - 删除、恢复的徽章词放在共用计算与用词里，两端组件不改（进入条件 3 判定为“能”，见 PLANNER 更正记录）。徽章沿用“改”的样式。
  - 查重：现有规则之外，同名同公司（现有同名规则要求一方没有公司或联系方式，会漏掉 C47）与同公司近似名也算候选；同名不同公司不算。中日文名近似只放宽到差一个字。
  - 疑似重复行确认时默认跳过（不合并，也不新建），用户说“也新建”才新建。
  - 导入卡的总数句用行数；卡上项目写“导入联系人（共4行）”。
  - 导入改版由入口在跑图之前用代码处理（这条会话里有等待确认的导入卡、且消息里说了第几行和新建／跳过），不调模型。
  - 回答材料里给出“有邮箱、电话，但没授权给你”（只给名字，不给值）；读取白名单 `contacts.query` 加 `contactMethods`。
  - “导入、恢复、取り込む、復元、import、restore”加进登记的写入动词（不再交判断模型复核意图）。
  - AE-FN-003：只计到期／过计划日的人，本期内将到期的另行列出，不改 `listed` 判定的含义（用例写的是 includes）。
- 评测口径改动（用例不改）已记进 `eval/CHANGES.md` 两行。

## 影响分析（HIGH／CRITICAL）

- CRITICAL：`applyContactFieldValues`、`createStorageBusinessCardContactWriteProvider`、`createStorageContactGraphProvider`、`createStorageContactArchiveActionWriter`（版本加一）；`callMainModel`、`askJudgment`（联系方式出口）；`createOrbitAgentRuntimeService`、`cardWriteExecutors`、`TodoReader`（联系人读取与执行器接线）。
- HIGH：`writeAnswer`、`coverageLine`（AE-FN-003）、`mergeCardIntoContact`、`needsIntentReview`。
- `risk: UNKNOWN`（已用文本搜索补查）：`rankPart`、`recheckCard`、`applyEnrichmentBackfill`、`createRelationshipInitializationService`、`CONTACT_DOMAIN`、`buildMaterials`、字段接口契约。
- 改动都是加字段、加分支，全量与回归通过。detect-changes 输出在证据目录（`detect-changes-*.txt`）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| （未安排独立 review；评审由协调者派的 Claude 会话做） | — | — |

## 证据（`~/orbit-sprint-evidence/agent-design/sprint-AG12/run-01/`）

`start.txt`、`impact-*.txt`、`detect-changes-*.txt`、`closing-set.txt`、`full-orbits.log`、`full-fail-names.txt`、`run-*.log`、`pack-*.log`、`contact-previews.json`、`web-card-view.txt`、`web-card-render.txt`／`.html`、`app-card-render.txt`、`web-app-same.txt`。评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。

## 交接

- 联系人：`features/agent-v1/domains/contact/`（`prepare`、`apply`、`duplicates`、`import-preview`、`access`、`field-grants`、`copy`）；执行器键 `contact.create`、`update`、`delete`、`restore`、`import`，账本操作类型 `create_contact` 等五个。联系人卡的 `payload.expectedVersion` 在点击时换成当时读到的版本。
- 版本：`features/contacts/contact-version.ts`（`contactVersionOf`、`nextContactVersion`、`withNextContactVersion`、`contactNextVersionSql`）；新写入方必须用它（架构测试守着）。字段接口的 `expectedVersion` 已进契约，App 副本已同步，App 还没用。
- 卡片：`display.change` 多了 `delete`、`restore`；`runtime.reviseCard({ actionId, intents })` 按新意图出下一版（导入改行用）。
- 联系方式：`scrubModelInput()` 是主模型与判断模型请求的唯一出口；以后某类联系方式有了单独授权，在这里放行。
- 观察项（评分项外）：恢复后的回答仍保留已回答的追问句（AG07 交接 (b) 的同一类）；CON-008 的回答措辞由模型写，三遍都没有说“没有”。
- 回退：不合并或 revert 合并提交；`ORBIT_AGENT_V1_MODE=off`。版本字段只增不减，回退后旧代码照常读（读取器只要求正整数）。

## 需要协调者决定

1. **REF 区 5 个不变量用例进了 AG12 门槛。** 它们 `sprint: AG11`，按“归属不晚于本 sprint”被纳入，但 AG11（@ 选择器）排在 AG13 之后还没做；其中 REF-001、005、007 用到 `memory_state`（AG14 才有证据，现在一律判“看不出”），REF-006、008 要求对 @ 待办的引用。AG12 的改动修不了它们。请决定：给这些用例加 `gate` 字段顺延（至少 AG11，用到 `memory_state` 的到 AG14），或按现状接受 AG12 门槛不含它们。
2. 删除、恢复徽章词（沿用“改”的样式显示“删除”“恢复”）是界面上的新字，没有单独的视觉稿；依据是设计稿 §10“写‘改’‘新增’‘删除’”。如需视觉稿，请告知。
3. 真实界面截图（Web 与 App 各一张导入卡）没有拍成，原因见上；需要的话请指一个能登录的 Web 服务与可用的模拟器。
