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

export const dynamic = "force-dynamic";

function readListParam(
  searchParams: URLSearchParams,
  singularName: string,
  pluralName: string,
): string[] {
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

  return {
    query: searchParams.get("query"),
    scenario: searchParams.get("scenario"),
    sourceFilters: readListParam(searchParams, "source", "sources"),
    statusFilters: readListParam(searchParams, "status", "statuses"),
    tagFilters: readListParam(searchParams, "tag", "tags"),
    valueFilters: readListParam(searchParams, "value", "values"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const contactsService = createContactsListSearchAndFilterService();
  const result = contactsService.listContacts(readContactsListInput(request));

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
}
