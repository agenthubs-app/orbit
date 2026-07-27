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
