import { NextRequest, NextResponse } from 'next/server';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SEMESTERS, type Semester } from '@/lib/types';
import {
  ensureAllowedExtension,
  isIgnorableUploadPath,
  ensureThumbnailFile,
  MAX_FILES_PER_UPLOAD,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_UPLOAD_BYTES,
  sanitizeRelativePath,
} from '@/lib/uploadSecurity';

export const runtime = 'nodejs';

type Visibility = 'public' | 'private';
type UploadMode = 'folder' | 'zip';

/**
 * Upload ceiling per account per hour.
 *
 * Counted from the projects table rather than an in-memory bucket: this runs
 * on serverless, so every instance would keep its own counter and the limit
 * would scale with concurrency instead of capping it. The row is written
 * before any bytes move, so an abandoned upload still counts -- which is the
 * behaviour you want from a spam limit.
 */
const MAX_UPLOADS_PER_HOUR = 20;

const MAX_TAGS = 10;
const MAX_COLLABORATORS = 10;
const MAX_SHORT_TEXT = 80;

interface UploadManifestEntry {
  relativePath: string;
  size: number;
  type?: string;
}

interface CreateUploadRequest {
  title: string;
  description?: string;
  visibility: Visibility;
  uploadMode: UploadMode;
  files?: UploadManifestEntry[];
  zipFileName?: string;
  zipFileSize?: number;
  thumbnailFileName?: string;
  thumbnailFileSize?: number;
  authorName?: string;
  collaborators?: string[];
  semester?: string;
  year?: number;
  genre?: string;
  tags?: string[];
  isFinalProject?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateUploadRequest>;

    const title = payload.title?.trim();
    const visibility = payload.visibility;
    const uploadMode = payload.uploadMode;

    if (!title) {
      return NextResponse.json({ error: 'A project title is required.' }, { status: 400 });
    }

    if (visibility !== 'public' && visibility !== 'private') {
      return NextResponse.json({ error: 'Visibility must be public or private.' }, { status: 400 });
    }

    if (uploadMode !== 'folder' && uploadMode !== 'zip') {
      return NextResponse.json({ error: 'Upload mode must be folder or zip.' }, { status: 400 });
    }

    const userClient = await createUserClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitClient = createAdminClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentUploads, error: countError } = await rateLimitClient
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .gte('created_at', since);

    if (countError) {
      // Fail open: a broken count must not block legitimate uploads.
      console.error('Upload rate-limit check failed', countError.message);
    } else if ((recentUploads ?? 0) >= MAX_UPLOADS_PER_HOUR) {
      return NextResponse.json(
        { error: `Upload limit reached (${MAX_UPLOADS_PER_HOUR} per hour). Try again later.` },
        { status: 429 }
      );
    }

    const metadata = parseMetadata(payload, user.email ?? null);

    const projectId = crypto.randomUUID();
    const rawPrefix = `raw/${projectId}`;

    const uploads: Array<{ relativePath: string; storagePath: string; token: string }> = [];
    let totalBytes = 0;

    if (uploadMode === 'folder') {
      // Dropped rather than rejected: the client already filters these, but a
      // stale tab or a direct caller should not fail over a .DS_Store either.
      const files = (payload.files ?? []).filter(
        (file) => !isIgnorableUploadPath(file.relativePath ?? '')
      );
      if (files.length === 0) {
        return NextResponse.json({ error: 'Please select at least one file.' }, { status: 400 });
      }
      if (files.length > MAX_FILES_PER_UPLOAD) {
        return NextResponse.json(
          { error: `Too many files. Limit is ${MAX_FILES_PER_UPLOAD}.` },
          { status: 400 }
        );
      }

      const seen = new Set<string>();
      for (const file of files) {
        const relativePath = sanitizeRelativePath(file.relativePath);
        ensureAllowedExtension(relativePath);

        if (seen.has(relativePath)) {
          return NextResponse.json(
            { error: `Duplicate file path detected: ${relativePath}` },
            { status: 400 }
          );
        }
        seen.add(relativePath);

        if (!Number.isFinite(file.size) || file.size <= 0) {
          return NextResponse.json({ error: `Invalid file size for ${relativePath}.` }, { status: 400 });
        }
        if (file.size > MAX_SINGLE_FILE_BYTES) {
          return NextResponse.json(
            {
              error: `File exceeds limit (${Math.round(MAX_SINGLE_FILE_BYTES / 1024 / 1024)}MB): ${relativePath}`,
            },
            { status: 400 }
          );
        }

        totalBytes += file.size;
        const storagePath = `${rawPrefix}/source/${relativePath}`;
        uploads.push({ relativePath, storagePath, token: '' });
      }
    } else {
      const zipFileName = payload.zipFileName?.trim();
      const zipFileSize = payload.zipFileSize;

      if (!zipFileName || !zipFileName.toLowerCase().endsWith('.zip')) {
        return NextResponse.json({ error: 'Please select a ZIP archive.' }, { status: 400 });
      }

      if (!Number.isFinite(zipFileSize) || (zipFileSize ?? 0) <= 0) {
        return NextResponse.json({ error: 'ZIP archive is empty.' }, { status: 400 });
      }

      if ((zipFileSize ?? 0) > MAX_TOTAL_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `ZIP exceeds ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB limit.` },
          { status: 400 }
        );
      }

      totalBytes = zipFileSize ?? 0;
      const zipBaseName = sanitizeRelativePath(zipFileName).split('/').pop() as string;
      uploads.push({
        relativePath: zipBaseName,
        storagePath: `${rawPrefix}/archive/${zipBaseName}`,
        token: '',
      });
    }

    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Upload exceeds ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB total limit.` },
        { status: 400 }
      );
    }

    // The thumbnail is optional and lives outside raw/, so it survives a
    // recompile and is not fed to the Processing compiler.
    let thumbnailPath: string | null = null;
    if (payload.thumbnailFileName) {
      const extension = ensureThumbnailFile(
        payload.thumbnailFileName,
        payload.thumbnailFileSize ?? 0
      );
      thumbnailPath = `thumbnails/${projectId}/cover.${extension}`;
      uploads.push({
        relativePath: '__thumbnail__',
        storagePath: thumbnailPath,
        token: '',
      });
    }

    const adminClient = createAdminClient();

    const { error: insertError } = await adminClient.from('projects').insert({
      id: projectId,
      title,
      description: metadata.description,
      visibility,
      owner_id: user.id,
      status: 'uploading',
      review_status: 'pending',
      raw_folder_path: rawPrefix,
      bundle_pde_path: null,
      assets_folder_path: null,
      error_message: null,
      thumbnail_path: thumbnailPath,
      author_name: metadata.authorName,
      collaborators: metadata.collaborators,
      semester: metadata.semester,
      year: metadata.year,
      genre: metadata.genre,
      tags: metadata.tags,
      is_final_project: metadata.isFinalProject,
    });

    if (insertError) {
      throw new Error(`Could not create project: ${insertError.message}`);
    }

    const signedResults = await Promise.all(
      uploads.map(async (upload) => {
        const { data, error } = await adminClient.storage
          .from('projects')
          .createSignedUploadUrl(upload.storagePath);

        if (error || !data?.token) {
          throw new Error(`Failed to prepare upload target for ${upload.relativePath}`);
        }

        return {
          ...upload,
          token: data.token,
          path: data.path,
        };
      })
    );

    return NextResponse.json({
      projectId,
      status: 'uploading',
      uploadMode,
      totalBytes,
      uploads: signedResults,
    });
  } catch (error) {
    console.error('Create project upload session failed:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create upload session.';
    const status =
      message.startsWith('Illegal file path') ||
      message.startsWith('Unsupported file type') ||
      message.startsWith('File path cannot be empty') ||
      message.startsWith('Thumbnail')
        ? 400
        : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

function parseMetadata(payload: Partial<CreateUploadRequest>, fallbackEmail: string | null) {
  const year = Number(payload.year);

  return {
    description: trimToNull(payload.description, 2000),
    authorName:
      trimToNull(payload.authorName, MAX_SHORT_TEXT) ?? fallbackEmail?.split('@')[0] ?? null,
    collaborators: cleanList(payload.collaborators, MAX_COLLABORATORS),
    semester: SEMESTERS.includes(payload.semester as Semester)
      ? (payload.semester as Semester)
      : null,
    year: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : null,
    genre: trimToNull(payload.genre, MAX_SHORT_TEXT),
    tags: cleanList(payload.tags, MAX_TAGS).map((tag) => tag.toLowerCase()),
    isFinalProject: payload.isFinalProject === true,
  };
}

function trimToNull(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function cleanList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();

  for (const entry of value) {
    const cleaned = trimToNull(entry, MAX_SHORT_TEXT);
    if (cleaned) seen.add(cleaned);
    if (seen.size >= limit) break;
  }

  return [...seen];
}
