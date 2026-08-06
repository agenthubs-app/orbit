# Root Home Routing

Orbit keeps three home-like routes on purpose:

- `/` is the public product entry. It starts with Orbit Agent, then shows activity and event context drawn from source-backed local data. It is render-only and keeps no-write live safety: no messages, notifications, calendar writes, CRM writes, or outside provider calls happen during render.
- `/app/home` is the signed-in personal console. It uses the live-capable Home route model and may show fail-closed state UI when live storage is not configured. A signed-in visit to `/app` redirects here, so the console — identity, live-event hero, event cards, schedule/contact reminders, and the floating iOrbit ask bar — is the post-login home; the starfield at `/app` remains anonymous-only.
- `/app/home/events` is the personal events list. It stays focused on the user's registered or historical events.

The public starfield entry and every `/app/**` product page share the same
`OrbitTopNav` DOM, typography, grid geometry, language controls, account state,
mobile disclosure, and `640px` navigation breakpoint. The starfield passes
`tone="starfield"` only to remap colors, glass opacity, and the logo glow; it
must not reintroduce a separate `#skNav`, copy navigation links into the scene
trees, or duplicate navigation spacing in inline styles. Both `/` and `/app`
mount the product stylesheet required by this shared shell; `/` additionally
mounts the language and session providers that `/app` receives from its layout.

Do not point `/` back at `/app/home`, `/app/home/events`, or the `/app` personal adapter. The root page should prove the integrated Orbit workflow first: Agent context, recent relationship activity, then event context with links into `/app/events` and `/app/contacts`.

Root event links must use each event view model's stable `id`, not the compact display `code`; compact codes can collide after source-prefix normalization. Contact links on `/` should name the person-specific relationship context action, and event summaries should show only the active UI language instead of exposing bundled `JA:`, `ZH:`, and `EN:` source text.
