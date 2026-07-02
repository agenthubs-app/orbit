# Orbit iOS App Goal 4: Orbit AI Send Message Plan

**Goal:** Make the Orbit AI tab an active assistant inbox by allowing the mobile app to send a user message to `/api/ai/conversations` and render the assistant response or controlled failure.

**Scope:**

- Add conversation payload mapper tests for assistant reply, messages, and proposed tool intents.
- Add a mobile chat composer to the Orbit AI screen.
- POST user messages through the existing Orbit API envelope client.
- Use the runtime server address provider.
- Render sending, success, validation, offline, and failure states.

**Out of scope:**

- Streaming responses, push notifications, proactive background scheduling, tool confirmation execution, auth, and persisted local chat cache.
- Any direct feature-service import or `repos/orbits` code change.

## Tasks

- [ ] Add failing tests for Orbit AI conversation payload mapping.
- [ ] Implement chat view-model mapping.
- [ ] Add message composer and POST flow to `AiScreen`.
- [ ] Run tests, typecheck, Expo config, and screenshot verification.
- [ ] Commit focused implementation and docs updates.
