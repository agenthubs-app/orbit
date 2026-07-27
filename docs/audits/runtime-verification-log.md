# iOrbit Runtime Verification Log

## 2026-07-27 — Surface baseline and auth return-path continuity

Environment:

- Branch/commit before stage: `chat-agent` / `331583ef8b6dd750690a2ca63ed2d513959e4c82`
- Runtime: existing Next.js development server at `http://127.0.0.1:3000`
- Data/config values were not read or recorded.

Desktop/default viewport:

| Path / action | Authoritative evidence | Result |
| --- | --- | --- |
| Open `/` anonymously | URL and DOM snapshot | Public landing rendered navigation, Agent goal input, login, signup, event, Today, and Contacts entry points. |
| Open `/app/agent` anonymously | Final URL | Redirected to `/app/account/login?next=%2Fapp%2Fagent`. |
| Inspect Login helper links before fix | Rendered `href` | Confirmed P0: Forgot Password and Signup incorrectly used `next=%2Fhome`. |
| Reload Login after fix | Rendered `href` | Both links use `next=%2Fapp%2Fagent`. |
| Click “Forgot password?” | Navigation URL and DOM snapshot | Navigated to `/app/account/forgot-password?next=%2Fapp%2Fagent`; “Back to sign-in” preserved the same canonical return path. |

Mobile viewport (`390 × 844`):

| Path / action | Authoritative evidence | Result |
| --- | --- | --- |
| Reload Forgot Password | `innerWidth`, document widths, dialog label | Viewport/client/scroll widths were all 390; no horizontal overflow; Reset Password dialog remained accessible. |
| Open `/app/today` anonymously | Final URL and rendered helper-link hrefs | Redirected to `/app/account/login?next=%2Fapp%2Ftoday`; Forgot Password and Signup both preserved `/app/today`. |

Console:

- No browser warning or error entries were recorded during the post-fix desktop/mobile auth verification.

Scope:

- This evidence closes only the auth return-path P0 described in `confirmed-risk-register.md`.
- It does not claim that the remaining production routes, authenticated data flows, DeepSeek call, or all 1,809 route-action pairs have completed browser verification.

## 2026-07-27 — Password-reset fake-success removal

Production runtime:

- Rebuilt the current worktree with `npm run build`.
- Started the resulting production build with `next start` on an isolated local port.
- Verified in Chrome because the pre-existing port 3000 development process did not hydrate client events; the freshly built production runtime did.

Desktop/default viewport:

| Path / action | Authoritative evidence | Result |
| --- | --- | --- |
| Open Login and click “Show password” | Input `type` and rendered button state | Production client hydration was active: input changed from `password` to `text` and “Hide password” rendered. |
| Open `/app/account/forgot-password?next=%2Fapp%2Fagent` | DOM snapshot | Page states that reset availability must be checked before expecting email/code; button label is “Check reset availability”. |
| Submit synthetic `surface-audit@example.invalid` | URL, alert DOM, field existence | URL and `next=/app/agent` stayed unchanged; alert explicitly states reset is unconfigured and no email/code was sent; verification-code and new-password fields did not exist. |

Mobile viewport (`390 × 844`):

- Viewport/client/scroll widths were all 390, so no horizontal overflow was present.
- Honest unavailable description and canonical `next=/app/agent` remained visible.
- No application warning/error entries were recorded for the isolated production runtime.

Development-runtime note:

- The long-running port 3000 development process served HTML but did not attach client event handlers in either in-app Browser or Chrome.
- This did not reproduce in the newly built production runtime and is not treated as evidence that production hydration is broken.

## 2026-07-27 — Registration fallback honesty and real-workspace preservation

Production runtime:

- Rebuilt the current worktree with `npm run build`; compilation and TypeScript passed.
- Started the resulting production build with `next start` on an isolated local port.
- Opened `/app/events/event_001/register?language=en` in Chrome.

Desktop/default viewport:

| Path / action | Authoritative evidence | Result |
| --- | --- | --- |
| Open a confirmed event registration | DOM snapshot and `data-registration-stage` | Rendered the real one-question-at-a-time `EventRegistrationWorkspace` at interview step 1/8, not the read-only mismatch fallback. |
| Select “A Exploring” | DOM state transition | Advanced to step 2/8 (“Industry”) and rendered “Got it — you're still exploring your focus.”, proving hydrated question handling remained active. |

Mobile viewport (`390 × 844`):

- `innerWidth`, document client width, and document scroll width were all 390; no horizontal overflow was present.
- The route still rendered `data-registration-stage="interview"` with the first question and reachable option buttons.

Console:

- No application warning or error entries were recorded.
- Chrome reported extension-owned warnings from `chrome-extension://.../contentscript.js`; these were not emitted by iOrbit.

Fallback scope:

- The data-source mismatch fallback is covered by source regression tests because the canonical confirmed event correctly resolves the real workspace.
- The fallback now declares itself read-only, makes answer fields read-only, disables skip checkboxes, states that nothing can be saved, and exposes only real navigation links.

## 2026-07-27 — Authenticated contacts search and filters

Production runtime:

- Rebuilt the current worktree with `npm run build`; compilation and TypeScript passed.
- Started the resulting production build with `next start` on an isolated local port.
- Created and signed in with an isolated synthetic audit account through the real Signup and Login UI; no credentials are recorded in this log.
- Confirmed the protected return path reached `/app/contacts`.

Desktop/default viewport:

| Action | Authoritative evidence | Result |
| --- | --- | --- |
| Initial contacts load | DOM snapshot and rendered counts | Loaded 66 route-provided contacts and three value filters derived from actual data: Strategic fit (14), Knowledge exchange (16), and Referral path (12). |
| Click “Who can intro an investor?” | Search input value, live result count, rendered cards | Applied the bounded local query `Investor` and reduced 66 contacts to 7; the UI no longer claims an AI operation occurred. |
| Clear search and click “Strategic fit” | Search value, `aria-pressed`, live count, rendered cards | Search cleared to an empty value; the data-derived value tag became pressed and rendered exactly 14 matching contacts. |

Mobile viewport (`390 × 844`):

- `innerWidth`, document client width, and document scroll width were all 390; no horizontal overflow was present.
- Mobile rendered the same route-derived stage and value filters.
- Clicking “In progress” set the pressed state and reduced 66 contacts to 53.

Console:

- No application warning or error entries were recorded.
- Browser-extension-owned warnings were excluded by source URL and were not emitted by iOrbit.

## 2026-07-27 — Source-backed contacts pipeline

Production runtime:

- Rebuilt the current worktree with `npm run build`; compilation and the build's TypeScript check passed.
- Started the resulting production build with `next start` on an isolated local port.
- Reused the isolated authenticated audit session; no credentials were read or recorded.

Desktop/default viewport:

| Action | Authoritative evidence | Result |
| --- | --- | --- |
| Open `/app/contacts/pipeline` | URL, DOM snapshot, rendered counts | Loaded 66 source-backed contacts across the three route-derived review groups and displayed the explicit read-only classification notice. |
| Inspect available controls and copy | DOM query and rendered text | Rendered 0 stage buttons and none of the removed hard-coded event, draft, reminder, fake-save, or fake-success copy. |
| Open the first visible contact card | Unique desktop `href`, navigation URL, detail DOM | Navigated to `/app/contacts/contact_003`; the destination rendered source/evidence detail content. |

Mobile viewport (`390 × 844`):

- The mobile pipeline rendered all 66 source-backed cards and the read-only classification notice.
- `innerWidth`, document client width, and document scroll width were all 390; no horizontal overflow was present.
- The mobile surface rendered 0 stage buttons and none of the removed prototype actions or hard-coded event copy.

Console:

- No application warning or error entries were recorded on desktop or mobile.
- Temporary Chrome viewport override was reset and the verification tab was finalized.

## 2026-07-27 — Shared recovery, Admin, Party, and Platform P0 closure

Production runtime:

- Rebuilt the current worktree with `npm run build`; compilation and the build's TypeScript check passed across all shared `StateView` consumers.
- Started the production build on an isolated local port.
- Used an isolated synthetic account for the authenticated Party verification; no credentials are recorded.

Desktop/default viewport:

| Surface / action | Authoritative evidence | Result |
| --- | --- | --- |
| Admin dashboard | DOM and control query | Rendered live-capable source metrics with “Source metrics · read only”; Export, Run AI matching, and Invite controls were absent. |
| Party → For you → industry filter | Unique combobox state and rendered recommendation list | Route-derived options rendered; selecting “Investor context” reduced three recommendations to the one matching person. |
| Platform → Event review | DOM and control query | Rendered “Source review only”; no rejection textarea, approve, reject, or More actions controls existed. |

Mobile viewport (`390 × 844`):

- Admin and Platform both measured `innerWidth = clientWidth = scrollWidth = 390`, retained their read-only notices, and exposed none of the removed write controls.
- Party's route-derived industry combobox remained reachable; selecting “Partner program fit” reduced the visible list to one matching recommendation.
- Party also measured `innerWidth = clientWidth = scrollWidth = 390`.

Shared route-state boundary:

- `StateView` render tests prove every recovery action is now a named link with a real `href`; the production build's TypeScript check validates all 24 direct callers.
- The generated surface manifest contains zero `behavior-missing-static` actions after this phase.

Console:

- No application warning or error entries were recorded.
- The temporary viewport override was reset and the browser tab was finalized.

## 2026-07-27 — Party and Event Detail identity boundary

Production runtime:

- Ran 20 focused Party/Event Detail route, identity, state, desktop component, and mobile component tests; all passed.
- Ran the production build; compilation, TypeScript, 39 static pages, and build traces completed successfully.
- Started that exact build on isolated port 3100 and reused the authenticated audit session; port 3000 was not touched.
- Regenerated the surface manifest from 38 production routes and 1,447 interactions.

Desktop browser (`1280 × 720`):

| Route | Authoritative evidence | Result |
| --- | --- | --- |
| `/app/party?eventId=event_001` | URL and rendered DOM | Controlled Party failure; no check-in or contact write claim; no Climate demo event, demo attendee, synthetic seat, or access code. |
| `/app/party/checkin?eventId=event_001` | URL and rendered DOM | Same authenticated, fail-closed event boundary; no fake check-in success. |
| `/app/party/graph?eventId=event_001` | URL and rendered DOM | Same authenticated, fail-closed event boundary; no borrowed demo graph context. |
| `/app/party?eventId=demo-event-1&mode=mock` | URL and rendered DOM | Query-selected Mock mode was ignored; production services returned the controlled boundary and no fixture content. |
| `/app/events/event_001?mode=mock` | URL and rendered DOM | Authenticated ownership check returned Event not found; query-selected Mock mode did not expose fixture detail. |

Mobile evidence:

- The focused component tests render the source-backed Event Detail model and assert the mobile-only hero, fixed CTA, safe-area inset, reachable schedule/attendee content, and absence of collapsed defaults.
- Party route authentication, actor propagation, exact event identity, null seat/group/pass state, unavailable check-in, and contact-ID-only links are shared across desktop/mobile markup and covered by the focused tests.
- The current in-app browser session exposed a fixed `1280 × 720` CSS viewport and no viewport override. No claim of a new 390 px runtime pass is made here; the preceding authenticated Party verification remains the latest real `390 × 844` evidence for the shared Party UI.

Integrity checks:

- `event_001` is no longer rewritten to `demo-event-1` for roster, recommendations, readiness, matches, encounter notes, review, opening line, or want-to-connect intent.
- Production Event Detail GET navigation no longer forwards action or target-contact query parameters into a storage-writing route action.
- The Event Detail loader no longer contains any want-to-connect write branch.
- Production anonymous `POST /api/events/demo-event-1/want-to-connect` with a spoofed actor and Priya target returned `401 UNAUTHORIZED` with `authenticated-actor-required`.
- The POST handler derives actor identity from the server session, checks event ownership, and rejects missing or non-match targets before the intent service runs.

## 2026-07-27 — Event child API authorization boundary

Production runtime:

- Ran `npm run lint`; the TypeScript validation completed successfully.
- Ran 28 focused owner-guard, attendee, goal/readiness, match, encounter, post-event, and Agent follow-up route tests; all passed.
- Ran two adaptive registration authentication tests; anonymous interview/persona generation was rejected and authenticated participant behavior remained available.
- Rebuilt the exact worktree with `npm run build`; compilation, TypeScript, 39 static pages, and route collection completed successfully.
- Started that build on isolated port 3100; port 3000 was not touched.
- Regenerated the manifest from 38 production routes and 1,447 interactions; all 9 manifest tests passed.

Authorization results:

| Boundary | Authoritative evidence | Result |
| --- | --- | --- |
| Anonymous Event API inventory | Real HTTP requests against the exact production build | All 18 list/detail/child/matchmaking/registration/want-connect requests returned `401 UNAUTHORIZED`. This includes the previously anonymous evidence write, post-event confirmation, and adaptive interview/persona endpoints. |
| Owner-only child capability | Injected server-actor handler tests | Anonymous access stopped before event storage; an actor-scoped missing event returned 404 before the child handler; client body/header actor spoofing was ignored. |
| Authorized route behavior | 28 focused route/service tests | Attendee, goal/readiness, match, encounter/evidence, post-event review/confirm/follow-up, and Agent trigger behavior remained green behind the shared guard. |
| Participant registration generation | Two focused handler tests | Interview and persona generation now require a server-authenticated participant without incorrectly requiring event ownership. |
| Authenticated Event Detail | Browser URL and rendered DOM on `/app/events/event_001?mode=mock` | The page remained on the exact event ID, reported that the event is unavailable to the authenticated account, and stated that no child capability or provider work ran. |

Implementation boundary:

- `withOwnedEventAccess` derives identity only from the server session and uses the actor-scoped Event Detail service before any owner-only child capability reads or writes.
- Route files are thin exports; injectable handler factories preserve authorized-path testing without a test header, mock-mode bypass, or client identity backdoor.
- Encounter and post-event Agent runtime creation reuse the already verified actor. Post-event follow-up uses the server event title rather than a caller-supplied title.
- Encounter-note input no longer defaults a missing contact/note to a named demo person and sentence.
- Adaptive registration interview/persona use the authenticated-participant boundary because registrants should not be required to own the event.

Browser-tool limitation:

- The in-app browser reloaded the authenticated production page successfully, but its control layer blocks direct `/api/*` navigation with `ERR_BLOCKED_BY_CLIENT`, and the page-evaluation sandbox exposes neither `fetch` nor `XMLHttpRequest`.
- No claim of browser-executed API POST coverage is made. Production HTTP status evidence, authenticated browser page evidence, and injected authorized-handler tests are recorded separately above.

## 2026-07-27 — Contact Detail recovery, Profile readback, and Chat selection identity

Production runtime:

- Ran `npm run lint`; TypeScript validation completed successfully.
- Ran 20 focused Chat summary/extraction, Chat page/live composition, Agent consumer, Contact Detail route/page, and visual-asset tests; all passed.
- Rebuilt the exact worktree with `npm run build`; compilation, TypeScript, 39 static pages, and build traces completed successfully.
- Started that build on isolated port 3100 and reused the authenticated synthetic account; port 3000 was not touched.

Authenticated desktop browser (`1280 × 720`):

| Surface / action | Authoritative evidence | Result |
| --- | --- | --- |
| Contact Detail failure on `/app/contacts/contact_003` | URL and recovery-link DOM | Controlled failure remained honest; “Retry contact detail” resolved to the exact `/app/contacts/contact_003` route and no `demo-contact-1` identity appeared. |
| Profile save on `/app/profile` | Visible save confirmation, server-backed readback, and reload | Saved the existing actor-scoped profile without changing field values; the UI reported `档案已保存并完成复读核验。`, and the synthetic account name, headline, company, role, and other fields remained present after reload. |
| Chat selection on `/app/chat?conversation=conversation_004` | URL, `data-selected-conversation`, `aria-current`, thread heading, organization, summary, and relationship-context DOM | Every selected-context signal resolved to `conversation_004`, 松田 翔, and Umeda Partners; the prior 山田 千尋 substitution did not recur. |
| Unknown Chat selection | Controlled route-state DOM | `conversation:not-in-source-list` rendered “Conversation not found” and explicitly stated that Orbit would not substitute another person's thread, summary, relationship context, or writing suggestion. |

Identity implementation:

- Contact Detail route-state recovery now derives its href from the exact encoded route contact ID through every composed/live loader boundary.
- Chat resolves the optional conversation query against the source-backed list before loading any thread adjunct. Unknown IDs stop before thread, assist, summary, extraction, privacy, or Agent context composition.
- The Chat summary/extraction mock recognizes the same conversation inventory as the conversation service. Its original Maya fixture remains unchanged; a second known conversation receives Diego/Northstar identity and evidence with empty derived signals rather than borrowed Maya content.

Verification limitation:

- No browser warning or error entries were recorded during the Contact Detail and Chat verification.
- The in-app browser remained fixed at `1280 × 720`; this phase does not claim a new mobile-browser pass. Chat and Contact Detail mobile/shared behavior is covered by focused component and route tests.

## 2026-07-27 — Duplicate merge actor boundary

Production runtime:

- Ran `npm run lint`; TypeScript validation completed successfully.
- Ran 24 focused duplicate-merge Mock/Live/API, central contact-draft, manual-contact, and core factory tests; all passed.
- Rebuilt the exact worktree with `npm run build`; compilation, TypeScript, 39 static pages, and build traces completed successfully.
- Started that build on isolated port 3100; port 3000 was not touched.

Authorization and identity results:

| Boundary | Authoritative evidence | Result |
| --- | --- | --- |
| Anonymous merge suggestions | Real `GET /api/contact-drafts/merge-suggestions` against the production build | Returned `401 UNAUTHORIZED` with `authenticated-actor-required` before provider/storage access. |
| Anonymous/spoofed apply preview | Real `POST /api/contact-drafts/merge-suggestions/demo-merge-1/apply` with caller-supplied `actorLabel` | Returned `401 UNAUTHORIZED`; the client label was not accepted as identity. |
| Cross-actor Live provider | Isolated memory-store test | The owning actor received one source-backed candidate; a different actor received an honest empty result with zero candidates and suggestions. |
| Authenticated audit label | Injected handler test | Apply derived `confirmedBy` from the server actor and ignored a JSON `actorLabel` spoof. |

Implementation boundary:

- `route.ts` files remain valid thin App Router exports; injectable authentication and parsing live in adjacent `handler.ts` modules.
- The actor-scoped duplicate provider passes one server actor to both the contact-draft provider and contact graph.
- Actor-scoped contact-draft providers persist `userId` on new records and filter reads by server actor metadata; unscoped legacy factory use now fails closed in Live rather than reading relationship records.

## 2026-07-27 — Central contact-draft and manual creation actor boundary

Production runtime:

- Ran 33 focused central draft, manual creation, QR confirmation, and business-card confirmation tests; all passed.
- Ran `pnpm lint`; TypeScript validation completed successfully.
- Rebuilt the exact worktree with `pnpm build`; a fresh `.next/BUILD_ID` was generated, then `next-env.d.ts` was restored to the development route-types path.
- Started that build on isolated port 3100; port 3000 was not touched.

Authorization and identity results:

| Boundary | Authoritative evidence | Result |
| --- | --- | --- |
| Anonymous central draft list | Real `GET /api/contact-drafts` against the production build | Returned `401 UNAUTHORIZED` from `authenticated-api-actor` before the draft service/provider ran. |
| Anonymous manual creation | Real JSON `POST /api/contact-drafts/manual` against the production build | Returned `401 UNAUTHORIZED` before request parsing or storage writes. |
| Anonymous manual confirmation | Real `POST /api/contact-drafts/manual-draft:live:missing/confirm` against the production build | Returned `401 UNAUTHORIZED` before draft lookup. |
| Actor-scoped persistence and readback | Isolated memory-store test | Actor A's manual draft persisted with `userId=account:manual-a`; Actor A read one draft, Actor B read zero, and Actor B confirmation returned `MANUAL_CONTACT_DRAFT_NOT_FOUND`. |
| Existing capability behavior | 33 focused tests | Mock envelopes stayed deterministic; Live unconfigured behavior stayed fail-closed; QR and business-card confirmation branches remained green. |

Implementation boundary:

- Central list and manual creation route files are thin App Router exports; injectable handlers derive the actor only from the server session.
- Actor-bound Live service factories pass the same actor into the shared contact-draft provider for create, list, and confirmation.
- Unscoped public Live factories now fail closed rather than reading or writing workspace-wide relationship drafts.
- `ACQUISITION-CAPABILITY-AUTH-001` remains open until QR, external import, referral/recommended confirmation, and email/calendar signal APIs receive the same boundary.

## 2026-07-27 — QR acquisition actor boundary

Production runtime:

- Ran 25 focused QR Mock/Live/API and shared confirmation regression tests; all passed.
- Ran `pnpm lint`; TypeScript validation completed successfully.
- Rebuilt the exact worktree with `pnpm build`, generated a fresh production build, and restored `next-env.d.ts` to the development route-types path.
- Started that build on isolated port 3100; port 3000 was not touched.

Authorization and identity results:

| Boundary | Authoritative evidence | Result |
| --- | --- | --- |
| Anonymous QR scan | Real JSON `POST /api/contact-drafts/qr/scan` against the production build | Returned `401 UNAUTHORIZED` from `authenticated-api-actor` before QR input parsing/provider access. |
| Anonymous QR confirmation | Real `POST /api/contact-drafts/qr-draft:live:contact_001/confirm` against the production build | Returned `401 UNAUTHORIZED` before contact/evidence lookup. |
| Cross-actor QR graph | Isolated memory-store test | Actor A received the QR candidate; Actor B received an honest empty scan result and `QR_SCAN_DRAFT_NOT_FOUND` for Actor A's draft ID. |
| Existing confirmation branches | Focused business-card, central-draft, manual, and QR tests | All shared handler branches remained green; deterministic Mock confirmation payloads were unchanged. |

Implementation boundary:

- The QR scan route is now a thin export backed by an injectable authenticated handler.
- Live QR contact and evidence reads filter by the server actor using record ownership metadata.
- The shared draft confirmation handler sends the same actor into the Live QR service and uses the server-derived actor label for confirmation evidence.
- Unscoped QR Live factory use fails closed. `ACQUISITION-CAPABILITY-AUTH-001` remains open for external import, referral/recommended confirmation, and email/calendar signal APIs.

## 2026-07-27 — Complete acquisition capability actor boundary

Production and regression verification:

- Ran 49 focused Event owner-guard, event-attendee, external-import, referral/recommended, email/calendar, and core-factory tests; all passed.
- Ran `pnpm lint`; TypeScript validation completed successfully.
- Rebuilt the exact worktree with `pnpm build`, generated a fresh production build, and restored `next-env.d.ts` to the development route-types path.
- Started that build on isolated port 3100; port 3000 was not touched.
- Ran the full test suite: 1,252 tests, 1,199 passed, 53 open-baseline failures, zero skipped/cancelled/todo. Fourteen new actor-bound tests passed and three prior acquisition failures were removed.

Complete anonymous production inventory:

| Inventory | Authoritative evidence | Result |
| --- | --- | --- |
| 16 contact-draft / relationship-signal operations | Real GET, POST, and PATCH requests against the exact production build | Every operation returned `401 UNAUTHORIZED` from `authenticated-api-actor`, including central list/detail/update/confirm, business-card scan, event-attendee import, external candidates/import, manual, merge list/apply, QR scan, referral/recommended confirm, and email/calendar list/confirm. |
| Static route inventory | All `route.ts` files under `app/api/contact-drafts` and `app/api/relationship-signals` | Every production method is a thin handler export; every handler resolves the shared authenticated actor. |
| Cross-actor Live providers | Isolated memory-store tests | Central/manual, QR, event attendee, external, referral, email/calendar, and duplicate-merge graphs return only the owning actor's records; non-owners receive honest empty/not-found results. |
| Confirmation identity | Handler and Mock regression tests | Query/form/JSON `actorLabel` values are ignored; Live confirmation evidence uses the server actor while deterministic Mock fixtures remain unchanged. |

Implementation boundary:

- Actor-bound factories cover contact drafts, manual creation, QR, event attendees, external candidates/import, referral/recommended confirmation, email/calendar signals, and duplicate merge.
- Event attendee records are scoped at the event, attendee, intent, person, contact, and evidence layers. The already owner-guarded Event attendee GET now passes the verified actor into the acquisition provider.
- These capabilities still stage or return review previews only where their contracts say no write exists; authentication does not upgrade a preview into a persisted contact, relationship, outreach, notification, email, or calendar action.
- `ACQUISITION-CAPABILITY-AUTH-001` is closed.
