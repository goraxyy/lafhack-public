import clsx from 'clsx';
import type { ProjectStatus, ReviewStatus } from '@/lib/types';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  uploading: 'bg-blue-50 text-blue-700 border-blue-600/20',
  queued: 'bg-amber-50 text-amber-700 border-amber-600/20',
  // Green, not the accent. "Ready" is the good outcome, and once the accent
  // became Lafayette maroon this badge read as an error sitting next to the
  // genuinely red "Failed" one.
  ready: 'bg-green-50 text-green-700 border-green-600/20',
  processing: 'bg-ink-50 text-ink-500 border-ink-100',
  failed: 'bg-red-50 text-red-700 border-red-600/20',
  error: 'bg-red-50 text-red-700 border-red-600/20',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  uploading: 'Uploading',
  queued: 'Queued',
  ready: 'Ready',
  processing: 'Processing',
  failed: 'Failed',
  error: 'Error',
};

const REVIEW_STYLES: Record<ReviewStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-600/20',
  approved: 'bg-green-50 text-green-700 border-green-600/20',
  rejected: 'bg-red-50 text-red-700 border-red-600/20',
};

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Not approved',
};

const BASE = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={clsx(BASE, STATUS_STYLES[status])}>{STATUS_LABEL[status]}</span>;
}

export function ReviewBadge({ reviewStatus }: { reviewStatus: ReviewStatus }) {
  return (
    <span className={clsx(BASE, REVIEW_STYLES[reviewStatus])}>{REVIEW_LABEL[reviewStatus]}</span>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ink-100 bg-ink-50 px-2.5 py-0.5 text-xs text-ink-500">
      {children}
    </span>
  );
}
