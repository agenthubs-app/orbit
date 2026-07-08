## Sprint Definitions

### Sprint 83 - Restore Root Comprehensive Homepage
Goal: `/` returns to the integrated Orbit Agent plus activity homepage and no longer silently behaves like a pure events/activity page.
Done when: browser and source tests prove the root route leads with Agent and shows lower activity/event context, while personal home routes remain separate.

### Sprint 84 - Asynchronous Relationship Conversations
Goal: create message-style correspondence services and UI with natural relationship tone, next actions, and safe local staging.
Done when: `/app/chat` supports inbox/thread/reply review over typed conversation records and no external sends occur.

### Sprint 85 - Orbit AI Follow-Up Context
Goal: make follow-up context panels resolve and generate accurate relationship context over conversation data.
Done when: ten evaluation cases pass and the former missing-conversation fixture error no longer appears for seeded requests.

### Sprint 86 - Orbit AI Contact Recommendations
Goal: recommend relevant contacts for user goals with evidence-backed ranking.
Done when: ten relevance evaluation cases pass and UI recommendations link to contact details with reasons.

### Sprint 87 - Orbit AI Event Recommendations
Goal: recommend relevant events for people/business-development goals with evidence-backed ranking.
Done when: ten event evaluation cases pass and UI recommendations link to event details with people-to-meet context.

### Sprint 88 - General Orbit AI Conversation
Goal: let Orbit AI converse normally when no tool call is needed while preserving context.
Done when: ten no-tool/context evaluation cases pass and ordinary turns do not open stale tool panels.

### Sprint 89 - To-Do Question Answering
Goal: summarize upcoming business and social next actions from conversations and schedule context.
Done when: five evaluation cases pass and answers cite linked source items.

### Sprint 90 - Calendar Action Affordances
Goal: let AI result cards stage add-to-calendar actions safely.
Done when: preview/cancel flows are visible and tests prove no external calendar mutation occurs.

### Sprint 91 - Proactive Agent Messages
Goal: create local email-like proactive messages for activities starting in one hour.
Done when: messages are idempotent, clickable, and open a context-specific AI conversation without external notification sends.

### Sprint 92 - Orbit AI Panel Localization
Goal: remove mixed English/Chinese product copy from right-side AI result panels.
Done when: panel tests prove copy matches the active system language across AI result types.

### Sprint 93 - Schedule Arrangement Navigation
Goal: replace placeholder schedule arrangement copy with localized, clickable contact/event actions.
Done when: `/app/schedule` right-side items link to valid detail pages and avoid raw ids as primary copy.

### Sprint 94 - Event Registration Profile Guidance
Goal: add deterministic event-specific profile-building questions during registration.
Done when: every registerable demonstration event has current-test-user questions and the registration UI stages answers safely.

### Sprint 95 - Restore Event Detail UI
Goal: restore the previous approved event detail structure instead of collapsed layout.
Done when: desktop and mobile tests prove core sections are visible and non-overlapping.

### Sprint 96 - Demonstration Visual Assets
Goal: provide suitable event scene images and contact/user avatars for all displayed demonstration records.
Done when: manifest coverage tests prove no displayed event, user, or contact lacks an image.