# Product-Facing Mock PoC Sprint Backlog

This backlog starts after Sprint 68. Sprint 68 proved that the mock capability loop can run end to
end. The next sprints are not new capability implementations. They productize the existing mock
framework so `/app/**` reads as a real participant-facing Orbit service rather than a harness or
debug surface.

Reference style: `repos/tokyo-business-connect` is visual and interaction reference only. Do not
copy its product model or edit that repo.

## Productization Rules

- Public `/app/**` routes must lead with user work: who needs attention, why now, what source backs
  it, and what the user can safely do next.
- Mock/runtime/debug language must not be the main narrative. Use a compact environment badge or
  secondary details disclosure when demo status matters.
- Raw IDs such as `evidence:*`, `queue:*`, `source:*`, and provider-like labels must not appear in
  primary page copy. Show readable source chips first; keep raw IDs only in expandable details.
- Each sprint should touch a narrow UI surface or shared presentation layer. Do not add new backend
  capability behavior.
- Evaluation must include desktop and mobile screenshots, browser snapshots, accessibility smoke,
  and a short copy/CTA check.
- Product routes should feel like a coherent app shell, not a collection of isolated capability
  demos.

## Wave 12: Product Shell And Trust Language

### Sprint 69 - Product App Shell And Route Hierarchy

Goal: Make `/app/**` feel like one coherent Orbit product workspace.

Done when:
- The shell identifies one active demo workspace consistently across home, profile, contacts,
  events, followups, chat, dashboard, and agent.
- Primary navigation labels describe user outcomes, not internal modules.
- The primary "add source" CTA leads to `/app/contacts/new` or is renamed to match its destination.
- Runtime/demo status is visible but compact and secondary.
- Desktop and mobile screenshots show no overlap, truncated button text, or empty nav labels.

Suggested file boundary:
- `app/(app)/app/layout.tsx`
- `app/(app)/app/page.tsx`
- `shared/ui/app-shell.tsx`
- `shared/ui/theme.ts`
- `tests/ui/app-shell.test.tsx`
- `tests/pages/app-page.test.tsx`

### Sprint 70 - Product Visual System Pass

Goal: Raise the shared UI language from functional workbench to polished product surface while
remaining compatible with existing routes.

Done when:
- Shared color, spacing, typography, chip, button, panel, and focus treatments are documented in
  code and used consistently.
- The UI preserves Tokyo-style density and utility without looking like a dev dashboard.
- Cards are not nested inside cards; repeated items remain scannable.
- Mobile and desktop screenshots show stable rhythm and clear visual hierarchy.
- Existing page tests still pass without route-specific logic changes.

Suggested file boundary:
- `app/globals.css`
- `shared/ui/theme.ts`
- `shared/ui/primitives.tsx`
- `app/dev/foundation/style/page.tsx`
- `tests/ui/theme.test.ts`

### Sprint 71 - Product Vocabulary And CTA Semantics

Goal: Replace operator/debug vocabulary on public product routes with participant-facing language.

Done when:
- Public copy avoids `mock`, `harness`, `fixture`, `provider`, `operator`, and raw implementation
  wording except inside explicitly secondary technical details.
- CTAs state the user outcome: review next move, add relationship source, prepare follow-up,
  inspect source, confirm safe action.
- Empty, pending, and failure states tell the user what to do next, not how the harness works.
- Tests guard representative public routes against internal vocabulary in primary text.

Suggested file boundary:
- `shared/ui/state-view.tsx`
- `app/(app)/app/page.tsx`
- `app/(app)/app/profile/page.tsx`
- `tests/pages/product-copy.test.tsx`

### Sprint 72 - Readable Source Chips And Provenance Disclosure

Goal: Standardize how source and evidence are shown across product pages.

Done when:
- `SourceChip` or equivalent shared UI shows human-readable source labels, source type, and trust
  state.
- `ProvenanceDisclosure` or equivalent hides raw IDs behind an optional details element.
- Public route tests assert raw IDs are absent from primary copy and present only in details where
  needed.
- Existing mock data and API envelopes remain unchanged.

Suggested file boundary:
- `shared/ui/source-chip.tsx`
- `shared/ui/provenance-disclosure.tsx`
- `shared/ui/primitives.tsx`
- `tests/ui/source-provenance.test.tsx`

### Sprint 73 - Product State And Recovery System

Goal: Make success, empty, pending, and failure states feel like product moments rather than test
scenarios.

Done when:
- State views have visible, descriptive labels and recovery actions on desktop and mobile.
- Scenario links used by harness are either hidden from primary product flow or labeled as
  secondary demo checks.
- Recovery actions are route-specific and use user-facing language.
- Accessibility snapshots contain meaningful names for state links and buttons.

Suggested file boundary:
- `shared/ui/state-view.tsx`
- `shared/ui/app-shell.tsx`
- `tests/ui/state-view.test.tsx`
- `tests/pages/product-state-recovery.test.tsx`

## Wave 13: Product Route Composition Polish

### Sprint 74 - Home Relationship Cockpit

Goal: Turn `/app` into the first real product screen for a returning user.

Done when:
- The first viewport shows the top relationship priority, reason, source, and next safe action.
- Secondary modules summarize contacts, event opportunities, followups, chat context, dashboard
  health, and agent review without reading like module inventory.
- The page has one obvious primary action and clear secondary paths.
- Desktop and mobile screenshots show the product's purpose without requiring dev-route context.

Suggested file boundary:
- `app/(app)/app/page.tsx`
- `tests/pages/app-page.test.tsx`

### Sprint 75 - Contact Acquisition Cockpit

Goal: Make `/app/contacts/new` feel like a real source intake flow while keeping all hard-to-debug
  capabilities mocked.

Done when:
- The page leads with one current review candidate and the next decision.
- Business card, QR, external import, email/calendar, referral, and merge paths are presented as
  selectable source methods, not a long debug list.
- Source chips use readable labels; raw IDs stay inside details.
- The route has no horizontal overflow at 375 px and no unlabeled controls.

Suggested file boundary:
- `app/(app)/app/contacts/new/page.tsx`
- `tests/pages/app-contacts-new-page.test.tsx`
- `tests/integration/mock-capability-loop.test.tsx`

### Sprint 76 - Relationship List And Detail Polish

Goal: Make contacts and contact detail routes feel like relationship work, not fixture inspection.

Done when:
- `/app/contacts` prioritizes who needs attention and why, with readable source badges.
- `/app/contacts/demo-contact-1` leads with current relationship context, history, and next action.
- Raw IDs and mock labels are secondary.
- The two routes share visual language without sharing route-specific business logic.

Suggested file boundary:
- `app/(app)/app/contacts/page.tsx`
- `app/(app)/app/contacts/[id]/page.tsx`
- `tests/pages/app-contacts-page.test.tsx`
- `tests/pages/app-contact-detail-page.test.tsx`

### Sprint 77 - Event Workbench Polish

Goal: Make event routes guide the user through who to meet and why.

Done when:
- `/app/events` and `/app/events/demo-event-1` foreground the recommended attendee, context, and
  safe next step.
- Event logistics, roster, and evidence are readable and not over-dense on mobile.
- Demo/sample language is secondary.
- The user can understand what to do before, during, and after the event.

Suggested file boundary:
- `app/(app)/app/events/page.tsx`
- `app/(app)/app/events/[id]/page.tsx`
- `tests/pages/app-events-page.test.tsx`
- `tests/pages/app-event-detail-page.test.tsx`

### Sprint 78 - Followups And Chat Action Polish

Goal: Make follow-up and chat surfaces feel like a safe relationship action queue.

Done when:
- `/app/followups` leads with the next task and why it is timely.
- `/app/chat` leads with the conversation summary, suggested reply, and explicit review boundary.
- Draft/rewrite/summary mock behavior is explained as a safe preview, not as provider plumbing.
- Mobile screenshots show readable controls and no cramped text.

Suggested file boundary:
- `app/(app)/app/followups/page.tsx`
- `app/(app)/app/chat/page.tsx`
- `tests/pages/app-followups-page.test.tsx`
- `tests/pages/app-chat-page.test.tsx`

### Sprint 79 - Dashboard And Agent Product Polish

Goal: Make dashboard and agent routes feel like product command surfaces rather than audit consoles.

Done when:
- `/app/dashboard` presents relationship health, gaps, opportunities, and provenance readiness in
  user terms.
- `/app/agent` presents review-before-action controls with clear outcome copy.
- Technical audit IDs are hidden in details; visible provenance is readable.
- The agent route makes external side-effect safety obvious without sounding like harness output.

Suggested file boundary:
- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/**`
- `app/(app)/app/agent/page.tsx`
- `app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/**`
- `tests/pages/app-dashboard-page.test.tsx`
- `tests/pages/app-agent-page.test.tsx`

### Sprint 80 - Responsive Accessibility And Screenshot QA Pack

Goal: Add a product-level visual QA gate for the mock PoC without changing capability behavior.

Done when:
- The QA script or test matrix covers primary `/app/**` routes at mobile, tablet, and desktop.
- It flags horizontal overflow, overlapping text, unlabeled controls, missing headings, and raw
  implementation vocabulary in primary copy.
- Screenshots and browser evidence remain under `harness-state/runs`, not `repos/orbits`.
- A concise demo acceptance guide explains what to click for a stakeholder walkthrough.

Suggested file boundary:
- `tests/integration/product-visual-qa.test.tsx`
- `scripts/product-demo-acceptance.md`
- `docs/productization/PRODUCT_UI_QA.md`
