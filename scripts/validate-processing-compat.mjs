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
import { isIgnorableUploadPath } from '../lib/uploadSecurity.ts';
import { findSketchFolders } from '../lib/sketchLayout.ts';
import { sessionExpiry } from '../lib/sessionCookie.ts';

const checks = [];

function check(name, run) {
  checks.push([name, run]);
}

check('skips the files Finder leaves in a sketch folder', () => {
  // Every path here came out of a real student upload: a Finder-zipped
  // Processing sketch that LafHack refused because of them.
  for (const junk of [
    'Kablanbek_Lab4part2/.DS_Store',
    'Kablanbek_Lab4part2/data/.DS_Store',
    '__MACOSX/Kablanbek_Lab4part2/._.DS_Store',
    '__MACOSX/Kablanbek_Lab4part2/data/._apple.png',
    'Sketch/Thumbs.db',
  ]) {
    assert.equal(isIgnorableUploadPath(junk), true, `should skip ${junk}`);
  }

  for (const real of [
    'Kablanbek_Lab4part2/Kablanbek_Lab4part2.pde',
    'Kablanbek_Lab4part2/data/apple.png',
    'Kablanbek_Lab4part2/data/turn.mp3',
    'sketch.properties',
  ]) {
    assert.equal(isIgnorableUploadPath(real), false, `should keep ${real}`);
  }
});

check('groups .pde files by the folder that holds them', () => {
  const folders = findSketchFolders([
    'CS104/Lab1/Lab1.pde',
    'CS104/Lab2/Lab2.pde',
    'CS104/Lab2/Helper.pde',
    'CS104/Lab2/data/apple.png',
    'CS104/notes.txt',
    '__MACOSX/CS104/Lab1/._Lab1.pde',
  ]);

  assert.deepEqual(folders, [
    { directory: 'CS104/Lab1', tabs: ['Lab1.pde'] },
    { directory: 'CS104/Lab2', tabs: ['Helper.pde', 'Lab2.pde'] },
  ]);
});

check('sees one multi-tab sketch as one sketch', () => {
  const folders = findSketchFolders([
    'MySketch/MySketch.pde',
    'MySketch/Snake.pde',
    'MySketch/data/turn.mp3',
  ]);

  assert.equal(folders.length, 1);
  assert.deepEqual(folders[0].tabs, ['MySketch.pde', 'Snake.pde']);
});

check('notes delay() so the bundle records what the player emulates', () => {
  // Processing.js throws "does not support delay()" outright; the player
  // shims it, and the header says so.
  const result = makeProcessingJsCompatible(
    'void setup() { size(200, 200); }\nvoid draw() { if (mousePressed) { delay(200); } }'
  );

  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /delay\(\)/);
});

check('leaves a sketch that defines its own delay() unannotated', () => {
  const result = makeProcessingJsCompatible(
    'void delay(int ms) { }\nvoid setup() { }\nvoid draw() { delay(10); }'
  );

  assert.deepEqual(result.notes, []);
});

check('does not count delay() in a comment or a method call', () => {
  const result = makeProcessingJsCompatible(
    '// delay(200) used to crash here\nvoid draw() { timer.delay(5); }'
  );

  assert.deepEqual(result.notes, []);
});

function authCookie(session, { chunks = 1, base64 = true } = {}) {
  const json = JSON.stringify(session);
  const raw = base64 ? 'base64-' + Buffer.from(json, 'utf-8').toString('base64url') : json;
  const size = Math.ceil(raw.length / chunks);

  if (chunks === 1) return [{ name: 'sb-abcdefgh-auth-token', value: raw }];

  return Array.from({ length: chunks }, (_, index) => ({
    name: `sb-abcdefgh-auth-token.${index}`,
    value: raw.slice(index * size, (index + 1) * size),
  }));
}

check('reports no session when there is no auth cookie', () => {
  assert.equal(sessionExpiry([]), 'absent');
  assert.equal(sessionExpiry([{ name: 'other', value: 'x' }]), 'absent');
});

check('reads the expiry out of a base64 session cookie', () => {
  const expiresAt = 1893456000;
  assert.equal(sessionExpiry(authCookie({ expires_at: expiresAt })), expiresAt * 1000);
});

check('reads the expiry out of a plain JSON session cookie', () => {
  const expiresAt = 1893456000;
  assert.equal(
    sessionExpiry(authCookie({ expires_at: expiresAt }, { base64: false })),
    expiresAt * 1000
  );
});

check('reassembles a session split across chunk cookies', () => {
  // Real sessions pass 4KB and get split, and .10 must not sort before .2.
  const expiresAt = 1893456000;
  const session = { expires_at: expiresAt, user: { name: 'x'.repeat(6000) } };

  assert.equal(sessionExpiry(authCookie(session, { chunks: 12 })), expiresAt * 1000);
});

check('reassembles chunks handed over out of order', () => {
  const expiresAt = 1893456000;
  const cookies = authCookie({ expires_at: expiresAt, pad: 'y'.repeat(200) }, { chunks: 3 });

  assert.equal(sessionExpiry([...cookies].reverse()), expiresAt * 1000);
});

check('survives a session carrying non-ASCII text', () => {
  const expiresAt = 1893456000;
  const session = { expires_at: expiresAt, user: { name: 'Renée Ostrowski — Łódź' } };

  assert.equal(sessionExpiry(authCookie(session)), expiresAt * 1000);
});

check('refreshes rather than guessing when the cookie cannot be read', () => {
  // Every one of these has to come back 'unknown': the caller then does the
  // round trip it would have done anyway. Reporting a wrong expiry here would
  // sign someone out in the middle of a visit.
  for (const value of ['base64-not base64!!', 'not json', '', 'base64-']) {
    assert.equal(sessionExpiry([{ name: 'sb-x-auth-token', value }]), 'unknown');
  }

  assert.equal(sessionExpiry(authCookie({ no_expiry: true })), 'unknown');
  assert.equal(sessionExpiry(authCookie({ expires_at: 'soon' })), 'unknown');
  // A truncated chunk decodes to broken JSON rather than a plausible number.
  assert.equal(
    sessionExpiry(authCookie({ expires_at: 1893456000, pad: 'z'.repeat(400) }, { chunks: 4 }).slice(0, 2)),
    'unknown'
  );
});

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
    'compiles when data/ exists but is missing a referenced asset',
    async () => {
      // The case that used to be refused, and refused with the wrong reason:
      // data/ was found and copied, one image inside it was not there, and the
      // uploader was told no data/ folder existed. Processing runs this.
      const { result } = await compileFiles({
        'MySketch/MySketch.pde':
          'PImage a;\nvoid setup() { size(200, 200); a = loadImage("apple.png"); }\nvoid draw() {}',
        'MySketch/data/turn.mp3': 'not really audio',
      });

      assert.equal(result.success, true, result.error);
      assert.deepEqual(result.missingAssets, ['apple.png']);
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
    'refuses an upload holding a sketch in more than one folder',
    async () => {
      // Picking a semester folder used to compile whichever sketch scored
      // highest and drop the rest, with nothing to say the others existed.
      const { result } = await compileFiles({
        'CS104/Lab1/Lab1.pde': 'void setup() { size(200, 200); }\nvoid draw() {}',
        'CS104/Lab2/Lab2.pde': 'void setup() { size(300, 300); }\nvoid draw() {}',
      });

      assert.equal(result.success, false, 'two sketch folders should not compile');
      assert.match(result.error, /2 separate sketches/);
      assert.match(result.error, /CS104\/Lab1/);
      assert.match(result.error, /CS104\/Lab2/);
      assert.match(result.error, /one at a time/);
    },
  ],
  [
    'refuses a folder holding several complete sketches side by side',
    async () => {
      const { result } = await compileFiles({
        'Labs/Snake.pde': 'void setup() { size(200, 200); }\nvoid draw() {}',
        'Labs/Pong.pde': 'void setup() { size(300, 300); }\nvoid draw() {}',
      });

      assert.equal(result.success, false);
      assert.match(result.error, /2 separate sketches side by side/);
      assert.match(result.error, /own folder/);
    },
  ],
  [
    'still reports a plain duplicate setup() as a duplicate method',
    async () => {
      // Processing would reject the duplicate too; catching it here means the
      // uploader gets told why instead of a stack trace at play time. Only one
      // tab is a sketch in its own right, so uploading separately is not the
      // fix, and the message must not say it is.
      const { result } = await compileFiles({
        'MySketch/MySketch.pde': 'void setup() { size(200, 200); }\nvoid draw() {}',
        'MySketch/Extra.pde': 'void setup() { size(100, 100); }',
      });

      assert.equal(result.success, false);
      assert.match(result.error, /setup\(\) is defined 2 times/);
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
