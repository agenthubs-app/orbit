# Agent feedback and outcome learning

Agent feedback is explicit, actor-scoped product data. Orbit never infers a
rating or business outcome from conversation text.

- `helpful` and `not_relevant` describe recommendation quality.
- `contacted`, `meeting_booked`, and `goal_advanced` describe downstream
  business results.
- One record is upserted per Run so an outcome can be added after a rating.
- Records retain source modules and evidence IDs from the reviewed result.
- The user can inspect or delete every learning record.

Recent records are summarized into a server-trusted planner input. They are
weak personalization signals only: current requests, source evidence, privacy,
confirmation, permissions, and tool allowlists always take precedence.
