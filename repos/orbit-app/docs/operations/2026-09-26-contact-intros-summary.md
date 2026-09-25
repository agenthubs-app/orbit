# Contact introductions summary read

`ContactIntrosScreen` reads `GET /api/contacts/intros/summary` instead of downloading the full contacts and connections collections. The Web endpoint authenticates the actor, scopes rows to that actor and workspace, and returns exact contact/candidate counts plus at most five ranked cards. Private notes, relationship summaries, evidence text, and full records are not part of the response.

The response is a summary only. Invitation preparation still uses the existing invitation endpoint; opening or following a contact link must load its normal detail route. There is no fallback to the previous unbounded collection reads.

When an owner has multiple valid contact records for the same contact ID or multiple valid relationships for that contact, the summary excludes that contact from candidates rather than selecting an arbitrary record. This deliberately resolves the old mismatch where different paths could pick the first or latest relationship.

Focused verification: `tests/services/contact-intros-summary-postgres.test.ts`, `tests/api/contact-intros-summary-route.test.ts`, `tests/contact-intros-screen-source.test.ts`, and the ContactIntros render case in `tests/app-wide-contacts.test.ts`.
