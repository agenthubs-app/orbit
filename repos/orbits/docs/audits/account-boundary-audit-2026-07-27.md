# Account Boundary Audit — 2026-07-27

## Audit prompt

You are the senior product, privacy, and authorization reviewer for this repository.
For every account-related product page, prove each of the following from executable
code and tests rather than visual appearance:

1. Classify the route as public discovery, authenticated personal data, or privileged
   action. Verify the server boundary matches that classification.
2. Trace every visible field to exactly one source: public catalogue, current actor's
   persisted records, or explicitly labelled demo/test data. Treat an untraceable
   number, person, relationship, or recommendation as a defect.
3. Verify unauthorized sensitive data is never serialized to the browser. CSS hiding,
   overlays, collapsed panels, and disabled buttons are not authorization.
4. Verify write actions are protected both at the page transition and API/service
   boundary, and preserve a safe exact return URL through login.
5. Exercise zero-data, loading, failure, signed-out, signed-in-unregistered, registered,
   and cancelled states in the same product shell.
6. Prove public identifiers and generated URLs are unique and stable. Look for
   truncation, fallback ids, aliases, and route mismatches that can cross-link records.
7. Search protected product presenters for fixture imports, static personal names,
   unexplained business totals, and actor-less loaders.
8. Report each finding with source, root cause, privacy/product impact, structural fix,
   and a regression test. Continue looking for adjacent defects created by the same
   mistaken abstraction.

## Findings and disposition

- Public event discovery was coupled to an authenticated actor-owned event loader.
  An account with no owned event records therefore received an internal empty
  capability view instead of the public catalogue. Fixed by using the approved public
  catalogue as the base model and treating account registration as an optional overlay.
- Event detail used the same authentication-first ownership assumption. Fixed with a
  public catalogue branch and a separate authenticated private-event fallback.
- Attendee names were present in the client view model before access was visually
  locked, and ended events bypassed the registration condition. Fixed by removing
  attendee names from the server payload unless that actor has an active registration;
  ended status no longer grants access.
- The registration page deferred authentication until the API write. Fixed with a
  page-level login redirect on real requests while retaining API/service enforcement.
- The contacts dashboard bypassed the Contacts route loader and rendered static demo
  totals, people, rings, and distributions. Fixed by loading the authenticated actor's
  Contacts view model and deriving every dashboard element from it.
- Empty-contact accounts had no honest dashboard state. Fixed with a first-class zero
  data state inside the existing product shell.
- Multiple catalogue ids shared the same first ten characters and were truncated into
  the same event code. Fixed with stable hash-suffixed codes and a uniqueness test.
- The matchmaking login CTA returned to `/events/[id]` instead of
  `/app/events/[id]`. Fixed with the exact app route and a regression assertion.

## Invariants added

- Public catalogue availability is independent of account storage.
- Personal dashboard data always receives an explicit actor id.
- Attendee privacy is enforced before serialization.
- Registration is the only event discovery transition that requires authentication.
- Empty product states preserve the designed shell.
- Generated event codes are unique across the approved catalogue.
