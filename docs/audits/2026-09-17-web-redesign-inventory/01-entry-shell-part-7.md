| 44 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/permissions?scenario=pending" |
| 51 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/permissions/calendar/request" |
| 53 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/permissions/calendar/request" |
| 60 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/permissions/calendar/request?scenario=blocked" |
| 62 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/permissions/calendar/request?scenario=blocked" |
| 69 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/permissions?scenario=failure" |
| 71 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/permissions?scenario=failure" |
| 253 | PermissionStateCapabilityDemo | 路径常量 | 见调用/handler | "/api/permissions/calendar/request" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 26 | 文案/数据常量 label | "Permission state" |
| 34 | 文案/数据常量 label | "Empty workflow" |
| 41 | 文案/数据常量 label | "Pending calendar review" |
| 50 | 文案/数据常量 label | "Calendar request" |
| 59 | 文案/数据常量 label | "Blocked request" |
| 68 | 文案/数据常量 label | "Controlled failure" |
| 80 | 属性 aria-label | Permission state evidence |
| 101 | JSX文字 | for |
| 131 | JSX文字 | Developer capability runtime |
| 132 | JSX文字 | Permission state and staged authorization mock |
| 134 | JSX文字 | Mock-first boundary for contacts, calendar, email, notifications, camera, business-card scan, event data, and chat analysis permissions. Sensitive access is rehearsed as sourced staged authorization, not as browser, device, account, or provider work. |
| 141 | 属性 aria-label | Permission state and staged authorization states |
| 145 | 属性 title | Success state |
| 161 | 属性 title | Empty state |
| 167 | JSX文字 | Selected workflow |
| 168 | JSX文字 | No permission workflow is active in this scenario. |
| 171 | JSX文字 | Source |
| 182 | 属性 title | Pending state |
| 194 | 属性 title | Failure state |
| 199 | JSX文字 | Error code |
| 205 | JSX文字 | Message |
| 209 | JSX文字 | Recovery |
| 219 | 属性 title | Calendar access is a review payload, not a redirect |
| 228 | JSX文字 | Request id |
| 234 | JSX文字 | Intent |
| 237 | JSX文字 | remains inside a deterministic review state. |
| 241 | JSX文字 | Mock replacement |
| 243 | JSX文字 | No browser prompt. No provider redirect. No device access. |
| 247 | 属性 aria-label | Permission guardrails |
| 248 | JSX文字 | mock only |
| 249 | JSX文字 | explicit review |
| 250 | JSX文字 | source-backed permission |
| 252 | 属性 aria-label | Run staged calendar authorization review |
| 264 | JSX文字 | Run staged calendar review |
| 268 | JSX文字 | This submits to the mock route and renders an API envelope response; it never starts OAuth, browser permission prompts, camera access, notifications, or provider authorization. |
| 276 | 属性 title | Permission routes use shared envelopes |
| 281 | JSX文字 | Run these probes against the dev server to verify success, empty, pending, staged request, blocked request, and controlled failure envelopes inside the mock boundary. |
| 287 | JSX文字 | Permission list |
| 289 | JSX文字 | GET /api/permissions |
| 289 | JSX文字 | returns the deterministic state for every permission boundary. |
| 294 | JSX文字 | Calendar request |
| 296 | JSX文字 | POST /api/permissions/calendar/request |
| 296 | JSX文字 | returns the staged review payload required before calendar context is used. |
| 301 | JSX文字 | Failure mapping |
| 309 | JSX文字 | maps to a shared failure envelope. |
| 313 | 属性 aria-label | Permission state API probes |
| 325 | JSX文字 | Expected status: |
| 334 | 属性 title | Replacement notes stay with the permission capability |
| 340 | JSX文字 | Handoff doc |
| 346 | JSX文字 | Provider files |
| 349 | JSX文字 | features/permissions/live-service.ts |
| 351 | JSX文字 | replaces mock fixtures only after consent, account, browser, device, event, chat, calendar, email, and reminder adapters have replacement tests. |
| 357 | JSX文字 | Switch and env |
| 359 | JSX文字 | Feature mode stays explicit, and live mode requires |
| 360 | JSX文字 | ORBIT_PERMISSION_AUTH_PROVIDER |
| 360 | JSX文字 | before any staged review can resolve to a real provider. |
| 365 | JSX文字 | Privacy and tests |
| 367 | JSX文字 | Replacement tests must preserve source and evidence provenance, prove sensitive actions stay confirmed, and hide raw provider errors from the API envelope. |

## repos/orbits/features/permissions/sensitive-action-confirmation-guard/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/permissions/sensitive-action-confirmation-guard/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 160 | SensitiveActionConfirmationGuardDemo | header |  | workbench-header |
| 162 | SensitiveActionConfirmationGuardDemo | h1 | Sensitive action confirmation guard |  |
| 171 | SensitiveActionConfirmationGuardDemo | section | Sensitive action confirmation guard states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 287 | form-submit-boundary/form · SensitiveActionConfirmationGuardDemo | Approve demo confirmation |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 292 | button/button · SensitiveActionConfirmationGuardDemo | Approve mock action |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 296 | form-submit-boundary/form · SensitiveActionConfirmationGuardDemo | Reject demo confirmation |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 301 | button/button · SensitiveActionConfirmationGuardDemo | Reject mock action |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 27 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/confirmations/demo-confirmation-1/approve" |
| 29 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/confirmations/demo-confirmation-1/approve" |
| 36 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/confirmations/demo-confirmation-1/reject" |
| 38 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/confirmations/demo-confirmation-1/reject" |
| 45 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/confirmations/missing-confirmation/approve" |
| 47 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/confirmations/missing-confirmation/approve" |
| 55 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/confirmations/demo-confirmation-1/reject?scenario=failure" |
| 57 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/confirmations/demo-confirmation-1/reject?scenario=failure" |
| 288 | SensitiveActionConfirmationGuardDemo | 路径常量 | 见调用/handler | "/api/confirmations/demo-confirmation-1/approve" |
| 297 | SensitiveActionConfirmationGuardDemo | 路径常量 | 见调用/handler | "/api/confirmations/demo-confirmation-1/reject" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 26 | 文案/数据常量 label | "Approve confirmation" |
| 35 | 文案/数据常量 label | "Reject confirmation" |
| 44 | 文案/数据常量 label | "Missing confirmation" |
| 53 | 文案/数据常量 label | "Controlled failure" |
| 66 | 属性 aria-label | Confirmation guard evidence |
| 87 | JSX文字 | guards |
| 104 | 属性 aria-label | Pending action under review |
| 105 | JSX文字 | Pending action under review |
| 108 | JSX文字 | Action |
| 110 | JSX文字 | for |
| 115 | JSX文字 | Source context |
| 123 | JSX文字 | Payload preview |
| 127 | JSX文字 | Mock effect |
| 161 | JSX文字 | Developer capability runtime |
| 162 | JSX文字 | Sensitive action confirmation guard |
| 164 | JSX文字 | Mock-first confirmation boundary for message sends, contact writes, calendar event creation, and profile updates. Every action resolves to deterministic review data instead of performing the sensitive operation. |
| 171 | 属性 aria-label | Sensitive action confirmation guard states |
| 175 | 属性 title | Success state |
| 193 | 属性 title | Empty state |
| 199 | JSX文字 | Queued action |
| 200 | JSX文字 | No sensitive action is waiting in this scenario. |
| 203 | JSX文字 | Source |
| 214 | 属性 title | Pending state |
| 228 | 属性 title | Failure state |
| 233 | JSX文字 | Error code |
| 239 | JSX文字 | Message |
| 243 | JSX文字 | Recovery |
| 253 | 属性 title | Approve or reject without executing the action |
| 265 | JSX文字 | Approved decision |
| 267 | JSX文字 | keeps |
| 268 | JSX文字 | externalActionExecuted |
| 268 | JSX文字 | set to |
| 269 | JSX文字 | false |
| 273 | JSX文字 | Rejected decision |
| 275 | JSX文字 | records the operator choice while the draft stays in review. |
| 280 | 属性 aria-label | Confirmation guardrails |
| 281 | JSX文字 | mock only |
| 282 | JSX文字 | explicit confirmation |
| 283 | JSX文字 | source-backed action |
| 286 | 属性 aria-label | Confirmation actions |
| 287 | 属性 aria-label | Approve demo confirmation |
| 293 | JSX文字 | Approve mock action |
| 296 | 属性 aria-label | Reject demo confirmation |
| 302 | JSX文字 | Reject mock action |
| 307 | JSX文字 | The forms return API envelopes from the mock guard. They do not send messages, write contacts, create calendar events, or save profile fields. |
| 315 | 属性 title | Confirmation routes use shared envelopes |
| 320 | JSX文字 | Run these probes against the dev server to verify approve, reject, missing confirmation, and controlled failure envelopes inside the mock boundary. |
| 326 | JSX文字 | Approve route |
| 328 | JSX文字 | POST /api/confirmations/demo-confirmation-1/approve |
| 329 | JSX文字 | returns an approval record and leaves the action unexecuted. |
| 333 | JSX文字 | Reject route |
| 335 | JSX文字 | POST /api/confirmations/demo-confirmation-1/reject |
| 336 | JSX文字 | returns a rejection record and keeps the source draft in review. |
| 340 | JSX文字 | Failure mapping |
| 348 | JSX文字 | maps to a shared failure envelope. |
| 352 | 属性 aria-label | Confirmation guard API probes |
| 364 | JSX文字 | Expected status: |
| 373 | 属性 title | Replacement notes stay with the confirmation capability |
| 379 | JSX文字 | Handoff doc |
| 385 | JSX文字 | Provider files |
| 388 | JSX文字 | features/permissions/live-confirmation-service.ts |
| 390 | JSX文字 | replaces the mock only after approve and reject paths have replacement tests for every sensitive action kind. |
| 395 | JSX文字 | Switch and env |
| 397 | JSX文字 | Feature mode stays explicit, and live mode requires |
| 398 | JSX文字 | ORBIT_CONFIRMATION_PROVIDER |
| 398 | JSX文字 | before any sensitive action can leave the mock sandbox. |
| 403 | JSX文字 | Privacy and tests |
| 405 | JSX文字 | Replacement tests must preserve source and evidence provenance, prove every decision was confirmed, and keep raw service errors out of API envelopes. |

## repos/orbits/features/recommendations/event-recommendation-and-opening-line-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/recommendations/event-recommendation-and-opening-line-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 512 | EventRecommendationOpeningLineMockDemo | header |  | workbench-header |
| 514 | EventRecommendationOpeningLineMockDemo | h1 | Event recommendation and opening-line mock |  |
| 540 | EventRecommendationOpeningLineMockDemo | section | Event recommendation states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 356 | form-submit-boundary/form · OpeningLineComposer | Mock event opening-line form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 363 | field/input · OpeningLineComposer | Event id |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 369 | field/select · OpeningLineComposer | Mina Park Leo Grant Sam Rivera |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 376 | field/select · OpeningLineComposer | Warm context Context question Post-event follow-up |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 382 | button/button · OpeningLineComposer | Compose mock line |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 406 | form-submit-boundary/form · ApiProbeActions | Run event recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 411 | button/button · ApiProbeActions | Run ranking probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 415 | form-submit-boundary/form · ApiProbeActions | Run event opening-line API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 420 | button/button · ApiProbeActions | Run line probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 424 | form-submit-boundary/form · ApiProbeActions | Run empty event recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 429 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 433 | form-submit-boundary/form · ApiProbeActions | Run pending event recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 438 | button/button · ApiProbeActions | Run pending probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 442 | form-submit-boundary/form · ApiProbeActions | Run controlled failure event opening-line API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 447 | button/button · ApiProbeActions | Run failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 451 | form-submit-boundary/form · ApiProbeActions | Run missing event recommendation API probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 456 | button/button · ApiProbeActions | Run missing-event probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 101 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/recommendations/event/demo-event-1" |
| 108 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/recommendations/event/demo-event-1/opening-line" |
| 115 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/recommendations/event/demo-event-1?scenario=empty" |
| 122 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/recommendations/event/demo-event-1?scenario=pending" |
| 130 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/recommendations/event/demo-event-1/opening-line?scenario=failure" |
| 137 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/recommendations/event/missing-event" |
| 357 | OpeningLineComposer | 路径常量 | 见调用/handler | "/api/recommendations/event/demo-event-1/opening-line" |
| 407 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/recommendations/event/demo-event-1" |
| 416 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/recommendations/event/demo-event-1/opening-line" |
| 425 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/recommendations/event/demo-event-1?scenario=empty" |
| 434 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/recommendations/event/demo-event-1?scenario=pending" |
| 443 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/recommendations/event/demo-event-1/opening-line?scenario=failure" |
| 452 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/recommendations/event/missing-event" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 100 | 文案/数据常量 label | "Rank event attendees" |
| 107 | 文案/数据常量 label | "Compose opening line" |
| 114 | 文案/数据常量 label | "Empty recommendations" |
| 121 | 文案/数据常量 label | "Pending recommendations" |
| 128 | 文案/数据常量 label | "Controlled failure" |
| 136 | 文案/数据常量 label | "Missing event" |
| 154 | 属性 aria-label | Event recommendation evidence |
| 177 | JSX文字 | at |
| 178 | JSX文字 | . Score |
| 198 | JSX文字 | Weight |
| 217 | 属性 aria-label | Mock-only event recommendation execution checks |
| 222 | JSX文字 | Vector search |
| 228 | JSX文字 | Model calls |
| 234 | JSX文字 | Ranking provider |
| 240 | JSX文字 | Database queries |
| 259 | 属性 title | Ready for verifier review |
| 265 | JSX文字 | Scan this first: ranked attendees, match signals, and the opening line come from local fixtures and deterministic rules. |
| 268 | 属性 aria-label | Event recommendation operator checkpoint |
| 273 | JSX文字 | Event |
| 279 | JSX文字 | Top attendee |
| 281 | JSX文字 | at |
| 286 | JSX文字 | Ranked attendees |
| 287 | JSX文字 | local recommendations. |
| 290 | JSX文字 | Opening line |
| 294 | JSX文字 | Mock execution |
| 296 | JSX文字 | vector search |
| 296 | JSX文字 | ; model calls |
| 317 | 属性 title | Scan states first |
| 318 | 属性 aria-label | Event recommendation state matrix |
| 323 | JSX文字 | Success: |
| 323 | JSX文字 | ranked attendees |
| 327 | JSX文字 | Empty: no attendees ready |
| 331 | JSX文字 | Pending: recommendations paused |
| 335 | JSX文字 | Failure: controlled error |
| 347 | 属性 title | Compose a source-backed opener |
| 353 | JSX文字 | This form posts to the route handler that uses the recommendation mock service. It selects a ranked attendee and returns a local opening line. |
| 356 | 属性 aria-label | Mock event opening-line form |
| 362 | 属性 label | Event id |
| 365 | 属性 label | Attendee |
| 370 | JSX文字 | Mina Park |
| 371 | JSX文字 | Leo Grant |
| 372 | JSX文字 | Sam Rivera |
| 375 | 属性 label | Style |
| 377 | JSX文字 | Warm context |
| 378 | JSX文字 | Context question |
| 379 | JSX文字 | Post-event follow-up |
| 383 | JSX文字 | Compose mock line |
| 386 | 属性 aria-label | Event recommendation guardrails |
| 387 | JSX文字 | fixture evidence |
| 388 | JSX文字 | no external profile lookup |
| 389 | JSX文字 | review before outreach |
| 397 | 属性 aria-label | Event recommendation API probe actions |
| 402 | JSX文字 | These probes exercise ranking, opening-line composition, empty, pending, and controlled failure paths inside the mock boundary. |
| 406 | 属性 aria-label | Run event recommendation API probe |
| 412 | JSX文字 | Run ranking probe |
| 415 | 属性 aria-label | Run event opening-line API probe |
| 421 | JSX文字 | Run line probe |
| 424 | 属性 aria-label | Run empty event recommendation API probe |
| 430 | JSX文字 | Run empty probe |
| 433 | 属性 aria-label | Run pending event recommendation API probe |
| 439 | JSX文字 | Run pending probe |
| 442 | 属性 aria-label | Run controlled failure event opening-line API probe |
| 448 | JSX文字 | Run failure probe |
| 451 | 属性 aria-label | Run missing event recommendation API probe |
| 457 | JSX文字 | Run missing-event probe |
| 513 | JSX文字 | Developer capability runtime |
| 514 | JSX文字 | Event recommendation and opening-line mock |
| 516 | JSX文字 | Mock-first boundary for ranking event attendees, explaining match signals, and composing source-backed opening lines before live ranking or generation providers exist. |
| 540 | 属性 aria-label | Event recommendation states |
| 544 | 属性 title | Success state |
| 554 | JSX文字 | Event |
| 556 | JSX文字 | at |
| 561 | JSX文字 | Ranked recommendations |
| 563 | JSX文字 | attendees ranked by local rules. |
| 575 | 属性 title | Empty state |
| 581 | JSX文字 | Ranked recommendations |
| 582 | JSX文字 | No attendee recommendations are shown. |
| 585 | JSX文字 | Opening lines |
| 586 | JSX文字 | No opening lines are composed in this empty state. |
| 596 | 属性 title | Pending state |
| 602 | JSX文字 | Recommendation state |
| 608 | JSX文字 | Next action |
| 619 | 属性 title | Failure state |
| 624 | JSX文字 | Error code |
| 630 | JSX文字 | Message |
| 634 | JSX文字 | Recovery |
| 644 | 属性 title | Attendee order explains why to approach |
| 651 | JSX文字 | Ranking is deterministic and event-grounded. Each attendee carries reasons, match signals, opening-line draft, and provenance. |
| 662 | 属性 title | Signals replace vector ranking in the mock |
| 672 | JSX文字 | The mock sets vector search, ranking provider, model, database, email, calendar, and notification execution flags to false. |
| 680 | 属性 title | Line stays attached to recommendation evidence |
| 689 | JSX文字 | Attendee |
| 695 | JSX文字 | Opening line |
| 699 | JSX文字 | Generation |
| 712 | 属性 title | Recommendation routes use shared envelopes |
| 717 | JSX文字 | The declared probes cover attendee ranking and opening-line composition. Empty and controlled failure probes document non-success states without leaving the mock boundary. |
| 723 | JSX文字 | Failure mapping |
| 731 | JSX文字 | maps to a shared failure envelope. |
| 736 | 属性 aria-label | Event recommendation API probes |
| 748 | JSX文字 | Expected status: |
| 755 | 属性 title | Replacement notes stay with recommendations |
| 761 | JSX文字 | Handoff doc |
| 767 | JSX文字 | Switch |
| 769 | JSX文字 | ORBIT_EVENT_RECOMMENDATION_PROVIDER |

## repos/orbits/features/recommendations/event-value-recommendation-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/recommendations/event-value-recommendation-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 357 | EventValueRecommendationMockDemo | header |  | workbench-header |
| 359 | EventValueRecommendationMockDemo | h1 | Event value recommendation mock |  |
| 384 | EventValueRecommendationMockDemo | header |  | workbench-header |
| 386 | EventValueRecommendationMockDemo | h1 | Event value recommendation mock |  |
| 396 | EventValueRecommendationMockDemo | section | Event value recommendation capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 64 | (module / render callback) | 路径常量 | 见调用/handler | "/api/recommendations/events" |
| 72 | (module / render callback) | 路径常量 | 见调用/handler | "/api/recommendations/events/demo-event-1/accept" |
| 80 | (module / render callback) | 路径常量 | 见调用/handler | "/api/recommendations/events?scenario=empty" |
| 88 | (module / render callback) | 路径常量 | 见调用/handler | "/api/recommendations/events?scenario=pending" |
| 96 | (module / render callback) | 路径常量 | 见调用/handler | "/api/recommendations/events?scenario=failure" |
| 104 | (module / render callback) | 路径常量 | 见调用/handler | "/api/recommendations/events/missing-event/accept" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 62 | 文案/数据常量 label | "Recommended events" |
| 70 | 文案/数据常量 label | "Accept top event" |
| 78 | 文案/数据常量 label | "Empty recommendations" |
| 86 | 文案/数据常量 label | "Pending recommendations" |
| 94 | 文案/数据常量 label | "Controlled failure" |
| 102 | 文案/数据常量 label | "Missing event" |
| 127 | 属性 aria-label | Event value recommendation evidence |
| 150 | JSX文字 | Score |
| 151 | JSX文字 | relevant attendees in |
| 171 | JSX文字 | Weight |
| 185 | 属性 aria-label | Mock-only event value execution checks |
| 190 | JSX文字 | calendar sync |
| 196 | JSX文字 | event discovery feed |
| 204 | JSX文字 | database query |
| 210 | JSX文字 | model call |
| 227 | 属性 title | Ready for verifier review |
| 233 | JSX文字 | Scan this first: event value recommendations are ranked from profile goal, location, industry preference, attendee density, and calendar fit using only local fixtures. |
| 237 | 属性 aria-label | Event value recommendation operator checkpoint |
| 242 | JSX文字 | Profile goal |
| 246 | JSX文字 | Top event |
| 252 | JSX文字 | buyer urgency |
| 256 | JSX文字 | Calendar boundary |
| 257 | JSX文字 | calendar sync false |
| 260 | JSX文字 | Discovery boundary |
| 261 | JSX文字 | event discovery feed false |
| 281 | 属性 title | Harness-visible states |
| 282 | 属性 aria-label | Event value recommendation state matrix |
| 287 | JSX文字 | Success state |
| 288 | JSX文字 | Success: |
| 288 | JSX文字 | event recommendations |
| 291 | JSX文字 | Empty state |
| 292 | JSX文字 | Empty: no matching events |
| 295 | JSX文字 | Pending state |
| 296 | JSX文字 | Pending: calendar fit review |
| 299 | JSX文字 | Failure state |
| 301 | JSX文字 | Failure: controlled error |
| 306 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 358 | JSX文字 | Developer capability runtime |
| 359 | JSX文字 | Event value recommendation mock |
| 361 | JSX文字 | The deterministic event value recommendation fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 385 | JSX文字 | Developer capability runtime |
| 386 | JSX文字 | Event value recommendation mock |
| 388 | JSX文字 | Dev-only surface for verifying the event value recommendation boundary. It ranks local event fixtures against profile intent, location, industry preference, attendee density, and calendar fit. |
| 396 | 属性 aria-label | Event value recommendation capability details |
| 400 | 属性 title | Recommended events |
| 405 | 属性 title | topRecommendation.title |
| 410 | 属性 title | Local action sandbox |
| 414 | JSX文字 | Accepted event |
| 424 | JSX文字 | External action |
| 425 | JSX文字 | No network, calendar, notification, or database write. |
| 438 | 属性 title | Declared probes |
| 444 | JSX文字 | Expected status: |
| 452 | 属性 title | Replacement notes |
| 455 | JSX文字 | Handoff doc |
| 461 | JSX文字 | Switch mechanism |
| 463 | JSX文字 | ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER |
| 463 | JSX文字 | remains documented before any live service is wired. |

## repos/orbits/features/search/relationship-natural-search-mock/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/features/search/relationship-natural-search-mock/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 212 | ResultList | header |  |  |
| 216 | ResultList | h3 | result.displayName | relationship-name |
| 450 | RelationshipNaturalSearchMockDemo | header |  | workbench-header |
| 452 | RelationshipNaturalSearchMockDemo | h1 | Relationship natural search mock |  |
| 462 | RelationshipNaturalSearchMockDemo | section | Relationship natural search mock states | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 263 | form-submit-boundary/form · SearchPanel | Mock relationship natural search form |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 270 | field/input · SearchPanel | Try pilot operator intro |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 277 | field/select · SearchPanel | Any intent Find warm intro Explore partnership Recover event follow-up Source customer reference |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 290 | field/select · SearchPanel | Any industry Climate Fintech Enterprise SaaS |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 297 | button/button · SearchPanel | Search relationships |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 321 | form-submit-boundary/form · ApiProbeActions | Run relationship natural search suggestions probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 326 | button/button · ApiProbeActions | Run suggestions probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 330 | form-submit-boundary/form · ApiProbeActions | Run empty relationship natural search probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 335 | button/button · ApiProbeActions | Run empty probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 339 | form-submit-boundary/form · ApiProbeActions | Run controlled failure relationship natural search probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 344 | button/button · ApiProbeActions | Run controlled failure probe |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 116 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/search/relationships" |
| 123 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/search/suggestions" |
| 130 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/search/relationships?scenario=empty" |
| 136 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/search/relationships?scenario=failure" |
| 264 | SearchPanel | 路径常量 | 见调用/handler | "/api/search/relationships" |
| 322 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/search/suggestions" |
| 331 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/search/relationships?scenario=empty" |
| 340 | ApiProbeActions | 路径常量 | 见调用/handler | "/api/search/relationships?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 115 | 文案/数据常量 label | "Relationship search" |
| 122 | 文案/数据常量 label | "Search suggestions" |
| 129 | 文案/数据常量 label | "Empty search" |
| 135 | 文案/数据常量 label | "Controlled failure" |
| 145 | 属性 aria-label | Relationship natural search evidence |
| 179 | 属性 aria-label | Relationship natural search mock-only execution checks |
| 184 | JSX文字 | Semantic search |
| 185 | JSX文字 | semantic search executed: |
| 188 | JSX文字 | Embeddings |
| 189 | JSX文字 | embeddings generated: |
| 192 | JSX文字 | Cross-provider index |
| 193 | JSX文字 | cross-provider index queried: |
| 207 | 属性 aria-label | `Relationship natural search result for ${result.displayName}` |
| 214 | JSX文字 | at |
| 221 | JSX文字 | Why this connection exists |
| 225 | JSX文字 | Intent match |
| 229 | JSX文字 | Source |
| 235 | JSX文字 | Follow-up |
| 239 | JSX文字 | Next action |
| 254 | 属性 title | Ask for the relationship you need |
| 260 | JSX文字 | The form targets the same mock API route that evaluator probes call. Query and filters are resolved by local fixture rules only. |
| 263 | 属性 aria-label | Mock relationship natural search form |
| 269 | 属性 label | Natural query |
| 270 | 属性 placeholder | Try pilot operator intro |
| 276 | 属性 label | Business intent |
| 278 | JSX文字 | Any intent |
| 279 | JSX文字 | Find warm intro |
| 280 | JSX文字 | Explore partnership |
| 282 | JSX文字 | Recover event follow-up |
| 285 | JSX文字 | Source customer reference |
| 289 | 属性 label | Industry |
| 291 | JSX文字 | Any industry |
| 292 | JSX文字 | Climate |
| 293 | JSX文字 | Fintech |
| 294 | JSX文字 | Enterprise SaaS |
| 298 | JSX文字 | Search relationships |
| 301 | 属性 aria-label | Relationship natural search guardrails |
| 302 | JSX文字 | source evidence |
| 303 | JSX文字 | mock-only search |
| 304 | JSX文字 | follow-up context |
| 312 | 属性 aria-label | Relationship natural search API probe actions |
| 317 | JSX文字 | These probes exercise success, empty, suggestions, and controlled failure paths inside the relationship natural search mock boundary. |
| 321 | 属性 aria-label | Run relationship natural search suggestions probe |
| 327 | JSX文字 | Run suggestions probe |
| 330 | 属性 aria-label | Run empty relationship natural search probe |
| 336 | JSX文字 | Run empty probe |
| 339 | 属性 aria-label | Run controlled failure relationship natural search probe |
| 345 | JSX文字 | Run controlled failure probe |
| 361 | 属性 title | title |
| 370 | JSX文字 | State |
| 374 | JSX文字 | Results |
| 378 | JSX文字 | Next action |
| 383 | 属性 aria-label | Pending state diagnosis |
| 388 | JSX文字 | Pending state diagnosis |
| 390 | JSX文字 | Fixture review pending; the mock boundary is intentionally holding relationship results while live search, embeddings, and external indexes remain off. |
| 451 | JSX文字 | Developer capability runtime |
| 452 | JSX文字 | Relationship natural search mock |
| 454 | JSX文字 | Mock-first boundary for asking who Orbit knows by business intent, industry, source, value type, and follow-up status while every source and recommendation remains tied to fixture evidence. |
| 462 | 属性 aria-label | Relationship natural search mock states |
| 467 | 属性 title | Success state |
| 470 | 属性 title | Empty state |
| 473 | 属性 title | Pending state |
| 475 | 属性 title | Failure state |
| 484 | JSX文字 | Error code |
| 488 | JSX文字 | Recovery |
| 492 | JSX文字 | Evidence |
| 502 | 属性 title | Business intent filter preview |
| 511 | 属性 title | Prompt starters |
| 526 | 属性 title | Declared probes |
| 532 | JSX文字 | expects |
| 541 | 属性 title | Replacement notes stay with the capability |
| 547 | JSX文字 | Handoff doc |
| 553 | JSX文字 | Required coverage |
| 555 | JSX文字 | Live service/provider files, switch mechanism, required env vars and permissions, privacy and provenance constraints, and replacement tests are documented before live search is wired. |

## repos/orbits/shared/ai/ai-provider-mock-and-provenance-boundary/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/shared/ai/ai-provider-mock-and-provenance-boundary/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 361 | AiProviderMockProvenanceDemo | header |  | workbench-header |
| 363 | AiProviderMockProvenanceDemo | h1 | AI provider mock and provenance boundary |  |
| 384 | AiProviderMockProvenanceDemo | header |  | workbench-header |
| 386 | AiProviderMockProvenanceDemo | h1 | AI provider mock and provenance boundary |  |
| 396 | AiProviderMockProvenanceDemo | section | AI provider mock capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 81 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/mock/message-draft" |
| 83 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft" |
| 91 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/runs/demo-ai-run-1" |
| 92 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s http://localhost:3000/api/ai/runs/demo-ai-run-1" |
| 100 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/mock/message-draft?scenario=empty" |
| 102 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=empty" |
| 110 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/mock/message-draft?scenario=pending" |
| 112 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=pending" |
| 120 | (module / render callback) | 路径常量 | 见调用/handler | "/api/ai/mock/message-draft?scenario=failure" |
| 122 | (module / render callback) | 路径常量 | 见调用/handler | "curl -s -X POST http://localhost:3000/api/ai/mock/message-draft?scenario=failure" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 79 | 文案/数据常量 label | "Message draft" |
| 89 | 文案/数据常量 label | "Run provenance" |
| 98 | 文案/数据常量 label | "Empty message draft" |
| 108 | 文案/数据常量 label | "Pending provider guard" |
| 118 | 文案/数据常量 label | "Controlled failure" |
| 145 | 属性 aria-label | AI provider mock evidence ids |
| 157 | 属性 title | Ready for verifier review |
| 163 | JSX文字 | Scan this first: the AI-shaped result is generated by local mock rules. The record exposes prompt template id, input hash, output, fallback behavior, and provenance without live provider, network, device, database, email, calendar, or notification access. |
| 168 | 属性 aria-label | AI provider mock operator checkpoint |
| 173 | JSX文字 | Run id |
| 179 | JSX文字 | Prompt template |
| 185 | JSX文字 | Input hash |
| 191 | JSX文字 | Fallback behavior |
| 193 | JSX文字 | used |
| 197 | JSX文字 | Provider boundary |
| 198 | JSX文字 | live AI provider false |
| 208 | 属性 aria-label | Mock-only AI provider execution checks |
| 213 | JSX文字 | Provider request |
| 214 | JSX文字 | live AI provider false |
| 217 | JSX文字 | Network |
| 218 | JSX文字 | external network false |
| 221 | JSX文字 | Persistence |
| 222 | JSX文字 | database write false |
| 225 | JSX文字 | Fallback |
| 244 | JSX文字 | Prompt template |
| 250 | JSX文字 | Input hash |
| 256 | JSX文字 | Output |
| 260 | JSX文字 | Fallback behavior |
| 286 | 属性 title | Harness-visible states |
| 287 | 属性 aria-label | AI provider mock state matrix |
| 292 | JSX文字 | Success state |
| 295 | JSX文字 | Success probe: POST /api/ai/mock/message-draft |
| 298 | JSX文字 | Success: |
| 298 | JSX文字 | mock AI run |
| 302 | JSX文字 | Run state |
| 305 | JSX文字 | Run probe: GET /api/ai/runs/demo-ai-run-1 |
| 308 | JSX文字 | Run: provenance record available |
| 312 | JSX文字 | Empty state |
| 314 | JSX文字 | Empty: no prompt-ready relationship context |
| 318 | JSX文字 | Pending state |
| 319 | JSX文字 | Pending: local provider guard |
| 322 | JSX文字 | Failure state |
| 324 | JSX文字 | Failure: controlled error |
| 329 | JSX文字 | Empty and pending states stay successful envelopes; controlled failures are explicit service-unavailable envelopes. |
| 362 | JSX文字 | Developer capability runtime |
| 363 | JSX文字 | AI provider mock and provenance boundary |
| 365 | JSX文字 | The deterministic AI provider mock fixtures did not load, so the dev surface stopped inside a controlled local state. |
| 385 | JSX文字 | Developer capability runtime |
| 386 | JSX文字 | AI provider mock and provenance boundary |
| 388 | JSX文字 | Dev-only surface for verifying the mock AI provider boundary. It exposes prompt template ids, input hashes, outputs, fallback behavior, and run provenance while remaining fully local. |
| 396 | 属性 aria-label | AI provider mock capability details |
| 400 | 属性 title | Deterministic mock outputs |
| 411 | 属性 title | Provider boundaries |
| 414 | JSX文字 | AI-shaped output stays local until live provider files, explicit switch controls, privacy review, and replacement tests exist. |
| 427 | 属性 title | Declared probes are runnable |
| 432 | JSX文字 | Run these probes against the dev server to verify success, empty, pending, and failure envelopes without leaving the mock AI provider boundary. |
| 436 | 属性 aria-label | AI provider mock API probes |
| 448 | JSX文字 | Expected status: |
| 457 | 属性 title | Replacement notes |
| 460 | JSX文字 | Handoff doc |
| 466 | JSX文字 | Switch mechanism |
| 468 | JSX文字 | ORBIT_AI_PROVIDER_MODE |
| 468 | JSX文字 | and |
| 469 | JSX文字 | ORBIT_AI_PROVIDER |
| 469 | JSX文字 | stay documented before live provider adapters are wired. |

## repos/orbits/shared/mock/mock-data-mutation-reset-and-scenario-switcher/debug-view.tsx

源码：[debug-view.tsx](</Users/li/work/orbit/repos/orbits/shared/mock/mock-data-mutation-reset-and-scenario-switcher/debug-view.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 155 | ScenarioGrid | h3 | scenario.label | relationship-name |
| 379 | MockDataScenarioSwitcherDemo | header |  | workbench-header |
| 381 | MockDataScenarioSwitcherDemo | h1 | Mock data mutation reset and scenario switcher |  |
| 410 | MockDataScenarioSwitcherDemo | header |  | workbench-header |
| 412 | MockDataScenarioSwitcherDemo | h1 | Mock data mutation reset and scenario switcher |  |
| 425 | MockDataScenarioSwitcherDemo | section | Mock data scenario capability details | workbench-grid |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 75 | (module / render callback) | 路径常量 | 见调用/handler | "GET /api/mock/scenarios" |
| 81 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/mock/scenarios/post-event-demo/activate" |
| 87 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/mock/reset" |
| 93 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/mock/scenarios/error-demo/activate" |
| 99 | (module / render callback) | 路径常量 | 见调用/handler | "POST /api/mock/scenarios/unknown-scenario/activate" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 74 | 文案/数据常量 label | "Scenario list" |
| 80 | 文案/数据常量 label | "Activate post-event" |
| 86 | 文案/数据常量 label | "Reset mock data" |
| 92 | 文案/数据常量 label | "Controlled failure" |
| 98 | 文案/数据常量 label | "Unknown scenario" |
| 135 | 属性 aria-label | Mock scenario evidence ids |
| 151 | 属性 aria-label | Mock scenarios |
| 159 | JSX文字 | State |
| 165 | JSX文字 | Graph |
| 167 | JSX文字 | contacts, |
| 168 | JSX文字 | events, |
| 169 | JSX文字 | tasks |
| 173 | JSX文字 | Event context |
| 177 | JSX文字 | Evidence records |
| 179 | JSX文字 | evidence records |
| 183 | JSX文字 | Next action |
| 206 | 属性 title | Harness-visible states |
| 207 | 属性 aria-label | Mock scenario state matrix |
| 212 | JSX文字 | Success state |
| 216 | JSX文字 | Empty state |
| 220 | JSX文字 | Pending state |
| 224 | JSX文字 | Failure state |
| 226 | JSX文字 | Controlled code |
| 231 | JSX文字 | Empty and pending states stay deterministic fixture responses; controlled failures stay inside API failure envelopes. |
| 244 | 属性 aria-label | Mock scenario provider guardrails |
| 249 | JSX文字 | Production seed manager |
| 251 | JSX文字 | production seed management replaced |
| 256 | JSX文字 | User scenario storage |
| 258 | JSX文字 | persistent user scenario storage replaced |
| 263 | JSX文字 | External network |
| 264 | JSX文字 | external network requested |
| 267 | JSX文字 | Database reads |
| 268 | JSX文字 | database reads |
| 271 | JSX文字 | Database writes |
| 272 | JSX文字 | database writes |
| 275 | JSX文字 | AI provider |
| 276 | JSX文字 | AI provider requested |
| 279 | JSX文字 | Email and calendar |
| 281 | JSX文字 | email |
| 281 | JSX文字 | ; calendar |
| 286 | JSX文字 | Notifications |
| 288 | JSX文字 | notification provider requested |
| 293 | JSX文字 | Device APIs |
| 294 | JSX文字 | device requested |
| 308 | 属性 title | Scenario switcher is fixture-backed |
| 314 | JSX文字 | The active mock scenario is selected from deterministic fixtures and resets through request-scope rules before live seed management or stored user scenario selection exists. |
| 318 | 属性 aria-label | Mock scenario operator checkpoint |
| 323 | JSX文字 | Active scenario |
| 329 | JSX文字 | Workspace |
| 333 | JSX文字 | Scenario state |
| 339 | JSX文字 | Next action |
| 350 | 属性 title | Declared probes |
| 380 | JSX文字 | Developer capability runtime |
| 381 | JSX文字 | Mock data mutation reset and scenario switcher |
| 383 | JSX文字 | The deterministic mock scenario fixtures did not load, so this dev surface stopped inside a controlled local state. |
| 411 | JSX文字 | Developer capability runtime |
| 412 | JSX文字 | Mock data mutation reset and scenario switcher |
| 414 | JSX文字 | Dev-only surface for verifying deterministic mock scenario selection and reset behavior before live seed providers or stored user scenario preferences exist. |
| 425 | 属性 aria-label | Mock data scenario capability details |
| 429 | 属性 title | Scenario selection contract |
| 435 | JSX文字 | The reusable boundary exports typed scenario fixtures, a service interface, a mock service factory, and explicit error definitions for new user, active event, post-event, dormant network, empty account, and error states. |
| 442 | JSX文字 | Post-event activation |
| 450 | JSX文字 | Reset rule |
| 458 | 属性 aria-label | Mock scenario guard chips |
| 459 | JSX文字 | fixture-backed |
| 460 | JSX文字 | request-scope selection |
| 461 | JSX文字 | provider-free reset |
| 465 | 属性 title | Failure codes |
| 468 | JSX文字 | Scenario failure |
| 478 | JSX文字 | Reset failure |
| 496 | 属性 title | Selectable mock states |
| 500 | 属性 title | No external service participates |
| 509 | 属性 title | Replacement notes stay with the capability |
| 515 | JSX文字 | Handoff doc |
| 521 | JSX文字 | Switch variable |
| 523 | JSX文字 | ORBIT_MOCK_SCENARIO_PROVIDER |
| 523 | JSX文字 | controls the future live provider switch. |

## repos/orbits/shared/ui/primitives.tsx

源码：[primitives.tsx](</Users/li/work/orbit/repos/orbits/shared/ui/primitives.tsx>)

静态来源入口：`/app/account/forgot-password`、`/app/account/login`、`/app/account/signup`、`/app/admin`、`/app/admin/events`、`/app/agent`、`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/intros`、`/app/contacts/pipeline`、`/app/dashboard`、`/app/events/[id]`、`/app/events/[id]/register`、`/app/home/events`、`/app/o/[slug]`、`/app/party`、`/app/party/checkin`、`/app/party/graph`、`/app/platform`、`/app/profile`、`/app/register`、`/dev/capabilities`、`/dev/capabilities/[slug]`、`/dev/foundation/domain`、`/dev/foundation/mock-registry`、`/dev/foundation/style`、`/dev/orbit-ai/trace`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 160 | ProductFrame | main | children | classNames("workbench-frame", className) |
| 172 | ProductSurface | section | (eyebrow \|\| title) && ( &lt;header className="surface-heading"&gt; {eyebrow && &lt;p className="surface-eyebrow"&gt;{eyebrow}&lt;/p&gt;} {title && &lt;h2&gt;{title}&lt;/h2&gt;} &lt;/header&gt; ) children | classNames( "workbench-surface", elevated && "workbench-surface-raised", className, ) |
| 181 | ProductSurface | header | eyebrow && &lt;p className="surface-eyebrow"&gt;{eyebrow}&lt;/p&gt; title && &lt;h2&gt;{title}&lt;/h2&gt; | surface-heading |
| 183 | ProductSurface | h2 | title |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 217 | button/button · PrimaryAction | {children} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 225 | button/button · SecondaryAction | {children} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

## repos/orbits/shared/ui/state-view.tsx

源码：[state-view.tsx](</Users/li/work/orbit/repos/orbits/shared/ui/state-view.tsx>)

静态来源入口：`/app/account/forgot-password`、`/app/account/login`、`/app/account/signup`、`/app/admin`、`/app/admin/events`、`/app/agent`、`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/intros`、`/app/contacts/pipeline`、`/app/dashboard`、`/app/events/[id]`、`/app/events/[id]/register`、`/app/home/events`、`/app/o/[slug]`、`/app/party`、`/app/party/checkin`、`/app/party/graph`、`/app/platform`、`/app/profile`、`/app/register`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 251 | StateView | details | State source details |  |
| 252 | StateView | summary | copy("来源详情", "Source details", "出典の詳細") |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 252 | disclosure/summary · StateView | {copy("来源详情", "Source details", "出典の詳細")} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 285 | link/a · StateView | ariaLabel | action.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 232 | 属性 title | title |
| 234 | 属性 aria-label | Relationship state guidance |
| 236 | 属性 aria-label | Screen purpose |
| 240 | 属性 aria-label | Available relationship context |
| 244 | 属性 aria-label | Safe next step |
| 251 | 属性 aria-label | State source details |
| 253 | 属性 aria-label | State source evidence |
| 270 | 属性 aria-label | Recovery actions |
| 285 | 属性 aria-label | ariaLabel |
| 299 | 属性 aria-label | Next step: |


