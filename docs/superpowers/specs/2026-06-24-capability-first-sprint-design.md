# Capability-First Sprint Design for Orbit

Date: 2026-06-24

## Why This Replaces The Component-First Plan

The previous plan treated business UI components as the main sprint unit. That missed an important product fact from `docs/designs/inital_design.md`: many early Orbit requirements are capabilities that are hard to debug later or depend on external systems. Business card scanning, QR connection, contact import, email/calendar signals, chat summary, AI message drafting, notifications, and agent actions need explicit mock boundaries before pages consume them.

This version makes the framework real and makes hard capabilities mock-first. A sprint normally delivers a contract, service interface, fixture set, mock service, API route, debug surface, and tests for one capability. UI components become consumers of capability contracts instead of the planning axis.

## Initial Real Implementation

- Next.js app scaffold, scripts, app shell, route placeholders, state view, and Tokyo-like visual foundation.
- API envelope, AppError, feature mode, domain DTO skeleton, provenance model, mock registry, state store, service factory, capability registry, and debug surfaces.
- Mock route handlers and mock services that can be exercised through `/dev/capabilities/*` and `/app/*` routes.

## Initial Mock Boundaries

- Auth/session, profile extraction, business-card OCR, QR scanning, external contact import, email/calendar relationship signals, event attendee import, referrals, duplicate merge, recommendations, opening lines, note capture, post-event review, followups, message drafting, reminders, notifications, chat, chat AI summary, dashboard analytics, value scoring, agent actions, external action execution, and AI provider calls.

## Sprint Waves

### Wave 0: Runnable Framework
- Sprint 1: App scaffold and scripts
- Sprint 2: Tokyo-like workbench style foundation
- Sprint 3: App shell and route placeholders
- Sprint 4: API envelope, AppError, and feature mode
- Sprint 5: Domain DTO skeleton and provenance model
- Sprint 6: Mock registry and fixture state store
- Sprint 7: Service factory and capability registry
- Sprint 8: Debug action runner and evidence-safe dev surfaces

### Wave 1: Account, Profile, and Consent
- Sprint 9: Mock account session
- Sprint 10: Profile onboarding and manual profile editor
- Sprint 11: Profile document extraction mock
- Sprint 12: Profile signal review queue
- Sprint 13: Permission state and staged authorization mock
- Sprint 14: Sensitive action confirmation guard

### Wave 2: Contact Acquisition and Sources
- Sprint 15: Contact acquisition draft pipeline
- Sprint 16: Manual contact creation mock
- Sprint 17: Business card scan OCR mock
- Sprint 18: Business card review and confirm flow
- Sprint 19: QR scan connect mock
- Sprint 20: Event attendee import mock
- Sprint 21: External contacts import mock
- Sprint 22: Email and calendar relationship signal mock
- Sprint 23: Referral and recommended contact confirm mock
- Sprint 24: Duplicate detection and merge mock

### Wave 3: Contacts, Connections, and Relationship Context
- Sprint 25: Contacts list search and filter mock
- Sprint 26: Contact detail tag and status mock
- Sprint 27: Connection and evidence service mock
- Sprint 28: Relationship stage and profile mock
- Sprint 29: Relationship value scoring mock
- Sprint 30: Relationship natural search mock

### Wave 4: Event Lifecycle and On-Site Flow
- Sprint 31: Event CRUD and import mock
- Sprint 32: Event attendee roster mock
- Sprint 33: Event goal and readiness mock
- Sprint 34: Event recommendation and opening-line mock
- Sprint 35: Event value recommendation mock
- Sprint 36: On-site want-to-connect mock
- Sprint 37: Event encounter note capture mock
- Sprint 38: Post-event contact review mock

### Wave 5: Followups, Messaging, and Chat
- Sprint 39: Followup task generation mock
- Sprint 40: Message draft generator mock
- Sprint 41: Reminder schedule and notification mock
- Sprint 42: Chat conversation and message mock
- Sprint 43: Chat writing assist mock
- Sprint 44: Chat summary and extraction mock
- Sprint 45: Chat privacy controls mock

### Wave 6: Analysis, Dashboard, Agent, and External Action Safety
- Sprint 46: Dashboard aggregate mock
- Sprint 47: Network distribution analytics mock
- Sprint 48: Opportunity reminder analytics mock
- Sprint 49: Agent action queue mock
- Sprint 50: Agent autonomy settings mock
- Sprint 51: External action sandbox mock
- Sprint 52: AI provider mock and provenance boundary

### Wave 7: Capability Integration and Bootstrap
- Sprint 53: App bootstrap mock aggregator
- Sprint 54: Mock data mutation reset and scenario switcher
- Sprint 55: Source consistency and provenance audit
- Sprint 56: Capability debug dashboard

### Wave 8: App Route Composition
- Sprint 57: /app workbench page
- Sprint 58: /app/profile page
- Sprint 59: /app/contacts acquisition page
- Sprint 60: /app/contacts page
- Sprint 61: /app/contacts/demo-contact-1 page
- Sprint 62: /app/events page
- Sprint 63: /app/events/demo-event-1 page
- Sprint 64: /app/followups page
- Sprint 65: /app/chat page
- Sprint 66: /app/dashboard page
- Sprint 67: /app/agent page

### Wave 9: Mock MVP Acceptance
- Sprint 68: Full mock capability loop acceptance
