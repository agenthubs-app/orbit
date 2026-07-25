import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "ProfileScreen.tsx"),
  "utf8"
);

test("profile screen loads sourced profile update suggestions", () => {
  assert.match(screenSource, /profileUpdateSuggestions/u);
  assert.match(screenSource, /profileUpdateSuggestionsToView/u);
  assert.match(screenSource, /title="资料更新建议"/u);
});

test("profile screen can confirm profile update suggestions through the API", () => {
  const acceptSuggestionSlice = screenSource.slice(
    screenSource.indexOf("async function onAcceptSuggestion"),
    screenSource.indexOf("async function onExtractProfileDocument")
  );

  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /profileUpdateSuggestionAcceptPath/u);
  assert.match(screenSource, /\.post<unknown>\(/u);
  assert.match(screenSource, /onAcceptSuggestion/u);
  assert.match(screenSource, /确认建议/u);
  assert.match(screenSource, /profileAcceptedPatchToView/u);
  assert.match(screenSource, /applyProfileAcceptedPatchToDraft/u);
  assert.match(screenSource, /acceptedProfilePatch/u);
  assert.match(screenSource, /ProfileAcceptedPatchNotice/u);
  assert.match(screenSource, /view\.title/u);
  assert.match(screenSource, /view\.summary/u);
  assert.match(screenSource, /view\.fields\.map/u);
  assert.doesNotMatch(
    acceptSuggestionSlice,
    /\.put<unknown>\(\s*ORBIT_API_ENDPOINTS\.profile/u
  );
});

test("profile screen can save manual public profile edits through the API", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /profileSummaryToEditDraft/u);
  assert.match(screenSource, /buildProfileUpdateRequest/u);
  assert.match(screenSource, /\.put<unknown>\(\s*ORBIT_API_ENDPOINTS\.profile/u);
  assert.match(screenSource, /编辑对外资料/u);
  assert.match(screenSource, /保存资料/u);
});

test("profile screen can extract profile drafts from pasted card or resume text", () => {
  assert.match(screenSource, /buildProfileDocumentExtractionRequest/u);
  assert.match(screenSource, /profileDocumentExtractionToView/u);
  assert.match(screenSource, /onExtractProfileDocument/u);
  assert.match(screenSource, /\.post<unknown>\(\s*request\.endpoint/u);
  assert.match(screenSource, /补全资料/u);
  assert.match(screenSource, /提取名片/u);
  assert.match(screenSource, /提取简历/u);
  assert.match(screenSource, /提取结果只用于复核/u);
});

test("profile screen can choose profile document images for extraction review", () => {
  assert.match(screenSource, /expo-image-picker/u);
  assert.match(screenSource, /pickProfileDocumentImage/u);
  assert.match(screenSource, /ImagePicker\.launchImageLibraryAsync/u);
  assert.match(screenSource, /mediaTypes: \["images"\]/u);
  assert.match(screenSource, /fileName:[\s\S]*asset\.fileName/u);
  assert.match(screenSource, /mimeType:[\s\S]*asset\.mimeType/u);
  assert.match(screenSource, /选择名片图片/u);
  assert.match(screenSource, /选择简历图片/u);
});

test("profile screen can choose resume documents for extraction review", () => {
  assert.match(screenSource, /expo-document-picker/u);
  assert.match(screenSource, /pickProfileDocumentFile/u);
  assert.match(screenSource, /DocumentPicker\.getDocumentAsync/u);
  assert.match(screenSource, /application\/pdf/u);
  assert.match(
    screenSource,
    /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/u
  );
  assert.match(screenSource, /text\/plain/u);
  assert.match(screenSource, /fileName:[\s\S]*asset\.name/u);
  assert.match(screenSource, /mimeType:[\s\S]*asset\.mimeType/u);
  assert.match(screenSource, /选择简历文件/u);
});

test("profile screen can apply extracted fields to the manual editor before saving", () => {
  const extractionSlice = screenSource.slice(
    screenSource.indexOf("function ProfileDocumentExtractionCard"),
    screenSource.indexOf("function ProfileExtractionButton")
  );

  assert.match(screenSource, /applyProfileDocumentExtractionToDraft/u);
  assert.match(screenSource, /appliedProfileExtraction/u);
  assert.match(screenSource, /onApplyExtraction/u);
  assert.match(screenSource, /应用到编辑表单/u);
  assert.match(screenSource, /提取结果已放进编辑表单。检查后保存资料。/u);
  assert.match(screenSource, /ProfileDocumentExtractionResult/u);
  assert.match(screenSource, /ProfileManualEditCard/u);
  assert.doesNotMatch(
    extractionSlice,
    /\.put<unknown>\(\s*ORBIT_API_ENDPOINTS\.profile/u
  );
});

test("profile screen protects personal data behind a validated session", () => {
  assert.match(screenSource, /useOrbitAuthSession/u);
  assert.match(screenSource, /auth\.ready/u);
  assert.match(screenSource, /auth\.signedIn/u);
  assert.match(screenSource, /\/account\/login\?next=%2Fprofile/u);
});

test("profile signed-out gate gives a visible login action", () => {
  const signedOutSlice = screenSource.slice(
    screenSource.indexOf("auth.ready && !auth.signedIn"),
    screenSource.indexOf("auth.signedIn && state.kind === \"loading\"")
  );

  assert.match(signedOutSlice, /Pressable/u);
  assert.match(signedOutSlice, /accessibilityLabel="登录查看个人资料"/u);
  assert.match(signedOutSlice, /accessibilityRole="button"/u);
  assert.match(signedOutSlice, /登录查看个人资料/u);
  assert.match(
    signedOutSlice,
    /router\.push\("\/account\/login\?next=%2Fprofile" as Href\)/u
  );
});

test("profile signed-out state still previews the public Xiaoyu profile", () => {
  const signedOutSlice = screenSource.slice(
    screenSource.indexOf("auth.ready && !auth.signedIn"),
    screenSource.indexOf("auth.signedIn && state.kind === \"loading\"")
  );
  const editStart = screenSource.indexOf("function ProfileManualEditCard");

  assert.match(screenSource, /function SignedOutProfilePreview/u);
  assert.match(signedOutSlice, /<SignedOutProfilePreview/u);
  assert.match(screenSource, /profileToSummary\(null\)/u);
  assert.match(screenSource, /<OrbitBusinessCard profile=\{profile\} \/>/u);
  assert.match(screenSource, /title="公开资料预览"/u);
  assert.match(screenSource, /title="登录后编辑资料"/u);
  assert.ok(editStart > -1);
  assert.ok(
    signedOutSlice.indexOf("<SignedOutProfilePreview") <
      signedOutSlice.indexOf("登录查看个人资料"),
    "public profile preview should appear before the login action"
  );
  assert.doesNotMatch(signedOutSlice, /ProfileManualEditCard/u);
  assert.doesNotMatch(signedOutSlice, /ProfileUpdateSuggestionsCard/u);
});
