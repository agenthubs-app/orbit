import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  loadAppContactDetailRoute,
  localizeAppContactDetailBoundaryModel,
  type AppContactDetailBoundaryModel,
} from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { StateView } from "../../shared/ui/state-view";

const pageSource = readFileSync(
  new URL("../../app/(app)/app/contacts/[id]/page.tsx", import.meta.url),
  "utf8",
);

async function emptyBoundaryModel(): Promise<AppContactDetailBoundaryModel> {
  // 联系人不属于当前账号（正确隔离）时 route 进入 empty 边界。
  const routeModel = await loadAppContactDetailRoute({
    contactId: "someone-elses-contact",
    mode: "mock",
    scenario: "empty",
  });

  assert.notEqual(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    throw new Error("expected a boundary model");
  }

  return routeModel;
}

test("contact detail boundary model stays English by default and localizes to zh without bilingual concatenation", async () => {
  const model = await emptyBoundaryModel();

  assert.equal(model.routeState, "empty");
  assert.equal(model.title, "No contact detail is available");
  assert.equal(model.recoveryActions[0]?.label, "Return to contacts list");

  const zh = localizeAppContactDetailBoundaryModel(model, "zh");

  assert.equal(zh.routeState, "empty");
  assert.equal(zh.title, "暂无可用的联系人详情");
  assert.equal(
    zh.description,
    "请先选择一位已有来源证据的联系人，再查看标签、状态、关系背景或关系价值。",
  );
  assert.equal(zh.recoveryActions.length, model.recoveryActions.length);
  assert.equal(zh.recoveryActions[0]?.label, "返回人脉列表");
  assert.equal(
    zh.recoveryActions[0]?.recoveryCopy,
    "回到有来源的列表，选择一位已有证据的联系人。",
  );
  // hrefs and evidence ids are data hooks, not copy — they must survive.
  assert.equal(zh.recoveryActions[0]?.href, model.recoveryActions[0]?.href);
  assert.deepEqual(Array.from(zh.evidence), Array.from(model.evidence));

  for (const value of [zh.title, zh.description, zh.nextStep, zh.recoveryActions[0]!.label]) {
    assert.doesNotMatch(value, / \/ /);
    assert.doesNotMatch(value, /[A-Za-z]{3,}/, `zh copy leaked English: ${value}`);
  }

  assert.strictEqual(localizeAppContactDetailBoundaryModel(model, "en"), model);
});

test("contact detail boundary model carries ja copy and preserves retry hrefs for every route state", async () => {
  const failure = await loadAppContactDetailRoute({
    contactId: "some contact/with slash",
    mode: "mock",
    scenario: "failure",
  });

  if (failure.routeState !== "failure") {
    throw new Error(`expected a failure boundary, got ${failure.routeState}`);
  }

  for (const language of ["zh", "ja"] as const) {
    const localized = localizeAppContactDetailBoundaryModel(failure, language);

    assert.equal(localized.recoveryActions.length, failure.recoveryActions.length);
    localized.recoveryActions.forEach((action, index) => {
      assert.equal(action.href, failure.recoveryActions[index]?.href);
      assert.ok(action.label.trim());
      assert.ok(action.recoveryCopy.trim());
      assert.doesNotMatch(action.label, / \/ /);
    });
    assert.ok(localized.title.trim());
    assert.notEqual(localized.title, failure.title);
  }

  const ja = localizeAppContactDetailBoundaryModel(failure, "ja");
  assert.equal(ja.title, "連絡先の詳細を読み込めませんでした");
  assert.equal(ja.recoveryActions.at(-1)?.label, "人脈リストに戻る");
});

test("contact detail route-state view renders the localized model through a single-language StateView", async () => {
  const model = localizeAppContactDetailBoundaryModel(await emptyBoundaryModel(), "zh");
  const html = renderToStaticMarkup(
    React.createElement(StateView, {
      description: model.description,
      emptyState: model.description,
      evidence: Array.from(model.evidence),
      eyebrow: "联系人详情",
      guardrail:
        "此路由状态不会执行任何联系人详情、证据、关系价值、AI、消息、通知或外部提供方操作。",
      language: "zh",
      nextStep: model.nextStep,
      recoveryActions: model.recoveryActions.map((action, index) => ({
        href: action.href,
        id: `contact-detail-recovery-${index}`,
        label: action.label,
        recoveryCopy: action.recoveryCopy,
      })),
      title: model.title,
    }),
  );

  assert.match(html, /暂无可用的联系人详情/);
  assert.match(html, /<summary>来源详情<\/summary>/);
  assert.match(html, /aria-label="返回人脉列表"[^>]*href="\/app\/contacts"[^>]*>返回人脉列表<\/a>/);
  assert.match(html, /aria-label="State source details"/);
  assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, / \/ /);
  assert.doesNotMatch(html, /No contact detail is available|Return to contacts list|Why this matters|Source details/);
});

test("contact detail page passes the resolved UI language into the route-state boundary", () => {
  assert.match(pageSource, /localizeAppContactDetailBoundaryModel\(rawRouteModel, language\)/);
  assert.match(pageSource, /<ContactDetailRouteStateView language=\{language\} routeModel=\{routeModel\} \/>/);
  assert.match(pageSource, /language=\{language\}\s*\n\s*nextStep=\{routeModel\.nextStep\}/);
  assert.doesNotMatch(pageSource, /eyebrow="Contact detail"/);
  assert.doesNotMatch(pageSource, /guardrail="No contact detail/);
});
