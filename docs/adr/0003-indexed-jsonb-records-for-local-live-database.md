# Indexed JSONB Records For Local Live Database

Orbit will model Local Live Database rows as typed envelope records: stable
columns carry identity, ownership, provenance, timestamps, and common search
indexes, while a JSONB payload carries the feature-specific DTO. This gives the
first live implementation enough structure for shared querying across contacts,
events, followups, and dashboard aggregates without forcing a fully relational
schema before the product model settles.

## Considered Options

- Single JSONB state document: cheapest to start, but it recreates the current
  hybrid-store problem at database scale because every feature needs custom
  loading, filtering, and migration logic.
- Fully relational tables: strongest constraints and SQL ergonomics, but too
  expensive while relationship, event, and agent-owned record shapes are still
  changing.
- Typed envelope records with indexed JSONB payloads: keeps migrations light for
  changing feature fields while promoting stable cross-feature fields into
  queryable columns.

## Consequences

The first schema should expose a shared `orbit_records` shape with columns such
as workspace/user ownership, collection type, record identity, source/provenance,
timestamps, lifecycle state, and selected search/index fields. Feature providers
own how their DTOs are mapped into and out of the payload; shared search,
dashboard, and Orbit AI tools should query the stable envelope/index columns
instead of reaching into arbitrary feature internals. Fields that become stable
product concepts can later be promoted from payload into columns or dedicated
tables through ordinary Postgres migrations.
