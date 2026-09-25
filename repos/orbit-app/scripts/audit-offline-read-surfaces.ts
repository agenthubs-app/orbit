import { readdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { surfaces } from '../src/data/offline-read/route-domain-inventory';

type Call = { consumerFile: string; endpointTemplate: string; method: string };
type Values = string[];
type Callable = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;
type CallableEnv = Map<ts.Node, readonly Callable[]>;
const UNKNOWN = '<unresolved>';
const unique = (values: string[]) => [...new Set(values)];
/**
 * Keys are `file:line`, so any edit ABOVE a listed call site silently detaches
 * its entry — and the audit then reports the endpoint as uncalled rather than
 * the key as stale, which sends you looking in the wrong place. `usedComputedPathKeys`
 * below turns that into an explicit STALE_COMPUTED_PATH_KEY finding.
 */
const usedComputedPathKeys = new Set<string>();

const computedPathFamilies: Readonly<Record<string, readonly string[]>> = {
  'src/screens/ai/AiConversationScreen.tsx:354': ['/api/ai/conversations', '/api/ai/conversations/:id'],
  'src/screens/chat/RelationshipChatDetailScreen.tsx:180': ['/api/relationship-communication/conversations/:id/messages'],
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
  'src/screens/inbox/RelationshipInboxScreen.tsx:1194': ['/api/relationship-signals/:id/confirm'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:1819': ['/api/chat/privacy/analysis-toggle'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:1929': ['/api/relationship-communication/conversations/:id/messages'],
  'src/screens/inbox/RelationshipInboxScreen.tsx:2070': ['/api/chat/relationship-inbox'],
  'src/screens/profile/ProfileMoreScreen.tsx:78': ['/api/profile/extractions/business-card', '/api/profile/extractions/resume'],
  'src/screens/profile/ProfileScreen.tsx:335': ['/api/profile/extractions/business-card', '/api/profile/extractions/resume'],
  'src/screens/tasks/TaskDetailScreen.tsx:79': ['/api/tasks/:id'],
  'src/screens/tasks/TaskDetailScreen.tsx:80': ['/api/tasks/:id/activities'],
  'src/screens/tasks/TaskDetailScreen.tsx:81': ['/api/reminders'],
  'src/screens/today/TodayScreen.tsx:61': ['/api/today'],
};

// 这些 transport 调用点在运行时从不指向 Orbit API，因而没有可登记的读取面。
// 与 computedPathFamilies 的区别：那里是"路径算得出来、只是静态解析不到"；
// 这里是"根本不存在 API 路径"。把它们塞进 computedPathFamilies 等于伪造一个端点。
// 每一条都必须给出它实际访问什么，以及为什么不受离线读取策略约束。
const nonApiTransportSinks: Readonly<Record<string, string>> = {
  // fetch(blob:...) 读取浏览器本地 object URL，取用户刚选中的图片字节；
  // 调用前由 isSupportedBatchImageSource() 限定 blob: 前缀，不出网、不含账号数据。
  'src/api/batch-image-source.web.ts:34': 'browser blob: object URL, never a network request',
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
    if (ts.isElementAccessExpression(node)) {
      return unique(ev(node.argumentExpression).flatMap(key => key === UNKNOWN ? [UNKNOWN] : objectProperty(node.expression, key, env, next)));
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
  function callable(declaration: ts.Declaration | undefined): Callable | undefined {
    if (declaration && (ts.isFunctionDeclaration(declaration) || ts.isFunctionExpression(declaration)
      || ts.isArrowFunction(declaration) || ts.isMethodDeclaration(declaration)) && declaration.body) return declaration;
    return undefined;
  }
  function injectedParameter(declaration: ts.Declaration | undefined): boolean {
    return Boolean(declaration && (ts.isParameter(declaration)
      || (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent) && ts.isParameter(declaration.parent.parent))));
  }
  function returnedFunctions(fn: Callable, propertyName: string, callableEnv: CallableEnv, seen: Set<ts.Node>): Callable[] {
    const found: Callable[] = [];
    function visit(node: ts.Node): void {
      if (node !== fn.body && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
        for (const property of node.expression.properties) {
          const name = property.name?.getText().replace(/["']/gu, '');
          if (name !== propertyName) continue;
          if (ts.isShorthandPropertyAssignment(property)) {
            const value = checker.getShorthandAssignmentValueSymbol(property);
            const target = value?.valueDeclaration ?? value?.declarations?.[0];
            if (target && ts.isVariableDeclaration(target) && ts.isIdentifier(target.name)) found.push(...resolveFunctions(target.name, callableEnv, seen));
            else found.push(...resolveFunctions(property.name, callableEnv, seen));
          }
          else if (ts.isPropertyAssignment(property)) found.push(...resolveFunctions(property.initializer, callableEnv, seen));
        }
      } else ts.forEachChild(node, visit);
    }
    visit(fn.body!);
    return uniqueNodes(found);
  }
  function uniqueNodes<T extends ts.Node>(nodes: readonly T[]): T[] {
    return [...new Set(nodes)];
  }
  function lexicalFunction(node: ts.Node): Callable | undefined {
    if (!ts.isIdentifier(node)) return undefined;
    for (let scope = node.parent; scope; scope = scope.parent) {
      if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
      const match = scope.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === node.text);
      if (match && ts.isFunctionDeclaration(match) && match.body) return match;
    }
    return undefined;
  }
  function resolveFunctions(node: ts.Node | undefined, callableEnv: CallableEnv = new Map(), seen = new Set<ts.Node>()): Callable[] {
    if (!node || seen.has(node) || seen.size > 60) return [];
    const next = new Set(seen).add(node);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
      return resolveFunctions(node.expression, callableEnv, next);
    }
    const direct = callable(node as ts.Declaration);
    if (direct) return [direct];
    const target = declaration(node);
    if (!target) {
      const lexical = lexicalFunction(node);
      return lexical ? [lexical] : [];
    }
    if (injectedParameter(target)) return [...(callableEnv.get(target) ?? [])];
    const targetFunction = callable(target);
    if (targetFunction) return [targetFunction];
    if (ts.isVariableDeclaration(target) && target.initializer) {
      if (ts.isCallExpression(target.initializer) && /^(?:useCallback|useMemo)$/u.test(target.initializer.expression.getText())) {
        return resolveFunctions(target.initializer.arguments[0], callableEnv, next);
      }
      return resolveFunctions(target.initializer, callableEnv, next);
    }
    if (ts.isBindingElement(target) && ts.isObjectBindingPattern(target.parent)) {
      const variable = target.parent.parent;
      const propertyName = (target.propertyName ?? target.name).getText().replace(/["']/gu, '');
      if (ts.isVariableDeclaration(variable) && variable.initializer && ts.isCallExpression(variable.initializer)) {
        return uniqueNodes(resolveFunctions(variable.initializer.expression, callableEnv, next)
          .flatMap(fn => returnedFunctions(fn, propertyName, callableEnv, next)));
      }
    }
    const lexical = lexicalFunction(node);
    return lexical ? [lexical] : [];
  }
  type TransportShape = { kind: 'computed' | 'fixed' | 'raw' | 'resource' | 'binary'; pathIndex: number; fixedMethod?: string };
  function transportShape(node: ts.CallExpression): TransportShape | null {
    const expr = node.expression;
    const name = ts.isPropertyAccessExpression(expr) ? expr.name.text : expr.getText();
    if (ts.isPropertyAccessExpression(expr)) {
      const receiver = expr.expression.getText();
      const typedClient = checker.typeToString(checker.getTypeAtLocation(expr.expression)).includes('OrbitApiClient');
      if (/^(get|post|put|patch|delete)$/u.test(name) && (typedClient || /client|api/iu.test(receiver))) {
        return { kind: 'fixed', pathIndex: 0, fixedMethod: name.toUpperCase() };
      }
    }
    if (ts.isElementAccessExpression(expr)
      && (checker.typeToString(checker.getTypeAtLocation(expr.expression)).includes('OrbitApiClient') || /client|api/iu.test(expr.expression.getText()))) {
      return { kind: 'computed', pathIndex: 0 };
    }
    if (/^(useApiResource|useValidatedApiResource)$/u.test(name)) return { kind: 'resource', pathIndex: 0, fixedMethod: 'GET' };
    if (/^(fetch|fetchImpl|fetcher|fetchStream|expoFetch)$/u.test(name)) return { kind: 'raw', pathIndex: 0, fixedMethod: 'GET' };
    if (name === 'loadSelectedBatchImage') return { kind: 'binary', pathIndex: 1, fixedMethod: 'GET' };
    return null;
  }
  type SinkFinding = { node: ts.CallExpression; location: string; method: boolean; path: boolean; baseline: boolean; text: string };
  type DelegateFinding = { node: ts.CallExpression; message: string; baseline: boolean };
  const pendingSinks = new Map<string, SinkFinding>();
  const resolvedSinkInvocations = new Set<string>();
  const staticResolvedSinks = new Set<ts.CallExpression>();
  const expandedSinks = new Set<ts.CallExpression>();
  const pendingDelegates = new Map<string, DelegateFinding>();
  const resolvedDelegateInvocations = new Set<string>();
  const expandedDelegates = new Set<ts.CallExpression>();
  function nodeId(node: ts.Node): string {
    return `${relative(root, node.getSourceFile().fileName)}:${node.getStart()}`;
  }
  function invocationKey(node: ts.Node, context: string): string {
    return `${nodeId(node)}@${context}`;
  }
  function recordTransport(node: ts.CallExpression, shape: TransportShape, env: Map<ts.Node, Values>, consumerFile: string, expanded: boolean, context: string, baseline: boolean): void {
    if (expanded && staticResolvedSinks.has(node)) return;
    const key = invocationKey(node, context);
    const source = node.getSourceFile();
    const sourceFile = relative(root, source.fileName);
    if (transportFiles.has(sourceFile) || (shape.kind === 'raw' && sourceFile === 'src/api/business-card-import.ts')) return;
    const location = `${sourceFile}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    let methods = shape.fixedMethod ? [shape.fixedMethod] : [UNKNOWN];
    if (shape.kind === 'computed' && ts.isElementAccessExpression(node.expression)) methods = evaluate(node.expression.argumentExpression, env);
    if (shape.kind === 'raw' && node.arguments[1]) {
      const init = node.arguments[1];
      if (ts.isObjectLiteralExpression(init)) {
        const property = init.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === 'method');
        if (property && ts.isPropertyAssignment(property)) methods = evaluate(property.initializer, env);
      } else methods = [UNKNOWN];
    }
    methods = unique(methods.map(method => method === UNKNOWN ? UNKNOWN : method.toUpperCase())
      .map(method => /^(GET|POST|PUT|PATCH|DELETE)$/u.test(method) ? method : UNKNOWN));
    const pathNode = node.arguments[shape.pathIndex];
    const evaluatedPaths = evaluate(pathNode, env);
    const paths = evaluatedPaths.map(normalizePath).filter((value): value is string => value !== null);
    const unknownPath = evaluatedPaths.includes(UNKNOWN);
    const unresolvedPath = unknownPath || !paths.length || evaluatedPaths.every(path => !path.includes('/api/'));
    const inferredPaths = unresolvedPath ? [...(computedPathFamilies[location] ?? [])] : [];
    if (inferredPaths.length) usedComputedPathKeys.add(location);
    const resolvedPaths = unique([...paths, ...inferredPaths]);
    const unresolvedMethod = methods.includes(UNKNOWN);
    const nonApiSink = location in nonApiTransportSinks && !evaluatedPaths.some(path => path.includes('/api/'));
    if (!nonApiSink && (unresolvedMethod || (unresolvedPath && (!resolvedPaths.length || (unknownPath && !inferredPaths.length))))) {
      const finding = { node, location, method: unresolvedMethod, path: unresolvedPath && (!resolvedPaths.length || (unknownPath && !inferredPaths.length)), baseline, text: node.getText().slice(0, 100) };
      pendingSinks.set(key, finding);
    }
    if (resolvedPaths.length && methods.some(method => method !== UNKNOWN)) {
      if (expanded) resolvedSinkInvocations.add(key);
      else staticResolvedSinks.add(node);
      if (expanded) expandedSinks.add(node);
    }
    for (const path of resolvedPaths) {
      for (const method of methods.filter(value => value !== UNKNOWN)) calls.push({ consumerFile, endpointTemplate: path, method });
    }
  }
  function pathLikeArgument(node: ts.Node | undefined, env: Map<ts.Node, Values>): boolean {
    if (!node) return false;
    if (evaluate(node, env).some(value => value.includes('/api/'))) return true;
    const target = declaration(node);
    return Boolean(target && ts.isParameter(target) && /(?:path|endpoint|url)/iu.test(target.name.getText()));
  }
  function delegateMayTransport(node: ts.CallExpression, env: Map<ts.Node, Values>): boolean {
    if (node.arguments.some(argument => pathLikeArgument(argument, env))) return true;
    const signatures = checker.getSignaturesOfType(checker.getTypeAtLocation(node.expression), ts.SignatureKind.Call);
    const apiResult = signatures.some(signature => checker.typeToString(signature.getReturnType()).includes('ApiResult'));
    return apiResult && node.arguments.some(argument => checker.typeToString(checker.getTypeAtLocation(argument)).includes('string'));
  }
  function registersCallback(node: ts.CallExpression): boolean {
    const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText();
    return /(?:register|subscribe|listener|handler|callback)/iu.test(name);
  }
  const reachability = new Map<Callable, boolean>();
  function mayReachTransport(fn: Callable, seen = new Set<Callable>()): boolean {
    const cached = reachability.get(fn);
    if (cached !== undefined) return cached;
    if (seen.has(fn)) return false;
    const next = new Set(seen).add(fn);
    let reaches = false;
    function visit(node: ts.Node): void {
      if (reaches) return;
      if (node !== fn.body && ts.isFunctionLike(node)) {
        const nested = callable(node as ts.Declaration);
        if (nested && mayReachTransport(nested, next)) reaches = true;
        return;
      }
      if (ts.isCallExpression(node)) {
        if (transportShape(node)) { reaches = true; return; }
        const target = declaration(node.expression);
        if (injectedParameter(target) && delegateMayTransport(node, new Map())) { reaches = true; return; }
        if (resolveFunctions(node.expression).some(inner => mayReachTransport(inner, next))) { reaches = true; return; }
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        && resolveFunctions(node.tagName).some(inner => mayReachTransport(inner, next))) { reaches = true; return; }
      ts.forEachChild(node, visit);
    }
    visit(fn.body!);
    reachability.set(fn, reaches);
    return reaches;
  }
  function inferredDelegateValues(fn: Callable, node: ts.CallExpression): Map<ts.Node, Values> {
    const source = node.getSourceFile();
    const location = `${relative(root, source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const paths = computedPathFamilies[location];
    if (!paths?.length) return new Map();
    usedComputedPathKeys.add(location);
    let index = node.arguments.findIndex(argument => checker.typeToString(checker.getTypeAtLocation(argument)).includes('string'));
    if (index < 0) index = 0;
    const parameter = fn.parameters[index];
    return parameter ? new Map([[parameter, [...paths]]]) : new Map();
  }
  function expandFunction(fn: Callable, arguments_: readonly ts.Expression[], outerEnv: Map<ts.Node, Values>, outerCallableEnv: CallableEnv, originFile: string, stack: Set<Callable>, context: string, baseline: boolean, directValues = new Map<ts.Node, Values>(), directCallables: CallableEnv = new Map()): void {
    if (stack.has(fn) || stack.size > 30) return;
    const env = new Map(outerEnv);
    const callableEnv = new Map(outerCallableEnv);
    fn.parameters.forEach((parameter, index) => {
      const argument = arguments_[index];
      const values = evaluate(argument ?? parameter.initializer, outerEnv);
      const declared = literals(parameter);
      env.set(parameter, !argument && values.every(value => value === UNKNOWN) && declared.length ? declared : values);
      callableEnv.set(parameter, resolveFunctions(argument, outerCallableEnv));
      // Resolve destructured paths from this invocation, not a source-line allowlist.
      // Unknown properties stay unknown so a known caller cannot conceal another caller.
      if (ts.isObjectBindingPattern(parameter.name)) {
        for (const binding of parameter.name.elements) {
          if (!ts.isIdentifier(binding.name) || binding.dotDotDotToken) continue;
          const property = binding.propertyName ?? binding.name;
          if (!ts.isIdentifier(property) && !ts.isStringLiteralLike(property)) continue;
          env.set(binding, argument ? objectProperty(argument, property.text, outerEnv, new Set()) : [UNKNOWN]);
        }
      }
    });
    for (const [node, values] of directValues) env.set(node, values);
    for (const [node, functions] of directCallables) callableEnv.set(node, functions);
    const nextStack = new Set(stack).add(fn);
    function visit(node: ts.Node): void {
      if (node !== fn.body && ts.isFunctionLike(node)) {
        const nested = callable(node as ts.Declaration);
        if (nested && mayReachTransport(nested)) expandFunction(nested, [], env, callableEnv, originFile, nextStack, `${context}>template:${nodeId(nested)}`, true);
        return;
      }
      if (ts.isCallExpression(node)) {
        const shape = transportShape(node);
        if (shape) recordTransport(node, shape, env, originFile, true, context, baseline);
        else {
          const target = declaration(node.expression);
          const functions = resolveFunctions(node.expression, callableEnv).filter(fn => mayReachTransport(fn));
          const nextContext = `${context}>call:${nodeId(node)}`;
          if (functions.length) {
            if (injectedParameter(target)) {
              resolvedDelegateInvocations.add(invocationKey(node, context));
              expandedDelegates.add(node);
            }
            const nextOrigin = injectedParameter(target) ? relative(root, node.getSourceFile().fileName) : originFile;
            functions.forEach(inner => expandFunction(inner, node.arguments, env, callableEnv, nextOrigin, nextStack, nextContext, baseline, inferredDelegateValues(inner, node)));
          } else if (injectedParameter(target) && delegateMayTransport(node, env)) {
            pendingDelegates.set(invocationKey(node, context), {
              node,
              message: `${relative(root, node.getSourceFile().fileName)}:${node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1} UNRESOLVED_DELEGATE ${node.expression.getText()}`,
              baseline,
            });
          } else if (registersCallback(node)) {
            for (const argument of node.arguments) {
              resolveFunctions(argument, callableEnv).filter(inner => mayReachTransport(inner)).forEach(inner =>
                expandFunction(inner, [], env, callableEnv, relative(root, inner.getSourceFile().fileName), nextStack, `${nextContext}>callback:${nodeId(argument)}`, baseline));
            }
          }
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        expandJsx(node, node.getSourceFile(), env, callableEnv, nextStack, `${context}>jsx:${nodeId(node)}`, baseline);
      }
      ts.forEachChild(node, visit);
    }
    visit(fn.body!);
  }
  function jsxExpression(attribute: ts.JsxAttribute | undefined): ts.Expression | undefined {
    if (!attribute?.initializer) return undefined;
    if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer;
    if (ts.isJsxExpression(attribute.initializer)) return attribute.initializer.expression;
    return undefined;
  }
  function expandJsx(node: ts.JsxOpeningLikeElement, file: ts.SourceFile, outerEnv = new Map<ts.Node, Values>(), outerCallableEnv: CallableEnv = new Map(), stack = new Set<Callable>(), context = `jsx:${nodeId(node)}`, baseline = false): void {
    for (const property of node.attributes.properties) {
      if (!ts.isJsxAttribute(property)) continue;
      const expression = jsxExpression(property);
      resolveFunctions(expression, outerCallableEnv).filter(fn => mayReachTransport(fn)).forEach(fn =>
        expandFunction(fn, [], outerEnv, outerCallableEnv, relative(root, fn.getSourceFile().fileName), stack, `${context}>attribute:${nodeId(property)}`, baseline));
    }
    const functions = resolveFunctions(node.tagName, outerCallableEnv).filter(fn => mayReachTransport(fn));
    for (const fn of functions) {
      const parameter = fn.parameters[0];
      if (!parameter || !ts.isObjectBindingPattern(parameter.name)) continue;
      const values = new Map<ts.Node, Values>();
      const callables: CallableEnv = new Map();
      for (const binding of parameter.name.elements) {
        const propertyName = (binding.propertyName ?? binding.name).getText().replace(/["']/gu, '');
        const attribute = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText() === propertyName);
        const expression = jsxExpression(attribute && ts.isJsxAttribute(attribute) ? attribute : undefined);
        values.set(binding, evaluate(expression, outerEnv));
        callables.set(binding, resolveFunctions(expression, outerCallableEnv));
      }
      expandFunction(fn, [], outerEnv, outerCallableEnv, relative(root, fn.getSourceFile().fileName), stack, context, baseline, values, callables);
    }
  }
  function insideFunction(node: ts.Node): boolean {
    for (let current = node.parent; current; current = current.parent) if (ts.isFunctionLike(current)) return true;
    return false;
  }
  function collectTransport(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const shape = transportShape(node);
      if (shape) recordTransport(node, shape, new Map(), relative(root, node.getSourceFile().fileName), false, `static:${nodeId(node)}`, true);
    }
    ts.forEachChild(node, collectTransport);
  }
  function inspect(file: ts.SourceFile, node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const shape = transportShape(node);
      if (!shape) {
        const target = declaration(node.expression);
        const functions = resolveFunctions(node.expression).filter(fn => mayReachTransport(fn));
        const baseline = insideFunction(node);
        const context = `call:${nodeId(node)}`;
        if (functions.length) {
          functions.forEach(fn => expandFunction(fn, node.arguments, new Map(), new Map(), relative(root, file.fileName), new Set(), context, baseline));
        } else if (injectedParameter(target) && delegateMayTransport(node, new Map())) {
          pendingDelegates.set(invocationKey(node, context), {
            node,
            message: `${relative(root, file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} UNRESOLVED_DELEGATE ${node.expression.getText()}`,
            baseline,
          });
        } else if (registersCallback(node)) {
          for (const argument of node.arguments) {
            resolveFunctions(argument).filter(fn => mayReachTransport(fn)).forEach(fn =>
              expandFunction(fn, [], new Map(), new Map(), relative(root, fn.getSourceFile().fileName), new Set(), `${context}>callback:${nodeId(argument)}`, baseline));
          }
        }
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const baseline = insideFunction(node);
      expandJsx(node, file, new Map(), new Map(), new Set(), `jsx:${nodeId(node)}`, baseline);
    }
    ts.forEachChild(node, child => inspect(file, child));
  }
  for (const file of sources) collectTransport(file);
  for (const file of sources) inspect(file, file);
  for (const [key, finding] of pendingSinks) {
    if (resolvedSinkInvocations.has(key) || (finding.baseline && expandedSinks.has(finding.node))) continue;
    if (finding.method) invalid.push(`${finding.location} UNRESOLVED_METHOD ${finding.text}`);
    if (finding.path) invalid.push(`${finding.location} UNRESOLVED_PATH ${finding.node.arguments[transportShape(finding.node)?.pathIndex ?? 0]?.getText()}`);
  }
  for (const [key, finding] of pendingDelegates) {
    if (resolvedDelegateInvocations.has(key) || (finding.baseline && expandedDelegates.has(finding.node))) continue;
    invalid.push(finding.message);
  }
  return { calls: [...new Map(calls.map(row => [JSON.stringify(row), row])).values()], invalid: unique(invalid).sort() };
}

export async function auditReadSurfaces(root: string): Promise<{ unregistered: string[]; invalid: string[] }> {
  const { calls, invalid } = await extractReadCalls(root);
  if (!calls.length) invalid.push('NO_READ_CONSUMERS');
  const key = (row: Call) => `${row.consumerFile} ${row.method} ${row.endpointTemplate.replace(/:[^/]+/gu, ':id')}`;
  const registered = new Set(surfaces.map(key));
  const discovered = new Set(calls.map(key));
  const unregistered = calls.filter(row => !registered.has(key(row))).map(key);
  for (const surface of surfaces) {
    if (surface.endpointTemplate.startsWith('/device/') || surface.consumerFile === 'src/api/endpoints.ts') continue;
    if (!discovered.has(key(surface))) invalid.push(`ORPHAN_SURFACE ${key(surface)}`);
  }
  // Name the stale key directly. Without this the only symptom is an
  // UNRESOLVED_PATH plus an ORPHAN_SURFACE for an endpoint that is still called,
  // which reads as a missing consumer rather than a moved line.
  for (const location of Object.keys(computedPathFamilies)) {
    if (!usedComputedPathKeys.has(location)) {
      invalid.push(
        `STALE_COMPUTED_PATH_KEY ${location} (nothing consulted it: either the call moved to another line, or its path now resolves on its own and the entry is dead)`,
      );
    }
  }
  return { unregistered: unique(unregistered).sort(), invalid: unique(invalid).sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void auditReadSurfaces(resolve(import.meta.dirname, '..')).then(result => {
    console.log(JSON.stringify({ ...result, uncovered: result.unregistered.length, invalidCount: result.invalid.length }, null, 2));
    if (result.unregistered.length || result.invalid.length) process.exitCode = 1;
  });
}
