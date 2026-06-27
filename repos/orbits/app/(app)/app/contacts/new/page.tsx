/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  loadAppContactsNewRouteViewModel,
  type AppContactsNewRouteScenario,
  type AppContactsNewSearchParams,
} from "./compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services";

export const metadata = {
  title: bilingualText("联系人获取 | Orbit", "Contact acquisition | Orbit"),
  description: bilingualText(
    "在 Orbit 中组合有来源支撑的联系人获取、暂存权限和本地复核动作。",
    "Compose source-backed contact acquisition, staged permissions, and local review actions in Orbit.",
  ),
};

const appContactsNewStyles = `
.app-contacts-new-route {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
  overflow-x: clip;
}

.orbit-app-shell:has(.app-contacts-new-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-contacts-new-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-contacts-new-route) [aria-label="Account and next steps"] {
  display: none;
}

.orbit-app-shell:has(.app-contacts-new-route) [aria-label="Secondary demo recovery checks"] {
  display: none;
}

.orbit-app-shell:has(.app-contacts-new-route) [data-runtime-status="compact"] {
  display: none;
}

.app-contacts-new-route,
.app-contacts-new-route .workbench-surface,
.app-contacts-new-route .relationship-meta,
.app-contacts-new-route .chip-row,
.app-contacts-new-route .contacts-new-ledger,
.app-contacts-new-route .contacts-new-grid,
.app-contacts-new-route .contacts-new-method-grid,
.app-contacts-new-route .contacts-new-source-group,
.app-contacts-new-route .contacts-new-source-group-grid,
.app-contacts-new-route .contacts-new-source-grid,
.app-contacts-new-route .evidence-cluster {
  min-width: 0;
}

.app-contacts-new-route .relationship-name,
.app-contacts-new-route .type-body,
.app-contacts-new-route .type-caption,
.app-contacts-new-route .relationship-meta dd,
.app-contacts-new-route .orbit-chip,
.app-contacts-new-route .contacts-new-state-links a,
.app-contacts-new-route .contacts-new-action-result span,
.app-contacts-new-route .contacts-new-action-result strong,
.app-contacts-new-route .contacts-new-source-method button {
  overflow-wrap: anywhere;
}

.app-contacts-new-route .chip-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));
}

.app-contacts-new-route .orbit-chip {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
}

.app-contacts-new-route .contacts-new-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-contacts-new-route .contacts-new-ledger,
.app-contacts-new-route .contacts-new-grid,
.app-contacts-new-route .contacts-new-source-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-contacts-new-route .contacts-new-method-grid,
.app-contacts-new-route .contacts-new-source-group,
.app-contacts-new-route .contacts-new-source-group-grid {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-new-route .contacts-new-method-grid {
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
}

.app-contacts-new-route .contacts-new-source-group-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-contacts-new-route .contacts-new-source-group-header {
  display: grid;
  gap: 4px;
}

.app-contacts-new-route .contacts-new-ledger div,
.app-contacts-new-route .contacts-new-action-result,
.app-contacts-new-route .contacts-new-task,
.app-contacts-new-route .contacts-new-capability,
.app-contacts-new-route .contacts-new-source-method,
.app-contacts-new-route .contacts-new-secondary {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contacts-new-route .contacts-new-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-contacts-new-route .contacts-new-task,
.app-contacts-new-route .contacts-new-action-result,
.app-contacts-new-route .contacts-new-capability,
.app-contacts-new-route .contacts-new-source-method,
.app-contacts-new-route .contacts-new-secondary {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-new-route .contacts-new-current-candidate {
  border-color: var(--orbit-color-primary);
}

.app-contacts-new-route .contacts-new-current-candidate dl,
.app-contacts-new-route .contacts-new-source-method dl {
  display: grid;
  gap: 6px;
  margin: 0;
}

.app-contacts-new-route .contacts-new-current-candidate dl div,
.app-contacts-new-route .contacts-new-source-method dl div {
  display: grid;
  gap: 2px;
}

.app-contacts-new-route .contacts-new-current-candidate dt,
.app-contacts-new-route .contacts-new-source-method dt {
  color: var(--orbit-color-muted);
  font-size: 0.78rem;
  font-weight: 760;
  text-transform: uppercase;
}

.app-contacts-new-route .contacts-new-current-candidate dd,
.app-contacts-new-route .contacts-new-source-method dd {
  margin: 0;
}

.app-contacts-new-route .source-label-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
  min-width: 0;
}

.app-contacts-new-route .contacts-new-secondary summary {
  cursor: pointer;
  font-weight: 700;
}

.app-contacts-new-route .contacts-new-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-contacts-new-route .contacts-new-action-summary {
  display: grid;
  gap: 6px;
  margin: 0;
}

.app-contacts-new-route .contacts-new-action-summary div {
  display: grid;
  gap: 2px;
}

.app-contacts-new-route .contacts-new-action-summary dt {
  color: var(--orbit-color-muted);
  font-size: 0.78rem;
  font-weight: 760;
  text-transform: uppercase;
}

.app-contacts-new-route .contacts-new-action-summary dd {
  margin: 0;
}

.app-contacts-new-route .contacts-new-task button,
.app-contacts-new-route .contacts-new-source-method button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-primary-text);
  font-weight: 760;
  line-height: 1.25;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  white-space: normal;
}

.app-contacts-new-route .contacts-new-source-method button {
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border);
  color: var(--orbit-color-text);
}

.app-contacts-new-route .contacts-new-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-contacts-new-route .contacts-new-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  max-width: 100%;
  padding: 6px 10px;
  text-decoration: none;
}

.app-contacts-new-route .evidence-cluster {
  display: grid;
  gap: var(--orbit-space-xs);
}

.app-contacts-new-route .technical-provenance {
  color: var(--orbit-color-muted);
  font-size: 0.86rem;
}

.app-contacts-new-route .technical-provenance summary {
  cursor: pointer;
}

.app-contacts-new-route .technical-provenance ul {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding-left: var(--orbit-space-md);
}

.app-contacts-new-route .technical-provenance code {
  overflow-wrap: anywhere;
  white-space: normal;
}
`;

const capabilityLabels = [
  bilingualText("手动联系人", "Manual contact"),
  bilingualText("名片扫描", "Business card scan"),
  bilingualText("QR 扫描", "QR scan"),
  bilingualText("活动参会人导入", "Event attendee import"),
  bilingualText("外部联系人", "External contacts"),
  bilingualText("邮箱和日历信号", "Email and calendar signals"),
  bilingualText("推荐关系", "Referral recommendations"),
  bilingualText("合并建议", "Merge suggestions"),
] as const;

const routeStateChecks = [
  {
    href: "/app/contacts/new?scenario=empty",
    label: bilingualText("打开来源选择", "Open source choices"),
  },
  {
    href: "/app/contacts/new?scenario=pending",
    label: bilingualText("复核等待中的录入", "Review waiting intake"),
  },
  {
    href: "/app/contacts/new?scenario=failure",
    label: bilingualText("打开安全录入", "Open safe intake"),
  },
] as const;

type RouteScenario = AppContactsNewRouteScenario;
type AppContactsNewRouteState = Extract<
  ReturnType<typeof loadAppContactsNewRouteViewModel>,
  { state: "route-state" }
>["routeState"];
type AppContactsNewSuccessWorkspace = Extract<
  ReturnType<typeof loadAppContactsNewRouteViewModel>,
  { state: "success" }
>["workspace"];
type EvidenceResult =
  | {
      success: true;
      data: {
        provenance: {
          evidenceIds: readonly string[];
        };
      };
    }
  | {
      success: false;
      error: {
        code: string;
      };
    };

interface AppContactsNewPageProps {
  searchParams?: AppContactsNewSearchParams | Promise<AppContactsNewSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function evidenceFromResult(result: EvidenceResult): string {
  if (result.success === false) {
    return result.error.code;
  }

  return firstEvidence(result.data.provenance.evidenceIds);
}

function formatCount(
  count: number | undefined,
  singular: string,
  plural = `${singular}s`,
  chineseUnit = singular,
): string {
  const safeCount = count ?? 0;

  return bilingualText(
    `${safeCount} 个${chineseUnit}`,
    `${safeCount} ${safeCount === 1 ? singular : plural}`,
  );
}

function sourceName(
  displayName: string | undefined,
  fallback = bilingualText("等待复核的来源", "Source waiting for review"),
): string {
  return displayName?.trim() || fallback;
}

function yesNoLabel(value: boolean): string {
  return value ? bilingualText("是", "yes") : bilingualText("否", "no");
}

function capitalizeWord(word: string): string {
  if (!word) {
    return word;
  }

  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function evidenceLabel(evidenceId: string): string {
  const friendlyLabels: Array<[RegExp, string]> = [
    [/manual-note/, bilingualText("手动记录", "Manual note")],
    [/manual-contact-confirmed/, bilingualText("联系人复核已保留", "Contact review held")],
    [/business-card-capture/, bilingualText("名片已捕获", "Card captured")],
    [/business-card-ocr/, bilingualText("名片详情已读取", "Card details read")],
    [/business-card-draft/, bilingualText("名片草稿已准备", "Card draft ready")],
    [/qr-scan-frame/, bilingualText("QR 扫描已捕获", "QR scan captured")],
    [/qr-mutual-context/, bilingualText("共同背景已匹配", "Mutual context matched")],
    [/qr-draft/, bilingualText("QR 草稿已准备", "QR draft ready")],
    [/event-import-roster/, bilingualText("活动名单", "Event roster")],
    [/event-import-conversation-thread/, bilingualText("对话已记录", "Conversation noted")],
    [/event-import-goal-fit/, bilingualText("目标匹配已记录", "Goal fit noted")],
    [/external-import-phone/, bilingualText("手机联系人已保留", "Phone contact held")],
    [/external-import-google/, bilingualText("Google 联系人已保留", "Google contact held")],
    [/external-import-csv/, bilingualText("CSV 联系人已保留", "CSV contact held")],
    [/external-import-customer-list/, bilingualText("客户名单已保留", "Customer list held")],
    [/email-calendar:gmail-intro/, bilingualText("介绍邮件信号", "Intro email signal")],
    [/email-calendar:calendar-meeting/, bilingualText("日历信号已保留", "Calendar signal held")],
    [/email-calendar:graph-overlap/, bilingualText("共同网络信号", "Shared-network signal")],
    [/referral:founder/, bilingualText("创始人推荐", "Founder referral")],
    [/referral:investor/, bilingualText("投资人推荐", "Investor referral")],
    [/referral:community/, bilingualText("社群推荐", "Community referral")],
    [/duplicate-merge-email/, bilingualText("发现邮箱匹配", "Email match found")],
    [/duplicate-merge-event-context/, bilingualText("发现活动背景匹配", "Event context match")],
    [/duplicate-merge-referral-context/, bilingualText("发现推荐背景匹配", "Referral context match")],
    [/duplicate-merge-confirmation/, bilingualText("合并复核已保留", "Merge review held")],
  ];
  const normalizedEvidenceId = evidenceId.toLowerCase();
  const friendlyLabel = friendlyLabels.find(([pattern]) =>
    pattern.test(normalizedEvidenceId),
  )?.[1];

  if (friendlyLabel) {
    return friendlyLabel;
  }

  const specialWords: Record<string, string> = {
    ai: "AI",
    api: "API",
    csv: "CSV",
    gmail: "Gmail",
    id: "ID",
    ocr: "OCR",
    qr: "QR",
  };
  const names = new Set([
    "aiko",
    "akari",
    "emi",
    "hana",
    "kai",
    "kenji",
    "mateo",
    "maya",
    "mika",
    "omar",
    "priya",
  ]);
  const readable = evidenceId
    .replace(/^evidence[:_-]?/i, "")
    .replace(/[:_-]+/g, " ")
    .trim();

  if (!readable) {
    return bilingualText("来源证据", "Source evidence");
  }

  return productCopy(
    readable
      .split(/\s+/)
      .map((word, index) => {
        const lowerWord = word.toLowerCase();

        if (specialWords[lowerWord]) {
          return specialWords[lowerWord];
        }

        if (index === 0 || names.has(lowerWord)) {
          return capitalizeWord(lowerWord);
        }

        return lowerWord;
      })
      .join(" "),
  );
}

function productCopy(value: string): string {
  return value
    .replace(/\bproduction contact service\b/gi, "contact record queue")
    .replace(/\bcontact record service\b/gi, "contact record queue")
    .replace(/\bmock\b/gi, "review")
    .replace(/\boperator intro\b/gi, "partner intro")
    .replace(/\boperators\b/gi, "partner teams")
    .replace(/\boperator\b/gi, "reviewer")
    .replace(/\bproviders?\b/gi, "tools")
    .replace(/\bservices?\b/gi, "tools")
    .replace(new RegExp("\\bfixture" + "s?\\b", "gi"), "source records")
    .replace(/\bdatabases?\b/gi, "saved records");
}

function readableSourceLabel(label: string | undefined, fallback: string): string {
  const normalized = productCopy(label?.trim() || fallback)
    .replace(/\bbusiness card scan\b/i, "card")
    .replace(/\brelationship QR scan\b/i, "QR badge")
    .replace(/\borganizer roster\b/i, "event roster")
    .replace(/\bsource records\b/gi, "source")
    .replace(/\bocr\b/gi, "OCR");

  return capitalizeWord(normalized);
}

function TechnicalProvenanceDetails({
  evidenceIds,
}: {
  evidenceIds: readonly string[];
}) {
  return (
    <details className="technical-provenance">
      <summary>{bilingualText("来源记录详情", "Source record details")}</summary>
      <ul>
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>
            <code>{evidenceId}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  const visibleEvidenceIds = evidenceIds.slice(0, 5);

  return (
    <div className="evidence-cluster">
      <div aria-label={label} className="chip-row">
        {visibleEvidenceIds.map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceLabel(evidenceId)}
          </Chip>
        ))}
      </div>
      <TechnicalProvenanceDetails evidenceIds={visibleEvidenceIds} />
    </div>
  );
}

function ContactReviewDiagnostics({
  contactWriteExecuted,
  duplicateLookupExecuted,
  evidenceIds,
}: {
  contactWriteExecuted: boolean;
  duplicateLookupExecuted: boolean;
  evidenceIds: readonly string[];
}) {
  return (
    <details className="technical-provenance">
      <summary>
        {bilingualText("联系人复核诊断", "Contact review diagnostics")}
      </summary>
      <ul>
        <li>
          {bilingualText("来源证据", "Source evidence")}:{" "}
          {evidenceLabel(firstEvidence(evidenceIds))}
        </li>
        <li>
          {bilingualText("已执行联系人写入", "Contact write executed")}:{" "}
          {yesNoLabel(contactWriteExecuted)}
        </li>
        <li>
          {bilingualText("已执行重复查找", "Duplicate lookup executed")}:{" "}
          {yesNoLabel(duplicateLookupExecuted)}
        </li>
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>
            <code>{evidenceId}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  const routeStateUrl = `/app/contacts/new?scenario=${scenario}`;

  return <div data-route-state-url={routeStateUrl}>{children}</div>;
}

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppContactsNewRouteState;
}) {
  const {
    cardState,
    draftState,
    eventState,
    externalState,
    manualState,
    mergeState,
    qrState,
    referralState,
    scenario,
    signalState,
  } = routeState;

  if (scenario === "empty") {
    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description={bilingualText(
            "可以从手动记录、名片扫描、关系 QR、参会人导入、外部联系人名单、邮箱或日历信号、推荐关系或合并复核开始。",
            "Start from a manual note, card scan, relationship QR, attendee import, external contact list, email or calendar signal, referral, or merge review.",
          )}
          emptyState={bilingualText(
            "还没有来源产出可复核的联系人候选人。",
            "No source has produced a contact candidate ready for review.",
          )}
          evidence={[
            evidenceFromResult(draftState),
            evidenceFromResult(manualState),
            evidenceFromResult(cardState),
            evidenceFromResult(qrState),
            evidenceFromResult(eventState),
            evidenceFromResult(externalState),
            evidenceFromResult(signalState),
            evidenceFromResult(referralState),
            evidenceFromResult(mergeState),
          ]}
          eyebrow={bilingualText("空状态", "Empty state")}
          guardrail={bilingualText(
            "Orbit 可以引导采集来源，但没有来源证据和确认时不能创建联系人。",
            "Orbit can invite source capture, but it cannot create contacts without source evidence and confirmation.",
          )}
          recoveryActions={[
            {
              id: "return-to-source-choices",
              href: "/app/contacts/new",
              label: bilingualText(
                "返回来源选择",
                "Return to source choices",
              ),
              recoveryCopy: bilingualText(
                "先选择来源方式，再暂存关系候选人。",
                "Choose a source method before staging a relationship candidate.",
              ),
            },
          ]}
          purpose={bilingualText(
            "从有来源支撑的录入边界开始联系人获取。",
            "Start contact acquisition from source-backed intake boundaries.",
          )}
          title={bilingualText(
            "没有可复核的来源",
            "No source is ready for review",
          )}
        />
      </RouteStateMarker>
    );
  }

  if (scenario === "pending") {
    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description={bilingualText(
            "关系来源正在等待复核，之后才可以暂存联系人记录。",
            "Relationship sources are waiting for review before any contact record can be staged.",
          )}
          emptyState={bilingualText(
            "草稿、扫描、导入、信号、推荐和合并判断都会保持待处理，直到完成复核。",
            "Drafts, scans, imports, signals, referrals, and merge decisions stay pending until reviewed.",
          )}
          evidence={[
            evidenceFromResult(draftState),
            evidenceFromResult(manualState),
            evidenceFromResult(cardState),
            evidenceFromResult(qrState),
            evidenceFromResult(eventState),
          ]}
          eyebrow={bilingualText("加载状态", "Loading state")}
          guardrail={bilingualText(
            "待处理来源材料不能写入联系人、合并记录、发送消息或读取外部账号。",
            "Pending source material cannot write contacts, merge records, send messages, or read outside accounts.",
          )}
          recoveryActions={[
            {
              id: "review-waiting-source",
              href: "/app/contacts/new",
              label: bilingualText(
                "复核等待中的来源",
                "Review waiting source",
              ),
              recoveryCopy: bilingualText(
                "来源证据仍在等待复核时，返回录入台。",
                "Return to the intake desk while source evidence remains held for review.",
              ),
            },
          ]}
          purpose={bilingualText(
            "本地复核状态处理期间，保持获取流程可见。",
            "Keep acquisition visible while local review states resolve.",
          )}
          title={bilingualText("来源复核等待中", "Source review is waiting")}
        />
      </RouteStateMarker>
    );
  }

  return (
    <RouteStateMarker scenario={scenario}>
      <StateView
        description={bilingualText(
          "录入台无法组合当前来源队列，因此 Orbit 会让所有来源保持无副作用。",
          "The intake desk could not assemble the current source queue, so Orbit keeps every source side-effect-free.",
        )}
        emptyState={bilingualText(
          "没有联系人、连接、合并、消息、任务或外部账号被更改。",
          "No contact, connection, merge, message, task, or outside account was changed.",
        )}
        evidence={
          draftState.success === false
            ? [
                draftState.error.code,
                firstEvidence(draftState.error.evidenceIds),
              ]
            : ["contact-acquisition-expected-failure-not-returned"]
        }
        eyebrow={bilingualText("失败状态", "Failure state")}
        guardrail={bilingualText(
          "恢复控件会保持相机、邮箱、日历、通讯录、存储、AI、通知和消息工具断开。",
          "The recovery control keeps camera, email, calendar, contacts, storage, AI, notifications, and messaging disconnected.",
        )}
        recoveryActions={[
          {
            id: "return-to-safe-intake",
            href: "/app/contacts/new",
            label: bilingualText("返回安全录入", "Return to safe intake"),
            recoveryCopy: bilingualText(
              "重新打开录入台，但不调用相机、导入、收件箱、日历、合并或外发工具。",
              "Reopen the intake desk without calling camera, imports, inbox, calendar, merge, or outbound tools.",
            ),
          },
        ]}
        purpose={bilingualText(
          "以无副作用方式呈现可控的联系人获取失败。",
          "Render a controlled acquisition failure without side effects.",
        )}
        title={bilingualText("来源录入需要处理", "Source intake needs attention")}
      />
    </RouteStateMarker>
  );
}

function ContactsNewLedger({
  acquisitionCount,
  cardCount,
  eventDraftCount,
  manualName,
  pendingPermissionCount,
}: {
  acquisitionCount: number;
  cardCount: number;
  eventDraftCount: number;
  manualName: string;
  pendingPermissionCount: number;
}) {
  return (
    <dl
      aria-label="App contacts new composed capabilities"
      className="relationship-meta contacts-new-ledger"
    >
      <div>
        <dt>{bilingualText("手动记录", "Manual note")}</dt>
        <dd>{manualName}</dd>
      </div>
      <div>
        <dt>{bilingualText("草稿队列", "Draft queue")}</dt>
        <dd>
          <strong>{acquisitionCount}</strong>
          {bilingualText(" 个有来源草稿", " source-backed drafts")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("名片扫描", "Card scans")}</dt>
        <dd>{formatCount(cardCount, "card draft", "card drafts", "名片草稿")}</dd>
      </div>
      <div>
        <dt>{bilingualText("活动导入", "Event import")}</dt>
        <dd>
          {formatCount(
            eventDraftCount,
            "attendee draft",
            "attendee drafts",
            "参会人草稿",
          )}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("权限", "Permissions")}</dt>
        <dd>
          {formatCount(
            pendingPermissionCount,
            "staged permission",
            "staged permissions",
            "暂存权限",
          )}
        </dd>
      </div>
    </dl>
  );
}

function SourceMethodCard({
  controlLabel,
  detail,
  evidenceIds,
  name,
  nextStep,
  sourceLabel,
  status,
  title,
}: {
  controlLabel: string;
  detail: string;
  evidenceIds: readonly string[];
  name: string;
  nextStep: string;
  sourceLabel: string;
  status: string;
  title: string;
}) {
  return (
    <article className="contacts-new-source-method">
      <header>
        <p className="type-caption">
          {bilingualText("来源方式", "Source method")}
        </p>
        <h3 className="relationship-name">{title}</h3>
      </header>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("状态", "Status")}</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>{bilingualText("来源", "Source")}</dt>
          <dd>{sourceLabel}</dd>
        </div>
        <div>
          <dt>{bilingualText("候选人", "Candidate")}</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>{bilingualText("下一步", "Next step")}</dt>
          <dd>{nextStep}</dd>
        </div>
      </dl>
      <p className="type-body">{productCopy(detail)}</p>
      <button type="button">{controlLabel}</button>
      <EvidenceChips
        evidenceIds={evidenceIds}
        label={bilingualText(`${title} 证据`, `${title} evidence`)}
      />
    </article>
  );
}

function renderContactsNewPage(
  searchParams: AppContactsNewSearchParams | undefined,
) {
  const viewModel = loadAppContactsNewRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return (
      <div className="app-contacts-new-route">
        <style>{appContactsNewStyles}</style>
        <RouteStateBoundary routeState={viewModel.routeState} />
      </div>
    );
  }

  const {
    cardState,
    draftQueue,
    eventState,
    externalState,
    manualConfirmation,
    manualState,
    mergeState,
    permissionState,
    qrState,
    referralState,
    signalState,
  }: AppContactsNewSuccessWorkspace = viewModel.workspace;

  if (
    draftQueue.success === false ||
    manualState.success === false ||
    cardState.success === false ||
    qrState.success === false ||
    eventState.success === false ||
    externalState.success === false ||
    signalState.success === false ||
    referralState.success === false ||
    mergeState.success === false ||
    permissionState.success === false
  ) {
    return (
      <StateView
        description={bilingualText(
          "联系人获取页无法组合所有必需的本地服务状态。",
          "The contact acquisition page could not compose every required local service state.",
        )}
        emptyState={bilingualText(
          "联系人来源、权限、推荐或合并边界返回了异常状态。",
          "A contact source, permission, referral, or merge boundary returned an unexpected state.",
        )}
        evidence={[
          evidenceFromResult(draftQueue),
          evidenceFromResult(manualState),
          evidenceFromResult(cardState),
          evidenceFromResult(qrState),
          evidenceFromResult(eventState),
          evidenceFromResult(externalState),
          evidenceFromResult(signalState),
          evidenceFromResult(referralState),
          evidenceFromResult(mergeState),
          evidenceFromResult(permissionState),
        ]}
        eyebrow={bilingualText("联系人", "Contacts")}
        guardrail={bilingualText(
          "联系人获取组合失败时，不能运行任何外部动作。",
          "No external action can run when contact acquisition composition fails.",
        )}
        nextStep={bilingualText(
          "检查 GET /api/contact-drafts 和 GET /api/permissions。",
          "Inspect GET /api/contact-drafts and GET /api/permissions.",
        )}
        purpose={bilingualText(
          "当本地来源证据无法组合时，停止联系人获取。",
          "Stop contact acquisition when local source evidence cannot be composed.",
        )}
        title={bilingualText(
          "联系人获取无法加载",
          "Contact acquisition could not load",
        )}
      />
    );
  }

  const manualDraft = manualState.data.draft;
  const cardDraft = cardState.data.draft;
  const qrDraft = qrState.data.draft;
  const eventDraft = eventState.data.contactDrafts[0] ?? null;
  const externalDraft = externalState.data.contactDrafts[0] ?? null;
  const emailCalendarSignal = signalState.data.signals[0] ?? null;
  const referralDraft = referralState.data.contactDrafts[0] ?? null;
  const mergeSuggestion = mergeState.data.mergeSuggestions[0] ?? null;
  const pendingPermissionCount = permissionState.data.permissions.filter(
    (permission) => permission.authorizationStage !== "ready",
  ).length;
  const currentSourceLabel = readableSourceLabel(
    manualDraft?.source.label,
    "manual note from climate founders dinner",
  );
  const sourceMethods = [
    {
      controlLabel: bilingualText("选择手动记录", "Choose manual note"),
      detail: manualDraft?.followUpHint ?? manualState.data.nextAction,
      evidenceIds: manualState.data.provenance.evidenceIds,
      name: sourceName(manualDraft?.displayName),
      nextStep: bilingualText(
        "保存联系人之前先预览联系人复核。",
        "Preview the contact review before saving a person.",
      ),
      sourceLabel: currentSourceLabel,
      status: bilingualText("可复核", "Ready to review"),
      title: bilingualText("手动记录", "Manual note"),
    },
    {
      controlLabel: bilingualText("选择名片扫描", "Choose card scan"),
      detail: cardDraft?.relationshipContext ?? cardState.data.nextAction,
      evidenceIds: cardState.data.provenance.evidenceIds,
      name: sourceName(cardDraft?.displayName),
      nextStep: bilingualText(
        "创建联系人之前先复核已提取字段。",
        "Review extracted fields before creating a contact.",
      ),
      sourceLabel: bilingualText(
        "机器人投资人沙龙名片",
        "Card from robotics investor salon",
      ),
      status: bilingualText("草稿已提取", "Draft extracted"),
      title: bilingualText("名片", "Business card"),
    },
    {
      controlLabel: bilingualText("选择 QR 扫描", "Choose QR scan"),
      detail: qrState.data.mutualContext
        ? `${qrState.data.mutualContext.eventName}: ${qrState.data.mutualContext.introductionPath}`
        : qrState.data.nextAction,
      evidenceIds: qrState.data.provenance.evidenceIds,
      name: sourceName(qrDraft?.displayName),
      nextStep: bilingualText(
        "确认之前先复核共同背景。",
        "Review mutual context before confirming.",
      ),
      sourceLabel: bilingualText(
        "气候创始人晚餐 QR 徽章",
        "QR badge from Climate founders dinner",
      ),
      status: bilingualText("背景已匹配", "Context matched"),
      title: bilingualText("关系 QR", "Relationship QR"),
    },
    {
      controlLabel: bilingualText("选择参会人导入", "Choose attendee import"),
      detail: eventDraft
        ? `${eventState.data.event.name}: ${eventDraft.relationshipStatus.label}`
        : eventState.data.nextAction,
      evidenceIds: eventState.data.provenance.evidenceIds,
      name: sourceName(eventDraft?.displayName),
      nextStep: bilingualText(
        "选择活动背景能解释后续跟进的人。",
        "Pick attendees whose event context explains the follow-up.",
      ),
      sourceLabel: readableSourceLabel(
        eventDraft?.source.label ?? eventState.data.event.source.label,
        "event roster from climate founders dinner",
      ),
      status: bilingualText("名单已暂存", "Roster staged"),
      title: bilingualText("活动参会人", "Event attendees"),
    },
    {
      controlLabel: bilingualText("选择外部联系人", "Choose external contacts"),
      detail: externalDraft
        ? externalDraft.relationshipContext
        : externalState.data.nextAction,
      evidenceIds: externalState.data.provenance.evidenceIds,
      name: sourceName(externalDraft?.displayName),
      nextStep: bilingualText(
        "暂存前先复核每个外部名单联系人为什么存在。",
        "Review why each outside-list contact exists before staging.",
      ),
      sourceLabel: bilingualText(
        "手机、Google、CSV 和客户名单来源",
        "Phone, Google, CSV, and customer-list sources",
      ),
      status: bilingualText("候选人已保留", "Candidates held"),
      title: bilingualText("外部联系人", "External contacts"),
    },
    {
      controlLabel: bilingualText("选择收件箱信号", "Choose inbox signals"),
      detail: emailCalendarSignal
        ? emailCalendarSignal.relationshipContext
        : signalState.data.nextAction,
      evidenceIds: signalState.data.provenance.evidenceIds,
      name: sourceName(emailCalendarSignal?.displayName),
      nextStep: bilingualText(
        "把信号转成关系任务前先确认它。",
        "Confirm the signal before turning it into relationship work.",
      ),
      sourceLabel: bilingualText(
        "仅元数据的收件箱和日历信号",
        "Metadata-only inbox and calendar signals",
      ),
      status: bilingualText("信号已保留", "Signals held"),
      title: bilingualText("邮箱和日历", "Email and calendar"),
    },
    {
      controlLabel: bilingualText("选择推荐", "Choose referral"),
      detail: referralDraft
        ? referralDraft.relationshipContext
        : referralState.data.nextAction,
      evidenceIds: referralState.data.provenance.evidenceIds,
      name: sourceName(referralDraft?.displayName),
      nextStep: bilingualText(
        "任何外联前先确认推荐人的背景。",
        "Confirm the recommender context before any outreach.",
      ),
      sourceLabel: bilingualText(
        "创始人、投资人和社群推荐",
        "Founder, investor, and community referrals",
      ),
      status: bilingualText("暖启动路径已准备", "Warm path ready"),
      title: bilingualText("推荐", "Referral"),
    },
    {
      controlLabel: bilingualText("选择合并复核", "Choose merge review"),
      detail: mergeSuggestion
        ? mergeSuggestion.reviewQuestion
        : mergeState.data.nextAction,
      evidenceIds: mergeState.data.provenance.evidenceIds,
      name: mergeSuggestion
        ? productCopy(mergeSuggestion.decision.replaceAll("_", " "))
        : bilingualText("没有排队中的合并判断", "No merge decision queued"),
      nextStep: bilingualText(
        "任何合并发生前，先批准或保持记录分开。",
        "Approve or keep records separate before any merge can happen.",
      ),
      sourceLabel: bilingualText("重复记录复核队列", "Duplicate review queue"),
      status: bilingualText("需要批准", "Needs approval"),
      title: bilingualText("合并复核", "Merge review"),
    },
  ] as const;
  const sourceMethodGroups = [
    {
      description: bilingualText(
        "适用于关系从线下房间、餐桌或徽章交换开始的情况。",
        "Use when the relationship started in a room, at a table, or through a badge exchange.",
      ),
      heading: bilingualText("线下捕获", "Captured in person"),
      methods: [sourceMethods[0], sourceMethods[1], sourceMethods[2]],
    },
    {
      description: bilingualText(
        "适用于来源来自名单、通讯录、信号或重复记录复核的情况。",
        "Use when the source starts as a roster, address book, signal, or duplicate review.",
      ),
      heading: bilingualText("导入记录", "Imported records"),
      methods: [
        sourceMethods[3],
        sourceMethods[4],
        sourceMethods[5],
        sourceMethods[7],
      ],
    },
    {
      description: bilingualText(
        "适用于另一个人解释暖启动路径和跟进理由的情况。",
        "Use when another person explains the warm path and the reason to follow up.",
      ),
      heading: bilingualText("暖介绍", "Warm introductions"),
      methods: [sourceMethods[6]],
    },
  ] as const;

  return (
    <div className="app-contacts-new-route">
      <style>{appContactsNewStyles}</style>
      <div data-state-boundary="app-contacts-new-success">
        <WorkbenchSurface
          className="contacts-new-command"
          elevated
          eyebrow={bilingualText("联系人", "Contacts")}
          title={bilingualText("添加关系来源", "Relationship source intake")}
        >
          <p className="type-body">
            {bilingualText(
              "一次只复核一个关系候选人。先判断来源是否说清楚：为什么这个人应该进入 Orbit。",
              "Review one relationship candidate at a time. The first decision is whether the source explains why this person belongs in Orbit.",
            )}
          </p>

          <form
            action="/app/contacts/new"
            className="contacts-new-task contacts-new-current-candidate"
            method="get"
          >
            <div>
              <p className="type-caption">
                {bilingualText("第一步复核", "First review")}
              </p>
              <h3 className="relationship-name">
                {bilingualText("当前候选人", "Current review candidate")}
              </h3>
              <div className="source-label-row" aria-label="Current source">
                <Chip tone="evidence">{currentSourceLabel}</Chip>
              </div>
              <p className="type-body">
                {bilingualText(
                  `${sourceName(manualDraft?.displayName)} 已可进入联系人复核，因为晚餐记录说明了关系背景和合理跟进动作。`,
                  `${sourceName(manualDraft?.displayName)} is ready for contact review because the dinner note gives a clear relationship context and a sensible follow-up.`,
                )}
              </p>
            </div>
            <dl className="relationship-meta">
              <div>
                <dt>{bilingualText("来源", "Source")}</dt>
                <dd>{currentSourceLabel}</dd>
              </div>
              <div>
                <dt>{bilingualText("下一步判断", "Next decision")}</dt>
                <dd>{bilingualText("预览联系人复核", "Preview contact review")}</dd>
              </div>
              <div>
                <dt>{bilingualText("无外部影响边界", "No-side-effect boundary")}</dt>
                <dd>
                  {bilingualText(
                    "不会创建联系人记录，不会执行重复合并，也不会触碰消息、任务、相机、收件箱、日历或外部账号。",
                    "No contact record is created, no duplicate merge runs, and no message, task, camera, inbox, calendar, or outside account is touched.",
                  )}
                </dd>
              </div>
            </dl>
            <input name="action" type="hidden" value="confirm-manual-draft" />
            <button type="submit">
              {bilingualText("预览联系人复核", "Preview contact review")}
            </button>
          </form>

          {manualConfirmation?.success && (
            <div
              aria-label="App contacts new local action result"
              className="contacts-new-action-result"
              data-action-evidence="manual-contact-confirmation-local-preview"
              data-side-effects="none"
              data-task-result="manual-contact-confirmation-preview"
            >
              <strong>
                {bilingualText(
                  `已可进入联系人复核：${manualConfirmation.data.contactCandidate.displayName}`,
                  `Ready for contact review: ${manualConfirmation.data.contactCandidate.displayName}`,
                )}
              </strong>
              <span>
                {bilingualText(
                  "保留这个有来源支撑的候选人，供后续联系人复核使用。",
                  "Keep this source-backed candidate ready for later contact review.",
                )}
              </span>
              <dl className="relationship-meta contacts-new-action-summary">
                <div>
                  <dt>{bilingualText("来源时刻", "Source moment")}</dt>
                  <dd>
                    {readableSourceLabel(
                      manualConfirmation.data.contactCandidate.source.label,
                      currentSourceLabel,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{bilingualText("关系理由", "Relationship reason")}</dt>
                  <dd>
                    {productCopy(
                      manualConfirmation.data.contactCandidate
                        .relationshipContext,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{bilingualText("已承诺跟进", "Promised follow-up")}</dt>
                  <dd>
                    {productCopy(
                      manualConfirmation.data.contactCandidate.followUpHint,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{bilingualText("保持未保存", "Will remain unsaved")}</dt>
                  <dd>
                    {bilingualText(
                      "联系人记录、重复复核、消息、任务、相机、收件箱、日历和外部账号变更。",
                      "Contact record, duplicate review, message, task, camera, inbox, calendar, and outside-account changes.",
                    )}
                  </dd>
                </div>
              </dl>
              <span>
                {bilingualText(
                  "已联系外部账号：无",
                  "Outside accounts contacted: none",
                )}
              </span>
              <ContactReviewDiagnostics
                contactWriteExecuted={
                  manualConfirmation.data.contactCandidate.contactWriteExecuted
                }
                duplicateLookupExecuted={
                  manualConfirmation.data.contactCandidate
                    .duplicateLookupExecuted
                }
                evidenceIds={manualConfirmation.data.provenance.evidenceIds}
              />
            </div>
          )}

          <p className="privacy-note">
            {bilingualText(
              "已联系外部账号：无。相机、通讯录、邮箱、日历、存储、AI、通知、消息和已保存联系人记录都不会被此页面触碰。",
              "Outside accounts contacted: none. Camera, address book, email, calendar, storage, AI, notification, messaging, and saved contact records stay untouched from this route.",
            )}
          </p>
        </WorkbenchSurface>
      </div>

      <WorkbenchSurface
        eyebrow={bilingualText("来源选择", "Source choices")}
        title={bilingualText("选择另一种关系来源", "Choose another relationship source")}
      >
        <p className="type-body">
          {bilingualText(
            "当前候选人不是下一步复核对象时，可以选择另一种来源方式。每种方式都会保持暂存，直到有人确认该来源证明了什么。",
            "Select a source method when the current candidate is not the right next review. Each method stays staged until a person confirms what the source proves.",
          )}
        </p>
        <div
          aria-label="Selectable relationship source methods"
          className="contacts-new-method-grid"
        >
          {sourceMethodGroups.map((group) => (
            <section className="contacts-new-source-group" key={group.heading}>
              <header className="contacts-new-source-group-header">
                <p className="type-caption">
                  {bilingualText("来源类型", "Source type")}
                </p>
                <h3 className="relationship-name">{group.heading}</h3>
                <p className="type-body">{group.description}</p>
              </header>
              <div className="contacts-new-source-group-grid">
                {group.methods.map((method) => (
                  <SourceMethodCard
                    controlLabel={method.controlLabel}
                    detail={method.detail}
                    evidenceIds={method.evidenceIds}
                    key={method.title}
                    name={method.name}
                    nextStep={method.nextStep}
                    sourceLabel={method.sourceLabel}
                    status={method.status}
                    title={method.title}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <details className="contacts-new-secondary">
          <summary>{bilingualText("来源数量", "Source counts")}</summary>
          <ContactsNewLedger
            acquisitionCount={draftQueue.data.drafts.length}
            cardCount={cardDraft ? 1 : 0}
            eventDraftCount={eventState.data.contactDrafts.length}
            manualName={sourceName(manualDraft?.displayName)}
            pendingPermissionCount={pendingPermissionCount}
          />
          <div aria-label="App contacts new capability labels" className="chip-row">
            {capabilityLabels.map((label) => (
              <Chip key={label} tone="primary">
                {label}
              </Chip>
            ))}
          </div>
        </details>
        <details className="contacts-new-secondary">
          <summary>{bilingualText("工作区状态", "Workspace status")}</summary>
          <p className="type-body">
            {bilingualText(
              "这个录入台只在本地暂存复核候选人。这里没有连接实时登录、同步、导入、合并、消息、任务、相机、收件箱、日历或外部账号动作。",
              "This intake desk stages review candidates locally. No live login, sync, import, merge, message, task, camera, inbox, calendar, or outside-account action is connected here.",
            )}
          </p>
        </details>
        <details className="contacts-new-secondary">
          <summary>{bilingualText("恢复选项", "Recovery options")}</summary>
          <div aria-label="App contacts new intake status">
            <p className="type-caption">
              {bilingualText("录入状态", "Intake status")}
            </p>
            <h3 className="relationship-name">
              {bilingualText("录入状态", "Intake status")}
            </h3>
            <p className="type-body">
              {bilingualText(
                "当来源背景缺失、等待复核或不可用时，可以打开录入台。每个状态都会保持当前候选人和所有外部账号不被触碰。",
                "Open the intake desk when source context is missing, waiting for review, or unavailable. Each status keeps the current candidate and all outside accounts untouched.",
              )}
            </p>
            <nav className="contacts-new-state-links">
              {routeStateChecks.map((stateCheck) => (
                <a href={stateCheck.href} key={stateCheck.href}>
                  {stateCheck.label}
                </a>
              ))}
            </nav>
          </div>
        </details>
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow={bilingualText("证据", "Evidence")}
        title={bilingualText("复核队列", "Review queues")}
      >
        <details className="contacts-new-secondary">
          <summary>{bilingualText("样例队列", "Sample queue")}</summary>
          <p className="type-body">
            {bilingualText(
              `独立样例队列：${draftQueue.data.drafts.length} 个草稿候选人从有来源录入中暂存。当前高亮复核候选人仍是 ${sourceName(manualDraft?.displayName)}；这个独立样例集从 ${sourceName(draftQueue.data.drafts[0]?.displayName)} 开始，来源是 ${draftQueue.data.drafts[0]?.source.label ?? "来源记录"}。`,
              `Separate sample queue: ${draftQueue.data.drafts.length} draft candidates are staged from source-backed intake. The highlighted review candidate remains ${sourceName(manualDraft?.displayName)}; this separate sample set starts with ${sourceName(draftQueue.data.drafts[0]?.displayName)} from ${draftQueue.data.drafts[0]?.source.label ?? "a source record"}.`,
            )}
          </p>
          <EvidenceChips
            evidenceIds={draftQueue.data.provenance.evidenceIds}
            label="App contacts new draft queue evidence"
          />
        </details>
      </WorkbenchSurface>
    </div>
  );
}

export default function ContactsNewPage({
  searchParams,
}: AppContactsNewPageProps = {}) {
  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderContactsNewPage(resolvedSearchParams),
    );
  }

  return renderContactsNewPage(searchParams);
}
