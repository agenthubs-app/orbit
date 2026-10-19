# PX1 board preflight — run 01

The five current view suites resolve all 57 referenced boards by index and title. The read-only board scans and per-board data inventories are in `_evidence-e/PX1/run-01/preflight-{web-R11a,app-R11a,app-R11b,web-R21,app-R21}.{json,md}`. An index is accepted only when its title and phone/Web kind match the suite entry. The scans found no internal numeric consistency warnings. Token counts below are computed board values, including frame and shell values; a near match is not a pixel attribution.

| Suite | Boards | Exact | Near | Missing | State and data entry |
| --- | ---: | ---: | ---: | ---: | --- |
| R11a Web | 24 | 1507 | 6 | 61 | `empty`, `locked5`, `many286`, plus loading; `/api/contacts/summary`, `/api/contacts/page`, actor-scoped design contact detail endpoint. |
| R11a App | 15 | 744 | 1 | 95 | Same actor and four-state contact projection, native snapshot; `design=` opens only the specified development midstate. |
| R11b App | 7 | 312 | 0 | 50 | `locked5`, `few14`, `many286`; `/api/network/analysis` and the matching actor-scoped contact projection. |
| R21 Web | 6 | 306 | 4 | 20 | Signed-in actor session/history routes. No conversation content fixture has yet been validated against the boards. |
| R21 App | 5 | 229 | 4 | 31 | Same actor session/history data through native App. No conversation content fixture has yet been validated against the boards. |

## Five checks

1. **Numbers and state.** The R11b person fixture is the sole person/industry source for R11a projection. Authenticated local responses for all four variants agree between summary, page, analysis, and design fixture: 0, 5, 14, 286. The `many286` page now returns the board's nine first-page rows; the total remains 286. The App has displayed `5/10`, `286人`, and `286人 · 今月 +24` after reading :3800. Board-specific tab/source/density counts still require the pixel run and visual inspection.
2. **Element sources.** R11a summary/counts come from the contact projection, rows/details from its actor-scoped payload, and connection/fit/history from explicit sample fields. R11b analysis reads the same selected world. R21 suggestions are page copy; history and messages must come from normal actor-scoped APIs. An R21 board entity card is not considered satisfied by copy alone. The generated Markdown inventories list each board element for final source review.
3. **Tokens and computed style.** The scan found 15 near and 257 missing values across all suites. Each needs inspection in the cropped comparison. `[raster]` is limited to verified glyph or 1–3 px rendering residuals; structural gaps, dimensions, and spacing remain failures. `[contrast]` needs an entry in `contrast-substitutions.json`. No token gap is accepted by this preflight.
4. **Component, width, theme, shell.** Web comparisons use complete pages including the R05 shell at each board's 1440/1024/390 width and light/dark theme. App comparisons use the new 390×844 native iPhone 16e, its system status bar, and R31 kit components. R21 drawer direction depends on an A-line left-opening component; those boards remain pending if the component is absent.
5. **Fixture and midstate entry.** R11a Web URLs select controlled design people and action steps for previous values, unlink, filter, and edit. App development paths select add, filter, industry picker, delete confirmation, and unlink without shipping those entry states in production. R11b App seven entries use explicit variants and native paths. Each actual gate must record the selected variant, signed-in actor scope, path, theme, board index, and screenshot. A board with no real reachable content state remains unpassed.

The fixture and UI gates use the local QA account. The screenshots and response summaries are outside the repository in `_evidence-e/PX1/run-01/`; no credentials are copied into this document.
