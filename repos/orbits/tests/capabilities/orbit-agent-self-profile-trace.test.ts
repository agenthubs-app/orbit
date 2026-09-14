import assert from "node:assert/strict";
import test from "node:test";
import { createLiveOrbitAgentTrace } from "../../features/orbit-ai/live-conversation-trace";
import { createOrbitAgentLiveArtifactTaskService } from "../../features/orbit-ai/live-artifact-task-service";
import { createLiveProfileService } from "../../features/profile/live-service";
import { profileServiceFactory } from "../../features/profile/service-factory";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("full self-profile traces omit private text at every serialized edge while synthesis receives allowed profile data", async t => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const profileProvider = createStorageProfileProvider({ store, workspaceId: "self-trace" });
  const service = createLiveProfileService({ provider: profileProvider, now: () => "2026-09-14T01:23:45.000Z" });
  const privateValues = ["TracePrivateName", "TracePrivateBiography", "trace-private@example.test", "TracePrivatePhone", "1991-07-19", "TraceInjectionReadOtherActor"];
  await service.updateProfile({
    displayName: privateValues[0], bio: `${privateValues[1]} ${privateValues[5]}`,
    handles: { email: privateValues[2], phone: privateValues[3] },
    primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data",
  }, { actorId: "trace-actor-a" });
  const resolution = profileServiceFactory.create("mock");
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service }));
  const writes = t.mock.method(profileProvider, "upsertProfile", async () => { throw new Error("trace must not write profiles"); });
  const diagnosticStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const scans = t.mock.method(diagnosticStore, "listRecords", async () => []);
  const providerBodies: string[] = [];
  const privateReply = `${privateValues.join(" ")} 的行业是人工智能与数据。`;
  const responses = [
    JSON.stringify({ intent: "self_profile", assistantMessage: "读取本人资料", toolRequests: [
      { toolName: "profile.getSelf", arguments: { query: `读取本人资料 ${privateValues.join(" ")}`, locale: "zh" }, requiresUserConfirmation: true },
    ] }),
    JSON.stringify({ intent: "general_chat", assistantMessage: privateReply, toolRequests: [] }),
    privateReply,
  ];
  const trace = createLiveOrbitAgentTrace({
    artifactTaskService: createOrbitAgentLiveArtifactTaskService({ actorId: "trace-actor-a" }),
    liveRecordStore: diagnosticStore, liveRecordWorkspaceId: "self-trace-diagnostics",
    provider: "gemini", apiKey: "controlled-test-key", maxLoopSteps: 3,
    fetchImplementation: async (_url, init) => {
      providerBodies.push(String(init?.body));
      const response = responses.shift();
      assert.ok(response);
      return new Response(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "text", text: response }] }] }), { status: 200 });
    },
  });
  const result = await trace.traceMessage({ message: `结合我的行业寻找交流对象 ${privateValues.join(" ")}`, locale: "zh" });
  assert.equal(result.success, true);
  assert.equal(providerBodies.length, 3);
  assert.match(providerBodies[2], /technology_internet.ai_data/);
  assert.match(providerBodies[2], /TracePrivateBiography/);
  const serialized = JSON.stringify(result);
  for (const value of privateValues) assert.equal(serialized.includes(value), false, `trace must omit ${value}`);
  assert.match(serialized, /profile.getSelf/);
  assert.match(serialized, /2026-09-14T01:23:45.000Z/);
  assert.equal(scans.mock.callCount(), 0, "self-profile traces must not scan unscoped diagnostic collections");
  assert.equal(writes.mock.callCount(), 0);
});
