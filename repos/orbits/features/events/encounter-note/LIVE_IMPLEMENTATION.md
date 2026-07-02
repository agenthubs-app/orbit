# Event Encounter Note Capture Live Implementation

## Current Live Service And Provider Files

- `features/events/encounter-note/live-service.ts` should implement the same `EventEncounterNoteService` interface exported by `features/events/encounter-note/contract.ts`.
- Current generated live context is implemented by `features/events/encounter-note/storage/generated-encounter-note-live-record-provider.ts`.
- The generated provider reads event attendee context through the events attendee-roster live provider, then stages typed encounter notes and evidence to the `event_encounter_notes` work collection.
- API routes should keep using `app/api/events/[id]/encounters/route.ts` and `app/api/events/[id]/encounters/[encounterId]/evidence/route.ts`; only the service factory should switch from mock to live.

## Reserved External Provider Boundary

- Future provider adapters should live under `features/events/encounter-note/providers/`.
- Reserved adapters are `providers/speech-to-text-provider.ts`, `providers/audio-upload-provider.ts`, `providers/live-note-storage-provider.ts`, and `providers/evidence-store-provider.ts`.
- Speech-to-text, audio upload, and model summary providers are not executed by the current generated live storage path.

## Switch Mechanism

- `ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER=mock` keeps the current deterministic mock service.
- `ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER=live` is the legacy feature-specific switch name kept for the replacement handoff; current runtime selection is controlled by `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.
- Live mode selects `live-service.ts` with the generated live record provider when the shared Postgres live storage environment is configured.
- Unsupported values must fail visibly with a shared failure envelope rather than falling back silently.

## Required Environment Variables And Permissions

- Required environment variables for current live storage: `ORBIT_EVENT_DATABASE_URL` and `ORBIT_WORKSPACE_ID`.
- Required environment variables for future external providers: `ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER`, `ORBIT_SPEECH_TO_TEXT_API_KEY`, `ORBIT_AUDIO_UPLOAD_BUCKET`, and `ORBIT_NOTE_STORAGE_URL`.
- Required permissions for current live storage: event workspace write permission, relationship evidence write permission, and operator confirmation before any follow-up action is triggered.
- Required permissions for future voice capture: microphone capture consent and audio upload consent.
- Live note storage must record whether speech-to-text, audio upload, and evidence persistence succeeded or failed.

## Privacy And Provenance Constraints

- Store only user-confirmed encounter notes and approved voice-note transcripts.
- Keep source provenance for every encounter note, conversation summary seed, and evidence record.
- Preserve `eventId`, `encounterId`, `contactId`, source label, captured fields, timestamps, and provider status metadata.
- Do not send encounter notes to model or transcription providers until the operator has granted the required permission.
- Never hide partial failures: speech-to-text, audio upload, live note storage, and evidence persistence must each surface their own status.
- Current generated live storage must keep `speechToTextRequested`, `audioUploadRequested`, `aiProviderRequested`, and external delivery flags false unless those external providers are explicitly wired later.

## Replacement Tests

- `tests/capabilities/event-encounter-note-live-generated-store.test.ts` proves live mode can generate encounter-note context from remote attendee data, store a typed note, and convert the stored note into relationship evidence.
- Contract tests for live note capture, voice-note transcription, conversation summary seed creation, evidence creation, empty state, pending transcription, missing event, missing encounter, and provider failure paths.
- Route tests for `POST /api/events/:id/encounters` and `POST /api/events/:id/encounters/:encounterId/evidence` with shared API envelopes and runtime headers.
- Privacy tests proving unconfirmed audio is not uploaded and unapproved notes are not sent to transcription or model services.
- Provenance tests proving every live encounter note and evidence record keeps source references and provider status metadata.
