# Natural-language Agent Playbooks

A Playbook is a versioned, actor-scoped, read-only relationship review. The
model may compile natural language into a bounded draft, but the user reviews
the structured capability, instruction, and trigger before activation.

Supported triggers are schedule (`once`, `daily`, `weekly`) and real Orbit
relationship signals (`followup_due`, `event_upcoming`,
`relationship_stale`). Signal delivery is idempotent per signal event.

Dry runs use the same Orbit Agent read path without saving a Playbook or
executing writes. Any model response that proposes a write is rejected. Every
configuration edit appends an immutable bounded revision; pause/resume does not
create a new version.
