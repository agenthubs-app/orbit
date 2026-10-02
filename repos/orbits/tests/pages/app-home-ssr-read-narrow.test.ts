/**
 * W0041：首页服务端复合读取收窄——联系人只读计数。
 *
 * - 首页（无搜索参数）不再组合联系人页模型：联系人列表服务的每次解析都不经过 `contacts-route-view-model`，
 *   首页计数服务每次首页读取恰好解析、调用 1 次；
 * - 首页 `stats.people`／`stats.inProgress` 来自计数服务；
 * - 失败形状不变：结构化失败映射为 route-state `[code, 第一条证据]`（无证据为 `evidence:unavailable`），
 *   服务解析失败与读取异常照旧让首页失败；live 下无 actor、存储未配置的结构化失败与旧页模型逐项相等，且 0 读取；
 * - 带联系人筛选参数时照旧走联系人页模型（与改前逐项相同）。
 *
 * mock module mode 为主，live 只在「未配置数据库」与注入的假 provider／reader 下跑，不连数据库。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  loadAppContactsRouteViewModel,
} from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import {
  loadAppHomeRouteViewModel,
  type AppHomeActor,
} from "../../app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import {
  createLiveHomeContactsSummaryService,
  createHomeContactsSummaryService,
  homeContactsListInput,
  homeContactsSummaryServiceFactory,
  type HomeContactsSummaryResult,
} from "../../features/contacts/home-contacts-summary";
import { createLiveContactsListSearchAndFilterService, type LiveContactsGraphProvider } from "../../features/contacts/live-service";
import { contactsListSearchAndFilterServiceFactory } from "../../features/contacts/service-factory";
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import { useUnconfiguredLiveDatabase } from "../support/unconfigured-live-database";

const actor: AppHomeActor = {
  displayName: "Narrow Owner",
  email: "owner@example.invalid",
  id: "account:w0041-owner",
  rawSubject: "subject:w0041-owner",
};
const noJourneys = { readCanonicalParticipantEventJourneys: async () => [] };
const PAGE_MODEL_MARKER = "contacts-route-view-model";

function useMode(t: TestContext, mode: "mock" | "live") {
  const previousModule = process.env.ORBIT_MODULE_MODE;
  const previousFeature = process.env.ORBIT_FEATURE_MODE;
  process.env.ORBIT_MODULE_MODE = mode;
  delete process.env.ORBIT_FEATURE_MODE;
  t.after(() => {
    if (previousModule === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = previousModule;
    if (previousFeature === undefined) delete process.env.ORBIT_FEATURE_MODE;
    else process.env.ORBIT_FEATURE_MODE = previousFeature;
  });
}

/** Records every contacts list resolution with the call stack, to tell the page model apart from the summary. */
function spyContactsList(t: TestContext) {
  const stacks: string[] = [];
  const create = contactsListSearchAndFilterServiceFactory.create;
  t.mock.method(contactsListSearchAndFilterServiceFactory, "create", (mode?: string) => {
    stacks.push(new Error().stack ?? "");
    return create.call(contactsListSearchAndFilterServiceFactory, mode);
  });
  return {
    pageModelResolutions: () => stacks.filter((stack) => stack.includes(PAGE_MODEL_MARKER)).length,
    resolutions: () => stacks.length,
  };
}

function stubSummary(t: TestContext, readSummary?: (actorId?: string | null) => Promise<HomeContactsSummaryResult>) {
  const calls = { creates: 0, reads: [] as Array<string | null | undefined> };
  const create = homeContactsSummaryServiceFactory.create;
  t.mock.method(homeContactsSummaryServiceFactory, "create", (mode?: string) => {
    calls.creates += 1;
    const resolution = create.call(homeContactsSummaryServiceFactory, mode);
    if (!resolution.success) return resolution;
    const service = resolution.service;
    return {
      ...resolution,
      service: {
        readSummary(actorId?: string | null) {
          calls.reads.push(actorId);
          return readSummary ? readSummary(actorId) : service.readSummary(actorId);
        },
      },
    };
  });
  return calls;
}

test("the detector sees the contacts page model when it is used", async (t) => {
  useMode(t, "mock");
  const spy = spyContactsList(t);
  await loadAppContactsRouteViewModel(undefined, actor.id);
  assert.equal(spy.pageModelResolutions(), 1);
});

test("SC-01/SC-04 Home reads contacts through the summary service once and never composes the contacts page model", async (t) => {
  useMode(t, "mock");
  const spy = spyContactsList(t);
  const summary = stubSummary(t);
  const result = await loadAppHomeRouteViewModel(undefined, actor, noJourneys);
  assert.equal(result.state, "success");
  assert.equal(summary.creates, 1);
  assert.deepEqual(summary.reads, [actor.id]);
  assert.equal(spy.pageModelResolutions(), 0, "no contacts page model composition");
  assert.equal(spy.resolutions(), 1, "the summary resolves the same contacts list service once (mock data)");
});

test("SC-02 Home stats come from the summary counts", async (t) => {
  useMode(t, "mock");
  stubSummary(t, async () => ({ inProgress: 3, knownPeople: 7, success: true }));
  const result = await loadAppHomeRouteViewModel(undefined, actor, noJourneys);
  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.home.stats.people, 7);
  assert.equal(result.home.stats.inProgress, 3);
});

test("SC-02 a structured summary failure becomes the contacts route-state with [code, first evidence]", async (t) => {
  useMode(t, "mock");
  let evidenceIds: readonly string[] = ["evidence:first", "evidence:second"];
  stubSummary(t, async () => ({ error: { code: "CONTACTS_TEST_FAILURE", evidenceIds }, success: false }));
  const first = await loadAppHomeRouteViewModel(undefined, actor, noJourneys);
  assert.equal(first.state, "route-state");
  if (first.state !== "route-state") return;
  assert.equal(first.routeState.source, "contacts");
  assert.deepEqual(first.routeState.evidenceIds, ["CONTACTS_TEST_FAILURE", "evidence:first"]);
  assert.deepEqual(first.routeState.recoveryActions, [
    { href: "/app/home", label: "Reload Home" },
    { href: "/app/contacts", label: "Open Contacts" },
  ]);
  assert.equal(first.routeState.copy.description, "Contacts source data is not available, so the personal home summary is paused.");
  evidenceIds = [];
  const second = await loadAppHomeRouteViewModel(undefined, actor, noJourneys);
  assert.equal(second.state, "route-state");
  if (second.state === "route-state") assert.deepEqual(second.routeState.evidenceIds, ["CONTACTS_TEST_FAILURE", "evidence:unavailable"]);
});

test("SC-02 summary resolution failure and read exceptions still fail Home (not wrapped into a route-state)", async (t) => {
  useMode(t, "mock");
  t.mock.method(homeContactsSummaryServiceFactory, "create", () => createNotImplementedFailure("contacts", "mock", ["live"]));
  await assert.rejects(loadAppHomeRouteViewModel(undefined, actor, noJourneys), /Mock service for capability "contacts" is not implemented/u);
  t.mock.restoreAll();
  const failure = new Error("CONTACT_DETAIL_AMBIGUOUS_CONNECTION");
  stubSummary(t, async () => { throw failure; });
  await assert.rejects(loadAppHomeRouteViewModel(undefined, actor, noJourneys), failure);
});

test("SC-02 live: no actor and an unconfigured store give the page model's structured failures, with zero reads", async (t) => {
  useMode(t, "live");
  useUnconfiguredLiveDatabase(t);
  for (const actorId of [actor.id, undefined, "   "]) {
    const old = await loadAppContactsRouteViewModel(undefined, actorId);
    assert.equal(old.state, "failure");
    const next = await createHomeContactsSummaryService().readSummary(actorId);
    assert.equal(next.success, false);
    if (old.state !== "failure" || next.success) continue;
    assert.deepEqual([next.error.code, next.error.evidenceIds[0] ?? "evidence:unavailable"], old.failure.evidenceIds, `unconfigured, actor ${actorId}`);
  }

  const providerCalls: string[] = [];
  const provider = new Proxy({ source: "fake", sourceLabel: "Fake" } as LiveContactsGraphProvider, {
    get(target, property) {
      if (property === "source" || property === "sourceLabel" || property === "then") return target[property as keyof LiveContactsGraphProvider];
      return (...args: unknown[]) => {
        providerCalls.push(String(property));
        throw new Error(`provider.${String(property)} must not be called (${args.length})`);
      };
    },
  });
  const readerCalls: string[] = [];
  const listService = createLiveContactsListSearchAndFilterService({ provider });
  const service = createLiveHomeContactsSummaryService({
    listService,
    reader: async (actorId) => {
      readerCalls.push(actorId);
      return { inProgress: 1, knownPeople: 2 };
    },
  });
  for (const actorId of [undefined, null, "", "   "]) {
    const old = await listService.listContacts(homeContactsListInput(actorId));
    const next = await service.readSummary(actorId);
    assert.equal(old.success, false);
    assert.equal(next.success, false);
    if (old.success || next.success) continue;
    assert.equal(next.error.code, old.error.code);
    assert.deepEqual(next.error.evidenceIds, old.error.evidenceIds);
  }
  assert.deepEqual(providerCalls, []);
  assert.deepEqual(readerCalls, []);
  assert.deepEqual(await service.readSummary("  account:a  "), { inProgress: 1, knownPeople: 2, success: true });
  assert.deepEqual(readerCalls, ["account:a"], "the reader receives the trimmed actor; the list service is not used");
  assert.deepEqual(providerCalls, []);
});

test("SC-02 contacts filter search params keep the page model path (unchanged output)", async (t) => {
  useMode(t, "mock");
  const spy = spyContactsList(t);
  const searchParams = { status: "archived" };
  const result = await loadAppHomeRouteViewModel(searchParams, actor, noJourneys);
  const page = await loadAppContactsRouteViewModel(searchParams, actor.id);
  assert.equal(result.state, "success");
  assert.equal(page.state, "success");
  if (result.state !== "success" || page.state !== "success") return;
  assert.equal(result.home.stats.people, page.payload.ledger.knownPeople);
  assert.equal(result.home.stats.inProgress, page.payload.contacts.filter((contact) => !/archived/i.test(contact.statusLabel)).length);
  assert.equal(spy.pageModelResolutions(), 2, "home and the direct call both used the page model");
});
