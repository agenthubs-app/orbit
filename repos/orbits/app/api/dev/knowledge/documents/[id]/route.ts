import { NextResponse } from "next/server";
import { readDevKnowledgeDocumentContent } from "../../../../../dev/knowledge/read-knowledge-document";
import { failure, success } from "../../../../../../shared/api/envelope";
import {
  AppError,
  getHttpStatusForAppErrorCode,
  toAppError,
} from "../../../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

const DEV_KNOWLEDGE_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Orbit-Dev-Knowledge": "document-content",
  "X-Orbit-Privacy": "developer-debug-document-content",
  "X-Orbit-Runtime-Boundary": "developer-admin",
} as const;

interface KnowledgeDocumentRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function errorResponse(error: AppError, status: number): Response {
  return NextResponse.json(failure(error), {
    headers: DEV_KNOWLEDGE_HEADERS,
    status,
  });
}

export async function GET(
  _request: Request,
  context: KnowledgeDocumentRouteContext,
): Promise<Response> {
  const { id } = await context.params;

  try {
    const content = await readDevKnowledgeDocumentContent(id);

    return NextResponse.json(success(content), {
      headers: DEV_KNOWLEDGE_HEADERS,
      status: 200,
    });
  } catch (error) {
    const appError = toAppError(error);

    return errorResponse(appError, getHttpStatusForAppErrorCode(appError.code));
  }
}
