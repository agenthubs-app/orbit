import { conditionalJsonRead, defaultConditionalReadDependencies, type ConditionalReadDependencies } from "../_shared/conditional-read";
import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { createContactsListSearchAndFilterService } from "../../../features/contacts/service-factory";
import {
  contactsListSearchFailureContext,
  contactsListSearchFailureToAppError,
} from "../../../features/contacts/service";
import type { ContactsListSearchFilterInput } from "../../../features/contacts/contract";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../_shared/authenticated-actor";

// Contacts list route 提供联系人列表搜索和过滤 API。
// 具体筛选规则在 contacts service 内；route 只解析 querystring 并返回统一 envelope。
function readListParam(
  searchParams: URLSearchParams,
  singularName: string,
  pluralName: string,
): string[] {
  // 支持 ?tag=a&tag=b 和 ?tags=a,b 两种形式，方便表单和测试共用。
  const values = [
    ...searchParams.getAll(singularName),
    ...searchParams.getAll(pluralName),
  ];

  return values.flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function readContactsListInput(request: Request): ContactsListSearchFilterInput {
  const searchParams = new URL(request.url).searchParams;
  const limit = searchParams.get("limit");

  return {
    query: searchParams.get("query"),
    scenario: searchParams.get("scenario"),
    sourceFilters: readListParam(searchParams, "source", "sources"),
    statusFilters: readListParam(searchParams, "status", "statuses"),
    tagFilters: readListParam(searchParams, "tag", "tags"),
    valueFilters: readListParam(searchParams, "value", "values"),
    // Preserve unpaged legacy clients; paged clients must receive their cursor.
    ...(limit !== null ? { limit: Number(limit) } : {}),
    cursor: searchParams.get("cursor"),
  };
}

// Contact visibility is derived from connections/actor links, so the whole workspace domain is the watermark.
const CONTACTS_LIST_COLLECTIONS = ["contacts", "connections", "contact_detail_states", "contact_introductions", "contact_actor_links", "evidence"] as const;

export function createContactsGetHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  conditionalRead?: ConditionalReadDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    return await conditionalJsonRead(
      { routeKey: "contacts.list", request, actorId: actor.id, workspaceId: actor.workspaceId, collections: [...CONTACTS_LIST_COLLECTIONS] },
      conditionalRead ?? defaultConditionalReadDependencies(),
      async () => {
        const contactsService = createContactsListSearchAndFilterService();
        const result = await contactsService.listContacts({
          ...readContactsListInput(request),
          actorId: actor.id,
        });

        if (result.success === false) {
          const appError = contactsListSearchFailureToAppError(result);

          return NextResponse.json(
            failure(appError, contactsListSearchFailureContext(result, mode)),
            {
              headers: runtimeBoundaryHeaders(mode),
              status: getHttpStatusForAppErrorCode(appError.code),
            },
          );
        }

        return NextResponse.json(success(result.data), {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        });
      },
    );
  };
}
