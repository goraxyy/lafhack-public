'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STORAGE_BUCKET } from '@/lib/storage';
import { GENRES, SEMESTERS, type Semester } from '@/lib/types';
import { MAX_THUMBNAIL_BYTES } from '@/lib/uploadSecurity';
import { ThumbnailCropper } from '@/components/thumbnail-cropper';

type Mode = 'folder' | 'zip';
type Visibility = 'public' | 'private';
type UploadStage = 'idle' | 'preparing' | 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

const THUMBNAIL_TARGET = '__thumbnail__';

interface FileManifestEntry {
  relativePath: string;
  size: number;
  type: string;
}

interface UploadTarget {
  relativePath: string;
  storagePath: string;
  path: string;
  token: string;
}

interface ProjectStatusPayload {
  project: {
    id: string;
    status: UploadStage | 'error';
    errorMessage: string | null;
  };
}

export default function UploadPage() {
  const [mode, setMode] = useState<Mode>('folder');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [files, setFiles] = useState<File[]>([]);
  const [zip, setZip] = useState<File | null>(null);
  /** What gets uploaded: the framed crop the cropper hands back. */
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  /** The untouched pick, so the framing can be re-cut from the original. */
  const [thumbnailSource, setThumbnailSource] = useState<File | null>(null);

  const [title, setTitle] = useState('My Processing sketch');
  const [description, setDescription] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [collaborators, setCollaborators] = useState('');
  const [semester, setSemester] = useState<Semester | ''>('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [genre, setGenre] = useState('');
  const [tags, setTags] = useState('');
  const [isFinalProject, setIsFinalProject] = useState(false);

  const [stage, setStage] = useState<UploadStage>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState(0);

  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const thumbnailInput = useRef<HTMLInputElement>(null);

  const selectedFileCount = mode === 'folder' ? files.length : zip ? 1 : 0;
  const selectedTotalBytes = useMemo(() => {
    const base = mode === 'folder' ? files.reduce((total, file) => total + file.size, 0) : zip?.size ?? 0;
    return base + (thumbnail?.size ?? 0);
  }, [files, mode, thumbnail, zip]);

  const uploadPercent =
    selectedTotalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / selectedTotalBytes) * 100)) : 0;

  function selectMode(next: Mode) {
    setMode(next);
    setFiles([]);
    setZip(null);
    setMessage(null);
    setStage('idle');
    setProjectId(null);
    setUploadedBytes(0);
    setUploadedFiles(0);
  }

  function clearThumbnail() {
    setThumbnail(null);
    setThumbnailSource(null);
  }

  function selectThumbnail(file: File | null) {
    if (!file) {
      clearThumbnail();
      return;
    }

    if (file.size > MAX_THUMBNAIL_BYTES) {
      setStage('failed');
      setMessage(
        `Image must be under ${Math.round(MAX_THUMBNAIL_BYTES / 1024 / 1024)}MB.`
      );
      return;
    }

    setMessage(null);
    if (stage === 'failed') setStage('idle');
    setThumbnailSource(file);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setStage('failed');
      setMessage('Enter a title for the sketch.');
      return;
    }

    if (mode === 'folder' && files.length === 0) {
      setStage('failed');
      setMessage('Select a project folder first.');
      return;
    }

    if (mode === 'zip' && !zip) {
      setStage('failed');
      setMessage('Select a ZIP file first.');
      return;
    }

    setStage('preparing');
    setMessage(null);
    setProjectId(null);
    setUploadedBytes(0);
    setUploadedFiles(0);

    try {
      const manifest: FileManifestEntry[] = files.map((file) => ({
        relativePath: normalizeRelativePath(file.webkitRelativePath || file.name),
        size: file.size,
        type: file.type,
      }));

      const initResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description,
          visibility,
          uploadMode: mode,
          files: mode === 'folder' ? manifest : undefined,
          zipFileName: mode === 'zip' ? zip?.name : undefined,
          zipFileSize: mode === 'zip' ? zip?.size : undefined,
          thumbnailFileName: thumbnail?.name,
          thumbnailFileSize: thumbnail?.size,
          authorName,
          collaborators: splitList(collaborators),
          semester: semester || undefined,
          year: Number(year) || undefined,
          genre,
          tags: splitList(tags),
          isFinalProject,
        }),
      });

      const initPayload = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok) {
        throw new Error(initPayload.error || 'Unable to prepare upload session.');
      }

      const nextProjectId = initPayload.projectId as string | undefined;
      const targets = (initPayload.uploads ?? []) as UploadTarget[];

      if (!nextProjectId || targets.length === 0) {
        throw new Error('Upload session is missing upload targets.');
      }

      setProjectId(nextProjectId);
      setStage('uploading');

      const fileMap = new Map<string, File>();
      if (mode === 'folder') {
        for (const file of files) {
          fileMap.set(normalizeRelativePath(file.webkitRelativePath || file.name), file);
        }
      }

      const supabase = createClient();

      for (const target of targets) {
        const sourceFile =
          target.relativePath === THUMBNAIL_TARGET
            ? thumbnail
            : mode === 'zip'
              ? zip
              : fileMap.get(target.relativePath);

        if (!sourceFile) {
          throw new Error(`Missing source file for ${target.relativePath}`);
        }

        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .uploadToSignedUrl(target.path, target.token, sourceFile);

        if (error) {
          throw new Error(`Upload failed for ${target.relativePath}: ${error.message}`);
        }

        setUploadedFiles((value) => value + 1);
        setUploadedBytes((value) => value + sourceFile.size);
      }

      setStage('queued');
      setMessage('Upload complete. Compiling sketch...');

      const processResponse = await fetch(`/api/projects/${nextProjectId}/process`, {
        method: 'POST',
      });
      const processPayload = await processResponse.json().catch(() => ({}));
      if (!processResponse.ok) {
        throw new Error(processPayload.error || 'Failed to queue compilation job.');
      }

      await pollProjectStatus(nextProjectId);
    } catch (error) {
      setStage('failed');
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    }
  }

  async function pollProjectStatus(nextProjectId: string) {
    const pollLimit = 120;

    for (let attempt = 0; attempt < pollLimit; attempt += 1) {
      const response = await fetch(`/api/projects/${nextProjectId}`, {
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<ProjectStatusPayload> & {
        error?: string;
      };

      if (!response.ok || !payload.project) {
        throw new Error(payload.error || 'Failed to fetch project status.');
      }

      const status = payload.project.status;
      if (status === 'ready') {
        setStage('ready');
        setMessage(null);
        return;
      }

      if (status === 'failed' || status === 'error') {
        setStage('failed');
        setMessage(payload.project.errorMessage || 'Sketch compilation failed.');
        return;
      }

      if (status === 'processing' || status === 'queued' || status === 'uploading') {
        setStage(status === 'uploading' ? 'processing' : status);
        setMessage('Processing sketch...');
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 1500);
      });
    }

    throw new Error('Processing timed out. Please refresh the page to check status.');
  }

  const isBusy = ['preparing', 'uploading', 'queued', 'processing'].includes(stage);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold text-ink">Upload a sketch</h1>
      <p className="mt-2 text-ink-500">
        Upload a Processing sketch folder or ZIP archive. An admin plays and approves it
        before it appears in the gallery.
      </p>

      <div className="mt-8 flex gap-2">
        {(['folder', 'zip'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => selectMode(option)}
            disabled={isBusy}
            className={`rounded-md border px-4 py-2 text-sm font-medium ${mode === option ? 'border-accent bg-accent/10 text-accent' : 'border-ink-100 text-ink-500'}`}
          >
            {option === 'folder' ? 'Folder' : 'ZIP file'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <button
          type="button"
          onClick={() => (mode === 'folder' ? folderInput.current?.click() : zipInput.current?.click())}
          disabled={isBusy}
          className="w-full rounded-lg border-2 border-dashed border-ink-100 px-6 py-12 text-center text-sm text-ink-500 hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mode === 'folder'
            ? files.length
              ? `${files.length} file(s) selected`
              : 'Choose a project folder'
            : zip
              ? zip.name
              : 'Choose a ZIP file'}
        </button>

        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          // @ts-expect-error webkitdirectory is a browser-only extension
          webkitdirectory=""
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => setZip(event.target.files?.[0] ?? null)}
        />
        <input
          ref={thumbnailInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(event) => selectThumbnail(event.target.files?.[0] ?? null)}
        />

        <div className="rounded-md border border-ink-100 bg-ink-50 px-3 py-2 text-xs text-ink-500">
          <p>
            Selected: <strong>{selectedFileCount}</strong> file(s) ·{' '}
            <strong>{formatBytes(selectedTotalBytes)}</strong>
          </p>
          {stage === 'uploading' && (
            <p className="mt-1">
              Uploaded: {uploadedFiles}/{selectedFileCount + (thumbnail ? 1 : 0)} file(s) ·{' '}
              {formatBytes(uploadedBytes)} ({uploadPercent}%)
            </p>
          )}
        </div>

        {/* Thumbnail ------------------------------------------------------ */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Thumbnail</legend>
          <p className="text-xs text-ink-500">
            The cover image shown on gallery cards. A screenshot of your sketch works well.
            Drag to choose the framing. PNG, JPG, WebP or GIF, up to{' '}
            {Math.round(MAX_THUMBNAIL_BYTES / 1024 / 1024)}MB.
          </p>

          <ThumbnailCropper
            source={thumbnailSource}
            disabled={isBusy}
            onPick={() => thumbnailInput.current?.click()}
            onClear={() => selectThumbnail(null)}
            onChange={setThumbnail}
          />
        </fieldset>

        {/* Details -------------------------------------------------------- */}
        <Field label="Title">
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="My Processing sketch"
            className={INPUT}
          />
        </Field>

        <Field label="Description" hint="What is it, and how do you play?">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="A Tetris remix where aliens drop blocks on your house. Arrow keys move, up rotates, space drops."
            className={INPUT}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Author name">
            <input
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              placeholder="Your name"
              className={INPUT}
            />
          </Field>

          <Field label="Collaborators" hint="Comma separated">
            <input
              value={collaborators}
              onChange={(event) => setCollaborators(event.target.value)}
              placeholder="Justice L, Michael W"
              className={INPUT}
            />
          </Field>

          <Field label="Semester">
            <select
              value={semester}
              onChange={(event) => setSemester(event.target.value as Semester | '')}
              className={INPUT}
            >
              <option value="">Not specified</option>
              {SEMESTERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Year">
            <input
              type="number"
              min={1990}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className={INPUT}
            />
          </Field>

          <Field label="Genre">
            <input
              list="genre-options"
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              placeholder="Game"
              className={INPUT}
            />
            <datalist id="genre-options">
              {GENRES.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>

          <Field label="Tags" hint="Comma separated">
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="tetris, arcade, pixel-art"
              className={INPUT}
            />
          </Field>
        </div>

        <fieldset className="rounded-md border border-ink-100 p-4">
          <legend className="px-1 text-sm font-medium text-ink">
            Was this a final project?
          </legend>
          <p className="text-xs text-ink-500">
            Tick this if you handed the sketch in as the final project for a course.
          </p>
          <label className="mt-3 flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={isFinalProject}
              onChange={(event) => setIsFinalProject(event.target.checked)}
              disabled={isBusy}
              className="mt-0.5 h-4 w-4 rounded border-ink-200 text-accent focus:ring-accent"
            />
            <span>Yes, this was my final project</span>
          </label>
        </fieldset>

        <Field label="Visibility" hint="Private sketches stay visible only to you and admins">
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as Visibility)}
            className={INPUT}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </Field>

        <button
          type="submit"
          disabled={isBusy}
          className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? 'Working...' : 'Upload sketch'}
        </button>
      </form>

      {message && (
        <p className={`mt-6 rounded-md p-4 text-sm ${stage === 'failed' ? 'bg-red-50 text-red-700' : 'bg-ink-50 text-ink-700'}`}>
          {message}
        </p>
      )}

      {stage === 'ready' && projectId && (
        <div className="mt-6 rounded-md bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">Compiled successfully — now waiting on review.</p>
          <p className="mt-1">
            An admin has to play and approve it before it shows up in the gallery. You can
            already{' '}
            <Link className="font-medium underline" href={`/play/${projectId}`}>
              play it yourself
            </Link>
            .
          </p>
        </div>
      )}
    </main>
  );
}

const INPUT =
  'mt-2 w-full rounded-md border border-ink-100 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-300';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      {hint && <span className="ml-1 font-normal text-ink-300">— {hint}</span>}
      {children}
    </label>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function normalizeRelativePath(inputPath: string): string {
  return inputPath.replace(/\\+/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}
