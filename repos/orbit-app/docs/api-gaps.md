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

The native profile screen shows sourced profile update suggestions in Chinese:
which field would change, current value, suggested value, source signal,
confidence, rationale, and evidence excerpt. This stays review-only on mobile:
it does not accept suggestions, apply patches, save profile changes, extract
documents, or run AI from the profile page.

Remaining parity gaps:

- `PUT /api/profile` for manual profile edits
- `POST /api/profile/update-suggestions/:id/accept` with a clear profile-save
  confirmation boundary
- business-card and resume extraction flows
- native file/image upload and extraction review

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
- `POST /api/contact-drafts/:id/confirm`

These routes return pending drafts first. Mobile can now confirm the draft it
just created and show the confirmed candidate. Confirmation still does not
write a final contact record; it preserves the web boundary where the backend
marks the candidate ready for a later contact write.

Remaining parity gaps:

- list the saved draft queue beyond the draft created in the current session
- reject or archive a candidate
- preview duplicate checks before confirmation
- write the confirmed candidate into contacts and refresh the contact list

## Native Capture

The current mobile entry accepts manual text, QR text, and business-card text.
It does not open the camera yet. Native camera capture should be added only
after the app includes camera permissions, scan result handling, and review
screens that preserve the existing confirmation boundary.

## Contact Detail Status

Mobile contact detail is backed by:

- `GET /api/contacts/:id`
- `PATCH /api/contacts/:id`

The detail screen shows the profile, value labels, source evidence, current
status, recent notes, and the next step in Chinese. It can move supported
contacts between 待联系 and 在推进 by PATCHing the backend status field. The
screen still does not expose tag edits, note creation, last-interaction edits,
archiving, or bulk status flows.

## Contact List Search

Mobile contact list now uses `GET /api/contacts` query params for search and
status filtering:

- `query`
- `status`

The screen shows the same Chinese status chips used by the web contact list and
keeps the API response as the source of truth for counts. Full parity still
needs mobile-safe contracts for source/tag/value filters, saved searches, and
natural-language relationship queries that return explainable results.

Contact list cards currently generate stable initial avatars locally from the
contact id and display name. The backend should expose avatar/photo fields, or
an explicit display-avatar contract, before mobile shows real profile images.

## Event Cover Images

Mobile event cards now render image-led content modules. The view-model uses
explicit cover fields when present and otherwise maps known event ids/titles to
the same web static cover assets.

The event API should expose a stable `coverUrl` or locale-ready display image
field for every event so mobile does not need id/title fallback mappings.

## Contact Graph And Pipeline

Mobile now has a relationship graph and contact pipeline backed by:

- `GET /api/contacts`
- `GET /api/connections`
- `PATCH /api/connections/:id/stage`

The screen shows connection counts, stage distribution, evidence status, and
priority relationships. The pipeline groups contacts into 待联系、在推进、已合作,
opens contact details for review, and can move supported connections between
待联系 and 在推进 through the backend stage endpoint. It still does not add,
edit, or delete evidence from mobile. Full parity with the web contact pipeline
still needs mobile-safe contracts for evidence review, saved stage history,
and the full set of relationship stages beyond the current safe toggle.

## Introduction Records

Mobile now has an introduction preparation view backed by:

- `GET /api/contacts`
- `GET /api/connections`

It finds candidates with引荐路径 or referral evidence and keeps the screen
read-only. The existing `/api/contact-invitations` route supports prepare and
confirm writes, but there is no mobile-safe list/read contract for saved
introduction records. Mobile therefore does not show saved intro history,
create intro records, or send external messages from this screen.

## Event Registration

Mobile now has an event-specific registration workspace backed by:

- `GET /api/events/:id/registration`
- `POST /api/events/:id/registration`
- `POST /api/events/:id/registration/cancel`

The current mobile screen handles event-specific answers, registration updates,
and cancellation.

## Event Attendees And Want Connect

Mobile now opens an event attendee workspace backed by:

- `GET /api/events/:id/attendees`
- `GET /api/events/:id/matches`
- `POST /api/events/:id/want-to-connect`

The screen shows visible attendee rows, current-user match context, and records
an on-site want-to-connect intent without sending messages or notifications.
Registration-gated visibility is still a backend policy question: some events,
such as `event_signup_03`, currently return an empty roster even after the
registration workspace is available.

## Event Readiness And Recommendations

Mobile event detail now reads the same safe event-preparation boundaries that
the web event detail route composes:

- `GET /api/events/:id/readiness`
- `GET /api/recommendations/event/:id`

The native detail page shows a 会前准备度 module with readiness score, current
goal, checklist, and next preparation step. It also shows a 推荐认识的人 module
with ranked people, fit reason, suggested opener, and safe on-site action. The
mobile mapping keeps this read-only: it does not set event goals, generate
opening-line variants, write post-event notes, send notifications, create
calendar entries, or trigger external messages.

Remaining parity gaps:

- `PUT /api/events/:id/goal` for confirmed goal selection
- `POST /api/recommendations/event/:id/opening-line` for style-specific opener
  refresh
- post-event review and encounter-note flows
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

The screen shows due relationship tasks, trigger labels, source counts, and
reminder review cards. It intentionally does not call `POST
/api/tasks/generate`, `POST /api/message-drafts`, notification delivery routes,
calendar writes, or reminder scheduling. Full parity with the web followups
workspace needs a mobile-safe draft/read contract and explicit confirmation for
creating tasks, reminders, message drafts, or external sends.

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
event registration questions or profile review. It intentionally does not
create accounts, create attendees, write event registrations, send pass-code
emails, upload cards/resumes, or run AI extraction. Full parity with the web
register flow needs mobile-safe contracts for account/session creation,
registration submission, pass-code delivery, and native upload/review.

## Home

Mobile now supports `/home` and `/home/events` as native personal hub screens
backed by:

- `GET /api/profile`
- `GET /api/events`
- `GET /api/contacts`

The screens show the current profile summary, Home entry shortcuts, event
counts, event status filters, event navigation, and the same profile-resource
preview that the web Home page uses to show what other people will see before
an event. They intentionally do not edit the universal profile, write contacts,
register/cancel events, create schedule records, or sign out. Full parity with
the web Home hub still needs mobile-safe contracts for profile editing from
Home, sign-out, and any Home-specific event participation actions.

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
`POST /api/ai/conversations/:id`.

This is separate from the web relationship chat workspace under `/app/chat`.

## Relationship Inbox

Mobile now has a lightweight relationship inbox backed by:

- `GET /api/chat/relationship-inbox`
- `POST /api/chat/relationship-inbox`
- `GET /api/notifications`
- `GET /api/ai/proactive-turns`

It opens relationship threads, shows source context, renders reminders and
proactive relationship nudges, stages review-only reply drafts, and can create a
reviewed draft thread from a contact detail page. The current backend routes are
read/review boundaries: they do not send external messages, deliver
notifications, write calendar items, or persist a production message thread.

Remaining backend/product gaps before full web chat parity:

- live async relationship conversation provider, not only the preview boundary
- contact-scoped query/filter so `/inbox?contactId=...` can open the exact
  relationship thread instead of starting from the global inbox
- mobile-safe confirmation API for a real external send
- localized writing-assist responses for relationship drafts
- privacy controls and extraction summaries from the desktop chat workspace

## Relationship Chat

Mobile now has a read-only relationship chat workspace backed by:

- `GET /api/chat/conversations`
- `GET /api/chat/conversations/:id`

It maps the legacy `/app/chat` one-to-one conversation list and thread detail
into Chinese mobile cards. The mobile screen does not call
`POST /api/chat/conversations/:id/messages`, because that route still represents
a local preview/send boundary and live external delivery needs an explicit
mobile confirmation flow.

## Dashboard

Mobile now has a read-only relationship dashboard backed by:

- `GET /api/dashboard`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/opportunities`
- `GET /api/dashboard/network-gaps`
- `GET /api/dashboard/distributions`

The screen shows coverage, priority follow-up, network gaps, distributions, and
recent activity. It intentionally does not call
`POST /api/dashboard/opportunities/recompute`; mobile should wait for a
confirmation-safe API before exposing recompute or task-writing actions.

## Contacts Dashboard

Mobile now has a contacts-focused dashboard at `/contacts/dashboard` backed by
the same read-only dashboard analytics routes:

- `GET /api/dashboard`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/opportunities`
- `GET /api/dashboard/network-gaps`
- `GET /api/dashboard/distributions`

The screen maps the web `/app/contacts/dashboard` idea into an iPhone-first
view: relationship asset counts, a compact relationship map, coverage gaps,
industry distribution, value types, and recent relationship changes. It does
not expose the web export button, recompute actions, profile goal editing, or
bulk drill-down filters until those behaviors have mobile-safe contracts.

## Agent Actions

Mobile now has an Agent action center backed by:

- `GET /api/agent/actions`
- `GET /api/agent/settings`
- `PUT /api/agent/settings`
- `POST /api/agent/actions/:id/accept`
- `POST /api/agent/actions/:id/dismiss`

The screen shows suggestions that need review, the current action boundary, and
why the user must confirm before anything continues. It can switch between low,
medium, and high Agent boundary levels, confirm or dismiss a suggested action,
then refresh the queue. These decisions still do not send messages, schedule
calendar items, change contacts, or start autonomous execution from mobile.

Remaining parity gaps:

- The accept/dismiss flow uses the existing API response, but mobile still needs
  a fuller decision history view before users can inspect past approvals.

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
- `POST /api/auth/signout`

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
NextAuth sign-out route and clears the saved device session.

Google login is available when the Web deployment has `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, and `AUTH_SECRET` configured. The iOS app does not store
those server credentials.

Remaining gaps:

- `/api/account/me` still reads the account-session service, not the NextAuth
  session user, so backend account identity may lag behind the saved cookie.
- password reset code delivery and verification
- full in-app account management after registration

## Wider Web Parity

Most web app pages now have native mobile routes or thin mobile review surfaces.
The remaining gaps are narrower capability boundaries: registration-gated roster
permissions, post-event review, encounter notes, profile update acceptance,
password reset delivery, external-send confirmation, and admin write flows.
Some of these are desktop/admin workflows and should not be copied one-to-one
into the iOS tab structure without mobile-safe contracts.
