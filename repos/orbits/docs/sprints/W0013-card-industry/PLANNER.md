# Sprint W0013 — 名片识别时补行业

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-11（「名片入库时由 AI 补一级／二级行业」，D5）。**单一目标:** 名片识别输出一级／二级行业（DeepSeek 与 Gemini 两条 live provider 都支持），审阅页可改，确认后写入联系人（新建与合并两条路径）；共享契约同步到 App。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：无。
**进入条件:** D5：放进现有识别调用的文本整理步骤，沿用名片识别现有计费方式、不另设累计上限；每次真实调用记录 token 用量。本 Sprint 改动共享契约 `shared/contract/business-card-batch.ts`，**必须同步 App 端**。`repos/orbits/AGENTS.md` 规定 Generator 只能改本仓库、不能读父目录，所以 App 同步由**协调者**在合并前完成：在 `repos/orbit-app` 执行 `npm run sync:contract`、`npm test`、`npm run typecheck`，把生成的契约副本作为单独提交放在同一 Sprint 分支上；未完成 App 同步前本 Sprint 不能标 completed。

## 范围与文件

- 读取：`features/acquisition/deepseek-business-card-ocr-provider.ts`（两段式，约 245–261 行文本整理）、`business-card-ocr-provider-selection.ts`（DeepSeek 优先、Gemini 兜底）、`business-card-cloud-ocr.ts`（provider 中立的提取结构，约 38 行）、Gemini 名片 provider、`business-card-ocr-validation.ts`、`business-card-ingest-v2/contract.ts`（提取结构版本常量，约 16 行）、`normalization.ts`、`worker.ts`、`shared/contract/business-card-batch.ts`（约 13 行提取 DTO）、`shared/api-schema/business-card-batch.ts`（约 21 行运行时 schema）、`app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model.ts`（约 16 行审阅字段）、`app/api/contact-drafts/business-card/batches/v2/**/handlers.ts`、`features/contacts/contact-write-contract.ts`（约 22 行确认输入）、`features/contacts/live-contact-write-service.ts`（约 109 行新建）、`features/contacts/business-card-contact-match.ts`（约 10 行 `CardContactFields`）、`card-batch-0918/card-batch-ui.tsx`、`shared/domain/industries.ts`、`docs/cross-client-contract.md`。
- 修改：上述 Web 文件（提示词与解析、provider 中立结构、DeepSeek 与 Gemini provider、校验、提取结构版本 +1、契约与 schema、审阅字段、确认输入、新建与合并写入、审阅 UI）及测试（Generator 只改 `repos/orbits`；App 端契约副本由协调者同步）。
- 新建：行业分类在提示词中的紧凑表示（从 `shared/domain/industries.ts` 生成，避免手抄）及测试；Bridge 交接条目。
- 排除：已入库联系人的历史回填；计划人脉需求匹配（W0010）；更换识别模型或新增调用；App 端界面展示行业（另登记 App Sprint）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0013-01 | 两条 live provider 的文本整理都输出一级／二级行业；解析只接受分类内且一、二级匹配的 id，分类外、不匹配或确实判断不出时为 null，其他字段不受影响；不允许任一已配置 provider 因未实现而恒为 null | DeepSeek 与 Gemini 解析单元测试（合法、分类外、二级不属于一级、缺失四例各一套） |
| SC-W0013-02 | 调用次数与改动前相同；提取结构版本升级后，旧版本 JSON（无行业字段）映射为 null，已有批次仍能打开和确认 | provider 请求次数断言 + 旧数据兼容测试 |
| SC-W0013-03 | 审阅页显示「行业」一行（一级 › 二级），可修改或清空，修改值随确认提交 | ingest-v2 view-model 测试 + card-batch-ui 组件测试 |
| SC-W0013-04 | 确认新建联系人时写入行业；合并到已有联系人时只补空的行业字段，已有行业不被覆盖 | confirm handler、live-contact-write-service、business-card-contact-match 测试（新建、合并已有、合并空三例） |
| SC-W0013-05 | 跨端契约同步且无回归；真实识别可用 | Web：名片 ingest v2、card-batch、contacts 行业测试，typecheck，一次全量基线对照；协调者在 App 执行 `sync:contract`、`npm test`、`npm run typecheck` 通过；本地真实名片一批（≥3 张）审阅页与联系人详情截图及 token 用量前后对照 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0013/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0013-card-industry` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（共享跨端契约、确认写入路径、provider 行为）。
- 开发定向集：provider 解析测试、`tests/capabilities/business-card-ingest-v2-*`、card-batch 组件测试、confirm handler 测试。
- 操作链收口集：上述 + `app-contacts-primary-industry.test.tsx`；Web typecheck；一次全量基线对照；App 契约同步三项。
- 不运行：历史数据回填。

## 失败与交接

报告写明提示词改动、两条 provider 的证据、每批 token 变化、提取结构版本变化、合并规则、协调者的 App 同步提交与结果。
