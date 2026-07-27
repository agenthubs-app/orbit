# iOrbit Full Test Baseline — 2026-07-27

Command: `pnpm test` in `repos/orbits`

- Tests: 1,253
- Passed: 1,229
- Failed: 24
- Skipped/cancelled/todo: 0
- Duration: 42.7 seconds
- Production build and TypeScript: passed separately.

The current rerun removes all 14 remaining non-Agent baseline failures without adding a new failure identity. The reference stylesheet contract now follows the build-time static asset; request-scoped root authentication is no longer invoked as a plain test function; theme and prototype-route assertions follow their current settings and canonical Today boundaries; the legacy event-code-only visual mapping is gone; button exemptions use stable opening-tag markers instead of line numbers; and post-T6 product surfaces were snapped back to the established type and spacing scale. The 24 remaining failures are all isolated to the Agent legacy-contract group.

Classification totals:

| Category | Failures | Current interpretation |
| --- | ---: | --- |
| agent-legacy-contract | 24 | Tests lock an older Agent composition/DOM/source-boundary contract and require requirement-by-requirement reconciliation, not bulk deletion. |

Every failing test:

| Category | Test | Status |
| --- | --- | --- |
| agent-legacy-contract | /app/agent product route keeps technical provenance secondary and prevents overflow | open-baseline |
| agent-legacy-contract | /app/agent?action=calendar-preview preserves the AI answer and stages a calendar action | open-baseline |
| agent-legacy-contract | /app/agent?action=calendar-preview renders localized staged calendar previews with one clear visible action | open-baseline |
| agent-legacy-contract | /app/agent?action=calendar-preview&q=to-do stages a calendar preview on to-do cards | open-baseline |
| agent-legacy-contract | /app/agent calendar-action source keeps route composition out of API routes | open-baseline |
| agent-legacy-contract | /app/agent UI source exposes recommendation reason, snippets, confidence, and detail anchors | open-baseline |
| agent-legacy-contract | /app/agent makes contact discovery explicit before a user submits a goal | open-baseline |
| agent-legacy-contract | /app/agent UI source exposes event recommendation cards, reasons, people, timing, confidence, and detail anchors | open-baseline |
| agent-legacy-contract | /app/agent makes event discovery explicit before a user submits a goal | open-baseline |
| agent-legacy-contract | /app/agent source clears stale panels only for turns that do not return a tool panel | open-baseline |
| agent-legacy-contract | /app/agent source preserves recent conversation context for the next turn | open-baseline |
| agent-legacy-contract | /app/agent keeps ordinary assistant bubbles visible without inline API panels | open-baseline |
| agent-legacy-contract | /app/agent input explains the no-tool privacy boundary before sensitive context is shared | open-baseline |
| agent-legacy-contract | /app/agent page renders a controlled live failure when storage is unconfigured | open-baseline |
| agent-legacy-contract | /app/agent Chinese GET contact tool panels render localized labels and Chinese assistant answer | open-baseline |
| agent-legacy-contract | /app/agent Chinese GET event and calendar panels use one localized panel source | open-baseline |
| agent-legacy-contract | /app/agent Chinese proactive page localizes reminder context and keeps technical ids intact | open-baseline |
| agent-legacy-contract | /app/agent source routes all API panel copy through the feature localization boundary | open-baseline |
| agent-legacy-contract | /app/agent page renders submitted to-do prompts through the GET preview path | open-baseline |
| agent-legacy-contract | /app/agent GET q=今日待办 renders the answered to-do state above the launcher | open-baseline |
| agent-legacy-contract | /app/agent source exposes to-do prompt affordances without owning business logic | open-baseline |
| agent-legacy-contract | /app/agent input has an explicit to-do capable accessible name | open-baseline |
| agent-legacy-contract | Orbit agent submit controls remain hittable while blank prompts are guarded in handlers | open-baseline |
| agent-legacy-contract | Orbit agent gates responsive chat layout and exposes request state | open-baseline |
