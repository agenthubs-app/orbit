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
  "/app/admin",
  "/app/admin/access",
  "/app/admin/events",
  "/app/events",
  "/app/events/[id]",
  "/app/login-admin",
  "/app/o/[slug]",
  "/app/platform",
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
const LIVE_EVENT_REGISTRATION_RUNTIME_SURFACE =
  "web:/app/events/[id]/register";
const LIVE_BUSINESS_CARD_RESTRICTED_RUNTIME_SURFACE =
  "web:/app/contacts/new";
const LIVE_CONTACTS_LIST_RUNTIME_SURFACE = "web:/app/contacts";
const LIVE_CONTACT_DETAIL_RUNTIME_SURFACE = "web:/app/contacts/[id]";
const LIVE_MOBILE_CONTACT_ACQUISITION_RUNTIME_SURFACE =
  "mobile:/contacts/new";
const LIVE_MOBILE_AUTH_RUNTIME_SURFACES = new Set([
  "mobile:/account",
  "mobile:/account/login",
  "mobile:/account/permissions",
  "mobile:/profile",
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
  ...[
    "mobile:/party",
    "mobile:/party/checkin",
    "mobile:/party/graph",
  ].map((surfaceId) => [
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
  ]),
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
      verificationCase:
        "expo-organizer-public-private-isolation-2026-07-29",
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
      verificationConclusion:
        "runtime-partially-verified-expo-live-schedule",
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
  ...[
    "mobile:/admin",
    "mobile:/admin/events",
    "mobile:/admin/access",
  ].map((surfaceId) => [
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
  ]),
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
      entryBehavior: "expo-web-relationship-workbench-navigation-entry-verified",
      runtimeEvidence: [
        "the overview rendered six distinct relationship destinations without loading a hidden fallback contact list",
        "the primary graph card navigated to /contacts/graph",
        "the destination preserved the actor-scoped zero-connection state",
      ],
      verificationCase:
        "expo-empty-relationship-surface-boundaries-2026-07-29",
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
      verificationCase:
        "expo-empty-relationship-surface-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-actor-scoped-empty-relationship-boundary",
    },
  ]),
  [
    "mobile:/contacts/list",
    {
      entryBehavior: "expo-web-empty-contact-list-and-suggestions-entry-verified",
      runtimeEvidence: [
        "all contact status counts remained zero and the list rendered 暂无联系人",
        "runtime first reproduced three fixed live search suggestions that claimed actor evidence despite a zero-result graph",
        "after repair the suggestion API returned an empty state and no evidence-backed recommendation card rendered",
        "generic search intent and industry filters remained available without claiming stored evidence",
      ],
      verificationCase:
        "expo-empty-relationship-surface-boundaries-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-expo-empty-contact-search-boundary",
    },
  ],
  ...[
    "mobile:/today",
    "mobile:/contacts/all-actions",
  ].map((surfaceId) => [
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
  ...[
    "mobile:/",
    "mobile:/home",
  ].map((surfaceId) => [
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
      verificationCase:
        "web-public-event-catalogue-query-isolation-2026-07-29",
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
        "result-learning deletion and integration connect, health, and disconnect actions remained absent because the actor had zero feedback records and all three providers were explicitly unconfigured",
      ],
      verificationCase: "web-settings-actor-scoped-lifecycle-2026-07-29",
      verificationConclusion:
        "runtime-partially-verified-web-settings-actor-scoped-lifecycle",
    },
  ],
]);
const LIVE_MOBILE_AUTH_INTERACTION_EVIDENCE = new Map([
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
    "repos/orbit-app/src/screens/profile/AccountAuthScreen.tsx:168",
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
      testData: "Signed-out Expo Web runtime after a first account had one pending calendar review",
      idempotency: "Navigation only; no permission record was read into the signed-out UI or written.",
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
    "repos/orbit-app/src/screens/contacts/ContactAcquisitionScreen.tsx#onpress:() => selectMode(item.mode)#{item.label}",
    {
      actualResult:
        "While the browser-owned camera permission request was still pending, switching from QR to 手动 invalidated that request, removed the waiting state, rendered no camera/video, and preserved the zero-draft state.",
      testData:
        "Authenticated Expo Web audit account with an unresolved browser camera permission prompt",
      idempotency:
        "Mode selection changed local UI state only; it performed no API call, scan, candidate staging, or persistent write.",
      verificationCase:
        "expo-qr-permission-pending-cancellation-2026-07-29",
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
      verificationCase:
        "expo-business-card-media-failure-closed-2026-07-29",
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
      verificationCase:
        "expo-qr-permission-pending-cancellation-2026-07-29",
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
      verificationCase:
        "expo-business-card-media-failure-closed-2026-07-29",
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
      verificationCase:
        "expo-business-card-media-failure-closed-2026-07-29",
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
      verificationCase:
        "expo-live-external-source-truthfulness-2026-07-29",
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
      testData:
        "Authenticated Expo Web audit actor with zero follow-up tasks",
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
      verificationCase:
        "expo-empty-relationship-surface-boundaries-2026-07-29",
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
      testData: "Direct authenticated Expo Web navigation to /register with no code",
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
      testData:
        "Read-only preview for event:live-record:20260729",
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
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:363",
      "Use memory changed from on to off, survived hard reload, then returned to on and survived the final reload.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:383",
      "Approved conversation learning changed from off to on, survived hard reload, then returned to off and survived the final reload.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:433",
      "Memory category changed from Preferences to Goals and returned to Preferences without creating a record.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:450",
      "Memory content accepted the clearly named temporary audit value used for create and reload verification.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:468",
      "Save memory created one manual actor-scoped record and cleared the composer only after the API returned it.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:535",
      "Edit memory category changed to Goals inside the editor; Cancel discarded that unsaved category.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:554",
      "Edit memory content accepted the revised audit value that later survived hard reload.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:574",
      "Save changes persisted the revised memory content and hard reload returned the same actor-scoped record.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:582",
      "Cancel closed the memory editor and discarded the unsaved category change.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:633",
      "Edit opened the selected temporary memory rather than another actor's record.",
    ],
    [
      "repos/orbits/app/(app)/app/settings/orbit-agent-memory-settings.tsx:641",
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
      testData: "Approved catalogue code EVT01 plus a nonexistent Chinese query",
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
      testData: "13 approved public events with 3 upcoming, 0 active, and 10 ended",
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
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#attendeeNames[0] ?? \"输入联系人姓名\"",
    {
      actualResult:
        "The contact field accepted Chinese multi-word and same-name queries and reset any prior selected or duplicate-review state on edit.",
      testData:
        "会后验证 唯一; 会后验证 同名; a nonexistent Chinese query",
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
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-post-event-followup-capture.tsx#{contact.displayName} {[contact.role, contact.organization] .filter(Boolean) .join(\" · \") || contact.id}",
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
      testData:
        "会后 follow-up note for the selected 关西商事 contact",
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
    "web:/app/events/[id]|repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx#t({ en: \"Back to previous page\", zh: \"返回上一页\" })",
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
    "web:/app/o/[slug]|repos/orbits/app/(app)/app/o/orbit-real-organizer-public.tsx#t({ en: \"Back to events\", zh: \"返回活动\" })",
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
      verificationCase:
        "web-public-organizer-unknown-slug-boundary-2026-07-29",
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
      verificationCase:
        "web-public-organizer-unknown-slug-boundary-2026-07-29",
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
      testData:
        "东京餐饮入境客增长会 · event_01 · 已结束 · 大阪 · 2026-02-15",
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
    "web:/app/home|repos/orbits/app/(app)/app/home/orbit-real-home.tsx:223",
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
    "web:/app/home/events|repos/orbits/app/(app)/app/home/orbit-real-home.tsx:238",
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
    "web:/app/home/events|repos/orbits/app/(app)/app/home/orbit-real-home.tsx:223",
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
    "web:/app/today|repos/orbits/app/(app)/app/today/orbit-today-time-spine.tsx:524",
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
      testData:
        "Authenticated actor-scoped empty relationship dashboard",
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
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:1287",
    {
      actualResult:
        "添加联系人 left the repaired picker and opened the fail-closed import hub.",
      testData:
        "Repaired introduction picker with zero source-backed contacts",
      idempotency:
        "Navigation only; no image was uploaded and no contact, introduction, draft, or external record was written.",
      verificationCase: "web-relationship-derived-zero-surfaces-2026-07-29",
    },
  ],
  [
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:1310",
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
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:1363",
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
    "web:/app/contacts/intros|repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:1368",
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
]);
const LIVE_CONTACTS_LIST_INTERACTION_EVIDENCE = new Map([
  [
    "repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:327",
    {
      actualResult:
        "Selecting the Kansai result opened its canonical source-backed dynamic detail instead of a failure boundary.",
      testData:
        "Account C; 林 美咲 at 关西质量协作实验室; contact:business-card:9395a193212602a291845769",
      idempotency: "Navigation only; no contact or relationship record was written.",
    },
  ],
  [
    "repos/orbits/app/(app)/app/contacts/orbit-real-contacts.tsx:527",
    {
      actualResult:
        "Searching 林 美咲 returned exactly two contacts and preserved their distinct Kansai and Tokyo organizations while excluding 王 伟.",
      testData:
        "Account C; three live business-card contacts including two same-name records",
      idempotency: "Client-side filtering only; the four persisted records remained unchanged.",
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
      idempotency: "Navigation only; no contact or relationship record was written.",
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
      707,
      {
        actualResult:
          "Selecting A/C showed the thinking state and advanced to a source-constrained adaptive next question.",
        testData: "Accounts B/C; 正在扩大规模 and 正在探索",
        idempotency: "single click advanced one transcript turn",
      },
    ],
    [
      755,
      {
        actualResult:
          "Submitting the custom-answer form advanced one turn without navigating away.",
        testData: "正在建设跨境供应链与产品质量验证体系",
        idempotency: "one submitted form produced one transcript turn",
      },
    ],
    [
      762,
      {
        actualResult:
          "The custom-answer field accepted a Chinese multi-word value that later persisted exactly.",
        testData: "正在建设跨境供应链与产品质量验证体系",
        idempotency: "field edit alone performed no persistent write",
      },
    ],
    [
      771,
      {
        actualResult:
          "Continue submitted the custom value, showed loading, and rendered the next question.",
        testData: "正在建设跨境供应链与产品质量验证体系",
        idempotency: "one click produced one transcript turn",
      },
    ],
    [
      777,
      {
        actualResult:
          "The custom-answer affordance revealed the editable field and enabled Continue only after non-empty input.",
        testData: "Accounts B/C, first interview question",
        idempotency: "UI-only reveal; no persistent write",
      },
    ],
    [
      809,
      {
        actualResult:
          "With the server offline, generation returned to the interview with Failed to fetch and wrote zero records; retry after restart saved one record before revealing the persona.",
        testData: "Account C; 正在探索; intentional next-start outage",
        idempotency: "failed attempt wrote zero rows; retry wrote one stable user/event record",
      },
    ],
    [
      902,
      {
        actualResult:
          "Cancel registration opened an alert dialog and performed no write until explicit confirmation.",
        testData: "Account B registered summary",
        idempotency: "opening and dismissing the dialog did not mutate the registration",
      },
    ],
    [
      974,
      {
        actualResult:
          "Register again returned the cancelled record to the interview; successful submission reactivated the same record ID.",
        testData: "Account B; 再次报名，寻找关西质量合作伙伴",
        idempotency: "reactivation reused the original registration and participant-profile IDs",
      },
    ],
    [
      1281,
      {
        actualResult:
          "Keep registration dismissed the alert dialog; the UI and Postgres record remained rsvped.",
        testData: "Account B registered summary",
        idempotency: "dismissal performed no persistent write",
      },
    ],
    [
      1293,
      {
        actualResult:
          "Confirm cancellation persisted status=cancelled, rendered the cancelled result, and survived full refresh; later reactivation reused the same row.",
        testData: "Account B event_signup_01 registration",
        idempotency: "one user/event record remained before and after cancel/reactivate",
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
    actual:
      "uv lock added pytest and uv run pytest -q completed 310/310 tests",
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
      "The server page must resolve the canonical authenticated actor before composing every Chat service; the actor's empty graph must stay empty; an arbitrary conversation query must not bypass list ownership; URL prompt handling must use the same actor",
    actual:
      "Runtime first rendered the deployment-wide conversation list, message bodies, relationship context, generated assist, summary, evidence count, and privacy status. After repair, the same account rendered No chat context is ready. Direct access to conversation_seed_069 returned Conversation not found and promised not to substitute another person's data. Reload returned to the unchanged empty state.",
    evidence:
      "Authenticated production browser before/after DOM, rejected legacy-ID direct navigation, and recovery-link traversal; Chat/Agent focused tests 21/21; Web lint and Next TypeScript; exact-origin production build",
    conclusion:
      "pass for the exercised empty actor graph, all four Chat service bundles, URL-selected legacy conversation denial, actor-aware prompt service composition, and recovery navigation; populated post-fix multi-account browser readback and prompt execution remain pending",
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
      "fixed; the canonical /app/events/[id]/register live interaction and persistence chain is now partially runtime-verified under AUDIT-P1-006",
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
    status:
      "fixed and runtime-verified for blank and named default greetings",
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
      "The shared event mapper treated Intl.DateTimeFormat(..., { day: \"2-digit\" }).format() as a locale-neutral day number. In zh-CN that call returns a localized token that already includes 日, while the map rail and selected-event card correctly add their own Chinese suffix. The boundary therefore produced 9月15日日 and 2月15日日 in every map date.",
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
];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
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
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
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
  for (const match of value.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/gu)) {
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
      const attributes = attributeMap(
        parent.openingElement.attributes,
        source,
      );
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
    ].map((match) =>
      match[0].startsWith("$(") ? `#${match[1]}` : match[1],
    );
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

function collectInteractions(filePath, client, selectorEvidence) {
  const { source, sourceText } = sourceFileFor(filePath);
  const interactions = [];
  const explicitLabels = new Map();

  function discoverLabels(node) {
    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(source).toLowerCase();
      if (tagName === "label") {
        const attributes = attributeMap(
          node.openingElement.attributes,
          source,
        );
        const target = attributes.get("htmlfor") ?? attributes.get("for");
        const text = childText(node, source);
        if (target && text) {
          explicitLabels.set(target, text);
        }
      }
    }
    ts.forEachChild(node, discoverLabels);
  }
  discoverLabels(source);

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
          controlType: kind,
          tag: parts.tagName,
          visibleName: label || null,
          accessibleNameEvidence,
          triggerCondition: "user-initiated; runtime preconditions not yet verified",
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
          confirmation:
            /confirm|alertdialog|dialog/i.test(sourceSlice)
              ? "present-static-signal"
              : "not-proven",
          idempotency: "not-runtime-verified",
          expectedLoading:
            /loading|pending|submitting|saving|uploading/i.test(sourceSlice)
              ? "present-static-signal"
              : "not-proven",
          expectedSuccess:
            /success|saved|sent|created|updated/i.test(sourceSlice)
              ? "present-static-signal"
              : "not-proven",
          expectedError:
            /error|failed|failure|retry/i.test(sourceSlice)
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

  visit(source);
  return interactions;
}

function collectVisibleContent(filePath) {
  const { source } = sourceFileFor(filePath);
  const content = [];

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

      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
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

  visit(source);
  return [
    ...new Map(
      content.map((item) => [
        `${item.sourceFile}:${item.line}:${item.tag}:${item.text}`,
        item,
      ]),
    ).values(),
  ];
}

function collectOverlays(filePath) {
  const { source } = sourceFileFor(filePath);
  const overlays = [];

  function record(node, kind, label) {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
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

  visit(source);
  return overlays;
}

function collectRouteParameterSignals(reachableFiles) {
  const queryParameters = new Set();
  const hashSignals = [];
  const deepLinkSignals = [];

  for (const filePath of reachableFiles) {
    const { source, sourceText } = sourceFileFor(filePath);
    for (const match of sourceText.matchAll(
      /(?:searchParams|get|readSearchParam|set)\s*\(\s*["']([A-Za-z0-9_-]+)["']/gu,
    )) {
      queryParameters.add(match[1]);
    }
    if (/location\.hash|\.hash\b|split\(\s*["']#["']/u.test(sourceText)) {
      hashSignals.push(relativeToWorkspace(filePath));
    }
    if (
      /Linking\.|useLocalSearchParams|redirect\(|router\.(?:push|replace)|<Redirect\b/u.test(
        sourceText,
      )
    ) {
      deepLinkSignals.push(relativeToWorkspace(filePath));
    }

    function visit(node) {
      if (
        ts.isTypeLiteralNode(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)
      ) {
        for (const member of node.members ?? []) {
          if (
            ts.isPropertySignature(member) &&
            member.name &&
            /SearchParams/u.test(node.parent?.getText(source).slice(0, 160) ?? "")
          ) {
            queryParameters.add(member.name.getText(source).replace(/['"]/gu, ""));
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
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
    offline: /offline|network unavailable|network request failed/iu.test(combined),
    unauthenticated: /unauthenticated|sign in|log in|未登录|登录/iu.test(combined),
    forbidden: /forbidden|permission denied|unauthori[sz]ed|无权限/iu.test(combined),
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

function accessForSurface(client, route, privateWebPrefixes) {
  if (client === "web") {
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
      policy: "public-at-web-boundary; page authorization requires verification",
    };
  }

  return {
    roles: ["anonymous", "authenticated-user", "role-requires-runtime-verification"],
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
  const root = client === "web" ? path.join(WEB_ROOT, "tests") : path.join(MOBILE_ROOT, "tests");
  return listFiles(root, (filePath) => /\.test\.(?:ts|tsx|js|jsx)$/u.test(filePath));
}

function testEvidenceForSurface(surface, testFiles) {
  const routeWithoutParameters = surface.route.replace(/\[[^/]+\]/gu, "");
  const routeSource = surface.pageFile;
  return testFiles
    .filter((testFile) => {
      const text = readFileSync(testFile, "utf8");
      return (
        text.includes(surface.route) ||
        (routeWithoutParameters.length > 2 && text.includes(routeWithoutParameters)) ||
        text.includes(routeSource)
      );
    })
    .map(relativeToWorkspace)
    .sort();
}

function stableGitMetadata() {
  try {
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim(),
      commitTime: execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim(),
    };
  } catch {
    return { commit: "unavailable", commitTime: "unavailable" };
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
    const selectorEvidence = collectImperativeSelectorEvidence(reachableFiles);
    const interactionMap = new Map();
    const contentMap = new Map();
    const overlayMap = new Map();

    for (const filePath of reachableFiles) {
      for (const interaction of collectInteractions(
        filePath,
        entry.client,
        selectorEvidence,
      )) {
        interactionMap.set(
          `${interaction.sourceFile}:${interaction.line}:${interaction.controlType}:${interaction.tag}`,
          interaction,
        );
      }
      for (const content of collectVisibleContent(filePath)) {
        contentMap.set(
          `${content.sourceFile}:${content.line}:${content.tag}:${content.text}`,
          content,
        );
      }
      for (const overlay of collectOverlays(filePath)) {
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
        const semanticInteractionEvidenceKey = `${interaction.sourceFile}#${interaction.visibleName}`;
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
                  ? LIVE_MOBILE_AUTH_INTERACTION_EVIDENCE.get(
                      `${interaction.sourceFile}:${interaction.line}`,
                    )
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
                      ? (LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE.get(
                          `${surfaceId}|${stableInteractionEvidenceKey}`,
                        ) ??
                        LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE.get(
                          `${surfaceId}|${semanticInteractionEvidenceKey}`,
                        ) ??
                        LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE.get(
                          `${surfaceId}|${interaction.sourceFile}:${interaction.line}`,
                        ))
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

        return {
          interactionId: `${surfaceId}#interaction-${index + 1}`,
          surfaceId,
          ...interaction,
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
      trigger: "reachable from route source; exact control requires runtime verification",
      enterExitBehavior: "not-runtime-verified",
      ...overlay,
    }));
    const pathParameters = [
      ...entry.route.matchAll(/\[([^\]]+)\]/gu),
    ].map((match) => match[1]);

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
      access: accessForSurface(entry.client, entry.route, privateWebPrefixes),
      prerequisites: "runtime data, session, role, and configuration require verification",
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
      exitBehavior:
        hasLiveProfileRuntimeEvidence
          ? "back-and-cancel-navigation-to-/app/home-verified"
          : hasLiveBusinessCardRestrictedRuntimeEvidence ||
        hasLiveContactDetailRuntimeEvidence
          ? "browser-return-to-contacts-verified"
          : "not-runtime-verified",
      nextSurfaces: [
        ...new Set(interactions.map((item) => item.href).filter(Boolean)),
      ].sort(),
      backCloseBehavior:
        hasLiveProfileRuntimeEvidence
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
      routeParameters: collectRouteParameterSignals(reachableFiles),
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
    scope:
      "All Next.js pages including development routes and all Expo Router route files; API handlers are downstream dependencies, not user surfaces.",
    evidenceSemantics:
      "Static inventory proves reachability and source evidence only. Runtime, persistence, identity, external effects, and user-visible outcomes remain failed-open only as explicit pending verification, never as pass.",
    authoritativeInputs: {
      webAppRoot: relativeToWorkspace(WEB_APP_ROOT),
      mobileAppRoot: relativeToWorkspace(MOBILE_APP_ROOT),
      webPrivatePrefixes: privateWebPrefixes,
    },
    summary: {
      routeSurfaces: surfaces.length,
      webRoutes: surfaces.filter((surface) => surface.client === "web").length,
      mobileRoutes: surfaces.filter((surface) => surface.client === "mobile").length,
      productionRoutes: surfaces.filter(
        (surface) => surface.environment === "production",
      ).length,
      developmentRoutes: surfaces.filter(
        (surface) => surface.environment === "development",
      ).length,
      dynamicRoutes: surfaces.filter((surface) => surface.routeKind === "dynamic")
        .length,
      overlayImplementations: overlayImplementations.size,
      overlayRouteInstances: overlays.length,
      interactionRouteInstances: interactions.length,
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
        (interaction) => interaction.accessibleNameEvidence === "missing-static",
      ).length,
      documentedVerificationCases: VERIFIED_AUDIT_CASES.length,
      documentedRemediations: AUDIT_REMEDIATIONS.length,
    },
    surfaces,
    overlayImplementations: [...overlayImplementations.values()].sort(
      (left, right) =>
        left.implementationId.localeCompare(right.implementationId),
    ),
    verificationCases: VERIFIED_AUDIT_CASES,
    remediations: AUDIT_REMEDIATIONS,
    externalLimitations: [],
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
    `- Web 路由：${summary.webRoutes}（生产 ${summary.productionRoutes - summary.mobileRoutes}，开发 ${summary.developmentRoutes}）`,
    `- Expo 路由：${summary.mobileRoutes}`,
    `- 路由界面分母：${summary.routeSurfaces}`,
    `- 弹层实现分母：${summary.overlayImplementations}；按路由可达实例：${summary.overlayRouteInstances}`,
    `- 交互控件按路由可达实例分母：${summary.interactionRouteInstances}`,
    `- 已完成运行时界面验证：${summary.surfacesRuntimeVerified}/${summary.routeSurfaces}`,
    `- 已有部分运行时证据但尚未全状态关闭的界面：${summary.surfacesWithRuntimeEvidence}`,
    `- 已完成运行时交互验证：${summary.interactionsRuntimeVerified}/${summary.interactionRouteInstances}`,
    `- 已登记验证案例：${summary.documentedVerificationCases}`,
    `- 已登记修复闭环：${summary.documentedRemediations}`,
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
    `运行时界面验证：${inventory.summary.surfacesRuntimeVerified}/${inventory.summary.routeSurfaces}。运行时交互验证：${inventory.summary.interactionsRuntimeVerified}/${inventory.summary.interactionRouteInstances}。`,
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
