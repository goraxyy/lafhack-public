const ALLOWED_EXTENSIONS = new Set([
  'pde',
  'java',
  'properties',
  'txt',
  'json',
  'xml',
  'csv',
  'tsv',
  'md',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'mp3',
  'wav',
  'ogg',
  'aac',
  'm4a',
  'flac',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'fnt',
  'obj',
  'stl',
  'frag',
  'vert',
  'glsl',
  'mp4',
  'webm',
  'mov',
  'zip',
]);

export const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 1500;

/**
 * Cover images shown on gallery cards.
 *
 * The upload form crops to the card's 16:10 frame and re-encodes before
 * sending, so what actually reaches Storage is far below this. The cap is for
 * what arrives at the API -- including the play page's replace-thumbnail
 * control, which sends the file as picked.
 */
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

const THUMBNAIL_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

const THUMBNAIL_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function ensureThumbnailFile(fileName: string, size: number): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

  if (!extension || !THUMBNAIL_EXTENSIONS.has(extension)) {
    throw new Error('Thumbnail must be a PNG, JPG, WebP, or GIF image.');
  }

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Thumbnail image is empty.');
  }

  if (size > MAX_THUMBNAIL_BYTES) {
    throw new Error(
      `Thumbnail exceeds ${Math.round(MAX_THUMBNAIL_BYTES / 1024 / 1024)}MB limit.`
    );
  }

  return extension;
}

export function thumbnailContentType(extension: string): string {
  return THUMBNAIL_CONTENT_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Characters a path segment may contain.
 *
 * The traversal checks below are about *where* a file lands; this is about
 * what its name may say. An upload named
 * `x</script><img src=x onerror=...>.csv` cleared every other check and got
 * as far as the sketch page, where the asset list is embedded in a <script>
 * block -- and no amount of JSON encoding saves a script block from a literal
 * `</script>`. Both ends are fixed; this is the one that stops it at the door.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._ ()+-]*$/;

/** Content types the asset route is willing to serve, keyed by extension. */
const CONTENT_TYPES: Record<string, string> = {
  pde: 'text/plain; charset=utf-8',
  java: 'text/plain; charset=utf-8',
  properties: 'text/plain; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  tsv: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'text/plain; charset=utf-8',
  frag: 'text/plain; charset=utf-8',
  vert: 'text/plain; charset=utf-8',
  glsl: 'text/plain; charset=utf-8',
  obj: 'text/plain; charset=utf-8',
  stl: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  fnt: 'application/octet-stream',
  zip: 'application/zip',
};

/**
 * What to serve an asset as, decided from its extension alone.
 *
 * Never from the stored object's own content type: uploads go straight to
 * Storage through a signed URL, so the uploader picks that header. A .png
 * declared as text/html came back as HTML from our own origin, and the player
 * iframe runs `allow-scripts allow-same-origin` -- which is same-origin script
 * execution on the site.
 *
 * `svg` is deliberately absent: SVG is a script-bearing document format, and
 * there is no safe inline content type for it here. It falls through to
 * octet-stream, which still loads in <img> and cannot execute.
 */
export function contentTypeFor(filePath: string): string {
  const extension = filePath.includes('.') ? filePath.split('.').pop()?.toLowerCase() : '';
  return (extension && CONTENT_TYPES[extension]) || 'application/octet-stream';
}

/**
 * Paths the operating system adds that are not part of anyone's sketch.
 *
 * Every folder a Mac has ever opened contains `.DS_Store`, and zipping one in
 * Finder adds an `__MACOSX/` tree of `._` resource forks alongside it. None of
 * it belongs to the sketch, and none of it survives the filename rules below.
 *
 * They are dropped rather than rejected. Failing an upload because Finder left
 * a file the student cannot see, and would not know to delete, is a dead end:
 * the sketch runs perfectly in Processing, so the error reads as LafHack being
 * broken.
 */
const IGNORED_FILE_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const IGNORED_DIRECTORIES = new Set(['__macosx', '.git', '.svn', '__pycache__']);

export function isIgnorableUploadPath(inputPath: string): boolean {
  const segments = inputPath.replace(/\\+/g, '/').split('/').filter(Boolean);

  return segments.some((segment, index) => {
    const lower = segment.toLowerCase();

    if (IGNORED_DIRECTORIES.has(lower)) return true;
    // AppleDouble resource forks, always beside the file they shadow.
    if (segment.startsWith('._')) return true;
    // A trailing name is the file itself; anything earlier is a directory.
    if (index === segments.length - 1 && IGNORED_FILE_NAMES.has(lower)) return true;

    return false;
  });
}

export function sanitizeRelativePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\+/g, '/').replace(/^\.\//, '').trim();

  if (!normalized) {
    throw new Error('File path cannot be empty.');
  }

  if (normalized.startsWith('/') || normalized.startsWith('..')) {
    throw new Error(`Illegal file path: ${inputPath}`);
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Illegal file path: ${inputPath}`);
  }

  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`Illegal file path segment: ${inputPath}`);
    }

    if (!SAFE_SEGMENT.test(part)) {
      throw new Error(
        `Illegal characters in file name: ${part}. ` +
          'Use letters, numbers, spaces, and . _ - + ( ) only.'
      );
    }
  }

  return parts.join('/');
}

export function ensureAllowedExtension(filePath: string) {
  const ext = filePath.includes('.') ? filePath.split('.').pop()?.toLowerCase() : '';

  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type for "${filePath}".`);
  }
}
