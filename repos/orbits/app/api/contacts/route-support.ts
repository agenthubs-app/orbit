import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
} from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import {
  contactsListSearchFailureContext,
  contactsListSearchFailureToAppError,
} from "../../../features/contacts/service";
import type { ContactsListSearchFailure } from "../../../features/contacts/contract";

export function readContactFilterList(
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

export function contactsListSearchFailureResponse(
  result: ContactsListSearchFailure,
  mode: FeatureMode,
): Response {
  const appError = contactsListSearchFailureToAppError(result);

  return NextResponse.json(
    failure(appError, contactsListSearchFailureContext(result, mode)),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}
