# AI Provider Mock and Provenance Boundary Live Implementation

## Live service/provider files

- Keep the public contract in `shared/ai/provider.ts`.
- Keep provenance helpers in `shared/ai/provenance.ts`.
- Replace `shared/ai/mock-provider.ts` with a provider factory that can select a mock adapter or a live adapter without changing route payload shapes.
- Add live provider adapters under `shared/ai/providers/`, for example `shared/ai/providers/anthropic.ts`, `shared/ai/providers/deepseek.ts`, and `shared/ai/providers/openai.ts`.
- Keep the API routes `app/api/ai/mock/message-draft/route.ts` and `app/api/ai/runs/[id]/route.ts` as envelope-only callers of the selected service.

## Switch mechanism

- Default remains mock-first.
- `ORBIT_AI_PROVIDER_MODE=mock` must use `createMockAiProviderService` and must not call network, device, database, email, calendar, or notification services.
- `ORBIT_AI_PROVIDER_MODE=live` may select a live adapter only when `ORBIT_AI_PROVIDER` is set to an approved provider id.
- Supported live values should be explicit, for example `anthropic`, `deepseek`, or `openai`.
- Unknown provider ids must fail closed with a typed API failure envelope instead of falling back silently.

## Required env vars and permissions

- `ORBIT_AI_PROVIDER_MODE`
- `ORBIT_AI_PROVIDER`
- `ANTHROPIC_API_KEY` when `ORBIT_AI_PROVIDER=anthropic`
- `DEEPSEEK_API_KEY` when `ORBIT_AI_PROVIDER=deepseek`
- `OPENAI_API_KEY` when `ORBIT_AI_PROVIDER=openai`
- Optional provider settings such as model name, timeout, and retry budget must be deterministic code configuration, not prompt text.
- No email, calendar, notification, external send, browser device, or database permission is granted by this boundary.

## Privacy and provenance constraints

- Every live run must persist or return an AI run provenance record with prompt template id, input hash, output, fallback behavior, provider id, model id, timing metadata, and evidence ids.
- Input hashes must be computed from canonicalized prompt inputs. Do not store raw private relationship context in logs.
- Output must remain attached to source evidence so product routes can show why the run exists.
- Fallback behavior must be explicit: whether it was used, why it was used, and what output came from fallback logic.
- Provider errors must fail visibly in the API envelope and must never hide missing provenance, skipped source evidence, or partial output.

## Replacement tests

- Contract tests for prompt template id, input hash, output, fallback behavior, and run provenance fields.
- Mock no-network guard tests covering `shared/ai/mock-provider.ts`, route handlers, and the dev capability page.
- Live adapter tests with provider clients mocked at the adapter boundary.
- API envelope tests for success, empty, pending, controlled failure, provider failure, missing run, and unknown provider id.
- Privacy tests proving raw private relationship context is not written to logs or returned in error context.
- Migration tests proving `/dev/capabilities/ai-provider-mock-and-provenance-boundary` still renders success, empty, pending, and failure states when the provider mode is mock.
