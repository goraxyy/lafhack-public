/**
 * Source-level rewrites that turn a Processing (Java) sketch into something
 * Processing.js 1.6.6 can actually parse and run in a browser.
 *
 * Processing.js implements the Processing *language*, not Java 8 and not the
 * contributed libraries. Everything in here exists because a real sketch hit a
 * gap between the two:
 *
 *   - `import processing.sound.*` and friends have no browser equivalent, so
 *     the imports are dropped and the classes are shimmed at runtime
 *     (see public/processing-compat.js).
 *   - Java lambdas are a hard parse error ("Unexpected token '>'"), so they are
 *     rewritten into anonymous inner classes, which Processing.js does support.
 *   - Interfaces nested inside a class cannot be referenced as `Outer.Inner`,
 *     so they are hoisted to the top level.
 *   - Assets are only fetched up front when the sketch declares them in a
 *     `/* @pjs preload=... *​/` directive, so the directive is generated from
 *     the `loadImage()` / `createFont()` calls found in the source.
 */

export interface CompatResult {
  source: string;
  /** Image files that should be preloaded before setup() runs. */
  images: string[];
  /** Font files that should be registered with @font-face before setup() runs. */
  fonts: string[];
  /** Tabular data files the runtime shim has to fetch for loadTable(). */
  tables: string[];
  /** Human-readable notes about what was rewritten, surfaced in the bundle header. */
  notes: string[];
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff'];
const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
const TABLE_EXTENSIONS = ['csv', 'tsv'];

/** Loader calls whose first string argument is a path inside `data/`. */
const ASSET_LOADERS = [
  'loadImage',
  'requestImage',
  'loadFont',
  'createFont',
  'loadTable',
  'loadShape',
  'loadStrings',
  'loadBytes',
  'loadXML',
  'loadJSONObject',
  'loadJSONArray',
  'loadShader',
];

export function makeProcessingJsCompatible(source: string): CompatResult {
  const notes: string[] = [];

  let result = stripLibraryImports(source, notes);
  result = hoistNestedInterfaces(result, notes);
  result = rewriteLambdas(result, notes);
  result = renameFunctionsShadowedByFields(result, notes);
  result = fixCharConcatenation(result, notes);
  result = normalizeAssetReferences(result);
  noteEmulatedDelay(result, notes);

  const assets = collectAssets(result);

  return {
    source: result,
    images: assets.images,
    fonts: assets.fonts,
    tables: assets.tables,
    notes,
  };
}

/**
 * Builds the `@pjs` directive block Processing.js reads before compiling.
 * Must be emitted at the very top of the bundle.
 */
export function buildDirectiveHeader(result: CompatResult): string {
  const directives: string[] = [];

  if (result.images.length > 0) {
    directives.push(`preload="${result.images.join(',')}"`);
  }

  if (result.fonts.length > 0) {
    directives.push(`font="${result.fonts.join(',')}"`);
  }

  if (directives.length === 0) {
    return '';
  }

  return `/* @pjs ${directives.join('; ')}; */\n`;
}

// ---------------------------------------------------------------------------
// imports
// ---------------------------------------------------------------------------

function stripLibraryImports(source: string, notes: string[]): string {
  const libraries = new Set<string>();

  const stripped = source.replace(
    /^[ \t]*import[ \t]+(processing|java|javax)\.[^\n;]*;[ \t]*$/gm,
    (line) => {
      const match = line.match(/import\s+((?:processing|java|javax)\.[\w.]*)/);
      if (match) libraries.add(match[1].replace(/\.\*$/, ''));
      return '';
    }
  );

  if (libraries.size > 0) {
    notes.push(`Removed Java imports (${[...libraries].sort().join(', ')}).`);
  }

  return stripped;
}

// ---------------------------------------------------------------------------
// nested interfaces
// ---------------------------------------------------------------------------

const INTERFACE_DECLARATION =
  /(?:^|[\n;{}])[ \t]*((?:public|private|protected|static|abstract|final)[ \t]+)*interface[ \t]+(\w+)[ \t]*(?:extends[^{]*)?\{/g;

/**
 * Processing.js registers a nested type under its bare name but cannot resolve
 * `Outer.Inner`, so an interface declared inside a class is moved to the top
 * level where both the declaration and `new Inner() { ... }` agree.
 */
function hoistNestedInterfaces(source: string, notes: string[]): string {
  const hoisted: string[] = [];
  const names: string[] = [];
  let working = source;

  // Re-scan after each hoist: removing a block shifts every later offset.
  for (;;) {
    const found = findNestedInterface(working);
    if (!found) break;

    hoisted.push(working.slice(found.start, found.end));
    names.push(found.name);
    working = working.slice(0, found.start) + working.slice(found.end);
  }

  if (hoisted.length === 0) {
    return source;
  }

  notes.push(`Hoisted nested interface(s) to top level: ${names.join(', ')}.`);

  // Qualified references to the old nesting no longer resolve.
  for (const name of names) {
    working = working.replace(new RegExp(`\\b\\w+\\.${name}\\b`, 'g'), name);
  }

  return `${hoisted.join('\n\n')}\n\n${working}`;
}

function findNestedInterface(
  source: string
): { start: number; end: number; name: string } | null {
  const depths = braceDepths(source);

  INTERFACE_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INTERFACE_DECLARATION.exec(source)) !== null) {
    const keywordIndex = source.indexOf('interface', match.index);
    if (depths[keywordIndex] === 0) continue;

    const openBrace = match.index + match[0].length - 1;
    const closeBrace = matchBrace(source, openBrace);
    if (closeBrace < 0) continue;

    // Start at the beginning of the declaration line, not the preceding token.
    let start = keywordIndex;
    while (start > 0 && source[start - 1] !== '\n') start -= 1;

    let end = closeBrace + 1;
    while (end < source.length && source[end] !== '\n') end += 1;
    if (end < source.length) end += 1;

    return { start, end, name: match[2] };
  }

  return null;
}

// ---------------------------------------------------------------------------
// lambdas
// ---------------------------------------------------------------------------

interface FunctionalInterface {
  name: string;
  returnType: string;
  methodName: string;
  parameterTypes: string[];
}

const LAMBDA_START = /(\([^()\n]*\)|\b[A-Za-z_$][\w$]*)[ \t]*->/g;

/**
 * `x -> doThing(x)` is a syntax error for Processing.js. Rewrites it to
 * `new Iface() { void method(int x) { doThing(x); } }`, resolving `Iface`
 * against the single-method interfaces declared in the same bundle.
 */
function rewriteLambdas(source: string, notes: string[]): string {
  const interfaces = collectFunctionalInterfaces(source);
  let working = source;
  let rewritten = 0;

  for (;;) {
    const depths = braceDepths(working);
    LAMBDA_START.lastIndex = 0;

    let match: RegExpExecArray | null = null;
    let found: RegExpExecArray | null = null;

    while ((match = LAMBDA_START.exec(working)) !== null) {
      if (depths[match.index] < 0) continue; // inside a string or comment
      found = match;
      break;
    }

    if (!found) break;

    const parameters = parseLambdaParameters(found[1]);
    const arrowEnd = found.index + found[0].length;
    const body = readLambdaBody(working, arrowEnd);

    const target = resolveFunctionalInterface(interfaces, parameters.length);
    if (!target) {
      throw new Error(
        `Could not convert the Java lambda near "${found[0].trim()}" for browser playback: ` +
          `no single-method interface with ${parameters.length} parameter(s) is declared in this sketch. ` +
          `Replace the lambda with an anonymous class (new MyInterface() { ... }).`
      );
    }

    const replacement = buildAnonymousClass(target, parameters, body.text, body.isBlock);

    working = working.slice(0, found.index) + replacement + working.slice(body.end);
    rewritten += 1;

    if (rewritten > 200) {
      throw new Error('Too many lambda expressions to convert for browser playback.');
    }
  }

  if (rewritten > 0) {
    notes.push(
      `Converted ${rewritten} Java lambda expression(s) into anonymous classes.`
    );
  }

  return working;
}

function collectFunctionalInterfaces(source: string): FunctionalInterface[] {
  const interfaces: FunctionalInterface[] = [];

  INTERFACE_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INTERFACE_DECLARATION.exec(source)) !== null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = matchBrace(source, openBrace);
    if (closeBrace < 0) continue;

    const body = source.slice(openBrace + 1, closeBrace);
    const methods = [
      ...body.matchAll(/(?:^|;|\{|\})\s*(?:public\s+|abstract\s+)*([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*;/g),
    ];

    if (methods.length !== 1) continue;

    const [, returnType, methodName, rawParameters] = methods[0];

    interfaces.push({
      name: match[2],
      returnType,
      methodName,
      parameterTypes: splitParameters(rawParameters).map((parameter) => {
        const parts = parameter.trim().split(/\s+/);
        return parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
      }),
    });
  }

  return interfaces;
}

function resolveFunctionalInterface(
  interfaces: FunctionalInterface[],
  parameterCount: number
): FunctionalInterface | null {
  const candidates = interfaces.filter(
    (candidate) => candidate.parameterTypes.length === parameterCount
  );

  return candidates.length === 1 ? candidates[0] : null;
}

function buildAnonymousClass(
  target: FunctionalInterface,
  parameterNames: string[],
  body: string,
  isBlock: boolean
): string {
  const signature = parameterNames
    .map((name, index) => `${target.parameterTypes[index] ?? 'Object'} ${name}`)
    .join(', ');

  const statements = isBlock
    ? body
    : target.returnType === 'void'
      ? `${body.trim()};`
      : `return ${body.trim()};`;

  return (
    `new ${target.name}() { ${target.returnType} ${target.methodName}(${signature}) ` +
    `{ ${statements.trim()} } }`
  );
}

function parseLambdaParameters(raw: string): string[] {
  const trimmed = raw.trim();

  if (!trimmed.startsWith('(')) {
    return [trimmed];
  }

  return splitParameters(trimmed.slice(1, -1)).map((parameter) => {
    const parts = parameter.trim().split(/\s+/);
    return parts[parts.length - 1];
  });
}

/** Reads a lambda body: either `{ ... }`, or an expression up to the enclosing `,` / `)`. */
function readLambdaBody(
  source: string,
  from: number
): { text: string; end: number; isBlock: boolean } {
  let index = from;
  while (index < source.length && /\s/.test(source[index])) index += 1;

  if (source[index] === '{') {
    const close = matchBrace(source, index);
    if (close < 0) {
      throw new Error('Unbalanced braces in a lambda body.');
    }
    return { text: source.slice(index + 1, close), end: close + 1, isBlock: true };
  }

  let depth = 0;
  let cursor = index;

  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor];

    if (character === '"' || character === "'") {
      cursor = skipString(source, cursor);
      continue;
    }

    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) {
      if (depth === 0) break;
      depth -= 1;
    } else if ((character === ',' || character === ';') && depth === 0) break;
  }

  return { text: source.slice(index, cursor), end: cursor, isBlock: false };
}

function splitParameters(raw: string): string[] {
  if (!raw.trim()) return [];

  const parameters: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of raw) {
    if ('(<['.includes(character)) depth += 1;
    if (')>]'.includes(character)) depth -= 1;

    if (character === ',' && depth === 0) {
      parameters.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) parameters.push(current);
  return parameters;
}

// ---------------------------------------------------------------------------
// name collisions
// ---------------------------------------------------------------------------

const PRIMITIVE_TYPES =
  'void|int|float|double|long|short|byte|char|boolean|String|color|PImage|PFont|PShape|PGraphics|PVector|Table';

const TOP_LEVEL_FUNCTION = new RegExp(
  `(?:^|[\\n;}])[ \\t]*(?:(?:public|private|protected|static|final)[ \\t]+)*` +
    `(?:${PRIMITIVE_TYPES}|[A-Za-z_$][\\w$]*)(?:[ \\t]*\\[[ \\t]*\\])*[ \\t]+(\\w+)[ \\t]*\\([^)]*\\)[ \\t]*\\{`,
  'g'
);

const RESERVED_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'do', 'try', 'synchronized',
]);

/**
 * Java keeps fields and methods in separate namespaces, so `Menu menu;` next to
 * `void menu() { ... }` is legal. JavaScript does not: Processing.js emits both
 * as `menu`, the field initializer wins, and the sketch dies on
 * `menu = menu.bind($p)`. Renaming the function keeps the far more common
 * `menu.display()` field references intact.
 */
function renameFunctionsShadowedByFields(source: string, notes: string[]): string {
  const depths = braceDepths(source);
  const functionNames = new Set<string>();

  TOP_LEVEL_FUNCTION.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOP_LEVEL_FUNCTION.exec(source)) !== null) {
    const nameIndex = match.index + match[0].lastIndexOf(match[1], match[0].indexOf('('));
    if (depths[nameIndex] !== 0) continue;
    if (RESERVED_NAMES.has(match[1])) continue;

    functionNames.add(match[1]);

    // Overlapping declarations: back up so the next one is still seen.
    TOP_LEVEL_FUNCTION.lastIndex = match.index + match[0].length - 1;
  }

  const renamed: string[] = [];
  let working = source;

  for (const name of functionNames) {
    if (!hasTopLevelField(working, name)) continue;

    let replacement = `${name}_fn`;
    while (new RegExp(`\\b${replacement}\\b`).test(working)) {
      replacement += '_';
    }

    // `menu(` is the function; `this.menu(` and `obj.menu(` are not.
    const callSites = braceDepths(working);

    working = working.replace(
      new RegExp(`(?<![.\\w$])${name}[ \\t]*\\(`, 'g'),
      (match: string, offset: number) =>
        callSites[offset] < 0 ? match : `${replacement}(`
    );

    renamed.push(`${name}() -> ${replacement}()`);
  }

  if (renamed.length > 0) {
    notes.push(
      `Renamed function(s) that collide with a variable of the same name: ${renamed.join(', ')}.`
    );
  }

  return working;
}

function hasTopLevelField(source: string, name: string): boolean {
  const depths = braceDepths(source);

  const pattern = new RegExp(
    `(?:^|[\\n;}])[ \\t]*(?:(?:public|private|protected|static|final)[ \\t]+)*` +
      `(?:${PRIMITIVE_TYPES}|[A-Z][\\w$]*)(?:[ \\t]*<[^>\\n]*>)?(?:[ \\t]*\\[[ \\t]*\\])*[ \\t]+` +
      `${name}[ \\t]*(?:=[^;\\n]*)?;`,
    'g'
  );

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const nameIndex = source.indexOf(name, match.index);
    if (depths[nameIndex] === 0) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// char concatenation
// ---------------------------------------------------------------------------

const STRING_DECLARATION = /\bString[ \t]+(\w+)[ \t]*(?==|;|,|\))/g;
const STRING_LITERAL = '"(?:[^"\\\\]|\\\\.)*"';

/**
 * Processing.js models `key` as an object whose valueOf() is the character
 * code, so `name += key` concatenates "97" where Java would append "a".
 * `str()` has the Java meaning in both runtimes, so wrapping the concatenation
 * keeps the bundle valid Processing while fixing the browser behaviour.
 *
 * Only concatenations with a known-String left-hand side are touched;
 * arithmetic such as `key + 1` keeps its numeric meaning.
 */
function fixCharConcatenation(source: string, notes: string[]): string {
  const stringVariables = new Set<string>();

  STRING_DECLARATION.lastIndex = 0;
  let declaration: RegExpExecArray | null;

  while ((declaration = STRING_DECLARATION.exec(source)) !== null) {
    stringVariables.add(declaration[1]);
  }

  const names = [...stringVariables].map(escapeForRegExp);
  const stringOperand =
    names.length > 0 ? `(?:${STRING_LITERAL}|\\b(?:${names.join('|')})\\b)` : STRING_LITERAL;

  type Rewrite = { pattern: RegExp; build: (groups: string[]) => string };

  const rewrites: Rewrite[] = [];

  if (names.length > 0) {
    // name += key
    rewrites.push({
      pattern: new RegExp(`(\\b(?:${names.join('|')})[ \\t]*\\+=[ \\t]*)key\\b`, 'g'),
      build: (groups) => `${groups[0]}str(key)`,
    });
  }

  // "text" + key   /   name + key
  rewrites.push({
    pattern: new RegExp(`(${stringOperand}[ \\t]*\\+[ \\t]*)key\\b`, 'g'),
    build: (groups) => `${groups[0]}str(key)`,
  });

  // key + "text"
  rewrites.push({
    pattern: new RegExp(`(?<![.\\w$])key([ \\t]*\\+[ \\t]*${STRING_LITERAL})`, 'g'),
    build: (groups) => `str(key)${groups[0]}`,
  });

  let working = source;
  let fixed = 0;

  for (const { pattern, build } of rewrites) {
    const depths = braceDepths(working);

    working = working.replace(pattern, (match: string, ...rest: unknown[]) => {
      const offset = rest[rest.length - 2] as number;
      if (depths[offset] < 0) return match;

      fixed += 1;
      return build(rest.slice(0, -2) as string[]);
    });
  }

  if (fixed > 0) {
    notes.push(
      `Wrapped ${fixed} concatenation(s) of key with str() so characters append as text.`
    );
  }

  return working;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

function collectAssets(source: string): {
  images: string[];
  fonts: string[];
  tables: string[];
} {
  const images = new Set<string>();
  const fonts = new Set<string>();
  const tables = new Set<string>();

  const loaderPattern = new RegExp(
    `\\b(?:${ASSET_LOADERS.join('|')})\\s*\\(\\s*"([^"]+)"`,
    'g'
  );

  const soundPattern = /\bnew\s+(?:SoundFile|AudioSample)\s*\(\s*\w+\s*,\s*"([^"]+)"/g;

  for (const pattern of [loaderPattern, soundPattern]) {
    for (const match of source.matchAll(pattern)) {
      const asset = normalizeAssetPath(match[1]);
      const extension = asset.split('.').pop()?.toLowerCase() ?? '';

      if (IMAGE_EXTENSIONS.includes(extension)) images.add(asset);
      else if (FONT_EXTENSIONS.includes(extension)) fonts.add(asset);
      else if (TABLE_EXTENSIONS.includes(extension)) tables.add(asset);
    }
  }

  return {
    images: [...images],
    fonts: [...fonts],
    tables: [...tables],
  };
}

/**
 * Sketch assets are served from the `data/` directory, which the player sets as
 * the document base URL. `loadImage("data/x.png")` and `loadImage("x.png")`
 * both mean the same file in Processing, so normalize to the bare name.
 */
export function normalizeAssetPath(assetPath: string): string {
  return assetPath.replace(/^\.?\/*/, '').replace(/^data\//i, '');
}

/** Rewrites `data/x.png` to `x.png` inside loader calls, matching the player's base URL. */
export function normalizeAssetReferences(source: string): string {
  const loaderPattern = new RegExp(
    `(\\b(?:${ASSET_LOADERS.join('|')})\\s*\\(\\s*")data/`,
    'gi'
  );

  return source
    .replace(loaderPattern, '$1')
    .replace(/(\bnew\s+(?:SoundFile|AudioSample)\s*\(\s*\w+\s*,\s*")data\//gi, '$1')
    .replace(/(\bsaveTable\s*\([^,]+,\s*")data\//gi, '$1');
}

// ---------------------------------------------------------------------------
// delay()
// ---------------------------------------------------------------------------

/**
 * Records that the sketch calls delay(), which the player has to emulate.
 *
 * Processing.js ships delay() as a function that throws, so this used to end
 * the sketch on the first call. public/processing-compat.js replaces it with a
 * real pause, but a browser tab cannot be held indefinitely the way a desktop
 * animation thread can, so a long delay() is shortened. Saying so in the
 * bundle header means the one behaviour LafHack cannot reproduce exactly is
 * written down next to the sketch it affects.
 */
function noteEmulatedDelay(source: string, notes: string[]): void {
  const depths = braceDepths(source);
  let calls = 0;

  for (const match of source.matchAll(/(?<![.\w$])delay\s*\(/g)) {
    const index = match.index;
    if (index === undefined || depths[index] === -1) continue;
    // A sketch that writes its own void delay() keeps it; PJS prefers the
    // sketch's definition over the one on the default scope.
    if (/\b(?:void|int|float|boolean)\s+$/.test(source.slice(Math.max(0, index - 16), index))) {
      return;
    }
    calls += 1;
  }

  if (calls > 0) {
    notes.push(
      `Emulated ${calls} delay() call(s): Processing.js has none, so the player ` +
        `holds the frame instead, within a budget that keeps the page responsive.`
    );
  }
}

// ---------------------------------------------------------------------------
// lexical helpers
// ---------------------------------------------------------------------------

/**
 * How many times `void <name>(` is defined at the top level of a tab.
 *
 * Uses the same lexer as everything else here so a mention inside a comment or
 * a string does not count -- a false positive would reject a perfectly good
 * sketch, which is worse than the runtime error it is meant to prevent.
 */
export function countTopLevelDefinitions(source: string, name: string): number {
  const depths = braceDepths(source);
  const pattern = new RegExp(`\\bvoid\\s+${name}\\s*\\(`, 'g');

  let count = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index !== undefined && depths[match.index] === 0) count += 1;
  }

  return count;
}

/**
 * Brace depth at every offset, with `-1` marking positions inside a string
 * literal or comment so scans can ignore them.
 */
function braceDepths(source: string): Int32Array {
  const depths = new Int32Array(source.length);
  let depth = 0;
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') {
        depths[index] = -1;
        index += 1;
      }
      continue;
    }

    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end < 0 ? source.length : end + 2;
      while (index < stop) {
        depths[index] = -1;
        index += 1;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      const end = skipString(source, index);
      while (index <= end && index < source.length) {
        depths[index] = -1;
        index += 1;
      }
      continue;
    }

    if (character === '{') {
      depths[index] = depth;
      depth += 1;
      index += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      depths[index] = depth;
      index += 1;
      continue;
    }

    depths[index] = depth;
    index += 1;
  }

  return depths;
}

/** Index of the string's closing quote, given the index of its opening quote. */
function skipString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index;
    if (source[index] === '\n' && quote === "'") return index;
    index += 1;
  }

  return source.length - 1;
}

/** Index of the `}` matching the `{` at `openIndex`, or -1. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];

    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index);
      index = newline < 0 ? source.length : newline;
      continue;
    }

    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }

    if (character === '"' || character === "'") {
      index = skipString(source, index);
      continue;
    }

    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}
