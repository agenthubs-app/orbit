# iOrbit Full Test Baseline — 2026-07-27

Command: `pnpm test` in `repos/orbits`

- Tests: 1,253
- Passed: 1,215
- Failed: 38
- Skipped/cancelled/todo: 0
- Duration: 35.7 seconds
- Production build and TypeScript: passed separately.

The current rerun keeps the complete actor-bound acquisition suite and removes eight more stale surface-contract failures without adding a new failure identity. Contact list/detail now resolve local manifest portraits through one shared component with an honest fallback; root and Event visual assertions follow the current rendered composition and accessible navigation; Event registration coverage uses the service and authenticated page boundary instead of invoking an Auth.js page outside request context; and Organizer coverage follows the live-capable presenter and current public page.

Classification totals:

| Category | Failures | Current interpretation |
| --- | ---: | --- |
| agent-legacy-contract | 24 | Tests lock an older Agent composition/DOM/source-boundary contract and require requirement-by-requirement reconciliation, not bulk deletion. |
| design-scale-ratchet | 4 | Current source exceeds literal design-token ratchets. |
| reference-css-contract | 4 | Tests expect the extracted stylesheet route while current product composition differs. |
| button-style-ratchet | 2 | Shared button-class exemptions are out of sync with the remaining source controls. |
| sample-data-ratchet | 1 | Legacy route sample-record scan still finds a violation. |
| scaffold-contract | 1 | App Router scaffold source contract drift. |
| theme-contract | 1 | Theme control icon contract drift. |
| prototype-mapping-contract | 1 | Prototype-to-product route mapping contract drift. |

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
| sample-data-ratchet | legacy route files no longer embed old product sample records | open-baseline |
| reference-css-contract | Orbit reference styles render as an external stylesheet link | open-baseline |
| reference-css-contract | Orbit reference stylesheet route serves extracted prototype CSS | open-baseline |
| reference-css-contract | Orbit reference stylesheet route short-circuits matching cache validators | open-baseline |
| reference-css-contract | Orbit reference stylesheet route disables browser caching in development | open-baseline |
| scaffold-contract | scaffold exposes the runnable Next.js App Router contract | open-baseline |
| button-style-ratchet | the five T5 core surfaces have no non-.btn `<button>` outside the documented exemption list | open-baseline |
| button-style-ratchet | EXEMPTIONS stays in sync with source — every entry still points at a real non-.btn `<button>` | open-baseline |
| theme-contract | P2-2: theme toggle renders icons, not emoji glyphs | open-baseline |
| prototype-mapping-contract | prototype mappings survive the unification | open-baseline |
| design-scale-ratchet | fontSize literals outside the scale in `app/(app)/app` do not increase | open-baseline |
| design-scale-ratchet | fontWeight literals outside `{400,500,600,700,800}` in `app/(app)/app` do not increase | open-baseline |
| design-scale-ratchet | gap literals outside the scale in `app/(app)/app` do not increase | open-baseline |
| design-scale-ratchet | the eight T6-snapped files have zero off-scale fontSize/fontWeight/gap literals | open-baseline |
