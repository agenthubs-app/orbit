# Today task pages and AI summary reads

App-local consumer update on the `04cbd31c` integration base. It has not been deployed or installed on a phone. The API change is breaking: the App and Web service must be released together.

## Today screen

- The first request reads `GET /api/today?timeZone=…&taskMode=page&limit=20`. This is the page projection of the new default response, not a fallback alongside the former full task list.
- Later reads go to `GET /api/tasks/page` with the same `plannedThrough`/`dueBefore` window returned by the first page, plus `status=open`, `scope=all`, and the signed cursor. The App never converts a `TaskCardDTO` into a full task record; titles and locations remain explicit previews and opening a row loads its detail through the existing route.
- Task pages are live keyset reads, not an immutable snapshot. Each response is checked for its own page contract and the original actor, filter, and date window. A changed total/count is accepted; rows are merged by ID, and the latest page total/cursor controls further paging. Previously loaded rows can outnumber a newly reported live total after concurrent changes.
- `completedCount` on Today remains the Today endpoint's completed-today counter. `taskPage.counts.completed` is the task-page scope/window count and is not substituted for that display value.
- A failed first read shows an error and retry, not an empty list. A failed continuation keeps loaded rows and retries the same cursor. Successful create, complete, and suggestion acceptance refresh from page one. Actor/session, server, time-zone, or local-date changes clear old rows and reject late responses.

## AI home

- The home reads `GET /api/today?timeZone=Asia%2FTokyo&taskMode=summary`, with no `limit` parameter. It uses the shared synced `todayTaskSummaryModeSchema` and summary contract rather than a second hand-written summary schema.
- Summary items are the bounded task/schedule union, with `titlePreview` and `locationPreview`. Existing App localization builds context and navigation targets locally. The three `questionSignals` are server aggregates over the complete Today window; the App does not infer urgency or relationship work from the three displayed items.
- This replaces the home consumer's old full Today task read; no legacy payload fallback remains.

## Release and remaining scope

The Web default `/api/today` response is now the page contract, and AI summary mode is a separate projection. Older App builds and this App build are not expected to interoperate across that API cutover; coordinate the App and Web release. Contract copies in `src/api/contract` and `src/api/schema` were generated only by `npm run sync:contract`.

The AI conversation screen's legacy `/api/tasks` read is a separate consumer of follow-up-generation records, not this canonical task-page collection; it is outside this handoff. Separately, AI history currently has a long-session read path that can continue through many pages; bounded, server-filtered history pagination remains an open follow-up and is not claimed as complete here. No other API consumer is claimed to be migrated here.

## Verification

Run from `repos/orbit-app`:

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs \
  tests/today-task-pages.test.ts tests/today-task-pages-lifecycle.test.ts \
  tests/home-question-snapshot.test.ts tests/today-tasks-view-model.test.ts \
  tests/ai-home-screen-copy.test.ts tests/ai-home-guidance-render.test.tsx \
  tests/ai-home-loading-terminal-states.test.tsx
npm run typecheck
```

The focused run passed **55/55** with zero skips; App typecheck passed. The browser-backed lifecycle test exercises first-page failure/retry, continuation failure with retained rows, duplicate rows across live pages, changed totals below the loaded-card count, and stale-response rejection on account/session/server/date/time-zone changes. No cloud, production, phone, deployment, or external AI operation was performed.
