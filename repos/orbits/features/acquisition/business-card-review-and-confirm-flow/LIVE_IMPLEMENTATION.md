# Business Card Review And Confirm Flow Live Implementation

## 2026-09-07：清空字段的保存与回读

- 复核提交区分“字段未提供”与“字段明确为空”；只有未提供时才沿用原值，空字符串和纯空白输入保存为空。
- 待复核字段显示识别原值；完成复核后，包括空值在内均使用复核值。重新创建服务实例后回读、确认候选也不得恢复原始公司、职位或联系方式。
- 对尚无联系人记录的云识别草稿同样保留空公司与职位，不把内部占位文本写回复核字段。
- 演示服务的复核响应遵循同一空值规则；保留其既有无持久化的固定场景行为，不将其回读结果当作 live 存储验收。
- `business-card-review-live-store.test.ts` 新增存储回读与确认回归，复核操作保持不写入联系人。此处为内存存储验证，不代表真实账号跨端或实机验收。

## 2026-09-07：云识别草稿 HTTP 回读交接

- `GET /api/contact-drafts/:id` 将 `business-card-review:cloud:` 与 `business-card-review:live:` 两类编号交给复核服务；其余编号保留原有识别服务查询路径。此前云草稿 PATCH 保存成功后，GET 会误入识别服务并返回 404。
- App 字段映射/提交版本：`4a28e209c`；Web 复核值持久化版本：`57a36421c`。本条随云草稿 GET 修复提交，两端不需要新增或同步契约副本。
- `tests/api/business-card-review-readback.test.ts` 通过真实 HTTP handler、live 服务和内存记录存储验证 PATCH → GET，覆盖空值、独立服务实例、其他账号不可见及不创建联系人。
- 本批验证：App 全量 775 项、Web 名片相关 49 项测试通过，两端全量类型检查通过；不包含 Web 全量测试、实机或真实账号双向写入验收，未部署。
- 未完成：移动端识别风险提示/最终复核门槛、重复项处理和跨端草稿恢复入口不在本次清空/回读修复范围；不能据此标记整个名片流程已对齐。

## Live service and provider files

- Keep the public contract in `features/acquisition/business-card-review-contract.ts`.
- Keep the mock in `features/acquisition/mock-business-card-review-service.ts` for deterministic fixture coverage.
- The storage-backed live service is `features/acquisition/live-business-card-review-service.ts`.
- The live record mapper is `features/acquisition/storage/business-card-review-live-record-provider.ts`.
- Keep route ownership in `app/api/contact-drafts/[id]/route.ts` for review updates and `app/api/contact-drafts/[id]/confirm/route.ts` for confirmation.

## Switch mechanism

- `ORBIT_MODULE_MODE=live` or explicit factory mode selects the live service through `features/acquisition/service-factory.ts`.
- The default runtime stays mock-first. Live mode fails closed with `BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED` when shared live storage is absent.
- The switch must happen in the service factory layer, not inside the debug page.
- Human review stays between OCR extraction and contact creation.

## Required env vars and permissions

- Uses the same shared live storage configuration as other storage-backed capabilities: `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`, plus `ORBIT_WORKSPACE_ID`.
- The first live version reads `contacts` and `evidence` records where the contact source is `business_card_ocr`.
- It does not request device camera, OCR provider, user email, calendar, notification, AI provider, or external network permissions.

## Privacy and provenance constraints

- Every reviewed field keeps source and evidence provenance from the live business-card contact record.
- The live service must record who reviewed the fields, what changed, and which evidence ids supported the decision.
- Contact creation must stay behind explicit confirmation. Review updates and confirmation previews do not write `contacts` or `contactDrafts`.
- API envelopes must not expose raw provider errors, credentials, or unrelated relationship data.
- Field edits must preserve source and evidence provenance when the contact candidate is handed to downstream contact creation.

## Replacement tests

- `tests/capabilities/business-card-review-live-store.test.ts` covers storage mapping, review preview, confirmation preview, unconfigured live storage, factory registration, and API live-mode failure envelopes.
- `tests/capabilities/business-card-review-and-confirm-flow.test.ts` keeps the existing mock contract, API, and debug route behavior stable.
- Future provider-backed OCR tests should live with `business-card-scan-ocr`, not this review boundary.

## Live handoff evidence excerpts

- Provider adapters live under `features/acquisition/storage/business-card-review-live-record-provider.ts`.
- `ORBIT_MODULE_MODE=live` switches the review boundary from mock to live through the service factory.
- Human review stays between OCR extraction and contact creation.
- Replacement tests cover review, confirm, privacy, and debug states.
- Remote smoke against `workspace:orbit-dev` reviewed and confirmed `business-card-review:live:contact_012` for `山田 千尋` with `databaseWriteExecuted=false`; remote `contacts` stayed at 66 and `contactDrafts` stayed at 1.
