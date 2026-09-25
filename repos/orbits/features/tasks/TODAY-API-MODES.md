# Today API task projections

`GET /api/today` now returns the page projection by default. This is a breaking response change: the former top-level `tasks: TaskItemDTO[]` field is gone. The mobile Today screen must ship with the matching contract/client change; there is no legacy payload fallback.

## Page mode

`GET /api/today?timeZone=Asia%2FTokyo` and the explicit `taskMode=page` form return:

- `taskMode: "page"`, `date`, and `timeZone`;
- `taskPage`, the standard `TaskPageContract` for open/all tasks in the Today window;
- the existing completion count, first two suggestions, Today schedule rows, and their exact summary counts.

The task window is `plannedDate <= date OR dueAt < start of the next local day`. The page reader computes exact task counts in PostgreSQL and returns at most 20 cards by default; `limit` may be 1–50. Later pages use `/api/tasks/page` with the same `plannedThrough` and `dueBefore` values and the returned cursor. Task-card titles and locations are bounded previews; open the task detail route for the complete record. The page order uses the existing stable `C` sort key, so ordering can differ from the former raw `localeCompare` sort for mixed UTC-offset strings or equal sort keys. Membership, open state, count, and task IDs remain the same.

## AI summary mode

`GET /api/today?taskMode=summary&timeZone=Asia%2FTokyo` returns only the fields consumed by the AI home surface:

- exact `summary.openTaskCount` and `summary.suggestionCount`;
- at most three source-discriminated task/schedule action summaries, with bounded title/location previews and no notes or history;
- `questionSignals.urgentTask`, `.relationshipTask`, and `.preparation`.

Tasks fill the action slots before schedule rows. The App localizes the category, due time, schedule state, and navigation target. Urgency is true for any task in the Today window that is high priority or has `dueAt <= now`; relationship is true when any such task has category `relationship`. These two flags are PostgreSQL aggregates over the full filtered Today task set, not guesses from the first three cards. Preparation keeps the prior rule: an upcoming meeting/event in the Today schedule with `startsAt > now`.

## Scope and cost

Both modes use the bounded task-page reader; neither downloads the full task list. Exact count and signal calculation still scans/validates the applicable task records in PostgreSQL, so bounded response bytes do not imply work proportional only to the returned page. The summary projection itself returns no task bodies.

Suggestions and schedule retain their existing readers and behavior in this change. In page mode their current response fields remain present; summary mode computes its count/actions/signals from those same sources. Those sources are still full reads and are not claimed as optimized here.

Invalid modes, page limits, query combinations, task-page errors, and aggregate errors fail closed rather than returning partial data or a false zero. The API remains actor-scoped and no-store.
