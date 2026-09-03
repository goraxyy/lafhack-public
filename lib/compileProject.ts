import fs from 'fs/promises';
import path from 'path';
import {
  buildDirectiveHeader,
  countTopLevelDefinitions,
  makeProcessingJsCompatible,
} from './processingCompat.ts';

export interface CompileResult {
  success: boolean;
  error?: string;
  mainFile?: string;
  tabCount?: number;
  /** Data files the sketch reads through loadTable(), relative to `data/`. */
  tables?: string[];
  /** What the Processing.js compatibility pass had to rewrite. */
  compatNotes?: string[];
  /** Assets the sketch loads that are not present in the uploaded data/ folder. */
  missingAssets?: string[];
}

const PDE_EXT = '.pde';
const JAVA_EXT = '.java';
const DATA_DIR_NAME = 'data';
const SKETCH_PROPERTIES = 'sketch.properties';
const BUNDLE_FILENAME = 'bundle.pde';

interface Tab {
  fileName: string;
  baseName: string;
  content: string;
  fromJava: boolean;
}

export async function compileProject(
  inputDir: string,
  outputDir: string
): Promise<CompileResult> {
  try {
    const sketchRoot = await detectSketchRoot(inputDir);
    if (!sketchRoot) {
      return {
        success: false,
        error: 'No .pde or .java files found in the uploaded project. Nothing to compile.',
      };
    }

    const sourceFiles = await listSourceFiles(sketchRoot);
    const pdeFiles = sourceFiles.filter((fileName) => fileName.endsWith(PDE_EXT));
    const javaFiles = sourceFiles.filter((fileName) => fileName.endsWith(JAVA_EXT));

    const javaTabs: Tab[] = [];
    for (const fileName of javaFiles) {
      let content: string;
      try {
        content = await fs.readFile(path.join(sketchRoot, fileName), 'utf-8');
      } catch (err) {
        return {
          success: false,
          error: `Failed to read ${fileName}: ${(err as Error).message}`,
        };
      }

      javaTabs.push({
        fileName,
        baseName: path.basename(fileName, JAVA_EXT),
        content,
        fromJava: true,
      });
    }

    const pdeTabs: Tab[] = [];
    for (const fileName of pdeFiles) {
      let content: string;
      try {
        content = await fs.readFile(path.join(sketchRoot, fileName), 'utf-8');
      } catch (err) {
        return {
          success: false,
          error: `Failed to read ${fileName}: ${(err as Error).message}`,
        };
      }

      pdeTabs.push({
        fileName,
        baseName: path.basename(fileName, PDE_EXT),
        content,
        fromJava: false,
      });
    }

    let mainFileName: string | null = null;
    const sketchPropertiesPath = path.join(sketchRoot, SKETCH_PROPERTIES);

    try {
      const props = await fs.readFile(sketchPropertiesPath, 'utf-8');
      const match = props.match(/^\s*main\s*=\s*(.+?)\s*$/m);
      if (match) {
        const candidate = match[1].trim();
        mainFileName =
          pdeTabs.find((t) => t.fileName === candidate)?.fileName ??
          pdeTabs.find((t) => path.basename(t.fileName) === candidate)?.fileName ??
          null;
      }
    } catch {
      // sketch.properties is optional.
    }

    if (!mainFileName) {
      const setupRegex = /void\s+setup\s*\(/;
      const drawRegex = /void\s+draw\s*\(/;
      const candidate = pdeTabs.find(
        (t) => setupRegex.test(t.content) && drawRegex.test(t.content)
      );
      if (candidate) {
        mainFileName = candidate.fileName;
      }
    }

    if (!mainFileName) {
      return {
        success: false,
        error:
          'Could not determine the main sketch file. Add sketch.properties with "main=YourSketch.pde", or ensure one .pde file defines both setup() and draw().',
      };
    }

    // Tabs are concatenated into one class, so two setup() or draw() bodies is
    // a duplicate method -- Processing rejects it, and Processing.js fails at
    // run time with a stack trace the uploader cannot act on. Say it here
    // instead, naming the files.
    for (const functionName of ['setup', 'draw']) {
      const definedIn = pdeTabs.filter(
        (tab) => countTopLevelDefinitions(tab.content, functionName) > 0
      );

      const total = definedIn.reduce(
        (sum, tab) => sum + countTopLevelDefinitions(tab.content, functionName),
        0
      );

      if (total > 1) {
        return {
          success: false,
          error:
            `${functionName}() is defined ${total} times (in ${definedIn
              .map((tab) => tab.fileName)
              .join(', ')}). Processing merges every tab into one sketch, so ` +
            `it can only have one ${functionName}().`,
        };
      }
    }

    const mainTab = pdeTabs.find((tab) => tab.fileName === mainFileName)!;
    const otherPdeTabs = pdeTabs.filter((tab) => tab.fileName !== mainFileName);

    const orderedTabs: Tab[] = [
      ...javaTabs.sort((a, b) => a.fileName.localeCompare(b.fileName)),
      ...otherPdeTabs.sort((a, b) => a.fileName.localeCompare(b.fileName)),
      mainTab,
    ];

    const mergedTabs = orderedTabs
      .map((tab) => {
        const originLabel = tab.fromJava
          ? `${tab.fileName} (converted from .java)`
          : tab.fileName;
        return `// ---- Tab: ${originLabel} ----\n${tab.content.trimEnd()}\n`;
      })
      .join('\n');

    // Run the compatibility pass over the merged source rather than per tab:
    // a lambda in the main tab may target an interface declared in another one.
    const compat = makeProcessingJsCompatible(mergedTabs);

    const bundleContent =
      buildDirectiveHeader(compat) +
      `// Auto-generated by ProcessingPlay compileProject().\n` +
      `// Merged ${orderedTabs.length} tab(s). Main sketch: ${mainFileName}\n` +
      compat.notes.map((note) => `// ${note}\n`).join('') +
      `\n` +
      compat.source;

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, BUNDLE_FILENAME), bundleContent, 'utf-8');

    const outputDataDir = path.join(outputDir, DATA_DIR_NAME);
    const sourceDataDir = path.join(sketchRoot, DATA_DIR_NAME);
    let copiedData = false;

    try {
      const stat = await fs.stat(sourceDataDir);
      if (stat.isDirectory()) {
        await copyDir(sourceDataDir, outputDataDir);
        copiedData = true;
      }
    } catch {
      // no data directory
    }

    // A sketch that loads assets but shipped without them is broken on every
    // frame, and used to fail silently: the bundle compiled, the project went
    // `ready`, and each asset 404'd at play time with nothing in the logs.
    const referenced = [...compat.images, ...compat.fonts, ...compat.tables];

    const missingAssets = copiedData
      ? await filterMissing(outputDataDir, referenced)
      : referenced;

    if (referenced.length > 0 && missingAssets.length === referenced.length) {
      return {
        success: false,
        error:
          `This sketch loads ${referenced.length} file(s) from data/ ` +
          `(${referenced.slice(0, 3).join(', ')}${referenced.length > 3 ? ', ...' : ''}), ` +
          `but no data/ folder was found next to the sketch tabs in ` +
          `"${path.relative(inputDir, sketchRoot) || '.'}". ` +
          `Upload the sketch folder itself, so that data/ sits beside the .pde files.`,
      };
    }

    return {
      success: true,
      mainFile: mainFileName,
      tabCount: orderedTabs.length,
      tables: compat.tables,
      compatNotes: compat.notes,
      missingAssets,
    };
  } catch (err) {
    return {
      success: false,
      error: `Unexpected compile error: ${(err as Error).message}`,
    };
  }
}

/**
 * The sketch root is the directory that *contains* the tabs -- not the
 * shallowest directory they happen to share.
 *
 * Zipping a sketch folder, or picking its parent in the folder picker, nests
 * the sketch one or more levels deep. Stopping at the shared ancestor made
 * `data/` resolve one level too high, so it was silently skipped: the bundle
 * compiled, the project went `ready`, and every asset 404'd at play time.
 */
async function detectSketchRoot(inputDir: string): Promise<string | null> {
  const allFiles = await walkDir(inputDir, inputDir);

  const sourceFiles = allFiles.filter((filePath) => {
    const lower = filePath.toLowerCase();
    return lower.endsWith(PDE_EXT) || lower.endsWith(JAVA_EXT);
  });

  if (sourceFiles.length === 0) {
    return null;
  }

  // Only .pde tabs define a sketch root; .java tabs are helpers beside them.
  const rootBearing = sourceFiles.filter((filePath) =>
    filePath.toLowerCase().endsWith(PDE_EXT)
  );

  const candidates = [
    ...new Set(
      (rootBearing.length > 0 ? rootBearing : sourceFiles).map(parentDirectory)
    ),
  ];

  const score = (directory: string): number => {
    const prefix = directory ? `${directory}/` : '';
    let points = 0;

    if (allFiles.includes(`${prefix}${SKETCH_PROPERTIES}`)) points += 4;
    if (allFiles.some((filePath) => filePath.startsWith(`${prefix}${DATA_DIR_NAME}/`))) {
      points += 2;
    }

    return points;
  };

  candidates.sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;

    // Tie-break on the shallowest, so a plain flat upload still wins.
    return depthOf(a) - depthOf(b);
  });

  const root = candidates[0];
  return root ? path.join(inputDir, ...root.split('/')) : inputDir;
}

function parentDirectory(filePath: string): string {
  const parent = path.posix.dirname(filePath);
  return parent === '.' ? '' : parent;
}

function depthOf(directory: string): number {
  return directory ? directory.split('/').length : 0;
}

async function listSourceFiles(rootDir: string): Promise<string[]> {
  const files = await walkDir(rootDir, rootDir);
  return files.filter((filePath) => {
    const lower = filePath.toLowerCase();
    return lower.endsWith(PDE_EXT) || lower.endsWith(JAVA_EXT);
  });
}

async function walkDir(rootDir: string, currentDir: string): Promise<string[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkDir(rootDir, absolutePath)));
      continue;
    }

    files.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
  }

  return files;
}

/** Which of `assets` are absent from the copied data directory. */
async function filterMissing(dataDir: string, assets: string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const asset of assets) {
    try {
      await fs.access(path.join(dataDir, ...asset.split('/')));
    } catch {
      missing.push(asset);
    }
  }

  return missing;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
