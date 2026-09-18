import { readFile, stat } from "node:fs/promises";

const REDACTED = "[REDACTED]";

const sensitiveKeyPattern = /(?:authorization|body|content|cookie|email|password|secret|token)$/i;

const dynamicRouteSamples = {
  "/[...legacy]": ["legacyPath"],
  "/ai/[id]": ["aiConversationId"],
  "/chat/[id]": ["chatConversationId"],
  "/contacts/[id]": ["contactId"],
  "/contacts/analysis/[dimension]/[bucketId]": ["contactDimension", "contactBucketId"],
  "/contacts/new/batch/[id]": ["contactDraftBatchId"],
  "/contacts/new/batch2/[id]": ["contactDraftBatchId"],
  "/contacts/new/import/[id]": ["contactDraftBatchId"],
  "/events/[id]": ["eventId"],
  "/events/[id]/analytics": ["eventId"],
  "/events/[id]/attendees": ["eventId"],
  "/events/[id]/operations": ["eventId"],
  "/events/[id]/operations/admission": ["eventId"],
  "/events/[id]/operations/check-in": ["eventId"],
  "/events/[id]/operations/experience": ["eventId"],
  "/events/[id]/operations/roles": ["eventId"],
  "/events/[id]/register": ["eventId"],
  "/inbox/[id]": ["inboxConversationId"],
  "/inbox/notifications/[id]": ["notificationId"],
  "/inbox/sources/[id]": ["inboxSourceId"],
  "/invitations/[token]": ["invitationToken"],
  "/notes/[id]": ["noteId"],
  "/notes/[id]/edit": ["noteId"],
  "/o/[slug]": ["organizerSlug"],
  "/register/[code]": ["registrationCode"],
  "/schedule/events/[id]": ["eventId"],
  "/schedule/meetings/[id]": ["appointmentId"],
  "/schedule/personal/[id]": ["personalScheduleId"],
  "/tasks/[id]": ["taskId"],
};

function optionValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

export function parseJourneyArgs(args) {
  const options = {
    baseUrl: "http://127.0.0.1:32113",
    browsers: ["chromium", "webkit"],
    credentialsFile: "",
    evidenceDir: "build/phoneweb/pw-0003/run-01",
    inventoryFile: "../../docs/phoneweb/route-inventory.md",
    scope: "all",
    widths: [360, 390, 430],
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--base-url") options.baseUrl = optionValue(args, index++, argument);
    else if (argument === "--browsers") options.browsers = optionValue(args, index++, argument).split(",").filter(Boolean);
    else if (argument === "--credentials-file") options.credentialsFile = optionValue(args, index++, argument);
    else if (argument === "--evidence-dir") options.evidenceDir = optionValue(args, index++, argument);
    else if (argument === "--inventory-file") options.inventoryFile = optionValue(args, index++, argument);
    else if (argument === "--scope") options.scope = optionValue(args, index++, argument);
    else if (argument === "--widths") options.widths = optionValue(args, index++, argument).split(",").map(Number);
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.credentialsFile) throw new Error("--credentials-file is required.");
  const url = new URL(options.baseUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("--base-url must be an http local loopback address for PW-0003.");
  }
  if (!options.browsers.length || options.browsers.some((browser) => !["chromium", "webkit"].includes(browser))) {
    throw new Error("--browsers must contain chromium and/or webkit.");
  }
  if (!options.widths.length || options.widths.some((width) => !Number.isInteger(width) || width < 320 || width > 600)) {
    throw new Error("--widths must contain comma-separated integer mobile widths from 320 to 600.");
  }
  if (!["all", "journeys", "login", "note-contact", "contact"].includes(options.scope)) throw new Error("--scope must be all, journeys, login, note-contact, or contact.");
  options.baseUrl = url.origin;
  return options;
}

function countByStatus(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function assessRequiredChecks(results) {
  const failedRequiredIds = results
    .filter((result) => result.required && result.status !== "passed")
    .map((result) => result.id);

  return {
    counts: countByStatus(results),
    exitCode: failedRequiredIds.length > 0 ? 1 : 0,
    failedRequiredIds,
    results,
  };
}

export function mainScreenStatus({ alertCount, businessError, loading, overflow, pageErrorCount, selected }) {
  return selected && !overflow && !loading && alertCount === 0 && pageErrorCount === 0 && !businessError ? "passed" : "failed";
}

export function isKnownPlatformConsoleError(engine, text) {
  return engine === "webkit" && text === 'Viewport argument key "interactive-widget" not recognized and ignored.';
}

export function routeRenderStatus({ bodyLength, bodyVisible, businessError, httpStatus, loading, redirectedToLogin, runtimeErrorCount }) {
  if (!bodyVisible || bodyLength === 0) return "failed";
  if (redirectedToLogin) return "auth-redirect";
  if (typeof httpStatus === "number" && httpStatus >= 400) return "http-error";
  if ((runtimeErrorCount ?? 0) > 0) return "runtime-error";
  if (businessError) return "business-error";
  if (loading) return "loading";
  return "rendered";
}

export function parseRouteInventory(markdown) {
  const routes = [];
  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(/^\|\s*`(\/[^`]*)`\s*\|/u);
    if (match) routes.push(match[1]);
  }
  return routes;
}

export function buildInventoryPlan(markdown, samples) {
  return parseRouteInventory(markdown).map((route) => ({
    route,
    ...resolveInventoryRoute(route, samples),
  }));
}

export async function readCredentialsFile(path) {
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error("Credentials file must have mode 0600 (no group or other permissions).\n");
  }

  const parsed = JSON.parse(await readFile(path, "utf8"));
  const email = typeof parsed?.email === "string" ? parsed.email.trim() : "";
  const password = typeof parsed?.password === "string" ? parsed.password : "";
  if (!email || !password) throw new Error("Credentials file must contain non-empty email and password fields.");
  return { email, password };
}

export function redactEvidence(value) {
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKeyPattern.test(key) ? REDACTED : redactEvidence(item),
  ]));
}

function encodedSample(samples, key) {
  const value = samples[key];
  return typeof value === "string" && value.trim() ? encodeURIComponent(value.trim()) : null;
}

export function resolveInventoryRoute(route, samples) {
  if (!route.includes("[")) return { path: route, status: "ready" };

  const requirements = dynamicRouteSamples[route];
  if (!requirements) return { missing: "route-resolver", path: null, status: "missing-sample" };
  const missing = requirements.find((key) => !encodedSample(samples, key));
  if (missing) return { missing, path: null, status: "missing-sample" };

  if (route === "/[...legacy]") {
    const legacyPath = samples.legacyPath.trim();
    return { path: legacyPath.startsWith("/") ? legacyPath : `/${legacyPath}`, status: "ready" };
  }

  const replacements = {
    bucketId: encodedSample(samples, "contactBucketId"),
    code: encodedSample(samples, "registrationCode"),
    dimension: encodedSample(samples, "contactDimension"),
    id: encodedSample(samples, requirements.at(-1)),
    slug: encodedSample(samples, "organizerSlug"),
    token: encodedSample(samples, "invitationToken"),
  };
  const path = route.replace(/\[([^\]]+)\]/gu, (_match, parameter) => replacements[parameter]);
  return { path, status: "ready" };
}

export const phonewebDynamicRouteSamples = Object.freeze({ ...dynamicRouteSamples });
