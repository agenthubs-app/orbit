# iOrbit Confirmed Risk Register

This register contains code- or runtime-confirmed risks. Static candidates remain in `product-surface-risk-register.md` until reviewed.

| ID | Priority | Surface | Issue and trigger | User impact | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-RETURN-001 | P0 | Login, Signup, Forgot Password | Anonymous navigation from `/app/agent` reached Login correctly, but Login helper links rendered `next=/home`, a non-canonical/non-production route. | Switching authentication mode could lose the original destination or redirect an authenticated request to a dead route. | Browser URL/DOM evidence in `runtime-verification-log.md`; source fallback was `defaultNext: "/home"`. | Fixed and desktop/mobile verified on 2026-07-27. | Keep loader, hydrated client query, proxy, and already-authenticated redirects on `normalizeOrbitAuthReturnPath`; retain targeted tests. |

## Open baseline groups

The 70 full-suite failures are individually named and classified in `test-baseline-2026-07-27.md`. They remain open until each contract is either restored, deliberately replaced with an updated product decision and test, or proven to be an environment-only failure.
