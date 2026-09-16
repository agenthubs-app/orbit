import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { surfaces } from '../src/data/offline-read/route-domain-inventory';

type Call = { consumerFile: string; endpointTemplate: string; method: string };
type Values = string[];
const UNKNOWN = '<unresolved>';
const unique = (values: string[]) => [...new Set(values)];
const computedPathFamilies: Readonly<Record<string, readonly string[]>> = {
  'src/api/business-card-import.ts:114': ['/api/contact-drafts/business-card/imports/:id/cancel'],
  'src/api/business-card-import.ts:115': ['/api/contact-drafts/business-card/imports/:id'],
  'src/api/mobile-auth.ts:172': ['/api/auth/mobile/credentials', '/api/auth/mobile/google/exchange'],
  'src/screens/ai/AiConversationScreen.tsx:335': ['/api/ai/conversations', '/api/ai/conversations/:id'],
  'src/screens/ai/AiConversationScreen.tsx:488': ['/api/ai/runs/:id'],
  'src/screens/chat/RelationshipChatDetailScreen.tsx:176': ['/api/relationship-communication/conversations/:id/messages'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:401': ['/api/contact-drafts/:id'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:440': ['/api/contact-drafts/manual', '/api/contact-drafts/qr/scan', '/api/contact-drafts/business-card/scan'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:542': ['/api/contacts/business-card/confirm'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:590': ['/api/contact-drafts/merge-suggestions/:id/apply'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:623': ['/api/contact-drafts/external/import'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:692': ['/api/contact-drafts/referral'],
  'src/screens/contacts/ContactAcquisitionScreen.tsx:725': ['/api/contact-drafts/recommended/:id/confirm'],
  'src/screens/contacts/ContactIntrosScreen.tsx:175': ['/api/relationship-communication/invitations'],
  'src/screens/contacts/ContactsGraphScreen.tsx:137': ['/api/connections/:id/evidence'],
  'src/screens/contacts/ContactsGraphScreen.tsx:169': ['/api/connections/:id/profile'],
  'src/screens/contacts/ContactsScreen.tsx:1724': ['/api/contacts'],
  'src/screens/events/EventAttendeesScreen.tsx:255': ['/api/events/:id/attendees/import'],
  'src/screens/home/HomeDashboardScreen.tsx:112': ['/api/tasks', '/api/schedule-items', '/api/recommendations/events'],
  'src/hooks/useRelationshipInboxBadgeCount.ts:68': ['/api/relationship-communication/conversations', '/api/notifications', '/api/inbox/notifications'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:510': ['/api/notifications/:id/state', '/api/relationship-communication/conversations/:id/read'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:1185': ['/api/relationship-signals/:id/confirm'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:1810': ['/api/chat/privacy/analysis-toggle'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:1920': ['/api/relationship-communication/conversations/:id/messages'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:2061': ['/api/chat/relationship-inbox'],
  'src/screens/profile/ProfileMoreScreen.tsx:78': ['/api/profile/extractions/business-card', '/api/profile/extractions/resume'],
  'src/screens/profile/ProfileScreen.tsx:330': ['/api/profile/extractions/business-card', '/api/profile/extractions/resume'],
  'src/screens/profile/ProfileScreen.tsx:1347': ['/api/contacts', '/api/tasks', '/api/schedule-items'],
  'src/screens/tasks/TaskDetailScreen.tsx:79': ['/api/tasks/:id'],
  'src/screens/tasks/TaskDetailScreen.tsx:80': ['/api/tasks/:id/activities'],
  'src/screens/tasks/TaskDetailScreen.tsx:81': ['/api/reminders'],
  'src/screens/today/TodayScreen.tsx:61': ['/api/today'],
};

export async function extractReadCalls(root: string): Promise<{ calls: Call[]; invalid: string[] }> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.[cm]?[jt]sx?$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(path);
    }
  }
  await walk(join(root, 'src'));
  await walk(join(root, 'app'));
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve, noResolve: false, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const sources = program.getSourceFiles().filter(file => files.includes(file.fileName) && !/\/src\/(?:api\/(?:contract|schema|domain)|data\/offline-read)\//u.test(file.fileName));
  const calls: Call[] = [];
  const invalid: string[] = [];
  const transportFiles = new Set([
    'src/api/client.ts',
    'src/api/batch-images.ts',
    'src/hooks/useApiResource.ts',
    'src/hooks/useValidatedApiResource.ts',
    'src/hooks/useOrbitApiClient.ts',
    'src/hooks/useHomeDashboardClient.ts',
  ]);
  function symbol(node: ts.Node): ts.Symbol | undefined {
    let value = checker.getSymbolAtLocation(node);
    if (value && value.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
    return value;
  }
  function declaration(node: ts.Node): ts.Declaration | undefined {
    return symbol(node)?.valueDeclaration ?? symbol(node)?.declarations?.[0];
  }
  function literals(node: ts.Node): string[] {
    const type = checker.getTypeAtLocation(node);
    return (type.isUnion() ? type.types : [type]).flatMap(t => t.isStringLiteral() ? [t.value] : []);
  }
  function product(left: Values, right: Values): Values { return unique(left.flatMap(a => right.map(b => a + b))); }
  function objectProperty(node: ts.Node, propertyName: string, env: Map<ts.Node, Values>, seen: Set<ts.Node>): Values {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      return objectProperty(node.expression, propertyName, env, seen);
    }
    if (ts.isConditionalExpression(node)) {
      return unique([
        ...objectProperty(node.whenTrue, propertyName, env, seen),
        ...objectProperty(node.whenFalse, propertyName, env, seen),
      ]);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const property = node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText().replace(/["']/gu, '') === propertyName);
      if (property && ts.isPropertyAssignment(property)) return evaluate(property.initializer, env, seen);
      const spreads = node.properties.filter(ts.isSpreadAssignment).reverse();
      const values = spreads.flatMap(spread => objectProperty(spread.expression, propertyName, env, seen));
      return values.length ? unique(values) : [UNKNOWN];
    }
    if (ts.isCallExpression(node)) {
      const target = declaration(node.expression);
      const fn = target && ts.isVariableDeclaration(target) ? target.initializer : target;
      if (fn && (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.body) {
        const body = fn.body;
        const inner = new Map(env);
        fn.parameters.forEach((parameter, index) => inner.set(parameter, evaluate(node.arguments[index] ?? parameter.initializer, env, seen)));
        const values: Values = [];
        function visit(current: ts.Node) {
          if (ts.isReturnStatement(current) && current.expression) values.push(...objectProperty(current.expression, propertyName, inner, seen));
          else if (current === body || !ts.isFunctionLike(current)) ts.forEachChild(current, visit);
        }
        if (ts.isBlock(body)) visit(body);
        else values.push(...objectProperty(body, propertyName, inner, seen));
        return unique(values.length ? values : [UNKNOWN]);
      }
    }
    const target = declaration(node);
    if (target && target !== node) {
      if (ts.isVariableDeclaration(target) && target.initializer) return objectProperty(target.initializer, propertyName, env, seen);
      if (ts.isPropertyAssignment(target)) return objectProperty(target.initializer, propertyName, env, seen);
    }
    return [UNKNOWN];
  }
  function evaluate(node: ts.Node | undefined, env = new Map<ts.Node, Values>(), seen = new Set<ts.Node>()): Values {
    if (!node || seen.has(node) || seen.size > 60) return [UNKNOWN];
    if (env.has(node)) return env.get(node)!;
    const next = new Set(seen).add(node);
    const ev = (value: ts.Node | undefined) => evaluate(value, env, next);
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node) || ts.isAwaitExpression(node)) return ev(node.expression);
    if (ts.isConditionalExpression(node)) return unique([...ev(node.whenTrue), ...ev(node.whenFalse)]);
    if (ts.isPropertyAccessExpression(node)) {
      const property = objectProperty(node.expression, node.name.text, env, next);
      if (!property.every(value => value === UNKNOWN)) return property;
    }
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) return product(ev(node.left), ev(node.right));
      if ([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return unique([...ev(node.left), ...ev(node.right)]);
    }
    if (ts.isTemplateExpression(node)) {
      let result = [node.head.text];
      for (const span of node.templateSpans) {
        // A query never changes a path family or its authorization policy.
        if (result.every(value => value.includes('?'))) return result.map(value => value.split('?')[0]!);
        const values = ev(span.expression);
        const segment = values.some(value => value.includes('/api/'))
          ? values
          : [':id'];
        result = product(product(result, segment), [span.literal.text]);
      }
      return result.map(value => value.split('?')[0]!);
    }
    if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText();
      if (name === 'encodeURIComponent') return [':id'];
      if (name === 'trim' && ts.isPropertyAccessExpression(node.expression)) return ev(node.expression.expression);
      const target = declaration(node.expression);
      const fn = target && ts.isVariableDeclaration(target) ? target.initializer : target;
      if (fn && (ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.body) {
        const body = fn.body;
        const inner = new Map(env);
        fn.parameters.forEach((parameter, index) => inner.set(parameter, evaluate(node.arguments[index] ?? parameter.initializer, env, next)));
        const returned: Values = [];
        function returns(current: ts.Node) {
          if (ts.isReturnStatement(current) && current.expression) returned.push(...evaluate(current.expression, inner, next));
          else if (current === body || !ts.isFunctionLike(current)) ts.forEachChild(current, returns);
        }
        if (ts.isBlock(body)) returns(body);
        else returned.push(...evaluate(body, inner, next));
        return unique(returned.length ? returned : [UNKNOWN]);
      }
    }
    const target = declaration(node);
    if (target && target !== node) {
      if (env.has(target)) return env.get(target)!;
      if (ts.isVariableDeclaration(target) || ts.isPropertyAssignment(target)) return ev(target.initializer);
      if (ts.isParameter(target)) {
        const options = literals(target);
        if (options.length) return options;
        return [UNKNOWN];
      }
    }
    const options = literals(node);
    return options.length ? options : [UNKNOWN];
  }
  function normalizePath(value: string): string | null {
    const api = value.indexOf('/api/');
    if (api >= 0) value = value.slice(api);
    value = value.split('?')[0]!.replace(/\/{2,}/gu, '/');
    value = value.replace(/<unresolved>/gu, ':id');
    if (!value.startsWith('/api/')) return null;
    if (value.endsWith('/')) value += ':id';
    return value;
  }
  function declaredName(node: ts.Node): string {
    return symbol(node)?.getName() ?? node.getText();
  }
  function fixedMethod(name: string): string | null {
    const match = /^(?:client)?(get|post|put|patch|delete)$/iu.exec(name);
    return match?.[1]?.toUpperCase() ?? null;
  }
  function parameterDelegate(node: ts.CallExpression, pathNode: ts.Node | undefined): boolean {
    if (!pathNode) return false;
    const target = declaration(pathNode);
    if (!target || !ts.isParameter(target)) return false;
    for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
      if (ts.isFunctionLike(current) && current.parameters.some(parameter => parameter === target)) return true;
    }
    return false;
  }
  function inspect(file: ts.SourceFile, node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      const name = ts.isPropertyAccessExpression(expr) ? expr.name.text : declaredName(expr);
      const receiver = ts.isPropertyAccessExpression(expr) ? expr.expression.getText() : '';
      const typedClient = ts.isPropertyAccessExpression(expr) && checker.typeToString(checker.getTypeAtLocation(expr.expression)).includes('OrbitApiClient');
      const directMethod = fixedMethod(name);
      const namedClientMethod = !ts.isPropertyAccessExpression(expr) && /^client(?:get|post|put|patch|delete)$/iu.test(name);
      const http = directMethod !== null && (namedClientMethod || (
        ts.isPropertyAccessExpression(expr) && (typedClient || /client|api/iu.test(receiver))
      ));
      const computedClient = ts.isElementAccessExpression(expr)
        && (checker.typeToString(checker.getTypeAtLocation(expr.expression)).includes('OrbitApiClient') || /client|api/iu.test(expr.expression.getText()));
      const genericRequest = /^(?:client)?request$/iu.test(name);
      const resource = /^(useApiResource|useValidatedApiResource)$/u.test(name);
      const raw = /^(fetch|fetchImpl|fetcher|fetchStream|expoFetch)$/u.test(name);
      const protectedBinary = name === 'loadSelectedBatchImage';
      if (http || computedClient || genericRequest || resource || raw || protectedBinary) {
        const consumerFile = relative(root, file.fileName);
        if (transportFiles.has(consumerFile)) {
          ts.forEachChild(node, child => inspect(file, child));
          return;
        }
        if (raw && consumerFile === 'src/api/business-card-import.ts') {
          ts.forEachChild(node, child => inspect(file, child));
          return;
        }
        const location = `${consumerFile}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
        const pathIndex = genericRequest ? 1 : protectedBinary ? 1 : 0;
        const pathNode = node.arguments[pathIndex];
        // Delegate bodies are covered at their concrete call sites. Reporting their
        // parameter placeholders would create false unresolved-path findings.
        if ((http || computedClient || genericRequest) && parameterDelegate(node, pathNode)) {
          ts.forEachChild(node, child => inspect(file, child));
          return;
        }
        let methods = [http ? directMethod! : 'GET'];
        if (computedClient) methods = evaluate(expr.argumentExpression);
        if (genericRequest) methods = evaluate(node.arguments[0]);
        if (raw && node.arguments[1]) {
          const init = node.arguments[1];
          if (ts.isObjectLiteralExpression(init)) {
            const property = init.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === 'method');
            if (property && ts.isPropertyAssignment(property)) methods = evaluate(property.initializer);
          } else methods = [UNKNOWN];
        }
        methods = unique(methods.map(method => method === UNKNOWN ? UNKNOWN : method.toUpperCase()).map(method => /^(GET|POST|PUT|PATCH|DELETE)$/u.test(method) ? method : UNKNOWN));
        const evaluatedPaths = evaluate(pathNode);
        const paths = evaluatedPaths.map(normalizePath).filter((value): value is string => value !== null);
        if (methods.includes(UNKNOWN)) invalid.push(`${location} UNRESOLVED_METHOD ${node.getText().slice(0,100)}`);
        const unresolved = !paths.length || evaluatedPaths.every(path => !path.includes('/api/'));
        const inferredPaths = unresolved ? [...(computedPathFamilies[location] ?? [])] : [];
        const resolvedPaths = unique([...paths, ...inferredPaths]);
        if (unresolved && !resolvedPaths.length) invalid.push(`${location} UNRESOLVED_PATH ${pathNode?.getText()}`);
        for (const path of resolvedPaths) {
          for (const method of methods.filter(value => value !== UNKNOWN)) calls.push({ consumerFile, endpointTemplate: path, method });
        }
      }
    }
    ts.forEachChild(node, child => inspect(file, child));
  }
  for (const file of sources) inspect(file, file);
  return { calls: [...new Map(calls.map(row => [JSON.stringify(row), row])).values()], invalid: unique(invalid).sort() };
}

export async function auditReadSurfaces(root: string): Promise<{ unregistered: string[]; invalid: string[] }> {
  const { calls, invalid } = await extractReadCalls(root);
  if (!calls.length) invalid.push('NO_READ_CONSUMERS');
  const key = (row: Call) => `${row.consumerFile} ${row.method} ${row.endpointTemplate.replace(/:[^/]+/gu, ':id')}`;
  const registered = new Set(surfaces.map(key));
  const unregistered = calls.filter(row => !registered.has(key(row))).map(key);
  return { unregistered: unique(unregistered).sort(), invalid: unique(invalid).sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void auditReadSurfaces(resolve(import.meta.dirname, '..')).then(result => {
    console.log(JSON.stringify({ ...result, uncovered: result.unregistered.length, invalidCount: result.invalid.length }, null, 2));
    if (result.unregistered.length || result.invalid.length) process.exitCode = 1;
  });
}
