import { createConfiguredTransactionalPostgresRuntime } from "../../../../shared/storage/transactional-postgres";
import { createPostgresAiUsageLedger } from "../../../ai-quota/ledger";
import { createTransactionalPortraitRepository } from "./repository";
import { createEventRegistrationPortraitService } from "./service";
import { readPortraitSnapshot } from "./source-reader";

export function createEventRegistrationPortraitRuntime() {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const repository = createTransactionalPortraitRepository({ ...runtime, readSnapshot: readPortraitSnapshot });
  // R27（A5）：画像 / 自己紹介（E4）的调用进 AI 账本（只记账）。
  return { ...runtime, repository, service: createEventRegistrationPortraitService({ ledger: createPostgresAiUsageLedger({ client: runtime.client, workspaceId: runtime.workspaceId }), repository, workspaceId: runtime.workspaceId }) };
}
