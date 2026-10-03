# Sprint W0058 — 执行总结

协调者代写（Generator 写入 REPORT 被权限拦截，全文取自 Generator 最终回报）。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 有目标的账号确认名片后，同一次洞察调用（一批 ≤20 人仍是 1 次 HTTP）同时产出「为什么是 TA」和三栏推测（TA 能给你的／TA 需要的／可以聊的话题）。推测写进联系人 `publicProfile`，来源记 `origin: ai`、`via: card_inference`；写入语言跟随目标文字，中英原文存在 `enrichment.fields.<栏>.bilingual`（SC-01／02）。
  - 优先级：用户手改 > memo 提取 > 名片推测。用户清空的栏、memo 值、存量无来源值都不会被推测覆盖；memo 提取可替换推测；新推测可替换旧推测；新推测里没有的栏，若仍是旧推测则清掉（SC-02）。
  - 不编造：每条必须带 basis（title／company／card_notes／industry，且指向的字段非空）；套话、与公司名或职位原文相同、超长、带 id 或别名、属于他人的条目都丢弃；推不出时为空。名片备注去掉邮箱、电话、URL 并截到 200 字后才进提示词（SC-03）。
  - 推测与洞察在同一条 complete 语句写进洞察行（迁移 v4）。写回联系人冲突时重读重试 ≤2 次；仍失败则行保持 pending，由维护任务从存储的推测重放（0 次模型调用，最多 3 次，之后 skipped）。推测不计入输入版本，写回后再次领取判为「未变化」，0 次调用。提示词升到 `contact-insight@2`，不会让存量 ready 行过期（SC-04）。
  - 本机走通「名片批次 → 确认 → 详情」：详情 VM 新增 `publicProfile.fieldSources`（如 `card_inference`）供 W0060 显示角标。真实 DeepSeek 下，名片确认到「为什么是 TA」就绪 5.2–6.1 s（SC-05；同时补上 W0057 的真实端到端验证）。
- 仍未实现或未验证：
  - 三栏样式、「据名片推测」角标与标签修正属于 W0060；目前标签仍是旧的「我能提供／对方需求」。
  - 真实质量问题：模型会把用户目标的主题带进推测（verify-network 目标含「AI 质检」，20 人批次 60–83 条中有 12–13 条提到质检，名片上并无此信息）。提示词加约束无改善，已撤回。协调者按 Generator 建议 (a) 处理：接受，在 W0060 用「据名片推测」角标弱化显示（见交接）。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5 ／ 2026-10-03；Planner revision 2（SHA256 `efb065efe5d88361090c900d06a5b052bf760a1accdd8cf71a17bc075d7efee0`）；run-01
- 分支 `sprint/W0058-card-profile-inference`；功能 `e789c25e`，修复 `7f429fac`（真实调用发现）、`b28378ee`（部署环境 mock 不产推测）、`01ceec53`（review P2）；`chat-agent` 合并 SHA：等待协调者
- 档位 H；全量对照：基线 6651 项失败 24，分支 6664 项失败 24，**新增失败 0**，失败集合完全相同（`~/orbit-sprint-evidence/web/sprint-W0058/run-01/{baseline,branch,new}-failures.txt`）。源码 typecheck 0 错，`.next/types/validator.ts` 8 条为另一 dev server 的陈旧生成类型。App 同步脚本已执行，副本无 diff。
- 付费 AI：真实 DeepSeek **4 次 HTTP**（上限 5），输入 8541、输出 12868 token：#1 卡 1+2 合批 760／524，2.5 s；#2 卡 3 709／340，2.4 s；#3 verify-network 20 人 3519／4860，15.7 s；#4 同 20 人提示词对比 3553／7144，24.1 s。另 1 次非洞察请求被本机守卫出网前拦下，0 费用（`real-ai/blocked.ndjson`）。
- push：无

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 同一调用产出 | pass | `tests/services/contact-profile-inference-postgres.test.ts`「SC-01 one batch, one call」；真实调用 #1/#2 |
| 02 优先级与来源 | pass | `tests/services/contact-profile-inference-unit.test.ts` 表驱动 + provider CAS 重试；Postgres「SC-02 write priority」 |
| 03 不编造 | pass | 单测「SC-03 parseInsightOutput…」「SC-03 the request body…」；真实请求体不含邮箱/电话/URL |
| 04 版本与失败 | pass | Postgres「SC-04 write-back conflict」「SC-04 prompt version bump」；单测 source_data_version 相关 |
| 05 收口 | pass | `1440-review-two-confirmed.jpg`、`1440-detail-inferred-lists.jpg`、`375-detail-inferred-lists.jpg`、`detail-vm-wang.json` |

## 假设与额外阅读

- 新增纯函数模块 `features/contacts/insights/profile-inference.ts`（类型、校验、脱敏、语言、存储读写）。
- 额外阅读：`features/contacts/enrichment/apply-enrichment.ts`、`memo-extraction/{job,store}.ts`、`instant.ts`／`maintenance-task.ts`／`runtime.ts`／`regenerate.ts`、名片 v2 处理器、`scripts/seed-verify-accounts.ts`／`verify-session-cookie.ts`。
- `canWriteEnrichedValue` 第二参数可为 origin 字符串或 `{origin, via}`；只有 via 为 `memo_extraction`／`card_inference` 走完整来源判定，行业／职级／地区旧语义逐项不变。
- 英文条目上限放宽到 60 字符（提示词仍要求 40）：按 40 卡时 20 人批次 83 条丢 64 条合格条目。
- 名片备注计入输入版本（现为推测依据）。
- 部署环境（`NODE_ENV=production`）mock 生成器不产推测，避免模板文字写进真实联系人。
- impact：CRITICAL `canWriteEnrichedValue`、`applyEnrichedValues`、`readStoredEnrichment`、`withEnrichmentProvenance`（只加按来源分支，旧调用方表驱动测试锁定）；HIGH `contactInsightSourceVersion`；UNKNOWN `applyContactMemoExtraction` 已文本搜索确认。
- 本机开发库 `orbit_newui_events_20260922` 已执行 contact_insights v4（只限本机）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex P2：新推测不再产出某栏时旧 card_inference 值残留且因版本忽略推测而长期显示 | 成立 | `01ceec53`：缺席且仍为 card_inference 的栏清掉；空推测也走写回；Postgres 用例覆盖 |

## 交接

- `EnrichmentVia` 新增 `card_inference`；`EnrichmentProvenance.bilingual?: {zh[], en[]}`。
- 详情 VM `publicProfile.fieldSources?: {offering?|seeking?|topics?: EnrichmentVia}`，只在值来自联系人资料（非回退值）时出现——**W0060 用它显示「据名片推测」角标，并按决定 (a) 弱化显示推测条目**。
- provider `applyContactCardInference(contactId, actorId, values, at)`；洞察行 v4 列 `profile_inference`、`profile_apply_state`（pending／applied／skipped）、`profile_apply_attempts`；维护任务 summary 新增 `profileReplayed`。
- 成本：含推测的批次输出 token 约为纯洞察的 1.9–2.1 倍（20 人约 4.9k–7.1k），耗时 15.7–24.1 s，仍在即时路径 45 s 上限内。若线上超时，方案是把含推测批次降到 ≤10 人（未执行）。
- 目标主题渗入推测：可选 (a) 接受并 UI 弱化（已采用）／(b) 推测单独调用（调用翻倍，违背 D58）／(c) 批输入对推测隐藏目标（拆 schema，洞察质量可能下降）。用户可改选。
- 需要授权：生产迁移 `contact_insights` v4；push 与部署；存量补推测属回填，按 W0055 授权清单第 4 项。生产已设 `ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek`（2026-10-03 协调者核实）。
- 回退：revert 本分支提交；已写入推测按来源清除（只写不执行，生产需授权）：

  ```sql
  update orbit_records set payload = payload
    #- '{publicProfile,offering}' #- '{enrichment,fields,offering}'
  where collection_name = 'contacts' and payload->'enrichment'->'fields'->'offering'->>'via' = 'card_inference';
  -- seeking、topics 各一条，同形。
  ```
