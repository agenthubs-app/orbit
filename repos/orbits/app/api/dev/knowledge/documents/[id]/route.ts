import { readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { NextResponse } from "next/server";
import { failure, success } from "../../../../../../shared/api/envelope";
import { AppError } from "../../../../../../shared/errors/app-error";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../../../../../shared/knowledge/knowledge-manifest";

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

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function resolveProjectRoot() {
  const cwd = resolve(process.cwd());

  if (basename(cwd) === "orbits" && basename(dirname(cwd)) === "repos") {
    return resolve(cwd, "../..");
  }

  return cwd;
}

function isInsideProjectRoot(projectRoot: string, documentPath: string) {
  const relativePath = relative(projectRoot, documentPath);

  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function errorResponse(error: AppError, status: number): Response {
  return NextResponse.json(failure(error), {
    headers: DEV_KNOWLEDGE_HEADERS,
    status,
  });
}

function notFoundResponse(message = "Knowledge document was not found."): Response {
  return errorResponse(new AppError("NOT_FOUND", message), 404);
}

export async function GET(
  _request: Request,
  context: KnowledgeDocumentRouteContext,
): Promise<Response> {
  if (isProductionRuntime()) {
    return notFoundResponse("Knowledge document content is only available in development.");
  }

  const { id } = await context.params;
  const document = ORBIT_KNOWLEDGE_MANIFEST.documents.find((entry) => entry.id === id);

  if (!document) {
    return notFoundResponse();
  }

  const projectRoot = resolveProjectRoot();
  const absolutePath = resolve(projectRoot, document.sourcePath);

  if (!isInsideProjectRoot(projectRoot, absolutePath)) {
    return errorResponse(
      new AppError("FORBIDDEN", "Knowledge document path is outside the project root."),
      403,
    );
  }

  try {
    const markdown = await readFile(join(projectRoot, document.sourcePath), "utf8");

    return NextResponse.json(
      success({
        id: document.id,
        markdown,
        sourcePath: document.sourcePath,
        titleZh: document.titleZh,
      }),
      {
        headers: DEV_KNOWLEDGE_HEADERS,
        status: 200,
      },
    );
  } catch (error) {
    return errorResponse(
      new AppError("NOT_FOUND", "Knowledge document file could not be read.", {
        cause: error,
      }),
      404,
    );
  }
}
