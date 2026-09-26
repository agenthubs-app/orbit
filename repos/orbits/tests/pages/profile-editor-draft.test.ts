import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitProfileEditorView } from "../../app/(app)/app/profile/profile-editor-adapter";
import {
  clearProfileEditorDraft,
  readProfileEditorDraft,
  writeProfileEditorDraft,
} from "../../app/(app)/app/profile/profile-0918/profile-editor-draft";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

function profile(): OrbitProfileEditorView {
  return {
    bio: "draft bio",
    birthDate: "1990-01-01",
    company: "Draft Co",
    email: "owner@example.com",
    expectedUpdatedAt: "2026-09-26T00:00:00.000Z",
    fullName: "Draft Name",
    hasPersistedProfile: true,
    headline: "",
    industry: "",
    intro: "",
    lineId: "line-owner",
    offering: [],
    onboarding: { missingFields: [], policyVersion: 1, status: "complete" },
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    seeking: [],
    title: "Founder",
    topics: [],
    wechatName: "",
  };
}

test("profile editor draft survives a route remount but is isolated by account", () => {
  const sessionStorage = storage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage } });
  try {
    writeProfileEditorDraft({
      actorKey: "owner@example.com",
      dirtyFields: ["displayName", "organization", "handles"],
      dirtyHandleFields: ["lineId"],
      extractText: "姓名：Draft Name",
      method: "text",
      profile: profile(),
    });
    assert.equal(readProfileEditorDraft("owner@example.com")?.profile.fullName, "Draft Name");
    assert.equal(readProfileEditorDraft("other@example.com"), null);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("profile editor removes the session draft after all changes are saved", () => {
  const sessionStorage = storage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage } });
  try {
    writeProfileEditorDraft({
      actorKey: "owner@example.com",
      dirtyFields: ["displayName"],
      dirtyHandleFields: [],
      extractText: "",
      method: "manual",
      profile: profile(),
    });
    clearProfileEditorDraft();
    assert.equal(readProfileEditorDraft("owner@example.com"), null);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});
