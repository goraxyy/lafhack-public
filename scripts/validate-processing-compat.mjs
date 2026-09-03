/**
 * Assertions for lib/processingCompat.ts.
 *
 * Run with: node scripts/validate-processing-compat.mjs
 * (Node >= 23 strips the TypeScript types on import.)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildDirectiveHeader, makeProcessingJsCompatible } from '../lib/processingCompat.ts';
import { compileProject } from '../lib/compileProject.ts';

const checks = [];

function check(name, run) {
  checks.push([name, run]);
}

check('leaves an ordinary sketch alone', () => {
  const source = [
    'int x = 0;',
    'void setup() { size(200, 200); }',
    'void draw() { background(0); x++; }',
  ].join('\n');

  const result = makeProcessingJsCompatible(source);

  assert.equal(result.source, source);
  assert.deepEqual(result.notes, []);
  assert.equal(buildDirectiveHeader(result), '');
});

check('drops library imports', () => {
  const result = makeProcessingJsCompatible('import processing.sound.*;\nint x;');

  assert.ok(!result.source.includes('import processing'));
  assert.match(result.notes.join(' '), /Removed Java imports/);
});

check('converts a lambda into an anonymous class', () => {
  const source = [
    'interface Holder { void setState(int s); }',
    'void go() { thing.run(this, newState -> state = newState); }',
  ].join('\n');

  const result = makeProcessingJsCompatible(source);

  assert.ok(!result.source.includes('->'));
  assert.ok(
    result.source.includes('new Holder() { void setState(int newState) { state = newState; } }'),
    result.source
  );
});

check('converts a block-bodied lambda', () => {
  const source = [
    'interface Handler { int apply(int value); }',
    'void go() { run(v -> { return v * 2; }); }',
  ].join('\n');

  const result = makeProcessingJsCompatible(source);

  assert.ok(!result.source.includes('->'));
  assert.match(result.source, /new Handler\(\) \{ int apply\(int v\)/);
});

check('reports a lambda it cannot resolve', () => {
  assert.throws(
    () => makeProcessingJsCompatible('void go() { run(v -> v + 1); }'),
    /no single-method interface with 1 parameter/
  );
});

check('hoists a nested interface out of its class', () => {
  const source = [
    'class Outer {',
    '  public interface Nested { void go(int v); }',
    '  void run(Nested n) { n.go(1); }',
    '}',
    'void setup() { new Outer().run(new Outer.Nested() { void go(int v) {} }); }',
  ].join('\n');

  const result = makeProcessingJsCompatible(source);

  assert.ok(result.source.indexOf('interface Nested') < result.source.indexOf('class Outer'));
  assert.ok(!result.source.includes('Outer.Nested'));
  assert.match(result.notes.join(' '), /Hoisted nested interface/);
});

check('renames a function shadowed by a field of the same name', () => {
  const source = ['Menu menu;', 'void menu() { menu.display(this); }', 'void draw() { menu(); }'].join(
    '\n'
  );

  const result = makeProcessingJsCompatible(source);

  assert.match(result.source, /void menu_fn\(\)/);
  assert.match(result.source, /void draw\(\) \{ menu_fn\(\); \}/);
  // The field and its member access must survive untouched.
  assert.match(result.source, /Menu menu;/);
  assert.match(result.source, /menu\.display\(this\)/);
});

check('leaves a function alone when no field shadows it', () => {
  const source = 'void helper() { }\nvoid draw() { helper(); }';

  assert.equal(makeProcessingJsCompatible(source).source, source);
});

check('wraps key concatenation onto a String', () => {
  const source = 'String username = "";\nvoid keyPressed() { username += key; }';

  const result = makeProcessingJsCompatible(source);

  assert.match(result.source, /username \+= str\(key\);/);
});

check('leaves arithmetic on key alone', () => {
  const source = 'void keyPressed() { int next = key + 1; }';

  assert.equal(makeProcessingJsCompatible(source).source, source);
});

check('collects assets into @pjs directives', () => {
  const source = [
    'PImage a;',
    'PFont f;',
    'void setup() {',
    '  a = loadImage("data/sprite.png");',
    '  f = createFont("Mono.ttf", 12);',
    '  Table t = loadTable("scores.csv", "header");',
    '  SoundFile s = new SoundFile(this, "song.mp3");',
    '}',
  ].join('\n');

  const result = makeProcessingJsCompatible(source);

  assert.deepEqual(result.images, ['sprite.png']);
  assert.deepEqual(result.fonts, ['Mono.ttf']);
  assert.deepEqual(result.tables, ['scores.csv']);
  // data/ is stripped: the player sets data/ as the document base.
  assert.match(result.source, /loadImage\("sprite\.png"\)/);
  assert.equal(
    buildDirectiveHeader(result),
    '/* @pjs preload="sprite.png"; font="Mono.ttf"; */\n'
  );
});

check('ignores arrows and key inside strings and comments', () => {
  const source = [
    '// a lambda in a comment: x -> x',
    'String s = "arrow -> here";',
    'void draw() { text("key + 1", 0, 0); }',
  ].join('\n');

  assert.equal(makeProcessingJsCompatible(source).source, source);
});

check('does not rename a shadowed function name inside a string', () => {
  const source = [
    'Menu menu;',
    'void menu() { menu.display(this); }',
    'void draw() { text("menu(", 0, 0); menu(); }',
  ].join('\n');

  const result = makeProcessingJsCompatible(source);

  assert.match(result.source, /text\("menu\(", 0, 0\); menu_fn\(\);/);
});

// ---------------------------------------------------------------------------
// compileProject: sketch-root detection
// ---------------------------------------------------------------------------

const SKETCH_TABS = {
  'sketch.properties': 'main=Game.pde',
  'Game.pde': 'PImage hero;\nvoid setup() { hero = loadImage("hero.png"); }\nvoid draw() { image(hero, 0, 0); }',
  'Helper.java': 'public class Helper { }',
  'data/hero.png': 'not-really-a-png',
};

async function buildSketch(root, prefix) {
  for (const [relative, contents] of Object.entries(SKETCH_TABS)) {
    const destination = path.join(root, prefix, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, contents);
  }
}

/** Compiles a sketch laid out `prefix` levels deep and reports what came out. */
async function compileLayout(prefix, { withData = true } = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-compat-'));

  try {
    const input = path.join(temp, 'input');
    await buildSketch(input, prefix);

    if (!withData) {
      await fs.rm(path.join(input, prefix, 'data'), { recursive: true, force: true });
    }

    const result = await compileProject(input, path.join(temp, 'output'));
    const data = await fs
      .readdir(path.join(temp, 'output', 'data'))
      .catch(() => []);

    return { result, data };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

/**
 * Compiles an arbitrary set of files, given as { 'relative/path': contents }.
 * Complements compileLayout() above, which only varies where data/ sits.
 */
async function compileFiles(files) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lafhack-compile-'));
  const input = path.join(temp, 'input');

  try {
    for (const [relative, contents] of Object.entries(files)) {
      const destination = path.join(input, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, contents);
    }

    const result = await compileProject(input, path.join(temp, 'output'));
    const bundle = result.success
      ? await fs.readFile(path.join(temp, 'output', 'bundle.pde'), 'utf-8')
      : '';

    return { result, bundle };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

const asyncChecks = [
  [
    'copies data/ for a flat upload',
    async () => {
      const { result, data } = await compileLayout('');
      assert.equal(result.success, true, result.error);
      assert.deepEqual(data, ['hero.png']);
    },
  ],
  [
    'copies data/ when the sketch is nested one folder deep',
    async () => {
      // Zipping a sketch folder, or picking its parent, produces this layout.
      const { result, data } = await compileLayout('MySketch');
      assert.equal(result.success, true, result.error);
      assert.deepEqual(data, ['hero.png']);
      assert.deepEqual(result.missingAssets, []);
    },
  ],
  [
    'copies data/ when the sketch is nested several folders deep',
    async () => {
      const { result, data } = await compileLayout(path.join('Outer', 'Inner', 'MySketch'));
      assert.equal(result.success, true, result.error);
      assert.deepEqual(data, ['hero.png']);
    },
  ],
  [
    'fails loudly when the sketch loads assets but data/ is absent',
    async () => {
      const { result } = await compileLayout('MySketch', { withData: false });
      assert.equal(result.success, false);
      assert.match(result.error, /no data\/ folder was found/);
    },
  ],
  [
    'fails when the upload contains no sketch source at all',
    async () => {
      const { result } = await compileFiles({
        'readme.txt': 'just some notes',
        'data/hero.png': 'not really a png',
      });

      assert.equal(result.success, false);
      assert.match(result.error, /No \.pde or \.java files/);
    },
  ],
  [
    'merges multiple tabs into one bundle',
    async () => {
      const { result, bundle } = await compileFiles({
        'MySketch/MySketch.pde': 'void setup() { size(200, 200); }\nvoid draw() { helper(); }',
        'MySketch/Helper.pde': 'void helper() { background(0); }',
      });

      assert.equal(result.success, true, result.error);
      assert.equal(result.tabCount, 2);
      assert.match(bundle, /void setup\(\)/);
      assert.match(bundle, /void helper\(\)/);
    },
  ],
  [
    'refuses a sketch with setup() defined in two tabs',
    async () => {
      // Processing would reject the duplicate too; catching it here means the
      // uploader gets told why instead of a stack trace at play time.
      const { result } = await compileFiles({
        'MySketch/MySketch.pde': 'void setup() { size(200, 200); }\nvoid draw() {}',
        'MySketch/Extra.pde': 'void setup() { size(100, 100); }',
      });

      assert.equal(result.success, false, 'duplicate setup() should not compile');
      assert.match(result.error, /setup/i);
    },
  ],
  [
    'rejects a .java-only upload, since the main sketch must be a .pde',
    async () => {
      // In Processing a .java tab is a supplementary class; setup()/draw()
      // live in a .pde. Rejecting this is correct, not a gap.
      const { result } = await compileFiles({
        'MySketch/MySketch.java': 'public class Thing { int x; }',
      });

      assert.equal(result.success, false);
      assert.match(result.error, /main sketch file/);
    },
  ],
  [
    'merges a .java class alongside the .pde main tab',
    async () => {
      const { result, bundle } = await compileFiles({
        'MySketch/MySketch.pde': 'Thing t;\nvoid setup() { size(200, 200); }\nvoid draw() {}',
        'MySketch/Thing.java': 'import processing.core.*;\npublic class Thing { int x = 1; }',
      });

      assert.equal(result.success, true, result.error);
      assert.match(bundle, /class Thing/);
      // The library import cannot survive into Processing.js.
      assert.doesNotMatch(bundle, /import processing\.core/);
    },
  ],
  [
    'counts setup() in a comment as a mention, not a definition',
    async () => {
      // The duplicate check must not reject a valid sketch that merely talks
      // about setup() in a comment or a string.
      const { result } = await compileFiles({
        'MySketch/MySketch.pde': 'void setup() { size(200, 200); }\nvoid draw() {}',
        'MySketch/Notes.pde': '// void setup() { } is defined in the main tab\nString s = "void setup()";',
      });

      assert.equal(result.success, true, result.error);
    },
  ],
];

let failed = 0;

for (const [name, run] of asyncChecks) {
  try {
    await run();
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${error.message}`);
  }
}

for (const [name, run] of checks) {
  try {
    run();
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${error.message}`);
  }
}

const total = checks.length + asyncChecks.length;

if (failed > 0) {
  console.error(`\n${failed} of ${total} compatibility checks failed.`);
  process.exit(1);
}

console.log(`Validated ${total} Processing.js compatibility checks.`);
