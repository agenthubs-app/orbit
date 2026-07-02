# Orbit iOS App Goal 3: Runtime Server Settings Plan

**Goal:** Let the iOS-first app switch Orbit API server addresses at runtime, so simulator, physical iPhone, and remote API testing do not require code changes.

**Scope:**

- Add pure base URL normalization and validation utilities.
- Persist the selected server address on device.
- Wrap the app in a server-address provider.
- Make API resource hooks use the current provider value.
- Replace the read-only Settings screen with a controlled server-address editor.
- Verify tests, typecheck, Expo config, and screenshots.

**Out of scope:**

- Auth, account switching, secrets, production environment management, and remote database migrations.
- Direct database/storage access from mobile.
- Any changes inside `repos/orbits`.

## Tasks

- [ ] Add failing tests for base URL normalization and validation.
- [ ] Implement base URL utilities and update `createOrbitApiClient`.
- [ ] Add AsyncStorage-backed provider for server address state.
- [ ] Wrap root layout and update `useApiResource` to use provider base URL.
- [ ] Implement editable server settings screen.
- [ ] Run `npm test`, `npm run typecheck`, `npx expo config --type public`, and screenshot verification.
- [ ] Commit in focused steps.
