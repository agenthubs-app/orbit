# Tasks Domain

`features/tasks` owns the user's general to-do items. A Task is not a calendar
event and is not limited to relationship follow-up work.

## Storage boundary

- One `tasks` LiveRecord stores the current `TaskItemDTO` and its append-only
  `TaskActivityDTO[]` together. A state transition therefore needs one upsert.
- `workspaceId` scopes physical storage. Both `LiveRecord.userId` and the
  payload's `accountId`/`ownerUserId` must match the authenticated actor.
- `TaskSuggestion` and `ReminderPlan` are separate records. A suggestion is not
  counted as a Task until the user accepts it.

## Legacy boundary

The shared `TaskDTO` remains the compatibility contract for existing follow-up
flows. New code uses `TaskItemDTO`; only `legacy-task-adapter.ts` may translate
legacy `scheduled`/`dismissed` states and contact fields into the new model.

## State rules

- `open -> completed` sets completion metadata and appends `completed` activity.
- `completed -> open` clears current completion metadata and appends `reopened`.
- Previous completion activities are never deleted by reopening a task.
- Elapsed calendar items are `ended`; they are never inferred to be completed.
