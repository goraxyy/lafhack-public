"use client";

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { MAX_THUMBNAIL_BYTES } from '@/lib/uploadSecurity';

interface OwnerToolsProps {
  projectId: string;
  /** Failed compiles get a retry button; the rest only get the thumbnail. */
  canRetryCompile: boolean;
}

/**
 * The owner's controls on their own sketch page: swap the cover image, and
 * re-run a compile that failed.
 */
export function OwnerTools({ projectId, canRetryCompile }: OwnerToolsProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<null | 'thumbnail' | 'compile'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function uploadThumbnail(file: File) {
    setError(null);
    setNotice(null);

    if (file.size > MAX_THUMBNAIL_BYTES) {
      setError(`Image must be under ${Math.round(MAX_THUMBNAIL_BYTES / 1024 / 1024)}MB.`);
      return;
    }

    setBusy('thumbnail');
    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch(`/api/projects/${projectId}/thumbnail`, {
        method: 'PUT',
        body,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not update the thumbnail.');

      setNotice('Thumbnail updated.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the thumbnail.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function retryCompile() {
    setError(null);
    setNotice(null);
    setBusy('compile');

    try {
      const response = await fetch(`/api/projects/${projectId}/process`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Compile failed again.');
      }

      setNotice('Compiled. Reloading...');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Compile failed again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-ink-100 p-4">
      <h2 className="text-sm font-medium text-ink">Your sketch</h2>
      <p className="mt-1 text-xs text-ink-500">Only you and admins can see these controls.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadThumbnail(file);
          }}
        />

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-md border border-ink-100 px-3 py-2 text-sm text-ink-500 hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'thumbnail' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          Change thumbnail
        </button>

        {canRetryCompile && (
          <button
            type="button"
            onClick={retryCompile}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-ink-100 px-3 py-2 text-sm text-ink-500 hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === 'compile' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Retry compile
          </button>
        )}
      </div>

      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-sm text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
