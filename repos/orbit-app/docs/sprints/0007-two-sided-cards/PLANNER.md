# Sprint 0007 — 双面名片与一次创建

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** R-07／B5。**单一目标:** 同一张卡正反面经过来源复核后只创建一个联系人。
**基线:** `fca77373f123c03e29a0584cba46bade5f5eb907`；承接 0002 的实际 REPORT。
**已有成果:** 单面导入、进度恢复、取消与重试保留；[证据第 22 节](../../verification/2026-09-13-app-connectivity.md#22-r-07双面名片契约与读取副作用)确认现协议按单图建条目，尚无同卡合并。
**进入条件:** 0002 报告已存在；2026-09-14 用户明确启动 D 线并授予本线实现权限，B5 的本地跨端契约按下述增量执行。实体 iPhone、真实 OCR、具体数据库／迁移和真实联系人写入仍按精确环境与对象验收，不阻塞无副作用的本地实现。
**运行登记:** `run-01`，2026-09-14 启动；唯一 Generator 为当前 D 线会话。

## B5 已批准契约增量

- `POST /api/contact-drafts/business-card/batches/v2` 的 manifest 项新增稳定 `cardId` 与 `side: front | back`。每卡恰有一个正面、至多一个反面；旧客户端未传这两个字段时，每个旧图片按独立单面卡兼容，禁止按相邻 `seq` 自动配对。
- 批次与 item 回执保留 `cardId`／`side`。App 在创建前明确展示每卡正面与可选反面，复核时按卡聚合两面的 OCR、图片与字段来源；姓名和公司优先保留用户选择的原语言值。
- 现有 item confirm 路径继续兼容，但服务端以该 item 的 `cardId` 锁定整卡。确认请求携带稳定 `confirmationIntentId`、两面 item/version/imageDigest 快照和字段来源；同意图重放、双击及并发只返回同一联系人，异内容或过期版本返回冲突。
- 确认事务验证所有来源属于当前 actor／batch／card，创建一次联系人，并把同卡两面原子标为同一 `confirmedContactId`。证据 ID 保留两面 item 身份；确认后两面衍生图进入既有 cleanup，复核前仍分别通过受保护图片路由读取。
- 旧单面批次继续使用原 item 路由与单面确认语义；反面跳过通过“不加入 manifest”表达。重拍只替换指定 side 并使旧 version 快照失效。

## 范围与文件

- 读取：[原计划 R-07](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md#r-07双面名片与真实导入)、[API 缺口](../../api-gaps.md#two-sided-business-cards-and-batch-read-side-effects-2026-09-13)、0002 REPORT（执行后才产生）。
- 读取：`src/api/batch-images.ts`、`src/api/contract/business-card-batch.ts`、`src/api/schema/business-card-batch.ts`；副本只能走批准的同步渠道。
- 修改白名单：`src/screens/contacts/ContactAcquisitionScreen.tsx`、`BusinessCardIngestStartScreen.tsx`、`BusinessCardIngestScreen.tsx`、`BusinessCardBatchScreen.tsx`、`BusinessCardImportScreen.tsx`（后四项均在同一目录）。
- 修改白名单：`src/components/BusinessCardBatchReviewForm.tsx`、`src/screens/contacts/business-card-pending-files.ts`、`src/view-models/business-card-ingest.ts`、`src/view-models/business-card-batch.ts`。
- Web/API 必要文件：`repos/orbits/features/acquisition/business-card-ingest-v2/{contract,migrations,repository}.ts`、`repos/orbits/app/api/contact-drafts/business-card/batches/v2/handlers.ts`、现有 confirm route 与对应 Web 测试。
- 共享契约必要文件：`repos/orbits/shared/{contract,api-schema}/business-card-batch.ts`，通过 `npm run sync:contract` 生成 App 副本；不手改生成副本。
- 测试白名单：下列命令列出的现有测试；条件性新增 `tests/business-card-two-sided-interactions.test.tsx`，用于真实路由和 HTTP 边界受控交互，当前尚不存在。
- 文档产出仅本 Sprint `REPORT.md`；原始证据在 `build/harness-state/evidence/sprint-0007/run-01/`，先确认被忽略。
- 排除：运行任何真实环境迁移、修改 OCR worker/provider、本地权威 OCR 合并、新联系人匹配算法、第三方资料抓取与批量真实导入。仅允许为上述 B5 契约新增受版本控制的本地迁移定义和 manifest 字段。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0007-01 | 正面必选、反面可跳过；两面归同一卡，冲突由用户选定，姓名／公司保留源语言；按批准策略回看图片及字段来源。 | 新交互测试：单面、双面、冲突、确认前后原图访问／过期。 |
| SC-0007-02 | 确认、双击及失败重试均只得到一个匹配的联系人回执；重复卡按服务端决定呈现，失败保留复核输入。 | 新交互测试与授权确认请求／重开回读，核对 card ID、联系人 ID 和幂等结果。 |
| SC-0007-03 | 非法 MIME／字节／大小、权限拒绝、取消与重拍有明确反馈；旧图片过期或切账号后不能继续提交旧卡。 | 现有 import／review 回归加新边界测试；实体相机拒绝权限及重拍场景。 |
| SC-0007-04 | 在已初始化环境打开真实非空批次，离开重进／后台返回后恢复正确进度；取消、重试及旧单面批次仍可使用。 | ingest／batch 交互回归与同一原生批次 GET、截图、进度记录。 |
| SC-0007-05 | 授权实体 iPhone 完成拍摄→上传→OCR→双面复核→一次创建，Web 与 App 重开读取同一个联系人及来源结果。 | 同环境非空对象的全链路记录、实际 API/App 版本和累计费用；Simulator 选图不足以关闭。 |

## 一次 Generator 的执行顺序

1. 核对进入条件及原账本，确认 GET 初始化副作用已由环境负责人处理；缺项则由协调者登记 blocked，run_count 保持 0。
2. 锁定上述文件、记录 Planner 哈希和基线；逐个待改符号做 upstream impact，HIGH／CRITICAL 先报告，不改其他 Sprint。
3. 在已发布 B5 上为 SC-01～03 补 RED，接入同卡采集／来源复核／一次确认；复用进度及取消机制。
4. 同一 Generator 运行下列必要回归和 SC 原生场景，按规则限制本地修复轮次，不追加 self_assess 或 Evaluator。
5. 每个独立功能验证后由协调者路径限定暂存、detect_changes、commit；最终写 SC→SHA→证据报告并结束。

## 最小测试与检查

- 档位：本次编制为 D；未来实施为 H，涉及业务创建、幂等、上传／账户隔离和共享契约，必须类型检查及提交前一次全量。
- 以下命令 cwd 均为 `/Users/xzhao/Projects/orbit/repos/orbit-app`，本轮仅声明、不执行。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/business-card-ingest-view-model.test.ts tests/business-card-ingest-interactions.test.ts tests/business-card-batch-view-model.test.ts tests/business-card-batch-interactions.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/business-card-import.test.ts tests/business-card-import-interactions.test.ts tests/business-card-review-interactions.test.ts tests/business-card-review-risks.test.ts tests/business-card-empty-fields.test.ts
```

- 新增测试创建后才执行：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/business-card-two-sided-interactions.test.tsx`；SC-01～03 共用该证据。
- H 最终集：`npm run typecheck`、`npm test`、`git diff --check`；B5 副本改变时另运行 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts`。 同版本全量已包含这些同步用例时直接引用结果，不再单独重跑。
- 原生／HTTP：已存在集合为 `/api/contact-drafts/business-card/batches/v2` 与 legacy `/api/contact-drafts/business-card/batches`；打开起始页会读两者，不能按方法名 GET 推定无副作用。
- OCR 沿用全局累计 $5／已记 $0.012780 账本，预留未结费用后才执行；非空样本、图片访问和真实创建都需已授权对象。
- 不运行：Lighthouse、全站旅程、Android 全量截图、无关构建；必要实体相机、真实 OCR 和跨端回读不得由单测替代。

## 失败与交接

无 B5、初始化环境或原生读取证据时分别记录依赖；GET 迁移风险不是此前读取失败的已证根因。不得用两条单图记录冒充双面完成。
运行中依赖失效或预算到限则停止相关副作用，按 RULES 结束为 blocked／failed；不自动再启动 Generator。
REPORT 记录 SC／文件／功能 SHA／命令退出码、App/API 版本、卡和联系人脱敏 ID、两端影响、费用、未提交与未验项；Bridge 仅提供交接内容给协调者。
