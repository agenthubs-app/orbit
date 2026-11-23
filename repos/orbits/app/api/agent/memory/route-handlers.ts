/**
 * agent-design AG14: the handlers of the memory settings API (`/api/agent/memory`, `/[id]`, `/settings`), with the
 * identity as a dependency so the routes and their tests share one implementation. Every handler works on the scope
 * of the resolved canonical account and its workspace — the same scope the conversation reads and writes.
 *
 * What the settings page does here is the user's own action: it creates, changes and deletes without a card.
 */
import { NextResponse } from "next/server";
import type { AgentMemoryService } from "../../../../features/agent/memory/contract";
import { RECALL_CONSTRAINT_LIMIT } from "../../../../features/agent/memory/recall";
import {
  agentMemoryErrorResponse,
  agentMemoryUnauthorizedResponse,
  isAgentMemoryRecord,
  parseCreateAgentMemoryInput,
  parseUpdateAgentMemoryInput,
  resolveAgentMemoryRequest,
} from "./request";

export interface AgentMemoryRouteDependencies {
  resolve?: () => Promise<{ actorId: string; workspaceId: string; service: AgentMemoryService } | null>;
}

export function createAgentMemoryRouteHandlers({ resolve = resolveAgentMemoryRequest }: AgentMemoryRouteDependencies = {}) {
  return {
    async list(): Promise<Response> {
      const context = await resolve();
      if (!context) return agentMemoryUnauthorizedResponse();
      try {
        const snapshot = await context.service.snapshot();
        return NextResponse.json({ data: { memories: snapshot.entries, memoryVersion: snapshot.version, ruleLimit: RECALL_CONSTRAINT_LIMIT, settings: snapshot.settings } });
      } catch (error) {
        return agentMemoryErrorResponse(error, 503);
      }
    },
    async create(request: Request): Promise<Response> {
      const context = await resolve();
      if (!context) return agentMemoryUnauthorizedResponse();
      const input = parseCreateAgentMemoryInput(await request.json().catch(() => null));
      if (!input) return agentMemoryErrorResponse(new Error("category and content are required; appliesTo, structured, validFrom and validUntil must be valid when given."));
      try {
        const memory = await context.service.create(input);
        return NextResponse.json({ data: { memory } }, { status: 201 });
      } catch (error) {
        return agentMemoryErrorResponse(error);
      }
    },
    async update(request: Request, id: string): Promise<Response> {
      const context = await resolve();
      if (!context) return agentMemoryUnauthorizedResponse();
      const input = parseUpdateAgentMemoryInput(await request.json().catch(() => null));
      if (!input) return agentMemoryErrorResponse(new Error("A valid change of category, content, appliesTo, structured, validFrom or validUntil is required."));
      try {
        const memory = await context.service.update(id, input);
        return NextResponse.json({ data: { memory } });
      } catch (error) {
        return agentMemoryErrorResponse(error);
      }
    },
    async remove(request: Request, id: string): Promise<Response> {
      const context = await resolve();
      if (!context) return agentMemoryUnauthorizedResponse();
      // `?expectedRevision=n` deletes only the revision the page showed; without it the entry is deleted as it is.
      const said = new URL(request.url).searchParams.get("expectedRevision");
      const expectedRevision = said === null ? undefined : Number(said);
      if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) {
        return agentMemoryErrorResponse(new Error("expectedRevision must be a positive whole number."));
      }
      try {
        await context.service.remove(id, expectedRevision !== undefined ? { expectedRevision } : {});
        return new Response(null, { status: 204 });
      } catch (error) {
        return agentMemoryErrorResponse(error);
      }
    },
    async updateSettings(request: Request): Promise<Response> {
      const context = await resolve();
      if (!context) return agentMemoryUnauthorizedResponse();
      const body = await request.json().catch(() => null);
      if (
        !isAgentMemoryRecord(body) ||
        (body.enabled !== undefined && typeof body.enabled !== "boolean") ||
        (body.allowConversationLearning !== undefined && typeof body.allowConversationLearning !== "boolean")
      ) {
        return agentMemoryErrorResponse(new Error("Memory settings must use boolean values."));
      }
      try {
        const settings = await context.service.updateSettings({
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          allowConversationLearning: typeof body.allowConversationLearning === "boolean" ? body.allowConversationLearning : undefined,
        });
        return NextResponse.json({ data: { settings } });
      } catch (error) {
        return agentMemoryErrorResponse(error);
      }
    },
  };
}
