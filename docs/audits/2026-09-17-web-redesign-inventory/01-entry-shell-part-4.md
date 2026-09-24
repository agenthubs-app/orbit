| 225 | 属性 aria-label | Mock account API probes |
| 240 | 属性 aria-label | Account session guardrails |
| 241 | JSX文字 | mock only |
| 242 | JSX文字 | source-backed fixture |
| 243 | JSX文字 | require-account guard |
| 247 | 属性 title | Replacement notes stay with the account capability |
| 253 | JSX文字 | Handoff doc |
| 259 | JSX文字 | Required coverage |
| 261 | JSX文字 | Live service files, the switch mechanism, required environment values and permissions, privacy and provenance constraints, and replacement tests are documented before live auth is wired. |

## repos/orbits/features/acquisition/business-card-review-and-confirm-flow/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/business-card-review-and-confirm-flow/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 187 | OperatorReviewForm | section | Correct extracted business card fields | review-field-form |
| 328 | BusinessCardReviewAndConfirmFlowDemo | header |  | workbench-header |
| 330 | BusinessCardReviewAndConfirmFlowDemo | h1 | Business card review and confirm flow |  |
| 355 | BusinessCardReviewAndConfirmFlowDemo | section | Business card review states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 223 | field/input · OperatorReviewForm | `${field.label} correction` |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 292 | form-submit-boundary/form · ConfirmationAction | Confirm reviewed card |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 293 | button/button · ConfirmationAction | Confirm reviewed card |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 114 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/contact-drafts/demo-business-card-draft" |
| 121 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-business-card-draft/confirm" |
| 128 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/contact-drafts/demo-business-card-draft?scenario=empty" |
| 135 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-business-card-draft/confirm?scenario=pending" |
| 143 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/contact-drafts/demo-business-card-draft?scenario=failure" |
| 292 | ConfirmationAction | 路径常量 | 见调用/handler | `/api/contact-drafts/${draftId}/confirm` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 113 | 文案/数据常量 label | "Review card fields" |
| 120 | 文案/数据常量 label | "Confirm reviewed card" |
| 127 | 文案/数据常量 label | "Empty review" |
| 133 | 文案/数据常量 label | "Pending confirmation" |
| 141 | 文案/数据常量 label | "Controlled failure" |
| 159 | 属性 aria-label | Business card review evidence |
| 187 | 属性 aria-label | Correct extracted business card fields |
| 192 | JSX文字 | Read-only correction payload preview |
| 194 | JSX文字 | Original extraction stays visible beside every operator correction. The PATCH route accepts these named fields under |
| 195 | JSX文字 | reviewedFields |
| 196 | JSX文字 | and returns reviewed evidence without creating a contact. This server-rendered preview does not submit or claim that a review was saved. |
| 199 | 属性 aria-label | Per-field business card correction controls |
| 216 | JSX文字 | Original extraction |
| 219 | 属性 label | `${field.label} correction` |
| 232 | JSX文字 | Payload key |
| 232 | JSX文字 | reviewedFields. |
| 232 | JSX文字 | keeps this source-backed field inside the review boundary. |
| 237 | JSX文字 | source-backed |
| 246 | JSX文字 | Operator action required: send the displayed payload to |
| 247 | JSX文字 | PATCH /api/contact-drafts/ |
| 250 | JSX文字 | PATCH /api/contact-drafts/ |
| 261 | JSX文字 | Review draft |
| 263 | JSX文字 | for |
| 263 | JSX文字 | at |
| 268 | JSX文字 | Contact write |
| 270 | JSX文字 | contactWriteExecuted |
| 270 | JSX文字 | stays |
| 272 | JSX文字 | databaseWriteExecuted |
| 272 | JSX文字 | stays |
| 277 | JSX文字 | Providers |
| 279 | JSX文字 | OCR, AI, persistence, and notification flags stay false in this mock. |
| 288 | 属性 aria-label | Business card review confirmation action |
| 294 | JSX文字 | Confirm reviewed card |
| 329 | JSX文字 | Developer capability runtime |
| 330 | JSX文字 | Business card review and confirm flow |
| 332 | JSX文字 | Mock-first boundary for checking extracted card fields before a contact candidate can leave acquisition. No contact write runs during review. |
| 338 | 属性 title | Review extracted fields |
| 340 | JSX文字 | The OCR draft becomes useful only after a person accepts or edits the extracted fields. This mock keeps that decision separate from contact creation. |
| 355 | 属性 aria-label | Business card review states |
| 359 | 属性 title | Success state |
| 372 | 属性 title | Empty state |
| 378 | JSX文字 | Review draft |
| 379 | JSX文字 | No extracted card fields are ready for review. |
| 382 | JSX文字 | Source |
| 393 | 属性 title | Pending state |
| 405 | 属性 title | Failure state |
| 410 | JSX文字 | Error code |
| 416 | JSX文字 | Message |
| 420 | JSX文字 | Recovery |
| 430 | 属性 title | Confirm reviewed card |
| 437 | JSX文字 | Reviewed fields can produce a contact candidate, but the mock still does not write the contact record. |
| 443 | JSX文字 | Confirmed candidate |
| 448 | JSX文字 | is ready for the downstream contact service with |
| 449 | JSX文字 | contactWriteExecuted |
| 459 | JSX文字 | Confirmation evidence |
| 462 | JSX文字 | records the reviewed-card confirmation. |
| 466 | 属性 aria-label | Business card review guardrails |
| 467 | JSX文字 | human review first |
| 468 | JSX文字 | mock only |
| 469 | JSX文字 | source-backed fields |
| 476 | 属性 title | Review routes use shared envelopes |
| 481 | JSX文字 | These probes cover review, confirmation, empty, pending, and controlled failure envelopes inside the mock boundary. |
| 486 | JSX文字 | Failure mapping |
| 494 | JSX文字 | maps to a shared failure envelope. |
| 505 | JSX文字 | Expected status: |
| 512 | 属性 title | Replacement notes stay with the review capability |
| 518 | JSX文字 | Handoff doc |
| 524 | JSX文字 | Switch |
| 526 | JSX文字 | ORBIT_MODULE_MODE=live |
| 530 | 属性 aria-label | Live handoff evidence excerpts |
| 535 | JSX文字 | Live handoff evidence excerpts |
| 537 | JSX文字 | These excerpts mirror the replacement document for evaluator evidence. |
| 543 | JSX文字 | Excerpt |

## repos/orbits/features/acquisition/business-card-scan-ocr-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/business-card-scan-ocr-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 257 | BusinessCardScanOcrMockDemo | header |  | workbench-header |
| 259 | BusinessCardScanOcrMockDemo | h1 | Business card scan OCR mock |  |
| 269 | BusinessCardScanOcrMockDemo | section | Business card OCR states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 159 | form-submit-boundary/form · CardCapturePanel | Mock business card scan form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 169 | field/textarea · CardCapturePanel | Image text |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 181 | field/input · CardCapturePanel | Image name |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 188 | button/button · CardCapturePanel | Scan business card |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 212 | form-submit-boundary/form · ApiProbeActions | Run empty business card scan API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 217 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 221 | form-submit-boundary/form · ApiProbeActions | Run pending business card scan API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 226 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 230 | form-submit-boundary/form · ApiProbeActions | Run controlled failure business card scan API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 235 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 68 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/business-card/scan" |
| 75 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/demo-business-card-draft" |
| 82 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/business-card/scan?scenario=empty" |
| 88 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/business-card/scan?scenario=pending" |
| 94 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/business-card/scan?scenario=failure" |
| 160 | CardCapturePanel | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/scan" |
| 213 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/scan?scenario=empty" |
| 222 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/scan?scenario=pending" |
| 231 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/business-card/scan?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 67 | 文案/数据常量 label | "Scan business card" |
| 74 | 文案/数据常量 label | "Read extracted draft" |
| 81 | 文案/数据常量 label | "Empty image" |
| 87 | 文案/数据常量 label | "Pending OCR" |
| 93 | 文案/数据常量 label | "Controlled failure" |
| 111 | 属性 aria-label | Business card OCR evidence |
| 125 | JSX文字 | Extracted contact draft |
| 127 | JSX文字 | for |
| 127 | JSX文字 | at |
| 132 | JSX文字 | Email |
| 136 | JSX文字 | Phone |
| 140 | JSX文字 | Contact write |
| 142 | JSX文字 | contactWriteExecuted |
| 142 | JSX文字 | stays |
| 143 | JSX文字 | until explicit confirmation. |
| 153 | 属性 title | Mock input |
| 155 | JSX文字 | This mock treats the card image as a deterministic fixture or local text payload. It records capture metadata without touching a device, storage, OCR provider, model extraction, or database. |
| 159 | 属性 aria-label | Mock business card scan form |
| 165 | 属性 label | Image text |
| 177 | 属性 label | Image name |
| 189 | JSX文字 | Scan business card |
| 192 | 属性 aria-label | Business card scan guardrails |
| 193 | JSX文字 | fixture capture |
| 194 | JSX文字 | no image upload |
| 195 | JSX文字 | draft review required |
| 203 | 属性 aria-label | Business card OCR API probe actions |
| 208 | JSX文字 | Submit these probes only when collecting boundary evidence for the mock card scan routes. |
| 212 | 属性 aria-label | Run empty business card scan API probe |
| 218 | JSX文字 | Run empty probe |
| 221 | 属性 aria-label | Run pending business card scan API probe |
| 227 | JSX文字 | Run pending probe |
| 230 | 属性 aria-label | Run controlled failure business card scan API probe |
| 236 | JSX文字 | Run controlled failure probe |
| 258 | JSX文字 | Developer capability runtime |
| 259 | JSX文字 | Business card scan OCR mock |
| 261 | JSX文字 | Mock-first boundary for card image capture, OCR extraction, and an extracted contact draft before any live upload, OCR, AI, or contact write can run. |
| 269 | 属性 aria-label | Business card OCR states |
| 270 | 属性 title | Success state |
| 286 | 属性 title | Empty state |
| 292 | JSX文字 | OCR extraction |
| 296 | JSX文字 | Draft |
| 297 | JSX文字 | No extracted contact draft is staged. |
| 307 | 属性 title | Pending state |
| 313 | JSX文字 | Capture |
| 319 | JSX文字 | OCR extraction |
| 330 | 属性 title | Failure state |
| 335 | JSX文字 | Error code |
| 341 | JSX文字 | Message |
| 345 | JSX文字 | Recovery |
| 355 | 属性 title | Extracted fields stay reviewable |
| 362 | JSX文字 | Raw OCR text and extracted fields stay attached to the draft so the operator can confirm the source evidence before any live contact write. |
| 368 | JSX文字 | Raw text |
| 372 | JSX文字 | Extracted contact draft |
| 374 | JSX文字 | remains pending confirmation. |
| 382 | 属性 title | Business card scan routes use shared envelopes |
| 387 | JSX文字 | These probes cover the scan, lookup, empty, pending, and controlled failure paths without leaving the OCR mock boundary. |
| 392 | JSX文字 | Failure mapping |
| 400 | JSX文字 | maps to a shared failure envelope. |
| 405 | 属性 aria-label | Business card scan OCR API probes |
| 417 | JSX文字 | Expected status: |
| 424 | 属性 title | Replacement notes stay with the card scan capability |
| 430 | JSX文字 | Handoff doc |
| 436 | JSX文字 | Switch |
| 438 | JSX文字 | ORBIT_MODULE_MODE=live |

## repos/orbits/features/acquisition/contact-acquisition-draft-pipeline/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/contact-acquisition-draft-pipeline/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 229 | ContactAcquisitionDraftPipelineDemo | header |  | workbench-header |
| 231 | ContactAcquisitionDraftPipelineDemo | h1 | Contact acquisition draft pipeline |  |
| 260 | ContactAcquisitionDraftPipelineDemo | section | Contact acquisition draft pipeline states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 203 | form-submit-boundary/form · ConfirmationRehearsal | Confirm demo contact draft |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 208 | button/button · ConfirmationRehearsal | Confirm draft |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 53 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts" |
| 54 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/contact-drafts" |
| 61 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-draft-1/confirm" |
| 63 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/contact-drafts/demo-draft-1/confirm" |
| 71 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-draft-1/confirm, then GET /api/contact-drafts" |
| 73 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/contact-drafts/demo-draft-1/confirm && curl -s http://localhost:3000/api/contact-drafts" |
| 80 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts?scenario=empty" |
| 81 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/contact-drafts?scenario=empty" |
| 87 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts?scenario=pending" |
| 89 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/contact-drafts?scenario=pending" |
| 96 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/missing-draft/confirm" |
| 98 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/contact-drafts/missing-draft/confirm" |
| 105 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts?scenario=failure" |
| 107 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/contact-drafts?scenario=failure" |
| 204 | ConfirmationRehearsal | 路径常量 | 见调用/handler | "/api/contact-drafts/demo-draft-1/confirm" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 27 | 文案/数据常量 label | "Review source evidence" |
| 32 | 文案/数据常量 label | "Confirm the staged candidate" |
| 37 | 文案/数据常量 label | "Reload the mock queue" |
| 52 | 文案/数据常量 label | "Draft queue" |
| 60 | 文案/数据常量 label | "Confirm draft" |
| 69 | 文案/数据常量 label | "Reload after confirmation" |
| 79 | 文案/数据常量 label | "Empty queue" |
| 86 | 文案/数据常量 label | "Pending draft" |
| 95 | 文案/数据常量 label | "Missing draft" |
| 104 | 文案/数据常量 label | "Controlled failure" |
| 116 | 属性 aria-label | Contact acquisition draft evidence |
| 133 | JSX文字 | from |
| 133 | JSX文字 | is staged as |
| 134 | JSX文字 | with |
| 135 | JSX文字 | confirmation. |
| 153 | 属性 title | Confirm the draft without writing a contact |
| 160 | JSX文字 | No contact is written until confirmation, and this mock still only returns a candidate for the downstream contact service. |
| 165 | JSX文字 | Before confirmation |
| 167 | JSX文字 | remains |
| 168 | JSX文字 | with |
| 169 | JSX文字 | confirmation until an operator answers: |
| 174 | JSX文字 | Source context |
| 182 | JSX文字 | After confirmation |
| 185 | JSX文字 | is ready for the contact service while |
| 186 | JSX文字 | contactWriteExecuted |
| 186 | JSX文字 | stays |
| 187 | JSX文字 | false |
| 191 | JSX文字 | Created evidence |
| 194 | JSX文字 | records the mock confirmation boundary. |
| 198 | 属性 aria-label | Contact draft guardrails |
| 199 | JSX文字 | mock only |
| 200 | JSX文字 | operator confirmation |
| 201 | JSX文字 | source-backed candidate |
| 203 | 属性 aria-label | Confirm demo contact draft |
| 209 | JSX文字 | Confirm draft |
| 230 | JSX文字 | Developer capability runtime |
| 231 | JSX文字 | Contact acquisition draft pipeline |
| 233 | JSX文字 | Mock-first boundary for staging relationship contacts from manual notes, business-card OCR, and referrals. Drafts stay source-aware and require operator confirmation before a downstream contact write can be attempted. |
| 240 | 属性 title | Operator runbook |
| 242 | JSX文字 | Use this pass first, then drop into the detailed state cards and API probes only when a boundary needs inspection. |
| 253 | 属性 aria-label | Contact acquisition fast path |
| 254 | JSX文字 | source first |
| 255 | JSX文字 | confirm second |
| 256 | JSX文字 | no silent write |
| 260 | 属性 aria-label | Contact acquisition draft pipeline states |
| 264 | 属性 title | Success state |
| 280 | 属性 title | Empty state |
| 286 | JSX文字 | Draft queue |
| 287 | JSX文字 | No sourced contact draft exists in this scenario. |
| 290 | JSX文字 | Source |
| 301 | 属性 title | Pending state |
| 313 | 属性 title | Failure state |
| 318 | JSX文字 | Error code |
| 324 | JSX文字 | Message |
| 328 | JSX文字 | Recovery |
| 340 | 属性 title | Draft routes use shared envelopes |
| 345 | JSX文字 | Run these probes against the dev server to verify draft listing, confirmation, empty, pending, missing draft, and controlled failure envelopes inside the mock boundary. |
| 351 | JSX文字 | Draft list route |
| 353 | JSX文字 | GET /api/contact-drafts |
| 353 | JSX文字 | returns sourced drafts without creating contact records. |
| 358 | JSX文字 | Confirm route |
| 360 | JSX文字 | POST /api/contact-drafts/demo-draft-1/confirm |
| 361 | JSX文字 | returns a confirmed candidate while keeping the contact write unexecuted. |
| 366 | JSX文字 | Failure mapping |
| 374 | JSX文字 | maps to a shared failure envelope. |
| 378 | 属性 aria-label | Contact draft API probes |
| 390 | JSX文字 | Expected status: |
| 399 | 属性 title | Replacement notes stay with the acquisition capability |
| 405 | JSX文字 | Handoff doc |
| 411 | JSX文字 | Provider files |
| 414 | JSX文字 | features/acquisition/live-service.ts |
| 416 | JSX文字 | maps live storage records into the same draft list and confirmation contract as the mock service. |
| 421 | JSX文字 | Switch and env |
| 423 | JSX文字 | ORBIT_MODULE_MODE=live |
| 423 | JSX文字 | selects the live route path, backed by |
| 424 | JSX文字 | ORBIT_EVENT_DATABASE_URL |
| 424 | JSX文字 | and |
| 425 | JSX文字 | ORBIT_WORKSPACE_ID |
| 429 | JSX文字 | Privacy and tests |
| 431 | JSX文字 | Replacement tests must preserve source and evidence provenance, prove operator confirmation precedes contact writes, and keep raw service errors out of API envelopes. |
| 437 | 属性 aria-label | Live handoff evidence excerpts |
| 442 | JSX文字 | Live handoff evidence excerpts |
| 444 | JSX文字 | These excerpts mirror the replacement document so evaluator evidence can inspect concrete handoff content without opening a separate artifact. |
| 451 | JSX文字 | Excerpt |

## repos/orbits/features/acquisition/duplicate-detection-and-merge-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/duplicate-detection-and-merge-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 523 | DuplicateDetectionAndMergeMockDemo | header |  | workbench-header |
| 525 | DuplicateDetectionAndMergeMockDemo | h1 | Duplicate detection and merge mock |  |
| 537 | DuplicateDetectionAndMergeMockDemo | section | Duplicate detection and merge states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 346 | form-submit-boundary/form · DuplicateMergeReviewPanel | Mock duplicate merge apply form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 353 | field/input · DuplicateMergeReviewPanel | Reviewer |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 355 | button/button · DuplicateMergeReviewPanel | Confirm merge preview |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 380 | form-submit-boundary/form · ApiProbeActions | Run duplicate merge suggestions API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 385 | button/button · ApiProbeActions | Run suggestions probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 389 | form-submit-boundary/form · ApiProbeActions | Run duplicate merge apply API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 394 | button/button · ApiProbeActions | Run apply probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 398 | form-submit-boundary/form · ApiProbeActions | Run empty duplicate merge API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 404 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 408 | form-submit-boundary/form · ApiProbeActions | Run pending duplicate merge API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 414 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 418 | form-submit-boundary/form · ApiProbeActions | Run controlled failure duplicate merge API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 424 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 428 | form-submit-boundary/form · ApiProbeActions | Run missing suggestion duplicate merge API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 433 | button/button · ApiProbeActions | Run missing suggestion probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 84 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/merge-suggestions" |
| 92 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/merge-suggestions/demo-merge-1/apply" |
| 99 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/merge-suggestions?scenario=empty" |
| 105 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/merge-suggestions?scenario=pending" |
| 112 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/merge-suggestions?scenario=failure" |
| 120 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/merge-suggestions/demo-merge-1/apply?scenario=pending" |
| 128 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/merge-suggestions/missing-merge/apply" |
| 347 | DuplicateMergeReviewPanel | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions/demo-merge-1/apply" |
| 381 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions" |
| 390 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions/demo-merge-1/apply" |
| 399 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions" |
| 409 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions" |
| 419 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions" |
| 429 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/merge-suggestions/missing-merge/apply" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 83 | 文案/数据常量 label | "Read merge suggestions" |
| 90 | 文案/数据常量 label | "Apply reviewed merge" |
| 98 | 文案/数据常量 label | "Empty duplicate set" |
| 104 | 文案/数据常量 label | "Pending review" |
| 111 | 文案/数据常量 label | "Controlled failure" |
| 118 | 文案/数据常量 label | "Pending apply" |
| 126 | 文案/数据常量 label | "Missing suggestion" |
| 145 | 属性 aria-label | Duplicate merge evidence |
| 161 | 属性 aria-label | Duplicate match reasons |
| 182 | JSX文字 | Imported draft |
| 182 | JSX文字 | matches |
| 183 | JSX文字 | at |
| 205 | JSX文字 | destructiveMergeExecuted |
| 206 | JSX文字 | databaseWriteExecuted |
| 206 | JSX文字 | , and |
| 207 | JSX文字 | contactWriteExecuted |
| 207 | JSX文字 | remain |
| 238 | 属性 aria-label | Mock-only execution checks |
| 240 | JSX文字 | External lookup |
| 246 | JSX文字 | Model scoring |
| 252 | JSX文字 | Email calendar read |
| 258 | JSX文字 | Destructive merge |
| 264 | JSX文字 | Database writes |
| 270 | JSX文字 | Imported contact writes |
| 296 | 属性 title | Ready for verifier review |
| 302 | JSX文字 | Scan this first: imported contacts are compared to existing Orbit contacts with local fixtures, explicit confirmation, and no live merge write. |
| 306 | 属性 aria-label | Duplicate merge operator checkpoint |
| 311 | JSX文字 | Duplicate candidates |
| 312 | JSX文字 | imported candidates. |
| 315 | JSX文字 | Merge suggestions |
| 316 | JSX文字 | review suggestions. |
| 319 | JSX文字 | Mock execution |
| 321 | JSX文字 | destructive merge |
| 321 | JSX文字 | ; database writes |
| 326 | JSX文字 | Verifier note |
| 328 | JSX文字 | Browser smoke should judge API envelopes and rendered states; live dedupe, storage, notification, and merge execution stay outside this mock. |
| 340 | 属性 title | Local duplicate queue |
| 342 | JSX文字 | This boundary stages duplicate candidates from imported contact drafts and shows merge suggestions for explicit review before any live contact record changes. |
| 346 | 属性 aria-label | Mock duplicate merge apply form |
| 352 | 属性 label | Reviewer |
| 356 | JSX文字 | Confirm merge preview |
| 359 | 属性 aria-label | Duplicate merge guardrails |
| 360 | JSX文字 | source evidence |
| 361 | JSX文字 | no storage write |
| 362 | JSX文字 | confirmation required |
| 370 | 属性 aria-label | Duplicate detection merge API probe actions |
| 375 | JSX文字 | These probes exercise success, empty, pending, controlled failure, apply, and missing-suggestion paths inside the duplicate merge mock boundary. |
| 380 | 属性 aria-label | Run duplicate merge suggestions API probe |
| 386 | JSX文字 | Run suggestions probe |
| 389 | 属性 aria-label | Run duplicate merge apply API probe |
| 395 | JSX文字 | Run apply probe |
| 398 | 属性 aria-label | Run empty duplicate merge API probe |
| 405 | JSX文字 | Run empty probe |
| 408 | 属性 aria-label | Run pending duplicate merge API probe |
| 415 | JSX文字 | Run pending probe |
| 418 | 属性 aria-label | Run controlled failure duplicate merge API probe |
| 425 | JSX文字 | Run controlled failure probe |
| 428 | 属性 aria-label | Run missing suggestion duplicate merge API probe |
| 434 | JSX文字 | Run missing suggestion probe |
| 448 | 属性 title | Confirmed preview |
| 450 | JSX文字 | confirmed |
| 450 | JSX文字 | for local review. The response returns a preview and leaves all live writes false. |
| 456 | JSX文字 | Merged preview |
| 458 | JSX文字 | at |
| 463 | JSX文字 | Execution flags |
| 465 | JSX文字 | merge write |
| 465 | JSX文字 | ; destructive merge |
| 467 | JSX文字 | ; database write |
| 485 | JSX文字 | Source |
| 491 | JSX文字 | Privacy |
| 495 | JSX文字 | Generation |
| 524 | JSX文字 | Developer capability runtime |
| 525 | JSX文字 | Duplicate detection and merge mock |
| 527 | JSX文字 | Mock-first boundary for detecting duplicate imported contacts, proposing source-backed merge suggestions, and confirming a merge preview before any live destructive write exists. |
| 537 | 属性 aria-label | Duplicate detection and merge states |
| 541 | 属性 title | Success state |
| 551 | JSX文字 | Duplicate candidates |
| 553 | JSX文字 | imported contacts need review. |
| 558 | JSX文字 | Merge suggestions |
| 560 | JSX文字 | suggestions are ready. |
| 572 | 属性 title | Empty state |
| 578 | JSX文字 | Duplicate candidates |
| 579 | JSX文字 | No imported contacts match existing contacts. |
| 582 | JSX文字 | Merge suggestions |
| 583 | JSX文字 | No merge suggestions are staged. |
| 593 | 属性 title | Pending state |
| 599 | JSX文字 | Review status |
| 605 | JSX文字 | Next action |
| 616 | 属性 title | Failure state |
| 621 | JSX文字 | Error code |
| 627 | JSX文字 | Message |
| 631 | JSX文字 | Recovery |
| 642 | 属性 title | Imported contacts stay explainable |
| 647 | JSX文字 | Every candidate keeps source evidence and match reasons visible so review starts with why Orbit thinks two records are related. |
| 655 | 属性 title | No destructive write happens in the mock |
| 661 | JSX文字 | The mock sets external lookup, model scoring, email/calendar reads, notifications, database writes, and destructive merge execution to false. |
| 672 | 属性 title | Fixture source is part of the contract |
| 680 | 属性 title | Duplicate merge routes use shared envelopes |
| 685 | JSX文字 | The declared probes cover merge suggestion read and apply routes. Empty, pending, missing, and controlled failure probes document non-success states without leaving the mock boundary. |
| 691 | JSX文字 | Failure mapping |
| 699 | JSX文字 | maps to a shared failure envelope. |
| 704 | 属性 aria-label | Duplicate detection merge API probes |
| 716 | JSX文字 | Expected status: |
| 723 | 属性 title | Replacement notes stay with duplicate merge |
| 729 | JSX文字 | Handoff doc |
| 735 | JSX文字 | Switch |
| 737 | JSX文字 | ORBIT_DUPLICATE_MERGE_PROVIDER |

## repos/orbits/features/acquisition/email-and-calendar-relationship-signal-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/email-and-calendar-relationship-signal-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 437 | EmailCalendarRelationshipSignalMockDemo | header |  | workbench-header |
| 439 | EmailCalendarRelationshipSignalMockDemo | h1 | Email and calendar relationship signal mock |  |
| 451 | EmailCalendarRelationshipSignalMockDemo | section | Email calendar relationship signal states | workbench-grid |
| 608 | EmailCalendarRelationshipSignalMockDemo | h3 | Probe result matrix |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 314 | form-submit-boundary/form · SignalReviewPanel | Mock email calendar signal filter |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 321 | field/select · SignalReviewPanel | All relationship signal sources Gmail fixture Google Calendar fixture Microsoft Graph fixture |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 328 | button/button · SignalReviewPanel | Review signals |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 353 | form-submit-boundary/form · ApiProbeActions | Run email calendar signal list probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 358 | button/button · ApiProbeActions | Run list probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 362 | form-submit-boundary/form · ApiProbeActions | Run email calendar signal confirmation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 367 | button/button · ApiProbeActions | Run confirm probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 371 | form-submit-boundary/form · ApiProbeActions | Run empty email calendar signal probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 376 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 380 | form-submit-boundary/form · ApiProbeActions | Run pending email calendar signal probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 385 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 389 | form-submit-boundary/form · ApiProbeActions | Run failure email calendar signal probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 394 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 398 | form-submit-boundary/form · ApiProbeActions | Run blocked email calendar signal confirmation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 403 | button/button · ApiProbeActions | Run blocked probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 407 | form-submit-boundary/form · ApiProbeActions | Run not-found email calendar signal confirmation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 412 | button/button · ApiProbeActions | Run not-found probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 85 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/relationship-signals/email-calendar" |
| 94 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/relationship-signals/demo-calendar-signal-1/confirm" |
| 102 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/relationship-signals/email-calendar?scenario=empty" |
| 109 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/relationship-signals/email-calendar?scenario=pending" |
| 116 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/relationship-signals/email-calendar?scenario=failure" |
| 126 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/relationship-signals/demo-calendar-signal-1/confirm?scenario=blocked" |
| 135 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/relationship-signals/missing-signal/confirm" |
| 315 | SignalReviewPanel | 路径常量 | 见调用/handler | "/api/relationship-signals/email-calendar" |
| 354 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/email-calendar" |
| 363 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/demo-calendar-signal-1/confirm" |
| 372 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/email-calendar?scenario=empty" |
| 381 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/email-calendar?scenario=pending" |
| 390 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/email-calendar?scenario=failure" |
| 399 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/demo-calendar-signal-1/confirm?scenario=blocked" |
| 408 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/relationship-signals/missing-signal/confirm" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 84 | 文案/数据常量 label | "Read relationship signals" |
| 92 | 文案/数据常量 label | "Confirm calendar signal" |
| 101 | 文案/数据常量 label | "Empty signal queue" |
| 108 | 文案/数据常量 label | "Pending permission review" |
| 115 | 文案/数据常量 label | "Controlled failure" |
| 124 | 文案/数据常量 label | "Confirmation blocked" |
| 134 | 文案/数据常量 label | "Missing signal adversarial probe" |
| 155 | 属性 aria-label | Email calendar signal evidence |
| 176 | JSX文字 | at |
| 210 | 属性 aria-label | Mock-only execution checks |
| 212 | JSX文字 | Provider calls |
| 218 | JSX文字 | Message body ingestion |
| 226 | JSX文字 | Background sync |
| 232 | JSX文字 | Database writes |
| 261 | 属性 title | Ready for verifier review |
| 267 | JSX文字 | Scan this first: Gmail fixture, Google Calendar fixture, and Microsoft Graph fixture signals are metadata-only and require permission plus explicit user confirmation before conversion. |
| 271 | 属性 aria-label | Email calendar signal operator checkpoint |
| 276 | JSX文字 | Sources |
| 280 | JSX文字 | Signals available |
| 281 | JSX文字 | relationship signals. |
| 284 | JSX文字 | Review gates |
| 286 | JSX文字 | permission |
| 286 | JSX文字 | ; confirmation |
| 291 | JSX文字 | Mock execution |
| 293 | JSX文字 | message body ingestion false; background sync false; provider calls false. |
| 304 | 属性 title | Relationship signal intake |
| 310 | JSX文字 | This boundary derives relationship signals from deterministic email and calendar metadata fixtures without reading message bodies, syncing providers, writing contacts, or delivering notifications. |
| 314 | 属性 aria-label | Mock email calendar signal filter |
| 320 | 属性 label | Source |
| 322 | JSX文字 | All relationship signal sources |
| 323 | JSX文字 | Gmail fixture |
| 324 | JSX文字 | Google Calendar fixture |
| 325 | JSX文字 | Microsoft Graph fixture |
| 329 | JSX文字 | Review signals |
| 332 | 属性 aria-label | Email calendar signal guardrails |
| 333 | JSX文字 | metadata only |
| 334 | JSX文字 | permission required |
| 335 | JSX文字 | confirmation required |
| 343 | 属性 aria-label | Email calendar signal API probe actions |
| 348 | JSX文字 | These probes exercise list, confirm, empty, pending, blocked, not-found, and controlled failure paths inside the email and calendar signal mock. |
| 353 | 属性 aria-label | Run email calendar signal list probe |
| 359 | JSX文字 | Run list probe |
| 362 | 属性 aria-label | Run email calendar signal confirmation probe |
| 368 | JSX文字 | Run confirm probe |
| 371 | 属性 aria-label | Run empty email calendar signal probe |
| 377 | JSX文字 | Run empty probe |
| 380 | 属性 aria-label | Run pending email calendar signal probe |
| 386 | JSX文字 | Run pending probe |
| 389 | 属性 aria-label | Run failure email calendar signal probe |
| 395 | JSX文字 | Run failure probe |
| 398 | 属性 aria-label | Run blocked email calendar signal confirmation probe |
| 404 | JSX文字 | Run blocked probe |
| 407 | 属性 aria-label | Run not-found email calendar signal confirmation probe |
| 413 | JSX文字 | Run not-found probe |
| 438 | JSX文字 | Developer capability runtime |
| 439 | JSX文字 | Email and calendar relationship signal mock |
| 441 | JSX文字 | Mock-first boundary for turning permission-gated email and calendar metadata into relationship signals before any live Gmail, Google Calendar, Microsoft Graph, or background sync path exists. |
| 451 | 属性 aria-label | Email calendar relationship signal states |
| 455 | 属性 title | Success state |
| 465 | JSX文字 | Signals |
| 466 | JSX文字 | signals available. |
| 469 | JSX文字 | Review gates |
| 470 | JSX文字 | permission required and confirmation required. |
| 480 | 属性 title | Empty state |
| 486 | JSX文字 | Signals |
| 487 | JSX文字 | No email or calendar signals are available. |
| 490 | JSX文字 | Permission |
| 491 | JSX文字 | Mock permission has not produced reviewable rows. |
| 501 | 属性 title | Pending state |
| 507 | JSX文字 | Signal status |
| 513 | JSX文字 | Review |
| 514 | JSX文字 | Signal review waits for local fixture permission. |
| 524 | 属性 title | Failure state |
| 529 | JSX文字 | Error code |
| 535 | JSX文字 | Message |
| 539 | JSX文字 | Recovery |
| 549 | 属性 title | Relationship evidence stays inspectable |
| 556 | JSX文字 | Each signal carries source, evidence, permission, confirmation, and relationship context so review starts from why the connection exists. |
| 565 | 属性 title | No provider, sync, write, or notification runs |
| 572 | JSX文字 | The mock sets Gmail API requests, Google Calendar API requests, Microsoft Graph API requests, background sync, message body ingestion, database writes, and notifications to false. |
| 584 | 属性 title | Relationship signal routes use shared envelopes |
| 589 | JSX文字 | The declared probes cover list and confirmation routes. Empty, pending, blocked, not-found, and controlled failure probes document non-success states without leaving the mock boundary. |
| 595 | JSX文字 | Failure mapping |
| 603 | JSX文字 | maps to a shared failure envelope. |
| 608 | JSX文字 | Probe result matrix |
| 609 | 属性 aria-label | Email calendar signal API probes |
| 619 | JSX文字 | Expected status |
| 619 | JSX文字 | ; envelope success |
| 623 | JSX文字 | Expected error |
| 633 | 属性 title | Replacement boundary is documented |
| 638 | JSX文字 | The live implementation notes stay with the capability at |
| 643 | JSX文字 | Provider switch |
| 645 | JSX文字 | ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER |
| 650 | JSX文字 | Handoff |

## repos/orbits/features/acquisition/event-attendee-import-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/event-attendee-import-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 466 | EventAttendeeImportMockDemo | header |  | workbench-header |
| 468 | EventAttendeeImportMockDemo | h1 | Event attendee import mock |  |
| 480 | EventAttendeeImportMockDemo | section | Event attendee import states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 344 | form-submit-boundary/form · RosterImportPanel | Mock event attendee import form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 351 | field/input · RosterImportPanel | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 357 | field/select · RosterImportPanel | All attendee labels New potential contact Known contact Priority follow-up |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 364 | button/button · RosterImportPanel | Stage attendee drafts |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 388 | form-submit-boundary/form · ApiProbeActions | Run event attendee import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 393 | button/button · ApiProbeActions | Run import probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 397 | form-submit-boundary/form · ApiProbeActions | Run empty event attendee import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 402 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 406 | form-submit-boundary/form · ApiProbeActions | Run pending event attendee import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 411 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 415 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event attendee import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 420 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 93 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/event-attendees/import" |
| 100 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/attendees" |
| 108 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/event-attendees/import?scenario=empty" |
| 115 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/event-attendees/import?scenario=pending" |
| 122 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/event-attendees/import?scenario=failure" |
| 345 | RosterImportPanel | 路径常量 | 见调用/handler | "/api/contact-drafts/event-attendees/import" |
| 389 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/event-attendees/import" |
| 398 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/event-attendees/import?scenario=empty" |
| 407 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/event-attendees/import?scenario=pending" |
| 416 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/event-attendees/import?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 92 | 文案/数据常量 label | "Import attendee drafts" |
| 99 | 文案/数据常量 label | "Read attendee roster" |
| 106 | 文案/数据常量 label | "Empty roster import" |
| 113 | 文案/数据常量 label | "Pending roster review" |
| 120 | 文案/数据常量 label | "Controlled failure" |
| 139 | 属性 aria-label | Event attendee import evidence |
| 155 | 属性 aria-label | Relationship status labels |
| 176 | JSX文字 | at |
| 197 | JSX文字 | for |
| 197 | JSX文字 | at |
| 198 | JSX文字 | contactWriteExecuted |
| 198 | JSX文字 | and |
| 199 | JSX文字 | bulkDatabaseImportExecuted |
| 199 | JSX文字 | remain |
| 226 | 属性 aria-label | Mock-only execution checks |
| 228 | JSX文字 | Organizer feed request |
| 234 | JSX文字 | Contact writes |
| 240 | JSX文字 | Notifications |
| 246 | JSX文字 | Bulk database imports |
| 284 | 属性 title | Ready for verifier review |
| 290 | JSX文字 | Scan this first: the fixture stages event-sourced relationship drafts, keeps external execution false, and leaves every detailed state below for probe evidence. |
| 294 | 属性 aria-label | Event attendee operator checkpoint |
| 299 | JSX文字 | Event |
| 305 | JSX文字 | Drafts staged |
| 306 | JSX文字 | attendee drafts. |
| 309 | JSX文字 | Relationship labels |
| 313 | JSX文字 | Mock execution |
| 315 | JSX文字 | organizer feed |
| 315 | JSX文字 | ; contact writes |
| 316 | JSX文字 | ; notifications |
| 316 | JSX文字 | ; bulk imports |
| 321 | JSX文字 | Verifier note |
| 323 | JSX文字 | Browser smoke should judge API envelopes and rendered states; development live-reload diagnostics stay outside the mock boundary. |
| 334 | 属性 title | Local attendee import |
| 340 | JSX文字 | This boundary reads a deterministic attendee roster fixture and stages potential contact drafts without requesting organizer systems, bulk importing records, or notifying anyone. |
| 344 | 属性 aria-label | Mock event attendee import form |
| 350 | 属性 label | Event id |
| 353 | 属性 label | Status filter |
| 358 | JSX文字 | All attendee labels |
| 359 | JSX文字 | New potential contact |
| 360 | JSX文字 | Known contact |
| 361 | JSX文字 | Priority follow-up |
| 365 | JSX文字 | Stage attendee drafts |
| 368 | 属性 aria-label | Event attendee import guardrails |
| 369 | JSX文字 | fixture roster |
| 370 | JSX文字 | no organizer feed |
| 371 | JSX文字 | review before write |
| 379 | 属性 aria-label | Event attendee import API probe actions |
| 384 | JSX文字 | These probes exercise roster import, empty, pending, and controlled failure paths inside the event attendee import mock boundary. |
| 388 | 属性 aria-label | Run event attendee import API probe |
| 394 | JSX文字 | Run import probe |
| 397 | 属性 aria-label | Run empty event attendee import API probe |
| 403 | JSX文字 | Run empty probe |
| 406 | 属性 aria-label | Run pending event attendee import API probe |
| 412 | JSX文字 | Run pending probe |
| 415 | 属性 aria-label | Run controlled failure event attendee import API probe |
| 421 | JSX文字 | Run controlled failure probe |
| 467 | JSX文字 | Developer capability runtime |
