# Business Card Scan OCR Mock Replacement

## Live Service Boundary

Replace the mock behind `features/acquisition/business-card-scan-ocr-mock/live-service.ts`.
Provider adapters belong under `features/acquisition/business-card-scan-ocr-mock/providers/`.

## Switch

Use `ORBIT_BUSINESS_CARD_SCAN_PROVIDER=mock|live`. Mock remains the default until live camera
permission, OCR provider, upload storage, and privacy review are ready.

## Required Live Inputs

- camera permission for card capture
- OCR provider credentials and quota controls
- storage bucket for short-lived image upload
- encryption and retention policy for captured card images
- provenance records for capture, OCR text, and extracted draft fields

## Privacy And Provenance

The live path must preserve source evidence IDs, card image capture metadata, OCR text, and the
operator confirmation requirement. Do not write contacts until the extracted draft is confirmed.

## Replacement Tests

Add replacement tests for successful scan, empty/unreadable card, pending OCR, provider failure,
missing draft lookup, privacy headers, and the no-contact-write guarantee.
