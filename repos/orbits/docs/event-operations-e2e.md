# Event operations browser E2E

This path exercises the complete event on-site chain against live records. All people are fictional test fixtures. The fixed matching cohort contains exactly 64 active, on-time participants. Six additional accounts preserve cancelled lifecycle histories (three registered on time and three registered late before cancelling), so canonical storage contains 70 registration histories while the active directory and every frozen/published generation remain exactly 64. Names and profiles span Chinese, Japanese, English, and additional language backgrounds, with intentionally varied industries, companies, seniority, offers, needs, goals, energy styles, experience, and follow-up preferences. It intentionally creates no recommendations, table assignments, graph, check-in, contact request, or relationship record.

## Prepare and seed

Use an isolated development database. Configure one supported model provider and its matching server-side key (`gemini` + `GEMINI_API_KEY`, `deepseek` + `DEEPSEEK_API_KEY`, or `openai` + `OPENAI_API_KEY`). The model provider must return the strict JSON schema; invalid JSON, missing keys, timeouts, and schema errors fail the generation without a fallback.

```sh
export ORBIT_MODULE_MODE=live
export ORBIT_EVENT_DATABASE_URL='your isolated development database URL'
export ORBIT_AGENT_PROVIDER=openai
export OPENAI_API_KEY='your server-side key'
export ORBIT_EVENT_OPERATIONS_SEED_PASSWORD='choose a development-only password of at least 8 characters'
# Only when rotating the synthetic .example.test fixture credentials:
export ORBIT_EVENT_OPERATIONS_RESET_FIXTURE_PASSWORDS=1
npx tsx scripts/seed-event-operations-e2e.ts
npm run event-operations:worker
# Run `npm run dev` in a second terminal with the same environment.
npm run dev
```

The password is supplied only through the environment and is neither embedded nor printed. Re-running the seed resets the exact fixture event's registration and event-operations collections before recreating them. It does not broadly delete other events or accounts. The six cancelled histories exercise cancellation and late-registration state without reducing or contaminating the 64-person matching cohort.

## Organizer path

1. Open `/app/account/login?next=%2Fapp%2Fevents%2Fevent%253Ae2e%253Aorbit-connection-night%2Foperations`.
2. Sign in as `organizer.event-ops@orbit.example.test` with the development password supplied above.
3. Confirm `/app/events/event%3Ae2e%3Aorbit-connection-night/operations` shows exactly 64 active, on-time participants with complete, partial, and minimal profiles. The underlying canonical fixture also retains 6 cancelled histories, including 3 late registrations.
4. Review the seeded time gates. Save only if intentionally changing them.
5. Select **Capture snapshot**. Record the immutable snapshot hash and confirm its participant count is 64. None of the 6 cancelled histories may enter that snapshot.
6. Keep the independent worker running. The admin page polls persisted progress automatically; it must never require repeated HTTP **Run AI tasks** clicks. The legacy `/run` route returns `EVENT_OPERATIONS_DURABLE_WORKER_REQUIRED` instead of holding an HTTP request open for provider work.
7. If a shard fails, confirm the exact provider/error code is visible and use **Retry failed shards**. Completed shard outputs must remain completed.
8. Once the generation is completed, select **Publish atomically**. Before this click, no new attendee result may appear.
9. Download **Export CSV** and confirm it contains the 64 frozen participant IDs, completeness flags, check-in state, and both table/seat columns.

## Attendee result and check-in path

1. Sign out, then sign in as `attendee01.event-ops@orbit.example.test` with the same development password.
2. Open `/app/party?eventId=event%3Ae2e%3Aorbit-connection-night`.
3. Confirm **All attendees** contains exactly 64 active registration-backed profiles. Cancelled histories must be absent. Non-recommended attendees must be labeled as directory profiles rather than recommendations.
4. Confirm **For you** contains only the published AI recommendations, with evidence-based reasons, two icebreakers, and a member hint. If the model returned no match, confirm the explicit `noMatchReason` appears.
5. Confirm **Groups** shows two distinct rounds, each with a real table number, seat, theme, rationale, three table icebreakers, and participant-specific prompts.
6. Confirm **Graph** node and edge counts match the published graph and that edges distinguish mutual recommendations, round-one tables, and round-two topics.
7. Open `/app/party/checkin?eventId=event%3Ae2e%3Aorbit-connection-night`, select **Check in now**, refresh, and confirm the same persisted timestamp remains. Repeating the action must not create another arrival record.

## Bilateral business-card consent

1. While signed in as attendee 01, request contact with attendee 02 from one attendee/recommendation card. Confirm only that one target moves to **Waiting for their consent**.
2. Sign out and sign in as `attendee02.event-ops@orbit.example.test`.
3. Open the same Party event and confirm the incoming request offers **Accept** and **Decline**.
4. Decline once after a fresh seed and verify the organizer consent audit shows `declined` with no contact-write evidence.
5. Re-run the seed, repeat the request, and accept it. Confirm the audit reaches `accepted` and contains two actor-scoped consent evidence IDs. Only after acceptance should each account receive the other participant's contact/connection records.

## Failure boundaries

- Remove the selected provider key and start/run a new generation: it must fail with `EVENT_OPERATIONS_AI_UNAVAILABLE` and preserve the previously published generation.
- Configure a test provider response with malformed or fenced JSON: it must fail with `EVENT_OPERATIONS_AI_JSON_INVALID`; no repair or fallback result may be published.
- Visit the organizer URL as an attendee: owned-event access must reject it.
- Visit Party without an active registration: registered-event access must reject it.
- Before `resultsAvailableAt`, Party must show a locked state even if a generation is published.
