# 09-dev：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/dev/agent-test-report/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/agent-test-report/page.tsx>)

静态来源入口：`/dev/agent-test-report`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 322 | AgentFunctionalTestReportPage | main |  | agent-report |
| 325 | AgentFunctionalTestReportPage | header |  | agent-report__hero |
| 328 | AgentFunctionalTestReportPage | h1 | Agent 全功能测试报告 |  |
| 338 | AgentFunctionalTestReportPage | nav | 报告章节 | agent-report__nav |
| 345 | AgentFunctionalTestReportPage | aside | 验收结论 | agent-report__verdict |
| 377 | AgentFunctionalTestReportPage | section |  |  |
| 380 | AgentFunctionalTestReportPage | h2 | 一次 Agent 请求经历什么 |  |
| 388 | AgentFunctionalTestReportPage | h3 | stage.title |  |
| 395 | AgentFunctionalTestReportPage | section |  |  |
| 398 | AgentFunctionalTestReportPage | h2 | `注册表中的全部 ${AGENT_EVALUATION_SUMMARY.capabilities} 项能力` |  |
| 412 | AgentFunctionalTestReportPage | header |  |  |
| 414 | AgentFunctionalTestReportPage | h3 | capability.chineseTitle |  |
| 445 | AgentFunctionalTestReportPage | section |  |  |
| 448 | AgentFunctionalTestReportPage | h2 | AGENT_EVALUATION_SUMMARY.cases 个实验，逐项对照预期与实测 |  |
| 455 | AgentFunctionalTestReportPage | details |  | agent-report__case |
| 460 | AgentFunctionalTestReportPage | summary |  |  |
| 498 | AgentFunctionalTestReportPage | section |  |  |
| 501 | AgentFunctionalTestReportPage | h2 | 为什么会出问题，以及怎么从根上修 |  |
| 509 | AgentFunctionalTestReportPage | h3 | finding.symptom |  |
| 520 | AgentFunctionalTestReportPage | footer |  | agent-report__footer |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 339 | link/a · AgentFunctionalTestReportPage | 完整流程 | #flow | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 340 | link/a · AgentFunctionalTestReportPage | 能力清单 | #capabilities | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 341 | link/a · AgentFunctionalTestReportPage | 逐项实验 | #experiments | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 342 | link/a · AgentFunctionalTestReportPage | 根因与修复 | #findings | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 460 | disclosure/summary · AgentFunctionalTestReportPage | {testCase.id} {testCase.category} · {testCase.experiment} 受限 / 通过 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 327 | JSX文字 | Orbit Agent · Functional evaluation |
| 328 | JSX文字 | Agent 全功能测试报告 |
| 330 | JSX文字 | 这不是功能宣传页，而是一份把能力、流程、安全边界、实验设计、预期结果和真实结果放在一起的验收记录。 本轮以已有活动和中文人脉的测试账户为基准，先暴露真实数据链路问题，再完成根因修复。 |
| 334 | JSX文字 | 测试日期： |
| 335 | JSX文字 | 测试账户： |
| 336 | JSX文字 | 范围：聊天、今日、活动、账本、后台自动化 |
| 338 | 属性 aria-label | 报告章节 |
| 339 | JSX文字 | 完整流程 |
| 340 | JSX文字 | 能力清单 |
| 341 | JSX文字 | 逐项实验 |
| 342 | JSX文字 | 根因与修复 |
| 345 | 属性 aria-label | 验收结论 |
| 348 | JSX文字 | 项通过， |
| 349 | JSX文字 | 项受限。受限项保留真实原因和正确入口，不再把技术可达冒充业务完成。 |
| 354 | 属性 aria-label | 报告摘要 |
| 357 | JSX文字 | 注册能力 |
| 360 | JSX文字 | 4 |
| 361 | JSX文字 | 真实只读工具 |
| 364 | JSX文字 | 13 |
| 365 | JSX文字 | 受控动作 |
| 368 | JSX文字 | 3 |
| 369 | JSX文字 | 端到端工作流 |
| 373 | JSX文字 | 根因修复 |
| 379 | JSX文字 | End-to-end flow |
| 380 | JSX文字 | 一次 Agent 请求经历什么 |
| 382 | JSX文字 | 流程刻意把“读取证据”“提出方案”和“执行动作”分开。模型不能直接越过身份、权限、确认或账本。 |
| 397 | JSX文字 | Capability inventory |
| 400 | JSX文字 | 页面直接从 Agent 能力注册表生成清单；新增能力如果没有测试说明，报告测试会失败，防止文档落后于实现。 |
| 404 | JSX文字 | 只读：直接展示证据 |
| 405 | JSX文字 | 草稿/写入：逐项确认 |
| 406 | JSX文字 | 外部动作：确认 + 权限 |
| 407 | JSX文字 | 工作流：阶段门控 |
| 424 | JSX文字 | 执行边界 |
| 428 | JSX文字 | 确认策略 |
| 432 | JSX文字 | 风险 |
| 436 | JSX文字 | 证据 |
| 447 | JSX文字 | Experiment matrix |
| 448 | JSX文字 | 个实验，逐项对照预期与实测 |
| 450 | JSX文字 | 真实账户实验覆盖最容易被 mock 掩盖的读取链路；动作、并发和异常路径用确定性自动化验证，避免污染外部系统。 |
| 477 | JSX文字 | 实验 |
| 481 | JSX文字 | 预期 |
| 485 | JSX文字 | 实测 |
| 489 | JSX文字 | 方法： |
| 489 | JSX文字 | · 证据： |
| 489 | JSX文字 | · 能力： |
| 500 | JSX文字 | Root-cause audit |
| 501 | JSX文字 | 为什么会出问题，以及怎么从根上修 |
| 503 | JSX文字 | 本轮不以增加条件判断掩盖症状，而是检查身份、数据所有权、领域边界、参数契约和展示层各自应承担的责任。 |
| 513 | JSX文字 | 根因： |
| 514 | JSX文字 | 修复： |
| 522 | JSX文字 | 成熟产品验收口径：有证据才回答；没有权限就失败关闭；没有确认就不写入；重复执行不产生重复副作用； 推导结果必须声明为推导；空态、失败和恢复路径与成功路径同等重要。 |

## repos/orbits/app/dev/capabilities/capability-debug-dashboard/error-codes.ts

源码：[error-codes.ts](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/capability-debug-dashboard/error-codes.ts>)

静态来源入口：`/dev/capabilities/[slug]`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 30 | 文案/数据常量 message | "The capability debug dashboard mock is pinned to a controlled failure scenario." |

## repos/orbits/app/dev/capabilities/capability-debug-dashboard/fixtures.ts

源码：[fixtures.ts](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/capability-debug-dashboard/fixtures.ts>)

静态来源入口：`/dev/capabilities/[slug]`

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 100 | (module / render callback) | 路径常量 | 见调用/handler | `/api/mock/scenarios/${scenario.id}/activate` |
| 114 | (module / render callback) | 路径常量 | 见调用/handler | "/api/app/bootstrap" |
| 124 | (module / render callback) | 路径常量 | 见调用/handler | "/api/mock/scenarios" |
| 134 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance" |
| 147 | (module / render callback) | 路径常量 | 见调用/handler | "/api/app/bootstrap" |
| 155 | (module / render callback) | 路径常量 | 见调用/handler | "/api/app/bootstrap?scenario=empty" |
| 163 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance?scenario=pending" |
| 171 | (module / render callback) | 路径常量 | 见调用/handler | "/api/audit/provenance?scenario=failure" |
| 184 | (module / render callback) | 路径常量 | 见调用/handler | "/api/mock/reset" |
| 193 | (module / render callback) | 路径常量 | 见调用/handler | "/api/mock/reset?scenario=empty-account-demo" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 66 | 文案/数据常量 label | "App bootstrap mock aggregator" |
| 72 | 文案/数据常量 label | "Mock data mutation reset and scenario switcher" |
| 78 | 文案/数据常量 label | "Source consistency and provenance audit" |
| 84 | 文案/数据常量 label | "AI provider mock and provenance boundary" |
| 112 | 文案/数据常量 label | "App bootstrap" |
| 117 | 文案/数据常量 description | "Returns the mock first-screen bootstrap payload for account, profile, events, followups, actions, dashboard, permissions, and notifications." |
| 122 | 文案/数据常量 label | "Mock scenarios" |
| 127 | 文案/数据常量 description | "Returns deterministic scenario fixtures for success, pending, empty, and controlled failure coverage." |
| 132 | 文案/数据常量 label | "Provenance audit" |
| 137 | 文案/数据常量 description | "Returns the mock source and evidence provenance audit snapshot." |
| 145 | 文案/数据常量 label | "Success bootstrap" |
| 153 | 文案/数据常量 label | "Empty bootstrap" |
| 161 | 文案/数据常量 label | "Pending audit" |
| 169 | 文案/数据常量 label | "Failure audit" |
| 182 | 文案/数据常量 label | "Reset active-event demo" |
| 186 | 文案/数据常量 description | "Restores the default active-event mock state through request-scope rules." |
| 191 | 文案/数据常量 label | "Reset empty account demo" |
| 195 | 文案/数据常量 description | "Restores the empty-account mock state without writing production seed data." |
| 231 | 文案/数据常量 summary | "Mock dashboard links registered capabilities, scenario fixtures, declared API probes, and reset controls for local evaluator evidence." |
| 247 | 文案/数据常量 summary | "No registered mock capability links are available in this deterministic empty dashboard state." |
| 263 | 文案/数据常量 summary | "The capability debug dashboard is waiting on the local capability probe refresh." |

## repos/orbits/app/dev/capabilities/debug-dashboard.tsx

源码：[debug-dashboard.tsx](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/debug-dashboard.tsx>)

静态来源入口：`/dev/capabilities/[slug]`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 511 | CapabilityDebugDashboardDemo | header |  | workbench-header |
| 513 | CapabilityDebugDashboardDemo | h1 | Capability debug dashboard |  |
| 542 | CapabilityDebugDashboardDemo | header |  | workbench-header |
| 544 | CapabilityDebugDashboardDemo | h1 | Capability debug dashboard |  |
| 555 | CapabilityDebugDashboardDemo | section | Capability debug dashboard capability details | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 202 | link/a · CapabilityLinks | {capability.label} {capability.id} resolves as {capability.serviceStatus} in {capability.mode} mode. | capability.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 232 | link/a · MockRouteLinks | {route.label} {route.boundary} {route.href} | route.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 299 | link/a · ScenarioLinks | {scenario.label} {scenario.id} state {scenario.state} Activation target {scenario.activationTarget.method} {scenario.activationTarget.path} expects {scenario.activationTarget.expectStatus} {scenario.activationTarget.envelope} envelope. {scenario.nextAction} | scenario.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 106 | 属性 aria-label | Capability debug dashboard evidence ids |
| 118 | 属性 title | Capability debug dashboard is fixture-backed |
| 124 | JSX文字 | The dashboard replaces production admin tools and external observability with local fixture links for all registered capabilities, mock scenarios, API probes, and reset controls. |
| 128 | 属性 aria-label | Capability debug dashboard operator checkpoint |
| 133 | JSX文字 | Registered mock capabilities |
| 134 | JSX文字 | registry links |
| 137 | JSX文字 | Scenario controls |
| 138 | JSX文字 | deterministic scenario links |
| 141 | JSX文字 | API probes |
| 142 | JSX文字 | declared GET probes |
| 145 | JSX文字 | Reset controls |
| 146 | JSX文字 | fixture reset controls |
| 157 | 文案/数据常量 label | "Registered mock capabilities" |
| 162 | 文案/数据常量 label | "Scenario controls" |
| 167 | 文案/数据常量 label | "API probes" |
| 172 | 文案/数据常量 label | "Reset controls" |
| 179 | 属性 aria-label | Capability debug dashboard metric cards |
| 196 | 属性 title | Registered mock capabilities |
| 197 | 属性 aria-label | Capability debug dashboard registered capability links |
| 209 | JSX文字 | resolves as |
| 210 | JSX文字 | in |
| 211 | JSX文字 | mode. |
| 226 | 属性 title | Dedicated capability pages |
| 227 | 属性 aria-label | Capability debug dashboard mock capability route links |
| 255 | 属性 title | Harness-visible states |
| 256 | 属性 aria-label | Capability debug dashboard state matrix |
| 261 | JSX文字 | Success state |
| 262 | JSX文字 | Success: |
| 262 | JSX文字 | capabilities linked |
| 265 | JSX文字 | Empty state |
| 266 | JSX文字 | Empty: |
| 269 | JSX文字 | Pending state |
| 270 | JSX文字 | Pending: |
| 273 | JSX文字 | Failure state |
| 275 | JSX文字 | Failure: controlled error |
| 280 | JSX文字 | Empty and pending states stay successful fixture responses; controlled failures stay local and use explicit mock error definitions. |
| 293 | 属性 title | Mock scenario links |
| 294 | 属性 aria-label | Capability debug dashboard scenario links |
| 306 | JSX文字 | state |
| 309 | JSX文字 | Activation target |
| 314 | JSX文字 | expects |
| 315 | JSX文字 | envelope. |
| 333 | 属性 title | Declared probe envelopes |
| 342 | JSX文字 | expects |
| 342 | JSX文字 | envelope. |
| 348 | 属性 aria-label | Capability debug dashboard state probe coverage |
| 359 | JSX文字 | covers |
| 359 | JSX文字 | as a |
| 360 | JSX文字 | envelope. |
| 375 | 属性 title | Mock reset commands |
| 384 | JSX文字 | expects |
| 399 | 属性 title | No external service participates |
| 403 | 属性 aria-label | Capability debug dashboard provider guardrails |
| 408 | JSX文字 | Admin tools |
| 410 | JSX文字 | production admin tools replaced |
| 415 | JSX文字 | Observability |
| 417 | JSX文字 | external observability replaced |
| 422 | JSX文字 | External network |
| 424 | JSX文字 | external network requested |
| 429 | JSX文字 | Database reads |
| 430 | JSX文字 | database reads |
| 433 | JSX文字 | Database writes |
| 434 | JSX文字 | database writes |
| 437 | JSX文字 | AI provider |
| 438 | JSX文字 | AI provider requested |
| 441 | JSX文字 | Email and calendar |
| 443 | JSX文字 | email |
| 443 | JSX文字 | ; calendar |
| 448 | JSX文字 | Notifications |
| 450 | JSX文字 | notification provider requested |
| 455 | JSX文字 | Device APIs |
| 456 | JSX文字 | device requested |
| 465 | 属性 title | Replacement notes stay with the capability |
| 471 | JSX文字 | Handoff doc |
| 477 | JSX文字 | Switch variable |
| 479 | JSX文字 | ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER |
| 479 | JSX文字 | controls the future live provider switch. |
| 484 | JSX文字 | Live provider scope |
| 486 | JSX文字 | Live admin and observability reads require explicit environment variables, admin read permission, observability read permission, privacy review, provenance mapping, and replacement tests. |
| 512 | JSX文字 | Developer capability runtime |
| 513 | JSX文字 | Capability debug dashboard |
| 515 | JSX文字 | The deterministic capability debug dashboard fixtures did not load, so this dev surface stopped inside a controlled local state. |
| 543 | JSX文字 | Developer capability runtime |
| 544 | JSX文字 | Capability debug dashboard |
| 546 | JSX文字 | Dev-only surface for scanning Orbit mock capability coverage. The page reads the mock service for success, empty, pending, and failure states before any live admin or observability provider exists. |
| 555 | 属性 aria-label | Capability debug dashboard capability details |
| 559 | 属性 title | Dashboard contract |
| 565 | JSX文字 | The reusable boundary exports typed fixtures, a service interface, a mock service factory, and explicit error definitions for one capability debug dashboard. |
| 569 | 属性 aria-label | Capability debug dashboard guard chips |
| 570 | JSX文字 | fixture-backed |
| 571 | JSX文字 | rule-based states |
| 572 | JSX文字 | provider-free |
| 576 | 属性 title | Failure code |
| 579 | JSX文字 | Controlled code |
| 585 | JSX文字 | Evidence |

## repos/orbits/app/dev/capabilities/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/capabilities/page.tsx>)

静态来源入口：`/dev/capabilities`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 89 | CapabilitiesPage | header |  | workbench-header |
| 91 | CapabilitiesPage | h1 | Capability registry |  |
| 197 | CapabilitiesPage | section | Registered capability services | workbench-grid |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 147 | link/a · CapabilitiesPage | Open dashboard | capabilityDebugDashboardRoute | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 56 | 文案/数据常量 label | "Add provider boundary" |
| 61 | 文案/数据常量 label | "Switch deliberately" |
| 66 | 文案/数据常量 label | "Prove replacement" |
| 90 | JSX文字 | Developer capability runtime |
| 91 | JSX文字 | Capability registry |
| 93 | JSX文字 | Read-only summary for how Orbit pages and route handlers obtain mock, hybrid, or live services. Every registered capability defaults to mock mode, while the live preview shows which capability groups now have a registered live service boundary. |
| 100 | 属性 title | Current mode defaults to mock |
| 107 | JSX文字 | Registered capabilities |
| 108 | JSX文字 | service factories are available. |
| 111 | JSX文字 | Current mode |
| 113 | JSX文字 | All capabilities resolve through |
| 113 | JSX文字 | mock |
| 113 | JSX文字 | mode by default. Pages and route handlers can request |
| 114 | JSX文字 | hybrid |
| 115 | JSX文字 | or |
| 115 | JSX文字 | live |
| 115 | JSX文字 | through the shared factory. |
| 119 | JSX文字 | Live inventory |
| 121 | JSX文字 | complete groups are verified as |
| 122 | JSX文字 | live-ready |
| 122 | JSX文字 | are explicitly |
| 123 | JSX文字 | live-limited |
| 123 | JSX文字 | remain controlled |
| 124 | JSX文字 | NOT_IMPLEMENTED |
| 124 | JSX文字 | entries. A registered constructor alone never counts as product readiness. |
| 129 | 属性 aria-label | Capability mode guardrails |
| 130 | JSX文字 | mock default |
| 131 | JSX文字 | hybrid factory |
| 132 | JSX文字 | live inventory |
| 136 | 属性 title | Capability debug dashboard |
| 142 | JSX文字 | Open a single mock-first dashboard that links all registered capabilities, mock scenarios, API probes, and reset controls for evaluator evidence. |
| 152 | JSX文字 | Open dashboard |
| 157 | 属性 title | Implementation coverage is documented before live providers |
| 162 | JSX文字 | The live handoff keeps operators focused on the exact work needed to move a capability from mock to live without bypassing provenance, consent, or the API envelope. |
| 166 | 属性 aria-label | Live handoff coverage |
| 168 | JSX文字 | Handoff doc |
| 174 | JSX文字 | Implementation coverage |
| 184 | 属性 aria-label | Operator handoff checklist |
| 197 | 属性 aria-label | Registered capability services |
| 202 | 属性 title | capability.label |
| 209 | 属性 aria-label | `${capability.label} service mode` |
| 216 | JSX文字 | default |
| 220 | JSX文字 | Current mode |
| 222 | JSX文字 | via |
| 227 | JSX文字 | API metadata |
| 237 | JSX文字 | Debug route |

## repos/orbits/app/dev/foundation/domain/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/foundation/domain/page.tsx>)

静态来源入口：`/dev/foundation/domain`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 129 | DomainFoundationPage | header |  | workbench-header |
| 131 | DomainFoundationPage | h1 | Shared domain contract |  |
| 176 | DomainFoundationPage | section | Domain source and enum boundaries | workbench-grid |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 130 | JSX文字 | Developer foundation |
| 131 | JSX文字 | Shared domain contract |
| 133 | JSX文字 | Read-only admin summary for the Orbit domain DTO skeleton. This page keeps source/provenance boundaries visible before capability mocks start producing contacts, connections, evidence, tasks, and agent actions. |
| 140 | 属性 title | Current mode and provider status |
| 146 | JSX文字 | Current mode |
| 148 | JSX文字 | via the runtime mode boundary. Supported modes: |
| 153 | JSX文字 | Provider status |
| 159 | 属性 title | Relationship records cannot be source-free |
| 176 | 属性 aria-label | Domain source and enum boundaries |
| 181 | 属性 title | boundary.name |
| 187 | 属性 aria-label | `${boundary.name} values` |
| 198 | 属性 title | Capability mocks must map into this contract |
| 203 | JSX文字 | The next integration step is for capability services to import these DTOs, create explicit source references and evidence ids, validate records at the service boundary, then return the same shapes through route handlers and UI pages. |
| 209 | JSX文字 | Live providers will replace mocks behind the runtime mode boundary, but provider payloads must still preserve source type, source id, evidence confidence, creator, and permission provenance. |

## repos/orbits/app/dev/foundation/mock-registry/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/foundation/mock-registry/page.tsx>)

静态来源入口：`/dev/foundation/mock-registry`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 47 | MockRegistryFoundationPage | header |  | workbench-header |
| 49 | MockRegistryFoundationPage | h1 | Shared mock runtime |  |
| 57 | MockRegistryFoundationPage | section | Mock registry runtime surfaces | workbench-grid |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 27 | 文案/数据常量 label | "Registry" |
| 31 | 文案/数据常量 label | "State store" |
| 35 | 文案/数据常量 label | "Seed graph" |
| 48 | JSX文字 | Developer foundation |
| 49 | JSX文字 | Shared mock runtime |
| 51 | JSX文字 | Debug summary for the typed mock fixture registry, deterministic state-store boundary, and source-backed seed graph every capability sprint can consume before live providers exist. |
| 57 | 属性 aria-label | Mock registry runtime surfaces |
| 61 | 属性 title | Registered fixture variants |
| 63 | JSX文字 | Capability services call |
| 63 | JSX文字 | getMockFixtureVariant |
| 63 | JSX文字 | for a cloned graph and |
| 64 | JSX文字 | listMockFixtureVariants |
| 64 | JSX文字 | for developer-visible registry metadata. |
| 72 | JSX文字 | . Fixture id: |
| 80 | 属性 title | Deterministic in-memory state |
| 82 | JSX文字 | The registry reset helper restores the default variant, and |
| 83 | JSX文字 | createMockStateStore |
| 83 | JSX文字 | clones reads, writes, updates, and resets so tests and route handlers cannot mutate shared fixture state by accident. |
| 87 | 属性 aria-label | Mock runtime guardrails |
| 88 | JSX文字 | clone-on-read |
| 89 | JSX文字 | resettable registry |
| 90 | JSX文字 | no live providers |
| 93 | JSX文字 | Current runtime snapshot: |
| 94 | JSX文字 | contacts, |
| 94 | JSX文字 | connections, and |
| 95 | JSX文字 | confirmation-aware agent actions. |
| 101 | 属性 title | fixture.label |
| 108 | JSX文字 | records seeded with source or evidence provenance for mock capability services. |
| 116 | 属性 title | Live providers replace the registry behind service factories |
| 118 | JSX文字 | Live account, profile, event, contact, signal, dashboard, agent, permission, and notification providers must map into the same DTOs, preserve source and evidence ids, and replace this mock runtime only through the documented feature-mode service switch. |
| 124 | JSX文字 | Start with these files when wiring a capability service to the mock runtime or planning a live provider replacement. |
| 127 | 属性 aria-label | Sprint 6 source and handoff files |
| 140 | JSX文字 | Live notes |

## repos/orbits/app/dev/foundation/style/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/dev/foundation/style/page.tsx>)

静态来源入口：`/dev/foundation/style`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 41 | StyleFoundationPage | header |  | workbench-header |
| 43 | StyleFoundationPage | h1 | Post-event follow-up review |  |
| 51 | StyleFoundationPage | section | Relationship review specimen | workbench-grid |
| 75 | StyleFoundationPage | header |  |  |
| 99 | StyleFoundationPage | details |  |  |
| 100 | StyleFoundationPage | summary | Source record |  |
| 110 | StyleFoundationPage | section | Guardrail and privacy specimens | workbench-grid |
| 153 | StyleFoundationPage | details |  |  |
| 154 | StyleFoundationPage | summary | Runtime disclosure |  |
| 177 | StyleFoundationPage | section | Control and action specimens | workbench-grid |
| 213 | StyleFoundationPage | details |  |  |
| 214 | StyleFoundationPage | summary | Responsive evidence |  |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 100 | disclosure/summary · StyleFoundationPage | Source record |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 154 | disclosure/summary · StyleFoundationPage | Runtime disclosure |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 181 | field/input · StyleFoundationPage | Relationship source |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 184 | field/select · StyleFoundationPage | Private to me Share with team |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 190 | field/textarea · StyleFoundationPage | Evidence note |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 214 | disclosure/summary · StyleFoundationPage | Responsive evidence |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 42 | JSX文字 | Style foundation |
| 43 | JSX文字 | Post-event follow-up review |
| 45 | JSX文字 | Ari Kato asked for an operator intro after the Orbit Summit Roundtable. This specimen keeps source, privacy, confirmation, and next-step controls visible in one compact participant-facing surface. |
| 51 | 属性 aria-label | Relationship review specimen |
| 52 | 属性 title | Ari Kato needs a source-backed intro |
| 58 | JSX文字 | The hiring-market intro is worth a follow-up. |
| 60 | JSX文字 | Met through Nia Patel after the procurement panel. The badge scan and event note point to the same ask, so Orbit should keep the origin beside the recommendation. |
| 64 | JSX文字 | ORBIT SUMMIT ROUNDTABLE / JUNE 18 |
| 66 | 属性 aria-label | Relationship metrics |
| 67 | 属性 label | Evidence |
| 68 | 属性 label | Follow-up |
| 69 | 属性 label | Privacy |
| 73 | 属性 title | Why this connection exists |
| 76 | JSX文字 | Ari Kato |
| 77 | JSX文字 | Orbit Summit Roundtable / June 18 |
| 81 | JSX文字 | Origin |
| 82 | JSX文字 | Met after the procurement panel through Nia Patel. |
| 85 | JSX文字 | Evidence |
| 86 | JSX文字 | Badge scan and note mention a hiring-market intro. |
| 89 | JSX文字 | Next action |
| 90 | JSX文字 | Draft a warm intro, then confirm before sending. |
| 93 | 属性 aria-label | Relationship chips |
| 94 | JSX文字 | Event source |
| 95 | JSX文字 | Evidence attached |
| 96 | JSX文字 | Confirm first |
| 97 | JSX文字 | Private note |
| 100 | JSX文字 | Source record |
| 102 | JSX文字 | Badge scan, roundtable note, and user-confirmed next step are shown together before any external action. |
| 110 | 属性 aria-label | Guardrail and privacy specimens |
| 111 | 属性 title | Paused before send |
| 113 | 属性 label | Action state |
| 119 | JSX文字 | Orbit can prepare the intro, but the send path stays paused until the source, private context, and intended recipient are reviewed together. |
| 125 | JSX文字 | Source attached |
| 126 | JSX文字 | Badge scan and event note are visible before the draft. |
| 129 | JSX文字 | Privacy checked |
| 130 | JSX文字 | Funding context stays private and is excluded from the intro. |
| 133 | JSX文字 | External action paused |
| 134 | JSX文字 | The primary button confirms the next step; it does not send yet. |
| 138 | JSX文字 | Draft intent: introduce Ari to a hiring-market operator with the Orbit Summit source attached. |
| 144 | 属性 title | Private notes stay scoped |
| 146 | JSX文字 | Private note: hide funding context from exports and generated copy. |
| 148 | 属性 label | Visibility |
| 154 | JSX文字 | Runtime disclosure |
| 156 | JSX文字 | This foundation route renders static specimen states only; live providers replace the same primitives without changing their visual contract. |
| 164 | 属性 title | Semantic color roles |
| 165 | 属性 aria-label | Token palette |
| 177 | 属性 aria-label | Control and action specimens |
| 178 | 属性 title | Confirm the draft before sending |
| 180 | 属性 label | Relationship source |
| 183 | 属性 label | Visibility |
| 185 | JSX文字 | Private to me |
| 186 | JSX文字 | Share with team |
| 189 | 属性 label | Evidence note |
| 195 | 属性 title | Primary and secondary decisions |
| 197 | 属性 label | Ready state |
| 198 | 属性 label | External send gated |
| 204 | JSX文字 | Static specimen only. Decision controls stay disabled because this foundation route has no local state transition or product write boundary. |
| 209 | JSX文字 | Confirm next step |
| 210 | JSX文字 | Keep as draft |
| 211 | JSX文字 | Send externally locked |
| 214 | JSX文字 | Responsive evidence |
| 216 | JSX文字 | No external message leaves the workspace from this specimen. Desktop, tablet, and 375px mobile layouts use dense grid tracks and wrapped controls to avoid horizontal overflow. |

## repos/orbits/app/dev/knowledge/knowledge-wiki.tsx

源码：[knowledge-wiki.tsx](</Users/li/work/orbit/repos/orbits/app/dev/knowledge/knowledge-wiki.tsx>)

静态来源入口：`/dev/knowledge`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 892 | GlobalNav | nav | Orbit Wiki navigation | wiki-global-nav |
| 893 | GlobalNav | section |  | wiki-nav-block |
| 894 | GlobalNav | h2 | 导航 | wiki-nav-heading |
| 913 | GlobalNav | section | ORBIT_KNOWLEDGE_MANIFEST.topicPages.map((topic) =&gt; ( &lt;a aria-current={ activePage.kind === "topic" && activePage.id === topic.id ? "page" : undefined } className="wiki-nav-button" href={topicHref(topic.id)} key={topic.id} &gt; {topic.titleZh} &lt;/a&gt; )) | wiki-nav-block |
| 914 | GlobalNav | h2 | 知识主题 | wiki-nav-heading |
| 931 | GlobalNav | section | categoryCounts.map(([item, count]) =&gt; ( &lt;a aria-current={activePage.kind === "index" && category === item ? "page" : undefined} className="wiki-nav-button wiki-category-row" href={categoryHref(item)} key={item} &gt; &lt;span&gt;{categoryLabel(item)}&lt;/span&gt; &lt;small&gt;{count}&lt;/small&gt; &lt;/a&gt; )) | wiki-nav-block |
| 932 | GlobalNav | h2 | 分类目录 | wiki-nav-heading |
| 967 | Masthead | header |  | wiki-masthead |
| 984 | Masthead | div/tablist | 页面视图 | wiki-page-tabs |
| 1012 | PortalGrid | section |  | wiki-portal |
| 1128 | DocumentIndex | section | documents.length ? ( &lt;table className="wiki-index-table"&gt; &lt;thead&gt; &lt;tr&gt; &lt;th style={{ width: "22%" }}&gt;页面&lt;/th&gt; &lt;th style={{ width: "20%" }}&gt;命名空间&lt;/th&gt; &lt;th&gt;简介&lt;/th&gt; &lt;th style={{ width: "19%" }}&gt;状态&lt;/th&gt; &lt;/tr&gt; &lt;/thead&gt; &lt;tbody&gt; {documents.map((document) =&gt; ( &lt;tr key={document.id}&gt; &lt;td&gt; &lt;a href={documentHref(document.id)}&gt; {docu …（完整表达式见源码） |  |
| 1129 | DocumentIndex | h2 | 文档索引 |  |
| 1195 | DocumentContentSection | section |  | wiki-document-body |
| 1196 | DocumentContentSection | h3 | 正文内容 |  |
| 1209 | DocumentContentSection | section |  | wiki-document-body |
| 1210 | DocumentContentSection | h3 | 正文内容 |  |
| 1217 | DocumentContentSection | section |  | wiki-document-body |
| 1218 | DocumentContentSection | h3 | 正文内容 |  |
| 1226 | RecentChanges | section |  |  |
| 1227 | RecentChanges | h2 | 最近更改 |  |
| 1250 | Learnings | section |  |  |
| 1251 | Learnings | h2 | 经验库 |  |
| 1279 | WikiInfobox | aside |  | wiki-infobox |
| 1280 | WikiInfobox | h2 | 页面信息 |  |
| 1364 | PageToc | aside | 页面目录 | wiki-page-toc |
| 1366 | PageToc | h2 | 页面目录 |  |
| 1372 | PageToc | h2 | 页面工具 |  |
| 1392 | DocumentPageArticle | h1 | document.titleZh |  |
| 1394 | DocumentPageArticle | section |  | wiki-document-metadata |
| 1395 | DocumentPageArticle | h2 | 页面信息 |  |
| 1434 | TopicPageArticle | h1 | topic.titleZh |  |
| 1435 | TopicPageArticle | section |  |  |
| 1436 | TopicPageArticle | h2 | 主题概览 |  |
| 1439 | TopicPageArticle | section |  |  |
| 1440 | TopicPageArticle | h2 | 来源页面 |  |
| 1469 | IndexArticle | h1 | 文档索引 |  |
| 1487 | HistoryPageArticle | h1 | entry.titleZh |  |
| 1489 | HistoryPageArticle | section |  | wiki-document-metadata |
| 1490 | HistoryPageArticle | h2 | 页面信息 |  |
| 1514 | LearningPageArticle | h1 | entry.titleZh |  |
| 1516 | LearningPageArticle | section |  | wiki-document-metadata |
| 1517 | LearningPageArticle | h2 | 页面信息 |  |
| 1547 | HomeArticle | h1 | Orbit Wiki: 项目主页 |  |
| 1549 | HomeArticle | section |  |  |
| 1550 | HomeArticle | h2 | 概览 |  |
| 1565 | HomeArticle | section |  |  |
| 1566 | HomeArticle | h2 | 知识主题 |  |
| 1742 | OrbitKnowledgeWiki | main |  | wiki-frame |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 1662 | [query, setQuery] = useState("") |
| 1663 | [category, setCategory] = useState(initialCategory ?? allFilter) |
| 1664 | [documentContents, setDocumentContents] = useState&lt; Record&lt;string, DocumentContentState&gt; &gt;(() =&gt; initialDocumentContent ? { [initialDocumentContent.documentId]: initialDocumentContent.content } : {}, ) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 895 | link/a · GlobalNav | 主页面 | knowledgeHomeHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 902 | link/a · GlobalNav | 文档索引 | indexPageHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 909 | link/a · GlobalNav | 最近更改 | homeSectionHref("recent-changes") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 910 | link/a · GlobalNav | 经验库 | homeSectionHref("learning-index") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 916 | link/a · GlobalNav | {topic.titleZh} | topicHref(topic.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 933 | link/a · GlobalNav | 全部文档 {ORBIT_KNOWLEDGE_MANIFEST.documents.length} | categoryHref(allFilter) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 942 | link/a · GlobalNav | {categoryLabel(item)} {count} | categoryHref(item) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 977 | field/input · Masthead | 搜索标题、路径、分类、审计依据 | onchange: (event) =&gt; setQuery(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 985 | link/a · Masthead | 阅读 | knowledgeHomeHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 991 | link/a · Masthead | 索引 | indexPageHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 997 | link/a · Masthead | 历史 | homeSectionHref("recent-changes") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1013 | link/a · PortalGrid | {topic.titleZh} | topicHref(topic.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1098 | link/a · a | {children} | safeHref | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1137 | field/input · DocumentIndex | 当前搜索 |  | {"disabled":"true","renderGateProps":[],"conditions":[]} |
| 1141 | field/select · DocumentIndex | 全部类型 {categoryCounts.map(([item, count]) =&gt; ( &lt;option key={item} value={item}&gt; {categoryLabel(item)} ({count}) &lt;/option&gt; ))} | onchange: (event) =&gt; setCategory(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1168 | link/a · DocumentIndex | {document.titleZh} | documentHref(document.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1233 | link/a · RecentChanges | {entry.titleZh} | historyHref(entry.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1256 | link/a · Learnings | {entry.titleZh} | learningHref(entry.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1369 | link/a · PageToc | {label} | href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1375 | link/a · PageToc | {label} | href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1502 | link/a · HistoryPageArticle | 最近更改 | homeSectionHref("recent-changes") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1525 | link/a · LearningPageArticle | 经验库 | homeSectionHref("learning-index") | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 1705 | OrbitKnowledgeWiki | 调用 | GET/由封装决定 | `/api/dev/knowledge/documents/${encodeURIComponent(documentId)}` |
| 1705 | OrbitKnowledgeWiki | 路径常量 | 见调用/handler | `/api/dev/knowledge/documents/${encodeURIComponent(documentId)}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 892 | 属性 aria-label | Orbit Wiki navigation |
| 894 | JSX文字 | 导航 |
| 900 | JSX文字 | 主页面 |
| 907 | JSX文字 | 文档索引 |
| 909 | JSX文字 | 最近更改 |
| 910 | JSX文字 | 经验库 |
| 914 | JSX文字 | 知识主题 |
| 932 | JSX文字 | 分类目录 |
| 938 | JSX文字 | 全部文档 |
| 969 | JSX文字 | O |
| 971 | JSX文字 | Orbit 知识库 |
| 972 | JSX文字 | 项目知识库 |
| 976 | JSX文字 | 搜索 Orbit Wiki |
| 977 | 属性 placeholder | 搜索标题、路径、分类、审计依据 |
| 984 | 属性 aria-label | 页面视图 |
| 989 | JSX文字 | 阅读 |
| 995 | JSX文字 | 索引 |
| 1001 | JSX文字 | 历史 |
| 1129 | JSX文字 | 文档索引 |
| 1131 | JSX文字 | 当前索引显示 |
| 1131 | JSX文字 | 个文档。 来源入口为 |
| 1136 | JSX文字 | 当前搜索 |
| 1140 | JSX文字 | 按类型筛选 |
| 1145 | JSX文字 | 全部类型 |
| 1158 | JSX文字 | 页面 |
| 1159 | JSX文字 | 命名空间 |
| 1160 | JSX文字 | 简介 |
| 1161 | JSX文字 | 状态 |
| 1182 | JSX文字 | 没有匹配当前搜索和筛选条件的文档。 |
| 1196 | JSX文字 | 正文内容 |
| 1198 | JSX文字 | 已从 |
| 1198 | JSX文字 | 读取中文 Markdown 阅读版。 |
| 1210 | JSX文字 | 正文内容 |
| 1218 | JSX文字 | 正文内容 |
| 1219 | JSX文字 | 正在载入 Markdown 原文... |
| 1227 | JSX文字 | 最近更改 |
| 1251 | JSX文字 | 经验库 |
| 1280 | JSX文字 | 页面信息 |
| 1283 | JSX文字 | 文档总数 |
| 1284 | JSX文字 | 个文档 |
| 1287 | JSX文字 | 当前索引 |
| 1288 | JSX文字 | 个匹配条目 |
| 1291 | JSX文字 | 需要代码核对 |
| 1303 | JSX文字 | 选中条目 |
| 1307 | JSX文字 | 来源 |
| 1364 | 属性 aria-label | 页面目录 |
| 1366 | JSX文字 | 页面目录 |
| 1372 | JSX文字 | 页面工具 |
| 1391 | JSX文字 | Orbit Wiki / 文档 / |
| 1395 | JSX文字 | 页面信息 |
| 1398 | JSX文字 | 来源路径 |
| 1402 | JSX文字 | 审计依据 |
| 1406 | JSX文字 | 状态 |
| 1433 | JSX文字 | Orbit Wiki / 知识主题 / |
| 1436 | JSX文字 | 主题概览 |
| 1440 | JSX文字 | 来源页面 |
| 1442 | JSX文字 | 主题页来源为 |
| 1442 | JSX文字 | 。主题页用于组织阅读路径，具体事实仍以关联文档和代码为准。 |
| 1468 | JSX文字 | Orbit Wiki / 文档索引 |
| 1469 | JSX文字 | 文档索引 |
| 1471 | JSX文字 | 这里列出当前 catalog 中的全部文档入口。分类筛选和搜索可以缩小阅读范围，文档标题会打开独立正文页。 |
| 1486 | JSX文字 | Orbit Wiki / 最近更改 / |
| 1490 | JSX文字 | 页面信息 |
| 1493 | JSX文字 | 日期 |
| 1497 | JSX文字 | 来源路径 |
| 1501 | JSX文字 | 返回入口 |
| 1502 | JSX文字 | 最近更改 |
| 1513 | JSX文字 | Orbit Wiki / 经验库 / |
| 1517 | JSX文字 | 页面信息 |
| 1520 | JSX文字 | 来源路径 |
| 1524 | JSX文字 | 返回入口 |
| 1525 | JSX文字 | 经验库 |
| 1546 | JSX文字 | Orbit Wiki / 主页面 |
| 1547 | JSX文字 | Orbit Wiki: 项目主页 |
| 1550 | JSX文字 | 概览 |
| 1552 | JSX文字 | Orbit Wiki 把原始文档、知识主题、开发历史和经验库组织成一个可浏览的项目知识站。 页面采用 wiki 式导航：左侧是全站目录，中间是文章和索引，右侧是页面目录和元信息。 |
| 1556 | JSX文字 | 文档库当前收录 |
| 1556 | JSX文字 | 个文档， 新鲜度审计中需要代码核对的条目为 |
| 1566 | JSX文字 | 知识主题 |

## repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx

源码：[orbit-ai-trace-debugger.tsx](</Users/li/work/orbit/repos/orbits/app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx>)

静态来源入口：`/dev/orbit-ai/trace`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 779 | SourcePanel | details |  |  |
| 780 | SourcePanel | summary | source ? `${stage?.label ?? copy.sourceSummaryEmpty} output source` : copy.sourceSummaryEmpty |  |
| 940 | TraceGraph | section |  | trace-loop-band |
| 945 | TraceGraph | header |  | trace-loop-header |
| 1047 | StageDetail | details |  |  |
| 1048 | StageDetail | summary | copy.safetyLedger |  |
| 1098 | PlannerComparison | details |  |  |
| 1099 | PlannerComparison | summary | copy.plannerRawOutput |  |
| 1129 | RuntimeSnapshotPanel | details |  |  |
| 1133 | RuntimeSnapshotPanel | summary | runtimeSnapshot ? `${runtimeSnapshot.tools.length} tools, ${runtimeSnapshot.artifactProducers.length} artifact producers` : copy.architectureSummary |  |
| 1147 | RuntimeSnapshotPanel | header |  |  |
| 1352 | OrbitAiTraceDebugger | header |  | workbench-header trace-header-row |
| 1355 | OrbitAiTraceDebugger | h1 | copy.title |  |
| 1436 | OrbitAiTraceDebugger | section | copy.chainAria | trace-main-grid |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 1282 | [prompt, setPrompt] = useState("看下有什么有意思的活动") |
| 1283 | [locale, setLocale] = useState("zh") |
| 1284 | [uiLanguage, setUiLanguage] = useState&lt;TraceLanguage&gt;("zh") |
| 1285 | [maxLoopSteps, setMaxLoopSteps] = useState("3") |
| 1286 | [payload, setPayload] = useState&lt;OrbitAiTracePayload \| null&gt;(null) |
| 1287 | [requestDurationMs, setRequestDurationMs] = useState&lt;number \| null&gt;(null) |
| 1288 | [requestStatus, setRequestStatus] = useState&lt;RequestStatus&gt;("idle") |
| 1289 | [errorMessage, setErrorMessage] = useState("") |
| 1290 | [selectedStageId, setSelectedStageId] = useState&lt;string \| null&gt;(null) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 780 | disclosure/summary · SourcePanel | {`${stage?.label ?? copy.sourceSummaryEmpty} output source`} / {copy.sourceSummaryEmpty} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 961 | button/button · TraceGraph | {node.kind} · {statusLabel(node.status, language)} {stageLabel(node.stageId, language)} / {node.label} {copy.durationLabel} : {formatDuration(node.durationMs, copy)} | onclick: () =&gt; { if (node.stageId) { onSelect(node.stageId); } } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1048 | disclosure/summary · StageDetail | {copy.safetyLedger} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1099 | disclosure/summary · PlannerComparison | {copy.plannerRawOutput} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1133 | disclosure/summary · RuntimeSnapshotPanel | {`${runtimeSnapshot.tools.length} tools, ${runtimeSnapshot.artifactProducers.length} artifact producers`} / {copy.architectureSummary} |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1364 | button/button · OrbitAiTraceDebugger | 中文 | onclick: () =&gt; setUiLanguage("zh") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1371 | button/button · OrbitAiTraceDebugger | English | onclick: () =&gt; setUiLanguage("en") | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1386 | form-submit-boundary/form · OrbitAiTraceDebugger | {copy.promptLabel} {copy.localeLabel} zh en {copy.loopStepsLabel} 1 2 3 {copy.runningButton} / {copy.runButton} | onsubmit: submitTrace | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1389 | field/textarea · OrbitAiTraceDebugger | {copy.promptLabel} | onchange: (event) =&gt; setPrompt(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1396 | field/select · OrbitAiTraceDebugger | zh en | onchange: (event) =&gt; setLocale(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1406 | field/select · OrbitAiTraceDebugger | 1 2 3 | onchange: (event) =&gt; setMaxLoopSteps(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1441 | callback-control/TraceGraph · OrbitAiTraceDebugger |  | onselect: setSelectedStageId | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 1315 | submitTrace | 调用 | POST | "/api/dev/orbit-ai/trace" |
| 1315 | submitTrace | 路径常量 | 见调用/handler | "/api/dev/orbit-ai/trace" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 49 | 文案/数据常量 artifact_generation | "Artifact" |
| 50 | 文案/数据常量 database_context | "Database" |
| 51 | 文案/数据常量 final_response | "Response" |
| 52 | 文案/数据常量 input_received | "Input" |
| 53 | 文案/数据常量 local_guardrails | "Guardrails" |
| 54 | 文案/数据常量 planner | "Planner" |
| 55 | 文案/数据常量 synthesis | "Synthesis" |
| 56 | 文案/数据常量 tool_mapping | "Tool mapping" |
| 59 | 文案/数据常量 artifact_generation | "Artifact" |
| 60 | 文案/数据常量 database_context | "数据库" |
| 61 | 文案/数据常量 final_response | "最终响应" |
| 62 | 文案/数据常量 input_received | "输入" |
| 63 | 文案/数据常量 local_guardrails | "本地边界" |
| 64 | 文案/数据常量 planner | "规划器" |
| 65 | 文案/数据常量 synthesis | "综合" |
| 66 | 文案/数据常量 tool_mapping | "工具映射" |
| 72 | 文案/数据常量 blocked | "blocked" |
| 73 | 文案/数据常量 completed | "completed" |
| 74 | 文案/数据常量 failed | "failed" |
| 75 | 文案/数据常量 skipped | "skipped" |
| 76 | 文案/数据常量 waiting | "waiting" |
| 79 | 文案/数据常量 blocked | "已截停" |
| 80 | 文案/数据常量 completed | "已完成" |
| 81 | 文案/数据常量 failed | "失败" |
| 82 | 文案/数据常量 skipped | "已跳过" |
| 83 | 文案/数据常量 waiting | "等待中" |
| 89 | 文案/数据常量 architectureEmpty | "Run a trace to detect tools, artifact producers, and renderers." |
| 91 | 文案/数据常量 architectureEyebrow | "Runtime" |
| 92 | 文案/数据常量 architectureSummary | "Runtime snapshot" |
| 93 | 文案/数据常量 architectureTitle | "Detected architecture" |
| 94 | 文案/数据常量 chainAria | "Orbit AI trace debugger" |
| 95 | 文案/数据常量 dataSourceEmpty | "Source modules appear when an artifact producer output is generated." |
| 97 | 文案/数据常量 dataSourceEmptyTitle | "No data source yet" |
| 98 | 文案/数据常量 databaseEmpty | "Local database context appears after a trace run." |
| 99 | 文案/数据常量 databaseEmptyTitle | "No database context yet" |
| 100 | 文案/数据常量 durationLabel | "Duration" |
| 101 | 文案/数据常量 evidence | "evidence" |
| 102 | 文案/数据常量 graphEmpty | "Trace graph appears after a run." |
| 103 | 文案/数据常量 graphMaxLoops | "supports up to" |
| 104 | 文案/数据常量 graphMode | "Graph mode" |
| 105 | 文案/数据常量 inspectorEmpty | "Run a trace to inspect a stage in the pipeline workbench." |
| 107 | 文案/数据常量 inspectorEyebrow | "Selected stage" |
| 108 | 文案/数据常量 inspectorTitleEmpty | "No trace selected" |
| 109 | 文案/数据常量 intro | "Pipeline view for the Agent execution chain: input, local guardrails, planner, tool mapping, artifact generation, synthesis, and final response." |
| 111 | 文案/数据常量 languageToggleLabel | "Switch trace interface language" |
| 112 | 文案/数据常量 localeLabel | "Prompt locale" |
| 113 | 文案/数据常量 loopStepsLabel | "Loop steps" |
| 114 | 文案/数据常量 pipelineEyebrow | "Execution" |
| 115 | 文案/数据常量 pipelineTitle | "Agent execution pipeline" |
| 116 | 文案/数据常量 plannedTools | "planned tools" |
