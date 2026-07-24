# Orbit AI New-Chat Default and Product Light Theme Design

## Goal

Make `/app/agent` open as a fresh conversation unless the user explicitly selects a saved session, and make the light appearance of Orbit product pages use the clean white color system established by `/app/agent`.

## Scope

- Change the initial state of `/app/agent`.
- Change light-theme color tokens for Orbit product surfaces.
- Preserve the existing dark theme and theme toggle.
- Preserve the current authentication UI. Login, sign-up, and forgot-password share the same authentication component, so the complete authentication family remains on its existing palette.
- Preserve the current layout, information hierarchy, interactions, and data services of non-Agent pages.

## Non-goals

- No dark-theme redesign.
- No layout redesign for events, contacts, dashboard, schedule, party, or admin pages.
- No changes to authentication behavior or authentication-page presentation.
- No changes to conversation persistence, history ordering, pinning, renaming, deletion, or sidebar resizing.

## Conversation Initialization

Opening `/app/agent` without a `session` query parameter starts with:

- no active session;
- no messages or result panel;
- the existing welcome and suggestion state;
- the saved conversation list loaded in the history sidebar.

Opening `/app/agent?session=<id>` or selecting an item in conversation history restores that explicit session. The URL remains the durable representation of the selected session.

Opening `/app/agent?q=<query>` starts a fresh conversation and immediately sends the requested query, as it does today.

The previous active-session `localStorage` fallback is removed from initial routing. A plain `/app/agent` refresh therefore starts a new conversation even if the user previously had an active session. Saved sessions remain available through the sessions API and history sidebar.

If a requested session cannot be loaded, the page falls back to the fresh-conversation state while retaining any history records that did load. It must not silently restore a different or most-recent session.

## Light Theme Architecture

The existing theme initialization, `html[data-theme]` boundary, local preference, and theme toggle remain unchanged.

For `html[data-theme="light"]`, normal product surfaces adopt the Agent light palette:

| Token role | Value |
| --- | --- |
| Canvas and primary surface | `#FFFFFF` |
| Primary ink | `#171A1C` |
| Body text | `#2B3034` |
| Muted text | `#687078` |
| Hairline | `#E6E9EB` |
| Stronger border | `#D9DEE1` |
| Secondary surface | `#F7F8F8` |
| Tertiary surface | `#F1F3F3` |
| Signal/accent | `#176A73` |
| Signal-soft background | `#EEF7F6` |

The shared light-theme token layer owns this mapping. Individual pages continue to consume semantic variables such as `--bg`, `--surface`, `--text`, `--border`, and `--accent`; they do not receive page-specific color patches.

The Agent-only presentation rules remain scoped to `[data-orbit-real-page="agent"]`. Chat bubble flattening, transcript sizing, composer treatment, and history-row styling are not generalized to other pages.

The authentication component receives an explicit theme exclusion or legacy light-token scope. This prevents the shared product token update from changing `.orbit-account-auth-page` in login, sign-up, and forgot-password routes. Dark-theme selectors and token values are not modified.

## Visual Behavior

In light mode:

- page canvases and major chrome are white;
- hierarchy comes from typography, spacing, hairlines, and restrained secondary surfaces rather than tinted page backgrounds or shadows;
- cards use white or subtle neutral surfaces with quiet borders;
- the existing teal signal color remains the primary action and focus color;
- status colors retain their semantic meaning.

This is a color-system update, not a component or page-layout redesign.

## Accessibility

- Existing focus-visible treatment remains present and uses the signal-color ring.
- Text and border token choices must retain readable contrast on white.
- Disabled, error, warning, success, and selected states remain distinguishable without relying only on background tint.
- The theme toggle remains keyboard accessible and continues to announce the target theme.

## Testing

Automated coverage will verify:

- a plain `/app/agent` initialization does not consult the active-session storage key;
- an explicit `session` query parameter still restores a saved session;
- history loading and all existing history controls remain present;
- the light product token layer uses the approved white palette;
- authentication pages retain a separate/excluded light-theme scope;
- dark-theme defaults and the theme toggle remain intact.

Focused page and theme tests run first. The complete relevant test suite and production build run before implementation is committed. Browser screenshots in light mode will compare `/app/agent` with representative product pages and confirm that the login page is visually unchanged.

## Success Criteria

- Visiting or refreshing `/app/agent` without `session` displays a fresh conversation.
- Selecting a saved history entry restores that exact conversation.
- Light-mode product pages visibly share the white Agent palette.
- Dark mode behaves and looks as before.
- Login, sign-up, and forgot-password UI styling remains unchanged.
- Existing page behavior and conversation-history operations continue to pass their tests.
