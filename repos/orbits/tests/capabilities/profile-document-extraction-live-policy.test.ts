import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileDocumentExtractionService } from "../../features/profile/live-extraction-service";
import {
  createProfileDocumentExtractionService,
  resolveProfileDocumentExtractionService,
} from "../../features/profile/service-factory";

test("live profile text extraction returns review-only fields with source excerpts", () => {
  const service = createLiveProfileDocumentExtractionService({
    now: () => "2026-07-02T07:00:00.000Z",
  });

  const resume = service.extractResumeDraft({
    fileName: "operator-profile.txt",
    mimeType: "text/plain",
    text: [
      "姓名：林玫",
      "公司：港湾创投",
      "职位：投资合伙人",
      "市场：中国、日本",
      "关系目标：认识企业级 AI 创始人",
      "目标人脉：创始人、联合投资人",
      "联系方式：邮件、微信",
      "lin.mei@example.test",
    ].join("\n"),
  });
  const businessCard = service.extractBusinessCardDraft({
    fileName: "operator-card.png",
    mimeType: "image/png",
  });

  assert.equal(resume.success, true);
  assert.equal(resume.data.state, "success");
  assert.equal(resume.data.kind, "resume");
  assert.equal(resume.data.draft?.displayName, "林玫");
  assert.equal(resume.data.draft?.organization, "港湾创投");
  assert.equal(resume.data.draft?.role, "投资合伙人");
  assert.equal(resume.data.draft?.email, "lin.mei@example.test");
  assert.deepEqual(resume.data.draft?.targetRelationshipTypes, [
    "创始人",
    "联合投资人",
  ]);
  assert.deepEqual(resume.data.draft?.preferredIntroChannels, ["邮件", "微信"]);
  assert.ok((resume.data.draft?.evidence.length ?? 0) >= 7);
  assert.equal(
    resume.data.provenance.privacy,
    "live-profile-document-policy-only",
  );
  assert.equal(
    resume.data.provenance.extractionMethod,
    "rule-based-text-match",
  );
  assert.match(resume.data.nextAction, /review every extracted field/i);

  assert.equal(businessCard.success, true);
  assert.equal(businessCard.data.state, "empty");
  assert.equal(businessCard.data.kind, "business-card");
  assert.equal(businessCard.data.provenance.extractionMethod, "live-policy-no-op");
  assert.match(businessCard.data.nextAction, /contact import hub/i);
});

test("profile document extraction factory resolves live policy provider", () => {
  const resolution = resolveProfileDocumentExtractionService("live");
  const service = createProfileDocumentExtractionService("live");
  const resume = service.extractResumeDraft();

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
  assert.equal(resume.success, true);
  assert.equal(resume.data.provenance.extractionMethod, "live-policy-no-op");
});
