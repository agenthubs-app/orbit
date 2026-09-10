# Card scan visual exploration — 2026-09-07

Status: three preview-only concepts generated; no visual target selected, no app code changed. Each image shows capture and confirmation states of a single direction. The user subsequently asked about double-sided business cards; the images below do NOT yet show the double-sided affordance.

## Displayed order in chat

1. [Quiet separate review](quiet-separate-review.png) — first image rendered wider than requested; information-hierarchy reference only, not a faithful mobile viewport.
2. [Camera review sheet](camera-review-sheet.png)
3. [Compact native review](compact-native-review.png)

Generated with the built-in Image Gen tool. [Exact generation prompts](prompts.md). Reference images actually attached: existing Orbit settings screenshot (`.tmp/home-guidance/native-final.png`) for palette/type only, and official HiHello camera illustration (`.tmp/card-scan-research/hihello-camera.png`) for camera-first interaction only. Neither is the Orbit current scan page. No fresh scan-page audit performed. Palette from `src/design/tokens.ts`.

## Latest requirement: optional back side

Proposed flow: capture front → optionally capture back → one combined contact confirmation → add one contact. Present a quiet “补拍背面” secondary action beside/below the front thumbnail, not another required step or mode selector. After both captures, label small thumbnails “正面” and “背面”, with independent retake/removal. Front and back are one scan session and one contact, not two contacts. Identical recognized fields deduplicate; complementary fields combine; conflicting values require a visible user choice, not silent overwrite. Show uncertain recognition only when relevant. Recognition and saving are distinct states.

These are design requirements, not implemented or verified backend capabilities. Verify current multi-image/OCR support before implementation. No app edits, commits, publishing, or actual contact creation authorized/performed in this preview task.

