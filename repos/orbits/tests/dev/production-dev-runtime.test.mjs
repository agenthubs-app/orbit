/**
 * Production `next start` regression for `/dev/**`.
 *
 * Run after a production build:
 *   ORBIT_PRODUCTION_BASE_URL=http://127.0.0.1:3120 \
 *     node --test tests/dev/production-dev-runtime.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.ORBIT_PRODUCTION_BASE_URL?.replace(/\/$/u, "");
const registeredCapabilitySlugs = [
  "capability-debug-dashboard",
  "mock-account-session",
  "profile-onboarding-and-manual-profile-editor",
  "profile-document-extraction-mock",
  "profile-signal-review-queue",
  "permission-state-and-staged-authorization-mock",
  "sensitive-action-confirmation-guard",
  "contact-acquisition-draft-pipeline",
  "manual-contact-creation-mock",
  "business-card-scan-ocr-mock",
  "business-card-review-and-confirm-flow",
  "qr-scan-connect-mock",
  "event-attendee-import-mock",
  "event-crud-and-import-mock",
  "attendee-roster",
  "want-connect",
  "encounter-note",
  "goal-readiness",
  "external-contacts-import-mock",
  "email-and-calendar-relationship-signal-mock",
  "referral-and-recommended-contact-confirm-mock",
  "duplicate-detection-and-merge-mock",
  "contacts-list-search-and-filter-mock",
  "contact-detail-tag-and-status-mock",
  "connection-and-evidence-service-mock",
  "relationship-stage-and-profile-mock",
  "relationship-value-scoring-mock",
  "relationship-natural-search-mock",
  "event-recommendation-and-opening-line-mock",
  "event-value-recommendation-mock",
  "post-event-review",
  "followup-task-generation-mock",
  "message-draft-generator-mock",
  "reminder-schedule-and-notification-mock",
  "chat-conversation-and-message-mock",
  "chat-writing-assist-mock",
  "chat-summary-and-extraction-mock",
  "chat-privacy-controls-mock",
  "dashboard-aggregate-mock",
  "network-distribution-analytics-mock",
  "opportunity-reminder-analytics-mock",
  "agent-action-queue-mock",
  "agent-autonomy-settings-mock",
  "external-action-sandbox-mock",
  "source-consistency-and-provenance-audit",
  "app-bootstrap-mock-aggregator",
  "ai-provider-mock-and-provenance-boundary",
  "mock-data-mutation-reset-and-scenario-switcher",
  "app-scaffold",
];

const fixedDevPaths = [
  "/dev/agent-test-report",
  "/dev/capabilities",
  "/dev/foundation/domain",
  "/dev/foundation/mock-registry",
  "/dev/foundation/style",
  "/dev/knowledge",
  "/dev/orbit-ai/trace",
];

test(
  "production returns 404 for every assigned dev surface and dynamic slug",
  { skip: !baseUrl },
  async () => {
    assert.equal(registeredCapabilitySlugs.length, 49);

    const paths = [
      ...fixedDevPaths,
      ...registeredCapabilitySlugs.map(
        (slug) => `/dev/capabilities/${slug}`,
      ),
      "/dev/capabilities/__unknown_runtime_regression__",
    ];

    for (const path of paths) {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: "manual",
      });

      assert.equal(response.status, 404, `${path} must fail closed`);
    }
  },
);

test(
  "production keeps adjacent app and API authentication boundaries intact",
  { skip: !baseUrl },
  async () => {
    const appResponse = await fetch(`${baseUrl}/app/contacts`, {
      redirect: "manual",
    });
    assert.equal(appResponse.status, 307);
    assert.equal(
      appResponse.headers.get("location"),
      "/app/account/login?next=%2Fapp%2Fcontacts",
    );

    const apiResponse = await fetch(`${baseUrl}/api/contacts`, {
      redirect: "manual",
    });
    assert.equal(apiResponse.status, 401);
    assert.deepEqual(await apiResponse.json(), {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required for this Orbit API.",
      },
    });
  },
);
