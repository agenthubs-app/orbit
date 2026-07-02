# Contact Detail Route Live Implementation Notes

This route composes a contact detail workspace from three feature services:
contact detail/tag/status, connection evidence, and relationship value scoring.
The route adapter is `contact-detail-route-service.ts`; nested UI must not
import fixtures or live record stores directly.

## Live Files

- `features/contacts/live-detail-service.ts` and
  `features/contacts/storage/contact-live-record-provider.ts` read generated
  `contacts`, `connections`, and `evidence` records for contact detail.
- `features/connections/live-service.ts` and
  `features/connections/storage/connection-live-record-provider.ts` read live
  connection evidence.
- `features/analysis/live-value-service.ts` and
  `features/analysis/storage/relationship-value-live-record-provider.ts` derive
  relationship value from the same live connection graph.
- `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts`
  owns page-level service composition only.
- `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts`
  maps the route success model into the existing contact detail UI view model.
- `app/(app)/app/contacts/[id]/page.tsx` is the real Next route adapter. It
  reads route/search params, calls the route service, and renders either the
  existing detail UI or a shared state boundary.

## Switch

- `ORBIT_MODULE_MODE` selects `mock`, `hybrid`, or `live`; missing or invalid
  values fall back to mock.
- The page-level factories now register `hybrid` and `live` and pass the
  requested mode through to feature-level factories.
- Live storage is configured through `ORBIT_EVENT_DATABASE_URL`,
  `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`.
- Missing live storage must return controlled route failure evidence instead of
  falling back to mock data.

## Route Composition

- The route loader is async-compatible and awaits the existing
  `T | Promise<T>` service result types.
- Live contact detail is requested by the route `contactId`.
- The route lists live connections and selects the first connection whose
  `contactId` matches the requested contact. That connection id is then used
  for both connection detail and relationship value scoring.
- If no live connection exists for the requested contact, the route returns a
  controlled failure rather than showing an unrelated demo connection.
- The actual `/app/contacts/[id]` page must not call
  `getOrbitContactsViewModel`; it must use `loadAppContactDetailRoute`.

## Privacy And Side Effects

- Loading the route reads live records only.
- Contact detail update remains a preview in the feature service; it does not
  write contacts or production audit logs.
- `prepare-follow-up` remains a local/mock action. Live connection evidence
  returns a controlled pending failure for unconfirmed add-evidence requests, so
  the route does not send messages, write contact records, write evidence,
  deliver notifications, call AI providers, or access external networks.

## Verified Behavior

- `tests/pages/app-contact-detail-live-route-services.test.ts` proves live mode
  reaches child services instead of failing at the page factory with
  `NOT_IMPLEMENTED`.
- The same test proves the real `/app/contacts/[id]` page calls the live route
  service, avoids the legacy contacts view model, and renders live-store
  failure evidence when storage is unconfigured.
- Focused contact detail, connection evidence, relationship value, and app
  contacts tests pass with the live-capable route loader.
- Remote smoke with `ORBIT_MODULE_MODE=live` loaded `contact_078` (`曾伟`),
  selected `connection_0031`, returned relationship value score `86` with
  `relationshipValueType="strategic_intro"`, and rendered one evidence timeline
  item.
- Remote page smoke rendered `/app/contacts/contact_078?mode=live` with
  `hasRemoteName=true`, `hasStaticDemoName=false`, `hasFailure=false`, and
  `hasDetailPage=true`.
