# Orbit AI Proactive Agent Design

## Goal

Orbit AI should behave like a relationship steward, not only a reactive chatbot. The product should have one user-facing assistant inbox: the Orbit AI chat window. Calendar, event, follow-up, relationship, and system signals should appear there as proactive assistant turns.

This design keeps user-facing entry points simple for the future mobile app while keeping backend ownership clear.

## Product Boundary

Orbit AI owns proactive interpretation and assistant-facing copy. It decides how a signal should be explained to the user, why it matters now, and which reviewable actions should be offered.

Chat or Messages owns user-to-contact communication: conversation context with a person, drafts, rewrites, follow-up copy, and external-send confirmation.

Notifications owns delivery mechanics only: mobile push, badge counts, delivery status, quiet hours, and permission guards. It does not own user-readable proactive content. A mobile push should deep-link to the Orbit AI proactive turn rather than becoming a separate product inbox.

## Data Flow

```text
Events / Calendar / Contacts / Followups / System
  -> AgentSignal
  -> Orbit AI Proactive Agent
  -> ProactiveAgentMessage
  -> Orbit AI chat conversation
  -> optional notification delivery pointer
```

The first implementation is mock-first and in-app only. It creates proactive assistant messages that declare `deliverySurface: "orbit_ai_chat"`. It must not send push notifications, email, calendar writes, database writes, or external messages.

## Domain Objects

`AgentSignal` is a structured fact emitted by a feature module. It contains a signal id, type, title, body, timing, source module, source reference, evidence ids, and severity. It is not user-facing copy.

`ProactiveAgentMessage` is the assistant turn shown inside the Orbit AI chat window. It contains `turnKind: "proactive"`, a generated assistant message, source signal metadata, evidence ids, suggested actions, and a safety ledger.

`SuggestedAction` is reviewable. Actions such as opening an event, preparing context, drafting a message, or reviewing a follow-up do not imply an external action has already happened.

## Initial Signal Types

- `calendar_event_upcoming`: a calendar event is approaching and relationship preparation is useful.
- `calendar_event_changed`: a meeting changed and the user may need to adjust relationship context.
- `followup_due`: a promised follow-up is due.
- `relationship_opportunity`: Orbit sees a relationship opportunity from contacts, events, or graph evidence.
- `system_status`: Orbit needs to explain a product or integration state.

## Runtime Rules

- Proactive messages are assistant turns in the Orbit AI conversation surface.
- The service must fail closed for unknown signal types or missing signal ids.
- Generated copy must include why the user is seeing the message now.
- Every message must preserve source references and evidence ids.
- The first implementation must not call live AI providers, network APIs, push providers, email providers, calendar providers, or live storage.
- The first implementation should use deterministic mock rules so route, UI, and contract tests can stabilize before live scheduling or provider synthesis.

## Implementation Scope

The basic implementation adds a standalone `orbit-ai-proactive-agent` capability under `features/orbit-ai`. It does not change the existing `/api/ai/conversations` route or existing conversation factory in this phase because `createOrbitAgentConversationService` has a high upstream impact.

Later phases can merge proactive turns into the persisted Orbit AI conversation store and expose a mobile deep-link route. That should happen after the proactive contract has stable tests.
