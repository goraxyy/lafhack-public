import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Users } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { canViewProject } from '@/lib/projectAccess';
import { getFavoriteIds } from '@/lib/queries';
import { formatTerm, isPubliclyBrowsable, type Project } from '@/lib/types';
import { Chip, ReviewBadge, StatusBadge } from '@/components/ui/badge';
import { FavoriteButton } from '@/components/favorite-button';
import { ReviewNotice, SketchViewer } from '@/app/play/[id]/sketch-viewer';
import { OwnerTools } from '@/app/play/[id]/owner-tools';

export const revalidate = 0;

async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await createAdminClient()
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle<Project>();

  if (error || !data) return null;
  return data;
}

export default async function PlayProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const viewer = await getViewer();
  const project = await getProject(params.id);

  if (!project || !canViewProject(project, viewer)) {
    notFound();
  }

  const browsable = isPubliclyBrowsable(project);
  const isOwner = viewer?.id === project.owner_id;
  const favoriteIds = await getFavoriteIds(viewer?.id ?? null, [project.id]);

  const term = formatTerm(project);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/gallery"
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to gallery
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{project.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {project.author_name ?? 'Unknown author'}
            {term ? ` · ${term}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {browsable ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-500">
              <Play className="h-4 w-4 text-ink-300" aria-hidden="true" />
              {project.play_count} {project.play_count === 1 ? 'play' : 'plays'}
            </span>
          ) : (
            <>
              <StatusBadge status={project.status} />
              <ReviewBadge reviewStatus={project.review_status} />
            </>
          )}

          <FavoriteButton
            projectId={project.id}
            initialCount={project.favorite_count}
            initialIsFavorite={favoriteIds.has(project.id)}
            canFavorite={Boolean(viewer)}
            size="md"
          />
        </div>
      </div>

      {(isOwner || viewer?.role === 'admin') && project.review_status !== 'approved' && (
        <ReviewNotice
          reviewStatus={project.review_status === 'rejected' ? 'rejected' : 'pending'}
          notes={project.review_notes}
        />
      )}

      <div className="mt-8">
        <SketchViewer project={project} countsAsPlay={browsable} />
      </div>

      {(isOwner || viewer?.role === 'admin') && (
        <OwnerTools
          projectId={project.id}
          canRetryCompile={project.status !== 'ready'}
        />
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {project.description && (
            <>
              <h2 className="text-sm font-medium text-ink">About</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-500">
                {project.description}
              </p>
            </>
          )}

          {project.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {project.tags.map((tag) => (
                <Chip key={tag}>#{tag}</Chip>
              ))}
            </div>
          )}
        </div>

        <dl className="space-y-4 rounded-lg border border-ink-100 p-5 text-sm">
          <Detail label="Author" value={project.author_name} />
          {project.collaborators.length > 0 && (
            <div>
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-300">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Collaborators
              </dt>
              <dd className="mt-1 text-ink">{project.collaborators.join(', ')}</dd>
            </div>
          )}
          <Detail label="Semester" value={term} />
          <Detail label="Genre" value={project.genre} />
          {project.is_final_project && <Detail label="Final project" value="Yes" />}
          <Detail label="Favorites" value={String(project.favorite_count)} />
          <Detail
            label="Uploaded"
            value={new Date(project.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
        </dl>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-300">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
