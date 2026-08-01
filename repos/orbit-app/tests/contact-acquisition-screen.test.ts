import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactAcquisitionScreen.tsx"),
  "utf8"
);

test("contact acquisition opens on business card capture", () => {
  assert.match(
    screenSource,
    /useState<ContactAcquisitionMode>\("businessCard"\)/u
  );
  assert.match(
    screenSource,
    /const modes:[\s\S]*mode: "businessCard"[\s\S]*mode: "qr"[\s\S]*mode: "manual"/u
  );
  assert.match(screenSource, /launchCameraAsync/u);
  assert.match(screenSource, /launchImageLibraryAsync/u);
});

test("contact acquisition can scan QR codes with the native camera", () => {
  assert.match(screenSource, /from "expo-camera"/u);
  assert.match(screenSource, /CameraView/u);
  assert.match(screenSource, /useCameraPermissions/u);
  assert.match(screenSource, /qrCameraOpen/u);
  assert.match(screenSource, /handleQrBarcodeScanned/u);
  assert.match(screenSource, /barcodeTypes:\s*\["qr"\]/u);
  assert.match(screenSource, /updateField\("qrText"/u);
  assert.match(screenSource, /扫 QR/u);
  assert.match(screenSource, /关闭扫描/u);
  assert.doesNotMatch(screenSource, /ORBIT_API_ENDPOINTS\.contacts/u);
});

test("QR camera permission waits are visible and invalidated by source changes", () => {
  assert.match(screenSource, /qrPermissionRequestIdRef/u);
  assert.match(screenSource, /qrPermissionPending/u);
  assert.match(screenSource, /等待相机权限/u);
  assert.match(
    screenSource,
    /requestId !== qrPermissionRequestIdRef\.current/u
  );
  assert.match(screenSource, /onPress=\{\(\) => selectMode\(item\.mode\)\}/u);
  assert.match(
    screenSource,
    /function selectMode[\s\S]*closeQrScanner\(\)[\s\S]*setMode\(nextMode\)/u
  );
});

test("source selectors expose their visual selection to assistive technology", () => {
  assert.match(
    screenSource,
    /accessibilityRole="tablist"[\s\S]*accessibilityRole="tab"[\s\S]*accessibilityState=\{\{ selected \}\}[\s\S]*aria-selected=\{selected\}/u
  );
  assert.match(
    screenSource,
    /function SourceChip[\s\S]*accessibilityRole="radio"[\s\S]*accessibilityState=\{\{ checked: active \}\}[\s\S]*aria-checked=\{active\}/u
  );
  assert.equal(
    screenSource.match(/accessibilityRole="radiogroup"/gu)?.length,
    2
  );
});

test("contact acquisition keeps QR scan overlay warning-free on current React Native", () => {
  assert.doesNotMatch(screenSource, /<View pointerEvents=/u);
  assert.match(screenSource, /qrScanFrame:[\s\S]*pointerEvents: "none"/u);
});

test("contact acquisition shows the saved draft queue from the web API", () => {
  assert.match(screenSource, /useApiResource<unknown>/u);
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.contactDrafts/u);
  assert.match(screenSource, /contactDraftQueueToView/u);
  assert.match(screenSource, /ContactDraftQueueCard/u);
  assert.match(screenSource, /"待确认候选"/u);
  assert.match(screenSource, /draftQueueState\.refresh\(\)/u);
});

test("contact acquisition shows duplicate merge suggestions from the web API", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.contactDraftMergeSuggestions/u);
  assert.match(screenSource, /contactMergeReviewToView/u);
  assert.match(screenSource, /ContactMergeReviewCard/u);
  assert.match(screenSource, /"重复检查"/u);
  assert.match(screenSource, /mergeReviewState\.refresh\(\)/u);
});

test("contact acquisition can stage external contacts as review-only drafts", () => {
  assert.match(screenSource, /ORBIT_API_ENDPOINTS\.contactDraftExternalCandidates/u);
  assert.match(screenSource, /contactExternalCandidatesToView/u);
  assert.match(screenSource, /ContactExternalCandidatesCard/u);
  assert.match(screenSource, /buildExternalContactsImportRequest/u);
  assert.match(screenSource, /contactExternalImportToView/u);
  assert.match(screenSource, /importExternalContacts/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*request\.request\.endpoint/u
  );
  assert.match(screenSource, /"外部导入"/u);
  assert.match(screenSource, /"导入为候选"/u);
  assert.doesNotMatch(screenSource, /读取真实通讯录|同步 Google/u);
});

test("generic confirmation synchronizes the matching external import result", () => {
  assert.match(
    screenSource,
    /setExternalImportResult\(\(current\) =>[\s\S]*current\.drafts\.map\(\(draft\) =>[\s\S]*draft\.draftId === confirmedSummary\.draftId[\s\S]*confirmedSummary[\s\S]*: draft/u
  );
});

test("contact acquisition can stage referral recommendations as review-only drafts", () => {
  assert.match(screenSource, /buildReferralRecommendationsRequest/u);
  assert.match(screenSource, /buildRecommendedContactConfirmRequest/u);
  assert.match(screenSource, /contactReferralRecommendationsToView/u);
  assert.match(screenSource, /recommendedContactConfirmationToView/u);
  assert.match(screenSource, /ReferralRecommendationsCard/u);
  assert.match(screenSource, /stageReferralRecommendations/u);
  assert.match(screenSource, /confirmReferralRecommendation/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*request\.request\.endpoint/u
  );
  assert.match(screenSource, /"朋友引荐"/u);
  assert.match(screenSource, /"生成引荐候选"/u);
  assert.match(screenSource, /"确认推荐"/u);
  assert.doesNotMatch(screenSource, /自动触达|已写入联系人|发送消息/u);
});

test("referral confirmation synchronizes local recommendation and draft state", () => {
  assert.match(
    screenSource,
    /setReferralResult\(\(current\) =>[\s\S]*draft\.recommendationId === recommendationId[\s\S]*"已确认候选"[\s\S]*recommendation\.id === recommendationId[\s\S]*confirmed: true/u
  );
  assert.match(
    screenSource,
    /setReferralResult\(\(current\) =>[\s\S]*draft\.draftId === confirmedSummary\.draftId/u
  );
  assert.match(screenSource, /"已确认推荐"/u);
});

test("business-card confirmation keeps the pending contact-write candidate", () => {
  assert.match(
    screenSource,
    /setResult\(\(current\) =>\s*keepBusinessCardWriteCandidate\(confirmedSummary, current\)\s*\)/u
  );
  assert.match(
    screenSource,
    /!next\.contactId && current\?\.contactId[\s\S]*contactId: current\.contactId/u
  );
});

test("business-card contact write synchronizes the result card terminal state", () => {
  assert.match(
    screenSource,
    /const writeView = businessCardContactWriteToView\(response\.data\);[\s\S]*setResult\(\(current\) => \{[\s\S]*writeView\.contactId[\s\S]*contactWrite: _writtenCandidate[\s\S]*contactId: writeView\.contactId/u
  );
});

test("referral source filter matches drafts by sourceKind, not a fixed label", () => {
  assert.match(
    screenSource,
    /view\?\.drafts\.filter\(\(draft\) => draft\.sourceKind === activeSource\)/u
  );
  assert.doesNotMatch(
    screenSource,
    /draft\.sourceLabel === "朋友引荐"/u
  );
});

test("contact acquisition can confirm duplicate merge previews through the web apply API", () => {
  assert.match(screenSource, /contactDraftMergeSuggestionApplyPath/u);
  assert.match(screenSource, /buildContactMergeApplyRequest/u);
  assert.match(screenSource, /contactMergeApplyToView/u);
  assert.match(
    screenSource,
    /client\.post<unknown>\(\s*request\.request\.endpoint/u
  );
  assert.match(screenSource, /ContactMergeApplyResultCard/u);
  assert.match(screenSource, /"确认合并预览"/u);
  assert.match(screenSource, /onApply/u);
  assert.doesNotMatch(screenSource, /合并成功|已写入联系人/u);
});

test("contact acquisition can review business card fields before confirmation", () => {
  assert.match(screenSource, /buildContactDraftReviewRequest/u);
  assert.match(screenSource, /contactDraftReviewFormFromSummary/u);
  assert.match(screenSource, /client\.patch<unknown>/u);
  assert.match(screenSource, /BusinessCardReviewFields/u);
  assert.match(screenSource, /"保存复核字段"/u);
});

test("contact acquisition can write reviewed business cards through the web contact writer", () => {
  assert.match(screenSource, /buildBusinessCardContactWriteRequest/u);
  assert.match(screenSource, /businessCardContactWriteToView/u);
  assert.match(screenSource, /writeBusinessCardContact/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*request\.request\.endpoint/u);
  assert.match(screenSource, /"写入联系人"/u);
  assert.match(screenSource, /ContactBusinessCardWriteResultCard/u);
});

test("contact acquisition sends the contacts list a refresh signal after final write", () => {
  assert.match(screenSource, /contactsRefreshToken/u);
  assert.match(screenSource, /Date\.now\(\)\.toString\(\)/u);
  assert.match(
    screenSource,
    /router\.push\(\{\s*pathname:\s*"\/contacts\/list",\s*params:\s*\{\s*refreshToken:/u
  );
  assert.match(screenSource, /onOpenContacts/u);
});

test("contact acquisition can open the written business card contact", () => {
  assert.match(
    screenSource,
    /router\.push\(\{\s*pathname:\s*"\/contacts\/\[id\]",\s*params:\s*\{\s*id:\s*contactId\s*\}/u
  );
  assert.match(screenSource, /onOpenContact/u);
  assert.match(screenSource, /view\.contactId/u);
  assert.match(screenSource, /view\.openContactLabel/u);
});

test("contact acquisition can open a contact written by manual confirmation", () => {
  assert.match(screenSource, /confirmedSummary\.contactId/u);
  assert.match(
    screenSource,
    /onPress=\{\(\) => onOpenContact\(result\.contactId!\)\}/u
  );
  assert.match(screenSource, />打开联系人</u);
});

test("contact acquisition can locally dismiss review candidates without claiming backend archive", () => {
  assert.match(screenSource, /dismissedDraftIds/u);
  assert.match(screenSource, /dismissDraft/u);
  assert.match(screenSource, /new Set\(current\)/u);
  assert.match(
    screenSource,
    /filter\(\s*\(draft\) =>\s*!dismissedDraftIds\.has\(draft\.draftId\)\s*\)/u
  );
  assert.match(screenSource, /暂不处理/u);
  assert.match(screenSource, /"本次先隐藏，刷新或重新生成后仍可复核。"/u);
  assert.doesNotMatch(screenSource, /已归档|已删除|后端归档/u);
});

test("contact acquisition can import attendees when opened with event context", () => {
  assert.match(screenSource, /useLocalSearchParams/u);
  assert.match(screenSource, /eventId/u);
  assert.match(screenSource, /buildEventAttendeeContactDraftImportRequest/u);
  assert.match(screenSource, /eventAttendeeContactDraftImportToView/u);
  assert.match(screenSource, /EventContextDraftImportCard/u);
  assert.match(screenSource, /importEventAttendeesAsDrafts/u);
  assert.match(
    screenSource,
    /ORBIT_API_ENDPOINTS\.contactDraftEventAttendeesImport/u
  );
  assert.match(screenSource, /"导入活动名单"/u);
  assert.match(screenSource, /"导入为待确认候选"/u);
});
