# Orbit App API Gaps

This file tracks places where the iOS app should stay thin and wait for clearer
API support instead of copying backend business logic locally.

## Profile

`GET /api/profile` can return the demo operator profile (`小雨`,
`profile_orbit_generated_operator`) while the mobile product needs the current
user profile for 小雨, Orbit founder, and Chinese-facing relationship exchange
copy.

Mobile currently maps the known demo payload to 小雨's Chinese founder profile so
the screen does not show the wrong person. The backend should expose a stable
current-user profile or workspace profile endpoint with locale-ready display
fields.

Mobile now also reads the profile signal review queue:

- `GET /api/profile/update-suggestions`
- `POST /api/profile/update-suggestions/:id/accept`
- `PUT /api/profile`

The native profile screen shows sourced profile update suggestions in Chinese:
which field would change, current value, suggested value, source signal,
confidence, rationale, and evidence excerpt. Mobile can confirm one suggestion
at a time, show the returned profile patch as a pending save, seed supported
fields into the editor, and require the user to press Save before the patch is
written to `/api/profile`.

Mobile also exposes a compact manual profile editor for the public-facing
fields people see first: name, headline, bio, offering, seeking, and relationship
goal. It builds the web `PUT /api/profile` request directly and refreshes the
profile after save.

Mobile now also posts pasted profile source text to the web document extraction
routes:

- `POST /api/profile/extractions/business-card`
- `POST /api/profile/extractions/resume`

The native Profile screen can also choose a business-card or resume image from
the iOS photo library, or choose a resume PDF/docx/txt document through the
system document picker, then send the selected file name and MIME type to the
same web extraction boundary. The returned draft is shown as a Chinese review
panel: identity, market, contact line, relationship goal, suggested profile
fields, confidence, and source excerpts. The user can apply visible extracted
fields to the manual editor, then decide whether to save through
`PUT /api/profile`. The panel is review-only and does not claim that profile
fields were saved.

Remaining parity gaps:

- production OCR/parser-backed extraction; the current live web service remains
  policy-only until a reviewed provider is connected

## Locale-Scoped Display Fields

`GET /api/contacts/:id` and `GET /api/events/:id` can expose mixed Japanese,
Chinese, English, and implementation/source wording inside display fields such
as `publicProfile.bio`, `relationshipContext`, `description`, `notes`, and
`evidence`.

Mobile currently prefers Chinese segments and hides source/provider wording.
The backend should return display fields scoped to the selected locale, for
example `display.zh`, or accept a locale parameter and return already-clean
Chinese copy.

## Contact Acquisition Confirmation

Mobile now posts source records to:

- `POST /api/contact-drafts/manual`
- `POST /api/contact-drafts/qr/scan`
- `POST /api/contact-drafts/business-card/scan`
- `GET /api/contact-drafts`
- `GET /api/contact-drafts/external/candidates`
- `POST /api/contact-drafts/external/import`
- `POST /api/contact-drafts/referral`
- `POST /api/contact-drafts/recommended/:id/confirm`
- `GET /api/contact-drafts/merge-suggestions`
- `PATCH /api/contact-drafts/:id`
- `POST /api/contact-drafts/:id/confirm`
- `POST /api/contacts/business-card/confirm`

These routes return pending drafts first. Mobile can now show the saved pending
draft queue from the web API, confirm a listed draft, and show the confirmed
candidate. Confirmation still does not write a final contact record; it
preserves the web boundary where the backend marks the candidate ready for a
later contact write.

Mobile also reads the duplicate review surface from
`GET /api/contact-drafts/merge-suggestions`. The native screen shows possible
duplicate pairs, confidence, suggested decision, field choices, and the review
question. It can also confirm a duplicate merge preview through
`POST /api/contact-drafts/merge-suggestions/:id/apply`. The returned card shows
the merged-contact preview and field choices, but the screen still does not
claim a final merge: the backend response keeps contact writes and destructive
merge flags false.

For business-card drafts, mobile can now edit the recognized name, company,
role, email, and phone fields and save them through `PATCH
/api/contact-drafts/:id` before confirmation. When the original scan payload
includes the card image digest and source evidence ids, mobile can also call
`POST /api/contacts/business-card/confirm` with the reviewed fields and explicit
confirmation. That route is the web contact writer: it may create the contact,
return an already-confirmed state, or stop for duplicate review. Other
acquisition sources still stay in the draft boundary. After a successful
business-card contact write, mobile opens `/contacts/list` with a refresh token
so the list pulls the web contact data again
instead of relying on stale local state. If the writer returns a concrete
contact id, the native result card can also open that contact detail directly.

Mobile also reads web external-contact candidates from
`GET /api/contact-drafts/external/candidates`, groups them by source
(`phone`, `google_contacts`, `csv`, `existing_customer_list`), and can stage the
selected source through `POST /api/contact-drafts/external/import`. The returned
drafts are rendered in the same review-only confirmation flow. Mobile does not
perform provider sync, local address-book access, file parsing, production
import jobs, or final contact writes.

Mobile also stages web referral recommendations through
`POST /api/contact-drafts/referral`. The native add-contact workspace lets the
user choose founder, investor, community, or all referral sources, then renders
recommended people and referral-backed drafts in Chinese review cards. The same
card can confirm a recommended person through
`POST /api/contact-drafts/recommended/:id/confirm`. This is still a review-only
path: it does not discover social graphs, contact recommenders, send outreach,
sync providers, or write final contacts from mobile.

When `/contacts/new` is opened with an `eventId` query, mobile now shows an
event-context import card and reuses the web event-attendee draft import
boundary:

- `POST /api/contact-drafts/event-attendees/import`

The returned attendees are shown as review-only contact candidates on the same
add-contact workspace. The flow refreshes the saved draft queue but still does
not bulk-create contacts or bypass candidate review.

Mobile can also mark a visible review candidate as temporarily not handled in
the current iOS queue. This only hides the draft locally so the user can keep
reviewing the rest of the list; it does not delete, archive, or mutate the
backend draft record because `/api/contact-drafts/:id` currently only accepts
business-card review fields.

Remaining parity gaps:

- persistent reject or archive state for a candidate
- write manual, QR, external, referral, and post-event candidates into contacts
  through mobile-safe writer contracts

## Native Capture

The current mobile entry accepts manual text, QR text, native QR camera scans,
business-card text, camera capture, image-library selection, and business-card
field review. QR camera scans only fill the QR text field; the user still
submits the result through the existing contact-draft API and reviews the
candidate before confirmation.

## Contact Detail Status

Mobile contact detail is backed by:

- `GET /api/contacts/:id`
- `PATCH /api/contacts/:id`
- `GET /api/connections`
- `GET /api/analysis/relationship-value/:id`
- `POST /api/analysis/relationship-value/recompute`

The detail screen shows the profile, value labels, source evidence, current
status, recent notes, and the next step in Chinese. It can move supported
contacts between 待联系 and 在推进 by PATCHing the backend status field. The
screen can also add a reviewed relationship note through the same
`PATCH /api/contacts/:id` boundary. Mobile can now replace reviewed tags and
update the latest interaction metadata through the same PATCH body
(`tags` + `lastInteraction`). It can also archive a reviewed contact through
`status: "archived"`. It also looks up the matching connection and renders the
relationship value analysis as a Chinese card with score, priority band,
evidence, factors, and suggested next step. The card can now recompute the
relationship value for the current connection and replace the local card result
without sending messages, creating tasks, writing audit logs, or triggering
providers from mobile. The screen still does not expose bulk status flows.

## Contact List Search

Mobile contact list now uses `GET /api/contacts` query params for search and
status filtering:

- `query`
- `status`

The screen shows the same Chinese status chips used by the web contact list and
keeps the API response as the source of truth for counts. It can also run the
web deep search route:

- `POST /api/contacts/search`
- `GET /api/search/suggestions`
- `POST /api/search/relationships`

Mobile sends the current keyword, status, source, tag, and relationship-value
filters to the deep search route, then renders an explainable Chinese result
module below the search box. The same source/tag/value chips also update the
`GET /api/contacts` list query so the visible list and deep-search result stay
in sync. It also reads the web relationship natural-search suggestions and
renders them as Chinese "推荐搜索" chips above the contact search controls. Tapping
a suggestion fills the contact search box, submits the suggestion's web
relationship-search request, and renders native "关系搜索结果" cards with match
score, source evidence, value labels, and the next review step. Manual "关系搜索"
sends the typed query plus supported business intent, industry, source, value,
and follow-up filters to the same route. It does not write tasks, send messages,
create calendar records, query providers directly, or run any mobile-side index.
Mobile now also keeps a short device-local recent relationship search row under
the search actions. It reuses the same relationship-search request body and
does not call a fake saved-search API. Full parity still needs backend saved
searches and richer cross-device saved-query management.

Contact list and detail cards now use avatar/photo fields when the API provides
them, then fall back to stable initials. Full parity still needs the backend to
return a stable display-avatar contract and native-safe image formats for every
contact.

## Event Cover Images

Mobile event cards now render an image-first activity list. The view-model uses
explicit cover fields when present and otherwise maps known event ids/titles to
the same web static cover assets.

The event API should expose a stable `coverUrl` or locale-ready display image
field for every event so mobile does not need id/title fallback mappings.

The event list now also reads the global event-value recommendation boundary:

- `GET /api/recommendations/events`
- `POST /api/recommendations/events/:id/accept`

The native Events screen shows a 推荐参加 module with score, fit reason, timing,
venue, and the next review step. Recommendation rows now reuse the already
loaded event list by `eventId`, so matching recommendations render as
image-backed content modules instead of plain text rows. If a recommendation is
not present in the current event list, mobile keeps the text fallback and action
buttons visible. It can accept a recommended event through the web acceptance
route, then shows the guarded result and links to the event registration
workspace. Accepting a recommendation still does not register for the event,
write calendar entries, sync calendar availability, send notifications, or call
live discovery feeds from mobile.

## Contact Graph And Pipeline

Mobile now has a relationship graph and contact pipeline backed by:

- `GET /api/contacts`
- `GET /api/connections`
- `GET /api/connections/:id`
- `POST /api/connections/:id/evidence`
- `PATCH /api/connections/:id/stage`

The screen shows connection counts, stage distribution, evidence status, and
priority relationships. The pipeline groups contacts into 待联系、在推进、长期维护、
暂不跟进、已合作, opens contact details for review, can open a read-only evidence
chain for a selected connection, can add a reviewed manual evidence item through
the web evidence route, and can move supported connections among
`active`、`needs_follow_up`、`nurture`、`archived` through the backend stage
endpoint. The evidence add result refreshes the evidence chain in place; live
persistence may still return a pending backend state. It still does not edit or
delete evidence from mobile. Full parity with the web contact pipeline still
needs mobile-safe contracts for saved stage history and a real backend
cooperation/partnered stage instead of the current contact-status-only display
bucket.

## Introduction Records

Mobile now has an introduction preparation view backed by:

- `GET /api/contacts`
- `GET /api/connections`
- `POST /api/contact-invitations`
- `PATCH /api/contact-invitations`

It finds candidates with 引荐路径 or referral evidence, then can prepare an
editable Orbit invitation for a selected contact. Mobile sends the contact id,
recipient name, and typed recipient email to the web staged invitation route,
shows the returned subject and body as editable fields, and can confirm the
reviewed copy through `PATCH /api/contact-invitations`.

The confirmation stays inside the staged boundary: the returned invitation is
marked ready for delivery, but iOS does not send email, request an email
provider, write saved intro history, create calendar records, notify anyone, or
mark the invitation as sent. The iOS page now keeps prepared and confirmed
invitations visible in a local "本次引荐记录" section so the current review does
not disappear after confirmation. That list is session-local; full parity still
needs a mobile-safe list/read contract for saved introduction records and a
separate production delivery confirmation contract.

## Event Registration

Mobile now has an event-specific registration workspace backed by:

- `GET /api/events/:id/registration`
- `POST /api/events/:id/registration`
- `POST /api/events/:id/registration/cancel`
- `POST /api/events/:id/registration/interview`
- `POST /api/events/:id/registration/persona`

The current mobile screen handles event-specific answers, registration updates,
and cancellation. It can also ask the web adaptive interview route for the next
event-specific question, then generate a local activity persona from answered
turns. The persona preview stays on the registration page: it does not write the
global profile, create accounts, send messages, or notify organizers.

## Event Attendees And Want Connect

Mobile now opens an event attendee workspace backed by:

- `GET /api/events/:id/attendees`
- `POST /api/events/:id/attendees/import`
- `GET /api/events/:id/matches`
- `POST /api/events/:id/encounters`
- `POST /api/events/:id/encounters/:encounterId/evidence`
- `POST /api/events/:id/want-to-connect`
- `POST /api/contact-drafts/event-attendees/import`

The screen shows visible attendee rows, current-user match context, and records
an on-site want-to-connect intent without sending messages or notifications. It
can import the visible roster into the event context through
`POST /api/events/:id/attendees/import`, then shows the staged batch count,
recommendation count, and no-send boundary. It can also save a typed on-site
encounter note for a selected attendee through
`POST /api/events/:id/encounters`; the note remains a reviewed event record and
does not send follow-up copy or create a final contact. After the note returns
an `encounterId`, mobile can promote it through the web evidence route and shows
the evidence result in-place. Mobile can also import the current event roster
into contact drafts through the web event-attendee import route, then shows the
returned review-only candidate cards and links to the existing add-contact
review queue. It does not bulk-create contacts or bypass draft confirmation.
Registration-gated visibility is still a backend policy question: some events,
such as `event_signup_03`, currently return an empty roster even after the
registration workspace is available.

## Event Readiness And Recommendations

Mobile event detail now reads the same safe event-preparation boundaries that
the web event detail route composes:

- `GET /api/events/:id/readiness`
- `PUT /api/events/:id/goal`
- `GET /api/events/:id/post-event`
- `POST /api/events/:id/post-event/confirm`
- `GET /api/recommendations/event/:id`

The native detail page shows a 会前准备度 module with readiness score, current
goal, checklist, and next preparation step. It also shows a 推荐认识的人 module
with ranked people, fit reason, suggested opener, and safe on-site action. The
mobile readiness card can choose a suggested event goal or submit a custom
Chinese goal through `PUT /api/events/:id/goal`, then refresh the readiness
state. The mobile detail screen can refresh a selected person's opening-line
suggestion through `POST /api/recommendations/event/:id/opening-line`, then
replaces only the local card copy. It also reads `GET /api/events/:id/post-event`, shows a
会后复核 module with new contacts, tags, urgency, and follow-up draft
suggestions, and can confirm the visible post-event candidates through
`POST /api/events/:id/post-event/confirm`. The confirmation stays inside the web
review boundary: mobile shows the confirmed candidate count and refreshes the
review, then links to the contact review queue. It does not send follow-ups,
create calendar entries, or trigger external messages.

Remaining parity gaps:

- final Contacts persistence after post-event review
- registration-gated readiness policies for events with restricted rosters

## Party And Check-In

Mobile now has event party surfaces backed by:

- `GET /api/events/:id`
- `GET /api/events/:id/attendees`
- `GET /api/events/:id/matches`

The screens show a venue-ready access code, attendee counts, priority people,
mutual-interest matches, and relationship groups. They intentionally do not
record check-in writes or create attendance records. Full parity with the web
party/check-in flow needs a mobile-safe check-in contract with staff
confirmation, status refresh, and audit history.

## Followups

Mobile now has a follow-up review queue backed by:

- `GET /api/tasks`
- `GET /api/notifications`
- `POST /api/tasks/generate`
- `POST /api/notifications/reminders/generate`
- `POST /api/message-drafts`
- `PATCH /api/message-drafts/:id`

The screen shows due relationship tasks, trigger labels, source counts, and
reminder review cards. It can also generate review-only task candidates from
the web follow-up generation boundary, create review-only follow-up message
drafts from the top task, generate review-only reminder candidates from the web
reminder schedule boundary, show those local preview cards, and mark a reviewed
message draft ready for confirmation through the web draft update boundary. It
intentionally does not call notification delivery routes, calendar writes,
external send routes, or persisted reminder writes. Full parity with the web
followups workspace still needs explicit confirmation before sending anything
outside the app.

## Schedule Event Preview

Mobile now supports `/schedule/events/:id` as a read-only schedule preview
backed by:

- `GET /api/events/:id`

This route mirrors the web schedule preview boundary: it shows the activity
name, time, venue, source context, and recovery links back to Schedule and
Events. It intentionally does not write calendar records, register for the
event, create reminders, send messages, or call external services.

## Register Invite

Mobile now supports `/register` and `/register/:code` as a read-only invite
preparation surface backed by:

- `GET /api/events/:id`
- `GET /api/profile`

The screen shows the invite event, compact invite code, current profile preview,
resources the attendee can offer, what they are looking for, and links to the
event registration questions or profile review. Mobile now also shows a
three-step registration readiness summary for account state, public profile
context, and the next event-question step. It intentionally does not
create accounts, create attendees, write event registrations, send pass-code
emails, upload cards/resumes, or run AI extraction. Full parity with the web
register flow needs mobile-safe contracts for account/session creation,
registration submission, pass-code delivery, and native upload/review.

## Home

Mobile now treats `/ai` as the single Orbit AI home. The old `/home` route
redirects there so mobile does not carry a second AI-home implementation.

Mobile still supports `/home/events` as a native personal event screen backed
by:

- `GET /api/profile`
- `GET /api/events`
- `GET /api/contacts`

The event screen shows event counts, event status filters, and event
navigation. It intentionally does not edit the universal profile, write
contacts, register/cancel events, create schedule records, or sign out.

## Public Organizer

Mobile now supports `/o/:slug` as a native public organizer page backed by:

- `GET /api/events`

The screen derives the organizer from reviewed event records, groups public
events by the same organizer label, shows upcoming/history counts, and opens
event detail pages. It intentionally does not read attendee rosters, admin
records, organizer feed credentials, private registration data, or event
management actions. Full parity with the web organizer page still needs a
dedicated public organizer API with stable host profile fields, public stats,
cover imagery, and a slug lookup that does not depend on downloading the full
event list.

## Platform

Mobile now supports `/platform` as a native platform overview backed by:

- `GET /api/events`
- `GET /api/profile`
- `GET /api/dashboard`

The screen shows platform stats, activities needing review, and organizer
account status. It intentionally does not approve or reject events, notify
organizers, edit organizer accounts, or manage admin membership from mobile.
Full parity with the web platform workspace needs mobile-safe contracts for
review decisions, organizer-account search/list details, account status
changes, and audit history.

## Admin

Mobile now supports `/login-admin`, `/admin`, `/admin/events`, and
`/admin/access` backed by:

- `GET /api/events`
- `GET /api/profile`
- `GET /api/dashboard`

The screens keep the admin entry, organizer dashboard, event management view,
and access boundary available on iPhone. They intentionally do not send magic
links, create admin sessions, create or edit events, run matching, export data,
invite members, change roles, or revoke access. Full parity with the web admin
workspace needs mobile-safe contracts for admin authentication, session refresh,
event writes, matching jobs, exports, member invitations, role changes, and
audit history.

## Orbit AI Conversation Detail

Mobile now opens Orbit AI conversation threads through
`GET /api/ai/conversations/:id` and can continue a selected thread with
`POST /api/ai/conversations/:id`. The native conversation screen also renders
common AI markdown as mobile blocks, including paragraphs, bullet lists,
numbered lists, task-list markers, block quotes, links, bold text, and inline
code. When the latest user question is about events, people, follow-ups,
schedule, or profile, mobile inserts the matching native content module inside
the conversation so the user can jump directly to the relevant workflow.

The Orbit AI home side drawer also reads web Orbit Agent history through
`GET /api/ai/conversations/sessions`, opens a selected session with
`GET /api/ai/conversations/sessions/:id`, can continue it from iOS, and can
delete an imported web session with `DELETE
/api/ai/conversations/sessions/:id`. Web sessions and ordinary Orbit AI
conversation summaries are shown together so one history source does not hide
the other.

This is separate from the web relationship chat workspace under `/app/chat`.

When a single user question mixes intents, for example asking about activities
and people in the same prompt, mobile now keeps multiple matching native panels
inside the conversation instead of stopping at the first matched surface.
The event panel also prioritizes events whose title, venue, status, attendee
line, or topic tags match the question, so a query about Kansai or Osaka business
events brings those event cards ahead of unrelated activity cards.

## Relationship Inbox

Mobile now has a lightweight relationship inbox backed by:

- `GET /api/chat/relationship-inbox`
- `POST /api/chat/relationship-inbox`
- `POST /api/chat/assist/rewrite`
- `GET /api/chat/privacy`
- `POST /api/chat/privacy/analysis-toggle`
- `GET /api/relationship-signals/email-calendar`
- `POST /api/relationship-signals/:id/confirm`
- `GET /api/notifications`
- `GET /api/ai/proactive-turns`

It opens relationship threads, shows source context, renders reminders and
proactive relationship nudges, stages review-only reply drafts, and can create a
reviewed draft thread from a contact detail page. Mobile can also send the
visible reply draft through the web writing-assist rewrite boundary and replace
only the local draft text. When opened from a contact page, mobile first tries
to resolve that contact to an existing relationship thread before showing the
new-draft composer. For a selected thread, mobile reads the web privacy control
payload and can toggle relationship analysis while keeping private notes hidden
from the share preview. Mobile also reads metadata-only email/calendar
relationship signals and can confirm one signal through the web confirmation
boundary. The confirmation result is shown as evidence for future follow-up; it
does not read message bodies, send messages, write contacts, deliver
notifications, create calendar items, run deletion/share workflows, or persist a
production message thread.

Remaining backend/product gaps before full web chat parity:

- live async relationship conversation provider, not only the preview boundary
- server-side contact-scoped query/filter so mobile does not need to scan the
  global inbox before opening a contact's thread
- mobile-safe confirmation API for a real external send

## Relationship Chat

Mobile now has a read-only relationship chat workspace backed by:

- `GET /api/chat/conversations`
- `GET /api/chat/conversations/:id`
- `POST /api/chat/conversations/:id/messages`
- `POST /api/chat/conversations/:id/summary`
- `GET /api/chat/conversations/:id/extractions`

It maps the legacy `/app/chat` one-to-one conversation list and thread detail
into Chinese mobile cards. The detail screen can save a reply through the web
messages boundary, then renders it as a local draft with `mock_recorded_locally`
delivery. It can also read extracted relationship signals and request a
source-backed conversation summary from the web summary boundary. These are
review surfaces: saved drafts are not live external sends, and extracted needs,
tasks, and profile suggestions are shown for inspection only and are not written
back to the relationship profile.

Remaining parity gap:

- mobile-safe confirmation API for a real external send

## Dashboard

Mobile now has a read-only relationship dashboard backed by:

- `GET /api/dashboard`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/opportunities`
- `POST /api/dashboard/opportunities/recompute`
- `GET /api/dashboard/network-gaps`
- `GET /api/dashboard/distributions`
- `GET /api/audit/provenance`
- `POST /api/audit/provenance/run`

The screen shows coverage, priority follow-up, network gaps, distributions, and
recent activity. Mobile can now trigger the web opportunity recompute boundary
and refresh the dashboard result. The recompute response is still a safe review
surface: it re-ranks opportunity reminders but does not send notifications,
create tasks, or write external provider state.

Mobile also reads the web source-consistency provenance audit snapshot and can
run the same audit boundary from the dashboard. The native card renders audited
collections, active findings, evidence counts, and the returned next action as a
review surface only. It does not generate compliance reports, write production
audit storage, call providers, or execute external actions from the app.

## Contacts Dashboard

Mobile now has a contacts-focused dashboard at `/contacts/dashboard` backed by
the same read-only dashboard analytics routes:

- `GET /api/dashboard`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/opportunities`
- `POST /api/dashboard/opportunities/recompute`
- `GET /api/dashboard/network-gaps`
- `GET /api/dashboard/distributions`
- `GET /api/profile`
- `PUT /api/profile`

The screen maps the web `/app/contacts/dashboard` idea into an iPhone-first
view: relationship asset counts, a compact relationship map, coverage gaps,
industry distribution, value types, recent relationship changes, and the same
safe opportunity recompute boundary used by the main dashboard. Mobile can also
edit the current relationship goal from this surface by preserving the full
profile draft and saving through the existing profile API. Overview metrics now
drill down into `/contacts/list` with existing status/value filters, so the
top-level `/contacts` screen can stay focused on the workbench modules. It still
does not expose the web export button or complex bulk drill-down actions until
those behaviors have mobile-safe contracts.

## Agent Actions

Mobile now has an Agent action center backed by:

- `GET /api/agent/actions`
- `GET /api/agent/settings`
- `PUT /api/agent/settings`
- `POST /api/agent/actions/:id/accept`
- `POST /api/agent/actions/:id/dismiss`
- `GET /api/sandbox/external-actions/audit`
- `POST /api/sandbox/external-actions/send-message`
- `POST /api/confirmations/:id/approve`
- `POST /api/confirmations/:id/reject`

The screen shows suggestions that need review, the current action boundary, and
why the user must confirm before anything continues. It can switch between low,
medium, and high Agent boundary levels, confirm or dismiss a suggested action,
then refresh the queue. Mobile also shows the web external-action confirmation
history with action type, target, relationship context, evidence count, time,
and no-op status. It can run the send-message sandbox confirmation. That
confirmation records a no-op result only: it does not send email, SMS, chat
messages, push notifications, calendar writes, contact changes, or autonomous
execution. When a sandbox action includes a `confirmationId`, mobile can also
record an approve or reject decision through the shared confirmation guard. The
result card keeps the boundary explicit: the decision is recorded, and the
external action is still not executed by the iOS route.

Remaining parity gaps:

- Production external-send confirmation still needs a mobile-safe provider
  contract. The current iOS flow is intentionally limited to sandbox audit.

## Account

Mobile now has an account and workspace screen backed by:

- `GET /api/account/me`
- `GET /api/auth/mobile/providers`
- `POST /api/auth/mobile/credentials`
- `GET /api/auth/mobile/google/start`
- `GET /api/auth/mobile/google/complete`
- `POST /api/auth/mobile/google/exchange`
- `POST /api/auth/register`
- `GET /api/auth/session`
- `POST /api/account/session/sign-out`
- `GET /api/permissions`
- `POST /api/permissions/calendar/request`

The screen shows account state, workspace name, identity, timezone, and
relationship goal. It also exposes native `/account/login`, `/account/signup`,
and `/account/forgot-password` form screens so web account links no longer fall
back to Orbit AI in the iOS app.

The login form now uses the web mobile-auth bridge. Email login posts to the
mobile credentials route and stores the returned Auth.js cookie in SecureStore
after validating it through `/api/auth/session`. Google login starts the web
broker with the fixed `orbit://account/oauth` callback, exchanges the returned
code through the mobile exchange route, then stores the validated session for
later Orbit API requests. On startup, iOS restores the SecureStore value and
keeps it only after `/api/auth/session` confirms a real user. Signup calls the
web register API and then returns to login. The login screen exposes the native
forgot-password route as a recovery helper, while that route remains a boundary
screen until the backend exposes password reset delivery. Sign-out calls the
web account sign-out bridge and clears the saved device session.

Google login is available when the Web deployment has `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, and `AUTH_SECRET` configured. The iOS app does not store
those server credentials.

Mobile now also exposes native `/account/permissions`. The screen reads the web
permission-state boundary, translates contacts, calendar, email, notifications,
camera, business-card scan, event data, and chat-analysis permissions into
Chinese cards, and can request the calendar review through the staged web
route. This request stays inside Orbit review: it does not open system calendar
permission prompts, OAuth, provider authorization, push notification delivery,
camera access, or external account sync.

Remaining gaps:

- `/api/account/me` still reads the account-session service, not the NextAuth
  session user, so backend account identity may lag behind the saved cookie.
- password reset code delivery and verification
- full in-app account management after registration
- production permission provider adapters after staged review

## Wider Web Parity

Most web app pages now have native mobile routes or thin mobile review surfaces.
The remaining gaps are narrower capability boundaries: registration-gated roster
policies, password reset delivery, production permission providers, production
external-send confirmation, and admin write flows. Some of these are
desktop/admin workflows and should not be copied one-to-one into the iOS tab
structure without mobile-safe contracts.
