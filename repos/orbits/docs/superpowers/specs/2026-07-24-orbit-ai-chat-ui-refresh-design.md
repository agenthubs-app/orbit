# Orbit AI Chat UI Refresh Design

**Date:** 2026-07-24  
**Status:** Approved through visual direction review  
**Scope:** `/app/agent` and the shared `OrbitRealAgent` chat surface

## Goal

Make Orbit AI feel like a finished, trustworthy chat product without changing what the page does.

The refresh keeps the current interaction model:

- left: resizable conversation history;
- center: welcome state or chat transcript;
- right: artifact-backed contact, event, or follow-up cards;
- bottom: persistent message composer;
- mobile: history drawer and inline result cards.

The work is a visual and presentation-layer change. It does not introduce task management, autonomous-agent timelines, new tools, new routes, new storage, or new API fields.

## Success Criteria

1. The light theme uses a continuous pure-white work surface.
2. The header presents one product identity; the chat page does not add a second competing Orbit wordmark.
3. Normal desktop reading text is 14–16 px. Supporting metadata does not drop below 12 px.
4. Assistant responses read as content rather than large nested white chat bubbles.
5. The right result panel is visually quieter and easier to scan while preserving every current card action and destination.
6. Conversation history, resizing, pinning, renaming, deletion, persistence, copy, send, suggested prompts, and mobile behavior continue to work.
7. Dark theme remains usable; pure white applies to the light-theme presentation and does not disable the existing theme control.
8. Existing page and capability tests pass, with targeted tests added for structural UI contracts where useful.

## Non-Goals

- No task or mission workspace.
- No plan approval, execution timeline, checkpoint, or background-run UI.
- No changes to the conversation, artifact, session, or provider contracts.
- No new evidence, provenance, safety, diagnostic, or tool-call display.
- No changes to ranking, recommendations, model behavior, or response content.
- No redesign of the global navigation or other Orbit pages.

## Research Basis

Successful agent products consistently separate the conversational control surface from substantial results, make generated output easy to review, and preserve user control. Orbit already has the correct high-level composition: conversation in the center and structured results in a separate panel. The issue is presentation, not information architecture.

The selected approach therefore follows the conservative `Conversation+` direction:

- preserve the current chat-first mental model;
- strengthen hierarchy through typography and spacing;
- keep structured result cards separate from prose;
- use visual restraint instead of adding agent-management concepts.

## Visual Direction

### Palette

Light theme:

- canvas and primary surfaces: `#FFFFFF`;
- primary ink: near-black neutral;
- secondary text: neutral gray;
- separators: light neutral gray;
- Orbit signal: one restrained blue-green accent already compatible with the existing identity.

Colored backgrounds, purple ambient glows, large gradients, and floating glass effects are excluded from the chat workspace. Accent color is reserved for:

- active history state;
- assistant mark;
- focus and selected states;
- progress/match indicators;
- text links and primary card actions.

Dark theme continues to use the existing token system and is adjusted only where the refreshed hierarchy requires sufficient contrast.

### Typography

- chat body and user messages: 15 px with 1.65 line height;
- composer: 15 px;
- navigation and history: 13–14 px;
- panel/card titles: 14–16 px;
- metadata and labels: 12–13 px;
- match score: 18–20 px.

Assistant markdown keeps sensible spacing between paragraphs and lists. Long replies use a readable maximum line length.

### Surfaces

- one continuous white canvas in light mode;
- columns separated by 1 px hairlines;
- flat cards with subtle neutral borders;
- 6–10 px radii;
- no decorative drop shadows on transcript messages or result cards;
- the composer uses a neutral border without a drop shadow.

## Desktop States

### Empty State

Preserve the current welcome copy, assistant mark, three suggested prompts, history column, and bottom composer.

Changes:

- reduce excess empty space;
- use a smaller, flat assistant mark;
- make prompt suggestions quieter and easier to scan;
- use normal-sized type;
- keep the composer visually connected to the transcript rather than appearing as a floating hero card.

The result panel remains absent until the current behavior supplies a panel.

### Conversation State

User messages remain compact, right-aligned bubbles.

Assistant messages:

- keep the existing assistant icon and copy action;
- remove the heavy bordered white bubble;
- render markdown directly on the white transcript canvas;
- use spacing, text width, and a quiet action row to establish hierarchy.

The existing `note` state remains available and keeps its warning semantics.

### Thinking State

Keep the current timing and state behavior. Only restyle the indicator:

- no white bubble container;
- assistant mark aligned with the transcript;
- clear 14 px status copy;
- restrained animated dots;
- reduced-motion preference respected by the existing global motion policy.

No attempt is made to convert the timed phases into real execution progress.

### Result Panel

Keep the current 444 px desktop panel width and current conditional rendering.

Panel changes:

- pure white background and simple header;
- normal-sized heading and helper text;
- flat cards with lighter borders;
- clearer hierarchy for identity, match score, status, reason, suggested action, and destination;
- preserve current click targets, navigation destinations, metadata, and list ordering.

### Composer

Keep Enter-to-send, Shift+Enter, disabled state, value state, and send button behavior.

Changes:

- 15 px input text;
- 8–10 px radius;
- neutral border and visible focus state;
- remove the oversized violet shadow;
- simplify the `iOrbit` capability label;
- maintain at least a 40 px send target.

## Mobile

Mobile retains:

- the existing top navigation;
- history drawer;
- inline result cards after assistant messages;
- bottom composer;
- all current close, navigation, and history actions.

The mobile refresh uses the same white, flat, normal-sized visual language. It does not add another navigation layer or move functionality.

## Component Boundaries

Primary implementation file:

- `app/(app)/app/agent/orbit-real-agent.tsx`

Shared visual tokens and responsive rules:

- `app/(app)/app/orbit-reference-styles.tsx`

Expected presentation-only component touch points:

- `AgentWelcome`
- `AgentMessageCopyButton`
- `AgentHistoryList`
- `AgentPeopleCard`
- `AgentEventCard`
- `AgentTodoCard`
- `ChatBox`
- `ThinkingIndicator`
- `OrbitRealAgent`

The API request, artifact mapping, session persistence, navigation handlers, and view-model contracts remain unchanged.

## Accessibility

- preserve semantic buttons and existing accessible labels;
- maintain visible keyboard focus;
- retain minimum hit-area expectations for primary controls;
- do not convey active, match, or status information by color alone;
- keep text contrast at WCAG AA levels in light and dark themes;
- preserve reduced-motion behavior.

## Verification

1. Run targeted component/page tests for Orbit Agent history, message copy, conversation rendering, and artifact panels.
2. Run TypeScript checks that cover the edited page and shared styles.
3. Verify the following manually or with screenshots at representative sizes:
   - desktop empty state;
   - desktop conversation without a result panel;
   - desktop conversation with contact/event/follow-up panel;
   - resizable history sidebar;
   - mobile empty and conversation states;
   - mobile history drawer;
   - light and dark themes.
4. Compare before/after behavior for send, copy, suggestions, history selection, rename, pin, delete, card navigation, and session persistence.

## Acceptance Boundary

If implementation requires changing a conversation/artifact contract, changing a route, or adding a new behavioral state, it is outside this refresh and must not be included.
