# App Shell Mock-To-Live Replacement

## live service/provider files

- `app/(app)/app/layout.tsx` owns the workspace identity, source posture, route labels, shell actions, compact status row, and contact-intake recovery links for the current demo workspace.
- `shared/ui/app-shell.tsx` renders those typed props and does not fetch account, contact, or runtime state.
- Future live account/session data should come from the account capability service boundary, not from route-local UI code.

## switch from mock to live

- Replace the static `appShellAccountSummary`, `appShellTopActions`, `appShellRuntimeStatus`, and route-support link values in `app/(app)/app/layout.tsx` with values returned by the approved account/session bootstrap service and live acquisition router.
- Keep the `AppShell` prop contract stable so product routes continue to consume one shared workspace identity.
- Keep `/app/contacts/new` as the primary source-intake destination unless the live acquisition router changes through a later sprint contract.

## required env vars or permissions

- Live account identity will require the account/session provider configuration approved by the auth sprint that introduces it.
- Live source posture may require contact, calendar, email, or event-roster permissions, depending on which provider is enabled.
- This sprint does not add new env vars, credentials, permissions, or provider setup.

## privacy/provenance constraints

- The shell may show only high-level workspace identity, working context, and source posture.
- Runtime mode, demo state, and provider details must stay in the compact disclosure instead of becoming the primary page narrative; the visible compact row may state only the privacy boundary and source review posture.
- Route examples should remain explicitly labeled as sample records inside the shared workspace until live account data owns those records.
- Live source posture must name the data origin and review state without exposing private contact, email, calendar, or conversation content.

## replacement tests

- Keep `tests/ui/app-shell.test.tsx` for the typed shell contract, single workspace identity, sample-record scope note, outcome navigation labels, primary CTA target, contact-intake recovery labels, and compact runtime disclosure.
- Keep `tests/pages/app-page.test.tsx` for `/app` composition, the `/app/contacts/new` target route, layout wiring, compact privacy row, and contact-intake recovery labels.
- Add live-provider tests in the account/session capability when static layout values are replaced by a real service.
