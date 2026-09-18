| 498 | form-submit-boundary/form · ApiProbeActions | Run pending event encounter note API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 503 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 507 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event encounter note API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 512 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 101 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters" |
| 109 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence" |
| 117 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=empty" |
| 125 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=pending" |
| 133 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=failure" |
| 140 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters?scenario=empty" |
| 147 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters?scenario=pending" |
| 154 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/encounters?scenario=failure" |
| 399 | NoteCaptureForm | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters" |
| 445 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters" |
| 454 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters/demo-encounter-1/evidence" |
| 463 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=empty" |
| 472 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=pending" |
| 481 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters/demo-encounter-1/evidence?scenario=failure" |
| 490 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters?scenario=empty" |
| 499 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters?scenario=pending" |
| 508 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/encounters?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 100 | 文案/数据常量 label | "Capture encounter note" |
| 107 | 文案/数据常量 label | "Create encounter evidence" |
| 115 | 文案/数据常量 label | "Evidence empty guard" |
| 123 | 文案/数据常量 label | "Evidence pending guard" |
| 131 | 文案/数据常量 label | "Evidence controlled failure" |
| 139 | 文案/数据常量 label | "Empty encounter note" |
| 146 | 文案/数据常量 label | "Voice placeholder pending" |
| 153 | 文案/数据常量 label | "Controlled failure" |
| 171 | 属性 aria-label | Event encounter note evidence |
| 191 | JSX文字 | at |
| 225 | 属性 aria-label | Mock-only event encounter note execution checks |
| 230 | JSX文字 | Speech capture |
| 231 | JSX文字 | speech-to-text |
| 234 | JSX文字 | Audio handling |
| 235 | JSX文字 | audio upload |
| 238 | JSX文字 | Storage |
| 239 | JSX文字 | live note storage |
| 242 | JSX文字 | Summary generation |
| 243 | JSX文字 | model work |
| 255 | 属性 title | Ready for verifier review |
| 261 | JSX文字 | Scan this first: the typed note, voice-note placeholder, conversation summary seed, and evidence draft all come from local fixtures. |
| 264 | 属性 aria-label | Event encounter note operator checkpoint |
| 269 | JSX文字 | Event |
| 275 | JSX文字 | Participant |
| 279 | JSX文字 | Encounter |
| 285 | JSX文字 | Mock execution |
| 287 | JSX文字 | speech-to-text |
| 287 | JSX文字 | ; audio upload |
| 288 | JSX文字 | ; live note storage |
| 311 | 文案/数据常量 label | "Success" |
| 319 | 文案/数据常量 label | "Empty" |
| 327 | 文案/数据常量 label | "Pending" |
| 336 | 文案/数据常量 label | "Failure" |
| 348 | 属性 title | Compare mock outcomes before drilling in |
| 354 | JSX文字 | Compare success, empty, pending, and failure outcomes from the mock service before reading the detailed panels. |
| 357 | 属性 aria-label | Event encounter note state comparison |
| 371 | JSX文字 | Result |
| 375 | JSX文字 | Operator check |
| 388 | 属性 title | Capture encounter note |
| 394 | JSX文字 | This form posts to the route handler that uses the encounter note mock service. The note stays inside deterministic event fixtures until a live provider is approved. |
| 398 | 属性 aria-label | Mock event encounter note capture form |
| 404 | 属性 label | Event id |
| 407 | 属性 label | Contact |
| 410 | 属性 label | Typed note |
| 421 | JSX文字 | Capture note |
| 424 | 属性 aria-label | Event encounter note guardrails |
| 425 | JSX文字 | typed local note |
| 426 | JSX文字 | event-only context |
| 427 | JSX文字 | review before follow-up |
| 435 | 属性 aria-label | Event encounter note API probe actions |
| 440 | JSX文字 | These probes exercise encounter note capture, evidence creation, empty, pending, and controlled failure paths inside the mock boundary. |
| 444 | 属性 aria-label | Run event encounter note capture API probe |
| 450 | JSX文字 | Run capture probe |
| 453 | 属性 aria-label | Run event encounter evidence API probe |
| 459 | JSX文字 | Run evidence probe |
| 462 | 属性 aria-label | Run empty event encounter evidence API probe |
| 468 | JSX文字 | Run evidence empty |
| 471 | 属性 aria-label | Run pending event encounter evidence API probe |
| 477 | JSX文字 | Run evidence pending |
| 480 | 属性 aria-label | Run controlled failure event encounter evidence API probe |
| 486 | JSX文字 | Run evidence failure |
| 489 | 属性 aria-label | Run empty event encounter note API probe |
| 495 | JSX文字 | Run empty probe |
| 498 | 属性 aria-label | Run pending event encounter note API probe |
| 504 | JSX文字 | Run pending probe |
| 507 | 属性 aria-label | Run controlled failure event encounter note API probe |
| 513 | JSX文字 | Run failure probe |
| 531 | JSX文字 | Evidence id |
| 537 | JSX文字 | Source excerpt |
| 541 | JSX文字 | Storage guard |
| 543 | JSX文字 | live database write |
| 584 | JSX文字 | Developer capability runtime |
| 585 | JSX文字 | Event encounter note capture mock |
| 587 | JSX文字 | Mock-first boundary for capturing on-site encounter notes, holding a voice-note placeholder, seeding a conversation summary, and creating evidence without device, storage, network, or model execution. |
| 604 | 属性 aria-label | Event encounter note states |
| 608 | 属性 title | Success state |
| 618 | JSX文字 | Encounter |
| 624 | JSX文字 | Captured note |
| 628 | JSX文字 | Next action |
| 639 | 属性 title | Empty state |
| 645 | JSX文字 | Encounter |
| 646 | JSX文字 | No encounter note |
| 649 | JSX文字 | Next action |
| 660 | 属性 title | Pending state |
| 669 | JSX文字 | Voice-note placeholder |
| 673 | JSX文字 | Next action |
| 684 | 属性 title | Failure state |
| 689 | JSX文字 | Error code |
| 695 | JSX文字 | Message |
| 699 | JSX文字 | Recovery |
| 709 | 属性 title | Participant and note provenance |
| 716 | JSX文字 | Participant context is a deterministic fixture. It is not an attendee lookup, calendar signal, email signal, or delivered notification. |
| 729 | 属性 title | Conversation summary seed |
| 740 | JSX文字 | Seed id |
| 748 | JSX文字 | Generated by |
| 752 | JSX文字 | Model work |
| 764 | 属性 title | Evidence creation |
| 771 | 属性 title | Event encounter note routes use shared envelopes |
| 776 | JSX文字 | The declared probes cover encounter capture and evidence creation. Empty, pending, and controlled failure probes document non-success work without leaving the mock boundary. |
| 782 | JSX文字 | Failure mapping |
| 790 | JSX文字 | maps to a shared failure envelope. |
| 795 | 属性 aria-label | Event encounter note API probes |
| 807 | JSX文字 | Expected status: |
| 814 | 属性 title | Replacement notes stay with the event encounter capability |
| 820 | JSX文字 | Handoff doc |
| 826 | JSX文字 | Switch |
| 828 | JSX文字 | ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER |

## repos/orbits/features/events/event-crud-and-import/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/event-crud-and-import/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 441 | EventCrudAndImportMockDemo | header |  | workbench-header |
| 443 | EventCrudAndImportMockDemo | h1 | Event CRUD and import mock |  |
| 460 | EventCrudAndImportMockDemo | section | Event CRUD states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 317 | form-submit-boundary/form · ManualEventCreationPanel | Mock manual event creation form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 324 | field/input · ManualEventCreationPanel | Event title |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 327 | field/input · ManualEventCreationPanel | Venue |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 333 | field/textarea · ManualEventCreationPanel | Source note |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 339 | button/button · ManualEventCreationPanel | Stage manual event |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 361 | form-submit-boundary/form · ApiProbeActions | Run event list API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 362 | button/button · ApiProbeActions | Run list probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 366 | form-submit-boundary/form · ApiProbeActions | Run manual event creation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 371 | button/button · ApiProbeActions | Run create probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 375 | form-submit-boundary/form · ApiProbeActions | Run empty manual event form probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 382 | button/button · ApiProbeActions | Run empty form probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 386 | form-submit-boundary/form · ApiProbeActions | Reload event success state after probes |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 391 | button/button · ApiProbeActions | Reload success state |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 395 | form-submit-boundary/form · ApiProbeActions | Run empty event list API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 400 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 404 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 409 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 84 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events" |
| 91 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events" |
| 98 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events (empty form)" |
| 105 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events after non-success probe" |
| 112 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1" |
| 119 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events?scenario=empty" |
| 125 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events?scenario=failure" |
| 318 | ManualEventCreationPanel | 路径常量 | 见调用/handler | "/api/events" |
| 361 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events" |
| 367 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events" |
| 376 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events" |
| 387 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events" |
| 396 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events?scenario=empty" |
| 405 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 83 | 文案/数据常量 label | "List event records" |
| 90 | 文案/数据常量 label | "Create manual event" |
| 97 | 文案/数据常量 label | "Empty manual form" |
| 104 | 文案/数据常量 label | "Reload success state" |
| 111 | 文案/数据常量 label | "Read event detail" |
| 118 | 文案/数据常量 label | "Empty event list" |
| 124 | 文案/数据常量 label | "Controlled failure" |
| 142 | 属性 aria-label | Event CRUD evidence |
| 159 | JSX文字 | from |
| 179 | JSX文字 | mapped |
| 180 | JSX文字 | from |
| 210 | 属性 aria-label | Mock-only event execution checks |
| 215 | JSX文字 | Calendar provider |
| 221 | JSX文字 | Organizer feed |
| 227 | JSX文字 | Live database writes |
| 233 | JSX文字 | Notifications |
| 258 | 属性 title | Ready for verifier review |
| 264 | JSX文字 | Scan this first: the event ledger shows manual creation, imported event records, source metadata, and explicit false flags for work that must stay outside the mock. |
| 268 | 属性 aria-label | Event CRUD operator checkpoint |
| 273 | JSX文字 | Manual creation |
| 280 | JSX文字 | Imported records |
| 281 | JSX文字 | local import records. |
| 284 | JSX文字 | Source metadata |
| 292 | JSX文字 | Mock execution |
| 294 | JSX文字 | calendar sync |
| 294 | JSX文字 | ; organizer feeds |
| 295 | JSX文字 | ; database writes |
| 306 | 属性 title | Stage a local event |
| 312 | JSX文字 | The form posts to the route handler that uses the mock service. It stages a deterministic event record with an operator source note, without touching calendars, organizer systems, live databases, or notifications. |
| 317 | 属性 aria-label | Mock manual event creation form |
| 323 | 属性 label | Event title |
| 326 | 属性 label | Venue |
| 329 | 属性 label | Source note |
| 340 | JSX文字 | Stage manual event |
| 343 | 属性 aria-label | Manual event creation guardrails |
| 344 | JSX文字 | source note required |
| 345 | JSX文字 | no calendar write |
| 346 | JSX文字 | review before live sync |
| 354 | 属性 aria-label | Event CRUD API probe actions |
| 356 | JSX文字 | These probes exercise event list, manual creation, empty-form validation, detail, empty, reload, and controlled failure paths inside the event CRUD and import mock boundary. |
| 361 | 属性 aria-label | Run event list API probe |
| 363 | JSX文字 | Run list probe |
| 366 | 属性 aria-label | Run manual event creation API probe |
| 372 | JSX文字 | Run create probe |
| 375 | 属性 aria-label | Run empty manual event form probe |
| 383 | JSX文字 | Run empty form probe |
| 386 | 属性 aria-label | Reload event success state after probes |
| 392 | JSX文字 | Reload success state |
| 395 | 属性 aria-label | Run empty event list API probe |
| 401 | JSX文字 | Run empty probe |
| 404 | 属性 aria-label | Run controlled failure event API probe |
| 410 | JSX文字 | Run failure probe |
| 442 | JSX文字 | Developer capability runtime |
| 443 | JSX文字 | Event CRUD and import mock |
| 445 | JSX文字 | Mock-first boundary for listing imported event records, staging manual events, and reading event detail before live calendar sync, organizer feeds, or event database writes exist. |
| 460 | 属性 aria-label | Event CRUD states |
| 461 | 属性 title | Success state |
| 471 | JSX文字 | Events |
| 472 | JSX文字 | event records. |
| 475 | JSX文字 | Imported event records |
| 477 | JSX文字 | imported records from local fixtures. |
| 487 | 属性 title | Empty state |
| 493 | JSX文字 | Events |
| 494 | JSX文字 | No events are available for review. |
| 497 | JSX文字 | Imports |
| 498 | JSX文字 | No calendar or organizer fixture rows are staged. |
| 506 | 属性 title | Pending state |
| 512 | JSX文字 | State |
| 518 | JSX文字 | Next action |
| 529 | 属性 title | Failure state |
| 534 | JSX文字 | Error code |
| 540 | JSX文字 | Message |
| 544 | JSX文字 | Recovery |
| 554 | 属性 title | Calendar sync fixture and Organizer feed fixture |
| 561 | JSX文字 | Imported rows preserve provider record ids and field mappings without making calendar sync or organizer feed requests. |
| 569 | 属性 title | Source metadata stays attached |
| 577 | JSX文字 | The mock sets calendar provider, organizer feed, live database, external network, AI, email, and notification flags to false. |
| 588 | 属性 title | Event routes use shared envelopes |
| 593 | JSX文字 | The declared probes cover event list, manual creation, and event detail routes. Empty and controlled failure probes document non-success states without leaving the mock boundary. |
| 599 | JSX文字 | Failure mapping |
| 607 | JSX文字 | maps to a shared failure envelope. |
| 612 | 属性 aria-label | Event CRUD API probes |
| 621 | JSX文字 | Expected status: |
| 628 | 属性 title | Replacement notes stay with the event capability |
| 634 | JSX文字 | Handoff doc |
| 640 | JSX文字 | Switch |
| 642 | JSX文字 | ORBIT_EVENT_IMPORT_PROVIDER |

## repos/orbits/features/events/goal-readiness/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/goal-readiness/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 502 | EventGoalAndReadinessMockDemo | header |  | workbench-header |
| 504 | EventGoalAndReadinessMockDemo | h1 | Event goal and readiness mock |  |
| 525 | EventGoalAndReadinessMockDemo | section | Event goal readiness states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 351 | form-submit-boundary/form · GoalSettingPanel | Mock event goal form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 358 | field/input · GoalSettingPanel | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 364 | field/input · GoalSettingPanel | Event goal |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 374 | field/select · GoalSettingPanel | Meet two climate operators Storage pilot validation Investor context mapping |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 389 | button/button · GoalSettingPanel | Set mock goal |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 413 | form-submit-boundary/form · ApiProbeActions | Run event goal API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 418 | button/button · ApiProbeActions | Run goal probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 422 | form-submit-boundary/form · ApiProbeActions | Run event readiness API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 427 | button/button · ApiProbeActions | Run readiness probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 431 | form-submit-boundary/form · ApiProbeActions | Run empty event readiness API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 436 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 440 | form-submit-boundary/form · ApiProbeActions | Run pending event readiness API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 445 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 449 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event goal API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 454 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 89 | (module / render callback) | 路径常量 | 见调用/handler | "PUT /api/events/demo-event-1/goal" |
| 96 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/readiness" |
| 103 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/readiness?scenario=empty" |
| 110 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/readiness?scenario=pending" |
| 117 | (module / render callback) | 路径常量 | 见调用/handler | "PUT /api/events/demo-event-1/goal?scenario=failure" |
| 352 | GoalSettingPanel | 路径常量 | 见调用/handler | "/api/events/demo-event-1/goal" |
| 414 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/goal" |
| 423 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/readiness" |
| 432 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/readiness?scenario=empty" |
| 441 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/readiness?scenario=pending" |
| 450 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/goal?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 88 | 文案/数据常量 label | "Set event goal" |
| 95 | 文案/数据常量 label | "Read readiness" |
| 102 | 文案/数据常量 label | "Empty readiness" |
| 109 | 文案/数据常量 label | "Pending readiness" |
| 116 | 文案/数据常量 label | "Controlled failure" |
| 134 | 属性 aria-label | Event goal readiness evidence |
| 174 | JSX文字 | by |
| 210 | 属性 aria-label | Mock-only event goal readiness execution checks |
| 215 | JSX文字 | Model calls |
| 221 | JSX文字 | Calendar provider |
| 227 | JSX文字 | Live database writes |
| 233 | JSX文字 | Notifications |
| 250 | 属性 title | Ready for verifier review |
| 256 | JSX文字 | Scan this first: goal suggestions, selected event goal, readiness checklist, and pre-event preparation state all come from local rules. |
| 259 | 属性 aria-label | Event goal readiness operator checkpoint |
| 264 | JSX文字 | Event |
| 270 | JSX文字 | Selected goal |
| 274 | JSX文字 | Readiness score |
| 275 | JSX文字 | % ready. |
| 278 | JSX文字 | Pending items |
| 279 | JSX文字 | checklist item needs operator review. |
| 282 | JSX文字 | Mock execution |
| 284 | JSX文字 | model calls |
| 284 | JSX文字 | ; calendar provider |
| 305 | 属性 title | Scan states first |
| 306 | 属性 aria-label | Event goal readiness state matrix |
| 312 | JSX文字 | Success: |
| 312 | JSX文字 | % ready |
| 315 | JSX文字 | local checklist items. |
| 319 | JSX文字 | Empty: no goal selected |
| 324 | JSX文字 | Pending: |
| 324 | JSX文字 | % ready |
| 329 | JSX文字 | Failure: controlled error |
| 341 | 属性 title | Set a mock event goal |
| 347 | JSX文字 | This form posts to the route handler that uses the event goal and readiness mock service. It accepts a local goal and recomputes readiness without touching live calendars or model services. |
| 351 | 属性 aria-label | Mock event goal form |
| 357 | 属性 label | Event id |
| 360 | 属性 label | Event goal |
| 370 | 属性 label | Suggested goal |
| 379 | JSX文字 | Meet two climate operators |
| 382 | JSX文字 | Storage pilot validation |
| 385 | JSX文字 | Investor context mapping |
| 390 | JSX文字 | Set mock goal |
| 393 | 属性 aria-label | Event goal readiness guardrails |
| 394 | JSX文字 | fixture evidence |
| 395 | JSX文字 | local preparation only |
| 396 | JSX文字 | review before follow-up |
| 404 | 属性 aria-label | Event goal readiness API probe actions |
| 409 | JSX文字 | These probes exercise event goal setting, readiness read, empty, pending, and controlled failure paths inside the mock boundary. |
| 413 | 属性 aria-label | Run event goal API probe |
| 419 | JSX文字 | Run goal probe |
| 422 | 属性 aria-label | Run event readiness API probe |
| 428 | JSX文字 | Run readiness probe |
| 431 | 属性 aria-label | Run empty event readiness API probe |
| 437 | JSX文字 | Run empty probe |
| 440 | 属性 aria-label | Run pending event readiness API probe |
| 446 | JSX文字 | Run pending probe |
| 449 | 属性 aria-label | Run controlled failure event goal API probe |
| 455 | JSX文字 | Run failure probe |
| 503 | JSX文字 | Developer capability runtime |
| 504 | JSX文字 | Event goal and readiness mock |
| 506 | JSX文字 | Mock-first boundary for event goal setting, suggested goals, readiness checklist, and pre-event preparation state before live planning providers exist. |
| 525 | 属性 aria-label | Event goal readiness states |
| 529 | 属性 title | Success state |
| 539 | JSX文字 | Event |
| 541 | JSX文字 | at |
| 546 | JSX文字 | Readiness checklist |
| 548 | JSX文字 | local items. |
| 552 | JSX文字 | Pre-event preparation |
| 565 | 属性 title | Empty state |
| 571 | JSX文字 | Suggested goals |
| 572 | JSX文字 | No goal suggestions are shown in this empty state. |
| 575 | JSX文字 | Readiness checklist |
| 576 | JSX文字 | No checklist items are composed yet. |
| 586 | 属性 title | Pending state |
| 592 | JSX文字 | Brief status |
| 600 | JSX文字 | Next action |
| 611 | 属性 title | Failure state |
| 616 | JSX文字 | Error code |
| 622 | JSX文字 | Message |
| 626 | JSX文字 | Recovery |
| 636 | 属性 title | Goal options explain the relationship intent |
| 643 | JSX文字 | Suggested goals are deterministic local rules keyed by event evidence and relationship focus, not generated by live services. |
| 651 | 属性 title | Preparation state stays source-backed |
| 659 | JSX文字 | The mock sets model, calendar, database, email, and notification execution flags to false. |
| 670 | 属性 title | Goal setting recomputes readiness locally |
| 679 | JSX文字 | Accepted goal |
| 683 | JSX文字 | Selected suggestion |
| 693 | 属性 title | Event goal routes use shared envelopes |
| 698 | JSX文字 | The declared probes cover event goal setting and readiness reads. Empty and controlled failure probes document non-success states without leaving the mock boundary. |
| 704 | JSX文字 | Failure mapping |
| 712 | JSX文字 | maps to a shared failure envelope. |
| 717 | 属性 aria-label | Event goal readiness API probes |
| 729 | JSX文字 | Expected status: |
| 736 | 属性 title | Replacement notes stay with the event goal capability |
| 742 | JSX文字 | Handoff doc |
| 748 | JSX文字 | Switch |
| 750 | JSX文字 | ORBIT_EVENT_GOAL_READINESS_PROVIDER |

## repos/orbits/features/events/post-event-review/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/post-event-review/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 299 | OperatorCheckpoint | h3 | Operator sequence |  |
| 397 | StateComparison | h3 | row.label |  |
| 573 | PostEventContactReviewMockDemo | header |  | workbench-header |
| 575 | PostEventContactReviewMockDemo | h1 | Post-event contact review mock |  |
| 594 | PostEventContactReviewMockDemo | section | Post-event contact review states | workbench-grid |
| 690 | PostEventContactReviewMockDemo | h3 | contact.displayName |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 427 | form-submit-boundary/form · ReviewControlForm | Mock post-event contact review form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 434 | field/input · ReviewControlForm | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 440 | field/select · ReviewControlForm | success empty pending failure |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 447 | button/button · ReviewControlForm | Review contacts |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 471 | form-submit-boundary/form · ApiProbeActions | Run post-event review API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 476 | button/button · ApiProbeActions | Run review probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 480 | form-submit-boundary/form · ApiProbeActions | Run post-event contact confirmation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 485 | button/button · ApiProbeActions | Run confirm probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 489 | form-submit-boundary/form · ApiProbeActions | Run empty post-event review API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 494 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 498 | form-submit-boundary/form · ApiProbeActions | Run pending post-event confirmation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 503 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 507 | form-submit-boundary/form · ApiProbeActions | Run controlled failure post-event review API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 512 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 120 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/post-event" |
| 127 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/post-event/confirm" |
| 134 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/post-event?scenario=empty" |
| 142 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/post-event/confirm?scenario=pending" |
| 149 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/post-event?scenario=failure" |
| 428 | ReviewControlForm | 路径常量 | 见调用/handler | "/api/events/demo-event-1/post-event" |
| 472 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/post-event" |
| 481 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/post-event/confirm" |
| 490 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/post-event?scenario=empty" |
| 499 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/post-event/confirm?scenario=pending" |
| 508 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/post-event?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 119 | 文案/数据常量 label | "Review post-event contacts" |
| 126 | 文案/数据常量 label | "Confirm reviewed contacts" |
| 133 | 文案/数据常量 label | "Empty review" |
| 140 | 文案/数据常量 label | "Pending confirmation guard" |
| 148 | 文案/数据常量 label | "Controlled failure" |
| 166 | 属性 aria-label | Post-event review evidence |
| 187 | JSX文字 | at |
| 204 | 属性 aria-label | Post-event review tags |
| 220 | 属性 aria-label | Mock-only post-event review execution checks |
| 225 | JSX文字 | Model work |
| 231 | JSX文字 | External network |
| 237 | JSX文字 | Database read |
| 243 | JSX文字 | Batch persistence |
| 258 | 属性 title | Ready for verifier review |
| 264 | JSX文字 | Scan this first: the post-event contact summaries, tags, and follow-up suggestions come from deterministic local fixtures. |
| 267 | 属性 aria-label | Post-event review operator checkpoint |
| 272 | JSX文字 | Event |
| 278 | JSX文字 | New contacts |
| 279 | JSX文字 | contacts awaiting review |
| 282 | JSX文字 | Review id |
| 288 | JSX文字 | Persistence guard |
| 290 | JSX文字 | batch persistence |
| 295 | 属性 aria-label | Operator sequence |
| 299 | JSX文字 | Operator sequence |
| 302 | JSX文字 | Scan event source context |
| 302 | JSX文字 | and verify the event id, review id, and source-backed evidence before reading details. |
| 306 | JSX文字 | Compare state matrix |
| 306 | JSX文字 | to confirm success, empty, pending, and failure behavior all come from the mock service. |
| 310 | JSX文字 | Confirm preview only |
| 310 | JSX文字 | ; no batch persistence, provider calls, external sends, notifications, or model execution are allowed in this sprint. |
| 333 | 文案/数据常量 label | "Success" |
| 344 | 文案/数据常量 label | "Empty" |
| 353 | 文案/数据常量 label | "Pending" |
| 364 | 文案/数据常量 label | "Failure" |
| 377 | 属性 title | Compare mock outcomes before drilling in |
| 383 | JSX文字 | Compare success, empty, pending, and failure outcomes from the mock service before reading the detailed panels. |
| 386 | 属性 aria-label | Post-event contact review state comparison |
| 400 | JSX文字 | Result |
| 404 | JSX文字 | Operator check |
| 417 | 属性 title | Review post-event contacts |
| 423 | JSX文字 | This form requests the route handler that uses the post-event review mock service. Confirming records remains a preview until a live provider and confirmation guard are approved. |
| 427 | 属性 aria-label | Mock post-event contact review form |
| 433 | 属性 label | Event id |
| 436 | 属性 label | Scenario |
| 441 | JSX文字 | success |
| 442 | JSX文字 | empty |
| 443 | JSX文字 | pending |
| 444 | JSX文字 | failure |
| 448 | JSX文字 | Review contacts |
| 451 | 属性 aria-label | Post-event review guardrails |
| 452 | JSX文字 | source-backed contacts |
| 453 | JSX文字 | event-only review |
| 454 | JSX文字 | confirm before external action |
| 462 | 属性 aria-label | Post-event contact review API probe actions |
| 467 | JSX文字 | These probes exercise review, confirmation, empty, pending, and controlled failure paths inside the mock boundary. |
| 471 | 属性 aria-label | Run post-event review API probe |
| 477 | JSX文字 | Run review probe |
| 480 | 属性 aria-label | Run post-event contact confirmation API probe |
| 486 | JSX文字 | Run confirm probe |
| 489 | 属性 aria-label | Run empty post-event review API probe |
| 495 | JSX文字 | Run empty probe |
| 498 | 属性 aria-label | Run pending post-event confirmation API probe |
| 504 | JSX文字 | Run pending probe |
| 507 | 属性 aria-label | Run controlled failure post-event review API probe |
| 513 | JSX文字 | Run failure probe |
| 534 | JSX文字 | batch persistence |
| 574 | JSX文字 | Developer capability runtime |
| 575 | JSX文字 | Post-event contact review mock |
| 577 | JSX文字 | Mock-first boundary for reviewing event-sourced new contacts, summaries, tags, and follow-up suggestions without storage, external actions, provider calls, or model execution. |
| 594 | 属性 aria-label | Post-event contact review states |
| 598 | 属性 title | Success state |
| 615 | 属性 title | Empty state |
| 621 | JSX文字 | Contacts |
| 622 | JSX文字 | contacts ready |
| 625 | JSX文字 | Next action |
| 636 | 属性 title | Pending state |
| 642 | JSX文字 | Contacts |
| 643 | JSX文字 | contacts ready |
| 646 | JSX文字 | Next action |
| 657 | 属性 title | Failure state |
| 662 | JSX文字 | Error code |
| 668 | JSX文字 | Message |
| 672 | JSX文字 | Recovery |
| 682 | 属性 title | Summaries, tags, and follow-up suggestions |
| 694 | JSX文字 | Why now |
| 698 | JSX文字 | Follow-up suggestion |
| 702 | JSX文字 | External send |
| 718 | 属性 title | Confirmation preview |
| 722 | 属性 title | Declared route probes and expected envelopes |
| 732 | JSX文字 | expects |
| 740 | 属性 title | Replacement notes stay with the capability |
| 745 | JSX文字 | The live implementation notes stay inside the capability root so the switch from deterministic fixtures to providers is auditable. |
| 750 | JSX文字 | Live notes |
| 756 | JSX文字 | Switch |
| 758 | JSX文字 | ORBIT_POST_EVENT_REVIEW_PROVIDER |
| 758 | JSX文字 | selects the live provider after replacement tests exist. |
| 763 | 属性 aria-label | Live handoff evidence excerpts |
| 768 | JSX文字 | Live handoff evidence excerpts |

## repos/orbits/features/events/want-connect/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/events/want-connect/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 379 | StateComparison | h3 | row.label |  |
| 531 | OnSiteWantToConnectMockDemo | header |  | workbench-header |
| 533 | OnSiteWantToConnectMockDemo | h1 | On-site want-to-connect mock |  |
| 552 | OnSiteWantToConnectMockDemo | section | On-site want-to-connect states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 409 | form-submit-boundary/form · IntentForm | Mock on-site want-to-connect intent form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 416 | field/input · IntentForm | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 422 | field/select · IntentForm | Priya Shah Aiko Mori |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 427 | button/button · IntentForm | Record intent |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 451 | form-submit-boundary/form · ApiProbeActions | Run on-site want-to-connect intent API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 456 | button/button · ApiProbeActions | Run intent probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 460 | form-submit-boundary/form · ApiProbeActions | Run on-site want-to-connect matches API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 465 | button/button · ApiProbeActions | Run matches probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 469 | form-submit-boundary/form · ApiProbeActions | Run empty on-site want-to-connect API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 474 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 478 | form-submit-boundary/form · ApiProbeActions | Run pending on-site want-to-connect API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 483 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 487 | form-submit-boundary/form · ApiProbeActions | Run controlled failure on-site want-to-connect API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 492 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 104 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/want-to-connect" |
| 111 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/matches" |
| 118 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/events/demo-event-1/matches?scenario=empty" |
| 126 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/want-to-connect?scenario=pending" |
| 134 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/events/demo-event-1/want-to-connect?scenario=failure" |
| 410 | IntentForm | 路径常量 | 见调用/handler | "/api/events/demo-event-1/want-to-connect" |
| 452 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/want-to-connect" |
| 461 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/matches" |
| 470 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/matches?scenario=empty" |
| 479 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/want-to-connect?scenario=pending" |
| 488 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/events/demo-event-1/want-to-connect?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 103 | 文案/数据常量 label | "Record want-to-connect intent" |
| 110 | 文案/数据常量 label | "Read mutual-interest matches" |
| 117 | 文案/数据常量 label | "Empty match list" |
| 124 | 文案/数据常量 label | "Pending target interest" |
| 132 | 文案/数据常量 label | "Controlled failure" |
| 151 | 属性 aria-label | On-site want-to-connect evidence |
| 172 | JSX文字 | at |
| 234 | 属性 aria-label | Mock-only on-site want-to-connect execution checks |
| 239 | JSX文字 | Real-time presence |
| 245 | JSX文字 | Peer notifications |
| 251 | JSX文字 | External messaging |
| 266 | 属性 title | Ready for verifier review |
| 272 | JSX文字 | Scan this first: want-to-connect intent, mutual interest, and the match success notice all come from local event fixtures. |
| 275 | 属性 aria-label | On-site want-to-connect operator checkpoint |
| 280 | JSX文字 | Event |
| 286 | JSX文字 | Mutual interest |
| 288 | JSX文字 | by local fixture rule. |
| 292 | JSX文字 | Match success notice |
| 296 | JSX文字 | Mock execution |
| 298 | JSX文字 | real-time presence |
| 298 | JSX文字 | ; peer notifications |
| 300 | JSX文字 | ; external messaging |
| 322 | 文案/数据常量 label | "Success" |
| 330 | 文案/数据常量 label | "Empty" |
| 338 | 文案/数据常量 label | "Pending" |
| 347 | 文案/数据常量 label | "Failure" |
| 359 | 属性 title | Compare mock outcomes before drilling in |
| 365 | JSX文字 | Compare success, empty, pending, and failure outcomes from the mock service before reading the detailed panels. |
| 368 | 属性 aria-label | On-site want-to-connect state comparison |
| 382 | JSX文字 | Result |
| 386 | JSX文字 | Operator check |
| 399 | 属性 title | Record want-to-connect intent |
| 405 | JSX文字 | This form posts to the route handler that uses the on-site want-to-connect mock service. The target attendee stays inside the deterministic fixture until a live provider is approved. |
| 409 | 属性 aria-label | Mock on-site want-to-connect intent form |
| 415 | 属性 label | Event id |
| 418 | 属性 label | Target attendee |
| 423 | JSX文字 | Priya Shah |
| 424 | JSX文字 | Aiko Mori |
| 428 | JSX文字 | Record intent |
| 431 | 属性 aria-label | On-site want-to-connect guardrails |
| 432 | JSX文字 | local mutual-interest fixture |
| 433 | JSX文字 | event-only context |
| 434 | JSX文字 | confirm before message |
| 442 | 属性 aria-label | On-site want-to-connect API probe actions |
| 447 | JSX文字 | These probes exercise intent creation, match listing, empty, pending, and controlled failure paths inside the mock boundary. |
| 451 | 属性 aria-label | Run on-site want-to-connect intent API probe |
| 457 | JSX文字 | Run intent probe |
| 460 | 属性 aria-label | Run on-site want-to-connect matches API probe |
| 466 | JSX文字 | Run matches probe |
| 469 | 属性 aria-label | Run empty on-site want-to-connect API probe |
| 475 | JSX文字 | Run empty probe |
| 478 | 属性 aria-label | Run pending on-site want-to-connect API probe |
| 484 | JSX文字 | Run pending probe |
| 487 | 属性 aria-label | Run controlled failure on-site want-to-connect API probe |
| 493 | JSX文字 | Run failure probe |
| 532 | JSX文字 | Developer capability runtime |
| 533 | JSX文字 | On-site want-to-connect mock |
| 535 | JSX文字 | Mock-first boundary for recording in-room want-to-connect intent, checking deterministic mutual interest, and preparing a match success notice without live presence or message delivery. |
| 552 | 属性 aria-label | On-site want-to-connect states |
| 556 | 属性 title | Success state |
| 566 | JSX文字 | Intent |
| 572 | JSX文字 | Mutual interest |
| 576 | JSX文字 | Match success notice |
| 587 | 属性 title | Empty state |
| 593 | JSX文字 | Matches |
| 594 | JSX文字 | No match success notices are ready. |
| 597 | JSX文字 | Next action |
| 608 | 属性 title | Pending state |
| 614 | JSX文字 | Target attendee |
| 615 | JSX文字 | Aiko Mori |
| 618 | JSX文字 | Mutual interest |
| 624 | JSX文字 | Next action |
| 635 | 属性 title | Failure state |
| 640 | JSX文字 | Error code |
| 646 | JSX文字 | Message |
| 650 | JSX文字 | Recovery |
| 660 | 属性 title | Participants carry event context and evidence |
| 667 | JSX文字 | Participant rows are deterministic fixture records. They are not presence subscriptions and do not deliver peer updates. |
| 679 | 属性 title | Mutual interest stays reviewable before action |
| 687 | JSX文字 | The mock sets real-time presence, peer notification, external messaging, database, calendar, email, notification, and model execution flags to false. |
| 695 | 属性 title | On-site want-to-connect routes use shared envelopes |
| 700 | JSX文字 | The declared probes cover intent creation and match read routes. Empty and controlled failure probes document non-success states without leaving the mock boundary. |
| 706 | JSX文字 | Failure mapping |
| 711 | JSX文字 | maps to a shared failure envelope. |
| 716 | 属性 aria-label | On-site want-to-connect API probes |
| 728 | JSX文字 | Expected status: |
| 735 | 属性 title | Replacement notes stay with the on-site event capability |
| 741 | JSX文字 | Handoff doc |
| 747 | JSX文字 | Switch |
| 749 | JSX文字 | ORBIT_WANT_CONNECT_PROVIDER |


