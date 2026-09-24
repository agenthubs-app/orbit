| 468 | JSX文字 | Event attendee import mock |
| 470 | JSX文字 | Mock-first boundary for turning event attendees into source-backed potential contact drafts with relationship status labels before any live organizer feed or bulk import path exists. |
| 480 | 属性 aria-label | Event attendee import states |
| 484 | 属性 title | Success state |
| 494 | JSX文字 | Event |
| 496 | JSX文字 | at |
| 501 | JSX文字 | Potential contact drafts |
| 502 | JSX文字 | drafts staged. |
| 512 | 属性 title | Empty state |
| 518 | JSX文字 | Attendees |
| 519 | JSX文字 | No attendees are available for review. |
| 522 | JSX文字 | Drafts |
| 523 | JSX文字 | No attendee-sourced contact drafts are staged. |
| 533 | 属性 title | Pending state |
| 539 | JSX文字 | Import status |
| 545 | JSX文字 | Drafts |
| 546 | JSX文字 | Draft staging waits for local roster review. |
| 556 | 属性 title | Failure state |
| 561 | JSX文字 | Error code |
| 567 | JSX文字 | Message |
| 571 | JSX文字 | Recovery |
| 581 | 属性 title | The roster explains who needs review |
| 588 | JSX文字 | Each attendee carries a label, rationale, source, and evidence ids so import review starts from event context instead of an anonymous contact list. |
| 598 | 属性 title | No contact write happens in the mock |
| 606 | JSX文字 | The mock sets organizer feed, external lookup, contact write, notification, and bulk database import flags to false. |
| 617 | 属性 title | Event attendee routes use shared envelopes |
| 622 | JSX文字 | The declared probes cover attendee import and attendee roster read routes. Empty and controlled failure probes document non-success product states without leaving the mock boundary. |
| 628 | JSX文字 | Failure mapping |
| 636 | JSX文字 | maps to a shared failure envelope. |
| 641 | 属性 aria-label | Event attendee import API probes |
| 653 | JSX文字 | Expected status: |
| 660 | 属性 title | Replacement notes stay with the event attendee capability |
| 666 | JSX文字 | Handoff doc |
| 672 | JSX文字 | Switch |
| 674 | JSX文字 | ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER |

## repos/orbits/features/acquisition/external-contacts-import-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/external-contacts-import-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 447 | ExternalContactsImportMockDemo | header |  | workbench-header |
| 449 | ExternalContactsImportMockDemo | h1 | External contacts import mock |  |
| 461 | ExternalContactsImportMockDemo | section | External contacts import states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 343 | form-submit-boundary/form · ExternalImportPanel | Mock external contacts import form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 350 | field/select · ExternalImportPanel | All external sources Phone contacts Google Contacts CSV upload Existing customer list |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 360 | button/button · ExternalImportPanel | Stage external drafts |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 384 | form-submit-boundary/form · ApiProbeActions | Run external contacts import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 389 | button/button · ApiProbeActions | Run import probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 393 | form-submit-boundary/form · ApiProbeActions | Run empty external contacts import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 398 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 402 | form-submit-boundary/form · ApiProbeActions | Run pending external contacts import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 407 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 411 | form-submit-boundary/form · ApiProbeActions | Run controlled failure external contacts import API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 416 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 83 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/external/import" |
| 90 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/external/candidates" |
| 97 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/external/candidates?scenario=empty" |
| 103 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/external/import?scenario=empty" |
| 109 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/external/import?scenario=pending" |
| 115 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/external/import?scenario=failure" |
| 122 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/contact-drafts/external/candidates?scenario=failure" |
| 344 | ExternalImportPanel | 路径常量 | 见调用/handler | "/api/contact-drafts/external/import" |
| 385 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/external/import" |
| 394 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/external/import?scenario=empty" |
| 403 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/external/import?scenario=pending" |
| 412 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/external/import?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 82 | 文案/数据常量 label | "Import external drafts" |
| 89 | 文案/数据常量 label | "Read external candidates" |
| 96 | 文案/数据常量 label | "Empty external candidates" |
| 102 | 文案/数据常量 label | "Empty external import" |
| 108 | 文案/数据常量 label | "Pending external import" |
| 114 | 文案/数据常量 label | "Controlled failure" |
| 121 | 文案/数据常量 label | "Controlled candidate failure" |
| 140 | 属性 aria-label | External contacts import evidence |
| 156 | 属性 aria-label | Source coverage |
| 177 | JSX文字 | at |
| 197 | JSX文字 | from |
| 198 | JSX文字 | contactWriteExecuted |
| 199 | JSX文字 | providerSyncRequested |
| 199 | JSX文字 | , and |
| 200 | JSX文字 | productionImportJobEnqueued |
| 200 | JSX文字 | remain |
| 227 | 属性 aria-label | Mock-only execution checks |
| 229 | JSX文字 | Phone address book read |
| 235 | JSX文字 | Google Contacts sync |
| 241 | JSX文字 | CSV scale parse |
| 247 | JSX文字 | Customer-list job |
| 253 | JSX文字 | Contact writes |
| 259 | JSX文字 | Production jobs |
| 291 | 属性 title | Ready for verifier review |
| 297 | JSX文字 | Scan this first: the fixture covers phone, Google Contacts, CSV, and customer-list candidates while every live execution flag remains false. |
| 300 | 属性 aria-label | External contacts operator checkpoint |
| 305 | JSX文字 | Sources |
| 309 | JSX文字 | Drafts staged |
| 310 | JSX文字 | external drafts. |
| 313 | JSX文字 | Mock execution |
| 315 | JSX文字 | provider sync |
| 315 | JSX文字 | ; contact writes |
| 315 | JSX文字 | ; production jobs |
| 320 | JSX文字 | Verifier note |
| 322 | JSX文字 | Browser smoke should judge API envelopes and rendered states; device, provider, parser, and job execution stay outside the mock. |
| 333 | 属性 title | Local external import |
| 339 | JSX文字 | This boundary reads deterministic source fixtures and stages potential contact drafts without reading a device address book, syncing a provider, parsing large files, or starting a production import job. |
| 343 | 属性 aria-label | Mock external contacts import form |
| 349 | 属性 label | Source |
| 351 | JSX文字 | All external sources |
| 352 | JSX文字 | Phone contacts |
| 353 | JSX文字 | Google Contacts |
| 354 | JSX文字 | CSV upload |
| 356 | JSX文字 | Existing customer list |
| 361 | JSX文字 | Stage external drafts |
| 364 | 属性 aria-label | External contacts import guardrails |
| 365 | JSX文字 | fixture sources |
| 366 | JSX文字 | no provider sync |
| 367 | JSX文字 | review before write |
| 375 | 属性 aria-label | External contacts import API probe actions |
| 380 | JSX文字 | These probes exercise candidates, import, empty, pending, and controlled failure paths inside the external contacts import mock boundary. |
| 384 | 属性 aria-label | Run external contacts import API probe |
| 390 | JSX文字 | Run import probe |
| 393 | 属性 aria-label | Run empty external contacts import API probe |
| 399 | JSX文字 | Run empty probe |
| 402 | 属性 aria-label | Run pending external contacts import API probe |
| 408 | JSX文字 | Run pending probe |
| 411 | 属性 aria-label | Run controlled failure external contacts import API probe |
| 417 | JSX文字 | Run controlled failure probe |
| 448 | JSX文字 | Developer capability runtime |
| 449 | JSX文字 | External contacts import mock |
| 451 | JSX文字 | Mock-first boundary for turning phone, Google Contacts, CSV, and existing customer-list candidates into source-backed contact drafts before any live provider or production import path exists. |
| 461 | 属性 aria-label | External contacts import states |
| 465 | 属性 title | Success state |
| 475 | JSX文字 | Sources |
| 476 | JSX文字 | sources represented. |
| 479 | JSX文字 | Potential contact drafts |
| 480 | JSX文字 | drafts staged. |
| 490 | 属性 title | Empty state |
| 496 | JSX文字 | Candidates |
| 497 | JSX文字 | No external contacts are available for review. |
| 500 | JSX文字 | Drafts |
| 501 | JSX文字 | No external contact drafts are staged. |
| 511 | 属性 title | Pending state |
| 517 | JSX文字 | Import status |
| 523 | JSX文字 | Drafts |
| 524 | JSX文字 | Draft staging waits for local source review. |
| 534 | 属性 title | Failure state |
| 539 | JSX文字 | Error code |
| 545 | JSX文字 | Message |
| 549 | JSX文字 | Recovery |
| 559 | 属性 title | External sources remain explainable |
| 566 | JSX文字 | Each candidate carries source, evidence, and relationship context so import review starts from why the connection exists. |
| 575 | 属性 title | No contact write happens in the mock |
| 583 | JSX文字 | The mock sets provider sync, phone reads, CSV scale parsing, customer-list jobs, contact writes, notifications, and database writes to false. |
| 595 | 属性 title | External contact routes use shared envelopes |
| 600 | JSX文字 | The declared probes cover external import and candidate read routes. Empty and controlled failure probes document non-success product states without leaving the mock boundary. |
| 606 | JSX文字 | Failure mapping |
| 614 | JSX文字 | maps to a shared failure envelope. |
| 619 | 属性 aria-label | External contacts import API probes |
| 631 | JSX文字 | Expected status: |
| 638 | 属性 title | Replacement notes stay with the external import capability |
| 644 | JSX文字 | Handoff doc |
| 650 | JSX文字 | Switch |
| 652 | JSX文字 | ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER |

## repos/orbits/features/acquisition/manual-contact-creation-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/manual-contact-creation-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 337 | ManualContactCreationMockDemo | header |  | workbench-header |
| 339 | ManualContactCreationMockDemo | h1 | Manual contact creation mock |  |
| 356 | ManualContactCreationMockDemo | section | Manual contact creation states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 216 | form-submit-boundary/form · ManualNoteIntake | Mock manual contact creation form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 226 | field/input · ManualNoteIntake | Source |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 234 | field/textarea · ManualNoteIntake | Note |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 237 | field/input · ManualNoteIntake | Tags |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 243 | field/input · ManualNoteIntake | Follow-up hint |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 250 | button/button · ManualNoteIntake | Stage manual draft |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 274 | form-submit-boundary/form · ApiProbeActions | Run empty manual contact API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 279 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 283 | form-submit-boundary/form · ApiProbeActions | Run validation manual contact API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 289 | button/button · ApiProbeActions | Run validation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 293 | form-submit-boundary/form · ApiProbeActions | Run controlled failure manual contact API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 298 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 302 | form-submit-boundary/form · ApiProbeActions | Run blocked confirmation manual contact API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 307 | button/button · ApiProbeActions | Run blocked confirmation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 461 | form-submit-boundary/form · ManualContactCreationMockDemo | Confirm manual contact draft |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 466 | button/button · ManualContactCreationMockDemo | Confirm manual draft |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 29 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/manual" |
| 36 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-manual-draft/confirm" |
| 44 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-manual-draft/confirm?scenario=blocked" |
| 51 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/manual?scenario=empty" |
| 57 | (module / render callback) | 路径常量 | 见调用/handler | 'POST /api/contact-drafts/manual {"note":""}' |
| 64 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/manual?scenario=failure" |
| 217 | ManualNoteIntake | 路径常量 | 见调用/handler | "/api/contact-drafts/manual" |
| 275 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/manual?scenario=empty" |
| 284 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/manual" |
| 294 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/manual?scenario=failure" |
| 303 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/demo-manual-draft/confirm?scenario=blocked" |
| 462 | ManualContactCreationMockDemo | 路径常量 | 见调用/handler | "/api/contact-drafts/demo-manual-draft/confirm" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 28 | 文案/数据常量 label | "Create manual draft" |
| 35 | 文案/数据常量 label | "Confirm manual draft" |
| 42 | 文案/数据常量 label | "Blocked confirmation" |
| 50 | 文案/数据常量 label | "Empty manual note" |
| 56 | 文案/数据常量 label | "Validation guard" |
| 63 | 文案/数据常量 label | "Controlled failure" |
| 73 | 文案/数据常量 label | "Read the manual note evidence" |
| 78 | 文案/数据常量 label | "Confirm only after duplicate review" |
| 83 | 文案/数据常量 label | "Use probe paths for failure evidence" |
| 98 | 属性 aria-label | Manual contact evidence |
| 112 | JSX文字 | Draft |
| 114 | JSX文字 | for |
| 114 | JSX文字 | at |
| 119 | JSX文字 | Manual note |
| 123 | JSX文字 | Tags |
| 127 | JSX文字 | Follow-up hint |
| 131 | JSX文字 | Duplicate lookup |
| 133 | JSX文字 | mock-rule duplicate check |
| 133 | JSX文字 | returns |
| 134 | JSX文字 | ; external lookup stays false in the manual mock. |
| 150 | 属性 title | Manual contact operator runbook |
| 155 | 属性 aria-label | Manual contact current state and next action |
| 160 | JSX文字 | Current state |
| 162 | JSX文字 | is staged from |
| 162 | JSX文字 | ; no contact write or live duplicate lookup has run. |
| 167 | JSX文字 | Next action |
| 169 | JSX文字 | Review source evidence, then confirm the staged draft. Service next action: |
| 174 | JSX文字 | Primary operator action |
| 175 | JSX文字 | Confirm pending draft before any contact write. |
| 178 | JSX文字 | Controlled paths stay separate |
| 180 | JSX文字 | Empty, validation, and failure probes are below for verification; they are not the default operator path. |
| 185 | 属性 aria-label | Manual contact operator runbook steps |
| 196 | 属性 aria-label | Manual contact runtime status |
| 197 | JSX文字 | pending confirmation |
| 198 | JSX文字 | source evidence attached |
| 199 | JSX文字 | no live write |
| 207 | 属性 title | Source ledger |
| 213 | JSX文字 | This mock captures the CONTACT_DRAFT_CREATION path as a local draft with source evidence before any relationship record can be written. |
| 216 | 属性 aria-label | Mock manual contact creation form |
| 222 | 属性 label | Source |
| 233 | 属性 label | Note |
| 236 | 属性 label | Tags |
| 239 | 属性 label | Follow-up hint |
| 251 | JSX文字 | Stage manual draft |
| 254 | 属性 aria-label | Manual contact guardrails |
| 255 | JSX文字 | source evidence |
| 256 | JSX文字 | explicit confirmation |
| 257 | JSX文字 | mock only |
| 265 | 属性 aria-label | Manual contact adversarial API probe actions |
| 270 | JSX文字 | Browser-submit these POST probes to collect real envelopes from the Next route handlers. |
| 274 | 属性 aria-label | Run empty manual contact API probe |
| 280 | JSX文字 | Run empty probe |
| 283 | 属性 aria-label | Run validation manual contact API probe |
| 290 | JSX文字 | Run validation probe |
| 293 | 属性 aria-label | Run controlled failure manual contact API probe |
| 299 | JSX文字 | Run controlled failure probe |
| 302 | 属性 aria-label | Run blocked confirmation manual contact API probe |
| 308 | JSX文字 | Run blocked confirmation probe |
| 338 | JSX文字 | Developer capability runtime |
| 339 | JSX文字 | Manual contact creation mock |
| 341 | JSX文字 | Mock-first boundary for turning an operator&apos;s manual source note into a typed contact draft with tags, follow-up guidance, provenance, and explicit confirmation before any live write. |
| 356 | 属性 aria-label | Manual contact creation states |
| 360 | 属性 title | Success state |
| 376 | 属性 title | Empty state |
| 382 | JSX文字 | Draft |
| 383 | JSX文字 | No manual contact draft is staged. |
| 386 | JSX文字 | Source |
| 397 | 属性 title | Pending state |
| 409 | 属性 title | Failure state |
| 414 | JSX文字 | Error code |
| 420 | JSX文字 | Message |
| 424 | JSX文字 | Recovery |
| 434 | 属性 title | Confirm without writing a contact |
| 441 | JSX文字 | Confirmation returns a candidate for the future contact service. The mock keeps |
| 442 | JSX文字 | contactWriteExecuted |
| 442 | JSX文字 | and |
| 443 | JSX文字 | duplicateLookupExecuted |
| 443 | JSX文字 | false. |
| 447 | JSX文字 | Candidate |
| 450 | JSX文字 | is ready after evidence review. |
| 454 | JSX文字 | Created evidence |
| 457 | JSX文字 | records the mock confirmation. |
| 461 | 属性 aria-label | Confirm manual contact draft |
| 467 | JSX文字 | Confirm manual draft |
| 474 | 属性 title | Manual contact routes use shared envelopes |
| 479 | JSX文字 | These probes cover the creation, confirmation, empty, validation, blocked confirmation, and controlled failure paths without leaving the manual mock boundary. |
| 485 | JSX文字 | Creation failure mapping |
| 493 | JSX文字 | maps to a shared failure envelope. |
| 498 | 属性 aria-label | Manual contact API probes |
| 510 | JSX文字 | Expected status: |
| 517 | 属性 title | Replacement notes stay with the manual capability |
| 523 | JSX文字 | Handoff doc |
| 529 | JSX文字 | Live provider files |
| 532 | JSX文字 | features/acquisition/live-manual-service.ts |
| 534 | JSX文字 | stages manual notes into the shared contact draft queue while keeping contact writes disabled. |
| 539 | JSX文字 | Switch and env |
| 541 | JSX文字 | ORBIT_MODULE_MODE=live |
| 541 | JSX文字 | selects live storage through |
| 542 | JSX文字 | ORBIT_EVENT_DATABASE_URL |
| 542 | JSX文字 | and |
| 543 | JSX文字 | ORBIT_WORKSPACE_ID |
| 547 | 属性 aria-label | Manual contact live handoff evidence excerpts |
| 552 | JSX文字 | Live handoff evidence excerpts |
| 554 | JSX文字 | These excerpts mirror the replacement document for evaluator checks. |
| 560 | JSX文字 | Excerpt |

## repos/orbits/features/acquisition/qr-scan-connect-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/qr-scan-connect-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 290 | QrScanConnectMockDemo | header |  | workbench-header |
| 292 | QrScanConnectMockDemo | h1 | QR scan connect mock |  |
| 302 | QrScanConnectMockDemo | section | QR scan connect states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 188 | form-submit-boundary/form · QrScanPanel | Mock QR scan form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 198 | field/textarea · QrScanPanel | QR payload |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 207 | field/input · QrScanPanel | Scan label |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 214 | button/button · QrScanPanel | Scan QR |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 235 | form-submit-boundary/form · ApiProbeActions | Run confirm QR draft API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 240 | button/button · ApiProbeActions | Run confirm probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 244 | form-submit-boundary/form · ApiProbeActions | Run empty QR scan API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 249 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 253 | form-submit-boundary/form · ApiProbeActions | Run pending QR scan API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 258 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 262 | form-submit-boundary/form · ApiProbeActions | Run controlled failure QR scan API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 267 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 68 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/qr/scan" |
| 75 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/demo-qr-draft/confirm" |
| 82 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/qr/scan?scenario=empty" |
| 88 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/qr/scan?scenario=pending" |
| 94 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/qr/scan?scenario=failure" |
| 189 | QrScanPanel | 路径常量 | 见调用/handler | "/api/contact-drafts/qr/scan" |
| 236 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/demo-qr-draft/confirm" |
| 245 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/qr/scan?scenario=empty" |
| 254 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/qr/scan?scenario=pending" |
| 263 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/qr/scan?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 67 | 文案/数据常量 label | "Scan relationship QR" |
| 74 | 文案/数据常量 label | "Confirm QR draft" |
| 81 | 文案/数据常量 label | "Empty QR" |
| 87 | 文案/数据常量 label | "Pending QR validation" |
| 93 | 文案/数据常量 label | "Controlled failure" |
| 111 | 属性 aria-label | QR scan evidence |
| 129 | JSX文字 | Mutual connection context |
| 131 | JSX文字 | via |
| 135 | JSX文字 | Mutuals |
| 139 | JSX文字 | Topics |
| 143 | JSX文字 | Graph lookup |
| 145 | JSX文字 | externalGraphLookupExecuted |
| 145 | JSX文字 | stays |
| 157 | JSX文字 | Connection draft |
| 159 | JSX文字 | for |
| 159 | JSX文字 | at |
| 164 | JSX文字 | Source |
| 168 | JSX文字 | Writes |
| 170 | JSX文字 | contactWriteExecuted |
| 170 | JSX文字 | and |
| 171 | JSX文字 | connectionWriteExecuted |
| 171 | JSX文字 | remain |
| 181 | 属性 title | Mock input |
| 183 | JSX文字 | This boundary treats the QR frame as a deterministic fixture or local text payload. It records scan metadata without touching camera hardware, QR decoder providers, signature verification, external graphs, persistence, AI, email, calendar, or notifications. |
| 188 | 属性 aria-label | Mock QR scan form |
| 194 | 属性 label | QR payload |
| 206 | 属性 label | Scan label |
| 215 | JSX文字 | Scan QR |
| 218 | 属性 aria-label | QR scan guardrails |
| 219 | JSX文字 | fixture QR |
| 220 | JSX文字 | no camera access |
| 221 | JSX文字 | draft confirmation required |
| 229 | 属性 aria-label | QR scan API probe actions |
| 231 | JSX文字 | Submit these probes only when collecting boundary evidence for the mock QR scan connect routes. |
| 235 | 属性 aria-label | Run confirm QR draft API probe |
| 241 | JSX文字 | Run confirm probe |
| 244 | 属性 aria-label | Run empty QR scan API probe |
| 250 | JSX文字 | Run empty probe |
| 253 | 属性 aria-label | Run pending QR scan API probe |
| 259 | JSX文字 | Run pending probe |
| 262 | 属性 aria-label | Run controlled failure QR scan API probe |
| 268 | JSX文字 | Run controlled failure probe |
| 291 | JSX文字 | Developer capability runtime |
| 292 | JSX文字 | QR scan connect mock |
| 294 | JSX文字 | Mock-first boundary for scanning a relationship QR, preserving mutual context, and staging a source-backed connection draft before any live camera, validation, or write path exists. |
| 302 | 属性 aria-label | QR scan connect states |
| 303 | 属性 title | Success state |
| 319 | 属性 title | Empty state |
| 325 | JSX文字 | Mutual context |
| 326 | JSX文字 | No mutual connection context is staged. |
| 329 | JSX文字 | Draft |
| 330 | JSX文字 | No QR connection draft is staged. |
| 340 | 属性 title | Pending state |
| 346 | JSX文字 | Scan |
| 352 | JSX文字 | Draft |
| 353 | JSX文字 | Confirmation is unavailable until validation resolves. |
| 363 | 属性 title | Failure state |
| 368 | JSX文字 | Error code |
| 374 | JSX文字 | Message |
| 378 | JSX文字 | Recovery |
| 388 | 属性 title | The scan explains why the connection exists |
| 395 | JSX文字 | QR payload context stays attached to the draft so the future relationship record can explain the event, mutual contacts, and next action. |
| 404 | 属性 title | QR scan routes use shared envelopes |
| 409 | JSX文字 | These probes cover scan, confirm, empty, pending, and controlled failure paths without leaving the QR scan connect mock boundary. |
| 414 | JSX文字 | Failure mapping |
| 422 | JSX文字 | maps to a shared failure envelope. |
| 427 | 属性 aria-label | QR scan API probes |
| 436 | JSX文字 | Expected status: |
| 443 | 属性 title | Replacement notes stay with the QR scan capability |
| 449 | JSX文字 | Handoff doc |
| 455 | JSX文字 | Switch |
| 457 | JSX文字 | ORBIT_MODULE_MODE=live |

## repos/orbits/features/acquisition/referral-and-recommended-contact-confirm-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/acquisition/referral-and-recommended-contact-confirm-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 488 | ReferralRecommendationMockDemo | header |  | workbench-header |
| 490 | ReferralRecommendationMockDemo | h1 | Referral and recommended contact confirm mock |  |
| 503 | ReferralRecommendationMockDemo | section | Referral recommendation states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 359 | form-submit-boundary/form · ReferralInputPanel | Mock referral recommendation form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 366 | field/select · ReferralInputPanel | All referral sources Founder referral fixture Investor intro fixture Community referral fixture |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 373 | button/button · ReferralInputPanel | Stage referral drafts |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 400 | form-submit-boundary/form · ApiProbeActions | Run referral recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 405 | button/button · ApiProbeActions | Run referral probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 409 | form-submit-boundary/form · ApiProbeActions | Run empty referral recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 414 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 418 | form-submit-boundary/form · ApiProbeActions | Run pending referral recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 423 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 427 | form-submit-boundary/form · ApiProbeActions | Run controlled failure referral recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 432 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 436 | form-submit-boundary/form · ApiProbeActions | Run blocked recommended contact confirmation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 441 | button/button · ApiProbeActions | Run blocked probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 445 | form-submit-boundary/form · ApiProbeActions | Run missing recommended contact confirmation probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 450 | button/button · ApiProbeActions | Run not-found probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 654 | form-submit-boundary/form · ReferralRecommendationMockDemo | Confirm mock recommended contact demo-recommendation-1 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 665 | button/button · ReferralRecommendationMockDemo | Confirm recommended contact |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 83 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/referral" |
| 91 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/recommended/demo-recommendation-1/confirm" |
| 98 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/referral?scenario=empty" |
| 105 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/referral?scenario=pending" |
| 112 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/referral?scenario=failure" |
| 120 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/recommended/demo-recommendation-1/confirm?scenario=blocked" |
| 128 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/contact-drafts/recommended/missing-recommendation/confirm" |
| 360 | ReferralInputPanel | 路径常量 | 见调用/handler | "/api/contact-drafts/referral" |
| 401 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/referral" |
| 410 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/referral?scenario=empty" |
| 419 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/referral?scenario=pending" |
| 428 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/referral?scenario=failure" |
| 437 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/recommended/demo-recommendation-1/confirm?scenario=blocked" |
| 446 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/contact-drafts/recommended/missing-recommendation/confirm" |
| 655 | ReferralRecommendationMockDemo | 路径常量 | 见调用/handler | "/api/contact-drafts/recommended/demo-recommendation-1/confirm" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 82 | 文案/数据常量 label | "Create referral drafts" |
| 89 | 文案/数据常量 label | "Confirm recommended contact" |
| 97 | 文案/数据常量 label | "Empty referral source" |
| 104 | 文案/数据常量 label | "Pending recommender review" |
| 111 | 文案/数据常量 label | "Controlled failure" |
| 118 | 文案/数据常量 label | "Blocked confirmation" |
| 126 | 文案/数据常量 label | "Missing recommendation adversarial probe" |
| 145 | 属性 aria-label | Referral recommendation evidence |
| 161 | 属性 aria-label | Referral source coverage |
| 182 | JSX文字 | at |
| 183 | JSX文字 | supplied |
| 184 | JSX文字 | context. |
| 203 | JSX文字 | from |
| 204 | JSX文字 | Recommender: |
| 205 | JSX文字 | contactWriteExecuted |
| 206 | JSX文字 | externalActionExecuted |
| 206 | JSX文字 | , and |
| 207 | JSX文字 | databaseWriteExecuted |
| 207 | JSX文字 | remain |
| 234 | 属性 aria-label | Mock referral execution checks |
| 239 | JSX文字 | Graph discovery |
| 241 | JSX文字 | multi-hop graph |
| 248 | JSX文字 | Automatic outreach |
| 250 | JSX文字 | automatic outreach |
| 257 | JSX文字 | Provider calls |
| 259 | JSX文字 | provider calls |
| 264 | JSX文字 | Contact writes |
| 270 | JSX文字 | External actions |
| 276 | JSX文字 | Notifications |
| 306 | 属性 title | Ready for verifier review |
| 312 | JSX文字 | Scan this first: referral sources, recommender context, and recommended contacts are deterministic fixture records. User confirmation is shown, but live discovery and outreach stay false. |
| 316 | 属性 aria-label | Referral recommendation operator checkpoint |
| 321 | JSX文字 | Referral sources |
| 325 | JSX文字 | Recommended contacts |
| 326 | JSX文字 | contacts ready for review. |
| 329 | JSX文字 | Mock execution |
| 331 | JSX文字 | multi-hop graph |
| 331 | JSX文字 | ; automatic outreach |
| 331 | JSX文字 | ; provider calls |
| 336 | JSX文字 | Confirmation |
| 338 | JSX文字 | Every recommended contact stays pending until the operator confirms it; no contact write or outbound intro runs here. |
| 349 | 属性 title | Local referral recommendation |
| 355 | JSX文字 | This boundary turns explicit recommender fixture context into recommended contact drafts without discovering a larger graph or sending friend-of-friend outreach. |
| 359 | 属性 aria-label | Mock referral recommendation form |
| 365 | 属性 label | Referral source |
| 367 | JSX文字 | All referral sources |
| 368 | JSX文字 | Founder referral fixture |
| 369 | JSX文字 | Investor intro fixture |
| 370 | JSX文字 | Community referral fixture |
| 374 | JSX文字 | Stage referral drafts |
| 377 | 属性 aria-label | Referral recommendation guardrails |
| 381 | JSX文字 | recommender context |
| 382 | JSX文字 | no graph discovery |
| 383 | JSX文字 | user confirmation required |
| 391 | 属性 aria-label | Referral recommendation API probe actions |
| 396 | JSX文字 | These probes exercise draft creation, recommended contact confirmation, empty, pending, blocked, not-found, and controlled failure paths. |
| 400 | 属性 aria-label | Run referral recommendation API probe |
| 406 | JSX文字 | Run referral probe |
| 409 | 属性 aria-label | Run empty referral recommendation API probe |
| 415 | JSX文字 | Run empty probe |
| 418 | 属性 aria-label | Run pending referral recommendation API probe |
| 424 | JSX文字 | Run pending probe |
| 427 | 属性 aria-label | Run controlled failure referral recommendation API probe |
| 433 | JSX文字 | Run controlled failure probe |
| 436 | 属性 aria-label | Run blocked recommended contact confirmation probe |
| 442 | JSX文字 | Run blocked probe |
| 445 | 属性 aria-label | Run missing recommended contact confirmation probe |
| 451 | JSX文字 | Run not-found probe |
| 489 | JSX文字 | Developer capability runtime |
| 490 | JSX文字 | Referral and recommended contact confirm mock |
| 492 | JSX文字 | Mock-first boundary for explicit referral sources, recommender context, recommended contacts, and user confirmation before any live graph discovery, outreach, persistence, provider, or AI path exists. |
| 503 | 属性 aria-label | Referral recommendation states |
| 507 | 属性 title | Success state |
| 517 | JSX文字 | Referral sources |
| 519 | JSX文字 | sources represented. |
| 523 | JSX文字 | Recommended contacts |
| 525 | JSX文字 | contacts ready. |
| 529 | JSX文字 | Drafts staged |
| 530 | JSX文字 | drafts staged. |
| 540 | 属性 title | Empty state |
| 546 | JSX文字 | Recommendations |
| 547 | JSX文字 | No recommended contacts are available for review. |
| 550 | JSX文字 | Drafts |
| 551 | JSX文字 | No referral contact drafts are staged. |
| 561 | 属性 title | Pending state |
| 567 | JSX文字 | Referral status |
| 573 | JSX文字 | Drafts |
| 574 | JSX文字 | Draft staging waits for local recommender review. |
| 584 | 属性 title | Failure state |
| 589 | JSX文字 | Error code |
| 595 | JSX文字 | Message |
| 599 | JSX文字 | Recovery |
| 609 | 属性 title | Recommendations explain why the contact exists |
| 616 | JSX文字 | Each recommendation carries source, evidence, recommender context, warm path, and suggested next action. |
| 627 | 属性 title | No contact write happens in the mock |
| 635 | JSX文字 | The mock sets graph discovery, automatic outreach, provider calls, device contacts, calendar reads, email reads, contact writes, database writes, AI, and notifications to false. |
| 647 | 属性 title | User-confirmed recommended contact |
| 654 | 属性 aria-label | Confirm mock recommended contact demo-recommendation-1 |
| 666 | JSX文字 | Confirm recommended contact |
| 669 | JSX文字 | Confirmation returns the mock envelope only; contact writes, external outreach, database writes, and notifications remain false. |
| 676 | JSX文字 | Confirmed contact |
| 678 | JSX文字 | from |
| 680 | JSX文字 | 's referral. |
| 684 | JSX文字 | Envelope success |
| 685 | JSX文字 | envelope success true |
| 688 | JSX文字 | Mock writes |
| 690 | JSX文字 | contact writes |
| 691 | JSX文字 | ; external actions |
| 705 | JSX文字 | Blocked confirmation |
| 707 | JSX文字 | returns envelope success false. |
| 712 | JSX文字 | Missing recommendation adversarial probe |
| 714 | JSX文字 | returns envelope success false. |
| 722 | 属性 title | Referral routes use shared envelopes |
| 727 | JSX文字 | The declared probes cover referral draft creation and recommended contact confirmation. Empty, pending, blocked, not-found, and controlled failure probes document non-success states inside the mock boundary. |
| 734 | JSX文字 | Failure mapping |
| 742 | JSX文字 | maps to a shared failure envelope. |
| 746 | JSX文字 | Confirmation guard |
| 754 | JSX文字 | documents the explicit user confirmation requirement. |
| 759 | 属性 aria-label | Referral recommendation API probes |
| 771 | JSX文字 | Expected status: |
| 778 | 属性 title | Replacement notes stay with the referral capability |
| 784 | JSX文字 | Handoff doc |
| 790 | JSX文字 | Switch |
| 792 | JSX文字 | ORBIT_MODULE_MODE=live |

## repos/orbits/features/analysis/relationship-value-scoring-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/analysis/relationship-value-scoring-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 203 | EvidenceList | h3 | item.label | relationship-name |
| 384 | RecomputeResponsePreviews | details |  |  |
| 385 | RecomputeResponsePreviews | summary | View success response object |  |
| 408 | RecomputeResponsePreviews | details |  |  |
| 409 | RecomputeResponsePreviews | summary | View failure response object |  |
| 566 | RelationshipValueScoringMockDemo | header |  | workbench-header |
| 568 | RelationshipValueScoringMockDemo | h1 | Relationship value scoring mock |  |
| 580 | RelationshipValueScoringMockDemo | section | Relationship value scoring states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 311 | form-submit-boundary/form · RecomputePanel | Mock relationship value recompute form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 318 | field/input · RecomputePanel | Connection id |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 324 | field/textarea · RecomputePanel | Evidence ids |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 330 | button/button · RecomputePanel | Preview recompute |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 385 | disclosure/summary · RecomputeResponsePreviews | View success response object |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 409 | disclosure/summary · RecomputeResponsePreviews | View failure response object |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 428 | form-submit-boundary/form · ApiProbeActions | Run relationship value read probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 432 | button/button · ApiProbeActions | Run read probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 436 | form-submit-boundary/form · ApiProbeActions | Run relationship value recompute success probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 441 | button/button · ApiProbeActions | Run recompute success probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 445 | form-submit-boundary/form · ApiProbeActions | Run relationship value empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 450 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 454 | form-submit-boundary/form · ApiProbeActions | Run relationship value controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 458 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 130 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/analysis/relationship-value/demo-connection-1" |
| 137 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/analysis/relationship-value/recompute" |
| 145 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/analysis/relationship-value/demo-connection-1?scenario=empty" |
| 152 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/analysis/relationship-value/demo-connection-1?scenario=pending" |
| 160 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/analysis/relationship-value/demo-connection-1?scenario=failure" |
| 312 | RecomputePanel | 路径常量 | 见调用/handler | "/api/analysis/relationship-value/recompute" |
| 429 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/analysis/relationship-value/demo-connection-1" |
| 437 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/analysis/relationship-value/recompute" |
| 446 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/analysis/relationship-value/demo-connection-1" |
| 455 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/analysis/relationship-value/demo-connection-1?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 129 | 文案/数据常量 label | "Read score" |
| 136 | 文案/数据常量 label | "Recompute score" |
| 143 | 文案/数据常量 label | "Empty score" |
| 150 | 文案/数据常量 label | "Pending score" |
| 158 | 文案/数据常量 label | "Controlled failure" |
| 180 | 属性 aria-label | Relationship value evidence ids |
| 196 | 属性 aria-label | Relationship value rationale evidence |
| 204 | JSX文字 | Evidence: |
| 219 | JSX文字 | Priority score |
| 225 | JSX文字 | Relationship |
| 229 | JSX文字 | Relationship value type |
| 235 | JSX文字 | Rationale |
| 239 | JSX文字 | Suggested next action |
| 259 | 属性 title | Value scoring stays explainable |
| 265 | JSX文字 | Scan this first: the score keeps value type, rationale, evidence ids, and next action together while database reads |
| 266 | JSX文字 | ; database writes |
| 269 | 属性 aria-label | Relationship value operator checkpoint |
| 274 | JSX文字 | Relationship value type |
| 278 | JSX文字 | Priority score |
| 282 | JSX文字 | Rationale |
| 286 | JSX文字 | Suggested next action |
| 290 | JSX文字 | Mock execution |
| 292 | JSX文字 | database reads |
| 292 | JSX文字 | ; database writes |
| 302 | 属性 title | Preview rule-based priority updates |
| 308 | JSX文字 | This form posts to the mock recompute route and never leaves the local relationship value boundary. |
| 311 | 属性 aria-label | Mock relationship value recompute form |
| 317 | 属性 label | Connection id |
| 320 | 属性 label | Evidence ids |
| 331 | JSX文字 | Preview recompute |
| 334 | 属性 aria-label | Relationship value guardrails |
| 335 | JSX文字 | source evidence |
| 336 | JSX文字 | no live scoring |
| 337 | JSX文字 | explainable next action |
| 363 | 属性 aria-label | Deterministic relationship value recompute previews |
| 368 | JSX文字 | Recompute success envelope |
| 371 | JSX文字 | Status |
| 372 | JSX文字 | status 200 |
| 375 | JSX文字 | Score |
| 385 | JSX文字 | View success response object |
| 392 | JSX文字 | Recompute controlled failure envelope |
| 395 | JSX文字 | Status |
| 396 | JSX文字 | status 409 |
| 399 | JSX文字 | Failure code |
| 409 | JSX文字 | View failure response object |
| 420 | 属性 aria-label | Relationship value API probes |
| 422 | JSX文字 | These probes exercise read, recompute success, empty, pending, invalid recompute bodies, not-found, and controlled failure paths inside the mock boundary. Bare POST defaults to deterministic recompute output; malformed JSON remains the validation probe. |
| 428 | 属性 aria-label | Run relationship value read probe |
| 433 | JSX文字 | Run read probe |
| 436 | 属性 aria-label | Run relationship value recompute success probe |
| 442 | JSX文字 | Run recompute success probe |
| 445 | 属性 aria-label | Run relationship value empty probe |
| 451 | JSX文字 | Run empty probe |
| 454 | 属性 aria-label | Run relationship value controlled failure probe |
| 459 | JSX文字 | Run controlled failure probe |
| 473 | 属性 aria-label | Mock-only scoring checks |
| 475 | JSX文字 | Database reads |
| 481 | JSX文字 | Database writes |
| 487 | JSX文字 | External network |
| 493 | JSX文字 | AI execution |
| 567 | JSX文字 | Developer capability runtime |
| 568 | JSX文字 | Relationship value scoring mock |
| 570 | JSX文字 | Mock-first boundary for ranking why a relationship matters, which evidence supports the score, and what next action is sensible before live scoring exists. |
| 580 | 属性 aria-label | Relationship value scoring states |
| 584 | 属性 title | Success state |
| 598 | 属性 title | Empty state |
| 604 | JSX文字 | Assessment |
| 605 | JSX文字 | No relationship value score is selected. |
| 608 | JSX文字 | State |
| 621 | 属性 title | Pending state |
| 627 | JSX文字 | Score status |
| 633 | JSX文字 | Assessment |
| 634 | JSX文字 | Priority scoring waits for local fixture review. |
| 644 | 属性 title | Failure state |
| 649 | JSX文字 | Error code |
| 655 | JSX文字 | Message |
| 659 | JSX文字 | Recovery |
| 669 | 属性 title | Rationale stays tied to evidence |
| 683 | 属性 title | Rule-based scoring is deterministic |
| 699 | 属性 title | No live work happens in the mock |
| 706 | JSX文字 | The mock sets database reads, database writes, production audit log writes, external network requests, AI calls, calendar/email requests, and notifications to false. |
| 715 | 属性 title | Analysis routes use shared envelopes |
| 720 | JSX文字 | The declared probes cover relationship value read and recompute routes. Empty, pending, invalid recompute bodies, not-found, and controlled failure probes document non-success states without leaving the mock boundary. |
| 727 | JSX文字 | Failure mapping |
