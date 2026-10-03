# Sprint W0055 — 执行总结（大目标 4「人脉真分析」收口）

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。协调者裁决：验收中发现的「引导第 3 步 AI 计划被示例模式拦下」修复 `59ef1e47` 接受（路径验证不过、非 HIGH／CRITICAL，符合 PLANNER 失败规则；未改共享 `readDemoModeViewForActor`）。用户决定见 README D50～D52。

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - **老联系人回填脚本。** 在本机库对 50 多位联系人的验收账号 `verify-network` 真实跑了一遍。
    - 默认只预演：列出每阶段要处理多少人、预计调用几次 AI，0 写入、0 调用。
    - 加 `--apply` 才写，按 补全 → 强度 → 洞察 → 快照 的顺序执行，用了 7 次真实 DeepSeek 调用，全部记在 system 池，不占用户额度。
    - 再跑一次：0 写入、0 调用。
    - 用户自己改过的补全值不会被覆盖；达到 `--max-ai-calls` 上限就停，续跑能接上；目标不是本机验收库时直接拒绝。（SC-01）
  - **网页端不再使用关键词版人脉需求匹配，接口照样留给手机 App。** 加了源码门禁测试锁住；10 个没有页面引用的旧组件、1 个从没挂上路由的死接口和只测它们的测试已删除（D50），类型检查 0 个源码错误。「所有人脉」去掉了 4 个点不动的假筛选框，「关系状态」列改为自动推出的关系档位。（SC-02）
  - **全量对照新增失败 0。** 大目标 4 开工 SHA `00703fde` 与最终 `233b26a5` 用两份 `git archive` 副本对称跑全套测试；GitNexus 变更涉及的文件都能对应到 W0043～W0055 各 Sprint。（SC-03）
  - **两条真实路径都走通了（成功标准 A／B／C）。**
    - 新用户 `verify-new`：上传真实名片照片 → 确认 2 位 → CSV 导入 3 位虚构联系人补足 5 位 → 设目标 → AI 生成计划 → 跑完两个维护任务。人脉的结构／机会／洞察三标签都有针对目标、带依据的内容，没有调试英文，也没有「来源暂时不可用」。
    - 老用户 `verify-network`（回填后）：管线按 新认识／有往来／核心／待唤醒 分组，三标签和洞察有内容，详情时间线每条都标了来源，所有人脉有档位列和洞察一句。（SC-04）
  - **总账、AI 汇总和 Bridge handoff 已写好**（见下）。（SC-05）
- **验收中发现并修复的问题：** 打开 AI 计划生成器（`ORBIT_PLAN_GENERATOR=ai`）后，新用户在引导第 3 步会被「示例模式」拦下（403 `DEMO_MODE`），**永远生成不了第一份计划**。
  - 已改为：名片和目标两步都完成、下一步就是「计划」时放行；其他示例状态照旧拦截，拦下时不预留额度、不调用生成器。提交 `59ef1e47`，补了测试。
  - 这个问题会直接卡住生产开关 `ORBIT_PLAN_GENERATOR=ai`，所以必须先合并这个修复，再开生产开关。
- **仍未实现或未验证：**
  - 关系管线卡片「下一步」仍是中文模板句（W0043／W0052 交下的项，不在 PLANNER 范围，未处理）。
  - mock 快照会在中文界面写出英文行业名：用户已定为后续文案修正项。
  - 回填脚本的生产执行、生产迁移、生产开关都没有执行，见下方授权清单。
  - App 端界面、App typecheck 未验证（App 未改动）。

## 运行记录

- **结果：** 本地全部 SC 达成，等协调者合并 `chat-agent` 并验证合并树后再标 completed。
- **Generator：** Opus 5.5，2026-10-03，Planner revision 4（SHA256 `0f16efd1…ca302`，开工核对一致）；run-01，基线 `f42f86b9`。
- **分支 `sprint/W0055-network-closeout`，提交：**
  - `769b26b7`：回填编排与 `verify-network` 种子
  - `340c06c6`：去假筛选、档位列、contact-needs 门禁
  - `af034c8c`：`verify-network` cookie、CSV 行指纹
  - `0446431d`：Bridge 草稿
  - `dc530b34`：死代码删除（D50）
  - `59ef1e47`：引导第 3 步 AI 计划修复
  - `233b26a5`：`--purge`、子账指纹
  - `eb199e0c`：Bridge 更新（固定交接 SHA）
  - `chat-agent` 合并 SHA：见 README 运行记录。
- **档位 I：全量对照。**
  - 大目标 4 开工 `00703fde`：6201 项，失败 46，跳过 489。
  - 最终 `233b26a5`：6611 项，失败 46，跳过 494。
  - 新增失败 0，变绿 0。
  - 中途一次（HEAD `340c06c6`）新增 1 条 `event-registration-plan-sync`，单独复跑两次都通过，判为偶发；最终两次全量都没有再出现。
  - 跑法：排除 `tests/pages/event-registration-readback.test.tsx`；`ORBIT_EVENT_DATABASE_URL` 指向本机测试库；不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`；不 source `.env`。
  - 两边都有的 46 条失败：34 条是审计门禁（副本里没有仓库根目录），其余是 Node 26 的 DeprecationWarning 噪音等环境问题。
- **付费 AI：** 真实 DeepSeek **19 次 HTTP**（上限 D51 为 30），输入 30,866 token、输出 19,461 token。
  - 明细见「真实 AI 调用汇总」。
  - 开工时全库 `ai_usage_calls` 8 行；获批前（第一段）新增 0 次。
- **push：** 未 push。生产迁移、生产环境变量、生产回填、部署：均未执行。

## 验收结果

| SC | 结果 | 证据（`~/orbit-sprint-evidence/web/sprint-W0055/run-01/`） |
| --- | --- | --- |
| 01 回填脚本 | pass | `tests/scripts/backfill-network-analysis.test.ts` 8/8、0 skip（见下「SC-01 明细」）；本机演练输出 `backfill/01–08`（mock）与 `real/A2–A5`（真实）；账本查询 `real/A5-ledger-after-backfill.txt`。 |
| 02 清理与 App 接口不动 | pass | 删除前后 `rg`：`rg-before*.txt`／`rg-after.txt`（见下「SC-02 明细」）；门禁 `tests/pages/web-contact-needs-retired-gate.test.ts` 3/3；`tests/pages/app-network-all.test.tsx` 新增断言；`contact-needs-route` 与 `contact-needs` 服务测试 56/56 原样通过。 |
| 03 全量与变更对照 | pass | `fail-base.txt`、`fail-head.txt`、`fail-new.txt`（空）、`fail-fixed.txt`（空）；`detect-compare.txt`、`compare-file-to-sprint.tsv`（见下「SC-03 明细」）。 |
| 04 两条真实路径 | pass | `screens/10–19`（老用户）、`screens/20–24`（新用户）、`real/C1–C5`（见下「SC-04 明细」）。 |
| 05 总账、AI、Bridge、纪律 | pass | 本报告下方两张表；`bridge/2026-10-03-network-real-analysis.md`；`app-sync-tests.txt`（App 四个 *-sync 测试 10/10）；`git status --short` 只剩用户原有的未提交文件。 |

**SC-01 明细**
- 脚本测试覆盖：预演 0 写 0 调用；首次执行按 补全 → 强度 → 洞察 → 快照 写入；第二次 0 写 0 调用；`origin=user` 不被覆盖；模型已经看过但留空的字段不再送模型；`--max-ai-calls` 到上限停在检查点，续跑不重复调用；账本全部记 `pool='system'`；非本机验收库拒绝；检查点必须在仓库外。
- 真实执行（`real/A2–A5`）：
  - 预演预计 7 次。
  - `--apply` 实际 7 次 HTTP：补全 3、洞察 3、快照 1。
  - 第二次 `--apply`：0 写 0 调用。
  - 洞察 55 行全部 ready，档位 9／13／8／25。
  - 账本只有 system 池操作，用户主动池与后台自动池当日 0。

**SC-02 明细**
- 删除前后 `rg` 复核：除下列历史记录外，被删文件在 `app`／`features`／`shared`／`tests`／`scripts` 内 0 命中：
  - `scripts/generate-full-product-functional-audit.mjs` 里的历史 `file:line` 证据键（门禁对已删文件自动按退役处理；测试里的已知名单删短了 4 条）；
  - `scripts/visual/attribution-0918-network.json` 的一条历史说明；
  - 两处注释；
  - 一条「页面不得出现」的反向断言。
- `git diff 00703fde..HEAD` 里，`app/api/contacts/needs-matches/`（仅头注释）、`features/contact-needs/`（仅 `DESIGN.md`）、`app/api/mobile/`、`shared/compute/` 中本 Sprint 都没有改动；`repos/orbit-app` 本 Sprint 0 改动。
- `npx tsc --noEmit -p .`：0 个源码错误（剩下 8 个错误都在 `.next/types/validator.ts`，是另一个 dev server 生成的旧类型文件）。

**SC-03 明细**
- 刷新索引后跑 compare：405 个文件，没有 partial／truncated 标记。命令行只把符号清单截短（显示 "LISTING CAPPED"），计数是全的。
- 逐文件按提交归属：403 个改动文件全部能对应到 W0043～W0055，以及 W0056 的计划文档。范围外 0；`repos/orbit-app` 里只有同步副本。

**SC-04 明细**
- 新用户入口与人数：名片确认 2 位，CSV（虚构数据）补 3 位；没有使用 `--guide-step1`。
- 进入后已触发：洞察 dirty 5 行；W0048a 三层入口（补全 1 次、快照 job）。
- 验三标签前维护任务已跑完：dirty 0，job 0。
- 1440 和 375 各截图，375 无横向溢出；控制台只有 dev HMR websocket 报错；中英切换各抽查一屏。
- 结束时两个账号都已 `--reset`。

## SC-04 观察（如实记录，没有手改）

- **名片识别（D52 照用合照）：** 两张多卡合照各识别出 1 张。
  - 第 1 张：`fullName` 为 "Yasuhiro Yasuhisa"，页面显示原文名「安川 高宏」，公司「株式会社セクションエイト」，标出「电话可能有字读错」。
  - 第 2 张：「佐々木 芳邦／令和商事株式会社」，标出邮箱、传真读法不一致。
  - 按「照原样确认」入库。之后洞察把安川写成「制造业决策者」，与名片公司无法核对，属于模型推断偏差，已如实保留。
- **老用户覆盖度显示「已有 1／1」：** 种子里两条需求没有设 `targetCount`，所以显示已满足。新用户路径的覆盖度正确显示「已有 0／3 · 还缺 3」等。
- **老用户详情里「下一步建议 1 —」：** 显示一个空占位，属既有现象。
- **非 verify 行指纹：** 每次 `--reset`／`--purge` 运行内前后一致（`identical: true`）。跨整个验收时段比较，有两张表变化：
  - `bc_ingest_cleanup_tasks` +2：删除 `verify-new` 名片批次后排队的衍生图清理任务，这些行里没有账号标记；
  - `orbit_read_receipts` +17：无账号归属的读回执，包括 3000 端口另一会话的请求。
  - 其余 89 张表逐表相同（`fp-tables-after-A.txt` 对比 `fp-tables-end.txt`）。
- **另一账号的排队批次 `bcb2:690cb2e0…`（3 张）：** 全程未处理，仍是 queued。名片识别用的是只领取 `verify-new` 批次的临时 worker，见「假设」。

## 真实 AI 调用汇总（大目标 4 全部，按 D43／D51）

| Sprint | 场景 | 池 | 操作 | HTTP | 输入 token | 输出 token |
| --- | --- | --- | --- | --- | --- | --- |
| W0045 | 名片识别（2 张，演练） | 不入账 | — | 6 | 9,955 | 3,909 |
| W0045 | 按文字补全（回填演练） | 未经账本 | 1 | 1 | 2,108 | 1,628 |
| W0048a | 快照（自动首个、阈值重算） | 后台 | 2 | 2 | 7,468 | 2,194 |
| W0048a | 手动重新分析（3 次） | 用户 | 3 | 3 | 10,863 | 2,805 |
| W0048a | memo 提取 | 后台 | 1 | 1 | 200 | 43 |
| W0048b | 计划首次生成、重新生成 | 用户 | 2 | 8 | 8,514 | 5,786 |
| W0055 | 回填·补全（verify-network） | **system** | 3 | 3 | 4,826 | 4,157 |
| W0055 | 回填·洞察（W0051 演练） | **system** | 3 | 3 | 7,411 | 7,713 |
| W0055 | 回填·快照 | **system** | 1 | 1 | 5,023 | 687 |
| W0055 | 名片识别（2 张合照） | 不入账 | — | 6 | 7,545 | 3,303 |
| W0055 | 导入补全（CSV 3 人） | 后台 | 1 | 1 | 966 | 205 |
| W0055 | 计划生成（引导第 3 步） | 用户 | 1 | 4 | 4,307 | 2,728 |
| W0055 | 洞察批量（新用户 5 人） | 后台 | 1 | 1 | 788 | 668 |
| **W0055 合计** | | | 10 | **19** | **30,866** | **19,461** |
| **大目标 4 合计** | | | | 40 | 70,004 | 36,826 |

- 其余 Sprint（W0043、W0044、W0046、W0047、W0049、W0050、W0052、W0053、W0054）真实调用均为 0。
- W0051 的真实洞察演练在本 Sprint 完成：
  - 回填 3 批 55 人 + 新用户 1 批 5 人，全部生成成功（`model = deepseek-v4-flash`）；
  - 文字都针对目标并带依据（计划需求、备忘、日程），`ready` 60 行，失败 0；
  - 同一版本再次执行 0 调用。
- 名片识别的 token 取自 `bc_ingest_items.usage`（每张的转写＋整理）；6 次 HTTP 来自 worker 进程内对 `api.deepseek.com` 的请求计数。
- W0055 账本明细：
  - `real/A5-ledger-after-backfill.txt`；
  - `real/C5-ledger-verify-new.txt`；
  - 两个账号 reset 前已按 `operation_id` 聚合存证。reset 会级联删除账号的账本行，所以这两份文件是保存下来的原始证据。

## D39 读取总账（W0017 口径，10%／20%／100% 三档，MB／月）

| 截至 | 三档累计 | 本步新增（各 REPORT 实测） |
| --- | --- | --- |
| W0037 | 1,222.78 ／ 1,282.63 ／ 1,761.38 | — |
| W0041 去重基数 | 1,508 ／ 1,568 ／ 2,047 | W0040 去重口径 8,279.74～8,818.34，不在后续链里 |
| W0045 | 1,908 ／ 1,968 ／ 2,447 | 详情、列表 +400（按最大 +781） |
| W0047（含 W0046） | 3,480.7 ／ 3,540.7 ／ 4,019.7 | 强度读模型 +1,285.9；时间线 +286.8 |
| W0048a | 约 3,535～3,874 ／ 3,595～3,934 ／ 4,074～4,413 | 快照读取，按打开频率 |
| W0048b | 4,120 ／ 4,180 ／ 4,659 | +246.28 |
| W0049 | 4,936.6 ／ 4,996.6 ／ 5,475.6 | 去重 +816.6 |
| W0050 | 5,191 ／ 5,251 ／ 5,730 | 每天打开 1 次 +254 |
| W0051 | 5,596 ／ 5,656 ／ 6,135 | +405（全覆盖外推 +944） |
| W0052 | 6,738 ／ 6,798 ／ 7,277 | +1,141.7 |
| W0053 | 7,842 ／ 7,902 ／ 8,381 | +1,104 |
| W0054 | 7,847.28 ／ 7,907.28 ／ 8,386.28 | +5.28 |
| **W0055** | **7,847.28 ／ 7,907.28 ／ 8,386.28**（不变） | 产品读取新增 0（档位列读已有视图模型）；回填是一次性读取，不计月度 |

- **后台读取单列：** W0048b 阶段补细约 65.9 MB／月。
- **本 Sprint 两条路径的整页实测（读回执，`verify-network` 55 人）：**

  | 页面 | 每次打开 |
  | --- | --- |
  | `/app/contacts/dashboard` | 466～475 KB，40～60 条语句 |
  | `/app/contacts/pipeline` | 约 460 KB |
  | `/app/contacts`（所有人脉） | 29.6 KB |
  | 联系人详情 | 44 KB |

  - 概览按每人每天 2 次估算，约 28 GB／月。这是整页读取，不是增量；它印证了 W0052 登记过的「现有分析＋列表 222 KB 读取」风险，而且实际更大。
- **判定：** 三档都超过 1.6 GB。按 W55-6 登记 D32 周检，不阻塞收口。
  - 最大两项新增：W0047 强度读模型（+1,285.9），W0052 驾驶舱（+1,141.7）；W0053 导入（+1,104）紧随其后。
  - 瘦身方向：概览／管线整页读取重复取全量联系人图（466 KB），先只取驾驶舱与看板所需列和人数；强度读模型改为只在来源戳变化时读时间线。是否另开瘦身 Sprint 由用户决定。

## 假设与额外阅读

- **额外阅读：**
  - W0045 回填核心 `features/contacts/enrichment/backfill.ts`；
  - W0051 `features/contacts/insights/{worker,maintenance-task,repository,runtime}.ts`；
  - W0048a `features/network-analysis/{service,runtime,refresh-policy,source-version}.ts`；
  - `features/ai-quota/{gate,ledger}.ts`；
  - `features/relationship-strength/read-model.ts`；
  - 时间线读取（为造种子）；
  - 名片 v2 worker 与仓储（为限定识别范围）；
  - 计划 bootstrap 路由（发现示例模式拦截）。
- **回填设计取舍：**
  - 洞察阶段只给「还没有洞察行」的人标待更新，再按本人逐行领取（`claimSingle`）后用 system 池生成，没有交给后台维护任务。原因：W0051 的维护任务记后台池，与 SC-01「账本全部 system、两池当日为 0」冲突。
  - 补全阶段「模型已看过」的判定记在仓库外检查点（按每人的 AI 输入指纹），保证第二次 0 调用。
- **SC-01 的「先 RED」没有做到：** 回填脚本的测试写在实现之后，如实登记。
- **验收用的仓库外临时工具（scratchpad，未提交）：**
  - 只跑 `contact-insights`／`network-snapshot` 两个维护任务的 runner；
  - 只领取 `verify-new` 批次、关掉全局清扫和通知、计数 HTTP、禁用旋转重试的名片识别 runner。原因：库里有另一账号的排队批次，跑整机 worker 会多出约 9 次付费识别，还会改动他人数据；
  - 给浏览器读取合照用的本机 CORS 文件服务。
- **范围外但必需的文件补充（RULES §0 登记）：**
  - `scripts/lib/verify-network-fixtures.ts`（新增）；
  - `scripts/verify-session-cookie.ts`（支持 `verify-network`）；
  - `scripts/seed-verify-accounts.ts` 增加 `--purge`、按父行判定 `contact_import_rows`／`ai_usage_calls` 的指纹；
  - `app/api/agent/plans/bootstrap/route-handlers.ts` 的示例模式判定（路径验证不过、非 HIGH／CRITICAL，按 PLANNER 失败规则在本 Sprint 修复）；
  - 混合测试与 `followup-task-generation-mock.test.ts` 的对应用例；
  - `app-network-archived-status.test.tsx`（改为断言档位）。
- **GitNexus：** 开工时索引一度损坏（`CrmSidebar` 被误报 CRITICAL、路径乱码），`analyze --force` 重建后恢复。删除提交 detect-changes 显示 CRITICAL，原因是被删文件里的 `BusinessCardCaptureState` 被图谱误连到其他流程；文本搜索确认 0 引用、`tsc` 干净。

## review 处理

本 Sprint 是 I 档，PLANNER 规定不另做 Codex 代码 review。

## 交接

- **回填脚本用法：**
  - `node --import tsx scripts/backfill-network-analysis.ts --email=<账号> --max-ai-calls=<n> [--apply] [--batch-size=20] [--sleep-ms=1000] [--checkpoint=<仓库外>] [--mock-ai]`
  - 预计每人：补全 ⌈缺字段人数／20⌉ 次、洞察 ⌈人数／20⌉ 次、快照 1 次。55 人共 7 次，输入约 17k、输出约 12.5k token。
  - **目前只能连本机验收库**：生产执行需要先实现带授权记录的显式开关，属后续 Sprint。
- **生产授权清单（W48-9，由协调者转用户，顺序为先迁移、再开开关、最后回填）：**
  1. 合并本 Sprint，至少要含 `59ef1e47`：否则开了计划 AI 开关后新用户做不出第一份计划。
  2. 生产迁移：
     - W0048a `orbit:network-analysis-schema` v1、v2（`ai_usage_ledger`、`ai_usage_calls`、`network_analysis_snapshots`、`network_analysis_jobs`）。**迁移一执行，memo 提取就随 `DEEPSEEK_API_KEY` 开启（后台池 60 次／日）。**
     - W0051 `orbit:contact-insights-schema` v1、v2（`contact_insights`）。
     - W0053 `orbit:contact-import-schema` v1、v2（导入批次、行、跟进表）。**导入补全随 key 开启，计入后台池。**
     - W0050 `plan_match_jobs` v4（只放宽一个 check 约束）。
     - 生产库是否有 `sync_revision` 列要先确认（W0047；本机库没有，走时间戳退路）。
  3. 生产环境变量：`ORBIT_PLAN_GENERATOR=ai`、`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`、`ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek`（都需要 `DEEPSEEK_API_KEY`）。
  4. 生产回填按 内部账号 → 小比例 → 全量 分档放量。每档先预演，再带 `--max-ai-calls` 执行；W0045 的补全回填（`backfill-contact-enrichment.ts`）同属这次授权。
- **Bridge：**
  - 新建 `bridge/2026-10-03-network-real-analysis.md`（BR-032）。
  - `bridge/handoffs.md` 仍有用户未提交改动，没有编辑。应加的队列行原文：
    > `## BR-032 — Web 大目标 4「人脉真分析」：App 影响（App 未改）` 换行 `W0043～W0055 已在 Web 合并；App 只收到各 Sprint 同一提交的 sync:contract 副本（全部可选新增字段），收口时 App 四个 *-sync 测试 10/10；/api/contacts/needs-matches 保留给 App。App 界面与 typecheck 未验证，下一责任方 App 线；详见[交接](2026-10-03-network-real-analysis.md)。`
- **需要用户决定：**
  1. 是否另开读取瘦身 Sprint（概览、管线整页约 466 KB／次）。
  2. 后续文案修正项：mock 快照里的英文行业名、管线卡片「下一步」的中文模板句、`verify-network` 需求 `targetCount`。
- **回退方式：** 按顺序 revert `eb199e0c`、`233b26a5`、`59ef1e47`、`dc530b34`、`0446431d`、`af034c8c`、`340c06c6`、`769b26b7`。删除的文件可从 `dc530b34^` 恢复。本 Sprint 没有迁移。
