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
- It does not claim that the remaining production routes, authenticated data flows, DeepSeek call, or all 1,812 route-action pairs have completed browser verification.
