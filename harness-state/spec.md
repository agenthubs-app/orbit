# SPEC: Orbit

## Product Execution Summary
Orbit is a participant-facing workspace for people who build, keep, and activate real human relationships (founders, BD, consultants, event-heavy operators). Sprint 69 turns the existing mock-backed `/app/**` route hierarchy into one coherent Orbit product shell: a single persistent active demo workspace identity, navigation labels written as user outcomes, a primary "add source" CTA that resolves to the contacts intake route, a compact secondary runtime/demo status indicator, and a desktop/mobile layout that does not overlap, truncate button text, or leave nav labels empty. No new backend capability behavior is added.

## Implementation Principles
- One persistent demo workspace identity must be visible across every `/app/**` route (name, initials, working context, source posture). It is supplied by the layout once and consumed by the shell, never re-derived per route.
- Primary navigation copy must describe what the user gets ("Relationship cockpit", "People", "Events", "Follow-ups", "Conversations", "Relationship health", "Next moves") instead of internal module names.
- The primary "add source" CTA must be labelled to match its destination and resolve to `/app/contacts/new`; it must be the single most prominent action above the fold on the home route.
- Runtime/demo status must be a compact secondary disclosure (badge or details disclosure), not the main narrative.
- Mock and runtime language is hidden in expandable details; user-facing copy stays outcome-oriented.
- No new backend capability behavior. The existing mock services remain the source of truth; the shell only changes presentation and route hierarchy.
- All changes are narrow to the file boundary; shared files outside the boundary must not be edited.

## Technical Boundaries
- Target repo: `repos/orbits`
- Reference-only repo: `repos/tokyo-business-connect` (visual/interaction reference; do not edit, do not copy)
- App stack: Next.js App Router, React, TypeScript, the existing `shared/ui` primitives and theme
- API envelope: unchanged; no new API routes, no new mock service behavior
- Mock/live boundary: existing mock services continue to back `/app/**`; this sprint is purely a shell/navigation pass
- Artifact roots: `harness-state/`, `harness-logs/` only; no screenshots, fixtures, or reports inside `repos/orbits`
- Explicit non-goals: new backend capability; new product data sources; new pages beyond the shell; copy rewrites for `/app/**` pages beyond the shell composition; introducing any auth provider; changing the underlying mock service contracts

## Sprint Execution Boundary

`harness-state/spec.md` is intentionally a concise execution overview. Do not use it as the source of detailed sprint implementation requirements. Use `harness-state/contracts/contract-sprint-N.json` as the authoritative contract for each sprint, including success criteria, evidence, file boundaries, and mock-to-live replacement docs. Use `harness-state/sprints.md` only as a human-readable sprint index.