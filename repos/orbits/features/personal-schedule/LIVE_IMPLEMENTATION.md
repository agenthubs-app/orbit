# Personal schedule collection reads

`GET /api/schedule-items?scope=personal` selects the authenticated canonical
actor's editable personal records from `personal_schedule_items`. The existing
no-query endpoint remains the calendar/Today aggregate, including legacy
display-only schedules. A legacy `kind=personal` display item does not establish
an editable record's ownership or version; clients must not invent those fields.
Both Web and App personal-list consumers use the explicit collection scope.
POST and item GET/PATCH/DELETE keep their existing paths and strict receipts.

The authority collection also contains valid event and meeting items. Personal
collection reads validate the authority schema and envelope identity, owner,
source, timestamps and duplicate IDs before selecting personal records. Selected
personal payloads still pass the unchanged strict public schema and self-source
check. Malformed records fail the request visibly rather than being dropped.
Only valid cancelled personal records are excluded from the visible list.

Sprint 0042 targeted tests cover collection scope, legal mixed records,
ownership/source/version/duplicate corruption, Web client selection and actual
App list rendering with failure/recovery/empty states. Production rebuild,
same-actor runtime CRUD/calendar readback, precise cleanup and integration
checks remain required; these local tests do not close the Sprint's real SC.
Future 0033 mirror-first consumers must retain local-read wiring; this online
collection repair does not authorize replacing that wiring or its sync protocol.
