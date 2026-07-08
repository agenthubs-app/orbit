# Local Postgres For Local Live Database

Orbit will use Local Postgres as the first Local Live Database target. This keeps
developer data storage close to the future production/Supabase shape while
avoiding the browser localStorage and memory-adapter split that makes hybrid
mode costly to extend across many services.

## Considered Options

- SQLite file: lighter to run, but its SQL, schema migration, and concurrency
  behavior would drift from the likely production Postgres path.
- Supabase local stack: closest to managed Supabase, but heavier than needed for
  the first shared local database slice.
- Local Postgres: requires Docker or a local Postgres install, but gives the
  best migration path for shared live providers.

## Consequences

The first implementation should create a reusable Local Postgres boundary and
wire a small set of high-value services through live providers before expanding
across all features. Hybrid remains the localStorage/memory migration mode; it
does not become the Local Live Database.
