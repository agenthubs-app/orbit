# Sprint 0031 run-01 bottleneck selection

The immutable baseline contains 900 formal samples: 90 Release App samples and
810 production Web samples. Every cohort contains runs 1–10 after three warmups,
and no formal sample failed. Percentiles use the mean of sorted positions 5 and
6 for p50 and position 10 for p95.

Exactly these three measured bottlenecks are selected.

| ID | End | Primary metric | Baseline p50 / p95 | Trigger evidence | Minimum change and rollback boundary |
| --- | --- | --- | --- | --- | --- |
| `APP_RENDER_INBOX_LIST_WINDOW` | App | `app.inbox/app.react_commit` | 33.2177 / 40.1912 ms | A Release render-to-effect commit exceeds the 16.7 ms render-convergence threshold. The screen-private feed projects every inbox item into one `ScrollView`; this controlled fixture has 40 conversations plus reminder/signal rows. | Bound only the initially rendered rows in `UnifiedFeedList` and expose the remaining rows through an accessible load-more control. Revert only the screen-private window and its test; no shared hook, DTO, request, permission, or storage behavior changes. |
| `WEB_INLINE_CSS_RSC` | Web | `web.agent/html_rsc_decoded_bytes` | 319,633 / 319,633 bytes | Every measured core page exceeds the 250 KiB decoded HTML/RSC trigger. `OrbitReferenceStyles` repeats 96,998 bytes of override CSS in SSR/RSC, while the Agent page repeats another 32,420 bytes of console CSS. | Generate cacheable static CSS assets during the existing reference-CSS build and emit links when the artifacts exist. Keep the current inline content as the missing-artifact fallback. Revert the generator/link changes and generated assets together. |
| `WEB_AGENT_MARKDOWN_SPLIT` | Web | `web.agent/closed_panel_eager_js_bytes` | 144,382 / 144,382 bytes | The production Agent client-reference manifest places the 144,382-byte Markdown/GFM chunk in the first-load chunk list although the empty first view has no assistant Markdown to render. Total Agent first-load JS decoded bytes are 964,059. | Move the existing Markdown renderer into one `next/dynamic` module. The loading fallback preserves readable plain text while the renderer arrives. Revert the extracted module and dynamic import together; message semantics and request flow stay unchanged. |

The Markdown cohort is a production-build measurement: for each formal Agent
run it sums first-load JavaScript resources containing the Markdown/GFM runtime
signature. The baseline client-reference manifest names chunk `2454`, whose
production file is 144,382 bytes. No asset body or URL is stored in raw evidence.

## Rejected candidates

- `APP_SQLITE_SNAPSHOT_L1`: no repeated same-key read was observed. Schedule and
  profile snapshot p50 values are 4.7675 ms and 4.5396 ms, both below 20 ms.
- `APP_SCOPED_GET_COORDINATION`: no navigation emitted two concurrent GETs for
  the same actor/base URL/path. Inbox requests target different resources.
- `WEB_API_FOCUSED_READ`: the measured local non-provider boundary p95 is
  16.1 ms, below the 500 ms trigger, with no repeated full-table read trace.

## Impact boundary

GitNexus reports `AgentMarkdown` and `OrbitRealAgent` as LOW risk. The App's
screen-private `UnifiedFeedList` is absent from the current index and therefore
has UNKNOWN graph risk; its direct screen test and complete inbox regression
suite cover the change. `OrbitReferenceStyles` is CRITICAL because it has 40
direct page consumers across 17 execution flows. The CSS optimization therefore
keeps byte-identical inline fallback content and requires production build plus
core-page, account, contacts, event, profile, and Agent smoke coverage.
