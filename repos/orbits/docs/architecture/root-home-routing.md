# Root Home Routing

Orbit keeps three home-like routes on purpose:

- `/` is the public product entry. It starts with Orbit Agent, then shows activity and event context drawn from source-backed local data. It is render-only and keeps no-write live safety: no messages, notifications, calendar writes, CRM writes, or outside provider calls happen during render.
- `/app/home` is the signed-in personal hub. It uses the live-capable Home route model and may show fail-closed state UI when live storage is not configured.
- `/app/home/events` is the personal events list. It stays focused on the user's registered or historical events.

Do not point `/` back at `/app/home`, `/app/home/events`, or the `/app` personal adapter. The root page should prove the integrated Orbit workflow first: Agent context, recent relationship activity, then event context with links into `/app/events` and `/app/contacts`.

Root event links must use each event view model's stable `id`, not the compact display `code`; compact codes can collide after source-prefix normalization. Contact links on `/` should name the person-specific relationship context action, and event summaries should show only the active UI language instead of exposing bundled `JA:`, `ZH:`, and `EN:` source text.
