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
