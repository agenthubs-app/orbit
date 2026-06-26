# Event Encounter Note Capture Mock Live Implementation

## Live Service And Provider Files

- `features/events/event-encounter-note-capture-mock/live-service.ts` should implement the same `EventEncounterNoteService` interface exported by `features/events/encounter-contract.ts`.
- Provider adapters should live under `features/events/event-encounter-note-capture-mock/providers/`.
- Expected adapters are `providers/speech-to-text-provider.ts`, `providers/audio-upload-provider.ts`, `providers/live-note-storage-provider.ts`, and `providers/evidence-store-provider.ts`.
- API routes should keep using `app/api/events/[id]/encounters/route.ts` and `app/api/events/[id]/encounters/[encounterId]/evidence/route.ts`; only the service factory should switch from mock to live.

## Switch Mechanism

- `ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER=mock` keeps the current deterministic mock service.
- `ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER=live` should select `live-service.ts` after provider adapters and replacement tests exist.
- Unsupported values must fail visibly with a shared failure envelope rather than falling back silently.

## Required Environment Variables And Permissions

- Required environment variables: `ORBIT_EVENT_ENCOUNTER_NOTE_PROVIDER`, `ORBIT_SPEECH_TO_TEXT_API_KEY`, `ORBIT_AUDIO_UPLOAD_BUCKET`, and `ORBIT_NOTE_STORAGE_URL`.
- Required permissions: microphone capture consent, audio upload consent, event workspace write permission, relationship evidence write permission, and operator confirmation before any follow-up action is triggered.
- Live note storage must record whether speech-to-text, audio upload, and evidence persistence succeeded or failed.

## Privacy And Provenance Constraints

- Store only user-confirmed encounter notes and approved voice-note transcripts.
- Keep source provenance for every encounter note, conversation summary seed, and evidence record.
- Preserve `eventId`, `encounterId`, `contactId`, source label, captured fields, timestamps, and provider status metadata.
- Do not send encounter notes to model or transcription providers until the operator has granted the required permission.
- Never hide partial failures: speech-to-text, audio upload, live note storage, and evidence persistence must each surface their own status.

## Replacement Tests

- Contract tests for live note capture, voice-note transcription, conversation summary seed creation, evidence creation, empty state, pending transcription, missing event, missing encounter, and provider failure paths.
- Route tests for `POST /api/events/:id/encounters` and `POST /api/events/:id/encounters/:encounterId/evidence` with shared API envelopes and runtime headers.
- Privacy tests proving unconfirmed audio is not uploaded and unapproved notes are not sent to transcription or model services.
- Provenance tests proving every live encounter note and evidence record keeps source references and provider status metadata.
