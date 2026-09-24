/**
 * 运营台 ops-0918 概览 / 匹配屏测试共用夹具：`GET /operations/admin` 工作区快照、fetch + window 桩、
 * react-test-renderer 挂载与文本提取。数据形状与 tests/pages/event-operations-admin-workspace.test.tsx 一致。
 */
import assert from "node:assert/strict";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpsConsole } from "../../app/(app)/app/events/ops-0918/ops-console";
import type { OpsConsoleTab } from "../../app/(app)/app/events/ops-0918/ops-model";

export const EVENT_ID = "event:ops-screen";
export const BASE = `/api/events/${encodeURIComponent(EVENT_ID)}/operations/admin`;
export const EVENT = {
  endsAt: "2026-10-01T12:00:00.000Z",
  id: EVENT_ID,
  startsAt: "2026-10-01T09:00:00.000Z",
  title: "屏级替换夹具活动",
};

export function configuration() {
  return {
    checkInOpensAt: "2026-10-01T08:00:00.000Z",
    eventEndsAt: EVENT.endsAt,
    eventId: EVENT_ID,
    eventStartsAt: EVENT.startsAt,
    maxAttemptsPerTask: 3,
    organizerActorId: "user:organizer",
    profileEditDeadlineAt: "2026-09-30T00:00:00.000Z",
    recommendationCount: 5,
    registrationCutoffAt: "2026-09-30T12:00:00.000Z",
    resultsAvailableAt: "2026-10-01T08:30:00.000Z",
    roundOneStartsAt: "2026-10-01T09:30:00.000Z",
    roundTwoStartsAt: "2026-10-01T10:30:00.000Z",
    shardSize: 8,
    tableSize: 4,
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

export function generation(status: string, id = "gen:0000000000000001", participants: string[] = ["p:a", "p:b"]) {
  return {
    generation: {
      aiRequestFingerprint: "fp",
      completedAt: status === "completed" || status === "published" ? "2026-09-21T02:00:00.000Z" : null,
      createdAt: "2026-09-21T01:00:00.000Z",
      errorCode: null,
      errorMessage: null,
      eventId: EVENT_ID,
      expectedTaskCount: 4,
      generationId: id,
      idempotencyKey: "idem",
      organizerActorId: "user:organizer",
      publishedAt: status === "published" ? "2026-09-21T03:00:00.000Z" : null,
      snapshot: { capturedAt: "2026-09-21T01:00:00.000Z", hash: "abcdef1234567890", participants: participants.map((participantId) => ({ participantId })) },
      status,
      updatedAt: "2026-09-21T01:00:00.000Z",
    },
    progress: { claimedTasks: 0, completedTasks: 4, failedTasks: 0, generationId: id, percent: 100, queuedTasks: 0, runningTasks: 0, status },
  };
}

export function participant(participantId: string, displayName: string, profileCompleteness: "complete" | "partial" | "minimal" = "complete") {
  return {
    actorId: `user:${participantId}`,
    company: "Orbit",
    displayName,
    energyStyle: null,
    evidenceIds: [],
    experienceHighlight: null,
    industry: "AI",
    languages: [],
    lateRegistration: false,
    needs: [],
    offers: [],
    participantId,
    profileCompleteness,
    role: "Founder",
  };
}

export function table(tableNumber: number, members: string[], theme = `话题 ${tableNumber}`) {
  return {
    icebreakers: ["破冰一", "破冰二", "破冰三"],
    memberPrompts: {},
    memberRationales: {},
    members: members.map((participantId, index) => ({ participantId, seat: `R1-T${tableNumber}-S${index + 1}` })),
    rationale: `桌 ${tableNumber} 的归因`,
    tableNumber,
    theme,
  };
}

export function publishedResult(overrides: Record<string, unknown> = {}) {
  return {
    directory: [participant("p:a", "Alice"), participant("p:b", "Bob"), participant("p:c", "Cai")],
    eventId: EVENT_ID,
    generationId: "gen:0000000000000001",
    graph: { edges: [], nodes: [] },
    grouping: {
      roundOne: [table(1, ["p:a", "p:b"]), table(2, ["p:c"])],
      roundTwo: [table(1, ["p:a", "p:c", "p:b"], "第二轮话题")],
    },
    profileEditDeadlineAt: "2026-09-30T00:00:00.000Z",
    publishedAt: "2026-09-21T03:00:00.000Z",
    recommendations: [],
    resultsAvailableAt: "2026-10-01T08:30:00.000Z",
    snapshotHash: "abcdef1234567890",
    ...overrides,
  };
}

export function workspace(overrides: Record<string, unknown> = {}) {
  return {
    checkIns: [{ actorId: "user:p:a", checkedInAt: "2026-10-01T09:01:00.000Z", eventId: EVENT_ID, evidenceId: "ev", participantId: "p:a" }],
    configuration: configuration(),
    contactRequests: [],
    eventId: EVENT_ID,
    generations: [],
    metrics: { acceptedContactRequests: 0, checkedIn: 1, contactRequests: 0, participantCount: 3, publishedGenerationId: null },
    participants: [participant("p:a", "Alice"), participant("p:b", "Bob", "partial"), participant("p:c", "Cai", "minimal")],
    publishedResult: null,
    ...overrides,
  };
}

export interface Observed {
  body: string | null;
  method: string;
  url: string;
}

export interface Harness {
  observed: Observed[];
  restore: () => void;
}

export function install(respond: (call: Observed) => Response | Promise<Response>): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const observed: Observed[] = [];
  globalThis.fetch = (async (url, init) => {
    const call = { body: typeof init?.body === "string" ? init.body : null, method: init?.method ?? "GET", url: String(url) };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { clearInterval() {}, location: { origin: "https://orbit.test" }, setInterval() { return 1; } },
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: undefined } });
  return {
    observed,
    restore() {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
      else Reflect.deleteProperty(globalThis, "navigator");
    },
  };
}

export async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

export function text(renderer: ReactTestRenderer): string {
  const walk = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(walk).join("");
    const tree = node as { children?: unknown[]; type?: string };
    if (tree.type === "style") return "";
    return (tree.children ?? []).map(walk).join("");
  };
  return walk(renderer.toJSON());
}

export function buttonsNamed(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.type === "button" && node.children.join("") === label);
}

export function buttonNamed(renderer: ReactTestRenderer, label: string) {
  const matches = buttonsNamed(renderer, label);
  assert.equal(matches.length, 1, `expected exactly one <button>${label}</button>, found ${matches.length}`);
  return matches[0];
}

export function linksNamed(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.type === "a" && node.children.join("") === label);
}

export async function mount(tab: OpsConsoleTab, canManageRoles = false): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OpsConsole canManageRoles={canManageRoles} event={EVENT} tab={tab} />);
    await flush();
  });
  return renderer;
}

export async function unmount(renderer: ReactTestRenderer | undefined): Promise<void> {
  if (!renderer) return;
  await act(async () => {
    renderer.unmount();
  });
}

/** 以 mock 工作区跑一个用例：挂载 → 断言 → 卸载 + 还原桩。 */
export async function withConsole(
  tab: OpsConsoleTab,
  data: ReturnType<typeof workspace>,
  run: (renderer: ReactTestRenderer, harness: Harness) => Promise<void> | void,
  options: { canManageRoles?: boolean; respond?: (call: Observed) => Response | null } = {},
): Promise<void> {
  const harness = install((call) => options.respond?.(call) ?? Response.json({ data, success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(tab, options.canManageRoles ?? false);
    await run(renderer, harness);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
}
