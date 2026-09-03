import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getViewer } from '@/lib/admin';
import { getReviewQueue } from '@/lib/queries';
import { ReviewQueue } from '@/app/admin/review/review-queue';

export const revalidate = 0;

const TABS = [
  { key: 'pending', label: 'Awaiting review' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'approved', label: 'Approved' },
] as const;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const viewer = await getViewer();

  // 404 rather than 403: an admin-only page shouldn't confirm it exists.
  if (viewer?.role !== 'admin') {
    notFound();
  }

  const active = TABS.find((tab) => tab.key === searchParams.status)?.key ?? 'pending';
  const projects = await getReviewQueue(active);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Admin
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-ink">Review queue</h1>
      <p className="mt-2 max-w-2xl text-ink-500">
        Play each sketch here before deciding. Approving it publishes it to the gallery;
        nothing reaches the gallery any other way.
      </p>

      <div className="mt-8 flex gap-2 border-b border-ink-100">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/review?status=${tab.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active === tab.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-500 hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <ReviewQueue projects={projects} />
    </div>
  );
}
