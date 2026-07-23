# orbit-ai 能力 Live 交接：calendar action

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/CALENDAR_ACTION_LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-orbit-ai-calendar-action-live-implementation.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 orbit-ai 模块 calendar action 能力的 live 实现 边界：需要替换的服务、环境变量、权限约束和验证要求。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/orbit-ai。具体切换行为以 service factory 与测试为准。

## 结构化阅读入口

- 第 1 节：Orbit AI Calendar Action Live 实现
- 第 2 节：当前 No Side Effect Default
- 第 3 节：后续 Live Calendar Adapter
- 第 4 节：Provider Switch 和 Configuration
- 第 5 节：Privacy 和 Provenance Constraints
- 第 6 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## Current No-Side-Effect Default

`calendar-action-service.ts` is a local preview boundary. It reads existing Orbit AI artifact cards and creates an add-to-calendar affordance only when the card already has a concrete title, time, contact or event link, and reason. The supported flow kinds are contact recommendations, event recommendations, follow-up queues, and the dedicated `todo_summary` alias used by to-do result cards as that artifact boundary becomes explicit. The default service never writes saved records, mutates an external calendar, sends notifications or messages, or makes outside network requests.

The preview state is intentionally `staged_unconfirmed`. It shows what would be added, which artifact/source produced it, and that the action is local-only until a later live adapter receives explicit user confirmation. Calendar-grade fields are split from recommendation rationale: `date`, `startTime`, optional `endTime`, `timeZone`, optional `location`, `title`, `relatedLink`, and `reason` all remain in the DTO, but product UI shows the exact calendar fields first and keeps rationale/evidence behind the review disclosure.

Each preview also carries a `completionBoundary` with `confirmationAvailable=false`, `noExternalEventCreated=true`, and `state=awaiting_live_calendar_adapter`. Product UI must render that boundary as a disabled confirmation path, not as a hidden write action, so users can inspect and cancel the staged preview without mistaking it for a saved calendar event.

Product preview UI must keep the add-to-calendar affordance localized (`预览加入日历` in Chinese), keep the visible preview focused on title, date, start, end/timezone, location, localized source, local/unconfirmed state, and the "no calendar event created" status, and move repeated rationale/evidence ids behind a `查看依据` disclosure. Closed secondary result groups must not emit hidden calendar/action links; only visible primary preview cards should expose the view-source next action, cancellation path, and disabled confirmation boundary. User-facing provenance labels are localized (`参会者意图记录`, `活动主题记录`, `画像匹配摘要`, `已保存关系对话`), while raw artifact source ids stay in diagnostics/data attributes instead of visible copy.

## Future Live Calendar Adapter

Add the live adapter beside this file as:

- `features/orbit-ai/calendar-action-live-service.ts`
- `features/orbit-ai/calendar-action-provider.ts`
- `features/orbit-ai/calendar-action-mappers.ts`
- `features/orbit-ai/calendar-action-validators.ts`

The live adapter should implement the same preview DTOs from `calendar-action-service.ts`. UI code must keep importing the feature boundary and must not branch on provider names or raw calendar provider payloads.

## Provider Switch And Configuration

The future switch should be explicit, for example `ORBIT_CALENDAR_ACTION_MODE=mock | live`. Missing live provider configuration must fail closed with a typed service-resolution error rather than falling back to a hidden calendar write.

Expected live configuration will include provider identity, OAuth credentials, calendar scope selection, and a server-side callback secret. No OAuth flow is part of Sprint 90.

## Privacy And Provenance Constraints

Live preview and write flows must preserve:

- artifact id and item id
- source label and source artifact path
- evidence ids
- exact title, date, start time, optional end time, timezone, optional location, link, and reason shown to the user
- local-only versus live-write state
- confirmation availability and whether any event has actually been created

The adapter must not expand relationship context beyond the evidence already present in the artifact card without a separate user-visible permission boundary.

## Replacement Tests

Before enabling live mode, add tests that prove:

- preview generation still requires title, time, link, and reason
- to-do result cards using `todo_summary` can stage an unconfirmed preview when they include the same title/time/link/reason/source fields
- unconfirmed previews perform no saved record write, calendar mutation, notification, message send, or outside network request
- confirmed live writes call only the configured calendar provider after explicit confirmation
- provider failures return a recoverable staged state and keep the original Orbit AI answer visible
- cancellation records no external mutation and returns to the Orbit AI conversation
- disabled confirmation previews remain non-clickable, expose a safe source-review next action, and continue to report that no calendar event was created until live mode is explicitly enabled
- localized product previews keep evidence behind a disclosure and do not expose hidden secondary card links in the accessibility tree
