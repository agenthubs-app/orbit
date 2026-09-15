# Sprint 0030 Design QA

Date: 2026-09-15 JST
Viewport: 390 × 844 CSS pt, device scale 2
Locale: Chinese

## Evidence

- Approved source: [`assets/3a-inbox.png`](assets/3a-inbox.png), 780 × 1688 px, SHA-256 `a2f576c474780cd451c10eb7a2b3fe339130a18974c0f6436f9a1494e2522702`.
- Final RNW capture: `repos/orbit-app/build/harness-state/evidence/sprint-0030/run-01/implementation-390x844@2x.png`, 780 × 1688 px.
- Side-by-side comparison: `repos/orbit-app/build/harness-state/evidence/sprint-0030/run-01/source-implementation-hstack.png`, 1560 × 1688 px.

The capture uses the source's reference state: five rows across activity, task, contact and IORBIT sources, with two unread rows. It is deterministic design evidence; live runtime evidence uses only records returned by the QA account.

## Comparison

| Area | Final observation | Result |
| --- | --- | --- |
| Header and safe area | Compact back/title/all-read toolbar follows the same vertical hierarchy and centered title. | passed |
| Tabs | Four labels, count placement, active blue underline and full-width divider match the source structure. | passed |
| Feed geometry | 20 pt horizontal gutter, 8 pt unread dot, 68 pt minimum row, 12 pt vertical inset and hairline separators reproduce the source density. | passed |
| Typography | Primary text is 15 pt; source/time metadata is 12 pt with the approved dark and muted colors. | passed |
| Color and effects | Uses the approved dark text, blue accent, muted gray, separator and background tokens; no card shadow, gradient or extra bottom bar remains. | passed |
| Footer | The recent-30-days footer appears only when every visible item has a trusted occurrence time and the window is confirmed. | passed |
| Responsive states | Automated checks cover 320 pt width, 1.0/1.6/2.0 font scale, 44 pt targets, wrapping timestamps and no horizontal overflow. | passed |
| Alternate states | Automated captures cover filters, pending/success/partial failure, empty/source failures, dark mode, seeded compose and conversation detail. These states have no pixel source and were checked for consistency and usability. | passed |

## Iteration record

The first implementation used an 80 pt row with 14 pt vertical padding and appeared materially looser than the source. A failing geometry assertion was tightened before the UI changed; the final 68 pt row and 12 pt padding passed the 14-case visual suite and the same-viewport comparison. No P0, P1 or P2 mismatch remains.

final result: passed
