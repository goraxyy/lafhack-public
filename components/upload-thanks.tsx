"use client";

import Link from 'next/link';
import { Confetti } from '@/components/confetti';

/**
 * What an uploader sees the moment their project compiles.
 *
 * This replaced a green box reading "Compiled successfully — now waiting on
 * review", which told someone who had just given the site their work that a
 * build had passed. Uploading is the thing the whole site depends on and the
 * only part nobody has to do, so it is worth saying thank you for, and worth
 * a bit of paper in the air.
 *
 * The practical news is still all here, under the thanks rather than instead
 * of it: review is pending, the sketch is already playable, and any missing
 * asset is called out.
 */
export function UploadThanks({
  projectId,
  missingAssets,
}: {
  projectId: string;
  missingAssets: string[];
}) {
  return (
    <div className="relative mt-6 overflow-hidden rounded-lg border border-l-2 border-ink-100 border-l-accent p-6">
      <Confetti />

      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Uploaded
      </p>
      <h2 className="font-display mt-2 text-2xl font-semibold text-ink">
        Thank you — it compiled.
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">
        There is a gallery here because people put things in it. Yours is in,
        it runs, and it will carry your name.
      </p>

      <div className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm text-ink-500">
        <p>
          An admin plays and approves every sketch before it reaches the
          gallery, so it is not public yet. You can{' '}
          <Link className="font-medium text-accent underline" href={`/play/${projectId}`}>
            play it yourself
          </Link>{' '}
          right now.
        </p>

        {missingAssets.length > 0 && (
          <p className="rounded-md bg-amber-50 p-3 text-amber-800">
            <strong>Heads up:</strong> the sketch loads {missingAssets.join(', ')}{' '}
            from <code>data/</code>, but{' '}
            {missingAssets.length === 1 ? 'that file was not' : 'those files were not'}{' '}
            in the folder you uploaded. It will run with{' '}
            {missingAssets.length === 1 ? 'that asset' : 'those assets'} missing.
          </p>
        )}
      </div>
    </div>
  );
}
