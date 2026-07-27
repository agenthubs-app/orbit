import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE_ROOT = path.resolve(PRODUCT_ROOT, "../..");
const APP_ROOT = path.join(PRODUCT_ROOT, "app");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "docs/audits");
const AUTH_ROUTING_FILE = path.join(
  PRODUCT_ROOT,
  "features/auth/app-auth-routing.ts",
);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const INTERACTION_ATTRIBUTES = new Set([
  "onclick",
  "onpointerdown",
  "onpointerup",
  "onkeydown",
  "onkeyup",
  "onsubmit",
]);
const WRITE_HINT =
  /(accept|approve|cancel|confirm|create|delete|dismiss|execute|import|merge|register|reject|remove|run|save|send|sign.?out|submit|transition|undo|update|upload)/i;

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function relativeToWorkspace(filePath) {
  return toPosix(path.relative(WORKSPACE_ROOT, filePath));
}

function listFiles(root, predicate) {
  const files = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".next" || entry.name === "node_modules") {
      continue;
    }

    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath, predicate));
    } else if (predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function isProductionPage(filePath) {
  if (path.basename(filePath) !== "page.tsx" && path.basename(filePath) !== "page.ts") {
    return false;
  }

  const relative = toPosix(path.relative(APP_ROOT, filePath));
  return !relative.startsWith("api/") && !relative.startsWith("dev/");
}

function routeFromPage(filePath) {
  const relativeDirectory = path.dirname(path.relative(APP_ROOT, filePath));
  const segments =
    relativeDirectory === "."
      ? []
      : relativeDirectory
          .split(path.sep)
          .filter(
            (segment) =>
              !(segment.startsWith("(") && segment.endsWith(")")) &&
              !segment.startsWith("@"),
          );

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function readPrivatePrefixes() {
  const sourceText = readFileSync(AUTH_ROUTING_FILE, "utf8");
  const source = ts.createSourceFile(
    AUTH_ROUTING_FILE,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const prefixes = [];

  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }

    for (const declaration of node.declarationList.declarations) {
      if (
        declaration.name.getText(source) !== "ORBIT_PRIVATE_APP_PREFIXES" ||
        !declaration.initializer
      ) {
        continue;
      }

      const initializer = ts.isAsExpression(declaration.initializer)
        ? declaration.initializer.expression
        : declaration.initializer;
      if (!ts.isArrayLiteralExpression(initializer)) {
        continue;
      }

      for (const element of initializer.elements) {
        if (ts.isStringLiteral(element)) {
          prefixes.push(element.text);
        }
      }
    }
  });

  if (prefixes.length === 0) {
    throw new Error(
      `Could not read ORBIT_PRIVATE_APP_PREFIXES from ${relativeToWorkspace(
        AUTH_ROUTING_FILE,
      )}`,
    );
  }

  return prefixes.sort();
}

function matchesPrefix(route, prefix) {
  return route === prefix || route.startsWith(`${prefix}/`);
}

function accessForRoute(route, privatePrefixes) {
  if (privatePrefixes.some((prefix) => matchesPrefix(route, prefix))) {
    return {
      policy: "authenticated",
      anonymousBehavior: "redirect:/app/account/login?next=<safe-local-route>",
      authenticatedBehavior: "allow",
      evidence: relativeToWorkspace(AUTH_ROUTING_FILE),
      runtimeAuthorization: "requires-browser-verification",
    };
  }

  if (matchesPrefix(route, "/app/account")) {
    return {
      policy: "public-auth-entry",
      anonymousBehavior: "allow",
      authenticatedBehavior: "allow; redirect behavior requires browser verification",
      evidence: relativeToWorkspace(AUTH_ROUTING_FILE),
      runtimeAuthorization: "requires-browser-verification",
    };
  }

  return {
    policy: "public-at-proxy",
    anonymousBehavior: "allow at proxy boundary",
    authenticatedBehavior: "allow at proxy boundary",
    evidence: relativeToWorkspace(AUTH_ROUTING_FILE),
    runtimeAuthorization: "page/server authorization requires verification",
  };
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const unresolved = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    unresolved,
    ...SOURCE_EXTENSIONS.map((extension) => `${unresolved}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) =>
      path.join(unresolved, `index${extension}`),
    ),
  ];

  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  ) ?? null;
}

function sourceFileFor(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const extension = path.extname(filePath);
  const scriptKind =
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".jsx"
        ? ts.ScriptKind.JSX
        : extension === ".js" || extension === ".mjs"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  return {
    source: ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    ),
    sourceText,
  };
}

function collectReachableSources(entryFile) {
  const visited = new Set();
  const queue = [entryFile];

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath || visited.has(filePath)) {
      continue;
    }

    visited.add(filePath);
    const { source } = sourceFileFor(filePath);

    source.forEachChild((node) => {
      if (
        !ts.isImportDeclaration(node) ||
        !ts.isStringLiteral(node.moduleSpecifier)
      ) {
        return;
      }

      const resolved = resolveImport(filePath, node.moduleSpecifier.text);
      if (
        resolved &&
        resolved.startsWith(PRODUCT_ROOT) &&
        !resolved.includes(`${path.sep}app${path.sep}api${path.sep}`) &&
        !resolved.includes(`${path.sep}app${path.sep}dev${path.sep}`)
      ) {
        queue.push(resolved);
      }
    });
  }

  return [...visited].sort();
}

function attributeMap(attributes, source) {
  const result = new Map();

  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      result.set("__spread", property.expression.getText(source));
      continue;
    }

    if (!ts.isJsxAttribute(property)) {
      continue;
    }

    const name = property.name.getText(source).toLowerCase();
    if (!property.initializer) {
      result.set(name, "true");
    } else if (ts.isStringLiteral(property.initializer)) {
      result.set(name, property.initializer.text);
    } else if (ts.isJsxExpression(property.initializer)) {
      result.set(
        name,
        property.initializer.expression?.getText(source) ?? "{expression}",
      );
    } else {
      result.set(name, property.initializer.getText(source));
    }
  }

  return result;
}

function staticChildText(node, source) {
  if (!ts.isJsxElement(node)) {
    return "";
  }

  return node.children
    .map((child) => {
      if (ts.isJsxText(child)) {
        return child.text;
      }
      if (
        ts.isJsxExpression(child) &&
        child.expression
      ) {
        if (
          ts.isStringLiteral(child.expression) ||
          ts.isNoSubstitutionTemplateLiteral(child.expression)
        ) {
          return child.expression.text;
        }
        if (
          ts.isIdentifier(child.expression) ||
          ts.isPropertyAccessExpression(child.expression) ||
          ts.isElementAccessExpression(child.expression)
        ) {
          return `{${child.expression.getText(source)}}`;
        }
      }
      if (ts.isJsxElement(child)) {
        return staticChildText(child, source);
      }
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getJsxParts(node) {
  if (ts.isJsxElement(node)) {
    return {
      tagName: node.openingElement.tagName.getText(),
      attributes: node.openingElement.attributes,
    };
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return {
      tagName: node.tagName.getText(),
      attributes: node.attributes,
    };
  }
  return null;
}

function interactionKind(tagName, attributes) {
  const normalizedTag = tagName.toLowerCase();
  const role = attributes.get("role")?.toLowerCase();
  const names = new Set(attributes.keys());

  if (normalizedTag === "button") return "button";
  if (normalizedTag === "a" || tagName === "Link") return "link";
  if (normalizedTag === "form") return "form-submit";
  if (role === "button") return "role-button";
  if (names.has("onkeydown") || names.has("onkeyup")) return "keyboard-handler";
  if (
    names.has("onclick") ||
    names.has("onpointerup") ||
    names.has("onsubmit")
  ) {
    return "click-handler";
  }
  return null;
}

function hasSubmitAncestor(node, source) {
  let parent = node.parent;
  while (parent && !ts.isSourceFile(parent)) {
    if (ts.isJsxElement(parent)) {
      const tagName = parent.openingElement.tagName.getText(source).toLowerCase();
      if (tagName === "form") {
        return true;
      }
    }
    parent = parent.parent;
  }
  return false;
}

function classifyReadWrite(kind, attributes, label, handlerText) {
  if (kind === "link") {
    return "read/navigation";
  }

  const method = attributes.get("method")?.toLowerCase();
  if (kind === "form-submit" && method === "get") {
    return "read/query";
  }

  return WRITE_HINT.test(`${label} ${handlerText}`)
    ? "write-or-external-effect"
    : "unknown-requires-runtime-verification";
}

function staticSelectorFromExpression(node, source, supportsIdHelper) {
  if (!node) {
    return null;
  }

  if (ts.isCallExpression(node)) {
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "querySelector" ||
        node.expression.name.text === "querySelectorAll")
    ) {
      const selector = node.arguments[0];
      if (
        selector &&
        (ts.isStringLiteral(selector) ||
          ts.isNoSubstitutionTemplateLiteral(selector))
      ) {
        return selector.text;
      }
    }

    if (
      supportsIdHelper &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "$"
    ) {
      const id = node.arguments[0];
      if (
        id &&
        (ts.isStringLiteral(id) || ts.isNoSubstitutionTemplateLiteral(id))
      ) {
        return `#${id.text}`;
      }
    }
  }

  let discovered = null;
  ts.forEachChild(node, (child) => {
    if (!discovered) {
      discovered = staticSelectorFromExpression(
        child,
        source,
        supportsIdHelper,
      );
    }
  });
  return discovered;
}

function collectImperativeBindings(filePaths) {
  const bindings = [];

  for (const filePath of filePaths) {
    const { source, sourceText } = sourceFileFor(filePath);
    const selectorsByVariable = new Map();
    const supportsIdHelper =
      /\bconst\s+\$\s*=\s*\(?\s*id\s*\)?\s*=>\s*host\.querySelector\(\s*["']#["']\s*\+\s*id\s*\)/.test(
        sourceText,
      );

    function selectorForExpression(node) {
      if (ts.isIdentifier(node) && selectorsByVariable.has(node.text)) {
        return selectorsByVariable.get(node.text);
      }
      return staticSelectorFromExpression(node, source, supportsIdHelper);
    }

    function recordBinding(selector, call) {
      const event = call.arguments[0];
      if (
        !selector ||
        !event ||
        (!ts.isStringLiteral(event) &&
          !ts.isNoSubstitutionTemplateLiteral(event))
      ) {
        return;
      }

      const position = source.getLineAndCharacterOfPosition(call.getStart(source));
      bindings.push({
        selector,
        event: event.text,
        sourceFile: relativeToWorkspace(filePath),
        line: position.line + 1,
      });
    }

    function discoverVariables(node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const selector = selectorForExpression(node.initializer);
        if (selector) {
          selectorsByVariable.set(node.name.text, selector);
        }
      }
      ts.forEachChild(node, discoverVariables);
    }

    discoverVariables(source);

    function discoverBindings(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "addEventListener"
      ) {
        recordBinding(selectorForExpression(node.expression.expression), node);
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === "forEach" ||
          node.expression.name.text === "map")
      ) {
        const selector = selectorForExpression(node.expression.expression);
        const callback = node.arguments[0];
        if (
          selector &&
          callback &&
          (ts.isArrowFunction(callback) ||
            ts.isFunctionExpression(callback)) &&
          callback.parameters.length > 0 &&
          ts.isIdentifier(callback.parameters[0].name)
        ) {
          const itemName = callback.parameters[0].name.text;
          function discoverItemBindings(child) {
            if (
              ts.isCallExpression(child) &&
              ts.isPropertyAccessExpression(child.expression) &&
              child.expression.name.text === "addEventListener" &&
              ts.isIdentifier(child.expression.expression) &&
              child.expression.expression.text === itemName
            ) {
              recordBinding(selector, child);
            }
            ts.forEachChild(child, discoverItemBindings);
          }
          discoverItemBindings(callback.body);
        }
      }

      ts.forEachChild(node, discoverBindings);
    }

    discoverBindings(source);
  }

  return [
    ...new Map(
      bindings.map((binding) => [
        `${binding.selector}:${binding.event}:${binding.sourceFile}:${binding.line}`,
        binding,
      ]),
    ).values(),
  ];
}

function imperativeBindingFor(attributes, imperativeBindings) {
  const selectors = [];
  const id = attributes.get("id");
  if (id && !id.includes("{")) {
    selectors.push(`#${id}`);
  }

  const className = attributes.get("classname") ?? attributes.get("class");
  if (className && !className.includes("{")) {
    selectors.push(
      ...className
        .split(/\s+/)
        .filter(Boolean)
        .map((name) => `.${name}`),
    );
  }

  for (const name of attributes.keys()) {
    if (name.startsWith("data-")) {
      selectors.push(`[${name}]`);
    }
  }

  const matching = imperativeBindings.filter((binding) =>
    selectors.includes(binding.selector),
  );
  return matching.length > 0 ? matching : null;
}

function collectInteractions(filePath, imperativeBindings = []) {
  const { source, sourceText } = sourceFileFor(filePath);
  const interactions = [];

  function visit(node) {
    const parts = getJsxParts(node);
    if (parts) {
      const attributes = attributeMap(parts.attributes, source);
      const kind = interactionKind(parts.tagName, attributes);

      if (kind) {
        const start = source.getLineAndCharacterOfPosition(node.getStart(source));
        const childText = staticChildText(node, source);
        const label =
          attributes.get("aria-label") ??
          attributes.get("title") ??
          childText ??
          "";
        const handlerNames = [...attributes.keys()].filter((name) =>
          INTERACTION_ATTRIBUTES.has(name),
        );
        const handlerText = handlerNames
          .map((name) => attributes.get(name))
          .filter(Boolean)
          .join(" ");
        const href = attributes.get("href") ?? null;
        const delegatesProps = attributes.has("__spread");
        const imperativeBehavior = imperativeBindingFor(
          attributes,
          imperativeBindings,
        );
        const sourceSlice = sourceText.slice(node.getStart(source), node.getEnd());
        const isSubmitButton =
          parts.tagName.toLowerCase() === "button" &&
          attributes.get("type") !== "button" &&
          hasSubmitAncestor(node, source);
        const behaviorEvidence =
          href !== null ||
          handlerNames.length > 0 ||
          (kind === "button" && isSubmitButton) ||
          imperativeBehavior !== null;
        const accessibleName =
          kind === "form-submit" ||
          label.length > 0 ||
          attributes.has("aria-labelledby") ||
          (parts.tagName.toLowerCase() === "input" &&
            attributes.has("value"));
        const accessibleNameEvidence =
          kind === "form-submit"
            ? "not-applicable-container"
            : accessibleName
              ? label.startsWith("{")
                ? "dynamic-runtime"
                : "present-static"
          : delegatesProps
            ? "delegated-props"
            : "unresolved-static";
        const behaviorEvidenceStatus = behaviorEvidence
          ? imperativeBehavior !== null &&
            href === null &&
            handlerNames.length === 0 &&
            !(kind === "button" && isSubmitButton)
            ? "present-imperative-static"
            : "present-static"
          : delegatesProps
            ? "delegated-props"
            : "missing-static";

        interactions.push({
          sourceFile: relativeToWorkspace(filePath),
          line: start.line + 1,
          kind,
          tag: parts.tagName,
          label: label || null,
          accessibleName: accessibleNameEvidence,
          href,
          handlers:
            handlerNames.length > 0
              ? handlerNames
              : (imperativeBehavior?.map(
                  (binding) => `addEventListener:${binding.event}`,
                ) ?? []),
          behaviorEvidence: behaviorEvidenceStatus,
          imperativeBehaviorEvidence:
            imperativeBehavior?.map((binding) => ({
              selector: binding.selector,
              event: binding.event,
              sourceFile: binding.sourceFile,
              line: binding.line,
            })) ?? [],
          readWrite: classifyReadWrite(kind, attributes, label, handlerText),
          confirmation:
            /confirm|confirmation|dialog/i.test(sourceSlice)
              ? "present-static"
              : "unknown-requires-runtime-verification",
          retry: /retry/i.test(sourceSlice)
            ? "present-static"
            : "unknown-requires-runtime-verification",
          undoCompensation: /undo|compensat/i.test(sourceSlice)
            ? "present-static"
            : "unknown-requires-runtime-verification",
          loadingOrDisabled:
            attributes.has("disabled") ||
            /pending|loading|submitting|executing/i.test(sourceSlice)
              ? "present-static"
              : "unknown-requires-runtime-verification",
          feedback:
            /toast|success|error|failed|feedback|status/i.test(sourceSlice)
              ? "present-static"
              : "unknown-requires-runtime-verification",
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return interactions;
}

function inferPurpose(route) {
  const purposes = [
    [/^\/$/, "Public landing and Agent entry"],
    [/^\/app$/, "Public product entry"],
    [/\/account\/login$/, "User sign in"],
    [/\/account\/signup$/, "User account creation"],
    [/\/account\/forgot-password$/, "Password recovery"],
    [/\/account\/mobile-google$/, "Mobile Google authentication completion"],
    [/\/admin\/access$/, "Admin access entry"],
    [/\/admin\/events$/, "Admin event operations"],
    [/\/admin$/, "Admin operations"],
    [/\/agent$/, "Relationship operations Agent"],
    [/\/chat$/, "Relationship inbox and conversations"],
    [/\/contacts\/\[id\]$/, "Contact identity and relationship detail"],
    [/\/contacts\/all-actions$/, "Cross-contact action ledger"],
    [/\/contacts\/dashboard$/, "Relationship analytics dashboard"],
    [/\/contacts\/graph$/, "Relationship graph"],
    [/\/contacts\/intros$/, "Introduction workflow"],
    [/\/contacts\/new$/, "Contact acquisition"],
    [/\/contacts\/pipeline$/, "Relationship pipeline"],
    [/\/contacts$/, "Contact list and discovery"],
    [/\/events\/\[id\]\/register$/, "Event registration"],
    [/\/events\/\[id\]$/, "Event detail and event operations"],
    [/\/events$/, "Event discovery"],
    [/\/party\/checkin$/, "Party attendee check-in"],
    [/\/party\/graph$/, "Party relationship graph"],
    [/\/party$/, "Live event party workspace"],
    [/\/schedule\/events\/\[id\]$/, "Scheduled event detail"],
    [/\/schedule$/, "Calendar and schedule"],
    [/\/today$/, "Today timeline and action review"],
    [/\/settings$/, "User, Agent, memory, automation, and appearance settings"],
    [/\/profile$/, "User profile"],
    [/\/platform$/, "Platform entry"],
    [/\/o\/\[slug\]$/, "Organizer public profile"],
    [/\/register$/, "Legacy registration entry"],
    [/\/login-admin$/, "Legacy admin sign in entry"],
    [/\/home\/events$/, "Home event feed"],
    [/\/home$/, "Authenticated home"],
    [/\/dashboard$/, "Relationship dashboard"],
    [/\/followups$/, "Follow-up workspace"],
  ];

  return (
    purposes.find(([pattern]) => pattern.test(route))?.[1] ??
    "Production application surface; purpose requires product review"
  );
}

function collectSpecialStates(pageFile) {
  const stateFiles = {
    loading: [],
    error: [],
    notFound: [],
  };
  let current = path.dirname(pageFile);

  while (current.startsWith(APP_ROOT)) {
    for (const [state, names] of Object.entries({
      loading: ["loading.tsx", "loading.ts"],
      error: ["error.tsx", "error.ts"],
      notFound: ["not-found.tsx", "not-found.ts"],
    })) {
      for (const name of names) {
        const candidate = path.join(current, name);
        if (existsSync(candidate)) {
          stateFiles[state].push(relativeToWorkspace(candidate));
        }
      }
    }

    if (current === APP_ROOT) break;
    current = path.dirname(current);
  }

  return stateFiles;
}

function detectDataAndStates(reachableFiles) {
  const evidence = [];
  const combined = reachableFiles
    .map((filePath) => {
      const text = readFileSync(filePath, "utf8");
      evidence.push({ filePath, text });
      return text;
    })
    .join("\n");
  const sourceKinds = [];

  if (/\blive\b|live-record|configuredLive|postgres/i.test(combined)) {
    sourceKinds.push("Live");
  }
  if (/\bmock\b|mock-service|shared\/mock/i.test(combined)) {
    sourceKinds.push("Mock");
  }
  if (/\bfixture\b|fixtures/i.test(combined)) {
    sourceKinds.push("Fixture");
  }
  if (/derived|recompute|aggregate|score/i.test(combined)) {
    sourceKinds.push("Derived");
  }
  if (/AI Generated|ai-provider|DeepSeek|Gemini|OrbitAi/i.test(combined)) {
    sourceKinds.push("AI Generated");
  }
  if (/user confirmed|confirmedBy|confirmation/i.test(combined)) {
    sourceKinds.push("User Confirmed");
  }
  if (/externally executed|providerReceipt|external action/i.test(combined)) {
    sourceKinds.push("Externally Executed");
  }

  const directMockImports = evidence.flatMap(({ filePath, text }) =>
    text
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line }) =>
          /^\s*import\b/.test(line) &&
          /(shared\/mock|mock-service|mock-provider|mock-fixture)/i.test(line),
      )
      .map(({ line, index }) => ({
        sourceFile: relativeToWorkspace(filePath),
        line: index + 1,
        import: line.trim().replace(/\s+/g, " "),
      })),
  );

  return {
    sourceKinds: sourceKinds.length > 0 ? sourceKinds : ["Unclassified"],
    dependencies: {
      database: /postgres|database|live-record|configuredLive/i.test(combined),
      aiProvider: /DeepSeek|Gemini|ai-provider|OrbitAi/i.test(combined),
      externalIntegration:
        /oauth|integration|external calendar|providerReceipt|google calendar/i.test(
          combined,
        ),
    },
    stateSignals: {
      loading: /loading|pending|skeleton/i.test(combined),
      empty: /\bempty\b|no results|not found/i.test(combined),
      partial: /\bpartial\b|degraded/i.test(combined),
      error: /\berror\b|failed|failure/i.test(combined),
      permissionDenied: /permission denied|unauthori[sz]ed|forbidden/i.test(combined),
    },
    responsiveSignals: {
      mobile: /mobile|@media\s*\([^)]*max-width/i.test(combined),
      desktop: /desktop|@media\s*\([^)]*min-width/i.test(combined),
    },
    directMockImports,
  };
}

function collectTestCoverage(route, pageFile, testFiles) {
  const pageRelativeToProduct = toPosix(path.relative(PRODUCT_ROOT, pageFile));
  const routeWithoutParameters = route.replace(/\[[^/]+\]/g, "");
  const needles = [
    route,
    routeWithoutParameters,
    pageRelativeToProduct,
    path.basename(path.dirname(pageFile)),
  ].filter((needle) => needle.length > 3);

  return testFiles
    .filter((testFile) => {
      const source = readFileSync(testFile, "utf8");
      return needles.some((needle) => source.includes(needle));
    })
    .map(relativeToWorkspace)
    .slice(0, 30);
}

function buildRisks(route, interactions, dataAudit, specialStates) {
  const risks = [];

  for (const action of interactions) {
    if (action.accessibleName === "unresolved-static") {
      risks.push({
        severity: "P1",
        type: "accessible-name-unresolved",
        route,
        sourceFile: action.sourceFile,
        line: action.line,
        trigger: `${action.tag} ${action.kind}`,
        userImpact: "Assistive technology may not expose a meaningful action name.",
        status: "open-needs-runtime-verification",
        nextAction: "Inspect rendered accessible name and add a stable label if absent.",
      });
    }
    if (action.behaviorEvidence === "missing-static") {
      risks.push({
        severity: "P0",
        type: "behavior-missing-static",
        route,
        sourceFile: action.sourceFile,
        line: action.line,
        trigger: `${action.tag} ${action.label ?? "(unlabelled)"}`,
        userImpact: "Visible control may not perform an action.",
        status: "open-needs-runtime-verification",
        nextAction: "Verify DOM behavior; wire a real handler/href or explain unavailability.",
      });
    }
    if (action.kind === "link" && !action.href) {
      risks.push({
        severity: "P0",
        type: "link-without-static-href",
        route,
        sourceFile: action.sourceFile,
        line: action.line,
        trigger: action.label ?? "unlabelled link",
        userImpact: "Navigation target cannot be proven statically.",
        status: "open-needs-runtime-verification",
        nextAction: "Resolve the rendered href and validate it against the route manifest.",
      });
    }
  }

  for (const mockImport of dataAudit.directMockImports) {
    risks.push({
      severity: "P0",
      type: "production-reachable-direct-mock-import",
      route,
      sourceFile: mockImport.sourceFile,
      line: mockImport.line,
      trigger: mockImport.import,
      userImpact: "Production route may expose Mock data as a business result.",
      status: "open-needs-code-review",
      nextAction:
        "Classify the import as a factory-isolated test path, explicit demo mode, or remove it from production reachability.",
    });
  }

  if (specialStates.loading.length === 0 && !dataAudit.stateSignals.loading) {
    risks.push({
      severity: "P1",
      type: "loading-state-unproven",
      route,
      sourceFile: null,
      line: null,
      trigger: "initial route load",
      userImpact: "Slow data may render without clear progress feedback.",
      status: "open-needs-runtime-verification",
      nextAction: "Verify a throttled load and add a shared loading state if absent.",
    });
  }
  if (specialStates.error.length === 0 && !dataAudit.stateSignals.error) {
    risks.push({
      severity: "P1",
      type: "error-state-unproven",
      route,
      sourceFile: null,
      line: null,
      trigger: "route dependency failure",
      userImpact: "Failure recovery may be missing or unclear.",
      status: "open-needs-runtime-verification",
      nextAction: "Force the route dependency to fail and verify controlled recovery.",
    });
  }

  return risks;
}

function stableGitMetadata() {
  try {
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim(),
      generatedAt: execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim(),
    };
  } catch {
    return {
      commit: "unknown",
      generatedAt: "unknown",
    };
  }
}

export function buildProductSurfaceManifest() {
  const privatePrefixes = readPrivatePrefixes();
  const pageFiles = listFiles(APP_ROOT, isProductionPage);
  const testFiles = listFiles(
    path.join(PRODUCT_ROOT, "tests"),
    (filePath) => /\.test\.(ts|tsx|js|jsx)$/.test(filePath),
  );
  const allActions = [];
  const allRisks = [];

  const surfaces = pageFiles.map((pageFile) => {
    const route = routeFromPage(pageFile);
    const reachableFiles = collectReachableSources(pageFile);
    const imperativeBindings = collectImperativeBindings(reachableFiles);
    const actionMap = new Map();

    for (const filePath of reachableFiles) {
      for (const interaction of collectInteractions(
        filePath,
        imperativeBindings,
      )) {
        const key = `${interaction.sourceFile}:${interaction.line}:${interaction.kind}`;
        actionMap.set(key, interaction);
      }
    }

    const interactions = [...actionMap.values()]
      .sort((left, right) =>
        `${left.sourceFile}:${left.line}`.localeCompare(
          `${right.sourceFile}:${right.line}`,
        ),
      )
      .map((interaction, index) => ({
        actionId: `${route}#${index + 1}`,
        ...interaction,
      }));
    const specialStates = collectSpecialStates(pageFile);
    const dataAudit = detectDataAndStates(reachableFiles);
    const risks = buildRisks(route, interactions, dataAudit, specialStates);

    allActions.push(...interactions.map((action) => ({ route, ...action })));
    allRisks.push(...risks);

    return {
      route,
      purpose: inferPurpose(route),
      pageFile: relativeToWorkspace(pageFile),
      access: accessForRoute(route, privatePrefixes),
      data: {
        sourceKinds: dataAudit.sourceKinds,
        dependencies: dataAudit.dependencies,
        directMockImports: dataAudit.directMockImports,
        generatedAt: "build-time-static-scan",
        writesRequireRuntimeReadbackVerification: true,
      },
      states: {
        routeFiles: specialStates,
        sourceSignals: dataAudit.stateSignals,
        runtimeStatus:
          "loading/empty/partial/error/permission states require browser verification",
      },
      responsive: {
        sourceSignals: dataAudit.responsiveSignals,
        desktop: "requires-browser-verification",
        mobile: "requires-browser-verification",
      },
      actions: interactions,
      testCoverage: collectTestCoverage(route, pageFile, testFiles),
      knownRisks: risks,
    };
  });

  const metadata = stableGitMetadata();
  const manifest = {
    schemaVersion: 1,
    scope: "All production Next.js page routes; API and /dev routes excluded",
    evidenceLevel:
      "Static source inventory. Runtime, API, database, permission, desktop, and mobile fields remain explicitly unverified until browser evidence is recorded.",
    ...metadata,
    authoritativeInputs: {
      appRoot: relativeToWorkspace(APP_ROOT),
      authRouting: relativeToWorkspace(AUTH_ROUTING_FILE),
      privatePrefixes,
    },
    summary: {
      routes: surfaces.length,
      actions: allActions.length,
      authenticatedRoutes: surfaces.filter(
        (surface) => surface.access.policy === "authenticated",
      ).length,
      publicRoutes: surfaces.filter(
        (surface) => surface.access.policy !== "authenticated",
      ).length,
      risks: allRisks.length,
      p0Candidates: allRisks.filter((risk) => risk.severity === "P0").length,
      p1Candidates: allRisks.filter((risk) => risk.severity === "P1").length,
    },
    surfaces,
  };

  return { manifest, allActions, allRisks };
}

function markdownEscape(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function renderSurfaceMarkdown(manifest) {
  const lines = [
    "# iOrbit Product Surface Manifest",
    "",
    `- Schema: ${manifest.schemaVersion}`,
    `- Indexed commit: \`${manifest.commit}\``,
    `- Deterministic generated timestamp (commit time): ${manifest.generatedAt}`,
    `- Scope: ${manifest.scope}`,
    `- Evidence level: ${manifest.evidenceLevel}`,
    `- Routes: ${manifest.summary.routes}`,
    `- Actions/interactions: ${manifest.summary.actions}`,
    `- Authenticated routes: ${manifest.summary.authenticatedRoutes}`,
    `- Public-at-proxy routes: ${manifest.summary.publicRoutes}`,
    "",
    "## Route inventory",
    "",
    "| Route | Purpose | Access | Data sources | Actions | Tests | Static risks |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
  ];

  for (const surface of manifest.surfaces) {
    lines.push(
      `| \`${markdownEscape(surface.route)}\` | ${markdownEscape(
        surface.purpose,
      )} | ${surface.access.policy} | ${surface.data.sourceKinds.join(
        ", ",
      )} | ${surface.actions.length} | ${surface.testCoverage.length} | ${
        surface.knownRisks.length
      } |`,
    );
  }

  lines.push(
    "",
    "## Verification semantics",
    "",
    "This document is generated from the route tree, transitive local imports, JSX interactions, auth routing source, and test source. A `present-static` result proves source evidence only. `requires-browser-verification` and `open-needs-runtime-verification` are deliberate incomplete states, not successful verification.",
    "",
    "The JSON manifest is authoritative for per-route source files, anonymous/authenticated behavior, data provenance signals, dependencies, loading/empty/partial/error/permission signals, desktop/mobile status, actions, tests, and risks.",
  );

  return lines.join("\n");
}

function renderActionMarkdown(manifest, allActions) {
  const lines = [
    "# iOrbit Button and Action Coverage",
    "",
    `Static inventory contains ${allActions.length} route-reachable interactions across ${manifest.summary.routes} production routes.`,
    "",
    "| Route | Action id | Kind | Accessible label | Behavior | Target / handler | Read/write | Source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const action of allActions) {
    const target =
      action.href ??
      (action.handlers.length > 0 ? action.handlers.join(", ") : "unresolved");
    lines.push(
      `| \`${markdownEscape(action.route)}\` | \`${markdownEscape(
        action.actionId,
      )}\` | ${action.kind} | ${markdownEscape(
        action.label,
      )} (${action.accessibleName}) | ${action.behaviorEvidence} | ${markdownEscape(
        target,
      )} | ${action.readWrite} | \`${action.sourceFile}:${action.line}\` |`,
    );
  }

  lines.push(
    "",
    "## Coverage rule",
    "",
    "The scanner inventories `<button>`, `<a>`/`Link`, `<form>`, `role=\"button\"`, pointer/click handlers, and keyboard handlers reachable through local imports from each production page. Dynamic labels, hrefs, handlers, confirmation, retry, undo/compensation, loading guards, and feedback are marked unresolved unless static evidence exists; browser verification must close those entries.",
  );
  return lines.join("\n");
}

function renderRiskMarkdown(manifest, allRisks) {
  const lines = [
    "# iOrbit Product Surface Risk Register",
    "",
    `Generated static candidates: ${allRisks.length} (${manifest.summary.p0Candidates} P0, ${manifest.summary.p1Candidates} P1). Each candidate remains open until code review or runtime evidence proves or fixes it.`,
    "",
    "| Priority | Route | Type | File | Trigger | User impact | Status | Next action |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const risk of allRisks) {
    const location = risk.sourceFile
      ? `\`${risk.sourceFile}${risk.line ? `:${risk.line}` : ""}\``
      : "route-level";
    lines.push(
      `| ${risk.severity} | \`${markdownEscape(risk.route)}\` | ${risk.type} | ${location} | ${markdownEscape(
        risk.trigger,
      )} | ${markdownEscape(risk.userImpact)} | ${risk.status} | ${markdownEscape(
        risk.nextAction,
      )} |`,
    );
  }

  return lines.join("\n");
}

export function writeProductSurfaceManifest() {
  const { manifest, allActions, allRisks } = buildProductSurfaceManifest();
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUTPUT_DIR, "product-surface-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUTPUT_DIR, "product-surface-manifest.md"),
    `${renderSurfaceMarkdown(manifest)}\n`,
  );
  writeFileSync(
    path.join(OUTPUT_DIR, "button-action-coverage.md"),
    `${renderActionMarkdown(manifest, allActions)}\n`,
  );
  writeFileSync(
    path.join(OUTPUT_DIR, "product-surface-risk-register.md"),
    `${renderRiskMarkdown(manifest, allRisks)}\n`,
  );
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = writeProductSurfaceManifest();
  process.stdout.write(
    `Scanned ${manifest.summary.routes} production routes and ${manifest.summary.actions} interactions; wrote docs/audits manifests.\n`,
  );
}
