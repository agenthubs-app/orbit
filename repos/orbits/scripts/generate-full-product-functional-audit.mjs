import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE_ROOT = path.resolve(WEB_ROOT, "../..");
const MOBILE_ROOT = path.join(WORKSPACE_ROOT, "repos/orbit-app");
const OUTPUT_ROOT = path.join(
  WORKSPACE_ROOT,
  "docs/audits/full-product-functional-audit",
);
const WEB_APP_ROOT = path.join(WEB_ROOT, "app");
const MOBILE_APP_ROOT = path.join(MOBILE_ROOT, "app");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const WEB_EVENT_NAMES = new Set([
  "onclick",
  "onchange",
  "oninput",
  "onkeydown",
  "onkeyup",
  "onpointerdown",
  "onpointerup",
  "onsubmit",
]);
const MOBILE_EVENT_NAMES = new Set([
  "onpress",
  "onlongpress",
  "onchangetext",
  "onchange",
  "onvaluechange",
  "onsubmitediting",
  "onselectionchange",
  "onrefresh",
]);
const CALLBACK_PROP_PATTERN =
  /^on(?:approve|cancel|change|close|confirm|continue|create|delete|dismiss|edit|error|execute|import|open|press|refresh|reject|remove|retry|save|scan|select|send|submit|success|toggle|transition|undo|upload|valuechange)/i;
const HTML_CONTROLS = new Set([
  "a",
  "button",
  "form",
  "input",
  "select",
  "summary",
  "textarea",
]);
const NATIVE_CONTROLS = new Set([
  "button",
  "picker",
  "pressable",
  "switch",
  "textinput",
  "touchablehighlight",
  "touchablenativefeedback",
  "touchableopacity",
  "touchablewithoutfeedback",
]);
const OVERLAY_TAG_PATTERN =
  /(?:^|\.)(?:AlertDialog|BottomSheet|Dialog|Drawer|Menu|Modal|Popover|Sheet|Toast|Tooltip)$/;
const WRITE_HINT =
  /(approve|cancel|confirm|create|delete|execute|import|merge|register|reject|remove|save|send|submit|transition|undo|update|upload)/i;
const BROWSER_SMOKE_WEB_ROUTES = new Set([
  "/",
  "/app",
  "/app/account/forgot-password",
  "/app/account/login",
  "/app/account/mobile-google",
  "/app/account/signup",
  "/app/admin/access",
  "/app/events",
  "/app/events/[id]",
  "/app/login-admin",
  "/app/o/[slug]",
  "/app/register",
  "/dev/agent-test-report",
  "/dev/capabilities",
  "/dev/capabilities/[slug]",
  "/dev/foundation/domain",
  "/dev/foundation/mock-registry",
  "/dev/foundation/style",
  "/dev/knowledge",
  "/dev/orbit-ai/trace",
]);
const LIVE_PROFILE_RUNTIME_SURFACE = "web:/app/profile";
const LIVE_EVENT_REGISTRATION_RUNTIME_SURFACE = "web:/app/events/[id]/register";
const LIVE_BUSINESS_CARD_RESTRICTED_RUNTIME_SURFACE = "web:/app/contacts/new";
const LIVE_CONTACTS_LIST_RUNTIME_SURFACE = "web:/app/contacts";
const LIVE_CONTACT_DETAIL_RUNTIME_SURFACE = "web:/app/contacts/[id]";
const LIVE_MOBILE_CONTACT_ACQUISITION_RUNTIME_SURFACE = "mobile:/contacts/new";
const LIVE_MOBILE_AUTH_RUNTIME_SURFACES = new Set([
  "mobile:/account",
  "mobile:/account/login",
  "mobile:/account/permissions",
  "mobile:/profile",
]);
const HANDLER_BOUND_RUNTIME_EVIDENCE_INTERACTIONS = new Set([
  "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#重新提交请求 / Retry request",
]);
const LIVE_MOBILE_ADDITIONAL_RUNTIME_SURFACES = new Map([
  [
    "mobile:/ai",
    {
      entryBehavior: "expo-web-history-drawer-entry-verified",
      runtimeEvidence: [
        "real persisted AI history drawer opened from the Orbit AI home",
        "history row exposed separate open and delete buttons without nested-button hydration errors",
        "opening a history row navigated to the matching persisted conversation",
        "repeated close and reopen produced zero new browser console errors",
      ],
      verificationCase: "expo-ai-history-persistence-hydration-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-ai-history-persistence",
    },
  ],
  [
    "mobile:/ai/[id]",
    {
      entryBehavior: "expo-web-persisted-ai-conversation-entry-verified",
      runtimeEvidence: [
        "real persisted conversation opened from the AI history drawer",
        "conversation ID and saved messages were read from the live API",
        "stale contact references remained explicit links and did not create contacts",
      ],
      verificationCase: "expo-ai-history-persistence-hydration-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-ai-conversation-readback",
    },
  ],
  [
    "mobile:/chat",
    {
      entryBehavior: "expo-web-empty-relationship-chat-entry-verified",
      runtimeEvidence: [
        "actor-owned relationship conversation collection returned empty",
        "empty state rendered without a fabricated relationship conversation",
      ],
      verificationCase: "expo-dynamic-missing-data-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-chat-empty-boundary",
    },
  ],
  [
    "mobile:/chat/[id]",
    {
      entryBehavior: "expo-web-missing-chat-entry-verified",
      runtimeEvidence: [
        "unknown relationship conversation ID returned a localized failure boundary",
        "no fallback conversation or draft success state was synthesized",
      ],
      verificationCase: "expo-dynamic-missing-data-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-chat-missing-boundary",
    },
  ],
  [
    "mobile:/contacts/[id]",
    {
      entryBehavior: "expo-web-missing-contact-entry-verified",
      runtimeEvidence: [
        "stale contact ID from persisted AI history returned NOT_FOUND",
        "the detail route rendered no fallback contact identity or relationship data",
      ],
      verificationCase: "expo-dynamic-missing-data-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-contact-missing-boundary",
    },
  ],
  ...[
    "mobile:/events",
    "mobile:/events/[id]",
    "mobile:/events/[id]/attendees",
    "mobile:/events/[id]/register",
  ].map((surfaceId) => [
    surfaceId,
    {
      entryBehavior: "expo-web-actor-owned-live-event-entry-verified",
      runtimeEvidence: [
        "actor-owned private event list and encoded dynamic detail opened from the live API",
        "title, organizer, source metadata, and participant availability rendered in their own semantic fields",
        "missing attendee source rendered an explicit no-roster boundary with import actions withheld",
        "standard registration saved, refreshed, cancelled, and refreshed the same actor-scoped record",
      ],
      verificationCase:
        "expo-live-event-registration-and-roster-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-live-event-chain",
    },
  ]),
  ...["mobile:/party", "mobile:/party/checkin", "mobile:/party/graph"].map(
    (surfaceId) => [
      surfaceId,
      {
        entryBehavior: "expo-web-party-live-data-boundary-entry-verified",
        runtimeEvidence: [
          "party mode resolved only from the selected live event and its available roster",
          "no fixed access code was generated",
          "check-in exposed the missing service/write boundary instead of local success",
          "graph center and status copy described available relationship data without claiming attendance",
        ],
        verificationCase: "expo-party-no-synthetic-checkin-2026-07-29",
        verificationConclusion:
          "runtime-partially-verified-expo-party-truthful-boundary",
      },
    ],
  ),
  [
    "mobile:/o/[slug]",
    {
      entryBehavior: "expo-web-public-organizer-slug-entry-verified",
      runtimeEvidence: [
        "known public organizer slug read only the approved public event catalogue",
        "organizer identity used the public workspace account instead of source-note text",
        "private actor event did not appear in the public organizer result",
        "unknown slug rendered a zero-event not-found state without verified badge or first-event fallback",
      ],
      verificationCase: "expo-organizer-public-private-isolation-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-organizer-public-isolation",
    },
  ],
  [
    "mobile:/register",
    {
      entryBehavior: "expo-web-missing-register-context-entry-verified",
      runtimeEvidence: [
        "direct registration entry with no event code rendered a missing-selection state",
        "no demo event or registration payload was synthesized",
        "the visible exit navigated to the live event catalogue",
      ],
      verificationCase: "expo-register-invite-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-register-missing-context",
    },
  ],
  [
    "mobile:/register/[code]",
    {
      entryBehavior: "expo-web-live-register-preview-entry-verified",
      runtimeEvidence: [
        "encoded actor-owned event ID loaded the matching registration preview",
        "preview preserved the event title, time, location, invite code, and operation boundary",
        "continue navigated to the matching standard registration route",
      ],
      verificationCase: "expo-register-invite-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-register-live-preview",
    },
  ],
  [
    "mobile:/schedule",
    {
      entryBehavior: "expo-web-live-schedule-entry-verified",
      runtimeEvidence: [
        "actor-owned event rendered in both highlight and timeline groups",
        "the canonical event title remained separate from source-note metadata",
        "event card navigated to the matching encoded schedule preview",
      ],
      verificationCase: "expo-schedule-title-preview-runtime-2026-07-29",
      verificationConclusion: "runtime-partially-verified-expo-live-schedule",
    },
  ],
  [
    "mobile:/schedule/events/[id]",
    {
      entryBehavior: "expo-web-live-schedule-preview-entry-verified",
      runtimeEvidence: [
        "encoded actor-owned event ID loaded a read-only schedule preview",
        "preview preserved title, status, time, location, provenance, and no-external-write boundary",
        "return actions navigated independently to schedule and event catalogue",
      ],
      verificationCase: "expo-schedule-title-preview-runtime-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-live-schedule-preview",
    },
  ],
  [
    "mobile:/settings",
    {
      entryBehavior: "expo-web-settings-destination-entry-verified",
      runtimeEvidence: [
        "settings rendered account, permission, and server destinations",
        "server destination navigated to the API settings route",
      ],
      verificationCase: "expo-api-settings-health-runtime-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-settings-destinations",
    },
  ],
  [
    "mobile:/settings/api",
    {
      entryBehavior: "expo-web-api-settings-write-readback-entry-verified",
      runtimeEvidence: [
        "current API URL loaded from persisted Web settings",
        "saving the same normalized URL returned explicit Chinese success feedback",
        "hard navigation read back the same URL",
        "health check reached the configured production server and rendered localized success without internal service names",
      ],
      verificationCase: "expo-api-settings-health-runtime-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-api-settings-persistence",
    },
  ],
  [
    "mobile:/account/signup",
    {
      entryBehavior: "expo-web-signup-validation-entry-verified",
      runtimeEvidence: [
        "mobile signup rendered email/password fields and explicit Google/login alternatives",
        "invalid email plus short password stayed on the form with localized validation feedback",
        "password visibility toggle changed its accessible name from 显示密码 to 隐藏密码",
        "existing-account action navigated to the login route without creating an account",
      ],
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-signup-validation",
    },
  ],
  [
    "mobile:/account/forgot-password",
    {
      entryBehavior: "expo-web-password-reset-restricted-entry-verified",
      runtimeEvidence: [
        "password recovery disclosed that the deployment has no reset service",
        "the screen collected no email, verification code, or replacement password",
        "the screen stated that no email or code was sent",
        "the only action navigated back to login with the return path",
      ],
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-password-reset-restricted",
    },
  ],
  [
    "mobile:/account/mobile-google",
    {
      entryBehavior: "expo-web-mobile-google-fallback-entry-verified",
      runtimeEvidence: [
        "direct broker callback navigation with invalid code/state redirected to mobile login",
        "no session, provider success, or account identity was synthesized",
      ],
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-mobile-google-fallback",
    },
  ],
  ...["mobile:/admin", "mobile:/admin/events", "mobile:/admin/access"].map(
    (surfaceId) => [
      surfaceId,
      {
        entryBehavior: "expo-web-truthful-readonly-admin-entry-verified",
        runtimeEvidence: [
          "actor-owned event data remained read-only and opened the matching real event detail where a valid private detail route existed",
          "storage implementation wording was replaced by controlled Chinese event context",
          "no local event-creation draft or simulated write action remained",
          "no member email was inferred when the profile API returned no explicit email",
        ],
        verificationCase: "expo-admin-truthful-boundaries-2026-07-29",
        verificationConclusion:
          "runtime-partially-verified-expo-admin-readonly-boundary",
      },
    ],
  ),
  [
    "mobile:/login-admin",
    {
      entryBehavior: "expo-web-account-backed-admin-entry-verified",
      runtimeEvidence: [
        "the screen read the current validated account session",
        "the signed-in action opened the read-only admin surface",
        "no email field, local sent state, direct permission bypass, or simulated magic-link success remained",
      ],
      verificationCase: "expo-admin-truthful-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-admin-account-entry",
    },
  ],
  [
    "mobile:/platform",
    {
      entryBehavior: "expo-web-public-catalogue-platform-entry-verified",
      runtimeEvidence: [
        "the surface read 13 records from the dedicated public event catalogue instead of the current actor's private event collection",
        "the private audit event and actor profile/dashboard metrics did not appear",
        "three current public records rendered with controlled Chinese context and ten historical records remained aggregate-only",
        "approval, rejection, publishing, verified-account state, and broken private-detail navigation were absent because no authenticated moderation/public-detail contract exists",
      ],
      verificationCase: "expo-platform-public-catalogue-boundary-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-platform-public-readonly-boundary",
    },
  ],
  [
    "mobile:/agent",
    {
      entryBehavior: "expo-web-actor-scoped-agent-actions-entry-verified",
      runtimeEvidence: [
        "the actor-scoped Agent action endpoint returned zero pending actions",
        "the page preserved the fixed safety policy and truthful empty action state",
        "the fixed Maya, Diego, and Aiko sandbox fixtures, English rationales, confirmation buttons, and prebuilt audit history did not render",
      ],
      verificationCase: "expo-agent-no-fixed-sandbox-data-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-agent-actor-scoped-empty-state",
    },
  ],
  [
    "mobile:/contacts",
    {
      entryBehavior:
        "expo-web-relationship-workbench-navigation-entry-verified",
      runtimeEvidence: [
        "the overview rendered six distinct relationship destinations without loading a hidden fallback contact list",
        "the primary graph card navigated to /contacts/graph",
        "the destination preserved the actor-scoped zero-connection state",
      ],
      verificationCase: "expo-empty-relationship-surface-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-relationship-workbench-navigation",
    },
  ],
  ...[
    "mobile:/dashboard",
    "mobile:/contacts/dashboard",
    "mobile:/contacts/graph",
    "mobile:/contacts/intros",
    "mobile:/contacts/pipeline",
  ].map((surfaceId) => [
    surfaceId,
    {
      entryBehavior: "expo-web-actor-scoped-empty-relationship-entry-verified",
      runtimeEvidence: [
        "the authenticated actor had no contacts, connections, introductions, pipeline records, or relationship dashboard aggregates",
        "the surface rendered its domain-specific empty title and recovery copy",
        "no fallback person, count, opportunity, connection, or action was synthesized",
      ],
      verificationCase: "expo-empty-relationship-surface-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-actor-scoped-empty-relationship-boundary",
    },
  ]),
  [
    "mobile:/contacts/list",
    {
      entryBehavior:
        "expo-web-empty-contact-list-and-suggestions-entry-verified",
      runtimeEvidence: [
        "all contact status counts remained zero and the list rendered 暂无联系人",
        "runtime first reproduced three fixed live search suggestions that claimed actor evidence despite a zero-result graph",
        "after repair the suggestion API returned an empty state and no evidence-backed recommendation card rendered",
        "generic search intent and industry filters remained available without claiming stored evidence",
      ],
      verificationCase: "expo-empty-relationship-surface-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-empty-contact-search-boundary",
    },
  ],
  ...["mobile:/today", "mobile:/contacts/all-actions"].map((surfaceId) => [
    surfaceId,
    {
      entryBehavior: "expo-web-actor-scoped-empty-agent-ledger-entry-verified",
      runtimeEvidence: [
        "the unified Agent ledger returned zero actor-owned operations",
        "the surface rendered its route-specific title and explicit empty state",
        "no operation, transition, audit history, or success state was synthesized",
      ],
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-empty-agent-ledger-boundary",
    },
  ]),
  [
    "mobile:/followups",
    {
      entryBehavior: "expo-web-actor-scoped-empty-followup-entry-verified",
      runtimeEvidence: [
        "the actor-owned task, reminder, and message-draft queues all returned zero records",
        "task-candidate and reminder-candidate generation were exercised independently",
        "both generation paths returned explicit empty review results without claiming a write or external action",
        "no fallback task, reminder, recipient, or message draft was synthesized",
      ],
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-empty-followup-generation-boundary",
    },
  ],
  [
    "mobile:/inbox",
    {
      entryBehavior: "expo-web-actor-scoped-empty-inbox-entry-verified",
      runtimeEvidence: [
        "the actor-owned inbox rendered zero alerts, signals, reminders, and conversations",
        "the new-followup action opened a review-only composer without sending or scheduling anything",
        "the blank recipient path stayed on the composer with 先写收件人 and created no thread",
        "the default body used one truthful generic greeting after the duplicate-greeting repair",
      ],
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-empty-inbox-compose-boundary",
    },
  ],
  ...["mobile:/", "mobile:/home"].map((surfaceId) => [
    surfaceId,
    {
      entryBehavior: "expo-web-canonical-ai-entry-redirect-verified",
      runtimeEvidence: [
        "direct navigation resolved to the canonical /ai route",
        "the Orbit AI composer rendered without a duplicate home shell",
        "the empty prompt kept the send action disabled",
      ],
      verificationCase: "expo-entry-alias-and-home-events-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-canonical-ai-entry-redirect",
    },
  ]),
  [
    "mobile:/[...legacy]",
    {
      entryBehavior: "expo-web-allowlisted-legacy-redirect-entry-verified",
      runtimeEvidence: [
        "the supported /app/events alias resolved to /events and preserved the actor-owned event catalogue",
        "an unknown /app/not-a-real-destination path resolved to /ai",
        "the unknown query marker was not surfaced as data or injected into the AI composer",
      ],
      verificationCase: "expo-entry-alias-and-home-events-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-legacy-allowlist-boundary",
    },
  ],
  [
    "mobile:/home/events",
    {
      entryBehavior: "expo-web-actor-scoped-home-events-entry-verified",
      runtimeEvidence: [
        "the route rendered the actor's one private event and zero historical events",
        "selecting 历史 0 changed the local result to 0 / 1 and rendered a truthful no-match state",
        "returning to 全部 1 restored the same event",
        "the event card opened the matching encoded actor-owned detail",
      ],
      verificationCase: "expo-entry-alias-and-home-events-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-home-events-filter-and-detail",
    },
  ],
]);
const LIVE_WEB_ADDITIONAL_RUNTIME_SURFACES = new Map([
  [
    "web:/dev/capabilities/[slug]",
    {
      entryBehavior:
        "authenticated-browser-current-debug-api-probe-slugs-verified",
      runtimeEvidence: [
        "contact detail and relationship profile slugs rendered their exact intended capability panels",
        "five normalized form implementations and eight exact route occurrences issued their declared GET/PATCH requests",
        "contact query variants and edit bodies were preserved while success, controlled failure, and validation envelopes rendered in the UI",
        "the disposable actor created zero live domain records and was cleaned to activeAfter=0",
      ],
      verificationCase:
        "web-debug-api-probe-method-query-ui-2026-07-30",
      verificationConclusion:
        "runtime-partially-verified-current-debug-api-probe-method-query-ui",
    },
  ],
  [
    "web:/app/admin",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-admin-dashboard-navigation-verified",
      runtimeEvidence: [
        "the dashboard rendered one actor-owned event and the authenticated profile without unsupported operational metrics",
        "desktop Events opened /app/admin/events, Dashboard returned to /app/admin, and Exit admin opened /app",
        "at 390x844 the visible mobile Events and Dashboard tabs preserved the exact routes without a horizontal-overflow signal",
      ],
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-actor-scoped-admin-dashboard",
    },
  ],
  [
    "web:/app/admin/events",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-admin-events-navigation-verified",
      runtimeEvidence: [
        "the events route rendered the same one actor-owned event and authenticated profile as the dashboard",
        "desktop Dashboard and Events navigation round-tripped between the two exact Admin routes",
        "at 390x844 the visible mobile Dashboard and Events tabs round-tripped without replacing the actor-owned source record",
      ],
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-actor-scoped-admin-events",
    },
  ],
  [
    "web:/app/platform",
    {
      entryBehavior:
        "authenticated-browser-platform-provider-and-role-fail-closed-verified",
      runtimeEvidence: [
        "the route displayed Platform admin is unavailable before presenting any personal record as platform-wide data",
        "expanding source details exposed PLATFORM_ADMIN_PROVIDER_UNAVAILABLE, platform-wide-provider:unavailable, and platform-admin-role:unverified",
        "Return to personal workspace opened /app/home and Open organizer admin opened /app/admin",
      ],
      verificationCase: "web-admin-platform-truth-boundary-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-platform-provider-role-boundary",
    },
  ],
  [
    "web:/app/events",
    {
      entryBehavior:
        "authenticated-browser-public-event-catalogue-search-filter-map-verified",
      runtimeEvidence: [
        "the public catalogue rendered all 13 approved events before filtering",
        "exact-code and nonexistent searches produced one exact result and a truthful recoverable empty state",
        "upcoming, active, ended, topic, and combined filters returned source-backed counts without fallback events",
        "the map preserved all 13 located events, selected EVT01 from both list and pin controls, and opened its exact detail",
        "localized date tokens rendered once as 2月15日 rather than the duplicated 2月15日日 found before repair",
        "before repair, scenario=empty replaced all 13 approved events with a synthetic no-events state on the production public route",
        "after repair, the identical URL preserved all 13 events plus the catalogue search, filters, and map controls",
      ],
      verificationCase: "web-public-event-catalogue-query-isolation-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-public-event-catalogue-controls",
    },
  ],
  [
    "web:/app/events/[id]",
    {
      entryBehavior:
        "authenticated-browser-source-backed-public-event-detail-lifecycle-verified",
      runtimeEvidence: [
        "EVT01 resolved to canonical event_01 with the generated 50-person roster and current registration state",
        "matchmaking request/retry/reverse-request and slot transitions converged on one stable scheduled request",
        "post-event follow-up preserved duplicate-contact resolution, explicit confirmation, unsent draft state, and core-ID idempotency",
        "roster expand/collapse, organizer navigation, replay, Agent context, and browser-history return all preserved the exact event identity",
        "all 42 exact audit rows were deleted after verification while three unrelated pre-existing Agent runs remained",
        "after cleanup the same actor immediately lost attendee names, matchmaking candidates, follow-up, and replay access; the ended-event boundary exposed no dead registration link",
        "source inspection found that a public scenario query still reached private-detail and registration-guide fixture inputs even though production mode was already server-owned",
        "after query isolation, the actor-owned event rendered byte-for-byte equivalent final DOM with and without scenario=empty while retaining the legitimate language query",
      ],
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-public-event-detail-lifecycle",
    },
  ],
  [
    "web:/app/o/[slug]",
    {
      entryBehavior:
        "authenticated-browser-public-catalogue-organizer-projection-verified",
      runtimeEvidence: [
        "the exact EVT01 organizer slug resolved Orbit 人脉测试空间 instead of an empty route state",
        "the page rendered 13 approved-catalogue events and cumulative participantCount 500",
        "hard-coded 12, 4,200+, and satisfaction claims were absent",
        "the public projection stripped attendee names, actor registration state, and private roster data",
        "the EVT01 card opened the exact event detail and its back control returned to the organizer source",
        "返回活动 exited the organizer surface to the complete 13-event catalogue",
        "an unknown public slug terminated at the public-catalogue boundary instead of entering private event storage",
        "the not-found boundary rendered complete Chinese and English copy without a verified badge, event card, or fallback organizer",
        "source details exposed the dedicated not-found evidence and the recovery action restored all 13 catalogue events",
        "before repair, mode=mock selected an internal fixture and rendered its organizer, event, and verified badge on the public route",
        "after repair, public mode/scenario query parameters could neither select mock data nor replace an exact catalogue organizer with a synthetic failure state",
      ],
      verificationCase:
        "web-public-organizer-query-control-boundary-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-public-catalogue-organizer",
    },
  ],
  [
    "web:/app/home",
    {
      entryBehavior: "authenticated-browser-actor-scoped-home-entry-verified",
      runtimeEvidence: [
        "the home route rendered the authenticated actor's one private event",
        "the summary labelled the record as one event rather than inventing a registration",
        "the event card opened its encoded actor-owned dynamic detail",
      ],
      verificationCase: "web-home-private-event-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-actor-scoped-home-event",
    },
  ],
  [
    "web:/app/home/events",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-home-events-entry-verified",
      runtimeEvidence: [
        "the route rendered one upcoming actor-owned private event and zero historical events",
        "selecting 历史 0 rendered a truthful empty result before 全部 restored the same event",
        "the restored event opened the exact encoded dynamic detail",
      ],
      verificationCase: "web-home-private-event-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-home-events-filter-and-detail",
    },
  ],
  [
    "web:/app/today",
    {
      entryBehavior:
        "authenticated-browser-today-empty-ledger-and-schedule-boundary-verified",
      runtimeEvidence: [
        "the actor-scoped decision ledger rendered zero items without fallback decisions",
        "the actor's private event remained a read-only review arrangement with an encoded detail link",
        "opening the meeting action rendered an explicit unconfigured-service boundary",
        "the boundary exposed no contact choice, date, topic, calendar write, or invitation action",
      ],
      verificationCase: "web-today-meeting-service-boundary-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-today-meeting-service-boundary",
    },
  ],
  [
    "web:/app/agent",
    {
      entryBehavior:
        "authenticated-browser-actor-isolated-agent-entry-verified",
      runtimeEvidence: [
        "the authenticated actor loaded an empty chat-history sidebar instead of the 13 sessions previously leaked from the deployment-wide workspace",
        "the relationship workspace preserved the actor's truthful zero-change state",
        "refreshing the workspace kept the same actor-scoped zero state without creating a session or operation",
        "unauthenticated session-list and session-delete requests both failed with 401 before storage access",
        "a new read-only conversation could be selected, pinned, renamed, refreshed, and restored from actor-scoped live storage",
        "renaming exposed explicit save and cancel controls; cancel wrote nothing and refresh retained the original name",
        "deletion opened an accessible irreversible-action confirmation, its keep action preserved the conversation, and confirmed deletion survived refresh",
        "the same session id was absent from the second actor before deletion and from both actors after cleanup",
        "desktop New chat cleared the selected transcript and session URL while retaining all six persisted history rows",
        "the focusable history separator exposed min, max, current value, and orientation; ArrowRight, Home, and End changed the rendered width to the exact announced values",
        "a live event recommendation disclosed four unique source records from orbit-ai and events with exact evidence ids and source time; refresh retained the same count",
        "the source disclosure opened by pointer and Enter, closed by Space, normalized duplicate persisted references, and left no session or feedback record after cleanup",
        "at 390x844 the Agent top bar exposed Chat history and Open menu while keeping the global inbox trigger hidden",
        "the mobile history drawer exposed a named modal dialog, focused Close, wrapped Shift+Tab and Tab, and restored focus to Chat history after Escape",
        "the mobile drawer restored the actor-owned Undo Audit transcript and session URL after reload; New chat removed only active state and kept all six history rows",
        "one actor-owned internal task proposal moved from awaiting confirmation to deferred to rejected while task storage, outbox, and receipts stayed unchanged",
        "a repeated Later control on the deferred action exposed a conflict and raw English error; shared ledger presentation rules removed the invalid control and localized stale-state errors across Agent Chat and Today",
        "two actor-owned awaiting-confirmation task proposals each moved both Run and action to canceled while outbox, receipts, and matching task records remained zero for actor A and both Runs were absent for actor B",
        "the cancellation control used request-language copy and a pending label, disappeared after completion, survived exact-session reload, and both temporary sessions were removed from the provider",
      ],
      verificationCase: "web-agent-session-actor-isolation-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-agent-session-actor-isolation",
    },
  ],
  [
    "web:/app/chat",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-chat-empty-and-not-found-states-verified",
      runtimeEvidence: [
        "the authenticated zero-contact actor rendered a truthful no-chat-context state instead of the 40-plus deployment-global conversations previously exposed",
        "the empty boundary named conversations, assists, summaries, profile updates, privacy controls, and sharing previews as unavailable without source evidence",
        "direct navigation to the previously leaked conversation_seed_069 rendered Conversation not found and explicitly refused to substitute another person's thread, summary, context, or suggestion",
        "Reload Orbit AI returned to the same actor-scoped empty state without creating a conversation or message",
      ],
      verificationCase: "web-chat-workspace-actor-isolation-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-chat-workspace-actor-isolation",
    },
  ],
  [
    "web:/app/followups",
    {
      entryBehavior:
        "authenticated-browser-canonical-today-day-view-redirect-verified",
      runtimeEvidence: [
        "the retired Follow-ups deep link returned a 307-compatible navigation into /app/today?view=day as required by the Today × Schedule merge",
        "the destination rendered the canonical authenticated Today workspace in its day view",
        "the destination preserved the actor's zero decision ledger and one source-backed private-event arrangement without reviving the retired Follow-ups UI",
      ],
      verificationCase: "web-today-compatibility-routes-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-followups-today-compatibility-route",
    },
  ],
  [
    "web:/app/contacts/all-actions",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-empty-operation-ledger-verified",
      runtimeEvidence: [
        "the authenticated actor rendered the canonical relationship navigation and operation-ledger page",
        "the actor-scoped ledger contained zero entries and exposed no fallback operation, status filter, transition, draft, evidence chip, or synthetic count",
        "the empty copy stated that future Orbit writes would appear in this ledger instead of claiming that any write had already occurred",
      ],
      verificationCase: "web-all-actions-empty-ledger-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-all-actions-empty-ledger",
    },
  ],
  [
    "web:/app/contacts/dashboard",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-empty-relationship-dashboard-verified",
      runtimeEvidence: [
        "the dashboard rendered zero actor-scoped contacts without relationship metrics, recommendations, or fallback identities",
        "the empty boundary explained that the dashboard would derive from real records only after a contact is added",
        "添加联系人 opened the existing fail-closed import hub without creating a contact",
      ],
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-empty-relationship-dashboard",
    },
  ],
  [
    "web:/app/contacts/graph",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-empty-relationship-graph-verified",
      runtimeEvidence: [
        "the graph reported zero contacts and zero events with no node, edge, identity, or relationship claim",
        "放大 changed the local scale from 100% to 120%",
        "缩小 restored the local scale to 100%",
        "the relationship sidebar opened the actor-scoped introduction ledger",
      ],
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-empty-relationship-graph",
    },
  ],
  [
    "web:/app/contacts/intros",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-empty-introduction-ledger-and-picker-verified",
      runtimeEvidence: [
        "the introduction ledger kept all, draft, and sent counts at zero without deriving history from contacts",
        "the three zero-count filters each preserved the truthful no-match state",
        "发起引荐 opened a draft-only composer whose save action stayed disabled",
        "the first contact picker initially reproduced a blank-search dead end",
        "after repair the zero-contact picker explained that two source-backed contacts are required and exposed 添加联系人",
        "添加联系人 opened the fail-closed import hub, while 取消 closed the unchanged composer without a write",
      ],
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-empty-introduction-ledger-and-picker",
    },
  ],
  [
    "web:/app/contacts/pipeline",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-empty-read-only-pipeline-verified",
      runtimeEvidence: [
        "the pipeline reported zero source-backed contacts",
        "pending, progressing, and collaborated groups all remained at zero",
        "the page exposed no synthetic contact, stage mutation, reminder, draft, or follow-up action",
      ],
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-empty-read-only-pipeline",
    },
  ],
  [
    "web:/app/dashboard",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-relationship-dashboard-entry-verified",
      runtimeEvidence: [
        "the canonical dashboard entry rendered the relationship dashboard instead of redirecting into the unrelated Party surface",
        "the authenticated zero-contact actor produced zero contacts, relations, events, opportunities, dormant relationships, follow-ups, and distribution buckets",
        "the empty denominator produced a coverage score of 0 rather than the previous false 100",
        "the next-action and current-goal regions used explicit Chinese zero-data guidance without inventing an opportunity, dormant contact, or relationship goal",
      ],
      verificationCase: "web-dashboard-route-and-zero-data-truth-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-actor-scoped-relationship-dashboard",
    },
  ],
  [
    "web:/app/party",
    {
      entryBehavior:
        "authenticated-browser-source-backed-party-prerequisite-boundary-verified",
      runtimeEvidence: [
        "the route without an event ID distinguished a missing event selection from missing people context",
        "the actor's selected private event was found, while absent attendee and recommendation records rendered Party 尚未就绪 rather than a system failure",
        "the Chinese boundary stated that no check-in, contact, notification, calendar, AI, or external action would occur",
        "来源详情 exposed the five missing composed-context evidence records",
        "返回当前活动 preserved the encoded private event ID and opened its actor-owned detail instead of the unrelated public catalogue",
      ],
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-party-source-context-boundary",
    },
  ],
  [
    "web:/app/party/checkin",
    {
      entryBehavior:
        "authenticated-browser-source-backed-party-checkin-prerequisite-boundary-verified",
      runtimeEvidence: [
        "the selected actor-owned event resolved before the Check-in surface evaluated its people-context prerequisite",
        "missing attendee and recommendation records rendered the localized no-write Party prerequisite instead of a check-in control or system failure",
        "来源详情 exposed the exact missing composed-context evidence",
        "返回当前活动 preserved the encoded private event ID and opened the same actor-owned detail",
      ],
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-party-checkin-source-context-boundary",
    },
  ],
  [
    "web:/app/party/graph",
    {
      entryBehavior:
        "authenticated-browser-source-backed-party-graph-prerequisite-boundary-verified",
      runtimeEvidence: [
        "the selected actor-owned event resolved before the Graph surface evaluated its people-context prerequisite",
        "missing attendee and recommendation records rendered the localized no-write Party prerequisite without inventing nodes, edges, people, or a system failure",
        "来源详情 exposed the exact missing composed-context evidence",
        "返回当前活动 preserved the encoded private event ID and opened the same actor-owned detail",
      ],
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-party-graph-source-context-boundary",
    },
  ],
  [
    "web:/app/schedule",
    {
      entryBehavior:
        "authenticated-browser-canonical-today-arrangements-anchor-redirect-verified",
      runtimeEvidence: [
        "the retired Schedule deep link returned a 307-compatible navigation into /app/today#arrangements as required by the Today × Schedule merge",
        "the arrangements anchor existed in the canonical Today DOM and the browser scrolled to it",
        "the anchored section rendered the actor's one source-backed private-event arrangement and its existing read-only evidence boundary",
      ],
      verificationCase: "web-today-compatibility-routes-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-schedule-today-compatibility-route",
    },
  ],
  [
    "web:/app/schedule/events/[id]",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-dynamic-schedule-event-preview-verified",
      runtimeEvidence: [
        "the encoded colon-delimited dynamic segment initially failed with EVENTS_EVENT_NOT_FOUND",
        "after one page-boundary decode the same URL rendered the actor-owned private event's exact title, venue, confirmed status, time, manual source, and one evidence record",
        "the preview stated that it would not write calendar, registration, reminder, message, or external-service state",
        "返回日程 resolved through the compatibility route to /app/today#arrangements with a real anchor",
        "查看活动列表 opened the canonical event catalogue",
      ],
      verificationCase: "web-schedule-dynamic-event-identity-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-schedule-dynamic-event-identity",
    },
  ],
  [
    "web:/app/settings",
    {
      entryBehavior:
        "authenticated-browser-actor-scoped-settings-and-playbook-lifecycle-verified",
      runtimeEvidence: [
        "the authenticated actor loaded empty memory, feedback, and Playbook collections plus explicit live AI, durable-storage, worker, and integration health states",
        "appearance, memory governance, notification preferences, quiet hours, and time zone all changed through their real controls and returned to the original persisted values",
        "a temporary memory was created, reloaded, edited, reloaded, and deleted; category changes and cancel-edit remained local until an explicit save",
        "natural-language Playbook compilation initially failed on an invalid model schema, then succeeded after a bounded fail-closed retry without expanding the read-only capability whitelist",
        "Playbook dry-run initially lost actor identity, then returned the current actor's truthful empty follow-up result after actor propagation was repaired",
        "temporary Playbooks completed trial, enable, immediate run, pause, resume, version-two edit, history disclosure, cancel-edit, and double-confirm delete before final cleanup",
        "the original actor had zero feedback records; a later isolated two-actor run rendered result-learning deletion, preserved the record under a controlled 503, deleted it on retry, converged under rapid duplicate activation and preserved cross-actor isolation",
        "integration connect, health, and disconnect success actions remained absent because all three providers were explicitly unconfigured",
      ],
      verificationCase: "web-settings-actor-scoped-lifecycle-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-settings-actor-scoped-lifecycle",
    },
  ],
]);
const LIVE_MOBILE_AUTH_INTERACTION_EVIDENCE = new Map([
  [
    'repos/orbit-app/src/screens/profile/ProfileScreen.tsx#onopenaccount:() => router.push("/account" as Href)|onsaveprofile:onSaveProfile#null',
    {
      actualResult:
        "A disposable authenticated iOS actor saved a complete profile through ProfileCard.onSaveProfile; the native success tree, one PUT ledger entry, API response, configured Postgres row, refresh, and cold-start readback all agreed on the run-unique displayName, headline, and bio.",
      testData:
        "Two disposable registered actors; iPhone 17 Pro simulator at 390x844; run-unique displayName, headline, and bio markers; configured live Postgres store",
      idempotency:
        "Two identical actor-A retries converged on one actor-owned profile row; actor B wrote an independent row; a blank-name local submission issued zero PUTs, the service rejected the invalid payload, and both actor ledgers ended activeAfter=0.",
      verificationCase: "native-profile-durable-write-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/profile/ProfileScreen.tsx#onsave:onSaveProfile#null",
    {
      actualResult:
        "The native ProfileManualEditCard forwarded the complete reviewed draft to its save callback and reached one authenticated profile PUT; the success terminal, API response, Postgres row, refresh, and cold-start form all preserved the same three values.",
      testData:
        "Disposable actor A with a complete run-unique profile draft, plus actor B for independent-write and isolation checks",
      idempotency:
        "Repeated and controlled-retry saves preserved one semantic profile record; the empty required-name path stopped locally with 先写名字。, issued zero PUTs, and left the last-good payload unchanged.",
      verificationCase: "native-profile-durable-write-lifecycle-2026-07-31",
    },
  ],
  [
    'repos/orbit-app/src/screens/profile/ProfileScreen.tsx#onchangetext:(value) => updateDraft("displayName", value)#null',
    {
      actualResult:
        "Replacing 名字 with the run-unique actor-A marker, saving, refreshing, and cold-starting showed the same display name in the native tree, authenticated API response, and exact actor-owned Postgres profile row.",
      testData:
        "Disposable actors A/B and Profile Audit 20260731093223-22663 display-name marker",
      idempotency:
        "The same value survived repeated saves without a duplicate row; actor B retained its independent name; clearing the field produced 先写名字。 with Profile PUT=0 and no dirty data.",
      verificationCase: "native-profile-durable-write-lifecycle-2026-07-31",
    },
  ],
  [
    'repos/orbit-app/src/screens/profile/ProfileScreen.tsx#onchangetext:(value) => updateDraft("headline", value)#null',
    {
      actualResult:
        "Replacing 标题 with the run-unique actor-A marker persisted through the authenticated profile PUT, configured Postgres row, refresh, and native cold-start readback.",
      testData:
        "Disposable actors A/B and Durable Headline 20260731093223-22663 marker",
      idempotency:
        "Repeated and retried writes converged on one actor-A row, actor B retained a disjoint headline, and the later invalid blank-name attempt did not partially apply another headline.",
      verificationCase: "native-profile-durable-write-lifecycle-2026-07-31",
    },
  ],
  [
    'repos/orbit-app/src/screens/profile/ProfileScreen.tsx#onchangetext:(value) => updateDraft("bio", value)#null',
    {
      actualResult:
        "Replacing 简介 with the run-unique actor-A marker persisted through the authenticated profile PUT, payload.publicProfile.bio in the configured Postgres row, refresh, and native cold-start readback.",
      testData:
        "Disposable actors A/B and Durable Bio 20260731093223-22663 marker",
      idempotency:
        "Repeated and retried writes converged on one actor-A row, actor B retained a disjoint bio, and local plus service validation failures preserved the last-good bio without a dirty write.",
      verificationCase: "native-profile-durable-write-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/profile/ProfileScreen.tsx:240",
    {
      actualResult:
        "The signed-out profile gate opened /account/login with next=/profile and rendered no previous or fallback identity.",
      testData: "Signed-out Expo Web runtime",
      idempotency: "Navigation only; no session or profile record was written.",
    },
  ],
  [
    "repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx#onchange:(value) => updateValue(field, value)#null",
    {
      actualResult:
        "Submitting account C credentials issued a browser-managed HttpOnly Auth.js cookie, validated the session, and returned to the actor-owned /profile.",
      testData:
        "audit-event-isolation-c-20260728-2230@example.invalid against the live production API",
      idempotency:
        "Repeated sign-in replaced the browser session without creating another auth user or profile.",
    },
  ],
  [
    "repos/orbit-app/src/screens/profile/AccountScreen.tsx:210",
    {
      actualResult:
        "退出登录 expired every Auth.js session-cookie name, removed account-C data immediately, and kept /profile and /account private after hard navigation.",
      testData:
        "Authenticated account C followed by direct hard navigation to /profile and /account",
      idempotency:
        "Sign-out deleted no account/profile records; it only expired session cookies and cleared local actor state.",
    },
  ],
  [
    "repos/orbit-app/src/screens/profile/AccountPermissionsScreen.tsx:131",
    {
      actualResult:
        "The signed-out permissions gate opened /account/login with next=/account/permissions and exposed no actor permission record or raw API 401.",
      testData:
        "Signed-out Expo Web runtime after a first account had one pending calendar review",
      idempotency:
        "Navigation only; no permission record was read into the signed-out UI or written.",
    },
  ],
  [
    "repos/orbit-app/src/screens/profile/AccountPermissionsScreen.tsx:187",
    {
      actualResult:
        "A new account with zero permission rows requested calendar review through credentialed CORS; the pending row survived hard navigation, stayed isolated from a second account, and reappeared after signing back into the first account.",
      testData:
        "Two UI-created Expo Web accounts against the production live API and Postgres live-record store",
      idempotency:
        "Repeated review requests upserted one stable actor/capability record; the second account remained at zero rows.",
    },
  ],
]);
const LIVE_MOBILE_CONTACT_ACQUISITION_INTERACTION_EVIDENCE = new Map([
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onconfirm:confirmDraft|onconfirmrecommendation:confirmReferralRecommendation|ondismiss:dismissDraft|onselectsource:setSelectedReferralSource#null",
    {
      actualResult:
        "The authenticated native referral card staged actor-owned central contact drafts on generation, filtered rows by the selected source kind, confirmed the recommended contact and the remaining referral draft against persisted state, and kept dismissal session-local.",
      testData:
        "Disposable actor A with a live referral graph of one sponsor, two targets, and two match recommendations (warm_intro and context_share) seeded in the configured Postgres record store",
      idempotency:
        "Source selection changed only session-local presentation; staging replay kept byte-identical central rows; draft confirmation updated the same actor-owned central record without creating a contact; dismissal performed no server delete.",
      verificationCase:
        "native-referral-contact-draft-persistence-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onconfirm:onConfirmRecommendation#null",
    {
      actualResult:
        "Confirming a recommended contact from the native referral item persisted the confirmed central contact draft for the owning actor and synchronized the recommendation and draft rows with the persisted terminal state.",
      testData:
        "The warm_intro live recommendation staged as an actor-scoped referral-draft:live central record for disposable actor A",
      idempotency:
        "Concurrent and lost-response confirmation replays converged on one confirmed draft with a single confirmation evidence entry, byte-identical responses, and zero contact writes.",
      verificationCase:
        "native-referral-contact-draft-persistence-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:() => onConfirm(recommendation.id)#已确认推荐 / 确认中 / 确认推荐",
    {
      actualResult:
        "The native 确认推荐 control sent the formal recommended-contact confirmation request, flipped to the persisted 已确认推荐 state, and the confirmed state survived native relaunch and re-staging readback.",
      testData:
        "The visible referral recommendation item for disposable actor A rendered from the live referral provider over the configured Postgres store",
      idempotency:
        "Repeated activation converged on the same confirmed central draft; cold relaunch re-read the persisted confirmation instead of resetting to an unconfirmed response-only state.",
      verificationCase:
        "native-referral-contact-draft-persistence-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onimport:importExternalContacts|onselectsource:setSelectedExternalSource#null",
    {
      actualResult:
        "The authenticated native source selector chose the actor-backed external source and rendered the exact available candidate count before import.",
      testData:
        "Disposable actor A with two live networkPeople fixtures and actor B with the same provider person IDs under a separate account",
      idempotency:
        "Selecting the source changed only session-local presentation and did not write a contactDraft or contact.",
      verificationCase:
        "native-external-contact-draft-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onconfirm:confirmDraft|ondismiss:dismissDraft#null",
    {
      actualResult:
        "The native external result card and the central draft queue displayed the two centrally persisted actor-owned drafts, confirmed one through the generic contact-draft endpoint, hid the other only for the current session, and after native relaunch the queue read both drafts back from the formal API preserving the earlier confirmed state.",
      testData:
        "The two canonical external drafts returned by the same live import, including one confirmed result, one session-local dismissal, and a cold GET /api/contact-drafts readback after Expo relaunch",
      idempotency:
        "Generic confirmation updated the same central draft without creating a contact; session-local dismissal performed no server delete; cold readback created no draft and retained the exact actor-owned record IDs.",
      verificationCase:
        "native-external-contact-draft-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:() => onImport(activeSource)#导入中 / 导入为候选",
    {
      actualResult:
        "The native import control sent one formal live import request under rapid double activation and rendered two canonical central contactDrafts.",
      testData:
        "Two source-backed external candidates for disposable actor A against the configured API, live external provider, and Postgres record store",
      idempotency:
        "Rapid activation issued one import request; lost-response replay retained stable actor-scoped IDs, timestamps, payloads, and row count; controlled batch failure rolled back all staged drafts.",
      verificationCase:
        "native-external-contact-draft-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx:1770",
    {
      actualResult:
        "Confirming the selected external result updated that exact central draft to confirmed and synchronized the result card with the persisted terminal state.",
      testData:
        "One pending external result draft produced by the actor-owned native import",
      idempotency:
        "Concurrent and lost-response confirmation replay converged on one confirmed draft with one stable evidence payload and zero contact writes.",
      verificationCase:
        "native-external-contact-draft-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx:2094",
    {
      actualResult:
        "Confirming the remaining draft from the cold-start central queue updated the same Postgres row and survived a subsequent queue readback as confirmed.",
      testData:
        "The pending imported draft recovered through GET /api/contact-drafts after native relaunch",
      idempotency:
        "The generic confirm replay returned the persisted terminal payload without creating another draft, evidence record, or contact.",
      verificationCase:
        "native-external-contact-draft-lifecycle-2026-07-31",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:() => selectMode(item.mode)#{item.label}",
    {
      actualResult:
        "While the browser-owned camera permission request was still pending, switching from QR to 手动 invalidated that request, removed the waiting state, rendered no camera/video, and preserved the zero-draft state.",
      testData:
        "Authenticated Expo Web audit account with an unresolved browser camera permission prompt",
      idempotency:
        "Mode selection changed local UI state only; it performed no API call, scan, candidate staging, or persistent write.",
      verificationCase: "expo-qr-permission-pending-cancellation-2026-07-29",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:submitSource#提交中 / 生成待确认候选",
    {
      actualResult:
        "Submitting the selected PNG through credentialed CORS reached the live business-card scan boundary, returned a specific Chinese OCR-unconfigured recovery message, created no candidate or draft, and left no new console warning or error.",
      testData:
        "Authenticated Expo Web audit account; repository PNG test asset; production API with the cloud OCR provider intentionally unconfigured",
      idempotency:
        "Hard navigation cleared the local image/error state and still showed zero saved drafts; the failed request performed no candidate, contact, or database write.",
      verificationCase: "expo-business-card-media-failure-closed-2026-07-29",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:onOpenScanner#等待相机权限 / 扫 QR",
    {
      actualResult:
        "Requesting QR camera access displayed 等待相机权限 and disabled the scan button while the browser-owned permission prompt remained unresolved; the rest of the page stayed usable and the draft queue stayed empty.",
      testData:
        "Authenticated Expo Web audit account in QR mode with no existing camera decision in the in-app browser",
      idempotency:
        "The pending permission request performed no QR read, API call, candidate staging, or persistent write.",
      verificationCase: "expo-qr-permission-pending-cancellation-2026-07-29",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:onCaptureImage#处理中 / 拍名片",
    {
      actualResult:
        "The Web camera entry opened one image-only file input with capture=camera, accepted a real PNG, rendered its preview/name/18 KB size, and returned both media buttons from 处理中 to their ready labels.",
      testData:
        "Authenticated Expo Web audit account and repos/orbits/public/iorbit-starfield/avatars/mobile/ava0.png",
      idempotency:
        "Selecting media only updated the in-memory form; it made no API call or persistent write.",
      verificationCase: "expo-business-card-media-failure-closed-2026-07-29",
    },
  ],
  [
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:onPickImage#处理中 / 选图片",
    {
      actualResult:
        "The Web photo-library entry opened one image-only file input, accepted the same real PNG, rendered its preview/name/18 KB size, and returned both media buttons from 处理中 to their ready labels.",
      testData:
        "Authenticated Expo Web audit account and repos/orbits/public/iorbit-starfield/avatars/mobile/ava0.png",
      idempotency:
        "Selecting media only updated the in-memory form; it made no API call or persistent write.",
      verificationCase: "expo-business-card-media-failure-closed-2026-07-29",
    },
  ],
  [
    'repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:onPress#{label} {[countLabel, stateLabel].filter(Boolean).join(" · ")}',
    {
      actualResult:
        "Selecting the phone source changed only the local filter; all four zero-candidate sources remained visibly 未连接 and the import action remained disabled.",
      testData:
        "Authenticated Expo Web audit account with no actor-owned external-contact records",
      idempotency:
        "Filter selection performed no provider sync, file parse, candidate staging, contact write, or database write.",
      verificationCase: "expo-live-external-source-truthfulness-2026-07-29",
    },
  ],
]);
const LIVE_MOBILE_ADDITIONAL_INTERACTION_EVIDENCE = new Map([
  [
    "mobile:/home/events|repos/orbit-app/src/screens/home/HomeScreen.tsx#onpress:() => onFilterChange(key)#{filterLabels[key]} {counts[key]}",
    {
      actualResult:
        "Selecting 历史 0 changed the count to 0 / 1 and rendered 没有匹配的活动; selecting 全部 1 restored the private event.",
      testData:
        "Authenticated Expo Web audit actor with one upcoming private event and zero historical events",
      idempotency:
        "Both filter changes were local presentation only and wrote no event, registration, recommendation, or profile record.",
      verificationCase: "expo-entry-alias-and-home-events-2026-07-29",
    },
  ],
  [
    `mobile:/home/events|repos/orbit-app/src/screens/home/HomeScreen.tsx#onpress:() => onPress(event.id)#{filterLabels[event.state]} {dateChip.date} {<Text numberOfLines={1} style={styles.homeEventImageDateDetail}> {dateChip.detail} </Text>} / {null} {<Text numberOfLines={1} style={styles.homeEventImageSubtitle}> {event.subtitle} </Text>} / {null} {event.title} {event.startsAt} {<View style={styles.homeEventImageMetaLine}> <Ionicons color={colors.onAccent} name="location-outline" size={14} /> <Text numberOfLines={1} style={styles.homeEventImageDetail}> {event.location} </Text> </View>} / {null} {event.participantCountLabel} {event.actionLabel}`,
    {
      actualResult:
        "The 功能审计私有活动 20260729 card opened /events/event:live-record:20260729 and preserved its title, time, location, source, and actor ownership.",
      testData:
        "The one upcoming actor-owned private event in the authenticated Expo Web home-events list",
      idempotency:
        "Read-only navigation; no event, registration, attendee, recommendation, or external record was written.",
      verificationCase: "expo-entry-alias-and-home-events-2026-07-29",
    },
  ],
  [
    "mobile:/followups|repos/orbit-app/src/screens/followups/FollowupsScreen.tsx#onpress:onGenerate#生成中 / 生成候选",
    {
      actualResult:
        "生成候选 completed against the actor-owned empty queue and rendered an explicit zero-candidate review result without creating a task.",
      testData: "Authenticated Expo Web audit actor with zero follow-up tasks",
      idempotency:
        "The generation read produced zero candidates and wrote no task, reminder, message, contact, or external action.",
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/followups|repos/orbit-app/src/screens/followups/FollowupsScreen.tsx#onpress:onGenerateReminders#生成中 / 生成提醒候选",
    {
      actualResult:
        "生成提醒候选 completed against the same empty actor queue and rendered an explicit zero-reminder result without creating a reminder.",
      testData:
        "Authenticated Expo Web audit actor with zero follow-up tasks and reminders",
      idempotency:
        "The generation read produced zero candidates and wrote no reminder, task, message, contact, or external action.",
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/inbox|repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx#onpress:() => setComposing(true)#null",
    {
      actualResult:
        "写一段新跟进 opened the review-only composer with one generic 您好： greeting and explicit no-send/no-schedule copy.",
      testData:
        "Authenticated Expo Web audit actor with zero inbox conversations and no seeded recipient",
      idempotency:
        "Opening the composer changed local presentation only and wrote no thread, message, contact, or calendar record.",
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/inbox|repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx#onpress:createThread#null",
    {
      actualResult:
        "Creating with a blank recipient stayed on the composer and rendered 先写收件人。 without creating a thread or claiming success.",
      testData:
        "Blank recipient and organization with the generated default subject/body",
      idempotency:
        "Client validation performed no API request and wrote no thread, message, contact, or calendar record.",
      verificationCase: "expo-empty-work-queue-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/contacts|repos/orbit-app/src/screens/contacts/ContactsScreen.tsx#onpress:() => router.push(route as Href)#{metric} {title} {detail} {signal} {action}",
    {
      actualResult:
        "The primary 人脉图谱 workbench card navigated to /contacts/graph, which preserved the same actor-scoped zero-connection state.",
      testData:
        "Authenticated Expo Web audit actor with zero contacts and zero connection graph records",
      idempotency:
        "Navigation only; no contact, connection, evidence, or relationship record was written.",
      verificationCase: "expo-empty-relationship-surface-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/login-admin|repos/orbit-app/src/screens/admin/AdminLoginScreen.tsx#onpress:() => router.push(view.primaryHref as Href)#{view.primaryLabel}",
    {
      actualResult:
        "打开只读后台 navigated from the account-backed entry to /admin and rendered the same actor-owned read-only data.",
      testData:
        "Authenticated Expo Web audit actor with one private event and no explicit profile email",
      idempotency:
        "Navigation only; no email, session, role, event, or member record was created or changed.",
      verificationCase: "expo-admin-truthful-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/admin|repos/orbit-app/src/screens/admin/AdminScreen.tsx#onpress:() => onNavigate(item.href)#{item.label}",
    {
      actualResult:
        "The 活动管理 tab navigated from /admin to /admin/events while preserving the same one-event read-only dataset.",
      testData:
        "Authenticated Expo Web admin dashboard backed by the current audit actor",
      idempotency:
        "Navigation only; no event, admin role, or workspace record was written.",
      verificationCase: "expo-admin-truthful-boundaries-2026-07-29",
    },
  ],
  [
    `mobile:/admin/events|repos/orbit-app/src/screens/admin/AdminScreen.tsx#onpress:() => onOpenEvent(event.href)#{<ImageBackground imageStyle={styles.eventThumbImage} source={{ uri: assetUrl(baseUrl, event.coverPath) }} style={styles.eventThumbFrame} > <View style={styles.eventThumbOverlay} /> </ImageBackground>} / {<View style={styles.eventIcon}> <Text style={styles.eventFallbackText}> {event.title.slice(0, 1)} </Text> </View>} {event.title} {event.stateLabel} {event.startsAt} {event.location} {event.detail}`,
    {
      actualResult:
        "The real private event card opened /events/event:live-record:20260729 and preserved the actor-owned event identity and detail modules.",
      testData:
        "Private event 功能审计私有活动 20260729 under the authenticated Expo Web audit actor",
      idempotency:
        "Read-only navigation; no event, registration, attendee, or admin record was written.",
      verificationCase: "expo-admin-truthful-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/ai|repos/orbit-app/src/screens/ai/AiScreen.tsx#onpress:onPress#`打开历史记录：${item.title}`",
    {
      actualResult:
        "The open-history button navigated to the matching persisted AI conversation while the adjacent delete action remained a separate sibling control.",
      testData:
        "Persisted conversation agent-session-ms4a1d22-6w4xm9 in the authenticated Expo Web runtime",
      idempotency:
        "Opening and returning changed no conversation record; repeated drawer close/open produced no new hydration or nested-button console error.",
      verificationCase: "expo-ai-history-persistence-hydration-2026-07-29",
    },
  ],
  [
    "mobile:/events/[id]/register|repos/orbit-app/src/screens/events/EventRegistrationScreen.tsx#onpress:onSubmit#保存中 / {registration.confirmLabel}",
    {
      actualResult:
        "The standard mobile registration submitted an actor-scoped record, rendered its saved answers, and preserved them after refresh.",
      testData:
        "Private event event:live-record:20260729 and the current authenticated audit actor",
      idempotency:
        "Refresh read the same actor/event registration record instead of creating another row.",
      verificationCase:
        "expo-live-event-registration-and-roster-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/events/[id]/register|repos/orbit-app/src/screens/events/EventRegistrationScreen.tsx#onpress:onCancel#取消中 / 取消报名",
    {
      actualResult:
        "Cancellation updated the same actor-scoped registration and the cancelled state survived refresh.",
      testData:
        "The saved registration for event:live-record:20260729 in the authenticated Expo Web runtime",
      idempotency:
        "Cancellation changed the existing record state and did not create a second registration.",
      verificationCase:
        "expo-live-event-registration-and-roster-boundaries-2026-07-29",
    },
  ],
  [
    'mobile:/register|repos/orbit-app/src/screens/register/RegisterInviteScreen.tsx#onpress:() => router.push("/events" as Href)#查看活动',
    {
      actualResult:
        "The missing-context registration entry navigated to the live event catalogue without constructing a demo event.",
      testData:
        "Direct authenticated Expo Web navigation to /register with no code",
      idempotency:
        "Navigation only; no event, invite, or registration record was written.",
      verificationCase: "expo-register-invite-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/register/[code]|repos/orbit-app/src/screens/register/RegisterInviteScreen.tsx#onpress:() => router.push(action.href as Href)#{action.label}",
    {
      actualResult:
        "继续填写活动问题 opened /events/event:live-record:20260729/register and preserved the selected actor-owned event.",
      testData:
        "Encoded private event event:live-record:20260729 in the authenticated Expo Web runtime",
      idempotency:
        "The preview step performed no registration write; it only navigated to the standard form.",
      verificationCase: "expo-register-invite-boundaries-2026-07-29",
    },
  ],
  [
    'mobile:/schedule|repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx#onpress:onPress#{<ImageBackground imageStyle={styles.eventTimelineThumbImage} source={{ uri: assetUrl(baseUrl, imagePath) }} style={styles.eventTimelineThumbFrame} > <View style={styles.eventTimelineThumbOverlay} /> </ImageBackground>} / {<View style={styles.eventTimelineFallbackThumb}> <Ionicons color={colors.amber} name="calendar-outline" size={19} /> </View>} {item.statusLabel} {item.title} {item.timeLabel || "时间待定"} {<View style={styles.eventTimelineMetaLine}> <Ionicons color={colors.text3} name="location-outline" size={14} /> <Text numberOfLines={1} style={styles.itemMeta}> {item.location} </Text> </View>} / {null} {<View style={styles.eventTimelineMetaLine}> <Ionicons color={colors.text3} name="people-outline" size={14} /> <Text numberOfLines={1} style={styles.itemMeta}> {item.participantCountLabel} </Text> </View>} / {null} 打开活动背景 {item.actionLabel}',
    {
      actualResult:
        "The event highlight displayed 功能审计私有活动 20260729 and opened its encoded read-only schedule preview.",
      testData:
        "Actor-owned private event whose source note intentionally differs from its title",
      idempotency:
        "Opening the preview made no calendar, registration, reminder, or message write.",
      verificationCase: "expo-schedule-title-preview-runtime-2026-07-29",
    },
  ],
  [
    "mobile:/schedule/events/[id]|repos/orbit-app/src/screens/schedule/ScheduleEventPreviewScreen.tsx#onpress:() => router.push(action.href as Href)#{action.label}",
    {
      actualResult:
        "The two preview exits were exercised independently: 返回日程 opened /schedule and 查看活动列表 opened /events.",
      testData: "Read-only preview for event:live-record:20260729",
      idempotency:
        "Both exits were navigation-only and preserved the event and registration records.",
      verificationCase: "expo-schedule-title-preview-runtime-2026-07-29",
    },
  ],
  [
    "mobile:/settings|repos/orbit-app/src/screens/settings/SettingsScreen.tsx#onpress:() => router.push(destination.href as Href)#destination.title",
    {
      actualResult:
        "The 服务器 destination opened /settings/api while the account and permission destinations remained separately named.",
      testData: "Authenticated Expo Web settings root",
      idempotency: "Navigation only; no settings value was changed.",
      verificationCase: "expo-api-settings-health-runtime-2026-07-29",
    },
  ],
  [
    "mobile:/settings/api|repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx#onpress:saveBaseUrl#保存",
    {
      actualResult:
        "Saving the already configured http://localhost:3110 returned 服务器地址已保存 and hard navigation read the same normalized value back.",
      testData: "Existing Expo Web API base URL http://localhost:3110",
      idempotency:
        "Saving the same normalized URL did not change the target or create an additional settings record.",
      verificationCase: "expo-api-settings-health-runtime-2026-07-29",
    },
  ],
  [
    "mobile:/settings/api|repos/orbit-app/src/screens/settings/ApiSettingsScreen.tsx#onpress:checkServerHealth#检查中 / 检查",
    {
      actualResult:
        "The health request reached the configured production server and rendered 服务器可用 / Orbit 服务响应正常，可以继续使用。",
      testData:
        "Configured API http://localhost:3110 with authenticated production health response",
      idempotency:
        "Health check was read-only and changed no server URL, session, or business record.",
      verificationCase: "expo-api-settings-health-runtime-2026-07-29",
    },
  ],
  [
    "mobile:/account/signup|repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx#onpress:submit#{view.busyLabel} / {view.primaryLabel}",
    {
      actualResult:
        "Submitting not-an-email with a three-character password stayed on signup and rendered 请输入邮箱，并设置至少 8 位密码。",
      testData:
        "Invalid email not-an-email and password 123 in the mobile signup form",
      idempotency:
        "Client validation created no account, session, profile, or external provider request.",
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
    },
  ],
  [
    'mobile:/account/signup|repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx#onpress:() => setPasswordVisible((current) => !current)#passwordVisible ? "隐藏密码" : "显示密码"',
    {
      actualResult:
        "The password visibility action changed its accessible name from 显示密码 to 隐藏密码 while preserving the typed value.",
      testData: "Signup password value 123",
      idempotency:
        "Visibility changed only local presentation and performed no request or persistent write.",
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/account/signup|repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx#onpress:() => navigateTo(`${view.switchHref}?next=${encodeURIComponent(next)}`)#{view.switchLabel}",
    {
      actualResult:
        "已有账号，去登录 navigated to /account/login with the normalized return path.",
      testData: "Mobile signup default return path",
      idempotency: "Navigation only; no account or session was created.",
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/account/forgot-password|repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx#onpress:() =>\n                navigateTo(\n                  `${view.switchHref}?next=${encodeURIComponent(next)}`\n                )#{view.switchLabel}",
    {
      actualResult:
        "The sole 返回登录 action left the explicit restricted state and opened /account/login?next=%2Fdashboard.",
      testData: "Password recovery with no configured reset provider",
      idempotency:
        "Navigation only; no email, verification code, password, or account record was collected or written.",
      verificationCase: "expo-account-entry-boundaries-2026-07-29",
    },
  ],
  [
    "mobile:/events/[id]/attendees|repos/orbit-app/src/screens/events/EventAttendeesScreen.tsx#onpress:importEventAttendeesIntoRoster#导入中 / 导入名册",
    {
      actualResult:
        "The authenticated native roster action imported the formal attendee roster into the actor-owned event boundary, survived refresh and cold readback, rejected foreign and missing event IDs, converged under replay, and left no active audit records after cleanup.",
      testData:
        "Two disposable registered actors, actor-owned/foreign/missing event fixtures, and the configured API and Postgres record store",
      idempotency:
        "Rapid activation and lost-response replay preserved one actor-owned roster result; controlled failure and denied requests left no roster mutation.",
      verificationCase:
        "native-event-owned-write-lifecycle-2026-07-31",
    },
  ],
  [
    "mobile:/events/[id]/attendees|repos/orbit-app/src/screens/events/EventAttendeesScreen.tsx#onpress:importEventAttendeesAsDrafts#导入中 / 导入为候选",
    {
      actualResult:
        "The authenticated native draft action persisted one canonical actor-owned contactDraft record, exposed it through cold queue readback, preserved its record ID, payload hash, and updatedAt on replay, and kept actors A and B isolated.",
      testData:
        "Two disposable registered actors with disjoint attendee fixtures and configured contactDraft persistence",
      idempotency:
        "A controlled 503 produced zero mutation; a dropped response committed one draft; the identical cold replay retained the exact record set and payload; batch store failure rolled back every newly written draft.",
      verificationCase:
        "native-event-owned-write-lifecycle-2026-07-31",
    },
  ],
  [
    "mobile:/events/[id]/attendees|repos/orbit-app/src/screens/events/EventAttendeesScreen.tsx#oncreateevidence:createEncounterEvidence|onsaveencounter:saveEncounterNote#null",
    {
      actualResult:
        "The native attendee card saved the encounter note through the authenticated event-attendee service and exposed the persisted actor-owned encounter for the evidence continuation after refresh and cold readback.",
      testData:
        "Disposable actor A and B accounts with owned, foreign, encoded, duplicate, and missing event/attendee inputs",
      idempotency:
        "Duplicate activation and lost-response replay converged on the same encounter; validation, controlled failure, unauthenticated, missing, and foreign requests left no dirty encounter or evidence data.",
      verificationCase:
        "native-event-owned-write-lifecycle-2026-07-31",
    },
  ],
  [
    "mobile:/events/[id]/attendees|repos/orbit-app/src/screens/events/EventAttendeesScreen.tsx#onpress:() => onCreateEvidence(attendee, savedEncounter)#生成中 / 生成关系证据",
    {
      actualResult:
        "The native evidence action converted the saved encounter into one actor-owned relationship-evidence record and preserved the same terminal result across refresh, cold start, and replay.",
      testData:
        "The actor-owned saved encounter produced by the same native attendee lifecycle",
      idempotency:
        "Rapid activation and response-loss replay created no duplicate evidence; foreign and missing ownership boundaries failed closed without leakage or mutation.",
      verificationCase:
        "native-event-owned-write-lifecycle-2026-07-31",
    },
  ],
  [
    "mobile:/events/[id]/register|repos/orbit-app/src/screens/events/EventRegistrationScreen.tsx#oncancel:cancelRegistration|onsubmit:submitRegistration#null",
    {
      actualResult:
        "The authenticated native registration form executed both submit/update and cancel against the configured registration store; each terminal survived refresh and cold start and remained scoped to the owning actor.",
      testData:
        "Two disposable registered actors with owned, foreign, encoded, duplicate, and missing event IDs",
      idempotency:
        "Repeated submission, cancellation, rapid activation, and lost-response replay converged on one registration record; validation and controlled failures preserved the last-good state.",
      verificationCase:
        "native-event-owned-write-lifecycle-2026-07-31",
    },
  ],
]);
const LIVE_PROFILE_INTERACTION_EVIDENCE = new Map(
  [
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:296",
      "Manual entry and structured text extraction each became the pressed fill method and exposed only the controls belonging to that method.",
      "Method selection changed local presentation only and did not write a profile.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:323",
      "Scan/import in Import hub opened /app/contacts/new, which truthfully rendered every unconfigured acquisition source as unavailable and performed no upload or contact write.",
      "Navigation only; the profile, contact collection, and acquisition drafts were unchanged.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:335",
      "The structured-text field preserved eight explicit Chinese profile lines before extraction.",
      "Typing changed local form state only and did not write a profile.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:336",
      "Extract to form first rejected an empty input with 请先粘贴档案文本再提取。; the labeled Chinese input then populated name, company, title, market, relationship goal, two offering tags, and two seeking tags while requiring review before save.",
      "Extraction produced a local draft only; it made no profile write until the separate save action.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:362",
      "Every rendered scalar field accepted its audit value; the authenticated email remained readonly and retained audit-permission-1785253354985@example.invalid.",
      "Field edits remained local until save; the readonly email could not be changed by the editor.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:400",
      "Bio and opener accepted distinct multi-word Chinese values and updated the business-card preview before save.",
      "Textarea edits remained local until save.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:449",
      "Pressed offering, seeking, and topic chips each toggled off without affecting another tag group.",
      "Tag toggles changed local form state only until save.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:457",
      "All three custom-tag fields accepted distinct audit values; pressing Enter in the topic field added 审计话题-可信数据 and cleared the draft.",
      "Draft input and Enter handling changed local tag state only until save.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:473",
      "The enabled Add controls appended 活动, 审计能力-API持久化, and 审计目标-企业AI合作 to their exact groups; empty Add controls stayed disabled.",
      "Add changed local tag state only until save and did not create duplicate profile records.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:540",
      "The offering callback added and removed source-extracted and custom offering tags without changing seeking or topics.",
      "The callback updated only the offering array before the explicit save.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:541",
      "The seeking callback added and removed source-extracted and custom relationship targets without changing offering or topics.",
      "The callback updated only the seeking array before the explicit save.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:542",
      "The topics callback added 审计话题-可信数据 through Enter and later removed it during cleanup without changing offering or seeking.",
      "The callback updated only the topics array before the explicit save.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:773",
      "The desktop form rejected a whitespace-only name, then submitted the complete 100% profile through the actor-scoped PUT and GET readback chain.",
      "One profile record was updated in place; a hard re-entry showed the same values and no duplicate record.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:776",
      "Back navigated from /app/profile to /app/home after cleanup and the home surface rendered the restored actor profile.",
      "Navigation only; no profile or relationship record was written.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:793",
      "Cancel discarded the visible unsaved title 未保存的临时职位, opened /app/home, and a new Edit universal profile entry restored the last saved 产品验证负责人 value.",
      "Cancel performed no PUT and preserved the previously saved profile.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:794",
      "Save profile persisted every desktop scalar and list field, displayed 档案已保存并完成复读核验。, and survived a fresh entry from /app.",
      "Repeated reads returned the same actor-owned profile; cleanup updated that record back to its original values.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:800",
      "At 390x844 the mobile form rendered the complete editor, submitted a distinct mobile headline, and preserved it after hard navigation.",
      "The mobile form updated the same actor-owned profile instead of creating a platform-specific duplicate.",
    ],
    [
      "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx:801",
      "The mobile Save control persisted 移动端保存验证-20260729, displayed the verified-save status, and hard navigation read the same value back.",
      "The mobile save updated the same profile once; final desktop cleanup restored the original 20% profile.",
    ],
  ].map(([sourceRef, actualResult, idempotency]) => [
    sourceRef,
    {
      actualResult,
      testData:
        "Authenticated production-browser actor audit-permission-1785253354985; original 20% profile; labeled Chinese extraction source; distinct desktop/mobile values and three custom tags",
      idempotency,
      verificationCase: "web-profile-complete-lifecycle-2026-07-29",
    },
  ]),
);
const LIVE_WEB_SETTINGS_INTERACTION_EVIDENCE = new Map(
  [
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:574",
      "The natural-language field accepted the Chinese relationship-review request and preserved it while compilation ran.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:587",
      "Generate draft first exposed the model's invalid schema instead of inventing a draft; after the bounded retry repair, the same request produced a safe daily 09:00 Asia/Tokyo draft with two explicit assumptions.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:616",
      "Review type changed from follow-up review to contact recommendations and back without a persistent write.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:624",
      "The Playbook name field accepted the temporary audit names used for lifecycle and cancel-edit verification.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:628",
      "The instruction field accepted actor-scoped read-only review instructions and persisted the edited instruction in version two.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:632",
      "Trigger selection exposed the relationship-signal controls and returned to the schedule controls without saving.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:643",
      "Frequency selection exposed weekly and one-time branches before returning to the daily default.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:652",
      "The one-time branch accepted a valid 2026-07-30T10:00 local run time before the form returned to daily mode.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:657",
      "Local time changed from 09:00 to 10:30 and returned to 09:00 without a persistent write.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:664",
      "Weekly day selection moved from Monday to Tuesday through a two-day intermediate state, then returned to Monday.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:675",
      "Signal selection added follow-up-due, removed stale-relationship, then restored the original stale-only selection.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:682",
      "Minimum importance changed from 60 to 70 and returned to 60 without enabling a Playbook.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:691",
      "Cancel edit closed a populated Playbook editor without creating a new version or changing the saved record.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:695",
      "Trial run executed the same read-only Agent path with sideEffectsExecuted=false; after actor propagation was repaired it returned the current actor's truthful empty follow-up queue with two evidence IDs.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:698",
      "Enable created one actor-scoped Playbook and Save new version persisted the edited instruction as version two.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:766",
      "Version history expanded at versions one and two and displayed the corresponding revision entries.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:778",
      "Run now completed the actor-scoped follow-up review, incremented the run count to one, and persisted a source-backed empty result.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:779",
      "Edit repopulated the form from the selected actor-scoped Playbook before both save-version and cancel-edit paths were exercised.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:780",
      "Pause survived hard reload with no next run; Resume restored the active state and scheduled next run.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-automation-settings.tsx:783",
      "Delete required a second Confirm delete click and removed both temporary Playbooks; hard reload ended with zero Playbooks.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:92",
      "The rendered checkbox control changed each of the four execution preferences and preserved the explicit checked state.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:278",
      "Automatic meeting notes toggled off and back on locally without saving an intermediate value.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:288",
      "External calendar writes changed from disabled to enabled, survived hard reload after Save, then returned to disabled and survived another hard reload.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:298",
      "Post-event reminder push toggled off and back on locally before the saved preference round-trip.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:308",
      "Pre-event brief push toggled off and back on locally before the saved preference round-trip.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:328",
      "Quiet-hours start accepted 21:30 and returned to the persisted 22:00 value.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:346",
      "Quiet-hours end accepted 07:30 and returned to the persisted 08:00 value.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:376",
      "Notification time zone accepted UTC and returned to the persisted Asia/Tokyo value.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:397",
      "Save persisted the enabled external-calendar preference, hard reload read it back, and a second save restored the original disabled state.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-execution-settings.tsx:465",
      "Refresh runtime status completed read-only and preserved deepseek configured, durable database, and worker-not-observed states.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => void updateSettings({ enabled: !settings.enabled })#Use memory in Agent replies / 在 Agent 回复中使用记忆 On / 开启 / Off / 关闭",
      "Use memory changed from on to off, survived hard reload, then returned to on and survived the final reload.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => void updateSettings({ allowConversationLearning: !settings.allowConversationLearning, })#Allow approved learning from conversations / 允许从对话中经确认后学习 On / 开启 / Off / 关闭",
      "Approved conversation learning changed from off to on, survived hard reload, then returned to off and survived the final reload.",
    ],
    [
      'repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onchange:(event) => setCategory(event.target.value as AgentMemoryCategory)#t({ en: "Memory category", zh: "记忆分类" })',
      "Memory category changed from Preferences to Goals and returned to Preferences without creating a record.",
    ],
    [
      'repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onchange:(event) => setContent(event.target.value)#t({ en: "Memory content", zh: "记忆内容", })',
      "Memory content accepted the clearly named temporary audit value used for create and reload verification.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => void createMemory()#Saving… / 正在保存… / Save memory / 保存记忆",
      "Save memory created one manual actor-scoped record and cleared the composer only after the API returned it.",
    ],
    [
      'repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onchange:(event) => setEditCategory( event.target.value as AgentMemoryCategory, )#t({ en: "Edit memory category", zh: "编辑记忆分类", })',
      "Edit memory category changed to Goals inside the editor; Cancel discarded that unsaved category.",
    ],
    [
      'repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onchange:(event) => setEditContent(event.target.value)#t({ en: "Edit memory content", zh: "编辑记忆内容", })',
      "Edit memory content accepted the revised audit value that later survived hard reload.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => void saveEdit(memory)#Save changes / 保存修改",
      "Save changes persisted the revised memory content and hard reload returned the same actor-scoped record.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => setEditingId(null)#Cancel / 取消",
      "Cancel closed the memory editor and discarded the unsaved category change.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => startEditing(memory)#Edit / 编辑",
      "Edit opened the selected temporary memory rather than another actor's record.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx#onclick:() => void remove(memory)#Confirm delete / 确认删除 / Delete / 删除",
      "Delete changed to Confirm delete on the first click and removed both temporary memories only on the second click; final reload showed zero memories.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-appearance-settings.tsx:58",
      "Light restored the original device theme and rendered its pressed state.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-appearance-settings.tsx:67",
      "Dark changed the device theme and rendered its pressed state before Light restored the original.",
    ],
  ].map(([sourceRef, actualResult]) => [
    `web:/app/settings|${sourceRef}`,
    {
      actualResult,
      testData:
        "Authenticated production-browser audit actor with zero memories, zero feedback records, zero Playbooks, one private event, no contacts, and unconfigured external integrations",
      idempotency:
        "Every temporary memory and Playbook was double-confirm deleted; theme and persisted preferences were restored to their original values and verified by hard reload.",
      verificationCase: "web-settings-actor-scoped-lifecycle-2026-07-29",
    },
  ]),
);
const LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE = new Map([
  ...LIVE_WEB_SETTINGS_INTERACTION_EVIDENCE,
  ...[
    {
      actualResult:
        "A disposable authenticated actor edited the exact Today message, task title/due, and reminder title/due controls, then confirmed once through the formal ledger transition. The action completed with three completed outbox items, three completed receipts, and exactly one actor-owned messageDraft, task, and notification; all edited values survived hard reload. Empty message and missing reminder time were rejected locally with zero transition or domain rows. Separate actions durably deferred and rejected with zero downstream outputs and survived hard reload. A second actor could not access actor A, completed its own draft write, and remained isolated. Confirm/defer/reject replays returned 409 without duplicate output, a controlled single-operation executor failure produced no domain row, and cleanup deleted 58/58 records with activeAfter=0.",
      idempotency:
        "The final independent evaluator recomputed six distinct implementations and six exact /app/today occurrences, 34/34 artifact hashes including 13 same-run JPEG screenshots, three replay conflicts, actor isolation, controlled failure without dirty domain data, signed-out state, and 58→0 cleanup.",
      lines: [248, 299, 324, 359, 369, 379],
      sourceFile:
        "repos/orbits/app/(app)/app/today/orbit-today-decision-form.tsx",
      surfaceId: "web:/app/today",
      testData:
        "Two disposable registered actors on today.localhost; three actor-A awaiting actions for confirm/defer/reject; one actor-B own-write action; one actor-B controlled-failure action; run-unique edited draft/task/reminder values",
    },
  ].flatMap((group) =>
    group.lines.map((line) => [
      `${group.surfaceId}|${group.sourceFile}:${line}`,
      {
        actualResult: group.actualResult,
        idempotency: group.idempotency,
        testData: group.testData,
        verificationCase:
          "web-today-durable-decision-write-lifecycle-2026-07-31",
      },
    ]),
  ),
  ...[
    {
      actualResult:
        "The exact authenticated Settings account menu exposed one Sign out / 退出登录 control. Activation preserved lang=ja in the callback, terminated the session, and browser Back did not restore it.",
      idempotency:
        "Session navigation only; business records stayed byte-identical and the disposable actor cleanup ended at activeAfter=0.",
      lines: [178],
      sourceFile: "repos/orbits/app/(app)/app/orbit-public-shell.tsx",
      surfaceId: "web:/app/settings",
      testData:
        "Disposable authenticated actor at /app/settings?lang=ja and a measured 1440x900 viewport",
    },
    {
      actualResult:
        "Each exact encounter-note form and submit control was activated in mock mode and matched its rendered action/method plus 201/400/409/503/200 status and envelope contract.",
      idempotency:
        "Every declared success safety flag stayed false, durable business rows remained 0→0, and actor cleanup ended at activeAfter=0.",
      lines: [
        398, 420, 444, 449, 453, 458, 462, 467, 471, 476, 480, 485, 489,
        494, 498, 503, 507, 512,
      ],
      sourceFile: "repos/orbits/features/events/encounter-note/debug-view.tsx",
      surfaceId: "web:/dev/capabilities/[slug]",
      testData:
        "Disposable authenticated actor on the encounter-note development capability under process-scoped mock mode",
    },
    {
      actualResult:
        "All eight exact email/calendar signal controls were activated in mock mode and matched the declared 200/503/403/404 response matrix while exposing exactly three success signals.",
      idempotency:
        "Provider network, sync, body ingest, durable write and notification flags stayed false; business rows remained 0→0 and cleanup ended at activeAfter=0.",
      lines: [328, 358, 367, 376, 385, 394, 403, 412],
      sourceFile:
        "repos/orbits/features/acquisition/email-and-calendar-relationship-signal-mock/debug-view.tsx",
      surfaceId: "web:/dev/capabilities/[slug]",
      testData:
        "Disposable authenticated actor on the email/calendar signal development capability under process-scoped mock mode",
    },
  ].flatMap((group) =>
    group.lines.map((line) => [
      `${group.surfaceId}|${group.sourceFile}:${line}`,
      {
        actualResult: group.actualResult,
        idempotency: group.idempotency,
        testData: group.testData,
        verificationCase:
          "navigation-nonpass-runtime-replay-2026-07-30",
      },
    ]),
  ),
  [
    "web:/app/settings|repos/orbits/app/(app)/app/settings/orbit-agent-feedback-settings.tsx#onclick:() => void remove(item.runId)#Deleting… / 正在删除… / Delete learning record / 删除学习记录",
    {
      actualResult:
        "The actor-owned feedback record remained visible with a disabled 正在删除… control while pending. A controlled delayed 503 restored the delete control and preserved the row; retry removed it, hard reload stayed empty, rapid duplicate activation converged to one deleted state, and actor B never observed or mutated actor A's record.",
      testData:
        "Two disposable authenticated actors in workspace:web-write-risk-activation-20260730 with one formal actor-A feedback record and zero actor-B feedback records",
      idempotency:
        "Rapid double activation plus two repeated actor-A service removals and one actor-B removal left both actors at zero feedback records without duplicate or cross-actor mutation.",
      verificationCase:
        "web-settings-feedback-delete-two-actor-lifecycle-2026-07-30",
    },
  ],
  [
    "web:/app/admin|repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx:39",
    {
      actualResult:
        "Desktop 活动管理 opened /app/admin/events and 仪表盘 returned to /app/admin with the same actor-owned source record.",
      testData:
        "Authenticated browser actor with one actor-owned event and one persisted profile",
      idempotency:
        "Route navigation only; no event, profile, registration, attendance, matching, team, or platform record was written.",
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
    },
  ],
  [
    "web:/app/admin|repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx:41",
    {
      actualResult: "退出后台 opened the authenticated personal /app entry.",
      testData: "Authenticated Admin dashboard",
      idempotency:
        "Route navigation only; the authenticated session and all actor-owned records were preserved.",
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
    },
  ],
  [
    "web:/app/admin|repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx:47",
    {
      actualResult:
        "At 390x844 the visible 活动管理 tab opened /app/admin/events and 仪表盘 returned to /app/admin.",
      testData: "Authenticated Admin dashboard at a 390x844 browser viewport",
      idempotency:
        "Responsive route navigation only; no source or operational record was written.",
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
    },
  ],
  [
    "web:/app/admin/events|repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx:39",
    {
      actualResult:
        "Desktop 仪表盘 opened /app/admin and 活动管理 returned to /app/admin/events with the same actor-owned source record.",
      testData:
        "Authenticated browser actor with one actor-owned event and one persisted profile",
      idempotency:
        "Route navigation only; no event, profile, registration, attendance, matching, team, or platform record was written.",
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
    },
  ],
  [
    "web:/app/admin/events|repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx:41",
    {
      actualResult:
        "The shared desktop 退出后台 control was exercised from the Admin shell and resolved to /app.",
      testData: "Authenticated shared Admin shell",
      idempotency:
        "Route navigation only; the authenticated session and actor-owned records were preserved.",
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
    },
  ],
  [
    "web:/app/admin/events|repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx:47",
    {
      actualResult:
        "At 390x844 the visible 仪表盘 tab opened /app/admin and 活动管理 returned to /app/admin/events.",
      testData:
        "Authenticated Admin Events route at a 390x844 browser viewport",
      idempotency:
        "Responsive route navigation only; no source or operational record was written.",
      verificationCase: "web-admin-navigation-capability-truth-2026-07-29",
    },
  ],
  [
    "web:/app/platform|repos/orbits/shared/ui/state-view.tsx:217",
    {
      actualResult:
        "Expanding 来源详情 exposed the unavailable platform provider and unverified platform-admin role evidence.",
      testData:
        "Authenticated personal account without a platform-wide provider or persisted platform-admin role",
      idempotency:
        "Local disclosure state only; no personal, organizer, moderation, role, or platform record was read as success or written.",
      verificationCase: "web-admin-platform-truth-boundary-2026-07-29",
    },
  ],
  [
    "web:/app/platform|repos/orbits/shared/ui/state-view.tsx:249",
    {
      actualResult:
        "Return to personal workspace opened /app/home; Open organizer admin opened /app/admin.",
      testData:
        "Authenticated Platform unavailable state with both source-backed recovery actions",
      idempotency:
        "Navigation only; no platform access, moderation, organizer verification, or personal record was written.",
      verificationCase: "web-admin-platform-truth-boundary-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx#t({ en: `Show ${item.name} event`, zh: `查看活动：${item.name}` })",
    {
      actualResult:
        "Selecting the EVT01 map pin updated the selected event card to 东京餐饮入境客增长会 without changing the route.",
      testData: "13-event public catalogue map; EVT01/event_01",
      idempotency:
        "Local selection state only; no event, registration, contact, map, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx#View / 查看",
    {
      actualResult:
        "查看 opened /app/events/EVT01 with the exact 东京餐饮入境客增长会 heading; 返回上一页 then restored /app/events.",
      testData: "Selected EVT01 map detail card",
      idempotency:
        "Read-only navigation only; no event, registration, contact, Agent, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx#Clear filters / 清除筛选",
    {
      actualResult:
        "A nonexistent Chinese query rendered 没有符合当前筛选的活动; 清除筛选 restored all 13 approved events.",
      testData: "Public catalogue search with a nonexistent Chinese query",
      idempotency:
        "Client-side query reset only; no event, preference, search-history, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx#Events / 内容",
    {
      actualResult:
        "内容 returned from the map to the 13-event module grid without losing the public catalogue.",
      testData: "Public catalogue after map traversal",
      idempotency:
        "Local view-mode state only; no event, map, preference, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    'web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx#onclick:() => setMode("map")#Map / 地图',
    {
      actualResult:
        "地图 replaced the module grid with 13 source-backed positions and one selected event card.",
      testData: "Unfiltered 13-event public catalogue",
      idempotency:
        "Local view-mode state only; no event, map, preference, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx:364",
    {
      actualResult:
        "Searching EVT01 returned exactly 东京餐饮入境客增长会; a nonexistent Chinese query returned the explicit no-match state.",
      testData:
        "Approved catalogue code EVT01 plus a nonexistent Chinese query",
      idempotency:
        "Client-side search only; no event, search-history, preference, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx:369",
    {
      actualResult:
        "即将开始 returned 3 events, 进行中 returned a truthful empty state, 已结束 returned 10 events, and 全部 restored 13.",
      testData:
        "13 approved public events with 3 upcoming, 0 active, and 10 ended",
      idempotency:
        "Client-side status filtering only; no event, registration, preference, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx:370",
    {
      actualResult:
        "AI combined with 已结束 returned the two matching ended AI events; resetting filters restored all 13.",
      testData: "Approved catalogue topic AI combined with ended status",
      idempotency:
        "Client-side topic filtering only; no event, preference, analytics, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx:388",
    {
      actualResult:
        "Selecting EVT01 in the map rail updated the detail card and preserved the exact source-backed date, venue, status, and participant count.",
      testData: "EVT01/event_01 map rail entry",
      idempotency:
        "Local selection state only; no event, registration, contact, map, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events|repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx:401",
    {
      actualResult:
        "The map selection callback preserved the selected EVT01 identity while the card exposed /app/events/EVT01.",
      testData: "13 located public catalogue events",
      idempotency:
        "Local map-selection state only; no event, registration, map, or external record was written.",
      verificationCase: "web-public-event-catalogue-controls-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx#Calendar is not connected. Propose a time manually / 日历暂未连接，请手动提议时间",
    {
      actualResult:
        "The manual-time field accepted a future ISO timestamp after both participants had accepted the introduction.",
      testData:
        "event_01; audit actors user_ms4tr4vi_jb4qje and user_ms4o6bab_2rps63; 2026-08-01T01:30:00.000Z",
      idempotency:
        "Editing the field was local only and wrote no request, slot, calendar, message, or notification record.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx#Propose time / 提议时间",
    {
      actualResult:
        "提议时间 persisted one proposed slot on the existing accepted request and refreshed the same request card.",
      testData:
        "Stable request intro-request:toy9sb2RdR9J8pjfuuHz7a01crYHhR9-R8nYGO20X_E",
      idempotency:
        "A repeated proposal reused the same request and slot value; it created no second request, calendar event, message, or notification.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx:193",
    {
      actualResult:
        "Selecting the proposed time advanced the same request to scheduled and rendered 已确认时间 2026年8月1日 10:30 after refresh.",
      testData:
        "Accepted two-party event_01 request with one proposed slot at 2026-08-01T01:30:00.000Z",
      idempotency:
        "Repeated selection preserved one request and the same selected slot; no calendar, message, notification, or external write occurred.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx#Request an introduction / 申请认识",
    {
      actualResult:
        "申请认识 created one actor-scoped request for the selected source-backed attendee; retrying from the same or reverse participant direction returned the same stable request ID.",
      testData:
        "event_01; current actor plus 审计撮合 东京伙伴 and 审计撮合 关西伙伴",
      idempotency:
        "SHA-256 request identity is directionless by participant pair; repeated and reverse requests left one persisted introduction request and sent no message.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#记录会后跟进",
    {
      actualResult:
        "记录会后跟进 opened the capture dialog with source-backed attendee suggestions and explicit no-send/no-auto-task copy.",
      testData:
        "Registered actor user_ms4tr4vi_jb4qje on ended public event event_01",
      idempotency:
        "Opening the dialog performed no contact, note, task, reminder, draft, message, or external write.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    'web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#attendeeNames[0] ?? "输入联系人姓名"',
    {
      actualResult:
        "The contact field accepted Chinese multi-word and same-name queries and reset any prior selected or duplicate-review state on edit.",
      testData: "会后验证 唯一; 会后验证 同名; a nonexistent Chinese query",
      idempotency:
        "Field edits were local only and did not create or merge a contact.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#搜索",
    {
      actualResult:
        "搜索 returned the exact unique contact, two distinct same-name contacts, or a truthful empty result for the nonexistent query.",
      testData:
        "One 大阪食品实验室 contact plus same-name 东京商事 and 关西商事 contacts owned by the current actor",
      idempotency:
        "Search was actor-scoped and read-only; repeated queries did not alter contact or workflow records.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx:469",
    {
      actualResult:
        "Selecting 会后验证 同名 exposed the duplicate warning and withheld all downstream actions until server-side contact resolution.",
      testData:
        "Two actor-owned contacts with the same display name and different organizations",
      idempotency:
        "Selection changed local state only; it did not merge contacts or create a note, task, reminder, or draft.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    'web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#{contact.displayName} {[contact.role, contact.organization] .filter(Boolean) .join(" · ") || contact.id}',
    {
      actualResult:
        "The duplicate-contact radio group distinguished 东京商事 from 关西商事 and enabled continuation only after one exact contact was chosen.",
      testData:
        "Duplicate-resolution response for run:post-event-followup:f33effd6",
      idempotency:
        "Radio selection was local only and did not merge either contact or create downstream work.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#正在继续… / 使用选中的联系人继续",
    {
      actualResult:
        "使用选中的联系人继续 resolved the waiting run to the chosen 关西商事 record and rendered four auditable follow-up actions.",
      testData:
        "Waiting run run:post-event-followup:f33effd6 and selected contact contact:business-card:31ee54ccef893e75974ba525",
      idempotency:
        "The waiting branch contained only its run and resolve-contact step; continuation created one resolved run/action set and never merged contacts.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#对方关心什么、你承诺了什么、下一步是什么？",
    {
      actualResult:
        "The note field preserved the entered Chinese commitment text through confirmation and into the source-backed review artifact.",
      testData: "会后 follow-up note for the selected 关西商事 contact",
      idempotency:
        "Editing the note was local only; persistence occurred only after explicit confirmation.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#正在准备… / 确认笔记并准备跟进",
    {
      actualResult:
        "确认笔记并准备跟进 created one approved note, one unsent message draft, and review-only task/reminder actions; retry returned the same core run and action IDs.",
      testData:
        "Resolved run run:post-event-followup:7bce0475; actions 341178d0 and f115171b; draft externalSendRequested=false",
      idempotency:
        "Retry created no duplicate run, core action, draft, receipt, task, reminder, message, or external send; only append-only retry analytics changed.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    'web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx#t({ en: "Back to previous page", zh: "返回上一页" })',
    {
      actualResult:
        "返回上一页 returned EVT01 to its distinct same-origin source: /app/events from the catalogue and /app/o/evt01 from the organizer; a direct entry with no referrer safely fell back to /app/events.",
      testData:
        "Authenticated catalogue → EVT01 and organizer → EVT01 browser navigation plus an empty-referrer direct entry",
      idempotency:
        "Browser-history navigation only; no event, registration, contact, Agent, or external record was written.",
      verificationCase: "web-public-organizer-navigation-2026-07-29",
    },
  ],
  [
    "web:/app/o/[slug]|repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx:50",
    {
      actualResult:
        "The 东京餐饮入境客增长会 organizer card opened /app/events/EVT01 with the exact source-backed detail heading.",
      testData:
        "Orbit 人脉测试空间 public projection with 13 approved events and EVT01/event_01",
      idempotency:
        "Read-only navigation only; no organizer, event, registration, attendee, contact, or external record was written.",
      verificationCase: "web-public-organizer-navigation-2026-07-29",
    },
  ],
  [
    'web:/app/o/[slug]|repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx#t({ en: "Back to events", zh: "返回活动" })',
    {
      actualResult:
        "返回活动 navigated from /app/o/evt01 to /app/events and restored the complete 13-event catalogue.",
      testData: "Orbit 人脉测试空间 public organizer surface",
      idempotency:
        "Read-only navigation only; no organizer, event, registration, attendee, contact, or external record was written.",
      verificationCase: "web-public-organizer-navigation-2026-07-29",
    },
  ],
  [
    "web:/app/o/[slug]|repos/orbits/shared/ui/state-view.tsx:217",
    {
      actualResult:
        "来源详情 expanded the unknown-organizer boundary and exposed PUBLIC_ORGANIZER_NOT_FOUND plus public-catalogue-organizer-not-found.",
      testData:
        "Unknown public slug not-a-real-organizer under the Chinese locale",
      idempotency:
        "Local disclosure state only; no public or private event, organizer, registration, contact, or external record was read into the page or written.",
      verificationCase: "web-public-organizer-unknown-slug-boundary-2026-07-29",
    },
  ],
  [
    "web:/app/o/[slug]|repos/orbits/shared/ui/state-view.tsx:249",
    {
      actualResult:
        "返回活动 left the unknown-organizer boundary and restored the complete 13-event public catalogue.",
      testData:
        "Localized unknown-organizer not-found state with no event or organizer fallback",
      idempotency:
        "Read-only navigation only; no public or private event, organizer, registration, contact, or external record was written.",
      verificationCase: "web-public-organizer-unknown-slug-boundary-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx#View all their events / 查看 TA 的全部活动",
    {
      actualResult:
        "查看 TA 的全部活动 opened /app/o/evt01 and rendered the exact public-catalogue organizer with 13 events and source-backed cumulative count 500.",
      testData:
        "EVT01 organizer Orbit 人脉测试空间; approved 13-event public catalogue",
      idempotency:
        "Read-only navigation; the public projection omitted attendee names and wrote no organizer, event, registration, or contact record.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx#+ {hiddenAttendeeCount} · Show all / 展开全部",
    {
      actualResult:
        "+38 · 展开全部 expanded the source-backed attendee preview from 12 names to all 50 records.",
      testData:
        "Registered event_01 actor with the generated 50-person attendee provider",
      idempotency:
        "Local presentation state only; no attendee, contact, registration, event, or external record was written.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx#Show less / 收起",
    {
      actualResult:
        "收起 restored the 12-person preview while the heading remained the source-backed total 参会者 50.",
      testData: "Expanded event_01 attendee roster",
      idempotency:
        "Local presentation state only; roster count and all persistent records remained unchanged.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx#Ask iOrbit about this event / 问 iOrbit 这场活动",
    {
      actualResult:
        "问 iOrbit 这场活动 opened Agent with event_01, exact title, venue, date, 已结束 status, and a no-external-action constraint; the terminal answer used that one record instead of an unrelated fallback.",
      testData: "东京餐饮入境客增长会 · event_01 · 已结束 · 大阪 · 2026-02-15",
      idempotency:
        "The Agent produced one local conversation and one source-backed recommendation artifact; no message, registration, calendar, contact, task, reminder, or external action occurred, and both audit conversations were deleted after verification.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/party|repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx:116",
    {
      actualResult:
        "The desktop tablist switched among 现场主页, 推荐给你, 全部参会者, 关系图谱, and 流程议程 while preserving event_01.",
      testData:
        "Read-only replay for ended event_01 with 50 source-backed attendees plus the current registered participant",
      idempotency:
        "Tab and keyboard state were local only; no check-in, seat, attendee, contact, recommendation, event, or external record was written.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/party|repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx:164",
    {
      actualResult:
        "退出活动 returned from /app/party?eventId=event_01 to /app/events/EVT01.",
      testData: "Ended-event replay for EVT01",
      idempotency:
        "Read-only navigation; no check-in, registration, seat, contact, message, or external record was written.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/party|repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx:296",
    {
      actualResult:
        "The replay rendered 签到已结束 as disabled, so an ended event could not create a false check-in.",
      testData: "event_01 with ended status",
      idempotency:
        "The disabled control invoked no handler and wrote no check-in or attendance record.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/party|repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx:304",
    {
      actualResult:
        "The replay rendered 尚未分配座位 as disabled rather than inventing a seat.",
      testData:
        "Registered event_01 actor with no source-backed seat assignment",
      idempotency:
        "The disabled control invoked no handler and wrote no seat, check-in, attendee, or event record.",
      verificationCase: "web-public-event-detail-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/home|repos/orbits/app/(app)/app/home/orbit-real-home.tsx#owner:HomeEventRow#onclick:(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }#{content}",
    {
      actualResult:
        "Selecting 功能审计私有活动 20260729 opened /app/events/event%3Alive-record%3A20260729 and preserved the actor-owned event identity.",
      testData:
        "Authenticated browser actor with one upcoming private event whose ID contains colon separators",
      idempotency:
        "Read-only navigation; no event, registration, attendee, recommendation, profile, or external record was written.",
      verificationCase: "web-home-private-event-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/home/events|repos/orbits/app/(app)/app/home/orbit-real-home.tsx#owner:MyEventsBlock#onclick:() => setTab(key)#{label} {counts[key]}",
    {
      actualResult:
        "Selecting 历史 0 changed the result to an explicit empty state; selecting 全部 restored the same one-event list.",
      testData:
        "Authenticated browser actor with one upcoming private event and zero historical events",
      idempotency:
        "Both filter changes were local presentation only and wrote no event, registration, attendee, recommendation, or profile record.",
      verificationCase: "web-home-private-event-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/home/events|repos/orbits/app/(app)/app/home/orbit-real-home.tsx#owner:HomeEventRow#onclick:(clickEvent) => { clickEvent.preventDefault(); orbitNavigate(`/events/${event.code}`); }#{content}",
    {
      actualResult:
        "After restoring 全部, selecting the event opened its exact encoded actor-owned dynamic detail.",
      testData:
        "The one upcoming private event in the authenticated Home Events list",
      idempotency:
        "Read-only navigation; no event, registration, attendee, recommendation, profile, or external record was written.",
      verificationCase: "web-home-private-event-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/home|repos/orbits/app/(app)/app/home/orbit-real-home.tsx#owner:HomeEventRow#onclick:() => enterEvent(event.id)#{content}",
    {
      actualResult:
        "Selecting the actor-owned ended Home event navigated to /app/party with its exact encoded eventId; Party resolved the same event before truthfully reporting that reviewed attendee/recommendation context was unavailable.",
      testData:
        "Disposable authenticated actor user_ms6bsfaj_6f80wx and event:live-record:audit-dynamic-20260730-event-success-a",
      idempotency:
        "Read-only navigation; no event, attendee, recommendation, profile, message, notification, calendar, or external record was written.",
      verificationCase: "home-party-event-identity-repair-2026-07-30",
    },
  ],
  [
    "web:/app/today|repos/orbits/app/(app)/app/today/orbit-today-header-actions.tsx:36",
    {
      actualResult:
        "安排约见 opened a modal that stated the meeting service was unconfigured and exposed no selectable event/contact, date, topic, calendar write, or invitation action.",
      testData:
        "Authenticated browser actor with zero contacts and one private event projected into the read-only Today arrangement rail",
      idempotency:
        "Opening the boundary changed local modal state only and wrote no meeting, relationship history, calendar, message, invitation, event, or contact record.",
      verificationCase: "web-today-meeting-service-boundary-2026-07-29",
    },
  ],
  [
    "web:/app/today|repos/orbits/app/(app)/app/today/orbit-today-time-spine.tsx#onclick:onClose#Got it / 知道了",
    {
      actualResult:
        "知道了 closed the unconfigured-service explanation and returned to the unchanged Today page.",
      testData: "The open meeting-service boundary on authenticated Web Today",
      idempotency:
        "Closing the explanation changed local modal state only and performed no request or persistent write.",
      verificationCase: "web-today-meeting-service-boundary-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-agent-today-workspace.tsx:258",
    {
      actualResult:
        "刷新 reloaded the relationship workspace and preserved the authenticated actor's empty, truthful zero-change state without restoring any deployment-global chat history.",
      testData:
        "Authenticated audit actor with zero contacts, follow-ups, calendar changes, Agent operations, and actor-scoped chat sessions",
      idempotency:
        "Read-only refresh; no chat session, message, operation, relationship, follow-up, calendar, or external record was written.",
      verificationCase: "web-agent-session-actor-isolation-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/orbit-public-shell.tsx:127",
    {
      actualResult:
        "账号菜单 exposed the independently authenticated second account surface-contacts-1785123834639@example.invalid before its Agent, All Actions, and Today isolation checks.",
      testData:
        "Independent Chrome session for actor user_ms2on5yh_60z90f, distinct from the first audit actor user_ms5llhof_wrbpuq",
      idempotency:
        "Opening the account menu changed local disclosure state only; it created no session, Run, action, task, reminder, contact, event, or external record.",
      verificationCase: "web-agent-action-second-actor-isolation-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#重新提交请求 / Retry request",
    {
      actualResult:
        "A formally persisted 6/7 failed run rendered its exact timeout evidence; 重新提交请求 replayed the nearest preceding user request and produced a distinct 6/6 completed run while preserving the old failed run.",
      testData:
        "Authenticated live actor, Retry Audit 20260729 read-only request, formally seeded RETRY_AUDIT_PROVIDER_TIMEOUT step, and two distinct persisted conversation run ids",
      idempotency:
        "The recovery control was disabled while replaying; the old run remained failed, the new run contained zero actions, and hard reload/history reopen retained both attempts.",
      verificationCase: "web-agent-failed-request-replay-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#onclick:() => void ask(message.retryRequest!, index)#重新提交请求 / Retry request",
    {
      actualResult:
        "An explicit missing DeepSeek key produced one real 503 failure and the exact message retry control. Restoring the configured provider and rapidly activating retry twice emitted one retry request with empty history, replaced the stale failure with one successful assistant turn, survived refresh, and remained absent for actor B.",
      testData:
        "Two disposable authenticated actors, formal Next production conversation API, configured Postgres live store, explicit provider failure followed by repository-configured provider recovery",
      idempotency:
        "Two rapid activations produced one retry; the final store contained one user and one successful assistant turn, zero stale failure/retry messages, zero action/outbox/domain writes, and exact cleanup activeAfter=0.",
      verificationCase: "web-agent-retry-idempotent-current-handler-2026-07-30",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#在 Today 查看 / Open in Today",
    {
      actualResult:
        "在 Today 查看 opened the exact completed action entry; selecting 2026-09-03 showed one 23:59 arrangement named 联系 Undo Audit Person before undo.",
      testData:
        "Authenticated live actor, action action:natural-language:a34dc77e, and one persisted follow-up task due 2026-09-03T23:59:59.000Z",
      idempotency:
        "Navigation was read-only; the action retained one completed execution receipt and the due-date task count remained one before undo.",
      verificationCase: "web-agent-confirm-undo-idempotency-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#全部操作 / All actions",
    {
      actualResult:
        "全部操作 opened the exact expanded ledger entry for action:natural-language:a34dc77e with its completed operation, evidence id, payload hash, executor, and idempotency key.",
      testData:
        "The completed create_followup_task action for 联系 Undo Audit Person",
      idempotency:
        "Navigation and audit readback wrote no record; the ledger still contained one outbox item and one completed execution receipt.",
      verificationCase: "web-agent-confirm-undo-idempotency-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#确认执行 / Confirm",
    {
      actualResult:
        "A double click on 确认执行 moved the action to 已完成 and removed the confirmation control; live-store readback found exactly one completed outbox item, one completed execution receipt, and one persisted follow-up task.",
      testData:
        "Run run:natural-language:05879e7b with one selected create_followup_task operation for 联系 Undo Audit Person",
      idempotency:
        "The repeated confirmation gesture converged on one action, one outbox item, one execution receipt, and one task; no reminder operation or record existed.",
      verificationCase: "web-agent-confirm-undo-idempotency-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/all-actions|repos/orbits/app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx#撤销",
    {
      actualResult:
        "A double click on 撤销 changed the exact ledger entry to 已撤销, removed its undo control, removed the 2026-09-03 task from Today, and survived hard reload plus Agent history reopen.",
      testData:
        "Completed action action:natural-language:a34dc77e with one completed operation and one compensating follow-up delete",
      idempotency:
        "Two further formal undoAction calls both returned undone; live-store readback retained exactly one completed execution receipt, one undo receipt, and one outbox item.",
      verificationCase: "web-agent-confirm-undo-idempotency-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/all-actions|repos/orbits/app/(app)/app/contacts/all-actions/orbit-all-actions-controls.tsx#重试失败项",
    {
      actualResult:
        "重试失败项 moved one actor-scoped action from 部分失败 to 已完成, executed only its dead-letter operation, retained the prior successful operation, and removed the retry control after the authoritative reload.",
      testData:
        "Run run:audit-partial-retry:20260729 with one completed follow-up task and one formally recorded dead-letter follow-up task",
      idempotency:
        "Each operation ended with exactly one completed receipt and one task; the successful operation was not replayed, the failed attempt receipt remained auditable, and final undo removed both tasks once.",
      verificationCase:
        "web-agent-partial-failure-retry-compensation-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#onclick:async () => setCopied(await copyAgentMessageText(text))#t({ en: "Copy message", zh: "复制消息" })',
    {
      actualResult:
        "Clicking the latest assistant message copy control changed data-orbit-agent-message-copy from idle to copied and changed its title to 已复制 on the real persisted conversation.",
      testData:
        "Live actor user_ms5llhof_wrbpuq, persisted session agent-session-ms5t5ozq-x2bv2k, and latest assistant message from run run:conversation:aa176da4-fcb7-4d1b-8d68-332d87817637",
      idempotency:
        "Copying changed only clipboard/local presentation state; it wrote no conversation, Run, feedback, action, task, contact, or external record.",
      verificationCase: "web-agent-message-copy-feedback-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-outcome-feedback.tsx#onclick:() => void save({ rating: value })#… / {label}",
    {
      actualResult:
        "不相关 and 有帮助 each became the sole selected rating when clicked on the source-backed Run. Formal readback ended with rating=helpful, retained the same feedback id and createdAt across updates, remained null for actor B, restored the selected state after reload, and was removed during cleanup.",
      testData:
        "Actor A user_ms5llhof_wrbpuq, actor B user_ms2on5yh_60z90f, Run run:conversation:d52a1b13-4b1f-4dd5-97db-571bf3484f0f, and four unique event evidence ids",
      idempotency:
        "Each rating upsert updated one actor-and-Run feedback record rather than appending another record; the final record retained one feedback id and one four-id evidence set.",
      verificationCase: "web-agent-evidence-source-disclosure-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-outcome-feedback.tsx#onclick:() => void save({ outcome: value })#… / {label}",
    {
      actualResult:
        "已联系, 已约见, and 目标有推进 each became the sole selected later outcome in sequence. Formal readback ended with outcome=goal_advanced on the same actor-owned feedback record, reload restored it, and cleanup removed it.",
      testData:
        "Source-backed Run run:conversation:d52a1b13-4b1f-4dd5-97db-571bf3484f0f with sourceModules orbit-ai/events and four unique event evidence ids",
      idempotency:
        "All three controls converged on one feedback record keyed by the actor-owned Run; no duplicate outcome or feedback record was created.",
      verificationCase: "web-agent-evidence-source-disclosure-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#onclick:() => void cancelRun()#正在取消… / Canceling… / 取消本次请求 / Cancel this request",
    {
      actualResult:
        "Clicking the user-facing 取消本次请求 control changed each independently created awaiting-confirmation task proposal into 已取消, removed the run-cancel and Confirm/Later/Ignore controls, and survived exact-session reload. Formal readback returned Run=canceled and action=canceled for actor A, null for actor B, zero outbox/receipts, and zero matching task records.",
      testData:
        "Actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; sessions agent-session-ms60pyvu-9pflqn and agent-session-ms60zisb-gs4wz4; Runs run:natural-language:effb1b4d and run:natural-language:5d28297a; actions action:natural-language:5365bb78 and action:natural-language:e1cd343e; unexecuted task proposals for Cancel Transition Audit Person and Cancel Label Audit Person",
      idempotency:
        "Each cancellation converged its Run and action on the terminal canceled state before any outbox event or receipt existed. Terminal rendering exposed no repeat cancellation or review control; both temporary conversations were independently deleted while the audit ledger retained the terminal records.",
      verificationCase: "web-agent-run-cancellation-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#onclick:() => void applyTransition(action, "defer")#稍后处理 / Later',
    {
      actualResult:
        "Clicking 稍后处理 changed action:natural-language:ed36fb20 from 等待确认 to 稍后处理, removed its Today shortcut, retained 确认执行 and 忽略, and survived exact session reload. Formal actor-A readback returned status=deferred with zero outbox and receipts while actor B returned null.",
      testData:
        "Actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; session agent-session-ms6020sv-r84o50; Run run:natural-language:82c9cc7d; action action:natural-language:ed36fb20; one unexecuted create_followup_task proposal for Transition Audit Person",
      idempotency:
        "The first transition persisted one deferred status and no domain side effect. A second Later click originally returned the stable transition conflict; after repair the invalid control is absent for deferred actions, so duplicate submission cannot be initiated from the current UI.",
      verificationCase: "web-agent-review-transition-state-machine-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx#onclick:() => void applyTransition(action, "reject")#忽略 / Ignore',
    {
      actualResult:
        "From the persisted deferred state, clicking 忽略 changed the action to 已忽略, removed Confirm/Later/Ignore controls, completed the waiting Run, and survived reload. Formal readback returned rejected for actor A, null for actor B, zero outbox/receipts, and zero matching task records.",
      testData:
        "The same actor-owned deferred action action:natural-language:ed36fb20 and Run run:natural-language:82c9cc7d, with configured live task storage queried for Transition Audit Person",
      idempotency:
        "Rejected is terminal in the review state map, so the UI exposes no repeat Ignore or other write control. No task, reminder, message, contact, outbox event, receipt, or external write was created.",
      verificationCase: "web-agent-review-transition-state-machine-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#onkeydown:toggleAgentEvidenceSourcesFromKeyboard#{t({ en: `Sources · ${totalItems} records`, zh: `查看依据 · ${totalItems} 条真实记录`, })}",
    {
      actualResult:
        "The live recommendation first exposed an inflated 8-record count from an exact duplicate replan artifact, then 5 from a four-record result overlapping a one-record refinement. After repair, the persisted conversation rendered 查看依据 · 4 条真实记录, expanded to one source group from orbit-ai · events with the exact source time and evidence ids, opened with Enter, and closed with Space.",
      testData:
        "Actor user_ms5llhof_wrbpuq; sessions agent-session-ms5y03iq-c0phvh and agent-session-ms5yf1pi-bsibno; runs run:conversation:ad4cf600-e3cc-4529-b5c0-925aa8978e98 and run:conversation:d52a1b13-4b1f-4dd5-97db-571bf3484f0f; four unique event evidence records",
      idempotency:
        "Disclosure changed only the native details open state. Repeated parsing grouped equivalent and overlapping references by source snapshot and evidence id, persisted one normalized four-record reference, and final cleanup returned both sessions and both feedback records as null.",
      verificationCase: "web-agent-evidence-source-disclosure-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#t({ en: "Rename conversation", zh: "重命名对话" })',
    {
      actualResult:
        "The rename field loaded the persisted display name for the selected actor-owned session and accepted a replacement title without changing the underlying session id or messages.",
      testData:
        "Live session agent-session-ms5w1kuk-o68abs with two read-only messages and the generated title 这是 History Lifecyc...",
      idempotency:
        "Editing the field alone wrote nothing; only the explicit save control submitted the new title, while cancel discarded the draft.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#t({ en: "Save conversation name", zh: "保存对话名称" })',
    {
      actualResult:
        "保存对话名称 persisted History Lifecycle Audit 20260729, closed the editor, rendered 对话已重命名, and retained the exact title after a production-page reload.",
      testData:
        "Live actor user_ms5llhof_wrbpuq and session agent-session-ms5w1kuk-o68abs",
      idempotency:
        "The per-session mutation fence disabled concurrent history writes, and the UI changed only after the API proved storage.persisted=true.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#t({ en: "Cancel conversation rename", zh: "取消重命名对话" })',
    {
      actualResult:
        "After the field was changed to SHOULD NOT PERSIST 20260729, 取消重命名对话 closed the editor, restored the prior title, and a reload proved the temporary value had not been saved.",
      testData:
        "Existing actor-owned Undo Audit conversation agent-session-ms5tz2ay-zx6dfl",
      idempotency:
        "Cancel performed no request and wrote no session record; repeated reads retained the prior title and messages.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#item.q || item.title",
    {
      actualResult:
        "Selecting the temporary history row after first opening a different conversation navigated to ?session=agent-session-ms5w1kuk-o68abs and restored both the exact prompt and assistant reply; the same result survived reload.",
      testData:
        "Two actor-owned persisted conversations, including the read-only History Lifecycle Audit session",
      idempotency:
        "Selection only read the actor-scoped session and updated URL/local presentation state; it created no conversation, message, action, or external record.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#t({ en: "More actions", zh: "更多操作" })',
    {
      actualResult:
        "更多操作 opened the exact session-scoped menu with pin or unpin, rename, and delete actions; opening it changed no stored record.",
      testData:
        "Session menu button carrying data-orbit-agent-history-menu-button=agent-session-ms5w1kuk-o68abs",
      idempotency:
        "Repeated menu open and close changed only local disclosure state and wrote no history record.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#Unpin / 取消置顶 / Pin / 置顶",
    {
      actualResult:
        "置顶 waited for persisted storage evidence, rendered 对话已置顶, moved the session into the pinned group order, and reopened as 取消置顶 after reload.",
      testData:
        "Live session agent-session-ms5w1kuk-o68abs initially stored with pinned=false",
      idempotency:
        "The session-level mutation fence prevented duplicate concurrent writes; live readback returned pinned=true exactly once.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#Rename / 重命名",
    {
      actualResult:
        "重命名 closed the actions menu and opened one named field with explicit save and cancel controls for the selected session.",
      testData: "Pinned live History Lifecycle Audit session",
      idempotency:
        "Opening rename changed only local editor state and did not write until explicit save.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#Delete / 删除对话",
    {
      actualResult:
        "删除对话 did not delete immediately; it opened an alertdialog naming the exact conversation and stating that its messages would be permanently removed and could not be recovered.",
      testData:
        "Selected History Lifecycle Audit 20260729 session with two persisted messages",
      idempotency:
        "Opening the confirmation wrote nothing and retained the session in both UI and live storage.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#Keep conversation / 保留对话",
    {
      actualResult:
        "保留对话 closed the destructive confirmation, kept the selected session and its assistant reply visible, and left the history row present.",
      testData: "Open delete confirmation for agent-session-ms5w1kuk-o68abs",
      idempotency: "Cancel sent no DELETE request and changed no live record.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#Deleting… / 正在删除… / Delete conversation / 删除对话",
    {
      actualResult:
        "Confirmed deletion removed the active row only after the actor-scoped DELETE persisted, navigated to the fresh Agent home, removed the transcript, and remained absent after reload.",
      testData:
        "Live actor user_ms5llhof_wrbpuq, session agent-session-ms5w1kuk-o68abs, and isolated actor user_ms2on5yh_60z90f",
      idempotency:
        "Before deletion the second actor returned null for the session. After deletion both actors returned null; no cross-actor record or orphaned visible session remained.",
      verificationCase: "web-agent-history-lifecycle-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#onclick:newChat#New chat / 新对话",
    {
      actualResult:
        "After selecting the real Undo Audit conversation, desktop 新对话 returned the URL to /app/agent, removed the old prompt and transcript, restored the welcome workspace and active composer, and retained all six persisted history rows.",
      testData:
        "Authenticated actor user_ms5llhof_wrbpuq with six stored sessions and active session agent-session-ms5tz2ay-zx6dfl",
      idempotency:
        "New chat changed only active client session state and URL; it deleted no session, message, action, task, or external record.",
      verificationCase: "web-agent-history-navigation-resize-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#t({ en: "Chat history", zh: "对话历史" })',
    {
      actualResult:
        "At 390x844 the history control was initially present in the DOM but invisible because the shared mobile nav rule hid the mixed extras container. After separating mobile contextual actions, the top bar exposed 对话历史 and 打开菜单, kept 打开收件箱 hidden, and clicking 对话历史 opened the labelled modal drawer with focus on 关闭.",
      testData:
        "Authenticated actor user_ms5llhof_wrbpuq, production Web /app/agent at 390x844, six actor-owned persisted sessions",
      idempotency:
        "Opening, focus traversal, Escape, and reopening changed only drawer presentation state. They made no session, message, action, task, inbox, or external write.",
      verificationCase: "web-agent-mobile-history-navigation-2026-07-29",
    },
  ],
  [
    "web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#onclick:onNewChat#New chat / 新对话",
    {
      actualResult:
        "After the mobile drawer selected session agent-session-ms5tz2ay-zx6dfl and reload restored its prompt and pending-action explanation, 新对话 closed the drawer, returned the URL to /app/agent, removed the old transcript, restored the welcome workspace, returned focus to 对话历史, and retained six of six history rows.",
      testData:
        "Authenticated actor user_ms5llhof_wrbpuq with six stored sessions; selected Undo Audit session agent-session-ms5tz2ay-zx6dfl; 390x844 production viewport",
      idempotency:
        "Mobile New chat reset only active client state and URL. The history row count remained 6 before and 6 after, proving it did not delete a session or domain record.",
      verificationCase: "web-agent-mobile-history-navigation-2026-07-29",
    },
  ],
  [
    'web:/app/agent|repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx#t({ en: "Resize chat history", zh: "调整历史宽度" })',
    {
      actualResult:
        "The vertical separator announced min=180, max=380, and current=212. ArrowRight changed current and rendered width to 228, Home moved to 180, and End moved to 380.",
      testData:
        "Authenticated desktop Agent production page with the focusable history separator",
      idempotency:
        "Keyboard resizing changed only local layout state and wrote no session, preference, message, action, or external record; reload restored the product default.",
      verificationCase: "web-agent-history-navigation-resize-2026-07-29",
    },
  ],
  [
    "web:/app/chat|repos/orbits/shared/ui/state-view.tsx:249",
    {
      actualResult:
        "Reload Orbit AI removed the rejected legacy conversation query and returned to the same actor-scoped no-chat-context state.",
      testData:
        "Authenticated audit actor with zero actor-scoped conversations after direct navigation to the previously leaked conversation_seed_069",
      idempotency:
        "Read-only navigation; no conversation, message, writing assist, summary, extraction, privacy setting, profile, Agent operation, or external record was written.",
      verificationCase: "web-chat-workspace-actor-isolation-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/all-actions|repos/orbits/app/(app)/app/contacts/orbit-crm-sidebar.tsx:68",
    {
      actualResult:
        "人脉表盘 opened the actor-scoped relationship dashboard from the empty operation ledger.",
      testData:
        "Authenticated audit actor with zero operation-ledger entries and zero contacts",
      idempotency:
        "Read-only navigation; no operation, contact, relationship metric, recommendation, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/dashboard|repos/orbits/app/(app)/app/contacts/orbit-real-cards-dashboard.tsx:285",
    {
      actualResult:
        "添加联系人 opened /app/contacts/new, which preserved the explicit unconfigured OCR/import boundary and created no contact.",
      testData: "Authenticated actor-scoped empty relationship dashboard",
      idempotency:
        "Navigation only; no image was uploaded and no contact, draft, signal, relationship metric, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/graph|repos/orbits/app/(app)/app/contacts/orbit-crm-sidebar.tsx:68",
    {
      actualResult:
        "引荐记录 opened the actor-scoped zero-introduction ledger from the empty graph.",
      testData:
        "Authenticated relationship graph with zero contacts, zero events, zero nodes, and zero edges",
      idempotency:
        "Read-only navigation; no graph, contact, introduction, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/graph|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:930",
    {
      actualResult:
        "缩小 restored the local empty-graph scale from 120% to 100%.",
      testData: "Actor-scoped graph with zero contacts and zero events",
      idempotency:
        "Local presentation state only; no graph, contact, event, relationship, preference, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/graph|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:932",
    {
      actualResult:
        "放大 changed the local empty-graph scale from 100% to 120%.",
      testData: "Actor-scoped graph with zero contacts and zero events",
      idempotency:
        "Local presentation state only; no graph, contact, event, relationship, preference, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:1132",
    {
      actualResult:
        "选择联系人 opened the first-contact picker without substituting a fixture identity; after repair the zero-contact state named the prerequisite instead of showing a blank search field.",
      testData:
        "Authenticated introduction composer with zero actor-scoped contacts",
      idempotency:
        "Local modal state only; no contact, introduction draft, message, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx##Add contacts / 添加联系人",
    {
      actualResult:
        "添加联系人 left the repaired picker and opened the fail-closed import hub.",
      testData: "Repaired introduction picker with zero source-backed contacts",
      idempotency:
        "Navigation only; no image was uploaded and no contact, introduction, draft, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx#onclick:onClose#Cancel / 取消",
    {
      actualResult:
        "取消 closed the introduction composer and returned to the unchanged zero-entry ledger.",
      testData: "Open introduction composer with no selected contacts or note",
      idempotency:
        "Local modal state only; no introduction, draft, contact, message, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx#onclick:() => setComposerOpen(true)#Make introduction / 发起引荐",
    {
      actualResult:
        "发起引荐 opened a draft-only composer, left 保存草稿 disabled, and stated that nothing would be sent.",
      testData:
        "Authenticated actor with zero contacts and zero stored introduction records",
      idempotency:
        "Local modal state only; no introduction, draft, contact, message, notification, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:1370",
    {
      actualResult:
        "草稿 0, 已发送 0, and 全部 0 each became the pressed filter in turn while preserving the explicit no-match state and zero counts.",
      testData:
        "Actor-scoped introduction ledger with zero all, draft, and sent records",
      idempotency:
        "Local filter state only; no introduction, draft, contact, message, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/party|repos/orbits/shared/ui/state-view.tsx:217",
    {
      actualResult:
        "来源详情 expanded the selected event's no-people-context boundary and exposed five missing composed-capability evidence records.",
      testData:
        "Authenticated Party route with actor-owned event:live-record:20260729 and no attendee, readiness, want-connect, encounter-note, or post-event-review records",
      idempotency:
        "Local disclosure state only; no check-in, contact, event, recommendation, notification, calendar, AI, or external record was written.",
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/party|repos/orbits/shared/ui/state-view.tsx:249",
    {
      actualResult:
        "返回当前活动 opened /app/events/event%3Alive-record%3A20260729 and rendered the same actor-owned private event detail.",
      testData:
        "Authenticated Party prerequisite boundary for event:live-record:20260729",
      idempotency:
        "Read-only navigation; no event, check-in, contact, recommendation, notification, calendar, AI, or external record was written.",
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/party/checkin|repos/orbits/shared/ui/state-view.tsx:217",
    {
      actualResult:
        "来源详情 expanded the Check-in prerequisite and exposed the same five missing composed-capability evidence records.",
      testData:
        "Authenticated Party Check-in route with actor-owned event:live-record:20260729 and no reviewed people context",
      idempotency:
        "Local disclosure state only; no check-in, contact, event, recommendation, notification, calendar, AI, or external record was written.",
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/party/checkin|repos/orbits/shared/ui/state-view.tsx:249",
    {
      actualResult:
        "返回当前活动 preserved the encoded event ID from Check-in and opened the same actor-owned private event detail.",
      testData:
        "Authenticated Party Check-in prerequisite boundary for event:live-record:20260729",
      idempotency:
        "Read-only navigation; no check-in, event, contact, recommendation, notification, calendar, AI, or external record was written.",
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/party/graph|repos/orbits/shared/ui/state-view.tsx:217",
    {
      actualResult:
        "来源详情 expanded the Graph prerequisite and exposed the same five missing composed-capability evidence records without rendering a synthetic graph.",
      testData:
        "Authenticated Party Graph route with actor-owned event:live-record:20260729 and no reviewed people context",
      idempotency:
        "Local disclosure state only; no graph, node, edge, contact, event, recommendation, notification, AI, or external record was written.",
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/party/graph|repos/orbits/shared/ui/state-view.tsx:249",
    {
      actualResult:
        "返回当前活动 preserved the encoded event ID from Graph and opened the same actor-owned private event detail.",
      testData:
        "Authenticated Party Graph prerequisite boundary for event:live-record:20260729",
      idempotency:
        "Read-only navigation; no graph, event, contact, recommendation, notification, calendar, AI, or external record was written.",
      verificationCase: "web-party-source-context-boundaries-2026-07-29",
    },
  ],
  [
    "web:/app/schedule/events/[id]|repos/orbits/app/(app)/app/schedule/events/[id]/orbit-real-schedule-event.tsx:26",
    {
      actualResult:
        "Both generated recovery links were exercised: 返回日程 resolved to /app/today#arrangements with a real anchor, and 查看活动列表 resolved to /app/events.",
      testData:
        "Authenticated actor-owned schedule preview for event:live-record:20260729",
      idempotency:
        "Both actions were read-only navigation; no event, calendar, registration, reminder, message, contact, or external record was written.",
      verificationCase: "web-schedule-dynamic-event-identity-2026-07-29",
    },
  ],
  ...[
    [
      "repos/orbits/features/connections/relationship-stage-and-profile-mock/api-probe-controls.tsx#onsubmit:(event) =>\n        void submit(event, {\n          action: \"/api/connections/demo-connection-1/profile\",\n          method: \"PATCH\",\n        })#Mock relationship profile form",
      "Mock relationship profile form issued PATCH with the rendered relationship type/context body and rendered a 200 success envelope.",
    ],
    [
      "repos/orbits/features/connections/relationship-stage-and-profile-mock/api-probe-controls.tsx#onsubmit:(event) =>\n            void submit(event, {\n              action: \"/api/connections/demo-connection-1/stage\",\n              method: \"PATCH\",\n            })#Run relationship stage probe",
      "Run relationship stage probe issued a bodyless PATCH and rendered its deterministic 400 VALIDATION_ERROR instead of silently falling back to GET, POST, or 405.",
    ],
    [
      "repos/orbits/features/connections/relationship-stage-and-profile-mock/api-probe-controls.tsx#onsubmit:(event) =>\n            void submit(event, {\n              action: \"/api/connections/demo-connection-1/profile\",\n              method: \"PATCH\",\n            })#Run relationship profile probe",
      "Run relationship profile probe issued a bodyless PATCH and rendered its deterministic 400 VALIDATION_ERROR instead of silently falling back to GET, POST, or 405.",
    ],
    [
      "repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx#onsubmit:(event) =>\n        void submit(event, {\n          action: \"/api/contacts/demo-contact-1\",\n          arrayFields: [\"addTags\"],\n          method: \"PATCH\",\n        })#Mock contact detail tag and status edit form",
      "Mock contact detail tag and status edit form issued PATCH with the rendered status/tag/note body and rendered a 200 success envelope.",
    ],
    [
      "repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx#onsubmit:(event) => void submitGet(event)#Run contact detail API probe",
      "Run contact detail API probe issued GET /api/contacts/demo-contact-1 and rendered a 200 success envelope.",
    ],
    [
      "repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx#onsubmit:(event) => void submitGet(event)#Run empty contact detail API probe",
      "Run empty contact detail API probe preserved scenario=empty on GET and rendered a 200 empty envelope.",
    ],
    [
      "repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx#onsubmit:(event) => void submitGet(event)#Run pending contact detail API probe",
      "Run pending contact detail API probe preserved scenario=pending on GET and rendered a 200 pending envelope.",
    ],
    [
      "repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx#onsubmit:(event) => void submitGet(event)#Run controlled failure contact detail API probe",
      "Run controlled failure contact detail API probe preserved scenario=failure on GET and rendered the controlled 503 SERVICE_UNAVAILABLE envelope.",
    ],
  ].map(([stableKey, actualResult]) => [
    `web:/dev/capabilities/[slug]|${stableKey}`,
    {
      actualResult,
      testData:
        "Disposable authenticated actor on the exact development capability slug with process-scoped mock mode and source-hashed client controls",
      idempotency:
        "All probes created zero live domain records; the disposable actor was removed with activeAfter=0 and the browser/server were finalized.",
      verificationCase:
        "web-debug-api-probe-method-query-ui-2026-07-30",
    },
  ]),
]);
const LIVE_CONTACTS_LIST_INTERACTION_EVIDENCE = new Map([
  [
    "repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:327",
    {
      actualResult:
        "Selecting the Kansai result opened its canonical source-backed dynamic detail instead of a failure boundary.",
      testData:
        "Account C; 林 美咲 at 关西质量协作实验室; contact:business-card:9395a193212602a291845769",
      idempotency:
        "Navigation only; no contact or relationship record was written.",
    },
  ],
  [
    "repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:527",
    {
      actualResult:
        "Searching 林 美咲 returned exactly two contacts and preserved their distinct Kansai and Tokyo organizations while excluding 王 伟.",
      testData:
        "Account C; three live business-card contacts including two same-name records",
      idempotency:
        "Client-side filtering only; the four persisted records remained unchanged.",
    },
  ],
]);
const LIVE_CONTACT_DETAIL_INTERACTION_EVIDENCE = new Map([
  [
    "repos/orbits/app/(app)/app/contacts/orbit-real-card-connection.tsx:328",
    {
      actualResult:
        "返回名片夹 navigated from the source-backed contact detail to /app/contacts and restored all three account-C contacts.",
      testData:
        "Account C; Kansai source-backed contact detail in Chinese locale",
      idempotency:
        "Navigation only; no contact or relationship record was written.",
    },
  ],
]);
const LIVE_BUSINESS_CARD_RESTRICTED_INTERACTION_EVIDENCE = new Map([
  [
    "repos/orbits/app/(app)/app/contacts/orbit-real-cards-import.tsx:162",
    {
      actualResult:
        "The business-card source rendered disabled with the visible state 不可用 because the production environment had durable storage but no Gemini/Google OCR credential.",
      testData:
        "Authenticated account C; ORBIT_MODULE_MODE=live; configured Postgres; GEMINI_API_KEY and GOOGLE_API_KEY absent",
      idempotency:
        "The disabled source performed no upload, provider request, or contact write.",
    },
  ],
  [
    "repos/orbits/app/(app)/app/contacts/business-card-capture-workspace.tsx:386",
    {
      actualResult:
        "返回人脉 navigated from the restricted capability state to /app/contacts, which rendered 全部人脉.",
      testData: "Authenticated account C; Chinese locale",
      idempotency: "Navigation only; contact count remained zero.",
    },
  ],
]);
const LIVE_EVENT_REGISTRATION_INTERACTION_EVIDENCE = new Map(
  [
    [
      706,
      {
        actualResult:
          "Selecting A/C showed the thinking state and advanced to a source-constrained adaptive next question.",
        testData: "Accounts B/C; 正在扩大规模 and 正在探索",
        idempotency: "single click advanced one transcript turn",
      },
    ],
    [
      754,
      {
        actualResult:
          "Submitting the custom-answer form advanced one turn without navigating away.",
        testData: "正在建设跨境供应链与产品质量验证体系",
        idempotency: "one submitted form produced one transcript turn",
      },
    ],
    [
      761,
      {
        actualResult:
          "The custom-answer field accepted a Chinese multi-word value that later persisted exactly.",
        testData: "正在建设跨境供应链与产品质量验证体系",
        idempotency: "field edit alone performed no persistent write",
      },
    ],
    [
      770,
      {
        actualResult:
          "Continue submitted the custom value, showed loading, and rendered the next question.",
        testData: "正在建设跨境供应链与产品质量验证体系",
        idempotency: "one click produced one transcript turn",
      },
    ],
    [
      776,
      {
        actualResult:
          "The custom-answer affordance revealed the editable field and enabled Continue only after non-empty input.",
        testData: "Accounts B/C, first interview question",
        idempotency: "UI-only reveal; no persistent write",
      },
    ],
    [
      808,
      {
        actualResult:
          "With the server offline, generation returned to the interview with Failed to fetch and wrote zero records; retry after restart saved one record before revealing the persona.",
        testData: "Account C; 正在探索; intentional next-start outage",
        idempotency:
          "failed attempt wrote zero rows; retry wrote one stable user/event record",
      },
    ],
    [
      901,
      {
        actualResult:
          "Cancel registration opened an alert dialog and performed no write until explicit confirmation.",
        testData: "Account B registered summary",
        idempotency:
          "opening and dismissing the dialog did not mutate the registration",
      },
    ],
    [
      973,
      {
        actualResult:
          "Register again returned the cancelled record to the interview; successful submission reactivated the same record ID.",
        testData: "Account B; 再次报名，寻找关西质量合作伙伴",
        idempotency:
          "reactivation reused the original registration and participant-profile IDs",
      },
    ],
    [
      1280,
      {
        actualResult:
          "Keep registration dismissed the alert dialog; the UI and Postgres record remained rsvped.",
        testData: "Account B registered summary",
        idempotency: "dismissal performed no persistent write",
      },
    ],
    [
      1292,
      {
        actualResult:
          "Confirm cancellation persisted status=cancelled, rendered the cancelled result, and survived full refresh; later reactivation reused the same row.",
        testData: "Account B event_signup_01 registration",
        idempotency:
          "one user/event record remained before and after cancel/reactivate",
      },
    ],
  ].map(([line, evidence]) => [
    `repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx:${line}`,
    evidence,
  ]),
);
const VERIFIED_AUDIT_CASES = [
  {
    id: "inventory-route-denominator-2026-07-28",
    target: "Next.js and Expo Router route trees",
    testData:
      "Current chat-agent worktree; independent recursive filesystem enumeration",
    expected:
      "Every non-API Next.js page and every Expo route file appears exactly once by client and route",
    actual:
      "46 Web routes and 48 mobile routes produced 94 unique surface IDs; Web development routes remain included",
    evidence:
      "node --test --import tsx tests/audits/full-product-functional-audit.test.ts",
    conclusion: "pass-static-denominator; runtime traversal remains pending",
  },
  {
    id: "dev-inert-control-remediation-2026-07-28",
    target:
      "Business-card review, chat assist, follow-up, message-draft, reminder, and profile capability demos",
    testData:
      "Rendered deterministic mock capability states from production component source",
    expected:
      "Read-only evidence and snapshot content must not render as clickable or editable controls; every remaining visible control has static behavior evidence",
    actual:
      "Five inert buttons were replaced by semantic instructions, the unsaved profile editor became a read-only snapshot, and the generated inventory reports zero candidate-missing-handler controls",
    evidence:
      "Focused capability render tests, tests/audits/full-product-functional-audit.test.ts, and production-build browser DOM at desktop and 390x844",
    conclusion:
      "pass for the six remediated capability IDs; remaining capability IDs and route states are pending",
  },
  {
    id: "harness-test-runner-reproducibility-2026-07-28",
    target: "Root uv-managed Harness test command",
    testData: "Fresh uv lock resolution from pyproject.toml dependency groups",
    expected:
      "The documented uv run pytest command installs its own runner and executes Harness tests without relying on a globally installed pytest",
    actual: "uv lock added pytest and uv run pytest -q completed 310/310 tests",
    evidence: "uv lock && uv run pytest -q",
    conclusion: "pass",
  },
  {
    id: "explicit-accessible-control-names-2026-07-28",
    target:
      "Web agent conversation rename input and mobile Home iOrbit send control",
    testData:
      "Current rendered component source plus focused Web and mobile source-regression tests",
    expected:
      "Every visible interactive control exposes a platform-appropriate accessible name",
    actual:
      "The Web rename input now has a localized aria-label, the mobile icon-only Pressable has an accessibilityLabel, and the generated inventory reports zero candidate controls without static accessible-name evidence",
    evidence:
      "node --test --import tsx tests/pages/app-agent-chat-history.test.ts; node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-view-model.test.ts; tests/audits/full-product-functional-audit.test.ts",
    conclusion:
      "pass-static-source-regression for the two remediated controls; assistive-technology runtime traversal remains pending",
  },
  {
    id: "web-production-route-transport-smoke-2026-07-28",
    target: "All Next.js page routes, including dynamic and development routes",
    testData:
      "Exact production build served by next start; dynamic samples include public catalogue event EVT01, demo-contact-1, demo-event-1 organizer/schedule fallback, and business-card-review-and-confirm-flow",
    expected:
      "Public and development surfaces return rendered Orbit HTML; authenticated surfaces and the registration workspace redirect to the login entry with the requested return path; no route returns 4xx/5xx",
    actual:
      "All 46 Web route surfaces matched their transport contract: 23 returned 200 and 23 returned 307 authentication redirects, with zero mismatches. The 23 directly rendered surfaces also passed browser base-state checks at 1440x900 and 390x844 with non-empty content, correct title, no horizontal overflow, and no console warnings or errors.",
    evidence:
      "npm run build; npm run audit:web-transport against next start -p 3110; in-app browser traversal of the same 23 directly rendered samples at desktop and mobile viewport",
    conclusion:
      "pass-production-transport; authenticated content, interaction, responsive, and assistive-technology traversal remain pending",
  },
  {
    id: "live-profile-persistence-and-account-isolation-2026-07-28",
    target:
      "Web sign-up, credentials sign-in, authenticated profile editor, Postgres persistence, refresh readback, and account isolation",
    testData:
      "Live-mode local Postgres workspace: existing audit account A plus UI-created account audit-isolation-b-20260728-2145@example.invalid; Chinese multi-word profile values and three custom tags",
    expected:
      "Every edited field survives API readback and page refresh under account A; account B sees only its own onboarding profile; duplicate registration and incorrect passwords fail closed",
    actual:
      "Account A persisted name, company, role, industry, WeChat, auth email, bio, opener, offering, seeking, and topic values and rendered 100% completion after refresh. Account B rendered its own 20% onboarding profile with none of A's markers. Duplicate sign-up showed the taken-email error and left one auth record; incorrect password showed the credential error and did not open a session.",
    evidence:
      "Production-build in-app browser traversal from /app/account/signup and /app/account/login to /app/profile; direct Postgres projection of auth_users/profiles ownership and saved publicProfile/handles fields; tests/pages/app-profile-live-route-services.test.ts",
    conclusion:
      "pass for the exercised live profile success, refresh, duplicate-signup, invalid-password, and two-account isolation cases; remaining profile failure/offline/mobile/responsive/assistive-technology states pending",
  },
  {
    id: "web-profile-complete-lifecycle-2026-07-29",
    target:
      "Authenticated Web profile entry → structured extraction → manual editing → validation → desktop/mobile save → API readback → Home consumption → cancellation → cleanup",
    testData:
      "Production actor audit-permission-1785253354985 with an initial 20% profile; eight labeled Chinese extraction lines; distinct scalar, textarea, and custom-tag values at desktop and 390x844",
    expected:
      "Extraction must remain a review-only local draft; invalid names must not write; every explicit save must update one actor-owned profile and survive hard navigation; Cancel must discard unsaved edits; import must fail closed when acquisition providers are unavailable; cleanup must restore the exact original profile",
    actual:
      "Empty extraction and whitespace-only name each produced explicit Chinese errors. Labeled extraction populated only supported fields. Desktop save persisted a 100% profile and all three tag groups; /app/home consumed the same data. Cancel discarded an unsaved title. Mobile Save persisted a distinct headline and survived hard navigation. The import link rendered the unconfigured no-upload/no-write boundary. Final UI cleanup restored the original name, company, auth email, 20% completion, empty optional fields, and zero tags after hard navigation.",
    evidence:
      "Production-build in-app browser traversal from /app → 我的 and from the account menu; desktop and 390x844 DOM snapshots; actor-scoped PUT /api/profile followed by GET readback; fresh /app/home and /app/profile entries; tests/pages/app-profile-live-route-services.test.ts",
    conclusion:
      "pass for every rendered Profile-specific control in the exercised authenticated desktop/mobile lifecycle; offline/server-error, tablet, screen-reader, and a second current-session browser actor remain pending",
  },
  {
    id: "native-profile-durable-write-lifecycle-2026-07-31",
    target:
      "Authenticated iOS Profile field edits → callback boundaries → PUT /api/profile → configured Postgres profile → refresh/cold-start readback → validation/failure/retry/two-actor isolation → cleanup",
    testData:
      "Two disposable registered actors on an iPhone 17 Pro simulator at 390x844; run-unique displayName, headline, and bio values; formal credentials session and SecureStore restoration; configured live Postgres store",
    expected:
      "The three selected fields and both callback boundaries must produce one complete actor-owned update; success must survive refresh and cold start; blank required names and controlled service failures must leave the last-good record unchanged; retries must converge; actors must remain isolated; cleanup must leave zero active records",
    actual:
      "The native write, cold readback, and deterministic blank-name tests all passed. The successful UI action produced one profile PUT and exact success state; the blank-name action displayed 先写名字。 and produced zero profile PUTs. Independent service recomputation passed 11/11 write/readback/retry/invalid-write/isolation assertions against API and configured Postgres data. Actors A and B owned disjoint profile rows and both cleanup ledgers reported activeAfter=0.",
    evidence:
      "profile-write-execution-iterationcontinuation-final2 native trees/screenshots/request ledgers; service-verify-recomputed.json; actor-a-verify-clean.json; actor-b-verify-clean.json; independent-evaluator.json",
    conclusion:
      "pass for the five exact /profile write implementations and their five exercised route occurrences; unrelated Profile extraction, account navigation, refresh, and suggestion controls remain outside this case",
  },
  {
    id: "web-today-durable-decision-write-lifecycle-2026-07-31",
    target:
      "Authenticated Web Today decision fields and confirm/defer/reject controls → actor-scoped ledger transition → live runtime outbox/receipts → internal messageDraft/task/notification stores → hard-reload readback → isolation/replay/failure/cleanup",
    testData:
      "Two disposable registered actors on today.localhost; three actor-A awaiting actions for confirm/defer/reject; actor-B own-write and controlled-failure actions; run-unique edited draft/task/reminder values",
    expected:
      "Empty required inputs stop locally; confirm persists each edited internal output exactly once; defer/reject create no downstream output; Actor B cannot access Actor A and can write only its own record; replays do not duplicate; controlled executor failure leaves no domain row; all terminals survive hard reload; cleanup reaches zero active records",
    actual:
      "The final bounded browser iteration rendered and edited all five values, locally rejected empty message and reminder time with zero transition/domain rows, completed confirm with three outbox items, three receipts and exactly one actor-A messageDraft/task/notification, and preserved exact ISO-normalized values after hard reload. Defer and reject reached stable terminals with zero downstream output. Actor B received 404 for actor-A ids, completed one isolated draft write, and a controlled missing-title execution produced only retry/receipt control-plane evidence with no task. Confirm/defer/reject replays returned 409 without new output. The actor signed out and cleanup deleted 58/58 active records.",
    evidence:
      "today-write-execution-evaluator-iteration2 DOM and 13 JPEG screenshots; probe-pre.json; snapshot-after-local-rejections.json; snapshot-after-ui.json; verify-post.json; cleanup.json; result.json; independent-evaluator.json SHA-256 9965277984efdc5bfc528e29ff0f49148710ebe9dc2589ca48b9806a047ee529",
    conclusion:
      "pass for the six exact /app/today implementation keys and their six route-local occurrences; first independent evaluation correctly granted zero credit for discarded screenshot buffers, and the final evaluator granted 6/6 only after 34/34 artifact hashes and 58→0 cleanup passed",
  },
  {
    id: "native-event-owned-write-lifecycle-2026-07-31",
    target:
      "Authenticated iOS event attendees and registration controls → API/service/provider → configured Postgres → refresh/cold readback → ownership/replay/failure/cleanup",
    testData:
      "Two disposable registered actors on an iPhone 17 Pro simulator; disjoint actor-owned events and attendees; owned, foreign, missing, encoded, and duplicate IDs; configured live API and Postgres stores",
    expected:
      "Encounter notes, relationship evidence, contact drafts, attendee rosters, and registration submit/update/cancel must persist only for the owning actor, survive refresh and cold start, converge under duplicate activation and lost-response replay, fail without dirty data, and clean to zero",
    actual:
      "The independent final evaluator granted all five exact implementations and occurrences. Native trees, real screenshots, request ledgers, service responses, Postgres projections, cold readback, two-actor isolation, controlled 503/store failures, duplicate activation, lost-response replay, and validation boundaries passed. Contact-draft remediation persisted a canonical actor-owned row while preserving record ID, payload hash, and updatedAt on replay. The original run verified 87/87 artifacts, the remediation run verified 61/61, and every actor and fixture cleanup ledger ended at activeAfter=0.",
    evidence:
      "native-event-write-execution-iteration2/execution-final2; native-event-write-execution-iteration2/execution-draft-remediation-final2; native-event-write-final-independent-evaluator/independent-evaluator.json SHA-256 9962114068b3e58e70fdb609fd828415350c9e631cb670607de82b1bbeebe965; commits a75c17b0, c5bf877b, b2892dcb, a1ad3684, adef25da",
    conclusion:
      "pass for the five frozen mobile event write implementation keys and their five exact route occurrences; no other Events, Contacts, Agent, navigation, or read behavior receives credit from this case",
  },
  {
    id: "native-referral-contact-draft-persistence-2026-07-31",
    target:
      "Authenticated iOS referral recommendation staging → live referral provider write boundary → atomic actor-owned central contactDrafts → recommended-contact and generic confirmation → cold readback → isolation/replay/failure/cleanup",
    testData:
      "Disposable actors A and B; a live referral graph (sponsor, two targets, warm_intro and context_share recommendations) seeded for actor A; configured API, referral service/provider, and Postgres record store; native iPhone 17 Pro simulator",
    expected:
      "Staging must atomically persist stable actor-scoped referral-draft:live central drafts, recommended-contact confirmation must durably persist the confirmed state, source filtering must follow the selected source kind, generic queue confirmation must update the same record, cold relaunch must read the persisted confirmation back, actor ownership and replay must converge, controlled failures must leave no partial data, and cleanup must reach zero",
    actual:
      "Independent evaluation passed all three normalized implementations and their three exact route occurrences. The final native run exercised staging, source-kind filtering, recommended-contact confirmation, session-local dismissal, cold relaunch with persisted 已确认推荐 readback, and referral draft confirmation with matching accessibility trees, real screenshots, request ledgers, API responses, Postgres projections, and artifact hashes. The formal backend probe verified atomic actor-scoped staging, replay-stable rows, A/B isolation, foreign and missing recommendation denial, durable concurrent-idempotent confirmation, cold queue readback, generic queue confirmation of referral drafts, controlled failure fail-closed behavior, and activeAfter=0 cleanup.",
    evidence:
      "continuation-20260731-fable5-execution/batch-01-mobile-contacts-referral-response-only-drafts/backend-contract-result-iteration-2.json; native-iteration-2; independent-evaluator/result.json",
    conclusion:
      "pass for the frozen three /contacts/new referral implementation keys and exact interactions 9, 46, and 50; staging button, source chips as native controls, and all other Contacts behavior remain outside this case",
  },
  {
    id: "native-external-contact-draft-lifecycle-2026-07-31",
    target:
      "Authenticated iOS external source selection and import → live external provider → atomic actor-owned contactDrafts → generic confirm → cold queue readback → isolation/replay/failure/cleanup",
    testData:
      "Disposable actors A and B using identical provider person IDs; two source-backed live networkPeople fixtures; configured API, service/provider, and Postgres record store; native iPhone 17 Pro simulator",
    expected:
      "Import must atomically persist stable actor-scoped central drafts, generic confirmation must update the same draft without creating a contact, session-local dismissal must remain presentation-only, cold readback must preserve terminal state, actor ownership and replay must converge, failures must leave no partial data, and cleanup must reach zero",
    actual:
      "Independent evaluation passed all five normalized implementations and six exact route occurrences. The final native run exercised source selection, double-activation import, external-result confirmation, session-local dismissal, cold queue readback, and queue confirmation with matching accessibility trees, real screenshots, request ledgers, API responses, Postgres projections, and artifact hashes. Formal backend iteration 4 verified atomic batch staging, actor-scoped stable IDs, A/B isolation with identical provider IDs, confirmed-state preservation, lost-response replay, concurrent generic confirmation, controlled failure rollback, unchanged contacts, and activeAfter=0 cleanup.",
    evidence:
      "continuation-20260731-mobile-contacts-external-import-remediation/iteration-4/backend-contract-result.json SHA-256 011cb2aad25d1bd94a291df1c9b5629728bd504922d04f762bf4828e81f6466f; native-iteration-11; independent-evaluator/result.json; commits 99a0b393, 52eebdd8, 4f4588f2",
    conclusion:
      "pass for the frozen five /contacts/new external-import implementation keys and exact interactions 7, 8, 11, 40, 42, and 51; interaction 47 Referral and all Business Card, Manual, QR, and unrelated Contacts behavior remain outside this case",
  },
  {
    id: "live-event-registration-persistence-cancellation-isolation-2026-07-28",
    target:
      "Web event catalogue → detail → authenticated registration interview → Postgres registration record → cancellation/reactivation",
    testData:
      "Public slug EVTSIGNUP01 resolving to canonical event_signup_01; UI-created accounts audit-isolation-b-20260728-2145@example.invalid and audit-event-isolation-c-20260728-2230@example.invalid; distinct Chinese multi-word answers; one intentional server-offline retry",
    expected:
      "The list, detail, and registration page identify one event consistently; each account owns one stable registration record; saved answers survive refresh; cancellation requires confirmation and survives refresh; re-registration reactivates the same record; persistence failure never reveals a persona success state and can be retried",
    actual:
      "All three surfaces rendered 关西跨境商务对接会. Account B saved, refreshed, cancelled through an alert dialog, refreshed the cancelled result, and reactivated the same record with a new answer; account C initially saw no B state, produced no record while the server was offline, stayed in the interview with a Failed to fetch alert, then retried successfully. Postgres projected two distinct user-owned IDs, one record per account, exact answers, stable registeredAt, cancellation/reactivation timestamps, and all six external side-effect flags false.",
    evidence:
      "Production next start browser traversal from /app/events through the real detail CTA; projected orbit_records queries for auth_users/event_registrations; node --import tsx --test tests/pages/app-event-registration-guide.test.tsx; uv run python -m harness.relationship_data_goal_runner validate; npm run build",
    conclusion:
      "pass for the exercised title identity, write/readback, refresh, cancel confirmation, cancel refresh, reactivation, offline failure/retry, idempotency, and two-account isolation cases; remaining eight-question, persona-provider failure, responsive, keyboard, and assistive-technology states pending",
  },
  {
    id: "web-event-registration-entry-identity-query-isolation-2026-07-29",
    target:
      "Authenticated Web public catalogue code → canonical registration interview with actor propagation and query-control isolation",
    testData:
      "Card-linked EVTSIGNUP01 for canonical event_signup_01; authenticated actor audit-permission-1785253354985; /register with no query and with mode=mock&scenario=failure; Chinese locale; exact production build",
    expected:
      "The catalogue code and canonical event ID must resolve one reviewed event, the current actor must reach live reads, public query parameters must not select mock/failure dependencies, and merely opening the interview must not persist answers or a registration.",
    actual:
      "Before repair, the normal card-linked URL rendered Registration guide could not load with EVENTS_ACTOR_REQUIRED, while mode=mock changed the service result to No mock event matches that event id. The loader only compared the public catalogue's internal ID even though cards use the canonical route code, and the page did not propagate its resolved actor. After repair, the normal URL rendered 关西跨境商务对接会, 大阪, the current actor, and question 1/8. Appending mode=mock&scenario=failure produced exactly equal final DOM. No answer, next-step, persona, cancel, or registration control was activated in this traversal.",
    evidence:
      "Authenticated production-browser before/after DOM for normal and adversarial URLs; canonical resolver regression for EVTSIGNUP01 → event_signup_01; 38/38 focused registration/detail/API/live-provider tests; exact production build; GitNexus pre-edit LOW/MEDIUM impacts and HIGH staged detection across seven registration/detail flows; commit 8257e454",
    conclusion:
      "pass for card-code identity, authenticated entry, question-set presentation, actor propagation, mock/failure query isolation, and no-write opening behavior; this traversal intentionally did not submit answers, while the separate 2026-07-28 case covers persisted registration/cancel/reactivate/offline/two-account behavior; remaining eight-question completion, persona provider failure, other codes, guest return, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-legacy-register-public-resolver-2026-07-29",
    target:
      "Web legacy /app/register compatibility entry → reviewed public code resolution, canonical redirect, and no fixture propagation",
    testData:
      "Direct /app/register with no code; demo-event-1 with mode=mock&scenario=failure; reviewed EVTSIGNUP01 with language=en plus the same adversarial controls; authenticated production browser",
    expected:
      "The compatibility route must not default to a demo event or call private/mock Event CRUD. It may resolve only an exact reviewed public event ID/code, forward only presentation language, return an honest non-looping empty state for missing/unknown codes, and leave authentication/writes to the canonical registration route.",
    actual:
      "Before repair, bare /app/register tried default demo-event-1 through live Event CRUD and failed, while mode=mock resolved the Seed Investor fixture and redirected with mode=mock into its registration interview. After repair, bare and demo-fixture URLs rendered Registration is not ready with no retry loop or fixture title. EVTSIGNUP01 resolved through the same public code algorithm to event_signup_01 and redirected only to /app/events/event_signup_01/register?language=en; mode/scenario were discarded and the canonical page rendered the real 1/8 interview.",
    evidence:
      "Authenticated production-browser before/after traversal of three compatibility URLs; focused legacy/canonical registration tests 13/13; exact production build; GitNexus all pre-edit impacts LOW and staged detection LOW with zero execution flows; commit 5a9ff1b5",
    conclusion:
      "pass for no-code and unknown-fixture empty boundaries, reviewed public code resolution, canonical internal ID, language-only forwarding, test-control isolation, non-looping recovery, and no compatibility-route writes; guest login return, other reviewed codes, duplicate/array/encoded inputs, cache/proxy behavior, localized English event title, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "live-business-card-unconfigured-failure-closed-2026-07-28",
    target:
      "Authenticated Web contacts import hub → business-card capability readiness → restricted-state exit",
    testData:
      "Production account audit-event-isolation-c-20260728-2230@example.invalid; ORBIT_MODULE_MODE=live; configured Postgres workspace; GEMINI_API_KEY and GOOGLE_API_KEY absent",
    expected:
      "The page must disclose that cloud OCR is unavailable before image selection, prevent upload and contact creation, expose administrator configuration requirements, provide a real exit, and leave the actor-owned contacts collection unchanged",
    actual:
      "The production page rendered 名片扫描 不可用 as a disabled source, replaced upload controls with 名片识别尚未连接 and the explicit no-upload/no-contact statement, exposed the live/OCR/database configuration checklist, and navigated 返回人脉 to /app/contacts. Postgres contained zero active account-C contacts before and after the traversal.",
    evidence:
      "Production npm run build and next start browser traversal of /app/contacts/new; projected orbit_records count for account C before/after; 28 focused availability, UI, route, scan, and contact-write tests",
    conclusion:
      "pass for the externally restricted, failure-closed production state; successful uploaded-image OCR, review, contact persistence, duplicate review, invitation preparation, responsive, keyboard, and assistive-technology states remain blocked on a configured safe OCR provider",
  },
  {
    id: "live-contact-list-detail-persistence-isolation-2026-07-28",
    target:
      "Formal business-card contact write service → authenticated contacts list/search → dynamic contact detail → refresh → two-account isolation",
    testData:
      "Account C with three source-backed contacts, including two 林 美咲 records in distinct organizations; account B with one B_ACCOUNT_PRIVATE_MARKER contact; no connection or relationship-value records",
    expected:
      "Captured contacts render as pending follow-up without fabricated event, AI, or relationship-strength claims; same-name search remains distinct; source-only contacts open a truthful detail; refresh survives; each account sees only its own records; replay is idempotent",
    actual:
      "Account C rendered 3 contacts, zero event subtitle, three 待联系/未评分 states, six desktop/mobile evidence-basis nodes, and zero AI-basis nodes. Searching 林 美咲 returned only the Kansai and Tokyo cards. The encoded dynamic ID opened the Kansai detail with exact name, organization, email, phone, context, evidence ID, 名片来源, and no failure boundary; refresh preserved it and 返回名片夹 restored the list. Account B rendered only its one private contact and detail; switching back to C restored three with no B marker. Replaying all four formal writes returned already_confirmed with contactWriteExecuted=false; Postgres counts remained C=3 and B=1.",
    evidence:
      "Production-build in-app browser traversal of /app/contacts and /app/contacts/[id]; formal createBusinessCardContactWriteService live replay; direct Postgres owner/count projection; 28 focused contact list/detail/store tests; npm run lint; npm run build",
    conclusion:
      "pass for the exercised formal write, list, same-name search, detail navigation, refresh, source semantics, idempotency, and two-account isolation cases; responsive, keyboard, assistive-technology, connection-enriched detail, and service-failure states remain pending",
  },
  {
    id: "web-contact-detail-query-isolation-2026-07-29",
    target:
      "Authenticated Web private Contact Detail untrusted mode/scenario/action parameters → actor-scoped live-only boundary",
    testData:
      "Current audit actor with no matching demo-contact-1 record; /app/contacts/demo-contact-1?mode=mock before repair and mode=mock&scenario=failure&action=prepare-follow-up after repair; Chinese locale; exact production build",
    expected:
      "A private contact route must resolve only the authenticated actor's live contact graph. Public query values must not select mock identity data, force fixture states, or execute an action branch during GET rendering; a missing actor-owned contact must expose no fallback person or relationship.",
    actual:
      "Before repair, mode=mock rendered the full Kenji Watanabe fixture despite the actor having no matching contact: Aster Grid role, relationship background, bio, topics, conversation prompts, recent interaction, tags, bidirectional value, timeline, evidence IDs, next step, and draft-email control. After repair, the strongest combined query returned an actor-scoped boundary whose expanded source evidence was evidence:contact_detail_not_found. No Kenji identity, company, profile, contact field, enrichment, timeline, evidence detail, draft, message, notification, AI, or outside-provider result appeared. The boundary currently labels not-found as could not load; that separate semantic defect remains open for the next repair.",
    evidence:
      "Authenticated production-browser before/after DOM and source-details expansion; source trace from AppContactDetailPage query parameters into mode/scenario/action loader inputs; 16/16 focused live-detail, auth, mock-contract, and visual tests; exact production build; GitNexus page/reader impacts LOW and no staged graph changes; commit e87f35b5",
    conclusion:
      "pass for blocking the exercised authenticated mock identity leak, scenario injection, and GET action branch while preserving actor-scoped live lookup and no-write behavior; the separately observed not-found classification was subsequently fixed under web-contact-detail-not-found-classification-2026-07-29, while guest return, valid current-actor enriched contact under adversarial query, duplicate/array/encoded values, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-contact-detail-not-found-classification-2026-07-29",
    target:
      "Authenticated Web missing Contact Detail → truthful empty state, source evidence, and non-looping recovery",
    testData:
      "Missing actor-scoped demo-contact-1 after fixture-query isolation; strongest stale URL retaining mode=mock&scenario=failure&action=prepare-follow-up; Chinese shell locale; exact production build",
    expected:
      "A live CONTACT_DETAIL_NOT_FOUND result must be classified as empty rather than provider failure, retain its evidence, avoid implying a system outage, and recover to the sourced contacts list without offering a retry to the same absent contact.",
    actual:
      "Before repair, evidence:contact_detail_not_found rendered Contact detail could not load, described a controlled failure, and offered Retry contact detail back to the same missing ID. After repair, the same URL rendered No contact detail is available, explained that a sourced contact must be selected, used a route-state-neutral no-side-effects guardrail, and offered only Return to contacts list. The mock identity remained absent.",
    evidence:
      "Authenticated production-browser before/after DOM and source evidence; focused Contact Detail tests 13/13; exact production build; GitNexus loadComposedContactDetailRoute impact LOW with three upstream symbols and staged detection MEDIUM across three Contact Detail flows; commit f3e2d5dd",
    conclusion:
      "pass for CONTACT_DETAIL_NOT_FOUND → empty classification, retained evidence, truthful guardrail, dead-retry removal, list recovery, and no-write behavior on the exercised actor; Chinese localization of route-specific copy, guest return, other missing IDs, provider/config/actor failure copy, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "expo-web-auth-profile-account-privacy-2026-07-28",
    target:
      "Expo Web signed-out profile/account gates → credentials sign-in → actor-owned profile/account → refresh restore → sign-out → protected hard navigation",
    testData:
      "Live production API at localhost:3110 with explicit CORS origin localhost:8081; account C audit-event-isolation-c-20260728-2230@example.invalid",
    expected:
      "Signed-out screens reveal no person's profile; browser login establishes a validated HttpOnly session without SecureStore; Web snapshot fallback cannot block the network; refresh restores the same actor; sign-out invalidates the server cookie and protected routes remain private",
    actual:
      "Signed-out /profile and /account rendered only authentication boundaries with no 小雨, account-C, workspace, or relationship-goal data. Account C credentials redirected to /profile, showed the exact actor identity, and survived hard navigation. Missing stored profile fields rendered as missing instead of founder/source-backed fixtures. 退出登录 expired the Auth.js cookie; hard /profile and /account stayed signed out and disclosed no actor data or raw 401.",
    evidence:
      "Expo Web Metro runtime in the in-app browser; production Next build with credentialed explicit-origin CORS; Expo full suite 520/520; Web full suite 1328/1328; full audit 7/7; npm run typecheck; npm run build",
    conclusion:
      "pass for the exercised Expo Web credentials, profile/account privacy, refresh persistence, truthful missing-data, and sign-out invalidation chain; native iOS/Android secure-store, Google OAuth, offline, responsive, and assistive-technology cases remain pending",
  },
  {
    id: "expo-web-permission-persistence-cors-isolation-2026-07-29",
    target:
      "Expo Web permissions auth gate → cross-origin preflight → actor-scoped live request → refresh/readback → sign-out → two-account isolation",
    testData:
      "Production API at localhost:3110 with explicit credentialed origin localhost:8081; two UI-created audit accounts; empty permission collections",
    expected:
      "Signed-out users see no private state; an empty account can request review; OPTIONS carries no session and returns no data; the authenticated POST persists one actor-owned pending row; refresh and re-login restore it; another account remains empty",
    actual:
      "Signed-out /account/permissions showed a localized login boundary and return route with no raw 401. Preflight returned 204 with explicit origin/credentials. The first account moved from 0 to one pending calendar review, survived hard navigation and sign-out/re-login, while the second account stayed at 0. Repeating the request upserted the same actor/capability record.",
    evidence:
      "Production Next build and Expo Web browser traversal; curl OPTIONS transport probe; tests/capabilities/permission-state-live-store.test.ts; tests/ui/api-auth-proxy-boundary.test.ts; Expo permissions view-model tests; npm run typecheck",
    conclusion:
      "pass for the exercised Expo Web signed-out, empty, pending, persistence, retry, and two-account isolation states; native provider grant/denial, OS camera/photo prompts, offline, responsive, and assistive-technology cases remain pending",
  },
  {
    id: "expo-legacy-deep-link-runtime-2026-07-29",
    target:
      "Expo Router cold navigation for current routes, legacy Web-shell paths, query preservation, and unsupported paths",
    testData:
      "/, /account/permissions?source=deep-link, /explore?source=legacy, /home/cards?query=tokyo&status=active, /app/home/cards?source=event_import, /home/cards/scan?source=camera, and an unsupported route",
    expected:
      "Current routes render directly; supported legacy paths resolve to their canonical mobile screens without losing query context; unsupported input lands safely on Orbit AI instead of an English unmatched-route page",
    actual:
      "Root redirected to /ai; the permissions deep link preserved its query and actor-owned pending state; legacy event, contacts-list, app-prefixed contacts, and scanner paths redirected to canonical screens with their queries intact; the unsupported path resolved to /ai.",
    evidence:
      "Fresh Expo Web Metro browser cold navigations plus tests/initial-route.test.ts and npm run typecheck",
    conclusion:
      "pass for the exercised current, legacy, query-preserving, and unsupported Web deep-link cases; custom-scheme iOS/Android device delivery remains pending",
  },
  {
    id: "expo-contact-acquisition-selection-aria-2026-07-29",
    target:
      "Expo contacts/new visual source selection → native accessibility state → React Native Web ARIA",
    testData:
      "Fresh Expo Web bundle in the authenticated default business-card state with empty external and referral source selections",
    expected:
      "Mode selectors expose one selected tab; each source-filter group exposes one checked radio; unselected choices are explicitly false; native accessibility state remains present for device screen readers",
    actual:
      "The DOM contained one tablist with 名片 aria-selected=true and QR/手动 false. It contained two radiogroups; each 全部 radio was aria-checked=true and every unselected external source was false. The implementation keeps matching native accessibilityState values.",
    evidence:
      "In-app browser role/aria DOM projection; tests/contact-acquisition-screen.test.ts; npm run typecheck",
    conclusion:
      "pass for selection semantics in the exercised Expo Web default state; VoiceOver/TalkBack announcement wording, keyboard tab activation, and state changes after screen-reader gestures remain pending on devices",
  },
  {
    id: "expo-contact-acquisition-touch-targets-2026-07-29",
    target:
      "Shared Expo AppScreen back control and contacts/new mode/media/primary/scanner controls",
    testData:
      "Fresh Expo Web bundle with browser CSS bounding-box measurement at the host's actual 1280×720 CSS viewport",
    expected:
      "Every audited navigation and acquisition control meets a 44×44 point minimum touch target without changing its route or business behavior",
    actual:
      "The shared back control measured 44×44. 名片, QR, 手动, 拍名片, and 选图片 each measured 44 px high; the main primary control and scanner-close styles are statically locked to the same minimum. The attempted 390×844 browser override still reported 1280×720 and was excluded from responsive evidence.",
    evidence:
      "In-app browser getBoundingClientRect projection; tests/app-screen-touch-targets.test.ts; tests/contact-acquisition-screen.test.ts; npm run typecheck",
    conclusion:
      "pass for the measured shared navigation and contact-acquisition touch targets at the host CSS viewport; true 390px breakpoint, device font scaling, orientation, and assistive-touch behavior remain pending",
  },
  {
    id: "expo-qr-permission-pending-cancellation-2026-07-29",
    target:
      "Expo contacts/new QR mode → browser-owned camera permission wait → source-mode change cancellation",
    testData:
      "Authenticated Expo Web audit account with zero drafts and an unresolved in-app-browser camera permission prompt",
    expected:
      "The app exposes that it is waiting for system permission, prevents duplicate requests, remains navigable, and invalidates a pending request when the user leaves QR mode so a late result cannot reopen a hidden scanner or write data",
    actual:
      "扫 QR changed to a disabled 等待相机权限 state while the system prompt remained outside the DOM. Switching to 手动 removed the wait, left no camera/video element, and kept the draft queue empty. The request-token guard and unmount cleanup prevent a late result from reopening the scanner.",
    evidence:
      "Expo Web in-app browser pending-permission and mode-switch traversal; tests/contact-acquisition-screen.test.ts; npm run typecheck",
    conclusion:
      "pass for the Web pending, duplicate-request guard, mode-switch cancellation, and no-write states; actual grant, denial, settings recovery, physical QR decode, and iOS/Android lifecycle cases remain pending on devices",
  },
  {
    id: "expo-business-card-media-failure-closed-2026-07-29",
    target:
      "Expo contacts/new camera and photo-library inputs → local preview → credentialed live scan request → externally unconfigured OCR failure boundary",
    testData:
      "Authenticated Expo Web audit account; real repository PNG asset (used only to exercise media transport, not represented as a business card); production API with cloud OCR intentionally unconfigured",
    expected:
      "Both media controls accept one image and leave the pending state; choosing media writes nothing; upload reaches the authenticated service; unavailable OCR is explained in Chinese without inventing extraction; refresh reveals no persisted candidate, draft, or contact; console stays clean",
    actual:
      "The photo-library and camera entries each opened one image input; the camera input declared capture=camera. Both read the PNG, rendered its preview/name/18 KB size, and restored the media buttons. Submit returned the specific Chinese unconfigured-service recovery message, with no English backend copy, candidate, draft, or new console warning/error. Hard navigation cleared the local preview/error and still showed zero saved drafts.",
    evidence:
      "Expo Web in-app browser file-chooser traversal; production API CORS request; tests/api-client.test.ts; tests/contact-acquisition-screen.test.ts; npm run typecheck",
    conclusion:
      "pass for Web media selection/capture-input, preview, authenticated upload, localized failure closure, refresh, and no-write states; real iOS/Android OS permission grant/denial, physical camera capture, system-picker dismissal, configured OCR success, and assistive-technology cases remain pending",
  },
  {
    id: "expo-live-external-source-truthfulness-2026-07-29",
    target:
      "Expo contacts/new external-source catalogue backed by the actor-scoped live external-candidate service",
    testData:
      "Authenticated audit account with zero actor-owned external contact records; phone, Google Contacts, CSV, and customer-list source filters",
    expected:
      "An ordinary network-person record cannot masquerade as an imported source; zero-evidence sources cannot claim authorization, upload, or connection; filtering performs no external or persistent action and import stays disabled without candidates",
    actual:
      "All four zero-candidate sources rendered 未连接, with no 已授权/已上传/已连接 text. Selecting 手机通讯录 only marked that filter active; 导入为候选 remained disabled and no write or provider action occurred.",
    evidence:
      "Production Next build plus Expo Web browser traversal; tests/capabilities/external-contacts-import-live-store.test.ts; tests/contact-acquisition-view-model.test.ts; npm run typecheck",
    conclusion:
      "pass for the exercised empty live-source and filter-only states; real phone/Google/CSV/customer-list connection and import success states remain externally unconfigured",
  },
  {
    id: "expo-production-route-contract-traversal-2026-07-29",
    target:
      "All 38 Expo production routes reachable without development-only fixtures",
    testData:
      "Current Expo Router route tree with direct navigation, explicit dynamic IDs, legacy aliases, and missing-parameter entries",
    expected:
      "Every production route resolves through its declared source contract; missing IDs stay missing; dynamic routes never borrow a demo event, contact, conversation, or organizer",
    actual:
      "The 38-route traversal resolved every production entry. Event and invite routes without an ID rendered a selection boundary, explicit unknown dynamic IDs rendered localized missing states, and the legacy catch-all preserved only allowlisted redirects.",
    evidence:
      "Expo route-tree traversal; tests/initial-route.test.ts; tests/register-invite-view-model.test.ts; tests/detail-view-model.test.ts; npm run typecheck",
    conclusion:
      "pass-static-and-runtime-route-contract for the exercised Expo Web route tree; native custom-scheme delivery and physical-device permission routes remain pending",
  },
  {
    id: "expo-manual-candidate-confirmation-truthfulness-2026-07-29",
    target:
      "Expo contacts/new manual candidate creation → confirmation result copy",
    testData:
      "A candidate response with confirmation complete but without a contact-write capability",
    expected:
      "Candidate confirmation must not claim that a contact was created; the UI must distinguish candidate state from a separately authorized contact write",
    actual:
      "The result now says the candidate is confirmed and that the current flow will not write a contact when no contact-write contract exists. The control label remains 已确认候选 instead of representing a created contact.",
    evidence:
      "tests/contact-acquisition-view-model.test.ts; tests/contact-acquisition-screen.test.ts; npm run typecheck",
    conclusion:
      "pass-source-regression for the no-contact-write confirmation branch; an authorized manual contact-write success remains a separate flow",
  },
  {
    id: "expo-live-event-registration-and-roster-boundaries-2026-07-29",
    target:
      "Expo event list → actor-owned dynamic detail → standard registration save/cancel/readback → attendee-source boundary",
    testData:
      "Private event event:live-record:20260729 titled 功能审计私有活动 20260729 under the authenticated audit actor; no attendee roster source",
    expected:
      "Private events resolve only for their actor; title, organizer, source, and participant availability retain separate meaning; registration writes one actor/event record; absent roster data exposes no import or attendee success",
    actual:
      "The real private event opened from list to encoded detail with its title and semantic fields intact. Standard registration saved and refreshed exact answers, cancellation updated the same record and survived refresh, and the attendee route rendered 参会者来源尚未连接 with import actions withheld.",
    evidence:
      "Authenticated Expo Web production-API traversal; event detail/attendee/registration source tests; registration API actor-scope tests; Expo typecheck",
    conclusion:
      "pass for the exercised actor-owned event read, semantic display, registration save/cancel/readback, and missing-roster boundary; a configured attendee roster and native-device flow remain pending",
  },
  {
    id: "expo-ai-history-persistence-hydration-2026-07-29",
    target:
      "Expo Orbit AI history drawer → accessible row actions → persisted conversation",
    testData:
      "Authenticated live AI history containing agent-session-ms4a1d22-6w4xm9",
    expected:
      "Open and delete are distinct accessible controls; opening reads the persisted conversation; repeated drawer use emits no invalid nested-button hydration error",
    actual:
      "The drawer rendered sibling open/delete buttons, the open control carried the conversation title in its accessible label, and opening it loaded the matching persisted messages. Repeated close/open produced zero new console errors after the fix.",
    evidence:
      "Expo Web browser DOM and console traversal; tests/ai-home-screen-copy.test.ts; Expo typecheck",
    conclusion:
      "pass for history open, persisted readback, accessible action separation, and hydration cleanliness; destructive delete was intentionally not exercised",
  },
  {
    id: "expo-dynamic-missing-data-boundaries-2026-07-29",
    target:
      "Expo relationship chat and contact dynamic routes with no actor-owned backing record",
    testData:
      "Empty current relationship-conversation collection, /chat/not-a-real-thread, and stale contact ID test-contact-c788bda85b-01 referenced by historical AI text",
    expected:
      "The product must not invent a conversation or contact merely to make a dynamic route look populated",
    actual:
      "/chat rendered a truthful empty collection, the unknown chat detail rendered a localized failure boundary, and the stale contact link returned NOT_FOUND without substituting any contact or relationship data.",
    evidence:
      "Authenticated Expo Web direct navigation and API readback; chat/contact screen-state tests; Expo typecheck",
    conclusion:
      "pass for the exercised empty chat, missing chat, and missing contact states; no actor-owned relationship conversation existed to validate the populated chat-detail path",
  },
  {
    id: "expo-party-no-synthetic-checkin-2026-07-29",
    target:
      "Expo party overview, check-in, and relationship graph derived from live event data",
    testData:
      "Current private event without a roster, access-code provider, or check-in writer",
    expected:
      "Orbit must not derive an access code from the event ID or report local check-in success without a backend write contract",
    actual:
      "The deterministic *-4821 access code and local 已签到 state were removed. Party overview now reports status, check-in explains that no code/write service is connected, and the graph center describes现场关系 without asserting attendance.",
    evidence:
      "tests/party-view-model.test.ts; tests/party-screen-source.test.ts; authenticated Expo Web no-roster traversal; Expo typecheck",
    conclusion:
      "pass for the exercised no-roster/no-check-in-service boundary; real access-code validation and check-in persistence require a backend contract",
  },
  {
    id: "expo-organizer-public-private-isolation-2026-07-29",
    target:
      "Web public event catalogue → Expo organizer slug page → unknown-slug boundary",
    testData:
      "Known slug evtsignup02, approved public catalogue, authenticated private audit event, and unknown slug not-a-real-organizer",
    expected:
      "Organizer pages read only public catalogue data, honor the slug exactly, never fall back to the first event, and never leak actor-private events",
    actual:
      "The known slug rendered Orbit 人脉测试空间 and its public event set without the private audit event or source-note organizer. The unknown slug rendered 未找到公开主办方 with zero events and no verified badge.",
    evidence:
      "Production Next build; exact-origin credentialed CORS preflight; Expo Web known/unknown slug traversal; public-events route and organizer view-model tests",
    conclusion:
      "pass for the exercised public/private isolation, organizer identity, known slug, and unknown slug; anonymous transport is not claimed because the global API proxy still requires an authenticated session",
  },
  {
    id: "expo-register-invite-boundaries-2026-07-29",
    target:
      "Expo registration compatibility entry with no code → live event preview with encoded actor-owned code → standard registration",
    testData:
      "Direct /register plus /register/event%3Alive-record%3A20260729 under the authenticated audit actor",
    expected:
      "Missing context must stay missing; a real code must resolve exactly one actor-owned event; preview must remain read-only and continue to the matching standard registration route",
    actual:
      "/register rendered 尚未选择活动 and 查看活动 returned to the live catalogue without a fallback. The encoded private event preview preserved title, time, location, invite code, and no-external-action copy; 继续填写活动问题 opened the matching /events/.../register route.",
    evidence:
      "Authenticated Expo Web click traversal; register screen/view-model tests; Expo full suite 520/520; Expo typecheck",
    conclusion:
      "pass for missing-context exit, actor-owned preview readback, and preview-to-form navigation; invite delivery through native custom schemes remains pending",
  },
  {
    id: "expo-schedule-title-preview-runtime-2026-07-29",
    target:
      "Expo relationship schedule → canonical event title → encoded read-only event preview → both exit routes",
    testData:
      "Private event 功能审计私有活动 20260729 with a deliberately different sourceMetadata.label",
    expected:
      "Schedule must reuse the canonical event title instead of source notes; preview must preserve event identity and perform no external writes; exits must return to the intended surfaces",
    actual:
      "Runtime first reproduced the source-note-as-title defect. After removing the duplicate schedule title mapper, both highlight and timeline rendered 功能审计私有活动 20260729. The card opened the encoded preview, which preserved status/time/location/provenance and stated its no-write boundary; its exits opened /schedule and /events.",
    evidence:
      "Authenticated Expo Web before/after traversal; tests/schedule-view-model.test.ts; tests/schedule-event-preview-view-model.test.ts; Expo full suite 520/520; Expo typecheck",
    conclusion:
      "pass for the exercised live schedule title, event preview, and two exits; follow-up-item navigation and partial-source runtime states remain pending",
  },
  {
    id: "expo-api-settings-health-runtime-2026-07-29",
    target:
      "Expo settings root → API server settings → idempotent save → hard-navigation readback → live health check",
    testData:
      "Existing Web setting http://localhost:3110 and the running production Orbit server",
    expected:
      "The settings destination must navigate correctly; saving must persist a normalized URL; health feedback must be Chinese and must not expose internal service identifiers",
    actual:
      "设置/服务器 opened /settings/api with the persisted URL. Saving the same value returned 服务器地址已保存, and hard navigation read back http://localhost:3110. The health request reached the server and, after fixing the presentation mapper, rendered 服务器可用 / Orbit 服务响应正常，可以继续使用。 without orbit-runtime or English copy.",
    evidence:
      "Authenticated Expo Web click/save/reload/health traversal; tests/health-view-model.test.ts; Expo typecheck",
    conclusion:
      "pass for settings navigation, idempotent same-value persistence, hard-navigation readback, and live success feedback; invalid URL, unreachable server, reset confirmation, and native-device LAN configuration remain pending",
  },
  {
    id: "expo-account-entry-boundaries-2026-07-29",
    target:
      "Expo signup validation and navigation → password-recovery restricted state → mobile Google callback fallback",
    testData:
      "Invalid signup values not-an-email / 123; no configured password-reset provider; fake Google callback code/state",
    expected:
      "Invalid signup must create nothing; unavailable password recovery must collect nothing and claim no email/code; invalid Google callback must return to login without a session",
    actual:
      "Signup kept invalid values on the form with localized validation, changed the password toggle's accessible name, and navigated to login without creating an account. Password recovery initially reproduced a fake second-step form; after repair it displayed one explicit no-provider/no-send boundary, collected no fields, and returned to login. The invalid mobile Google callback redirected to /account/login with no success state.",
    evidence:
      "Authenticated Expo Web form and deep-link traversal; account auth source/view-model tests 10/10; Expo full suite 520/520; Expo typecheck",
    conclusion:
      "pass for invalid signup, password-visibility semantics, signup-to-login navigation, reset-provider restriction, and invalid Google callback fallback; successful mobile account creation and native Google provider completion were covered by earlier API/session tests but not repeated in this browser batch",
  },
  {
    id: "expo-admin-truthful-boundaries-2026-07-29",
    target:
      "Expo admin account entry → read-only dashboard → event list/detail → access-member boundary",
    testData:
      "Authenticated audit actor with one private event, no explicit profile email, no admin mail provider, and no admin write service",
    expected:
      "The entry must use the real account session; admin pages may read actor-owned data but must not simulate email delivery, event creation, member identity, or backend writes",
    actual:
      "/login-admin exposed one account-backed 打开只读后台 action. Dashboard/events/access preserved the private event and real detail navigation, removed the local draft creator, replaced storage implementation copy, and rendered an explicit no-verifiable-member-email boundary instead of admin@orbit.local.",
    evidence:
      "Authenticated Expo Web click traversal across /login-admin, /admin, /admin/events, /events/event:live-record:20260729, and /admin/access; admin screen/view-model source tests; Expo full suite 522/522; Expo typecheck",
    conclusion:
      "pass for the exercised signed-in entry, actor-owned read-only event chain, no-write boundary, and missing-email state; signed-out entry is source-tested and real admin role assignment/mail delivery remain unimplemented",
  },
  {
    id: "expo-platform-public-catalogue-boundary-2026-07-29",
    target:
      "Expo platform surface → dedicated public catalogue → truthful source-review boundary",
    testData:
      "Authenticated audit actor with one private event plus the 13-record approved public catalogue",
    expected:
      "The platform surface must not treat personal data as platform-wide data, expose private events, synthesize moderation decisions/account verification, or link public IDs into an actor-private detail API",
    actual:
      "Runtime first reproduced the private event, personal metrics, storage-backed English copy, and local approve/reject success. After repair, /platform read the dedicated 13-record public catalogue, showed 3 current and 10 ended records, excluded the private event/profile/dashboard, localized source context, exposed no decision/account state, and rendered source records as non-interactive because no compatible public-detail contract exists.",
    evidence:
      "Authenticated Expo Web before/after DOM and click traversal; public API readback; platform screen/view-model tests 7/7; Expo full suite 524/524; Expo typecheck",
    conclusion:
      "pass for public/private data separation, aggregate semantics, Chinese presentation, and removal of simulated decisions/broken navigation; authenticated platform moderation, account directory, and public detail navigation remain unimplemented",
  },
  {
    id: "expo-agent-no-fixed-sandbox-data-2026-07-29",
    target:
      "Expo Agent action center → actor-scoped action queue → fixed external-action sandbox exclusion",
    testData:
      "Authenticated audit actor with zero /api/agent/actions records while the production sandbox endpoint still exposes fixed Maya Chen, Diego Rivera, and Aiko Tanaka no-op fixtures",
    expected:
      "The production Agent center must reflect the actor's real action queue and safety policy; development sandbox fixtures must not appear as current-user actions, confirmations, or history",
    actual:
      "Runtime first showed 3 fixed pending actions, 9 confirmation controls, 3 prebuilt history rows, and English fixture rationales below the real zero-action queue. After removing the sandbox consumer chain, /agent rendered only 0 条待确认, the fixed safety policy, and 没有待复核动作.",
    evidence:
      "Authenticated Expo Web before/after DOM traversal; Agent action endpoint readback; agent screen/view-model tests 5/5; Expo full suite 524/524; Expo typecheck",
    conclusion:
      "pass for the exercised actor-scoped empty queue and production fixture exclusion; populated actor-owned action decisions remain source-tested but were not exercised because this actor had no pending actions",
  },
  {
    id: "expo-empty-relationship-surface-boundaries-2026-07-29",
    target:
      "Expo relationship workbench → dashboard, graph, introductions, pipeline, contact list, and natural-search suggestions",
    testData:
      "Authenticated audit actor with zero contacts, zero connection graph records, zero introductions, zero pipeline rows, and zero relationship-search results",
    expected:
      "Every derived relationship surface must stay empty without fallback identities or metrics; evidence-backed search suggestions must exist only when the actor graph contains evidence",
    actual:
      "/contacts rendered six real destinations and its graph card opened /contacts/graph. Dashboard, contact dashboard, graph, intros, and pipeline each rendered a domain-specific zero state. /contacts/list kept all five status counts at zero. Runtime first reproduced three fixed suggestions labelled as recorded evidence; after the live-store fix the same account returned no suggestion cards while generic search controls remained.",
    evidence:
      "Authenticated Expo Web traversal across seven surfaces and one overview-to-graph click; actor-scoped API readback; relationship live-store tests 3/3; exact-origin production build and CORS preflight; Expo typecheck",
    conclusion:
      "pass for the exercised zero-data surfaces, overview navigation, and no-evidence suggestion boundary; populated relationship dashboards, graph actions, introductions, pipeline transitions, and search results remain pending real actor data",
  },
  {
    id: "expo-empty-work-queue-boundaries-2026-07-29",
    target:
      "Expo follow-up queue, Today ledger, All Actions ledger, and relationship inbox under an actor with no work records",
    testData:
      "Authenticated audit actor with zero Agent operations, follow-up tasks, reminders, message drafts, alerts, signals, and inbox conversations",
    expected:
      "Every queue must preserve actor-scoped zero data; candidate generation may return a review-only empty result; a blank inbox composer must send nothing, create nothing, and use a single generic greeting",
    actual:
      "/today and /contacts/all-actions rendered zero-operation Agent ledgers. /followups rendered zero tasks/reminders/drafts; both candidate generators returned explicit empty review results without writes. /inbox rendered zero counts, opened a review-only composer, blocked blank-recipient creation with 先写收件人。, and after repair generated 您好： instead of 您好，您好：.",
    evidence:
      "Authenticated Expo Web DOM and click traversal across four surfaces; defaultRelationshipDraft regression test; Expo full suite 525/525; Expo typecheck",
    conclusion:
      "pass for the exercised empty ledgers, empty follow-up generation, inbox composer entry, blank-recipient validation, and default greeting; populated operation transitions, populated follow-up drafts, conversation selection, and successful thread creation remain pending real actor data",
  },
  {
    id: "expo-entry-alias-and-home-events-2026-07-29",
    target:
      "Expo root/home canonical entry, allowlisted legacy catch-all, and actor-owned home event list",
    testData:
      "Direct / and /home; supported /app/events; unknown /app/not-a-real-destination?query=private-marker; one upcoming actor-owned private event and zero historical events",
    expected:
      "Root and retired home entries must converge on one AI shell; supported aliases must resolve exactly; unknown legacy paths must not expose or fabricate data; home event filters and cards must preserve actor scope",
    actual:
      "/ and /home both resolved to /ai with one Orbit AI composer. /app/events resolved to /events with the real private event; the unknown legacy path resolved to /ai without surfacing its query marker. /home/events rendered one upcoming event, produced a truthful 0 / 1 historical empty state, restored the event under 全部, and opened its matching dynamic detail.",
    evidence:
      "Authenticated Expo Web direct-navigation and click traversal; initial-route and home source/view-model tests; Expo full suite 525/525; Expo typecheck",
    conclusion:
      "pass for canonical entry convergence, one supported and one unknown legacy path, home-event filtering, and event-detail navigation; native custom-scheme legacy delivery and additional populated filter combinations remain pending",
  },
  {
    id: "web-home-private-event-boundaries-2026-07-29",
    target:
      "Authenticated Web Home and Home Events → actor-owned private event → encoded dynamic detail",
    testData:
      "One upcoming actor-owned private event with ID event:live-record:20260729, one cancelled registration, no organizer source, no attendee roster, and no matchmaking record",
    expected:
      "Home must distinguish events from registrations; dynamic IDs must survive route encoding; missing organizer, roster, and matchmaking sources must remain explicit instead of becoming product claims or raw service errors",
    actual:
      "Runtime first reproduced a fake registration count, a not-found dynamic detail, a synthetic Orbit organizer link, one recommendation promoted into an attendee, and raw Event not found copy. After repair, Home showed one 活动, both Home surfaces opened the encoded private detail, the detail showed 主办方待确认, 参会者 0, the actor's real 重新报名 state, and a stable Chinese no-matchmaking boundary.",
    evidence:
      "Authenticated production browser Home/Home Events filter and detail traversal; focused Web route-service tests 33/33; Next TypeScript; exact-origin production build",
    conclusion:
      "pass for the exercised actor-owned event summary, filter, encoded dynamic route, registration readback, and missing-source boundaries; populated organizer, attendee roster, and matchmaking states remain pending real source data",
  },
  {
    id: "web-today-meeting-service-boundary-2026-07-29",
    target:
      "Authenticated Web Today → meeting action → missing contact/calendar/invitation service boundary",
    testData:
      "Actor with zero contacts, zero Agent decisions, and one private event projected as a read-only review arrangement",
    expected:
      "An event arrangement must not become a contact candidate, and no meeting form or success action may appear until contact selection, calendar persistence, invitation delivery, and relationship-history readback have real contracts",
    actual:
      "Runtime first rendered the private event as the only selectable contact, a fixed past date, topic input, and a Send invite button that only closed the modal. After repair, the same action opened a status-only boundary stating that no meeting, relationship-history update, calendar write, or invitation would occur; 知道了 closed it without changing Today.",
    evidence:
      "Authenticated production browser before/after DOM and click traversal; Today/Followups/Schedule focused tests 55/55; Next TypeScript; exact-origin production build",
    conclusion:
      "pass for the exercised no-service boundary and local open/close behavior; real meeting creation remains unimplemented until all named service contracts and readback exist",
  },
  {
    id: "web-agent-session-actor-isolation-2026-07-29",
    target:
      "Authenticated Web Agent chat history and unauthenticated conversation-session API boundaries",
    testData:
      "Audit actor whose contacts and relationship ledger were empty; 13 pre-existing deployment-workspace sessions naming unrelated people and events; isolated Alice/Bob providers using the same session ID; unauthenticated list and delete requests",
    expected:
      "Persisted Agent sessions must be partitioned by the canonical authenticated actor; unauthenticated reads and deletes must fail before provider access; one actor must never read or delete another actor's same-ID session",
    actual:
      "Runtime first exposed all 13 deployment-global sessions to the audit actor. After repair, the same account rendered an empty history while keeping its truthful zero-change workspace. Direct unauthenticated GET and DELETE requests returned 401. Provider tests proved Alice and Bob could persist the same session ID independently and that deleting Alice's copy left Bob's copy intact.",
    evidence:
      "Authenticated production browser before/after DOM plus workspace refresh; unauthenticated production HTTP GET/DELETE probes; focused Agent session API/live-store tests 6/6; Web lint; Next TypeScript; exact-origin production build",
    conclusion:
      "pass for actor-isolated list/get/save/delete semantics, unauthenticated list/delete denial, empty-history rendering, and workspace refresh; authenticated multi-browser account switching and populated post-fix conversation creation remain pending",
  },
  {
    id: "web-chat-workspace-actor-isolation-2026-07-29",
    target:
      "Authenticated Web Chat workspace → conversation list, message thread, writing assist, summary/extraction, privacy context, and URL-selected conversation",
    testData:
      "Audit actor with zero contacts and zero actor-scoped chat records; more than 40 deployment-workspace conversations and full message threads from unrelated identities; previously visible conversation_seed_069",
    expected:
      "The server page must resolve the canonical authenticated actor before composing every Chat service; the actor's empty graph must stay empty; an arbitrary conversation query must not bypass list ownership",
    actual:
      "Runtime first rendered the deployment-wide conversation list, message bodies, relationship context, generated assist, summary, evidence count, and privacy status. After repair, the same account rendered No chat context is ready. Direct access to conversation_seed_069 returned Conversation not found and promised not to substitute another person's data. Reload returned to the unchanged empty state.",
    evidence:
      "Authenticated production browser before/after DOM, rejected legacy-ID direct navigation, and recovery-link traversal; Chat/Agent focused tests 21/21; Web lint and Next TypeScript; exact-origin production build",
    conclusion:
      "pass for the exercised empty actor graph, all four Chat service bundles, URL-selected legacy conversation denial, and recovery navigation; populated post-fix multi-account browser readback remains pending",
  },
  {
    id: "web-all-actions-empty-ledger-2026-07-29",
    target:
      "Authenticated Web Contacts All Actions → actor-scoped Agent operation ledger",
    testData:
      "Audit actor with zero Agent ledger entries and no completed, pending, failed, deferred, canceled, rejected, or undone operations",
    expected:
      "The page must read the canonical server actor's ledger and keep every derived operation surface absent when the ledger is empty; it must not invent filters, counts, transitions, drafts, evidence, or prior writes",
    actual:
      "The page rendered 操作账本 with the authenticated relationship navigation and the explicit statement that no operation records exist. No entry row, status filter, action control, draft affordance, evidence chip, or fabricated count appeared.",
    evidence:
      "Authenticated production browser DOM; GitNexus AppAllActionsPage → createRuntimeBackedAgentLedgerService flow; source inspection of the server actor resolver, route view model, and empty renderer",
    conclusion:
      "pass for the exercised actor-scoped zero-entry ledger and absence of derived controls; populated filters, audit detail, retry/cancel/undo transitions, draft editing, and idempotent readback remain pending real actor operations",
  },
  {
    id: "web-relationship-derived-zero-surfaces-2026-07-29",
    target:
      "Authenticated Web relationship Dashboard, Graph, Introductions, and Pipeline under one zero-contact actor",
    testData:
      "Audit actor with zero contacts, zero graph nodes/edges, zero introductions, zero relationship metrics, and zero pipeline rows",
    expected:
      "Every derived surface must preserve zero data without fallback identities or actions; local filters and zoom may change presentation only; the introduction composer must remain draft-only and give a usable prerequisite boundary when no contact can be selected",
    actual:
      "Dashboard rendered a real-record prerequisite and its add action opened the fail-closed import hub. Graph stayed at 0 contacts / 0 events while zoom moved 100% → 120% → 100%. Pipeline kept all three groups at zero with no mutation controls. Introductions kept all counts at zero, cycled all filters truthfully, opened a non-sending disabled composer, and initially exposed a blank picker; after repair the picker required two source-backed contacts and linked to the import hub. Cancel returned to the unchanged ledger.",
    evidence:
      "Authenticated production browser traversal across four surfaces and ten interactions; Contacts subroute/live tests 11/11; Web lint and Next TypeScript; exact-origin production build",
    conclusion:
      "pass for the exercised zero-data dashboard, graph navigation/zoom, introduction filters/composer/picker recovery, and read-only pipeline; populated dashboard metrics, graph nodes/edges, contact detail navigation, introduction creation/readback, and pipeline rows remain pending real actor data",
  },
  {
    id: "web-dashboard-route-and-zero-data-truth-2026-07-29",
    target:
      "Authenticated canonical Web Dashboard → actor-scoped relationship aggregate and zero-data presentation",
    testData:
      "Audit actor with zero contacts, relationship edges, events, opportunities, dormant relationships, follow-ups, operations, and distribution records",
    expected:
      "The canonical dashboard entry must render its own product surface, resolve every live source beneath the authenticated actor, and preserve an empty denominator as zero without fabricated goals or next actions",
    actual:
      "Runtime first redirected /app/dashboard into the unrelated Party surface. After restoring the canonical route and actor-scoping the retained live service bundle, the page rendered the relationship dashboard with every source-backed count at zero. Coverage changed from the restored service's false 100 to 0, and the action/goal regions rendered explicit Chinese no-data guidance instead of English opportunity claims.",
    evidence:
      "Authenticated production browser before/after DOM; focused Dashboard aggregate, distribution, opportunity, provenance, page, and route tests 10/10; Web lint; exact-origin production build",
    conclusion:
      "pass for the canonical route identity, authenticated empty actor aggregate, zero coverage denominator, and no-data action/goal presentation; populated multi-account isolation, metric calculations, opportunity navigation, and follow-up readback remain pending real actor records",
  },
  {
    id: "web-today-compatibility-routes-2026-07-29",
    target:
      "Authenticated legacy Web Follow-ups and Schedule deep links → canonical merged Today views",
    testData:
      "Audit actor with zero Today decisions and one source-backed private-event arrangement",
    expected:
      "The two retired standalone routes must remain stable compatibility entries: Follow-ups must preserve the day-view intent, Schedule must preserve the arrangements intent, and neither route may revive duplicate state or lose the authenticated actor's canonical Today data",
    actual:
      "Direct /app/followups navigation resolved to /app/today?view=day and rendered the day workspace. Direct /app/schedule navigation resolved to /app/today#arrangements; the arrangements element existed, the browser scrolled to it, and it rendered the same actor-owned private-event arrangement and read-only evidence boundary.",
    evidence:
      "Authenticated production browser URL/DOM/anchor inspection; Today × Schedule merge design and implementation plan; focused Follow-ups route/services tests 10/10 including both redirect digests",
    conclusion:
      "pass for both compatibility destinations, the day query, the arrangements hash/anchor, and canonical actor-owned destination data; browser history behavior and populated follow-up/task interactions remain owned by the merged Today surface and are not separately duplicated here",
  },
  {
    id: "web-party-source-context-boundaries-2026-07-29",
    target:
      "Authenticated Web Party, Check-in, and Graph → selected private event with no reviewed people context",
    testData:
      "Audit actor's event:live-record:20260729, whose base event exists but whose attendee roster, readiness, want-connect, encounter-note, post-event-review, and recommendation context are absent",
    expected:
      "Every Party entry must distinguish a missing event selection from missing people context, classify absent composed records as an empty prerequisite rather than a system failure, perform no Party action, localize the boundary, expose inspectable evidence, and preserve the exact event identity in recovery",
    actual:
      "Before repair, the three event-aware entries rendered Party could not load with event_not_found evidence and their recovery link discarded the private event ID into the public catalogue. After repair, all three rendered localized Party 尚未就绪, stated that the selected event exists but its reviewed people context does not, exposed the five evidence records, and returned through the encoded ID to the same actor-owned detail. The no-event Party entry separately stated that no event was selected.",
    evidence:
      "Authenticated production browser before/after traversal across Party, Check-in, Graph, all three disclosures, and all three recovery links; focused Event Detail and Party tests 22/22; Web lint; exact-origin production build",
    conclusion:
      "pass for event/context distinction, missing-context classification, localized no-write boundary, evidence disclosure, and exact recovery on all three routes; the remaining 77 success-state interactions per route require a real actor-owned event with reviewed attendee/recommendation data and remain explicitly unverified",
  },
  {
    id: "web-public-event-catalogue-controls-2026-07-29",
    target:
      "Authenticated Web public Events catalogue → search, combined filters, empty recovery, map selection, exact detail navigation, and localized dates",
    testData:
      "13 approved public events; exact code EVT01; nonexistent Chinese query; status partitions 3 upcoming / 0 active / 10 ended; ended + AI intersection; 13 located map records",
    expected:
      "Every control must operate only on the approved catalogue, preserve exact event identity and truthful zero results, write nothing, and render localized date components exactly once across module and map presentations",
    actual:
      "The base catalogue rendered 13 events. EVT01 search returned one exact event; a nonexistent query produced the explicit empty state and Clear filters restored 13. Upcoming, active, and ended returned 3, 0, and 10; ended + AI returned 2; reset restored all records. Map mode preserved 13 positions; both rail and pin selection resolved EVT01, whose card linked to the exact detail and returned through browser history. Runtime exposed 9月15日日 and 2月15日日 before repair; extracting the Intl day part as a numeric token changed both presentations to 9月15日 and 2月15日 while preserving event time, venue, count, and route.",
    evidence:
      "Authenticated production-browser search/filter/empty/reset/map/pin/detail/return traversal; focused Events route tests 8/8; exact production build; GitNexus impact LOW with four upstream symbols; commit 759f8577",
    conclusion:
      "pass for the exercised desktop catalogue denominator, exact/nonexistent search, all status branches, one topic intersection, empty-state recovery, module/map switching, map rail and pin selection, localized day-token repair, exact detail navigation, and no-write behavior; guest account controls, mobile/responsive interactions, keyboard/screen-reader traversal, invalid coordinates, source-empty catalogue, and provider failure remain explicitly unverified",
  },
  {
    id: "web-public-event-catalogue-query-isolation-2026-07-29",
    target:
      "Authenticated Web public Events catalogue untrusted scenario parameter → immutable reviewed catalogue source",
    testData:
      "/app/events?scenario=empty against the exact production build; Chinese locale; approved 13-event catalogue with search, status/topic filters, and map controls",
    expected:
      "A public URL must not replace reviewed catalogue data with an internal empty fixture. The same 13 approved events and their normal read-only controls must render regardless of an unrecognized scenario query parameter.",
    actual:
      "Before repair, scenario=empty removed all 13 events, hid the map/topic controls, showed 没有匹配的开放活动, and rendered the synthetic 新的活动正在筹备中 state. After repair, the identical URL retained its query string but rendered 13 场活动, all 13 exact cards, search, status and topic filters, and both content/map view controls.",
    evidence:
      "Authenticated production-browser before/after DOM on the identical adversarial URL; source trace from AppEventsPage searchParams to the synthetic empty array; focused Events tests 8/8; exact production build; GitNexus pre-edit impacts LOW for AppEventsPage and its one-use reader, with staged detection HIGH across nine AppEventsPage execution flows; commit b0b52572",
    conclusion:
      "pass for blocking the exercised authenticated synthetic-empty query while preserving the full reviewed catalogue and no-write behavior; array/duplicate/encoded values, other scenario values, guest session, cache/proxy behavior, mobile/responsive, assistive traversal, and other production routes remain unverified",
  },
  {
    id: "web-public-organizer-navigation-2026-07-29",
    target:
      "Authenticated Web public Organizer → exact event detail, source-preserving return, direct-detail fallback, and catalogue exit",
    testData:
      "Orbit 人脉测试空间 at /app/o/evt01; approved 13-event projection; EVT01/event_01; same-origin organizer/catalogue referrers plus an empty direct-entry referrer",
    expected:
      "Organizer cards must preserve the exact public event; a control labelled 返回上一页 must return to a distinct same-origin Orbit source instead of a fixed destination; direct or external entry must fail safely to the catalogue; organizer exit must restore the full approved catalogue without writes",
    actual:
      "Runtime first proved the organizer card opened the exact EVT01 detail, but 返回上一页 ignored /app/o/evt01 and always sent the user to /app/events. After repair, the detail recognized the same-origin organizer referrer and returned to /app/o/evt01; catalogue-origin navigation still returned to /app/events. An empty-referrer direct entry safely fell back to /app/events. 返回活动 independently restored the complete 13-event catalogue.",
    evidence:
      "Authenticated production-browser organizer/card/detail/back/exit traversal before and after repair; direct empty-referrer fallback; focused Event Detail tests 15/15; exact production build; GitNexus BackButton impact LOW; commit 12eb0514",
    conclusion:
      "pass for exact organizer-card identity, organizer and catalogue history return, direct-entry fallback, external/same-page rejection in tests, catalogue exit, and no-write behavior; unknown-organizer recovery controls, external-referrer browser runtime, mobile/responsive, keyboard/screen-reader traversal, and browser history with multiple identical detail entries remain unverified",
  },
  {
    id: "web-public-organizer-unknown-slug-boundary-2026-07-29",
    target:
      "Authenticated Web public Organizer unknown slug → public-only not-found state, bilingual presentation, evidence disclosure, and catalogue recovery",
    testData:
      "Unknown slug not-a-real-organizer; production live mode; public 13-event catalogue; authenticated actor with no audit registration/contact residue; Chinese and English locale projections",
    expected:
      "A public miss must terminate before private Event CRUD resolution, return a not-found boundary rather than a storage failure, expose no organizer/event/verified fallback, preserve source evidence, present the active language, and recover only to the approved public catalogue",
    actual:
      "Before repair, the public miss fell through to the private Event CRUD service, rendered Organizer page could not load under a Chinese preference, and described a storage failure. After repair, the same slug returned PUBLIC_ORGANIZER_NOT_FOUND directly from the public catalogue branch. Chinese rendered 未找到该主办方 / 返回活动; English rendered Organizer not found / Return to events. No verified badge or event card appeared. 来源详情 exposed both stable evidence IDs, and recovery restored all 13 approved events.",
    evidence:
      "Authenticated production-browser before/after DOM, locale switch, source-details disclosure, and recovery traversal; focused Organizer tests 7/7 including live-store-unconfigured public miss and explicit live failure; exact production build; GitNexus LOW impacts and MEDIUM staged flow detection; commit 5d82a730",
    conclusion:
      "pass for production public/private source termination, unknown-slug classification, dedicated evidence, Chinese/English copy, no fallback identity/data, disclosure, recovery, and no-write behavior; Japanese-specific copy, guest browser session, private-store access tracing under populated unrelated actors, responsive, keyboard/screen-reader, explicit mock scenarios, and provider timeout remain unverified",
  },
  {
    id: "web-public-organizer-query-control-boundary-2026-07-29",
    target:
      "Authenticated Web public Organizer untrusted query parameters → fixed public-catalogue dependency boundary",
    testData:
      "/app/o/demo-event-1?mode=mock and /app/o/evt01?mode=mock&scenario=failure against the exact production build; Chinese locale; approved 13-event public catalogue",
    expected:
      "Public URL parameters must not select internal mock/live dependencies or force empty, pending, or failure fixtures. Only the path slug may select an exact reviewed public organizer; an unknown slug must remain not found and an exact slug must preserve its catalogue projection without writes.",
    actual:
      "Before repair, mode=mock rendered Calendar sync fixture, Climate founders dinner, and a verified organizer badge from the internal mock event service. After repair, the identical unknown-slug URL retained its query string but rendered 未找到该主办方 with PUBLIC_ORGANIZER_NOT_FOUND and no fixture identity, event, or verified badge. The exact evt01 URL with both mode=mock and scenario=failure still rendered Orbit 人脉测试空间 with all 13 reviewed events and cumulative participantCount 500 rather than mock data or a forced route-state failure.",
    evidence:
      "Authenticated production-browser before/after DOM for both adversarial URLs; source trace from AppOrganizerPublicPage searchParams to loadAppOrganizerPublicRouteViewModel mode/scenario service selection; GitNexus page impact LOW with zero upstream callers; focused Organizer tests 7/7; exact production build; commit f3a0c508",
    conclusion:
      "pass for blocking mock dependency selection and forced failure on the exercised authenticated production public route while preserving exact and unknown catalogue semantics and no-write behavior; duplicate/array/encoded query values, empty/pending/live-only parameters, guest session, proxy/cache behavior, other public routes, and future debug parameters remain unverified",
  },
  {
    id: "web-public-event-detail-lifecycle-2026-07-29",
    target:
      "Authenticated Web public Event Detail → attendee roster, matchmaking, post-event follow-up, organizer, replay Party, Agent context, and return navigation",
    testData:
      "Ended event_01/EVT01; current actor user_ms4tr4vi_jb4qje before and after registration cleanup; two registered matchmaking actors; 50 source-backed attendees; one unique and two same-name actor-owned contacts; one stable introduction request; two follow-up runs; before/after Agent conversations",
    expected:
      "Every branch must preserve the exact event and actor, use source-backed people/counts, gate writes on registration and explicit confirmation, keep retries idempotent, withhold external actions, distinguish duplicate contacts, represent ended-event replay honestly, and give Agent the exact selected event instead of a fuzzy fallback",
    actual:
      "The detail rendered the generated 50-person roster, expanded and collapsed without synthetic names, and matched two source-backed registered people. Repeated and reverse introduction requests reused one directionless request; acceptance, proposed time, and slot selection converged on one scheduled record. The duplicate-contact follow-up first persisted only a waiting run/step, then explicit resolution produced one confirmed note, one unsent draft, and review-only task/reminder actions; retry reused every core ID. Party replay kept check-in and seat disabled, exposed all five tabs, and returned to EVT01. The organizer page initially failed and then exposed hard-coded 12/4,200+/4.8 metrics; after repair it rendered 13 catalogue events, cumulative participantCount 500, and no attendee names. Agent initially claimed event_01 was missing and recommended an unrelated future event; after exact-reference repair it used one event_01 record, stated 已结束, and suggested retrospective next steps. The detail back control returned catalogue-origin navigation to /app/events; a later organizer traversal exposed its hard-coded destination and was repaired to preserve /app/o/evt01 while retaining the direct-entry catalogue fallback. Cleanup deleted the 42 exact audit rows across 12 collections, the same target predicate returned zero residual rows, and three unrelated pre-existing Agent runs remained. A hard refresh after cleanup immediately hid all 50 attendee names, matchmaking candidates, follow-up, and replay access. Runtime then exposed and repaired one state contradiction: the ended-event matchmaking boundary no longer links to registration and now states that registration is closed and matching is limited to participants registered before the event ended.",
    evidence:
      "Authenticated production-browser click and post-cleanup refresh traversal; exact Postgres row/payload readback; focused Event Detail, Party, organizer, Agent-context, recommendation, matchmaking, and follow-up tests; exact production builds; commits 743721b8, 55c72ef8, 3b116abe, fd1ce510, 9bbe8c4c, and 045a7ec4",
    conclusion:
      "pass for the exercised registered ended-event lifecycle, post-cleanup unregistered roster/matchmaking/follow-up/replay denial, closed-registration terminal copy, exact source-backed roster, retry/reverse idempotency, duplicate-contact wait/resolve branches, no-send action boundary, replay tabs/disabled controls, organizer projection/metrics, exact Agent lookup, and source-aware browser return; voice recording/transcription, incoming decline UI, guest/login route, responsive/keyboard/assistive traversal, and injected provider failures remain explicitly unverified",
  },
  {
    id: "web-private-event-detail-query-isolation-2026-07-29",
    target:
      "Authenticated Web actor-owned Event Detail untrusted scenario parameter → server-owned production dependencies",
    testData:
      "Actor-owned event:live-record:20260729 at its encoded dynamic route, with and without scenario=empty; Chinese locale; exact production build",
    expected:
      "The public HTTP route may accept language presentation input but must not forward a scenario fixture selector into private event-detail or registration-guide services. Actor scope, server configuration, and stored event state must determine the final page.",
    actual:
      "Source inspection proved that AppEventDetailPage forwarded readSearchParam(query, scenario) to both loadAppEventDetailRoute and loadRegistrationProfileGuideForCurrentTestUser; focused loader tests independently prove empty, pending, and failure scenario branches exist. The exercised private event did not produce a stable pre-repair final-DOM difference because its fallback and async boundaries converged on the same no-match state, so no runtime defect is claimed. After repair, both URLs produced exactly equal final DOM while preserving the event title, encoded identity, venue, source context, readiness, registration action, and matchmaking boundary.",
    evidence:
      "Authenticated production-browser final-DOM equality after repair; source trace before repair; focused Event Detail tests 15/15 including internal scenario branches and public/private routing; exact production build; GitNexus AppEventDetailPage impact LOW with zero upstream callers and no staged graph changes; commit 89d67811",
    conclusion:
      "pass for source-level removal of the two scenario injections and post-repair equality on one authenticated actor-owned event; no pre-repair stable UI divergence is claimed, and other scenario values, other private event states, duplicate/array/encoded inputs, guest routing, proxy/cache behavior, and registration-guide-visible states remain unverified",
  },
  {
    id: "web-schedule-dynamic-event-identity-2026-07-29",
    target:
      "Authenticated dynamic Web Schedule Event preview → encoded actor-owned event ID and both recovery destinations",
    testData:
      "Audit actor's colon-delimited event:live-record:20260729, opened through /app/schedule/events/event%3Alive-record%3A20260729",
    expected:
      "The route adapter must decode the dynamic segment exactly once before authentication return-path composition and actor-scoped service lookup; the preview must preserve source truth and all actions must remain read-only",
    actual:
      "Before repair, the route passed the percent-encoded segment to the event service and rendered EVENTS_EVENT_NOT_FOUND. After repair, the same URL rendered 功能审计私有活动 20260729 with its exact venue, confirmed status, 2026-09-29 time, manual-event source, one evidence record, next action, and no-write guardrail. 返回日程 reached the real Today arrangements anchor and 查看活动列表 reached Events.",
    evidence:
      "Authenticated production browser before/after DOM and both recovery traversals; focused Schedule route/services tests 10/10; Web lint; exact-origin production build",
    conclusion:
      "pass for one-time dynamic ID decoding, actor-scoped private-event readback, source/guardrail presentation, and both generated recovery actions; other dynamic ID shapes, unauthenticated browser return, and populated schedule mutations remain pending",
  },
  {
    id: "web-settings-actor-scoped-lifecycle-2026-07-29",
    target:
      "Authenticated Web Settings → appearance, Agent memory, Playbook, execution preferences, health, feedback, and integration boundaries",
    testData:
      "Audit actor with zero memories, zero feedback records, zero Playbooks, zero contacts, one private event, deepseek configured, durable storage, no observed worker, and three unconfigured external integrations",
    expected:
      "Every rendered control must produce truthful local or actor-scoped readback, model-generated Playbooks must remain inside the strict read-only schema, every Agent execution must preserve the server actor, unavailable integrations must expose no authorization or disconnect action, and all reversible audit writes must be cleaned up",
    actual:
      "Theme, two memory-governance switches, memory CRUD/cancel, every Playbook trigger branch, compile, trial, enable, run, pause/resume, version, cancel, delete, four execution toggles, quiet hours, time zone, Save, and health refresh all produced visible results. Compilation initially rejected an invalid model schema and succeeded after a bounded safety retry. Dry-run initially lost actor identity and returned a false authentication summary; after actor propagation it returned the current actor's truthful empty follow-up queue. Hard reload confirmed original preferences, zero memories, and zero Playbooks after cleanup. Feedback delete and integration connect/check/disconnect were absent because their source records/providers were absent.",
    evidence:
      "Authenticated production-browser DOM across 43 stable interaction identities; focused Playbook/automation tests 12/12; full product audit 7/7; two exact production builds with TypeScript",
    conclusion:
      "pass for all 43 rendered and data-enabled settings interactions plus truthful empty/unconfigured boundaries; feedback deletion and integration connect, check, and disconnect remain explicitly unverified until real actor-owned records and configured providers exist",
  },
  {
    id: "web-public-registration-english-identity-2026-07-29",
    target:
      "Authenticated Web canonical Registration English presentation → reviewed public event identity and question context",
    testData:
      "/app/events/event_signup_01/register?language=en for the reviewed future public event; public catalogue DTO carrying Chinese-only title/location presentation fields; exact production build",
    expected:
      "The registration heading, venue, and generated question context must use the same reviewed English event identity as the public detail page. A Chinese-only catalogue projection must not leak Chinese identity fields into an explicitly English interview.",
    actual:
      "Before repair, the authenticated production page mixed English controls and questions with 关西跨境商务对接会 and 大阪, including an English sentence beginning At 关西跨境商务对接会. After repair, exact server rendering produced Kansai Cross-Border Business Connect in both heading and question context plus Osaka as venue, with neither Chinese identity string present.",
    evidence:
      "Authenticated pre-repair production-browser DOM; source trace from the Chinese-only public EventDTO projection into slash-segment localization; existing reviewed EVENT_CONTENT title and server localization boundary; focused registration page test 9/9 and broader registration chain 29/29; exact production build; GitNexus pre-edit impact LOW and staged detection HIGH across six registration presentation flows; commit 41044f6a",
    conclusion:
      "pass for source-backed English identity consistency in exact production server rendering and regression tests; post-repair authenticated browser DOM, Japanese registration, other public events, generated model-provider output, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-contacts-route-control-isolation-2026-07-29",
    target:
      "Authenticated Web Contacts list family and Home contact aggregate → public filters separated from internal fixture controls",
    testData:
      "AppContactsSearchParams containing scenario=empty and action=review-filtered-contact; shared loader callers at /app/contacts, graph, intros, pipeline, contacts dashboard, /app/home, and /app/home/events",
    expected:
      "Public query input may filter contacts by query/source/status/tag/value, but it must not force empty/pending/failure fixtures or switch the internal list/search operation. Controlled tests must retain an explicit non-URL path to those states.",
    actual:
      "Before repair, the shared loader read scenario and action directly from the same public searchParams object used for filters; scenario entered the synthetic route-state branch and action switched listContacts to searchContacts. After repair, the adversarial public parameter object returned the normal success model with reviewActionRequested=false, while an explicit third-argument scenario still returned the controlled empty route state.",
    evidence:
      "Source trace across the shared loader and seven direct callers; focused Contacts/Home tests 38/38; Web full suite 1353/1353; exact production build; GitNexus pre-edit HIGH impact with seven direct callers and four process groups, then staged CRITICAL detection across 22 generated flows; commit 0026dfc7",
    conclusion:
      "pass for source-level separation of public contacts filters from internal scenario/action controls with full Web regression coverage; authenticated browser DOM, valid-filter browser behavior, each affected route independently, duplicate/array/encoded query values, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-home-route-control-isolation-2026-07-29",
    target:
      "Authenticated Web personal Home and Home Events → actor-only child-route composition",
    testData:
      "/app/home and /app/home/events page adapters; arbitrary public scenario/action query values; shared Home loader composing Events, Contacts, and Profile child models",
    expected:
      "Personal Home has no server-side query filter contract, so URL parameters must not select child-service fixtures or actions. Only the authenticated actor and server-owned configuration may determine the composite payload.",
    actual:
      "Before repair, both page adapters forwarded the entire public searchParams object into loadAppHomeRouteViewModel, which passed it to Events, Contacts, and Profile loaders with active scenario/action branches. After repair, neither page declares or reads searchParams; both call the same loader with undefined query input and the unchanged authenticated actor.",
    evidence:
      "Source trace across both page adapters and the three-child Home composer; Home focused tests 20/20; exact production build; preceding shared Contacts boundary full Web suite 1353/1353; GitNexus pre-edit impacts LOW for both pages and staged CRITICAL detection across 16 Home composition flows; commit 774b332e",
    conclusion:
      "pass for source-level removal of public query injection at both personal Home adapters with focused/build coverage; authenticated browser DOM, other query shapes, cache/proxy behavior, child provider failures, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-dashboard-query-review-removal-2026-07-29",
    target:
      "Authenticated Web Dashboard GET composition → actor-scoped reads only, explicit internal scenarios, and real recovery destinations",
    testData:
      "/app/dashboard with action=run-dashboard-review or scenario=empty/pending/failure; actor-scoped aggregate, distribution, opportunity, and provenance services",
    expected:
      "A page GET must only compose the current actor's dashboard. Public query parameters must not run internal recompute/audit work or select fixture states; every rendered recovery link must reach a real product destination whose behavior matches its label.",
    actual:
      "Before repair, action=run-dashboard-review invoked opportunity recompute and provenance run during server rendering, then discarded the actionResult because neither the adapter nor final Dashboard UI consumed it. scenario selected internal states, and recovery links pointed back to action/scenario query URLs. After repair, the page accepts no searchParams, the loader accepts scenario only through explicit controls, the invisible action branch and result type are removed, and recovery goes to Dashboard, Add sourced contact, or Settings.",
    evidence:
      "GitNexus context and source trace from AppDashboardPage through four actor-scoped services; focused Dashboard tests 5/5; exact production build; GitNexus pre-edit LOW impacts and staged MEDIUM detection across five Dashboard flows; commit 223f13df",
    conclusion:
      "pass for source/build removal of public fixture/action controls, invisible GET recompute/audit work, and dead recovery links while preserving actor-scoped Dashboard reads; authenticated browser DOM, API-level recompute/audit controls, provider failures, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-profile-route-control-isolation-2026-07-29",
    target:
      "Authenticated Web Profile and shared Home, Party, Admin/Platform composition → actor-scoped profile reads separated from internal fixture controls",
    testData:
      "/app/profile with arbitrary scenario, action=complete-profile-field, and preferredIntroChannels query values; shared Profile loader calls from Home, Party, and Admin/Platform",
    expected:
      "A profile page GET must read the authenticated actor's sourced profile without selecting fixture states or fabricating an unsaved editor result from public query input. Tests must retain an explicit non-URL path to controlled route states, and every shared caller must preserve its actor boundary.",
    actual:
      "Before repair, the production page and three shared composers passed unrestricted search parameters to Profile. scenario selected synthetic states, while action=complete-profile-field and preferredIntroChannels built an action/choice preview that the final Profile adapter and UI never consumed and never persisted. After repair, the production page accepts no searchParams, all four production composition paths pass actor context only, scenario is available solely through typed internal controls, and the dead GET action/preview contract and helpers are removed.",
    evidence:
      "GitNexus pre-edit HIGH impact with four direct callers, 12 upstream symbols, and three process groups; Profile/Home/Party/Admin focused tests 49/49; complete Web suite 1355/1355; exact production build; staged GitNexus CRITICAL detection across 20 shared composition flows; commit d3f12a07",
    conclusion:
      "pass for source/build/full-suite separation of public query input from Profile fixture/action behavior across all known production callers; authenticated browser DOM, explicit profile API save/readback, provider failures, cache/proxy behavior, duplicate/array/encoded query values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-today-aggregate-query-isolation-2026-07-29",
    target:
      "Authenticated Web Today aggregate → legitimate date/view/entry navigation separated from Today ledger, Schedule, and Followups fixture/action controls",
    testData:
      "/app/today with date, view, entry, scenario=failure, and action=complete-top-followup; merged actor-scoped ledger, arrangements, and follow-up time-spine loaders",
    expected:
      "Public query input may select a calendar date/view and expand one ledger entry, but it must not select child-service fixture states or fabricate a completion result. Controlled tests must retain an explicit non-URL path to each child failure state, and recovery actions must point to real product destinations.",
    actual:
      "Before repair, loadAppTodayMergedViewModel forwarded the entire public query object to all three child loaders. scenario therefore selected ledger, Schedule, and Followups fixtures simultaneously; complete-top-followup built a Followups actionResult that the schedule adapter and final Today UI never consumed. After repair, the aggregate forwards only allowlisted entry input to the ledger, consumes date/view locally, invokes Schedule and Followups without public query input, exposes typed internal controls for all three children, removes the dead actionResult chain, and routes recovery to Today, Today arrangements, Contacts New, or Settings.",
    evidence:
      "Current-source call-site inventory after GitNexus incremental analysis failed with LOWER: Invalid UTF-8 and left current symbols unresolved; the required impact commands were run and returned UNKNOWN/not found, so verification was expanded. Today/Followups/Schedule focused tests passed 59/59, the complete Web suite passed 1356/1356, the exact production build passed, and staged GitNexus detection returned LOW for eight files and two recognized merged-view symbols; commit ba8fd2c8",
    conclusion:
      "pass for source/build/full-suite separation of public Today navigation from three child fixture/action controls and removal of the invisible completion preview; authenticated browser DOM, explicit write/readback actions, provider failures, cache/proxy behavior, duplicate/array/encoded query values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-all-actions-query-isolation-2026-07-29",
    target:
      "Authenticated Web All Actions ledger → legitimate status/entry navigation separated from internal ledger scenarios",
    testData:
      "/app/contacts/all-actions with status, entry, and adversarial scenario=failure query values; authenticated ledger service boundary",
    expected:
      "Public query input may filter by a known ledger status and expand one entry, but it must not force mock empty/failure states. Tests must retain a typed internal path to those states, and the authenticated server ledger service must remain unchanged.",
    actual:
      "Before repair, the loader read status, entry, and scenario from one unrestricted search-parameter record and forwarded scenario to listEntries. After repair, the public contract contains only status and entry, listEntries receives scenario solely from explicit internal controls, valid/invalid filters and entry expansion are unchanged, and an adversarial public scenario returns the normal six-entry success model.",
    evidence:
      "Required GitNexus pre-edit impacts were run but current symbols remained unresolved after the earlier incremental-index UTF-8 failure, so risk was treated as UNKNOWN. All Actions, audit-detail, and execution-settings focused tests passed 20/20; exact production build passed; the immediately preceding same-ledger full Web suite passed 1356/1356; staged detection returned LOW for three files and one recognized symbol; commit 22d3b882",
    conclusion:
      "pass for source/build separation of public All Actions filters/selection from internal ledger scenarios while preserving authenticated service resolution; authenticated browser DOM, filter/entry combinations, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-party-query-isolation-2026-07-29",
    target:
      "Authenticated Web Party, Check-in, and Graph → event identity queries separated from internal fixture controls",
    testData:
      "Shared Party loader with eventId/code identity, adversarial scenario=failure and mode=mock query values, explicit mock mode, and explicit internal empty control",
    expected:
      "Public Party query input may select one event by eventId or code, but it must not switch runtime mode or force fixture states. The authenticated actor, configured module mode, registration truth, and stored event context must determine access; controlled tests retain a typed scenario path.",
    actual:
      "The existing loader already ignored URL mode, but it still read scenario from the unrestricted query record and forwarded it to private Event Detail composition across all three Party pages. After repair, AppPartySearchParams contains only eventId/code, scenario moved to a typed third controls argument, adversarial public scenario input preserves the normal Party success model, and an explicit internal empty control still returns the controlled route state.",
    evidence:
      "GitNexus pre-edit impact was LOW: three direct page callers for loadAppPartyRouteViewModel and four total upstream symbols for routeEventId/normalizeScenario, with zero indexed flows. Party focused tests passed 12/12, including authenticated actor propagation, public mode/scenario isolation, registered/unregistered catalogue access, empty context, and explicit control coverage. Exact production build passed; staged detection returned LOW for two files and two Party symbols; commit 30cfd2a0",
    conclusion:
      "pass for source/build separation of public Party event identity from mode/scenario controls across Party, Check-in, and Graph; authenticated browser DOM, eventId/code combinations, registration transitions, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-chat-query-agent-isolation-2026-07-29",
    target:
      "Authenticated Web Chat and shared Agent loader → conversation identity queries separated from internal scenarios and Agent execution",
    testData:
      "Chat loader with conversation/conversationId identity, adversarial prompt and scenario query values, explicit internal empty control, and shared /app/agent composition",
    expected:
      "A Chat page GET may select only an actor-owned conversation. Public query input must not force fixture states, call Agent sendMessage, record a reply, or expose dead action/Agent result fields. Live conversationId links and the canonical Agent q prompt must retain their own typed contracts.",
    actual:
      "Before repair, the shared loader accepted an unrestricted query record: scenario selected fixture states and prompt invoked Orbit Agent sendMessage during server rendering, although ChatWorkspace consumed neither agentTurn nor actionResult. Live async links used conversationId, which the loader ignored in favor of its first conversation. After repair, Chat accepts only conversation/conversationId, scenarios require explicit internal controls, the GET Agent/action projection chain is deleted, both conversation aliases select the exact actor-scoped identity, and the empty branch reuses the same actor-scoped services.",
    evidence:
      "GitNexus pre-edit impact was LOW for the shared loader and HIGH for the internal projection chain across the AppAgentPage process group. Chat/Agent focused tests passed 41/41; the complete Web suite passed 1358/1358; the exact production build passed after preserving the pure artifact surface type used by the side-panel contract. Staged detection returned MEDIUM for four files, six symbols, and one indexed AppAgentPage flow; commit 411772b2",
    conclusion:
      "pass for source/build/full-suite separation of public Chat identity from internal scenarios and GET Agent execution across Chat and Agent composition; authenticated browser DOM, populated multi-account identity selection, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-operator-events-auth-query-isolation-2026-07-29",
    target:
      "Web Admin, Admin Events, and Platform → authenticated actor-scoped Events/Profile composition separated from public sign-in entries and internal Events controls",
    testData:
      "Signed-out /app/admin/access, /app/login-admin, /app/admin, /app/admin/events, and /app/platform access policy; shared operator loader with an explicit actor, adversarial scenario/action properties, and explicit internal empty control",
    expected:
      "Only the two sign-in entries may remain public. Every operator workspace must require the existing authenticated session, pass its canonical actor to both Events and Profile, and ignore public fixture/action query input. A page GET must never invoke recommendation acceptance; controlled tests retain a non-URL scenario path.",
    actual:
      "Before repair, all three workspaces were public, their pages forwarded unrestricted search parameters, and the shared loader called live Events/Profile without an actor. scenario selected internal Event states, while action=accept-top-event called acceptRecommendedEvent during GET and produced an actionResult that no production consumer rendered. After repair, the proxy and each server page require a session while the two sign-in entries remain public, the shared loader passes one actor to Events and Profile, Events accepts only actorId plus typed controls, and the dead GET acceptance/actionResult chain and scenario URL recovery are removed.",
    evidence:
      "Fresh GitNexus index (28,424 nodes, 60,559 edges, 300 flows); pre-edit HIGH impact for the Events loader/action helpers across Home, Home Events, and Event Detail, LOW for the operator loader/pages/auth predicate; focused Events/Admin/Home/Event Detail/auth/visual tests 55/55; complete Web suite 1358/1358; exact production build; staged GitNexus CRITICAL across 11 files, 15 symbols, and 16 expected Events/Home/Detail/auth-return flows; commit 138d528a",
    conclusion:
      "pass for source/build/full-suite enforcement of authenticated operator composition, actor propagation, public sign-in exceptions, explicit-only Event scenarios, and removal of GET acceptance; authenticated browser redirect/return/data-isolation runtime, admin role authorization beyond a generic session, populated multi-account operator data, POST acceptance/readback, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-contacts-new-get-action-isolation-2026-07-29",
    target:
      "Authenticated Web Contact Import Hub → action-specific APIs separated from page-load capability composition",
    testData:
      "Production /app/contacts/new source, retired route-composition module, adversarial scenario=failure/mode=mock/action=confirm-manual-draft query, and explicit business-card scan/confirm API boundaries",
    expected:
      "Loading the import workspace may resolve authentication and capability availability only. URL parameters must not switch module mode, select fixture states, invoke acquisition providers, or confirm a draft; each supported source must start from an explicit authenticated user action.",
    actual:
      "The production page had already stopped accepting searchParams and rendered only the authenticated action workspace, but a test-only production module still retained the old unrestricted query loader. It could select mode/scenario, run nine acquisition/permission capabilities in parallel, and call confirmManualContactDraft for action=confirm-manual-draft. The test imported that latent aggregator and the live implementation notes described it as intentional. After repair, the historical lint-manifest path exports nothing, the test asserts the page and module cannot regain query/preflight behavior, and the real business-card scan/confirm flow remains behind explicit authenticated API actions.",
    evidence:
      "Fresh GitNexus context found no indexed production process for loadAppContactsNewRouteViewModel. Upstream impact was LOW for all eleven module functions: the loader had one direct test-file caller and zero affected processes. Focused regression passed 1/1; the complete Web suite passed 1357/1357; the exact production build passed; staged GitNexus returned LOW for two files, two test symbols, and zero processes; commit 6da55f15. Global typed lint reached an unrelated pre-existing TS2367 in tests/pages/app-contact-detail-live-route-services.test.ts:478.",
    conclusion:
      "pass for source/build/full-suite removal of the latent query-driven Contact Import aggregator while preserving explicit authenticated action APIs; configured OCR success/readback, other source connections, API permission failures, authenticated browser DOM, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-contact-detail-get-action-isolation-2026-07-29",
    target:
      "Authenticated Web Contact Detail → read-only actor/contact composition separated from dead local action simulation",
    testData:
      "Production /app/contacts/[id] page, shared Contact Detail route input/success model, adversarial action=prepare-follow-up/scenario=failure query, focused live graph states, and source-level action-chain absence",
    expected:
      "A Contact Detail page GET must resolve only the authenticated actor and route contact identity, read source-backed detail/evidence/value records, and ignore public query input. It must not add evidence, build a draft, or expose an unconsumed local action result.",
    actual:
      "The real page already accepted only params and passed actorId/contactId, but the shared loader still exposed an action input. prepare-follow-up and its stage-local-review alias called connectionEvidence.addEvidence, assembled a local draft/safety ledger, and returned actionResult even though no page, adapter, component, or test consumed it. After repair, the action input/type/normalizer/builder/result model are deleted; fixture scenario/mode/provider remain explicit service-test controls; the page-level regression rejects reintroduction of the action chain.",
    evidence:
      "GitNexus context found the live AppContactDetailPage flow. Upstream impact was LOW for the three loaders, normalizer, and builder across that one process, and MEDIUM for the public input/success interfaces with five direct use sites; no HIGH/CRITICAL risk. Focused Contact Detail and visual tests passed 14/14; repository typed lint passed after replacing the same test's impossible post-assert comparison; complete Web suite passed 1357/1357; exact production build passed; commit 5efaa07f. Staged detect-changes was executed but incorrectly returned No changes detected despite Git showing two staged files with 11 insertions and 98 deletions, so no staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite removal of the dead Contact Detail GET evidence/draft action chain while preserving actor-scoped read composition; authenticated browser DOM, populated multi-account contact isolation, explicit follow-up API UX/readback, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-event-detail-dead-action-projection-2026-07-29",
    target:
      "Web Event Detail → rendered event model separated from unused want-connect action and relationship projections",
    testData:
      "Public catalogue and authenticated owner-fallback Event Detail pages, success model and presenter consumers, adversarial action/target query, visual-asset tests, authenticated matchmaking UI, and want-connect API path",
    expected:
      "The page may read event identity and language only. Its server model and tests must represent content actually rendered. Want-connect or matchmaking writes must originate from explicit authenticated UI/API actions, not an always-null action result or a presenter that no production component consumes.",
    actual:
      "The page already ignored action/target/scenario/mode queries and the loader returned actionResult=null, but the success model retained an action-result type and two test-only helpers for selecting a target and converting a live intent into that result. A relationship-context presenter projected the null action into an all-false side-effect ledger; the page imported but never called it. A visual test passed that projection as an extra prop to OrbitRealEventDetail even though the component accepts only event, so React discarded the alleged UI evidence. After repair, the dead model/helpers/presenter/import/extra prop and their self-validating test are removed; real authenticated APIs and matchmaking controls are unchanged.",
    evidence:
      "A forced index-only GitNexus rebuild completed with 28,414 nodes, 60,478 edges, and 300 flows after the incremental index exposed stale deleted symbols. Upstream impact was MEDIUM for the action/success interfaces with eleven graph users and LOW for the page, helpers, and presenter; no HIGH/CRITICAL risk. Focused Event Detail and visual tests passed 23/23, repository lint passed, the complete Web suite passed 1356/1356, and production build passed; commit 069c22cf. Required staged detection ran against the fresh index but again returned No changes detected for the six-file deletion-heavy diff, so no false staged risk is assigned.",
    conclusion:
      "pass for source/lint/build/full-suite removal of unused Event Detail action and relationship projections while preserving real explicit mutation paths; authenticated browser matchmaking lifecycle, want-connect API readback, repeated mutation/idempotency, multi-account isolation, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-event-registration-fixture-isolation-2026-07-29",
    target:
      "Authenticated Web Event Registration → public/actor-scoped event and profile sources separated from deterministic test-user fixtures",
    testData:
      "Production Event Detail and /app/events/[id]/register source; public event_signup_01 by id and EVTSIGNUP01 code; actor-scoped Event/Profile services; live-mode demo-only event_001; retired deterministic registration-guide preview; registration GET/POST/interview/persona API consumers",
    expected:
      "A registration page and its APIs may resolve only a reviewed public-catalogue event or an event readable by the authenticated actor. Visible participant identity must come from that actor's Profile/session. Demo event/profile fixtures and the Ari Lane test user must never preempt live ownership reads or appear in production registration/detail UI.",
    actual:
      "The shared registration loader checked mockEventRecords before the public catalogue and actor-scoped Event service, so production page and API consumers could resolve demo events without ownership. Both Event Detail and Registration also called loadRegistrationProfileGuideForCurrentTestUser, whose success model always used mockManualProfile, mockProfileFixture completeness, and deterministic guide metadata. Registration replaced the visible name with the session name but retained the fixture headline; Event Detail rendered the entire demo question/missing-field preview. After repair, the loader resolves public catalogue then server-configured actor Event data, production pages have no test-user guide dependency, registration display name comes from actor-scoped Profile with session fallback, the obsolete detail/fallback guide UI and runtime mock-profile constants are removed, and unavailable events terminate before question generation or writes.",
    evidence:
      "Fresh GitNexus impact was MEDIUM for loadEventForRegistration across five direct page/API callers and one registration process, LOW for both pages, guide components, workspace props, constants, language helper, and corrected registerability guard; no HIGH/CRITICAL risk. Focused Event Registration/Event Detail/API/capability tests passed 39/39, repository lint passed, the complete Web suite passed 1357/1357, and production build passed. A live-mode regression proves demo-only event_001 resolves to null while public event_signup_01 remains registerable. Staged detection reported MEDIUM for seven files and one four-step NormalizeOrbitLanguage flow; commit 1a0b72b4.",
    conclusion:
      "pass for source/lint/build/full-suite isolation of production Event Registration from demo event/profile/guide fixtures while preserving public catalogue, actor Profile, registration persistence, cancel/reactivate, interview, and persona API boundaries; authenticated browser profile-name readback, live private-event registration, provider failure, eight-question completion, multi-account UI, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-deterministic-registration-guide-retirement-2026-07-29",
    target:
      "Retired deterministic Event Registration profile-guide module → single production adaptive-registration architecture",
    testData:
      "Repository-wide imports and symbol references for features/events/registration-profile-guide.ts; its capability test; current Event Detail, Registration, registration API, question generator, persistence service, and live implementation notes",
    expected:
      "Once no production surface or API consumes the deterministic Ari Lane guide, the fixture module and tests that validate only that module must be removed rather than retained as an alternative registration architecture. Documentation must identify the actor/public Event, actor Profile, adaptive question, and registration service boundaries as the only product chain.",
    actual:
      "After P1-071 removed both production consumers, repository search found the 728-line guide imported only by its own 187-line capability test. The guide still bundled mock events, mockManualProfile, mock completeness, route scenarios, deterministic questions, and a loader named for the current test user; its handoff note incorrectly claimed degraded Event Detail still used it. The module and five self-validating tests are now deleted, and the implementation note describes only the real question-generation and idempotent registration boundaries.",
    evidence:
      "GitNexus file-level impact reported LOW with two direct graph references and zero processes, while symbol-level results still named already-deleted page callers from a stale index. Exact repository search found no production import. The remaining focused Event Registration/Event Detail/API/capability suite passed 34/34, repository lint passed, the full Web suite passed 1352/1352 after exactly five orphan tests were removed, and production build passed; commit b6a2f0eb. Required staged detection reported LOW and zero processes but indexed only the documentation edit, so its deletion blind spot is recorded.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the orphan deterministic registration-guide architecture; the real adaptive registration browser lifecycle retains the runtime gaps listed in web-event-registration-fixture-isolation-2026-07-29",
  },
  {
    id: "web-agent-page-actor-query-isolation-2026-07-29",
    target:
      "Authenticated Web Agent → actor-scoped shared Chat composition separated from obsolete URL action/scenario/mode inputs",
    testData:
      "Production /app/agent and /app/chat server pages; shared Chat route loader; signed-out Agent entry; explicit actor service resolution; adversarial action=review-top-agent-action, scenario=failure, mode=mock, and proactive fixture query values",
    expected:
      "The Agent page must enforce its own authenticated server boundary and pass the canonical session actor into the shared Chat loader. URL input may select only conversation identity, language, and a submitted query; it must not select fixtures, execute Agent actions, or switch service mode. Writes remain behind explicit authenticated client/API actions.",
    actual:
      "The proxy classified /app/agent as private, but unlike /app/chat the page called loadAppChatRouteViewModel without a session actor. The shared loader could therefore resolve generic non-actor services despite the private route. action, scenario, mode, and proactive inputs were already inert, while the manual acceptance guide incorrectly described review-top-agent-action as a page-load command-center preview. After repair, the server page resolves auth, redirects a missing actor to the canonical login return, passes actorId to the shared loader, and regressions prove the obsolete query values remain unread.",
    evidence:
      "Pre-edit GitNexus impact was LOW for AppAgentPage and the affected tests, with zero upstream callers. Focused Agent/Chat regressions passed 16/16, repository lint passed, the complete Web suite passed 1352/1352, and production build passed. Staged detection reported HIGH because the page is the common entry to eight existing Chat service, result, language, state-copy, and decoding flows; context inspection confirmed no incoming callers and no changed downstream call set. Commit 46666e68.",
    conclusion:
      "pass for source/lint/build/full-suite enforcement of the Agent server auth boundary, actor propagation, and obsolete action/scenario/mode query isolation; authenticated browser redirect and populated conversation runtime, two-account isolation, explicit Agent action lifecycle/readback, cache/proxy behavior, duplicate/array/encoded inputs, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "web-agent-legacy-hybrid-model-retirement-2026-07-29",
    target:
      "Retired Web Agent hybrid-data constructor → type-only UI contract backed by the shared actor-scoped Chat composition",
    testData:
      "Repository imports and symbol references for getOrbitAgentViewModel; its six private hybrid-data helpers; the shared OrbitAgentViewModel UI types; the real Agent page, Chat adapter, and hybrid-route self-validation test",
    expected:
      "Once /app/agent uses the authenticated shared Chat loader and adapter, its legacy synchronous constructor must not remain as a second data architecture. The file may retain the stable UI type contract consumed by the adapter and component, but it must not import hybrid route data, build deterministic history/suggestions, or synthesize people and event recommendations.",
    actual:
      "The real Agent page and Chat adapter no longer called getOrbitAgentViewModel, but the product file still imported the entire hybrid route-data layer and kept 159 lines of recommendation, fallback, event, history, and suggestion construction. Only orbit-hybrid-route-view-models.test.ts invoked the getter, so that test self-validated an architecture the product had already replaced. After repair, the file exports only the UI interfaces, the self-validating Agent invocation is removed, and the live-page regression rejects either the getter or hybrid-data import from returning.",
    evidence:
      "GitNexus reported LOW upstream impact for getOrbitAgentViewModel with zero callers and zero execution flows. Its six helpers affected only the same dead getter chain, with at most three internal symbols and no flows. Focused Agent and hybrid-route tests passed 4/4, repository lint passed, the complete Web suite passed 1352/1352, and production build passed; commit 4c853b4e. Required staged detection returned No changes detected for the three-file diff containing 187 deletions, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the legacy Agent hybrid-data constructor while preserving the shared UI type contract and actor-scoped Chat implementation; other legacy hybrid route constructors are separate boundaries and remain pending individual impact analysis",
  },
  {
    id: "web-register-legacy-hybrid-model-retirement-2026-07-29",
    target:
      "Retired legacy Register hybrid-data constructor → single reviewed-public-event entry into adaptive registration",
    testData:
      "Repository imports and symbol references for orbit-register-route-view-model.ts and getOrbitRegisterViewModel; canonical /app/register page and loader; EVTSIGNUP01, unknown demo-event-1, adversarial mode/scenario query, and the hybrid-route self-validation test",
    expected:
      "The legacy invite-code route must have one production architecture: resolve a reviewed public event code, preserve presentation language only, and redirect to that event's authenticated adaptive registration workspace. No unused compatibility file may compose a hybrid event plus hybrid profile preview or expose a second registration form model solely for tests.",
    actual:
      "The canonical route already resolved only reviewed public catalogue events, failed closed for unknown codes, ignored mode/scenario, and redirected without loading a profile form. A separate 43-line orbit-register-route-view-model.ts still called synchronous landing and profile hybrid getters to assemble event fields, option lists, tags, and a profile preview. Repository search and GitNexus found only the broad legacy self-validation test importing it. After repair, that file and test invocation are deleted, while the focused Register regression asserts the compatibility path remains absent.",
    evidence:
      "GitNexus reported LOW upstream impact for getOrbitRegisterViewModel: one direct test-file caller, zero production processes, and zero affected modules. Focused Register and hybrid-route tests passed 7/7, repository lint passed, the complete Web suite passed 1352/1352, and production build passed; commit 2b9058a6. Required staged detection returned No changes detected for the three-file deletion/reference-removal diff, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the orphan legacy Register hybrid model while preserving reviewed public code resolution and the canonical adaptive registration workspace; browser registration lifecycle gaps remain tracked under the existing Event Registration audit cases",
  },
  {
    id: "web-organizer-legacy-hybrid-model-retirement-2026-07-29",
    target:
      "Retired public Organizer hybrid-data constructor → type-only UI contract backed by the canonical public Organizer loader",
    testData:
      "Repository imports and symbol references for getOrbitOrganizerPublicViewModel; real /app/o/[slug] page, loader, and component; public event code, unknown slug, mock/live controlled states, language, attendee-name privacy, and the hybrid-route self-validation test",
    expected:
      "The public Organizer route must obtain its event aggregate from its canonical loader and expose only reviewed organizer statistics. The shared model file may retain the UI type consumed by the loader and component, but it must not synchronously read landing hybrid data, choose a fallback event, or fabricate a default organizer solely for a legacy test.",
    actual:
      "The production page already rejected search parameters and called loadAppOrganizerPublicRouteViewModel, while its loader handled public catalogue codes, unknown slugs, controlled service states, language, and aggregate privacy. The 30-line shared model file nevertheless retained getOrbitOrganizerPublicViewModel, which read getOrbitLandingViewModel, silently fell back to the first event, and generated an organizer aggregate. Only orbit-hybrid-route-view-models.test.ts called it. After repair, the file exports only OrbitOrganizerPublicViewModel, the legacy invocation is removed, and the focused route regression rejects both old symbols from returning.",
    evidence:
      "GitNexus reported LOW upstream impact for getOrbitOrganizerPublicViewModel with one direct test-file caller and zero production execution flows. Focused Organizer and hybrid-route tests passed 9/9, repository lint passed, the complete Web suite passed 1352/1352, and production build passed; commit 9a6bc1ca. Required staged detection returned No changes detected for the three-file deletion-heavy diff, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the legacy Organizer hybrid constructor while preserving the public loader, aggregate privacy, and shared UI type contract; authenticated organizer administration remains a separate product boundary",
  },
  {
    id: "web-profile-legacy-hybrid-model-retirement-2026-07-29",
    target:
      "Retired Web Profile hybrid-data constructor → type-only editor contract backed by actor-scoped Profile composition",
    testData:
      "Repository imports and symbol references for getOrbitProfileViewModel and its unique helper; real /app/profile page, actor-scoped loader, adapter, editor, save/readback checks, extraction APIs, and the hybrid-route self-validation test",
    expected:
      "The Profile UI contract must be populated only by the authenticated Profile loader and adapter. Its shared model file may retain editor types, but it must not synthesize biography, company, industries, tags, goals, or topics from the global hybrid relationship graph. Writes must continue through the authenticated API and be accepted only after complete readback.",
    actual:
      "The production Profile page already required a session, passed the actor into the live-capable loader, adapted its payload, and used API extraction/save with strict readback. The shared type file still contained a 54-line getOrbitProfileViewModel that read global hybrid contacts, connections, event intents, and account data to manufacture a complete editor model. Only orbit-hybrid-route-view-models.test.ts called it. After repair, the file exports only OrbitProfileView and OrbitProfileViewModel, the test-only invocation is removed, and the focused Profile regression rejects the getter and hybrid-data import from returning.",
    evidence:
      "GitNexus context found no execution process. Upstream impact was LOW for getOrbitProfileViewModel with one direct test-file caller and zero processes; its private unique helper reached only the same dead getter/test chain. Focused Profile and hybrid-route tests passed 12/12, repository lint passed, the complete Web suite passed 1352/1352, and production build passed; commit 9a474af2. Required staged detection returned No changes detected for the three-file deletion-heavy diff, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the legacy Profile hybrid constructor while preserving actor-scoped loading, API writes, strict readback, and the shared editor type contract; authenticated browser save/refresh and two-account UI isolation retain their existing runtime evidence gaps",
  },
  {
    id: "web-party-legacy-hybrid-model-retirement-2026-07-29",
    target:
      "Retired Web Party hybrid-data constructor → type-only UI contract backed by authenticated shared Party composition",
    testData:
      "Repository imports and symbol references for getOrbitPartyViewModel and its five unique helpers; real Party and check-in loaders, route-derived industry filtering, sourced-event empty-people handling, public registered/unregistered access, actor propagation, mock-fixture isolation, and the hybrid-route self-validation test",
    expected:
      "Party pages must obtain event, people, agenda, recommendations, tablemates, and current-user state from the canonical shared loader under the route's actual actor and access rules. The shared model file may retain UI types, but it must not synchronously rebuild Party state from global hybrid data solely for a legacy test.",
    actual:
      "The production Party and check-in pages already used loadAppPartyRouteViewModel and the shared live-capable Party composition path. The shared type file nevertheless retained getOrbitPartyViewModel plus currentEvent, partyAgenda, personFromContact, personFromNetworkPerson, and recommendationPeople. Those functions selected a hybrid event and manufactured the complete Party surface from global account, contact, network, connection, agenda, and recommendation data. Only orbit-hybrid-route-view-models.test.ts called the constructor. After repair, the file exports only OrbitParty UI interfaces, the legacy test invocation is removed, and the focused Party regression rejects both the getter and hybrid-data import from returning.",
    evidence:
      "GitNexus reported LOW upstream impact for all six removed functions and zero affected execution flows; getOrbitPartyViewModel had one direct test caller, while the helpers reached at most three internal/test symbols. Focused Party and hybrid-route tests passed 14/14, repository lint passed, the complete Web suite passed 1352/1352, and production build passed; commit 68fc233f. Required staged detection returned No changes detected for the three-file deletion-heavy diff, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the legacy Party hybrid constructor while preserving authenticated shared Party composition and its type contract; the separate authored Party presentation/content path remains pending an independent boundary review",
  },
  {
    id: "web-party-authored-demo-retirement-2026-07-29",
    target:
      "Retired orphan authored Party demo → one actor- and event-scoped Party data architecture",
    testData:
      "Repository imports and exact GitNexus symbols for buildOrbitParty, pick, personView, PARTY_CONTENT, and all five Party content interfaces; real Party/check-in page source; focused Party loader and access-state scenarios",
    expected:
      "No dormant Party presentation path may replace the authenticated event, attendee, recommendation, agenda, tablemate, current-user, or access-code state with fixed demo identities. The canonical Party loader and shared UI model must remain the only product data path, while localized source-backed fields continue to flow through the existing route composition.",
    actual:
      "orbit-party-presentation.ts documented that it intentionally replaced the route payload with 625 lines of curated trilingual demo content. Its builder returned a fixed demo-event-1, fixed access code, fixed user identity, fixed people, and fixed active phase. Exact repository search found no import or caller; production Party and check-in pages explicitly rejected buildOrbitParty and already used loadAppPartyRouteViewModel. After repair, both the 625-line content file and 92-line presentation file are deleted, and the focused source regression asserts that neither file can return.",
    evidence:
      "GitNexus reported LOW upstream impact and zero execution flows throughout the chain: buildOrbitParty and PARTY_CONTENT had zero callers; pick reached only personView/buildOrbitParty; personView reached only buildOrbitParty; every Party content interface was imported only by the orphan presentation file. Focused Party and hybrid-route tests passed 14/14, repository lint passed, the complete Web suite passed 1352/1352, and production build completed 39/39 static pages; commit bfddbbe5. Required staged detection returned No changes detected for the two-file deletion plus regression assertion, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the orphan authored Party demo while preserving the canonical actor- and event-scoped Party loader; runtime browser Party coverage remains governed by the broader Party audit matrix",
  },
  {
    id: "web-admin-platform-legacy-hybrid-model-retirement-2026-07-29",
    target:
      "Retired Admin/Platform hybrid constructors → type-only UI contracts backed by authenticated Events + Profile composition",
    testData:
      "Repository references and exact GitNexus symbols for getOrbitAdminViewModel, getOrbitPlatformViewModel, adminEvent, adminMembers, adminFeed, phaseForStatus, and themeColors; authenticated Admin/Admin Events/Platform pages; mock success, unconfigured-live failure, public-query isolation, and read-only control checks",
    expected:
      "Admin and Platform pages must compose operator views from the authenticated actor's live-capable Events and Profile boundaries, fail visibly when those sources are unavailable, and avoid unbacked moderation or notification writes. The shared UI model file may retain types, but it must not expose synchronous constructors over global hybrid route data.",
    actual:
      "All three production pages already required a session, forwarded the actor id, ignored public search controls, and called loadAppAdminPlatformRouteViewModel. That loader independently composed Events and Profile state, propagated empty/pending/failure boundaries, and produced read-only Admin/Platform models. The shared type file still retained 183 lines of hybrid imports, helpers, and two constructors that manufactured workspace ownership, events, feeds, members, review queues, and platform statistics. Only orbit-hybrid-route-view-models.test.ts invoked them. After repair, the file exports only the shared interfaces, the legacy test calls are removed, and the focused source regression prohibits both getters and getOrbitHybridRouteData.",
    evidence:
      "GitNexus reported LOW impact and zero affected execution flows for all seven removed symbols. Exact context showed the old hybrid test file as the sole incoming caller for each public getter, while upstream impact did not count that file-level call; internal helpers reached only getOrbitAdminViewModel. Focused Admin/Platform and hybrid-route tests passed 8/8, repository lint passed, the complete Web suite passed 1352/1352, and production build completed 39/39 static pages; commit 21da705d. Required staged detection returned No changes detected for the three-file deletion-heavy diff, so no unsupported staged risk level is claimed.",
    conclusion:
      "pass for source/lint/build/full-suite retirement of the legacy Admin/Platform hybrid constructors while preserving authenticated Events + Profile composition, controlled route states, and read-only operator surfaces",
  },
  {
    id: "web-public-event-catalogue-registration-roster-boundary-2026-07-29",
    target:
      "Public Events/Organizer catalogue → registration-gated server roster access shared by Event detail and Party",
    testData:
      "Approved 13-event catalogue, event_01 with 50 source-backed attendee rows, distinct unregistered and registered actors, persisted registration and cancellation records, unknown event, empty actor, Events list, Event detail, Organizer public, Party, Party graph, and Party check-in source/runtime paths",
    expected:
      "The public catalogue must retain truthful aggregate counts while defaulting to no actor identity, contacts, attendee names, authentication, or RSVP claim. Attendee rows may appear only after the server verifies an active registration for the exact actor and event. Cancellation, another actor, unknown event, or empty actor must fail closed; the registration provider must remain outside client bundles.",
    actual:
      "getOrbitLandingViewModel previously selected the first hybrid account/profile, returned six private contacts, populated attendee names, and marked every event authed and RSVP'd. Current pages each attempted to scrub those unsafe defaults, while an orphan detail helper silently returned the first event for an unknown code. The repaired Landing model is public-safe by construction: account label Orbit, no connections, no names, and false auth/RSVP flags while aggregate counts remain. A separate server route-model module verifies the persisted event registration before attaching attendee rows. Event detail and Party consume that boundary; the fallback helper is removed. An initial attempt to import registration runtime into the shared Landing file failed the production build by pulling PostgreSQL fs/dns/net/tls dependencies into a client consumer, so the final implementation isolates registration in its own server-only dependency direction and adds a source regression.",
    evidence:
      "Fresh GitNexus indexing reported HIGH pre-edit impact: getOrbitLandingViewModel reached 11 upstream symbols and three production processes; eventView reached eight and attendeeViewsFor seven, covering Events list, Event detail, and Organizer public. Focused cross-surface tests passed 45/45. The persisted lifecycle test used eventRegistrationRuntimeService to prove unregistered=null, other actor=null, register→50 attendee rows, cancel→null, with unknown event and empty actor also null. Repository lint passed, the complete Web suite passed 1353/1353, and production build completed 39/39 static pages; commit 3081473c. Required staged detection reported medium risk, nine files, eight symbols, and exactly one expected affected execution flow: AppEventDetailPage → NormalizeOrbitLanguage.",
    conclusion:
      "pass for source, persistence, identity isolation, cross-surface, lint, build, and full-suite verification of the public catalogue roster boundary; browser click-through for all 13 catalogue details remains part of the broader runtime route matrix",
  },
  {
    id: "web-public-event-catalogue-feature-boundary-2026-07-29",
    target:
      "Public event catalogue consumers → one feature-owned aggregate and registration-gated attendee boundary",
    testData:
      "All production imports and calls of getOrbitHybridRouteData; public Events list and API; Event detail; Organizer public; Party and check-in; Agent/Admin cover-photo consumers; approved event evidence, participant counts, persisted registration lifecycle, and public organizer identity",
    expected:
      "Production event surfaces must read public event aggregates through the Events feature boundary rather than importing the whole hybrid fixture graph. Evidence and participant totals must remain source-derived without exposing attendee identity. Attendee rows must remain behind exact actor/event registration verification. Client presentation utilities must not create a dependency from Agent or Admin bundles into server data, and the public API must not select an organizer from the first private account record.",
    actual:
      "The public-safe Landing model still bypassed readPublicEventCatalogue and called getOrbitHybridRouteData directly for events, evidence, counts, and generated time. Its cover-photo helper lived in the same server-data module and was imported by client Agent/Admin components. The public Events API independently opened the local-remote database and exposed the first account name as organizer. After repair, readPublicEventCatalogue owns events, per-event evidence summaries, participant counts, and generated time; a feature-owned readRegisteredCatalogueAttendees boundary owns registration-gated roster access; Landing, Event detail, and Party consume those contracts; the cover helper is presentation-only; and the API exposes the neutral Orbit organizer. Exact repository search finds no production caller of getOrbitHybridRouteData.",
    evidence:
      "GitNexus warned HIGH before editing getOrbitLandingViewModel: eight upstream symbols and three production processes. readPublicEventCatalogue reached seven upstream symbols and one registration flow; eventCoverPhoto reached ten Agent/Admin symbols, while the registered attendee mapper and public API were separately reviewed. Focused cross-surface/API/asset tests passed 50/50, repository lint passed, the complete Web suite passed 1353/1353, and production build completed 39/39 static pages; commit 8625f4e5. Required staged detection reported HIGH for 10 changed symbols and six existing public event catalogue/registration execution flows, all within the reviewed Events list and registration boundary.",
    conclusion:
      "pass for source-boundary, privacy, persisted-registration, client-bundle, API, lint, build, and full-suite verification; the remaining orbit-hybrid-route-data pure helper module is a separate retirement/refactoring review",
  },
  {
    id: "web-hybrid-route-data-module-retirement-2026-07-29",
    target:
      "Retired hybrid route data module → data-free event view helpers and canonical feature/shared imports",
    testData:
      "All 31 constants, types, interfaces, and functions in orbit-hybrid-route-data.ts; exact incoming callers; Events list, Event detail, registered attendee projection, Party and check-in; custom hybrid public seed; approved 13-event catalogue; persisted registration lifecycle; source imports and production build graph",
    expected:
      "No dormant module may expose a global first-account/profile/contact/event graph to route code after production consumers have migrated to actor- and feature-scoped boundaries. Pure event view behavior still used by product surfaces must retain its output under a data-free presentation dependency. Canonical event codes and stable hashes must be imported from their feature/shared owners, and a regression must prevent the hybrid data module or server/mock dependencies from returning.",
    actual:
      "After P1-082, getOrbitHybridRouteData had no caller or execution flow, but the 349-line module remained because Landing, registered attendee projection, and Party imported six pure helpers from it. The same file still exported the unused first-account/profile fallback aggregate plus attendee, evidence, network, contact inference, sorting, pass-code, gradient, and time helpers. The six live functions were moved without algorithm changes to orbit-event-view-helpers.ts; Landing now imports eventCodeFor and hashString directly from their canonical owners; all three callers use the data-free helper module; and orbit-hybrid-route-data.ts was deleted. Source regression proves the retired file is absent and the replacement cannot import local-remote storage, shared mock fixtures, or getOrbitHybridRouteData.",
    evidence:
      "Fresh GitNexus indexing covered 28,331 nodes, 60,144 edges, and 300 flows. Pre-edit impact including tests was HIGH for the live presentation chain: initialFor reached 10 upstream symbols/three flows, eventStatusFor 13/three, eventThemeFor eight/three, eventIndustryFor 10/three, and eventTagsFor eight/three. OrbitHybridRouteData was MEDIUM with 34 upstream symbols but zero production processes; getOrbitHybridRouteData and nearly every obsolete aggregate/contact helper were LOW with zero callers or flows. Focused cross-surface tests passed 50/50, lint passed, the complete Web suite passed 1353/1353, and production build completed 39/39 static pages; commit 1893c5f2. Required staged detection returned No changes detected for the add/delete/import-only refactor, so the known movement/deletion blind spot is recorded instead of assigning an unsupported staged risk.",
    conclusion:
      "pass for source, dependency-boundary, public-seed privacy, persisted-registration, Party/Event behavior, lint, build, and full-suite retirement of the global hybrid route data module",
  },
  {
    id: "web-private-events-actor-recommendation-isolation-2026-07-29",
    target:
      "Authenticated Home, Home Events, Event Detail, and Admin → actor-scoped event recommendations with optional readiness",
    testData:
      "A newly registered live account with one actor-owned Runtime Evidence Forum event and no attendee, registration, match, check-in, capacity, or goal-readiness records; existing foreign recommendation/readiness records; injected cross-event mock payloads; desktop browser runtime",
    expected:
      "A private Events composition may only select value recommendations for event ids returned by the authenticated actor's event list. Attendee recommendations and readiness must match the selected actor-owned event id. Missing, empty, pending, failed, or foreign optional capabilities must remain unavailable without hiding the actor's valid event or borrowing data from another event/account.",
    actual:
      "Before repair, the Events list was actor-scoped but both recommendation services were global. The first global value recommendation became primaryEventId; attendee/readiness were fetched for that foreign id; successViewModel then failed to find it in the actor list and silently paired the foreign recommendation and readiness score with the actor's first event. The fresh account therefore saw a stranger in Admin and readiness score 87 on its new event despite having no corresponding records. Live private recommendation factories now receive the authenticated actor id; value recommendations are intersected with actor event ids; attendee and readiness payloads must identify the selected actor event; and unavailable optional data produces null panels plus the explicit Event Detail copy Readiness unavailable. A cross-event regression injects foreign value, attendee, and readiness payloads and proves none survives while the actor event remains visible.",
    evidence:
      "Fresh GitNexus indexing covered 28,307 nodes, 60,108 edges, and 300 flows. Pre-edit impact warned HIGH: loadAppEventsRouteViewModel reached 12 upstream symbols with six direct callers and three page processes; successViewModel reached 13; eventChoiceViewModel/readinessViewModel each reached eight; createAppEventsRouteServices reached 13. Focused Events tests passed 11/11, lint passed, the complete Web suite passed 1354/1354, and production build completed 39/39 static pages; commit 195cbe0d. Browser readback on the same live account showed only Runtime Evidence Forum, zero attendees, no match candidate, and Readiness unavailable. Required staged detection reported medium risk for four files, 15 symbols, and four reviewed Home service-resolution flows.",
    conclusion:
      "pass for actor/event identity intersection, foreign-payload rejection, optional-capability degradation, live browser readback, lint, build, and full-suite verification; no attendee, readiness, registration, capacity, or matching record was invented",
  },
  {
    id: "web-admin-platform-truth-boundary-2026-07-29",
    target:
      "Authenticated Admin and Platform → actor-scoped source records without fabricated operational or platform-wide state",
    testData:
      "The same fresh live account, one actor-owned event, one persisted profile, no registration/check-in/match/capacity/team/moderation/platform-role records, unconfigured platform-wide provider, desktop and 390x844 browser runtime",
    expected:
      "Organizer Admin may summarize only fields actually returned by actor-scoped Event and Profile sources. It must not derive registrations, capacity, check-ins, matches, team membership, live activity, or email addresses from unrelated evidence, status, names, or recommendations. Platform must not present personal workspace data as platform-wide organizer accounts, users, verification, or moderation; without a platform provider and persisted platform-admin role it must fail closed before reading personal workspace data.",
    actual:
      "Before repair, Admin turned evidence.length into registrations, added 20 as capacity, inferred check-ins from event dates, inferred matches from the foreign recommendation, generated an @orbit.local email from the profile name, labeled event rows as LIVE activity, and rendered a registration funnel. Platform converted the same personal profile and event into one verified organizer, one platform user, and a pending moderation record although no platform provider or role existed. Admin now exposes only event record totals and date-derived upcoming/active/ended counts, real event title/time/venue/status/summary, and the source profile's actual email. The UI explicitly withholds unsupported operational metrics. The synthetic Platform success model/component and platform-wide interfaces were deleted; /app/platform returns PLATFORM_ADMIN_PROVIDER_UNAVAILABLE with provider-unavailable and role-unverified evidence before Events/Profile reads.",
    evidence:
      "Every pre-edit GitNexus impact was LOW: the loader had three direct page callers; Admin mapping helpers reached at most seven upstream symbols; Admin UI functions reached at most three; shared interfaces reached nine; OrbitRealPlatform had one direct caller and zero processes. Focused Admin/Platform tests passed 6/6, lint passed, the complete Web suite passed 1354/1354, and production build completed 39/39 static pages; commit e8d8df38. Desktop browser readback showed exactly one actor event, truthful lifecycle counts, the persisted profile email, and the explicit data boundary; Platform showed only its unavailable state. At 390x844 both pages had scrollWidth 390, Platform recovery links measured 44px high, and the retired registration funnel text was absent. Required staged detection reported LOW for five detected files, 19 symbols, and zero execution flows; the commit contained six files because the removed Platform component was deletion-only.",
    conclusion:
      "pass for actor-scoped Admin truthfulness, actual-profile identity, unsupported-metric removal, Platform provider/role fail-closed behavior, desktop/mobile runtime, lint, build, and full-suite verification; platform moderation and organizer-role workflows remain unavailable rather than simulated",
  },
  {
    id: "web-admin-navigation-capability-truth-2026-07-29",
    target:
      "Organizer Admin entry and desktop/mobile navigation → only implemented actor-scoped destinations",
    testData:
      "Authenticated live Admin with one actor event; public /app/login-admin compatibility entry; desktop navigation DOM; current actor-scoped Admin capability boundary",
    expected:
      "Every Admin navigation label must lead to a distinct implemented surface matching its visible promise. Missing access-management or event-configuration providers must not be represented by buttons that silently return to Dashboard or Events. The public Admin entry must describe the same read-only source-record capability that appears after authentication.",
    actual:
      "The Admin sidebar exposed Access and Event setup even though their hrefs were /app/admin and /app/admin/events, so clicking them produced unrelated existing pages with no access or setup behavior. The shared login component also promised registration, check-in, and on-site matching, and retained an unused Platform branch after Platform was made unavailable. The navigation now contains only Dashboard and Events on desktop and mobile. The login entry is organizer-only, targets /app/admin through the secure sign-in flow, and explicitly describes actor-scoped Event/Profile reads while naming registration, attendance, capacity, matching, and team data as unavailable until providers exist.",
    evidence:
      "GitNexus pre-edit impact was LOW: buildHostNav reached five upstream nodes, OrbitRealAdminLogin had two direct page callers, and neither reached an indexed process. Focused Admin/Platform tests passed 6/6, lint passed, the complete Web suite passed 1354/1354, and production build completed 39/39 static pages; commit 048db81b. Browser DOM readback showed exactly two Admin navigation controls, 仪表盘 and 活动管理, and /app/login-admin linked secure sign-in to /app/admin with the corrected capability boundary. Required staged detection reported LOW for two files, one symbol, and zero execution flows.",
    conclusion:
      "pass for destination/label alignment, unsupported-capability removal, secure-login target, browser readback, lint, build, and full-suite verification; access management, event configuration, and platform administration remain unavailable rather than misrouted",
  },
  {
    id: "full-product-route-ui-export-reachability-2026-07-29",
    target:
      "All Web and Expo route UI inventories → exact imported exports, local declarations, and re-exports",
    testData:
      "All 94 route entry files; named/default/namespace imports; local component/helper references; re-export boundaries; co-located Admin, Party, Contacts, reference primitive, and shared primitive modules; generated interaction, visible-content, and overlay inventories",
    expected:
      "A route may inherit UI only from the exact export it imports and declarations that export references. Sibling components in the same file must not become route-reachable merely because the file is imported. File-level traversal may remain broader only for dependency, persistence, provider, and state-capability signals.",
    actual:
      "The previous scanner recursively collected imported files and then parsed every declaration in each file. That assigned IconButton to routes importing only Icon, PrimaryAction and SecondaryAction to routes importing only Chip, every co-located Admin presenter to all four Admin entries, and most Party/Contacts sibling-route controls and overlays to each other. The scanner now resolves default, named, namespace, and re-export bindings; traverses referenced local declarations; and scopes interactions, visible content, and overlays to those statements. The Admin surfaces were also split into login, shell, dashboard, and events owners. The regenerated denominator contains 2326 route-reachable interactions instead of 2834 and 29 overlay route instances instead of 49; real file-level data signals are unchanged.",
    evidence:
      "GitNexus reported LOW impact with zero indexed flows for buildFullProductFunctionalAuditInventory, collectInteractions, collectVisibleContent, collectOverlays, and both audit arrays. The symbol-scope regression proves Admin login has only its secure sign-in link, Admin routes do not inherit IconButton or sibling primitive actions, and their reachable StateView failure controls remain. All eight audit tests passed. Admin-focused tests passed 19/19, lint passed, the complete Web suite passed 1355/1355, and production build completed 39/39. Browser DOM verified all four Admin entries; commits c34f54ef and c113dc86. Both staged detections were LOW.",
    conclusion:
      "pass for imported-export, local-declaration, namespace, re-export, interaction, visible-content, overlay, Admin runtime, audit, lint, build, and full-suite reachability verification",
  },
  {
    id: "expo-manual-contact-write-idempotency-2026-07-29",
    target:
      "Expo /contacts/new manual source → actor-scoped contact write → contact detail and list readback",
    testData:
      "Authenticated live Expo Web actor; zero initial contacts; two pre-fix legacy manual drafts; one distinct source-backed audit contact; repeated identical submission before and after confirmation; production Next server with explicit Expo CORS origin",
    expected:
      "Repeating the same actor/source input must converge on one stable draft. Confirmation must either persist one actor-owned contact with evidence or fail visibly while leaving the draft pending. A successful response must expose the real contact id, open its detail, survive reload, appear exactly once in Contacts, and remain single after replay.",
    actual:
      "The pre-fix runtime created two identical pending drafts and confirmation merely changed one draft to confirmed while Contacts remained zero. After repair, the first distinct submission increased the draft queue from two to three; two further identical submissions left it at three. Confirmation displayed 联系人已写入 and 打开联系人, opened the exact manual-contact detail, and the detail survived hard reload. Contacts then showed exactly one record. Replaying the identical confirmed input returned the same written state, left the draft queue at three, and left Contacts at one.",
    evidence:
      "Server focused 17/17; Expo focused 38/38; Web full 1360/1360; Expo full 527/527; Web lint/typecheck; Expo typecheck; production build 39/39; in-app browser click-through from /contacts/new to /contacts/[id] and /contacts/list; commits 31ebdeab and 0c414649.",
    conclusion:
      "pass for stable actor-scoped draft/contact identity, duplicate guard, explicit confirmation write, persisted detail/list readback, hard reload, replay idempotency, truthful mobile copy, and direct navigation; the two pre-fix legacy drafts are retained as audit evidence and did not create contacts",
  },
  {
    id: "expo-qr-relationship-write-idempotency-2026-07-29",
    target:
      "Expo /contacts/new Orbit QR source → actor-scoped draft → contact, connection, evidence, detail, list, and graph readback",
    testData:
      "Authenticated live Expo Web actor; operator-supplied orbit-qr payload with distinct name, role, organization, email, event, mutual contact, and topics; repeated scan before confirmation; queue confirmation; hard detail reload; Contacts library; relationship graph; post-confirmation replay",
    expected:
      "The live service must parse the submitted QR text rather than select an unrelated stored contact. Scan must stage one stable actor-owned draft without contact or connection writes. Explicit confirmation must persist one stable contact, one stable connection, and source/confirmation evidence; retries, partial failures, duplicates, and cross-account access must fail or recover without duplicate records. Expo must disclose that the unsigned payload is not signature-validated and expose the real saved contact.",
    actual:
      "Before repair, the valid QR text was ignored and the UI returned a generic 待确认联系人 derived from whichever existing qr_scan contact appeared first; confirmation returned candidates with both write flags false and persisted no draft, contact, connection, or evidence. After repair, the submitted fields appeared exactly in the pending card, the queue increased from three to four, and an identical scan kept it at four. Queue confirmation displayed 联系人已写入 and 打开联系人, opened contact:qr:8534f1acf38423d4eab2c584, survived hard reload, appeared in the Contacts library, and produced a graph card with 1 段连接. Replaying the confirmed payload returned the same confirmed/open-contact state and kept the queue at four.",
    evidence:
      "QR service/mock tests passed 14/14; manual/QR mobile view-model tests passed 23/23; Web lint/typecheck passed; Expo typecheck passed; complete Web suite passed 1364/1364; complete Expo suite passed 529/529; production build completed 39/39 static pages. In-app browser verified pending truth copy, unsigned-payload disclosure, stable queue count, confirmation write, exact detail URL, hard reload, Contacts library readback, graph connection readback, and post-confirmation replay. Commits 2f47e28c and f3416d6b. Required staged detection was LOW for the 12-file server change and MEDIUM for the four-file mobile truth-copy change, with only the reviewed ContactAcquisitionScreen flows affected.",
    conclusion:
      "pass for submitted-input fidelity, actor isolation, stable draft/contact/connection identity, duplicate guard, partial-write retry, explicit confirmation, evidence persistence, detail/list/graph readback, hard reload, replay idempotency, unsigned-input disclosure, lint, build, and full Web/Expo suites; camera decoding and cryptographic signature validation remain explicitly unclaimed",
  },
  {
    id: "expo-contact-detail-evidence-key-deduplication-2026-07-29",
    target:
      "Expo contact detail relationship-value evidence → unique localized rows and stable React reconciliation",
    testData:
      "The persisted QR contact above; two different evidence ids that localize to the same 业务背景 line; relationship-value card; hard-loaded Expo Web contact detail",
    expected:
      "Distinct backend evidence records may share a user-facing localized sentence, but the view-model must not emit duplicate display rows or give React siblings the same key. Equivalent lines should be collapsed before the three-row presentation limit without changing the underlying stored evidence.",
    actual:
      "The persisted QR contact detail rendered the same localized business-context sentence twice and surfaced the React warning Encountered two children with the same key. readyEvidence sliced raw records before localization and returned duplicate strings, while the component used each string as its key. The repaired view-model localizes all candidate rows, deduplicates the final strings, and then applies the three-row limit. Browser readback retained the contact and relationship analysis, showed one equivalent business-context row, and no longer exposed the warning.",
    evidence:
      "GitNexus impact was LOW: readyEvidence reached four upstream symbols and zero indexed processes. Focused relationship-value tests passed 3/3, Expo typecheck passed, and the complete Expo suite passed 529/529. Browser reproduction and post-fix reload used the same persisted contact and proved duplicateKeyWarning changed from true to false while the equivalent businessEvidenceCount changed to one. Commit 900c1058; required staged detection was LOW for two files, two symbols, and zero flows.",
    conclusion:
      "pass for final-presentation deduplication, stable React keys, retained relationship-value evidence, focused/full Expo regression, typecheck, and live browser reload; backend evidence records remain intact and independently auditable",
  },
  {
    id: "web-agent-first-chat-action-lifecycle-2026-07-29",
    target:
      "Authenticated Web /app/agent with no chat conversations → first prompt → deferred action → conversation reload → confirmation → Today task readback",
    testData:
      "Authenticated live audit actor whose actor-scoped Chat list was empty; prompt 下周三提醒我联系 Maya，先生成待办，执行前让我确认。; action action:natural-language:fac2493f; due date 2026-08-05; exact production build",
    expected:
      "A new actor must be able to reach the Agent composer without imported conversations or fabricated people/events. The prompt may stage an internal follow-up task but must not write before confirmation. Later must persist across reload, confirmation must execute exactly once, and the resulting task must be visible from the actor's Today data on its due date. Missing conversation ids and provider/storage failures must remain fail-closed.",
    actual:
      "Before repair, /app/agent rendered No chat context is ready and exposed no composer or Agent action controls. The shared empty-state loader also queried demo-conversation-1 against the live actor store, polluting a legitimate empty list with CHAT_CONVERSATION_NOT_FOUND. After repair, the same account rendered a starter model with zero people, events, and history plus three generic prompts. The real prompt completed a 7/7 run and staged one create_followup_task action without writing. 稍后处理 changed it to deferred; a hard reload followed by reopening the persisted conversation retained that state. 确认执行 changed the action to 已完成. Today showed the same action under 最近完成 and, at 2026-08-05, rendered a 14:59 arrangement whose task text was 联系 Maya.",
    evidence:
      "Focused Agent/Chat tests passed 30/30; repository lint/typecheck passed; the complete Web suite passed 1366/1366; production build completed 39/39 static pages. In-app browser traversal covered the initial blocked state, repaired empty-actor welcome, real prompt, 7/7 progress, awaiting confirmation, defer, hard reload/history reopen, confirm, action completion, Today action readback, and due-date task readback. Commit 7379d840. GitNexus could not resolve the edited TSX/adapter symbols and staged detection returned No changes detected, so no unsupported graph risk is claimed.",
    conclusion:
      "pass for empty-actor entry, no-fixture starter data, real natural-language proposal, no-write-before-confirmation, deferred persistence, conversation reload, explicit confirmation, outbox completion, Today action/task readback, focused/full tests, lint, and build; second-actor isolation, responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-ignore-action-today-terminal-activity-2026-07-29",
    target:
      "Authenticated Web /app/agent natural-language task and reminder proposals → ignore → reload → Today terminal-activity and no-write readback",
    testData:
      "Same authenticated live audit actor; prompt 8月12日提醒我联系 Ignore Audit Person，先创建待办并等我确认。; one create_followup_task proposal plus one create_reminder proposal; due date 2026-08-12; exact production build",
    expected:
      "Ignoring each proposed operation must persist a rejected terminal ledger state without executing a task or reminder write. Reloading and reopening the conversation must retain that state. Today may expose the terminal audit record, but it must describe the section as recent activity rather than completed work, localize the canonical action titles and statuses coherently, and show no resulting arrangement on the requested date.",
    actual:
      "The run staged two awaiting-confirmation operations. Clicking 忽略 on both changed both cards to 已忽略; a hard reload and conversation-history reopen retained both rejected states. Today initially counted the rejected audit records under 最近完成, which was semantically false even though the records correctly remained visible. The repaired presentation calls the terminal section 最近动态 / Recent activity / 最近の動き and maps the canonical task/reminder titles plus ledger statuses explicitly. On 2026-08-12 Today still rendered 这一天暂无安排 and contained no Ignore Audit Person, proving neither ignored proposal executed.",
    evidence:
      "Focused Today/Agent/All Actions tests passed 51/51; repository lint/typecheck passed; the complete Web suite passed 1368/1368; production build completed 39/39 static pages. In-app browser verified both ignore transitions, hard-reload persistence, the empty 2026-08-12 schedule, absent target name, coherent English Recent activity / Create follow-up task / Create reminder / Ignored, and coherent Chinese 最近动态 / 创建跟进任务 / 创建提醒 / 已忽略. Commit 39d9bf87. Pre-edit impact was LOW for DecisionEntryCard, OrbitRealToday, and AppTodayPageContent, while the shared SECTION_TITLES index result was corrupt/CRITICAL and was deliberately not edited. Staged detection reported HIGH because AppTodayPageContent participates in nine reviewed Today loading flows.",
    conclusion:
      "pass for two-operation ignore, no-write, rejected-state persistence, hard reload/history reopen, terminal-section semantics, canonical action/status localization, focused/full tests, lint, build, and English/Chinese browser readback; broader Today arrangement prose still has mixed-language prototype localization and remains open, while second-actor isolation, responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-cancel-run-no-write-2026-07-29",
    target:
      "Authenticated Web /app/agent multi-operation proposal → cancel run → reload/history reopen → two-date Today no-write readback",
    testData:
      "Same authenticated live audit actor; prompt 8月20日提醒我联系 Cancel Audit Person，先创建待办和提醒，等我确认。; one create_followup_task proposal due 2026-08-19 plus one create_reminder proposal scheduled 2026-08-20; exact production build",
    expected:
      "Canceling a run that has only awaiting-confirmation operations must atomically move every remaining operation to canceled, remove confirmation controls, survive hard reload and history reopen, and execute no task or reminder write on either relevant date.",
    actual:
      "The prompt completed a 7/7 run and staged two awaiting-confirmation operations. 取消 Run changed both cards to 已取消 and removed the run-cancel and per-operation confirmation controls. A hard reload returned to the Agent starter, and reopening the persisted conversation restored both canceled cards with no actionable controls. Today on both 2026-08-19 and 2026-08-20 rendered 这一天暂无安排 and contained no Cancel Audit Person.",
    evidence:
      "The exact source baseline had already passed the complete Web suite at 1368/1368, repository lint/typecheck, and a 39/39 production build. In-app browser traversal covered the real prompt, two-operation proposal, run-level cancel, immediate terminal rendering, hard reload, persisted history reopen, control removal, and task/reminder no-write checks on both dates. No source defect or code change was found.",
    conclusion:
      "pass for multi-operation run cancellation, atomic terminal state, confirmation-control removal, hard reload/history persistence, task no-write, reminder no-write, and two-date Today readback; second-actor isolation, responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-failed-request-replay-2026-07-29",
    target:
      "Authenticated Web /app/agent persisted failed run and no-run network failure → request replay → completed run → hard reload/history readback",
    testData:
      "Authenticated live actor user_ms5llhof_wrbpuq; read-only prompt 请确认这是 Retry Audit 20260729，只回复一句说明，不要创建任务、提醒或任何写入。; formal live AgentRuntimeService failure seed RETRY_AUDIT_PROVIDER_TIMEOUT; old run run:conversation:9c22fbc8-55d6-4c88-a5db-532c0058726a; new run run:conversation:aa176da4-fcb7-4d1b-8d68-332d87817637; exact production build",
    expected:
      "A failed run must keep its error and completed-step evidence. Recovery must not claim to resume an execution step unless a real step executor exists. The UI must replay the nearest preceding user request as a new run, disable duplicate recovery while pending, preserve the failed run for audit, create no write action for this read-only request, and retain both attempts after reload. Network or provider failures that return no run id must expose the same retry affordance and persist its original request.",
    actual:
      "Code tracing found no production caller that writes a real failed step and no worker that consumes the queued step produced by runtime.retryRun. The public transition endpoint merely changed failed → running and failed step → queued, after which the card would poll forever. The repair removed that public/in-memory fake transition and labels recovery 重新提交请求 / Retry request. A formal live runtime seed added one failed provider step to a real persisted conversation. The browser showed 6/7, 86%, the exact timeout error, and the recovery control. Clicking it replayed the original prompt verbatim and rendered a second 6/6 completed run. Store readback retained the old run as failed with one failed step and the new run as completed with six steps and zero actions. A completion audit then found ordinary conversation failures had no run id and therefore no control; a second repair persists retryRequest on the assistant failure message and renders a message-level recovery button. With the production server deliberately stopped, a real fetch failure displayed the button; after restart it replayed the exact Network Retry Audit prompt, disabled during processing, completed 6/6 with no write request, and survived hard reload/history reopen.",
    evidence:
      "Focused Agent/runtime tests passed 30/30 and focused history/action tests passed 23/23; repository lint/typecheck passed; the complete Web suite passed 1371/1371; production build completed 39/39 static pages. Browser and live-store evidence covered the authenticated account, real read-only conversation, formal failed-step seed, exact error rendering, one-click request replay, distinct run ids, old/new run statuses, zero actions, deliberate server outage, message-level recovery, disabled pending state, hard reload, and persisted history reopen. Commits 6f4583f1 and ca575f31. Exact retryRun impact was LOW, but Agent TSX types were corrupted in the GitNexus index: the first staged detection reported CRITICAL with hundreds of unrelated mobile/event/storage flows while omitting the runtime/API symbols; the second scoped message-recovery change detected LOW with zero affected flows.",
    conclusion:
      "pass for truthful failed-run and no-run network recovery, original-request selection, new-run identity, immutable failure evidence, pending disablement, zero-write replay, store readback, hard reload/history persistence, focused/full tests, lint, and build; direct provider-failure injection remains separately unverified, while second-actor isolation, responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-confirm-undo-idempotency-2026-07-29",
    target:
      "Authenticated Web Agent confirmation → live outbox execution → Today and All Actions readback → compensation → reload/history persistence",
    testData:
      "Live actor user_ms5llhof_wrbpuq; prompt 请创建一个9月3日到期的跟进任务：联系 Undo Audit Person，执行前等我确认，不要创建提醒。; run run:natural-language:05879e7b; action action:natural-language:a34dc77e; one create_followup_task operation due 2026-09-03T23:59:59.000Z",
    expected:
      "Confirmation must execute the selected operation exactly once even under a repeated gesture. Undo must compensate only operations that have a completed execution receipt, never an unselected or failed sibling operation. Repeated undo must converge on one compensation receipt. The action state and task existence must remain consistent across Agent, Today, All Actions, live storage, and hard reload.",
    actual:
      "The real prompt completed 7/7 and staged exactly one task action with no reminder. A double click on 确认执行 produced one completed action, one completed outbox item, one execution receipt, and one follow-up task. Today on 2026-09-03 showed one 23:59 arrangement named 联系 Undo Audit Person, while All Actions exposed the matching executor, evidence, payload hash, and idempotency key. A double click on 撤销 changed the entry to 已撤销 and removed the task. Two additional formal undoAction calls both returned undone without a second compensation receipt. Hard reload retained the undone ledger entry, Agent history reopened with 已撤销, and Today showed 0 场 plus 这一天暂无安排.",
    evidence:
      "Focused Agent/runtime/ledger tests passed 41/41; repository lint and the 39/39 production build had passed on the production change; the complete Web suite passed 1372/1372. In-app browser traversal exercised the real composer, repeated confirmation, Agent card, Today due-date readback, exact All Actions entry, repeated undo, hard reload, conversation-history reopen, and final empty due date. Live AgentRuntimeService readback proved one outbox item, one completed execution receipt, one undo receipt, and stable undone responses. Commit 7bf79467 fixed compensation scope; eba21635 hardened an unrelated formatting-sensitive source assertion exposed by the full gate. GitNexus staged detection was LOW for two files, five symbols, and zero affected processes.",
    conclusion:
      "pass for explicit confirmation, repeated-confirm idempotency, selected-operation execution, truthful cross-surface readback, completed-receipt compensation scope, repeated-undo idempotency, persisted undone state, task removal, hard reload, focused/full tests, lint, and build; responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-action-second-actor-isolation-2026-07-29",
    target:
      "First actor Agent Run/action/task lifecycle → independently authenticated second actor Agent history, All Actions, Today, and live runtime boundary",
    testData:
      "First actor user_ms5llhof_wrbpuq with run run:natural-language:05879e7b and undone action action:natural-language:a34dc77e; independent second actor user_ms2on5yh_60z90f / surface-contacts-1785123834639@example.invalid; due date 2026-09-03; exact production build",
    expected:
      "A second authenticated actor must not see the first actor's conversation prompt, Run id, action id, ledger entry, execution/undo receipts, outbox state, or due-date task. Runtime lookup of the foreign Run must return no detail and listing actions must remain actor-scoped. Reading the second actor must not mutate the first actor's terminal audit evidence.",
    actual:
      "The independent browser session identified the second account through the account menu. Its Agent history contained no first-actor prompt, Undo Audit Person label, or foreign Run id. All Actions rendered the explicit empty ledger, and Today on 2026-09-03 rendered 0 场 plus 这一天暂无安排 without the first action id or task title. The configured auth provider resolved the second actor id, after which its formal live AgentRuntimeService returned null for the first Run, zero actions, and no first action. A final first-actor readback still returned the completed Run, undone action, two receipts, and one outbox item.",
    evidence:
      "Independent authenticated Chrome traversal covered the account identity menu, Agent history, All Actions empty state, and exact Today due date. Formal configured auth-user and Agent runtime services resolved actor user_ms2on5yh_60z90f, rejected the foreign Run as null, and returned zero actions; a separate first-actor readback proved its terminal records remained unchanged. The same source baseline passed focused tests 41/41, full Web 1372/1372, lint, and the 39/39 production build. No source defect or code change was found.",
    conclusion:
      "pass for independent-session identity, conversation/Run/action/ledger/task isolation, foreign-Run no-read, zero-action listing, due-date absence, and first-actor non-mutation; additional workspace membership roles, concurrent cross-account writes, responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-partial-failure-retry-compensation-2026-07-29",
    target:
      "Authenticated All Actions partial failure → explicit retry → live outbox execution → two-date Today readback → multi-operation compensation",
    testData:
      "Actor user_ms5llhof_wrbpuq; run run:audit-partial-retry:20260729; action action:audit-partial-retry:20260729; one completed create_followup_task for 2026-09-04 and one dead-letter create_followup_task for 2026-09-05; formal failed receipt AUDIT_TRANSIENT_FAILURE before explicit retry",
    expected:
      "A partial failure must distinguish the completed and failed operations in the ledger. Explicit retry must execute only retryable outbox events and must not wait indefinitely for an unrelated worker. Failed receipts must remain audit evidence but must not fence a legitimate retry. Each operation must converge on one completed receipt and one domain record. Compensation must remove only completed writes and remain fenced if a worker crashes after saving an undone receipt but before saving action status.",
    actual:
      "Before retry, All Actions rendered one successful and one failed operation plus 重试失败项 and 撤销. Today showed only 联系 Partial Retry Success One on 2026-09-04 and zero arrangements on 2026-09-05. The production route initially only processed outbox after confirm, so retry would reset the dead letter to pending and reload without execution; the repaired policy processes both confirm and retry transitions. Clicking 重试失败项 changed the entry directly to 已完成, removed the retry control, and changed the second operation to success. Today then showed exactly one task on each date. Live readback retained one failed receipt and produced exactly one completed receipt per operation with both outbox events completed at attempt 1. Final undo changed both operations to 已撤销, produced two undo receipts, and returned both dates to 0 场. A separate crash-window regression proved a pre-existing undone receipt prevents a second compensation even while action status is still completed.",
    evidence:
      "Focused partial-failure, route, ledger, and repository tests passed 37/37 and 14/14; lint passed; production build completed 39/39; complete Web passed 1375/1375. In-app browser covered the initial partial-failure ledger, retry control, authoritative reload, exact operation statuses, two dates before/after retry, final undo, and two empty dates after cleanup. Live AgentRuntimeService/repository readback proved two completed outbox events, one failed receipt retained, one completed receipt per operation, and two undo receipts. Commits 1dd7b4b6 and 014d0c15. The exact transition route and both receipt repository implementations were LOW impact; staged detection for the repository change was LOW with six symbols and zero processes, while the add/import route change was not detected.",
    conclusion:
      "pass for partial-failure truth, failed-only retry, immediate live outbox execution, successful-operation non-replay, failed-receipt retention, one domain record per operation, two-date UI readback, multi-operation undo, compensation crash fencing, focused/full tests, lint, and build; real external-provider transient recovery, responsive, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-history-lifecycle-2026-07-29",
    target:
      "Authenticated Web /app/agent history selection → pin → explicit rename save/cancel → reload → confirmed deletion → actor-scoped live-store cleanup",
    testData:
      "Live actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; temporary session agent-session-ms5w1kuk-o68abs; prompt 这是 History Lifecycle Audit 20260729，只回复“历史审计会话已创建”，不要创建任务、提醒、消息、联系人或任何外部写入动作。; exact production build",
    expected:
      "History selection must restore the exact actor-owned transcript and bind the URL to its real session id. Pin and rename must update the UI only after durable storage confirms persistence, surface success or failure truthfully, and survive reload. Rename must expose explicit save and cancel controls. Delete must require an accessible irreversible-action confirmation, preserve the session when canceled, delete the exact actor-owned session when confirmed, clear an active transcript, survive reload, and never expose the session to another actor. Unconfigured production storage must fail closed rather than return a false success.",
    actual:
      "The initial API contract returned success=true with persisted=false when live history storage was absent, while the client treated any success envelope as persistence, optimistically changed pin/name/delete state, ignored failures, and deleted without confirmation. The repaired write and delete APIs return SERVICE_UNAVAILABLE/503 when storage is unconfigured. The client requires data.storage.persisted=true, serializes history mutations, updates local state only after persistence, and renders an error while retaining the prior state on failure. The real browser created one two-message read-only session, switched to another conversation, selected the session back through history, and restored its prompt/reply at the exact session URL. Pin rendered 对话已置顶 and survived reload as 取消置顶. Explicit save persisted History Lifecycle Audit 20260729 and survived reload; explicit cancel discarded SHOULD NOT PERSIST 20260729 and retained the original name after reload. Delete opened an alertdialog with permanent-loss copy. 保留对话 left the session and transcript intact. Confirmed deletion returned to the fresh Agent home, removed the row/transcript, and remained absent after reload.",
    evidence:
      "Focused history/API tests passed 14/14 before the explicit-control adjustment and the final history suite passed 11/11. The complete Web suite passed 1376/1376, repository lint/typecheck passed, and production build completed 39/39 static pages. In-app browser traversal covered the formal composer, generated reply, real session id, cross-session selection, pin success, rename field/save/cancel, two reloads, delete dialog, cancel, confirm, active-session clearing, and post-delete reload. Configured live-provider readback returned the pinned custom title and two messages for actor A while actor B returned null; after cleanup both actors returned null. Commits b30e1348, faa1e10c, and 2ba00267. GitNexus impact was LOW for both API handlers, OrbitRealAgent, AgentHistoryList, persistence helpers, and rename submission; staged detection was LOW.",
    conclusion:
      "pass for actor-scoped selection, exact transcript restore, URL identity, durable pin, durable rename, explicit save/cancel, truthful success gating, fail-closed unconfigured writes, accessible destructive confirmation, cancel no-write, confirmed delete, active-session clearing, reload persistence, second-actor isolation, and final cleanup; mobile selection/New chat/modal behavior is covered by web-agent-mobile-history-navigation-2026-07-29, while mobile pin/rename/delete and screen-reader announcement timing remain separately unverified",
  },
  {
    id: "web-agent-history-navigation-resize-2026-07-29",
    target:
      "Authenticated desktop Web /app/agent selected history → New chat reset and keyboard-operable history separator",
    testData:
      "Live actor user_ms5llhof_wrbpuq with six persisted sessions; selected session agent-session-ms5tz2ay-zx6dfl; production viewport; history width bounds 180–380",
    expected:
      "New chat must clear only the active transcript, panel, composer draft, active session id, and session URL while retaining stored history. A focusable separator must expose orientation and current/min/max values and support keyboard adjustment without requiring pointer input. Layout-only changes must not persist or write domain data.",
    actual:
      "Selecting the Undo Audit session restored its real prompt at the session URL. Clicking desktop 新对话 returned to /app/agent, removed that prompt, restored the welcome workspace and composer, and kept the same six history rows. Source tracing found the focusable separator declared a label and vertical orientation but implemented only pointerdown. The repair adds ArrowLeft/ArrowRight 16-pixel adjustments plus Home/End bounds and aria-valuemin/max/now/text. Browser readback began at 212, moved to 228 with ArrowRight, to 180 with Home, and to 380 with End.",
    evidence:
      "Focused Agent history tests passed 11/11 and production build completed 39/39. In-app browser exercised real session selection, desktop New chat, URL/transcript reset, unchanged history count, separator focus, exact ARIA values, three keyboard transitions, and default restoration on reload. Commit 8d53505d. OrbitRealAgent and startHistorySidebarResize impact were LOW; staged detection was LOW with zero affected processes.",
    conclusion:
      "pass for desktop active-session reset, history preservation, URL reset, composer restoration, separator orientation/value semantics, ArrowLeft/ArrowRight/Home/End contract, layout-only no-write behavior, focused tests, and build; mobile New chat and drawer behavior are covered by web-agent-mobile-history-navigation-2026-07-29, while pointer drag, persisted user width preference, and assistive-technology announcement timing remain separately unverified",
  },
  {
    id: "web-agent-mobile-history-navigation-2026-07-29",
    target:
      "Authenticated 390x844 Web /app/agent top-bar history entry → modal focus contract → real session restore/reload → mobile New chat",
    testData:
      "Live actor user_ms5llhof_wrbpuq with six persisted sessions; selected session agent-session-ms5tz2ay-zx6dfl; production viewport 390x844; exact source prompt containing Undo Audit Person",
    expected:
      "Mobile users must have a visible history entry without exposing desktop-only global extras. The drawer must be a named modal, focus its first control, wrap forward and reverse Tab, close exclusively on Escape, and restore focus. Selecting an actor-owned session must restore its exact URL and transcript through refresh. New chat must clear only active state and preserve all stored history.",
    actual:
      "At 390x844 the Agent history button existed in the DOM but the shared mobile rule hid its orbit-nav-extra parent. Re-enabling the mixed container also surfaced 打开收件箱 because that trigger carried inline display:inline-flex. The final implementation separates mobileRightExtra from the desktop rightExtra/inbox group: Agent renders only 对话历史 in the mobile slot, while the shared extras remain hidden. Production DOM then exposed 对话历史 plus 打开菜单 and no inbox. Clicking it opened dialog 对话历史 with 关闭 focused. Shift+Tab wrapped to the last 更多操作, Tab wrapped back to 关闭, and Escape closed only the drawer and restored focus to 对话历史. Selecting the existing Undo Audit row navigated to ?session=agent-session-ms5tz2ay-zx6dfl and restored the exact prompt plus pending-action explanation; reload retained both. Mobile 新对话 returned to /app/agent, removed the transcript, restored the welcome workspace, and kept the history count at 6 before and after.",
    evidence:
      "In-app production browser at 390x844 exercised the top-bar entry, labelled modal, initial focus, reverse and forward focus wrap, Escape/focus restoration, real row selection, exact session URL/transcript, reload readback, mobile New chat, unchanged six-row count, and final drawer screenshot without horizontal overflow. The same build was sampled on /app/today to prove the new optional slot did not expose an extra action on a default caller. Focused history/top-nav tests passed 29/29, the complete Web suite passed 1381/1381, repository lint/typecheck passed, and production build completed 39/39. Commits 2e4a487b, 183f0052, 880c3b5a, and dbdc13ae. OrbitTopNav impact was HIGH with 18 upstream symbols, two processes, and three modules; AccountTopNav impact was HIGH with 15 upstream symbols, three processes, and three modules. The final staged detection was LOW and contained exactly AccountTopNav and OrbitTopNav with zero affected processes.",
    conclusion:
      "pass for visible mobile entry, desktop-extra separation, hidden inbox, labelled modal, first focus, Shift+Tab/Tab trap, Escape-exclusive close, trigger focus restoration, actor-owned selection, exact URL/transcript, refresh readback, mobile New chat, history preservation, no-domain-write behavior, 390x844 layout, default-caller compatibility, focused tests, lint, and build; mobile pin/rename/delete, physical touch-device behavior, screen-reader announcement timing, and independent manual assistive-technology verification remain separately unverified",
  },
  {
    id: "web-agent-message-copy-feedback-2026-07-29",
    target:
      "Persisted Agent assistant message → clipboard copy → actor-owned Run feedback → reload readback → cleanup",
    testData:
      "Live actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; session agent-session-ms5t5ozq-x2bv2k; run run:conversation:aa176da4-fcb7-4d1b-8d68-332d87817637; exact production build",
    expected:
      "Copy must expose immediate truthful completion without writing domain data. Feedback may only be attached to a Run owned by the authenticated actor, must persist through the configured provider, restore its selected state after reload, remain invisible to another actor, and reject a missing or foreign Run before any feedback write. Audit cleanup must remove the temporary rating.",
    actual:
      "The latest assistant copy control changed from idle to copied and exposed 已复制. Clicking 有帮助 changed only the matching rating control to the selected accent state with no error. The actor-scoped provider returned one helpful record with the exact Run id, while the independent actor returned null. Reload restored the same selected state. Formal provider cleanup removed the record, and a final reload restored the unselected state. Source tracing found that POST originally accepted any syntactically valid runId and upserted it without proving that the Run existed for the authenticated actor; the repaired handler resolves the actor-scoped runtime first, returns 404 for a missing or foreign Run before writing, returns 503 when runtime verification fails, and upserts only an owned Run.",
    evidence:
      "In-app browser exercised the latest message copy control, helpful rating, selected-state reload, cleanup reload, and absence of feedback errors. Configured provider readback proved actor A ownership, actor B absence, persistence, and final cleanup. Focused feedback/API tests passed 7/7, including no-write 404 for missing/foreign Runs, owned-Run success, and runtime-failure 503. The 39/39 production build and repository lint/typecheck passed. Commits 95b85435 and 9e6cccb6; resolveAgentFeedbackRequest and OrbitRealAgent impact were LOW, the new route-adjacent handler was not indexed, and staged detection for the ownership fix was LOW.",
    conclusion:
      "pass for clipboard success state/no-domain-write, helpful feedback persistence, actor-scoped Run ownership, second-actor absence, reload readback, cleanup, missing/foreign-Run no-write, runtime-failure truth, focused tests, lint, and build; the remaining rating/outcome paths are covered by web-agent-evidence-source-disclosure-2026-07-29, while feedback UI failure rendering, mobile width, keyboard, and assistive-technology states remain separately unverified",
  },
  {
    id: "web-agent-evidence-source-disclosure-2026-07-29",
    target:
      "Live Agent event recommendation → multi-step artifact provenance → unique source count → pointer/keyboard disclosure → persisted normalization → feedback/session cleanup",
    testData:
      "Actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; sessions agent-session-ms5y03iq-c0phvh and agent-session-ms5yf1pi-bsibno; runs run:conversation:ad4cf600-e3cc-4529-b5c0-925aa8978e98 and run:conversation:d52a1b13-4b1f-4dd5-97db-571bf3484f0f; source snapshot 2026-06-30T00:00:00.000Z; event evidence ids runtime-evidence-forum plus event_signup:01–03",
    expected:
      "The source summary must count unique underlying records, not artifacts or repeated planner reads. Equivalent replan artifacts must not be synthesized or persisted twice. Overlapping broad/refined results from the same source snapshot must union evidence ids and count each record once. Expanded disclosure must name the source modules, source time, and evidence ids; pointer, Enter, and Space must operate it without writing domain data. Refresh must retain normalized provenance, another actor must receive no feedback, and temporary sessions/feedback must be removable with null readback.",
    actual:
      "The first live run completed 8/8 and returned four event cards, but the source summary claimed 8 records and expanded two byte-equivalent four-record references. The second run initially claimed 5 because its broad four-record artifact and one-record refinement shared evidence:event_signup:02. Runtime now removes semantically equivalent artifact outputs before synthesis, while the UI/history normalization groups one source snapshot and unions evidence ids rather than summing artifact item counts. Both stored sessions converged to one reference with itemCount=4 and four evidence ids. The production page rendered 查看依据 · 4 条真实记录, expanded to 推荐活动 · 4 from orbit-ai · events at 2026/6/30 09:00:00, and showed the first three exact evidence ids. Pointer opened and closed it; after the native summary failed to toggle in the runtime browser, the explicit handler made Enter open and Space close. The source-backed feedback path accepted both ratings and all three outcomes sequentially; formal readback ended with helpful plus goal_advanced for actor A, four unique evidence ids, and actor B null. Refresh restored those selections. Cleanup removed both feedback records and both sessions, and the browser returned to the empty Agent workspace.",
    evidence:
      "Two production-browser conversations traversed the formal composer, 8/8 live Agent loop, four real event cards, closed/open source disclosure, exact source modules/time/evidence ids, refresh normalization, both ratings, all three later outcomes, selected-state reload, keyboard source open/close, and final empty cleanup. Formal configured session and feedback providers proved duplicate then normalized stored references, actor-A-only feedback with four evidence ids, actor-B absence, and final nulls. Focused runtime/history tests passed 54/54, source/history tests passed 18/18, lint/typecheck passed, and production build completed 39/39. Commits aa0d404e, 244c2527, and 7b367e84; pre-edit impact was LOW for runLiveOrbitAgentRuntime, evidenceRefsFromArtifacts, parseAgentChatSessionsArray, AgentEvidenceSources, and OrbitRealAgent, while new helper symbols were not yet indexed; staged detections were LOW.",
    conclusion:
      "pass for live source generation, unique-record counting, equivalent-artifact suppression, overlapping-evidence union, persisted-history repair, source module/time/id disclosure, pointer open/close, Enter open, Space close, no-write disclosure, both rating values, all later outcomes, actor isolation, reload readback, cleanup, focused tests, lint, and build; feedback UI network-failure rendering, mobile source layout, screen-reader announcement timing, and independent manual assistive-technology verification remain separately unverified",
  },
  {
    id: "web-agent-review-transition-state-machine-2026-07-29",
    target:
      "Live Agent internal task proposal → Later → refresh → duplicate-transition guard → Ignore → terminal readback → session cleanup",
    testData:
      "Actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; temporary session agent-session-ms6020sv-r84o50; Run run:natural-language:82c9cc7d; action action:natural-language:ed36fb20; due time 2026-09-10T09:00:00+09:00; title Transition Audit Person",
    expected:
      "An ambiguous request that both asks for a pending write and forbids every write must stop safely without creating an action. An explicit internal proposal may create one awaiting-confirmation ledger action but no task. Later must persist deferred, retain only transitions valid from deferred, survive refresh, stay actor-scoped, and never enqueue work. The UI must not offer a duplicate invalid Later transition or expose an English transport error in Chinese. Ignore from deferred must persist rejected, remove all review-write controls, complete the waiting Run, survive refresh, and still create no task or external side effect. The temporary chat session must be removable independently of the audit ledger.",
    actual:
      "The first contradictory prompt stopped at the local confirmation boundary with a one-step completed response and no action. The clarified prompt generated one awaiting-confirmation create_followup_task action without executing it. Clicking 稍后处理 rendered 稍后处理, hid the Today shortcut, kept Confirm and Ignore, and formal readback returned deferred, zero outbox, zero receipts, and actor B null. Reload preserved the exact deferred status. The page still exposed Later; clicking it returned the server's transition conflict verbatim in English on the Chinese page. Source tracing found that Agent Chat treated awaiting and deferred as one editable state, and Today rendered the same unconditional control set, while the mobile view model already used the correct state map. A shared ledger presentation layer now defines awaiting as confirm/defer/reject and deferred as confirm/reject, and maps stable ledger error context to localized copy. On the rebuilt production page, deferred retained its status but had zero Later controls and one Ignore. Clicking Ignore rendered 已忽略, removed Confirm/Later/Ignore, and formal readback returned Run completed plus action rejected for actor A, actor B null, zero outbox/receipts, and zero task records containing Transition Audit Person. Reload retained the terminal UI. Confirmed session deletion returned the Agent welcome workspace and both actor-scoped session providers returned null.",
    evidence:
      "In-app production browser traversed the safe contradictory prompt, clarified pending action, exact action/run ids, Later, deferred control set, repeated invalid Later and English conflict, session-bound refresh, rebuilt deferred state, Ignore, terminal control removal, terminal refresh, and confirmed session deletion. Configured runtime services proved actor-A awaiting/deferred/rejected states, actor-B null, zero outbox/receipts, and final Run completion; configured task storage returned zero matching records; configured session providers returned null after cleanup. Focused Agent/Today tests passed 15/15, the complete Web suite passed 1382/1382, lint/typecheck passed, and production build completed 39/39. Commit a57dc7bf; AgentActionStatusCard, OrbitTodayDecisionForm, and OrbitTodayDecisionPanelBody were not present in the GitNexus index, while staged detection was LOW with one detected type symbol and zero affected processes.",
    conclusion:
      "pass for ambiguous-request fail-closed behavior, internal pending proposal, Later persistence, deferred refresh, duplicate-control removal, shared Chat/Today state rules, Chinese stable-error mapping, Ignore from deferred, terminal control removal, Run completion, actor isolation, zero task/outbox/receipt/external writes, refresh readback, session cleanup, focused/full tests, lint, and build; cancellation during a genuinely running Run, network failure during the first transition, rapid concurrent clicks, Today browser rendering of a deferred entry, and independent mobile runtime traversal remain separately unverified",
  },
  {
    id: "web-agent-run-cancellation-2026-07-29",
    target:
      "Live Agent awaiting-confirmation task proposal → request cancellation → terminal UI/provider readback → exact-session reload → cleanup",
    testData:
      "Actor user_ms5llhof_wrbpuq; independent actor user_ms2on5yh_60z90f; sessions agent-session-ms60pyvu-9pflqn and agent-session-ms60zisb-gs4wz4; Runs run:natural-language:effb1b4d and run:natural-language:5d28297a; actions action:natural-language:5365bb78 and action:natural-language:e1cd343e; titles Cancel Transition Audit Person and Cancel Label Audit Person; due times 2026-09-11T09:00:00+09:00 and 2026-09-12T09:00:00+09:00",
    expected:
      "A pending internal proposal may be canceled before confirmation without executing its operation. Cancellation must atomically terminate the actor-owned Run and action, remove every review-write control, remain invisible to another actor, enqueue no work, create no task, and survive exact-session reload. The control must describe the user's request rather than expose the internal Run model and must announce its in-flight state. Deleting the temporary conversation must not delete or alter the terminal audit ledger.",
    actual:
      "The first real prompt produced one waiting-for-confirmation Run and one awaiting-confirmation create_followup_task action with zero outbox and receipts; actor B returned null. Clicking the original 取消 Run control rendered 已取消 and removed Cancel/Confirm/Later/Ignore. Formal readback returned Run=canceled, action=canceled, zero outbox/receipts, actor B null, and zero tasks containing Cancel Transition Audit Person; the bound session URL retained the result after reload. Product review identified the mixed internal term Run and its unchanged disabled label as immature copy. The repair renders 取消本次请求 / Cancel this request and switches to 正在取消… / Canceling… while pending. A second independent production prompt exposed the new label; clicking it again produced Run/action canceled, actor B null, zero outbox/receipts, zero matching tasks, and a persisted exact-session terminal UI. Both temporary sessions were deleted through the irreversible-action dialog, and both actor-scoped session providers returned null.",
    evidence:
      "In-app production browser traversed both real prompts, 7/7 proposal completion, exact run/action ids, original and repaired cancel controls, immediate terminal card/control removal, history binding, hard reload, and confirmed session deletion. Configured live runtime services proved both actor-A Run/action pairs were canceled and both actor-B reads were null; configured task storage found zero matching records; each Run contained zero outbox events and receipts; configured session providers returned null after cleanup. Focused Agent tests passed 11/11, the complete Web suite passed 1383/1383, lint/typecheck passed, and production build completed 39/39. Commit 9b61e620; AgentActionStatusCard was absent from the GitNexus index, the separately resolved runtime cancelRun symbol was LOW with zero affected processes/modules, and staged detection found no indexed symbol changes.",
    conclusion:
      "pass for awaiting-confirmation Run/action cancellation, terminal control removal, user-facing bilingual copy, pending feedback copy, actor isolation, zero task/outbox/receipt/external writes, exact-session reload, independent repeat scenario, session cleanup, focused/full tests, lint, and build; cancellation after an outbox operation has begun, forced network failure, rapid concurrent activation, mobile width, keyboard, and assistive-technology announcement timing remain separately unverified",
  },
  {
    id: "expo-actor-snapshot-ownership-repair-2026-07-29",
    target:
      "Expo authenticated API snapshot key, unsigned cache boundary, direct actor replacement, and legacy actor-less rows",
    testData:
      "Deterministic server A/B and actor A/B snapshot keys, unsigned resource loads, account replacement and legacy row cleanup through the production snapshot/session modules",
    expected:
      "Private snapshots must be owned by server plus actor plus path; unsigned state must not read or write them; replacing actor A with actor B must clear the previous snapshot set.",
    actual:
      "The v2 key includes server, actor and path, actor-less legacy rows are purged, unsigned resources skip snapshot reads/writes, and direct account replacement clears stored snapshots before accepting the second actor.",
    evidence:
      "repos/orbit-app/tests/snapshot-store.test.ts; Expo full suite 538/538; Expo typecheck",
    conclusion:
      "repair passes source and unit/integration boundaries; native actor-A cache to actor-B pre-network tree and SQLite ownership remain unverified",
  },
  {
    id: "canonical-contact-identity-repair-2026-07-29",
    target:
      "Contact-detail relationship compose identity and follow-up tasks with no canonical contact",
    testData:
      "Exact contactId compose/create requests plus actor-owned follow-up records whose contactId is null",
    expected:
      "Relationship drafts must retain the selected canonical contact identity. A task without contactId must remain task-only and expose no fabricated person, detail link or email action.",
    actual:
      "The compose/create contract now carries contactId end to end. Null-contact tasks render 未关联联系人 and no longer synthesize a contact id, detail route or compose action across Followups, Today and Schedule projections.",
    evidence:
      "Focused relationship/follow-up/Today tests 44/44; Web full suite 1398/1398; production build",
    conclusion:
      "repair passes contract and cross-surface regression; same-name two-actor UI write/readback and foreign-contact negative runtime remain unverified",
  },
  {
    id: "relationship-inbox-singleton-idempotency-repair-2026-07-29",
    target:
      "Responsive Relationship Inbox trigger arbitration, badge reads and create-draft-thread replay",
    testData:
      "Responsive sibling triggers, concurrent badge reads and repeated actor/requestId create requests through the live conversation provider",
    expected:
      "Only the actually rendered trigger may own the shared panel; concurrent badge reads must share one request; replaying the same actor/requestId must return the first record without another durable write.",
    actual:
      "Trigger ownership is selected by rendered geometry, badge reads share one in-flight request, requestId is hashed with actor identity, and provider replay returns the first actor-scoped record without overwriting it. At 375x812 the rebuilt account shell exposed one mobile Inbox trigger and one portal/dialog; /app/agent exposed that Inbox trigger alongside the independent history trigger. Four registered listeners shared the event, but only the visible owner consumed it.",
    evidence:
      "Relationship inbox panel/provider focused tests; Web full suite 1400/1400 before the final audit-only additions; lint and production build; harness-state/evidence/full-product-functional-audit/shards/web-contacts-chat-gap-closure/post-fix-evaluation.json",
    conclusion:
      "pass for responsive ownership, one visible mobile trigger, Agent Inbox/history coexistence, one portal/dialog, single event consumption, shared badge load, actor-bound request identity, durable same-actor replay, first-content preservation, and independent second-actor identity",
  },
  {
    id: "shared-shell-state-boundaries-repair-2026-07-29",
    target:
      "Chat empty-state account/Inbox shell and entry Starfield mobile menu disclosure lifecycle",
    testData:
      "Production /app/chat empty actor plus / and /app at 390x844 with pointer, Tab and Escape",
    expected:
      "Route failure/empty states must remain inside the shared account shell. The mobile menu must expose truthful disclosure state, remove closed links from interaction, support dismissal and return focus.",
    actual:
      "/app/chat rendered account and Inbox controls around its empty state. Both entry routes exposed aria-expanded, hidden/inert closed content, keyboard entry, Escape/outside/link dismissal and focus return without console errors.",
    evidence:
      "Chat route-state tests 11/11; Starfield focused tests 32/32; harness-state/evidence/full-product-functional-audit/shards/entry-shell-parity-current/result.json; runtime-evidence.json; parity-orphan-review.json; route-instance-status.json",
    conclusion:
      "pass for the exercised shared empty-state shell, both entry routes at three widths, canonical language continuity, mobile-menu pointer/keyboard lifecycle, 84/84 route-instance conclusions, 94/94 route assignments and zero proven orphan routes; 20 Agent handoff controls remain explicitly external-limited by the read-only shard boundary, while physical touch and VoiceOver/TalkBack announcements remain unverified",
  },
  {
    id: "event-temporal-source-of-truth-repair-2026-07-29",
    target:
      "Public event catalogue, detail header, authored description and agenda time authority",
    testData:
      "Reviewed catalogue events including EVTSIGNUP03 and invalid end-equals-start inputs",
    expected:
      "startsAt/endsAt must determine every rendered time; generated events must have positive duration; agenda rows may not outlive or contradict their event.",
    actual:
      "Generated events end two hours after start, presentation derives header/detail/agenda from the same bounds, and invalid non-positive intervals expose 结束时间待确认 with no fabricated agenda. EVTSIGNUP03 consistently rendered 18:00-20:00 with 18:00/18:30/19:00/19:30 agenda rows.",
    evidence:
      "Event focused tests 18/18; Web full suite 1398/1398; lint/build; production browser /app/events/EVTSIGNUP03",
    conclusion:
      "pass for repaired source/presentation integrity and exercised production detail; provider failures, all dynamic identities, responsive and assistive traversal remain unverified",
  },
  {
    id: "production-dev-surface-boundary-repair-2026-07-29",
    target:
      "All fixed and dynamic /dev routes in production plus adjacent app/API authentication",
    testData:
      "Seven fixed paths, 49 registered capability slugs, one unknown slug, /app/contacts and /api/contacts against the exact local production build",
    expected:
      "Every /dev surface must fail closed in production without weakening adjacent authentication; development-only decision specimens must be truthfully non-interactive.",
    actual:
      "All 57 dev paths returned 404, /app/contacts retained its login redirect, /api/contacts retained its 401 envelope, and development foundation decision specimens are explicitly disabled.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/shards/web-dev-routes-runtime/result.json; route-instance-map.json; production-route-smoke.json; development-route-smoke.json; runtime-observations.json; tests/dev/production-dev-runtime.test.mjs 2/2; production build",
    conclusion:
      "pass for 384/384 inventoried route instances mapped to 154 implementations, the exact local production artifact, inherited route-group boundary, development identity, controlled unknown-slug fallback, keyboard-native disclosure and truthful inert style specimens; deployed edge/proxy host, authorized development-tunnel exposure and reliable 375/390 client-runtime traversal remain unverified",
  },
  {
    id: "expo-private-route-and-next-boundary-repair-2026-07-29",
    target:
      "Expo private grouped/root route render gates and normalized post-auth next destinations",
    testData:
      "Signed-out Expo Web /contacts?q=runtime, /today?filter=pending, public /events, external/scheme-relative/malformed/unsupported next unit matrix",
    expected:
      "A private leaf must not mount before validated auth, its exact supported internal destination must survive login, and public discovery routes must remain reachable. External or unsupported next values must fail closed.",
    actual:
      "/contacts and /today reached login with their exact encoded next values and no maximum-update loop; /events remained public. Every current root-level private route is discovered from the route tree and required to use the shared render gate. The next resolver rejects external, scheme-relative, backslash, auth-loop and unknown destinations.",
    evidence:
      "Expo route/access/auth tests; Expo full suite 538/538; typecheck; Expo Web browser route matrix with zero console errors",
    conclusion:
      "pass for Expo Web private/public routing and normalized next matrix; native cold/warm deep links, cached-session expiry and offline snapshot states remain unverified",
  },
  {
    id: "contact-introduction-request-idempotency-repair-2026-07-29",
    target:
      "Contact introduction composer request identity, retry replay, first-content preservation and actor isolation",
    testData:
      "Stable requestId reused with altered retry content for actor A, then the same requestId for actor B; disposable audit rows cleaned after provider readback",
    expected:
      "A retry from one composer must return the first actor-owned introduction without another durable row or overwrite. Another actor using the same requestId must receive an independent identity.",
    actual:
      "The composer creates one requestId and reuses it across retries. The repository derives identity from actor plus requestId, returns the existing actor-owned record before writing, preserved the first content after an altered retry, kept one active row for actor A, and produced an independent id for actor B.",
    evidence:
      "Introduction repository/API focused regressions; harness-state/evidence/full-product-functional-audit/shards/web-contacts-chat-gap-closure/post-fix-evaluation.json; ten disposable audit records removed and active audit set returned empty",
    conclusion:
      "pass for stable composer identity, retry idempotency, first-write preservation, actor isolation, durable readback and cleanup; rapid real-browser double activation and forced network timeout remain separately unverified",
  },
  {
    id: "expo-public-event-contract-repair-2026-07-29",
    target:
      "Signed-out Expo event discovery/detail plus private registration and attendee boundaries",
    testData:
      "Signed-out Expo Go iOS defect reproduction followed by rebuilt Expo Web /events, /events/event_signup_02 and registration navigation against the exact-origin production API",
    expected:
      "Public discovery and exact event detail must not depend on a private session. Personalized modules must stay unmounted while signed out, and deeper registration/attendee workflows must preserve the destination through the shared private gate.",
    actual:
      "The original native run returned 401 and 登录状态已失效 on /events. After repair, Expo Web and native Expo Go iOS both rendered 13 public events and the exact 东京 AI 落地伙伴对接会 detail without 401. The native 报名参加 action reached the login form with /account/login?next=%2Fevents%2Fevent_signup_02%2Fregister.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/shards/mobile-gap-closure/ios-expo-events-unauthenticated-401-clean.png; post-fix-expo-web-events-runtime.json; harness-state/evidence/full-product-functional-audit/shards/mobile-post-fix-events-native/result.json; native XCUITest 2/2; related mobile tests 10/10; public API tests 3/3; Expo full suite 538/538; typecheck; production build 39/39",
    conclusion:
      "pass for the repaired public list/detail data contract, signed-out personalization boundary, exact private next preservation, Expo Web and post-fix native iOS runtime; Android remains externally unavailable",
  },
  {
    id: "entry-language-authority-repair-2026-07-29",
    target:
      "Root Starfield language choice, reload persistence, document language and /app shell continuity",
    testData:
      "Production browser English selection at /, root reload, then direct /app navigation",
    expected:
      "The entry and application shell must share one canonical language authority, migrate the legacy entry key, persist the cookie, and keep documentElement.lang synchronized.",
    actual:
      "Before repair the root stayed English after reload while html lang remained zh-CN and /app returned Chinese. After repair, English text and html lang=en survived root reload and direct /app navigation.",
    evidence:
      "In-app production browser before/after traversal; tests/pages/orbit-starfield-language.test.ts; focused Starfield tests 7/7; lint and production build",
    conclusion:
      "pass for canonical localStorage/cookie resolution, legacy-key migration, root reload, document language and /app continuity; cross-tab storage events and manual screen-reader language switching remain open",
  },
  {
    id: "public-web-rendered-leaf-base-states-2026-07-29",
    target:
      "Anonymous public Web base states at mobile, tablet and desktop viewport widths",
    testData:
      "13 public/auth-entry/alias routes rendered from the current production build at 375x812, 768x1024 and 1440x900",
    expected:
      "Every named base state must remain observable, enumerate only visible leaf controls, report state identity and overflow, and surface request/response/console failures without claiming unvisited interaction states.",
    actual:
      "All 39 route-viewport states were available. The collector observed 377 leaf-control occurrences and 33 unique state keys with no HTTP error responses, request failures, console errors or horizontal overflow. / and /app were equivalent per viewport; /app/admin/access and /app/login-admin were equivalent per viewport.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/public-web-2026-07-29/manifest.json and per-state screenshots/browser JSON",
    conclusion:
      "pass for the 39 explicitly named anonymous base states; this is a state-local observation and not the whole-product rendered-leaf denominator",
  },
  {
    id: "anonymous-web-event-detail-private-request-repair-2026-07-29",
    target: "Signed-out Web /app/events/event_signup_02 data-access boundary",
    testData:
      "Exact local production event detail observed with HTTP response-error collection before and after repair",
    expected:
      "A public event detail must not issue private matchmaking or registration requests while signed out.",
    actual:
      "Before repair the 200 page made two hidden 401 requests to /matchmaking and /registration?questions=false. After auth state was passed into both client modules, the same page rendered 17 desktop leaf controls with zero HTTP error responses, failed requests, console errors or settle warnings.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/public-web-2026-07-29/detail-response-diagnostic.json; public-event-detail-post-fix.json; full 13-route post-fix manifest; focused event tests 17/17; production build 39/39",
    conclusion:
      "pass for the exercised signed-out Web event detail and its private subrequest boundary; authenticated matchmaking/registration states remain separately scoped",
  },
  {
    id: "event-registration-jsonb-order-idempotency-repair-2026-07-29",
    target:
      "Authenticated event_signup_02 eight-answer registration write, replay and actor isolation",
    testData:
      "Production handler and PostgreSQL using the same eight semantic answers in canonical, reversed and shuffled key order, followed by one legitimate valueOffered change and a second actor read",
    expected:
      "Semantic retries must preserve one registration, all stable identities and timestamps without side effects; a real answer change must still persist and advance update timestamps; another actor must not see the record.",
    actual:
      "Before repair JSONB key reordering advanced updatedAt on every semantic retry. After field-by-field canonical comparison, all three semantic POSTs returned 200 with the same registration/profile identities and 15:18:29.640Z timestamps, one active row and all side effects false. Changing only valueOffered persisted the new value and advanced both update timestamps to 15:18:29.760Z. Actor B saw null at handler and provider layers.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/shards/web-event-registration-runtime-closure/result.json; harness-state/evidence/full-product-functional-audit/shards/web-event-registration-post-fix-evaluator/result.json; focused event registration tests 9/9; evaluator cleanup includeDeleted count=0",
    conclusion:
      "pass for eight-answer submission, refresh readback, JSONB-order-insensitive replay, legitimate update, one-row persistence, no external side effects and actor isolation; provider/model failure injection remains externally limited",
  },
  {
    id: "web-chat-recording-idempotency-and-ui-repair-2026-07-29",
    target:
      "Authenticated /app/chat message-recording UI, API replay, PostgreSQL persistence and actor isolation",
    testData:
      "Production UI double activation; same requestId with identical and altered content; different requestIds with identical content; controlled live failure followed by retry; two actors; exact cleanup",
    expected:
      "The page must expose an honest storage-only recording lifecycle, synchronously suppress duplicate activation, preserve the first write for a stable request identity, allow intentional repeats under new identities, recover from failure and keep actors isolated.",
    actual:
      "Before repair the page was review-only and the API created two durable messages for duplicate activation. After repair it exposed one composer; double activation produced one POST, one active row and one reloaded UI article. Same-request altered replay returned the original id/content, different-request identical content produced two ids, controlled failure copy contained no mock-boundary wording and retry succeeded. Actor A/B reads and writes stayed isolated.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/shards/web-chat-runtime-closure/runtime-evaluation.json; harness-state/evidence/full-product-functional-audit/shards/web-chat-post-fix-evaluator/evaluation.json; raw-evidence.json; provenance-followup.json; focused Chat/Agent-context tests 29/29; evaluator cleanup active set empty",
    conclusion:
      "pass for the exercised UI pending/duplicate lifecycle, request replay, first-write preservation, intentional repeat, failure retry, durable readback and actor isolation; conversation deletion/retention policy remains a separate product lifecycle decision",
  },
  {
    id: "shared-inbox-request-scoped-actor-repair-2026-07-30",
    target:
      "Authenticated Notifications and Relationship Inbox shared-shell requests across Dashboard, Home, Home Events, Schedule event detail and Today",
    testData:
      "Five authenticated route surfaces, ten automatic shared API reads, two anonymous reads, canonical profile/account actors A and B, actor-A-only conversation data and another-actor empty notification/inbox reads",
    expected:
      "Auth.js must stay bound to the concrete Next.js request while the shared handlers resolve the canonical account owner. Successful actor-scoped empty data must render as an honest empty Threads/Alerts/badge state, anonymous calls must remain 401, and no handler may call headers outside request scope or reveal another actor's data.",
    actual:
      "Before repair both shared APIs returned 500 in authenticated Next.js 16.2.9 development runtime because a factory-created handler re-entered zero-argument auth() outside request scope; Threads rendered Mailbox not connected and Alerts/badge masked the failure as empty. After both route modules were wrapped with auth(async request), all ten authenticated reads returned 200, zero returned 500, and the server logged zero headers-outside-request-scope stacks. Threads rendered a successful zero-conversation state, Alerts rendered All clear from a successful empty response, and badge zero agreed. Both anonymous reads remained exact 401. Canonical actor A/B resolution and other-actor empty reads passed.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/shards/web-home-today-schedule-followups-dashboard/shared-api-failure.md; harness-state/evidence/full-product-functional-audit/shards/shared-inbox-request-auth-post-fix/result.json; runtime-observations.json; server-log.md; source-evidence.md; focused tests 27/27; Web full suite 1408/1408; lint; production build 39/39",
    conclusion:
      "pass for the exercised authenticated GET runtime, honest shared-shell UI state, anonymous boundary, request-scoped canonical actor mapping and provider-level actor isolation across 130 affected route instances; the independent read-only evaluator did not execute a valid live compose POST, and used development rather than production runtime",
  },
  {
    id: "contacts-dashboard-mobile-root-layout-repair-2026-07-30",
    target:
      "Authenticated Web /app/contacts/dashboard at the 390x844 mobile viewport",
    testData:
      "Canonical authenticated actor, the current actor-scoped empty dashboard data, desktop/mobile responsive roots and independent pre/post full-page DOM geometry captures",
    expected:
      "The desktop root must be inert and occupy no space at mobile width. The mobile root must begin at x=0/y=0, flow vertically, remain within the 390px viewport and expose the real dashboard content without horizontal overflow.",
    actual:
      "Before repair the outer desktop main remained visible at mobile width, occupied the first 844px and forced the mobile flex root beside it; document scrollWidth was 641px and the first viewport appeared blank. After moving the desktop-only boundary to the outer main and making the mobile root an explicit full-width column, the desktop root measured 0x0 and was inert/aria-hidden, the mobile root measured 390x844 at 0,0, and document/body clientWidth and scrollWidth were all exactly 390.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/authenticated-web-current/p1-contacts-dashboard-mobile-390-pre.json; p1-contacts-dashboard-mobile-390-fullpage.png; p1-contacts-dashboard-mobile-390-post.json; postfix-contacts-dashboard-mobile-390-fullpage.png; focused dashboard/a11y tests 6/6",
    conclusion:
      "pass for authenticated 390px mobile reachability, responsive-root exclusivity, vertical flow and zero horizontal overflow; 375px remained browser-clamped to 390px in this environment",
  },
  {
    id: "settings-memory-switch-mobile-wrap-repair-2026-07-30",
    target:
      "Authenticated Web /app/settings Agent-memory switches at the 390x844 mobile viewport",
    testData:
      "Canonical authenticated actor, English long-form memory labels, current settings response and independent pre/post DOM geometry captures",
    expected:
      "Both switch labels must wrap inside the settings card while the On/Off state chip remains visible and fixed-size; no product node may extend document/body width beyond 390px.",
    actual:
      "Before repair the approved-learning label and Off chip were forced onto one line and extended document/body scrollWidth to 499px. After applying a shrinkable wrapping label, non-shrinking state chip and full-width wrapping switch row, document/body clientWidth and scrollWidth were exactly 390, no overflow node remained, and the label wrapped beside the visible Off chip.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/authenticated-web-current/settings-mobile-390-overflow.json; p1-candidate-settings-mobile-390-fullpage.png; settings-mobile-390-post.json; postfix-settings-mobile-390-fullpage.png; focused settings tests 8/8",
    conclusion:
      "pass for both English memory switches at authenticated 390px mobile width with zero horizontal overflow; Chinese and an actual 375px browser viewport remain outside this capture",
  },
  {
    id: "third-round-rendered-leaf-and-negative-state-evaluation-2026-07-30",
    target:
      "Anonymous public Web, authenticated production Web, anonymous iOS Expo routes and deduplicated high-risk negative states",
    testData:
      "13 public Web routes at three widths; 25 authenticated Web routes at desktop/mobile widths plus three opened overlays and one popover; 48 anonymous iOS route/deep-link states; eight high-risk scenario families",
    expected:
      "Every counted leaf must exist in a rendered DOM/native tree and belong to an explicit state key. Shared implementation evidence may be reused only after per-route reachability/accounting; unavailable actors, writes, roles, platforms and states must remain explicit limitations rather than inferred passes.",
    actual:
      "The three non-overlapping manifests recorded 141 rendered state instances and 1,502 leaf occurrences: public Web 39/377, authenticated Web 54/769 and anonymous iOS 48/356. Authenticated Web separately accounted for all 1,120 current interaction occurrences and 23 overlays; one dynamic-contact Inbox occurrence was downgraded because its route did not render the trigger. The negative matrix passed eight families, failed none and retained one browser-network scenario as external-limited. Android, authenticated/second-actor native states, 106 authenticated Web write-risk leaves, dynamic contact/event success data and several overlays remain unresolved or external-limited.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/public-web-2026-07-29/manifest.json; runtime-leaf-denominator/authenticated-web-current/manifest.json; authenticated-web-current/validation.json; runtime-leaf-denominator/mobile-native-current/manifest.json; mobile-native-current/validation.json; shards/high-risk-negative-state-matrix-current/result.json; shards/high-risk-negative-state-matrix-current/provenance.json",
    conclusion:
      "pass as a state-local evidence merge with independently reproducible counts and honest route-level reuse boundaries; not a final product-wide rendered-leaf denominator or full necessary-state closure",
  },
  {
    id: "home-party-event-identity-repair-2026-07-30",
    target:
      "Authenticated Home actor-owned event cards entering the Party route",
    testData:
      "A disposable actor-owned live event with an exact event:live-record:* identity, authenticated Home UI, direct Party control and isolated post-fix runtime replay",
    expected:
      "Every active or ended Home event card must preserve its concrete event identity when entering Party. The Party route must resolve that identity before evaluating attendee/recommendation readiness.",
    actual:
      "Before repair both Home event-card implementations called a parameterless enterEvent and navigated to /app/party, which rendered the no-event-selected state. After passing event.id through the existing canonical partyHrefForEvent helper, an independent isolated-runtime replay navigated to the exact encoded eventId and rendered the identity-resolved missing-reviewed-context state with a recovery link back to the same event.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/web-dynamic-states-current/p1-home-party-event-identity-loss.json; p1-owned-event-store-record.json; p1-home-party-fix-independent-validation.json; focused Home event and product-href tests 24/24",
    conclusion:
      "pass for actor-owned Home event identity preservation and Party identity resolution; Party success remains external-limited without reviewed attendee/recommendation context",
  },
  {
    id: "fourth-round-rendered-state-and-dynamic-data-evaluation-2026-07-30",
    target:
      "Development Web routes, role/tenant gates, authenticated native state and dynamic Web data/overlay/write scenarios",
    testData:
      "All 56 current development paths at 1440x1000 and 390x1000; five admin/platform routes on an isolated origin; one disposable iOS credentials actor; two disposable Web actors, exact contacts/event/introduction records and exact cleanup",
    expected:
      "Only rendered DOM/native leaf occurrences with explicit non-overlapping state keys may enter the merged leaf observation. Behavior-scenario counts must remain separate. Role, Android, cookie-transport and broad Party data prerequisites must remain limited when formal actors or raw transport evidence are unavailable.",
    actual:
      "At the fourth-round checkpoint, Development Web added 112 responsive states and 1,130 leaf occurrences. Role/tenant added only three non-overlapping anonymous protected-route states and 24 leaves because its two public admin entries duplicate the public Web manifest. Native added one seven-leaf login-error state; cookie transport was still unresolved at that checkpoint and the one-off cold-launch red screen was excluded. Dynamic Web proved eight data/overlay states, ten passes, two Party limitations, one repeat-submission observation, cross-actor denial and exact 13-record cleanup, but its 13-count was behaviors rather than DOM leaves and was not summed. That checkpoint's six-manifest partial merge was 257 states, 2,663 leaf occurrences and 251 unique state keys; the fifth-round case below supersedes its native-cookie and rendered-leaf status.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/development-web-current/manifest.json; development-web-current/validation.json; role-tenant-matrix-current/manifest.json; native-authenticated-current/result.json; native-authenticated-current/validation.json; web-dynamic-states-current/result.json; web-dynamic-states-current/validation.json; coordinator/runtime-leaf-merge-policy.json",
    conclusion:
      "pass for the fourth-round checkpoint as a deduplicated state-local observation and dynamic-data behavior evaluation; its native-cookie limitation is superseded by the fifth-round repair case, while the product-wide leaf denominator, complete role/tenant matrix and Android result remain open",
  },
  {
    id: "fifth-round-dynamic-leaf-and-native-cookie-repair-2026-07-30",
    target:
      "Six preserved dynamic Web DOM states plus native credentials acceptance, actor-owned profile data and cold SecureStore restoration on a brand-new iOS simulator",
    testData:
      "Exact accessibility DOM for Home success, Contact detail success, Schedule event success, Contact introductions overlay and two Party data gates; one disposable native actor; one credentials submission; warm and force-terminated cold /profile native trees",
    expected:
      "Only raw DOM/native-tree leaves may expand the state-local observation. Native requests carrying an explicit Auth.js Cookie must use one transport source, while browser-managed Web requests must retain HttpOnly cookie behavior. Credentials acceptance must precede SecureStore persistence and actor-owned private data.",
    actual:
      "The six preserved Web states contributed exactly 85 leaves and 47 conservative semantic implementation keys; Relationship Inbox and Today overlays remained excluded because their full DOM was not preserved. A fresh direct iOS run reproduced Invalid Compact JWE before repair. React Native source showed credentials=include preloading NSHTTPCookieStorage before addValue-appending Orbit's explicit Cookie. After switching explicit-cookie validation, API and sign-out requests to credentials=omit while retaining Web include behavior, an independent new-simulator run passed one credentials submission, /api/auth/session, the exact actor-owned /profile, SecureStore write/read and a 2.6-second cold restore with no JWE error. Warm and cold profile trees contributed 15 leaves each. The eight-manifest partial merge is now 265 states, 2,778 leaf occurrences and 259 unique state keys.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/web-dynamic-states-current/leaf-manifest-v2.json; leaf-validation-v2.json; runtime-leaf-denominator/native-direct-fresh-current/result.json; coordinator/evaluations/native-explicit-cookie-root-cause.json; runtime-leaf-denominator/native-explicit-cookie-fix-evaluator-current/result.json; validation.json; manifest.json; coordinator/runtime-leaf-merge-policy.json",
    conclusion:
      "pass for the six exact Web states and the repaired native credentials/profile/cold-restore chain with exact cleanup; still not a product-wide rendered-leaf denominator, Android result, native two-actor matrix or complete authenticated native route traversal",
  },
  {
    id: "sixth-round-overlays-role-isolation-and-native-cache-repair-2026-07-30",
    target:
      "Relationship Inbox and Today overlays, authenticated Admin/Platform workspace isolation, two-actor native Contacts cache ownership and the cold initial-refreshToken hydration repair",
    testData:
      "Two disposable Web actors and one live Inbox draft; two isolated Web workspaces and one actor-A event; two disposable native actors, exact actor-keyed SQLite rows, a fresh iOS simulator, true Expo process restart, initial-token and later-token offline Contacts states",
    expected:
      "Overlay leaves must come from preserved rendered trees; writes must survive readback without duplicate mutation or cross-actor leakage; unavailable privileged roles must fail closed; native cache hydration must preserve actor ownership and may not remain loading when an exact offline snapshot exists.",
    actual:
      "Inbox compose issued one POST, disabled itself while pending, persisted one draft across reload, preserved the first payload and timestamp under a mutated same-request replay, hid actor A from actor B and cleaned seven records. Chat's route-state header initially fell outside the responsive selector owner; a route-local scope repair left exactly one actionable Inbox trigger at each breakpoint. Today contributed one 52-leaf overlay state. The role shard added six authenticated states and fourteen leaves: actor A's event persisted, actor B stayed empty, a cross-workspace session replay returned 401 and Platform remained explicitly unavailable because no privileged role/provider exists. Native two-actor evidence proved logout deletion, actor partitioning and warm/online cache behavior, then exposed a HIGH cold initial-token hydration race. The LOW-impact ContactsListScreen edge-trigger repair passed the exact same-process offline protocol at t0/t5/t15, later-token failure preservation, byte-stable SQLite and independent cleanup. After replacing two stale Chat base observations and excluding overlapping states plus a non-summable all-accessibility diagnostic, the thirteen-source partial merge is 279 states, 3,001 interactive leaf occurrences and 273 unique state keys.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/web-missing-overlays-and-inbox-compose-current/result.json; runtime-leaf-denominator/chat-route-state-scope-fix-evaluator-current/manifest.json; runtime-leaf-denominator/authenticated-role-tenant-matrix-v2-current/manifest.json; runtime-leaf-denominator/native-two-actor-cache-isolation-current/result.json; runtime-leaf-denominator/native-cold-snapshot-root-current/result.json; runtime-leaf-denominator/native-refresh-token-cold-cache-fix-evaluator-current/manifest.json; coordinator/evaluations/chat-route-state-scope-root-cause.json; coordinator/evaluations/native-refresh-token-cold-cache-root-cause.json; coordinator/runtime-leaf-merge-policy.json",
    conclusion:
      "pass for the selected non-overlapping overlay, role/workspace, two-actor native and repaired cold-cache states with exact persistence, isolation and cleanup evidence; the product-wide rendered-leaf denominator, Android, privileged Platform success and authenticated-stack prefetch timing remain unresolved or capability-limited",
  },
  {
    id: "web-settings-feedback-delete-two-actor-lifecycle-2026-07-30",
    target:
      "Authenticated Settings result-learning deletion with pending, provider failure, retry, reload, duplicate activation and actor isolation",
    testData:
      "Two disposable authenticated actors in one formal workspace, one actor-A feedback record, zero actor-B feedback records, a controlled delayed 503 and the configured production Postgres store",
    expected:
      "Deletion must retain the record while pending, fail closed without removing it, succeed only after the real provider confirms, survive reload, converge under duplicate removal and never expose or mutate another actor's record.",
    actual:
      "Actor A rendered the exact record and disabled 正在删除… state. The delayed 503 restored the control and left the Postgres row intact. Retry removed it, hard navigation stayed empty, rapid double activation plus repeated service calls converged at zero, and actor B remained empty throughout.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/web-write-risk-activation-current/result.json; reconciliation.json; validation.json; actor/pending/error/success/reload DOM and screenshots; before/error/after/repeat/cleanup provider ledgers",
    conclusion:
      "pass for the selected conditional irreversible write, exact API/service/provider/store chain, persistence, controlled failure, retry, duplicate convergence, actor isolation and cleanup; four Agent composer route-leaf occurrences remain the sole runnable implementation group from the old 106 write-risk observations",
  },
  {
    id: "production-live-only-and-mock-api-boundary-2026-07-30",
    target:
      "Production module/feature mode resolution, /api/mock scenario/reset handlers and configured Event matchmaking storage",
    testData:
      "NODE_ENV=production with missing, invalid, explicit mock and explicit hybrid mode inputs; a mock-only service factory; direct GET/POST calls to all three mock API handlers including an invalid reset body; Event matchmaking with all three durable database URLs absent",
    expected:
      "Production must resolve only live mode. A mock-only factory and configured Event matchmaking without durable storage must fail closed. Mock APIs must return an empty no-store 404 before reading inputs, creating mock services, exposing fixtures or mutating scenario state.",
    actual:
      "Both shared mode resolvers returned live for every production input. A mock-only factory returned NOT_IMPLEMENTED for omitted, mock, hybrid and invalid inputs, with production-safe live-provider guidance. The scenario list, scenario activation and reset handlers each returned an empty Cache-Control:no-store 404, including the malformed-body reset request. The Event matchmaking factory now throws a controlled configuration error in production when durable configuration is absent; its process-memory fallback is explicitly confined to non-production workflow development/tests. Development/test factory behavior and explicitly injected in-memory matchmaking tests remained unchanged.",
    evidence:
      "final focused production-mode/workflow/matchmaking tests 21/21; independent production-boundary matrix 42/42; mock scenario handler tests 5/5; complete Web suite 1417/1417; Web lint PASS; production build 39/39; coordinator/evaluations/production-mock-api-next-start-current.json; coordinator/evaluations/production-mock-api-next-start-raw-current.json",
    conclusion:
      "pass for production live-only resolution, mock-only provider failure, durable matchmaking configuration and authenticated rebuilt next-start mock-API fail-closed behavior; deployed-host provider configuration remains an environment gate",
  },
  {
    id: "native-retained-contacts-focus-gate-2026-07-30",
    target:
      "Two-actor iOS retained Contacts route across logout, actor-B credentials acceptance, Profile focus and later explicit Contacts focus",
    testData:
      "One disposable simulator, ephemeral two-actor API stub, actor-A focused Contacts then formal sign-out, actor-B credentials/profile, a 31.073-second hidden observation window and explicit actor-B Contacts navigation",
    expected:
      "A preserved but unfocused route record must not mount ContactsScreen or issue private Contacts/suggestion reads. Explicit focus must mount normally, issue each read once, preserve actor ownership and render only actor B.",
    actual:
      "Root-cause instrumentation proved Expo retained the route record rather than the React child. Before repair the historical route remounted behind account/login and issued both actor-B reads 80 ms after mount. After the leaf route began returning null while useIsFocused was false, the same historical record remained at stack index zero while account/login was focused at index two, but ContactsListScreen did not mount and both actor-B endpoint counts stayed zero for 31.073 seconds. Explicit Contacts navigation mounted a new focused route, issued /api/contacts and /api/search/suggestions exactly once each 32 ms later and rendered Runtime Actor B Contact.",
    evidence:
      "runtime-leaf-denominator/native-retained-prefetch-root-current/result.json; native-retained-prefetch-root-current/validation.json; native-retained-prefetch-post-fix-current/result.json; native-retained-prefetch-post-fix-current/validation.json; native-retained-prefetch-post-fix-current/manifest.json",
    conclusion:
      "pass with HIGH evaluator confidence for the exact retained-route lifecycle, zero hidden reads, one focused read pair, actor isolation and complete simulator/listener cleanup; Android and any future explicit background-prefetch product contract remain separate",
  },
  {
    id: "seventh-round-static-denominator-correction-2026-07-30",
    target: "Audit interaction and route-query denominators",
    testData:
      "All 94 route page-file nodes, DataCard optional onPress call sites, route-scoped rendered-symbol AST and known header/cookie/API/UUID false-positive probes",
    expected:
      "An internal control gated by an optional owner prop may be attributed only to routes that pass that prop. Route query keys must originate from route-local URL consumers and must remain separate from path parameters, headers, cookies, API query fields and arbitrary transitive get/set calls.",
    actual:
      "The DataCard Pressable route-instance count fell from 44 to the six routes that pass onPress, reducing the interaction denominator from 2340 to 2302 without changing the 921 implementation denominator. Route-query pairs fell from 1272 alleged pairs/71 keys to 119/30; mobile /account became empty, Contacts List retained its seven route keys, mobile /ai/[id] separated path id from initialMessage/source, and Web login retained created/email/next/orbitVisualSeed with all named false positives absent.",
    evidence:
      "audit generator; audit tests 10/10; coordinator/evaluations/seventh-round-denominators-current.json; coordinator/runtime-interaction-coverage-current.json; independent route-parameter root-cause review",
    conclusion:
      "pass for the two corrected static scanner rules; route page-file nodes are not terminal UI implementations, and alias/redirect/hash/custom-scheme contracts plus the rendered runtime leaf denominator remain explicitly unresolved",
  },
  {
    id: "navigation-nonpass-runtime-replay-2026-07-30",
    target:
      "Authenticated Settings sign-out and the encounter-note plus email/calendar development capability controls",
    testData:
      "One disposable authenticated actor, measured 1440x900 Settings, exact process-scoped mock capability controls, rendered action/method contracts, API status/envelope ledgers and zero initial business rows",
    expected:
      "The exact Settings occurrence must preserve language and terminate the session without Back restoration. Every declared debug form/control must activate under mock mode, match its rendered request contract, execute no undeclared provider or durable business side effect and clean all disposable records.",
    actual:
      "Settings exposed one account menu and one sign-out control; it preserved lang=ja, terminated the session and stayed signed out after Back. Nine encounter buttons, nine encounter form boundaries and eight email/calendar buttons all activated and matched their 201/400/409/503/200 and 200/503/403/404 matrices. Declared safety flags stayed false, business rows remained 0→0 and cleanup ended at activeAfter=0.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/continuation-20260730T105558+0900/next-round-06/navigation-nonpass-runtime-replay/result.json; evaluation.json; raw/runtime-observations.json; cleanup.json; generator-navigation-evaluator/result.json; evaluation.json",
    conclusion:
      "pass for four exact shared implementations and 27 exact route occurrences; the other 20 routes consuming the shared sign-out implementation remain route-local NOT_RUN",
  },
  {
    id: "web-debug-api-probe-method-query-ui-2026-07-30",
    target:
      "Contact detail and relationship profile development capability API probe forms",
    testData:
      "Two exact development slugs, five normalized form-submit implementations, eight route occurrences, a disposable authenticated actor, process-scoped mock mode, current source hashes and zero pre-existing actor-owned domain rows",
    expected:
      "The server route must resolve both slugs while client controls issue the declared GET/PATCH method, preserve query/body input, render success or controlled failure envelopes, create no live domain record and clean the actor exactly.",
    actual:
      "Both slugs rendered their intended terminal panel. Four contact GET controls preserved base, empty, pending and failure query states and rendered 200/200/200/503. Contact edit and relationship profile edit issued PATCH with their rendered bodies and returned 200. The bodyless relationship stage/profile probes issued PATCH and rendered deterministic 400 VALIDATION_ERROR rather than GET, POST or 405. All five implementation keys and eight route occurrences passed; domain rows remained zero.",
    evidence:
      "harness-state/evidence/full-product-functional-audit/continuation-20260730T105558+0900/next-round-03/remediation-debug-api-probes/result.json; evaluation.json; raw/runtime-observations.json; cleanup.json; focused API-probe/capability tests 36/36",
    conclusion:
      "pass for the exact current five implementation keys, all eight route-local occurrences, declared methods/query/body, rendered success/failure states, zero live-domain writes and exact cleanup",
  },
];

const RENDERED_LEAF_OBSERVATIONS = {
  evidencePath:
    "harness-state/evidence/full-product-functional-audit/coordinator/runtime-leaf-merge-policy.json",
  leafControlOccurrences: 3001,
  manifestCount: 13,
  manifests: [
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/public-web-2026-07-29/manifest.json",
      leafControlOccurrences: 377,
      renderedStates: 39,
      scope: "13 anonymous public Web base routes at three viewport widths",
      uniqueStateKeys: 33,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/authenticated-web-current/manifest.json",
      leafControlOccurrences: 751,
      renderedStates: 52,
      scope:
        "Authenticated production Web states excluding the two stale Chat base states superseded by the independent post-fix evaluator",
      uniqueStateKeys: 52,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/mobile-native-current/manifest.json",
      leafControlOccurrences: 356,
      renderedStates: 48,
      scope: "48 anonymous iOS Expo route and deep-link states",
      uniqueStateKeys: 48,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/development-web-current/manifest.json",
      leafControlOccurrences: 1130,
      renderedStates: 112,
      scope:
        "All 56 current development Web paths at exact 1440x1000 and 390x1000 viewports",
      uniqueStateKeys: 112,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/role-tenant-matrix-current/manifest.json",
      leafControlOccurrences: 24,
      renderedStates: 3,
      scope:
        "Only the non-overlapping anonymous denial states for /app/admin, /app/admin/events and /app/platform",
      uniqueStateKeys: 3,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/native-authenticated-current/manifest.json",
      leafControlOccurrences: 7,
      renderedStates: 1,
      scope:
        "One iOS credentials-login error state after a real disposable actor registration",
      uniqueStateKeys: 1,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/web-dynamic-states-current/leaf-manifest-v2.json",
      leafControlOccurrences: 85,
      renderedStates: 6,
      scope:
        "Six exact dynamic Web success, overlay and data-gate states whose full accessibility DOM was preserved",
      uniqueStateKeys: 6,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/native-explicit-cookie-fix-evaluator-current/manifest.json",
      leafControlOccurrences: 30,
      renderedStates: 2,
      scope:
        "Authenticated iOS profile and force-terminated cold-restored profile states after the explicit-cookie single-channel repair",
      uniqueStateKeys: 2,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/web-missing-overlays-and-inbox-compose-current/result.json",
      leafControlOccurrences: 52,
      renderedStates: 1,
      scope:
        "One authenticated Today schedule overlay state; the pre-fix Chat overlay is excluded",
      uniqueStateKeys: 1,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/chat-route-state-scope-fix-evaluator-current/manifest.json",
      leafControlOccurrences: 55,
      renderedStates: 4,
      scope:
        "Post-fix Chat empty base and Relationship Inbox overlay states at desktop/mobile widths; two base states supersede the excluded authenticated-Web observations",
      uniqueStateKeys: 4,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/authenticated-role-tenant-matrix-v2-current/manifest.json",
      leafControlOccurrences: 14,
      renderedStates: 6,
      scope:
        "Authenticated actor-A/actor-B Admin, Admin Events and fail-closed Platform states across isolated workspaces",
      uniqueStateKeys: 6,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/native-two-actor-cache-isolation-current/result.json",
      leafControlOccurrences: 72,
      renderedStates: 3,
      scope:
        "Selected non-overlapping actor-A online Contacts, actor-B online Contacts and actor-B warm-offline Contacts states; profile, repeat and pre-fix failure captures are excluded",
      uniqueStateKeys: 3,
    },
    {
      evidencePath:
        "harness-state/evidence/full-product-functional-audit/runtime-leaf-denominator/native-refresh-token-cold-cache-fix-evaluator-current/manifest.json",
      leafControlOccurrences: 48,
      renderedStates: 2,
      scope:
        "Post-fix actor-B cold initial-token offline Contacts and later-token failed-refresh preservation states; overlapping online/profile states are excluded and the 225 all-accessibility diagnostic leaf observations are non-summable",
      uniqueStateKeys: 2,
    },
  ],
  renderedStates: 279,
  scope:
    "Thirteen normalized evidence sources covering anonymous/public/authenticated/development Web, anonymous and authenticated iOS, exact dynamic/overlay states, role/workspace isolation, two-actor Contacts and repaired native cold-cache lifecycle states; stale Chat bases and overlap states are excluded, while the broader all-accessibility diagnostic remains non-summable",
  status: "state-local-observation-not-final-denominator",
  uniqueStateKeys: 273,
};

const AUDIT_EXTERNAL_LIMITATIONS = [
  {
    id: "EXT-NATIVE-AUTH-STACK-PREFETCH",
    scope: "Expo authenticated retained-route prefetch timing",
    reason:
      "Two independent native actors, logout deletion, actor-keyed SQLite ownership, warm/online/cold cache states and cross-actor non-leakage passed. The exact actor-B before-first-Contacts-network failure window was unavailable because the retained authenticated stack prefetched Contacts before the test could stop the service.",
  },
  {
    id: "EXT-ANDROID-RUNTIME",
    scope: "Expo Android",
    reason: "No Android SDK/emulator was available in the audit environment.",
  },
  {
    id: "EXT-NATIVE-BUILD",
    scope: "Standalone iOS native target",
    reason:
      "Xcode 26.1 / Swift 6.2 failed in expo-modules-jsi weak-let compilation before Orbit product code; the native runtime evidence therefore used Expo Go 57.",
  },
  {
    id: "EXT-OAUTH-PROVIDERS",
    scope: "OAuth and external integrations",
    reason:
      "No disposable real Google/OAuth or third-party provider credentials were available for success, denial and callback traversal.",
  },
  {
    id: "EXT-PRIVILEGED-PLATFORM-CAPABILITY",
    scope: "Privileged Platform success",
    reason:
      "Ordinary actor-A/actor-B Admin states and cross-workspace denial passed, but the product defines no persisted privileged Platform role or platform-wide provider. The success state is a product capability unavailable boundary rather than an inferred audit pass.",
  },
  {
    id: "EXT-PROVIDER-STATE-MATRIX",
    scope: "Party, Event and Agent provider outcomes",
    reason:
      "Real provider success/failure/concurrency states for Party, registration, attendee import, voice, match, history deletion and destructive failure were not all available without external fixtures or credentials.",
  },
  {
    id: "EXT-ASSISTIVE-TECH",
    scope: "Accessibility runtime",
    reason:
      "Manual VoiceOver/TalkBack and screen-reader announcement timing were not independently exercised.",
  },
];

const AUDIT_REMAINING_GAPS = [
  {
    id: "GAP-RUNTIME-LEAF-DENOMINATOR",
    scope: "Whole product",
    status: "still-uncovered",
    reason:
      "The rendered DOM/native-tree leaf-control denominator remains state-local and unresolved; the current route-instance, unique-source-location and normalized-static-implementation counts in this inventory must not be treated as runtime leaf counts.",
  },
  {
    id: "GAP-REMAINING-STATE-MATRICES",
    scope: "Agent, Events, Party, Admin and account surfaces",
    status: "still-uncovered",
    reason:
      "Several forced network failures, rapid duplicate activations, concurrent writes, uncommon empty/large-data states and responsive/keyboard variants remain only partially sampled; shard evidence records the exact scenario-level boundaries.",
  },
  {
    id: "GAP-ROUTE-CONTRACT-MANIFEST",
    scope: "All Web and Expo entry routes",
    status: "still-uncovered",
    reason:
      "Route-local query false positives are repaired, but the audit still lacks one authoritative route-tree contract for global shell and diagnostic query namespaces, fixed redirect targets/query/hash behavior, alias and passthrough semantics, Expo custom-scheme/legacy handling, parameter cardinality/decoders/security and per-case runtime probes. The 94 page-file nodes therefore remain an entry-node denominator rather than 94 independently proved terminal UI contracts.",
  },
];

const AUDIT_REMEDIATIONS = [
  {
    id: "AUDIT-P2-001",
    severity: "P2",
    rootCause:
      "Development capability views used button/editable-form affordances for read-only audit instructions and precomputed mock results, but supplied no handler, submission path, persistence, or feedback.",
    decision:
      "Represent non-actions as explicit verification instructions and immutable result snapshots. Keep interactive affordances only where a real handler or form action exists; do not simulate success.",
    files:
      "business-card-review-and-confirm-flow/debug-view.tsx; chat-writing-assist-mock/debug-view.tsx; followup-task-generation-mock/debug-view.tsx; message-draft-generator-mock/debug-view.tsx; reminder-schedule-and-notification-mock/debug-view.tsx; profile-onboarding-and-manual-profile-editor/debug-view.tsx",
    regression:
      "Seven focused test files pass; full audit generator reports candidateMissingHandlers=0 across 93 route surfaces; production browser DOM confirms the six affected capability IDs at desktop and 390x844 with no console warnings/errors.",
    status:
      "fixed and runtime-verified for the affected capability IDs; broader dynamic-route matrix pending",
  },
  {
    id: "AUDIT-P1-002",
    severity: "P1",
    rootCause:
      "The Harness README documented uv run pytest, but pytest was absent from the uv project dependencies, so a clean uv environment could not spawn the test runner.",
    decision:
      "Declare pytest in the uv dev dependency group and refresh uv.lock so the documented gate is self-contained.",
    files: "pyproject.toml; uv.lock",
    regression: "uv run pytest -q: 310 passed in 95.02s",
    status: "fixed",
  },
  {
    id: "AUDIT-P1-003",
    severity: "P1",
    rootCause:
      "An icon-only native send Pressable and a transient Web conversation-rename input relied on visual context without exposing an explicit accessible name.",
    decision:
      "Add platform-native explicit labels at the controls themselves and enforce a zero-candidate accessible-name denominator in the generated whole-product audit.",
    files:
      "repos/orbit-app/src/screens/home/HomeScreen.tsx; repos/orbit-app/tests/home-view-model.test.ts; repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/pages/app-agent-chat-history.test.ts; repos/orbits/tests/audits/full-product-functional-audit.test.ts",
    regression:
      "Focused Web tests: 9/9 passed; focused mobile tests: 7/7 passed; full audit inventory reports accessibleNameCandidates=0 across 93 route surfaces.",
    status:
      "fixed with static/source regression coverage; assistive-technology runtime verification pending",
  },
  {
    id: "AUDIT-P1-004",
    severity: "P1",
    rootCause:
      "The profile route success model omitted handles even though its contract allowed them; save readback compared only five fields; the Web editor offered no way to enter an industry or new tags for an empty profile; and the adapter mixed relationship goals, markets, and relationship types into unrelated editable tag groups.",
    decision:
      "Preserve profile handles at the shared route-model boundary, fill only a missing email from the authenticated actor, compare every submitted scalar/list/handle on readback, make industry free text, add custom tag entry/removal, and keep offering/seeking/topics field-local.",
    files:
      "repos/orbits/app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts; repos/orbits/app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter.ts; repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx; repos/orbits/tests/pages/app-profile-live-route-services.test.ts",
    regression:
      "Focused profile tests: 9/9 passed; production build passed; live browser save/readback/refresh showed all edited values and 100% completion; Postgres projected the correct actor-owned handles/publicProfile data; second account isolation, duplicate sign-up, and invalid-password cases passed.",
    status:
      "fixed and runtime-verified for the exercised Web live profile chain; broader profile state and mobile parity matrix pending",
  },
  {
    id: "AUDIT-P2-005",
    severity: "P2",
    rootCause:
      "The retired /app/register invite adapter only needed an event ID for its redirect, but still loaded the profile service and constructed a full registration form model that was never rendered. A stale test then depended on semantically incorrect cross-field profile options being non-empty.",
    decision:
      "Keep the compatibility route as a narrow event-code resolver: return only the event identity needed by the canonical registration redirect, preserve explicit route-state failures, and remove the unused profile/form dependency and assertions.",
    files:
      "repos/orbits/app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model.ts; repos/orbits/tests/pages/app-register-live-route-services.test.ts",
    regression:
      "Focused profile/register tests: 14/14 passed; Web full suite: 1315/1315 passed; production build passed.",
    status:
      "fixed for removing the unused profile/form dependency; the remaining default-demo, Event CRUD, and public query-control boundary was subsequently completed under AUDIT-P1-057; the canonical /app/events/[id]/register persistence chain remains runtime-verified under AUDIT-P1-006",
  },
  {
    id: "AUDIT-P1-006",
    severity: "P1",
    rootCause:
      "The registration workspace requested persona generation and persistence in parallel, ignored an unsuccessful registration response, and regenerated a non-persisted AI persona on every revisit. Cancellation posted immediately without confirmation or a durable result view. Separately, the approved future-event seed still exposed test/lab titles and descriptions, so list/detail copy diverged from registration.",
    decision:
      "Make the durable registration write a prerequisite for persona generation; return persistence failures to a recoverable interview error; show exact saved answers on refresh and regenerate derived personas only on explicit request; add an alert-dialog cancellation confirmation plus persistent cancelled/reactivation states; and align the generator plus every checked-in seed/export/runtime fixture with the canonical product event identity.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx; repos/orbits/tests/pages/app-event-registration-guide.test.tsx; repos/orbits/tests/services/local-remote-relationship-schema.test.ts; harness/relationship_data_goal_runner.py; repos/mockdata/seed/events.seed.json; repos/mockdata/generated/events.generated.json; repos/mockdata/exports/local_seed.json; repos/mockdata/exports/demo_seed.json; repos/orbits/shared/mock/generated-relationship-fixtures.ts",
    regression:
      "Focused registration page tests: 8/8 passed; Web full suite: 1315/1315 passed; mockdata validation passed with 150/150 golden hits and zero negative leaks; production build passed. Production-browser and Postgres evidence covered exact-answer save/refresh, explicit persona generation, cancel confirmation/dismiss/confirm, cancelled refresh, same-record reactivation, offline failure without a write, successful retry, and distinct B/C ownership.",
    status:
      "fixed and runtime-verified for the exercised Web live registration chain; remaining persona-provider failure, full eight-question, responsive, keyboard, and assistive-technology states pending",
  },
  {
    id: "AUDIT-P1-007",
    severity: "P1",
    rootCause:
      "The contacts import hub hard-coded business-card scanning as Active whenever the page rendered, even when the live cloud OCR provider was unconfigured. Users had to choose an image and submit it to discover the limitation. The mobile layout also represented four unavailable sources as live links back to the same route, while its Back control linked to the current page.",
    decision:
      "Resolve readiness on the authenticated server route without calling providers, require live mode plus OCR credentials plus durable contact storage before exposing upload controls, render a truthful restricted state and administrator checklist otherwise, keep all unavailable source entries disabled across viewports, and give the mobile/restricted states a real exit to /app/contacts.",
    files:
      "repos/orbits/features/acquisition/business-card-capture-availability.ts; repos/orbits/app/(app)/app/contacts/new/page.tsx; repos/orbits/app/(app)/app/contacts/orbit-real-cards-import.tsx; repos/orbits/app/(app)/app/contacts/business-card-capture-workspace.tsx; repos/orbits/tests/capabilities/business-card-capture-availability.test.ts; repos/orbits/tests/pages/app-business-card-capture-workspace.test.tsx; repos/orbits/tests/pages/app-contacts-new-live-route-services.test.ts",
    regression:
      "Focused business-card availability/UI/route/scan/write tests: 28/28 passed; production build passed; production browser rendered the disabled external-capability state and exited to 全部人脉; account-C active contact count remained 0 before and after.",
    status:
      "fixed and runtime-verified for the unconfigured production boundary; successful OCR and downstream write states remain externally restricted until a safe provider credential is configured",
  },
  {
    id: "AUDIT-P1-008",
    severity: "P1",
    rootCause:
      "The contacts list treated every synthetic source ID as an event, mapped captured contacts to active, inferred medium relationship strength without a value record, and labelled source-derived next actions as AI. The detail route also passed encoded dynamic IDs directly to storage, required a connection and relationship score for every valid contact, and classified non-event/non-external sources as external import.",
    decision:
      "Canonicalize route IDs once at the boundary; make contact identity sufficient for a successful detail while modelling relationship enrichment as available/not-recorded/pending/unavailable; add an explicit unscored presentation state; map captured contacts consistently to needs-follow-up; count only event sources; preserve evidence basis; and represent business-card provenance in the shared tag contract.",
    files:
      "repos/orbits/features/contacts/contact-graph-query.ts; repos/orbits/features/contacts/live-detail-service.ts; repos/orbits/features/contacts/contract.ts; repos/orbits/features/contacts/detail-contract.ts; repos/orbits/shared/contract/contacts.ts; repos/orbits/app/(app)/app/orbit-contacts-route-view-model.ts; repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts; repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts; repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts; repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx; repos/orbits/app/(app)/app/contacts/orbit-real-card-connection.tsx; repos/orbits/tests/pages/app-contacts-live-route-services.test.ts; repos/orbits/tests/pages/app-contact-detail-live-route-services.test.ts",
    regression:
      "Focused list/detail/store tests: 28/28 passed; lint and production build passed. Production browser and Postgres evidence covered three-vs-one account isolation, two distinct same-name search results, source-only detail plus refresh/back, exact provenance, zero fabricated event/AI/strength claims, and four idempotent service replays with no new writes.",
    status:
      "fixed and runtime-verified for the exercised Web live list/detail chain; enriched-relationship, responsive, keyboard, assistive-technology, and injected service-failure cases pending",
  },
  {
    id: "AUDIT-P1-009",
    severity: "P1",
    rootCause:
      "Expo profile/account/bootstrap view models replaced missing or named identities with a hard-coded Xiaoyu/founder profile and rendered those values while signed out; signup, relationship-preview, and contact-note helpers also inserted the same fixed identity. Expo Web then could not complete real auth because the mobile bridge returned but did not set a browser cookie, credentialed CORS was disabled, SecureStore was required on Web, and the native SQLite snapshot initialization blocked requests. Finally, the account sign-out route returned a signed-out payload without expiring Auth.js cookies, while live account/bootstrap services fabricated missing profile fields.",
    decision:
      "Keep profile/account mappings faithful and sparse; render authentication boundaries before resource states; use HttpOnly browser cookies plus explicit-origin credentialed CORS on Web and SecureStore only on native; bypass native SQLite snapshots on Web; expire all standard and chunked Auth.js session cookies on sign-out; and preserve missing live profile fields as missing rather than inserting product-implementation copy.",
    files:
      "repos/orbit-app/src/view-models/profile.ts; repos/orbit-app/src/view-models/account-session.ts; repos/orbit-app/src/view-models/bootstrap.ts; repos/orbit-app/src/view-models/connections-graph.ts; repos/orbit-app/src/view-models/contacts.ts; repos/orbit-app/src/screens/profile/ProfileScreen.tsx; repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx; repos/orbit-app/src/screens/profile/AccountScreen.tsx; repos/orbit-app/src/api/mobile-auth.ts; repos/orbit-app/src/api/AuthSessionProvider.tsx; repos/orbit-app/src/data/snapshot-store.ts; repos/orbit-app/src/data/snapshot-store.web.ts; repos/orbits/app/api/auth/mobile/http.ts; repos/orbits/app/api/auth/mobile/credentials/route.ts; repos/orbits/app/api/auth/mobile/google/exchange/route.ts; repos/orbits/app/api/account/session/sign-out/route.ts; repos/orbits/features/account/live-service.ts; repos/orbits/features/bootstrap/live-service.ts; repos/orbits/next.config.js",
    regression:
      "Expo full suite: 520/520 passed; Web full suite: 1328/1328 passed; full audit: 7/7 passed; Expo typecheck and production Next build passed. A fresh Expo Web bundle loaded /profile without resolving expo-sqlite or emitting the prior wasm-worker failure. Runtime verified signed-out privacy, account-C login/readback, hard-navigation session restore, truthful missing fields, real cookie invalidation, and private hard navigation after sign-out.",
    status:
      "fixed and runtime-verified for Expo Web credentials/profile/account/sign-out; native device, Google OAuth, offline, responsive, and assistive-technology cases pending",
  },
  {
    id: "AUDIT-P1-010",
    severity: "P1",
    rootCause:
      "The Expo permissions page rendered a raw authenticated-API 401 while signed out, hid the calendar-review action when an account had no permission rows, and returned a transient pending response without writing it. Separately, the global API auth proxy rejected credential-free CORS OPTIONS requests, so every cross-origin JSON write failed before its authenticated request could run.",
    decision:
      "Gate private permission content on the validated auth session; expose review from the truthful empty state; persist one stable account/capability requested record through the permission provider; preserve actor scoping in the service factory; and return a data-free 204 for API preflight while keeping every real business method behind the existing proxy and route actor checks.",
    files:
      "repos/orbit-app/src/screens/profile/AccountPermissionsScreen.tsx; repos/orbit-app/src/view-models/permissions.ts; repos/orbits/features/permissions/live-service.ts; repos/orbits/features/permissions/service-factory.ts; repos/orbits/features/permissions/storage/permission-live-record-provider.ts; repos/orbits/proxy.ts; permission and proxy regression tests",
    regression:
      "Focused Expo route/permission tests 9/9, live permission tests 5/5, proxy tests 3/3, Expo typecheck, and two production builds passed. Runtime proved 204 preflight, successful POST, refresh/re-login persistence, signed-out privacy, stable retry, and two-account isolation.",
    status:
      "fixed and runtime-verified for Expo Web staged calendar review; native provider grants/denials and OS permission prompts remain pending",
  },
  {
    id: "AUDIT-P1-011",
    severity: "P1",
    rootCause:
      "The legacy-path resolver was only called from the root route via an environment variable. Real incoming Expo Router links such as /explore, /home/cards, and /app/home/cards bypassed it and rendered the default English Unmatched Route.",
    decision:
      "Add one root catch-all Expo route that reconstructs non-route query parameters and delegates exclusively to the existing allowlisted resolver. Canonical static/dynamic routes retain precedence; known legacy paths preserve query context; unknown paths converge on /ai.",
    files:
      "repos/orbit-app/app/[...legacy].tsx; repos/orbit-app/src/view-models/initial-route.ts; repos/orbit-app/tests/initial-route.test.ts",
    regression:
      "Initial-route tests 6/6 and Expo typecheck passed. Runtime cold navigations verified four legacy aliases with query preservation, canonical current routes, and unknown-route recovery to /ai.",
    status:
      "fixed and runtime-verified on Expo Web; custom-scheme iOS/Android device delivery remains pending",
  },
  {
    id: "AUDIT-P1-012",
    severity: "P1",
    rootCause:
      "The live external-import service assigned every external network person to phone, Google Contacts, CSV, or customer-list by rotating or hashing the person's ID, then labelled all four source summaries authorized/uploaded/connected even when the authenticated account had zero candidates. The mobile page therefore presented invented integration state.",
    decision:
      "Require stored external-contact provenance to declare both source.type=external_contacts and an allowlisted externalSourceKind before it can become an import candidate. Never infer source kind from identity. For a source with no actor-owned proven candidates, emit live-not-connected and render 未连接; keep source chips as local filters and disable import at zero candidates.",
    files:
      "repos/orbits/features/acquisition/external-import-contract.ts; repos/orbits/features/acquisition/storage/external-import-live-record-provider.ts; repos/orbits/features/acquisition/live-external-import-service.ts; repos/orbit-app/src/view-models/contact-acquisition.ts; external-import and mobile view-model tests",
    regression:
      "Focused live external-import tests 7/7, mobile acquisition view-model tests 19/19, Expo typecheck, and production build passed. Runtime verified four 未连接 states, zero fake authorization/upload/connection labels, filter-only behavior, and disabled import for an empty actor.",
    status:
      "fixed and runtime-verified for the empty live-source state; real provider/file connection and successful import remain externally unconfigured",
  },
  {
    id: "AUDIT-P1-013",
    severity: "P1",
    rootCause:
      "The Expo API client passed every valid server error message straight into 16 mobile presentation surfaces. Stable server contracts are English, so the live business-card failure displayed raw backend copy in an otherwise Chinese product. The selected Image also emitted a React Native Web resizeMode deprecation warning.",
    decision:
      "Localize failure envelopes once at the mobile API boundary while preserving stable error codes, structured context, HTTP status, and any already-localized Chinese message. Use business-card context for precise recovery copy and stable app-error categories for safe Chinese fallbacks. Declare Image resizeMode through its supported prop.",
    files:
      "repos/orbit-app/src/api/client.ts; repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx; repos/orbit-app/tests/api-client.test.ts; repos/orbit-app/tests/contact-acquisition-screen.test.ts",
    regression:
      "API client/session/contact-acquisition focused tests 33/33 and Expo typecheck passed. Runtime verified both Web media inputs, selected-image preview, localized unconfigured-OCR failure, zero candidate/draft persistence after hard navigation, and zero new console warnings/errors.",
    status:
      "fixed and runtime-verified for the Expo Web media and unconfigured-OCR path; native OS permissions, configured OCR success, and other feature-specific server failures remain pending",
  },
  {
    id: "AUDIT-P1-014",
    severity: "P1",
    rootCause:
      "The QR scanner awaited a system camera permission Promise without a visible pending state or cancellation identity. If the user changed source mode or the screen unmounted before the prompt resolved, a late grant could still set qrCameraOpen and reopen a hidden scanner when QR mode was visited again.",
    decision:
      "Give each QR permission request a monotonically increasing request id; ignore late results after mode changes, close actions, or unmount; expose a disabled 等待相机权限 state during the browser/OS prompt; and keep every source-mode change responsible for closing scanner state.",
    files:
      "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx; repos/orbit-app/tests/contact-acquisition-screen.test.ts",
    regression:
      "QR contact-acquisition source tests 16/16 and Expo typecheck passed. Runtime verified the disabled waiting label, continued page usability, mode-switch cancellation, no residual video element, and zero draft write while the in-app browser prompt remained unresolved.",
    status:
      "fixed and runtime-verified for the Expo Web pending/cancellation state; native grant, denial, settings recovery, physical QR decode, and lifecycle interruption remain pending on devices",
  },
  {
    id: "AUDIT-P2-015",
    severity: "P2",
    rootCause:
      "The shared mobile back control was 36×36, while contact-acquisition mode controls were 42 points high and its media/close controls were 40 points high. These interactive targets fell below the product's 44-point mobile touch baseline.",
    decision:
      "Raise the shared AppScreen back target and every affected contact-acquisition control to a real 44-point minimum while preserving the existing icon, copy, spacing, and interaction handlers. Lock the shared and local baselines with source tests.",
    files:
      "repos/orbit-app/src/components/AppScreen.tsx; repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx; repos/orbit-app/tests/app-screen-touch-targets.test.ts",
    regression:
      "Touch-target/contact-acquisition tests 18/18 and Expo typecheck passed. Browser bounding boxes measured 44×44 for shared back and 44 px height for all visible source and media controls.",
    status:
      "fixed and runtime-verified at the host CSS viewport; narrow-width breakpoint, dynamic type, orientation, and device assistive-touch cases remain pending",
  },
  {
    id: "AUDIT-P2-016",
    severity: "P2",
    rootCause:
      "Contact-acquisition source choices expressed selection through color only. Adding accessibilityState alone did not produce aria-selected or aria-checked in the installed React Native Web runtime, leaving Web assistive technology without the active choice.",
    decision:
      "Model the three acquisition modes as tablist/tab with native selected state and explicit aria-selected. Model external and referral filters as radiogroup/radio with native checked state and explicit aria-checked. Verify the rendered DOM rather than trusting source props.",
    files:
      "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx; repos/orbit-app/tests/contact-acquisition-screen.test.ts",
    regression:
      "Contact-acquisition tests 16/16 and Expo typecheck passed. Runtime DOM proved one selected tab, two radio groups, checked 全部 defaults, and explicit false values for every unselected source.",
    status:
      "fixed and runtime-verified on Expo Web; VoiceOver, TalkBack, keyboard activation, and device gesture announcements remain pending",
  },
  {
    id: "AUDIT-P2-017",
    severity: "P2",
    rootCause:
      "Mobile contact-acquisition runtime evidence was keyed only by source line. Adding unrelated accessibility props shifted line numbers, silently removed five verified interactions, and a first handler-only replacement ambiguously attached SourceChip evidence to another generic onPress.",
    decision:
      "Resolve this surface's runtime evidence by the stable tuple of source file, normalized event-handler expression, and visible-name expression, with legacy line keys retained only as a compatibility fallback for older evidence maps. Regenerate and inspect every matched interaction before updating denominators.",
    files:
      "repos/orbits/scripts/generate-full-product-functional-audit.mjs; repos/orbits/tests/audits/full-product-functional-audit.test.ts; generated audit inventory",
    regression:
      "Generator syntax, 94-surface/2817-interaction regeneration, and exact projection of six intended mobile contact interactions passed; the ambiguous seventh match was eliminated and the verified denominator returned to 26.",
    status:
      "fixed for the mobile contact-acquisition evidence map; older historical maps still retain line-key compatibility and must be migrated when their source changes",
  },
  {
    id: "AUDIT-P1-018",
    severity: "P1",
    rootCause:
      "Several Expo event and invite entries replaced a missing route parameter with demo-event-1. A user could therefore open a route with no event identity and see a plausible but unrelated event instead of a missing-selection boundary.",
    decision:
      "Treat a missing dynamic identity as missing input. Render an explicit selection state with a real route back to the event catalogue, and reserve event loading for a non-empty ID supplied by navigation or deep link.",
    files:
      "repos/orbit-app/src/screens/register/RegisterInviteScreen.tsx; repos/orbit-app/src/screens/events/EventDetailScreen.tsx; repos/orbit-app/src/view-models/bootstrap.ts; route and screen-state tests",
    regression:
      "Expo production-route traversal, invite/detail source regressions, initial-route tests, and Expo typecheck passed. Missing input no longer resolves demo-event-1.",
    status:
      "fixed for the audited Expo route tree; custom-scheme delivery remains pending on devices",
  },
  {
    id: "AUDIT-P1-019",
    severity: "P1",
    rootCause:
      "The mobile acquisition result called a candidate 已确认 and then said the next step was to write it into contacts even when the response contained no authorized contact-write capability. This blurred candidate confirmation with contact creation.",
    decision:
      "Derive result copy from both confirmation state and contact-write availability. When the write contract is absent, state explicitly that the current flow will not create a contact; keep any real contact write behind a separate explicit confirmation.",
    files:
      "repos/orbit-app/src/view-models/contact-acquisition.ts; repos/orbit-app/tests/contact-acquisition-view-model.test.ts",
    regression:
      "Acquisition view-model and screen tests plus Expo typecheck passed. The confirmed/no-write branch no longer promises contact creation.",
    status:
      "fixed with source regression coverage; authorized manual contact persistence remains a separate flow",
  },
  {
    id: "AUDIT-P1-020",
    severity: "P1",
    rootCause:
      "Mobile event display allowed source metadata to override the real title and organizer, registration loaders fetched private events without the authenticated actor, and a real event with no attendee provider surfaced raw NOT_FOUND states beside import actions.",
    decision:
      "Preserve event fields by business meaning; pass the authenticated actor into every registration event load; and distinguish an existing event with no roster source from a missing event. The no-roster state withholds all attendee import/write actions.",
    files:
      "repos/orbit-app/src/view-models/events.ts; repos/orbit-app/src/screens/events/EventDetailScreen.tsx; repos/orbit-app/src/screens/events/EventAttendeesScreen.tsx; repos/orbits/features/events/registration/event-loader.ts; registration route handlers and tests",
    regression:
      "Event source tests, registration actor-scope tests, Expo typecheck, and authenticated Expo Web runtime passed. A real private event preserved its identity, one actor-scoped registration survived save/cancel refresh, and no-roster UI exposed no import action.",
    status:
      "fixed and runtime-verified for the current actor-owned event; configured roster import remains pending",
  },
  {
    id: "AUDIT-P1-021",
    severity: "P1",
    rootCause:
      "Each mobile AI history row used a Pressable row that contained a second Pressable delete action. React Native Web rendered nested HTML buttons, causing invalid HTML, hydration errors, and ambiguous accessible action structure.",
    decision:
      "Use a non-interactive row container with separate sibling Pressables for open and delete. Give the open action a title-specific accessible label and both actions a 44-point target.",
    files:
      "repos/orbit-app/src/screens/ai/AiScreen.tsx; repos/orbit-app/tests/ai-home-screen-copy.test.ts",
    regression:
      "AI source regression, Expo typecheck, and authenticated browser DOM/console traversal passed. A real history item opened its persisted conversation and repeated drawer use emitted no new hydration errors.",
    status:
      "fixed and runtime-verified for open/history hydration; destructive deletion was not exercised",
  },
  {
    id: "AUDIT-P1-022",
    severity: "P1",
    rootCause:
      "Party mode deterministically synthesized an event access code ending in 4821 and kept local check-in state that rendered 已签到 without calling a validation or persistence service.",
    decision:
      "Remove access-code generation and local success state. Describe the currently available event/roster relationship data, and surface an explicit unavailable boundary until a real code-validation and check-in-write contract exists.",
    files:
      "repos/orbit-app/src/view-models/party.ts; repos/orbit-app/src/screens/party/PartyModeScreen.tsx; party view-model and source tests",
    regression:
      "Expo full suite and typecheck passed after the removal. Source regressions prohibit synthetic codes/local success, and runtime with a no-roster event rendered only the truthful unavailable boundary.",
    status:
      "fixed for the current no-service state; real code validation and check-in persistence are not implemented",
  },
  {
    id: "AUDIT-P1-023",
    severity: "P1",
    rootCause:
      "The Expo organizer page ignored its public slug, read the authenticated actor's private /api/events collection, selected the first event as fallback, and used source-note metadata as the organizer identity. Unknown slugs could therefore look valid and private events could appear on a public-facing page.",
    decision:
      "Expose an approved-catalogue projection through a dedicated events/public endpoint, bind the Expo organizer view to that projection and exact slug, prefer explicit organizer identity, remove first-event fallback on both clients, and withhold verified state for unknown slugs.",
    files:
      "repos/orbits/app/api/events/public/route.ts; repos/orbit-app/src/api/endpoints.ts; repos/orbit-app/src/screens/organizer/OrganizerPublicScreen.tsx; organizer view-models and route tests",
    regression:
      "Public-events route tests, Expo and Web organizer tests, Expo typecheck, exact-origin CORS preflight, production build, and browser known/unknown-slug traversal passed. The private audit event did not appear.",
    status:
      "fixed and runtime-verified for authenticated Expo Web consumption of public catalogue data; anonymous transport is not claimed",
  },
  {
    id: "AUDIT-P1-024",
    severity: "P1",
    rootCause:
      "The mobile schedule view-model duplicated event title normalization and always preferred sourceMetadata.label. Manual events use that label for provenance notes, so the schedule replaced a real title with an audit/source description even though the event list and detail were correct.",
    decision:
      "Delete the schedule-specific title parser and consume the canonical EventSummary.title already produced by eventsToSummaries. Keep raw event records only for timestamps and filtering; do not maintain a second field-precedence policy.",
    files:
      "repos/orbit-app/src/view-models/schedule.ts; repos/orbit-app/tests/schedule-view-model.test.ts",
    regression:
      "Focused schedule tests 4/4, Expo full suite 520/520, and Expo typecheck passed. Runtime before/after evidence proved that the same live private event changed from its source note back to 功能审计私有活动 20260729 on both schedule cards and in the detail preview.",
    status:
      "fixed and runtime-verified for the actor-owned event schedule chain",
  },
  {
    id: "AUDIT-P2-025",
    severity: "P2",
    rootCause:
      "The mobile health presentation mapper generated English success/fallback copy and included the internal service identifier orbit-runtime, so a successful check broke the Chinese settings experience and leaked an implementation label.",
    decision:
      "Keep the health API contract unchanged and localize only the mobile presentation boundary. Map status=ok to stable Chinese user feedback and map unknown payloads to a controlled Chinese response without exposing service names.",
    files:
      "repos/orbit-app/src/view-models/health.ts; repos/orbit-app/tests/health-view-model.test.ts",
    regression:
      "Focused health tests 2/2 and Expo typecheck passed. Runtime health check against http://localhost:3110 rendered 服务器可用 / Orbit 服务响应正常，可以继续使用。 with no English or orbit-runtime copy.",
    status:
      "fixed and runtime-verified for the reachable-server state; unreachable and malformed-response runtime cases remain pending",
  },
  {
    id: "AUDIT-P1-026",
    severity: "P1",
    rootCause:
      "Mobile password recovery had no email provider, verification-code service, or password-reset persistence, but pressing 发送验证码 unconditionally advanced local forgotStep state—even with an empty email—and rendered code/new-password inputs. A test explicitly locked in this fake second step.",
    decision:
      "Align mobile recovery with the already fail-closed Web boundary. Remove forgotStep, code, and new-password models; collect no email when no provider exists; render one explicit statement that nothing was sent; and expose exactly one return-to-login action.",
    files:
      "repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx; repos/orbit-app/src/view-models/account-auth.ts; account-auth source and view-model tests",
    regression:
      "Account-auth focused tests 10/10, Expo full suite 520/520, and Expo typecheck passed. Runtime before/after evidence changed the empty-email fake verification form into a field-free restricted state whose sole action returned to login.",
    status:
      "fixed and runtime-verified for the unconfigured provider state; real password recovery requires an email/code/persistence provider before any input form is restored",
  },
  {
    id: "AUDIT-P1-027",
    severity: "P1",
    rootCause:
      "The mobile admin entry simulated magic-link delivery with local sent state; the events surface advertised a draft creator whose confirm button only closed the card; and the member mapper fabricated @orbit.local email addresses when profile data contained no email. Event context also leaked storage implementation wording.",
    decision:
      "Use the validated account session as the only mobile admin entry, remove every unwired mail/create action, preserve only actor-owned read-only event navigation, reject implementation labels at presentation time, and render no member row unless the API supplies an explicit email.",
    files:
      "repos/orbit-app/src/screens/admin/AdminLoginScreen.tsx; repos/orbit-app/src/screens/admin/AdminScreen.tsx; repos/orbit-app/src/view-models/admin.ts; admin source and view-model tests",
    regression:
      "Admin source/view-model tests, Expo full suite 522/522, and Expo typecheck passed. Runtime verified the account-backed entry, real event-detail navigation, no create action, Chinese event context, and explicit empty-member boundary.",
    status:
      "fixed and runtime-verified for the signed-in read-only admin path; signed-out browser runtime, role assignment, mail delivery, event writes, and member administration remain unimplemented",
  },
  {
    id: "AUDIT-P1-028",
    severity: "P1",
    rootCause:
      "The mobile platform page read the current actor's private events, profile, and dashboard, relabelled them as platform-wide public/moderation/account data, marked every non-ended event pending review, generated 已认证 account state, and simulated approve/reject/publish success by hiding rows in local state. Public IDs then linked into an actor-private detail API and produced a not-found screen.",
    decision:
      "Bind the surface exclusively to the dedicated public catalogue, derive only catalogue counts and temporal states, remove personal metrics/account synthesis/local decisions, localize public source context, state the missing moderation/account contracts explicitly, and keep records non-interactive until a compatible public-detail route exists.",
    files:
      "repos/orbit-app/src/screens/platform/PlatformScreen.tsx; repos/orbit-app/src/view-models/platform.ts; platform source and view-model tests",
    regression:
      "Platform focused tests 7/7, Expo full suite 524/524, and Expo typecheck passed. Runtime verified 13 public records, 3 current/10 ended counts, private-event isolation, Chinese context, zero fake moderation/account controls, and zero broken record buttons.",
    status:
      "fixed and runtime-verified for the public-catalogue read-only boundary; real platform moderation, account directory, and public detail navigation require authenticated service contracts",
  },
  {
    id: "AUDIT-P1-029",
    severity: "P1",
    rootCause:
      "The production Expo Agent center fetched the external-action sandbox audit alongside the real actor-scoped action queue. That sandbox's live implementation clones fixed fixture people, scenarios, evidence, timestamps, pending actions, and audit rows, so an account with zero actions still saw Maya, Diego, and Aiko as if they were current relationship work.",
    decision:
      "Remove the external-action sandbox API, state, decision handlers, confirmation buttons, audit history, and presentation styles from the production Agent screen. Keep only /api/agent/actions and the shared fixed safety policy; retain the sandbox service/view-model for explicit development capability testing rather than user data.",
    files:
      "repos/orbit-app/src/screens/ai/AgentActionsScreen.tsx; repos/orbit-app/tests/agent-actions-screen-source.test.ts",
    regression:
      "Agent focused tests 5/5, Expo full suite 524/524, and Expo typecheck passed. Runtime before/after evidence changed the real-zero-plus-fixed-sandbox page into a truthful zero-action state with no fixture identity, English rationale, confirmation control, or prebuilt history.",
    status:
      "fixed and runtime-verified for the actor-scoped empty state; decisions over populated real Agent actions remain pending runtime data",
  },
  {
    id: "AUDIT-P1-030",
    severity: "P1",
    rootCause:
      "The actor-scoped live relationship search store generated three suggestions unconditionally, even when its graph produced zero relationship results. It then used suggestion IDs as provenance evidence, so a zero-contact account saw fixed prompts labelled as coming from recorded relationship evidence.",
    decision:
      "Derive live suggestions only when the same actor graph yields at least one relationship result. Preserve the three supported templates for populated graphs, but return the contract's empty suggestion state and zero evidence for an empty graph.",
    files:
      "repos/orbits/features/search/live-service.ts; repos/orbits/tests/capabilities/relationship-natural-search-live-store.test.ts",
    regression:
      "Actor-scoped live-store tests 3/3, exact-origin production build, Next TypeScript, and CORS preflight passed. Tests prove the owner graph retains suggestions while the other empty actor receives state=empty and zero suggestions; runtime /contacts/list removed the three false evidence cards.",
    status:
      "fixed and runtime-verified for the empty actor graph; populated actor suggestion selection and result navigation remain pending runtime data",
  },
  {
    id: "AUDIT-P2-031",
    severity: "P2",
    rootCause:
      "The mobile inbox default-draft helper used 您好 as a fallback participant name and then appended ，您好： unconditionally, producing 您好，您好： whenever the composer had no seeded recipient.",
    decision:
      "Build the greeting as its own semantic branch: use 姓名，您好： only for a non-empty trimmed participant name, otherwise use one generic 您好：. Keep subject and body defaults unchanged.",
    files:
      "repos/orbit-app/src/view-models/relationship-inbox.ts; repos/orbit-app/tests/relationship-inbox-view-model.test.ts",
    regression:
      "The regression test covers both blank and trimmed named recipients. Expo full suite 525/525 and typecheck passed; runtime composer rendered 您好： and blank-recipient creation still failed closed with 先写收件人。",
    status: "fixed and runtime-verified for blank and named default greetings",
  },
  {
    id: "AUDIT-P1-032",
    severity: "P1",
    rootCause:
      "The authenticated Web Home adapter hard-coded every actor-owned event as an RSVP and counted raw event records under a registration label. The dynamic detail page also forwarded the percent-encoded route segment directly to the live event service, so colon-delimited private IDs returned not found.",
    decision:
      "Reuse the shared event projection on both Home surfaces, label the summary as events unless a registration source proves otherwise, and decode the dynamic route segment exactly once at the page boundary before service lookup.",
    files:
      "repos/orbits/app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx; repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts; repos/orbits/app/(app)/app/events/[id]/page.tsx; focused route-service tests",
    regression:
      "Focused Web tests 33/33, Next TypeScript, and production build passed. Runtime Home and Home Events both opened event:live-record:20260729 through its encoded URL and the detail read the actor's real cancelled registration as 重新报名.",
    status:
      "fixed and runtime-verified for one colon-delimited actor-owned event and cancelled-registration readback; populated registration-summary aggregation remains source-tested",
  },
  {
    id: "AUDIT-P1-033",
    severity: "P1",
    rootCause:
      "The private-event projection invented Orbit as organizer/host, converted one recommendation into a confirmed attendee, and defaulted RSVP state to true. When no matchmaking record existed, the detail exposed the raw English service error Event not found.",
    decision:
      "Default unsupported organizer, roster, and registration claims to absent/zero/false; render a non-link pending organizer boundary; keep recommendations separate from attendees; and translate matchmaking failures into stable product copy at the presentation boundary.",
    files:
      "repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts; repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx; repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx; focused route-service tests",
    regression:
      "Focused Web tests 33/33, Next TypeScript, exact-origin production build, and authenticated browser refresh passed. The private detail rendered 主办方待确认 with no link, 参会者 0, 重新报名, and 当前活动暂时没有可用的撮合数据。",
    status:
      "fixed and runtime-verified for missing organizer, roster, and matchmaking sources; populated source-backed variants remain pending real records",
  },
  {
    id: "AUDIT-P1-034",
    severity: "P1",
    rootCause:
      "The shared Web meeting modal reused schedule connections as if they were contacts, so a private event appeared as the only person to meet. It also hard-coded a past date and exposed a Send invite button whose handler only closed the modal without creating a meeting, writing relationship history/calendar data, or delivering an invitation.",
    decision:
      "Remove every unsupported form field and fake success action from the shared modal. Keep the trigger as an inspectable product boundary that names the missing meeting, relationship-history, calendar, and invitation contracts, with one local close action.",
    files:
      "repos/orbits/app/(app)/app/today/orbit-today-time-spine.tsx; repos/orbits/tests/pages/app-today-merged.test.ts",
    regression:
      "Today/Followups/Schedule focused tests 55/55, Next TypeScript, exact-origin production build, and authenticated browser before/after traversal passed. The private event, fixed date, topic field, and Send invite action disappeared; only the explicit no-write boundary and 知道了 remained.",
    status:
      "fixed and runtime-verified for Web Today; the shared Followups legacy renderer is source-tested, while real meeting creation remains unimplemented",
  },
  {
    id: "AUDIT-P0-035",
    severity: "P0",
    rootCause:
      "The Agent conversation-session routes accepted unauthenticated list, save, read, and delete requests, while the live provider stored every account under one deployment-wide workspace ID. Any caller could therefore enumerate or delete shared histories, and authenticated users saw sessions belonging to unrelated actors.",
    decision:
      "Resolve the canonical authenticated API actor before any provider access and derive an injective actor subworkspace for every session and message operation. Cache configured providers by actor, keep mock storage shared only beneath the same actor partition, and leave legacy unscoped records invisible rather than guessing ownership.",
    files:
      "repos/orbits/app/api/ai/conversations/sessions/route.ts; repos/orbits/app/api/ai/conversations/sessions/handler.ts; repos/orbits/app/api/ai/conversations/sessions/[id]/route.ts; repos/orbits/app/api/ai/conversations/sessions/[id]/handler.ts; repos/orbits/features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts; repos/orbits/features/orbit-ai/storage/orbit-agent-chat-session-provider-factory.ts; focused Agent session API/live-store tests",
    regression:
      "Focused Agent tests 6/6, Web lint, Next TypeScript, and exact-origin production build passed. The authenticated audit actor changed from 13 unrelated histories to an empty actor-scoped sidebar; unauthenticated GET and DELETE returned 401; Alice/Bob same-ID isolation and deletion safety passed.",
    status:
      "fixed and runtime-verified for the exercised actor, unauthenticated list/delete boundary, and same-ID provider isolation; populated post-fix multi-account browser readback remains pending",
  },
  {
    id: "AUDIT-P0-036",
    severity: "P0",
    rootCause:
      "The authenticated Web Chat page composed its conversation, writing-assist, summary/extraction, privacy, and URL-prompt services without the signed-in actor. Although the HTTP Chat routes already authenticated and selected actor-scoped providers, the server-rendered page bypassed those boundaries and read the deployment-wide workspace directly.",
    decision:
      "Authenticate in the Chat server page, redirect before data access when no actor exists, and pass the canonical actor through one page-level bundle that scopes all four Chat services together. Use the same actor for Chat-triggered Agent prompts, preserve mock-mode fixtures for tests, and resolve requested conversation IDs only inside the actor-scoped list.",
    files:
      "repos/orbits/app/(app)/app/chat/page.tsx; repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts; repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts; focused Chat page/route tests",
    regression:
      "Chat/Agent focused tests 21/21, Web lint, Next TypeScript, and exact-origin production build passed. Runtime changed from more than 40 unrelated conversations with full message/context/summary/privacy data to the actor's empty state; conversation_seed_069 was rejected and Reload preserved the empty state.",
    status:
      "fixed and runtime-verified for the exercised empty actor, legacy conversation ID denial, and recovery navigation; populated post-fix multi-account browser readback remains pending",
  },
  {
    id: "AUDIT-P1-037",
    severity: "P1",
    rootCause:
      "The introduction composer always rendered its search field and mapped contact list, even when the actor had zero contacts. Selecting either contact slot therefore opened an apparently interactive picker with no result, no explanation, and no recovery path.",
    decision:
      "Branch the picker on the actor-scoped contact denominator. With zero contacts, hide the meaningless search field, state that two source-backed contacts are required, and link to the fail-closed import hub. With contacts present but no search match, keep a distinct no-match status.",
    files:
      "repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx; repos/orbits/tests/pages/app-contacts-subroutes-live-route-services.test.ts",
    regression:
      "Contacts subroute/live tests 11/11, Web lint, Next TypeScript, and exact-origin production build passed. Runtime reproduced the blank picker before repair, then rendered 还没有可选择的联系人, the two-contact prerequisite, and 添加联系人; the recovery link opened the import hub without creating data.",
    status:
      "fixed and runtime-verified for the zero-contact picker and recovery link; populated no-search-match copy is source-tested, while successful two-contact selection and draft readback remain pending real actor data",
  },
  {
    id: "AUDIT-P1-038",
    severity: "P1",
    rootCause:
      "The canonical /app/dashboard entry had been replaced with a redirect to the unrelated Party experience even though product design, navigation, AI actions, and the retained dashboard model all identified it as the relationship dashboard. The retained live service factory was deployment-global, so restoring the page without repairing composition would have crossed actor boundaries. Its zero-contact aggregate also treated an empty coverage denominator as 100 and emitted opportunity-oriented English actions with no supporting relationship data.",
    decision:
      "Restore the real dashboard page behind canonical authentication, derive one actor-scoped service bundle before every live read, and pass the same actor through aggregate and summary composition. Define empty relationship coverage as 0, emit no current-goal match without an opportunity or dormant contact, and render localized prerequisite guidance when the actor has no relationship data.",
    files:
      "repos/orbits/app/(app)/app/dashboard/page.tsx; repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts; repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model.ts; repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-view-model-adapter.ts; repos/orbits/app/(app)/app/dashboard/orbit-real-dashboard.tsx; repos/orbits/features/dashboard/live-distribution-service.ts; repos/orbits/features/dashboard/live-opportunity-service.ts; focused Dashboard tests",
    regression:
      "Focused Dashboard tests 10/10, Web lint, and exact-origin production build passed. Authenticated runtime changed the Party redirect into the canonical relationship dashboard; the empty actor rendered all counts at zero, coverage 0, no fabricated current goal, and localized no-data next-action guidance.",
    status:
      "fixed and runtime-verified for route identity, the exercised empty actor, zero denominator, and no-data presentation; populated multi-account browser isolation, metric calculations, opportunity navigation, and follow-up readback remain pending real actor data",
  },
  {
    id: "AUDIT-P1-039",
    severity: "P1",
    rootCause:
      "The Event Detail aggregate treated every child capability's EVENT_NOT_FOUND result as a route failure even after the canonical base event had loaded successfully. Event Detail masked that semantic error with a list fallback, but Party, Check-in, and Graph consumed the aggregate directly and presented missing attendee/recommendation records as Party could not load. Their route-state copy was English in the Chinese product, conflated no event selection with a selected event lacking people context, and reduced the selected event to a boolean, so recovery discarded its ID and opened the unrelated public catalogue.",
    decision:
      "Classify only the six explicit composed-context EVENT_NOT_FOUND codes as an empty boundary after base-event success; preserve unconfigured storage, controlled failures, and base-event absence as failures. Carry the resolved language and exact event ID through the Party route model, distinguish no selection from missing reviewed people context, localize the no-write boundary, and encode the event ID into a Return to current event recovery action.",
    files:
      "repos/orbits/app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service.ts; repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts; repos/orbits/app/(app)/app/party/page.tsx; repos/orbits/app/(app)/app/party/checkin/page.tsx; repos/orbits/app/(app)/app/party/graph/page.tsx; focused Event Detail and Party tests",
    regression:
      "Focused Event Detail and Party tests 22/22, Web lint, and exact-origin production build passed. Production runtime changed all three real-event entries from English Party could not load to localized Party 尚未就绪, kept the no-event state distinct, exposed the missing-context evidence, and returned each route to /app/events/event%3Alive-record%3A20260729.",
    status:
      "fixed and runtime-verified for missing selection, missing composed context, Chinese boundary, evidence disclosure, and exact recovery across Party, Check-in, and Graph; populated Party success-state controls remain pending real reviewed attendee/recommendation records",
  },
  {
    id: "AUDIT-P1-040",
    severity: "P1",
    rootCause:
      "The dynamic Schedule Event page forwarded Next.js's percent-encoded route segment directly into the actor-scoped event service. Colon-delimited live IDs therefore produced EVENTS_EVENT_NOT_FOUND even though the same event was visible in Today and Event Detail. The unauthenticated return path also encoded the unresolved segment, risking a second layer of encoding.",
    decision:
      "Decode and trim the dynamic segment exactly once in a pure route-ID helper at the page boundary. Reuse that canonical ID for both the authenticated service input and the encoded login return path; keep the route view model responsible only for semantic trimming and actor-scoped lookup.",
    files:
      "repos/orbits/app/(app)/app/schedule/events/[id]/page.tsx; repos/orbits/app/(app)/app/schedule/events/[id]/schedule-event-route-id.ts; repos/orbits/tests/pages/app-schedule-route-services.test.ts",
    regression:
      "Focused Schedule tests 10/10, Web lint, and exact-origin production build passed. Production runtime changed the encoded private-event URL from EVENTS_EVENT_NOT_FOUND to a source-backed preview, and both recovery actions reached their canonical destinations without writes.",
    status:
      "fixed and runtime-verified for one colon-delimited actor-owned event and both recovery actions; malformed fallback is unit-tested, while unauthenticated browser return and other dynamic ID shapes remain pending",
  },
  {
    id: "AUDIT-P1-041",
    severity: "P1",
    rootCause:
      "Natural-language Playbook compilation made one unconstrained provider attempt and treated any strict-schema mismatch as terminal. In the configured production provider, a valid Chinese daily-review request returned an invalid shape, so Settings exposed an error and could not produce a reviewable draft even though the capability and safety policy were known.",
    decision:
      "Keep the existing strict parser, capability whitelist, trigger validator, and read-only instruction boundary unchanged. When the provider succeeds but the schema fails, make exactly one correction attempt with the required nested JSON shape and explicit safety reminder; fail closed after that retry or on any provider failure.",
    files:
      "repos/orbits/features/agent/playbooks/compiler.ts; repos/orbits/tests/capabilities/agent-playbooks.test.ts",
    regression:
      "Focused Playbook tests 5/5 and the exact production build passed. The same Chinese request changed from PLAYBOOK_SCHEMA_INVALID to a reviewable daily 09:00 Asia/Tokyo draft with two visible assumptions; an always-unsafe capability remains rejected after both attempts.",
    status:
      "fixed and runtime-verified for the exercised production provider/schema failure; other provider models and repeated invalid outputs remain fail-closed",
  },
  {
    id: "AUDIT-P0-042",
    severity: "P0",
    rootCause:
      "The Playbook runner constructed the generic live Agent conversation service without the authenticated actor even though every API and worker entry had already resolved one. Internal read-only tools therefore missed the actor-scoped artifact graph; a signed-in dry-run returned a synthesized need-authentication message as a successful trial.",
    decision:
      "Require a server-derived actor for every default Playbook execution path, construct the actor-bound live conversation/artifact service, and propagate the same actor through dry-run, manual run, signal refresh, internal scheduled execution, and the standalone worker. Fail closed before model/tool access when a caller omits actor identity; injected unit-test executors remain isolated.",
    files:
      "repos/orbits/features/agent/automations/runner.ts; repos/orbits/app/api/agent/automations/dry-run/route.ts; repos/orbits/app/api/agent/automations/[id]/run/route.ts; repos/orbits/app/api/agent/signals/route.ts; repos/orbits/app/api/internal/agent/automations/route.ts; repos/orbits/scripts/run-agent-worker.ts; repos/orbits/tests/capabilities/agent-playbooks.test.ts",
    regression:
      "Focused Playbook and automation tests 12/12 and the exact production build passed. Production dry-run changed from the false authentication summary to the current actor's source-backed empty follow-up result with two evidence IDs; immediate run persisted the same actor-scoped result. Staged change detection reported HIGH because four POST boundaries and six storage/module flows now carry actor identity, matching the intended security boundary.",
    status:
      "fixed and runtime-verified for dry-run, immediate run, empty actor readback, and missing-actor fail-closed behavior; populated multi-account browser execution and a live scheduled worker heartbeat remain pending",
  },
  {
    id: "AUDIT-P1-043",
    severity: "P1",
    rootCause:
      "Matchmaking request identity included caller direction and volatile time, so retrying the same pair or requesting from the reverse participant could create parallel introductions. Slot proposal and selection also accepted state transitions without converging on the already persisted request state.",
    decision:
      "Derive one deterministic SHA-256 request ID from event plus a lexically sorted participant pair; treat the pair as directionless; and make repeated request, proposal, and selection operations return the existing request/slot when the desired state already exists.",
    files:
      "repos/orbits/features/events/matchmaking/context-service.ts; repos/orbits/features/events/matchmaking/service.ts; repos/orbits/tests/capabilities/agent-matchmaking-context.test.ts",
    regression:
      "Focused matchmaking tests, exact production build, authenticated browser traversal, and Postgres readback passed. Same-direction retry, reverse-direction request, repeated proposal, and repeated selection preserved one request ID and one selected slot while sending no message or calendar action.",
    status:
      "fixed and runtime-verified for one two-party event_01 request through scheduled state; concurrent database races, decline UI, expiry, and multi-slot negotiation remain explicitly unverified",
  },
  {
    id: "AUDIT-P1-044",
    severity: "P1",
    rootCause:
      "The post-event follow-up route reused an owner-only event helper even though a public-catalogue attendee legitimately owns only a registration. The duplicate-contact warning also claimed that confirmation would create no writes, while the waiting branch correctly persists an auditable run and resolution step.",
    decision:
      "Authorize the follow-up boundary with either actor-owned event access or an active actor/event registration; keep every contact lookup actor-scoped; preserve the duplicate branch as run-plus-step only until explicit selection; and describe the actual guarantee precisely: no task, reminder, message draft, contact merge, or external send before resolution.",
    files:
      "repos/orbits/app/api/events/[id]/registered-event-access.ts; repos/orbits/app/api/events/[id]/post-event/followup/handler.ts; repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx; repos/orbits/tests/api/agent-post-event-followup-route.test.ts",
    regression:
      "Route tests, production build, browser workflow, and exact Postgres readback passed. Registered actor access succeeded; unregistered/cross-actor access remained denied; the waiting branch contained only one run and one step; explicit duplicate resolution produced four auditable actions and one unsent draft; retry reused all core IDs.",
    status:
      "fixed and runtime-verified for registered access, actor-scoped search, unique/empty/duplicate queries, waiting/resolved branches, retry, and no-send persistence; voice transcription, cancel/close, provider failure, and task/reminder approval remain unverified",
  },
  {
    id: "AUDIT-P1-045",
    severity: "P1",
    rootCause:
      "Event presentation replaced the source-backed attendee roster with a synthetic demo list, so Event Detail and Party disagreed about names and totals. Replay failed when composed private capability records were absent even though the registered public event and roster were valid. The organizer route could not resolve public catalogue codes, and its success view advertised fixed 12, 4,200+, and 4.8 metrics unrelated to the loaded events.",
    decision:
      "Keep the canonical 50-person provider roster intact; let registered ended-event replay use that public source without enabling check-in or seat claims; project organizer events only from the exact approved catalogue slug while stripping attendee names and private registration state; and derive organizer metrics solely from events.length and participantCount, omitting satisfaction when no source exists.",
    files:
      "repos/orbits/app/(app)/app/orbit-event-presentation.ts; repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts; repos/orbits/app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts; repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx; focused Event Detail, Party, and organizer route tests",
    regression:
      "Focused tests 26/26, two exact production builds, and authenticated browser traversal passed. Event Detail rendered 50 names with +38 expand/collapse; Party preserved the same source plus the current participant, exposed all five tabs, kept check-in/seat disabled, and returned to EVT01; /app/o/evt01 rendered 13 events and cumulative 500 without attendee names or the former hard-coded metrics.",
    status:
      "fixed and runtime-verified for the registered ended-event roster/replay and exact organizer projection; live active-event check-in, source-backed seat assignment, organizer roles, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-046",
    severity: "P1",
    rootCause:
      "Event Detail linked to Agent with an exact public event ID, but events.recommend applied discovery filtering first and removed all internally cancelled records. Public catalogue conversion currently uses that internal status for past events, so Agent discarded event_01, claimed it was missing, and substituted an unrelated future event. The generic prompt also asked whether to participate even when the UI already knew the event had ended.",
    decision:
      "When the query directly contains an event ID or full title, restrict the recommendation result to those exact records before generic status/token filtering; keep ordinary discovery filtering unchanged. Include the localized event status in the context prompt and ask for current status plus an appropriate next step or preparation rather than always asking whether to attend.",
    files:
      "repos/orbits/features/events/event-recommendation-tool.ts; repos/orbits/app/(app)/app/orbit-agent-context-href.ts; repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx; repos/orbits/tests/capabilities/event-crud-and-import-live-store.test.ts; repos/orbits/tests/ui/orbit-agent-context-href.test.ts",
    regression:
      "Focused Agent/Event tests 32/32, exact production build, and two before/after browser conversations passed. The repaired answer used only event_01, stated its exact 2026-02-15 ended status and Osaka venue, cited one real record, suggested retrospective actions, and executed no external operation. Generic catalogue recommendation still preferred upcoming events.",
    status:
      "fixed and runtime-verified for one ended public event by exact ID/title and the unchanged generic discovery test; multiple explicit events, true cancellation semantics, other languages, provider failure, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-047",
    severity: "P1",
    rootCause:
      "The matchmaking service correctly returned registration_required for an unregistered actor, but its UI interpreted that state without the parent event lifecycle. On an ended event, the main registration action and replay were disabled while the matchmaking card still promised 报名后 and linked to the registration workspace, creating a contradictory dead-end.",
    decision:
      "Pass the parent event's registration-open fact into the matchmaking presenter. Preserve the existing registration link for upcoming/active events, but for ended events replace both the generic privacy sentence and registration CTA with a terminal boundary: matching is limited to participants registered before the event ended, and registration is closed.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx; repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts",
    regression:
      "Focused Event Detail/matchmaking tests 18/18, exact production build, and authenticated browser refresh passed. After all audit registration rows were deleted, attendee names, candidates, follow-up, and replay disappeared immediately; the ended-event card contained the two terminal sentences and no 完成报名资料 link.",
    status:
      "fixed and runtime-verified for the ended/unregistered event_01 boundary while upcoming/active registration source behavior remains covered by existing tests; guest/login, cancelled-registration, responsive, keyboard, and assistive cases remain unverified",
  },
  {
    id: "AUDIT-P2-048",
    severity: "P2",
    rootCause:
      'The shared event mapper treated Intl.DateTimeFormat(..., { day: "2-digit" }).format() as a locale-neutral day number. In zh-CN that call returns a localized token that already includes 日, while the map rail and selected-event card correctly add their own Chinese suffix. The boundary therefore produced 9月15日日 and 2月15日日 in every map date.',
    decision:
      "Keep MappedEvent.day as the numeric semantic token already assumed by all consumers. Extract the day value from formatToParts at the formatter boundary, retain the existing localized month and map composition, and cover both English and Chinese tokens with one focused regression test.",
    files:
      "repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx; repos/orbits/tests/pages/app-events-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW risk across four upstream symbols and no business process. Focused Events tests passed 8/8, the exact production build passed, and authenticated browser traversal changed 9月15日日 / 2月15日日 to 9月15日 / 2月15日 while preserving 13 map positions, EVT01 selection, event time, venue, participant count, and exact detail navigation.",
    status:
      "fixed and runtime-verified for the exercised Chinese desktop module/map catalogue; English token behavior is regression-tested, while mobile/responsive and other locale runtime presentation remain unverified",
  },
  {
    id: "AUDIT-P2-049",
    severity: "P2",
    rootCause:
      "Event Detail labelled its control 返回上一页 / Back to previous page but BackButton unconditionally assigned /app/events. Catalogue-origin traversal appeared correct only because that fixed destination happened to match its source; organizer-origin traversal proved the control discarded the actual previous surface.",
    decision:
      "Use browser history only when document.referrer is a distinct same-origin Orbit product path and a prior history entry exists. Reject same-page, malformed, and external referrers; keep the canonical /app/events assignment as the safe direct-entry fallback.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW risk across two upstream symbols and one Event Detail page flow. Focused Event Detail tests passed 15/15 and the exact production build passed. Authenticated browser traversal changed organizer → EVT01 → 返回上一页 from /app/events to /app/o/evt01, preserved catalogue → EVT01 → /app/events, and kept an empty-referrer direct entry on the safe /app/events fallback.",
    status:
      "fixed and runtime-verified for organizer, catalogue, and direct-entry paths; external/same-page referrers are regression-tested, while external-referrer browser runtime, mobile/responsive, keyboard/screen-reader, and repeated identical-detail history remain unverified",
  },
  {
    id: "AUDIT-P1-050",
    severity: "P1",
    rootCause:
      "When the approved public catalogue had no exact organizer match, the Web organizer loader continued into Event CRUD using the deployment module mode. A public unknown slug could therefore be reclassified as a private-store failure and, if a private event matched the slug, could project private event-derived organizer data. The route-state page also resolved language only for success and rendered fixed English copy for Chinese users.",
    decision:
      "Make the default public route a terminal exact catalogue boundary: exact public match returns a stripped organizer projection; a miss returns PUBLIC_ORGANIZER_NOT_FOUND without constructing or calling Event CRUD. Keep mock/live service scenarios only behind explicit mode/scenario input. Represent route-state semantics in one bilingual table and project every success/failure state through the server-resolved language.",
    files:
      "repos/orbits/app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts; repos/orbits/app/(app)/app/o/[slug]/page.tsx; repos/orbits/tests/pages/app-organizer-public-live-route-services.test.ts",
    regression:
      "Focused Organizer tests passed 7/7, including an unknown default slug under an intentionally unconfigured live private store, explicit mock success, explicit live failure, exact catalogue success/private-field stripping, and zh/en state projection. The exact production build passed. Browser runtime changed an English storage failure into a bilingual public-only not-found state, exposed both dedicated evidence IDs, showed no badge/event fallback, and recovered to all 13 events.",
    status:
      "fixed and runtime-verified for exact and unknown production public slugs, Chinese/English not-found presentation, evidence disclosure, and catalogue recovery; Japanese-specific copy, guest session, populated unrelated private-store tracing, responsive/assistive traversal, explicit scenario runtime, and timeout remain unverified",
  },
  {
    id: "AUDIT-P1-051",
    severity: "P1",
    rootCause:
      "AppOrganizerPublicPage accepted public URL searchParams and forwarded them unchanged to the organizer loader. The loader intentionally treats explicit mode and scenario values as internal dependency and fixture controls, so an untrusted request could select the mock event service or force synthetic route states. In production runtime, mode=mock exposed Calendar sync fixture, Climate founders dinner, and a verified organizer badge on the public organizer surface.",
    decision:
      "Terminate dependency selection at the public route adapter: pass only the decoded path slug to the organizer loader and do not accept or forward URL search parameters. Preserve explicit mode/scenario inputs on the loader solely for direct internal tests and controlled callers, keeping testability without making those controls part of the public HTTP contract.",
    files:
      "repos/orbits/app/(app)/app/o/[slug]/page.tsx; repos/orbits/tests/pages/app-organizer-public-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW risk and no upstream callers for AppOrganizerPublicPage. Focused Organizer tests passed 7/7 and assert that the page source has no searchParams dependency while the internal loader still supports explicit mock and controlled live-failure calls. The exact production build passed. Browser runtime changed demo-event-1?mode=mock from a verified mock organizer into the public not-found boundary, while evt01?mode=mock&scenario=failure continued to render the exact 13-event, 500-participant reviewed catalogue projection.",
    status:
      "fixed and runtime-verified for the exercised authenticated mock-selection and forced-failure URLs with exact and unknown slugs; duplicate/array/encoded values, empty/pending/live-only inputs, guest session, proxy/cache behavior, other public routes, and future debug parameters remain unverified",
  },
  {
    id: "AUDIT-P1-052",
    severity: "P1",
    rootCause:
      "AppEventsPage accepted a public scenario search parameter and treated scenario=empty as authority to replace the entire approved public catalogue with an empty array. That URL-only test fixture branch bypassed the real 13-event source and caused the production page to claim that no events were published.",
    decision:
      "Remove searchParams and the scenario reader from the public catalogue page so its source is always getOrbitLandingViewModel plus actor-scoped registration reads. Preserve the separate internal events loader's explicit scenario input for controlled tests; production catalogue filtering remains exclusively client-side over the reviewed source.",
    files:
      "repos/orbits/app/(app)/app/events/page.tsx; repos/orbits/tests/pages/app-events-live-route-services.test.ts",
    regression:
      "Pre-edit GitNexus impact was LOW with no upstream callers for AppEventsPage and one direct caller for its local reader. Staged detection reported HIGH because AppEventsPage participates in nine generated execution flows; this was reported rather than discarded. Focused Events tests passed 8/8, the exact production build passed, and browser runtime changed /app/events?scenario=empty from a synthetic no-events state into the complete 13-card catalogue with search, filter, and map controls.",
    status:
      "fixed and runtime-verified for the exercised authenticated scenario=empty URL with the full catalogue and no writes; array/duplicate/encoded values, other scenarios, guest session, cache/proxy behavior, mobile/responsive, assistive traversal, and other routes remain unverified",
  },
  {
    id: "AUDIT-P2-053",
    severity: "P2",
    rootCause:
      "AppEventDetailPage correctly fixed production module mode to server configuration, but still read the public scenario query and forwarded it to the private event-detail composer and registration-profile guide. Those internal services intentionally implement empty, pending, and failure fixtures, leaving a public dependency-control channel even though the exercised actor-owned event's fallback path masked a stable final-UI difference.",
    decision:
      "Stop forwarding scenario from the HTTP query at the page adapter while retaining the legitimate language parameter. Keep explicit scenario inputs on both internal loaders for controlled unit tests and direct internal calls; actor scope, stored event state, and server-owned mode now determine production detail composition.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/page.tsx; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW impact and no upstream callers for AppEventDetailPage; staged detection found no graph-level symbol changes. Focused Event Detail tests passed 15/15, including all internal scenario branches and public-before-private routing, and the exact production build passed. After repair, the encoded actor-owned event produced exactly equal final DOM with and without scenario=empty while retaining its true identity, source, venue, readiness, registration, and matchmaking states.",
    status:
      "fixed and source-verified with post-repair runtime equality for one authenticated actor-owned event; no pre-repair stable UI divergence is claimed, while other scenario values, event states, duplicate/array/encoded inputs, guest routing, proxy/cache behavior, and visible registration-guide branches remain unverified",
  },
  {
    id: "AUDIT-P1-054",
    severity: "P1",
    rootCause:
      "The approved catalogue generated stable public route codes in an app-layer helper, while the registration feature resolved catalogue events only by internal ID. A card-linked EVTSIGNUP01 therefore missed canonical event_signup_01. The page also resolved the authenticated session but did not pass actorId to either registration-guide or private-event reads, and forwarded public mode/scenario query values into the internal guide service. Normal production entry failed with EVENTS_ACTOR_REQUIRED; mode=mock selected a different service error.",
    decision:
      "Move the stable hash to a shared utility and the canonical public event route-code algorithm to the events feature, re-exporting both from the former app module so every existing caller retains identical behavior. Resolve registration catalogue entries by exact internal ID or the same generated route code, propagate the current actor into guide/private-event reads, and keep only language as a public query input while retaining explicit mode/scenario on internal services for tests.",
    files:
      "repos/orbits/shared/utils/stable-hash.ts; repos/orbits/features/events/public-route-code.ts; repos/orbits/app/(app)/app/orbit-hybrid-route-data.ts; repos/orbits/features/events/registration/event-loader.ts; repos/orbits/features/events/registration-profile-guide.ts; repos/orbits/app/(app)/app/events/[id]/register/page.tsx; repos/orbits/app/(app)/app/events/[id]/page.tsx; focused registration/detail tests",
    regression:
      "GitNexus mapped eventCodeFor to four direct callers and 13 upstream symbols at LOW risk, hashString to five direct callers and 22 upstream symbols at MEDIUM risk, and the combined staged change to seven registration/detail flows at HIGH risk. After that warning, 38/38 registration page, profile-guide, adaptive-auth, route, live-provider, and Event Detail tests passed; the exact production build passed. Browser runtime changed the normal EVTSIGNUP01 entry from actor-required failure into the real 1/8 interview, and the mock/failure query URL produced identical DOM without activating a write control.",
    status:
      "fixed and runtime-verified for the exercised authenticated EVTSIGNUP01 entry, canonical identity, actor propagation, query isolation, and no-write opening; existing separate runtime evidence covers write/readback/cancel/reactivate/offline/two-account behavior, while full eight-question completion, persona-provider failure, other codes, guest return, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-055",
    severity: "P1",
    rootCause:
      "AppContactDetailPage authenticated the actor but also accepted public action, mode, and scenario query values and forwarded them into the internal contact-detail composer. mode=mock bypassed the actor's live graph and rendered the complete demo-contact-1 relationship fixture, while action could select a local follow-up draft/evidence branch during a GET render.",
    decision:
      "Make the production HTTP adapter depend only on the decoded contact path ID and authenticated actor. Remove searchParams plus all action/mode/scenario forwarding from the page, while retaining those explicit inputs on the internal loader for deterministic unit tests and capability demos. Missing live contacts now fail closed without any mock identity or relationship projection.",
    files:
      "repos/orbits/app/(app)/app/contacts/[id]/page.tsx; repos/orbits/tests/pages/app-contact-detail-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW impact with no upstream callers for AppContactDetailPage and one direct page caller for its query reader; staged detection found no graph-level change. Focused contact detail, auth, mock-contract, and visual tests passed 16/16, and the exact production build passed. Browser runtime changed the mock URL from a complete Kenji Watanabe relationship profile into an actor-scoped contact-detail-not-found evidence boundary; the combined mock/failure/action URL exposed no fixture or draft data.",
    status:
      "fixed and runtime-verified for the exercised authenticated mock/scenario/action query leak and no-write boundary; the separately observed not-found misclassification was subsequently fixed under AUDIT-P2-056, while guest return, a valid enriched live contact under adversarial query, duplicate/array/encoded values, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P2-056",
    severity: "P2",
    rootCause:
      "loadComposedContactDetailRoute mapped every unsuccessful contact-detail service result to the generic failure boundary even though the contract explicitly defines CONTACT_DETAIL_NOT_FOUND with appCode NOT_FOUND. The page's shared guardrail also called every non-success state failed. A normal actor-scoped miss therefore looked like a provider outage and offered a retry loop to the same absent contact.",
    decision:
      "Map only CONTACT_DETAIL_NOT_FOUND to the existing empty boundary while preserving all actor, configuration, validation, and provider errors as failure. Carry the service evidence through unchanged, use route-state-neutral guardrail copy, and rely on the empty boundary's single recovery to the sourced contacts list.",
    files:
      "repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts; repos/orbits/app/(app)/app/contacts/[id]/page.tsx; repos/orbits/tests/pages/app-contact-detail-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW upstream impact for loadComposedContactDetailRoute and staged detection MEDIUM across NormalizeScenario, ContactOnlySuccess, and ConnectionIdForContact flows. Focused Contact Detail tests passed 13/13 and the exact production build passed. Browser runtime changed contact_detail_not_found from generic failure plus same-ID retry into a truthful empty state with neutral no-side-effects copy and one contacts-list recovery.",
    status:
      "fixed and runtime-verified for the exercised actor-scoped not-found classification, evidence retention, dead-retry removal, and no-write recovery; Chinese route-copy localization, guest return, other missing IDs, provider/config/actor failure copy, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-057",
    severity: "P1",
    rootCause:
      "The legacy /app/register adapter still defaulted missing input to demo-event-1, accepted public mode/scenario controls, and used Event CRUD to resolve the code. Bare production entry therefore failed through live private-service boundaries, while mode=mock exposed a Seed Investor registration fixture and propagated mode=mock into the canonical URL. This contradicted the earlier narrow-resolver decision recorded under AUDIT-P2-005.",
    decision:
      "Expose the registration feature's existing public-catalogue-only ID/code resolver and make the compatibility loader depend solely on it. Accept only code plus presentation language at the HTTP adapter; discard mode/scenario, remove the default demo, return a single Events recovery for missing/unknown codes, and redirect reviewed matches to the canonical internal event ID without test parameters.",
    files:
      "repos/orbits/features/events/registration/event-loader.ts; repos/orbits/app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model.ts; repos/orbits/app/(app)/app/register/page.tsx; repos/orbits/tests/pages/app-register-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW impact for AppRegisterPage, loadAppRegisterRouteViewModel, normalizeScenario, and baseRouteState; staged detection was LOW with zero execution flows. Focused legacy and canonical registration tests passed 13/13, and the exact production build passed. Browser runtime changed bare/demo URLs into non-looping empty boundaries and reduced the adversarial reviewed-code redirect to /app/events/event_signup_01/register?language=en before rendering the real interview.",
    status:
      "fixed and runtime-verified for the exercised no-code, mock-fixture, and reviewed-code compatibility paths, canonical identity, language-only forwarding, query isolation, and no-write adapter behavior; guest login return, other reviewed codes, duplicate/array/encoded inputs, cache/proxy behavior, English event-title localization, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P2-058",
    severity: "P2",
    rootCause:
      "The canonical registration page localized every EventRecord through slash-delimited title and venue segments. Public catalogue records had already been projected into EventDTO with one Chinese display value, so an English registration URL had no alternate segment to select even though the app presentation layer held reviewed English content for the same stable event ID.",
    decision:
      "At the app presentation boundary, prefer the existing reviewed event title by stable ID, retain slash-segment handling as the fallback for live records, and pass the resulting event identity through the existing server localizer so Chinese-only location values use the same translation path as public detail. Feed that one localized EventRecord to both the visible workspace and question generator.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/register/page.tsx; repos/orbits/tests/pages/app-event-registration-guide.test.tsx",
    regression:
      "GitNexus reported LOW upstream impact for AppEventRegistrationGuidePage, while staged detection reported HIGH across six registration presentation flows; the warning was surfaced before commit. Focused registration page tests passed 9/9, the broader registration chain passed 29/29, and the exact production build passed. Server-rendered English output now contains Kansai Cross-Border Business Connect and Osaka in both workspace and question context with no Chinese event identity.",
    status:
      "fixed and source/render-verified for event_signup_01 English registration identity; post-repair authenticated browser DOM, Japanese registration, other events, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-059",
    severity: "P1",
    rootCause:
      "loadAppContactsRouteViewModel used one untrusted AppContactsSearchParams object for both legitimate list filters and internal route controls. Any production caller forwarding the URL therefore allowed scenario=empty/pending/failure to replace actor-scoped results with synthetic states, while action=review-filtered-contact selected a different internal service method during GET composition.",
    decision:
      "Keep query/source/status/tag/value in the public search-parameter path, but move scenario and reviewFilteredContact into an explicit typed controls argument. Existing page and Home callers remain source-compatible and cannot activate controls; controlled tests and internal callers can still request them deliberately without encoding them in a public URL.",
    files:
      "repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts; repos/orbits/tests/pages/app-contacts-live-route-services.test.ts",
    regression:
      "GitNexus reported HIGH pre-edit impact with seven direct callers, nine upstream symbols, and four process groups. Staged detection reported CRITICAL across 22 generated Contacts/Home flows, so the change was held for expanded verification. Contacts/Home focused tests passed 38/38, the complete Web suite passed 1353/1353 with no skips, and the exact production build passed. Regression proves public scenario/action are inert while explicit internal scenario remains available.",
    status:
      "fixed and source/build/full-suite-verified for the shared Contacts loader boundary; authenticated browser runtime, legitimate filter combinations, each caller independently, duplicate/array/encoded values, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-060",
    severity: "P1",
    rootCause:
      "AppPersonalHomePage and AppPersonalHomeEventsPage accepted unrestricted searchParams despite having no legitimate server-side query contract, then forwarded the object to the Home composer. The composer propagated it to Events, Contacts, and Profile route models, allowing one public URL parameter to reach multiple internal fixture/action branches.",
    decision:
      "Remove searchParams from both production Home page adapters and pass undefined explicitly to the existing Home loader. Preserve its internal searchParams argument for controlled composition tests; keep authenticated actor propagation, child service ordering, presentation, and recovery behavior unchanged.",
    files:
      "repos/orbits/app/(app)/app/home/page.tsx; repos/orbits/app/(app)/app/home/events/page.tsx; repos/orbits/tests/pages/app-home-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW pre-edit upstream impact for both page functions. Staged detection reported CRITICAL because they participate in 16 Home-to-child execution flows; the warning was surfaced before commit. Home-focused tests passed 20/20, the exact production build passed, and the immediately preceding shared boundary had passed the full Web suite 1353/1353. Source assertions require undefined query input and forbid searchParams in both adapters.",
    status:
      "fixed and source/build-verified for both authenticated personal Home adapters; authenticated browser runtime, other query shapes, cache/proxy behavior, provider failures, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-061",
    severity: "P1",
    rootCause:
      "The Dashboard page forwarded unrestricted URL parameters into a loader that mixed actor-scoped reads, internal scenario fixtures, and action=run-dashboard-review. That action executed opportunity recompute plus provenance audit during a GET, but its result was absent from the Dashboard adapter and UI. Fixture recovery links exposed the same internal query controls to users.",
    decision:
      "Make the production Dashboard adapter actor-only. Change the loader to accept only actor context plus an explicit internal scenario control, remove the unused action result contract and GET execution branch, and replace fixture/action recovery links with real Dashboard, sourced-contact creation, and Settings destinations. Keep recompute and audit available only through their authenticated API action routes.",
    files:
      "repos/orbits/app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model.ts; repos/orbits/app/(app)/app/dashboard/page.tsx; repos/orbits/tests/pages/app-dashboard-live-route-services.test.ts",
    regression:
      "Focused Dashboard tests passed 5/5 and the exact production build passed. Tests prove the normal actor-scoped model, explicit-only internal empty state, real recovery hrefs, no page searchParams, and absence of run-dashboard-review, scenario URLs, recompute, and runAudit in the page composition source. GitNexus staged detection was MEDIUM across the five expected Dashboard read flows.",
    status:
      "fixed and source/build-verified for the Dashboard page boundary and recovery model; authenticated browser runtime, authenticated recompute/audit API interactions, provider failures, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-062",
    severity: "P1",
    rootCause:
      "The production Profile page and shared Home, Party, and Admin/Platform composers forwarded unrestricted URL parameters into loadAppProfileRouteViewModel. Public scenario values selected internal fixture states, while action=complete-profile-field plus preferredIntroChannels created an unsaved editor preview. The final Profile adapter and UI ignored that action result, so the GET branch was both externally activatable and behaviorally invisible.",
    decision:
      "Make the production Profile page actor-only, move scenario into an explicit typed controls argument, update every known production caller to pass actor context without query input, and delete the unconsumed action/intro-choice contract and formatting chain. Keep actual profile edits on the explicit authenticated profile API save/readback path.",
    files:
      "repos/orbits/app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts; repos/orbits/app/(app)/app/profile/page.tsx; repos/orbits/app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx; repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts; repos/orbits/app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts; repos/orbits/tests/pages/app-profile-live-route-services.test.ts",
    regression:
      "GitNexus reported HIGH pre-edit impact with four direct callers, 12 upstream symbols, and three process groups. Profile/Home/Party/Admin focused tests passed 49/49, the exact production build passed, and staged detection reported CRITICAL across 20 shared composition flows, so the complete Web suite was required and passed 1355/1355. Regression asserts that the production page has no searchParams, the loader has no query reader or complete-profile-field branch, and explicit internal scenario controls remain available.",
    status:
      "fixed and source/build/full-suite-verified for Profile and all known shared callers; authenticated browser runtime, profile API save/readback, provider failures, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-063",
    severity: "P1",
    rootCause:
      "The authenticated Today aggregate reused one unrestricted URL query object across calendar navigation, ledger selection, Schedule composition, and Followups composition. scenario selected internal states in all three child loaders, while action=complete-top-followup created a no-write completion result that the Followups adapter and final Today UI ignored. Recovery links also targeted retired redirect routes or internal scenario URLs.",
    decision:
      "Define the public Today contract as date, view, and entry only. Consume date/view in the aggregate, pass only entry to the ledger, call Schedule and Followups without public query input, and move every child scenario into typed internal controls. Delete the unconsumed Followups completion-result contract and replace recovery links with real Today, Today arrangements, Contacts New, and Settings destinations.",
    files:
      "repos/orbits/app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model.ts; repos/orbits/app/(app)/app/schedule/schedule-route-view-model.ts; repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model.ts; repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model.ts; repos/orbits/app/(app)/app/today/today-page-content.tsx; repos/orbits/tests/pages/app-followups-live-route-services.test.ts; repos/orbits/tests/pages/app-today-route-view-model.test.ts; repos/orbits/tests/pages/app-today-merged.test.ts",
    regression:
      "GitNexus incremental analysis failed with LOWER: Invalid UTF-8 and left current loader symbols unresolved; all required pre-edit impact commands were nevertheless run and returned UNKNOWN/not found, so the change was treated conservatively. Focused Today/Followups/Schedule tests passed 59/59, the complete Web suite passed 1356/1356, and the exact production build passed. Staged detection returned LOW for eight files and two recognized merged-view symbols. Regression proves adversarial public scenario/action input leaves all three child models successful while explicit internal controls still render degraded states.",
    status:
      "fixed and source/build/full-suite-verified for the Today aggregate and its three child control boundaries; GitNexus current-symbol graph coverage, authenticated browser runtime, explicit mutation/readback paths, provider failures, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-064",
    severity: "P1",
    rootCause:
      "All Actions used one unrestricted query object for legitimate status filtering and entry expansion plus the internal ledger scenario selector. A production URL could therefore replace the authenticated ledger with mock empty/failure states.",
    decision:
      "Define the public All Actions query contract as status and entry only, keep their existing validation and selection behavior, and move scenario into a typed third controls argument used only by controlled tests. Preserve the existing authenticated ledger-service dependency.",
    files:
      "repos/orbits/app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model.ts; repos/orbits/tests/pages/app-all-actions-route-view-model.test.ts; repos/orbits/tests/pages/app-agent-execution-settings.test.tsx",
    regression:
      "Current GitNexus symbols were unresolved after the incremental-index UTF-8 failure, so both required pre-edit impacts returned UNKNOWN/not found and the change was verified conservatively. Three focused test files passed 20/20, including valid filters, unknown filters, entry expansion, explicit internal empty/failure states, actor-required failure, and public scenario isolation. The exact production build passed; the immediately preceding same-ledger full Web suite passed 1356/1356; staged detection returned LOW for three files and one recognized symbol.",
    status:
      "fixed and source/build-verified for the All Actions public query boundary; GitNexus current-symbol graph coverage, authenticated browser runtime, filter/entry combinations, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-065",
    severity: "P1",
    rootCause:
      "The three authenticated Party pages correctly required actor identity and used eventId/code as legitimate URL identity, but the shared loader also accepted scenario from the same unrestricted search-parameter record. Public URLs could therefore select private Event Detail fixture states before registration and attendee context were evaluated.",
    decision:
      "Define Party public search parameters as eventId and code only, keep configured runtime mode and authenticated actor as explicit server-owned input, and move scenario into a typed third controls argument. Preserve one shared loader for Party, Check-in, and Graph so the access and registration rules remain identical.",
    files:
      "repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts; repos/orbits/tests/pages/app-party-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW pre-edit impact: three direct page callers for the shared loader and four total upstream symbols for event identity/scenario helpers, with zero indexed processes. Party focused tests passed 12/12 and the exact production build passed. Regression proves public mode and scenario query values cannot activate fixtures, explicit internal scenario remains available, event identity is preserved, and registration-gated catalogue access remains actor scoped. Staged detection returned LOW for two files and two Party symbols.",
    status:
      "fixed and source/build-verified for all three Party route adapters and the shared loader; authenticated browser runtime, eventId/code combinations, registration transitions, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-066",
    severity: "P1",
    rootCause:
      "The shared Chat loader treated unrestricted page query input as conversation identity, internal fixture scenario, and an Agent prompt. A GET with prompt called Orbit Agent sendMessage and built agentTurn/artifact results that neither ChatWorkspace nor the Agent page consumed; actionResult was also permanently null. Meanwhile, live async conversation links used conversationId, but the loader recognized only conversation and silently selected the first item.",
    decision:
      "Limit public Chat search parameters to conversation and the conversationId compatibility alias, resolve both only inside the actor-scoped list, move scenario to a typed internal controls argument, and delete the query prompt, Agent service call, artifact projection, and dead action-result chain. Keep Agent's canonical q prompt in its interactive client/API path and preserve only the pure artifact surface type still imported by its side-panel contract.",
    files:
      "repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts; repos/orbits/app/(app)/app/agent/page.tsx; repos/orbits/tests/pages/app-chat-page.test.tsx; repos/orbits/tests/pages/app-chat-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW impact for the loader and HIGH impact for the internal workspace/scenario/prompt/Agent/artifact projection symbols in the AppAgentPage process group. Chat and Agent focused tests passed 41/41, the complete Web suite passed 1358/1358, and the exact production build passed. Regression proves both identity aliases, public prompt/scenario isolation, explicit internal empty state, actor-scoped empty service reuse, and source-level absence of the GET Agent execution chain. Staged detection returned MEDIUM for four files, six symbols, and one indexed flow.",
    status:
      "fixed and source/build/full-suite-verified for shared Chat/Agent server composition; authenticated browser runtime, populated multi-account conversation selection, cache/proxy behavior, duplicate/array/encoded values, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-067",
    severity: "P1",
    rootCause:
      "Admin, Admin Events, and Platform were operator workspaces with profile/member/event/review data, but the auth route policy left all three public. Their pages passed unrestricted query input into a shared loader and supplied no actor to live Events or Profile. scenario selected fixture states; action=accept-top-event invoked recommendation acceptance during GET and built an action result ignored by every production consumer.",
    decision:
      "Keep /app/admin/access and /app/login-admin as the only public operator sign-in entries. Require the existing authenticated session at proxy and server-page boundaries for all three workspaces, pass one canonical actor into Events and Profile, change the Events aggregate to actorId plus typed internal controls, delete query readers and the unconsumed GET acceptance/action-result chain, and retain real acceptance only behind the authenticated POST API. Do not invent admin roles that the current identity model does not define.",
    files:
      "repos/orbits/features/auth/app-auth-routing.ts; repos/orbits/app/(app)/app/admin/page.tsx; repos/orbits/app/(app)/app/admin/events/page.tsx; repos/orbits/app/(app)/app/platform/page.tsx; repos/orbits/app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts; repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model.ts; repos/orbits/app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx; repos/orbits/app/(app)/app/events/[id]/page.tsx; focused auth/operator/Events tests",
    regression:
      "After a successful full GitNexus re-index, pre-edit impact was HIGH for the shared Events loader and action helpers across Home and Event Detail, while operator pages and the auth predicate were LOW. Seven focused test files passed 55/55, the complete Web suite passed 1358/1358, and the exact production build passed. Tests cover public sign-in exceptions, private workspace paths, safe auth return normalization, page-level auth/redirect/actor source, live failure, adversarial public scenario/action isolation, explicit internal empty state, and absence of the GET acceptance chain. Staged detection was CRITICAL across 16 expected flows.",
    status:
      "fixed and source/build/full-suite-verified for session gating, actor propagation, query isolation, and GET acceptance removal; browser runtime, a dedicated admin/organizer role authorization model, populated multi-account isolation, authenticated POST acceptance/readback, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-068",
    severity: "P1",
    rootCause:
      "The real Contact Import page had been simplified into an authenticated action workspace, but its former route aggregator remained in production source as a test utility. The orphan accepted unrestricted query input for module mode, fixture scenario, event identity, and action. Its default branch preflighted acquisition capabilities, while action=confirm-manual-draft could call draft confirmation during a GET composition. No production page called it, so this risk was latent and maintained only by a test and stale documentation.",
    decision:
      "Retire the orphan aggregator completely instead of preserving a second acquisition architecture. Keep the historical file as an empty module only because the typed lint manifest names the path. Make the regression prove that /app/contacts/new has no searchParams or page-load acquisition calls and that the retired module cannot regain service composition. Preserve business-card scan, contact confirmation, invitation, and every future source behind explicit authenticated API actions.",
    files:
      "repos/orbits/app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services.ts; repos/orbits/tests/pages/app-contacts-new-live-route-services.test.ts; repos/orbits/app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md; repos/orbits/scripts/manual-acceptance.md",
    regression:
      "GitNexus context and upstream impact found one test caller, zero production processes, and LOW risk for every function in the retired module. The focused page regression passed 1/1, the complete Web suite passed 1357/1357, and the production build passed. The regression checks authentication, the availability boundary, action-workspace rendering, absence of searchParams/preflight calls, and absence of the retired loader/service/query/confirmation symbols. Staged detection was LOW for two files and zero processes. The repository-wide typed lint remains blocked by an unrelated pre-existing TS2367 in the contact-detail route test.",
    status:
      "fixed and source/build/full-suite-verified for removal of the latent GET/query acquisition aggregator; explicit configured provider action/readback, broader source integrations, browser runtime, permission failures, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-069",
    severity: "P1",
    rootCause:
      "The authenticated Contact Detail page was already query-free, but its shared loader retained an action field and two historical action names. Supplying either name called connectionEvidence.addEvidence during route composition, built a local follow-up draft and safety ledger, and returned actionResult. No production page, view-model adapter, component, or test consumed that result, so the branch was dead functionality with a latent GET-side-effect surface.",
    decision:
      "Keep Contact Detail GET composition read-only: accept authenticated actor, route contact identity, and explicit service-test controls only. Delete the action input/type, aliases, add-evidence/draft builder, and actionResult success-model field. Preserve real follow-up behavior for an explicit authenticated mutation boundary instead of simulating it in a loader.",
    files:
      "repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts; repos/orbits/tests/pages/app-contact-detail-live-route-services.test.ts; repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/LIVE_IMPLEMENTATION.md; repos/orbits/scripts/manual-acceptance.md",
    regression:
      "GitNexus reported LOW impact for the loaders/action helpers in one AppContactDetailPage process and MEDIUM for the input/success interfaces with five direct users. Focused tests passed 14/14, repository lint passed, the complete Web suite passed 1357/1357, and production build passed. Regression proves the page accepts no search parameters and the service contains none of the former action names, builder, or result field. The required staged detect command ran, but GitNexus returned No changes detected despite an exact two-file staged diff; the discrepancy is recorded instead of assigning a false risk level.",
    status:
      "fixed and source/lint/build/full-suite-verified for read-only Contact Detail GET composition; browser runtime, populated multi-account isolation, explicit follow-up mutation/readback, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-070",
    severity: "P1",
    rootCause:
      "Event Detail kept a second, non-product action presentation architecture after the page had moved to explicit APIs and the real matchmaking workspace. The route success model always returned actionResult=null, while test-only helpers selected a want-connect target and converted a live write into that unused result. A relationship-context presenter converted it to an all-false side-effect ledger, but the production page only imported the presenter and never called it. Visual tests passed the projection through an unsupported component prop, so React discarded it while tests treated it as rendered evidence.",
    decision:
      "Make the Event Detail server model describe only content the real component renders. Delete the action-result type/field, target/action helpers, unused relationship presenter and types, dead page import, unsupported test prop, and self-validating helper test. Keep the authenticated want-connect API, live service, and visible matchmaking request/consent/scheduling controls as the only mutation architecture.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/page.tsx; repos/orbits/app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service.ts; repos/orbits/app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter.ts; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts; repos/orbits/tests/pages/app-demo-visual-assets.test.tsx; repos/orbits/tests/capabilities/demo-visual-asset-coverage.test.ts",
    regression:
      "After a forced fresh GitNexus rebuild, impact was MEDIUM for the public action/success interfaces and LOW for all page/helper/presenter symbols. Focused tests passed 23/23, repository lint passed, the complete Web suite passed 1356/1356, and production build passed. Regression asserts the page still supports public catalogue/private fallback behavior while production source has no actionResult or dead helper. Staged detect was executed but returned No changes detected for an exact six-file, 316-deletion diff; the discrepancy is recorded rather than reporting a false risk level.",
    status:
      "fixed and source/lint/build/full-suite-verified for removal of the fake Event Detail action projection; authenticated browser matchmaking lifecycle, explicit want-connect readback, repeat/idempotency, multi-account isolation, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-071",
    severity: "P1",
    rootCause:
      "The shared Event Registration loader returned mockEventRecords before consulting the reviewed public catalogue or actor-scoped Event service, and all page/API consumers inherited that shortcut. Event Detail and Registration then called a test-user guide loader that always composed Ari Lane, mock profile completeness, and deterministic questions. The real adaptive registration workspace had already superseded this architecture, but the old guide still rendered on production Event Detail and supplied fallback participant context to Registration.",
    decision:
      "Make one truthful production chain: resolve reviewed public events first, otherwise use the server-configured actor-scoped Event service; read the visible participant name from the actor-scoped Profile service with only the authenticated session as fallback; keep registration writes behind the existing authenticated APIs; remove production test-user-guide calls, obsolete Event Detail guide/fallback UI, unused mock-profile runtime constants, and the unused headline prop. Unknown, unauthorized, ended, or cancelled events must render one no-write boundary before question generation.",
    files:
      "repos/orbits/features/events/registration/event-loader.ts; repos/orbits/features/events/registration/runtime.ts; repos/orbits/app/(app)/app/events/[id]/page.tsx; repos/orbits/app/(app)/app/events/[id]/register/page.tsx; repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx; repos/orbits/tests/pages/app-event-registration-guide.test.tsx; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts",
    regression:
      "GitNexus reported MEDIUM impact for the shared loader across five direct consumers and one registration process, with LOW impact for all page, component, constant, language, and guard symbols. Focused tests passed 39/39, lint passed, the full Web suite passed 1357/1357, and production build passed after the registerability type guard was corrected to match its confirmed/imported runtime predicate. Regression covers public id/code entry, adversarial fixture absence, actor Profile source, live-mode rejection of demo-only event_001, no production guide imports/UI, unavailable no-write boundary, and unchanged explicit registration/interview/persona/cancel APIs. Staged detect was MEDIUM for seven files and one expected language-normalization flow.",
    status:
      "fixed and source/lint/build/full-suite-verified for removal of demo event/profile/guide precedence from Event Registration; authenticated browser actor-profile readback, live private-event registration, provider failure, full interview/persona lifecycle, two-account UI isolation, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-072",
    severity: "P1",
    rootCause:
      "P1-071 removed the deterministic registration guide from both production callers, but the entire 728-line fixture architecture remained in product source and was sustained by a 187-line test that asserted only its own demo events, Ari Lane profile, mock completeness, scenario branches, and deterministic copy. The live implementation note still advertised that dead architecture as an Event Detail degradation path, creating a high-likelihood reintroduction point.",
    decision:
      "Retire the orphan module and its self-validating capability test instead of maintaining a parallel registration model. Preserve historical audit references, but make the current handoff documentation name only the reviewed public/actor Event loader, actor Profile source, adaptive question generator, idempotent registration service, authenticated APIs, and unavailable no-write boundary.",
    files:
      "repos/orbits/features/events/registration-profile-guide.ts; repos/orbits/tests/capabilities/event-registration-profile-guide.test.ts; repos/orbits/features/events/REGISTRATION_PROFILE_GUIDE_LIVE_IMPLEMENTATION.md",
    regression:
      "Repository search found zero production imports after P1-071. GitNexus file-level impact was LOW with two direct graph references and zero processes, although stale symbol results still listed removed page callers. Focused remaining registration/detail tests passed 34/34, lint passed, the full suite passed 1352/1352 after five orphan-only cases disappeared, and production build passed. Staged detect reported LOW and zero processes but did not map either deleted file, so no unsupported deletion-risk claim is made.",
    status:
      "fixed and source/lint/build/full-suite-verified for complete retirement of the deterministic test-user registration guide; real adaptive-registration runtime gaps remain tracked under AUDIT-P1-071",
  },
  {
    id: "AUDIT-P1-073",
    severity: "P1",
    rootCause:
      "The proxy treated /app/agent as private, but the server page itself did not resolve the authenticated session and called the shared Chat route loader without actorId. The sibling /app/chat page already supplied that scope. Tests exercised generic service fallback and even invoked the protected page outside a Next request context, masking the missing page-level identity boundary. The manual acceptance guide also claimed an action query produced a command-center preview even though action, scenario, mode, and proactive query inputs were inert.",
    decision:
      "Give /app/agent the same explicit server identity boundary as /app/chat: resolve auth, redirect a missing actor to the canonical login return, and pass the actor into shared Chat composition. Keep URL input limited to conversation identity, language, and submitted query. Leave Agent action review, acceptance, dismissal, ledger transitions, and external-action work behind their explicit authenticated client/API boundaries; document obsolete action/scenario/mode values as no-ops instead of inventing page-load behavior.",
    files:
      "repos/orbits/app/(app)/app/agent/page.tsx; repos/orbits/tests/pages/app-agent-live-route-services.test.ts; repos/orbits/tests/pages/app-agent-todo-summary.test.tsx; repos/orbits/tests/pages/app-proactive-agent-message.test.tsx; repos/orbits/scripts/manual-acceptance.md",
    regression:
      "GitNexus pre-edit impact was LOW with no upstream callers. Focused Agent/Chat tests passed 16/16, lint passed, the complete Web suite passed 1352/1352, and production build passed. Regression covers page auth, signed-out redirect source, canonical actor propagation, real Agent rendering, submitted-query hydration, proactive fixture isolation, and absence of action/scenario/mode query reads. Staged detect was HIGH across eight existing flows because AppAgentPage is their common entry; context review found no incoming callers and no changed downstream call set.",
    status:
      "fixed and source/lint/build/full-suite-verified for Agent page auth, actor propagation, and obsolete query isolation; authenticated browser runtime, populated two-account conversation isolation, explicit Agent action/readback, cache/proxy behavior, responsive, keyboard, and assistive traversal remain unverified",
  },
  {
    id: "AUDIT-P1-074",
    severity: "P1",
    rootCause:
      "After /app/agent migrated to authenticated actor-scoped Chat composition, orbit-agent-route-view-model.ts still contained a complete synchronous hybrid-data constructor. It built deterministic people and event recommendations, suggestion prompts, and conversation history from getOrbitHybridRouteData. No product page called it; one broad legacy test kept the parallel architecture alive by seeding a fake local database and asserting the getter's own output.",
    decision:
      "Retain orbit-agent-route-view-model.ts only as the stable UI type contract consumed by the real Chat adapter and Agent component. Delete the legacy getter, its six private hybrid-data helpers, and all data-layer imports. Remove the test-only invocation and make the focused Agent source regression prohibit both getOrbitAgentViewModel and getOrbitHybridRouteData from returning. Evaluate other legacy route constructors independently instead of deleting them in one unbounded change.",
    files:
      "repos/orbits/app/(app)/app/orbit-agent-route-view-model.ts; repos/orbits/tests/pages/app-agent-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus reported LOW impact and zero execution flows for the getter; its helpers reached only the same dead chain. Focused tests passed 4/4, lint passed, the complete Web suite passed 1352/1352, and production build passed. The Agent UI types remain imported by the Chat adapter and real component, while repository search and regression reject the deleted constructor/import. Staged detect returned No changes detected despite Git showing three staged files and 187 deletions, so the deletion blind spot is recorded rather than assigned a false risk.",
    status:
      "fixed and source/lint/build/full-suite-verified for retirement of the Agent-only legacy hybrid constructor; other parallel route constructors remain pending separate review",
  },
  {
    id: "AUDIT-P1-075",
    severity: "P1",
    rootCause:
      "The canonical /app/register route had already become a narrow reviewed-public-event redirect into adaptive registration, but a separate orbit-register-route-view-model.ts remained in product source. Its synchronous getter combined the legacy landing event and legacy Profile model into a complete profile-preview registration form. No product page imported it; one legacy hybrid-route test sustained the second registration architecture.",
    decision:
      "Delete the orphan compatibility file rather than keep a re-export shell. Keep registration contracts at their real feature-local boundary and retain /app/register as the single invite-code adapter: reviewed public event lookup, language-only propagation, unknown-code no-write state, and redirect to /app/events/[id]/register. Remove the legacy test invocation and make the focused Register regression assert the file stays absent.",
    files:
      "repos/orbits/app/(app)/app/orbit-register-route-view-model.ts; repos/orbits/tests/pages/app-register-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus reported LOW impact with one direct test caller and zero execution flows. Focused tests passed 7/7, lint passed, the complete Web suite passed 1352/1352, and production build passed. Coverage retains reviewed EVTSIGNUP01 resolution, canonical adaptive-registration redirect, language propagation, public mode/scenario isolation, unknown-code failure, and absence of pre-redirect profile form composition. Staged detect returned No changes detected despite the deleted file and removed test reference, so the deletion blind spot is recorded.",
    status:
      "fixed and source/lint/build/full-suite-verified for retirement of the legacy Register hybrid constructor; real adaptive-registration runtime gaps remain tracked under AUDIT-P1-071",
  },
  {
    id: "AUDIT-P1-076",
    severity: "P1",
    rootCause:
      "The real public Organizer page had migrated to a dedicated loader, but orbit-organizer-route-view-model.ts still exported a synchronous hybrid constructor. It read the landing model, silently selected the first event when a slug did not match, derived organizer events and participant totals, and was invoked only by the broad legacy hybrid-route test. This kept an unreviewed fallback architecture next to the canonical privacy-aware public loader.",
    decision:
      "Keep orbit-organizer-route-view-model.ts as a type-only boundary for the real loader and component. Delete getOrbitOrganizerPublicViewModel and its runtime landing import, remove the test-only call, and extend the focused Organizer regression to prohibit both the legacy getter and getOrbitLandingViewModel import. Preserve unknown-slug handling, public catalogue resolution, localization, aggregate-only statistics, and attendee-name privacy in the canonical loader.",
    files:
      "repos/orbits/app/(app)/app/orbit-organizer-route-view-model.ts; repos/orbits/tests/pages/app-organizer-public-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus reported LOW impact with one direct test caller and zero execution flows. Focused tests passed 9/9, lint passed, the complete Web suite passed 1352/1352, and production build passed. Coverage retains public code resolution, unknown-slug isolation from private storage, language-stable controlled states, URL control isolation, aggregate-only output, and absence of attendee names. Staged detect returned No changes detected despite the getter removal and test changes, so the deletion blind spot is recorded.",
    status:
      "fixed and source/lint/build/full-suite-verified for retirement of the legacy Organizer hybrid constructor; the canonical public Organizer loader remains the single data architecture",
  },
  {
    id: "AUDIT-P1-077",
    severity: "P1",
    rootCause:
      "After /app/profile migrated to authenticated actor-scoped Profile composition, orbit-profile-route-view-model.ts still contained a synchronous hybrid constructor. It combined global account, contacts, connections, relationship-value types, and event participant intents into manufactured biography, company, industries, tags, offerings, needs, and topics. No production path called it; the broad legacy hybrid-route test kept the second Profile architecture alive.",
    decision:
      "Retain only OrbitProfileView and OrbitProfileViewModel as the shared editor contract. Delete getOrbitProfileViewModel, its private unique helper, and all hybrid-data imports. Remove the test-only call and extend the focused Profile source regression to prohibit the getter and getOrbitHybridRouteData. Keep actor identity, extraction, save, free-text/custom tags, and complete API readback in the canonical Profile implementation.",
    files:
      "repos/orbits/app/(app)/app/orbit-profile-route-view-model.ts; repos/orbits/tests/pages/app-profile-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus reported LOW impact and zero execution flows; the only direct caller was the legacy test. Focused tests passed 12/12, lint passed, the complete Web suite passed 1352/1352, and production build passed. Coverage retains actor-scoped failure, real editor composition, API extraction/save, strict partial-readback rejection, free-text industry, custom tags, and the absence of hardcoded founder identity. Staged detect returned No changes detected despite 70 deletions, so the deletion blind spot is recorded.",
    status:
      "fixed and source/lint/build/full-suite-verified for retirement of the legacy Profile hybrid constructor; canonical actor-scoped Profile composition remains the single data architecture",
  },
  {
    id: "AUDIT-P1-078",
    severity: "P1",
    rootCause:
      "The real Party and check-in pages had migrated to authenticated shared Party composition, but orbit-party-route-view-model.ts still contained a synchronous hybrid constructor and five helpers. They selected a global hybrid event and manufactured agenda, recommendations, tablemates, people, and current-user state from account, contacts, connections, and network fixtures. No production route called this architecture; the broad legacy hybrid-route test alone kept it alive.",
    decision:
      "Retain the OrbitParty interfaces as the shared UI contract. Delete getOrbitPartyViewModel, currentEvent, partyAgenda, personFromContact, personFromNetworkPerson, recommendationPeople, and all runtime hybrid imports. Remove the test-only invocation and extend the focused Party source regression to prohibit the getter and getOrbitHybridRouteData. Preserve real actor propagation, public registration access, route-derived filters, empty sourced-event behavior, and mock-fixture isolation in the canonical loader. Audit the separate buildOrbitParty authored-presentation path independently rather than bundling an unverified boundary change.",
    files:
      "repos/orbits/app/(app)/app/orbit-party-route-view-model.ts; repos/orbits/tests/pages/app-party-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus reported LOW impact and zero execution flows for every removed function; only the legacy test directly called the public constructor. Focused tests passed 14/14, lint passed, the complete Web suite passed 1352/1352, and production build passed. Coverage retains the real Party loader, shared check-in composition, route-derived industry filtering, registered/unregistered public access, actor propagation, query isolation from mock fixtures, sourced-event empty-people handling, and distinct missing-selection/missing-people states. Staged detect returned No changes detected despite 213 deletions, so the deletion blind spot is recorded.",
    status:
      "fixed and source/lint/build/full-suite-verified for retirement of the legacy Party hybrid constructor; authored Party presentation/content remains a separate pending review",
  },
  {
    id: "AUDIT-P1-079",
    severity: "P1",
    rootCause:
      "A second orphan Party architecture remained after the live-capable loader migration. orbit-party-presentation.ts explicitly replaced raw route data with 625 lines of authored demo content, including fixed event id, access code, event phase, current user, recommendations, tablemates, agenda, and icebreakers. The builder had no caller or execution flow, but retaining it created a ready path to bypass actor identity, event selection, registration access, and source-backed people context.",
    decision:
      "Delete orbit-party-presentation.ts and orbit-party-content.ts as one closed orphan chain instead of wiring fixed demo data back into production or preserving unused compatibility exports. Keep loadAppPartyRouteViewModel and OrbitPartyViewModel as the single Party architecture. Extend the focused source regression to assert both authored demo files remain absent while retaining the real loader, access-state, actor propagation, route-filter, and empty-context checks.",
    files:
      "repos/orbits/app/(app)/app/orbit-party-presentation.ts; repos/orbits/app/(app)/app/orbit-party-content.ts; repos/orbits/tests/pages/app-party-live-route-services.test.ts",
    regression:
      "GitNexus reported LOW impact and zero execution flows for every deleted function, constant, and interface. Focused tests passed 14/14, lint passed, the complete Web suite passed 1352/1352, and production build completed 39/39 static pages. Coverage now rejects both orphan files and continues to exercise the real Party/check-in loader, registered and unregistered public access, actor propagation, query isolation, route-derived filtering, and sourced empty-state behavior. Staged detect returned No changes detected despite 718 deletions, so the deletion blind spot is recorded.",
    status:
      "fixed and source/lint/build/full-suite-verified; Party now has one actor- and event-scoped route data architecture",
  },
  {
    id: "AUDIT-P1-080",
    severity: "P1",
    rootCause:
      "After Admin and Platform pages migrated to authenticated Events + Profile composition, orbit-admin-platform-route-view-model.ts still contained two synchronous hybrid constructors and five private support symbols. They manufactured organizer ownership, member email, event capacity, check-in/match totals, activity feed, moderation queue, and platform account statistics from global hybrid data. No production page used them; a broad legacy self-validation test alone sustained the second architecture.",
    decision:
      "Retain the Admin and Platform interfaces as the shared loader/component contract. Delete getOrbitAdminViewModel, getOrbitPlatformViewModel, their helpers/constants, and all EventDTO/hybrid runtime imports. Remove the legacy test invocations and extend the focused Admin/Platform source regression to prohibit both getters and getOrbitHybridRouteData. Preserve session enforcement, actor forwarding, Events + Profile composition, route-state propagation, public-query isolation, and the explicit read-only guardrail in the canonical implementation.",
    files:
      "repos/orbits/app/(app)/app/orbit-admin-platform-route-view-model.ts; repos/orbits/tests/pages/app-admin-platform-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus reported LOW impact and zero execution flows for every removed symbol; exact context identified only the legacy test as a public-getter caller. Focused tests passed 8/8, lint passed, the complete Web suite passed 1352/1352, and production build completed 39/39 static pages. Coverage retains authenticated page wiring, mock success, controlled unconfigured-live failure, public query isolation, source-backed read-only Admin metrics, and the absence of unbacked approval, notification, matching, export, invite, or create controls. Staged detect returned No changes detected despite 192 deletions, so the deletion blind spot is recorded.",
    status:
      "fixed and source/lint/build/full-suite-verified; authenticated Events + Profile composition remains the single Admin/Platform route architecture",
  },
  {
    id: "AUDIT-P1-081",
    severity: "P1",
    rootCause:
      "The shared Landing constructor combined a public event catalogue with the first hybrid account, profile, contacts, and every attendee row, then marked every event authenticated and RSVP'd. Production list, detail, Organizer, and Party callers relied on separate page-level scrubbing or registration checks, making privacy unsafe by default and easy for a new caller to bypass. A second orphan detail helper also returned the first event when an unknown code was requested.",
    decision:
      "Make getOrbitLandingViewModel a public-safe contract: use the neutral Orbit label, expose no contacts or attendee names, preserve aggregate counts, and default authentication/registration flags to false. Remove the unknown-code fallback helper. Add a dedicated server route-model boundary that accepts a non-empty actor and event, reads the real registration record, returns null unless status is rsvped, and only then attaches source-backed attendee rows. Route Event detail and Party through it. Keep registration/PostgreSQL dependencies out of the shared Landing module because that module also supplies client-consumed cover presentation.",
    files:
      "repos/orbits/app/(app)/app/orbit-landing-route-view-model.ts; repos/orbits/app/(app)/app/orbit-registered-event-route-view-model.ts; repos/orbits/app/(app)/app/events/[id]/page.tsx; repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts; repos/orbits/tests/pages/app-events-live-route-services.test.ts; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts; repos/orbits/tests/pages/app-organizer-public-live-route-services.test.ts; repos/orbits/tests/pages/app-party-live-route-services.test.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "GitNexus warned HIGH before the public catalogue edit across three production processes. Focused tests passed 45/45 and include a real registration live-record lifecycle: unregistered and cross-actor reads return null, registration returns the exact event with all 50 source-backed attendees, cancellation removes access, and unknown/empty inputs fail closed. Public seed substitution still changes event content but cannot change the exposed account label or inject contacts/attendee names. Lint passed, the complete Web suite passed 1353/1353, and production build completed 39/39 static pages after separating the server registration module from client-consumed Landing code. Staged detect reported medium risk and only the expected Event detail execution flow.",
    status:
      "fixed and source/persistence/lint/build/full-suite-verified; public catalogue identity and attendee access now fail closed by default",
  },
  {
    id: "AUDIT-P1-082",
    severity: "P1",
    rootCause:
      "Even after the public roster was made fail-closed, production Landing still called getOrbitHybridRouteData for the catalogue, evidence, counts, and generated time instead of the existing Events feature boundary. The public Events API separately selected the first private local account as organizer. eventCoverPhoto also lived beside server data, so client Agent/Admin imports made future server-only dependencies easy to pull into browser bundles.",
    decision:
      "Make readPublicEventCatalogue the single public aggregate contract and extend it with source-derived per-event evidence summaries and participant counts. Put exact actor/event registration verification and approved attendee projection in a feature-owned server boundary used by Event detail and Party. Move event cover selection into a data-free presentation module, expose the neutral Orbit organizer from the public API, and prohibit production getOrbitHybridRouteData calls.",
    files:
      "repos/orbits/features/events/public-catalogue.ts; repos/orbits/features/events/registered-catalogue-attendees.ts; repos/orbits/app/(app)/app/orbit-landing-route-view-model.ts; repos/orbits/app/(app)/app/orbit-registered-event-route-view-model.ts; repos/orbits/app/(app)/app/orbit-event-cover-photo.ts; repos/orbits/app/(app)/app/admin/orbit-real-admin.tsx; repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/app/api/events/public/route.ts; repos/orbits/tests/api/public-events-route.test.ts; repos/orbits/tests/pages/app-events-live-route-services.test.ts",
    regression:
      "GitNexus warned HIGH before the Landing edit across eight upstream symbols and three production processes; the catalogue boundary reached seven upstream symbols and one registration flow, and the cover helper reached ten Agent/Admin symbols. Exact source search finds no production getOrbitHybridRouteData caller. Focused tests passed 50/50, lint passed, the complete Web suite passed 1353/1353, and production build completed 39/39 static pages; commit 8625f4e5. Staged detection reported HIGH for 10 changed symbols and six reviewed public event catalogue/registration flows.",
    status:
      "fixed and source/persistence/privacy/client-bundle/API/lint/build/full-suite-verified; remaining pure hybrid helper retirement is tracked as a separate bounded review",
  },
  {
    id: "AUDIT-P1-083",
    severity: "P1",
    rootCause:
      "Once every production getOrbitHybridRouteData caller was removed, a 349-line global hybrid data module remained solely because three route files imported six pure event presentation helpers from it. That accidental co-location kept an unused first-account/profile fallback aggregate and 25 attendee, evidence, network, contact inference, sorting, code, gradient, and formatting symbols available for reintroduction.",
    decision:
      "Move only the six live, behavior-preserving event view helpers into a data-free presentation module. Import eventCodeFor directly from the Events feature and hashString from the shared utility. Delete the entire hybrid data module and all orphan symbols, then enforce both file absence and replacement-module dependency isolation in source regression.",
    files:
      "repos/orbits/app/(app)/app/orbit-event-view-helpers.ts; repos/orbits/app/(app)/app/orbit-hybrid-route-data.ts; repos/orbits/app/(app)/app/orbit-landing-route-view-model.ts; repos/orbits/app/(app)/app/orbit-registered-event-route-view-model.ts; repos/orbits/app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model.ts; repos/orbits/tests/pages/orbit-hybrid-route-view-models.test.ts",
    regression:
      "Fresh GitNexus impact warned HIGH for five live presentation helpers across three Events/Party flows; OrbitHybridRouteData was MEDIUM with zero production processes, while getOrbitHybridRouteData and nearly every obsolete helper were LOW with zero callers or flows. Focused tests passed 50/50, lint passed, the complete Web suite passed 1353/1353, and production build completed 39/39 static pages; commit 1893c5f2. Source search finds no production hybrid module/getter reference. Staged detection returned No changes detected for the add/delete/import-only refactor, so no unsupported staged risk level is claimed.",
    status:
      "fixed and source/dependency-boundary/privacy/persistence/lint/build/full-suite-verified; the global hybrid route data architecture is fully retired",
  },
  {
    id: "AUDIT-P1-084",
    severity: "P1",
    rootCause:
      "The private Events loader combined an actor-scoped event list with global value and attendee recommendation services. It selected the first global recommendation id, fetched foreign attendee/readiness data, then silently fell back to the actor's first event when that id was absent, producing a cross-account composite that looked internally valid.",
    decision:
      "Pass the authenticated actor id into both live recommendation factories. Intersect value recommendations with the actor event set before choosing a primary event, require attendee/readiness payload event ids to equal that primary id, and degrade missing/foreign optional capabilities to explicit unavailable state without hiding valid actor events. Never project one event's readiness or attendee onto every event choice.",
    files:
      "repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory.ts; repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model.ts; repos/orbits/app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter.ts; repos/orbits/tests/pages/app-events-live-route-services.test.ts",
    regression:
      "GitNexus warned HIGH across three private page processes before the edit. A dedicated regression injects foreign value, attendee, and readiness payloads and proves the actor event remains while all foreign optional data becomes unavailable. Focused tests passed 11/11, lint passed, full Web tests passed 1354/1354, build passed 39/39, and live browser readback removed the stranger and false score 87; commit 195cbe0d. Staged detection reported medium risk for 15 symbols and four reviewed flows.",
    status:
      "fixed and actor/event-isolation/partial-capability/browser/lint/build/full-suite-verified; unsupported attendee and readiness state remains explicitly unavailable",
  },
  {
    id: "AUDIT-P1-085",
    severity: "P1",
    rootCause:
      "Admin treated event evidence, lifecycle status, and recommendations as operational registration/check-in/match/capacity/activity data and generated an email from the profile name. Platform then reclassified the same personal account and events as verified organizer, platform user, and moderation queue records without a platform-wide provider or persisted platform-admin role.",
    decision:
      "Reduce Admin to fields provided by actor-scoped Event/Profile sources and date-derived lifecycle counts, display the actual profile email, and explicitly withhold unsupported operational metrics. Delete the synthetic Platform success model/component and fail closed before personal data reads until both a platform-wide provider and an enforced platform-admin role exist.",
    files:
      "repos/orbits/app/(app)/app/admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model.ts; repos/orbits/app/(app)/app/admin/orbit-real-admin.tsx; repos/orbits/app/(app)/app/orbit-admin-platform-route-view-model.ts; repos/orbits/app/(app)/app/platform/page.tsx; repos/orbits/app/(app)/app/platform/orbit-real-platform.tsx; repos/orbits/tests/pages/app-admin-platform-live-route-services.test.ts",
    regression:
      "All pre-edit GitNexus impacts were LOW with zero indexed processes. Focused tests passed 6/6, lint passed, full Web tests passed 1354/1354, and build passed 39/39; commit e8d8df38. Desktop browser readback showed only the real account event/profile and Platform unavailable state. At 390x844 both routes had no overflow and both recovery links were 44px. Staged detection reported LOW for 19 symbols and zero flows, while the deleted Platform component remained a deletion-only file.",
    status:
      "fixed and source-truth/platform-fail-closed/browser/responsive/lint/build/full-suite-verified; no platform moderation, role, registration, attendance, capacity, match, team, or live-feed capability is claimed",
  },
  {
    id: "AUDIT-P1-086",
    severity: "P1",
    rootCause:
      "Admin rendered Access and Event setup navigation buttons whose destinations were merely the Dashboard and Events routes, while the shared login entry promised registration, check-in, matching, and an unused Platform-admin mode that no backed provider could deliver.",
    decision:
      "Remove navigation items without distinct implemented destinations instead of creating empty shells or relabeling unrelated pages. Make the shared entry organizer-only, preserve secure sign-in to /app/admin, and state the exact actor-scoped Event/Profile read boundary plus the unsupported operational data.",
    files:
      "repos/orbits/app/(app)/app/admin/orbit-real-admin.tsx; repos/orbits/tests/pages/app-admin-platform-live-route-services.test.ts",
    regression:
      "GitNexus impact was LOW for both edited symbols. Focused tests passed 6/6, lint passed, full Web tests passed 1354/1354, and build passed 39/39; commit 048db81b. Browser readback found only the two real Admin destinations and the compatibility login entry linked to /app/admin with truthful copy. Staged detection reported LOW for two files, one symbol, and zero flows.",
    status:
      "fixed and navigation-destination/login-copy/browser/lint/build/full-suite-verified; unsupported Admin capabilities no longer appear as actionable controls",
  },
  {
    id: "AUDIT-P1-087",
    severity: "P1",
    rootCause:
      "The audit source graph treated every local file import as reachability of every declaration in that file. Importing Icon therefore counted the sibling IconButton, importing Chip counted sibling action components, and route-specific components co-located in Admin, Party, and Contacts were all assigned to every importing route. The interaction and overlay denominators were deterministic but materially overstated.",
    decision:
      "Keep file-level dependency traversal for data, persistence, provider, and state signals, but derive route UI from the exact default/named/namespace export imported by the page, then traverse only referenced local declarations and re-exports. Apply the same symbol scope to interactions, visible content, and overlays. Split the four Admin route surfaces into route-owned components with a shared navigation shell so their ownership remains explicit in both production and audit evidence.",
    files:
      "repos/orbits/scripts/generate-full-product-functional-audit.mjs; repos/orbits/tests/audits/full-product-functional-audit.test.ts; repos/orbits/app/(app)/app/admin/orbit-real-admin-login.tsx; repos/orbits/app/(app)/app/admin/orbit-real-admin-shell.tsx; repos/orbits/app/(app)/app/admin/orbit-real-admin-workspace.tsx; repos/orbits/app/(app)/app/admin/orbit-real-admin-events.tsx; repos/orbits/app/(app)/app/admin/page.tsx; repos/orbits/app/(app)/app/admin/events/page.tsx; repos/orbits/app/(app)/app/admin/access/page.tsx; repos/orbits/app/(app)/app/login-admin/page.tsx",
    regression:
      "GitNexus reported HIGH for the shared Admin shell/navigation helpers because both Admin routes consume them; the behavior-preserving split was browser-verified across all four entries. Admin-focused tests passed 19/19, lint passed, full Web tests passed 1355/1355, and build passed 39/39; commit c34f54ef. The scanner functions were LOW impact with zero indexed flows; symbol-reachability regression and the audit suite passed; commit c113dc86. Route-reachable interactions changed from 2834 to 2326 and overlay route instances from 49 to 29. Admin success routes now retain three shell controls plus two genuinely reachable failure-state controls, while each public Admin entry retains exactly its one secure sign-in link. Staged detection was LOW for both commits.",
    status:
      "fixed and export/local-dependency/re-export/admin-browser/audit/lint/build/full-suite-verified; file-level dependency signals remain intentionally broader than rendered UI scope",
  },
  {
    id: "AUDIT-P1-088",
    severity: "P1",
    rootCause:
      "Expo manual contact confirmation ended after persisting a confirmed draft and returned contactWriteExecuted=false; it never called the actor-scoped contact store, so the user could not find the confirmed person in Contacts. The draft id also included the submission timestamp, so identical retries created separate pending drafts. The only reusable contact writer was hidden behind a business-card-specific type name.",
    decision:
      "Generalize the existing actor-scoped contact record provider through a source-agnostic compatibility contract. Derive stable manual draft and contact ids from normalized actor plus source input, check the actor's existing contacts before writing, persist source evidence, fail closed while leaving the draft pending on missing storage/write/duplicate errors, and make confirmation retries recover the same contact. Expose the real contact id to Expo only when the response proves a write, refresh the list, and offer a direct Open contact action.",
    files:
      "repos/orbits/features/acquisition/contract.ts; repos/orbits/features/acquisition/live-manual-service.ts; repos/orbits/features/acquisition/manual-contract.ts; repos/orbits/features/acquisition/manual-fixtures.ts; repos/orbits/features/acquisition/mock-manual-service.ts; repos/orbits/features/acquisition/service-factory.ts; repos/orbits/features/contacts/contact-write-contract.ts; repos/orbits/features/contacts/storage/contact-write-live-record-provider.ts; repos/orbits/tests/capabilities/manual-contact-creation-live-store.test.ts; repos/orbits/tests/capabilities/manual-contact-creation-mock.test.ts; repos/orbit-app/src/view-models/contact-acquisition.ts; repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx; repos/orbit-app/tests/contact-acquisition-view-model.test.ts; repos/orbit-app/tests/contact-acquisition-screen.test.ts",
    regression:
      "Server-focused tests passed 17/17, repository lint/typecheck passed, full Web tests passed 1360/1360, and production build completed 39/39; commit 31ebdeab. Expo-focused tests passed 38/38, Expo typecheck passed, and the full Expo suite passed 527/527; commit 0c414649. GitNexus staged detection was LOW for the 10-file server change (33 symbols, zero flows) and MEDIUM for the four-file Expo change (10 symbols, five ContactAcquisitionScreen flows). In the authenticated Expo Web runtime, the first new submission changed the persisted draft queue from two legacy records to three; two identical resubmissions and a later confirmed replay kept it at three. Confirmation displayed 联系人已写入 and 打开联系人, opened the exact contact:manual:* detail, survived a hard reload, and changed the Contacts list from zero to exactly one; replay kept the list at one.",
    status:
      "fixed and actor-isolated/stable-id/duplicate-guard/fail-closed/write/readback/reload/replay/browser/lint/build/full-Web/full-Expo-verified; two pre-fix legacy audit drafts remain as evidence and are not counted as contacts",
  },
  {
    id: "AUDIT-P1-089",
    severity: "P1",
    rootCause:
      "The live QR service ignored input.qrText and reverse-derived a draft from the first existing contact whose source type was qr_scan. Confirmation returned contact and connection candidates with both write flags false, so a valid operator submission could display an unrelated person and never persist the submitted draft, contact, connection, or evidence.",
    decision:
      "Make the submitted orbit-qr text the only scan input, parse a bounded documented field set, and derive stable actor-plus-normalized-payload ids. Persist one actor-scoped pending draft before confirmation. On explicit confirmation, duplicate-check the actor's contacts and upsert stable evidence, contact, and connection records so partial failures and retries converge. Return current-request write flags and saved ids truthfully. Expose the unsigned/no-signature boundary and write targets to Expo instead of claiming camera, decoder, signature, network, AI, or notification work.",
    files:
      "repos/orbits/features/acquisition/contract.ts; repos/orbits/features/acquisition/live-qr-service.ts; repos/orbits/features/acquisition/qr-contract.ts; repos/orbits/features/acquisition/qr-fixtures.ts; repos/orbits/features/acquisition/service-factory.ts; repos/orbits/features/contacts/contact-write-contract.ts; repos/orbits/features/contacts/storage/contact-write-live-record-provider.ts; repos/orbits/tests/capabilities/qr-scan-connect-live-store.test.ts; repos/orbits/tests/capabilities/qr-scan-connect-mock.test.ts; repos/orbit-app/src/view-models/contact-acquisition.ts; repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx; repos/orbit-app/tests/contact-acquisition-view-model.test.ts",
    regression:
      "QR focused tests passed 14/14; mobile acquisition tests passed 23/23; Web lint/typecheck and Expo typecheck passed; full Web passed 1364/1364; full Expo passed 529/529; production build completed 39/39; commits 2f47e28c and f3416d6b. Browser runtime proved queue 3→4→4, exact parsed fields, confirmed stable contact URL, hard reload, Contacts library readback, one graph connection, and confirmed replay at queue four. Staged detection was LOW for the server rewrite and MEDIUM for the scoped mobile truth-copy change.",
    status:
      "fixed and submitted-input/actor-isolation/stable-id/duplicate/partial-retry/write/evidence/detail/list/graph/reload/replay/browser/lint/build/full-Web/full-Expo-verified; device decoding and signature verification remain explicitly unsupported",
  },
  {
    id: "AUDIT-P1-090",
    severity: "P1",
    rootCause:
      "Relationship-value evidence was truncated before localization and was not deduplicated after different evidence records mapped to the same display line. Contact detail rendered those strings with key={line}, producing duplicate visible evidence and a React duplicate-key warning for the persisted QR relationship.",
    decision:
      "Keep backend evidence records intact, but localize every presentation candidate first, deduplicate the final user-facing strings, and only then apply the three-row display limit. This removes redundant rows and guarantees the existing string key is unique without hiding distinct localized facts.",
    files:
      "repos/orbit-app/src/view-models/relationship-value.ts; repos/orbit-app/tests/relationship-value-view-model.test.ts",
    regression:
      "GitNexus impact was LOW for readyEvidence. Focused tests passed 3/3, Expo typecheck passed, and full Expo passed 529/529. On the same hard-loaded QR contact detail, browser evidence changed from two identical business-context rows plus Encountered two children with the same key to one row and no warning; commit 900c1058. Staged detection was LOW for two files, two symbols, and zero flows.",
    status:
      "fixed and localized-row-deduplication/React-key/browser-reload/typecheck/full-Expo-verified; stored evidence remains unchanged",
  },
  {
    id: "AUDIT-P1-091",
    severity: "P1",
    rootCause:
      "The general Web Agent page treated the Chat route's empty relationship-conversation state as an Agent availability failure, so a new actor could not reach the composer or any run/action control. The shared empty-state loader then queried a synthetic demo-conversation-1 against the actor's live store, turning a valid zero-row list into a misleading not-found error.",
    decision:
      "Keep /app/chat as the source-backed conversation review surface, but compose /app/agent independently when the authoritative Chat list is ordinarily empty. Return early from empty-state composition before any child conversation read. Supply a starter Agent model containing no people, events, history, or inferred relationship facts, only generic prompts. Preserve exact route-state boundaries for requested missing conversations and all service failures.",
    files:
      "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/app/(app)/app/agent/page.tsx; repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts; repos/orbits/app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts; repos/orbits/app/(app)/app/orbit-agent-route-view-model.ts; repos/orbits/tests/pages/app-agent-contact-recommendations.test.tsx; repos/orbits/tests/pages/app-agent-live-route-services.test.ts; repos/orbits/tests/pages/app-chat-page.test.tsx",
    regression:
      "Focused Agent/Chat tests passed 30/30, lint/typecheck passed, the complete Web suite passed 1366/1366, and production build completed 39/39; commit 7379d840. Browser runtime proved the same empty actor moved from a blocking StateView to a zero-entity Agent starter. A real follow-up-task prompt moved through awaiting confirmation → deferred → reload/history reopen → completed, then appeared in Today both as the completed action and as 联系 Maya on its 2026-08-05 due date. GitNexus returned UNKNOWN for the edited TSX/adapter/loader symbols and No changes detected for the exact staged files, so the unavailable graph result is recorded rather than upgraded.",
    status:
      "fixed and empty-actor/no-fixture/no-synthetic-id/fail-closed/proposal/defer/reload/confirm/outbox/task-readback/browser/lint/build/full-suite-verified; remaining Agent action states stay in the audit queue",
  },
  {
    id: "AUDIT-P1-092",
    severity: "P1",
    rootCause:
      "Today grouped every terminal Agent ledger outcome under 最近完成, so rejected, canceled, failed, and undone audit records were presented as completed work. The generic substring localizer also had no exact presentation contract for canonical natural-language action titles or ledger status labels, causing the English terminal section to retain Chinese or mixed-language action copy.",
    decision:
      "Keep all non-deferred terminal ledger records visible for auditability, but name the section 最近动态 / Recent activity / 最近の動き. Add a Today-scoped exact presentation layer for section names and the six canonical natural-language action titles, plus explicit per-language labels for every ledger status. Apply that presentation before the existing tree localizer and leave the shared localization engine untouched because its indexed blast radius is corrupt and broad.",
    files:
      "repos/orbits/app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model.ts; repos/orbits/app/(app)/app/today/orbit-real-today.tsx; repos/orbits/app/(app)/app/today/today-page-content.tsx; repos/orbits/app/(app)/app/today/today-section-presentation.ts; repos/orbits/tests/pages/app-today-merged.test.ts; repos/orbits/tests/pages/app-today-route-view-model.test.ts",
    regression:
      "Focused tests passed 51/51, lint/typecheck passed, the complete Web suite passed 1368/1368, and production build completed 39/39; commit 39d9bf87. Browser runtime proved two ignored operations survived hard reload, created no 2026-08-12 arrangement, and rendered coherent terminal section/action/status copy in English and Chinese. Staged detection was HIGH for six files because AppTodayPageContent reaches nine reviewed Today load flows; shared localization was intentionally unchanged.",
    status:
      "fixed and ignore/no-write/reload/terminal-semantics/English/Chinese/lint/build/full-suite-verified; broader mixed-language Today arrangement prose is recorded as a separate open defect",
  },
  {
    id: "AUDIT-P1-093",
    severity: "P1",
    rootCause:
      "Agent exposed 从失败步骤重试 and a public retry transition, but production never registered a resumable step executor. retryRun only changed the failed run to running and failed steps to queued; no worker consumed those queued steps, so a seeded failure would enter permanent polling while falsely implying recovery. Ordinary conversation failures returned no run id at all and only appended passive error text, leaving the user to retype the request.",
    decision:
      "Treat persisted run steps as immutable observability evidence, not executable workflow instructions. Remove the unused generic retryRun mutation and reject retry on the run transition API. When a failed run advertises recovery, locate the nearest preceding user message and submit it through the normal conversation endpoint as a new run. For failures without a run id, persist the original retry request on the assistant failure message and expose the same disabled-while-pending recovery control. Keep old failure evidence visible and label both actions 重新提交请求 / Retry request so the scope is truthful.",
    files:
      "repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx; repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/app/api/ai/runs/[id]/transition/route.ts; repos/orbits/features/agent/runtime/service.ts; repos/orbits/tests/capabilities/agent-runtime-evolution.test.ts; repos/orbits/tests/pages/app-agent-chat-actions.test.tsx; repos/orbits/tests/pages/app-agent-chat-history.test.ts",
    regression:
      "Focused tests passed 30/30 and 23/23, lint/typecheck passed, full Web passed 1371/1371, and production build completed 39/39; commits 6f4583f1 and ca575f31. A formal live runtime failure seed drove the real browser from a persisted 6/7 failed run through 重新提交请求 to a distinct 6/6 completed run. Store readback preserved the old failed step and the new run had zero actions. A deliberate production-server outage then proved a no-run network failure rendered a persisted retry button, disabled during replay, recovered after restart, and survived hard reload/history reopen. The first GitNexus staged result was corrupt/CRITICAL; the second scoped change was LOW.",
    status:
      "fixed and truthful-run/no-run-replay/new-run/immutable-failure/no-write/live-store/network-outage/browser/reload/lint/build/full-suite-verified; direct provider-failure injection remains an open audit case",
  },
  {
    id: "AUDIT-P1-094",
    severity: "P1",
    rootCause:
      "undoAction iterated every declared operation whose compensation policy was supported, regardless of whether the user selected it or the executor completed it. In a multi-operation or partially failed action, undo could therefore compensate an operation that never created a record and could repeat an already completed compensation after an interrupted retry.",
    decision:
      "Resolve compensation scope from immutable completed execution receipts for the exact action. Reject undo when no completed operation exists or when an executed operation lacks compensation. Keep the action-level undone fast path and one stable receipt per completed operation. The initial undo-receipt lookup exposed a repository terminal-status mismatch; AUDIT-P1-096 closes that crash-window fence.",
    files:
      "repos/orbits/features/agent/runtime/service.ts; repos/orbits/tests/capabilities/agent-runtime-evolution.test.ts",
    regression:
      "A two-operation regression selected and executed only the first operation, then proved undo compensated only that record and never touched the unselected sibling. Focused Agent/runtime/ledger tests passed 41/41; the complete Web suite passed 1372/1372; lint and production build passed. Live browser and Postgres readback proved repeated confirmation created one task/receipt/outbox, repeated undo created one compensation receipt, hard reload retained the undone state, and Today removed the task. Commit 7bf79467; staged detection was LOW for two files, five symbols, and zero processes.",
    status:
      "fixed and selected-operation/completed-receipt/action-level-idempotency/live-store/browser/reload/focused/full-suite/lint/build-verified; receipt-level crash recovery completed under AUDIT-P1-096",
  },
  {
    id: "AUDIT-P1-095",
    severity: "P1",
    rootCause:
      "The live ledger transition route processed durable outbox work only after confirm. retryAction correctly reset dead-letter or retry-scheduled events to pending and moved the action to approved, but the route immediately reloaded All Actions without running that outbox. Without an independently running worker, the user-visible retry stayed approved indefinitely and created no recovered domain result.",
    decision:
      "Treat confirm and explicit action retry as the two live transitions that must synchronously hand their scoped durable outbox to the runtime before returning. Keep undo, cancel, reject, and defer outside that execution policy. Put the policy in a route-adjacent pure module because Next.js route files reject extra named exports.",
    files:
      "repos/orbits/app/api/agent/ledger/[id]/transition/route.ts; repos/orbits/app/api/agent/ledger/[id]/transition/transition-execution-policy.ts; repos/orbits/tests/api/agent-action-ledger-routes.test.ts",
    regression:
      "The policy regression proves live confirm/retry execute outbox while live undo and mock retry do not. Focused route/runtime/ledger tests passed 37/37, lint passed, production build completed 39/39, and full Web passed 1375/1375. A live actor-scoped partial-failure record moved directly to completed after the browser clicked 重试失败项, and repository readback proved only the dead-letter operation gained a new completed receipt. Commit 1dd7b4b6; the exact route impact was LOW and staged detection reported no changes for the add/import route patch.",
    status:
      "fixed and live-retry/outbox/failed-only-execution/browser/store-readback/focused/full-suite/lint/build-verified",
  },
  {
    id: "AUDIT-P1-096",
    severity: "P1",
    rootCause:
      "undoAction checked the deterministic undo idempotency key before compensating, but both memory and storage repository implementations returned only receipts whose status was completed. A valid compensation receipt uses status undone, so a worker crash after saving that receipt but before saving action status made the receipt invisible and allowed the compensation side effect to run again.",
    decision:
      "Define idempotency lookup as successful-terminal receipt lookup: return completed execution receipts and undone compensation receipts while continuing to ignore failed attempt receipts. The distinct undo: idempotency prefix keeps compensation receipts from fencing the original executor. Add both a crash-window service regression and a storage-repository contract regression.",
    files:
      "repos/orbits/features/agent/runtime/repository.ts; repos/orbits/features/agent/storage/agent-runtime-live-record-provider.ts; repos/orbits/tests/capabilities/agent-runtime-evolution.test.ts",
    regression:
      "The crash-window regression saved an undone receipt while action status remained completed, then proved undoAction moved the action to undone without invoking compensate. The storage-backed repository returned undone and ignored failed. Focused tests passed 14/14, lint passed, production build completed 39/39, and full Web passed 1375/1375. The live partial-failure action then produced two completed and two undone receipts and returned both due dates to zero. Commit 014d0c15; staged detection was LOW for three files, six symbols, and zero processes.",
    status:
      "fixed and completed/undone-terminal-receipt/failed-attempt-retry/crash-window-compensation/storage/focused/full-suite/lint/build-verified",
  },
  {
    id: "AUDIT-P1-097",
    severity: "P1",
    rootCause:
      "Orbit Agent history writes had no truthful persisted-success contract. In live mode without configured storage, POST and DELETE returned success=true with persisted=false. The client checked only the top-level success flag, optimistically changed pin, custom title, and delete state before the request completed, ignored every failure, and could therefore show a change that vanished after reload. Delete also executed directly from the menu without an irreversible-action confirmation, while rename exposed only implicit Enter/blur submission.",
    decision:
      "Fail closed with SERVICE_UNAVAILABLE/503 for unconfigured history writes and deletes while retaining honest read-only empty responses. Require data.storage.persisted=true before the client accepts a mutation. Serialize per-page history writes, keep the prior UI on failure, and expose explicit accessible success/error feedback. Update pin and rename only after storage confirmation. Gate deletion behind a focus-managed alertdialog with keep and confirm actions, and clear the active transcript only after the actor-scoped delete persists. Replace implicit rename submission with visible save and cancel controls.",
    files:
      "repos/orbits/app/api/ai/conversations/sessions/handler.ts; repos/orbits/app/api/ai/conversations/sessions/[id]/handler.ts; repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/capabilities/orbit-agent-chat-session-api.test.ts; repos/orbits/tests/pages/app-agent-chat-history.test.ts",
    regression:
      "Unconfigured live API tests prove save and delete return 503/SERVICE_UNAVAILABLE; mutation parsing rejects success envelopes without persisted=true. Focused history/API tests passed 14/14 and the final history suite passed 11/11. Full Web passed 1376/1376, lint/typecheck passed, and production build completed 39/39. Browser and live-provider readback proved select, pin, explicit rename save/cancel, reload persistence, delete confirmation/cancel/confirm, active-session cleanup, second-actor isolation, and final removal. Commits b30e1348, faa1e10c, and 2ba00267; all pre-edit impact and staged detection results were LOW.",
    status:
      "fixed and fail-closed-storage/persisted-success-gate/API-first-UI/mutation-fence/explicit-rename/destructive-confirmation/error-feedback/reload/actor-isolation/cleanup/focused/full-suite/lint/build-verified",
  },
  {
    id: "AUDIT-P1-098",
    severity: "P1",
    rootCause:
      "The Agent history resize handle was a focusable element with role=separator and a vertical orientation label, but it implemented only onPointerDown. Keyboard users could focus the control yet could not change the sidebar width, and assistive technology received no minimum, maximum, or current value.",
    decision:
      "Keep the same clamped pointer resize model and add the separator keyboard contract at that boundary: ArrowLeft and ArrowRight adjust by a predictable 16 pixels, Home and End select the existing minimum and maximum, handled keys prevent page scrolling, and aria-valuemin, aria-valuemax, aria-valuenow, and aria-valuetext remain synchronized with the rendered width.",
    files:
      "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/pages/app-agent-chat-history.test.ts",
    regression:
      "Focused history tests passed 11/11 and production build completed 39/39. The real production browser read min=180, max=380, current=212, and vertical orientation; ArrowRight produced 228, Home produced 180, and End produced 380. Commit 8d53505d; impact and staged detection were LOW with zero affected processes.",
    status:
      "fixed and keyboard-separator/ARIA-range/ArrowLeft/ArrowRight/Home/End/clamped-layout/no-write/browser/focused/build-verified; pointer-drag and screen-reader announcement timing remain separately unverified",
  },
  {
    id: "AUDIT-P1-099",
    severity: "P1",
    rootCause:
      "The mobile Agent history drawer visually covered the application as a modal surface but remained an ordinary div. It exposed no dialog name or aria-modal boundary, did not trap Tab, did not restore focus to the history trigger, and used a page-level Escape listener that did not stop the event from reaching other shortcuts.",
    decision:
      "Extract the conditionally mounted drawer into its own component and use the shared Orbit modal accessibility behavior rather than adding another focus implementation. Mark the drawer as a labelled modal dialog, focus its first control on mount, trap forward and reverse Tab, make Escape exclusively close the drawer, and restore the previously focused trigger on unmount. Keep the scrim and explicit close control on the same onClose boundary.",
    files:
      "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/pages/app-agent-chat-history.test.ts",
    regression:
      "Focused Agent history tests passed 11/11 for the initial repair; the final history/top-nav set passed 29/29, lint/typecheck passed, and production build completed 39/39. Source regression binds the drawer to useOrbitModalA11y and requires data-orbit-agent-history-drawer, a labelled role=dialog, and aria-modal=true. At 390x844 the production browser focused 关闭 on entry, wrapped Shift+Tab to the last 更多操作, wrapped Tab back to 关闭, and restored focus to 对话历史 after Escape. Commit 2e4a487b; staged detection was LOW with zero affected processes.",
    status:
      "fixed with shared-modal/focus-entry/Tab-trap/Escape-exclusive/focus-restore/dialog-name/mobile-width-browser/focused/lint/build evidence; screen-reader announcement timing and independent manual assistive-technology verification remain open",
  },
  {
    id: "AUDIT-P1-100",
    severity: "P1",
    rootCause:
      "Agent feedback storage was actor-scoped, but POST trusted the client-provided runId and wrote a learning record without checking that the referenced Agent Run existed for that actor. A fabricated or foreign Run id could therefore enter the actor's feedback context as if it were authoritative outcome evidence.",
    decision:
      "Enforce the invariant at the authenticated API actor boundary. Resolve the actor-scoped Agent runtime together with the feedback service, verify runtime.getRun(runId) before any provider write, return 404 for a missing or foreign Run, return 503 when ownership verification is unavailable, and keep only the validated owned-Run upsert path. Place the testable helper in a route-adjacent module because Next route modules may export only supported HTTP symbols.",
    files:
      "repos/orbits/app/api/agent/feedback/request.ts; repos/orbits/app/api/agent/feedback/handler.ts; repos/orbits/app/api/agent/feedback/route.ts; repos/orbits/tests/api/agent-feedback-routes.test.ts",
    regression:
      "Focused feedback/API tests passed 7/7 and prove missing/foreign Runs return 404 without calling upsert, an owned Run persists, and runtime failure returns 503 without a write. The production build completed 39/39 and lint/typecheck passed. Live browser/provider evidence proved helpful feedback persisted only for actor A, was absent for actor B, survived reload, and was removed during cleanup. Commit 95b85435; pre-edit impact was LOW and staged detection was LOW.",
    status:
      "fixed and actor-owned-Run/foreign-no-write/missing-no-write/runtime-failure/provider-persistence/both-ratings/all-outcomes/second-actor-absence/reload/cleanup/focused/lint/build-verified; feedback UI error state is tracked separately",
  },
  {
    id: "AUDIT-P1-101",
    severity: "P1",
    rootCause:
      "The multi-step Agent loop accumulated a replan artifact whenever the tool arguments differed, even when the artifact resolved to the same evidence and result items. The source UI then summed itemCount per artifact. Exact duplicate results doubled four records to eight, and a one-record refinement overlapping a four-record result counted the shared record twice as five. The inflated references were persisted in conversation history and reused as feedback evidence.",
    decision:
      "Deduplicate semantically equivalent runtime artifacts before synthesis using kind, provider source, source modules, evidence ids, and generated item ids rather than task ids or planner query text. At the presentation/history boundary, group references by label and source snapshot, union stable evidence ids, derive itemCount from the unique union, retain distinct unkeyed references, and normalize stored assistant messages on read so legacy records converge through the existing persistence path.",
    files:
      "repos/orbits/features/orbit-ai/live-agent-runtime.ts; repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/capabilities/orbit-agent-gemini-live.test.ts; repos/orbits/tests/pages/app-agent-chat-history.test.ts",
    regression:
      "A three-step planner regression proves a refined same-tool request returning equivalent evidence produces one artifact, while the existing distinct event-plus-contact continuation still produces two. History regression proves duplicate and overlapping references converge to one unique evidence set. Focused tests passed 54/54, lint/typecheck passed, and production build completed 39/39. Two live runs exposed the original 8 and 5 counts; after repair the UI and configured store both retained exactly one four-record reference with four unique ids, feedback carried the same four ids, and final cleanup returned null. Commits aa0d404e and 244c2527; impact and staged detection were LOW.",
    status:
      "fixed and equivalent-artifact/overlapping-provenance/unique-record-count/synthesis/history-normalization/feedback-evidence/reload/live-provider/cleanup/focused/lint/build-verified",
  },
  {
    id: "AUDIT-P1-102",
    severity: "P1",
    rootCause:
      "The source disclosure used a native details/summary pair and was focusable, but the actual in-app production browser did not toggle it with either Enter or Space. Pointer disclosure worked, leaving keyboard users unable to inspect the evidence modules, timestamp, or ids.",
    decision:
      "Keep the native details semantics and add a narrow summary key boundary for Enter and Space. Prevent the native default to avoid double toggles in browsers that implement it, verify the parent is an HTMLDetailsElement, and toggle only its open presentation state without any request or write.",
    files:
      "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/pages/app-agent-contact-recommendations.test.tsx",
    regression:
      "Focused source/history tests passed 18/18, lint/typecheck passed, and production build completed 39/39. On the exact source-backed persisted session, Enter changed the closed summary into one expanded four-record source group and Space returned it to the closed summary. Commit 7b367e84; AgentEvidenceSources impact was LOW and staged detection was LOW.",
    status:
      "fixed and native-details/Enter/Space/prevent-default/no-write/production-browser/focused/lint/build-verified; screen-reader announcement timing remains open",
  },
  {
    id: "AUDIT-P1-103",
    severity: "P1",
    rootCause:
      "AccountTopNav originally combined page-specific rightExtra content and the global RelationshipInboxTrigger inside one desktop extras boundary, making Agent history unreachable on mobile. The first repair separated mobile history but intentionally kept Inbox desktop-only; whole-product review then showed this dropped the global relationship Inbox capability from every mobile account surface.",
    decision:
      "Keep the dedicated page-specific mobile slot, but make AccountTopNav render a RelationshipInboxTrigger in both desktop and mobile action containers. Retain Agent history as a separate mobile extra so the two global/contextual capabilities coexist without selector or inline-style arbitration.",
    files:
      "repos/orbits/app/(app)/app/orbit-public-shell.tsx; repos/orbits/app/(app)/app/orbit-account-shell.tsx; repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/app/(app)/app/orbit-reference-styles.tsx; repos/orbits/tests/pages/app-agent-chat-history.test.ts; repos/orbits/tests/ui/orbit-top-nav-structure.test.ts",
    regression:
      "Focused Inbox/history/top-nav tests passed within the 40/40 contacts/chat set. Independent production-browser evaluation at 375x812 found one visible mobile Inbox trigger, one portal/dialog and only one consuming listener; /app/agent exposed both Inbox and history with one dialog each. AccountTopNav impact was CRITICAL (41 symbols, 24 direct dependants, ten processes), so the change stayed inside its established action-slot contract.",
    status:
      "fixed and shared-boundary/global-mobile-Inbox/Agent-history-coexistence/single-dialog/single-consumer/production-browser/focused/build-verified; physical touch-device verification remains open",
  },
  {
    id: "AUDIT-P1-104",
    severity: "P1",
    rootCause:
      "Agent Chat and Today each duplicated an incomplete review-state rule: both treated awaiting_confirmation and deferred as one generic editable state and rendered Confirm, Later, and Ignore for both. The ledger service correctly allows defer only from awaiting_confirmation, so a deferred user was offered a guaranteed-conflict action. Chat then surfaced the English transport message verbatim on a Chinese page. The mobile ledger view model already encoded the correct transition set, proving the product contracts had drifted by client.",
    decision:
      "Move Web review-transition availability and stable ledger error localization into one feature-level presentation module. Map awaiting_confirmation to confirm/defer/reject, deferred to confirm/reject, and terminal states to no review transitions. Make Agent Chat and Today derive controls from that map, pass the authoritative entry status into the Today form, and translate domain error context while keeping the English transport message available only in English.",
    files:
      "repos/orbits/features/agent/ledger/presentation.ts; repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx; repos/orbits/app/(app)/app/today/orbit-today-decision-form.tsx; repos/orbits/app/(app)/app/today/orbit-today-decision-panel.tsx; repos/orbits/tests/pages/app-agent-chat-actions.test.tsx; repos/orbits/tests/pages/app-today-decision-panel.test.tsx",
    regression:
      "Focused Agent/Today tests passed 15/15 and lock awaiting, deferred, rejected, domain-error, and unknown-error behavior. The complete Web suite passed 1382/1382, lint/typecheck passed, and production build completed 39/39. The production browser reproduced the old duplicate Later plus English conflict, then proved the rebuilt deferred UI had zero Later and one Ignore. Ignore produced a persisted rejected terminal state with no remaining write controls; actor B remained null, outbox/receipts and matching task records remained zero, reload preserved the result, and temporary session cleanup returned null for both actors. Commit a57dc7bf; pre-edit symbols were absent from the GitNexus index and staged detection was LOW.",
    status:
      "fixed and shared-state-map/Chat/Today/deferred-no-Later/rejected-terminal/localized-error/actor-isolation/no-domain-write/reload/cleanup/focused/full-suite/lint/build-verified; mobile runtime parity and concurrent-click traversal remain open",
  },
  {
    id: "AUDIT-P2-105",
    severity: "P2",
    rootCause:
      "The Agent cancellation control exposed the internal execution-model term Run inside an otherwise Chinese user flow, and disabling the control during its request left the same imperative label visible instead of communicating that cancellation was in progress. The operation was functionally safe but its copy required users to understand an implementation concept and offered weak pending feedback.",
    decision:
      "Name the action by its user-visible scope: 取消本次请求 / Cancel this request. While the request is pending, keep the existing disabled duplicate-submit guard and replace the label with 正在取消… / Canceling…. Keep the four literals directly in the JSX so the whole-product interaction scanner can retain the actual accessible names instead of an opaque helper expression.",
    files:
      "repos/orbits/app/(app)/app/agent/agent-action-status-card.tsx; repos/orbits/tests/pages/app-agent-chat-actions.test.tsx",
    regression:
      "Focused Agent tests passed 11/11, the complete Web suite passed 1383/1383, lint/typecheck passed, and production build completed 39/39. The rebuilt production page exposed 取消本次请求 on a second independently created pending action; clicking it produced the same canceled Run/action, actor isolation, zero task/outbox/receipt writes, terminal control removal, and reload persistence as the first scenario. The generated interaction inventory resolves all four idle/pending Chinese/English labels. Commit 9b61e620; pre-edit component indexing was UNKNOWN, the runtime cancelRun symbol was LOW, and staged detection found no indexed symbol changes.",
    status:
      "fixed and user-scope-copy/bilingual/pending-label/duplicate-submit-guard/auditable-accessible-name/production-browser/actor-isolation/no-write/reload/focused/full-suite/lint/build-verified; forced network failure and assistive-technology announcement timing remain open",
  },
  {
    id: "AUDIT-P1-106",
    severity: "P1",
    rootCause:
      "Expo SQLite snapshot ownership omitted the authenticated actor, unsigned resource state could reuse private snapshots, and direct account replacement did not invalidate the previous actor cache.",
    decision:
      "Version snapshot identity by normalized server, actor and request path; purge legacy actor-less rows; skip private snapshot reads/writes while unsigned; clear snapshots before accepting a different actor on the same server.",
    files:
      "repos/orbit-app/src/data/snapshot-store.ts; repos/orbit-app/src/data/snapshot-store.web.ts; repos/orbit-app/src/hooks/useApiResource.ts; repos/orbit-app/src/api/AuthSessionProvider.tsx; repos/orbit-app/tests/snapshot-store.test.ts",
    regression:
      "Expo full suite passed 538/538 and typecheck passed. Focused tests cover server/actor/path key separation, unsigned reads/writes, legacy cleanup, sign-out/session-expiry cleanup and direct A-to-B replacement.",
    status:
      "fixed with source and unit/integration proof; native two-actor pre-network tree and SQLite row-ownership runtime remain open",
  },
  {
    id: "AUDIT-P1-107",
    severity: "P1",
    rootCause:
      "Relationship compose/create dropped canonical contactId, while follow-up adapters replaced null contact identity with display-name-derived synthetic ids and exposed person actions for task-only records.",
    decision:
      "Carry contactId through the relationship draft contract and provider boundary. Preserve null as null across follow-up adapters and render an explicit unlinked-task state without detail or compose actions.",
    files:
      "repos/orbits/features/chat/contract.ts; repos/orbits/features/chat/live-async-service.ts; repos/orbits/features/followups/live-service.ts; shared/mobile followup contracts; Followups/Today/Schedule adapters and tests",
    regression:
      "Focused relationship/follow-up/Today regressions passed 44/44; the complete Web suite passed 1398/1398; lint and production build passed.",
    status:
      "fixed with contract/provider/cross-surface regression proof; same-name two-actor UI write/readback and foreign-id runtime remain open",
  },
  {
    id: "AUDIT-P1-108",
    severity: "P1",
    rootCause:
      "Responsive shell siblings could both qualify as Relationship Inbox owners, badge loads duplicated, and create-draft-thread had no stable request identity, allowing retries to allocate another record.",
    decision:
      "Select the visible trigger from rendered geometry, share concurrent badge reads per language, add actor-bound requestId to the write contract, and replay the first provider record without overwriting it.",
    files:
      "repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx; repos/orbits/app/api/chat/relationship-inbox/handler.ts; repos/orbits/features/chat/contract.ts; repos/orbits/features/chat/live-async-service.ts; repos/orbits/features/chat/storage/async-relationship-conversation-live-record-provider.ts; focused tests",
    regression:
      "Relationship Inbox component/provider regressions passed within the focused 40/40 set. Independent production-browser/provider evaluation proved one visible trigger/dialog, one consuming listener, durable same-actor replay with the first content and one active row, independent second-actor identity, and cleanup to an empty audit set.",
    status:
      "fixed and runtime-verified for responsive trigger ownership, portal/listener arbitration, same-actor request replay, first-write preservation, durable readback, actor isolation and cleanup",
  },
  {
    id: "AUDIT-P2-109",
    severity: "P2",
    rootCause:
      "Chat placed account/Inbox navigation inside success content, while Starfield mobile navigation lacked a complete disclosure/dismissal/focus contract.",
    decision:
      "Keep Chat route states under one shared shell boundary. Give the mobile menu explicit expanded/controlled state, hidden and inert closed content, Escape/outside/link dismissal, cleanup and focus return.",
    files:
      "repos/orbits/app/(app)/app/chat/page.tsx; repos/orbits/app/(app)/app/chat/chat-route-state-boundary.tsx; repos/orbits/app/(app)/app/orbit-starfield-mobile.tsx; repos/orbits/app/(app)/app/orbit-starfield-mobile-logic.ts; repos/orbits/app/(app)/app/orbit-starfield-mobile-menu.ts; focused tests",
    regression:
      "Chat tests passed 11/11, Starfield tests passed 32/32, and production browser traversal verified /app/chat plus / and /app at 390x844 without console errors.",
    status:
      "fixed and browser-verified for shared empty-state shell and pointer/keyboard menu lifecycle; physical touch and screen-reader announcements remain open",
  },
  {
    id: "AUDIT-P1-110",
    severity: "P1",
    rootCause:
      "Catalogue timestamps and a fixed authored 18:30-21:00 agenda acted as competing temporal authorities; some generated events ended at their start time.",
    decision:
      "Make startsAt/endsAt the only presentation clock, generate a positive two-hour duration, derive agenda offsets inside that interval, and fail closed with an unconfirmed end state for invalid bounds.",
    files:
      "repos/orbits/app/(app)/app/orbit-event-temporal.ts; repos/orbits/app/(app)/app/orbit-event-presentation.ts; event detail adapter/view; orbit landing/schedule models; generated fixtures and focused tests",
    regression:
      "Event focused tests passed 18/18, the complete Web suite passed 1398/1398, lint/build passed, and production EVTSIGNUP03 rendered one consistent 18:00-20:00 interval and bounded agenda.",
    status:
      "fixed and runtime-verified for the exercised catalogue/detail path; all dynamic identities, provider failures, responsive and assistive states remain open",
  },
  {
    id: "AUDIT-P1-111",
    severity: "P1",
    rootCause:
      "The complete /dev route group remained anonymously reachable in production even though demos exposed internal metadata and some forms targeted normal actor live APIs.",
    decision:
      "Fail the route group closed with notFound in production so every current and future fixed/dynamic dev page inherits one boundary; keep local development available and label inert decision specimens as disabled examples.",
    files:
      "repos/orbits/app/dev/layout.tsx; repos/orbits/app/dev/production-boundary.ts; repos/orbits/app/dev/foundation/style/page.tsx; repos/orbits/tests/dev/production-dev-surface-boundary.test.tsx; repos/orbits/tests/dev/production-dev-runtime.test.mjs",
    regression:
      "The independent second-round shard mapped 384/384 route instances to 154 implementations. The exact local production build returned 404 for seven fixed paths, 49 registered slugs and one unknown slug while preserving /app and /api auth; development returned the expected route identities and a controlled unknown fallback. Formal tests passed 2/2.",
    status:
      "fixed and independently local-production/runtime-verified across all inventoried route instances; deployed edge/proxy host, authorized development-tunnel exposure and reliable 375/390 client-runtime traversal remain open",
  },
  {
    id: "AUDIT-P2-112",
    severity: "P2",
    rootCause:
      "Expo had no centralized private leaf render gate and post-auth navigation consumed raw next values. An initial boundary that unmounted the root navigator caused a maximum-update redirect loop; Stack.Protected fallback then lost root-route destinations.",
    decision:
      "Keep the root Stack mounted after auth restoration, gate grouped layouts and every root-level private leaf before its screen mounts, derive coverage from the route tree, and route every post-auth destination through the existing supported-native allowlist.",
    files:
      "repos/orbit-app/app/_layout.tsx; repos/orbit-app/app/(app)/_layout.tsx; private route entry files; repos/orbit-app/src/components/OrbitRouteAccessBoundary.tsx; repos/orbit-app/src/view-models/mobile-route-access.ts; account auth/initial-route models and tests",
    regression:
      "Expo full suite passed 538/538 and typecheck passed. Expo Web /contacts and /today preserved exact next queries; rebuilt signed-out /events rendered 13 public records, /events/event_signup_02 rendered the exact public detail, and registration preserved /events/event_signup_02/register through login. Route-tree enumeration proves every current root-level private entry and the deeper attendee/register leaves use the shared gate.",
    status:
      "fixed and Expo-Web-runtime-verified for private/public classification and normalized next; native cold/warm deep links, cached expiry, offline snapshots and physical-device parity remain open",
  },
  {
    id: "AUDIT-P1-113",
    severity: "P1",
    rootCause:
      "Contact introduction creation had no stable client request identity. A timeout or duplicate submission could allocate another durable introduction, and a retry with changed input had no first-write preservation contract.",
    decision:
      "Create one UUID per composer lifecycle, require requestId at the repository boundary, derive the durable id from actor plus requestId, and return an existing actor-owned record before any overwrite or allocation.",
    files:
      "repos/orbits/features/contacts/introduction-records.ts; introduction composer UI; introduction API/provider tests",
    regression:
      "Focused contacts/chat tests passed 40/40. Independent provider evaluation replayed altered content under the same actor/requestId and returned the first id/content with one active row; the same requestId for another actor returned an independent id. Ten disposable rows were removed and the final audit set was empty. Repository impact was HIGH with five upstream dependants; the POST handler and UI were LOW.",
    status:
      "fixed and provider-runtime-verified for stable request identity, same-actor replay, first-write preservation, actor isolation and cleanup; forced browser timeout and rapid double activation remain open",
  },
  {
    id: "AUDIT-P1-114",
    severity: "P1",
    rootCause:
      "Expo classified /events as public while EventsScreen and EventDetailScreen called private /api/events endpoints and mounted personalized modules unconditionally. Native signed-out traversal therefore produced a real 401 and 登录状态已失效 on a supposedly public route.",
    decision:
      "Give catalogue list/detail dedicated public endpoints and client paths, mount recommendation/readiness/post-event modules only for an authenticated session, and classify deeper registration/attendee leaves as private with exact next preservation.",
    files:
      "repos/orbit-app/src/screens/events/EventsScreen.tsx; repos/orbit-app/src/screens/events/EventDetailScreen.tsx; repos/orbit-app/src/api/endpoints.ts; repos/orbit-app/src/view-models/mobile-route-access.ts; Expo event route wrappers; repos/orbits/app/api/events/public/[id]/route.ts; repos/orbits/proxy.ts; focused tests",
    regression:
      "The defect was captured in native Expo Go iOS. Public API/proxy tests passed 6/6, Expo targeted tests passed 46/46, the full Expo suite passed 538/538, typecheck passed, and production build completed 39/39. Rebuilt signed-out Expo Web rendered 13 events and event_signup_02 detail with no private module, then routed registration to the exact encoded login next. The existing shared eventDetailPath had HIGH impact (36 upstream, three flows) and was deliberately left unchanged; a separate public path was added.",
    status:
      "fixed and API/Expo-Web-runtime/full-suite/typecheck/build-verified; post-fix native iOS, Android and authenticated personalized-module parity remain open",
  },
  {
    id: "AUDIT-P1-115",
    severity: "P1",
    rootCause:
      "The Starfield entry used the legacy iorbit_lang key while the application shell used orbit-lang cookie/localStorage, and the entry never synchronized documentElement.lang. English could survive the root reload while /app and assistive-language metadata returned to Chinese.",
    decision:
      "Resolve one canonical language in priority order from orbit-lang localStorage, orbit-lang cookie, legacy iorbit_lang and host; persist both canonical stores, migrate the legacy key, and synchronize the document language at initialization and selection.",
    files:
      "repos/orbits/app/(app)/app/orbit-starfield-language.ts; desktop/mobile Starfield logic; repos/orbits/tests/pages/orbit-starfield-language.test.ts",
    regression:
      "Focused language tests passed 7/7 and lint/build passed. In the production browser, English text and html lang=en survived root reload and direct /app navigation. Both Starfield runtime symbols had LOW impact with four upstream dependants each and zero affected processes.",
    status:
      "fixed and production-browser-verified for canonical persistence, legacy migration, document language and root-to-app continuity; cross-tab events and manual screen-reader language switching remain open",
  },
  {
    id: "AUDIT-P1-116",
    severity: "P1",
    rootCause:
      "The public Web event detail server model already exposed stats.authed=false, but the registration and matchmaking client modules ignored it and unconditionally called two actor-private APIs. The page itself returned 200 while both hidden subrequests returned 401.",
    decision:
      "Pass the authoritative authentication state into both client modules and fail closed before any private fetch when the visitor is anonymous. Extend browser evidence collection so HTTP 4xx/5xx subresponses are first-class failures instead of treating a 200 document as sufficient.",
    files:
      "repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx; repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx; repos/orbits/tests/pages/app-event-detail-live-route-services.test.ts; harness/evidence.py; tests/test_harness_core.py",
    regression:
      "Focused event tests passed 17/17 and production build passed 39/39. Before/after production browser diagnostics changed from two private 401 subresponses to zero response/request/console failures; the complete 13-route anonymous base-state manifest also remained clean.",
    status:
      "fixed and production-browser-verified for the signed-out public event detail; authenticated matchmaking/registration states remain separately scoped",
  },
  {
    id: "AUDIT-P1-117",
    severity: "P1",
    rootCause:
      "The legacy Chat write contract had no stable request identity, appendMessage always allocated a count-derived id before unconditional upsert, and /app/chat exposed no mutation lifecycle. Duplicate activation therefore produced multiple durable rows while the live controlled-failure response leaked mock-boundary language.",
    decision:
      "Carry one requestId from the client and Idempotency-Key header through the API and live provider, derive an actor/workspace/conversation-scoped deterministic message id, preserve the first request evidence, and expose one storage-only composer with synchronous pending protection and retry identity reuse. Keep intentional same-body writes possible under a new requestId and make replay write provenance truthful.",
    files:
      "repos/orbits/app/(app)/app/chat/chat-message-composer.tsx; chat-workspace.tsx; repos/orbits/app/api/chat/conversations/[id]/messages/route.ts; repos/orbits/features/chat/contract.ts; live-service.ts; storage/chat-conversation-live-record-provider.ts; focused tests",
    regression:
      "Focused Chat and Agent-context regressions passed 29/29 and targeted TypeScript passed. Independent production UI/API/PostgreSQL evaluation passed 7/7: one POST/row/article under double activation, first-content replay, intentional repeat, controlled failure/retry and actor isolation. Follow-up proved first-write provenance true, stable-key replay false with byte-stable Postgres record, and new-key write true; all audit/probe rows were cleaned.",
    status:
      "fixed and independently production-runtime-verified for UI pending/duplicate control, idempotent replay, first-write preservation, intentional repeat, failure retry, durable readback and actor isolation; deletion/retention remains a separate lifecycle decision",
  },
  {
    id: "AUDIT-P2-118",
    severity: "P2",
    rootCause:
      "Event registration idempotency compared answer objects with JSON.stringify. PostgreSQL JSONB does not preserve application insertion order, so semantically identical eight-answer payloads were misclassified as changes and rewrote registration/profile updatedAt on every retry.",
    decision:
      "Compare only the canonical EVENT_PARTICIPANT_PROFILE_FIELDS values. This removes object-order dependence while preserving meaningful field changes and existing normalization limits.",
    files:
      "repos/orbits/features/events/registration/service.ts; repos/orbits/tests/capabilities/event-registration-live.test.ts",
    regression:
      "Focused registration tests passed 9/9. An independent production-handler/PostgreSQL evaluator replayed canonical, reversed and shuffled keys with stable ids/timestamps and one active row, then changed valueOffered and observed both update timestamps advance. Actor B remained isolated and includeDeleted cleanup count was zero.",
    status:
      "fixed and independently production-runtime-verified for semantic replay, legitimate updates, persistence, side-effect flags, actor isolation and cleanup; production provider failure injection remains externally limited",
  },
  {
    id: "AUDIT-P1-119",
    severity: "P1",
    rootCause:
      "Notifications and Relationship Inbox passed a zero-argument authenticated-actor resolver into factory-created handlers. Under Next.js 16 request execution that deferred resolver called auth() after the request store was no longer available, so authenticated requests threw headers outside request scope. The shared UI then presented the failure as Mailbox not connected or an apparently successful empty alert state.",
    decision:
      "Bind Auth.js at each concrete route export with auth(async request), derive the canonical actor from request.auth.user through a session-input resolver, and inject only that request-bound resolver into the shared handler. Preserve the direct mock handlers and anonymous 401 boundary; add a source boundary regression so these shared routes cannot silently return to zero-argument auth.",
    files:
      "repos/orbits/app/api/_shared/authenticated-actor.ts; repos/orbits/app/api/notifications/route.ts; repos/orbits/app/api/chat/relationship-inbox/route.ts; repos/orbits/tests/api/authenticated-actor-context.test.ts",
    regression:
      "Independent Next.js 16.2.9 development runtime traversed five authenticated surfaces: ten shared API reads returned 200, zero returned 500, and no headers-outside-request-scope stack occurred. Threads, Alerts and badge rendered mutually consistent actor-scoped empty state; two anonymous API reads remained 401. Canonical A/B and provider isolation tests passed, focused tests passed 27/27, the complete Web suite passed 1408/1408, lint passed, and the production build generated 39/39 pages. Pre-edit resolveAuthenticatedApiActor impact was CRITICAL with 31 direct callers and 16 execution flows; the change retained its zero-argument compatibility entry and routed only these two broken exports through the request-bound helper.",
    status:
      "fixed and independently development-runtime-verified for authenticated GET, anonymous denial, honest UI state and actor isolation across 130 affected route instances; valid live compose POST and production next start remain open",
  },
  {
    id: "AUDIT-P1-120",
    severity: "P1",
    rootCause:
      "The Contacts dashboard applied orbit-desktop-only to an inner child instead of the outer orbit-page main. At mobile width the empty outer main still occupied a full viewport height, while the mobile root inherited a global display:flex override without column direction and flowed beside that desktop box. The real mobile content therefore began off the first screen and widened the document.",
    decision:
      "Make the complete desktop main the mutually exclusive desktop root, keep its inner layout structural only, and define the mobile root as a min-width-zero full-width vertical flex container. Preserve one real dashboard implementation and responsive shell rather than adding route-specific offsets.",
    files:
      "repos/orbits/app/(app)/app/contacts/orbit-real-cards-dashboard.tsx; repos/orbits/tests/pages/app-contacts-dashboard-account-scope.test.ts",
    regression:
      "Pre-fix 390px browser evidence measured scrollWidth 641 and a mobile root beginning after the desktop viewport. Post-fix evidence measured document/body 390/390, desktop root 0x0 and inert/aria-hidden, mobile root 390x844 at 0,0 and no overflowing product node. Focused dashboard/a11y tests passed 6/6. OrbitRealCardsDashboard and AppShell pre-edit impacts were LOW.",
    status:
      "fixed and authenticated-browser-verified at 390x844 for responsive root exclusivity, content reachability and zero horizontal overflow; 375px was browser-clamped to 390px",
  },
  {
    id: "AUDIT-P2-121",
    severity: "P2",
    rootCause:
      "Both Agent-memory switches forced a long label and state chip into one non-wrapping row. The label could not shrink or wrap and the state chip had no explicit shrink contract, so the approved-learning switch extended the 390px settings page to 499px.",
    decision:
      "Use one shared responsive switch-row style, let the label shrink and wrap with overflow-safe words, and keep the state chip non-shrinking. Apply the same contract to both settings controls so translations and state values share one layout invariant.",
    files:
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx; repos/orbits/tests/pages/app-agent-memory-settings-responsive.test.ts",
    regression:
      "Pre-fix browser geometry identified exactly the long label and Off chip beyond the viewport. Post-fix document/body widths were 390/390 with zero overflowing nodes; the label wrapped inside the card and the Off chip remained visible. Focused settings tests passed 8/8. OrbitAgentMemorySettings pre-edit impact was LOW.",
    status:
      "fixed and authenticated-browser-verified for both English switches at 390x844 with zero horizontal overflow; Chinese and an unclamped 375px viewport remain uncaptured",
  },
  {
    id: "AUDIT-P1-122",
    severity: "P1",
    rootCause:
      "Both actor-owned Home event-card implementations called a parameterless enterEvent helper. That helper navigated to /party without eventId, discarding the event identity even though the canonical partyHrefForEvent builder already encoded the supported Party contract.",
    decision:
      "Pass the concrete event.id from both card implementations into enterEvent and delegate URL construction to the existing canonical partyHrefForEvent helper. Do not duplicate route encoding or modify the high-impact shared helper.",
    files:
      "repos/orbits/app/(app)/app/home/orbit-real-home.tsx; repos/orbits/tests/pages/app-home-events-source.test.ts",
    regression:
      "Pre-fix runtime evidence showed the exact actor-owned card reaching /app/party with no eventId and the no-selection state. Independent post-fix isolated-runtime replay reached the exact percent-encoded eventId, resolved the same actor-owned event and rendered the truthful missing-reviewed-context state. Focused Home event and product-href tests passed 24/24. Pre-edit enterEvent and OrbitRealHome impacts were LOW; the existing partyHrefForEvent helper was HIGH and was reused without modification.",
    status:
      "fixed and independently authenticated-runtime-verified for Home-to-Party event identity preservation; Party reviewed-attendee/recommendation success remains external-limited",
  },
  {
    id: "AUDIT-P1-123",
    severity: "P1",
    rootCause:
      "The native client sent its SecureStore Auth.js session Cookie explicitly while also using credentials=include. React Native iOS first loaded NSHTTPCookieStorage into the request and then addValue-appended the supplied Cookie header, creating an ambiguous same-name session-token transport that Auth.js rejected as Invalid Compact JWE.",
    decision:
      "Make the authentication transport single-source per platform. When an explicit native Cookie exists, session validation, authenticated API requests and sign-out use credentials=omit so the native jar is not merged. When no explicit Cookie exists, Web continues using credentials=include and its browser-managed HttpOnly session. During Web acceptance, validate with the browser cookie instead of attempting to supply the returned header.",
    files:
      "repos/orbit-app/src/api/mobile-auth.ts; repos/orbit-app/src/api/client.ts; repos/orbit-app/src/api/auth-session.ts; repos/orbit-app/src/api/AuthSessionProvider.tsx; focused auth/API tests",
    regression:
      "Focused authentication/API tests passed 32/32, the complete Expo suite passed 538/538 and typecheck passed. An isolated-index GitNexus evaluation reported seven files, nine symbols, zero affected processes and LOW structural risk. Independent direct iOS evaluation used a brand-new simulator and one credentials submission, passed /api/auth/session, the exact actor-owned /profile, SecureStore write/read and force-terminated cold restore, recorded 15 warm and 15 cold native leaves, observed no JWE/JWTSessionError, cleaned three actor records to zero, deleted the simulator and closed both listeners.",
    status:
      "fixed and independently fresh-native-runtime-verified for credentials acceptance, single-cookie transport, actor-owned private data, SecureStore persistence, cold restore, safe-read idempotency and cleanup; Android, Google OAuth, second-actor native cache isolation and the remaining authenticated native routes remain open",
  },
  {
    id: "AUDIT-P1-124",
    severity: "P1",
    rootCause:
      "The Chat empty/failure route rendered AccountTopNav outside the data-orbit-real-page selector owner used by the shared responsive navigation rules. Desktop therefore exposed both responsive Inbox trigger instances as actionable controls, while mobile hid the complete header and exposed no Inbox entry.",
    decision:
      "Repair selector ownership at the route-state boundary: wrap the existing AccountTopNav and StateView main in one route-local data-orbit-real-page=chat root. Do not modify the CRITICAL-impact shared AccountTopNav or duplicate its responsive logic.",
    files:
      "repos/orbits/app/(app)/app/chat/chat-route-state-boundary.tsx; repos/orbits/tests/pages/app-chat-page.test.tsx",
    regression:
      "Focused Chat tests passed 23/23 and the complete Web suite passed 1411/1411. Independent fresh-runtime evaluation measured one 36x36 actionable desktop trigger with the mobile slot at 0x0, and one 36x36 actionable mobile trigger with the desktop slot at 0x0. One click at each width opened exactly one Inbox dialog; actor fixtures were cleaned and the runtime port closed. GitNexus could not resolve the new untracked route-state symbol; nearest AppChatPage impact was LOW, while the intentionally untouched AccountTopNav impact was CRITICAL with 44 upstream symbols, 24 direct callers and 10 flows.",
    status:
      "fixed and independently authenticated-runtime-verified for desktop/mobile Chat empty-state header reachability, responsive trigger exclusivity and single-dialog activation; no shared shell symbol changed",
  },
  {
    id: "AUDIT-P1-125",
    severity: "P1",
    rootCause:
      "A truthy Contacts refreshToken was treated as an immediate first-mount refresh. That incremented useApiResource's refresh index while its initial actor-keyed snapshot read was awaiting, cancelled the only hydration continuation, then started a refresh branch that intentionally skipped snapshots. When the network failed, refresh semantics preserved the still-loading initial state forever.",
    decision:
      "Treat refreshToken as an edge trigger at the LOW-impact ContactsListScreen caller. Initialize the previous-token ref from the first render and refresh only when a mounted route later observes a different non-empty token. Preserve the CRITICAL-impact shared useApiResource and readSnapshot state machines, actor keys, schema and auth boundaries unchanged.",
    files:
      "repos/orbit-app/src/screens/contacts/ContactsScreen.tsx; repos/orbit-app/tests/contacts-screen-source.test.ts",
    regression:
      "Focused Contacts/snapshot tests passed 44/44, Expo typecheck passed and the complete Expo suite passed 538/538. Independent fresh-simulator evaluation created two actors and one exact B snapshot, proved a true process restart and online B profile restore, then stopped Next and delivered only the initial-token Contacts deep link to the same authenticated PID. B appeared by the first 1.18-second tree and remained at t5/t15 with no A, spinner or offline warning; a later-token failed refresh preserved B, the exact SQLite row stayed byte/hash/timestamp-stable, 12 fixtures were cleaned to zero and the simulator/listeners/temp Xcode artifacts were removed. ContactsListScreen impact was LOW; useApiResource and readSnapshot were CRITICAL and intentionally untouched.",
    status:
      "fixed and independently fresh-native-runtime-verified for cold initial-token snapshot hydration, later-token failure preservation, two-actor non-leakage, byte-stable persistence and cleanup; retained-stack timing is closed by AUDIT-P2-131 while Android remains external-limited",
  },
  {
    id: "AUDIT-P1-126",
    severity: "P1",
    rootCause:
      "Both shared runtime-mode resolvers defaulted missing or invalid values to mock in every environment and honored explicit mock/hybrid input in production. Hybrid service factories could then fall back to mock implementations.",
    decision:
      "Make production live-only at both shared resolution boundaries. NODE_ENV=production overrides missing, invalid, mock and hybrid inputs before any factory chooses an implementation; development and tests retain the deterministic mock default.",
    files:
      "repos/orbits/shared/services/module-mode.ts; repos/orbits/shared/config/feature-mode.ts; repos/orbits/tests/services/capability-registry.test.ts; repos/orbits/tests/api/envelope.test.ts",
    regression:
      "Focused mode/workflow/matchmaking tests passed 21/21, the complete Web suite passed 1417/1417, lint passed and the production build completed 39/39. GitNexus rated resolveModuleMode CRITICAL at 135 upstream symbols/10 flows and resolveFeatureMode CRITICAL at 216 symbols/24 flows; the full regression gate was therefore required.",
    status:
      "fixed and source/unit/full-suite/lint/build-verified for production live-only mode selection; exact deployed-host configuration and bundle-level removal of unused mock imports remain separate gates",
  },
  {
    id: "AUDIT-P1-127",
    severity: "P1",
    rootCause:
      "The production Next build still registered three /api/mock handlers. They directly listed, activated and reset the shared fixture scenario registry without a production environment gate.",
    decision:
      "Fail each handler closed with an empty no-store 404 before reading request input, resolving mode, creating a mock service or returning fixture state. Preserve the local development workbench contract.",
    files:
      "repos/orbits/app/api/mock/scenarios/route.ts; repos/orbits/app/api/mock/scenarios/[id]/activate/route.ts; repos/orbits/app/api/mock/reset/route.ts; mock scenario focused test",
    regression:
      "Focused mock scenario tests passed 5/5, including list/activate/reset production requests and an invalid reset body. GitNexus rated all three handler edits LOW with zero upstream callers and zero affected flows.",
    status:
      "fixed and handler-integration plus exact authenticated rebuilt-next-start verified: all three paths returned empty no-store 404 before parsing input; the disposable actor's three exact records were hard-deleted to zero",
  },
  {
    id: "AUDIT-P1-130",
    severity: "P1",
    rootCause:
      "Event matchmaking bypassed the shared mode factories. Its configured factory silently created createMemoryLiveRecordStore with workspace mock-event-matchmaking whenever all durable database URLs were absent, so production APIs and the Agent workflow could report process-local write success despite live-only mode resolution.",
    decision:
      "Require ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL or ORBIT_DATABASE_URL and fail closed before constructing or caching a production service. Confine the existing memory workspace to an explicit non-production branch for development workflows and tests; keep focused service tests on explicit dependency injection.",
    files:
      "repos/orbits/features/events/matchmaking/service.ts; repos/orbits/tests/capabilities/agent-matchmaking-context.test.ts",
    regression:
      "The focused regression sets NODE_ENV=production, removes all three database URLs and proves the configured factory throws instead of returning a nine-method memory service. The known workflow router plus injected-memory consent, scheduling and idempotency behavior remain covered in non-production. GitNexus rated the factory MEDIUM with seven direct callers, eleven impacted upstream symbols and two affected modules.",
    status:
      "fixed and focused/full-suite/lint/build verified for production durable-storage enforcement while preserving non-production workflows; exact deployed database configuration remains an environment gate",
  },
  {
    id: "AUDIT-P2-131",
    severity: "P2",
    rootCause:
      "Expo preserved the historical contacts/list route record across logout. Accepting actor B remounted the private child behind the still-focused login route, and ContactsListScreen's mount-driven resources had no visible-route activation policy, so two actor-correct but invisible reads ran without a product benefit.",
    decision:
      "Gate only the LOW-impact Contacts list leaf route with useIsFocused and return null before constructing ContactsScreen while hidden. Preserve the shared private-route boundary, actor-keyed cache and CRITICAL-impact useApiResource state machine.",
    files:
      "repos/orbit-app/app/contacts/list.tsx; repos/orbit-app/tests/contacts-screen-source.test.ts",
    regression:
      "Focused Contacts tests passed 16/16, Expo typecheck passed and the complete Expo suite passed 539/539. Independent iOS evaluation retained the old route record behind login, observed zero Contacts/suggestion reads for 31.073 seconds, then focused a new Contacts route and observed one request to each endpoint plus actor-B-only UI. Ports 8087/3427 were released and the disposable simulator was deleted. GitNexus rated ContactsListRoute LOW with zero upstream symbols or flows; useApiResource remained untouched.",
    status:
      "fixed and independently native-runtime-verified for hidden-route data minimization, focused fetch activation, actor isolation and cleanup; Android and any future named background-prefetch contract remain separate",
  },
  {
    id: "AUDIT-P2-128",
    severity: "P2",
    rootCause:
      "The route-transitive interaction scanner attributed DataCard's internal Pressable to every route that could import DataCard, even when the call site omitted optional onPress and DataCard returned non-interactive content.",
    decision:
      "Detect simple owner-prop early-return render gates and require route-scoped JSX prop evidence before attributing the gated internal control to that route.",
    files:
      "repos/orbits/scripts/generate-full-product-functional-audit.mjs; repos/orbits/tests/audits/full-product-functional-audit.test.ts",
    regression:
      "The DataCard Pressable now appears only on account, contacts/pipeline, followups, home/events, profile and settings. The route-instance denominator changed from 2340 to 2302 while source-location and implementation denominators remained 1254 and 921; audit tests passed 10/10.",
    status:
      "fixed for simple optional-prop early-return gates; the true rendered runtime leaf denominator remains unresolved",
  },
  {
    id: "AUDIT-P2-129",
    severity: "P2",
    rootCause:
      "Route query collection scanned the full transitive import closure with a receiver-blind get/set suffix regex. It treated headers, cookies, Map/storage keys, API query fields, internal variables and a prototype asset UUID as page parameters while losing route-local symbol boundaries.",
    decision:
      "Scan only reachable rendered-symbol statements, accept explicit searchParams/URLSearchParams reads, readSearchParam key arguments and Expo useLocalSearchParams declarations, then remove dynamic path bindings from the query namespace.",
    files:
      "repos/orbits/scripts/generate-full-product-functional-audit.mjs; repos/orbits/tests/audits/full-product-functional-audit.test.ts",
    regression:
      "Alleged route-query pairs fell from 1272/71 keys to 119/30. Focused assertions prove mobile /account excludes all transitive API/header keys, Contacts List retains seven real keys, mobile /ai/[id] separates id from query, Web login retains four real/global diagnostic keys and all named header/cookie/UUID probes are absent. Audit tests passed 10/10.",
    status:
      "fixed for route-local query-key classification; fixed redirects, aliases, hash preservation, custom schemes, ancestor auth/layout contracts and runtime route cases remain a separate explicit contract gap",
  },
  {
    id: "AUDIT-P2-132",
    severity: "P2",
    rootCause:
      "Contact detail and relationship profile development probes were ordinary HTML forms. PATCH actions therefore submitted as POST and returned 405, the failure query was embedded in action while FormData serialization discarded it, and making the whole debug module a client component made its exported slug constant unreadable to the Server Component dispatcher.",
    decision:
      "Keep the debug view and slug export server-readable, move only interactive controls into feature-local client modules, and use one shared request builder that preserves action query, exact GET/PATCH methods, JSON arrays and rendered success/failure envelopes.",
    files:
      "repos/orbits/shared/ui/api-probe-form.tsx; repos/orbits/features/contacts/contact-detail-tag-and-status-mock/api-probe-controls.tsx; repos/orbits/features/contacts/contact-detail-tag-and-status-mock/debug-view.tsx; repos/orbits/features/connections/relationship-stage-and-profile-mock/api-probe-controls.tsx; repos/orbits/features/connections/relationship-stage-and-profile-mock/debug-view.tsx; repos/orbits/tests/ui/api-probe-form.test.ts",
    regression:
      "Focused tests passed 36/36. Independent authenticated runtime reached both exact slugs, exercised five normalized implementations and eight route occurrences, preserved four GET query variants, issued every update/action probe as PATCH, rendered 200/503/400 envelopes, created zero live domain rows and cleaned the actor to activeAfter=0.",
    status:
      "fixed and independently runtime-verified for exact current handler keys, route-local reachability/auth/params/ownership, method/query/body preservation, honest failure UI and cleanup",
  },
  {
    id: "AUDIT-P2-133",
    severity: "P2",
    rootCause:
      "Retrying a failed Agent message called the normal ask path with the original request while leaving the preceding user turn and failed assistant turn in both visible messages and outgoing history. The same user request was appended again, so one logical turn became duplicated and stale failure UI survived.",
    decision:
      "Prepare retry from the exact failed assistant index, remove that failure plus its nearest preceding user turn from request history, retain the one existing user turn in visible state, and pass the index through the retry control so the normal conversation endpoint creates only the replacement assistant result.",
    files:
      "repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx; repos/orbits/tests/pages/app-agent-chat-actions.test.tsx; repos/orbits/tests/pages/app-agent-general-conversation.test.tsx",
    regression:
      "Focused tests passed 69/69. A disposable authenticated actor produced a real 503, restored the configured provider and rapidly activated the exact retry twice. Only one retry request with history=[] was sent; the live store retained one user plus one successful assistant, zero stale failure/retry messages, zero action/outbox/domain writes, refresh readback and actor-B isolation, followed by exact activeAfter=0 cleanup.",
    status:
      "fixed and independently live-provider/runtime/store-verified for logical-turn conservation, duplicate activation, refresh, actor isolation and cleanup",
  },
  {
    id: "AUDIT-P2-134",
    severity: "P2",
    rootCause:
      "Additional Web runtime evidence could fall back from handler-bound keys to sourceFile+visibleName or sourceFile:line. After the Agent retry handler changed, the generator silently inherited a 2026-07-29 PASS for the old behavior.",
    decision:
      "Require exact or normalized handler-bound evidence for the changed retry interaction and bind the new post-fix runtime proof to its current stable onclick key. Retain explicitly scoped legacy compatibility only for interactions not placed behind this handler-bound gate.",
    files:
      "repos/orbits/scripts/generate-full-product-functional-audit.mjs; repos/orbits/tests/audits/full-product-functional-audit.test.ts",
    regression:
      "Before current runtime evidence was bound, the generator honestly reduced coverage to 243/924 and strict occurrences to 208/2302. After binding the exact current handler proof, it restored only that implementation/occurrence to 244/924 and 209/2302. Audit tests assert that no other same-label handler inherits the PASS.",
    status:
      "fixed for the remediated Agent retry interaction with handler-bound current runtime evidence; broader legacy evidence migration remains explicit compatibility debt rather than silent proof",
  },
];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function normalizedEvidenceText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .replace(/,\s*([}\]])/gu, " $1")
    .trim();
}

const normalizedEvidenceMapCache = new WeakMap();

function lookupEvidenceByStableKeys(evidenceMap, keys) {
  for (const key of keys) {
    const exact = evidenceMap.get(key);
    if (exact) {
      return exact;
    }
  }

  let normalizedMap = normalizedEvidenceMapCache.get(evidenceMap);
  if (!normalizedMap) {
    normalizedMap = new Map(
      [...evidenceMap].map(([key, value]) => [
        normalizedEvidenceText(key),
        value,
      ]),
    );
    normalizedEvidenceMapCache.set(evidenceMap, normalizedMap);
  }
  for (const key of keys) {
    const normalized = normalizedMap.get(normalizedEvidenceText(key));
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

function relativeToWorkspace(filePath) {
  return toPosix(path.relative(WORKSPACE_ROOT, filePath));
}

function listFiles(root, predicate) {
  const files = [];
  if (!existsSync(root)) {
    return files;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (
      entry.name === ".expo" ||
      entry.name === ".next" ||
      entry.name === "node_modules"
    ) {
      continue;
    }

    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath, predicate));
    } else if (predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function sourceFileFor(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const extension = path.extname(filePath);
  const scriptKind =
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".jsx"
        ? ts.ScriptKind.JSX
        : extension === ".js" || extension === ".mjs"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;

  return {
    source: ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    ),
    sourceText,
  };
}

function isWebPage(filePath) {
  return (
    (path.basename(filePath) === "page.tsx" ||
      path.basename(filePath) === "page.ts") &&
    !toPosix(path.relative(WEB_APP_ROOT, filePath)).startsWith("api/")
  );
}

function isMobileRoute(filePath) {
  if (!/\.(?:ts|tsx)$/.test(filePath)) {
    return false;
  }

  const basename = path.basename(filePath);
  return basename !== "_layout.tsx" && basename !== "_layout.ts";
}

function routeSegments(relativePath, stripPageName) {
  const extensionless = relativePath.replace(/\.(?:ts|tsx|js|jsx)$/u, "");
  const segments = extensionless
    .split(path.sep)
    .filter(Boolean)
    .filter(
      (segment) =>
        !(segment.startsWith("(") && segment.endsWith(")")) &&
        !segment.startsWith("@"),
    );

  if (stripPageName && segments.at(-1) === "page") {
    segments.pop();
  }
  if (segments.at(-1) === "index") {
    segments.pop();
  }
  return segments;
}

function webRouteFromPage(filePath) {
  const relative = path.relative(WEB_APP_ROOT, filePath);
  const segments = routeSegments(relative, true);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function mobileRouteFromFile(filePath) {
  const relative = path.relative(MOBILE_APP_ROOT, filePath);
  const segments = routeSegments(relative, false);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function resolveLocalImport(fromFile, specifier, clientRoot) {
  let unresolved = null;
  if (specifier.startsWith(".")) {
    unresolved = path.resolve(path.dirname(fromFile), specifier);
  } else if (clientRoot === MOBILE_ROOT && specifier.startsWith("@/")) {
    unresolved = path.join(MOBILE_ROOT, "src", specifier.slice(2));
  }
  if (!unresolved) {
    return null;
  }

  const candidates = [
    unresolved,
    ...SOURCE_EXTENSIONS.map((extension) => `${unresolved}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) =>
      path.join(unresolved, `index${extension}`),
    ),
  ];
  return (
    candidates.find(
      (candidate) =>
        existsSync(candidate) &&
        statSync(candidate).isFile() &&
        candidate.startsWith(clientRoot),
    ) ?? null
  );
}

function collectReachableSources(entryFile, clientRoot) {
  const queue = [entryFile];
  const visited = new Set();

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath || visited.has(filePath)) {
      continue;
    }

    visited.add(filePath);
    const { source } = sourceFileFor(filePath);
    source.forEachChild((node) => {
      if (
        !ts.isImportDeclaration(node) ||
        !ts.isStringLiteral(node.moduleSpecifier)
      ) {
        return;
      }
      const resolved = resolveLocalImport(
        filePath,
        node.moduleSpecifier.text,
        clientRoot,
      );
      if (resolved) {
        queue.push(resolved);
      }
    });
  }

  return [...visited].sort();
}

function collectReachableUiScopes(entryFile, clientRoot) {
  const moduleInfoCache = new Map();
  const scopes = new Map();
  const queue = [{ filePath: entryFile, symbol: "default" }];
  const visitedTargets = new Set();

  function serializedPropValues(propValues) {
    return [...(propValues ?? new Map()).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`)
      .join("&");
  }

  function jsxLiteralPropValues(attributes, source) {
    const values = new Map();
    for (const property of attributes.properties) {
      if (!ts.isJsxAttribute(property)) {
        continue;
      }
      const name = property.name.getText(source).toLowerCase();
      if (!property.initializer) {
        values.set(name, true);
      } else if (ts.isStringLiteral(property.initializer)) {
        values.set(name, property.initializer.text);
      } else if (
        ts.isJsxExpression(property.initializer) &&
        property.initializer.expression &&
        (ts.isStringLiteral(property.initializer.expression) ||
          ts.isNoSubstitutionTemplateLiteral(
            property.initializer.expression,
          ) ||
          property.initializer.expression.kind ===
            ts.SyntaxKind.TrueKeyword ||
          property.initializer.expression.kind ===
            ts.SyntaxKind.FalseKeyword)
      ) {
        const expression = property.initializer.expression;
        values.set(
          name,
          expression.kind === ts.SyntaxKind.TrueKeyword
            ? true
            : expression.kind === ts.SyntaxKind.FalseKeyword
              ? false
              : expression.text,
        );
      }
    }
    return values;
  }

  function knownOwnerPropValues(node, source, explicitValues) {
    const values = new Map(explicitValues ?? []);
    if (
      !(
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      )
    ) {
      return values;
    }
    const firstParameter = node.parameters?.[0];
    if (!firstParameter || !ts.isObjectBindingPattern(firstParameter.name)) {
      return values;
    }
    for (const element of firstParameter.name.elements) {
      if (
        !ts.isIdentifier(element.name) ||
        values.has(element.name.text.toLowerCase()) ||
        !element.initializer
      ) {
        continue;
      }
      if (
        ts.isStringLiteral(element.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(element.initializer)
      ) {
        values.set(element.name.text.toLowerCase(), element.initializer.text);
      } else if (
        element.initializer.kind === ts.SyntaxKind.TrueKeyword ||
        element.initializer.kind === ts.SyntaxKind.FalseKeyword
      ) {
        values.set(
          element.name.text.toLowerCase(),
          element.initializer.kind === ts.SyntaxKind.TrueKeyword,
        );
      }
    }
    return values;
  }

  function literalConditionValue(expression) {
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text;
    }
    if (expression.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (expression.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    return undefined;
  }

  function evaluateKnownCondition(expression, propValues) {
    if (
      ts.isPrefixUnaryExpression(expression) &&
      expression.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const value = evaluateKnownCondition(expression.operand, propValues);
      return value === undefined ? undefined : !value;
    }
    if (ts.isIdentifier(expression)) {
      const value = propValues.get(expression.text.toLowerCase());
      return typeof value === "boolean" ? value : undefined;
    }
    if (!ts.isBinaryExpression(expression)) {
      return undefined;
    }
    const leftIdentifier = ts.isIdentifier(expression.left)
      ? expression.left.text.toLowerCase()
      : null;
    const rightIdentifier = ts.isIdentifier(expression.right)
      ? expression.right.text.toLowerCase()
      : null;
    const leftLiteral = literalConditionValue(expression.left);
    const rightLiteral = literalConditionValue(expression.right);
    const actual =
      leftIdentifier && rightLiteral !== undefined
        ? propValues.get(leftIdentifier)
        : rightIdentifier && leftLiteral !== undefined
          ? propValues.get(rightIdentifier)
          : undefined;
    const expected =
      leftIdentifier && rightLiteral !== undefined
        ? rightLiteral
        : rightIdentifier && leftLiteral !== undefined
          ? leftLiteral
          : undefined;
    if (actual === undefined || expected === undefined) {
      return undefined;
    }
    if (
      expression.operatorToken.kind ===
        ts.SyntaxKind.EqualsEqualsEqualsToken ||
      expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
    ) {
      return actual === expected;
    }
    if (
      expression.operatorToken.kind ===
        ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      return actual !== expected;
    }
    return undefined;
  }

  function addBinding(map, name, value) {
    const bindings = map.get(name) ?? [];
    bindings.push(value);
    map.set(name, bindings);
  }

  function hasModifier(node, kind) {
    return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
  }

  function moduleInfo(filePath) {
    const cached = moduleInfoCache.get(filePath);
    if (cached) {
      return cached;
    }

    const { source } = sourceFileFor(filePath);
    const localDeclarations = new Map();
    const exportedBindings = new Map();
    const importedBindings = new Map();
    const wildcardExports = [];

    function registerLocal(name, node) {
      if (name) {
        addBinding(localDeclarations, name, { kind: "node", node });
      }
    }

    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const resolved = resolveLocalImport(
          filePath,
          statement.moduleSpecifier.text,
          clientRoot,
        );
        const clause = statement.importClause;
        if (!resolved || !clause) {
          continue;
        }
        if (clause.name) {
          addBinding(importedBindings, clause.name.text, {
            kind: "target",
            filePath: resolved,
            symbol: "default",
          });
        }
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            addBinding(importedBindings, element.name.text, {
              kind: "target",
              filePath: resolved,
              symbol: element.propertyName?.text ?? element.name.text,
            });
          }
        } else if (
          clause.namedBindings &&
          ts.isNamespaceImport(clause.namedBindings)
        ) {
          addBinding(importedBindings, clause.namedBindings.name.text, {
            kind: "namespace",
            filePath: resolved,
          });
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const resolved = resolveLocalImport(
          filePath,
          statement.moduleSpecifier.text,
          clientRoot,
        );
        if (!resolved) {
          continue;
        }
        if (
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause)
        ) {
          for (const element of statement.exportClause.elements) {
            addBinding(exportedBindings, element.name.text, {
              kind: "target",
              filePath: resolved,
              symbol: element.propertyName?.text ?? element.name.text,
            });
          }
        } else {
          wildcardExports.push(resolved);
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements) {
          addBinding(exportedBindings, element.name.text, {
            kind: "local",
            symbol: element.propertyName?.text ?? element.name.text,
          });
        }
        continue;
      }

      if (ts.isExportAssignment(statement)) {
        addBinding(exportedBindings, "default", {
          kind: "node",
          node: statement,
        });
        continue;
      }

      if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)
      ) {
        const name = statement.name?.text;
        registerLocal(name, statement);
        if (hasModifier(statement, ts.SyntaxKind.ExportKeyword) && name) {
          addBinding(exportedBindings, name, {
            kind: "local",
            symbol: name,
          });
        }
        if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
          addBinding(exportedBindings, "default", {
            kind: "node",
            node: statement,
          });
        }
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) {
            continue;
          }
          const name = declaration.name.text;
          registerLocal(name, statement);
          if (exported) {
            addBinding(exportedBindings, name, {
              kind: "local",
              symbol: name,
            });
          }
        }
      }
    }

    const info = {
      exportedBindings,
      importedBindings,
      localDeclarations,
      source,
      wildcardExports,
    };
    moduleInfoCache.set(filePath, info);
    return info;
  }

  while (queue.length > 0) {
    const target = queue.shift();
    if (!target?.filePath) {
      continue;
    }

    const info = moduleInfo(target.filePath);
    let bindings;
    if (target.node) {
      bindings = [{ kind: "node", node: target.node }];
    } else if (target.local) {
      bindings = info.localDeclarations.get(target.symbol) ?? [];
    } else {
      bindings = info.exportedBindings.get(target.symbol) ?? [];
      if (bindings.length === 0) {
        for (const wildcardFile of info.wildcardExports) {
          queue.push({
            filePath: wildcardFile,
            symbol: target.symbol,
            ...(target.propValues
              ? { propValues: target.propValues }
              : {}),
          });
        }
      }
    }

    for (const binding of bindings) {
      if (binding.kind === "target") {
        queue.push({
          filePath: binding.filePath,
          symbol: binding.symbol,
          ...(target.propValues ? { propValues: target.propValues } : {}),
        });
        continue;
      }
      if (binding.kind === "local") {
        queue.push({
          filePath: target.filePath,
          local: true,
          symbol: binding.symbol,
          ...(target.propValues ? { propValues: target.propValues } : {}),
        });
        continue;
      }
      if (binding.kind !== "node") {
        continue;
      }

      const nodeKey = `${target.filePath}:${binding.node.getStart(
        info.source,
      )}:${serializedPropValues(target.propValues)}`;
      if (visitedTargets.has(nodeKey)) {
        continue;
      }
      visitedTargets.add(nodeKey);
      const statementStarts = scopes.get(target.filePath) ?? new Set();
      statementStarts.add(binding.node.getStart(info.source));
      scopes.set(target.filePath, statementStarts);

      const propValues = knownOwnerPropValues(
        binding.node,
        info.source,
        target.propValues,
      );

      function queueIdentifier(name, jsxPropValues = null) {
        for (const imported of info.importedBindings.get(name) ?? []) {
          if (imported.kind !== "namespace") {
            queue.push({
              ...imported,
              ...(jsxPropValues ? { propValues: jsxPropValues } : {}),
            });
          }
        }
        if (info.localDeclarations.has(name)) {
          queue.push({
            filePath: target.filePath,
            local: true,
            symbol: name,
            ...(jsxPropValues ? { propValues: jsxPropValues } : {}),
          });
        }
      }

      function visit(node) {
        if (ts.isConditionalExpression(node)) {
          const condition = evaluateKnownCondition(node.condition, propValues);
          visit(node.condition);
          if (condition === true) {
            visit(node.whenTrue);
          } else if (condition === false) {
            visit(node.whenFalse);
          } else {
            visit(node.whenTrue);
            visit(node.whenFalse);
          }
          return;
        }
        if (ts.isIfStatement(node)) {
          const condition = evaluateKnownCondition(node.expression, propValues);
          visit(node.expression);
          if (condition === true) {
            visit(node.thenStatement);
          } else if (condition === false) {
            if (node.elseStatement) {
              visit(node.elseStatement);
            }
          } else {
            visit(node.thenStatement);
            if (node.elseStatement) {
              visit(node.elseStatement);
            }
          }
          return;
        }
        if (ts.isIdentifier(node)) {
          const name = node.text;
          const parent = node.parent;
          const isDeclarationName =
            ((ts.isFunctionDeclaration(parent) ||
              ts.isFunctionExpression(parent) ||
              ts.isClassDeclaration(parent) ||
              ts.isVariableDeclaration(parent) ||
              ts.isParameter(parent)) &&
              parent.name === node) ||
            (ts.isBindingElement(parent) && parent.name === node);
          if (isDeclarationName) {
            return;
          }
          const isOpeningTag =
            (ts.isJsxOpeningElement(parent) ||
              ts.isJsxSelfClosingElement(parent)) &&
            parent.tagName === node;
          if (isOpeningTag) {
            queueIdentifier(
              name,
              jsxLiteralPropValues(parent.attributes, info.source),
            );
            return;
          }
          if (ts.isJsxClosingElement(parent) && parent.tagName === node) {
            return;
          }
          for (const imported of info.importedBindings.get(name) ?? []) {
            if (
              imported.kind === "namespace" &&
              ts.isPropertyAccessExpression(node.parent) &&
              node.parent.expression === node
            ) {
              queue.push({
                filePath: imported.filePath,
                symbol: node.parent.name.text,
              });
            }
          }
          queueIdentifier(name);
        }
        ts.forEachChild(node, visit);
      }

      visit(binding.node);
    }
  }

  return scopes;
}

function scopedTopLevelNodes(source, statementStarts) {
  if (!statementStarts) {
    return [source];
  }
  return source.statements.filter((statement) =>
    statementStarts.has(statement.getStart(source)),
  );
}

function collectRouteComponentPropEvidence(reachableUiScopes) {
  const names = new Set();
  const values = new Map();

  for (const [filePath, statementStarts] of reachableUiScopes) {
    const { source } = sourceFileFor(filePath);
    const roots = scopedTopLevelNodes(source, statementStarts);

    function visit(node) {
      const parts = getJsxParts(node, source);
      if (parts && /^[A-Z]/u.test(parts.tagName)) {
        const componentName = parts.tagName.split(".").at(-1);
        const attributes = attributeMap(parts.attributes, source);
        for (const [attributeName, attributeValue] of attributes) {
          if (attributeName !== "__spread") {
            const key = `${componentName}:${attributeName}`;
            names.add(key);
            if (
              attributeValue !== "{expression}" &&
              !attributeValue.startsWith("{")
            ) {
              const knownValues = values.get(key) ?? new Set();
              knownValues.add(attributeValue);
              values.set(key, knownValues);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    for (const root of roots) {
      visit(root);
    }
  }

  return { names, values };
}

function attributeMap(attributes, source) {
  const result = new Map();
  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      result.set("__spread", property.expression.getText(source));
      continue;
    }
    if (!ts.isJsxAttribute(property)) {
      continue;
    }

    const name = property.name.getText(source).toLowerCase();
    if (!property.initializer) {
      result.set(name, "true");
    } else if (ts.isStringLiteral(property.initializer)) {
      result.set(name, property.initializer.text);
    } else if (ts.isJsxExpression(property.initializer)) {
      result.set(
        name,
        property.initializer.expression?.getText(source) ?? "{expression}",
      );
    } else {
      result.set(name, property.initializer.getText(source));
    }
  }
  return result;
}

function getJsxParts(node, source) {
  if (ts.isJsxElement(node)) {
    return {
      attributes: node.openingElement.attributes,
      tagName: node.openingElement.tagName.getText(source),
    };
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return {
      attributes: node.attributes,
      tagName: node.tagName.getText(source),
    };
  }
  return null;
}

function expressionText(expression, source) {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return expressionText(expression.expression, source);
  }
  if (ts.isConditionalExpression(expression)) {
    return [expression.whenTrue, expression.whenFalse]
      .map((branch) => expressionText(branch, source))
      .filter(Boolean)
      .join(" / ");
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    const functionName = expression.expression.text;
    const localizedCopy =
      functionName === "t"
        ? expression.arguments[0]
        : functionName === "copy"
          ? expression.arguments[1]
          : null;
    if (localizedCopy && ts.isObjectLiteralExpression(localizedCopy)) {
      const values = localizedCopy.properties.flatMap((property) => {
        if (
          ts.isPropertyAssignment(property) &&
          (ts.isStringLiteral(property.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(property.initializer))
        ) {
          return [property.initializer.text];
        }
        return [];
      });
      if (values.length > 0) {
        return values.join(" / ");
      }
    }
  }
  if (
    ts.isIdentifier(expression) ||
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression) ||
    ts.isTemplateExpression(expression)
  ) {
    return `{${expression.getText(source)}}`;
  }
  return `{${expression.getText(source)}}`;
}

function childText(node, source) {
  if (!ts.isJsxElement(node)) {
    return "";
  }
  return node.children
    .map((child) => {
      if (ts.isJsxText(child)) {
        return child.text;
      }
      if (ts.isJsxExpression(child) && child.expression) {
        return expressionText(child.expression, source);
      }
      if (ts.isJsxElement(child)) {
        return childText(child, source);
      }
      return "";
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function interactionKind(client, tagName, attributes) {
  const normalizedTag = tagName.toLowerCase();
  const attributeNames = [...attributes.keys()];
  const hasCallbackProp =
    /^[A-Z]/u.test(tagName) &&
    attributeNames.some((name) => CALLBACK_PROP_PATTERN.test(name));

  if (client === "web") {
    if (normalizedTag === "a" || tagName === "Link") return "link";
    if (normalizedTag === "button") return "button";
    if (
      normalizedTag === "form" &&
      (attributes.has("action") || attributes.has("onsubmit"))
    ) {
      return "form-submit-boundary";
    }
    if (normalizedTag === "input" && attributes.get("type") === "hidden") {
      return null;
    }
    if (["input", "select", "textarea"].includes(normalizedTag)) {
      return "field";
    }
    if (normalizedTag === "summary") return "disclosure";
    if (attributes.get("role")?.toLowerCase() === "button") {
      return "role-button";
    }
    if (
      attributeNames.some((name) => WEB_EVENT_NAMES.has(name)) ||
      hasCallbackProp
    ) {
      return "callback-control";
    }
    return null;
  }

  if (NATIVE_CONTROLS.has(normalizedTag)) {
    return ["textinput", "picker", "switch"].includes(normalizedTag)
      ? "field"
      : "native-control";
  }
  if (
    attributeNames.some((name) => MOBILE_EVENT_NAMES.has(name)) ||
    hasCallbackProp
  ) {
    return "callback-control";
  }
  return null;
}

function callNamesFromText(value) {
  if (!value) {
    return [];
  }
  const calls = [];
  for (const match of value.matchAll(
    /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/gu,
  )) {
    if (!["if", "for", "while", "switch", "function"].includes(match[1])) {
      calls.push(match[1]);
    }
  }
  return [...new Set(calls)];
}

function hasSubmitFormAncestor(node, source) {
  let parent = node.parent;
  while (parent && !ts.isSourceFile(parent)) {
    if (ts.isJsxElement(parent)) {
      const tagName = parent.openingElement.tagName
        .getText(source)
        .toLowerCase();
      if (tagName === "form") {
        return true;
      }
    }
    parent = parent.parent;
  }
  return false;
}

function accessibleNameFromAncestor(node, source) {
  let parent = node.parent;
  while (parent && !ts.isSourceFile(parent)) {
    if (ts.isJsxElement(parent)) {
      const tagName = parent.openingElement.tagName.getText(source);
      const attributes = attributeMap(parent.openingElement.attributes, source);
      if (tagName.toLowerCase() === "label") {
        return (
          attributes.get("aria-label") ??
          attributes.get("title") ??
          childText(parent, source)
        );
      }
      if (tagName === "Field" || tagName.endsWith(".Field")) {
        return (
          attributes.get("accessibilitylabel") ??
          attributes.get("aria-label") ??
          attributes.get("label") ??
          attributes.get("title") ??
          ""
        );
      }
    }
    parent = parent.parent;
  }
  return "";
}

function collectImperativeSelectorEvidence(reachableFiles) {
  const evidence = new Map();
  for (const filePath of reachableFiles) {
    const sourceText = readFileSync(filePath, "utf8");
    if (!sourceText.includes("addEventListener")) {
      continue;
    }
    const selectors = [
      ...sourceText.matchAll(
        /querySelector(?:All)?(?:<[^>]+>)?\(\s*["'`]([^"'`]+)["'`]\s*\)/gu,
      ),
      ...sourceText.matchAll(/\$\(\s*["'`]([A-Za-z][\w-]+)["'`]\s*\)/gu),
    ].map((match) => (match[0].startsWith("$(") ? `#${match[1]}` : match[1]));
    for (const selector of selectors) {
      const items = evidence.get(selector) ?? [];
      items.push({
        event: "imperative:addEventListener",
        expression: relativeToWorkspace(filePath),
      });
      evidence.set(selector, items);
    }
  }
  return evidence;
}

function imperativeHandlers(attributes, selectorEvidence) {
  const selectors = [];
  const id = attributes.get("id");
  if (id && !id.includes("{")) {
    selectors.push(`#${id}`);
  }
  const className = attributes.get("classname") ?? attributes.get("class");
  if (className && !className.includes("{")) {
    selectors.push(
      ...className
        .split(/\s+/u)
        .filter(Boolean)
        .map((name) => `.${name}`),
    );
  }
  for (const name of attributes.keys()) {
    if (name.startsWith("data-")) {
      selectors.push(`[${name}]`);
    }
  }
  return [
    ...new Map(
      selectors
        .flatMap((selector) => selectorEvidence.get(selector) ?? [])
        .map((item) => [`${item.event}:${item.expression}`, item]),
    ).values(),
  ];
}

function collectInteractions(
  filePath,
  client,
  selectorEvidence,
  statementStarts = null,
) {
  const { source, sourceText } = sourceFileFor(filePath);
  const interactions = [];
  const explicitLabels = new Map();
  const roots = scopedTopLevelNodes(source, statementStarts);

  function discoverLabels(node) {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(source).toLowerCase();
      if (tagName === "label") {
        const attributes = attributeMap(node.openingElement.attributes, source);
        const target = attributes.get("htmlfor") ?? attributes.get("for");
        const text = childText(node, source);
        if (target && text) {
          explicitLabels.set(target, text);
        }
      }
    }
    ts.forEachChild(node, discoverLabels);
  }
  for (const root of roots) {
    discoverLabels(root);
  }

  function enclosingOwnerName(node) {
    let current = node.parent;
    while (current) {
      if (
        (ts.isFunctionDeclaration(current) ||
          ts.isMethodDeclaration(current) ||
          ts.isFunctionExpression(current)) &&
        current.name
      ) {
        return current.name.getText(source);
      }
      if (
        ts.isArrowFunction(current) &&
        ts.isVariableDeclaration(current.parent)
      ) {
        return current.parent.name.getText(source);
      }
      current = current.parent;
    }
    return null;
  }

  function enclosingOwnerFunction(node) {
    let current = node.parent;
    while (current) {
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current)
      ) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  function destructuredOwnerProps(owner) {
    const firstParameter = owner?.parameters?.[0];
    if (!firstParameter || !ts.isObjectBindingPattern(firstParameter.name)) {
      return new Set();
    }
    return new Set(
      firstParameter.name.elements.flatMap((element) =>
        ts.isIdentifier(element.name) ? [element.name.text] : [],
      ),
    );
  }

  function containsReturn(node) {
    let found = false;
    function visitReturn(current) {
      if (ts.isReturnStatement(current)) {
        found = true;
        return;
      }
      if (!found) {
        ts.forEachChild(current, visitReturn);
      }
    }
    visitReturn(node);
    return found;
  }

  function negatedIdentifier(condition) {
    if (
      ts.isPrefixUnaryExpression(condition) &&
      condition.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isIdentifier(condition.operand)
    ) {
      return condition.operand.text;
    }
    return null;
  }

  function ownerPropRenderGates(node, handlers) {
    const owner = enclosingOwnerFunction(node);
    if (!owner || !owner.body || !ts.isBlock(owner.body)) {
      return [];
    }

    const ownerProps = destructuredOwnerProps(owner);
    const handlerPropNames = handlers.flatMap((handler) =>
      /^[A-Za-z_$][\w$]*$/u.test(handler.expression) &&
      ownerProps.has(handler.expression)
        ? [handler.expression]
        : [],
    );
    if (handlerPropNames.length === 0) {
      return [];
    }

    const containingStatementIndex = owner.body.statements.findIndex(
      (statement) => statement.pos <= node.pos && statement.end >= node.end,
    );
    if (containingStatementIndex < 0) {
      return [];
    }

    return handlerPropNames.filter((propName) =>
      owner.body.statements
        .slice(0, containingStatementIndex)
        .some(
          (statement) =>
            ts.isIfStatement(statement) &&
            negatedIdentifier(statement.expression) === propName &&
            containsReturn(statement.thenStatement),
        ),
    );
  }

  function ownerPropBranchConditions(node) {
    const owner = enclosingOwnerFunction(node);
    const ownerProps = destructuredOwnerProps(owner);
    const conditions = [];
    let current = node;

    function branchLiteralValue(expression) {
      if (
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      ) {
        return expression.text;
      }
      if (expression.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
      }
      if (expression.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
      }
      return undefined;
    }

    function comparison(expression) {
      if (!ts.isBinaryExpression(expression)) {
        return null;
      }
      const leftName = ts.isIdentifier(expression.left)
        ? expression.left.text
        : null;
      const rightName = ts.isIdentifier(expression.right)
        ? expression.right.text
        : null;
      const leftValue = branchLiteralValue(expression.left);
      const rightValue = branchLiteralValue(expression.right);
      const propName =
        leftName && ownerProps.has(leftName)
          ? leftName
          : rightName && ownerProps.has(rightName)
            ? rightName
            : null;
      const value =
        propName === leftName
          ? rightValue
          : propName === rightName
            ? leftValue
            : undefined;
      if (propName === null || value === undefined) {
        return null;
      }
      const equality =
        expression.operatorToken.kind ===
          ts.SyntaxKind.EqualsEqualsEqualsToken ||
        expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken;
      const inequality =
        expression.operatorToken.kind ===
          ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        expression.operatorToken.kind ===
          ts.SyntaxKind.ExclamationEqualsToken;
      return equality || inequality
        ? { propName, value, equality }
        : null;
    }

    while (current.parent && current.parent !== owner) {
      const parent = current.parent;
      if (ts.isConditionalExpression(parent)) {
        const condition = comparison(parent.condition);
        if (condition && (current === parent.whenTrue || current === parent.whenFalse)) {
          const trueBranch = current === parent.whenTrue;
          conditions.push({
            propName: condition.propName,
            value: condition.value,
            matches: condition.equality === trueBranch,
          });
        }
      } else if (ts.isIfStatement(parent)) {
        const condition = comparison(parent.expression);
        if (
          condition &&
          (current === parent.thenStatement || current === parent.elseStatement)
        ) {
          const trueBranch = current === parent.thenStatement;
          conditions.push({
            propName: condition.propName,
            value: condition.value,
            matches: condition.equality === trueBranch,
          });
        }
      }
      current = parent;
    }
    return conditions;
  }

  function visit(node) {
    const parts = getJsxParts(node, source);
    if (parts) {
      const attributes = attributeMap(parts.attributes, source);
      const kind = interactionKind(client, parts.tagName, attributes);
      if (kind) {
        const position = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        const label =
          attributes.get("accessibilitylabel") ||
          attributes.get("aria-label") ||
          attributes.get("title") ||
          attributes.get("placeholder") ||
          explicitLabels.get(attributes.get("id")) ||
          childText(node, source) ||
          accessibleNameFromAncestor(node, source) ||
          "";
        const eventNames = [...attributes.keys()].filter(
          (name) =>
            WEB_EVENT_NAMES.has(name) ||
            MOBILE_EVENT_NAMES.has(name) ||
            CALLBACK_PROP_PATTERN.test(name),
        );
        const declaredHandlers = eventNames.map((name) => ({
          event: name,
          expression: attributes.get(name) ?? "",
        }));
        const imperative = imperativeHandlers(attributes, selectorEvidence);
        const handlers = [...declaredHandlers, ...imperative];
        const renderGateProps = ownerPropRenderGates(node, handlers);
        const href = attributes.get("href") ?? null;
        const disabledCondition =
          attributes.get("disabled") ??
          attributes.get("readonly") ??
          (attributes.has("editable")
            ? `editable=${attributes.get("editable")}`
            : null);
        const sourceSlice = sourceText.slice(
          node.getStart(source),
          Math.min(node.getEnd(), node.getStart(source) + 2_500),
        );
        const handlerText = handlers
          .map((handler) => handler.expression)
          .join(" ");
        const normalizedTag = parts.tagName.toLowerCase();
        const submitsAncestorForm =
          client === "web" &&
          normalizedTag === "button" &&
          attributes.get("type") !== "button" &&
          hasSubmitFormAncestor(node, source);
        const formAction =
          client === "web" &&
          normalizedTag === "form" &&
          (attributes.has("action") || handlers.length > 0);
        const hasStaticBehavior =
          href !== null ||
          handlers.length > 0 ||
          kind === "field" ||
          kind === "disclosure" ||
          submitsAncestorForm ||
          formAction ||
          attributes.has("formaction") ||
          attributes.has("__spread");
        const isCallbackBoundary =
          /^[A-Z]/u.test(parts.tagName) && kind === "callback-control";
        const accessibleNameEvidence =
          attributes.get("aria-hidden") === "true"
            ? "intentionally-hidden-pointer-target"
            : kind === "form-submit-boundary" || isCallbackBoundary
              ? "not-applicable-structural-boundary"
              : attributes.get("accessibilitylabel") ||
                  attributes.get("aria-label") ||
                  attributes.get("aria-labelledby") ||
                  label
                ? label.startsWith("{")
                  ? "dynamic-static-expression"
                  : "present-static"
                : attributes.has("__spread")
                  ? "delegated-props"
                  : "missing-static";

        interactions.push({
          sourceFile: relativeToWorkspace(filePath),
          line: position.line + 1,
          ownerSymbol: enclosingOwnerName(node),
          renderGateProps,
          ownerPropBranchConditions: ownerPropBranchConditions(node),
          controlType: kind,
          tag: parts.tagName,
          visibleName: label || null,
          accessibleNameEvidence,
          triggerCondition:
            "user-initiated; runtime preconditions not yet verified",
          disabledCondition,
          handlers,
          href,
          downstreamCallHints: callNamesFromText(handlerText),
          readWrite:
            href !== null
              ? "navigation"
              : WRITE_HINT.test(`${label} ${handlerText}`)
                ? "write-or-external-effect"
                : "read-or-local-state-requires-runtime-verification",
          confirmation: /confirm|alertdialog|dialog/i.test(sourceSlice)
            ? "present-static-signal"
            : "not-proven",
          idempotency: "not-runtime-verified",
          expectedLoading: /loading|pending|submitting|saving|uploading/i.test(
            sourceSlice,
          )
            ? "present-static-signal"
            : "not-proven",
          expectedSuccess: /success|saved|sent|created|updated/i.test(
            sourceSlice,
          )
            ? "present-static-signal"
            : "not-proven",
          expectedError: /error|failed|failure|retry/i.test(sourceSlice)
            ? "present-static-signal"
            : "not-proven",
          actualResult: "not-runtime-verified",
          testData: null,
          testEvidence: [],
          conclusion: hasStaticBehavior
            ? "inventoried-static-only"
            : "candidate-missing-handler",
          severity: hasStaticBehavior ? null : "P0-candidate",
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  for (const root of roots) {
    visit(root);
  }
  return interactions;
}

function collectVisibleContent(filePath, statementStarts = null) {
  const { source } = sourceFileFor(filePath);
  const content = [];
  const roots = scopedTopLevelNodes(source, statementStarts);

  function visit(node) {
    const parts = getJsxParts(node, source);
    if (parts) {
      const attributes = attributeMap(parts.attributes, source);
      const normalizedTag = parts.tagName.toLowerCase();
      const values = [];
      if (
        /^h[1-6]$/u.test(normalizedTag) ||
        normalizedTag === "label" ||
        normalizedTag === "legend" ||
        parts.tagName === "Text"
      ) {
        values.push(childText(node, source));
      }
      for (const name of [
        "accessibilitylabel",
        "aria-label",
        "label",
        "placeholder",
        "title",
      ]) {
        if (attributes.has(name)) {
          values.push(attributes.get(name));
        }
      }

      const position = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      for (const value of values.filter(Boolean)) {
        content.push({
          sourceFile: relativeToWorkspace(filePath),
          line: position.line + 1,
          tag: parts.tagName,
          text: String(value).replace(/\s+/gu, " ").trim(),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  for (const root of roots) {
    visit(root);
  }
  return [
    ...new Map(
      content.map((item) => [
        `${item.sourceFile}:${item.line}:${item.tag}:${item.text}`,
        item,
      ]),
    ).values(),
  ];
}

function collectOverlays(filePath, statementStarts = null) {
  const { source } = sourceFileFor(filePath);
  const overlays = [];
  const roots = scopedTopLevelNodes(source, statementStarts);

  function record(node, kind, label) {
    const position = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    overlays.push({
      implementationId: `${relativeToWorkspace(filePath)}:${position.line + 1}`,
      sourceFile: relativeToWorkspace(filePath),
      line: position.line + 1,
      kind,
      visibleName: label || null,
      runtimeStatus: "not-runtime-verified",
    });
  }

  function visit(node) {
    const parts = getJsxParts(node, source);
    if (parts) {
      const attributes = attributeMap(parts.attributes, source);
      const role = attributes.get("role")?.toLowerCase();
      if (
        OVERLAY_TAG_PATTERN.test(parts.tagName) ||
        role === "dialog" ||
        role === "alertdialog"
      ) {
        record(
          node,
          role ?? parts.tagName,
          attributes.get("accessibilitylabel") ??
            attributes.get("aria-label") ??
            attributes.get("title") ??
            childText(node, source),
        );
      }
    }
    if (
      ts.isCallExpression(node) &&
      ((ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(source) === "Alert" &&
        node.expression.name.text === "alert") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(source) === "window" &&
          ["alert", "confirm"].includes(node.expression.name.text)))
    ) {
      record(
        node,
        node.expression.name.text === "confirm"
          ? "system-confirmation"
          : "system-alert",
        node.arguments[0] ? expressionText(node.arguments[0], source) : "",
      );
    }
    ts.forEachChild(node, visit);
  }

  for (const root of roots) {
    visit(root);
  }
  return overlays;
}

function collectRouteParameterSignals(reachableUiScopes, entryFilePath) {
  const queryParameters = new Set();
  const hashSignals = [];
  const deepLinkSignals = [];
  const functionInfoByLocation = new Map();
  const callSitesByName = new Map();
  const routeSearchTypeNames = new Set();
  const routeSearchTypeDeclarations = new Map();

  function collectRouteSearchTypeEvidence(typeNode, source) {
    if (!typeNode) return;
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName) &&
      !["Array", "Promise", "Readonly", "Record"].includes(
        typeNode.typeName.text,
      )
    ) {
      routeSearchTypeNames.add(typeNode.typeName.text);
    }
    if (ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name) {
          queryParameters.add(
            member.name.getText(source).replace(/^["']|["']$/gu, ""),
          );
        }
      }
    }
    ts.forEachChild(typeNode, (child) =>
      collectRouteSearchTypeEvidence(child, source),
    );
  }

  function addIndexedValue(map, key, value) {
    const values = map.get(key) ?? [];
    values.push(value);
    map.set(key, values);
  }

  function functionName(node, source) {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      return node.name.text;
    }
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      return node.parent.name.text;
    }
    return null;
  }

  function isFunctionLike(node) {
    return (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    );
  }

  for (const [filePath, statementStarts] of reachableUiScopes) {
    const { source } = sourceFileFor(filePath);
    const roots = scopedTopLevelNodes(source, statementStarts);

    function index(node, parentFunction = null, routeEntryRoot = null) {
      let currentFunction = parentFunction;
      if (isFunctionLike(node)) {
        const name = functionName(node, source);
        const info = {
          filePath,
          isRouteEntry: filePath === entryFilePath && routeEntryRoot === node,
          name,
          node,
          parameters: node.parameters ?? [],
          source,
        };
        functionInfoByLocation.set(
          `${filePath}:${node.getStart(source)}`,
          info,
        );
        currentFunction = info;
        if (info.isRouteEntry) {
          for (const parameter of info.parameters) {
            if (
              ts.isIdentifier(parameter.name) &&
              /^(?:query|searchParams)$/u.test(parameter.name.text)
            ) {
              collectRouteSearchTypeEvidence(parameter.type, source);
            }
          }
        }
      }

      if (
        currentFunction &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression)
      ) {
        addIndexedValue(callSitesByName, node.expression.text, {
          arguments: node.arguments,
          caller: currentFunction,
        });
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["useLocalSearchParams", "useSearchParams"].includes(
          node.expression.text,
        )
      ) {
        collectRouteSearchTypeEvidence(node.typeArguments?.[0], source);
      }
      if (
        (ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node)) &&
        node.name
      ) {
        routeSearchTypeDeclarations.set(node.name.text, {
          node,
          source,
        });
      }
      ts.forEachChild(node, (child) =>
        index(child, currentFunction, routeEntryRoot),
      );
    }

    for (const root of roots) {
      const routeEntryRoot =
        filePath === entryFilePath &&
        isFunctionLike(root) &&
        root.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        )
          ? root
          : null;
      index(root, null, routeEntryRoot);
    }
  }

  for (const typeName of routeSearchTypeNames) {
    const declaration = routeSearchTypeDeclarations.get(typeName);
    if (!declaration) continue;
    const typeNode = ts.isTypeAliasDeclaration(declaration.node)
      ? declaration.node.type
      : declaration.node;
    collectRouteSearchTypeEvidence(typeNode, declaration.source);
  }

  function unwrapExpression(expression) {
    let current = expression;
    while (
      ts.isAwaitExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  }

  function parameterIndexForIdentifier(functionInfo, identifier) {
    return functionInfo.parameters.findIndex((parameter) => {
      if (ts.isIdentifier(parameter.name)) {
        return parameter.name.text === identifier.text;
      }
      if (ts.isObjectBindingPattern(parameter.name)) {
        return parameter.name.elements.some(
          (element) =>
            ts.isIdentifier(element.name) &&
            element.name.text === identifier.text,
        );
      }
      return false;
    });
  }

  function hasRouteSearchProvenance(
    expression,
    functionInfo,
    seenParameters = new Set(),
  ) {
    const current = unwrapExpression(expression);
    if (
      ts.isIdentifier(current) &&
      ["undefined", "null"].includes(current.text)
    ) {
      return false;
    }
    if (
      ts.isNewExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "URLSearchParams"
    ) {
      const argument = current.arguments?.[0];
      return Boolean(
        argument &&
          (/(?:^|\.)location\.search$/u.test(argument.getText(functionInfo?.source)) ||
            hasRouteSearchProvenance(
              argument,
              functionInfo,
              seenParameters,
            )),
      );
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      ["useLocalSearchParams", "useSearchParams"].includes(
        current.expression.text,
      )
    ) {
      return true;
    }
    if (!ts.isIdentifier(current) || !functionInfo) {
      return false;
    }

    let localInitializer = null;
    function findLocalInitializer(node) {
      if (localInitializer) return;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === current.text &&
        node.initializer
      ) {
        localInitializer = node.initializer;
        return;
      }
      ts.forEachChild(node, findLocalInitializer);
    }
    findLocalInitializer(functionInfo.node);
    if (localInitializer) {
      const localKey = `${functionInfo.filePath}:${functionInfo.name ?? "<anonymous>"}:local:${current.text}`;
      if (seenParameters.has(localKey)) {
        return false;
      }
      const nextSeen = new Set(seenParameters);
      nextSeen.add(localKey);
      return hasRouteSearchProvenance(
        localInitializer,
        functionInfo,
        nextSeen,
      );
    }

    const parameterIndex = parameterIndexForIdentifier(functionInfo, current);
    if (parameterIndex < 0) {
      return false;
    }
    if (
      functionInfo.isRouteEntry &&
      /^(?:query|searchParams)$/u.test(current.text)
    ) {
      return true;
    }
    if (!functionInfo.name) {
      return false;
    }

    const parameterKey = `${functionInfo.filePath}:${functionInfo.name}:${parameterIndex}`;
    if (seenParameters.has(parameterKey)) {
      return false;
    }
    const nextSeen = new Set(seenParameters);
    nextSeen.add(parameterKey);
    return (callSitesByName.get(functionInfo.name) ?? []).some((callSite) => {
      const argument = callSite.arguments[parameterIndex];
      return (
        argument &&
        hasRouteSearchProvenance(argument, callSite.caller, nextSeen)
      );
    });
  }

  for (const [filePath, statementStarts] of reachableUiScopes) {
    const { source } = sourceFileFor(filePath);
    const roots = scopedTopLevelNodes(source, statementStarts);
    const scopedText = roots.map((root) => root.getText(source)).join("\n");

    if (/location\.hash|\.hash\b|split\(\s*["']#["']/u.test(scopedText)) {
      hashSignals.push(relativeToWorkspace(filePath));
    }
    if (
      /Linking\.|useLocalSearchParams|redirect\(|router\.(?:push|replace)|<Redirect\b/u.test(
        scopedText,
      )
    ) {
      deepLinkSignals.push(relativeToWorkspace(filePath));
    }

    function recordSearchParamsTypeMembers(node) {
      for (const member of node.members ?? []) {
        if (ts.isPropertySignature(member) && member.name) {
          queryParameters.add(
            member.name.getText(source).replace(/^["']|["']$/gu, ""),
          );
        }
      }
    }

    function visit(node, parentFunction = null) {
      const currentFunction =
        functionInfoByLocation.get(`${filePath}:${node.getStart(source)}`) ??
        parentFunction;
      if (ts.isCallExpression(node)) {
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "get" &&
          hasRouteSearchProvenance(
            node.expression.expression,
            currentFunction,
          ) &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          queryParameters.add(node.arguments[0].text);
        }

        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "readSearchParam"
        ) {
          const receiverArgument = node.arguments[0];
          const keyArgument = node.arguments.find(
            (argument, index) => index > 0 && ts.isStringLiteralLike(argument),
          );
          if (
            receiverArgument &&
            hasRouteSearchProvenance(receiverArgument, currentFunction) &&
            keyArgument &&
            ts.isStringLiteralLike(keyArgument)
          ) {
            queryParameters.add(keyArgument.text);
          }
        }

        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "useLocalSearchParams"
        ) {
          const typeArgument = node.typeArguments?.[0];
          if (typeArgument && ts.isTypeLiteralNode(typeArgument)) {
            recordSearchParamsTypeMembers(typeArgument);
          }
          if (
            ts.isVariableDeclaration(node.parent) &&
            ts.isObjectBindingPattern(node.parent.name)
          ) {
            for (const element of node.parent.name.elements) {
              queryParameters.add(
                element.propertyName?.getText(source) ??
                  element.name.getText(source),
              );
            }
          }
        }
      }

      // Type names alone do not prove that the page URL owns those keys.
      // Reachable debug controls often declare API-request `*SearchParams`
      // types whose values are sent to a nested `/api/*` endpoint.
      if (
        (ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node)) &&
        node.name &&
        routeSearchTypeNames.has(node.name.text)
      ) {
        recordSearchParamsTypeMembers(
          ts.isTypeAliasDeclaration(node) ? node.type : node,
        );
      }
      ts.forEachChild(node, (child) => visit(child, currentFunction));
    }
    for (const root of roots) {
      visit(root);
    }
  }

  return {
    queryParameters: [...queryParameters].sort(),
    hashEvidenceFiles: [...new Set(hashSignals)].sort(),
    deepLinkEvidenceFiles: [...new Set(deepLinkSignals)].sort(),
  };
}

function collectDataSignals(reachableFiles) {
  const signals = {
    api: [],
    live: [],
    mockOrFixture: [],
    persistence: [],
    external: [],
  };
  for (const filePath of reachableFiles) {
    const text = readFileSync(filePath, "utf8");
    const relative = relativeToWorkspace(filePath);
    if (/\bfetch\s*\(|apiClient|useOrbitApiClient|\/api\//iu.test(text)) {
      signals.api.push(relative);
    }
    if (/live-record|LiveService|configuredLive|postgres/iu.test(text)) {
      signals.live.push(relative);
    }
    if (/\bmock\b|\bfixture\b|mock-service|fixtures/iu.test(text)) {
      signals.mockOrFixture.push(relative);
    }
    if (/AsyncStorage|SecureStore|SQLite|database|record-store/iu.test(text)) {
      signals.persistence.push(relative);
    }
    if (/oauth|google|calendar|email|providerReceipt|external/iu.test(text)) {
      signals.external.push(relative);
    }
  }
  return Object.fromEntries(
    Object.entries(signals).map(([key, values]) => [
      key,
      [...new Set(values)].sort(),
    ]),
  );
}

function collectStateSignals(reachableFiles) {
  const combined = reachableFiles
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  return {
    loading: /loading|pending|skeleton/iu.test(combined),
    empty: /\bempty\b|no results|no data|not found/iu.test(combined),
    success: /success|saved|created|updated|sent/iu.test(combined),
    failure: /error|failed|failure|retry/iu.test(combined),
    offline: /offline|network unavailable|network request failed/iu.test(
      combined,
    ),
    unauthenticated: /unauthenticated|sign in|log in|未登录|登录/iu.test(
      combined,
    ),
    forbidden: /forbidden|permission denied|unauthori[sz]ed|无权限/iu.test(
      combined,
    ),
    unavailable: /unavailable|not configured|未配置|不可用/iu.test(combined),
    partialFailure: /partial|degraded|部分失败/iu.test(combined),
    timeout: /timeout|timed out|超时/iu.test(combined),
    duplicateSubmission: /idempot|duplicate|重复提交/iu.test(combined),
  };
}

function readPrivateWebPrefixes() {
  const filePath = path.join(WEB_ROOT, "features/auth/app-auth-routing.ts");
  const source = readFileSync(filePath, "utf8");
  const declaration =
    /ORBIT_PRIVATE_APP_PREFIXES\s*=\s*\[([\s\S]*?)\]\s*as const/u.exec(source);
  return declaration
    ? [...declaration[1].matchAll(/["']([^"']+)["']/gu)].map(
        (match) => match[1],
      )
    : [];
}

function readPublicWebPathExceptions() {
  const filePath = path.join(WEB_ROOT, "features/auth/app-auth-routing.ts");
  const source = readFileSync(filePath, "utf8");
  const declaration =
    /ORBIT_PUBLIC_ADMIN_ENTRY_PATHS\s*=\s*new Set\(\[([\s\S]*?)\]\)/u.exec(
      source,
    );
  return declaration
    ? [...declaration[1].matchAll(/["']([^"']+)["']/gu)].map(
        (match) => match[1],
      )
    : [];
}

function accessForSurface(
  client,
  route,
  privateWebPrefixes,
  publicWebPathExceptions,
) {
  if (client === "web") {
    if (publicWebPathExceptions.includes(route)) {
      return {
        roles: ["anonymous", "authenticated-user"],
        policy: "public-admin-auth-entry",
      };
    }
    if (
      privateWebPrefixes.some(
        (prefix) => route === prefix || route.startsWith(`${prefix}/`),
      )
    ) {
      return {
        roles: ["authenticated-user"],
        policy: "authenticated-at-web-boundary",
      };
    }
    if (route.startsWith("/app/account")) {
      return {
        roles: ["anonymous", "authenticated-user"],
        policy: "public-auth-entry",
      };
    }
    if (route.startsWith("/dev")) {
      return {
        roles: ["developer"],
        policy: "development-surface-runtime-guard-requires-verification",
      };
    }
    return {
      roles: ["anonymous", "authenticated-user"],
      policy:
        "public-at-web-boundary; page authorization requires verification",
    };
  }

  return {
    roles: [
      "anonymous",
      "authenticated-user",
      "role-requires-runtime-verification",
    ],
    policy:
      "mobile screen/provider enforcement must be verified per route; no central route guard found",
  };
}

function parentSurfaceId(client, route, routeSet) {
  if (route === "/") {
    return null;
  }
  const segments = route.split("/").filter(Boolean);
  while (segments.length > 0) {
    segments.pop();
    const parentRoute = segments.length > 0 ? `/${segments.join("/")}` : "/";
    const candidate = `${client}:${parentRoute}`;
    if (routeSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function inferPurpose(route) {
  const segment = route.split("/").filter(Boolean).at(-1) ?? "landing";
  if (segment.startsWith("[")) {
    return "Dynamic detail surface; product goal requires runtime verification";
  }
  return `${segment.replaceAll("-", " ")} product surface; exact user goal requires runtime verification`;
}

function testFilesForClient(client) {
  const root =
    client === "web"
      ? path.join(WEB_ROOT, "tests")
      : path.join(MOBILE_ROOT, "tests");
  return listFiles(root, (filePath) =>
    /\.test\.(?:ts|tsx|js|jsx)$/u.test(filePath),
  );
}

function testEvidenceForSurface(surface, testFiles) {
  const routeWithoutParameters = surface.route.replace(/\[[^/]+\]/gu, "");
  const routeSource = surface.pageFile;
  return testFiles
    .filter((testFile) => {
      const text = readFileSync(testFile, "utf8");
      return (
        text.includes(surface.route) ||
        (routeWithoutParameters.length > 2 &&
          text.includes(routeWithoutParameters)) ||
        text.includes(routeSource)
      );
    })
    .map(relativeToWorkspace)
    .sort();
}

function stableGitMetadata() {
  try {
    const authoritativeInputStatus = execFileSync(
      "git",
      [
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        "repos/orbits",
        "repos/orbit-app",
        "harness",
        "tests",
      ],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim(),
      commitTime: execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim(),
      sourceState:
        authoritativeInputStatus.length === 0
          ? "clean-head"
          : "head-plus-uncommitted-authoritative-inputs",
      uncommittedAuthoritativeInputChanges: authoritativeInputStatus.length,
    };
  } catch {
    return {
      commit: "unavailable",
      commitTime: "unavailable",
      sourceState: "unavailable",
      uncommittedAuthoritativeInputChanges: null,
    };
  }
}

function buildRouteEntries() {
  return [
    ...listFiles(WEB_APP_ROOT, isWebPage).map((pageFile) => ({
      client: "web",
      clientRoot: WEB_ROOT,
      environment: toPosix(path.relative(WEB_APP_ROOT, pageFile)).startsWith(
        "dev/",
      )
        ? "development"
        : "production",
      pageFile,
      route: webRouteFromPage(pageFile),
    })),
    ...listFiles(MOBILE_APP_ROOT, isMobileRoute).map((pageFile) => ({
      client: "mobile",
      clientRoot: MOBILE_ROOT,
      environment: "production",
      pageFile,
      route: mobileRouteFromFile(pageFile),
    })),
  ].sort((left, right) =>
    `${left.client}:${left.route}`.localeCompare(
      `${right.client}:${right.route}`,
    ),
  );
}

export function buildFullProductFunctionalAuditInventory() {
  const routeEntries = buildRouteEntries();
  const routeSet = new Set(
    routeEntries.map((entry) => `${entry.client}:${entry.route}`),
  );
  const privateWebPrefixes = readPrivateWebPrefixes();
  const publicWebPathExceptions = readPublicWebPathExceptions();
  const testsByClient = {
    web: testFilesForClient("web"),
    mobile: testFilesForClient("mobile"),
  };
  const overlayImplementations = new Map();

  const surfaces = routeEntries.map((entry) => {
    const reachableFiles = collectReachableSources(
      entry.pageFile,
      entry.clientRoot,
    );
    const reachableUiScopes = collectReachableUiScopes(
      entry.pageFile,
      entry.clientRoot,
    );
    const selectorEvidence = collectImperativeSelectorEvidence(reachableFiles);
    const componentPropEvidence =
      collectRouteComponentPropEvidence(reachableUiScopes);
    const interactionMap = new Map();
    const contentMap = new Map();
    const overlayMap = new Map();

    for (const [filePath, statementStarts] of reachableUiScopes) {
      for (const interaction of collectInteractions(
        filePath,
        entry.client,
        selectorEvidence,
        statementStarts,
      )) {
        if (
          interaction.renderGateProps.length > 0 &&
          interaction.renderGateProps.some(
            (propName) =>
              !componentPropEvidence.names.has(
                `${interaction.ownerSymbol}:${propName.toLowerCase()}`,
              ),
          )
        ) {
          continue;
        }
        if (
          interaction.ownerPropBranchConditions.some((condition) => {
            const knownValues = componentPropEvidence.values.get(
              `${interaction.ownerSymbol}:${condition.propName.toLowerCase()}`,
            );
            return (
              knownValues &&
              knownValues.size > 0 &&
              [...knownValues].every(
                (value) => (value === condition.value) !== condition.matches,
              )
            );
          })
        ) {
          continue;
        }
        interactionMap.set(
          `${interaction.sourceFile}:${interaction.line}:${interaction.controlType}:${interaction.tag}`,
          interaction,
        );
      }
      for (const content of collectVisibleContent(filePath, statementStarts)) {
        contentMap.set(
          `${content.sourceFile}:${content.line}:${content.tag}:${content.text}`,
          content,
        );
      }
      for (const overlay of collectOverlays(filePath, statementStarts)) {
        overlayMap.set(overlay.implementationId, overlay);
        overlayImplementations.set(overlay.implementationId, overlay);
      }
    }

    const surfaceId = `${entry.client}:${entry.route}`;
    const hasBrowserSmokeEvidence =
      entry.client === "web" && BROWSER_SMOKE_WEB_ROUTES.has(entry.route);
    const hasLiveProfileRuntimeEvidence =
      surfaceId === LIVE_PROFILE_RUNTIME_SURFACE;
    const hasLiveEventRegistrationRuntimeEvidence =
      surfaceId === LIVE_EVENT_REGISTRATION_RUNTIME_SURFACE;
    const hasLiveBusinessCardRestrictedRuntimeEvidence =
      surfaceId === LIVE_BUSINESS_CARD_RESTRICTED_RUNTIME_SURFACE;
    const hasLiveContactsListRuntimeEvidence =
      surfaceId === LIVE_CONTACTS_LIST_RUNTIME_SURFACE;
    const hasLiveContactDetailRuntimeEvidence =
      surfaceId === LIVE_CONTACT_DETAIL_RUNTIME_SURFACE;
    const hasLiveMobileContactAcquisitionRuntimeEvidence =
      surfaceId === LIVE_MOBILE_CONTACT_ACQUISITION_RUNTIME_SURFACE;
    const hasLiveMobilePermissionRuntimeEvidence =
      surfaceId === "mobile:/account/permissions";
    const hasLiveMobileAuthRuntimeEvidence =
      LIVE_MOBILE_AUTH_RUNTIME_SURFACES.has(surfaceId);
    const liveMobileAdditionalRuntimeEvidence =
      LIVE_MOBILE_ADDITIONAL_RUNTIME_SURFACES.get(surfaceId);
    const liveWebAdditionalRuntimeEvidence =
      LIVE_WEB_ADDITIONAL_RUNTIME_SURFACES.get(surfaceId);
    const interactions = [...interactionMap.values()]
      .sort((left, right) =>
        `${left.sourceFile}:${String(left.line).padStart(8, "0")}`.localeCompare(
          `${right.sourceFile}:${String(right.line).padStart(8, "0")}`,
        ),
      )
      .map((interaction, index) => {
        const stableInteractionEvidenceKey = `${
          interaction.sourceFile
        }#${interaction.handlers
          .map((handler) => `${handler.event}:${handler.expression}`)
          .join("|")}#${interaction.visibleName}`;
        const ownerStableInteractionEvidenceKey = `${
          interaction.sourceFile
        }#owner:${interaction.ownerSymbol ?? "unknown"}#${interaction.handlers
          .map(
            (handler) =>
              `${handler.event}:${normalizedEvidenceText(handler.expression)}`,
          )
          .join("|")}#${normalizedEvidenceText(interaction.visibleName)}`;
        const normalizedStableInteractionEvidenceKey = `${
          interaction.sourceFile
        }#${interaction.handlers
          .map(
            (handler) =>
              `${handler.event}:${normalizedEvidenceText(handler.expression)}`,
          )
          .join("|")}#${normalizedEvidenceText(interaction.visibleName)}`;
        const runtimeEvidence = hasLiveProfileRuntimeEvidence
          ? LIVE_PROFILE_INTERACTION_EVIDENCE.get(
              `${interaction.sourceFile}:${interaction.line}`,
            )
          : hasLiveEventRegistrationRuntimeEvidence
            ? LIVE_EVENT_REGISTRATION_INTERACTION_EVIDENCE.get(
                `${interaction.sourceFile}:${interaction.line}`,
              )
            : hasLiveBusinessCardRestrictedRuntimeEvidence
              ? LIVE_BUSINESS_CARD_RESTRICTED_INTERACTION_EVIDENCE.get(
                  `${interaction.sourceFile}:${interaction.line}`,
                )
              : hasLiveContactsListRuntimeEvidence
                ? LIVE_CONTACTS_LIST_INTERACTION_EVIDENCE.get(
                    `${interaction.sourceFile}:${interaction.line}`,
                  )
                : hasLiveContactDetailRuntimeEvidence
                  ? LIVE_CONTACT_DETAIL_INTERACTION_EVIDENCE.get(
                      `${interaction.sourceFile}:${interaction.line}`,
                    )
                  : hasLiveMobileAuthRuntimeEvidence
                    ? (LIVE_MOBILE_AUTH_INTERACTION_EVIDENCE.get(
                        stableInteractionEvidenceKey,
                      ) ??
                      LIVE_MOBILE_AUTH_INTERACTION_EVIDENCE.get(
                        `${interaction.sourceFile}:${interaction.line}`,
                      ))
                    : hasLiveMobileContactAcquisitionRuntimeEvidence
                      ? (LIVE_MOBILE_CONTACT_ACQUISITION_INTERACTION_EVIDENCE.get(
                          stableInteractionEvidenceKey,
                        ) ??
                        LIVE_MOBILE_CONTACT_ACQUISITION_INTERACTION_EVIDENCE.get(
                          `${interaction.sourceFile}:${interaction.line}`,
                        ))
                      : liveMobileAdditionalRuntimeEvidence
                        ? LIVE_MOBILE_ADDITIONAL_INTERACTION_EVIDENCE.get(
                            `${surfaceId}|${stableInteractionEvidenceKey}`,
                          )
                        : liveWebAdditionalRuntimeEvidence
                          ? lookupEvidenceByStableKeys(
                              LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE,
                              [
                                `${surfaceId}|${stableInteractionEvidenceKey}`,
                                `${surfaceId}|${ownerStableInteractionEvidenceKey}`,
                                `${surfaceId}|${normalizedStableInteractionEvidenceKey}`,
                                ...(HANDLER_BOUND_RUNTIME_EVIDENCE_INTERACTIONS.has(
                                  `${interaction.sourceFile}#${interaction.visibleName}`,
                                )
                                  ? []
                                  : [
                                      `${surfaceId}|${interaction.sourceFile}#${interaction.visibleName}`,
                                      `${surfaceId}|${interaction.sourceFile}:${interaction.line}`,
                                    ]),
                              ],
                            )
                          : undefined;
        const runtimeVerificationCase =
          runtimeEvidence?.verificationCase ??
          (hasLiveProfileRuntimeEvidence
            ? "web-profile-complete-lifecycle-2026-07-29"
            : hasLiveEventRegistrationRuntimeEvidence
              ? "live-event-registration-persistence-cancellation-isolation-2026-07-28"
              : hasLiveBusinessCardRestrictedRuntimeEvidence
                ? "live-business-card-unconfigured-failure-closed-2026-07-28"
                : hasLiveMobileAuthRuntimeEvidence
                  ? hasLiveMobilePermissionRuntimeEvidence
                    ? "expo-web-permission-persistence-cors-isolation-2026-07-29"
                    : "expo-web-auth-profile-account-privacy-2026-07-28"
                  : liveMobileAdditionalRuntimeEvidence
                    ? liveMobileAdditionalRuntimeEvidence.verificationCase
                    : liveWebAdditionalRuntimeEvidence
                      ? liveWebAdditionalRuntimeEvidence.verificationCase
                      : "live-contact-list-detail-persistence-isolation-2026-07-28");
        const {
          ownerSymbol: _ownerSymbol,
          renderGateProps: _renderGateProps,
          ...publicInteraction
        } = interaction;

        return {
          interactionId: `${surfaceId}#interaction-${index + 1}`,
          surfaceId,
          ...publicInteraction,
          ...(runtimeEvidence
            ? {
                actualResult: runtimeEvidence.actualResult,
                testData: runtimeEvidence.testData,
                testEvidence: [runtimeVerificationCase],
                confirmation:
                  interaction.line === 902 || interaction.line === 1293
                    ? "alertdialog-confirmation-runtime-verified"
                    : interaction.confirmation,
                idempotency: runtimeEvidence.idempotency,
                conclusion: "runtime-verified-exercised-case",
                severity: null,
              }
            : {}),
        };
      });
    const overlays = [...overlayMap.values()].map((overlay) => ({
      overlayInstanceId: `${surfaceId}#overlay-${overlay.implementationId}`,
      parentSurfaceId: surfaceId,
      trigger:
        "reachable from route source; exact control requires runtime verification",
      enterExitBehavior: "not-runtime-verified",
      ...overlay,
    }));
    const pathParameters = [...entry.route.matchAll(/\[([^\]]+)\]/gu)].map(
      (match) => match[1],
    );
    const routeParameters = collectRouteParameterSignals(
      reachableUiScopes,
      entry.pageFile,
    );
    routeParameters.queryParameters = routeParameters.queryParameters.filter(
      (parameter) => !pathParameters.includes(parameter),
    );

    const surface = {
      surfaceId,
      parentSurfaceId: parentSurfaceId(entry.client, entry.route, routeSet),
      client: entry.client,
      environment: entry.environment,
      route: entry.route,
      routeKind: pathParameters.length > 0 ? "dynamic" : "static",
      pathParameters,
      pageFile: relativeToWorkspace(entry.pageFile),
      trigger: "direct route, navigation, redirect, or deep link",
      access: accessForSurface(
        entry.client,
        entry.route,
        privateWebPrefixes,
        publicWebPathExceptions,
      ),
      prerequisites:
        "runtime data, session, role, and configuration require verification",
      dataSources: collectDataSignals(reachableFiles),
      goal: inferPurpose(entry.route),
      visibleContent: [...contentMap.values()],
      layout: hasBrowserSmokeEvidence
        ? "browser-base-state-verified-at-1440x900-and-390x844"
        : "source-inventoried; rendered structure requires viewport verification",
      entryBehavior: hasLiveProfileRuntimeEvidence
        ? "authenticated-browser-signup-login-profile-entry-verified"
        : hasLiveEventRegistrationRuntimeEvidence
          ? "catalogue-detail-authenticated-registration-entry-verified"
          : hasLiveBusinessCardRestrictedRuntimeEvidence
            ? "authenticated-browser-restricted-capability-entry-verified"
            : hasLiveContactsListRuntimeEvidence
              ? "authenticated-browser-live-contact-list-entry-verified"
              : hasLiveContactDetailRuntimeEvidence
                ? "authenticated-browser-live-contact-detail-entry-verified"
                : hasLiveMobileContactAcquisitionRuntimeEvidence
                  ? "expo-web-live-external-source-empty-entry-verified"
                  : hasLiveMobilePermissionRuntimeEvidence
                    ? "expo-web-auth-permission-write-readback-entry-verified"
                    : hasLiveMobileAuthRuntimeEvidence
                      ? "expo-web-auth-session-entry-verified"
                      : liveMobileAdditionalRuntimeEvidence
                        ? liveMobileAdditionalRuntimeEvidence.entryBehavior
                        : liveWebAdditionalRuntimeEvidence
                          ? liveWebAdditionalRuntimeEvidence.entryBehavior
                          : hasBrowserSmokeEvidence
                            ? "browser-base-state-rendered-with-non-empty-content"
                            : "not-runtime-verified",
      exitBehavior: hasLiveProfileRuntimeEvidence
        ? "back-and-cancel-navigation-to-/app/home-verified"
        : hasLiveBusinessCardRestrictedRuntimeEvidence ||
            hasLiveContactDetailRuntimeEvidence
          ? "browser-return-to-contacts-verified"
          : "not-runtime-verified",
      nextSurfaces: [
        ...new Set(interactions.map((item) => item.href).filter(Boolean)),
      ].sort(),
      backCloseBehavior: hasLiveProfileRuntimeEvidence
        ? "back-and-cancel-discarded-unsaved-state-and-opened-/app/home"
        : hasLiveBusinessCardRestrictedRuntimeEvidence
          ? "restricted-state-return-link-navigated-to-/app/contacts"
          : hasLiveContactDetailRuntimeEvidence
            ? "detail-return-link-navigated-to-/app/contacts"
            : "not-runtime-verified",
      responsive: {
        desktop: hasLiveProfileRuntimeEvidence
          ? "full-profile-lifecycle-verified-at-default-desktop-width"
          : hasBrowserSmokeEvidence
            ? "base-state-no-horizontal-overflow-at-1440x900"
            : entry.client === "web"
              ? "not-runtime-verified"
              : "not-applicable",
        tablet: "not-runtime-verified",
        mobile: hasLiveProfileRuntimeEvidence
          ? "full-profile-form-save-and-hard-navigation-readback-verified-at-390x844"
          : hasBrowserSmokeEvidence
            ? "base-state-no-horizontal-overflow-at-390x844"
            : "not-runtime-verified",
      },
      accessibility: {
        keyboard: hasLiveProfileRuntimeEvidence
          ? "custom-topic-enter-addition-runtime-verified; full-keyboard-traversal-pending"
          : entry.client === "web"
            ? "not-runtime-verified"
            : "platform-native",
        screenReader: "not-runtime-verified",
        focusManagement: "not-runtime-verified",
      },
      routeParameters,
      states: collectStateSignals(reachableFiles),
      interactions,
      overlays,
      testEvidence: [],
      runtimeEvidence: hasLiveProfileRuntimeEvidence
        ? [
            "production-build entry from /app and account menu",
            "live Postgres profile write and projected record ownership",
            "structured extraction empty and success boundaries",
            "desktop validation, save, GET readback, and hard-navigation persistence",
            "cancelled unsaved edit and verified /app/home profile consumption",
            "390x844 mobile save and hard-navigation readback",
            "two-account isolation",
            "duplicate-signup and invalid-password failure paths",
            "final UI cleanup and original 20% profile readback",
          ]
        : hasLiveEventRegistrationRuntimeEvidence
          ? [
              "production-build catalogue → detail → registration traversal",
              "live Postgres registration write and projected record ownership",
              "browser exact-answer and cancelled-state refresh readback",
              "two-account isolation and one-record-per-account idempotency",
              "cancel confirmation, dismiss, confirm, and same-record reactivation",
              "server-offline persistence failure and successful retry",
            ]
          : hasLiveBusinessCardRestrictedRuntimeEvidence
            ? [
                "production-build authenticated import-hub entry",
                "server-resolved live/OCR/storage readiness without provider calls",
                "browser disabled source and explicit no-upload/no-write copy",
                "browser restricted-state exit to /app/contacts",
                "live Postgres zero-contact projection before and after",
              ]
            : hasLiveContactsListRuntimeEvidence
              ? [
                  "production-build authenticated contacts-list entry",
                  "formal live business-card contact service replay",
                  "browser three-vs-one account-isolated list readback",
                  "browser same-name search with distinct organizations",
                  "zero fabricated event, AI-basis, or strength claims",
                  "live Postgres C=3/B=1 owner/count projection",
                ]
              : hasLiveContactDetailRuntimeEvidence
                ? [
                    "production-build encoded dynamic contact entry",
                    "source-only contact detail without relationship enrichment",
                    "browser exact-field, provenance, and refresh readback",
                    "browser detail-to-list return navigation",
                    "two-account detail isolation",
                    "formal write replay with no additional writes",
                  ]
                : hasLiveMobileContactAcquisitionRuntimeEvidence
                  ? [
                      "browser-owned QR camera permission pending state",
                      "duplicate-request guard and source-mode cancellation",
                      "zero residual camera/video and zero draft write after leaving QR",
                      "runtime 44-point shared navigation and acquisition touch-target measurement",
                      "runtime tablist/tab and radiogroup/radio selected-state ARIA projection",
                      "browser camera and photo-library image input traversal",
                      "real PNG preview, filename, size, and pending-state recovery",
                      "credentialed business-card upload with localized OCR-unconfigured failure",
                      "hard-navigation proof of zero persisted candidate or draft",
                      "zero new browser console warnings or errors",
                      "production-build actor-scoped live external-source read",
                      "browser zero-candidate source truthfulness check",
                      "browser source-filter selection with disabled import",
                      "zero provider sync, file parse, candidate staging, or contact write",
                    ]
                  : hasLiveMobilePermissionRuntimeEvidence
                    ? [
                        "Expo Web signed-out permission privacy boundary and login return route",
                        "credentialed explicit-origin CORS preflight returned data-free 204",
                        "empty-account calendar review wrote one actor-scoped pending row",
                        "hard-navigation and sign-out/re-login persistence readback",
                        "two-account permission isolation and stable repeated upsert",
                      ]
                    : hasLiveMobileAuthRuntimeEvidence
                      ? [
                          "Expo Web signed-out profile/account privacy boundary",
                          "live credentials sign-in with browser-managed HttpOnly session",
                          "actor-owned profile/account readback and hard-navigation restore",
                          "truthful missing-profile-field presentation",
                          "server cookie invalidation and protected hard-navigation after sign-out",
                        ]
                      : liveMobileAdditionalRuntimeEvidence
                        ? liveMobileAdditionalRuntimeEvidence.runtimeEvidence
                        : liveWebAdditionalRuntimeEvidence
                          ? [
                              ...liveWebAdditionalRuntimeEvidence.runtimeEvidence,
                              ...(hasBrowserSmokeEvidence
                                ? [
                                    "production-build transport smoke",
                                    "in-app browser base-state at 1440x900",
                                    "in-app browser base-state at 390x844",
                                    "browser console warning/error check",
                                  ]
                                : []),
                            ]
                          : hasBrowserSmokeEvidence
                            ? [
                                "production-build transport smoke",
                                "in-app browser base-state at 1440x900",
                                "in-app browser base-state at 390x844",
                                "browser console warning/error check",
                              ]
                            : [],
      verificationConclusion:
        surfaceId === "web:/dev/capabilities/[slug]"
          ? "runtime-partially-verified-six-ids"
          : hasLiveProfileRuntimeEvidence
            ? "runtime-partially-verified-web-profile-complete-lifecycle"
            : hasLiveEventRegistrationRuntimeEvidence
              ? "runtime-partially-verified-live-event-registration"
              : hasLiveBusinessCardRestrictedRuntimeEvidence
                ? "runtime-partially-verified-external-capability-restricted"
                : hasLiveContactsListRuntimeEvidence
                  ? "runtime-partially-verified-live-contact-list"
                  : hasLiveContactDetailRuntimeEvidence
                    ? "runtime-partially-verified-live-contact-detail"
                    : hasLiveMobileContactAcquisitionRuntimeEvidence
                      ? "runtime-partially-verified-expo-contact-acquisition-live-boundaries"
                      : hasLiveMobilePermissionRuntimeEvidence
                        ? "runtime-partially-verified-expo-web-permission-persistence"
                        : hasLiveMobileAuthRuntimeEvidence
                          ? "runtime-partially-verified-expo-web-auth-profile-account"
                          : liveMobileAdditionalRuntimeEvidence
                            ? liveMobileAdditionalRuntimeEvidence.verificationConclusion
                            : liveWebAdditionalRuntimeEvidence
                              ? liveWebAdditionalRuntimeEvidence.verificationConclusion
                              : hasBrowserSmokeEvidence
                                ? "runtime-partially-verified-browser-base-state"
                                : "inventory-complete-runtime-verification-pending",
    };
    surface.testEvidence = testEvidenceForSurface(
      surface,
      testsByClient[entry.client],
    );
    return surface;
  });

  const interactions = surfaces.flatMap((surface) => surface.interactions);
  const overlays = surfaces.flatMap((surface) => surface.overlays);
  const metadata = stableGitMetadata();
  return {
    schemaVersion: 1,
    generatedFromCommit: metadata.commit,
    deterministicSourceTime: metadata.commitTime,
    sourceState: metadata.sourceState,
    uncommittedAuthoritativeInputChanges:
      metadata.uncommittedAuthoritativeInputChanges,
    scope:
      "All Next.js pages including development routes and all Expo Router route files; API handlers are downstream dependencies, not user surfaces.",
    evidenceSemantics:
      "Static inventory proves reachability and source evidence only. Runtime, persistence, identity, external effects, and user-visible outcomes remain failed-open only as explicit pending verification, never as pass.",
    authoritativeInputs: {
      webAppRoot: relativeToWorkspace(WEB_APP_ROOT),
      mobileAppRoot: relativeToWorkspace(MOBILE_APP_ROOT),
      webPrivatePrefixes: privateWebPrefixes,
      webPublicPathExceptions: publicWebPathExceptions,
    },
    summary: {
      routeSurfaces: surfaces.length,
      webRoutes: surfaces.filter((surface) => surface.client === "web").length,
      mobileRoutes: surfaces.filter((surface) => surface.client === "mobile")
        .length,
      productionRoutes: surfaces.filter(
        (surface) => surface.environment === "production",
      ).length,
      developmentRoutes: surfaces.filter(
        (surface) => surface.environment === "development",
      ).length,
      dynamicRoutes: surfaces.filter(
        (surface) => surface.routeKind === "dynamic",
      ).length,
      overlayImplementations: overlayImplementations.size,
      overlayRouteInstances: overlays.length,
      interactionRouteInstances: interactions.length,
      uniqueInteractionSourceLocations: new Set(
        interactions.map(
          (interaction) => `${interaction.sourceFile}:${interaction.line}`,
        ),
      ).size,
      normalizedStaticBehaviorImplementations: new Set(
        interactions.map((interaction) =>
          [
            interaction.sourceFile,
            interaction.controlType,
            interaction.tag,
            JSON.stringify(interaction.handlers),
            interaction.href ?? "",
          ].join("|"),
        ),
      ).size,
      renderedLeafControls: null,
      renderedLeafControlStatus:
        "unresolved-runtime-denominator; route instances, source locations, and normalized static implementations are not runtime leaf counts",
      renderedLeafObservedOccurrences:
        RENDERED_LEAF_OBSERVATIONS.leafControlOccurrences,
      renderedLeafObservedStates: RENDERED_LEAF_OBSERVATIONS.renderedStates,
      renderedLeafObservedUniqueStateKeys:
        RENDERED_LEAF_OBSERVATIONS.uniqueStateKeys,
      interactionsRuntimeVerified: interactions.filter(
        (interaction) => interaction.actualResult !== "not-runtime-verified",
      ).length,
      surfacesRuntimeVerified: surfaces.filter(
        (surface) => surface.verificationConclusion === "runtime-verified",
      ).length,
      surfacesWithRuntimeEvidence: surfaces.filter((surface) =>
        surface.verificationConclusion.startsWith("runtime-"),
      ).length,
      candidateMissingHandlers: interactions.filter(
        (interaction) => interaction.conclusion === "candidate-missing-handler",
      ).length,
      accessibleNameCandidates: interactions.filter(
        (interaction) =>
          interaction.accessibleNameEvidence === "missing-static",
      ).length,
      documentedVerificationCases: VERIFIED_AUDIT_CASES.length,
      documentedRemediations: AUDIT_REMEDIATIONS.length,
      externalLimitations: AUDIT_EXTERNAL_LIMITATIONS.length,
      remainingAuditGaps: AUDIT_REMAINING_GAPS.length,
    },
    surfaces,
    overlayImplementations: [...overlayImplementations.values()].sort(
      (left, right) =>
        left.implementationId.localeCompare(right.implementationId),
    ),
    verificationCases: VERIFIED_AUDIT_CASES,
    remediations: AUDIT_REMEDIATIONS,
    renderedLeafObservations: RENDERED_LEAF_OBSERVATIONS,
    externalLimitations: AUDIT_EXTERNAL_LIMITATIONS,
    remainingAuditGaps: AUDIT_REMAINING_GAPS,
  };
}

function markdownEscape(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replace(/\s+/gu, " ")
    .trim();
}

function renderReadme(inventory) {
  const { summary } = inventory;
  return [
    "# Orbit 全产品功能审计",
    "",
    `- 源码基线：\`${inventory.generatedFromCommit}\``,
    `- 源码状态：${inventory.sourceState}；未提交权威输入改动：${inventory.uncommittedAuthoritativeInputChanges ?? "不可用"}`,
    `- Web 路由：${summary.webRoutes}（生产 ${summary.productionRoutes - summary.mobileRoutes}，开发 ${summary.developmentRoutes}）`,
    `- Expo 路由：${summary.mobileRoutes}`,
    `- 路由界面分母：${summary.routeSurfaces}`,
    `- 渲染叶子控件观测：${summary.renderedLeafObservedOccurrences} 次 / ${summary.renderedLeafObservedStates} 个显式状态 / ${summary.renderedLeafObservedUniqueStateKeys} 个状态键（仅状态局部观测，最终分母仍未冻结）`,
    `- 弹层实现分母：${summary.overlayImplementations}；按路由可达实例：${summary.overlayRouteInstances}`,
    `- 交互控件按路由可达实例分母：${summary.interactionRouteInstances}`,
    `- 唯一交互源码位置分母：${summary.uniqueInteractionSourceLocations}`,
    `- 归一化静态行为实现分母：${summary.normalizedStaticBehaviorImplementations}`,
    `- 真实渲染叶子控件分母：未解决（不得用上述三个静态分母替代）`,
    `- 已完成运行时界面验证：${summary.surfacesRuntimeVerified}/${summary.routeSurfaces}`,
    `- 已有部分运行时证据但尚未全状态关闭的界面：${summary.surfacesWithRuntimeEvidence}`,
    `- 已完成运行时交互验证：${summary.interactionsRuntimeVerified}/${summary.interactionRouteInstances}`,
    `- 已登记验证案例：${summary.documentedVerificationCases}`,
    `- 已登记修复闭环：${summary.documentedRemediations}`,
    `- 外部环境限制：${summary.externalLimitations}`,
    `- 仍待补齐的审计缺口组：${summary.remainingAuditGaps}`,
    "",
    "## 范围与方法",
    "",
    inventory.scope,
    "",
    "清单由 Next.js `page.tsx/page.ts` 路由树、Expo Router `app` 路由树、每个入口的本地传递依赖、JSX 控件、回调属性、弹层、可见文案、查询参数信号、跳转信号、数据源信号和测试源码交叉生成。动态 ID 的真实取值、查询参数、hash、角色、数据规模、持久化回读和最终用户内容必须继续用运行时证据关闭。",
    "",
    "## 当前结论",
    "",
    "这是可追踪分母的第一版，不是完成声明。`inventory.json` 中的 `not-runtime-verified` 明确表示尚无足够证据；静态存在、测试文件命中、HTTP 200 或 schema 正确均不会自动变成通过。",
    "",
    "## 仍待补齐的审计缺口",
    "",
    ...inventory.remainingAuditGaps.map(
      (item) =>
        `- \`${item.id}\`（${item.scope}，${item.status}）：${item.reason}`,
    ),
    "",
    "## 外部环境限制",
    "",
    ...inventory.externalLimitations.map(
      (item) => `- \`${item.id}\`（${item.scope}）：${item.reason}`,
    ),
    "",
    "## 当前静态候选",
    "",
    `- 无静态行为证据的控件：${summary.candidateMissingHandlers}`,
    `- 无静态可访问名称证据的控件：${summary.accessibleNameCandidates}`,
    "- 这些只是候选，必须结合渲染 DOM/原生树和真实点击结果确认，不能把静态误报当成已证实缺陷。",
    "",
    "## 可复现命令",
    "",
    "```bash",
    "cd repos/orbits",
    "node scripts/generate-full-product-functional-audit.mjs",
    "node --test --import tsx tests/audits/full-product-functional-audit.test.ts",
    "node --test --import tsx tests/audits/web-route-transport.test.ts",
    "npm run build",
    "npx next start -p 3110",
    "# 在另一个终端运行：",
    "ORBIT_AUDIT_BASE_URL=http://127.0.0.1:3110 npm run audit:web-transport",
    "```",
  ].join("\n");
}

function renderSurfaces(inventory) {
  const lines = [
    "# 界面清单",
    "",
    "每一行是一个路由界面；弹层采用独立实现分母并记录每个父路由可达实例。完整文案、字段、状态、数据源、跳转和无障碍字段见 `inventory.json`。",
    "",
    "| ID | 客户端 | 环境 | 路由 | 父界面 | 动态参数 | 可达弹层 | 控件 | 测试源码命中 | 运行时结论 |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const surface of inventory.surfaces) {
    lines.push(
      `| \`${markdownEscape(surface.surfaceId)}\` | ${surface.client} | ${surface.environment} | \`${markdownEscape(surface.route)}\` | ${surface.parentSurfaceId ? `\`${markdownEscape(surface.parentSurfaceId)}\`` : "—"} | ${markdownEscape(surface.pathParameters.join(", "))} | ${surface.overlays.length} | ${surface.interactions.length} | ${surface.testEvidence.length} | ${surface.verificationConclusion} |`,
    );
  }
  lines.push(
    "",
    "## 弹层实现",
    "",
    "| 实现 ID | 类型 | 名称 | 源码 | 运行时结论 |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const overlay of inventory.overlayImplementations) {
    lines.push(
      `| \`${markdownEscape(overlay.implementationId)}\` | ${markdownEscape(overlay.kind)} | ${markdownEscape(overlay.visibleName)} | \`${overlay.sourceFile}:${overlay.line}\` | ${overlay.runtimeStatus} |`,
    );
  }
  return lines.join("\n");
}

function renderInteractions(inventory) {
  const lines = [
    "# 交互矩阵",
    "",
    `当前分母为 ${inventory.summary.interactionRouteInstances} 个按路由可达的控件实例。每项的 handler 表达式、调用提示、禁用条件、确认、幂等、loading/success/error、实际结果、测试数据与证据保存在 \`inventory.json\`。`,
    "",
    "| 交互 ID | 界面 | 名称 | 类型 | 事件 / 目标 | 读写 | 实际结果 | 结论 | 源码 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const surface of inventory.surfaces) {
    for (const interaction of surface.interactions) {
      const target =
        interaction.href ??
        interaction.handlers.map((handler) => handler.event).join(", ") ??
        "—";
      lines.push(
        `| \`${markdownEscape(interaction.interactionId)}\` | \`${markdownEscape(surface.surfaceId)}\` | ${markdownEscape(interaction.visibleName)} | ${interaction.controlType}/${interaction.tag} | ${markdownEscape(target)} | ${interaction.readWrite} | ${interaction.actualResult} | ${interaction.conclusion}${interaction.severity ? ` (${interaction.severity})` : ""} | \`${interaction.sourceFile}:${interaction.line}\` |`,
      );
    }
  }
  return lines.join("\n");
}

function renderVerification(inventory) {
  return [
    "# 验证记录",
    "",
    `运行时界面验证：${inventory.summary.surfacesRuntimeVerified}/${inventory.summary.routeSurfaces}。运行时交互验证：${inventory.summary.interactionsRuntimeVerified}/${inventory.summary.interactionRouteInstances}。另有 ${inventory.summary.renderedLeafObservedStates} 个显式渲染状态、${inventory.summary.renderedLeafObservedOccurrences} 次可见叶子控件观测；它们是状态局部证据，不是全产品叶子分母。`,
    "",
    "下列静态分母与渲染回归案例已经绑定当前源码。它们不会被计作运行时界面/交互通过；已有旧报告只作为定位线索，不自动继承为本审计的通过证据。后续运行时案例仍必须绑定当前 commit、真实入口、实际动态 ID、账户/角色/workspace、数据写入与刷新回读、最终 UI 文案和可复现命令。",
    "",
    "| 案例 ID | 界面 / 交互 | 测试数据 | 预期业务结果 | 实际最终 UI / 持久化结果 | 证据 | 结论 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.verificationCases.map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.target)} | ${markdownEscape(item.testData)} | ${markdownEscape(item.expected)} | ${markdownEscape(item.actual)} | ${markdownEscape(item.evidence)} | ${markdownEscape(item.conclusion)} |`,
    ),
  ].join("\n");
}

function renderRemediation(inventory) {
  return [
    "# 修复闭环",
    "",
    "本文件只登记已经有根因证据、设计决策、修改文件和回归结果的问题。静态候选在运行时确认前不冒充已证实缺陷。",
    "",
    "| 问题 ID | 等级 | 根因 | 设计决策 | 修改文件 | 回归证据 | 状态 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.remediations.map(
      (item) =>
        `| ${markdownEscape(item.id)} | ${markdownEscape(item.severity)} | ${markdownEscape(item.rootCause)} | ${markdownEscape(item.decision)} | ${markdownEscape(item.files)} | ${markdownEscape(item.regression)} | ${markdownEscape(item.status)} |`,
    ),
  ].join("\n");
}

export function writeFullProductFunctionalAudit(outputRoot = OUTPUT_ROOT) {
  const inventory = buildFullProductFunctionalAuditInventory();
  mkdirSync(outputRoot, { recursive: true });
  const files = {
    "README.md": renderReadme(inventory),
    "surfaces.md": renderSurfaces(inventory),
    "interaction-matrix.md": renderInteractions(inventory),
    "verification.md": renderVerification(inventory),
    "remediation.md": renderRemediation(inventory),
    "inventory.json": JSON.stringify(inventory, null, 2),
  };
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(path.join(outputRoot, name), `${value}\n`);
  }
  return inventory;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const inventory = writeFullProductFunctionalAudit();
  process.stdout.write(
    `Indexed ${inventory.summary.routeSurfaces} route surfaces, ${inventory.summary.overlayImplementations} overlay implementations, and ${inventory.summary.interactionRouteInstances} route-reachable interactions.\n`,
  );
}
