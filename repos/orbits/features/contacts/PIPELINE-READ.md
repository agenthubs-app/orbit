# Contact pipeline page read

`GET /api/contacts/pipeline?stage=<stage>&limit=20[&cursor=<signed cursor>]`
is the actor-owned read model used by the mobile Contact Pipeline screen. `stage`
is required and must be `to_contact`, `in_progress`, `nurture`, or `archived`;
`limit` defaults to 20 and is restricted to 1–20. The authenticated actor and
workspace are taken from the request context, never from query parameters.

The response contains exact `stageCounts` for all four stages, at most `limit`
display rows for the selected stage, `hasMore`/`nextCursor`, and at most three
due-task action previews. Cursors are signed and bound to workspace, actor,
stage, and limit. Contact pages retain the current newest-first order
(`occurred_at` falling back to `updated_at`, then `updated_at`); `record_id`
ascending in PostgreSQL `C` collation is the deterministic tie-breaker.

Stage counts and pages use valid actor-owned contacts. Contacts whose
`lifecycleInitialization` is `pending` are excluded. A valid canonical
actor-owned connection may override a contact's stage using the existing
relationship-stage mapping. Multiple valid lifecycle-marked connections for
one contact are ambiguous and fail the whole read with a conflict; the reader
does not select one silently. The page rows contain only ID, display name,
organization, and role previews (128 Unicode code points each); contact detail
continues to load through the exact-ID detail route.

The action list uses valid actor-owned task records whose status is `open`,
which have a `dueAt`, and whose `relatedContactId` belongs to a valid
actor-owned contact. It returns the first three ordered by parsed due instant,
raw due string using `C` collation, task ID, then record ID. This deliberately
uses chronological instants for offsets that represent the same moment. Task
title previews are capped at 240 Unicode code points. Neither task activities,
contact notes, nor connection history is returned in this response.

The page and action payloads are bounded, but exact counts and validity checks
are not constant-cost: the SQL evaluates actor-owned contact/connection data,
and task validity includes its canonical record/activity checks before
selecting the three actions. The bound is on returned rows and history egress,
not a claim that the database examines only 20 contacts or 3 tasks.

This endpoint replaces the pipeline screen's former three full-list reads of
`/api/contacts`, `/api/connections`, and `/api/tasks`. The screen explicitly
loads one selected-stage page at a time; it does not automatically chase
cursors. A database/read failure fails the entire page, and a failed
continuation leaves the already loaded page available for retry. This is a
coordinated Web/API + App release: the old App screen is not retained as a
fallback, while contact-detail reads and task actions remain on their existing
exact-item routes.
