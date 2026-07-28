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
const LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE = new Map([
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
        const runtimeEvidence = hasLiveEventRegistrationRuntimeEvidence
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
                      ? LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE.get(
                          `${surfaceId}|${interaction.sourceFile}:${interaction.line}`,
                        )
            : undefined;
        const runtimeVerificationCase =
          runtimeEvidence?.verificationCase ??
          (hasLiveEventRegistrationRuntimeEvidence
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
      entryBehavior: hasBrowserSmokeEvidence
        ? "browser-base-state-rendered-with-non-empty-content"
        : hasLiveProfileRuntimeEvidence
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
          : "not-runtime-verified",
      exitBehavior:
        hasLiveBusinessCardRestrictedRuntimeEvidence ||
        hasLiveContactDetailRuntimeEvidence
          ? "browser-return-to-contacts-verified"
          : "not-runtime-verified",
      nextSurfaces: [
        ...new Set(interactions.map((item) => item.href).filter(Boolean)),
      ].sort(),
      backCloseBehavior:
        hasLiveBusinessCardRestrictedRuntimeEvidence
          ? "restricted-state-return-link-navigated-to-/app/contacts"
          : hasLiveContactDetailRuntimeEvidence
            ? "detail-return-link-navigated-to-/app/contacts"
            : "not-runtime-verified",
      responsive: {
        desktop: hasBrowserSmokeEvidence
          ? "base-state-no-horizontal-overflow-at-1440x900"
          : entry.client === "web"
            ? "not-runtime-verified"
            : "not-applicable",
        tablet: "not-runtime-verified",
        mobile: hasBrowserSmokeEvidence
          ? "base-state-no-horizontal-overflow-at-390x844"
          : "not-runtime-verified",
      },
      accessibility: {
        keyboard: entry.client === "web" ? "not-runtime-verified" : "platform-native",
        screenReader: "not-runtime-verified",
        focusManagement: "not-runtime-verified",
      },
      routeParameters: collectRouteParameterSignals(reachableFiles),
      states: collectStateSignals(reachableFiles),
      interactions,
      overlays,
      testEvidence: [],
      runtimeEvidence: hasBrowserSmokeEvidence
        ? [
            "production-build transport smoke",
            "in-app browser base-state at 1440x900",
            "in-app browser base-state at 390x844",
            "browser console warning/error check",
          ]
        : hasLiveProfileRuntimeEvidence
          ? [
              "production-build credentials sign-up and sign-in",
              "live Postgres profile write and projected record ownership",
              "browser save response and full page refresh readback",
              "two-account isolation",
              "duplicate-signup and invalid-password failure paths",
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
            ? liveWebAdditionalRuntimeEvidence.runtimeEvidence
          : [],
      verificationConclusion:
        surfaceId === "web:/dev/capabilities/[slug]"
          ? "runtime-partially-verified-six-ids"
          : hasLiveProfileRuntimeEvidence
            ? "runtime-partially-verified-live-profile-persistence"
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

export function writeFullProductFunctionalAudit() {
  const inventory = buildFullProductFunctionalAuditInventory();
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const files = {
    "README.md": renderReadme(inventory),
    "surfaces.md": renderSurfaces(inventory),
    "interaction-matrix.md": renderInteractions(inventory),
    "verification.md": renderVerification(inventory),
    "remediation.md": renderRemediation(inventory),
    "inventory.json": JSON.stringify(inventory, null, 2),
  };
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(path.join(OUTPUT_ROOT, name), `${value}\n`);
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
