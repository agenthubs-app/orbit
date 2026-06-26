# Orbit AI Reference Redesign Sprints

## Goal

Redesign the `/app` Orbit AI entry and the primary product pages around
`docs/designs/orbit-ui-reference.html`, keeping Chinese as the primary language
and keeping all product behavior behind the existing mock-first service
contracts.

## Reference Signals

- Visual shell: dark canvas `#16181D`, white functional panels, teal active state `#6FE3C0`, restrained gray copy, compact radius, dense operational layout.
- Product structure: left vertical navigation, center AI chat console, right functional stage, and module workspaces on the same dark shell.
- Interaction model: chat opens concrete panels for people, events, follow-ups, schedule, relationship health, and review queue.
- Safety model: every outward action remains draft/review only; source and evidence stay visible.
- Language model: Chinese is primary; English remains available as a secondary option.

## Sprint R1: Reference Capture And Routing Contract

**Scope**

- Track `docs/designs/orbit-ui-reference.html` in the root repository.
- Preserve the existing service-factory boundary for Orbit AI.
- Extend Orbit AI panel routing with `schedule` so the reference navigation can be represented without adding live providers.
- Treat `/app/contacts/new`, `/app/contacts/[id]`, and `/app/events/[id]`
  as nested module pages rather than falling back to the AI home route.

**Acceptance**

- The reference HTML is committed.
- `OrbitAiPanel` supports `schedule`.
- Prompt keyword routing can open schedule from Chinese or English prompts.
- Existing panels keep their current URLs and no external side effects are added.
- Nested routes keep the correct product navigation active state.

## Sprint R2: Dark Orbit AI Home Shell

**Scope**

- Change `/app` from a light workbench card to a full dark Orbit AI desktop.
- Hide AppShell bottom chip navigation for the `ai-command` variant.
- Add an internal vertical nav inside `OrbitAiCommandCenter`, with Chinese labels and active teal state.

**Acceptance**

- `/app` renders one dark shell with `data-reference-style="orbit-ui-reference"`.
- The old bottom navigation is absent on the AI command experience.
- Vertical nav exposes Orbit AI, 人脉, 活动, 日程, 跟进, 关系健康, 下一步.
- Mobile stacks without horizontal overflow.

## Sprint R3: Product Shell For Module Pages

**Scope**

- Add a shared reference-style product shell for non-home app routes.
- Keep every existing module route and service factory intact:
  `/app/profile`, `/app/contacts`, `/app/contacts/new`,
  `/app/contacts/[id]`, `/app/events`, `/app/events/[id]`,
  `/app/followups`, `/app/chat`, `/app/dashboard`, and `/app/agent`.
- Remap shared UI tokens inside the product shell so existing module surfaces
  inherit the reference gray canvas, white panels, deep primary actions, and
  teal evidence state.
- Add Chinese primary labels and English secondary labels in the product rail.

**Acceptance**

- Non-home app routes render `orbit-app-shell-product` with
  `data-reference-style="orbit-ui-reference"`.
- The product rail links to AI home, profile, people, events, schedule,
  follow-ups, chat, relationship health, and next actions.
- Module pages continue to consume their existing mock-first service factories.
- No module page reintroduces the old bottom chip navigation.

## Sprint R4: Chat Console And Functional Stage

**Scope**

- Rework the center chat as the primary surface.
- Rework the right side into a white functional panel with stage rows, action safety footer, and source chips.
- Add a compact relationship orbit motif that echoes the reference but does not depend on canvas or external assets.

**Acceptance**

- The first viewport reads as a usable AI chat product, not a marketing page.
- Quick commands open functional panels through query params.
- Schedule panel displays timeline-style items and stays review-only.
- Source/evidence details remain visible but secondary.

## Sprint R5: Verification And Delivery

**Scope**

- Update page tests for the reference layout.
- Run `npm test`, `npm run lint`, `npm run build`, and root `uv run pytest`.
- Capture desktop `/app`, desktop product module, and mobile `/app`
  screenshots for visual inspection.
- Commit and push to `git@github-agenthubs.com:agenthubs-app/orbit.git`.

**Acceptance**

- Tests and build pass.
- Screenshot inspection confirms nonblank desktop/mobile render, dark shell,
  left nav, chat console, right functional stage, and reference-style module
  workspace.
- Remote `origin/main` points at the pushed commit.
