# Contact needs ranking

`GET /api/contacts/needs-matches` ranks the authenticated actor's complete contact list against the current `profile.relationshipGoal`. The endpoint is read-only and deterministic. It does not call an AI provider, reuse relationship value scores, write contact state, or accept an actor ID from the client.

`needs-lexical-v1` extracts explicit location, industry, and capability conditions from Chinese, Japanese, or English text, then adds remaining meaningful keywords. Each condition has equal weight. A contact receives a numeric score only when its stored fields can assess every extracted condition; missing required fields produce `score: null` and `insufficient_data`. A complete non-match may receive zero. This score describes stored-data relevance to the current need, not a person's value or a probability of success.

The service reads the profile before and after the contact query. A changed goal/version fails with conflict so a response never combines old scores with a new goal. `goalVersion`, canonical `dataVersion`, and `scoringVersion` bind every response. Contact order, timestamps, and the existing relationship score do not affect `dataVersion`; scoring evidence does.

Known limitation: negated or exclusionary free text returns `needs_clarification` rather than reversing a condition. The client should show the extracted conditions and evidence so the user can inspect the basis.
