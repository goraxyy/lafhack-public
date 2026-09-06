/**
 * Deciding how many sketches an upload actually contains.
 *
 * Processing keeps one sketch per folder: every `.pde` sitting directly in the
 * folder is a *tab* of that one sketch, merged into a single class. So a
 * `.pde` in a second folder is a second sketch, and a second `.pde` beside the
 * first that defines its own setup() and draw() is a second sketch too.
 *
 * LafHack plays one sketch per page, and used to silently pick one of them:
 * uploading a semester's folder produced a single tile and no hint that three
 * other games had been dropped. Both shapes are refused now, with the names of
 * what was found, so the uploader knows to submit them one at a time.
 *
 * Shared by the upload page -- which sees the paths the folder picker reports,
 * and can say this before a byte is uploaded -- and by compileProject(), which
 * sees the extracted tree and is the authority.
 */

import { isIgnorableUploadPath } from './uploadSecurity.ts';

const PDE_EXTENSION = '.pde';

export interface SketchFolder {
  /** Directory holding the tabs, `''` for the root of the upload. */
  directory: string;
  /** Names of the `.pde` files directly inside it, sorted. */
  tabs: string[];
}

/** Every directory that directly holds at least one `.pde`, shallowest first. */
export function findSketchFolders(paths: string[]): SketchFolder[] {
  const byDirectory = new Map<string, string[]>();

  for (const rawPath of paths) {
    const normalized = rawPath.replace(/\\+/g, '/').replace(/^\.?\/+/, '');

    if (!normalized.toLowerCase().endsWith(PDE_EXTENSION)) continue;
    // `__MACOSX/Sketch/._Sketch.pde` is a resource fork, not a sketch.
    if (isIgnorableUploadPath(normalized)) continue;

    const cut = normalized.lastIndexOf('/');
    const directory = cut < 0 ? '' : normalized.slice(0, cut);
    const fileName = cut < 0 ? normalized : normalized.slice(cut + 1);

    const tabs = byDirectory.get(directory);
    if (tabs) tabs.push(fileName);
    else byDirectory.set(directory, [fileName]);
  }

  return [...byDirectory.entries()]
    .map(([directory, tabs]) => ({ directory, tabs: tabs.sort() }))
    .sort((a, b) => depthOf(a.directory) - depthOf(b.directory) || a.directory.localeCompare(b.directory));
}

/** What to tell someone whose upload holds a sketch in more than one folder. */
export function multipleSketchFoldersMessage(folders: SketchFolder[]): string {
  const named = folders.map((folder) =>
    folder.directory ? `${folder.directory} (${folder.tabs.join(', ')})` : folder.tabs.join(', ')
  );

  return (
    `This upload holds ${folders.length} separate sketches: ${listOf(named)}. ` +
    `A LafHack page plays one sketch, so upload them one at a time — pick a ` +
    `single sketch folder, or zip that one folder on its own.`
  );
}

/** What to tell someone whose one folder holds several complete sketches. */
export function multipleSketchesInOneFolderMessage(fileNames: string[]): string {
  return (
    `This folder holds ${fileNames.length} separate sketches side by side: ` +
    `${listOf(fileNames)} each define their own setup() and draw(). Processing ` +
    `merges every .pde in a folder into one sketch, so these cannot run ` +
    `together. Give each one its own folder and upload them one at a time.`
  );
}

/** "a, b and c", trimmed once the list stops being worth reading in full. */
function listOf(items: string[], limit = 4): string {
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;

  const joined =
    shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0] ?? '';

  return rest > 0 ? `${joined} and ${rest} more` : joined;
}

function depthOf(directory: string): number {
  return directory ? directory.split('/').length : 0;
}
