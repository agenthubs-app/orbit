# Goal 2: Contacts Live Store

## Goal

Move the Contacts list/search/filter capability from hybrid-only local remote data to a live storage-backed mode using the shared `orbit_records` table.

## Scope

- Keep `features/contacts/contract.ts` as the feature DTO boundary.
- Add a live contacts service behind `ContactsListSearchAndFilterService`.
- Add a storage provider that reads `contacts`, `connections`, and `evidence` records from `LiveRecordStoreLike`.
- Register `live` mode in `features/contacts/service-factory.ts`.
- Update `/api/contacts` and `/api/contacts/search` to await async-capable services.
- Keep the compose contacts page on the existing synchronous mock/hybrid route adapter for this goal.

## Acceptance

- A memory live-record-store test seeds `defaultMockFixtures` and reads 66 contacts through the live contacts service.
- Live list/search/filter maps `contacts + connections + evidence` into `ContactListItem`.
- `ORBIT_MODULE_MODE=live` can resolve the contacts factory; without database config it fails closed through the service result.
- `npm run lint`, targeted tests, full `npm test`, and `npm run build` pass.
