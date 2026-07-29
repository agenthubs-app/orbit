# Sprint 68 Manual Acceptance Script

Purpose: verify the capability-first Orbit framework can run the MVP relationship loop in mock mode without live services. The automated counterpart is `tests/integration/mock-capability-loop.test.tsx`; this document is the operator script for harness evidence collection.

## Preconditions

- Run from the app root.
- Use mock mode only; do not set live provider credentials.
- Acceptance artifacts, browser evidence, JSON probes, screenshots, traces, and logs must be written by the harness under `harness-state/runs/<run-id>/sprint-68/iter-M/` or `harness-logs`.
- Do not write evidence artifacts into this app repo.

## Product Route Walk

1. Open `/app`.
   - Confirm the Orbit relationship command center renders.
   - Confirm onboarding/account context is present through the bootstrap summary.
   - Confirm the one-task focus queue can preview an action with no external side effects.
2. Open `/app/profile`.
   - Confirm the authenticated profile onboarding/editor context renders.
   - Change preferred intro channels and use the explicit save control.
   - Confirm the saved profile is read back after refresh and no outside
     messaging or notification service is contacted.
3. Open `/app/contacts/new?scenario=failure&mode=mock&action=confirm-manual-draft`.
   - Confirm the normal authenticated import workspace renders unchanged and
     the URL does not select mock mode, fixture states, or draft confirmation.
   - Confirm no OCR, QR, attendee import, address-book import, signal read,
     referral generation, merge analysis, or contact write runs on page load.
   - Confirm unavailable sources stay disabled. If business-card OCR is
     configured, verify it runs only after the explicit scan/upload action and
     persists a contact only after the explicit confirmation action.
4. Open `/app/contacts?action=review-filtered-contact&query=storage&tag=topic:storage-pilots&value=commercial_opportunity`.
   - Confirm the contacts relationship console shows Kenji Watanabe and a storage-pilot review.
   - Confirm outside services contacted is `none`.
5. Open `/app/contacts/demo-contact-1?action=prepare-follow-up&scenario=failure`.
   - Confirm the normal actor-scoped, source-backed contact detail remains
     read-only and URL action/scenario values do not change the result.
   - Confirm page load does not add connection evidence, build a follow-up
     draft, write a contact, send a message, deliver a notification, or call an
     outside provider.
6. Sign out and open `/app/admin/access`, then try `/app/admin`,
   `/app/admin/events`, and `/app/platform`.
   - Confirm the access page stays public while every workspace redirects to the
     secure account sign-in flow with its exact return path.
   - Sign in, open each workspace, and confirm its event/profile data belongs to
     the current actor.
   - Append `scenario=failure&action=accept-top-event`; confirm the normal
     actor-scoped result is unchanged and no recommendation acceptance,
     calendar, record, message, notification, or external action is executed.
7. Open `/app/events/demo-event-1?action=want-to-connect&targetContactId=contact:priya-shah`.
   - Confirm the normal source-backed event detail is unchanged; the URL does
     not create an intent, select a target, or render an action result.
   - For a registered event with matchmaking data, use the visible request,
     consent, and scheduling controls. Confirm each mutation uses its
     authenticated POST/PATCH API, reloads stored state, and does not claim
     peer notification, external messaging, or calendar delivery before those
     capabilities actually run.
8. Open `/app/today?view=day`.
   - Confirm the time spine contains source-backed follow-up and draft context.
   - Confirm public query input does not claim completion, send messages, or
     schedule notifications.
9. Open `/app/chat`, then select a source-backed conversation.
   - Confirm the URL uses `conversation=<id>` and the selected thread, summary,
     extraction, writing assist, and privacy context all belong to that identity.
   - Repeat with `conversationId=<id>` and confirm the same identity is selected.
   - Append `prompt=do-not-run&scenario=failure`; confirm the normal actor-scoped
     Chat result is unchanged and no Agent turn, reply record, task, message,
     notification, or external action is created.
10. Open `/app/dashboard?action=run-dashboard-review`.
    - Confirm dashboard update, opportunity prompts, network coverage, and provenance warnings render.
    - Confirm no compliance report, production audit storage, or external delivery is written.
11. Open `/app/agent?action=review-top-agent-action`.
    - Confirm the agent command center lists an action requiring review.
    - Confirm agent action confirmation is previewed and the external action sandbox reports a no-op preview.

## Required API Probes

Run these route-handler or browser/API probes and record the response status and envelope under the harness run directory:

- `GET /api/app/bootstrap` returns status `200` with `{ success: true, data }`.
- `GET /api/audit/provenance` returns status `200` with `{ success: true, data }`.
- `GET /api/agent/actions` returns status `200` with `{ success: true, data }`.
- `GET /api/dashboard` returns status `200` with `{ success: true, data }`.

## Required Mock Capability Probes

Exercise at least one mock path for each external or hard-to-debug capability:

- OCR: `POST /api/contact-drafts/business-card/scan` with readable `imageText`; verify `ocrProviderCalled: false`.
- QR: `POST /api/contact-drafts/qr/scan` with an `orbit-qr:` payload; verify `qrDecoderProviderCalled: false` and `notificationDelivered: false`.
- External contact import: `POST /api/contact-drafts/external/import`; verify `externalNetworkRequested: false`.
- Email-calendar signal: `GET /api/relationship-signals/email-calendar`; verify email/calendar provider work is local and `externalNetworkRequested: false`.
- AI draft: `POST /api/ai/mock/message-draft`; verify `liveAiProviderRequested: false`.
- Chat summary: `POST /api/chat/conversations/demo-conversation-1/summary`; verify `aiProviderRequested: false`.
- Notification: `GET /api/notifications`; verify `notificationProviderRequested: false`.
- External action sandbox: `POST /api/sandbox/external-actions/send-message`; verify `providerRequestIssued: false` and `externalSideEffectExecuted: false`.
- Agent action confirmation: `POST /api/agent/actions/demo-action-1/accept`; verify the action is accepted locally and `externalSideEffectExecuted: false`.

## Provenance Check

- Confirm the provenance audit includes contact, connection, evidence, recommendation, task, chat summary, and agent action collections.
- Confirm the success audit reports `activeFindingCount: 0`, an empty `findings` array, and copy stating zero active findings.
- Confirm every audited collection and finding has at least one `sourceRefs` entry and at least one `evidenceIds` entry.
- Confirm dashboard data still carries source, evidence, or provenance links for dashboard items used in the MVP loop.
- At a 375 px viewport, open `/app/contacts/new?action=confirm-manual-draft` and confirm the document does not horizontally scroll.

## Verification Commands

Run these from the app root:

```bash
node --test --import tsx tests/integration/mock-capability-loop.test.tsx
npm test
npm run lint
npm run build
```

All commands must exit `0` before reporting Sprint 68 complete.
