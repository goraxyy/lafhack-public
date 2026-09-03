"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import clsx from 'clsx';

interface FavoriteButtonProps {
  projectId: string;
  initialCount: number;
  initialIsFavorite: boolean;
  /** Signed-out viewers see the count but are sent to /login on click. */
  canFavorite: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function FavoriteButton({
  projectId,
  initialCount,
  initialIsFavorite,
  canFavorite,
  size = 'sm',
  className,
}: FavoriteButtonProps) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function toggle(event: React.MouseEvent) {
    // Cards wrap this in a link to the sketch.
    event.preventDefault();
    event.stopPropagation();

    if (!canFavorite) {
      router.push('/login');
      return;
    }

    const nextIsFavorite = !isFavorite;
    const previousCount = count;

    setIsFavorite(nextIsFavorite);
    setCount((value) => Math.max(0, value + (nextIsFavorite ? 1 : -1)));
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/favorite`, {
        method: nextIsFavorite ? 'POST' : 'DELETE',
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Could not update favorites.');
      }

      // Trust the server's count over the optimistic one.
      setCount(payload.favoriteCount ?? previousCount);
      startTransition(() => router.refresh());
    } catch (caught) {
      setIsFavorite(!nextIsFavorite);
      setCount(previousCount);
      setError(caught instanceof Error ? caught.message : 'Could not update favorites.');
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={error ?? (isFavorite ? 'Remove from favorites' : 'Add to favorites')}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border transition-colors',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        isFavorite
          ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
          : 'border-ink-100 text-ink-500 hover:border-ink-200 hover:text-ink',
        error && 'border-red-300',
        className
      )}
    >
      <Heart
        className={clsx(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', isFavorite && 'fill-current')}
        aria-hidden="true"
      />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
