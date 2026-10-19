# PX1 — run 01 report

## Run and scope

Line E started from `ee87af742` after `git pull --rebase origin redesign`. Work stayed in `redesign-e`, local `orbit_line_e`, Web `:3800` with `.next-line-e`, design `:3320`, Metro `:8088`, and new iPhone 16e simulator `8E927028-EF51-45E1-A874-3610ABC801E9` (`Orbit PX1 16e`). Evidence is outside the repository at `_evidence-e/PX1/run-01/`. No production, Neon, deployment, push, or paid AI call was used (paid AI calls: **0**). A machine reboot at 09:51 JST interrupted the third native sweep; its service-error captures are invalid and do not count as visual comparisons. The surviving fixture and page changes passed focused checks (Web 14/14, App 30/30, both typechecks) and were committed by path before a second `git pull --rebase origin redesign`. The rebased local commits are `0776f40e0` (four-state fixture), `d7eb7e267` (page states and suites), and `f4dce663c` (measured page and copy fixes), each with the requested trailer. This REPORT, preflight, and attribution JSON are the final documentation deliverables.

The App server setting is saved as `http://localhost:3800`. Its native health check displayed “Server available. Orbit responded normally. You can continue.” (`app-api-health.png`), and the Web server logged `GET /api/health 200`, `GET /api/dev/network-design-fixture?contacts=1 200`, and `GET /api/network/analysis 200` for the same signed-in local QA actor. The native device language was switched to Japanese for comparison with the boards. The simulator API setting, language, and actor scope were verified from the App UI and request log; Metro connectivity alone was not used as evidence.

## Fixture and preflight

R11b's `designNetworkPeople` is the person/industry source. R11a projects it into contact cards, summary, details, goal links, fit, invite connection, and field history. The Web dev endpoint and App local snapshot are available only with an explicit nonproduction mock flag; the endpoint is authenticated and the App snapshot is keyed by actor and base URL. The production endpoint test returns 404. The four authenticated local responses agree:

| Variant | Contact summary | First page | Analysis total | Actor-scoped projection |
| --- | ---: | ---: | ---: | ---: |
| empty | 0 | 0 | 0 | 0 |
| locked5 | 5 | 5 | 5 | 5 |
| few14 | 14 | 14 | 14 | 14 |
| many286 | 286 | 9 after the list correction | 286 | 286 |

Evidence: `four-state-api.json` captured the original 30-row page request; `first-nine.json` captures the corrected nine-person first page and its next cursor. The App AX/screenshots `app-analysis-locked5-ja.png` and `app-network-many286.png` show `5/10` on the locked analysis and `286人 · 今月 +24` on the large contact list. The App keeps an already mounted snapshot until refresh or relaunch; the native comparison runner relaunches each path before capture. Actor isolation and nonproduction gating have targeted tests.

All 57 target view references resolved to the intended board title, index, and kind. The five board scans, data inventories, numeric checks, and token gaps are indexed in [preflight-checklist.md](preflight-checklist.md). They report zero board-internal numeric warnings; near and missing token values remain inspection work, not accepted attributions.

## Visual comparison

The first valid R11a Web `W-R11-02` comparison captured the `locked5` world at 1440 light: raw `0.0394`, 16 over-threshold bands, 16 unattributed bands, and 42 missing-content regions. Its design/app/triptych files are under `pixel/web-r11a-locked5-run2/W-R11-02-1440-light/`. The image showed density labels wrapping and shifting the list roughly 17 px, and an absent next-step rail card. Line E adjusted the density row and rendered a plan-candidate card from existing goal-link DTOs, linking to the real plan tab. The second `--style-diff` comparison (`run3`) improved raw to `0.0356`, 15 over-threshold/unattributed bands, and 23 missing-content regions. The third (`run4`) improved raw to `0.0291`, 13 over-threshold/unattributed bands, and 16 missing regions after adding the plus sign, correcting the analysis link typography, and moving the density content. It **still failed**. The three-round limit is exhausted; the remaining bands include differing fixture names/dates and the out-of-scope `add/TodayQuestionCard` right-rail content, plus residual page and token geometry in `style-diff.json`. No structural difference has been attributed away. The comparator wrote a valid summary and triptych, then lingered during browser shutdown; its own process was terminated after two minutes to release the heavy-task lock. The wrapper reported exit 0 for that signal, so the **summary's `pass:false` and `exitCode:5` govern the result**. The earlier `run1` attempt failed because the new R11a attribution file did not yet exist; it is not a visual result.

| Suite | Required boards | Current outcome |
| --- | ---: | --- |
| R11a Web | 24 | All 24 boards have valid captures and all FAIL with unattributed bands; W-R11-02 and W-R11-03-390 are capped. The latter was inadvertently included once more by a prefix-filter bug; that extra capture is excluded from acceptance. |
| R11a App | 15 | All 15 native views have valid target-state screenshots; all remain FAIL with unattributed bands. `A-R11-01/02/03/05/06/07` reached the three-attempt cap. The machine-reboot captures were invalid and excluded. |
| R11b App | 7 | All seven views captured the correct fixture state and failed with unattributed bands. The `A-R11b-01` locked view now shows `5/10` after its cold-start and stale-cache attempts; its third attempt is sealed. Other screens retain page and component differences, and the no-source blocks remain omitted by the established decision. |
| R11b Web regression | 6 | Automated comparator PASS 6/6 after the shared fixture changed; manual audit retains the established no-source exceptions and does not treat absent board cards as pixel-equivalent. |
| R21 Web | 6 | All six current-base views captured; all FAIL with unattributed bands. The phone page-local title and spacing were recaptured in R02/R05; left Drawer remains an A-line dependency. |
| R21 App | 5 | All five native boards captured on the current PX1 simulator; all FAIL with unattributed structural/content bands. A-R21-14 was recaptured with its menu actually open. |
| R05/R12/R15/R16/R30 cross-check | Targeted | Web R12: 2/8 PASS; R15: 0/4; R16: 2/2 PASS; R30: 0/1. App R05: 0/2 and R30: 0/1. `W-R12-02` has no current design board; `A-R05-10` is an uncaptured return-to-list interaction, not a suite board. |

The first Web sweep's large list rendered 30 rows and squeezed a desktop table into 390 px. The design shows nine people and mobile cards. The R11a page now fetches nine at a time, renders mobile cards, and uses matching named people for the controlled detail, invite, fit and previous-value views. The empty sample table gained the two placeholder rows in the board. The second Web pass showed the mobile list still high and too tall; a third capture was invalid because it caught the loading skeleton. The final suite now waits for a rendered row before taking each nonempty screen. The phone page also folds the shell title and draws the board's left-aligned title itself. The empty guide now uses the board's existing page token sizes and 24 px row spacing.

The wrapper's `SKIP_PIXEL_IDS=W-R11-03-390` removed that id from its group, but the shared comparator interprets `--only W-R11-03` as a prefix and included `W-R11-03-390` anyway. Its extra capture under `pixel/final-web-R11a-run2-many286/` is an unintended fourth attempt and is excluded from acceptance; the screen remains unpassed at its prior capped state. The external wrapper now creates an exact filtered suite per fixture group rather than relying on prefix selection. This cap violation and correction are reported explicitly; no further comparison of that view is planned.

R11a Web per-view valid results below. For compactness, every row has all over-threshold bands unattributed and status FAIL; the last column is the number of missing-content warnings. `W-R11-03-390` uses its last in-cap valid result. Evidence is `pixel/` plus the directory named in the rightmost column, then the grid-view key from the first column.

| View | Board | Raw | Over / unattributed | Missing | Evidence directory |
| --- | ---: | ---: | ---: | ---: | --- |
| W-R11-01-1440-light | 4 | .0318 | 11 / 11 | 22 | `final-web-R11a-run2-empty` |
| W-R11-01d-1440-dark | 511 | .0302 | 11 / 11 | 21 | `final-web-R11a-run2-empty` |
| W-R11-02-1440-light | 5 | .0291 | 13 / 13 | 16 | `web-r11a-locked5-run4` |
| W-R11-02d-1440-dark | 509 | .0273 | 12 / 12 | 13 | `final-web-R11a-run2-locked5` |
| W-R11-03-1440-light | 6 | .0471 | 21 / 21 | 55 | `final-web-R11a-run2-many286` |
| W-R11-03-1024-1024-light | 36 | .0627 | 20 / 20 | 44 | `final-web-R11a-run2-many286` |
| W-R11-03-390-390-light | 38 | .1195 | 39 / 39 | 24 | `web-r11a-many286-run2` |
| W-R11-06-1440-light | 7 | .0563 | 26 / 26 | 46 | `final-web-R11a-run2-many286` |
| W-R11-06d-1440-dark | 41 | .0486 | 23 / 23 | 45 | `final-web-R11a-run2-many286` |
| W-R11-06-1024-1024-light | 13 | .0550 | 22 / 22 | 24 | `final-web-R11a-run2-many286` |
| W-R11-06-390-390-light | 14 | .0827 | 27 / 27 | 23 | `final-web-R11a-run2-many286` |
| W-R11-07-1440-light | 500 | .0630 | 26 / 26 | 44 | `final-web-R11a-run2-many286` |
| W-R11-07d-1440-dark | 501 | .0540 | 23 / 23 | 47 | `final-web-R11a-run2-many286` |
| W-R11-07-390-390-light | 512 | .1351 | 26 / 26 | 22 | `final-web-R11a-run2-many286` |
| W-R11-07-390d-390-dark | 513 | .1144 | 25 / 25 | 21 | `final-web-R11a-run2-many286` |
| W-R11-08-1440-light | 502 | .0452 | 23 / 23 | 57 | `final-web-R11a-run2-many286` |
| W-R11-08d-1440-dark | 503 | .0404 | 22 / 22 | 58 | `final-web-R11a-run2-many286` |
| W-R11-09-1440-light | 504 | .0650 | 28 / 28 | 46 | `final-web-R11a-run2-many286` |
| W-R11-09d-1440-dark | 505 | .0557 | 27 / 27 | 49 | `final-web-R11a-run2-many286` |
| W-R11-09u-1440-light | 506 | .0705 | 29 / 29 | 36 | `final-web-R11a-run2-many286` |
| W-R11-09ud-1440-dark | 507 | .0506 | 25 / 25 | 25 | `final-web-R11a-run2-many286` |
| W-R11-10-1440-light | 61 | .0821 | 28 / 28 | 52 | `final-web-R11a-run2-many286` |
| W-R11-11-1440-light | 45 | .5999 | 36 / 36 | 55 | `final-web-R11a-run2-many286` |
| W-R11-12-1440-light | 59 | .0172 | 7 / 7 | 2 | `final-web-R11a-run2-loading` |

The 286-person Web table and drawer now show the intended controlled person and nine-row page. The board's list dates and the 10/12 invite update were authored against different apparent clocks; the fixture uses one 10/19 clock to keep connection, update, and card timestamps ordered, so list relative dates remain different. The 390 board contains eight rows while the usable page exposes nine and its “さらに表示” control. The edit view `W-R11-11` reaches the right person and form; most of its raw difference comes from the shared drawer/backdrop treatment across the whole page. Those layout and extra-row gaps remain unattributed, as do the right-rail content and remaining token differences.

| R11a Web unresolved group | Visible cause after page fixes | Next owner and recompare input |
| --- | --- | --- |
| W-R11-01/01d/02/02d/03 and 03 at 1024/390 | List/sample and date text, desktop right-rail blocks, phone eight-versus-nine rows, shell/token spacing | E contact page for remaining list geometry; D shell and B right-rail/data owners for their blocks; main decision on the board date/row conflict. Re-run same variant and viewport after each change. W-R11-02 and 03-390 are at the attempt cap. |
| W-R11-06/06d/06 at 1024/390; 07/07d/07 at 390/light/dark; 08/08d; 09/09d/09u/09ud | Correct controlled person, fit, sync and prior-value states reached; large full-page diffs include contact drawer/backdrop, detail card internals, board-specific sample text and confirmation state | E detail page/fixture plus A Drawer/kit for shared geometry. Re-run exact controlled `design=fit` or `design=sync` moment after versioned inputs; do not attribute missing cards or changed dimensions as data. |
| W-R11-10/11/12 | Filter and edit midstate use real controls but choices/fields and shared drawer differ; loading skeleton has seven unresolved bands | B for catalog/stage contract, A for shared drawer/backdrop, E for local filter/loading spacing. Re-run the exact sheet/form/loading board. |

For `A-R11-03`, a second native screenshot showed the correct actor's 286-person fixture but the search field and density card sat 16 px below the board, while the density card was about 28 px too short. A page-local spacing correction aligned the search, card bottom, tabs, and first list card in the third screenshot; raw moved from `0.1532` to `0.1038`, and unattributed bands from 24 to 21. The third screenshot is still FAIL. Further differences remain in native text/raster, card internals, and the bottom tab region; none has been auto-attributed as `[raster]`. Evidence: `pixel/app-r11a-many286-run{2,3}/A-R11-03-app-light/`. The cold-start `representative` image is retained as invalid-state evidence, not a successful design comparison.

The R11a App suite now uses development-only query paths for the add sheet, filter sheet, industry picker, delete confirmation, and unlink confirmation. Base routes still use the normal interactions. The first sweep captured the add sheet's background instead of the sheet because a same-route query change did not update the mounted state. The page now responds to that query change: `A-R11-04` fell from raw `0.5785` to `0.0579`, with the sheet visible, but still has 16 unattributed bands and is unpassed. The invite detail has separate before and after fixture moments, using a fit candidate and a recorded profile update. After two page corrections, `A-R11-06` remains at raw `0.1347` with 17 unattributed bands and `A-R11-07` at `0.1020` with 18; both are sealed. The empty and locked list screens remain unpassed at raw `0.0824` / 17 and `0.0818` / 17 on their third attempts. These values are diagnostic, not waivers for structural gaps.

Latest valid R11a App captures (the board index, raw reference, over-threshold and unattributed band counts, missing-content count, and evidence directory are retained per view):

| View | Board | Raw | Over / unattributed | Missing | Evidence under `pixel/` |
| --- | ---: | ---: | ---: | ---: | --- |
| A-R11-01 | 6 | .0824 | 17 / 17 | 8 | `app-r11a-affected-run3-empty` |
| A-R11-02 | 7 | .0818 | 17 / 17 | 6 | `app-r11a-affected-run3-locked5` |
| A-R11-03 | 8 | .1038 | 21 / 21 | 10 | `app-r11a-many286-run3` |
| A-R11-03d | 34 | .0799 | 21 / 21 | 7 | `app-r11a-remaining-run3b-many286` |
| A-R11-04 | 9 | .0579 | 16 / 16 | 0 | `app-r11a-affected-run2-many286` |
| A-R11-05 | 29 | .0999 | 17 / 17 | 3 | `app-r11a-a05-gradient-run3-many286` |
| A-R11-06 | 20 | .1347 | 17 / 17 | 4 | `app-r11a-affected-run3-many286` |
| A-R11-06d | 27 | .1167 | 17 / 17 | 3 | `app-r11a-remaining-run3b-many286` |
| A-R11-07 | 21 | .1020 | 18 / 18 | 2 | `app-r11a-affected-run3-many286` |
| A-R11-08 | 22 | .1915 | 18 / 18 | 3 | `app-r11a-remaining-run3b-many286` |
| A-R11-09 | 60 | .2711 | 23 / 23 | 22 | `app-r11a-remaining-run3b-many286` |
| A-R11-10 | 42 | .0502 | 17 / 17 | 13 | `app-r11a-remaining-run3b-many286` |
| A-R11-11 | 43 | .0974 | 19 / 19 | 17 | `app-r11a-remaining-run3b-many286` |
| A-R11-12 | 44 | .0928 | 19 / 19 | 13 | `app-r11a-remaining-run3b-many286` |
| A-R11-13 | 58 | .0320 | 10 / 10 | 0 | `app-r11a-remaining-run3b-loading` |

`A-R11-05`'s board uses a page-local pink-to-surface gradient. Adding that gradient moved raw from `.1541` to `.0999` on its final attempt, but 17 bands remain unpassed; the design's stage chip still differs from the current status contract. `A-R11-08` reaches the unlink confirmation, but the shared BottomSheet begins roughly 78 px lower than the board. `A-R11-09` now reaches the filter sheet, but its stage and industry options/counts differ from the board and the shared sheet's height differs. `A-R11-10` reaches the edit form, but its stage choices and field order differ. `A-R11-11`'s industry catalog and `A-R11-12`'s shared confirmation dialog likewise retain structural or catalog differences. These are visible in each triptych and are not attributed to raster or sample text.

The R11b App `few14` and `many286` captures use the correct source counts (`14`, `286`) and the same actor as the Web fixture. Structure light/dark and the two present opportunity cards have close primary geometry but still have unlabeled band differences. The opportunity board includes two cards intentionally omitted under the established no-source decision; the insight board likewise shows a reply card and weekly-update footer without a current source, while the implementation shows the real snapshot state. The drill-down board expects four stages and a different sample ordering, whereas the current contract exposes the established stage model and sorted list. These structural gaps are not `[data]` or `[raster]` attributions. The locked view's final valid capture is raw `0.0733` with 16 unattributed bands; valid first-pass raw values for the remaining six views are `0.0634` (A-R11b-02), `0.0834` (03), `0.0861` (03D), `0.0827` (04), `0.1241` (05), and `0.1818` (06). Every view remains unpassed. Evidence: `pixel/app-r11b-locked-final-locked5/` and `pixel/final-app-R11b-{few14,many286}/`.

The R11b page-local gradient and compact row spacing changed the valid `A-R11b-02/03/03D` references to raw `.0486/.0692/.0688` and unattributed bands `17/17/16`, respectively; evidence is `pixel/app-r11b-gradient-run2-{few14,many286}/`. Each still fails. The `14` and `286` totals were asserted from the authenticated analysis API immediately before capture. Industry taxonomy/ordering, shared ring details, and the established no-source blocks remain separate gaps.

The six R11b Web regression rows all returned comparator `pass:true`, with no unattributed bands: W-R11b-01 raw `.0003` (0 over, 0 missing), 02 `.0159` (9 over, 10 missing), 03 `.0114` (7, 7), 04 `.0304` (12, 17), 05 `.0170` (9, 8), and 05d `.0147` (9, 6). Evidence: `pixel/regression-web-R11b-{locked5,few14,many286}/`. I inspected the triptychs with the largest warnings (02 and 04). The existing read-only R11b attribution file labels absent board-only opportunity cards in 04 as `[data]` under the earlier no-source product decision. Under PX1's stricter missing-structure rule, that is an established exception, not proof that the cards match. The regression claim is limited to **zero newly unattributed bands** in the already accepted Web surface; the exception must remain visible to independent review.

R21 App current native gate (raw is diagnostic, all rows FAIL):

| View | Board | Raw | Over / unattributed | Missing | Evidence under `pixel/` |
| --- | ---: | ---: | ---: | ---: | --- |
| A-R21-03 | 34 | .0900 | 19 / 19 | 8 | `final-app-R21-none` |
| A-R21-04 | 38 | .4258 | 28 / 28 | 16 | `final-app-R21-none` |
| A-R21-13 | 56 | .0898 | 19 / 19 | 7 | `final-app-R21-none` |
| A-R21-14 | 57 | .3035 | 26 / 26 | 12 | `app-r21-menu-run2-none` |
| A-R21-N01 | 41 | .1021 | 17 / 17 | 13 | `final-app-R21-none` |

The App start uses the current actor's generic prompts and available session titles; the b4 board requires a personalized CFO Night greeting and different actor-owned conversations. The b11 N01 start board has a different vertical prompt layout and header from the b4 start; the same `/ai` route cannot satisfy both visual states without a decided state or a controlled fixture. The current `FullDrawer` opens from the right, while b4 history boards 38/57 open from the left. Board 57 also includes an anchored row menu. A development-only `menu=1` entry selected an actual local session to capture that state; the current shared `ActionSheet` opens at the bottom. No direction, menu, missing content, or layout gap was attributed as text data or raster. A/R32 must provide the left-opening FullDrawer and anchored row-action variant before those views can pass; the main session must decide the b4/b11 start-state relationship and supply actor-owned DTO content for the personalized boards.

R21 Web current-base first gate (all rows FAIL; raw is diagnostic):

| View | Board | Raw | Over / unattributed | Missing | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| W-R21-03-1440-light | 37 | .0599 | 20 / 20 | 39 | `pixel/final-web-R21-none/` |
| W-R21-R01-1024-light | 9 | .0462 | 15 / 15 | 30 | same |
| W-R21-R02-390-light | 10 | .1938 | 25 / 25 | 15 | `pixel/web-r21-phone-run2-none/` |
| W-R21-R03-1024-light | 11 | .7383 | 30 / 30 | 32 | `pixel/web-r21-drawer-run2-none/` |
| W-R21-R04-390-light | 12 | .2787 | 29 / 29 | 18 | `pixel/web-r21-drawer-run2-none/` |
| W-R21-R05-390-dark | 18 | .1370 | 25 / 25 | 15 | `pixel/web-r21-phone-run2-none/` |

The signed-in QA session `r21-visual-pinned` contains two plain `role`/`text` messages and no structured `items`. The board conversation shows mixed person and event cards plus a plan-add prompt; the current one-kind scenario panel DTO cannot reconstruct all three from that text session. The missing blocks are a contract/fixture gap, not valid `[data]` text attributions. R03/R04 additionally use the shared right Drawer against a left-opening board. In R02/R05 the page nested its own 18px mobile padding inside the shell, and the phone header lacked the active session title. The E page now removes duplicate horizontal padding and renders the existing actor-owned title. The second triptychs show the title in place and the different actor content clearly; both still have 25 unattributed bands. R03/R04 were also recaptured after the title change: they remain at 30/29 unattributed bands, with the Drawer direction and missing structured content visible. No missing entity or plan block was waived as fixture text.

Cross-check results on the same `many286` actor fixture (raw is diagnostic; each view's triptych and summary are under `pixel/cross-<suite>-many286/`):

| View | Board | Raw | Over / unattributed | Missing | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| W-R12-01-1440-light | 96 | .0361 | 19 / 19 | 23 | FAIL |
| W-R12-01-1440-dark | 96 | .0274 | 19 / 19 | 24 | FAIL |
| W-R12-01m-1440-light | 96 | .0011 | 0 / 0 | 0 | PASS |
| W-R12-01m-1440-dark | 96 | .0008 | 0 / 0 | 0 | PASS |
| W-R12-03-1440-light | 11 | .0019 | 1 / 1 | 0 | FAIL |
| W-R12-03-1440-dark | 11 | .0021 | 1 / 1 | 0 | FAIL |
| W-R12-04-1440-light | 19 | .0724 | 15 / 15 | 9 | FAIL |
| W-R12-04-1440-dark | 19 | .0587 | 15 / 15 | 10 | FAIL |
| W-R15-14-1440-light | 14 | .1891 | 29 / 29 | 58 | FAIL |
| W-R15-14-1440-dark | 14 | .0995 | 28 / 28 | 51 | FAIL |
| W-R15-14m-1440-light | 14 | .3684 | 18 / 9 | 19 | FAIL |
| W-R15-14m-1440-dark | 14 | .1685 | 17 / 9 | 17 | FAIL |
| W-R16-10-1440-light | 298 | .0002 | 0 / 0 | 0 | PASS |
| W-R16-10-1440-dark | 298 | .0002 | 0 / 0 | 0 | PASS |
| W-R30-P03-1440-light | 59 | .2873 | 12 / 12 | 7 | FAIL |
| A-R05-02-light | 2 | .1006 | 20 / 20 | 12 | FAIL |
| A-R05-02-dark | 25 | .0777 | 20 / 20 | 7 | FAIL |
| A-R30-P08 | 27 | .0430 | 13 / 2 | 3 | FAIL |

The R12-01 full-page triptych shows the R11a background table/rail and fixture text diverging while its cropped modal (`01m`) itself passes; `R12-04` is missing the board's duplicate candidate and prefilled manual fields, which belongs to R12's form/fixture. R15-14 reaches the “create code” step, while the board displays a generated invitation code, expiry and message; this is an R15 state/fixture gap. The R16 import method page passes in both themes. W-R30-P03 says it searched 80 people, against the 286-person R11a fixture, and offers no “近い条件なら” industry links; the same absence is present in native A-R30-P08. The Web suggestion's isolated UI unit routes to `/app/contacts?industry=electronics`, and the R11a filter parser has a separate unit check, but the actual cross-surface click could not be performed in this result state because no suggestion was rendered. That chain remains unverified. `W-R12-02` has no current board or runnable target view; it is explicitly out of the comparison count, not a PASS. `A-R05-10` likewise has no suite board and its return-to-list scroll interaction remains unverified.

The manual PASS sample audit opened the R12-01m light and R16-10 light triptychs (2 of 4 newly passing cross-check images). Both have zero over-threshold bands, so there are no `[raster]` crops to inspect. The six previously passing R11b Web regression images have no `[raster]` entries either; their 02 and 04 triptychs were inspected, including the established 04 no-source missing-card exception. Every failed cross-check keeps its missing-content warnings open.

`_evidence-e/PX1/run-01/band-ledger.json` indexes all 81 target/regression/cross-check images: board index, exact triptych directory, raw, each over-threshold band number and y range, every unresolved band's comparator measurements, and missing-content warnings. It selects the last valid in-cap W-R11-03-390 capture. Its 10 PASS / 71 FAIL count includes six read-only R11b Web regression images and four cross-check images; none of the 57 main R11a/R11b App/R21 target images passes. The JSON is an evidence index, not an attribution waiver.

## Verification and remaining work

### SC status

| SC | Result and evidence | Still required for acceptance |
| --- | --- | --- |
| PX1-01 | Local ports, actor, dedicated 16e UDID, saved API URL, health receipt, and request counts verified above. Reboot recovery used path commits followed by `git pull --rebase origin redesign`. Owned services and PX1 simulator were stopped; old E simulator data was restored. | No environment cleanup remains. |
| PX1-02 | Four-state response table, same R11b people source, fixture unit tests, authenticated dev route, and production 404 verified. | No additional fixture change planned. |
| PX1-03 | App local snapshot is actor/base-URL scoped; native counts and controlled detail/fit/sync states were captured. Targeted tests passed. | Offline relaunch after server loss and return-to-list scroll were not separately exercised; do not mark those operation chains passed. |
| PX1-04 | All R11a Web 24 and App 15 views have valid comparisons in the tables above. | All views remain unpassed; page, shared kit, content, and raster bands remain unattributed. A-R05-10 return interaction is still unverified. |
| PX1-05 | All seven R11b App views used the corrected `:3800` source; six R11b Web regression comparisons report zero newly unattributed bands. | All seven App views remain unpassed. R11b Web no-source structure exception remains visible. |
| PX1-06 | Page-local gradient and row spacing were remeasured; source-free cards and old stage model were preserved. | App chart/ring, ghost text, taxonomy and shared control differences require A/B review and recomparison. |
| PX1-07 | Web R12/R15/R16/R30 and App R05/R30 cross-check results are tabulated above. R12 cropped add modal and R16 import entry pass; the other specified screens fail. | The actual `?industry=` click chain is unavailable while R30 renders no suggestions; R12-02 has no usable board and A-R05-10 return interaction is unverified. |
| PX1-08 | Current R21 Web six-view table and targeted phone second gate above. | All six remain unpassed; actor-owned structured conversation content and A's left Drawer variant are prerequisites for several views. |
| PX1-09 | Five true native captures, including the actual menu state, are above. | All five remain unpassed; A FullDrawer/anchored menu, actor content and b4/b11 start-state choice remain. |
| PX1-10 | No new R11a or R21 view is marked PASS; raw is diagnostic. The existing R11b Web PASS set and its structure exception are described separately. Four cross-check images pass with zero bands; two were manually audited. | Attribution JSON contains no invented exemptions. Independent review should inspect the named triptychs and every missing-content warning. |
| PX1-11 | Both full suites and typechecks, Web lint and copy QA were run; the red results and focused repairs are below. Three original code commits were checked by path, and owned-process cleanup is complete. RD-25 follow-up resolved the offline-read inventory finding; see the dated addendum below. | The original full-suite failures and 218 other-domain copy issues were not rerun as a full closeout; pixel acceptance and independent review remain open. |

### Hand-back for independent review

| Owner and files | Concrete input / observed failure | Recompare condition |
| --- | --- | --- |
| A/R32: Web `orbit-2026/ui/**`, App `src/components/ui/{FullDrawer,ActionSheet,BottomSheet,Toast}.tsx`, shared tokens/kit | R21 Web R03/R04 and App 04/14 show right-opening history against left-opening boards; App 14's real row action opens a bottom sheet against the anchored board menu. R11a add/filter/unlink sheets and edit/confirmation controls also retain geometry differences. Toast undo should expire from server `undoUntil`, not a display-start five-second timer. | Deliver the approved left Drawer/FullDrawer and anchored action variants and any missing 01-system tokens; re-run only affected screens with the same actor and fixture. Do not use a page-local imitation. |
| D: Web `orbit-2026/shell/**`; App `src/components/{AppScreen,ShellTopBar,OrbitTabBar,TabPageBar}.tsx` | R11a mobile/desktop and App R05 top/bottom shell bands persist beyond E page changes. | Recompare R11a list, A-R05-02, and affected R21 start after a versioned shell change. |
| App offline-read registry owner: `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts` | Original full App audit found the PX1 development-only GET unregistered. RD-25 registered the exact route with schema version 1 and a durable, actor-partitioned snapshot policy; its inventory audit now passes 27/27. | The original full App run remains red historical evidence; no new full-suite result is claimed. |
| B / R11a data owner: contact and analysis taxonomy/stage contracts | App R11a filter/edit/industry choices and R11b analysis/drill-down stage and industry order differ from board; current source and established product decision were preserved. Missing no-source R11b cards were not fabricated. | Confirm a contract-level change or approved board exception, then regenerate the same four-state fixture and re-run affected views. |
| R21 conversation and actor fixture owner: `r21-visual-pinned` stored session and structured panel DTO | The two stored messages have text only; the board requires mixed person/event cards and a plan-add confirmation, which one-kind scenario panels cannot render. b4 personalized CFO Night start and b11 N01 start describe distinct states on one route. | Supply actor-owned structured items through the real history/read path and decide the start-state selector, then re-run R21 03/R02/R05 and App 03/13/N01. No paid AI call or screenshot overlay is needed. |
| R30 search owner: Web/App search result UI/read model | Native A-R30-P08 scans 80 people against a 286-person R11a world and omits the board's nearby-industry choices; route units cover `?industry=` but the complete live click chain still needs evidence. | Search the same 286-person actor projection, render nearby options, and click through to the preselected R11a filter on both clients before rerunning W-R30-P03/A-R30-P08. |
| R12/R15/R16 owners: their add, invite, import pages | These are cross-check consumers of the new R11a background, not E-owned page code. | Compare the named boards in the cross-check section; fix any page-owned gaps there, then re-run on `many286`. |

**Root ledger requests for the main coordinator.** Add HANDOFF `R11-18`: “R11b App seven-view gate was formerly unrun because the simulator's saved API URL missed the line dev server. PX1 set `http://localhost:3800`, verified health, authenticated requests and 5/14/286 counts, and ran all seven native boards. All seven still have unattributed bands; see PX1 REPORT and evidence. A/B inputs above remain.” Add the same item to DEFERRED-A as an open App pixel gate with this evidence, not as a completed gate. Update HANDOFF/DEFERRED-A `R11-16` from “fixture and gate pending” to “four-state fixture and all 24+15 captures completed; zero R11a views accepted; specific A/D/B follow-ups above.” Update the two “待 R11” rows only with the actual R12/R15/R16/R30 cross-check results below, keeping unrun navigation or no-board states open. Preserve R21-B → R13 inbox candidate and R21-D → R20b `entity_draft` handoffs as independent functionality; neither was verified by pixel screenshots.

**Bridge handoff fields.** E-side version: local `line-e` commits `0776f40e0`, `d7eb7e267`, `f4dce663c` (documentation commit follows this report). Other-side impact: Web contact fixture/API, App local contact snapshot and analysis consumers, R12/R15/R16/R30 background and search links, and R21 history/content components. Unfinished: every failed view and owner listed here, plus cross-device functional read/write verification. Verification scope: local authenticated `orbit_line_e` and PX1 simulator only, controlled dev fixture, listed page comparisons and automated checks; no production, Neon, paid AI, deployment, push, or cross-device business acceptance. Root `bridge/status.md` and `bridge/handoffs.md` were read but not edited under this line's file boundary.

Targeted App network tests passed `16/16` after adding a real loading scaffold; the controlled fixture tests passed `3/3`; targeted Web network tests passed `9/9` after adding coverage for the invite profile-update card and dismissal. A Web typecheck found four concrete errors in the current branch (icon size, selected table prop, and two readonly environment assignments in the PX1 production test); those were fixed, and the repeat typecheck passed. No queued, interrupted, or timed-out check is counted as passed.

| Closeout gate | Recorded result | Failure scope and follow-up |
| --- | --- | --- |
| Web `npm test` | 7,743 tests: 6,722 pass, 10 fail, 1,011 skip. `web-full.log`; exit 1. | Three failures were the same hard-coded copy test against new R11a page strings. Text was moved to domain copy and that test then passed 7/7 in a focused rerun; the full suite was not repeated. Seven remaining names: product-surface manifest, business-card contact merge, plan-design-fixture static guard, two R12 scan tests, 0918 anchor-colour, button ratchet. All have source/test paths outside the E page scope. The plan static guard was already violated by other design-fixture consumers and now also lists E's dev-only card-service import; this extra offender is not hidden. |
| App `npm test` | 3,218 tests: 3,198 pass, 18 fail, 2 skip. `app-full.log`; exit 1. | Nine R12 add-scan failures; other names cover frozen dictionary count, ink-signal settings, R15 invite, plan overview, inbox tabs, task date conflict, tasks-unification file, plus E's hard-coded copy and offline-read inventory. E moved the two sample strings into the R11a dictionary; the focused hard-coded test then passed 5/5. The offline-read inventory still flags `src/screens/network/network-design-fixture.ts GET /api/dev/network-design-fixture` and remains an explicit new failure, not a pass. |
| Web typecheck and lint | Both exit 0; the final typecheck after the domain-copy kind correction is `web-typecheck-after.log`, lint is `web-lint-final.log`. | No type or lint error remains in the E changes. |
| App typecheck | Exit 0 after the final domain-dictionary correction; `app-typecheck-after.log`. | No type error remains in the E changes. |
| `copy:qa` | First 225 issues, after R11a domain corrections 218 issues; exit 1. `web-copyqa-final.log`, `web-copyqa-after.log`. | The remaining report has no Web/App `network` entry; issues are in other domains and are not reported as passed. |

The wrapper for final checks first stopped after Web full because zsh reserves `status`; the Web test itself completed and printed its 7,743-test summary. The wrapper was corrected, the remaining checks were run sequentially, and both events are recorded in `_evidence-e/PX1/run-01/script-errors.md`. The full Web/App logs predate the final targeted copy repairs, so their red exit codes remain the honest full-suite result. A same-version clean-base full comparison was not run; unchanged failure names are assigned by the listed source paths and the remaining new offline registry failure is explicitly open. This does not satisfy the “zero new full-suite failures” acceptance clause. The only central dictionary metadata touched was four exact `network.detail.*` kind entries, needed to check the new R11a strings; no global copy rule changed.

The SC table, per-view evidence and owner table above are the current hand-back. Main coordination must independently re-run the failed views, add R11-18 to HANDOFF and DEFERRED-A using R11b REPORT §7/§8 as source, and update R11-16 and the two “待 R11” lines from the actual cross-check results. This line did not edit the root Bridge ledger.

R21 local QA session `r21-visual-pinned` was read through the authenticated `:3800` history API: its two messages contain `role`, `text`, and `id`, with no structured `items`. The page does render `PanelCards` when an assistant message contains `items`, but `OrbitAgentScenarioView` permits one homogeneous `people`, `events`, or `todos` panel; the board's mixed person and event cards plus plan-add confirmation cannot be reconstructed from this stored text session through that DTO. A separately authenticated plan summary has one goal and no intake. This is a concrete conversation fixture/contract gap for R21 conversation boards; it is not an excuse to attribute missing cards as text data. The exact hand-back and gate results will follow the current capture.

## App API recovery steps

On the dedicated `Orbit PX1 16e` simulator, open the signed-in App's account page → server settings (`/settings/api`). Confirm the current address, set `http://localhost:3800`, tap **確認** and wait for “Server available. Orbit responded normally. You can continue.”, then tap **保存**. If the address change resets the auth scope, sign in again with the local QA account. Verify the saved address in the settings screen, `GET /api/health 200` in the `:3800` log, and `5/10` in 人脈分析 after explicitly selecting `locked5`. Repeat the variant switch and check the App's fresh `few14` and `many286` counts. Metro `:8088` alone does not establish which API server the App uses. If reinstalling the App or clearing simulator data, repeat the saved-address and sign-in checks.

At closeout, only the run-owned :3800 (PID 63336), :3320 (PID 63450), and :8088 (PID 63506) listeners were stopped; `lsof` found no remaining listener on those ports. `Orbit PX1 16e` was shut down and its data left in place. The older `Orbit Line E` simulator was already shut down. Its 17 MB recreated stub was moved to `_evidence-e/PX1/run-01/old-e-sim-offload/recreated-stub`, then its original `data` and separately parked `AssetsV2` were copied back to the device path. The restored directory is 2.6 GB, including 1.5 GB `AssetsV2`; both simulators report `Shutdown`. The external copy remains as recovery evidence. After the dev server stopped, `repos/orbits/next-env.d.ts` and `tsconfig.json` were restored by exact path from HEAD, leaving no generated tracked edits. No other line's service, device or database was changed.

## RD-25 review fixes (2026-10-20)

After the main-session review in `REVIEW.md`, line E fast-forwarded from `4a396f322` to `origin/redesign@84fdda805` with `git pull --rebase origin redesign` and fixed only the three requested code findings. Each fix has its own path-scoped commit with the required trailer. No service, simulator, database, paid AI, production endpoint, deployment, or push was used in this follow-up.

| Review item | Change and verification | Result |
| --- | --- | --- |
| S2 | Registered the exact App `GET /api/dev/network-design-fixture` consumer in `route-domain-inventory.ts` as domain `network-design-fixture`, schema version 1, `durable_normalized` read, `online_only` mutation, and `metadata_only` binary. This matches the development reader's actor/base-URL-partitioned saved snapshot without granting offline writes or registering other `/api/dev` paths. Inventory audit first reproduced the unregistered route (25/27), then passed 27/27; App typecheck passed. Commit `4b468dc2e`. | Fixed in this review round. |
| M1 | Variant GET and POST now require the resolved authenticated actor. The dev world is stored by actor ID; contacts, analysis and snapshot readers use the same actor-specific selection, and clearing one actor restores only that actor's demo view. A two-account test exercises unauthenticated 401 responses, independent variant GET/POST, contacts and analysis counts. Focused Web tests 6/6 and Web typecheck passed. Commit `43e39d6f5`. | Fixed in this review round. |
| m1 | App fixture parsing validates each list row separately using the tolerant contact-card schema and required local search fields. Invalid rows are skipped while valid rows with additional envelope/row/card fields remain readable; the actor and top-level variant checks still fail closed. Focused App tests 3/3 and App typecheck passed. Commit `4877fff45`. | Fixed in this review round. |
| S1 | The 57 main target views still have unattributed over-threshold bands, as recorded in the evidence ledger. RD-25 did not rerun or waive pixel comparisons. | **转入像素余项轮**; no pixel PASS claim. |
| M2 | Offline relaunch, list scroll restoration and the rendered “近い条件なら” click-through remain without end-to-end operation-chain evidence. RD-25 did not simulate or claim those flows. | **转入像素余项轮**; SC-03/07 stay partial. |

The earlier full-suite counts and copy QA table are historical PX1 closeout results, not results from this focused RD-25 review round. In particular, resolving S2's focused inventory audit does not turn the earlier App full-suite exit code into a pass. Both clients' TypeScript checks returned exit 0 after their respective code edits; the final worktree and commit checks are recorded with the review-round handoff.
