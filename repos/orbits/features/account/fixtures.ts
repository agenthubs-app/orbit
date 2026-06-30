/**
 * 账号会话相关 fixture。
 *
 * 这里提供登录态、登出态、pending sign-in 和失败 provenance。
 * mock account service 会直接返回这些 payload，用来稳定验证账号入口和会话 API。
 */
import type {
  AccountSessionPayload,
  AccountSessionProvenance,
} from "./contract";

export const ACCOUNT_SESSION_FIXTURE_SOURCE =
  "fixture:features/account/fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-24T09:00:00.000Z";

export const mockAccountSessionProvenance: AccountSessionProvenance = {
  source: ACCOUNT_SESSION_FIXTURE_SOURCE,
  sourceLabel: "Mock demo sign-in fixture",
  evidenceIds: [
    "evidence:demo-founder-profile",
    "evidence:manual-demo-sign-in",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-account-only",
};

export const mockAccountSessionFixture: AccountSessionPayload = {
  state: "success",
  session: {
    status: "signed-in",
    mockSessionId: "mock-session-demo-founder",
    signedInAt: "2026-06-24T09:05:00.000Z",
    signedOutAt: null,
    expiresAt: "2026-07-24T09:05:00.000Z",
  },
  account: {
    id: "acct_orbit_demo_founder",
    displayName: "Ari Lane",
    workspaceName: "Orbit Founder Relationship OS",
    role: "founder-operator",
    plan: "mock-pro",
  },
  user: {
    id: "user_ari_lane",
    displayName: "Ari Lane",
    loginLabel: "demo founder",
    timezone: "Asia/Tokyo",
  },
  profile: {
    headline: "Founder mapping event-grounded relationships",
    relationshipGoal:
      "Prioritize source-backed demo workspace follow-up with clear context.",
    homeMarket: "Tokyo",
    preferredFollowUpWindow: "48 hours",
  },
  provenance: mockAccountSessionProvenance,
  nextAction:
    "Review relationship context before Orbit suggests a follow-up action.",
};

export const mockSignedOutSessionFixture: AccountSessionPayload = {
  state: "empty",
  session: {
    status: "signed-out",
    mockSessionId: null,
    signedInAt: null,
    signedOutAt: "2026-06-24T10:30:00.000Z",
    expiresAt: null,
  },
  account: null,
  user: null,
  profile: null,
  provenance: {
    ...mockAccountSessionProvenance,
    sourceLabel: "Mock signed-out session rule",
    evidenceIds: ["evidence:manual-demo-sign-out"],
  },
  nextAction: "Use demo sign-in to restore the deterministic account fixture.",
};

export const mockPendingDemoSignInFixture: AccountSessionPayload = {
  state: "pending",
  session: {
    status: "pending",
    mockSessionId: "mock-session-pending-demo-sign-in",
    signedInAt: null,
    signedOutAt: null,
    expiresAt: null,
  },
  account: null,
  user: null,
  profile: null,
  provenance: {
    ...mockAccountSessionProvenance,
    sourceLabel: "Mock pending demo sign-in rule",
    evidenceIds: ["evidence:demo-sign-in-pending"],
  },
  nextAction:
    "Keep the user in the local pending state until the mock sign-in completes.",
};

export const mockAccountFailureProvenance: AccountSessionProvenance = {
  ...mockAccountSessionProvenance,
  sourceLabel: "Mock require-account guard rule",
  evidenceIds: ["evidence:account-required-guard"],
};
