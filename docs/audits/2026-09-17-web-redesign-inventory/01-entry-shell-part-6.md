| 735 | JSX文字 | maps to a shared failure envelope. |
| 739 | JSX文字 | Fixture score |
| 741 | JSX文字 | is exposed from local fixture state. |
| 747 | 属性 aria-label | Relationship value API probe details |
| 756 | JSX文字 | returns |
| 763 | 属性 title | Replacement notes stay with the capability |
| 769 | JSX文字 | Handoff doc |
| 775 | JSX文字 | Required coverage |
| 777 | JSX文字 | Live service and source files, switch mechanism, required env vars and permissions, privacy and provenance constraints, and replacement tests are documented before live scoring is wired. |
| 783 | 属性 aria-label | Relationship value live handoff excerpts |

## repos/orbits/features/audit/source-consistency-and-provenance-audit/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/audit/source-consistency-and-provenance-audit/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 333 | StateCard | h3 | label |  |
| 384 | ApiProbeList | h3 | probe.label |  |
| 405 | ScenarioControls | h3 | control.actionLabel |  |
| 474 | SourceConsistencyProvenanceAuditDemo | header |  | workbench-header |
| 476 | SourceConsistencyProvenanceAuditDemo | h1 | Source consistency and provenance audit |  |
| 526 | SourceConsistencyProvenanceAuditDemo | h3 | runResult.data.runId |  |
| 548 | SourceConsistencyProvenanceAuditDemo | h3 | Failure state |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 414 | link/a · ScenarioControls | {control.actionLabel} | control.path | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 418 | form-submit-boundary/form · ScenarioControls | {control.actionLabel} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 419 | button/button · ScenarioControls | {control.actionLabel} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 481 | link/a · SourceConsistencyProvenanceAuditDemo | Scenario controls | #source-consistency-provenance-audit-scenario-controls | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 153 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/audit/provenance" |
| 160 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/audit/provenance/run" |
| 167 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/audit/provenance?scenario=empty" |
| 174 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/audit/provenance/run?scenario=pending" |
| 181 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/audit/provenance/run?scenario=failure" |
| 201 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance" |
| 209 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance?scenario=empty" |
| 217 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance/run" |
| 225 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance/run?scenario=pending" |
| 233 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance/run?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 152 | 文案/数据常量 label | "Audit snapshot" |
| 159 | 文案/数据常量 label | "Run audit" |
| 166 | 文案/数据常量 label | "Empty audit" |
| 173 | 文案/数据常量 label | "Pending run" |
| 180 | 文案/数据常量 label | "Controlled failure" |
| 241 | 属性 aria-label | Source consistency audit evidence ids |
| 257 | 属性 aria-label | Source references |
| 278 | JSX文字 | audited |
| 278 | JSX文字 | ; inconsistent |
| 283 | JSX文字 | source consistent |
| 286 | JSX文字 | provenance complete |
| 303 | JSX文字 | No active provenance findings remain in the mock MVP loop. |
| 309 | 属性 aria-label | Audit findings |
| 335 | JSX文字 | state |
| 363 | 属性 aria-label | Source consistency provenance audit provider boundary |
| 372 | JSX文字 | All Sprint 55 audit paths stay local and deterministic. |
| 388 | JSX文字 | Expected status |
| 398 | 属性 aria-label | Source consistency provenance audit scenario exercise controls |
| 410 | JSX文字 | state |
| 410 | JSX文字 | ; expected status |
| 475 | JSX文字 | Developer capability |
| 476 | JSX文字 | Source consistency and provenance audit |
| 478 | JSX文字 | Deterministic audit boundary for source consistency across contacts, connections, evidence, recommendations, tasks, chat summaries, and agent actions. |
| 482 | JSX文字 | Scenario controls |
| 487 | 属性 title | Source consistency and provenance audit |
| 492 | 属性 aria-label | Source consistency provenance audit operator checkpoint |
| 496 | JSX文字 | Provider switch ORBIT_SOURCE_PROVENANCE_AUDIT_PROVIDER |
| 497 | JSX文字 | Live notes |
| 502 | JSX文字 | Audit result: completed with |
| 503 | JSX文字 | active |
| 508 | 属性 title | Audited collections |
| 519 | 属性 title | Audit findings |
| 523 | 属性 title | Rule-based run |
| 527 | JSX文字 | evaluated |
| 527 | JSX文字 | records |
| 528 | JSX文字 | active findings |
| 530 | JSX文字 | compliance report persisted |
| 534 | JSX文字 | production audit storage written |
| 542 | 属性 title | Probe states |
| 544 | 属性 label | Success state |
| 545 | 属性 label | Empty state |
| 546 | 属性 label | Pending state |
| 548 | JSX文字 | Failure state |
| 562 | 属性 title | Declared evidence surfaces |
| 566 | 属性 title | Exercise API states |
| 573 | 属性 title | Mock-to-live path |
| 575 | JSX文字 | Live implementation notes: |

## repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 208 | EventList | h3 | event.title | relationship-name |
| 478 | StateInspectors | details |  | app-bootstrap-state-inspector |
| 483 | StateInspectors | summary |  |  |
| 517 | StateInspectors | details |  | app-bootstrap-state-inspector |
| 518 | StateInspectors | summary |  |  |
| 572 | AppBootstrapMockAggregatorDemo | header |  | workbench-header |
| 574 | AppBootstrapMockAggregatorDemo | h1 | App bootstrap mock aggregator |  |
| 606 | AppBootstrapMockAggregatorDemo | header |  | workbench-header |
| 608 | AppBootstrapMockAggregatorDemo | h1 | App bootstrap mock aggregator |  |
| 619 | AppBootstrapMockAggregatorDemo | section | App bootstrap capability details | workbench-grid |
| 641 | AppBootstrapMockAggregatorDemo | section | App bootstrap relationship details | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 483 | disclosure/summary · StateInspectors | {state.label} {state.status} {state.envelope} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 518 | disclosure/summary · StateInspectors | Inspect failure bootstrap 503 failure envelope |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 108 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/app/bootstrap" |
| 115 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/app/bootstrap?scenario=empty" |
| 122 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/app/bootstrap?scenario=pending" |
| 129 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/app/bootstrap?scenario=failure" |
| 433 | StateInspectors | 路径常量 | 见调用/handler | "GET /api/app/bootstrap" |
| 445 | StateInspectors | 路径常量 | 见调用/handler | "GET /api/app/bootstrap?scenario=empty" |
| 457 | StateInspectors | 路径常量 | 见调用/handler | "GET /api/app/bootstrap?scenario=pending" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 107 | 文案/数据常量 label | "App bootstrap" |
| 114 | 文案/数据常量 label | "Empty bootstrap" |
| 121 | 文案/数据常量 label | "Pending bootstrap" |
| 128 | 文案/数据常量 label | "Controlled failure" |
| 147 | 属性 aria-label | App bootstrap evidence ids |
| 160 | 文案/数据常量 label | "Connection summary" |
| 165 | 文案/数据常量 label | "Pending tasks" |
| 170 | 文案/数据常量 label | "Top agent actions" |
| 175 | 文案/数据常量 label | "Dashboard summary" |
| 180 | 文案/数据常量 label | "Notification summary" |
| 187 | 属性 aria-label | App bootstrap metric cards |
| 204 | 属性 aria-label | App bootstrap upcoming events |
| 222 | 属性 aria-label | App bootstrap pending tasks |
| 243 | 属性 aria-label | App bootstrap top agent actions |
| 250 | JSX文字 | Confirmation required |
| 265 | 属性 aria-label | App bootstrap mock-only execution checks |
| 270 | JSX文字 | Personalization |
| 272 | JSX文字 | server-side personalization |
| 277 | JSX文字 | Live aggregation |
| 279 | JSX文字 | live database aggregation |
| 284 | JSX文字 | External network |
| 285 | JSX文字 | external network requested |
| 288 | JSX文字 | Database reads |
| 289 | JSX文字 | database reads |
| 292 | JSX文字 | Database writes |
| 293 | JSX文字 | database writes |
| 296 | JSX文字 | AI provider |
| 297 | JSX文字 | AI provider requested |
| 300 | JSX文字 | Email and calendar |
| 302 | JSX文字 | email |
| 302 | JSX文字 | ; calendar |
| 307 | JSX文字 | Notifications |
| 309 | JSX文字 | notification provider requested |
| 314 | JSX文字 | Device APIs |
| 315 | JSX文字 | device requested |
| 323 | 属性 title | App bootstrap stays evidence-backed |
| 329 | JSX文字 | Scan this first: the aggregate combines first-screen account, profile, upcoming events, connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary from deterministic local fixtures. |
| 334 | 属性 aria-label | App bootstrap operator checkpoint |
| 339 | JSX文字 | State |
| 345 | JSX文字 | Workspace |
| 349 | JSX文字 | Profile |
| 353 | JSX文字 | Upcoming events |
| 354 | JSX文字 | local events |
| 374 | 属性 title | Harness-visible states |
| 375 | 属性 aria-label | App bootstrap state matrix |
| 380 | JSX文字 | Success state |
| 381 | JSX文字 | Success: |
| 381 | JSX文字 | contacts |
| 384 | JSX文字 | Empty state |
| 385 | JSX文字 | Empty: |
| 388 | JSX文字 | Pending state |
| 389 | JSX文字 | Pending: |
| 392 | JSX文字 | Failure state |
| 394 | JSX文字 | Failure: controlled error |
| 399 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures use a service-unavailable envelope. |
| 431 | 文案/数据常量 label | "Inspect success bootstrap" |
| 443 | 文案/数据常量 label | "Inspect empty bootstrap" |
| 455 | 文案/数据常量 label | "Inspect pending bootstrap" |
| 469 | 属性 title | Inspect each bootstrap state |
| 473 | 属性 aria-label | App bootstrap state inspectors |
| 491 | JSX文字 | API probe |
| 497 | JSX文字 | State |
| 501 | JSX文字 | Aggregate counts |
| 505 | JSX文字 | Summary |
| 509 | JSX文字 | Next action |
| 519 | JSX文字 | Inspect failure bootstrap |
| 520 | JSX文字 | 503 failure envelope |
| 524 | JSX文字 | API probe |
| 527 | JSX文字 | GET /api/app/bootstrap?scenario=failure |
| 532 | JSX文字 | Controlled code |
| 538 | JSX文字 | App error |
| 544 | JSX文字 | Message |
| 573 | JSX文字 | Developer capability runtime |
| 574 | JSX文字 | App bootstrap mock aggregator |
| 576 | JSX文字 | The deterministic app bootstrap fixtures did not load, so this dev surface stopped inside a controlled local state. |
| 607 | JSX文字 | Developer capability runtime |
| 608 | JSX文字 | App bootstrap mock aggregator |
| 610 | JSX文字 | Dev-only surface for verifying the first-screen bootstrap boundary. The page reads the mock service for success, empty, pending, and failure states before any live personalization or aggregate provider exists. |
| 619 | 属性 aria-label | App bootstrap capability details |
| 623 | 属性 title | Success state |
| 632 | 属性 title | Provider boundaries |
| 635 | JSX文字 | App bootstrap data stays local until the documented provider switch and replacement tests are added. |
| 641 | 属性 aria-label | App bootstrap relationship details |
| 645 | 属性 title | Account context |
| 650 | JSX文字 | in |
| 657 | 属性 title | successResult.data.profile?.displayName ?? "Profile" |
| 664 | 属性 title | Event readiness |
| 668 | 属性 title | Relationship asset totals |
| 671 | JSX文字 | Evidence-backed connections |
| 677 | JSX文字 | Dormant contacts |
| 683 | 属性 title | Recommended relationship work |
| 687 | 属性 title | Action queue preview |
| 691 | 属性 title | Staged authorization |
| 694 | JSX文字 | Granted |
| 698 | JSX文字 | Staged |
| 704 | 属性 title | Delivery preview |
| 728 | 属性 title | Declared probes |
| 732 | 属性 aria-label | App bootstrap API probe details |
| 740 | JSX文字 | returns |
| 748 | 属性 title | Replacement notes |
| 754 | JSX文字 | Handoff doc |
| 760 | JSX文字 | Switch mechanism |
| 762 | JSX文字 | ORBIT_MODULE_MODE=live |
| 762 | JSX文字 | reads the shared live record store through the bootstrap service factory. |

## repos/orbits/features/connections/connection-and-evidence-service-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/connections/connection-and-evidence-service-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 242 | AddEvidenceResponsePreviews | details |  |  |
| 243 | AddEvidenceResponsePreviews | summary | View success response object |  |
| 269 | AddEvidenceResponsePreviews | details |  |  |
| 270 | AddEvidenceResponsePreviews | summary | View failure response object |  |
| 332 | TimelineRow | header |  |  |
| 334 | TimelineRow | h3 | item.title | relationship-name |
| 624 | ConnectionEvidenceServiceMockDemo | header |  | workbench-header |
| 626 | ConnectionEvidenceServiceMockDemo | h1 | Connection and evidence service mock |  |
| 639 | ConnectionEvidenceServiceMockDemo | section | Connection evidence service states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 243 | disclosure/summary · AddEvidenceResponsePreviews | View success response object |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 270 | disclosure/summary · AddEvidenceResponsePreviews | View failure response object |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 479 | form-submit-boundary/form · AddEvidencePanel | Mock connection add-evidence form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 486 | field/select · AddEvidencePanel | {CONNECTION_EVIDENCE_SOURCE_TYPES.map((sourceType) =&gt; ( &lt;option key={sourceType} value={sourceType}&gt; {sourceType} &lt;/option&gt; ))} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 495 | field/input · AddEvidencePanel | Title |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 501 | field/textarea · AddEvidencePanel | Excerpt |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 507 | button/button · AddEvidencePanel | Preview evidence add |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 531 | form-submit-boundary/form · ApiProbeActions | Run connections list probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 532 | button/button · ApiProbeActions | Run list probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 536 | form-submit-boundary/form · ApiProbeActions | Run connection detail probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 540 | button/button · ApiProbeActions | Run detail probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 544 | form-submit-boundary/form · ApiProbeActions | Run empty connections probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 549 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 553 | form-submit-boundary/form · ApiProbeActions | Run controlled failure connections probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 557 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 133 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/connections" |
| 140 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/connections/demo-connection-1" |
| 147 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/connections/demo-connection-1/evidence" |
| 154 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/connections?scenario=empty" |
| 160 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/connections/demo-connection-1?scenario=pending" |
| 167 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/connections?scenario=failure" |
| 480 | AddEvidencePanel | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/evidence" |
| 531 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/connections" |
| 537 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1" |
| 545 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/connections" |
| 554 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/connections?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 132 | 文案/数据常量 label | "List connections" |
| 139 | 文案/数据常量 label | "Read connection" |
| 146 | 文案/数据常量 label | "Add evidence" |
| 153 | 文案/数据常量 label | "Empty list" |
| 159 | 文案/数据常量 label | "Pending detail" |
| 166 | 文案/数据常量 label | "Controlled failure" |
| 222 | 属性 aria-label | Deterministic add-evidence response previews |
| 227 | JSX文字 | Add-evidence success envelope |
| 230 | JSX文字 | Status |
| 231 | JSX文字 | status 201 |
| 234 | JSX文字 | Added evidence |
| 243 | JSX文字 | View success response object |
| 250 | JSX文字 | Add-evidence controlled failure envelope |
| 253 | JSX文字 | Status |
| 254 | JSX文字 | status 409 |
| 257 | JSX文字 | Failure code |
| 270 | JSX文字 | View failure response object |
| 281 | 属性 aria-label | Connection evidence ids |
| 293 | 属性 aria-label | Connection source links |
| 307 | JSX文字 | Connection |
| 309 | JSX文字 | at |
| 314 | JSX文字 | Reason |
| 318 | JSX文字 | Stage |
| 322 | JSX文字 | Next action |
| 340 | JSX文字 | Source |
| 341 | JSX文字 | Source: |
| 344 | JSX文字 | Evidence |
| 345 | JSX文字 | Evidence: |
| 354 | 属性 aria-label | `Evidence timeline for ${connection.displayName}` |
| 392 | 属性 aria-label | Mock-only execution checks |
| 394 | JSX文字 | Database reads |
| 400 | JSX文字 | Database writes |
| 406 | JSX文字 | Audit log writes |
| 427 | 属性 title | Connection evidence stays fixture-backed |
| 433 | JSX文字 | Scan this first: the connection record keeps source links beside the evidence timeline and follow-up action while persistence and audit execution flags remain false. |
| 437 | 属性 aria-label | Connection evidence operator checkpoint |
| 442 | JSX文字 | Connection represented |
| 446 | JSX文字 | Evidence timeline |
| 447 | JSX文字 | evidence items are rendered. |
| 450 | JSX文字 | Source links |
| 452 | JSX文字 | source links are exposed from the contract. |
| 457 | JSX文字 | Mock execution |
| 459 | JSX文字 | database reads |
| 459 | JSX文字 | ; database writes |
| 469 | 属性 title | Attach a source-linked evidence item |
| 475 | JSX文字 | This boundary applies deterministic local rules to a fixture connection so add-evidence behavior can be tested before a live evidence store exists. |
| 479 | 属性 aria-label | Mock connection add-evidence form |
| 485 | 属性 label | Source type |
| 494 | 属性 label | Title |
| 500 | 属性 label | Excerpt |
| 508 | JSX文字 | Preview evidence add |
| 511 | 属性 aria-label | Connection evidence guardrails |
| 512 | JSX文字 | source links |
| 513 | JSX文字 | no live persistence |
| 514 | JSX文字 | timeline context |
| 522 | 属性 aria-label | Connection evidence API probe actions |
| 527 | JSX文字 | These probes exercise list, detail, add-evidence, empty, pending, and controlled failure paths inside the connection evidence mock boundary. |
| 531 | 属性 aria-label | Run connections list probe |
| 533 | JSX文字 | Run list probe |
| 536 | 属性 aria-label | Run connection detail probe |
| 541 | JSX文字 | Run detail probe |
| 544 | 属性 aria-label | Run empty connections probe |
| 550 | JSX文字 | Run empty probe |
| 553 | 属性 aria-label | Run controlled failure connections probe |
| 558 | JSX文字 | Run controlled failure probe |
| 586 | 文案/数据常量 title | "Operator confirmed warm introduction path" |
| 625 | JSX文字 | Developer capability runtime |
| 626 | JSX文字 | Connection and evidence service mock |
| 628 | JSX文字 | Mock-first boundary for understanding who a connection is, why it exists, what context created it, which source links prove that context, and which follow-up action is sensible before live persistence exists. |
| 639 | 属性 aria-label | Connection evidence service states |
| 643 | 属性 title | Success state |
| 659 | 属性 title | Empty state |
| 665 | JSX文字 | Connections |
| 666 | JSX文字 | No connection evidence is selected. |
| 669 | JSX文字 | State |
| 682 | 属性 title | Pending state |
| 688 | JSX文字 | Connection status |
| 694 | JSX文字 | Connection |
| 695 | JSX文字 | Evidence rendering waits for local fixture review. |
| 705 | 属性 title | Failure state |
| 710 | JSX文字 | Error code |
| 716 | JSX文字 | Message |
| 720 | JSX文字 | Recovery |
| 730 | 属性 title | Relationship context stays explainable |
| 737 | JSX文字 | The selected connection keeps source links, evidence ids, relationship reason, timeline order, and next action together. |
| 746 | 属性 title | Rule-based evidence attachment is deterministic |
| 763 | 属性 title | No live persistence happens in the mock |
| 770 | JSX文字 | The mock sets database reads, database writes, production audit log writes, external network requests, AI calls, calendar/email requests, and notifications to false. |
| 782 | 属性 title | Connection routes use shared envelopes |
| 787 | JSX文字 | The declared probes cover connection list, detail, and evidence add routes. Empty, pending, validation, not-found, malformed body, and controlled failure probes document non-success product states without leaving the mock boundary. |
| 794 | JSX文字 | Failure mapping |
| 802 | JSX文字 | maps to a shared failure envelope. |
| 806 | JSX文字 | List fixture |
| 808 | JSX文字 | connections are available from local fixture state. |
| 814 | 属性 aria-label | Connection evidence API probes |
| 823 | JSX文字 | returns |
| 830 | 属性 title | Replacement notes stay with the capability |
| 836 | JSX文字 | Handoff doc |
| 842 | JSX文字 | Required coverage |
| 844 | JSX文字 | Live service and provider files, switch mechanism, required env vars and permissions, privacy and provenance constraints, and replacement tests are documented before live providers are wired. |
| 850 | 属性 aria-label | Connection evidence live handoff excerpts |

## repos/orbits/features/connections/relationship-stage-and-profile-mock/api-probe-controls.tsx

源码：[api-probe-controls.tsx](</Users/li/work/orbit/repos/orbits/features/connections/relationship-stage-and-profile-mock/api-probe-controls.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 11 | form-submit-boundary/form · RelationshipProfileEditForm | Mock relationship profile form | onsubmit: (event) =&gt; void submit(event, { action: "/api/connections/demo-connection-1/profile", method: "PATCH", }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 26 | field/select · RelationshipProfileEditForm | {RELATIONSHIP_PROFILE_TYPES.map((relationshipType) =&gt; ( &lt;option key={relationshipType} value={relationshipType}&gt; {relationshipType} &lt;/option&gt; ))} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 35 | field/textarea · RelationshipProfileEditForm | Context |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 41 | button/button · RelationshipProfileEditForm | Preview profile update |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 57 | form-submit-boundary/form · RelationshipApiProbeForms | Run relationship stage probe | onsubmit: (event) =&gt; void submit(event, { action: "/api/connections/demo-connection-1/stage", method: "PATCH", }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 68 | button/button · RelationshipApiProbeForms | Run stage probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 72 | form-submit-boundary/form · RelationshipApiProbeForms | Run relationship profile probe | onsubmit: (event) =&gt; void submit(event, { action: "/api/connections/demo-connection-1/profile", method: "PATCH", }) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 83 | button/button · RelationshipApiProbeForms | Run profile probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 12 | RelationshipProfileEditForm | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/profile" |
| 20 | RelationshipProfileEditForm | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/profile" |
| 58 | RelationshipApiProbeForms | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/stage" |
| 63 | RelationshipApiProbeForms | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/stage" |
| 73 | RelationshipApiProbeForms | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/profile" |
| 78 | RelationshipApiProbeForms | 路径常量 | 见调用/handler | "/api/connections/demo-connection-1/profile" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 11 | 属性 aria-label | Mock relationship profile form |
| 25 | 属性 label | Relationship type |
| 34 | 属性 label | Context |
| 42 | JSX文字 | Preview profile update |
| 57 | 属性 aria-label | Run relationship stage probe |
| 69 | JSX文字 | Run stage probe |
| 72 | 属性 aria-label | Run relationship profile probe |
| 84 | JSX文字 | Run profile probe |

## repos/orbits/features/connections/relationship-stage-and-profile-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/connections/relationship-stage-and-profile-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 320 | RelationshipStageAndProfileMockDemo | header |  | workbench-header |
| 322 | RelationshipStageAndProfileMockDemo | h1 | Relationship stage and profile mock |  |
| 334 | RelationshipStageAndProfileMockDemo | section | Relationship stage and profile service states | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 90 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/connections/demo-connection-1/stage" |
| 97 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/connections/demo-connection-1/profile" |
| 104 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/connections/demo-connection-1/stage?scenario=empty" |
| 112 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/connections/demo-connection-1/profile?scenario=pending" |
| 119 | (module / render callback) | 路径常量 | 见调用/handler | "PATCH /api/connections/demo-connection-1/stage?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 89 | 文案/数据常量 label | "Update stage" |
| 96 | 文案/数据常量 label | "Update profile" |
| 103 | 文案/数据常量 label | "Empty stage" |
| 110 | 文案/数据常量 label | "Pending profile" |
| 118 | 文案/数据常量 label | "Controlled failure" |
| 136 | 属性 aria-label | Relationship profile evidence ids |
| 150 | JSX文字 | Connection |
| 154 | JSX文字 | Relationship type |
| 160 | JSX文字 | Stage |
| 166 | JSX文字 | Context |
| 170 | JSX文字 | Mutual value |
| 172 | JSX文字 | Orbit user receives |
| 177 | JSX文字 | Latest summary |
| 181 | JSX文字 | Next action |
| 204 | 属性 title | Relationship profile stays source-backed |
| 210 | JSX文字 | The mock stage/profile calculation keeps context, mutual value, latest summary, and next action together while live execution flags remain false. |
| 214 | 属性 aria-label | Relationship stage profile operator checkpoint |
| 219 | JSX文字 | Connection represented |
| 223 | JSX文字 | Profile fields |
| 224 | JSX文字 | Relationship type, stage, context, mutual value, summary. |
| 227 | JSX文字 | Mock execution |
| 229 | JSX文字 | database reads |
| 229 | JSX文字 | ; database writes |
| 233 | JSX文字 | Model boundary |
| 235 | JSX文字 | ai |
| 235 | JSX文字 | provider |
| 245 | 属性 title | Preview deterministic relationship profiling |
| 251 | JSX文字 | The form posts to the mock profile route with local fields only. The route returns a stable envelope and does not write profile state. |
| 255 | 属性 aria-label | Relationship profile guardrails |
| 256 | JSX文字 | source-backed |
| 257 | JSX文字 | mock only |
| 258 | JSX文字 | deterministic rules |
| 266 | 属性 aria-label | Relationship stage and profile API probe actions |
| 271 | JSX文字 | These probes exercise stage update, profile update, empty, pending, and controlled failure paths inside the relationship profile mock boundary. |
| 321 | JSX文字 | Developer capability runtime |
| 322 | JSX文字 | Relationship stage and profile mock |
| 324 | JSX文字 | Mock-first boundary for calculating who the relationship is, which stage it is in, why that stage is sensible, what value exists on both sides, and which follow-up action should happen next. |
| 334 | 属性 aria-label | Relationship stage and profile service states |
| 338 | 属性 title | Success state |
| 354 | 属性 title | Empty state |
| 363 | JSX文字 | Profile |
| 364 | JSX文字 | No relationship profile is selected. |
| 367 | JSX文字 | State |
| 380 | 属性 title | Pending state |
| 386 | JSX文字 | Profile status |
| 392 | JSX文字 | Profile |
| 393 | JSX文字 | Relationship automation waits for fixture review. |
| 403 | 属性 title | Failure state |
| 408 | JSX文字 | Error code |
| 414 | JSX文字 | Message |
| 418 | JSX文字 | Recovery |
| 428 | 属性 title | Relationship profile remains explainable |
| 436 | 属性 aria-label | Mutual value types |
| 449 | 属性 title | No live automation runs in the mock |
| 456 | JSX文字 | The mock sets database reads, database writes, production audit log writes, external network requests, model calls, calendar requests, email requests, and notifications to false. |
| 462 | JSX文字 | Profile flags |
| 464 | JSX文字 | database reads |
| 465 | JSX文字 | ; database writes |
| 467 | JSX文字 | ; ai |
| 468 | JSX文字 | provider |
| 477 | 属性 title | Relationship routes use shared envelopes |
| 482 | JSX文字 | The declared probes cover stage and profile updates. Empty, pending, invalid body, invalid stage, not-found, and controlled failure probes document non-success states without leaving the mock boundary. |
| 489 | JSX文字 | Failure mapping |
| 497 | JSX文字 | maps to a shared failure envelope. |
| 502 | 属性 aria-label | Relationship stage and profile API probes |
| 510 | JSX文字 | returns |
| 518 | 属性 title | Replacement notes stay with the capability |
| 524 | JSX文字 | Handoff doc |
| 530 | JSX文字 | Required coverage |
| 532 | JSX文字 | Live service and provider files, switch mechanism, required env vars and permissions, privacy and provenance constraints, and replacement tests are documented before live providers are wired. |
| 539 | 属性 aria-label | Relationship profile live handoff excerpts |

## repos/orbits/features/followups/followup-task-generation-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/followups/followup-task-generation-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 384 | FollowupTaskGenerationMockDemo | header |  | workbench-header |
| 386 | FollowupTaskGenerationMockDemo | h1 | Followup task generation mock |  |
| 406 | FollowupTaskGenerationMockDemo | header |  | workbench-header |
| 408 | FollowupTaskGenerationMockDemo | h1 | Followup task generation mock |  |
| 418 | FollowupTaskGenerationMockDemo | section | Followup task generation capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 101 | (module / render callback) | 路径常量 | 见调用/handler | "/api/tasks" |
| 109 | (module / render callback) | 路径常量 | 见调用/handler | "/api/tasks/generate" |
| 117 | (module / render callback) | 路径常量 | 见调用/handler | "/api/tasks?scenario=empty" |
| 125 | (module / render callback) | 路径常量 | 见调用/handler | "/api/tasks?scenario=pending" |
| 133 | (module / render callback) | 路径常量 | 见调用/handler | "/api/tasks?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 99 | 文案/数据常量 label | "List generated followup tasks" |
| 107 | 文案/数据常量 label | "Generate followup tasks" |
| 115 | 文案/数据常量 label | "Empty task generation" |
| 123 | 文案/数据常量 label | "Pending task generation" |
| 131 | 文案/数据常量 label | "Controlled failure" |
| 172 | 属性 aria-label | Followup task generation evidence |
| 184 | 属性 aria-label | Generated followup tasks with task-level audits |
| 193 | JSX文字 | Due in |
| 193 | JSX文字 | day |
| 197 | 属性 aria-label | `Audit followup task ${task.taskId}` |
| 201 | JSX文字 | Source: |
| 203 | JSX文字 | Provider boundary: |
| 207 | JSX文字 | Verification instruction: |
| 224 | 属性 aria-label | Mock-only followup task generation execution checks |
| 229 | JSX文字 | scheduler |
| 230 | JSX文字 | scheduler false |
| 233 | JSX文字 | AI task generation |
| 234 | JSX文字 | AI provider false |
| 237 | JSX文字 | task persistence |
| 238 | JSX文字 | database write false |
| 241 | JSX文字 | notification delivery |
| 258 | 属性 title | Ready for verifier review |
| 264 | JSX文字 | Scan this first: followup tasks are generated from local relationship triggers, not background scheduling, live task persistence, or model work. |
| 268 | 属性 aria-label | Followup task generation operator checkpoint |
| 273 | JSX文字 | Task count |
| 274 | JSX文字 | source-backed tasks |
| 277 | JSX文字 | Top task |
| 283 | JSX文字 | First trigger |
| 287 | JSX文字 | Scheduler boundary |
| 288 | JSX文字 | scheduler false |
| 291 | JSX文字 | Model boundary |
| 292 | JSX文字 | AI provider false |
| 312 | 属性 title | Harness-visible states |
| 313 | 属性 aria-label | Followup task generation state matrix |
| 318 | JSX文字 | Success state |
| 319 | JSX文字 | Success: |
| 319 | JSX文字 | followup tasks |
| 322 | JSX文字 | Empty state |
| 323 | JSX文字 | Empty: no eligible relationship triggers |
| 326 | JSX文字 | Pending state |
| 327 | JSX文字 | Pending: generation guard |
| 330 | JSX文字 | Failure state |
| 332 | JSX文字 | Failure: controlled error |
| 337 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 385 | JSX文字 | Developer capability runtime |
| 386 | JSX文字 | Followup task generation mock |
| 388 | JSX文字 | The deterministic followup task fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 407 | JSX文字 | Developer capability runtime |
| 408 | JSX文字 | Followup task generation mock |
| 410 | JSX文字 | Dev-only surface for verifying the followup task generation boundary. It turns local relationship triggers into source-backed work without schedulers, persistence, notifications, or model calls. |
| 418 | 属性 aria-label | Followup task generation capability details |
| 422 | 属性 title | Relationship work queue |
| 427 | 属性 title | Provider boundaries |
| 430 | JSX文字 | Task suggestions stay local until a confirmation guard and live provider switch are explicitly added. |
| 443 | 属性 title | Declared probes |
| 449 | JSX文字 | Expected status: |
| 457 | 属性 title | Replacement notes |
| 460 | JSX文字 | Handoff doc |
| 466 | JSX文字 | Switch mechanism |
| 468 | JSX文字 | ORBIT_FOLLOWUP_TASK_GENERATION_PROVIDER |
| 468 | JSX文字 | remains documented before any live service is wired. |

## repos/orbits/features/followups/message-draft-generator-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/followups/message-draft-generator-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 379 | MessageDraftGeneratorMockDemo | header |  | workbench-header |
| 381 | MessageDraftGeneratorMockDemo | h1 | Message draft generator mock |  |
| 401 | MessageDraftGeneratorMockDemo | header |  | workbench-header |
| 403 | MessageDraftGeneratorMockDemo | h1 | Message draft generator mock |  |
| 413 | MessageDraftGeneratorMockDemo | section | Message draft generator capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 90 | (module / render callback) | 路径常量 | 见调用/handler | "/api/message-drafts" |
| 98 | (module / render callback) | 路径常量 | 见调用/handler | "/api/message-drafts/demo-draft-1" |
| 106 | (module / render callback) | 路径常量 | 见调用/handler | "/api/message-drafts?scenario=empty" |
| 114 | (module / render callback) | 路径常量 | 见调用/handler | "/api/message-drafts?scenario=pending" |
| 122 | (module / render callback) | 路径常量 | 见调用/handler | "/api/message-drafts?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 88 | 文案/数据常量 label | "Create message draft" |
| 96 | 文案/数据常量 label | "Update message draft" |
| 104 | 文案/数据常量 label | "Empty message draft generation" |
| 112 | 文案/数据常量 label | "Pending message draft generation" |
| 120 | 文案/数据常量 label | "Controlled failure" |
| 165 | 属性 aria-label | Message draft generator evidence |
| 177 | 属性 aria-label | Generated message drafts with draft-level audits |
| 189 | 属性 aria-label | `Audit message draft ${draft.draftId}` |
| 193 | JSX文字 | Source: |
| 195 | JSX文字 | Provider boundary: |
| 199 | JSX文字 | Verification instruction: |
| 216 | 属性 aria-label | Mock-only message draft generator execution checks |
| 221 | JSX文字 | AI writing |
| 222 | JSX文字 | AI provider false |
| 225 | JSX文字 | External delivery |
| 226 | JSX文字 | external send false |
| 229 | JSX文字 | Draft persistence |
| 230 | JSX文字 | database write false |
| 233 | JSX文字 | Notification delivery |
| 250 | 属性 title | Ready for verifier review |
| 256 | JSX文字 | Scan this first: message drafts are generated from local relationship evidence, not AI writing providers, external send channels, live persistence, email, calendar, or notification services. |
| 260 | 属性 aria-label | Message draft generator operator checkpoint |
| 265 | JSX文字 | Draft count |
| 266 | JSX文字 | source-backed drafts |
| 269 | JSX文字 | Top draft |
| 275 | JSX文字 | First draft kind |
| 279 | JSX文字 | Writing boundary |
| 280 | JSX文字 | AI provider false |
| 283 | JSX文字 | Delivery boundary |
| 284 | JSX文字 | external send false |
| 304 | 属性 title | Harness-visible states |
| 305 | 属性 aria-label | Message draft generator state matrix |
| 310 | JSX文字 | Success state |
| 313 | JSX文字 | Success probe: POST /api/message-drafts |
| 316 | JSX文字 | Success: |
| 316 | JSX文字 | message drafts |
| 320 | JSX文字 | Empty state |
| 323 | JSX文字 | Empty probe: POST /api/message-drafts?scenario=empty |
| 326 | JSX文字 | Empty: no source-backed message context |
| 330 | JSX文字 | Pending state |
| 333 | JSX文字 | Pending probe: POST /api/message-drafts?scenario=pending |
| 336 | JSX文字 | Pending: confirmation guard |
| 340 | JSX文字 | Failure state |
| 343 | JSX文字 | Failure probe: POST /api/message-drafts?scenario=failure |
| 346 | JSX文字 | Failure: controlled error |
| 351 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 380 | JSX文字 | Developer capability runtime |
| 381 | JSX文字 | Message draft generator mock |
| 383 | JSX文字 | The deterministic message draft fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 402 | JSX文字 | Developer capability runtime |
| 403 | JSX文字 | Message draft generator mock |
| 405 | JSX文字 | Dev-only surface for verifying the message draft generator boundary. It turns relationship evidence into draft copy without AI writing, external send channels, live persistence, or delivery services. |
| 413 | 属性 aria-label | Message draft generator capability details |
| 417 | 属性 title | Six relationship message drafts |
| 426 | 属性 title | Provider boundaries |
| 429 | JSX文字 | Draft copy stays local until a confirmation guard and live provider switch are explicitly added. |
| 442 | 属性 title | Declared probes |
| 448 | JSX文字 | Expected status: |
| 456 | 属性 title | Replacement notes |
| 459 | JSX文字 | Handoff doc |
| 465 | JSX文字 | Switch mechanism |
| 467 | JSX文字 | ORBIT_MESSAGE_DRAFT_GENERATOR_PROVIDER |
| 467 | JSX文字 | remains documented before any live service is wired. |

## repos/orbits/features/notifications/reminder-schedule-and-notification-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/notifications/reminder-schedule-and-notification-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 399 | ReminderScheduleNotificationMockDemo | header |  | workbench-header |
| 401 | ReminderScheduleNotificationMockDemo | h1 | Reminder schedule and notification mock |  |
| 421 | ReminderScheduleNotificationMockDemo | header |  | workbench-header |
| 423 | ReminderScheduleNotificationMockDemo | h1 | Reminder schedule and notification mock |  |
| 434 | ReminderScheduleNotificationMockDemo | section | Reminder schedule and notification capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 87 | (module / render callback) | 路径常量 | 见调用/handler | "/api/notifications" |
| 95 | (module / render callback) | 路径常量 | 见调用/handler | "/api/notifications/reminders/generate" |
| 103 | (module / render callback) | 路径常量 | 见调用/handler | "/api/notifications?scenario=empty" |
| 111 | (module / render callback) | 路径常量 | 见调用/handler | "/api/notifications?scenario=pending" |
| 119 | (module / render callback) | 路径常量 | 见调用/handler | "/api/notifications?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 85 | 文案/数据常量 label | "List notification queue" |
| 93 | 文案/数据常量 label | "Generate reminder schedule" |
| 101 | 文案/数据常量 label | "Empty reminder schedule" |
| 109 | 文案/数据常量 label | "Pending notification review" |
| 117 | 文案/数据常量 label | "Controlled failure" |
| 183 | 属性 aria-label | Reminder schedule notification evidence |
| 198 | 属性 aria-label | Scheduled reminders with reminder-level audits |
| 210 | JSX文字 | Due in |
| 210 | JSX文字 | day |
| 214 | 属性 aria-label | `Audit reminder ${reminder.reminderId}` |
| 218 | JSX文字 | Source: |
| 220 | JSX文字 | Provider boundary: |
| 224 | JSX文字 | Verification instruction: |
| 241 | 属性 aria-label | Mock-only reminder notification execution checks |
| 246 | JSX文字 | Push notifications |
| 247 | JSX文字 | push false |
| 250 | JSX文字 | Email delivery |
| 251 | JSX文字 | email false |
| 254 | JSX文字 | SMS delivery |
| 255 | JSX文字 | SMS false |
| 258 | JSX文字 | Cron scheduler |
| 259 | JSX文字 | cron false |
| 262 | JSX文字 | Queue entries |
| 263 | JSX文字 | mock queue entries |
| 277 | 属性 title | Ready for verifier review |
| 283 | JSX文字 | Scan this first: reminder schedules and notification queue entries are produced from local follow-up due dates, not push services, email, SMS, cron jobs, live persistence, devices, or external networks. |
| 287 | 属性 aria-label | Reminder schedule notification operator checkpoint |
| 292 | JSX文字 | Reminder count |
| 293 | JSX文字 | source-backed reminders |
| 296 | JSX文字 | Top reminder |
| 302 | JSX文字 | First frequency |
| 306 | JSX文字 | Delivery boundary |
| 307 | JSX文字 | push false, email false, SMS false |
| 310 | JSX文字 | Scheduler boundary |
| 311 | JSX文字 | cron false |
| 331 | 属性 title | Harness-visible states |
| 332 | 属性 aria-label | Reminder schedule notification state matrix |
| 337 | JSX文字 | Success state |
| 338 | JSX文字 | Success: |
| 338 | JSX文字 | reminders |
| 341 | JSX文字 | Empty state |
| 342 | JSX文字 | Empty: no due follow-up reminders |
| 345 | JSX文字 | Pending state |
| 346 | JSX文字 | Pending: notification review guard |
| 349 | JSX文字 | Failure state |
| 351 | JSX文字 | Failure: controlled error |
| 356 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 400 | JSX文字 | Developer capability runtime |
| 401 | JSX文字 | Reminder schedule and notification mock |
| 403 | JSX文字 | The deterministic reminder notification fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 422 | JSX文字 | Developer capability runtime |
| 423 | JSX文字 | Reminder schedule and notification mock |
| 425 | JSX文字 | Dev-only surface for verifying the reminder schedule and notification boundary. It turns local follow-up due dates into source-backed reminder rows and mock queue entries without delivery services or scheduler jobs. |
| 434 | 属性 aria-label | Reminder schedule and notification capability details |
| 438 | 属性 title | Due-date reminder queue |
| 443 | 属性 title | Provider boundaries |
| 446 | JSX文字 | Reminder notifications stay local until a confirmation guard, scheduler, and live provider switch are explicitly added. |
| 452 | 属性 title | Relationship digest |
| 458 | JSX文字 | groups |
| 459 | JSX文字 | reminders into |
| 474 | 属性 title | Declared probes |
| 480 | JSX文字 | Expected status: |
| 488 | 属性 title | Replacement notes |
| 491 | JSX文字 | Handoff doc |
| 497 | JSX文字 | Switch mechanism |
| 499 | JSX文字 | ORBIT_REMINDER_NOTIFICATION_PROVIDER |
| 499 | JSX文字 | remains documented before any live service is wired. |

## repos/orbits/features/permissions/permission-state-and-staged-authorization-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/permissions/permission-state-and-staged-authorization-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 130 | PermissionStateCapabilityDemo | header |  | workbench-header |
| 132 | PermissionStateCapabilityDemo | h1 | Permission state and staged authorization mock |  |
| 141 | PermissionStateCapabilityDemo | section | Permission state and staged authorization states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 252 | form-submit-boundary/form · PermissionStateCapabilityDemo | Run staged calendar authorization review |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 263 | button/button · PermissionStateCapabilityDemo | Run staged calendar review |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 27 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/permissions" |
| 28 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/permissions" |
| 35 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/permissions?scenario=empty" |
| 36 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/permissions?scenario=empty" |
| 42 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/permissions?scenario=pending" |
