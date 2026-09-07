# Event experience configuration

This feature gives an event organizer a small, bounded customization surface.
The organizer can edit a plain-text `introduction` (up to 1,000 characters), a
validated `#RRGGBB` `accentColor`, and the wording/options of the fixed profile
questions. The existing event content remains authoritative for the cover:
`coverAssetId` stays nullable for compatibility but is null-only until a
trusted asset registry can provide approved responsive assets and dimensions.
Organizers cannot introduce a new profile dimension, submit arbitrary URLs or
scripts, or change a published question set in place.

## Lifecycle

`PUT /api/events/:id/experience` saves a versioned draft. The first write uses
`expectedRevision: null`; later writes must send the returned head revision.
The API returns `409` for a stale revision. `POST /publish` atomically moves the
draft to the published head, also requiring the current revision. The head reads
`profile_edit_deadline_at` from the existing event-operations configuration.
After that deadline, display-only changes may still be drafted and published,
but only when the question set is semantically identical to the current
published baseline; a missing baseline or changed question/track is rejected.
PostgreSQL uses `statement_timestamp()` for this boundary, while the memory
repository accepts an injected clock. The feature-owned migration creates
`event_ops_experience_versions` and `event_ops_experience_heads`, both linked
to `event_ops_events`, and records a checksum in
`event_ops_experience_schema_migrations`. It is separate from
`event-operations/storage/migrations.ts`; the event-operations worker invokes
`runEventExperienceMigrations`, and `npm run event-experience:migrate` provides
the same idempotent migration as a standalone deployment step.

`POST /preview` normalizes and hashes the proposed configuration in memory. It
does not create a head, write a version, read participants, or call registration.

## Question tracks

V1 is the compatibility track: exactly the required `target_attendees` and
`value_offered` questions. V2 accepts zero to four optional questions. Every
question uses the fixed intent-to-profile-field mapping in `contract.ts`.
Published registration responses carry `questionSetVersion` and a SHA-256 hash,
so a client can detect a changed immutable set before submitting answers. The
hash covers only question semantics, not mutable display fields. Those values
are retained on the admission/profile snapshot and copied into generation
`sourceVersions`; legacy snapshots omit the optional fields and keep their
historical hashes unchanged.

Until a published experience exists, registration retains the existing
deterministic two-question path. A model failure also falls back to those exact
questions, rather than returning an empty registerable form.
