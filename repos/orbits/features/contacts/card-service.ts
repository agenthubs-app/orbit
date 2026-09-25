import { resolveModuleMode } from "../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { AppError } from "../../shared/errors/app-error";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createPostgresContactCardReader } from "./storage/contact-list-postgres-reader";
import type { ContactsListSearchFilterInput } from "./contract";

export type ContactCardService = ReturnType<typeof createPostgresContactCardReader>;
export interface ContactCardActor { id: string; workspaceId?: string }

/** Product loaders and HTTP share this bounded reader; no legacy graph fallback. */
export function createContactCardService(actor: ContactCardActor): ContactCardService {
  if (resolveModuleMode() !== "live") throw new AppError("SERVICE_UNAVAILABLE", "Contact pages require a live provider.");
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime || (actor.workspaceId && actor.workspaceId !== runtime.workspaceId)) {
    throw new AppError("SERVICE_UNAVAILABLE", "Contact storage is unavailable.");
  }
  const reader = createPostgresContactCardReader({ ...runtime,
    cursorSecret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  });
  const check = (actorId: string) => {
    if (actorId !== actor.id) throw new AppError("FORBIDDEN", "Contact scope does not match.");
    for (const collectionName of ["contacts", "connections", "contact_detail_states", "evidence"]) {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName });
    }
  };
  return {
    page(query, actorId) { check(actorId); return reader.page(query, actorId); },
    summary(query, actorId) { check(actorId); return reader.summary(query, actorId); },
  };
}

export function readContactCardQuery(params: URLSearchParams): ContactsListSearchFilterInput {
  for (const key of ["query", "cursor", "limit"]) {
    if (params.getAll(key).length > 1) throw new Error("CONTACT_PAGE_INPUT_INVALID");
  }
  const list = (key: string) => params.getAll(key).flatMap(v => v.split(",")).map(v => v.trim()).filter(Boolean);
  return { query: params.get("query"), cursor: params.get("cursor"),
    limit: params.has("limit") ? Number(params.get("limit")) : 30,
    sourceFilters: list("source"), statusFilters: list("status"), tagFilters: list("tag"), valueFilters: list("value") };
}

export function contactCardReadError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message === "CONTACT_CURSOR_INVALID") return new AppError("VALIDATION_ERROR", "分页已失效，请从第一页重新加载。");
  if (message === "CONTACT_PAGE_INPUT_INVALID") return new AppError("VALIDATION_ERROR", "分页或筛选参数无效。");
  if (message === "CONTACT_SEARCH_RUNTIME_UNSUPPORTED") return new AppError("SERVICE_UNAVAILABLE", "当前环境暂不支持此搜索，请清除关键词后浏览联系人。");
  return new AppError("SERVICE_UNAVAILABLE", "联系人暂时无法读取，请稍后重试。");
}
