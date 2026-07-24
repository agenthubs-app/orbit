# Business Card OCR, Event Registration, and Relationship Inbox Redesign

> Status: approved interaction design; written specification awaiting final review.
> Date: 2026-07-24.

## 1. Goal

Deliver four connected improvements without weakening Orbit's review and
side-effect boundaries:

1. Replace the business-card demo lookup with real cloud OCR that produces a
   reviewable contact draft.
2. During event registration, generate a short set of questions from the event
   and the user's relevant profile gaps, then save confirmed answers into an
   event-specific participant profile.
3. Let a user cancel and later restore their own event registration without
   conflating that action with cancellation of the event itself.
4. Redesign the Relationship Inbox into a useful desktop conversation workspace
   whose width can be resized by dragging.

The four changes share one product rule: model- or source-derived information is
always reviewable before it becomes durable user data, and external side effects
remain explicit.

## 2. Scope and Non-goals

### In scope

- Paid Gemini API processing of an uploaded business-card image.
- Structured OCR extraction, deterministic field validation, manual correction,
  and explicit confirmation before a contact is created.
- A prominent capture entry, confirmed contact write, and optional Orbit
  invitation preview after a successful business-card review.
- Event-specific registration questions generated from event content and
  relevant user profile gaps.
- An event-scoped participant profile whose answers are previewed and confirmed.
- A durable, auditable user registration record with cancel and re-register
  actions.
- A three-pane desktop conversation experience with a persistent resizable
  panel width.
- Responsive inbox behavior, keyboard resizing, and an Alerts-specific
  list/detail layout.
- Controlled failures, provenance, observability, and representative automated
  tests.

### Out of scope

- Free Gemini/AI Studio processing of real business cards.
- Automatic contact creation, automatic overwriting of an existing contact, or
  automatic invitation email.
- Provider-reported OCR confidence when the provider does not supply calibrated
  confidence.
- Automatically writing event answers into the user's global Profile.
- Organizer notification, refunds, waitlist promotion, calendar cancellation,
  or external messaging when a user cancels an Orbit registration.
- Turning Alerts into conversation messages.
- Real external message delivery from the Relationship Inbox.

## 3. Domain Decisions

### 3.1 Event lifecycle and user registration are independent

`Event.status = cancelled` means the event itself no longer takes place.
`EventRegistration.status = cancelled` means only the current user withdrew
their RSVP. UI copy, storage, APIs, filters, reminders, and tests must preserve
this distinction.

Cancellation is an auditable state transition, not deletion. The existing
registration record keeps its timestamps and profile reference. Re-registering
reactivates the same user/event relationship and offers the previous
event-profile answers for review.

### 3.2 Event participant data stays event-scoped

Registration answers produce an `EventParticipantProfile`, not a mutation of the
global Profile. A later product flow may suggest a global profile update, but it
requires separate preview and confirmation.

Cancelling a registration makes its participant profile inactive for attendee
matching and event preparation. It does not delete the profile. Explicit
deletion remains a separate user action.

### 3.3 OCR output is a draft, not a contact

A business-card scan produces extracted fields plus provenance and validation
results. The user can correct the fields and must confirm them before the
contact-draft pipeline may write a confirmed contact.

The invitation decision is independent of contact confirmation. Declining an
invitation does not prevent the contact write, and confirming the contact never
silently opts the user into sending an invitation.

### 3.4 Threads and alerts remain separate

Conversation threads are persistent histories. Alerts are transient reminders
or proactive signals. They share one panel and unread badge but retain separate
information architecture and interaction models.

## 4. Business Card OCR

### 4.1 Selected approach

Use `gemini-3.5-flash-lite` through the paid Gemini API as the test-stage OCR and
field-extraction model. Send the image at high media resolution, request strict
JSON-schema output, and run deterministic validators after model extraction.

This is intentionally a low-cost baseline. If the evaluation set shows poor
small-text, rotation, or layout performance, introduce Google Document AI
Enterprise OCR as a preprocessing stage and keep Flash-Lite for normalization
into Orbit's contact schema.

Runtime configuration:

- API key: prefer `GEMINI_API_KEY`; accept `GOOGLE_API_KEY` as a compatibility
  fallback.
- OCR model: default `gemini-3.5-flash-lite`; allow an OCR-specific environment
  override for controlled evaluation.
- Do not log, persist, return, or expose an API key.
- Missing configuration fails closed with a controlled
  `BUSINESS_CARD_OCR_UNCONFIGURED` result; it must not fall back to fixture data
  in live mode.

### 4.2 Input and output

The live scan action accepts:

```ts
type BusinessCardScanInput = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  imageName?: string;
};
```

The image payload is bounded by explicit file-size and supported-format checks
before provider invocation. EXIF metadata is ignored for contact extraction.

The provider returns a schema-shaped extraction:

```ts
type BusinessCardExtraction = {
  fullName: string | null;
  givenName: string | null;
  familyName: string | null;
  organization: string | null;
  title: string | null;
  emails: readonly string[];
  phones: readonly string[];
  website: string | null;
  address: string | null;
  socialHandles: readonly {
    network: string;
    handleOrUrl: string;
  }[];
  detectedLanguages: readonly string[];
};
```

The Orbit response additionally reports:

- provider and model identifiers;
- source image name and a non-reversible content fingerprint;
- extracted fields;
- per-field validation issues;
- `needsReview`;
- provider timing and token/usage metadata when available;
- explicit side-effect provenance.

No synthetic numeric "confidence" is displayed. `needsReview` is derived from
deterministic checks such as malformed email or phone values, missing identity
fields, conflicting name forms, unsupported output, and possible hallucinated
fields.

### 4.3 Processing flow

1. The user selects or captures one business-card image.
2. The client validates type and size and shows a local preview.
3. The live route sends the image to the OCR service.
4. The service requests structured extraction from the configured provider.
5. Deterministic normalization and validation produce a contact draft preview.
6. The UI highlights fields that need review and allows correction.
7. Explicit confirmation writes the corrected person into the Contacts store
   through a dedicated, idempotent contact-write boundary.
8. After the write succeeds, Orbit offers an optional invitation step.

Scanning itself does not write a confirmed contact or perform outreach. Only the
separate confirmation actions may advance those states.

### 4.4 Capture entry and review workspace

`/app/contacts/new` makes `扫描名片` the primary acquisition action instead of
hiding it among equally weighted import sources. The desktop entry combines:

- a large drop/capture target with `拍照扫描` and `上传图片`;
- a visible card-edge guide and local image preview;
- concise cloud-processing and retention copy before upload;
- processing, invalid-image, provider-failure, and retry states;
- side-by-side card preview and editable extracted fields after success.

On mobile, the same action opens the rear camera when supported and falls back
to the photo picker. The user can replace the image without losing unrelated
page state.

The visual signature is a quiet "capture rail": the card image on the left and
an evidence-linked field rail on the right, connected by restrained source
markers. It communicates that the fields came from this card without displaying
invented confidence scores.

### 4.5 Confirmed contact write

Confirmation creates one Contacts record from the corrected draft. The write:

- is idempotent for the draft ID;
- preserves the business-card source and evidence IDs;
- stores normalized primary fields plus labeled contact points;
- runs duplicate detection before creation;
- never overwrites an existing contact without a separate merge decision;
- returns the resulting contact ID and whether a new record was created.

If duplicate detection finds a likely match, the flow stops at a merge review;
it does not create a second person or send an invitation.

### 4.6 Optional Orbit invitation

After a new or existing contact is confirmed, show an unchecked
`邀请对方加入 Orbit` choice when a reviewed email address exists.

Selecting it opens an editable preview with:

- recipient name and reviewed email;
- subject and body;
- the sender's Orbit identity;
- a plain explanation of why the recipient is being invited;
- `暂不邀请` and `确认邀请` actions.

`确认邀请` is a second explicit confirmation. It cannot share a click with
`确认并收录`. The invitation is generated through the existing invitation draft
kind and handed to a replaceable email-delivery boundary.

During the current test stage, when no email delivery provider is configured,
the confirmed message remains `ready_for_delivery` and the UI says it was not
sent. A future configured provider may transition it to `sent`; only a provider
receipt can produce that state. The system records recipient, confirmation time,
provider status, and source contact ID, but never includes the raw card image.

### 4.7 Privacy and retention

Business cards contain personal information. During the test phase, real cards
may only be sent through the paid API terms selected for the project. The UI
states that the image is processed by a cloud provider before upload.

Orbit should retain only what is needed for review and provenance:

- do not persist the raw image by default;
- keep the image in memory only for the active request and local preview;
- persist extracted fields only as a reviewable draft after successful
  extraction;
- persist a one-way fingerprint rather than the original image;
- redact card content from application logs and provider-error telemetry;
- expose a clear retry path when the provider fails.

### 4.8 Evaluation gate

Before broader rollout, evaluate 30–50 sanitized cards covering Chinese,
Japanese, and English; mixed-language cards; rotated images; glare; low
contrast; small text; and multi-column layouts.

Track:

- exact or normalized accuracy by field;
- missed and hallucinated fields;
- percentage of scans requiring manual correction;
- P50 and P95 latency;
- provider cost per successful scan;
- controlled-failure rate.

The baseline can ship to the test environment only if no scan bypasses review,
unsupported output fails visibly, and the results are good enough for the agreed
test cards. The evaluation decides whether Document AI preprocessing is needed;
it does not silently change the production provider.

## 5. Event Registration Questions and Participant Profile

### 5.1 Selected approach

Use a hybrid generator:

1. Deterministic code identifies event-relevant profile gaps and selects at most
   four allowed question intents.
2. The same provider and model currently selected for Orbit AI customizes the
   wording and answer options.
3. Strict schema validation and business rules reject unsupported, duplicate,
   sensitive, or irrelevant questions.

There is no separate Events model setting. Question generation resolves the
same provider, model, endpoint policy, and timeout policy as Orbit AI. If Orbit
AI is configured for Gemini, OpenAI, or DeepSeek, the registration generator
uses that exact provider/model selection.

### 5.2 Allowed context

The generator may receive:

- event title, topic, description, agenda, format, location, and intended
  attendees;
- the user's professional headline, organization, role, expertise, event goals,
  and already-confirmed event-relevant profile fields;
- a list of missing participant-profile fields;
- locale.

The generator must not receive private notes, unrelated conversation bodies,
raw business-card images, credentials, or unrestricted contact history.

### 5.3 Question policy

Question intents are drawn from an allowlist:

- positioning or current focus;
- who the user wants to meet;
- what the user can offer other attendees;
- desired event outcome;
- preferred follow-up channel or timing.

Rules:

- zero to four questions;
- every question must map to exactly one event-profile field;
- no question may ask for sensitive personal data;
- do not ask for information already available and suitable for this event;
- answers remain optional;
- model failure or invalid output never blocks registration;
- no free-form model output is rendered as executable UI.

The strict result shape is:

```ts
type RegistrationQuestionSet = {
  eventId: string;
  questions: readonly {
    id: string;
    intent:
      | "positioning"
      | "target_attendees"
      | "value_offered"
      | "desired_outcome"
      | "follow_up_preference";
    prompt: string;
    answerKind: "short_text" | "multi_select" | "single_select";
    options: readonly string[];
    profileField: string;
    reason: string;
  }[];
};
```

Question IDs and storage field mappings are created deterministically. The model
may customize user-facing wording and options but may not invent storage paths
or side-effect policy.

### 5.4 Registration interaction

1. The user chooses `报名参加`.
2. Orbit loads the event, the current registration state, and only the relevant
   profile-gap summary.
3. The generator returns zero to four questions. A valid deterministic fallback
   is used when the provider is unavailable; if no useful question remains, the
   user proceeds without questions.
4. The user answers, skips, or edits answers.
5. Orbit shows a compact participant-profile preview.
6. One confirmation creates or reactivates the registration and saves the
   event-scoped participant profile.
7. The event page immediately reflects the registered state.

The registration write and event-profile write form one application-level
operation. A partial result must be surfaced and reconciled; the UI must not
claim success if only one write completes.

### 5.5 Demo scenario

Event: `Tokyo Climate Founder Dinner`, a small dinner for climate founders,
operators, and investors.

User context: Ari is building Orbit and wants relationships with founder/operator
investors. Existing profile has a role and organization but lacks event-specific
positioning, desired attendees, contribution, and follow-up preference.

Example generated questions:

1. "At this dinner, how would you describe what you are building with Orbit?"
2. "Which climate founders, operators, or investors would be most useful for you
   to meet?"
3. "What can you offer other attendees in a first conversation?"
4. "If a conversation is promising, how would you prefer to follow up?"

The preview is an `EventParticipantProfile` for this event only, for example:
"Relationship-workflow founder; wants climate SaaS operators and
founder/operator investors; can offer product feedback and relationship-system
design; prefers an email follow-up within two days."

## 6. Cancel and Restore Event Registration

### 6.1 Data model

Add an auditable record independent of `Event`:

```ts
type EventRegistrationRecord = {
  id: string;
  eventId: string;
  userId: string;
  status: "rsvped" | "cancelled";
  eventParticipantProfileId: string | null;
  registeredAt: string;
  cancelledAt: string | null;
  updatedAt: string;
  evidenceIds: readonly string[];
};
```

There is at most one active logical registration per `(eventId, userId)`.
Repeated register or cancel requests are idempotent.

The source of truth for `youRsvped`, attendee eligibility, preparation access,
and registration actions becomes this record. View adapters must not infer the
state from a fixture event ID.

### 6.2 User experience

- Not registered: primary action `报名参加`.
- Registered: status `已报名` and secondary destructive action `取消预约`.
- Cancel opens a confirmation dialog naming the event and explaining that the
  event profile will become inactive but remain available.
- Successful cancellation immediately updates the action state and removes the
  user from participant-only matching or preparation views.
- Cancelled: offer `重新报名`.
- Re-registration previews previous event-profile answers and lets the user
  confirm or revise them before activation.

Cancellation is allowed until the event has ended. A cancelled event, a past
event, missing registration, or invalid state returns a controlled domain
result. Repeating cancellation for an already-cancelled registration returns
the same cancelled state without duplicating audit effects.

### 6.3 Route and service boundary

Registration behavior belongs in a dedicated Events child capability rather
than the event CRUD service. The route shape is:

```text
POST /api/events/[id]/registration
POST /api/events/[id]/registration/cancel
```

The service factory must expose mock/hybrid/live implementations consistently
with existing Events boundaries. Live mode reads and writes an
`event_registrations` collection and keeps provider/storage provenance.

Cancellation performs only Orbit-local state changes:

- no organizer message;
- no attendee notification;
- no email or external message;
- no calendar cancellation;
- no automatic deletion of the event profile.

Reminder and recommendation readers must exclude cancelled registrations where
registration state is a prerequisite.

## 7. Relationship Inbox Redesign

### 7.1 Product references and direction

The selected direction combines the density and durable split-view behavior of
Slack with the relationship context available in Intercom's Inbox:

- a stable list-detail workspace rather than repeatedly replacing one screen;
- the conversation remains central;
- relevant person, company, provenance, and follow-up context stays visible
  without polluting the message history.

The implementation follows Orbit's own visual tokens and information model; it
does not copy either product's styling.

References:

- [Slack split view](https://slack.com/help/articles/47144721728275-Use-split-view-in-Slack)
- [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained)

### 7.2 Desktop layout

The right-side panel defaults to `980px`, is bounded between `720px` and `96vw`,
and contains:

1. Thread list, `260px`: search, filters, thread rows, unread state, timestamps,
   and recent relationship context.
2. Conversation, flexible: compact contact header, full message history, date
   groups, unread separator, and sticky composer.
3. Relationship context, `280px`: person/company, relationship stage, source
   evidence, next follow-up, and one reviewable Orbit AI suggestion.

For widths from `720px` through `879px`, the context pane collapses behind an
explicit toggle. At `880px` and above, all three panes are visible.

The Alerts tab uses two panes—alert list and alert detail—because forcing alerts
into the conversation-oriented three-pane hierarchy would imply the wrong
domain model.

### 7.3 Resizing

A visible resize handle sits on the panel's left edge.

- Use Pointer Events and pointer capture so dragging remains stable if the
  pointer leaves the handle.
- Clamp width continuously to `720px`–`96vw`.
- Persist the last valid width in `localStorage`, scoped to the Relationship
  Inbox.
- Double-click resets to `980px`.
- The handle exposes `role="separator"`, horizontal orientation, current/min/max
  values, and an accessible label.
- Left/Right Arrow adjusts by a small step; Shift+Arrow adjusts by a larger
  step; Home/End selects min/max.
- Window resizing reclamps a stored width before render.

Resizing must not unmount the active thread, clear a reply draft, reset message
scroll, refetch the workspace on every pointer move, or select another row.
Only the shell width changes during a drag.

### 7.4 Conversation behavior

- Selecting a thread keeps the list visible on desktop and loads its full
  history in the center.
- Messages are grouped by date and preserve sender distinction without oversized
  chat bubbles.
- An unread separator is shown at the first unread message when the data supports
  it.
- The composer remains sticky and keeps the existing local staged-preview /
  confirmation requirement.
- Contact context and evidence are secondary disclosures, not injected into the
  conversation body.
- Orbit AI suggestions are reviewable aids and never auto-send or silently
  mutate relationship data.

### 7.5 Responsive behavior

- `>= 880px` panel width: full three-pane conversation layout.
- `720px–879px`: thread list + conversation; context is a drawer/toggle.
- Narrow viewport/mobile: full-screen single-column flow with explicit
  list/conversation/context navigation and a back action.
- Alerts retain list/detail semantics at every breakpoint.

Responsive transitions preserve the active thread and draft. Mobile layout must
not render an off-screen desktop pane as the only accessible copy of important
controls.

### 7.6 Component boundary

Split the current monolithic panel into focused UI modules:

```text
RelationshipInboxShell
├── useRelationshipInboxResize
├── RelationshipInboxTabs
├── ThreadListPane
├── ConversationPane
│   ├── ConversationHeader
│   ├── MessageHistory
│   └── ReplyComposer
├── RelationshipContextPane
└── AlertsWorkspace
    ├── AlertListPane
    └── AlertDetailPane
```

The existing inbox view-model boundary remains the DTO-to-UI mapping point.
Components consume view models rather than importing feature contracts
directly. The resize hook owns only layout state; data fetching and thread state
remain in the workspace controller.

The conversation API response may be extended with a relationship-context view
model, but it must be assembled through existing feature services and evidence
boundaries rather than direct store access from the component.

## 8. Architecture and Failure Boundaries

### 8.1 Service ownership

- Acquisition owns OCR provider invocation, normalization, review state, and
  contact-draft output.
- Contacts owns the confirmed person write; Followups owns invitation draft
  composition; a separate delivery adapter owns any future external email send.
- Events Registration owns question selection/generation, participant-profile
  confirmation, registration state transitions, and registration provenance.
- Orbit AI owns the shared provider/model selection used by registration
  question generation.
- Chat and the application Inbox presenter own conversation workspace data.
- Notifications and Orbit AI proactive services continue to own Alerts data.

### 8.2 Deterministic policy versus model work

Code owns:

- provider selection and configuration requirements;
- allowed question intents and maximum count;
- input minimization;
- schemas and validation;
- state transitions and idempotency;
- duplicate protection and invitation confirmation;
- cancellation eligibility;
- retention, side effects, and failure behavior.

Models own:

- extracting visible business-card fields into the allowed schema;
- customizing approved registration-question wording and answer options.

The model never decides whether to create a contact, register or cancel a user,
update a global profile, send a message, or call an external side-effect
provider.

### 8.3 Controlled failures

Every live path fails visibly and specifically:

- OCR provider missing, timeout, invalid image, invalid structured output, or
  rejected content;
- question provider missing, timeout, or invalid output;
- event not found, event ended/cancelled, registration conflict, or partial
  persistence;
- inbox workspace unavailable or relationship context unavailable.

Question generation failure degrades to deterministic questions or no
questions, and never blocks registration. OCR failure cannot fabricate a draft.
Relationship context failure does not hide an otherwise valid conversation;
the context pane displays a bounded unavailable state.

## 9. Data and API Compatibility

- Existing mock and hybrid outputs remain deterministic.
- Live modes never silently fall back to mock fixtures.
- New contract fields are additive where possible.
- Existing API consumers keep their current shapes unless they opt into new
  registration, OCR, or relationship-context fields.
- `RSVP_STATUS_VALUES` may continue to describe imported attendee evidence, but
  the current user's actionable registration state must come from
  `EventRegistrationRecord`.
- Old records without a registration record are handled as unregistered unless
  a deliberate migration supplies auditable evidence.
- Stored inbox width is presentational client state and is not synced to the
  server.

## 10. Testing and Verification

### 10.1 Business-card OCR

- Provider adapter sends the expected image and strict schema.
- `GEMINI_API_KEY` and `GOOGLE_API_KEY` resolution is covered without exposing
  values.
- Missing provider configuration fails closed.
- Invalid image, timeout, malformed output, and partial extraction are visible.
- Validators normalize email, phone, URL, language, and duplicate fields.
- Scan never creates a confirmed contact.
- Raw image and extracted personal data are absent from logs.
- Confirming a reviewed draft writes one idempotent contact record and preserves
  evidence.
- Duplicate candidates stop for merge review without writing or inviting.
- Invitation is opt-in, editable, and requires a separate confirmation.
- Missing email delivery configuration leaves the invitation visibly unsent.
- Sanitized multilingual evaluation produces an explicit report.

### 10.2 Registration questions and profile

- The generator uses the exact Orbit AI provider/model resolver.
- Only allowed, missing, event-relevant fields are selected.
- The model receives minimized context and cannot create storage paths.
- Zero to four valid questions render; duplicates and sensitive prompts are
  rejected.
- Provider failure does not block registration.
- Answers remain event-scoped and require preview/confirmation.
- No global Profile field changes as a side effect.

### 10.3 Cancel and restore

- Registration and event status remain independent.
- Register, cancel, repeated cancel, and re-register are idempotent.
- Cancellation keeps audit history and inactivates the event profile.
- Past/cancelled event constraints return controlled results.
- Cancelled users are excluded from registration-dependent reminders, matching,
  and preparation.
- No organizer, notification, email, calendar, or external-network side effect
  occurs.
- Event list and detail derive `youRsvped` from registration data.

### 10.4 Relationship Inbox

- Default, minimum, maximum, persisted, reset, keyboard, and viewport-reclamped
  widths work.
- Dragging uses pointer capture and does not lose drafts, active thread, or
  message scroll.
- Full, compact, and mobile layouts preserve navigation and controls.
- Thread list, message history, date grouping, unread state, sticky composer,
  and relationship context are accessible.
- Alerts use list/detail layout and do not become messages.
- Existing send-confirmation and no-external-side-effect assertions remain true.
- Presenter components do not import feature contracts directly.

### 10.5 Repository verification

Implementation follows TDD at each behavior boundary. Before completion:

- run focused tests for each capability;
- run the relevant page and contract suites;
- run type checking and linting;
- run production build if the changed surface requires it;
- inspect the inbox at all three responsive ranges;
- run GitNexus change detection and verify only expected symbols and execution
  flows changed.

## 11. Delivery Order

1. Introduce shared provider resolution needed by Orbit AI consumers without
   changing the selected provider/model behavior.
2. Implement and evaluate the cloud OCR adapter, prominent capture entry,
   confirmed contact write, and optional invitation flow behind their respective
   service boundaries.
3. Add Event Registration domain contracts and persistence, replacing hardcoded
   `youRsvped` state.
4. Add question selection/generation and event-participant-profile confirmation.
5. Add cancel and re-register UI/actions and update dependent event readers.
6. Refactor and redesign the Relationship Inbox, then add resizing and
   responsive behavior.
7. Run cross-feature verification, update architecture documentation, and
   deliver the Tokyo Climate Founder Dinner demo.

Each step is independently reviewable. A later step must not be used to conceal
an incomplete failure or migration in an earlier one.

## 12. Acceptance Criteria

The work is complete when:

- a real sanitized business-card image can be processed by the paid cloud
  provider into an editable draft, and an explicit confirmation writes exactly
  one evidence-linked contact;
- after contact confirmation, the user can decline an invitation or separately
  confirm an editable Orbit invitation; an unconfigured delivery provider never
  reports a sent email;
- the multilingual OCR evaluation report exposes accuracy, correction, latency,
  failure, and cost results;
- registering for the demo event shows up to four event-specific questions
  generated with the current Orbit AI model and saves only a confirmed,
  event-scoped participant profile;
- the user can cancel and re-register idempotently while the event itself remains
  unchanged and audit history is preserved;
- list/detail views, attendee eligibility, reminders, and preparation reflect
  the registration source of truth;
- the Inbox presents a usable list/conversation/context workspace, supports
  pointer and keyboard resizing, persists its width, and behaves correctly on
  compact and mobile layouts;
- all external-send, organizer-notification, calendar, and automatic-global-
  profile side effects remain absent;
- tests, type checks, lint, visual checks, and GitNexus scope verification pass.

## 13. Implementation Touchpoints

Expected touchpoints for the implementation plan include:

- `features/acquisition/business-card-contract.ts`
- `features/acquisition/live-business-card-scan-service.ts`
- a dedicated Gemini business-card OCR provider adapter
- `features/acquisition/service-factory.ts`
- `app/api/contact-drafts/business-card/scan/route.ts`
- the business-card capture/review UI under `/app/contacts/new`
- a confirmed-contact write boundary under `features/contacts/`
- the existing invitation message-draft service and a staged invitation route
- `features/orbit-ai/gemini-provider.ts` or a shared provider resolver extracted
  from it
- `features/events/registration-profile-guide.ts`
- a dedicated `features/events/registration/` capability
- `features/events/service-factory.ts`
- event registration API routes and event detail/list adapters
- `app/(app)/app/inbox/relationship-inbox-panel.tsx`
- `app/(app)/app/inbox/inbox-panel-view-model.ts`
- `app/api/chat/relationship-inbox/route.ts`
- focused capability, route, presenter, accessibility, and responsive tests
- `features/acquisition/DESIGN.md`, `features/events/DESIGN.md`, and the relevant
  architecture module documentation

Exact symbols and files must be confirmed during implementation planning. Each
symbol requires GitNexus upstream impact analysis before editing.

## 14. External Technical References

- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini latest model documentation](https://ai.google.dev/gemini-api/docs/latest-model)
- [Google Cloud Vision OCR](https://docs.cloud.google.com/vision/docs/ocr)
- [Google Cloud Vision pricing](https://cloud.google.com/vision/pricing)
- [Document AI Enterprise OCR](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr)
- [Document AI pricing](https://cloud.google.com/document-ai/pricing)
- [Gemini API additional terms](https://ai.google.dev/gemini-api/terms)
- [Japan Personal Information Protection Commission FAQ](https://www.ppc.go.jp/personalinfo/pipldial/)
