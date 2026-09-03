import Link from 'next/link';
import { ImageOff, Play } from 'lucide-react';
import { formatTerm, thumbnailUrl, type ProjectCard } from '@/lib/types';
import { Chip } from '@/components/ui/badge';
import { FavoriteButton } from '@/components/favorite-button';

interface SketchCardProps {
  project: ProjectCard;
  canFavorite: boolean;
  /** Extra line under the title, e.g. "Played 3 times". */
  footnote?: string;
}

export function SketchCard({ project, canFavorite, footnote }: SketchCardProps) {
  const thumbnail = thumbnailUrl(project);
  const term = formatTerm(project);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-ink-100 transition-colors hover:border-ink-200">
      <Link href={`/play/${project.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-[16/10] overflow-hidden bg-ink-50">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage-proxied, not a known-size static asset.
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff className="h-7 w-7 text-ink-300" aria-hidden="true" />
            </div>
          )}

          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-3 w-3" aria-hidden="true" />
            Play
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-base font-medium text-ink">{project.title}</h3>

          <p className="mt-1 text-xs text-ink-500">
            {project.author_name ?? 'Unknown author'}
            {term ? ` · ${term}` : ''}
          </p>

          {footnote && <p className="mt-1 text-xs text-ink-300">{footnote}</p>}

          {project.description && (
            <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-ink-500">
              {project.description}
            </p>
          )}

          {(project.genre || project.is_final_project || project.tags.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.is_final_project && <Chip>Final project</Chip>}
              {project.genre && <Chip>{project.genre}</Chip>}
              {project.tags.slice(0, 3).map((tag) => (
                <Chip key={tag}>#{tag}</Chip>
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
        <span className="text-xs text-ink-300">
          {project.play_count} {project.play_count === 1 ? 'play' : 'plays'}
        </span>

        <FavoriteButton
          projectId={project.id}
          initialCount={project.favorite_count}
          initialIsFavorite={project.is_favorite ?? false}
          canFavorite={canFavorite}
        />
      </div>
    </article>
  );
}
