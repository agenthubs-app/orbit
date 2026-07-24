import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BusinessCardCaptureWorkspace,
  businessCardCaptureCanConfirm,
  businessCardCaptureReducer,
  initialBusinessCardCaptureState,
  type BusinessCardScanPayload,
} from "../../app/(app)/app/contacts/business-card-capture-workspace";

const SCAN_PAYLOAD: BusinessCardScanPayload = {
  capture: {
    imageDigest: `sha256:${"a".repeat(64)}`,
    imageName: "card.jpg",
  },
  draft: {
    displayName: "青空 太郎",
    email: "person@example.com",
    evidence: [{ evidenceId: "evidence:card:test" }],
    id: "business-card-review:cloud:test",
    organization: "架空技研株式会社",
    phone: "+81 90 0000 0000",
    relationshipContext: "Met at an Orbit event.",
    role: "室長",
  },
  ocr: {
    reviewIssues: [
      {
        code: "MULTIPLE_OFFICES",
        field: "addresses",
        message: "Confirm the primary office.",
      },
    ],
  },
  provenance: {
    model: "gemini-3.5-flash-lite",
    provider: "google-gemini-interactions",
  },
};

test("business card capture workspace exposes a primary private scan entry", () => {
  const html = renderToStaticMarkup(<BusinessCardCaptureWorkspace />);

  assert.match(html, /拍照扫描/);
  assert.match(html, /上传名片图片/);
  assert.match(html, /图片只用于本次云端识别/);
  assert.match(html, /image\/jpeg,image\/png,image\/webp/);
  assert.doesNotMatch(html, /邀请对方加入 Orbit/);
});

test("business card capture reducer gates contact confirmation and then reveals optional invitation", () => {
  const review = businessCardCaptureReducer(initialBusinessCardCaptureState, {
    payload: SCAN_PAYLOAD,
    previewUrl: "blob:card",
    type: "scan_succeeded",
  });

  assert.equal(review.kind, "review");
  assert.equal(businessCardCaptureCanConfirm(review), false);

  const acknowledged = businessCardCaptureReducer(review, {
    issueCode: "MULTIPLE_OFFICES",
    type: "acknowledge_issue",
  });
  const reviewed = businessCardCaptureReducer(acknowledged, {
    type: "mark_fields_reviewed",
    value: true,
  });

  assert.equal(businessCardCaptureCanConfirm(reviewed), true);

  const confirmed = businessCardCaptureReducer(reviewed, {
    contactId: "contact:business-card:test",
    type: "contact_confirmed",
  });

  assert.equal(confirmed.kind, "confirmed");

  if (confirmed.kind !== "confirmed") {
    return;
  }

  assert.equal(confirmed.inviteSelected, false);

  const invitationSelected = businessCardCaptureReducer(confirmed, {
    type: "select_invitation",
    value: true,
  });

  assert.equal(invitationSelected.kind, "confirmed");
  assert.equal(
    invitationSelected.kind === "confirmed"
      ? invitationSelected.inviteSelected
      : null,
    true,
  );
});
