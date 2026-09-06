import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { compileProject } from '@/lib/compileProject';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import {
  ensureAllowedExtension,
  isIgnorableUploadPath,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_UPLOAD_BYTES,
  sanitizeRelativePath,
} from '@/lib/uploadSecurity';
import { STORAGE_BUCKET } from '@/lib/storage';
import { clearStoragePrefix, listAllFiles } from '@/lib/storageCleanup';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * How many Storage requests to have in flight at once.
 *
 * This is the whole reason compiles were timing out. The Supabase project is
 * in ap-southeast-1 and Vercel runs this in iad1, so every Storage call is a
 * round trip across the Pacific -- a couple of hundred milliseconds each way.
 * A 23-file sketch is ~45 of those, and done one at a time that alone blew the
 * 60s budget on 2.5MB of input. The work is entirely network-bound, so
 * overlapping it is the fix; 8 is high enough to hide the latency and low
 * enough not to trip Storage rate limits.
 */
const STORAGE_CONCURRENCY = 8;

/** Runs `worker` over `items`, at most STORAGE_CONCURRENCY at a time. */
async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(STORAGE_CONCURRENCY, items.length) }, run)
  );

  return results;
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const viewer = await getViewer();

  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: project, error: projectError } = await adminClient
    .from('projects')
    .select('id, owner_id, status, updated_at, raw_folder_path')
    .eq('id', projectId)
    .maybeSingle<{
      id: string;
      owner_id: string | null;
      status: string;
      updated_at: string;
      raw_folder_path: string | null;
    }>();

  // Admins too: the retry control on the play page is shown to them, and an
  // owner-only check here made that button 404 for the people most likely to
  // be unsticking someone else's upload.
  if (
    projectError ||
    !project ||
    (project.owner_id !== viewer.id && viewer.role !== 'admin')
  ) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.status === 'ready') {
    return NextResponse.json({ projectId, status: 'ready' });
  }

  if (!project.raw_folder_path) {
    return NextResponse.json({ error: 'Project upload path is missing.' }, { status: 400 });
  }

  // Two compiles of the same project at once would race on the same
  // normalized/ prefix, and each one is a minute of cross-region traffic.
  // A run older than this is assumed dead, so a crashed worker cannot leave a
  // project permanently unretryable.
  const STALE_AFTER_MS = 3 * 60 * 1000;
  const inFlight =
    (project.status === 'processing' || project.status === 'queued') &&
    Date.now() - new Date(project.updated_at).getTime() < STALE_AFTER_MS;

  if (inFlight) {
    return NextResponse.json(
      { error: 'This sketch is already compiling. Give it a moment.' },
      { status: 409 }
    );
  }

  await adminClient
    .from('projects')
    .update({ status: 'queued', error_message: null })
    .eq('id', projectId);

  // Reported back to the uploader: a sketch whose data/ is incomplete still
  // compiles, and nobody should have to work out from a blank canvas that one
  // image never made it into the folder.
  let missingAssets: string[] = [];

  try {
    await adminClient
      .from('projects')
      .update({ status: 'processing', error_message: null })
      .eq('id', projectId);

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `lafhack-${projectId}-`));
    const inputDir = path.join(tempRoot, 'input');
    const outputDir = path.join(tempRoot, 'output');

    try {
      await fs.mkdir(inputDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });

      await downloadUploadedInput(adminClient, project.raw_folder_path, inputDir);

      const compileResult = await compileProject(inputDir, outputDir);
      if (!compileResult.success) {
        throw new Error(compileResult.error ?? 'Compilation failed.');
      }

      // Individually missing assets still 404 at play time. Say so here, so the
      // cause is in the logs rather than only in the browser's network tab.
      missingAssets = compileResult.missingAssets ?? [];

      if (compileResult.missingAssets?.length) {
        console.warn('Sketch references assets missing from data/:', {
          projectId,
          missingAssets: compileResult.missingAssets,
        });
      }

      const normalizedPrefix = `normalized/${projectId}`;
      await clearStoragePrefix(adminClient, normalizedPrefix);

      const bundlePath = path.join(outputDir, 'bundle.pde');
      const bundleBuffer = await fs.readFile(bundlePath);
      const { error: bundleUploadError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(`${normalizedPrefix}/bundle.pde`, bundleBuffer, {
          contentType: 'text/plain; charset=utf-8',
          upsert: true,
        });

      if (bundleUploadError) {
        throw new Error(`Failed to upload bundle.pde: ${bundleUploadError.message}`);
      }

      const outputDataDir = path.join(outputDir, 'data');
      const hasData = await uploadDirectoryToStorage(
        adminClient,
        outputDataDir,
        `${normalizedPrefix}/data`
      );

      const { error: readyError } = await adminClient
        .from('projects')
        .update({
          status: 'ready',
          bundle_pde_path: `${normalizedPrefix}/bundle.pde`,
          assets_folder_path: hasData ? `${normalizedPrefix}/data` : null,
          error_message: null,
        })
        .eq('id', projectId);

      if (readyError) {
        throw new Error(`Failed to update project status: ${readyError.message}`);
      }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }

    return NextResponse.json({ projectId, status: 'ready', missingAssets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project processing failed.';

    await adminClient
      .from('projects')
      .update({ status: 'failed', error_message: message })
      .eq('id', projectId);

    return NextResponse.json({ projectId, status: 'failed', error: message }, { status: 500 });
  }
}

async function downloadUploadedInput(
  adminClient: ReturnType<typeof createAdminClient>,
  rawPrefix: string,
  inputDir: string
) {
  const archiveFiles = await listAllFiles(adminClient, `${rawPrefix}/archive`);

  if (archiveFiles.length > 0) {
    const archivePath = archiveFiles[0];
    await extractArchiveFromStorage(adminClient, archivePath, inputDir);
    return;
  }

  const sourceFiles = await listAllFiles(adminClient, `${rawPrefix}/source`);
  if (sourceFiles.length === 0) {
    throw new Error('No uploaded files were found for this project.');
  }

  // Validate every path before fetching anything, so a bad name fails fast
  // rather than after a dozen downloads.
  const planned = sourceFiles
    .filter((objectPath) => !isIgnorableUploadPath(objectPath.slice(`${rawPrefix}/source/`.length)))
    .map((objectPath) => {
    const relativePath = sanitizeRelativePath(objectPath.slice(`${rawPrefix}/source/`.length));
    ensureAllowedExtension(relativePath);
    return { objectPath, relativePath };
  });

  const sizes = await mapWithConcurrency(planned, async ({ objectPath, relativePath }) => {
    const { data, error } = await adminClient.storage.from(STORAGE_BUCKET).download(objectPath);
    if (error || !data) {
      throw new Error(`Failed to download ${relativePath} from storage.`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.length > MAX_SINGLE_FILE_BYTES) {
      throw new Error(`Uploaded file exceeds size limit: ${relativePath}`);
    }

    const destination = safeJoin(inputDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);

    return buffer.length;
  });

  // Summed after the fact: a running total shared across parallel workers
  // would depend on completion order, so the limit would be enforced
  // inconsistently. The per-file cap above still bounds any single download.
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    throw new Error('Uploaded files exceed total size limit.');
  }
}

async function extractArchiveFromStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  archivePath: string,
  outputDir: string
) {
  const { data, error } = await adminClient.storage.from(STORAGE_BUCKET).download(archivePath);
  if (error || !data) {
    throw new Error('Failed to download ZIP archive from storage.');
  }

  const archiveBuffer = Buffer.from(await data.arrayBuffer());
  if (archiveBuffer.length > MAX_TOTAL_UPLOAD_BYTES) {
    throw new Error('ZIP archive exceeds total upload limit.');
  }

  const zip = await JSZip.loadAsync(archiveBuffer);

  let totalBytes = 0;

  for (const [entryName, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) {
      continue;
    }

    // A Finder-made zip carries __MACOSX/ and .DS_Store throughout. Skipping
    // them here is what stops a perfectly good sketch failing to extract.
    if (isIgnorableUploadPath(entryName)) {
      continue;
    }

    const relativePath = sanitizeRelativePath(entryName);
    ensureAllowedExtension(relativePath);

    const content = Buffer.from(await zipEntry.async('nodebuffer'));
    if (content.length > MAX_SINGLE_FILE_BYTES) {
      throw new Error(`ZIP entry exceeds file size limit: ${relativePath}`);
    }

    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new Error('ZIP contents exceed total upload size limit.');
    }

    const destination = safeJoin(outputDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
}

async function uploadDirectoryToStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  directory: string,
  storagePrefix: string
): Promise<boolean> {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    return false;
  }

  const files = await walkFiles(directory, directory);

  await mapWithConcurrency(files, async (relativePath) => {
    const buffer = await fs.readFile(path.join(directory, relativePath));
    const storagePath = `${storagePrefix}/${relativePath.split(path.sep).join('/')}`;

    const { error } = await adminClient.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    });

    if (error) {
      throw new Error(`Failed to upload ${relativePath}: ${error.message}`);
    }
  });

  return files.length > 0;
}

async function walkFiles(root: string, current: string): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, absolute)));
      continue;
    }

    files.push(path.relative(root, absolute));
  }

  return files;
}

function safeJoin(baseDir: string, relativePath: string): string {
  const destination = path.resolve(baseDir, relativePath);
  const base = path.resolve(baseDir) + path.sep;

  if (!destination.startsWith(base) && destination !== path.resolve(baseDir)) {
    throw new Error(`Invalid destination path: ${relativePath}`);
  }

  return destination;
}
