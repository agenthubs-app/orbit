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
2. Open `/app/profile?action=complete-profile-field`.
   - Confirm profile onboarding/editor context renders for Ari Lane.
   - Confirm the preferred intro channel change is held for confirmation.
   - Confirm outside services contacted is `none`.
3. Open `/app/contacts/new?action=confirm-manual-draft`.
   - Confirm contact acquisition renders manual add, business-card OCR, QR, external contact import, email-calendar signal, referral, and merge sections.
   - Confirm Kenji Watanabe is staged for contact review without a contact write.
4. Open `/app/contacts?action=review-filtered-contact&query=storage&tag=topic:storage-pilots&value=commercial_opportunity`.
   - Confirm the contacts relationship console shows Kenji Watanabe and a storage-pilot review.
   - Confirm outside services contacted is `none`.
5. Open `/app/contacts/demo-contact-1?action=prepare-follow-up`.
   - Confirm Kenji Watanabe's contact detail shows connection evidence.
   - Confirm the follow-up draft stays local until explicit confirmation.
6. Open `/app/events?action=accept-top-event`.
   - Confirm event attendee recommendation and readiness context render.
   - Confirm accepting the event recommendation does not change calendars, saved records, messages, or notifications.
7. Open `/app/events/demo-event-1?action=want-to-connect&targetContactId=contact:priya-shah`.
   - Confirm Climate founders dinner, attendee recommendation, opening line, and want-to-connect intent render.
   - Confirm the intent is route-only and has no peer notification, external message, saved-record write, or outside network request.
8. Open `/app/followups?action=complete-top-followup`.
   - Confirm follow-up generation, message draft context, and notification queue context render.
   - Confirm completion is preview-only and messages/notifications are not sent.
9. Open `/app/chat?action=record-local-reply`.
   - Confirm chat summary and extraction context render for Maya Chen.
   - Confirm the local reply is preview-only and remains connected to the follow-up tracker.
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
