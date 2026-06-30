import "../../globals.css";
import { AppError } from "../../../shared/errors/app-error";
import { ORBIT_KNOWLEDGE_MANIFEST } from "../../../shared/knowledge/knowledge-manifest";
import {
  OrbitKnowledgeWiki,
  type DocumentContentState,
  type WikiPage,
} from "./knowledge-wiki";
import { readDevKnowledgeDocumentContent } from "./read-knowledge-document";

type KnowledgePageSearchParams = {
  category?: string | string[];
  document?: string | string[];
  history?: string | string[];
  learning?: string | string[];
  page?: string | string[];
  topic?: string | string[];
};

function readSearchParam(
  searchParams: KnowledgePageSearchParams | undefined,
  key: keyof KnowledgePageSearchParams,
) {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}

function readInitialPage(
  searchParams: KnowledgePageSearchParams | undefined,
): WikiPage {
  const documentId = readSearchParam(searchParams, "document");
  const document = documentId
    ? ORBIT_KNOWLEDGE_MANIFEST.documents.find((item) => item.id === documentId)
    : undefined;
  if (document) return { kind: "document", id: document.id };

  const topicId = readSearchParam(searchParams, "topic");
  const topic = topicId
    ? ORBIT_KNOWLEDGE_MANIFEST.topicPages.find((item) => item.id === topicId)
    : undefined;
  if (topic) return { kind: "topic", id: topic.id };

  const historyId = readSearchParam(searchParams, "history");
  const history = historyId
    ? ORBIT_KNOWLEDGE_MANIFEST.recentHistory.find((item) => item.id === historyId)
    : undefined;
  if (history) return { kind: "history", id: history.id };

  const learningId = readSearchParam(searchParams, "learning");
  const learning = learningId
    ? ORBIT_KNOWLEDGE_MANIFEST.learnings.find((item) => item.id === learningId)
    : undefined;
  if (learning) return { kind: "learning", id: learning.id };

  return readSearchParam(searchParams, "page") === "index"
    ? { kind: "index" }
    : { kind: "main" };
}

function readInitialCategory(
  searchParams: KnowledgePageSearchParams | undefined,
) {
  const category = readSearchParam(searchParams, "category");
  if (!category) return undefined;

  return ORBIT_KNOWLEDGE_MANIFEST.documents.some((document) => document.category === category)
    ? category
    : undefined;
}

async function readInitialDocumentContent(
  documentId: string,
): Promise<{ content: DocumentContentState; documentId: string }> {
  try {
    const content = await readDevKnowledgeDocumentContent(documentId);

    return {
      content: {
        markdown: content.markdown,
        sourcePath: content.sourcePath,
        status: "loaded",
        titleZh: content.titleZh,
      },
      documentId,
    };
  } catch (error) {
    return {
      content: {
        message: error instanceof AppError ? error.message : "无法读取文档正文。",
        status: "error",
      },
      documentId,
    };
  }
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams?: Promise<KnowledgePageSearchParams>;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialPage = readInitialPage(resolvedSearchParams);
  const initialDocument = initialPage.kind === "document"
    ? ORBIT_KNOWLEDGE_MANIFEST.documents.find((document) => document.id === initialPage.id)
    : undefined;
  const initialDocumentContent = initialDocument
    ? await readInitialDocumentContent(initialDocument.id)
    : undefined;

  return (
    <OrbitKnowledgeWiki
      initialDocumentContent={initialDocumentContent}
      initialCategory={readInitialCategory(resolvedSearchParams)}
      initialPage={initialPage}
    />
  );
}
