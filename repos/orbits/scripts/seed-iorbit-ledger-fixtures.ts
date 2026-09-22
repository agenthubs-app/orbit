/**
 * iOrbit 像素终验（任务 7）的账本种子。
 *
 * 任务 5 / 6a 的像素比对里 `/app/agent/actions` 与 `/app/agent/plan` 的左栏一直
 * 是空态：验证库里该账号没有任何 `agentActionsV2` 记录，账本三档全是 0。本脚本
 * 通过**运行时服务自身的 API**（`createRun` / `proposeAction` / `approveAction` /
 * `deferAction` / `processOutbox`）补齐最小验证集，不直接写表、不绕过任何状态机：
 *
 *   - 需要你决定（decide）  = awaiting_confirmation
 *   - 建议今天做（today）   = approved（outbox 留待执行，状态停在 approved）
 *   - 可以稍后（later）     = deferred
 *   - 今日进度环的分子      = 一条 approved → processOutbox → completed，
 *                            `completedAt` 落在运行当天
 *
 * 每条都带 `operations[0].operationType`、`whyNow`、`evidenceChips` 与 `preview`。
 * 幂等：actionId / runId 固定，重复运行时 `proposeAction` 直接返回已存在的记录。
 *
 * 用法：
 *   node --import tsx scripts/seed-iorbit-ledger-fixtures.ts --email qa@orbit.test
 *   node --import tsx scripts/seed-iorbit-ledger-fixtures.ts --email qa@orbit.test --mode verify
 *
 * 脚本不读取也不打印任何密码。
 */
import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { createOrbitAgentRuntimeService } from "../features/agent/runtime/service-factory";
import { createRuntimeBackedAgentLedgerService } from "../features/agent/ledger/runtime-adapter";
import type { AgentActionProposalInput } from "../features/agent/runtime/service";
import { loadLocalEnv } from "./load-local-env";

const PREFIX = "iorbit-qa-ledger";
const RUN_ID = `${PREFIX}:run-001`;

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value?.trim() || null;
}

function sourceRef(id: string) {
  return {
    type: "agent_action" as const,
    id,
    label: "iOrbit 像素验证账本种子",
    providerRecordId: id,
    generatedBy: "live-store-query" as const,
  };
}

interface ProposalSpec {
  actionId: string;
  contactName: string;
  evidenceId: string;
  operationType:
    | "create_followup_task"
    | "save_message_draft"
    | "create_followup_reminder";
  executorKey: string;
  organization: string;
  preview: string;
  taskTitle: string;
  title: string;
  whyNow: string;
}

function proposal(spec: ProposalSpec): AgentActionProposalInput {
  return {
    actionId: spec.actionId,
    runId: RUN_ID,
    workflowKey: "iorbit_ledger_verification_v1",
    workflowVersion: 1,
    title: spec.title,
    contactName: spec.contactName,
    organization: spec.organization,
    whyNow: spec.whyNow,
    riskLevel: "write",
    payloadVersion: 1,
    preview: spec.preview,
    compensation: {
      supported: true,
      executorKey: spec.executorKey,
      preview: "可撤销并移除该记录。",
    },
    operations: [
      {
        operationId: `${spec.actionId}:op-1`,
        operationType: spec.operationType,
        executorKey: spec.executorKey,
        idempotencyKey: `${spec.actionId}:v1`,
        payloadVersion: 1,
        payload: {
          taskId: `task:${spec.actionId}`,
          title: spec.taskTitle,
          evidenceIds: [spec.evidenceId],
        },
        preview: spec.preview,
        riskLevel: "write",
        compensation: {
          supported: true,
          executorKey: spec.executorKey,
          preview: "移除该记录",
        },
      },
    ],
    evidenceChips: [
      { kind: "contact_note", label: "关系证据", evidenceId: spec.evidenceId },
      { kind: "chat_summary", label: "对话摘要", evidenceId: spec.evidenceId },
    ],
    evidenceIds: [spec.evidenceId],
    sourceRefs: [sourceRef(spec.actionId)],
  };
}

const SPECS: readonly (ProposalSpec & {
  transition: "none" | "approve" | "defer" | "complete";
})[] = [
  {
    actionId: `${PREFIX}:decide-001`,
    contactName: "佐藤健一",
    evidenceId: "iorbit-qa-49ecf00e77:evidence:task:001",
    executorKey: "followups.createTask",
    operationType: "create_followup_task",
    organization: "北星餐饮",
    preview: "创建「与佐藤健一确认下一步」跟进任务，含上次会面的三条结论。",
    taskTitle: "与佐藤健一确认下一步",
    title: "建立跟进任务 — 佐藤健一",
    transition: "none",
    whyNow: "上次会面后的跟进窗口还剩三天。",
  },
  {
    actionId: `${PREFIX}:today-001`,
    contactName: "高橋智子",
    evidenceId: "iorbit-qa-49ecf00e77:evidence:task:002",
    executorKey: "followups.saveDraft",
    operationType: "save_message_draft",
    organization: "青叶餐饮",
    preview: "保存给高橋智子的回信草稿，落点是她提过的门店选址问题。",
    taskTitle: "给高橋智子的回信草稿",
    title: "准备回信草稿 — 高橋智子",
    transition: "approve",
    whyNow: "对方的上一封邮件已经等了两天回复。",
  },
  {
    actionId: `${PREFIX}:later-001`,
    contactName: "伊藤香織",
    evidenceId: "iorbit-qa-49ecf00e77:evidence:task:003",
    executorKey: "notifications.createReminder",
    operationType: "create_followup_reminder",
    organization: "横滨餐饮",
    preview: "在下个月初提醒你回访伊藤香織，避免关系进入沉默期。",
    taskTitle: "回访伊藤香織",
    title: "设置回访提醒 — 伊藤香織",
    transition: "defer",
    whyNow: "这条关系已经四周没有新的互动记录。",
  },
  {
    actionId: `${PREFIX}:done-001`,
    contactName: "田中美咲",
    evidenceId: "iorbit-qa-49ecf00e77:evidence:task:004",
    executorKey: "followups.createTask",
    operationType: "create_followup_task",
    organization: "东京 AI 交流会",
    preview: "创建「整理东京 AI 交流会的会后名单」任务。",
    taskTitle: "整理东京 AI 交流会的会后名单",
    title: "整理会后名单 — 东京 AI 交流会",
    transition: "complete",
    whyNow: "活动结束后 48 小时内整理名单的回复率最高。",
  },
];

async function main(): Promise<void> {
  loadLocalEnv();
  const email = argumentValue("--email") ?? "qa@orbit.test";
  const mode = argumentValue("--mode") ?? "seed";
  const authProvider = createConfiguredStorageAuthUserProvider();
  if (!authProvider) {
    throw new Error("Configure ORBIT_EVENT_DATABASE_URL before seeding.");
  }
  const user = await authProvider.getUserByEmail(email);
  if (!user) throw new Error(`Account ${email} was not found in this database.`);
  const actorId = user.id;
  const runtime = createOrbitAgentRuntimeService("live", { actorId });
  const ledger = createRuntimeBackedAgentLedgerService({ runtime });

  if (mode === "seed") {
    await runtime.createRun({
      runId: RUN_ID,
      workflowKey: "iorbit_ledger_verification_v1",
      trigger: "manual",
    });
    for (const spec of SPECS) {
      const action = await runtime.proposeAction(proposal(spec));
      if (spec.transition === "none") continue;
      if (spec.transition === "defer") {
        if (action.status === "awaiting_confirmation") {
          await runtime.deferAction(action.actionId);
        }
        continue;
      }
      if (action.status === "awaiting_confirmation") {
        await runtime.approveAction({
          actionId: action.actionId,
          actorLabel: "iOrbit pixel verification seed",
        });
      }
      if (spec.transition === "complete") {
        await runtime.processOutbox({
          actionId: action.actionId,
          workerId: "iorbit-ledger-seed",
        });
      }
    }
  }

  const result = await ledger.listEntries({});
  if (result.success === false) {
    throw new Error(`Ledger read failed: ${result.error.code}`);
  }
  const summary = result.data.entries.map((entry) => ({
    actionId: entry.entryId,
    completedAt: entry.completedAt ?? null,
    evidenceChips: entry.evidenceChips.length,
    operationType: entry.operations[0]?.operationType ?? null,
    preview: Boolean(entry.preview),
    status: entry.status,
    whyNow: Boolean(entry.whyNow),
  }));
  console.log(JSON.stringify({ actorId, email, entries: summary }, null, 2));
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
