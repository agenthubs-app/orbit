import { readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { AppError } from "../../../shared/errors/app-error";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../../shared/knowledge/knowledge-manifest";

export interface KnowledgeDocumentContent {
  id: string;
  markdown: string;
  originalSourcePath: string;
  sourcePath: string;
  titleZh: string;
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

export async function readDevKnowledgeDocumentContent(
  id: string,
): Promise<KnowledgeDocumentContent> {
  if (isProductionRuntime()) {
    throw new AppError(
      "NOT_FOUND",
      "Knowledge document content is only available in development.",
    );
  }

  const document = ORBIT_KNOWLEDGE_MANIFEST.documents.find((entry) => entry.id === id);

  if (!document) {
    throw new AppError("NOT_FOUND", "Knowledge document was not found.");
  }

  const projectRoot = resolveProjectRoot();
  const localizedSourcePath = document.localizedSourcePath;

  if (!localizedSourcePath) {
    throw new AppError("NOT_FOUND", "Knowledge document Chinese mirror was not found.");
  }

  const absolutePath = resolve(projectRoot, localizedSourcePath);

  if (!isInsideProjectRoot(projectRoot, absolutePath)) {
    throw new AppError("FORBIDDEN", "Knowledge document path is outside the project root.");
  }

  try {
    return {
      id: document.id,
      markdown: await readFile(absolutePath, "utf8"),
      originalSourcePath: document.sourcePath,
      sourcePath: localizedSourcePath,
      titleZh: document.titleZh,
    };
  } catch (error) {
    throw new AppError("NOT_FOUND", "Knowledge document file could not be read.", {
      cause: error,
    });
  }
}
