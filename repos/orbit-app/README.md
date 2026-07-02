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
