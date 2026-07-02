# Orbit iOS App Design

## Goal

Create `repos/orbit-app` as the iOS-first mobile client for Orbit. The app
converts the existing Orbit web product into a native mobile experience while
keeping `repos/orbits` as the web app, API host, feature-service runtime, and
live storage boundary.

The first implementation target is iOS only. Android and mobile web are outside
the initial scope, but the architecture should not make them impossible later.

## Approved Direction

Use an independent Expo app in `repos/orbit-app`.

```text
repos/orbit-app iOS screens
  -> mobile API client
  -> repos/orbits /api/**
  -> feature service factories
  -> mock / hybrid / live providers
  -> shared storage, AI providers, and feature-owned contracts
```

Rejected alternatives:

- Do not wrap the existing web app in a WebView. That would carry over web
  layout, cache, and responsive-state bugs into the app and would not create a
  native iOS product.
- Do not immediately convert the root repository into a JavaScript monorepo
  with shared packages. Type sharing is valuable later, but doing that before a
  working mobile client would add build-system risk while `repos/orbits` still
  has active uncommitted work.
- Do not let the mobile app read Postgres, Supabase, `orbit_records`, or local
  web storage directly. Storage ownership stays behind `repos/orbits` API and
  feature service boundaries.

## Technology Baseline

- Expo app created from the current `create-expo-app` default TypeScript
  template.
- Expo Router for file-based navigation and route grouping.
- React Native + TypeScript for screens and reusable mobile components.
- Expo app config for iOS bundle identity, scheme, app icon, splash screen,
  future camera permissions, push notifications, and deep links.
- Development builds when native capabilities are introduced; Expo Go can be
  used only while the app depends on Expo Go-compatible modules.

Reference docs checked on 2026-07-03:

- `https://docs.expo.dev/more/create-expo/`
- `https://docs.expo.dev/router/introduction/`
- `https://docs.expo.dev/router/advanced/tabs/`
- `https://docs.expo.dev/workflow/configuration/`
- `https://docs.expo.dev/develop/development-builds/introduction/`
- `https://reactnative.dev/docs/typescript`

## Product Position

Orbit on mobile is not a smaller dashboard. It is the user's relationship
manager in their pocket. The product center of gravity is Orbit AI as a
relationship steward:

- The Orbit AI chat window is the single assistant inbox.
- Proactive relationship reminders appear as Orbit AI assistant turns, not as a
  separate notification center.
- Native push, when added later, deep-links to the relevant Orbit AI turn or
  product screen.
- Events, contacts, schedule, and profile remain first-class areas, but they are
  optimized for quick mobile decisions rather than desktop scanning.

## Boundaries

### Mobile App Owns

- Native navigation structure, tabs, stacks, deep-link routes, and screen
  transitions.
- Mobile screen view models derived from API payloads.
- Mobile design tokens, components, empty states, loading states, and controlled
  failures.
- Local client state such as selected tab, draft input text, transient request
  state, and later offline cache metadata.
- iOS permissions, camera capture entry points, push registration, and deep-link
  handling when those goals are reached.

### Web/API Repo Owns

- Business facts, feature contracts, service factories, mock/hybrid/live
  provider selection, and live storage mappers.
- API envelopes, runtime mode headers, and fail-closed error semantics.
- Orbit AI planner/runtime, tool registry, artifact generation, safety ledger,
  and proactive-agent policy.
- Storage access to Postgres/Supabase and `orbit_records`.

### Cross-Project Contract

The mobile app consumes HTTP API shapes, not web presenters.

Mobile code may duplicate a narrow subset of DTO TypeScript types during the
first stage. A later shared-contract goal may extract generated or hand-curated
API types, but the first stage must avoid restructuring `repos/orbits`.

## API Strategy

The mobile app starts with a typed fetch wrapper:

```text
mobile screen
  -> orbitApi.get<T>("/api/app/bootstrap")
  -> ApiEnvelope<T>
  -> success data or ApiErrorBody
  -> mobile screen state
```

API client requirements:

- Base URL is configured through `EXPO_PUBLIC_ORBIT_API_BASE_URL`.
- Local default is `http://localhost:3000` for iOS simulator. Device testing
  must use a LAN or tunneled URL.
- Every request sets `Accept: application/json`.
- JSON parsing must tolerate non-JSON responses and return a controlled error.
- `success: false` envelopes become typed failure states instead of thrown UI
  crashes.
- Runtime headers such as `X-Orbit-Feature-Mode` are captured for debugging.
- Mobile screens must not branch on mock, hybrid, or live provider internals.

Initial API targets:

- `GET /api/health`
- `GET /api/app/bootstrap`
- `GET /api/ai/conversations`
- `POST /api/ai/conversations`
- `GET /api/events`
- `GET /api/contacts`
- `GET /api/tasks`
- `GET /api/profile`

## Navigation Model

Use Expo Router route groups:

```text
app/
  _layout.tsx
  index.tsx
  (tabs)/
    _layout.tsx
    ai.tsx
    events.tsx
    contacts.tsx
    schedule.tsx
    profile.tsx
  events/
    [id].tsx
  contacts/
    [id].tsx
  settings/
    api.tsx
```

Initial tabs:

- Orbit AI: assistant inbox, proactive turns, user prompt input, artifact cards.
- Events: upcoming and recent relationship events.
- Contacts: address book and relationship context.
- Schedule: follow-up tasks and reminders.
- Profile: user identity, goals, API/runtime status, and settings link.

The `index.tsx` route redirects to Orbit AI after startup, because mobile Orbit
should open to the steward surface rather than a marketing landing page.

## Mobile Design Direction

The app should feel like a serious relationship operations tool, not a marketing
site. It should be calm, dense enough for repeated use, and optimized for
one-handed iPhone interaction.

Design rules:

- Use native-feeling spacing and safe-area handling.
- Prefer compact cards, segmented controls, icon buttons, and bottom-sheet-like
  surfaces over desktop sidebars.
- Keep cards at 8px radius or less unless a platform primitive requires more.
- Avoid decorative gradients, orbs, bokeh, and hero sections.
- Use Orbit's existing semantic colors as inspiration, but rebuild tokens for
  mobile readability and touch targets.
- Keep text within containers at all supported iPhone widths.
- Do not expose implementation labels such as mock, hybrid, provider, or
  command-center in user-facing copy.

## First Stage Scope

The first stage creates a working iOS app foundation:

- `repos/orbit-app` Expo TypeScript project.
- iOS-only project settings and scripts.
- API client with typed envelope handling.
- Mobile design tokens and base components.
- Tab shell with Orbit AI, Events, Contacts, Schedule, and Profile routes.
- Startup health/API status screen behavior.
- Minimal data-backed screens that call existing Orbit APIs and render
  controlled success, loading, empty, and failure states.
- Tests for API envelope parsing, route state mapping, and basic component
  rendering.
- Documentation explaining how to run the mobile app against local
  `repos/orbits`.

The first stage does not include camera scanning, push notifications, offline
sync, auth hardening, TestFlight release, or complete parity for every web
route. Those become later goals.

## Long-Term Goal Breakdown

### Goal 1: Mobile Design And Architecture Baseline

Write this design and the implementation plan. Establish that `repos/orbit-app`
is independent, iOS-first, API-driven, and not a WebView.

Success evidence:

- Design doc exists.
- Implementation plan exists.
- The plan references exact first-stage files, scripts, tests, and verification
  commands.

### Goal 2: Expo iOS Project Scaffold

Create the app skeleton with Expo Router, TypeScript, iOS app config, lint/type
scripts, and a short README.

Success evidence:

- `repos/orbit-app/package.json` has runnable scripts.
- `repos/orbit-app/app.json` or `app.config.ts` declares iOS bundle settings and
  scheme.
- `npm run typecheck` passes in `repos/orbit-app`.

### Goal 3: API Client And Runtime Status

Build the shared API client and a runtime status surface that proves the app can
talk to `repos/orbits`.

Success evidence:

- Unit tests cover success envelopes, failure envelopes, non-JSON responses, and
  network failures.
- The app can call `/api/health` and `/api/app/bootstrap`.
- Runtime headers are visible in a developer/status screen, not in normal user
  copy.

### Goal 4: Mobile App Shell

Implement tab navigation and shared layout primitives.

Success evidence:

- iOS simulator opens to Orbit AI.
- Tabs navigate without reload or web dependencies.
- Snapshot or screenshot verification shows the shell fits common iPhone widths.

### Goal 5: Orbit AI Mobile Chat

Connect the mobile Orbit AI tab to `/api/ai/conversations`.

Success evidence:

- Conversation list loads.
- Sending a prompt posts to the API and renders assistant responses.
- Proactive assistant-turn shape is accepted by the message renderer.
- Confirmation-required artifact actions are displayed as review-only controls.

### Goal 6: Events Mobile

Implement event list and event detail screens backed by existing API routes.

Success evidence:

- Events list loads from `/api/events`.
- Event detail loads from `/api/events/[id]`.
- Controlled failure appears when live storage is unconfigured.

### Goal 7: Contacts Mobile

Implement contacts list, search, and contact detail screens.

Success evidence:

- Contacts list loads from `/api/contacts`.
- Search calls existing search/list behavior without local-only filtering that
  changes backend semantics.
- Contact detail renders evidence-backed relationship context.

### Goal 8: Schedule And Followups Mobile

Implement follow-up task and reminder views.

Success evidence:

- Schedule screen loads tasks from `/api/tasks`.
- Reminder and message-draft affordances remain confirmation-gated.

### Goal 9: Profile And Settings

Implement profile summary, relationship goal display, and API environment
settings.

Success evidence:

- Profile loads from `/api/profile`.
- Base URL configuration is visible and testable in development builds.
- User-facing copy does not expose provider internals.

### Goal 10: Native Acquisition

Add native camera-oriented entry points for business card capture and QR scan.

Success evidence:

- iOS permission copy is explicit.
- Capture results are routed through existing acquisition APIs.
- No contact is created without review/confirmation.

### Goal 11: Native Proactive Delivery

Add push registration and deep-link handling.

Success evidence:

- Push notification content deep-links to Orbit AI or a relevant product screen.
- Notifications do not become a separate content inbox.
- Quiet hours and permission state remain owned by the notification boundary.

### Goal 12: Release Readiness

Prepare development build, TestFlight configuration, regression screenshots, and
release gates.

Success evidence:

- EAS build configuration exists.
- iOS simulator and device smoke checks are documented.
- Screenshot verification covers shell, Orbit AI, Events, Contacts, Schedule,
  and Profile.

## Error Handling

Mobile screens use explicit route states:

- `loading`
- `success`
- `empty`
- `failure`
- `offline`

Failures show what failed and one recovery action. They must not claim the app
completed an action when the API only returned a preview or confirmation-required
artifact.

## Testing Strategy

First stage tests:

- API client unit tests.
- View-model mapper tests for bootstrap, conversations, events, contacts, tasks,
  and profile summaries.
- Component tests for route states and tab shell where practical.
- TypeScript checks for every first-stage file.

Later tests:

- iOS simulator screenshot checks for common viewport sizes.
- API contract drift checks against representative `repos/orbits` responses.
- Deep-link and push routing tests when native notification work begins.

## Operational Notes

Local development usually needs two processes:

```bash
cd repos/orbits
ORBIT_MODULE_MODE=live npm run dev
```

```bash
cd repos/orbit-app
EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npm run ios
```

For physical iPhone testing, `localhost` points at the device, not the Mac. Use
the Mac LAN address or a tunnel URL as `EXPO_PUBLIC_ORBIT_API_BASE_URL`.

## Open Risks

- API payload shapes are not currently generated into a shared client package.
  The first stage should duplicate only narrow mobile-facing types. A later
  shared-contract goal can extract stable API DTOs.
- Authentication is currently not the first-stage focus. The first app shell can
  run against the same local/dev assumptions as the web API, but production
  mobile auth must become its own goal.
- `repos/orbits` has active uncommitted work. Mobile implementation must avoid
  editing or reverting those files unless a later task explicitly requires a web
  API change.
- Expo native tabs are currently alpha in the official docs, so the first stage
  should use stable JavaScript tabs rather than alpha native tabs.
