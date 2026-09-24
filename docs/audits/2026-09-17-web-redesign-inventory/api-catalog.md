# HTTP API 路由全表

这里单列全部 Web 服务端 API 路由，包括没有 Web 按钮直接消费的移动端、worker 与内部接口；它们不是额外用户界面。方法来自 handler 的 export 声明。空方法表示动态 re-export/包装，应打开源码核对，不能推断不可用。各界面调用证据见模块明细。

| API 模板 | 导出方法 | handler 源码 |
| --- | --- | --- |
| /api/account/language-preference | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/account/language-preference/route.ts>) |
| /api/account/me | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/account/me/route.ts>) |
| /api/account/session/sign-out | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/account/session/sign-out/route.ts>) |
| /api/agent/actions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/actions/route.ts>) |
| /api/agent/actions/[id]/accept | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/actions/[id]/accept/route.ts>) |
| /api/agent/actions/[id]/dismiss | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/actions/[id]/dismiss/route.ts>) |
| /api/agent/actions/[id]/view | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/actions/[id]/view/route.ts>) |
| /api/agent/automations | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/automations/route.ts>) |
| /api/agent/automations/[id] | PATCH, DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/automations/[id]/route.ts>) |
| /api/agent/automations/[id]/run | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/automations/[id]/run/route.ts>) |
| /api/agent/automations/compile | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/automations/compile/route.ts>) |
| /api/agent/automations/dry-run | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/automations/dry-run/route.ts>) |
| /api/agent/feedback | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/feedback/route.ts>) |
| /api/agent/feedback/[runId] | GET, DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/feedback/[runId]/route.ts>) |
| /api/agent/ledger | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/ledger/route.ts>) |
| /api/agent/ledger/[id]/draft | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/ledger/[id]/draft/route.ts>) |
| /api/agent/ledger/[id]/transition | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/ledger/[id]/transition/route.ts>) |
| /api/agent/matchmaking/organizer-metrics | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/matchmaking/organizer-metrics/route.ts>) |
| /api/agent/matchmaking/requests/[id]/outcome | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/matchmaking/requests/[id]/outcome/route.ts>) |
| /api/agent/matchmaking/requests/[id]/respond | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/matchmaking/requests/[id]/respond/route.ts>) |
| /api/agent/matchmaking/requests/[id]/slots | POST, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/matchmaking/requests/[id]/slots/route.ts>) |
| /api/agent/memory | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/memory/route.ts>) |
| /api/agent/memory/[id] | PATCH, DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/memory/[id]/route.ts>) |
| /api/agent/memory/settings | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/memory/settings/route.ts>) |
| /api/agent/operations/health | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/operations/health/route.ts>) |
| /api/agent/preferences | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/preferences/route.ts>) |
| /api/agent/settings | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/settings/route.ts>) |
| /api/agent/signals | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/signals/route.ts>) |
| /api/agent/signals/[id] | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/signals/[id]/route.ts>) |
| /api/agent/voice-memos/transcribe | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/agent/voice-memos/transcribe/route.ts>) |
| /api/ai/conversations | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/conversations/route.ts>) |
| /api/ai/conversations/[id] | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/conversations/[id]/route.ts>) |
| /api/ai/conversations/groups | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/conversations/groups/route.ts>) |
| /api/ai/conversations/groups/[id] | DELETE, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/conversations/groups/[id]/route.ts>) |
| /api/ai/conversations/sessions | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/conversations/sessions/route.ts>) |
| /api/ai/conversations/sessions/[id] | DELETE, GET, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/conversations/sessions/[id]/route.ts>) |
| /api/ai/mock/message-draft | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/mock/message-draft/route.ts>) |
| /api/ai/proactive-turns | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/proactive-turns/route.ts>) |
| /api/ai/runs/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/runs/[id]/route.ts>) |
| /api/ai/runs/[id]/transition | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/runs/[id]/transition/route.ts>) |
| /api/ai/today | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/ai/today/route.ts>) |
| /api/analysis/relationship-value/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/analysis/relationship-value/[id]/route.ts>) |
| /api/analysis/relationship-value/recompute | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/analysis/relationship-value/recompute/route.ts>) |
| /api/app/bootstrap | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/app/bootstrap/route.ts>) |
| /api/appointments | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/appointments/route.ts>) |
| /api/appointments/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/appointments/[id]/route.ts>) |
| /api/appointments/[id]/commands | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/appointments/[id]/commands/route.ts>) |
| /api/appointments/[id]/details | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/appointments/[id]/details/route.ts>) |
| /api/appointments/[id]/memo | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/appointments/[id]/memo/route.ts>) |
| /api/audit/provenance | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/audit/provenance/route.ts>) |
| /api/audit/provenance/run | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/audit/provenance/run/route.ts>) |
| /api/auth/[...nextauth] | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/[...nextauth]/route.ts>) |
| /api/auth/mobile/credentials | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/mobile/credentials/route.ts>) |
| /api/auth/mobile/google/complete | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/mobile/google/complete/route.ts>) |
| /api/auth/mobile/google/exchange | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/mobile/google/exchange/route.ts>) |
| /api/auth/mobile/google/start | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/mobile/google/start/route.ts>) |
| /api/auth/mobile/providers | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/mobile/providers/route.ts>) |
| /api/auth/password-reset/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/password-reset/confirm/route.ts>) |
| /api/auth/password-reset/request | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/password-reset/request/route.ts>) |
| /api/auth/password-reset/worker | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/password-reset/worker/route.ts>) |
| /api/auth/register | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/auth/register/route.ts>) |
| /api/chat/assist/email-draft | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/assist/email-draft/route.ts>) |
| /api/chat/assist/followup-draft | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/assist/followup-draft/route.ts>) |
| /api/chat/assist/rewrite | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/assist/rewrite/route.ts>) |
| /api/chat/conversations | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/conversations/route.ts>) |
| /api/chat/conversations/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/conversations/[id]/route.ts>) |
| /api/chat/conversations/[id]/extractions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/conversations/[id]/extractions/route.ts>) |
| /api/chat/conversations/[id]/messages | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/conversations/[id]/messages/route.ts>) |
| /api/chat/conversations/[id]/summary | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/conversations/[id]/summary/route.ts>) |
| /api/chat/privacy | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/privacy/route.ts>) |
| /api/chat/privacy/analysis-toggle | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/privacy/analysis-toggle/route.ts>) |
| /api/chat/relationship-inbox | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/chat/relationship-inbox/route.ts>) |
| /api/confirmations/[id]/approve | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/confirmations/[id]/approve/route.ts>) |
| /api/confirmations/[id]/reject | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/confirmations/[id]/reject/route.ts>) |
| /api/connections | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/connections/route.ts>) |
| /api/connections/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/connections/[id]/route.ts>) |
| /api/connections/[id]/evidence | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/connections/[id]/evidence/route.ts>) |
| /api/connections/[id]/lifecycle | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/connections/[id]/lifecycle/route.ts>) |
| /api/connections/[id]/profile | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/connections/[id]/profile/route.ts>) |
| /api/connections/[id]/stage | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/connections/[id]/stage/route.ts>) |
| /api/contact-drafts | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/route.ts>) |
| /api/contact-drafts/[id] | GET, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/[id]/route.ts>) |
| /api/contact-drafts/[id]/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/[id]/confirm/route.ts>) |
| /api/contact-drafts/business-card/batches | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/route.ts>) |
| /api/contact-drafts/business-card/batches/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/cancel | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/cancel/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/finish | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/finish/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/items/[itemId]/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/confirm/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/items/[itemId]/image | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/image/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/items/[itemId]/manual-entry | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/manual-entry/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/items/[itemId]/retry | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/retry/route.ts>) |
| /api/contact-drafts/business-card/batches/[id]/items/[itemId]/skip | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/skip/route.ts>) |
| /api/contact-drafts/business-card/batches/v2 | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/cancel | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/cancel/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/finalize | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/finalize/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/confirm/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/content | PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/content/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/exclude | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/exclude/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/image | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/image/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/manual-entry | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/manual-entry/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/replace | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/replace/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/retry | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/retry/route.ts>) |
| /api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/skip | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/batches/v2/[id]/items/[itemId]/skip/route.ts>) |
| /api/contact-drafts/business-card/imports | POST, GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/imports/route.ts>) |
| /api/contact-drafts/business-card/imports/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/imports/[id]/route.ts>) |
| /api/contact-drafts/business-card/imports/[id]/cancel | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/imports/[id]/cancel/route.ts>) |
| /api/contact-drafts/business-card/imports/verify-source | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/imports/verify-source/route.ts>) |
| /api/contact-drafts/business-card/scan | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/scan/route.ts>) |
| /api/contact-drafts/business-card/uploads | POST, GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/uploads/route.ts>) |
| /api/contact-drafts/business-card/uploads/consume-v2 | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/uploads/consume-v2/route.ts>) |
| /api/contact-drafts/business-card/uploads/token | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/business-card/uploads/token/route.ts>) |
| /api/contact-drafts/event-attendees/import | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/event-attendees/import/route.ts>) |
| /api/contact-drafts/external/candidates | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/external/candidates/route.ts>) |
| /api/contact-drafts/external/import | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/external/import/route.ts>) |
| /api/contact-drafts/manual | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/manual/route.ts>) |
| /api/contact-drafts/merge-suggestions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/merge-suggestions/route.ts>) |
| /api/contact-drafts/merge-suggestions/[id]/apply | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/merge-suggestions/[id]/apply/route.ts>) |
| /api/contact-drafts/qr/scan | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/qr/scan/route.ts>) |
| /api/contact-drafts/recommended/[id]/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/recommended/[id]/confirm/route.ts>) |
| /api/contact-drafts/referral | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-drafts/referral/route.ts>) |
| /api/contact-invitations | GET, POST, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contact-invitations/route.ts>) |
| /api/contacts | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/route.ts>) |
| /api/contacts/[id] | GET, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/[id]/route.ts>) |
| /api/contacts/[id]/relationship-initialization | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/[id]/relationship-initialization/route.ts>) |
| /api/contacts/business-card/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/business-card/confirm/route.ts>) |
| /api/contacts/introductions | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/introductions/route.ts>) |
| /api/contacts/needs-matches | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/needs-matches/route.ts>) |
| /api/contacts/search | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/contacts/search/route.ts>) |
| /api/dashboard | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/route.ts>) |
| /api/dashboard/distributions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/distributions/route.ts>) |
| /api/dashboard/network-gaps | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/network-gaps/route.ts>) |
| /api/dashboard/opportunities | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/opportunities/route.ts>) |
| /api/dashboard/opportunities/recompute | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/opportunities/recompute/route.ts>) |
| /api/dashboard/structure/[dimension]/[bucketId] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/structure/[dimension]/[bucketId]/route.ts>) |
| /api/dashboard/summary | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dashboard/summary/route.ts>) |
| /api/dev/knowledge/documents/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dev/knowledge/documents/[id]/route.ts>) |
| /api/dev/orbit-agent/trace | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dev/orbit-agent/trace/route.ts>) |
| /api/dev/orbit-ai/trace | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/dev/orbit-ai/trace/route.ts>) |
| /api/devices/push-token | DELETE, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/devices/push-token/route.ts>) |
| /api/devices/push-tokens | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/devices/push-tokens/route.ts>) |
| /api/devices/push-tokens/[id] | DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/devices/push-tokens/[id]/route.ts>) |
| /api/encounters | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/encounters/route.ts>) |
| /api/events | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/route.ts>) |
| /api/events/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/route.ts>) |
| /api/events/[id]/access/assignments/[subjectActorId] | GET, PUT, DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/access/assignments/[subjectActorId]/route.ts>) |
| /api/events/[id]/access/roles | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/access/roles/route.ts>) |
| /api/events/[id]/admission/application | DELETE, GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/admission/application/route.ts>) |
| /api/events/[id]/admission/policy | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/admission/policy/route.ts>) |
| /api/events/[id]/admission/reviews | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/admission/reviews/route.ts>) |
| /api/events/[id]/admission/reviews/[actorId] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/admission/reviews/[actorId]/route.ts>) |
| /api/events/[id]/admission/reviews/[actorId]/decision | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/admission/reviews/[actorId]/decision/route.ts>) |
| /api/events/[id]/analytics/aggregate | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/analytics/aggregate/route.ts>) |
| /api/events/[id]/analytics/attendee | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/analytics/attendee/route.ts>) |
| /api/events/[id]/attendees | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/attendees/route.ts>) |
| /api/events/[id]/attendees/import | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/attendees/import/route.ts>) |
| /api/events/[id]/encounters | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/encounters/route.ts>) |
| /api/events/[id]/encounters/[encounterId]/evidence | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/encounters/[encounterId]/evidence/route.ts>) |
| /api/events/[id]/experience | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/experience/route.ts>) |
| /api/events/[id]/experience/draft | PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/experience/draft/route.ts>) |
| /api/events/[id]/experience/preview | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/experience/preview/route.ts>) |
| /api/events/[id]/experience/publish | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/experience/publish/route.ts>) |
| /api/events/[id]/goal | PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/goal/route.ts>) |
| /api/events/[id]/matches | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/matches/route.ts>) |
| /api/events/[id]/matchmaking | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/matchmaking/route.ts>) |
| /api/events/[id]/operations | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/route.ts>) |
| /api/events/[id]/operations/admin | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/route.ts>) |
| /api/events/[id]/operations/admin/check-ins | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/check-ins/route.ts>) |
| /api/events/[id]/operations/admin/export | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/export/route.ts>) |
| /api/events/[id]/operations/admin/generations | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/generations/route.ts>) |
| /api/events/[id]/operations/admin/generations/[generationId]/publish | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/generations/[generationId]/publish/route.ts>) |
| /api/events/[id]/operations/admin/generations/[generationId]/retry | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/generations/[generationId]/retry/route.ts>) |
| /api/events/[id]/operations/admin/generations/[generationId]/run | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/admin/generations/[generationId]/run/route.ts>) |
| /api/events/[id]/operations/check-in | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/check-in/route.ts>) |
| /api/events/[id]/operations/contact-requests | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/contact-requests/route.ts>) |
| /api/events/[id]/operations/contact-requests/[requestId]/respond | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/contact-requests/[requestId]/respond/route.ts>) |
| /api/events/[id]/operations/contact-requests/[requestId]/withdraw | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/contact-requests/[requestId]/withdraw/route.ts>) |
| /api/events/[id]/operations/participants/[participantId] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/operations/participants/[participantId]/route.ts>) |
| /api/events/[id]/post-event | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/post-event/route.ts>) |
| /api/events/[id]/post-event/artifact | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/post-event/artifact/route.ts>) |
| /api/events/[id]/post-event/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/post-event/confirm/route.ts>) |
| /api/events/[id]/post-event/followup | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/post-event/followup/route.ts>) |
| /api/events/[id]/post-event/followups | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/post-event/followups/route.ts>) |
| /api/events/[id]/readiness | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/readiness/route.ts>) |
| /api/events/[id]/registration | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/registration/route.ts>) |
| /api/events/[id]/registration/cancel | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/registration/cancel/route.ts>) |
| /api/events/[id]/registration/interview | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/registration/interview/route.ts>) |
| /api/events/[id]/registration/persona | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/registration/persona/route.ts>) |
| /api/events/[id]/registration/preview | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/registration/preview/route.ts>) |
| /api/events/[id]/want-to-connect | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/[id]/want-to-connect/route.ts>) |
| /api/events/center | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/center/route.ts>) |
| /api/events/public | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/public/route.ts>) |
| /api/events/public/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/events/public/[id]/route.ts>) |
| /api/health | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/health/route.ts>) |
| /api/health/error | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/health/error/route.ts>) |
| /api/integrations | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/integrations/route.ts>) |
| /api/integrations/[provider] | DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/integrations/[provider]/route.ts>) |
| /api/integrations/[provider]/authorize | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/integrations/[provider]/authorize/route.ts>) |
| /api/integrations/[provider]/callback | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/integrations/[provider]/callback/route.ts>) |
| /api/integrations/[provider]/health | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/integrations/[provider]/health/route.ts>) |
| /api/internal/agent/automations | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/internal/agent/automations/route.ts>) |
| /api/internal/agent/dispatch | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/internal/agent/dispatch/route.ts>) |
| /api/internal/agent/scheduler | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/internal/agent/scheduler/route.ts>) |
| /api/internal/agent/worker | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/internal/agent/worker/route.ts>) |
| /api/internal/business-card/dispatch | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/internal/business-card/dispatch/route.ts>) |
| /api/internal/maintenance | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/internal/maintenance/route.ts>) |
| /api/message-drafts | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/message-drafts/route.ts>) |
| /api/message-drafts/[id] | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/message-drafts/[id]/route.ts>) |
| /api/mobile/contacts-dashboard | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/mobile/contacts-dashboard/route.ts>) |
| /api/mock/reset | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/mock/reset/route.ts>) |
| /api/mock/scenarios | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/mock/scenarios/route.ts>) |
| /api/mock/scenarios/[id]/activate | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/mock/scenarios/[id]/activate/route.ts>) |
| /api/notes | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notes/route.ts>) |
| /api/notes/[id] | GET, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notes/[id]/route.ts>) |
| /api/notes/[id]/contacts/[contactId] | DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notes/[id]/contacts/[contactId]/route.ts>) |
| /api/notification-preferences | GET, PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notification-preferences/route.ts>) |
| /api/notifications | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notifications/route.ts>) |
| /api/notifications/[id]/state | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notifications/[id]/state/route.ts>) |
| /api/notifications/deliveries/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notifications/deliveries/[id]/route.ts>) |
| /api/notifications/reminders/generate | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/notifications/reminders/generate/route.ts>) |
| /api/permissions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/permissions/route.ts>) |
| /api/permissions/calendar/request | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/permissions/calendar/request/route.ts>) |
| /api/profile | GET, PUT | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/profile/route.ts>) |
| /api/profile/extractions/business-card | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/profile/extractions/business-card/route.ts>) |
| /api/profile/extractions/resume | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/profile/extractions/resume/route.ts>) |
| /api/profile/update-suggestions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/profile/update-suggestions/route.ts>) |
| /api/profile/update-suggestions/[id]/accept | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/profile/update-suggestions/[id]/accept/route.ts>) |
| /api/profile/update-suggestions/[id]/dismiss | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/profile/update-suggestions/[id]/dismiss/route.ts>) |
| /api/queues/agent-action | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/queues/agent-action/route.ts>) |
| /api/queues/business-card | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/queues/business-card/route.ts>) |
| /api/queues/event-operations | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/queues/event-operations/route.ts>) |
| /api/queues/maintenance | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/queues/maintenance/route.ts>) |
| /api/queues/password-reset | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/queues/password-reset/route.ts>) |
| /api/recommendations/event/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/recommendations/event/[id]/route.ts>) |
| /api/recommendations/event/[id]/opening-line | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/recommendations/event/[id]/opening-line/route.ts>) |
| /api/recommendations/events | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/recommendations/events/route.ts>) |
| /api/recommendations/events/[id]/accept | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/recommendations/events/[id]/accept/route.ts>) |
| /api/relationship-communication/bindings/[contactId] | DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/bindings/[contactId]/route.ts>) |
| /api/relationship-communication/conversations | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/conversations/route.ts>) |
| /api/relationship-communication/conversations/[id] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/conversations/[id]/route.ts>) |
| /api/relationship-communication/conversations/[id]/messages | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/conversations/[id]/messages/route.ts>) |
| /api/relationship-communication/conversations/[id]/read | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/conversations/[id]/read/route.ts>) |
| /api/relationship-communication/eligibility | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/eligibility/route.ts>) |
| /api/relationship-communication/invitations | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/invitations/route.ts>) |
| /api/relationship-communication/invitations/[token] | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/invitations/[token]/route.ts>) |
| /api/relationship-communication/invitations/[token]/accept | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-communication/invitations/[token]/accept/route.ts>) |
| /api/relationship-signals/[id]/confirm | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-signals/[id]/confirm/route.ts>) |
| /api/relationship-signals/email-calendar | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-signals/email-calendar/route.ts>) |
| /api/relationship-tasks | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/relationship-tasks/route.ts>) |
| /api/reminders | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/reminders/route.ts>) |
| /api/reminders/[id] | PATCH | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/reminders/[id]/route.ts>) |
| /api/sandbox/external-actions/audit | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/sandbox/external-actions/audit/route.ts>) |
| /api/sandbox/external-actions/send-message | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/sandbox/external-actions/send-message/route.ts>) |
| /api/schedule-items | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/schedule-items/route.ts>) |
| /api/schedule-items/[id] | re-export/见源码 | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/schedule-items/[id]/route.ts>) |
| /api/schedule-items/[id]/meeting-details | re-export/见源码 | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/schedule-items/[id]/meeting-details/route.ts>) |
| /api/search/relationships | POST, GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/search/relationships/route.ts>) |
| /api/search/suggestions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/search/suggestions/route.ts>) |
| /api/task-suggestions | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/task-suggestions/route.ts>) |
| /api/task-suggestions/[id]/accept | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/task-suggestions/[id]/accept/route.ts>) |
| /api/task-suggestions/[id]/dismiss | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/task-suggestions/[id]/dismiss/route.ts>) |
| /api/task-suggestions/[id]/snooze | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/task-suggestions/[id]/snooze/route.ts>) |
| /api/tasks | GET, POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/tasks/route.ts>) |
| /api/tasks/[id] | GET, PATCH, DELETE | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/tasks/[id]/route.ts>) |
| /api/tasks/[id]/activities | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/tasks/[id]/activities/route.ts>) |
| /api/tasks/generate | POST | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/tasks/generate/route.ts>) |
| /api/tasks/history | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/tasks/history/route.ts>) |
| /api/today | GET | [route.ts](</Users/li/work/orbit/repos/orbits/app/api/today/route.ts>) |
