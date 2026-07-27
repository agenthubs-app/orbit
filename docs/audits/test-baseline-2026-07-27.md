# iOrbit Full Test Baseline — 2026-07-27

Command: `npm test` in `repos/orbits`

- Tests: 1,213
- Passed: 1,156
- Failed: 57
- Skipped/cancelled/todo: 0
- Duration: 33.6 seconds
- Production build and TypeScript: passed separately.

The current rerun adds coverage for source-backed Chat composition, fail-closed Live inbox behavior, canonical registration redirects, contact action honesty, and removed proactive fixtures. Eleven obsolete Chat/Mock/proactive contract failures were resolved and no new failure identity remains.

Classification totals:

| Category | Failures | Current interpretation |
| --- | ---: | --- |
| agent-legacy-contract | 24 | Tests lock an older Agent composition/DOM contract and require requirement-by-requirement reconciliation, not bulk deletion. |
| landing-home-legacy-contract | 8 | Tests expect older root/home composition and responsive layout. |
| design-scale-ratchet | 4 | Current source exceeds literal design-token ratchets. |
| reference-css-contract | 4 | Tests expect the extracted stylesheet route while current product composition differs. |
| asset-manifest-contract | 3 | Image-manifest and alt-text contract drift. |
| button-style-ratchet | 2 | Shared button-class exemptions are out of sync with the remaining source controls. |
| live-storage-environment | 2 | Live-store tests fail against current shared storage/runtime state; must be isolated and re-run. |
| contact-detail-legacy-contract | 2 | Presenter/mapping expectations differ from current contact-detail implementation. |
| event-detail-legacy-contract | 2 | Event detail desktop/mobile hierarchy contract drift. |
| live-provider-contract | 1 | Live AI provider failure boundary differs from the test expectation. |
| organizer-legacy-contract | 1 | Organizer page loader contract drift. |
| sample-data-ratchet | 1 | Legacy route sample-record scan still finds a violation. |
| scaffold-contract | 1 | App Router scaffold source contract drift. |
| theme-contract | 1 | Theme control icon contract drift. |
| prototype-mapping-contract | 1 | Prototype-to-product route mapping contract drift. |

Every failing test:

| Category | Test | Status |
| --- | --- | --- |
| live-provider-contract | AI provider API routes fail closed in live mode instead of returning NOT_IMPLEMENTED | open-baseline |
| agent-legacy-contract | /app/agent product route keeps technical provenance secondary and prevents overflow | open-baseline |
| live-storage-environment | live profile service reads and upserts generated profile records | open-baseline |
| live-storage-environment | live relationship value scoring reads generated graph and recomputes without writes | open-baseline |
| agent-legacy-contract | /app/agent?action=calendar-preview preserves the AI answer and stages a calendar action | open-baseline |
| agent-legacy-contract | /app/agent?action=calendar-preview renders localized staged calendar previews with one clear visible action | open-baseline |
| agent-legacy-contract | /app/agent?action=calendar-preview&q=to-do stages a calendar preview on to-do cards | open-baseline |
| agent-legacy-contract | /app/agent calendar-action source keeps route composition out of API routes | open-baseline |
| agent-legacy-contract | /app/agent UI source exposes recommendation reason, snippets, confidence, and detail anchors | open-baseline |
| agent-legacy-contract | /app/agent makes contact discovery explicit before a user submits a goal | open-baseline |
| contact-detail-legacy-contract | contact detail mapping translates live source and relationship tokens into labels | open-baseline |
| contact-detail-legacy-contract | contact detail presenter exposes one identity, provenance, and follow-up surface | open-baseline |
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
| asset-manifest-contract | root landing activity and event cards render manifest images with alt text | open-baseline |
| asset-manifest-contract | event list and event detail render manifest scene and avatar images | open-baseline |
| asset-manifest-contract | contact list and contact detail render manifest avatar images | open-baseline |
| event-detail-legacy-contract | /app/events/event_001 explicit preview renders the restored desktop event detail hierarchy | open-baseline |
| event-detail-legacy-contract | /app/events/event_001 explicit preview keeps mobile detail content reachable without collapsed defaults | open-baseline |
| landing-home-legacy-contract | web root owns the integrated Orbit Agent landing route | open-baseline |
| landing-home-legacy-contract | web root renders Orbit Agent before activity and event context | open-baseline |
| landing-home-legacy-contract | web root event cards link to distinct event detail ids | open-baseline |
| landing-home-legacy-contract | web root contact links name the relationship context action | open-baseline |
| landing-home-legacy-contract | web root event summaries render only the active language copy | open-baseline |
| landing-home-legacy-contract | app-root-home-route composes home from live route payloads | open-baseline |
| landing-home-legacy-contract | app home desktop grid preserves web rail beside events on medium-width screens | open-baseline |
| landing-home-legacy-contract | app home mobile event rows keep long event titles readable | open-baseline |
| organizer-legacy-contract | /app/o/[slug] page uses a live-capable organizer loader instead of the legacy landing view model | open-baseline |
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
