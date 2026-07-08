# Events Live Store Before Calendar Provider Import

Orbit will implement Events `live` mode first as an Orbit-owned Events Live Store
for CRUD/detail/manual creation, and will keep Calendar Provider Import as a
separate later integration. This avoids mixing product event persistence with
OAuth calendar synchronization, recurrence handling, provider deduplication, and
background sync while still letting Orbit AI and Events read real event records.

## Considered Options

- Implement live as direct calendar/provider import first.
- Treat the existing hybrid local-remote store as live.
- Implement an explicit Events Live Store now and add Calendar Provider Import
  later.

## Consequences

`event-crud-import` may gain a `live` constructor now. Other Events child
capabilities stay mock/hybrid until their own live providers are designed and
tested. Calendar/provider import must write through the Events Live Store later
instead of becoming the owner of Events records.
