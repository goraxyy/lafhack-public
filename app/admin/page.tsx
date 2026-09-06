import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderKanban,
  Globe,
  Inbox,
  XCircle,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/admin';
import { getSchemaHealth } from '@/lib/schemaHealth';
import { getFeedback } from '@/lib/queries';
import { FeedbackList } from '@/app/admin/feedback-list';
import { FailedUploads } from '@/components/failed-uploads';
import type { Project } from '@/lib/types';
import { ReviewBadge, StatusBadge } from '@/components/ui/badge';

export const revalidate = 0;

interface Stats {
  total: number;
  pending: number;
  approved: number;
  compiling: number;
  failed: number;
  publicCount: number;
}

async function getOverview(): Promise<{
  stats: Stats;
  recent: Project[];
  openFailures: Project[];
  clearedFailures: Project[];
}> {
  const { data, error } = await createAdminClient()
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  const projects = (error ? [] : (data ?? [])) as Project[];
  const failed = projects.filter((p) => ['failed', 'error'].includes(p.status));

  return {
    stats: {
      total: projects.length,
      pending: projects.filter((p) => p.review_status === 'pending').length,
      approved: projects.filter((p) => p.review_status === 'approved').length,
      compiling: projects.filter((p) =>
        ['uploading', 'queued', 'processing'].includes(p.status)
      ).length,
      failed: projects.filter((p) => ['failed', 'error'].includes(p.status)).length,
      publicCount: projects.filter((p) => p.visibility === 'public').length,
    },
    recent: projects.slice(0, 10),
    // Every failure, not a page of them: the point is to see the errors, and a
    // backlog long enough to need paging is itself the thing worth noticing.
    // Split so the queue shows what nobody has dealt with yet.
    openFailures: failed.filter((p) => !p.failure_cleared_at),
    clearedFailures: failed.filter((p) => p.failure_cleared_at),
  };
}

export default async function AdminPage() {
  const viewer = await getViewer();

  // 404 rather than 403: an admin-only page shouldn't confirm it exists.
  if (viewer?.role !== 'admin') {
    notFound();
  }

  const [{ stats, recent, openFailures, clearedFailures }, schema, feedback] =
    await Promise.all([getOverview(), getSchemaHealth(), getFeedback()]);

  const openFeedback = feedback.filter((item) => item.status !== 'done').length;

  const cards = [
    { label: 'Awaiting review', value: stats.pending, icon: Inbox, href: '/admin/review' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle2 },
    { label: 'Total projects', value: stats.total, icon: FolderKanban },
    { label: 'Compiling', value: stats.compiling, icon: Clock },
    {
      label: 'Failed',
      value: stats.failed,
      icon: XCircle,
      href: stats.failed > 0 ? '#failed' : undefined,
    },
    { label: 'Public', value: stats.publicCount, icon: Globe },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Admin</h1>
          <p className="mt-2 text-ink-500">Signed in as {viewer.email}.</p>
        </div>

        <Link
          href="/admin/review"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          <Inbox className="h-4 w-4" aria-hidden="true" />
          Review queue
          {stats.pending > 0 && (
            <span className="rounded-full bg-white/20 px-2 text-xs">{stats.pending}</span>
          )}
        </Link>
      </div>

      {schema.missing.length > 0 && <MigrationWarning missing={schema.missing} />}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500">{card.label}</span>
                <Icon className="h-4 w-4 text-ink-300" aria-hidden="true" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
            </>
          );

          return card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-lg border border-ink-100 p-5 transition-colors hover:border-ink-200"
            >
              {body}
            </Link>
          ) : (
            <div key={card.label} className="rounded-lg border border-ink-100 p-5">
              {body}
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Feedback</h2>
          {openFeedback > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              {openFeedback} open
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Sent from the box in the site footer.
        </p>
        <FeedbackList items={feedback} />
      </div>

      <FailedUploads open={openFailures} cleared={clearedFailures} />

      <div className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink">Recent uploads</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-ink-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Title</th>
                <th scope="col" className="px-4 py-3 font-medium">Author</th>
                <th scope="col" className="px-4 py-3 font-medium">Compile</th>
                <th scope="col" className="px-4 py-3 font-medium">Review</th>
                <th scope="col" className="px-4 py-3 font-medium">Plays</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-500">
                    No projects yet.
                  </td>
                </tr>
              ) : (
                recent.map((project) => (
                  <tr key={project.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link href={`/play/${project.id}`} className="hover:underline">
                        {project.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{project.author_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ReviewBadge reviewStatus={project.review_status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-500">{project.play_count}</td>
                    <td className="px-4 py-3 text-ink-500">
                      {new Date(project.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Without this the symptoms of an unapplied migration are silent -- the gallery
 * queries error, the helpers swallow it, and the page just looks empty.
 */
function MigrationWarning({ missing }: { missing: string[] }) {
  return (
    <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
      <h2 className="font-display flex items-center gap-2 text-base font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Database migration not applied
      </h2>
      <p className="mt-2 text-sm text-amber-900/90">
        The app expects tables and columns this database does not have yet, so
        counts below will read zero and the gallery will look empty. Run these in
        the Supabase SQL editor, in order:
      </p>
      <ul className="mt-3 space-y-1">
        {missing.map((file) => (
          <li key={file}>
            <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
              supabase/migrations/{file}
            </code>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-amber-900/90">
        <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
          supabase/scripts/which-project.sql
        </code>{' '}
        checks which database you are on and what is already applied.
      </p>
    </div>
  );
}
