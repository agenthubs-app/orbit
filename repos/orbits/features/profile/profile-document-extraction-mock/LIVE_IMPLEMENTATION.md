# Profile Document Extraction Mock Live Implementation

## Live Service And Provider Files

- Keep `features/profile/extraction-contract.ts` as the shared DTO and error-code contract for resume and business-card extraction.
- Keep `features/profile/mock-extraction-service.ts` as the mock boundary used by tests, dev routes, and demos.
- Add a live service beside the mock service, for example `features/profile/live-extraction-service.ts`, that implements the same `ProfileDocumentExtractionService` interface.
- Add provider adapters under this capability folder, for example `features/profile/profile-document-extraction-mock/providers/ocr-provider.ts`, `pdf-parser-provider.ts`, and `profile-extractor-provider.ts`.
- The route handlers `app/api/profile/extractions/resume/route.ts` and `app/api/profile/extractions/business-card/route.ts` must continue to return the shared API envelope.

## Switch Mechanism

- Route handlers should resolve a service through the existing feature-mode pattern.
- `mock` mode must keep using `createMockProfileDocumentExtractionService()`.
- `hybrid` mode may run the mock service while logging that live extraction is unavailable.
- `live` mode may call the live service only after provider adapters, replacement tests, and privacy review exist.
- The switch must stay explicit. Pages and route handlers should not import provider adapters directly.

## Required Env Vars And Permissions

- `ORBIT_PROFILE_OCR_PROVIDER` identifies the OCR adapter for image-based business cards.
- `ORBIT_PROFILE_PDF_PROVIDER` identifies the resume PDF parser.
- `ORBIT_PROFILE_EXTRACTION_PROVIDER` identifies the structured profile extraction adapter.
- `ORBIT_PROFILE_EXTRACTION_API_KEY` or provider-specific credentials must stay outside source control.
- Live business-card image access requires explicit user upload consent.
- Live resume parsing requires explicit user upload consent and a retention policy before any storage is added.

## Privacy And Provenance Constraints

- Every extracted field must preserve source and evidence provenance, including document type, upload consent, extraction provider, provider timestamp, and field-level evidence excerpts when available.
- Live services must not store raw resumes or card images unless a separate retention permission exists.
- Sensitive fields such as phone numbers and email addresses must be scoped to the onboarding draft until the user confirms them.
- Failures must return controlled API envelopes and must not expose raw provider errors, secrets, or document contents.
- Replacement code must preserve source and evidence provenance for each draft returned to onboarding.

## Replacement Tests

- Keep `tests/capabilities/profile-document-extraction-mock.test.ts` as the mock boundary test.
- Add live-service contract tests that assert the live implementation satisfies `ProfileDocumentExtractionService`.
- Add route tests for `app/api/profile/extractions/resume/route.ts` and `app/api/profile/extractions/business-card/route.ts` in mock, hybrid, and live modes.
- Add provider adapter tests with fixture documents and no real network access by default.
- Add privacy tests that confirm raw document content and provider errors are not returned in API envelopes.
