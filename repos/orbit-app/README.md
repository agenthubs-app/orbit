# Orbit App

Orbit App is the iOS-first mobile client for Orbit. It is an independent Expo
app that talks to the existing `repos/orbits` HTTP API.

## Run Locally

Start the web/API server:

```bash
cd ../orbits
ORBIT_MODULE_MODE=live npm run dev
```

Start the iOS app:

```bash
cd ../orbit-app
EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npm run ios
```

For a physical iPhone, use the Mac LAN address instead of `localhost`.

The local default is `http://localhost:3000`, which works for the iOS
simulator. Set `EXPO_PUBLIC_ORBIT_API_BASE_URL` whenever the app should point
at a different Orbit server.

## Scripts

- `npm run ios`: start Expo and open iOS simulator.
- `npm run start`: start Expo without choosing a target.
- `npm run typecheck`: run TypeScript.
- `npm test`: run Node tests through `tsx`.

## Boundaries

- The app consumes `/api/**` routes from `repos/orbits`.
- The app does not import Next.js pages or feature services.
- The app does not read Postgres, Supabase, `orbit_records`, or web localStorage.
- Orbit AI remains the single assistant inbox, including proactive turns.

## First Screens

- Orbit AI: reads `/api/ai/conversations`.
- Events: reads `/api/events`.
- Contacts: reads `/api/contacts`.
- Schedule: reads `/api/tasks` and shows actionable follow-up context.
- Profile: reads `/api/profile`.

Each screen renders loading, empty, offline, failure, and success states through
the shared Orbit API envelope client.

Orbit AI also reads `/api/app/bootstrap` to show the startup relationship
summary above the composer.

Events and Contacts cards navigate to API-backed detail screens. List and
detail screens support pull-to-refresh through the same envelope client.

The Server screen can save a runtime Orbit server address on device. This is
useful when moving from the iOS simulator to a physical iPhone or a remote API
server.
The Server screen can check `/api/health` before saving a local, LAN, or remote
API address.

Orbit AI includes a message composer that posts to `/api/ai/conversations` and
renders the latest assistant reply or a controlled error state.
