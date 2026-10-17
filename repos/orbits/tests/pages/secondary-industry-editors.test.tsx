import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createLiveProfileService } from "../../features/profile/live-service";
import { profileServiceFactory } from "../../features/profile/service-factory";
import { loadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";

test("profile projection preserves stable industry IDs and legacy text, including missing IDs", async t => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId: "profile-page-projection" }) });
  const resolution = profileServiceFactory.create("mock");
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service }));
  await service.updateProfile({ displayName: "Projection owner", industry: "Legacy industry text", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }, { actorId: "profile-projection-owner" });
  const route = await loadAppProfileRouteViewModel({ id: "profile-projection-owner", displayName: "Projection owner" });
  assert.equal(route.state, "success");
  if (route.state !== "success") throw new Error("Missing profile route fixture");
  const mapped = profileRouteToOrbitProfileViewModel(route);
  assert.equal(Reflect.get(mapped.profile, "primaryIndustryId"), "technology_internet");
  assert.equal(Reflect.get(mapped.profile, "secondaryIndustryId"), "technology_internet.ai_data");
  assert.equal(mapped.profile.industry, "Legacy industry text");
  await service.updateProfile({ displayName: "Legacy owner", industry: "Legacy industry text" }, { actorId: "legacy-projection-owner" });
  const legacyRoute = await loadAppProfileRouteViewModel({ id: "legacy-projection-owner", displayName: "Legacy owner" });
  assert.equal(legacyRoute.state, "success");
  if (legacyRoute.state !== "success") throw new Error("Missing legacy profile route fixture");
  const legacy = profileRouteToOrbitProfileViewModel(legacyRoute);
  assert.equal(Reflect.get(legacy.profile, "primaryIndustryId"), undefined);
  assert.equal(Reflect.get(legacy.profile, "secondaryIndustryId"), undefined);
  assert.equal(legacy.profile.industry, "Legacy industry text");
});
