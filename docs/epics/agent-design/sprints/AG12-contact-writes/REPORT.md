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

## run-02（协调者批准的例外，2026-11-18）

**起因：** run-01 评审后，AG12 自己的 12 例两评都过；AG07～AG03 复跑全过；FN-010 记为接口抖动。协调者列了 5 项：WEB-004 R3、CTX-005 R1、SCL-016 R2、AMB-011 的引号残留、REF ×5 的归属。PLANNER 已追加 run-02 更正记录。每项都先写测试（`tests/agent-v1/ag12-run02.test.ts`、`tests/agent-eval/sprint-order.test.ts`），改之前跑了 upstream impact（`run-02/impact.txt`）。修复轮次：1 轮，加两处稳定性修正。

| 提交 | 内容 |
|---|---|
| `2ae82234e` | 四条回答规则（下面 1～4） |
| `266630cf3` | 执行顺序与 REF 归属（下面 5） |
| `bf91eaba8` | 稳定性运行 2：「我也无法替你上网查询」也算否认联网 |
| `45c04eaa6`、`d27641655` | 稳定性运行 3：第一层把“这是价格页：链接”标成陈述，页面没被打开；只开网页、不读记录的部分，带用户给的链接就走联网读取 |

1. **AE-WEB-004 R3：** `withoutOnlineDenials` 只删否认联网的那一截：遇到强分隔（；;）就只删含否认的那几段；否则删否认分句、它后面的部分和紧挨在前面的话题引子（“至于…”“…については”“as for…”）。剩下的话能单独成句就保留，按原句结尾补标点。整句只是否认的仍整句删。中日英都有测试。稳定性运行里那句变成「笔记里提到，它不公开报价，只有朋友说去年签约时是每席 900 日元。」
2. **AE-CTX-005 R1：** `stripCardTalk` 删了卡片句时，也删请用户确认的话（「確定してよければ教えてください。」「确认的话告诉我一声。」“Let me know if you want to confirm it.”）。没有删卡片句时，这类话照常保留。
3. **AE-SCL-016 R2：能做成确定性的。** 回答引用的记录本身有一句说旧值已过期（“The September quote of JPY 1,900 has expired.”），回答里又没有说时，代码在回答后补一句，原文照抄、带日期：“(The record of Nov 2 also says: "…")”，中日英。只用回答引用的记录、只抄记录自己的句子，不靠提示词。三次稳定性运行里，一次由代码补上，两次模型自己写了（这时代码不补）。
4. **AE-AMB-011：** 在所有删句规则之后加 `withoutQuoteResidue`：去掉空的成对引号、整行只剩引号的行、行首没有对应开引号的闭引号。完整的引号不动。
5. **REF ×5：** 不变量包、用例级与评审项级 `gate` 的先后，改按执行顺序 `SPRINT_EXECUTION_ORDER`（AG00～AG10、AG12、AG13、AG11、AG14～AG18）比较，用例检查器同样。测试按 SPRINTS.md 登记表的依赖列逐条核对。REF-001、005、007 加 `gate: AG14`；SPRINTS.md 门槛列改为 AG11 REF ×5、AG14 加 REF ×3；README §6、SPRINTS.md 门槛归属段、`eval/CHANGES.md` 都已写明。AG12 门槛从 65 例变成 60 例（不再含 REF）。

**稳定性运行**（WEB-004、CTX-005、SCL-016、AMB-011 各 3 遍）：
- `266630c` 上 12/12；
- `bf91eab` 上 11/12：SCL-016 没开页面，原因是第一层把链接那句标成陈述 → `45c04ea`；
- `45c04ea` 上 11/12：SCL-016 这次第一层把两句并成一个部分（又开网页又读笔记），联系人线索 “Lumen ATS” 找不到人，笔记没读。并成一个部分在我改之前也会走联网读取，不是这次改动引起的；我把新规则收窄到“只开网页”的部分（`d276416`），没有处理合并部分的读取。见交接。
- 最终代码 `d276416` 上：`20261118-115028`、`-115130`、`-115229-d276416-AG12-r2stab3-1/2/3`，三遍都是 4/4。

**最终代码 `d276416` 上的检查：**
- 全量（en_US）：8905 例，24 失败，与基线 24 条同名，没有新增；
- 收口集（带本机测试库，含 agent-v1、agent-eval 全部测试）：657/657，0 skip；
- `agent-eval:check`：232 例，0 问题。

**门槛与回归**（`d276416`，干净构建，`--workers 4`，一个接一个跑，都已生成 judge-pack；未评审）：

| 运行 | 代码判定 | 费用 |
|---|---|---|
| `20261118-120008-d276416-AG12-gate-run-02` | 60/60 | 0.418 元 |
| `20261118-120258-d276416-AG10-gate-rerun-at-AG12-run-02` | 62/63（AE-FN-010：DeepSeek 15 秒超时，`model.failed` 15002 ms） | 0.530 元 |
| `20261118-122314-d276416-AE-FN-010-timeout-retry-run-02-1` | 1/1（第 1 次重跑即过，记为接口抖动） | 0.009 元 |
| `20261118-120617-d276416-AG09-gate-rerun-at-AG12-run-02` | 54/54 | 0.407 元 |
| `20261118-120855-d276416-AG08-gate-rerun-at-AG12-run-02` | 50/50 | 0.340 元 |
| `20261118-121134-d276416-AG07-gate-rerun-at-AG12-run-02` | 43/43 | 0.308 元 |
| `20261118-121343-d276416-AG06-gate-rerun-at-AG12-run-02` | 47/47 | 0.356 元 |
| `20261118-121611-d276416-AG05-gate-rerun-at-AG12-run-02` | 43/43 | 0.308 元 |
| `20261118-121819-d276416-AG04-gate-rerun-at-AG12-run-02` | 37/37 | 0.283 元 |
| `20261118-122030-d276416-AG03-gate-rerun-at-AG12-run-02` | 39/39 | 0.291 元 |

**费用：** run-02 约 4.16 元（门槛与回归 3.25 元，稳定性运行 0.91 元），真实调用约 990 次。sprint 累计约 8.4 元。

**影响分析：** `stripCardTalk`、`stripSentences`、`groundedAnswer`、`withoutFalseClaims`、`decideRoute` 是 HIGH；`withoutOnlineDenials`、`selectCases` 是 LOW；`sprintNumber` 是 UNKNOWN（文本搜索：只有 cases.ts 自己用，现在不再用于比较先后）。

**交接（run-02 追加）：**
- 留着没做（协调者指定）：AG03 CTX-005 的「お礼をどうぞ。」开头；AMB-008 卡片上方残留的「是李薇吗？」。
- AE-SCL-016 的不稳定：第一层有时把“这是价格页：链接。和最新报价比怎样？”并成一个部分，又把公司名 “Lumen ATS” 标成联系人线索。这时网页打开了，笔记却没读。要稳定，需要一条代码规则：把用户给出链接的那一句和读记录的那一句拆开，或者在找不到联系人时把公开名称（链接里的公司）当作话题词去读笔记。属于 AG09 范围，这次没做。
- 新的回答规则：`withoutQuoteResidue`、`expiryLine`、`CONFIRM_REQUEST`（在 `stripCardTalk` 里），以及只开网页的部分带链接就走联网读取（`route/decide.ts`）。
- 评测：先后一律用 `sprintOrder()`，不再用 `sprintNumber()`。以后改 sprint 依赖时同步改 `SPRINT_EXECUTION_ORDER`，`sprint-order.test.ts` 会检查。

## run-03（协调者批准的例外，2026-11-18）

**起因：** run-02 评审后，AG12 自己的门槛、AG09、AG07、AG06、AG04、AG03 两评都过；AE-H-002/003/004 按预期是代码判定失败；FN-010 记为接口抖动。协调者列了 5 项：WEB-004（两处）、FN-008、SCL-004 R2、FN-003 R4。PLANNER 已追加 run-03 更正记录。每项都先写测试（`tests/agent-v1/ag12-run03.test.ts`，8 例），改之前跑了 upstream impact（`run-03/impact.txt`）。修复轮次：2 轮（用满）。

| 提交 | 内容 |
|---|---|
| `85dbef05e` | 修复 1：下面 1～5 |
| `b96f40f7f` | 修复 2：排序入口不再列出这次已经用过的排法 |

1. **AE-WEB-004（没有名字的线索）：** 在 AG09 描述线索规则（`understand/described-clue.ts`）上扩展了 `subjectInsideRecord`：只读不写的部分里，联系人线索本身不点名任何人（那家公司、这个人、那位、その会社、あの人、that company、he、他、彼…），同一部分又有一条笔记线索点名了具体的笔记（“竞品笔记 C”，不是光“笔记”“这篇笔记”），这条联系人线索就不去找人，当作笔记里的主体（trace `understand.subject_in_record`）。要改记录的部分不适用（“把她的待办改到周五”里的“她”仍按人找）。中日英都有测试。
2. **AE-WEB-004（悬空引导语）：** 否认联网的分句在句首时，删掉它和后面只是接着它说的引导语（只能据…说明：、根据…、所以、但、ただ、…によると、、but going by …,），后面有出处的内容留下。紧跟在被删否认句后面的“所以…”去掉连接词。用 run-02 seq 307 那句做的测试：留下「它指的是 C 公司（Cirrus Works），笔记里写着这家公司不公开报价，朋友说去年签的是每席 900 日元。官网上应该查不到公开报价。」
3. **AE-FN-008（列表前的数量）：** 无出处的数量如果只是在引出列表（「这篇笔记有三件事：」「このメモには3件あります：」“There are three items in this note:”），只把数量换成中性说法（「写了：」「には次のことが書かれています：」“This note says:”），列表留下；单独陈述数量的句子仍整句删。另外加了兜底（`citedFallback`，trace `answer.cited_fallback`）：引用了记录的回答被删句规则（卡片话、联网否认、数量、日期等）删空时，改为代码给出被引用的原句，前面加一句代码写的引导语（「记录里写的是：」等），不放回没交付的模型原话。测试覆盖数量、联网否认、卡片话三种删空情形。
4. **AE-SCL-004 R2：** 只有公司被判过时的时候，资料过时那一行把资料里的职位和公司连起来说：「拾野选物店店长」「拾野选物店の店长」“店长 at 拾野选物店”。**没做到的情形：** 公司和职位同时被判过时时，仍按原来的格式列两个值「拾野选物店」「店长」。稳定性运行 6 遍加 AG05 回归 1 遍，共 7 遍里有 2 遍是这样（`b96f40f` 上稳定性第 1、2 遍；这时模型把 role 也报成过时），其余 5 遍是「拾野选物店店长」。改成同样连起来说只需一行代码，但两轮修复已经用完，没改。见“需要协调者决定”。
5. **AE-FN-003 R4：** AG10 已有排序依据的选项（`orderingsOf`：逾期没做的跟进、最久没联系，活动是开始时间、周末、话题），而且两端已经能显示 `kind: entry` 的入口，所以不需要新界面。现在排序回答说明了依据（有 `lead`）时，代码把其余的排法作为入口放在回答旁边（`purpose: ranking`，`kind: entry`），点了就按它重排，不提问、不写入。修复 2：不列这次已经用的排法（history → overdue、用到的字段、周末、话题），一个都不剩就不加。AG10 的排序测试里“没有提问”改为只数提问，不数入口。稳定性运行里 FN-003 回答末尾是「需要的话，也可以点「按最久没联系的先」。」，旁边是一个入口。

**稳定性运行**（WEB-004、FN-008、SCL-004、FN-003 各 3 遍，`--workers 4`）：
- `85dbef0` 上 `20261118-124910`、`-125000`、`-125047-85dbef0-AG12-r3stab-1/2/3`：都是 4/4；FN-003 的入口里列了已经用过的「先看逾期没做的跟进」→ 修复 2；
- `b96f40f` 上 `20261118-125515`、`-125603`、`-125652-b96f40f-AG12-r3stab-1/2/3`：都是 4/4。WEB-004 三遍都读了笔记、说出 Cirrus Works 和每席 900 日元，没有再问“哪一位联系人”（第 2 遍第一层把这句拆成读笔记和联网两个部分，笔记内容排在代码那行“这次没有联网查”后面）。FN-008 三遍都有摘要。SCL-004 见上面第 4 项。

**最终代码 `b96f40f` 上的检查：**
- 全量（en_US）：8913 例，24 失败，与基线 24 条同名，没有新增；
- 收口集（带本机测试库，含 agent-v1、agent-eval 全部测试）：665/665，0 skip；
- `agent-eval:check`：232 例，0 问题。

**门槛与回归**（`b96f40f`，干净构建，`--workers 4`，一个接一个跑，都已生成 judge-pack；未评审）：

| 运行 | 代码判定 | 费用 |
|---|---|---|
| `20261118-130355-b96f40f-AG12-gate-run-03` | 60/60 | 0.228 元 |
| `20261118-130701-b96f40f-AG10-gate-rerun-at-AG12-run-03` | 63/63 | 0.278 元 |
| `20261118-131024-b96f40f-AG09-gate-rerun-at-AG12-run-03` | 54/54 | 0.205 元 |
| `20261118-131330-b96f40f-AG08-gate-rerun-at-AG12-run-03` | 50/50 | 0.174 元 |
| `20261118-131939-b96f40f-AG07-gate-rerun-at-AG12-run-03` | 43/43 | 0.160 元 |
| `20261118-132159-b96f40f-AG06-gate-rerun-at-AG12-run-03` | 46/47（AE-XL-007：第二句的 `intent.explicitWrite` 判断请求 Gemini 3 秒超时，`judgment.response` aborted 3002 ms，按“不是明确写入”回退，没出第二张卡） | 0.193 元 |
| `20261118-133114-b96f40f-AE-XL-007-timeout-retry-run-03-1` | 1/1（第 1 次重跑即过，记为接口抖动） | 0.009 元 |
| `20261118-132428-b96f40f-AG05-gate-rerun-at-AG12-run-03` | 43/43 | 0.155 元 |
| `20261118-132646-b96f40f-AG04-gate-rerun-at-AG12-run-03` | 37/37 | 0.133 元 |
| `20261118-132847-b96f40f-AG03-gate-rerun-at-AG12-run-03` | 39/39 | 0.147 元 |

**费用：** run-03 约 1.93 元（门槛、回归与重跑 1.68 元，稳定性运行 0.25 元），真实调用约 900 次。sprint 累计约 10.3 元。

**影响分析：** `graphPartsOf`、`withoutUnsourcedCounts`、`writeAnswer`、`groundedAnswer` 是 HIGH；`profileLine`、`rankPart`、`withoutDenialClauses` 是 UNKNOWN（文本搜索：`profileLine` 只有 answer 节点用，`rankPart` 只有 functions 节点用，`withoutDenialClauses` 只有 `withoutOnlineDenials` 用）。HIGH 的几个都由收口集、全量和回归覆盖。

**交接（run-03 追加）：**
- 新规则：`subjectInsideRecord`（understand）、`withoutDanglingLead`（claims）、`neutralizedListCount`（counts）、`citedFallback`（answer 节点）、排序回答旁的入口（functions 节点，`purpose: ranking`、`kind: entry`）。
- 排序入口是新的可点项：以后有用例对排序回答写 `clarifications: { count: 0 }` 没问题（入口不算提问），但 `offered_options` 的上限会把入口算进去。
- WEB-004 里模型偶尔还会写「我没法查到，也没法核实」这类没有“上网”字样的话，删句规则不管；代码那行已说明这次没有联网查。

**需要协调者决定（run-03）：**
- AE-SCL-004：公司和职位同时被判过时时，资料那行仍是「拾野选物店」「店长」（两个值都在，但没连成「拾野选物店店长」）。两轮修复已用完，没改。要不要再开一轮把它改成同样连起来说（一行代码，加改一条现有测试的期望）？

## 协调者复核与结论

- **结论：completed（run-03）。**
  - run-01：代码判定 60/65。不过的 5 例是 REF 区不变量，属于 AG11（`sprint: AG11`），按编号被选进了门槛。
  - run-02、run-03 是按用户 2026-11-16 选定的做法 A 开的例外。
- **协调者在 run-01 的决定：**
  - **REF 区 5 例：** 问题出在评测选不变量时按 sprint 编号比较，但 AG11 依赖 AG13，要排在 AG13 之后做。改为按执行顺序 `SPRINT_EXECUTION_ORDER` 比较，有测试对照 SPRINTS.md 的依赖关系。REF-001、005、007 要用到 `memory_state`，用例级 `gate: AG14`。
  - **“删除”“恢复”两个角标：** 在现有角标组件里只加了文字，按设计 §10 接受，不另出视觉稿。
  - **截图：** 两端同一张卡的渲染文字逐字相同，用这一点代替截图。
- **run-01 → run-02 修的问题（都由代码负责，不改提示词）：**
  - WEB-004：删“不能上网”时整句一起删了，笔记里“去年 900 日元”跟着丢了。现在只删那一小段。
  - CTX-005：卡片那句删了，后面“确定的话告诉我”还留着。现在连带删掉。
  - SCL-016：没说旧报价已过期。被引用的记录写明了过期、回答没提时，由代码补上那一句。
  - AMB-011：删减后留下空引号。
- **run-02 → run-03 修的问题：**
  - WEB-004：“那家公司”被当成联系人去找。现在同一句里有点名的记录时，它当作“那条记录里说的对象”。删掉否认的那一小段后，“只能据……说明：”这类悬空的引导语一并去掉。
  - FN-008：“有三件事”只列了两件，整段摘要被删光了。现在只把这个数改掉。另加保底：任何删减都不能把有出处的回答删空。
  - SCL-004：资料过时那一行带上同单位的职位。
  - FN-003：排序回答旁边加了可点的换排法入口，用的是 AG10 已有的选项，没有改界面。
- **评审**（都是新开的 Claude 会话，互不可见）：
  - **AG12 门槛 `20261118-130355-b96f40f-AG12-gate-run-03`：** 两名评审都是 60/60，报告最终通过 60/60，需人工复核 0。
  - **回归复跑（单评）：**
    - AG10 63/63、AG09 54/54、AG08 50/50、AG07 43/43、AG05 43/43、AG04 37/37、AG03 39/39。
    - AG06 47 例中 46 例通过。AE-XL-007 是 Gemini 3 秒超时，单独重跑 `…-AE-XL-007-timeout-retry-run-03-1` 第 1 次就过了，按协调者的超时规则记为接口抖动。
    - AE-H-002/003/004 是故意做坏的用例，按预期失败，算通过。
  - **稳定性：** r3stab 三次共 12 例，11 例通过。不过的 1 例是 AE-FN-008 R1（第 3 次），摘要多了一句笔记里没有的“这件事还待办”，属于模型偶发，见交接 2。
  - 全部运行已用 `--append-runs` 记进 RUNS.md，并按运行编号排序。
- **交接（AG13 开头先做）：**
  1. AE-SCL-004：单位和职位同时被判过时时，仍分开写成「拾野选物店」「店长」，要连成「拾野选物店店长」。改一行，外加改一条测试的期望。
  2. AE-FN-008：摘要不能加入笔记里没有的状态，比如“还待办”。要看能否由代码核对（状态词必须有记录支持）；做不到就在 REPORT 里写明原因。
  3. AE-RD-003（AG05 复跑 run-03）：第一层把“当时说了什么？”单独拆成一部分，还把“当时”当成联系人线索，回答末尾多出“不确定是哪一位联系人”。要由代码规定：时间词或指代词（当时、那时、今天、その時、then…）不当联系人线索，这一部分接到同一句前一部分的对象上。评审项没覆盖这一点，所以没影响结论。
  4. AE-BND-001 的轨迹里出现给 AE-CON-010 新建联系人补资料的模型调用，说明前一个用例的后台任务可能延续到后一个用例。要查用例之间的隔离。
  5. 记录格式：AE-UIX-004、005、008 的 transcript 里，App 断线后的画面少了“- app：”标签。
  6. 小毛病：日文回答开头的「お礼をどうぞ。」；选好人以后，上面仍留着“是李薇吗？”。
  7. AE-SCL-016 偶发：第一层把链接句和问题并成一部分，还把 Lumen ATS 当成联系人（AG09 范围）。
  8. 仍待安排：AG07 的 (b)(c)(e)(f)(g)，以及 UND-003/016 的归属问题。
- **花费：** DeepSeek 约 10.3 元（run-01 4.2、run-02 4.2、run-03 1.9），在每 sprint 150 元的上限内。
