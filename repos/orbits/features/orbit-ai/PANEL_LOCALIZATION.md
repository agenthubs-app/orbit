# Orbit AI Panel Localization

Sprint 92 centralizes user-facing copy for Orbit AI right-side result panels in
`features/orbit-ai/panel-localization.ts`. Product pages pass the active Orbit
language into this helper before panel payloads are rendered.
Client presenters import the app-local `/app/agent` panel localization adapter;
that adapter delegates to this feature-owned table so React UI files do not
import Orbit AI feature modules directly.

## Namespaces

- `panel`: generic panel titles, artifact kind labels, status labels, result
  fallbacks, and panel empty states.
- `artifact`: artifact presentation titles, section headings, summaries, and
  next-action copy for contact, event, follow-up, chat-context, and to-do
  results.
- `metadata`: visible metadata labels such as contact, event, source, score,
  privacy, timing, due date, evidence, and time-zone fields.
- `actions`: visible action names and confirmation affordances such as review
  contact, review event, preview add to calendar, cancel, and unavailable
  confirmation states.
- `confidence`: confidence and priority copy shown inside chips.
- `calendar`: calendar-action preview copy, source labels, local-only boundary
  text, and no-side-effect recovery text.
- `proactive`: proactive calendar reminder copy, activity context, people
  context, preparation prompts, and local calendar source labels.
- `conversation`: assistant result text fragments, evidence snippets,
  user-facing source labels such as profile-fit and schedule-timing evidence,
  and source-context values that can appear inside generated panel bodies.
- `recovery`: recoverable assistant errors, empty states, and no-message
  fallback text.

## Fallback Behavior

When a missing translation key is encountered, the helper returns the original
string. This keeps provider output visible instead of silently dropping text.
Technical provenance is intentionally not translated: ids, route paths,
evidence ids, provider names, task ids, tool names, source ids, timestamps, and
record ids remain unchanged.

Live provider replacement should add new user-facing phrases to the appropriate
namespace before exposing them in `/app/agent`. If a live provider returns
untranslated product copy in Chinese mode, tests should cover that phrase here
instead of adding page-local string fixes.
