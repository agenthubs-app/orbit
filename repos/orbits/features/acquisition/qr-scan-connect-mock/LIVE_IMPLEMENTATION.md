# QR Scan Connect Mock Replacement

## Live Service Boundary

Replace the mock behind `features/acquisition/qr-scan-connect-mock/live-service.ts`.
Provider adapters belong under `features/acquisition/qr-scan-connect-mock/providers/`.

The live boundary should keep the same contract exported from
`features/acquisition/qr-contract.ts`: scan result, mutual connection context, QR connection draft,
confirmation payload, and failure definitions.

## Switch

Use `ORBIT_QR_SCAN_PROVIDER=mock|live`. Mock remains the default until live camera permission,
QR decoder, signature verifier, relationship lookup, and persistence reviews are ready.

## Required Live Inputs

- camera permission for QR frame capture
- QR decoder library or native scanner adapter
- signature verifier keys or issuer configuration for trusted relationship QR payloads
- `ORBIT_QR_SCAN_PROVIDER` to select mock or live implementation
- optional `ORBIT_QR_SIGNATURE_JWKS_URL` or equivalent verifier source when signed QR payloads ship
- provenance records for scan frame, decoded payload, mutual context, confirmation, and created draft
- contact and connection write permissions gated behind explicit confirmation

## Privacy And Provenance

The live path must preserve source evidence IDs, decoded QR payload metadata, mutual connection
context, and the operator confirmation requirement. Do not write contacts, connections, messages,
calendar events, email, notifications, or analytics until the QR connection draft is confirmed.
Keep raw QR payload retention short, avoid storing unnecessary signed payload material, and attach
the event or introducer context that explains why the relationship exists.

## Replacement Tests

Add replacement tests for successful scan, empty or unreadable QR, pending validation, invalid
signature, missing draft confirmation, provider failure, privacy headers, provenance continuity,
and the no-contact-write or no-connection-write guarantee before confirmation.
